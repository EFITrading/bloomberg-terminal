import { NextResponse } from 'next/server'

const SECTOR_TICKERS = ['SPY', 'XLK', 'XLF', 'XLV', 'XLE', 'XLI', 'XLY', 'XLP', 'XLB', 'XLRE', 'XLU', 'XLC']
const MOVER_TICKERS = ['NVDA', 'AAPL', 'MSFT', 'TSLA', 'META', 'AMZN', 'GOOGL', 'AMD', 'PLTR', 'MSTR', 'COIN', 'SMCI', 'ARM', 'AVGO', 'UBER', 'NFLX', 'CRM', 'JPM', 'GLD', 'TLT']

function timeAgo(isoStr: string): string {
  const diffMs = Date.now() - new Date(isoStr).getTime()
  const m = Math.floor(diffMs / 60000)
  return m < 60 ? `${m}m ago` : `${Math.floor(m / 60)}h ago`
}

export async function GET() {
  const apiKey = process.env.POLYGON_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'POLYGON_API_KEY not configured' }, { status: 500 })
  }

  const allTickers = [...SECTOR_TICKERS, ...MOVER_TICKERS].join(',')
  const snapshotUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${allTickers}&apiKey=${apiKey}`
  // Fetch extra so we have room to filter out noise
  const newsUrl = `https://api.polygon.io/v2/reference/news?limit=25&order=desc&sort=published_utc&apiKey=${apiKey}`

  try {
    const [snapshotRes, newsRes] = await Promise.all([
      fetch(snapshotUrl, { next: { revalidate: 60 }, headers: { 'User-Agent': 'EFITrading/1.0' } }),
      fetch(newsUrl, { next: { revalidate: 120 }, headers: { 'User-Agent': 'EFITrading/1.0' } }),
    ])

    if (!snapshotRes.ok) {
      return NextResponse.json({ error: `Polygon snapshot error: ${snapshotRes.status}` }, { status: 502 })
    }

    const snapshotData = await snapshotRes.json()
    const newsData = newsRes.ok ? await newsRes.json() : { results: [] }

    if (!snapshotData.tickers || !Array.isArray(snapshotData.tickers)) {
      return NextResponse.json({ error: 'No tickers in response' }, { status: 502 })
    }

    const sectors: Record<string, number> = {}
    const moversRaw: Array<{ ticker: string; pct: number; price: number }> = []

    for (const t of snapshotData.tickers) {
      if (typeof t.todaysChangePerc !== 'number') continue
      const price: number = t.lastTrade?.p || t.day?.c || t.prevDay?.c || 0
      if (SECTOR_TICKERS.includes(t.ticker)) {
        sectors[t.ticker] = t.todaysChangePerc
      } else {
        moversRaw.push({ ticker: t.ticker, pct: t.todaysChangePerc, price })
      }
    }

    // Sort by absolute % change — biggest movers first
    const movers = moversRaw
      .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
      .slice(0, 10)

    // Filter out law firm noise — investor alerts, class actions, shareholder notices
    const NOISE = /investor alert|investor notice|shareholder alert|shareholder notice|class action|files lawsuit|investigat(es|ing) on behalf|rights? notice|legal investigation|reminds? investors|encourages? investors|LLP investigates|LLC investigates|P\.C\. investigates|law firm|Kirby|Pomerantz|Bronstein|Rosen Law|Faruqi|Glancy|Kessler Topaz|Levi &|Wolf Haldenstein/i

    const headlines = ((newsData.results as any[]) || [])
      .filter((a: any) => a.title && !NOISE.test(a.title as string))
      .slice(0, 6)
      .map((a: any) => ({
        title: (a.title as string) || '',
        urgency: 0.5,
        time_ago: timeAgo(a.published_utc || new Date().toISOString()),
        tickers: (a.tickers as string[]) || [],
      }))

    return NextResponse.json({ sectors, movers, headlines }, {
      headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=60' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
