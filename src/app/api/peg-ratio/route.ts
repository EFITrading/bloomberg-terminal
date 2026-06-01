import { NextRequest, NextResponse } from 'next/server'

const POLYGON_API_KEY = process.env.POLYGON_API_KEY!

const cache = new Map<string, { data: unknown; timestamp: number }>()
const CACHE_DURATION = 1800000 // 30 min

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Compound annual growth rate: (end/start)^(1/years) - 1  */
function cagr(start: number, end: number, years: number): number | null {
    if (!start || !end || years <= 0 || start <= 0 || end <= 0) return null
    return (Math.pow(end / start, 1 / years) - 1) * 100
}

/** Trailing 12-month sum of the last 4 quarterly values */
function ttmSum(arr: number[]): number {
    return arr.slice(-4).reduce((s, v) => s + v, 0)
}

export async function GET(req: NextRequest) {
    const ticker = req.nextUrl.searchParams.get('ticker')?.toUpperCase()
    if (!ticker) return NextResponse.json({ error: 'ticker is required' }, { status: 400 })

    const cacheKey = `peg-v1-${ticker}`
    const cached = cache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        return NextResponse.json(cached.data)
    }

    try {
        // ── 1. Split history (to adjust EPS) ─────────────────────────────────────
        const splitsRes = await fetch(
            `https://api.polygon.io/v3/reference/splits?ticker=${ticker}&limit=50&apiKey=${POLYGON_API_KEY}`
        )
        const splitsJson = splitsRes.ok ? await splitsRes.json() : { results: [] }
        const splits: { date: string; factor: number }[] = []
        if (Array.isArray(splitsJson.results)) {
            for (const s of splitsJson.results) {
                if (s.execution_date && s.split_from && s.split_to) {
                    splits.push({ date: s.execution_date, factor: s.split_to / s.split_from })
                }
            }
        }
        splits.sort((a, b) => a.date.localeCompare(b.date))

        function splitAdjustEps(epsDate: string, eps: number): number {
            let factor = 1
            for (const s of splits) {
                if (s.date > epsDate) factor *= s.factor
            }
            return eps / factor
        }

        // ── 2. Quarterly financials — paginate to get ALL available quarters ──────
        const results: any[] = []
        let finUrl: string | null = `https://api.polygon.io/vX/reference/financials?ticker=${ticker}&timeframe=quarterly&limit=100&sort=period_of_report_date&order=desc&apiKey=${POLYGON_API_KEY}`
        while (finUrl) {
            const finRes = await fetch(finUrl)
            if (!finRes.ok) return NextResponse.json({ error: `Polygon financials error: ${finRes.status}` }, { status: 502 })
            const finJson = await finRes.json()
            if (Array.isArray(finJson.results)) results.push(...finJson.results)
            finUrl = finJson.next_url ? `${finJson.next_url}&apiKey=${POLYGON_API_KEY}` : null
        }

        if (results.length < 4) {
            return NextResponse.json({ error: 'Not enough quarterly data', history: [] })
        }

        // Sort ascending by end_date for CAGR calculations
        const ascending = [...results].sort((a, b) => a.end_date.localeCompare(b.end_date))

        interface Quarter {
            date: string
            eps: number
            revenue: number | null
        }

        const quarters: Quarter[] = []
        for (const item of ascending) {
            const is = item?.financials?.income_statement

            const epsRaw =
                is?.diluted_earnings_per_share?.value ??
                is?.basic_earnings_per_share?.value

            if (typeof epsRaw !== 'number' || !item.end_date) continue

            const revenue: number | null =
                is?.revenues?.value ??
                is?.total_revenues?.value ??
                is?.net_revenues?.value ?? null

            quarters.push({
                date: item.end_date,
                eps: splitAdjustEps(item.end_date, epsRaw),
                revenue,
            })
        }

        if (quarters.length < 4) {
            return NextResponse.json({ error: 'Not enough EPS quarters', history: [] })
        }

        // ── 3. Current price ──────────────────────────────────────────────────────
        const priceRes = await fetch(
            `https://api.polygon.io/v2/last/trade/${ticker}?apiKey=${POLYGON_API_KEY}`
        )
        const priceJson = priceRes.ok ? await priceRes.json() : {}
        const currentPrice: number | null = priceJson?.results?.p ?? null

        // ── 4. TTM EPS & current P/E ──────────────────────────────────────────────
        const ttmEps = ttmSum(quarters.map((q) => q.eps))
        const currentPE = currentPrice && ttmEps > 0 ? currentPrice / ttmEps : null

        // ── 5. Growth calculations ────────────────────────────────────────────────
        // We need quarterly EPS values for CAGR over 1Y, 3Y, 5Y windows.
        // "1Y" = last 4 quarters TTM vs 4 quarters before that.
        // Build TTM series (rolling 4-quarter sums, needs ≥8 quarters for 1Y cagr).

        interface TTMPoint {
            date: string
            ttmEps: number
            ttmRevenue: number | null
        }

        const ttmSeries: TTMPoint[] = []
        for (let i = 3; i < quarters.length; i++) {
            const window = quarters.slice(i - 3, i + 1)
            const eps = window.reduce((s, q) => s + q.eps, 0)
            const revVals = window.map((q) => q.revenue).filter((v): v is number => v !== null)
            ttmSeries.push({
                date: window[window.length - 1].date,
                ttmEps: eps,
                ttmRevenue: revVals.length === 4 ? revVals.reduce((s, v) => s + v, 0) : null,
            })
        }

        const latest = ttmSeries[ttmSeries.length - 1]

        const getPoint = (yearsBack: number): TTMPoint | null => {
            // Each quarter ≈ 0.25 years; 1 year = 4 quarters back in ttmSeries
            const idx = ttmSeries.length - 1 - yearsBack * 4
            return idx >= 0 ? ttmSeries[Math.round(idx)] : null
        }

        const p1y = getPoint(1)
        const p3y = getPoint(3)
        const p5y = getPoint(5)

        const epsGrowth1y = p1y && p1y.ttmEps > 0 ? cagr(p1y.ttmEps, latest.ttmEps, 1) : null
        const epsGrowth3y = p3y && p3y.ttmEps > 0 ? cagr(p3y.ttmEps, latest.ttmEps, 3) : null
        const epsGrowth5y = p5y && p5y.ttmEps > 0 ? cagr(p5y.ttmEps, latest.ttmEps, 5) : null

        const revGrowth1y =
            p1y && p1y.ttmRevenue && p1y.ttmRevenue > 0 && latest.ttmRevenue
                ? cagr(p1y.ttmRevenue, latest.ttmRevenue, 1) : null
        const revGrowth3y =
            p3y && p3y.ttmRevenue && p3y.ttmRevenue > 0 && latest.ttmRevenue
                ? cagr(p3y.ttmRevenue, latest.ttmRevenue, 3) : null

        // ── 6. Composite growth score & PEG variants ──────────────────────────────
        // Primary growth rate = 3-year EPS CAGR (most reliable); fall back to 1Y.
        const primaryEpsGrowth = epsGrowth3y ?? epsGrowth1y

        // Composite = 50% EPS-3Y + 50% Rev-3Y (only real data from Polygon)
        const compParts: number[] = []
        const compWeights: number[] = []
        if (epsGrowth3y !== null) { compParts.push(epsGrowth3y * 0.50); compWeights.push(0.50) }
        if (revGrowth3y !== null) { compParts.push(revGrowth3y * 0.50); compWeights.push(0.50) }

        let compositeGrowth: number | null = null
        if (compWeights.length > 0) {
            const totalWeight = compWeights.reduce((s, w) => s + w, 0)
            compositeGrowth = compParts.reduce((s, v) => s + v, 0) / totalWeight
        }

        const pegBasic = currentPE && primaryEpsGrowth && primaryEpsGrowth > 0
            ? currentPE / primaryEpsGrowth : null

        const pegComposite = currentPE && compositeGrowth && compositeGrowth > 0
            ? currentPE / compositeGrowth : null

        // ── 7. Build historical PEG series — paginate monthly price bars ─────────
        const historyStartDate = ttmSeries[0]?.date ?? '2010-01-01'
        const monthlyBars: { t: number; c: number }[] = []
        let priceUrl: string | null = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/month/${historyStartDate}/${new Date().toISOString().split('T')[0]}?adjusted=true&sort=asc&limit=5000&apiKey=${POLYGON_API_KEY}`
        while (priceUrl) {
            const priceHistRes = await fetch(priceUrl)
            const priceHistJson = priceHistRes.ok ? await priceHistRes.json() : {}
            if (Array.isArray(priceHistJson.results)) monthlyBars.push(...priceHistJson.results)
            priceUrl = priceHistJson.next_url ? `${priceHistJson.next_url}&apiKey=${POLYGON_API_KEY}` : null
        }

        const pegHistory: { date: string; peg: number | null; pe: number; epsGrowth: number | null }[] = []

        for (const bar of monthlyBars) {
            const barDate = new Date(bar.t).toISOString().split('T')[0]
            // Find the TTM point whose date <= barDate
            const ttmPoint = [...ttmSeries].reverse().find((p) => p.date <= barDate)
            if (!ttmPoint || ttmPoint.ttmEps <= 0) continue

            const historicPE = bar.c / ttmPoint.ttmEps
            if (historicPE <= 0 || historicPE > 500) continue

            // 1Y EPS CAGR ending at ttmPoint.date
            const ttmIdx = ttmSeries.findIndex((p) => p.date === ttmPoint.date)
            const prior1y = ttmIdx >= 4 ? ttmSeries[ttmIdx - 4] : null
            if (!prior1y || prior1y.ttmEps <= 0) continue

            const histEpsGrowth = cagr(prior1y.ttmEps, ttmPoint.ttmEps, 1)
            // Include months where growth is negative/zero — peg is null (undefined mathematically)
            const histPeg = histEpsGrowth !== null && histEpsGrowth > 0
                ? historicPE / histEpsGrowth
                : null
            // Only include in history if either peg is reasonable or null (negative growth)
            if (histPeg === null || (histPeg > 0 && histPeg < 100)) {
                pegHistory.push({
                    date: barDate,
                    peg: histPeg !== null ? Math.round(histPeg * 100) / 100 : null,
                    pe: Math.round(historicPE * 10) / 10,
                    epsGrowth: histEpsGrowth !== null ? Math.round(histEpsGrowth * 10) / 10 : null,
                })
            }
        }

        // Trailing averages — exclude null (negative growth) and outliers (PEG > 30)
        const now = Date.now()
        const y3ago = new Date(now - 3 * 365.25 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        const y5ago = new Date(now - 5 * 365.25 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        const validPegs = (arr: typeof pegHistory) =>
            arr.map((h) => h.peg).filter((v): v is number => v !== null && v <= 30)
        const last3yPegs = validPegs(pegHistory.filter((h) => h.date >= y3ago))
        const last5yPegs = validPegs(pegHistory.filter((h) => h.date >= y5ago))
        const avg3y = last3yPegs.length
            ? Math.round((last3yPegs.reduce((s, v) => s + v, 0) / last3yPegs.length) * 100) / 100 : null
        const avg5y = last5yPegs.length
            ? Math.round((last5yPegs.reduce((s, v) => s + v, 0) / last5yPegs.length) * 100) / 100 : null

        const result = {
            // Current values
            currentPE: currentPE ? Math.round(currentPE * 10) / 10 : null,
            pegBasic: pegBasic ? Math.round(pegBasic * 100) / 100 : null,
            pegComposite: pegComposite ? Math.round(pegComposite * 100) / 100 : null,
            // Growth components (% per year)
            epsGrowth1y: epsGrowth1y ? Math.round(epsGrowth1y * 10) / 10 : null,
            epsGrowth3y: epsGrowth3y ? Math.round(epsGrowth3y * 10) / 10 : null,
            epsGrowth5y: epsGrowth5y ? Math.round(epsGrowth5y * 10) / 10 : null,
            revGrowth3y: revGrowth3y ? Math.round(revGrowth3y * 10) / 10 : null,
            compositeGrowth: compositeGrowth ? Math.round(compositeGrowth * 10) / 10 : null,
            // Historical PEG series for chart
            history: pegHistory,
            avg3y,
            avg5y,
            ttmEps: Math.round(ttmEps * 100) / 100,
            currentPrice,
        }

        cache.set(cacheKey, { data: result, timestamp: Date.now() })
        return NextResponse.json(result)
    } catch (err) {
        return NextResponse.json({ error: String(err) }, { status: 500 })
    }
}
