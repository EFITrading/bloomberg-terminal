import { NextResponse } from 'next/server'

const POLYGON_API_KEY = process.env.POLYGON_API_KEY!

// ── Timeframe configs ──────────────────────────────────────────────────────
const CONFIGS: Record<string, { fetchDays: number; sampleEvery: number }> = {
  '1Y': { fetchDays: 440, sampleEvery: 5 }, // ~75 points — weekly
  '5Y': { fetchDays: 1920, sampleEvery: 14 }, // ~133 points — bi-weekly
  '20Y': { fetchDays: 7650, sampleEvery: 63 }, // ~120 points — quarterly
}

// ── Tickers needed ─────────────────────────────────────────────────────────
const CYCLICALS = ['XLF', 'XLY', 'XLI', 'XLK', 'XLC', 'XLB', 'XLE']
const DEFENSIVES = ['XLV', 'XLP', 'XLU', 'XLRE']
const TICKERS = ['SPY', 'TLT', 'GLD', 'IWM', 'HYG', 'LQD', 'RSP', ...CYCLICALS, ...DEFENSIVES]

// ── Historical events to mark on charts ───────────────────────────────────
const ALL_EVENTS = [
  { date: '2007-10-09', label: 'GFC Start', type: 'crash' },
  { date: '2009-03-09', label: 'GFC Bottom', type: 'recovery' },
  { date: '2011-10-03', label: '2011 Low', type: 'crash' },
  { date: '2015-08-24', label: 'Flash Crash', type: 'crash' },
  { date: '2018-12-24', label: '2018 Low', type: 'crash' },
  { date: '2020-03-23', label: 'COVID Low', type: 'crash' },
  { date: '2022-01-03', label: '2022 Peak', type: 'crash' },
  { date: '2022-10-12', label: '2022 Low', type: 'recovery' },
  { date: '2025-02-19', label: '2025 Top', type: 'crash' },
  { date: '2025-04-08', label: '2025 Low', type: 'recovery' },
]

interface Bar {
  t: number
  c: number
}

async function fetchBars(ticker: string, days: number): Promise<Bar[]> {
  try {
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - days)
    const s = start.toISOString().split('T')[0]
    const e = end.toISOString().split('T')[0]
    const url = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/1/day/${s}/${e}?adjusted=true&sort=asc&limit=10000&apikey=${POLYGON_API_KEY}`
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return []
    const data = await res.json()
    if (!data.results?.length) return []
    return data.results.map((r: { t: number; c: number }) => ({ t: r.t, c: r.c }))
  } catch {
    return []
  }
}

function retAt(bars: Bar[], idx: number, window: number): number {
  if (!bars?.length || idx < window || idx >= bars.length) return 0
  const cur = bars[idx]?.c
  const base = bars[idx - window]?.c
  if (!cur || !base || base === 0) return 0
  return ((cur - base) / base) * 100
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const tf = searchParams.get('timeframe') ?? '1Y'
    const cfg = CONFIGS[tf] ?? CONFIGS['1Y']

    // Fetch all tickers in parallel
    const results = await Promise.allSettled(TICKERS.map((t) => fetchBars(t, cfg.fetchDays)))
    const bars: Record<string, Bar[]> = {}
    TICKERS.forEach((t, i) => {
      const r = results[i]
      bars[t] = r.status === 'fulfilled' ? r.value : []
    })

    const spyBars = bars['SPY']
    if (!spyBars.length) {
      return NextResponse.json({ error: 'No SPY data' }, { status: 500 })
    }

    const bearPoints: Array<{ date: string; score: number }> = []
    const recPoints: Array<{ date: string; prob: number }> = []
    const spyPoints: Array<{ date: string; price: number }> = []

    // ── Rolling computation at each sample point ──────────────────────────
    for (let i = 64; i < spyBars.length; i += cfg.sampleEvery) {
      const spy3M = retAt(spyBars, i, 63)
      const spy1M = retAt(spyBars, i, 21)
      const tlt3M = retAt(bars['TLT'], i, 63)
      const hyg3M = retAt(bars['HYG'], i, 63)
      const lqd3M = retAt(bars['LQD'], i, 63)
      const rsp3M = retAt(bars['RSP'], i, 63)
      const iwm3M = retAt(bars['IWM'], i, 63)

      const secRet3 = (t: string) => retAt(bars[t], i, 63)
      const secRet1 = (t: string) => retAt(bars[t], i, 21)
      const grp3 = (ts: string[]) => ts.reduce((s, t) => s + secRet3(t), 0) / ts.length
      const grp1 = (ts: string[]) => ts.reduce((s, t) => s + secRet1(t), 0) / ts.length

      const cyclAvg3M = grp3(CYCLICALS)
      const defAvg3M = grp3(DEFENSIVES)
      const cyclAvg1M = grp1(CYCLICALS)
      const defAvg1M = grp1(DEFENSIVES)
      const spread3M = cyclAvg3M - defAvg3M
      const spread1M = cyclAvg1M - defAvg1M
      const rotMomentum = spread1M - spread3M
      const iwmDiv3M = iwm3M - spy3M
      const hygSpread = hyg3M - lqd3M
      const rspDiv = rsp3M - spy3M
      const date = new Date(spyBars[i].t).toISOString().split('T')[0]

      // ── Bear Pressure (0–100 continuous) ────────────────────────────────
      // Higher = more bear pressure. Mirrors current bearStage logic but continuous.
      let bearScore = 50
      bearScore -= spread3M * 2.5 // cyclicals leading → lower score
      bearScore += spy3M < 0 ? Math.min(25, -spy3M * 2.0) : Math.max(-15, spy3M * -0.5)
      bearScore +=
        tlt3M > 5 ? Math.min(15, tlt3M * 1.2) : tlt3M < -8 ? Math.min(10, -tlt3M * 0.8) : 0
      bearScore += hygSpread < -3 ? Math.min(15, -hygSpread * 1.5) : 0
      bearScore += rspDiv < -3 ? Math.min(10, -rspDiv * 1.5) : 0
      bearScore += rotMomentum < -3 ? Math.min(8, -rotMomentum * 0.8) : 0
      bearScore = Math.max(0, Math.min(100, Math.round(bearScore)))

      // ── Recession Probability (same weights, no VIX) ────────────────────
      let recProb = 0
      if (spread3M < -3) recProb += 15
      if (spread3M < -6) recProb += 10
      if (spread3M < -10) recProb += 10
      if (iwmDiv3M < -3) recProb += 10
      if (iwmDiv3M < -6) recProb += 10
      if (tlt3M > 6) recProb += 15
      if (tlt3M < -8) recProb += 15
      if (spy3M < -10) recProb += 10
      if (spy3M < -18) recProb += 10
      const xlk3M = secRet3('XLK') - spy3M
      const xlc3M = secRet3('XLC') - spy3M
      if (xlk3M < -8 || xlc3M < -8) recProb += 10
      if (hygSpread < -3) recProb += 10
      if (hygSpread < -8) recProb += 10
      if (rspDiv < -3) recProb += 10
      recProb = Math.min(95, recProb)

      bearPoints.push({ date, score: bearScore })
      recPoints.push({ date, prob: recProb })
      spyPoints.push({ date, price: spyBars[i].c })
    }

    // Filter events to only those within the returned date range
    const earliest = bearPoints[0]?.date ?? '2000-01-01'
    const events = ALL_EVENTS.filter((e) => e.date >= earliest)

    return NextResponse.json({
      timeframe: tf,
      bear: bearPoints,
      recession: recPoints,
      spy: spyPoints,
      events,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
