import { NextRequest, NextResponse } from 'next/server'

const POLYGON_API_KEY = process.env.POLYGON_API_KEY!

const cache = new Map<string, { data: unknown; timestamp: number }>()
const CACHE_DURATION = 1800000 // 30 min

export async function GET(req: NextRequest) {
    const ticker = req.nextUrl.searchParams.get('ticker')?.toUpperCase()
    if (!ticker) {
        return NextResponse.json({ error: 'ticker is required' }, { status: 400 })
    }

    const cacheKey = `pe-v2-${ticker}`
    const cached = cache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        return NextResponse.json(cached.data)
    }

    try {
        // ── Step 1: Fetch stock splits (needed to adjust EPS to match split-adjusted prices) ──
        const splitsUrl = `https://api.polygon.io/v3/reference/splits?ticker=${ticker}&limit=50&apiKey=${POLYGON_API_KEY}`
        const splitsRes = await fetch(splitsUrl)
        const splitsJson = splitsRes.ok ? await splitsRes.json() : { results: [] }
        // Each split: { execution_date, split_from, split_to }
        // split_from:split_to = e.g. 1:4 means 1 old share → 4 new shares (price ÷4, EPS ÷4)
        const splits: { date: string; factor: number }[] = []
        if (Array.isArray(splitsJson.results)) {
            for (const s of splitsJson.results) {
                if (s.execution_date && s.split_from && s.split_to) {
                    // factor to divide pre-split EPS by (to match split-adjusted price)
                    splits.push({ date: s.execution_date, factor: s.split_to / s.split_from })
                }
            }
        }
        splits.sort((a, b) => a.date.localeCompare(b.date)) // ascending

        // For a given EPS quarter end date, compute the cumulative split factor
        // = product of all splits that occurred AFTER that quarter's end date
        // (because those splits made the price lower, so EPS must also be divided down)
        function splitAdjust(epsDate: string, eps: number): number {
            let factor = 1
            for (const s of splits) {
                if (s.date > epsDate) factor *= s.factor
            }
            return eps / factor
        }

        // ── Step 2: Fetch up to 100 quarters of EPS (max Polygon returns per page) ──
        const finUrl = `https://api.polygon.io/vX/reference/financials?ticker=${ticker}&timeframe=quarterly&limit=100&sort=period_of_report_date&order=desc&apiKey=${POLYGON_API_KEY}`
        const finRes = await fetch(finUrl)
        if (!finRes.ok) {
            return NextResponse.json({ error: `Polygon financials error: ${finRes.status}` }, { status: 502 })
        }
        const finJson = await finRes.json()
        const quarters: { endDate: string; eps: number }[] = []

        if (Array.isArray(finJson.results)) {
            for (const item of finJson.results) {
                const epsRaw =
                    item?.financials?.income_statement?.diluted_earnings_per_share?.value ??
                    item?.financials?.income_statement?.basic_earnings_per_share?.value
                if (typeof epsRaw === 'number' && item.end_date) {
                    quarters.push({ endDate: item.end_date, eps: splitAdjust(item.end_date, epsRaw) })
                }
            }
        }

        if (quarters.length < 4) {
            return NextResponse.json({ error: 'Not enough EPS quarters available', history: [], avg5y: null, avg10y: null })
        }

        // ── Step 3: Fetch full price history (back to 2000 to get max data) ──────
        const endDate = new Date().toISOString().split('T')[0]
        const priceUrl = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/2000-01-01/${endDate}?adjusted=true&sort=asc&limit=50000&apikey=${POLYGON_API_KEY}`
        const priceRes = await fetch(priceUrl)
        if (!priceRes.ok) {
            return NextResponse.json({ error: `Polygon price error: ${priceRes.status}` }, { status: 502 })
        }
        const priceJson = await priceRes.json()
        const bars: { t: number; c: number }[] = priceJson.results ?? []

        if (bars.length === 0) {
            return NextResponse.json({ error: 'No price data available', history: [], avg5y: null, avg10y: null })
        }

        // ── Step 4: Compute TTM P/E for each bar ─────────────────────────────────
        const sortedQuarters = [...quarters].sort((a, b) => a.endDate.localeCompare(b.endDate))
        const history: { date: string; pe: number }[] = []

        for (const bar of bars) {
            const barDate = new Date(bar.t).toISOString().split('T')[0]
            const available = sortedQuarters.filter(q => q.endDate <= barDate)
            if (available.length < 4) continue
            const ttmEps = available.slice(-4).reduce((sum, q) => sum + q.eps, 0)
            if (ttmEps <= 0) continue
            const pe = bar.c / ttmEps
            if (pe > 0 && pe < 500) {
                history.push({ date: barDate, pe: Math.round(pe * 10) / 10 })
            }
        }

        if (history.length === 0) {
            return NextResponse.json({ error: 'Could not compute P/E (company may be unprofitable)', history: [], avg5y: null, avg10y: null })
        }

        // ── Step 5: Compute averages ──────────────────────────────────────────────
        const now = Date.now()
        const y5ago = new Date(now - 5 * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        const y10ago = new Date(now - 10 * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        const last5y = history.filter(h => h.date >= y5ago)
        const last10y = history.filter(h => h.date >= y10ago)
        const avg5y = last5y.length ? Math.round((last5y.reduce((s, h) => s + h.pe, 0) / last5y.length) * 10) / 10 : null
        const avg10y = last10y.length ? Math.round((last10y.reduce((s, h) => s + h.pe, 0) / last10y.length) * 10) / 10 : null
        const current = history[history.length - 1]?.pe ?? null

        const result = { history, avg5y, avg10y, current }
        cache.set(cacheKey, { data: result, timestamp: Date.now() })
        return NextResponse.json(result)
    } catch (err) {
        return NextResponse.json({ error: String(err) }, { status: 500 })
    }
}
