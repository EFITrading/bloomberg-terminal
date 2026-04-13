import { NextRequest, NextResponse } from 'next/server'

const API_KEY = process.env.POLYGON_API_KEY || process.env.NEXT_PUBLIC_POLYGON_API_KEY || ''

// Format Polygon option ticker: e.g. O:AAPL260515C00150000
function formatOptionTicker(
  symbol: string,
  expiry: string,
  type: 'C' | 'P',
  strike: number
): string {
  const [year, month, day] = expiry.split('-')
  const yy = year.slice(2)
  // Strike is multiplied by 1000 and zero-padded to 8 digits
  const strikeFormatted = Math.round(strike * 1000)
    .toString()
    .padStart(8, '0')
  return `O:${symbol.toUpperCase()}${yy}${month}${day}${type}${strikeFormatted}`
}

// Find the next available weekly expiry (nearest Friday) from a given date
// Returns the next weekly Friday expiry, but only if today is at least 2 days before it.
// Wednesday = last valid scan day for that Friday (2 days ahead).
// Thursday or Friday → skip to the FOLLOWING Friday.
// Uses UTC methods throughout to avoid timezone-dependent day miscalculation.
function getNextWeeklyExpiryFrom(fromDate: Date): string {
  const d = new Date(
    Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), fromDate.getUTCDate())
  )
  const dayOfWeek = d.getUTCDay() // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  let daysUntilFriday = (5 - dayOfWeek + 7) % 7
  // Less than 2 days until expiry (Thu=1, Fri=0) → roll to NEXT Friday
  if (daysUntilFriday < 2) daysUntilFriday += 7
  d.setUTCDate(d.getUTCDate() + daysUntilFriday)
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

// Flat $0.10 tolerance for stocks >= $100 (same as scanner)
function getMidpointTolerance(price: number): number {
  if (price >= 100) return 0.1
  if (price >= 50) return 0.05
  if (price >= 10) return 0.025
  return 0.01
}

// Fetch available strikes for a given expiry.
// 1) Try snapshot endpoint (works for non-expired options).
// 2) If snapshot returns nothing (expired option), synthesize strikes from
//    standard spacings around the known stock price — quote fetches validate existence.
const strikeCache = new Map<string, number[]>()
async function fetchAvailableStrikes(
  symbol: string,
  expiry: string,
  priceHint = 0
): Promise<number[]> {
  const key = `${symbol}:${expiry}`
  if (strikeCache.has(key)) return strikeCache.get(key)!

  // Try snapshot (active expirations)
  try {
    const url = `https://api.polygon.io/v3/snapshot/options/${symbol}?expiration_date=${expiry}&limit=250&apiKey=${API_KEY}`
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
    if (res.ok) {
      const data = await res.json()
      const strikesSet = new Set<number>()
      for (const c of data.results || []) {
        if (c.details?.strike_price) strikesSet.add(c.details.strike_price)
      }
      if (strikesSet.size > 0) {
        const strikes = Array.from(strikesSet).sort((a, b) => a - b)
        strikeCache.set(key, strikes)
        return strikes
      }
    }
  } catch {}

  // Expired expiry — synthesize strikes from standard spacings around stock price
  if (priceHint > 0) {
    const spacings =
      priceHint >= 500
        ? [5, 10, 25]
        : priceHint >= 200
          ? [2.5, 5, 10]
          : priceHint >= 50
            ? [1, 2.5, 5]
            : [0.5, 1, 2.5]
    const strikesSet = new Set<number>()
    for (const sp of spacings) {
      const base = Math.round(priceHint / sp) * sp
      for (let i = -25; i <= 25; i++) {
        strikesSet.add(Math.round((base + i * sp) * 1000) / 1000)
      }
    }
    const strikes = Array.from(strikesSet).sort((a, b) => a - b)
    strikeCache.set(key, strikes)
    return strikes
  }

  return []
}

