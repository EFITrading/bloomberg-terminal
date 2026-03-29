import { NextResponse } from 'next/server'

const POLYGON_API_KEY = process.env.POLYGON_API_KEY!
const FRED_API_KEY = process.env.FRED_API_KEY!

interface Bar {
  close: number
}

// ── Sector cycle affinities (0=trough/bear, 4=peak/bull, 7=late bear) ──────
const SECTOR_CYCLE_AFFINITY: Record<string, number> = {
  XLF: 1.5, // Financials — lead at early bull / recovery
  XLY: 2.0, // Consumer Discretionary — early-mid bull
  XLI: 2.5, // Industrials — early-mid bull
  XLC: 3.0, // Communication Services — mid bull
  XLK: 3.5, // Technology — mid bull peak
  XLB: 4.0, // Materials — late bull
  XLE: 4.5, // Energy — late bull / top
  XLRE: 5.0, // Real Estate — rate-sensitive, tops before market
  XLV: 5.5, // Health Care — early bear defensive
  XLP: 6.0, // Consumer Staples — mid bear
  XLU: 6.5, // Utilities — late bear / recession
}

const PHASE_NAMES = [
  'Market Bottom',
  'Early Recovery',
  'Early Bull',
  'Middle Bull',
  'Late Bull / Peak',
  'Early Bear',
  'Bear Market',
  'Late Bear',
]

const PHASE_SECTORS: Record<number, string[]> = {
  0: ['XLU', 'GLD'],
  1: ['XLF', 'XLY'],
  2: ['XLF', 'XLI', 'XLY'],
  3: ['XLK', 'XLC', 'XLI'],
  4: ['XLE', 'XLB', 'XLK'],
  5: ['XLV', 'XLP'],
  6: ['XLV', 'XLP', 'XLU'],
  7: ['XLU', 'XLP'],
}

// ── Polygon equity bars ──────────────────────────────────────────────────────
async function fetchBars(ticker: string, days: number): Promise<Bar[]> {
  try {
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - days)
    const s = start.toISOString().split('T')[0]
    const e = end.toISOString().split('T')[0]
    const encoded = encodeURIComponent(ticker)
    const url = `https://api.polygon.io/v2/aggs/ticker/${encoded}/range/1/day/${s}/${e}?adjusted=true&sort=asc&limit=1000&apikey=${POLYGON_API_KEY}`
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return []
    const data = await res.json()
    if (!data.results?.length) return []
    return data.results.map((r: { c: number }) => ({ close: r.c }))
  } catch {
    return []
  }
}

// ── VIX price from options snapshot ─────────────────────────────────────────
async function fetchVixPrice(): Promise<number | null> {
  try {
    const url = `https://api.polygon.io/v3/snapshot/options/I:VIX?limit=1&apikey=${POLYGON_API_KEY}`
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    const data = await res.json()
    if (data.status === 'OK' && data.results?.[0]?.underlying_asset?.value) {
      return data.results[0].underlying_asset.value as number
    }
    return null
  } catch {
    return null
  }
}

