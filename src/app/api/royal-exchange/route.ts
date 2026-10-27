import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 120

const BUCKET_MS = 5 * 60 * 1000
const SESSION_BUCKETS = 84 // 06:00 -> 13:00 PT
const OPEN_BUCKET = 6 // 06:30 PT market open

interface SavedTrade {
  underlying_ticker?: string
  type?: 'call' | 'put'
  total_premium?: number
  fill_style?: string
  trade_timestamp?: string | number
  timestamp?: string
}

interface Series {
  tc: number[] // A/AA call premium per bucket
  tp: number[] // A/AA put premium per bucket
  dc: number[] // B/BB call premium per bucket
  dp: number[] // B/BB put premium per bucket
}

function ptParts(ms: number) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  }).formatToParts(new Date(ms))
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: (parseInt(get('hour')) % 24) * 60 + parseInt(get('minute')),
    weekday: get('weekday'),
  }
}

// UTC ms of 06:00 PT on a given PT calendar date
function sessionStartMs(date: string) {
  const probe = new Date(`${date}T20:00:00Z`)
  const ptHour = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: '2-digit', hour12: false }).format(probe)) % 24
  const offset = 20 - ptHour
  return Date.parse(`${date}T${String(6 + offset).padStart(2, '0')}:00:00Z`)
}

const tsMs = (t: SavedTrade) => {
  const v = t.trade_timestamp ?? t.timestamp
  if (typeof v === 'number') return v > 1e14 ? v / 1e6 : v
  return v ? new Date(v).getTime() : 0
}

const flowCache = new Map<string, { at: number; series: Map<string, Series>; count: number }>()
const barCache = new Map<string, { at: number; bars: { t: number; c: number; v: number }[] }>()
const intradayCache = new Map<string, { at: number; bars: { t: number; c: number }[] }>()
const detailCache = new Map<string, { isEtf: boolean; marketCap: number; name: string }>()

async function getJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const r = await fetch(url, init)
    if (!r.ok) return null
    return (await r.json()) as T
  } catch {
    return null
  }
}

async function loadFlow(base: string, date: string, start: number, nb: number) {
  const key = `${date}|${nb}`
  const hit = flowCache.get(key)
  if (hit && Date.now() - hit.at < 30000) return hit
  const res = await getJson<{ trades?: SavedTrade[] }>(`${base}/api/flows/save-batch?date=${date}`, { cache: 'no-store' })
  const trades = res?.trades ?? []
  if (!trades.length) return null
  const map = new Map<string, Series>()
  for (const t of trades) {
    const k = t.underlying_ticker
    const fs = t.fill_style
    if (!k || !fs || !t.total_premium) continue
    const dealer = fs === 'B' || fs === 'BB'
    const trader = fs === 'A' || fs === 'AA'
    if (!dealer && !trader) continue
    const b = Math.min(nb - 1, Math.max(0, Math.floor((tsMs(t) - start) / BUCKET_MS)))
    let s = map.get(k)
    if (!s) {
      s = { tc: Array(nb).fill(0), tp: Array(nb).fill(0), dc: Array(nb).fill(0), dp: Array(nb).fill(0) }
      map.set(k, s)
    }
    const arr = dealer ? (t.type === 'call' ? s.dc : s.dp) : t.type === 'call' ? s.tc : s.tp
    arr[b] += t.total_premium
  }
  const out = { at: Date.now(), series: map, count: trades.length }
  flowCache.set(key, out)
  return out
}

async function getBars(ticker: string, apiKey: string) {
  const hit = barCache.get(ticker)
  if (hit && Date.now() - hit.at < 20 * 60 * 1000) return hit.bars
  const to = new Date().toISOString().slice(0, 10)
  const from = new Date(Date.now() - 70 * 86400000).toISOString().slice(0, 10)
  const d = await getJson<{ results?: { t: number; c: number; v: number }[] }>(
    `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}?adjusted=true&sort=asc&limit=80&apiKey=${apiKey}`
  )
  const bars = (d?.results ?? []).map((b) => ({ t: b.t, c: b.c, v: b.v }))
  if (bars.length) barCache.set(ticker, { at: Date.now(), bars })
  return bars
}

