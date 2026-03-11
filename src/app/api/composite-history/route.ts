import { NextRequest, NextResponse } from 'next/server'

const POLYGON_API_KEY = process.env.POLYGON_API_KEY || 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf'

// ─── Sector / industry groupings — exact same as calculateEnhancedRegime ─────
const GROWTH_SECTORS = ['XLY', 'XLK', 'XLC']
const DEFENSIVE_SECTORS = ['XLP', 'XLU', 'XLRE', 'XLV']
const VALUE_SECTORS = ['XLE', 'XLB']
const RISK_ON_SECTORS = ['XLI', 'XLF']
const GROWTH_INDUSTRIES = ['IGV', 'SMH', 'KRE', 'ARKK']
const DEFENSIVE_INDUSTRIES = ['GDX', 'OIH', 'XME', 'VNQ']

const ALL_SYMBOLS = [
  ...GROWTH_SECTORS,
  ...DEFENSIVE_SECTORS,
  ...VALUE_SECTORS,
  ...RISK_ON_SECTORS,
  ...GROWTH_INDUSTRIES,
  ...DEFENSIVE_INDUSTRIES,
  'VIX', // We'll request I:VIX separately
]

const ALL_ETF_SYMBOLS = [
  ...GROWTH_SECTORS,
  ...DEFENSIVE_SECTORS,
  ...VALUE_SECTORS,
  ...RISK_ON_SECTORS,
  ...GROWTH_INDUSTRIES,
  ...DEFENSIVE_INDUSTRIES,
]

// ─── Timeframe weights — exact same as EnhancedRegimeDisplay ─────────────────
const TF_WEIGHTS: Record<string, number> = {
  '1d': 0.2,
  '5d': 0.2,
  '13d': 0.2,
  '21d': 0.15,
  '50d': 0.15,
  ytd: 0.05,
}
const TIMEFRAMES = ['1d', '5d', '13d', '21d', '50d', 'ytd']

// Lookback bars needed per timeframe (add 1 so index -1 is the "previous" bar)
const TF_BARS: Record<string, number> = {
  '1d': 1,
  '5d': 5,
  '13d': 13,
  '21d': 21,
  '50d': 50,
}

// VIX thresholds — exact same as EnhancedRegimeDisplay
const VIX_SIGNAL_STRENGTH = 4.0

function getVixAdjustment(vixPrice: number): { weight: number; signal: number } {
  if (vixPrice > 25) return { weight: 0.05, signal: VIX_SIGNAL_STRENGTH }
  if (vixPrice > 21) return { weight: 0.03, signal: VIX_SIGNAL_STRENGTH }
  if (vixPrice < 14) return { weight: 0.05, signal: -VIX_SIGNAL_STRENGTH }
  return { weight: 0.03, signal: -VIX_SIGNAL_STRENGTH } // 14–21 → mild growth
}

// ─── In-memory cache ──────────────────────────────────────────────────────────
const _cache: { data: any; ts: number } | null = null
let cachedResult: { data: any; ts: number } | null = null
const CACHE_TTL = 4 * 60 * 60 * 1000 // 4 hours (5-year dataset is large, cache aggressively)

// ─── Fetch daily bars for a single ticker from Polygon ───────────────────────
async function fetchBars(
  ticker: string,
  startDate: string,
  endDate: string
): Promise<{ t: number; c: number }[]> {
  const polygonTicker = ticker === 'VIX' ? 'I:VIX' : ticker
  const url = `https://api.polygon.io/v2/aggs/ticker/${polygonTicker}/range/1/day/${startDate}/${endDate}?adjusted=true&sort=asc&limit=50000&apiKey=${POLYGON_API_KEY}`

  const res = await fetch(url, { next: { revalidate: 1800 } })
  if (!res.ok) return []
  const json = await res.json()
  if (!json.results) return []
  return json.results.map((r: any) => ({ t: r.t, c: r.c }))
}

