import { NextResponse } from 'next/server'

const POLYGON_API_KEY = process.env.POLYGON_API_KEY!

export const dynamic = 'force-dynamic'

type Mover = { ticker: string; price: number; chg: number; pct: number; vol: number; dollarVol: number }

// The full-market snapshot is several MB, so keep one parsed copy for a minute
let cache: { at: number; movers: Mover[] } | null = null
const TTL_MS = 60_000

async function loadMovers(): Promise<Mover[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.movers

  const res = await fetch(
    `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=${POLYGON_API_KEY}`,
    { headers: { 'User-Agent': 'EFI-Terminal/1.0' }, signal: AbortSignal.timeout(30_000), cache: 'no-store' }
  )
  if (!res.ok) throw new Error(`Polygon snapshot ${res.status}`)
  const j = await res.json()

  const movers: Mover[] = (j?.tickers ?? [])
    .map((t: any) => {
      const price = t.lastTrade?.p || t.day?.c || t.prevDay?.c || 0
      const vol = t.day?.v || 0
      return {
        ticker: t.ticker as string,
        price,
        chg: t.todaysChange ?? 0,
        pct: t.todaysChangePerc ?? 0,
        vol,
        dollarVol: price * vol,
      }
    })
    // Liquid, real stocks only: no penny stocks, no thin trading
    .filter(
      (m: Mover) =>
        /^[A-Z]{1,5}$/.test(m.ticker) && m.price >= 5 && m.dollarVol >= 100_000_000 && Math.abs(m.pct) >= 2
    )

  cache = { at: Date.now(), movers }
  return movers
}

export async function GET() {
  try {
    const movers = await loadMovers()
    // Big move on heavy dollar volume ranks first; cap the % so a 200% micro-cap can't dominate
    const score = (m: Mover) => Math.min(Math.abs(m.pct), 15) * Math.log10(m.dollarVol) ** 2
    const top = [...movers].sort((a, b) => score(b) - score(a)).slice(0, 50)
    return NextResponse.json({ success: true, total: movers.length, movers: top })
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 502 })
  }
}