// ── FRED series — latest N observations ─────────────────────────────────────
interface FredObs {
  date: string
  value: string
}
async function fetchFred(seriesId: string, limit = 90): Promise<FredObs[]> {
  try {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${FRED_API_KEY}&sort_order=desc&limit=${limit}&file_type=json`
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return []
    const data = await res.json()
    return (data.observations ?? []).filter((o: FredObs) => o.value !== '.')
  } catch {
    return []
  }
}

function fredLatest(obs: FredObs[]): number | null {
  const v = obs[0]?.value
  return v ? parseFloat(v) : null
}

function fredOldest(obs: FredObs[]): number | null {
  const v = obs[obs.length - 1]?.value
  return v ? parseFloat(v) : null
}

function ma(bars: Bar[], period: number): number {
  if (bars.length < period) return bars.at(-1)?.close ?? 0
  const slice = bars.slice(-period)
  return slice.reduce((s, b) => s + b.close, 0) / period
}

function ret(bars: Bar[], tradingDays: number): number {
  if (bars.length < tradingDays + 1) return 0
  const cur = bars.at(-1)!.close
  const base = bars[bars.length - 1 - tradingDays].close
  return ((cur - base) / base) * 100
}

export async function GET() {
  try {
    const SECTORS = ['XLE', 'XLF', 'XLK', 'XLV', 'XLP', 'XLY', 'XLI', 'XLU', 'XLB', 'XLRE', 'XLC']
    const ALL_TICKERS = ['SPY', 'TLT', ...SECTORS]

    // Fetch all data in parallel: equity bars + VIX snapshot + FRED series
    const [barsResults, vixPrice, t10y3mObs, dffObs, hySpreadsObs, sentimentObs] =
      await Promise.all([
        Promise.allSettled(ALL_TICKERS.map((t) => fetchBars(t, 420))),
        fetchVixPrice(),
        fetchFred('T10Y3M', 90), // 10Y minus 3M yield curve spread
        fetchFred('DFF', 30), // Fed Funds Effective Rate
        fetchFred('BAMLH0A0HYM2', 60), // HY credit spread (risk-off = wider)
        fetchFred('UMCSENT', 6), // Consumer Sentiment (6 months)
      ])

    const bars: Record<string, Bar[]> = {}
    const fetchErrors: string[] = []
    ALL_TICKERS.forEach((t, i) => {
      const r = barsResults[i]
      bars[t] = r.status === 'fulfilled' ? r.value : []
      if (!bars[t].length) fetchErrors.push(t)
    })
    if (vixPrice === null) fetchErrors.push('VIX')

    const spyBars = bars['SPY']
    if (!spyBars.length) {
      return NextResponse.json({ error: 'No SPY data' }, { status: 500 })
    }

    // ── SPY signals ──────────────────────────────────────────────────────────
    const spyPrice = spyBars.at(-1)!.close
    const spyMa200 = ma(spyBars, 200)
    const spyMa50 = ma(spyBars, 50)
    const spy1M = ret(spyBars, 21)
    const spy3M = ret(spyBars, 63)
    const spy12M = ret(spyBars, 252)
    const spyVs200 = ((spyPrice - spyMa200) / spyMa200) * 100
    const goldenCross = spyMa50 > spyMa200

    // ── VIX ──────────────────────────────────────────────────────────────────
    const vix = vixPrice ?? 20

    // ── Bonds ────────────────────────────────────────────────────────────────
    const tltBars = bars['TLT']
    const tlt3M = ret(tltBars, 63)

    // ── FRED macro signals ───────────────────────────────────────────────────
    // 1. Yield curve: T10Y3M (positive = normal, negative = inverted = recession risk)
    const yieldCurve = fredLatest(t10y3mObs) ?? 0
    const yieldCurveOld = fredOldest(t10y3mObs) ?? yieldCurve
    const yieldCurveTrend = yieldCurve - yieldCurveOld // positive = steepening (bullish)
    const daysInverted = t10y3mObs.filter((o) => parseFloat(o.value) < 0).length

    // 2. Fed Funds Rate — high & rising = risk-off pressure
    const fedFunds = fredLatest(dffObs) ?? 5
    const fedFundsOld = fredOldest(dffObs) ?? fedFunds
    const fedCutting = fedFunds < fedFundsOld - 0.1 // cutting = bullish mid-cycle

    // 3. HY Credit Spread — wider = risk-off / bear; tighter = risk-on / bull
    const hySpread = fredLatest(hySpreadsObs) ?? 4
    const hySpreadOld = fredOldest(hySpreadsObs) ?? hySpread
    const hySpreadTrend = hySpread - hySpreadOld // positive = widening = bearish

    // 4. Consumer Sentiment
    const sentiment = fredLatest(sentimentObs) ?? 70
    const sentimentOld = fredOldest(sentimentObs) ?? sentiment

    // ── Sector relative performance vs SPY (3M) ──────────────────────────────
    const sectorData: Array<{ ticker: string; relReturn3M: number; relReturn1M: number }> = []
    for (const sec of SECTORS) {
      const sectBars = bars[sec]
      const sectRet3M = ret(sectBars, 63)
      const sectRet1M = ret(sectBars, 21)
      sectorData.push({
        ticker: sec,
        relReturn3M: sectRet3M - spy3M,
        relReturn1M: sectRet1M - spy1M,
      })
    }

    const sectorRanking = [...sectorData].sort((a, b) => b.relReturn3M - a.relReturn3M)
    const top3Sectors = sectorRanking.slice(0, 3)

    // ── Sector-rotation anchor ───────────────────────────────────────────────
    const sectorWeights = [0.5, 0.3, 0.2]
    let sectorAnchor = 0
    top3Sectors.forEach((s, i) => {
      sectorAnchor += (SECTOR_CYCLE_AFFINITY[s.ticker] ?? 3.5) * sectorWeights[i]
    })

    // ── Technical bias ───────────────────────────────────────────────────────
    let techBias = 0

    // SPY vs 200MA
    if (spyVs200 > 10) techBias -= 1.0
    else if (spyVs200 > 5) techBias -= 0.5
    else if (spyVs200 > 0) techBias -= 0.0
    else if (spyVs200 > -5) techBias += 0.3
    else if (spyVs200 > -12) techBias += 0.6
    else techBias += 1.0

    // Golden/death cross
    techBias += goldenCross ? -0.3 : 0.3

    // VIX
    if (vix < 14) techBias -= 0.8
    else if (vix < 18) techBias -= 0.3
    else if (vix < 24) techBias += 0.0
    else if (vix < 32) techBias += 0.5
    else techBias += 1.0

    // Bond signal (TLT surge = flight to safety = bear)
    if (tlt3M > 8) techBias += 0.6
    else if (tlt3M > 4) techBias += 0.3
    else if (tlt3M < -4) techBias -= 0.3
    else if (tlt3M < -8) techBias -= 0.6

    // 3M momentum
    if (spy3M > 12) techBias -= 0.5
    else if (spy3M > 5) techBias -= 0.2
    else if (spy3M < -5) techBias += 0.3
    else if (spy3M < -12) techBias += 0.6

    // ── Macro bias (FRED data, weighted at 40% of total shift) ───────────────
    let macroBias = 0

    // Yield curve (T10Y3M): inverted = late cycle/bear; steeply normal = early bull
    if (yieldCurve < -0.5)
      macroBias += 1.2 // deeply inverted = late bear warning
    else if (yieldCurve < 0) macroBias += 0.6
    else if (yieldCurve < 0.5) macroBias += 0.0
    else if (yieldCurve < 1.5)
      macroBias -= 0.3 // mildly positive = normal/recovery
    else macroBias -= 0.6 // steep = early bull

    // Yield curve trend: steepening = improving credit, recovery signal
    if (yieldCurveTrend > 0.5)
      macroBias -= 0.4 // curve steepening fast = recovery
    else if (yieldCurveTrend < -0.5) macroBias += 0.4

    // HY credit spreads: tighter = risk-on (bull); wider = risk-off (bear)
    if (hySpread < 2.5)
      macroBias -= 0.5 // very tight = bull complacency
    else if (hySpread < 3.5) macroBias -= 0.2
    else if (hySpread < 5.0) macroBias += 0.3
    else macroBias += 0.8 // > 5% = credit stress = bear

    // HY spread trending wider = increasing bear pressure
    if (hySpreadTrend > 1.0) macroBias += 0.5
    else if (hySpreadTrend < -1.0) macroBias -= 0.4

    // Fed policy
    if (fedCutting)
      macroBias -= 0.5 // cutting = policy easing = bull
    else if (fedFunds > 4.5) macroBias += 0.4 // high rates = late cycle pressure

    // Consumer sentiment
    if (sentiment > 85)
      macroBias -= 0.4 // euphoria = late bull
    else if (sentiment > 70) macroBias -= 0.2
    else if (sentiment < 55)
      macroBias += 0.4 // depression = bear/bottom
    else if (sentiment < 65) macroBias += 0.2

    // Clamp macro bias
    macroBias = Math.max(-2, Math.min(2, macroBias))

    // Combined bias (tech 60% / macro 40%)
    const combinedBias = techBias * 0.6 + macroBias * 0.4
    const clampedBias = Math.max(-2.5, Math.min(2.5, combinedBias))

    // Final phase (0–7.99)
    const phaseRaw = Math.max(0, Math.min(7.99, sectorAnchor + clampedBias))
    const phaseIdx = Math.floor(phaseRaw)
    const phaseName = PHASE_NAMES[phaseIdx]

    // Confidence
    const affinities = top3Sectors.map((s) => SECTOR_CYCLE_AFFINITY[s.ticker] ?? 3.5)
    const spread = Math.max(...affinities) - Math.min(...affinities)
    const vixConfidence = vix < 14 || vix > 32 ? 10 : 0
    const macroConfidence = Math.abs(yieldCurve) > 0.5 && Math.abs(hySpreadTrend) > 0.3 ? 10 : 0
    const confidence = Math.round(
      Math.max(30, Math.min(95, 85 - spread * 8 + vixConfidence + macroConfidence))
    )

    return NextResponse.json({
      phase: phaseRaw,
      phaseIdx,
      phaseName,
      confidence,
      signals: {
        spyPrice: Math.round(spyPrice * 100) / 100,
        spyVs200MA: Math.round(spyVs200 * 10) / 10,
        spyMa200: Math.round(spyMa200 * 100) / 100,
        spyMa50: Math.round(spyMa50 * 100) / 100,
        goldenCross,
        spy1M: Math.round(spy1M * 10) / 10,
        spy3M: Math.round(spy3M * 10) / 10,
        spy12M: Math.round(spy12M * 10) / 10,
        vix: Math.round(vix * 10) / 10,
        tlt3M: Math.round(tlt3M * 10) / 10,
      },
      macro: {
        yieldCurve: Math.round(yieldCurve * 100) / 100,
        yieldCurveTrend: Math.round(yieldCurveTrend * 100) / 100,
        daysInverted,
        fedFunds: Math.round(fedFunds * 100) / 100,
        fedCutting,
        hySpread: Math.round(hySpread * 100) / 100,
        hySpreadTrend: Math.round(hySpreadTrend * 100) / 100,
        sentiment: Math.round(sentiment * 10) / 10,
        sentimentTrend: Math.round((sentiment - sentimentOld) * 10) / 10,
      },
      sectorRanking: sectorRanking.map((s) => ({
        ticker: s.ticker,
        relReturn3M: Math.round(s.relReturn3M * 10) / 10,
        relReturn1M: Math.round(s.relReturn1M * 10) / 10,
        cycleAffinity: SECTOR_CYCLE_AFFINITY[s.ticker] ?? 3.5,
      })),
      phaseSectors: PHASE_SECTORS[phaseIdx] ?? [],
      fetchErrors,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