// Find adjacent OTM put (first below price) and call (first above price) from real strikes
function findOTMStrikes(
  price: number,
  strikes: number[]
): { callStrike: number | null; putStrike: number | null } {
  const asc = [...strikes].sort((a, b) => a - b)
  const desc = [...strikes].sort((a, b) => b - a)
  let callStrike: number | null = null
  for (const s of asc) {
    if (s > price) {
      callStrike = s
      break
    }
  }
  let putStrike: number | null = null
  for (const s of desc) {
    if (s < price) {
      putStrike = s
      break
    }
  }
  return { callStrike, putStrike }
}

// Build candidate pairs: adjacent pair + symmetric pair flanking nearest strike
function getCandidatePairs(
  price: number,
  strikes: number[]
): { callStrike: number; putStrike: number }[] {
  const candidates: { callStrike: number; putStrike: number }[] = []
  const { callStrike: adjCall, putStrike: adjPut } = findOTMStrikes(price, strikes)
  if (adjPut !== null && adjCall !== null)
    candidates.push({ putStrike: adjPut, callStrike: adjCall })
  const nearestStrike = strikes.reduce((prev, curr) =>
    Math.abs(curr - price) < Math.abs(prev - price) ? curr : prev
  )
  const asc = [...strikes].sort((a, b) => a - b)
  const symPut = [...asc].filter((s) => s < nearestStrike).pop() ?? null
  const symCall = asc.find((s) => s > nearestStrike) ?? null
  if (symPut !== null && symCall !== null) {
    const isDup = adjPut === symPut && adjCall === symCall
    if (!isDup) candidates.push({ putStrike: symPut, callStrike: symCall })
  }
  return candidates
}

// Fetch most recent quote at or before bar time — no gte so gaps don't cause misses
async function fetchOptionQuoteAt(
  optionTicker: string,
  atMs: number
): Promise<{ bid: number; ask: number } | null> {
  try {
    const toNs = (atMs + 59_999) * 1_000_000
    const url = `https://api.polygon.io/v3/quotes/${encodeURIComponent(optionTicker)}?timestamp.lte=${toNs}&order=desc&limit=1&apiKey=${API_KEY}`
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const data = await res.json()
    if (data.results?.length > 0) {
      const q = data.results[0]
      if (!q.bid_price && !q.ask_price) return null
      return { bid: q.bid_price ?? 0, ask: q.ask_price ?? 0 }
    }
    return null
  } catch {
    return null
  }
}

