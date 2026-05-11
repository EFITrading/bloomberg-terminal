import { NextResponse } from 'next/server'

// Cache for 6 hours — rate doesn't change intraday
let cachedRate: number | null = null
let cacheExpiry = 0

// Fetch 13-week T-bill yield (^IRX) from Yahoo Finance — no API key required
async function fetchIRX(): Promise<number | null> {
    const res = await fetch(
        'https://query1.finance.yahoo.com/v8/finance/chart/%5EIRX?interval=1d&range=5d',
        { headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 21600 } }
    )
    if (!res.ok) return null
    const json = await res.json()
    const price = json?.chart?.result?.[0]?.meta?.regularMarketPrice
    if (typeof price !== 'number' || price <= 0) return null
    return price / 100 // ^IRX is quoted as percent (e.g. 3.595 → 0.03595)
}

export async function GET() {
    const now = Date.now()
    if (cachedRate !== null && now < cacheExpiry) {
        return NextResponse.json({ rate: cachedRate })
    }

    const rate = await fetchIRX()
    if (rate !== null) {
        cachedRate = rate
        cacheExpiry = now + 6 * 60 * 60 * 1000
        return NextResponse.json({ rate })
    }

    return NextResponse.json({ error: 'Failed to fetch risk-free rate' }, { status: 502 })
}