async function getIntraday(ticker: string, date: string, isToday: boolean, apiKey: string) {
  const key = `${ticker}|${date}`
  const hit = intradayCache.get(key)
  if (hit && Date.now() - hit.at < (isToday ? 60000 : 24 * 3600000)) return hit.bars
  const d = await getJson<{ results?: { t: number; c: number }[] }>(
    `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/5/minute/${date}/${date}?adjusted=true&sort=asc&limit=500&apiKey=${apiKey}`
  )
  const bars = (d?.results ?? []).map((b) => ({ t: b.t, c: b.c }))
  if (bars.length) intradayCache.set(key, { at: Date.now(), bars })
  return bars
}

async function getDetails(ticker: string, apiKey: string) {
  const hit = detailCache.get(ticker)
  if (hit) return hit
  const d = await getJson<{ results?: { type?: string; market_cap?: number; name?: string } }>(
    `https://api.polygon.io/v3/reference/tickers/${ticker}?apiKey=${apiKey}`
  )
  const r = d?.results
  const out = { isEtf: ['ETF', 'ETN', 'ETV'].includes(r?.type ?? ''), marketCap: r?.market_cap ?? 0, name: r?.name ?? ticker }
  if (r) detailCache.set(ticker, out)
  return out
}

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  let i = 0
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) {
        const idx = i++
        out[idx] = await fn(items[idx])
      }
    })
  )
  return out
}

const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10)
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)