// ─── Minute bars ─────────────────────────────────────────────────────────────
async function fetchMinuteBars(ticker: string, date: string): Promise<any[]> {
  try {
    const url = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/1/minute/${date}/${date}?adjusted=false&sort=desc&limit=500&apiKey=${API_KEY}`
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) return []
    const data = await res.json()
    return data.results || []
  } catch {
    return []
  }
}

function getPTOffsetHours(date: Date): number {
  const year = date.getUTCFullYear()
  const march1 = new Date(Date.UTC(year, 2, 1))
  const dstStart = new Date(Date.UTC(year, 2, 1 + ((14 - march1.getUTCDay()) % 7) + 7))
  const nov1 = new Date(Date.UTC(year, 10, 1))
  const dstEnd = new Date(Date.UTC(year, 10, 1 + ((7 - nov1.getUTCDay()) % 7)))
  return date >= dstStart && date < dstEnd ? 7 : 8
}

// ─── ET timezone offset (handles DST) ─────────────────────────────────────────
function getETOffsetHours(date: Date): number {
  const year = date.getUTCFullYear()
  const march1 = new Date(Date.UTC(year, 2, 1))
  const dstStart = new Date(Date.UTC(year, 2, 1 + ((14 - march1.getUTCDay()) % 7) + 7))
  const nov1 = new Date(Date.UTC(year, 10, 1))
  const dstEnd = new Date(Date.UTC(year, 10, 1 + ((7 - nov1.getUTCDay()) % 7)))
  return date >= dstStart && date < dstEnd ? 4 : 5
}

// Convert UTC ms to PT 12-hour time string (same as scanner)
function utcMsToETTime(ms: number): string {
  const d = new Date(ms)
  const offset = getPTOffsetHours(d)
  const pt = new Date(ms - offset * 3600 * 1000)
  let h = pt.getUTCHours()
  const mm = String(pt.getUTCMinutes()).padStart(2, '0')
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${mm} ${ampm}`
}

// Market open/close in UTC ms for a given date string
function marketHoursUTC(dateStr: string): { openMs: number; closeMs: number } {
  const [y, m, d] = dateStr.split('-').map(Number)
  // Use a probe to determine DST offset
  const probe = new Date(Date.UTC(y, m - 1, d, 14, 0, 0))
  const offset = getETOffsetHours(probe)
  const openMs = Date.UTC(y, m - 1, d, 9 + offset, 30, 0) // 9:30 ET
  const closeMs = Date.UTC(y, m - 1, d, 16 + offset, 0, 0) // 16:00 ET
  return { openMs, closeMs }
}

// True concurrency pool — always keeps `limit` tasks in flight, never waits for
// a full batch to finish before starting the next item.
async function withConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<(R | undefined)[]> {
  const out: (R | undefined)[] = new Array(items.length)
  let cursor = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const i = cursor++
        out[i] = await fn(items[i])
      }
    })
  )
  return out
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const symbol = searchParams.get('symbol')?.toUpperCase().trim()
  const timeframe = (searchParams.get('timeframe') || '1y') as '1m' | '1y'

  if (!symbol) {
    return NextResponse.json({ error: 'Symbol parameter is required' }, { status: 400 })
  }

  if (!API_KEY) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
  }

  try {
    const endDate = new Date()
    const lookbackDays = timeframe === '1m' ? 38 : 366
    const startDate = new Date(endDate.getTime() - lookbackDays * 24 * 60 * 60 * 1000)
    const startStr = startDate.toISOString().split('T')[0]
    const endStr = endDate.toISOString().split('T')[0]

    const stockUrl = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${startStr}/${endStr}?adjusted=true&sort=asc&limit=400&apiKey=${API_KEY}`
    const stockResponse = await fetch(stockUrl)

    if (!stockResponse.ok) {
      return NextResponse.json({ error: 'Failed to fetch stock price history' }, { status: 502 })
    }

    const stockData = await stockResponse.json()
    if (!stockData.results || stockData.results.length < 5) {
      return NextResponse.json(
        { error: 'Insufficient stock price history for this ticker' },
        { status: 404 }
      )
    }

    const allBars: Array<{ t: number; o: number; h: number; l: number; c: number }> =
      stockData.results
    const results: Array<{
      date: string
      stockPrice: number
      open: number
      high: number
      low: number
      callStrike: number
      putStrike: number
      callMid: number
      putMid: number
      callBid: number
      callAsk: number
      putBid: number
      putAsk: number
      imbalancePercent: number
      expensiveSide: 'CALLS' | 'PUTS'
      expiry: string
    }> = []

    // Identical scan logic — JS is single-threaded so results.push is safe across
    // concurrent async tasks (no data races possible).
    const scanWindow = async (
      windowBars: any[],
      expiry: string,
      realStrikes: number[],
      bar: (typeof allBars)[0],
      dateStr: string
    ): Promise<boolean> => {
      for (const mb of windowBars) {
        const price = mb.c
        const candidates = getCandidatePairs(price, realStrikes)
        for (const { callStrike, putStrike } of candidates) {
          if (putStrike >= price || callStrike <= price) continue
          const midpoint = (callStrike + putStrike) / 2
          const dist = Math.abs(price - midpoint)
          if (dist > getMidpointTolerance(price)) continue

          const callTicker = formatOptionTicker(symbol, expiry, 'C', callStrike)
          const putTicker = formatOptionTicker(symbol, expiry, 'P', putStrike)
          const [callQuote, putQuote] = await Promise.all([
            fetchOptionQuoteAt(callTicker, mb.t),
            fetchOptionQuoteAt(putTicker, mb.t),
          ])
          if (!callQuote || !putQuote) continue

          const { bid: callBid, ask: callAsk } = callQuote
          const { bid: putBid, ask: putAsk } = putQuote
          const callMid = (callBid + callAsk) / 2
          const putMid = (putBid + putAsk) / 2
          if (callMid <= 0 || putMid <= 0) continue

          const callSpread = callAsk > 0 ? ((callAsk - callBid) / callAsk) * 100 : 100
          const putSpread = putAsk > 0 ? ((putAsk - putBid) / putAsk) * 100 : 100
          if (callSpread > 25 || putSpread > 25) continue

          const premiumDifference = callMid - putMid
          const avgPremium = (callMid + putMid) / 2
          const imbalancePercent = (premiumDifference / avgPremium) * 100
          if (Math.abs(imbalancePercent) <= 1) continue

          results.push({
            date: `${dateStr} ${utcMsToETTime(mb.t)}`,
            stockPrice: price,
            open: bar.o,
            high: bar.h,
            low: bar.l,
            callStrike,
            putStrike,
            callMid,
            putMid,
            callBid,
            callAsk,
            putBid,
            putAsk,
            imbalancePercent,
            expensiveSide: premiumDifference > 0 ? 'CALLS' : 'PUTS',
            expiry,
          })
          return true
        }
      }
      return false
    }

    // ── Phase 1: parallel prefetch ────────────────────────────────────────────
    // fetchAvailableStrikes and fetchMinuteBars are independent per day — run
    // both in parallel per day, and run up to 12 days concurrently.
    // strikeCache means repeat expirations (Mon/Tue/Wed same Friday) cost 0 extra.
    type DayPreload = {
      bar: (typeof allBars)[0]
      dateStr: string
      expiry: string
      openMs: number
      strikes: number[]
      mktBars: any[]
    }

    const preloaded = await withConcurrency<(typeof allBars)[0], DayPreload | null>(
      allBars,
      12,
      async (bar) => {
        const date = new Date(bar.t)
        const dateStr = date.toISOString().split('T')[0]
        const expiry = getNextWeeklyExpiryFrom(date)
        const { openMs, closeMs } = marketHoursUTC(dateStr)

        // Parallel: strikes + minute bars don't depend on each other
        const [strikes, minuteBars] = await Promise.all([
          fetchAvailableStrikes(symbol, expiry, bar.c),
          fetchMinuteBars(symbol, dateStr),
        ])

        if (strikes.length === 0) return null
        const mktBars = (minuteBars as any[]).filter((b) => b.t >= openMs && b.t <= closeMs)
        if (!mktBars.length) return null

        return { bar, dateStr, expiry, openMs, strikes, mktBars }
      }
    )

    const validDays = preloaded.filter((d): d is DayPreload => d != null)

    // ── Phase 2: parallel scan windows ───────────────────────────────────────
    // 10 scan tasks in flight at once. For 1m: both windows per day run in
    // parallel since they write independent entries to results.
    await withConcurrency<DayPreload, void>(validDays, 10, async (day) => {
      const { bar, dateStr, expiry, openMs, strikes, mktBars } = day
      if (timeframe === '1m') {
        // Window 1: open → 10:30 AM PT (openMs + 4h)
        // Window 2: 10:30 AM PT → close
        const midMs = openMs + 4 * 3600 * 1000
        const w1 = mktBars.filter((b) => b.t <= midMs)
        const w2 = mktBars.filter((b) => b.t > midMs)
        await Promise.all([
          scanWindow(w1, expiry, strikes, bar, dateStr),
          scanWindow(w2, expiry, strikes, bar, dateStr),
        ])
      } else {
        // 1y: one point per day — last qualifying bar
        await scanWindow(mktBars, expiry, strikes, bar, dateStr)
      }
    })

    results.sort((a, b) => a.date.localeCompare(b.date))
    return NextResponse.json({ symbol, timeframe, dataPoints: results.length, data: results })
  } catch (error) {
    console.error('OTM Premium History error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