// ─── Compute composite score for a single date index ─────────────────────────
function computeCompositeAt(
  dateIndex: number,
  allBars: Record<string, { t: number; c: number }[]>,
  dateKeys: string[], // sorted YYYY-MM-DD
  yearStart: Record<string, number> // symbol → year-start close price
): { compositeScore: number; regime: string; label: string } | null {
  let compositeSpread = 0
  let totalWeight = 0

  for (const tf of TIMEFRAMES) {
    // For YTD, lookback is variable (days since Jan 1)
    const lookback = tf === 'ytd' ? null : TF_BARS[tf]

    const getChange = (symbol: string): number => {
      const bars = allBars[symbol]
      if (!bars || bars.length === 0) return 0
      const dateStr = dateKeys[dateIndex]
      // Find this symbol's bar index matching the date
      const barIdx = bars.findIndex((b) => new Date(b.t).toISOString().split('T')[0] === dateStr)
      if (barIdx < 0) return 0
      const currentClose = bars[barIdx].c

      if (tf === 'ytd') {
        const ys = yearStart[symbol]
        if (!ys || ys === currentClose) return 0
        return ((currentClose - ys) / ys) * 100
      }

      // lookback-bar change
      const prevIdx = barIdx - (lookback as number)
      if (prevIdx < 0) {
        // Not enough history before this date: use earliest available
        const earliest = bars[0].c
        if (!earliest || earliest === currentClose) return 0
        return ((currentClose - earliest) / earliest) * 100
      }
      const prevClose = bars[prevIdx].c
      if (!prevClose || prevClose === currentClose) return 0
      return ((currentClose - prevClose) / prevClose) * 100
    }

    // ── Sector averages (65% weight) ─────────────────────────────
    const growthSectorAvg =
      GROWTH_SECTORS.map(getChange).reduce((a, b) => a + b, 0) / GROWTH_SECTORS.length
    const defensiveSectorAvg =
      DEFENSIVE_SECTORS.map(getChange).reduce((a, b) => a + b, 0) / DEFENSIVE_SECTORS.length

    // ── Industry averages (35% weight) ───────────────────────────
    const growthIndustryAvg =
      GROWTH_INDUSTRIES.map(getChange).reduce((a, b) => a + b, 0) / GROWTH_INDUSTRIES.length
    const defensiveIndustryAvg =
      DEFENSIVE_INDUSTRIES.map(getChange).reduce((a, b) => a + b, 0) / DEFENSIVE_INDUSTRIES.length

    // ── Blended — same 65/35 split ────────────────────────────────
    const growthAvg = growthSectorAvg * 0.65 + growthIndustryAvg * 0.35
    const defensiveAvg = defensiveSectorAvg * 0.65 + defensiveIndustryAvg * 0.35

    const tfSpread = defensiveAvg - growthAvg
    const weight = TF_WEIGHTS[tf]
    compositeSpread += tfSpread * weight
    totalWeight += weight
  }

  if (totalWeight === 0) return null

  // Normalize
  compositeSpread /= totalWeight

  // ── VIX adjustment (0.05 budget) ─────────────────────────────────
  const vixBars = allBars['VIX']
  if (vixBars && vixBars.length > 0) {
    const dateStr = dateKeys[dateIndex]
    const vixBarIdx = vixBars.findIndex(
      (b) => new Date(b.t).toISOString().split('T')[0] === dateStr
    )
    if (vixBarIdx >= 0) {
      const vixPrice = vixBars[vixBarIdx].c
      const { weight: vixWeight, signal: vixSig } = getVixAdjustment(vixPrice)
      compositeSpread = compositeSpread * 0.95 + vixSig * vixWeight
    } else {
      compositeSpread = compositeSpread * 0.95
    }
  } else {
    compositeSpread = compositeSpread * 0.95
  }

  // ── Derive regime label ───────────────────────────────────────────
  let regime: string
  if (Math.abs(compositeSpread) < 0.5) regime = 'NEUTRAL'
  else if (compositeSpread > 2) regime = 'DEFENSIVE STRONG'
  else if (compositeSpread > 0) regime = 'DEFENSIVE'
  else if (compositeSpread < -2) regime = 'RISK ON STRONG'
  else regime = 'RISK ON'

  // Strength label
  const strength =
    Math.abs(compositeSpread) > 2
      ? 'EXTREME'
      : Math.abs(compositeSpread) > 1
        ? 'STRONG'
        : Math.abs(compositeSpread) > 0.5
          ? 'MODERATE'
          : 'WEAK'

  return { compositeScore: compositeSpread, regime, label: `${regime} • ${strength}` }
}