export async function GET(request: NextRequest) {
  const apiKey = process.env.POLYGON_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'POLYGON_API_KEY not configured' }, { status: 500 })

  const base = `${request.nextUrl.protocol}//${request.nextUrl.host}`
  const nowMs = Date.now()
  const now = ptParts(nowMs)
  const weekday = !['Sat', 'Sun'].includes(now.weekday)
  const todayStart = sessionStartMs(now.date)
  const sessionOpen = weekday && nowMs >= todayStart && nowMs <= todayStart + SESSION_BUCKETS * BUCKET_MS + 30 * 60000

  // saved live flow DB (same source AlgoFlow polls): today first, otherwise the latest saved day
  let tradingDate = now.date
  let start = todayStart
  const bucketsFor = (s: number) => (s === todayStart && sessionOpen ? Math.min(SESSION_BUCKETS, Math.floor((nowMs - s) / BUCKET_MS) + 1) : SESSION_BUCKETS)
  let flow = weekday && nowMs >= todayStart ? await loadFlow(base, tradingDate, start, bucketsFor(start)) : null
  if (!flow) {
    const dates = await getJson<{ date: string }[]>(`${base}/api/flows/dates`, { cache: 'no-store' })
    const days = [...new Set((dates ?? []).map((d) => d.date.slice(0, 10)))].filter((d) => d < now.date).sort().reverse()
    for (const d of days.slice(0, 4)) {
      const s = sessionStartMs(d)
      flow = await loadFlow(base, d, s, SESSION_BUCKETS)
      if (flow) {
        tradingDate = d
        start = s
        break
      }
    }
  }
  const live = !!flow && tradingDate === now.date && sessionOpen
  const nb = live ? bucketsFor(start) : SESSION_BUCKETS
  const isToday = tradingDate === now.date

  const ranked = [...(flow?.series.entries() ?? [])]
    .map(([t, s]) => ({ t, total: sum(s.tc) + sum(s.tp) + sum(s.dc) + sum(s.dp) }))
    .filter((x) => x.total > 0)
    .sort((a, b) => b.total - a.total)
  let candidates = ranked.slice(0, 90).map((x) => x.t)

  // thin flow: top up with the largest market caps so the board can still fill
  if (candidates.length < 60) {
    const caps = await getJson<{ symbols?: string[] }>(`${base}/api/market-cap-top?limit=80`)
    for (const s of caps?.symbols ?? []) if (!candidates.includes(s) && candidates.length < 90) candidates.push(s)
  }
  candidates = candidates.filter((c) => c !== 'SPY')

  const all = ['SPY', ...candidates]
  const barsList = await pool(all, 10, (t) => getBars(t, apiKey))
  const barsMap = new Map(all.map((t, i) => [t, barsList[i]]))
  const detailList = await pool(candidates, 10, (t) => getDetails(t, apiKey))
  const detailMap = new Map(candidates.map((t, i) => [t, detailList[i]]))
  const intraList = await pool(candidates, 10, (t) => getIntraday(t, tradingDate, isToday, apiKey))
  const intraMap = new Map(candidates.map((t, i) => [t, intraList[i]]))

  const spyBars = barsMap.get('SPY') ?? []
  const spyByDay = new Map(spyBars.map((b) => [dayKey(b.t), b.c]))
  const days = spyBars.slice(-41).map((b) => dayKey(b.t))
  const retSeries = (bars: { t: number; c: number }[]) => {
    const byDay = new Map(bars.map((b) => [dayKey(b.t), b.c]))
    return days.slice(1).map((d, i) => {
      const a = byDay.get(days[i])
      const b = byDay.get(d)
      return a && b ? (b / a - 1) * 100 : 0
    })
  }
  const spyRets = retSeries(spyBars)
  const spyVar = spyRets.reduce((s, x) => s + x * x, 0) / Math.max(1, spyRets.length)
  const spyRet = (n: number) => (spyBars.length > n ? spyBars[spyBars.length - 1].c / spyBars[spyBars.length - 1 - n].c - 1 : 0)

  const tickers = candidates
    .map((t) => {
      const bars = barsMap.get(t) ?? []
      const intra = intraMap.get(t) ?? []
      if (bars.length < 25 || !intra.length) return null
      const prior = bars.filter((b) => dayKey(b.t) < tradingDate)
      const prevClose = prior.length ? prior[prior.length - 1].c : 0
      if (!prevClose) return null

      // 5-minute price path for the session, forward filled
      const px: (number | null)[] = Array(nb).fill(null)
      let base0 = prevClose
      for (const b of intra) {
        const idx = Math.floor((b.t - start) / BUCKET_MS)
        if (idx < 0) base0 = b.c
        else if (idx < nb) px[idx] = b.c
      }
      let lastPx = base0
      const path = px.map((v) => {
        if (v !== null) lastPx = v
        return Math.round(lastPx * 10000) / 10000
      })

      const closes = bars.filter((b) => dayKey(b.t) <= tradingDate).map((b) => b.c)
      const last = closes[closes.length - 1]
      const ret = (n: number) => last / closes[Math.max(0, closes.length - 1 - n)] - 1
      const mom5 = ret(5) * 100
      const rs20 = (ret(20) - spyRet(20)) * 100
      const rsSeries = bars
        .map((b) => {
          const sp = spyByDay.get(dayKey(b.t))
          return sp ? b.c / sp : null
        })
        .filter((v): v is number => v !== null)
        .slice(-40)
      const curRs = rsSeries[rsSeries.length - 1]
      const rsPct = rsSeries.length > 10 ? rsSeries.filter((v) => v <= curRs).length / rsSeries.length : 0.5
      const avgVol = bars.slice(-21, -1).reduce((x, b) => x + b.v, 0) / Math.max(1, Math.min(20, bars.length - 1))
      const rets = retSeries(bars)
      const cov = rets.reduce((s, x, i) => s + x * spyRets[i], 0) / Math.max(1, rets.length)
      const beta = spyVar > 0 ? cov / spyVar : 1
      const det = detailMap.get(t)
      const s = flow?.series.get(t)
      const rnd = (a: number[]) => a.map((x) => Math.round(x))
      return {
        ticker: t,
        name: det?.name ?? t,
        isEtf: det?.isEtf ?? false,
        marketCap: det?.marketCap ?? 0,
        beta: Math.round(beta * 100) / 100,
        rets: rets.map((x) => Math.round(x * 100) / 100),
        mom5,
        rs20,
        rsPct,
        rsCrit: Math.max(0, Math.min(1, (Math.abs(rsPct - 0.5) * 2 - 0.8) / 0.2)),
        relVol: bars[bars.length - 1].v && avgVol ? bars[bars.length - 1].v / avgVol : 0,
        prevClose,
        px: path,
        tc: rnd(s?.tc ?? Array(nb).fill(0)),
        tp: rnd(s?.tp ?? Array(nb).fill(0)),
        dc: rnd(s?.dc ?? Array(nb).fill(0)),
        dp: rnd(s?.dp ?? Array(nb).fill(0)),
      }
    })
    .filter((x) => x !== null)

  return NextResponse.json(
    {
      mode: live ? 'live' : 'recap',
      tradingDate,
      startMs: start,
      bucketMs: BUCKET_MS,
      buckets: nb,
      openBucket: OPEN_BUCKET,
      flowTrades: flow?.count ?? 0,
      tickers,
      fetchedAt: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
