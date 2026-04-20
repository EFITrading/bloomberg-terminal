import { NextRequest, NextResponse } from 'next/server'

const POLYGON_API_KEY = process.env.POLYGON_API_KEY!

const mtfCache = new Map<string, { data: unknown; timestamp: number }>()
const MTF_CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

type Bar = { t: number; o: number; h: number; l: number; c: number; v: number }

// Fetch a single Polygon agg series for one symbol + timeframe, following next_url pagination
async function fetchAggs(
    symbol: string,
    multiplier: number,
    timespan: 'minute' | 'hour' | 'day' | 'week',
    from: string,
    to: string
): Promise<Bar[]> {
    const initialUrl = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/${multiplier}/${timespan}/${from}/${to}?adjusted=true&sort=asc&limit=50000&apikey=${POLYGON_API_KEY}`
    const allResults: Bar[] = []
    let nextUrl: string | null = initialUrl
    let pages = 0

    while (nextUrl && pages < 20) {
        const ctrl = new AbortController()
        const tid = setTimeout(() => ctrl.abort(), 20000)
        try {
            const res = await fetch(nextUrl, { signal: ctrl.signal, headers: { Accept: 'application/json' } })
            clearTimeout(tid)
            if (!res.ok) break
            const json = await res.json()
            if (json.results?.length) allResults.push(...json.results)
            // Follow pagination if Polygon returns next_url
            nextUrl = json.next_url ? `${json.next_url}&apikey=${POLYGON_API_KEY}` : null
            pages++
            if (pages > 1) console.log(`[mtf-fetch] paginating: page ${pages}, total bars so far: ${allResults.length}`)
        } catch {
            clearTimeout(tid)
            break
        }
    }

    return allResults
}

export async function POST(request: NextRequest) {
    let symbols: string[] = []
    try {
        const body = await request.json()
        symbols = body.symbols ?? []
        if (!Array.isArray(symbols) || symbols.length === 0)
            return NextResponse.json({ error: 'Invalid symbols' }, { status: 400 })

        // Optional: caller may pass timeframes: ['1D'] to skip 1H/1W fetches
        const requestedTFs: string[] = Array.isArray(body.timeframes) && body.timeframes.length > 0
            ? body.timeframes
            : ['1H', '1D', '1W']

        const cacheKey = [...symbols].sort().join(',') + '|' + [...requestedTFs].sort().join(',')
        const cached = mtfCache.get(cacheKey)
        if (cached && Date.now() - cached.timestamp < MTF_CACHE_DURATION)
            return NextResponse.json(cached.data)

        const now = new Date()
        const toStr = now.toISOString().split('T')[0]

        // All available timeframe definitions — filtered by requestedTFs
        const allTFDefs: { tf: string; mult: number; span: 'hour' | 'day' | 'week'; daysBack: number }[] = [
            { tf: '1H', mult: 1, span: 'hour', daysBack: 730 },
            { tf: '1D', mult: 1, span: 'day', daysBack: 5475 },
            { tf: '1W', mult: 1, span: 'week', daysBack: 5475 },
        ]
        const tfDefs = allTFDefs.filter(d => requestedTFs.includes(d.tf))

        const result: Record<string, Record<string, { t: number; o: number; h: number; l: number; c: number; v: number }[]>> = {}
        for (const sym of symbols) result[sym] = {}

        // Fetch all combos in parallel
        await Promise.all(
            symbols.flatMap(sym =>
                tfDefs.map(async ({ tf, mult, span, daysBack }) => {
                    const from = new Date()
                    from.setDate(from.getDate() - daysBack)
                    const fromStr = from.toISOString().split('T')[0]
                    console.log(`[mtf-fetch] ${sym} ${tf}: requesting ${span} bars from ${fromStr} to ${toStr} (daysBack=${daysBack})`)
                    const bars = await fetchAggs(sym, mult, span, fromStr, toStr)
                    result[sym][tf] = bars
                    const first = bars[0] ? new Date(bars[0].t).toISOString() : 'n/a'
                    const last = bars[bars.length - 1] ? new Date(bars[bars.length - 1].t).toISOString() : 'n/a'
                    console.log(`[mtf-fetch] ${sym} ${tf}: received ${bars.length} bars | first=${first} | last=${last}`)
                })
            )
        )

        const responseData = { success: true, data: result }
        mtfCache.set(cacheKey, { data: responseData, timestamp: Date.now() })
        return NextResponse.json(responseData)
    } catch (err) {
        return NextResponse.json({ success: false, error: String(err), data: {} })
    }
}