// ─── GET handler ──────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  // Serve from cache if fresh
  if (cachedResult && Date.now() - cachedResult.ts < CACHE_TTL) {
    return NextResponse.json(cachedResult.data)
  }

  try {
    // Date range: ~5 years back plus 50-day lookback buffer
    const endDate = new Date().toISOString().split('T')[0]
    const fetchStart = new Date()
    fetchStart.setFullYear(fetchStart.getFullYear() - 6) // 6 years = 5 years display + 1 year buffer for 50d lookback
    const startDate = fetchStart.toISOString().split('T')[0]

    // ── Fetch all symbols in parallel ────────────────────────────────
    const fetchTasks = [...ALL_ETF_SYMBOLS, 'VIX', 'SPY'].map(async (sym) => ({
      sym,
      bars: await fetchBars(sym, startDate, endDate),
    }))
    const results = await Promise.all(fetchTasks)

    const allBars: Record<string, { t: number; c: number }[]> = {}
    for (const { sym, bars } of results) {
      allBars[sym] = bars
    }

    // ── Build a superset of trading dates from the past 5 years ──────
    const fiveYearsAgo = new Date()
    fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5)
    const fiveYearsAgoStr = fiveYearsAgo.toISOString().split('T')[0]

    // Use SPY-equivalent (XLK) trading dates as the master date list
    const masterTicker = 'XLK'
    const masterDates = (allBars[masterTicker] || [])
      .map((b) => new Date(b.t).toISOString().split('T')[0])
      .filter((d) => d >= fiveYearsAgoStr)
      .sort()

    if (masterDates.length === 0) {
      return NextResponse.json({ error: 'No trading dates found' }, { status: 500 })
    }

    // ── Calculate year-start price for each symbol ────────────────
    // For YTD: last close of previous year
    const currentYear = new Date().getFullYear()
    const yearStart: Record<string, number> = {}
    for (const sym of ALL_ETF_SYMBOLS) {
      const bars = allBars[sym]
      if (!bars) continue
      // Find last bar of previous year
      const prevYearBars = bars.filter((b) => new Date(b.t).getFullYear() === currentYear - 1)
      if (prevYearBars.length > 0) {
        yearStart[sym] = prevYearBars[prevYearBars.length - 1].c
      } else {
        // Fallback: first bar of current year
        const curYearBars = bars.filter((b) => new Date(b.t).getFullYear() === currentYear)
        yearStart[sym] = curYearBars.length > 0 ? curYearBars[0].c : 0
      }
    }

    // ── Also need all dates across entire history for index lookup ──
    // Build a full sorted date index that covers the whole allBars span
    const fullDateSet = new Set<string>()
    for (const sym of ALL_ETF_SYMBOLS) {
      for (const b of allBars[sym] || []) {
        fullDateSet.add(new Date(b.t).toISOString().split('T')[0])
      }
    }
    const fullDateKeys = [...fullDateSet].sort()

    // ── Compute composite score for every master date ──────────────
    // Build SPY date→close map for O(1) lookup
    const spyMap: Record<string, number> = {}
    for (const bar of allBars['SPY'] || []) {
      spyMap[new Date(bar.t).toISOString().split('T')[0]] = bar.c
    }

    const history: {
      date: string
      compositeScore: number
      regime: string
      label: string
      spyClose: number | null
    }[] = []

    for (const dateStr of masterDates) {
      const idx = fullDateKeys.indexOf(dateStr)
      if (idx < 0) continue

      const point = computeCompositeAt(idx, allBars, fullDateKeys, yearStart)
      if (point !== null) {
        history.push({ date: dateStr, ...point, spyClose: spyMap[dateStr] ?? null })
      }
    }

    const responseData = { history, generated: new Date().toISOString() }
    cachedResult = { data: responseData, ts: Date.now() }

    return NextResponse.json(responseData)
  } catch (err: any) {
    console.error('[composite-history] error:', err)
    return NextResponse.json({ error: err.message || 'Failed' }, { status: 500 })
  }
}
