'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { getRiskFreeRate } from '@/lib/riskFreeRate'

const TradePopupChart = dynamic(
  () => import('@/components/trading/EFICharting').then((m) => ({ default: m.TradePopupChart })),
  { ssr: false }
)

// ── Dealer Management Scanner ──────────────────────────────────────────────
// Core thesis (per Zak's Discord breakdown): don't trade charm/vanna directly -
// they flip too fast to be reliable. Instead watch the RAW data - IV and premium -
// at the ATM strike of the expiration carrying the most open interest (the dealer's
// real exposure concentration), and look for abnormal behavior on days the stock
// opens and closes near the same price:
//   - Premium flat but IV drops  -> vol compression, stock is expected to chop.
//   - IV expands                -> range is widening, favors a straddle.
//   - Delta magnitude rising toward 1   -> dealer must add hedge -> buy pressure.
//   - Delta magnitude falling toward .5 -> dealer must cut hedge -> sell pressure.
//
// All IV/delta history below is REAL, not simulated: we pull 5-minute option + underlying
// aggregate bars (same aggs endpoint/timeframe logic as the main EFI chart's 1D/5m view),
// back out IV per bar via Black-Scholes Newton-Raphson against the actual traded option
// premium, then derive delta from that same (S, K, T, r, sigma). Baseline snapshots are
// picked directly out of that real bar series:
//   - Power Hour (>= 12:00 PM PST)  -> compare to TODAY's first bar at/after 6:30 AM PST.
//   - Before Power Hour             -> compare to the PREVIOUS trading day's 12:00 PM PST bar.

type HistoryPoint = { ts: number; price: number; iv: number; premium: number; delta: number }

type LegState = {
  strike: number
  oi: number
  now: HistoryPoint | null
  baseline: HistoryPoint | null
  baselineLabel: string
  history: HistoryPoint[]
}

type ChainSide = Record<string, { open_interest?: number; last_price?: number; greeks?: { delta?: number } }>
type RawChain = Record<string, { calls: ChainSide; puts: ChainSide }>

type TickerState = {
  ticker: string
  currentPrice: number | null
  expiry: string | null
  daysToExpiry: number | null
  availableExpiries: Array<{ date: string; days: number }>
  rawChain: RawChain | null
  call: LegState | null
  put: LegState | null
  error: string | null
  loading: boolean
  updatedAt: number | null
}

const DEFAULT_WATCHLIST = ['AAPL', 'SPY', 'TSLA']
const FLAT_RANGE_FRACTION = 0.2 // stock must move less than this fraction of its own typical daily range to qualify as "flat"
const IV_MOVE_THRESHOLD_PTS = 3 // IV change (percentage points) to call it compressing/expanding
const DELTA_MOVE_THRESHOLD = 0.05 // |delta| change to call hedge rising/falling
const PREMIUM_MOVE_THRESHOLD_PCT = 10 // premium % change (stock flat) big enough to flag on its own
const STORAGE_WATCHLIST_KEY = 'dealer-mgmt-watchlist'
const MAX_CONCURRENT_TICKERS = 6 // bulk-scan batch size, mirrors /api/bulk-historical-data's batching approach

// Multi-day (2-5 session) categorization thresholds - same-day noise is the wrong lens for
// these calls, since dealer hedge/vol shifts described below play out over a few sessions.
const MULTI_DAY_IV_THRESHOLD_PTS = 5 // IV change over the window big enough to flag compression/expansion
const MULTI_DAY_DELTA_THRESHOLD = 0.08 // |delta| change over the window big enough to flag a hedge shift
const MULTI_DAY_PREMIUM_DECAY_PCT = 25 // premium % lost while flat that signals pure theta decay
const MULTI_DAY_PREMIUM_HOLD_PCT = 12 // premium % change small enough to call it "held value" through chop
const FLAT_RANGE_FRACTION_MULTI = 0.35 // net move tolerance (x avg daily range) to call the window "flat"
const CHOP_RANGE_MULTIPLE = 2.5 // realized range vs flat tolerance needed to call it "chopped" not just quiet

// ── PST session helpers (uses America/Los_Angeles so DST is handled for free) ──
function getPSTParts(ts: number): { hour: number; minute: number; dateStr: string; weekday: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short',
  })
  const parts = fmt.formatToParts(new Date(ts))
  const get = (t: string) => parts.find((p) => p.type === t)?.value || ''
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return {
    hour: parseInt(get('hour'), 10) % 24,
    minute: parseInt(get('minute'), 10),
    dateStr: `${get('year')}-${get('month')}-${get('day')}`,
    weekday: weekdayMap[get('weekday')] ?? 1,
  }
}
function isPowerHour(parts: { hour: number }): boolean {
  return parts.hour >= 12
}
function isAtOrAfterOpen(parts: { hour: number; minute: number }): boolean {
  return parts.hour > 6 || (parts.hour === 6 && parts.minute >= 30)
}
// Roll a date back until it lands on a weekday (Mon-Fri) - same approach as EFICharting's lastTradingDay
function lastTradingDay(d: Date, extraDays = 0): Date {
  const result = new Date(d)
  result.setDate(result.getDate() - extraDays)
  while (result.getDay() === 0 || result.getDay() === 6) {
    result.setDate(result.getDate() - 1)
  }
  return result
}
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function pctChange(from: number, to: number): number {
  if (!from) return 0
  return ((to - from) / from) * 100
}

// Returns the 2 strikes nearest the stock price (one typically above, one below).
function nearestTwoStrikes(strikes: Record<string, { open_interest?: number }>, target: number): string[] {
  return Object.keys(strikes)
    .filter((s) => Number.isFinite(parseFloat(s)))
    .sort((a, b) => Math.abs(parseFloat(a) - target) - Math.abs(parseFloat(b) - target))
    .slice(0, 2)
}
// Of those 2 nearest-to-money strikes, pick whichever one actually carries the higher OI.
function highestOIStrike(strikes: Record<string, { open_interest?: number }>, target: number): string | null {
  const candidates = nearestTwoStrikes(strikes, target)
  if (candidates.length === 0) return null
  return candidates.reduce((best, s) => ((strikes[s]?.open_interest || 0) > (strikes[best]?.open_interest || 0) ? s : best), candidates[0])
}

// ── Black-Scholes: back out IV from a real traded premium, then derive delta from it ──
function normalCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x))
  const d = 0.3989423 * Math.exp((-x * x) / 2)
  const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
  return x > 0 ? 1 - prob : prob
}
function normalPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI)
}
function bsPrice(S: number, K: number, T: number, r: number, sigma: number, type: 'call' | 'put'): number {
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T))
  const d2 = d1 - sigma * Math.sqrt(T)
  return type === 'call'
    ? S * normalCDF(d1) - K * Math.exp(-r * T) * normalCDF(d2)
    : K * Math.exp(-r * T) * normalCDF(-d2) - S * normalCDF(-d1)
}
function bsVega(S: number, K: number, T: number, r: number, sigma: number): number {
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T))
  return S * normalPDF(d1) * Math.sqrt(T)
}
function bsDelta(S: number, K: number, T: number, r: number, sigma: number, type: 'call' | 'put'): number {
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T))
  return type === 'call' ? normalCDF(d1) : normalCDF(d1) - 1
}
function impliedVolFromPrice(optionPrice: number, S: number, K: number, T: number, r: number, type: 'call' | 'put'): number | null {
  if (optionPrice <= 0 || S <= 0 || K <= 0 || T <= 0) return null
  let sigma = 0.3
  for (let i = 0; i < 60; i++) {
    const price = bsPrice(S, K, T, r, sigma, type)
    const vega = bsVega(S, K, T, r, sigma)
    const diff = optionPrice - price
    if (Math.abs(diff) < 0.0005) return sigma
    if (!vega || !Number.isFinite(vega)) return null
    sigma += diff / vega
    if (sigma <= 0.001) sigma = 0.001
    if (sigma >= 5) sigma = 5
  }
  return Number.isFinite(sigma) ? sigma : null
}

type PolygonBar = { t: number; c: number }
async function fetchAggs(ticker: string, fromStr: string, toStr: string): Promise<PolygonBar[]> {
  const url = `/api/polygon/v2/aggs/ticker/${ticker}/range/5/minute/${fromStr}/${toStr}?adjusted=true&sort=asc&limit=50000`
  const res = await fetch(url)
  const json = await res.json()
  if (json.status !== 'OK' || !Array.isArray(json.results)) return []
  return json.results.map((b: any) => ({ t: b.t, c: b.c }))
}

// Builds the real 5-min history for one leg by pairing option premium bars with underlying
// price bars at matching timestamps and backing out IV + delta per bar via Black-Scholes.
async function fetchLegHistory(
  optionTicker: string,
  strike: number,
  expiryStr: string,
  type: 'call' | 'put',
  underlyingBars: PolygonBar[],
  riskFreeRate: number
): Promise<HistoryPoint[]> {
  const optionBars = await fetchAggs(optionTicker, ymd(lastTradingDay(new Date(), 15)), ymd(new Date()))
  if (optionBars.length === 0) return []
  const priceByTs = new Map(underlyingBars.map((b) => [b.t, b.c]))
  // Options markets can lag/lead the stock grid by a bar; fall back to nearest earlier stock bar.
  const sortedStockTs = underlyingBars.map((b) => b.t).sort((a, b) => a - b)
  const nearestPrice = (ts: number): number | null => {
    if (priceByTs.has(ts)) return priceByTs.get(ts)!
    let lo = 0, hi = sortedStockTs.length - 1, best = -1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (sortedStockTs[mid] <= ts) { best = mid; lo = mid + 1 } else hi = mid - 1
    }
    return best >= 0 ? priceByTs.get(sortedStockTs[best])! : null
  }
  const expiryTs = Date.parse(`${expiryStr}T20:00:00Z`) // ~4PM ET close, good enough for T
  const points: HistoryPoint[] = []
  for (const bar of optionBars) {
    const S = nearestPrice(bar.t)
    if (S == null || bar.c <= 0) continue
    const T = (expiryTs - bar.t) / (365 * 24 * 60 * 60 * 1000)
    if (T <= 0) continue
    const iv = impliedVolFromPrice(bar.c, S, strike, T, riskFreeRate, type)
    if (iv == null) continue
    const delta = bsDelta(S, strike, T, riskFreeRate, iv, type)
    points.push({ ts: bar.t, price: S, iv: iv * 100, premium: bar.c, delta })
  }
  return points
}

// Picks the correct baseline bar straight out of the real history series for the current
// PST session rule, rather than any simulated/stored snapshot.
// A single 5-min bar right at the open is frequently a noisy/wide-spread print (thin
// opening liquidity on the option), so the baseline is the MEDIAN of the first 3 bars in
// the window, not just bar #1 - one bad print can't single-handedly swing the whole "flat"
// comparison the way it was before.
function medianPoint(points: HistoryPoint[]): HistoryPoint {
  if (points.length === 1) return points[0]
  const med = (arr: number[]) => {
    const s = [...arr].sort((a, b) => a - b)
    const m = Math.floor(s.length / 2)
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
  }
  return { ts: points[0].ts, price: med(points.map((p) => p.price)), iv: med(points.map((p) => p.iv)), premium: med(points.map((p) => p.premium)), delta: med(points.map((p) => p.delta)) }
}
function resolveBaseline(history: HistoryPoint[], now: HistoryPoint): { baseline: HistoryPoint; label: string } {
  const nowParts = getPSTParts(now.ts)
  if (isPowerHour(nowParts)) {
    const idx = history.findIndex((p) => {
      const parts = getPSTParts(p.ts)
      return parts.dateStr === nowParts.dateStr && isAtOrAfterOpen(parts)
    })
    if (idx >= 0) {
      const windowPts = history.slice(idx, idx + 3)
      return { baseline: medianPoint(windowPts), label: 'Today Open (6:30 AM PST)' }
    }
  } else {
    const idx = [...history].reverse().findIndex((p) => {
      const parts = getPSTParts(p.ts)
      return parts.dateStr !== nowParts.dateStr && isPowerHour(parts)
    })
    if (idx >= 0) {
      const fwdIdx = history.length - 1 - idx
      const windowPts = history.slice(fwdIdx, fwdIdx + 3)
      const parts = getPSTParts(windowPts[0].ts)
      return { baseline: medianPoint(windowPts), label: `Prev Day Power Hour (${parts.dateStr})` }
    }
  }
  // Fallback must still respect "at or after the 6:30 AM open" - the earliest bar of the
  // day on its own can be a pre-market print, which is exactly the stale/thin-liquidity
  // spike this whole function exists to avoid.
  const idx = history.findIndex((p) => {
    const parts = getPSTParts(p.ts)
    return parts.dateStr === nowParts.dateStr && isAtOrAfterOpen(parts)
  })
  if (idx >= 0) {
    const windowPts = history.slice(idx, idx + 3)
    return { baseline: medianPoint(windowPts), label: 'Today Open (6:30 AM PST)' }
  }
  return { baseline: now, label: 'No baseline yet - showing live only' }
}

async function loadTicker(
  ticker: string,
  riskFreeRate: number,
  expiryOverride?: string,
  callStrikeOverride?: string,
  putStrikeOverride?: string
): Promise<TickerState> {
  const base: TickerState = {
    ticker, currentPrice: null, expiry: null, daysToExpiry: null, availableExpiries: [], rawChain: null,
    call: null, put: null, error: null, loading: false, updatedAt: null,
  }
  try {
    const chainRes = await fetch(`/api/options-chain?ticker=${encodeURIComponent(ticker)}`)
    const chainJson = await chainRes.json()
    if (!chainJson.success || !chainJson.data || !chainJson.currentPrice) {
      return { ...base, error: chainJson.error || 'No options data available' }
    }
    const currentPrice: number = chainJson.currentPrice
    const today = new Date()
    const rawChain: RawChain = chainJson.data

    // Always default to the CLOSEST upcoming expiry (not whichever one happens to carry
    // the most OI) - the user can override to any later expiry via the dropdown.
    const availableExpiries = Object.keys(rawChain)
      .map((exp) => ({ date: exp, days: Math.round((new Date(exp).getTime() - today.getTime()) / 86400000) }))
      .filter((e) => e.days >= 0)
      .sort((a, b) => a.days - b.days)
    if (availableExpiries.length === 0) return { ...base, error: 'No usable expiration found' }

    const bestExpiry = (expiryOverride && rawChain[expiryOverride]) ? expiryOverride : availableExpiries[0].date
    const bestDays = availableExpiries.find((e) => e.date === bestExpiry)?.days ?? 0

    const chain = rawChain[bestExpiry]
    // Calls and puts are picked independently - whichever of the 2 nearest-to-money
    // strikes carries the higher OI on that side, not forced to match the other side -
    // unless the user clicked a specific strike in the chain view, which wins outright.
    const callStrikeKey = (callStrikeOverride && chain.calls[callStrikeOverride]) ? callStrikeOverride : highestOIStrike(chain.calls, currentPrice)
    const putStrikeKey = (putStrikeOverride && chain.puts[putStrikeOverride]) ? putStrikeOverride : highestOIStrike(chain.puts, currentPrice)

    const fromStr = ymd(lastTradingDay(today, 15))
    const toStr = ymd(today)
    const underlyingBars = await fetchAggs(ticker, fromStr, toStr)

    const expiryCompact = bestExpiry.split('-').join('').slice(2)

    const [callHistory, putHistory] = await Promise.all([
      callStrikeKey
        ? fetchLegHistory(`O:${ticker}${expiryCompact}C${(parseFloat(callStrikeKey) * 1000).toString().padStart(8, '0')}`, parseFloat(callStrikeKey), bestExpiry, 'call', underlyingBars, riskFreeRate)
        : Promise.resolve([]),
      putStrikeKey
        ? fetchLegHistory(`O:${ticker}${expiryCompact}P${(parseFloat(putStrikeKey) * 1000).toString().padStart(8, '0')}`, parseFloat(putStrikeKey), bestExpiry, 'put', underlyingBars, riskFreeRate)
        : Promise.resolve([]),
    ])

    const buildLeg = (strikeKey: string | null, side: ChainSide, history: HistoryPoint[]): LegState | null => {
      if (!strikeKey || history.length === 0) return null
      const now = history[history.length - 1]
      const { baseline, label } = resolveBaseline(history, now)
      return { strike: parseFloat(strikeKey), oi: side[strikeKey]?.open_interest || 0, now, baseline, baselineLabel: label, history }
    }

    return {
      ticker, currentPrice, expiry: bestExpiry, daysToExpiry: bestDays, availableExpiries, rawChain,
      call: buildLeg(callStrikeKey, chain.calls, callHistory), put: buildLeg(putStrikeKey, chain.puts, putHistory),
      error: null, loading: false, updatedAt: Date.now(),
    }
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : 'Fetch failed' }
  }
}

type Verdict = {
  ivRegime: 'COMPRESSING' | 'EXPANDING' | 'FLAT'
  hedgeAction: 'BUY PRESSURE' | 'SELL PRESSURE' | 'STEADY'
  stockFlat: boolean
  abnormal: boolean
  narrative: string
  color: string
  multiDaySignals: MultiDaySignal[]
  ivMoved: boolean
  premiumMoved: boolean
  deltaMoved: boolean
  premiumChangePct: number
}

type MultiDaySignal = {
  key: 'MOVE_COMING' | 'CHOP_COMING' | 'HEDGE_UP' | 'HEDGE_DOWN' | 'PREMIUM_DECAY' | 'PREMIUM_STRENGTH'
  label: string
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL'
  color: string
  narrative: string
}

// Picks a reference bar 2-5 trading days back (3 preferred) so the categorization below
// reads the recent multi-day trend, not just today's session - one noisy day can't fake a
// "flat" read the way a single bar used to before the median-baseline fix.
function multiDayBaseline(history: HistoryPoint[]): HistoryPoint | null {
  const days = Array.from(new Set(history.map((p) => getPSTParts(p.ts).dateStr))).sort()
  if (days.length < 2) return null
  const lastIdx = days.length - 1
  const minIdx = Math.max(0, lastIdx - 5)
  const maxIdx = Math.max(0, lastIdx - 2)
  const targetIdx = Math.min(Math.max(lastIdx - 3, minIdx), maxIdx)
  const dayPoints = history.filter((p) => getPSTParts(p.ts).dateStr === days[targetIdx])
  if (dayPoints.length === 0) return null
  return medianPoint(dayPoints.slice(0, 3))
}

// Categorizes IV / delta / premium behavior over that 2-5 day window (per Zak's thesis):
// IV dropping while flat = move coming, IV rising while flat = chop coming, delta rising
// while flat = hedge buy pressure (bullish on calls, neutral short-supply on puts), delta
// falling while flat = hedge sell pressure (bearish on calls, bullish cover-buying on puts),
// premium decaying while flat = pure theta/neutral, premium holding firm through chop = a
// move is building.
function evaluateMultiDaySignals(leg: LegState, side: 'call' | 'put'): { stockFlat: boolean; stockChopped: boolean; signals: MultiDaySignal[] } {
  const { history, now } = leg
  if (!now || history.length === 0) return { stockFlat: false, stockChopped: false, signals: [] }
  const base = multiDayBaseline(history)
  if (!base) return { stockFlat: false, stockChopped: false, signals: [] }

  const windowPts = history.filter((p) => p.ts >= base.ts)
  const windowRange = Math.max(...windowPts.map((p) => p.price)) - Math.min(...windowPts.map((p) => p.price))
  const netMove = Math.abs(now.price - base.price)

  const dayRange = avgDailyRange(history)
  const flatTolerance = dayRange > 0 ? dayRange * FLAT_RANGE_FRACTION_MULTI : base.price * 0.006
  const stockFlat = netMove <= flatTolerance
  const stockChopped = stockFlat && windowRange >= flatTolerance * CHOP_RANGE_MULTIPLE

  const ivChangePts = now.iv - base.iv
  const premiumChangePct = pctChange(base.premium, now.premium)
  const deltaMagChange = Math.abs(now.delta) - Math.abs(base.delta)
  const signals: MultiDaySignal[] = []

  if (stockFlat) {
    if (ivChangePts <= -MULTI_DAY_IV_THRESHOLD_PTS) {
      signals.push({
        key: 'MOVE_COMING', label: 'MOVE COMING', bias: 'NEUTRAL', color: '#eab308',
        narrative: `IV dropped ${Math.abs(ivChangePts).toFixed(1)}pts over the last few sessions while price stayed flat - vol compression like this often precedes a real move.`,
      })
    } else if (ivChangePts >= MULTI_DAY_IV_THRESHOLD_PTS) {
      signals.push({
        key: 'CHOP_COMING', label: 'CHOP COMING', bias: 'NEUTRAL', color: '#00e5ff',
        narrative: `IV expanded ${ivChangePts.toFixed(1)}pts while price stayed flat - range likely stays choppy/contained from here.`,
      })
    }

    if (deltaMagChange >= MULTI_DAY_DELTA_THRESHOLD) {
      signals.push(side === 'call'
        ? { key: 'HEDGE_UP', label: 'HEDGE BUY PRESSURE', bias: 'BULLISH', color: '#22c55e', narrative: `Call delta rose ${deltaMagChange.toFixed(2)} while flat - dealer adding hedge by buying shares, buy pressure building.` }
        : { key: 'HEDGE_UP', label: 'HEDGE SHORT PRESSURE', bias: 'NEUTRAL', color: '#9ca3af', narrative: `Put delta rose ${deltaMagChange.toFixed(2)} while flat - dealer adding hedge by shorting shares, extra supply but not directional yet.` })
    } else if (deltaMagChange <= -MULTI_DAY_DELTA_THRESHOLD) {
      signals.push(side === 'call'
        ? { key: 'HEDGE_DOWN', label: 'HEDGE SELL PRESSURE', bias: 'BEARISH', color: '#ef4444', narrative: `Call delta fell ${deltaMagChange.toFixed(2)} while flat - dealer cutting hedge/selling shares, bearish pressure.` }
        : { key: 'HEDGE_DOWN', label: 'HEDGE COVER BUYING', bias: 'BULLISH', color: '#22c55e', narrative: `Put delta fell ${deltaMagChange.toFixed(2)} while flat - dealer buying back shorted shares, bullish pressure.` })
    }

    if (premiumChangePct <= -MULTI_DAY_PREMIUM_DECAY_PCT) {
      signals.push({
        key: 'PREMIUM_DECAY', label: 'PREMIUM DECAY', bias: 'NEUTRAL', color: '#9ca3af',
        narrative: `Premium lost ${Math.abs(premiumChangePct).toFixed(1)}% while flat - theta decay dominating, no directional edge.`,
      })
    }
  }

  if (stockChopped && premiumChangePct >= -MULTI_DAY_PREMIUM_HOLD_PCT) {
    signals.push({
      key: 'PREMIUM_STRENGTH', label: 'PREMIUM HOLDING STRONG', bias: 'NEUTRAL', color: '#f97316',
      narrative: `Stock chopped (range $${windowRange.toFixed(2)}) but premium held (${premiumChangePct >= 0 ? '+' : ''}${premiumChangePct.toFixed(1)}%) - firm premium through chop suggests a move is building.`,
    })
  }

  return { stockFlat, stockChopped, signals }
}

// Average true daily range across the days we have history for (high-low per PST day,
// averaged) - this is the stock's own normal daily noise, so "flat" scales with how much
// a given name usually moves instead of one fixed % for every ticker/price level.
function avgDailyRange(history: HistoryPoint[]): number {
  const byDay = new Map<string, { hi: number; lo: number }>()
  for (const p of history) {
    const day = getPSTParts(p.ts).dateStr
    const cur = byDay.get(day)
    if (!cur) byDay.set(day, { hi: p.price, lo: p.price })
    else { cur.hi = Math.max(cur.hi, p.price); cur.lo = Math.min(cur.lo, p.price) }
  }
  const ranges = Array.from(byDay.values()).map((d) => d.hi - d.lo).filter((r) => r > 0)
  if (ranges.length === 0) return 0
  return ranges.reduce((a, b) => a + b, 0) / ranges.length
}

function evaluateLeg(leg: LegState, side: 'call' | 'put'): Verdict {
  const { baseline: open, now, history } = leg
  if (!open || !now) {
    return {
      ivRegime: 'FLAT', hedgeAction: 'STEADY', stockFlat: true, abnormal: false, narrative: '', color: '#9ca3af',
      multiDaySignals: [], ivMoved: false, premiumMoved: false, deltaMoved: false, premiumChangePct: 0,
    }
  }
  const ivChangePts = now.iv - open.iv
  const premiumChangePct = pctChange(open.premium, now.premium)
  const deltaMagChange = Math.abs(now.delta) - Math.abs(open.delta)

  // "Flat" = moved less than FLAT_RANGE_FRACTION of this stock's own typical daily range,
  // not a fixed % - a $2 move on a name that normally swings $8/day is actually quiet,
  // while the same $2 move on a name that normally swings $0.50/day is not.
  const stockMoveDollars = Math.abs(now.price - open.price)
  const range = avgDailyRange(history)
  const flatTolerance = range > 0 ? range * FLAT_RANGE_FRACTION : open.price * 0.003
  const stockFlat = stockMoveDollars <= flatTolerance
  const ivRegime: Verdict['ivRegime'] = ivChangePts <= -IV_MOVE_THRESHOLD_PTS ? 'COMPRESSING'
    : ivChangePts >= IV_MOVE_THRESHOLD_PTS ? 'EXPANDING' : 'FLAT'
  const hedgeAction: Verdict['hedgeAction'] = deltaMagChange >= DELTA_MOVE_THRESHOLD ? 'BUY PRESSURE'
    : deltaMagChange <= -DELTA_MOVE_THRESHOLD ? 'SELL PRESSURE' : 'STEADY'

  // The real signal: stock went nowhere, but IV, premium, or delta moved a lot anyway -
  // that's the "weird move" Zak described, a sign the dealer's hedge/vol picture is
  // shifting underneath a quiet tape rather than the option just tracking spot like normal.
  const ivMoved = Math.abs(ivChangePts) >= IV_MOVE_THRESHOLD_PTS
  const premiumMoved = Math.abs(premiumChangePct) >= PREMIUM_MOVE_THRESHOLD_PCT
  const deltaMoved = Math.abs(deltaMagChange) >= DELTA_MOVE_THRESHOLD
  const abnormal = stockFlat && (ivMoved || premiumMoved || deltaMoved)

  let narrative = 'No clear edge yet - within normal range.'
  let color = '#9ca3af'
  if (abnormal) {
    const bits: string[] = []
    if (ivMoved) bits.push(`IV ${ivRegime === 'COMPRESSING' ? 'dropped' : 'expanded'} ${ivChangePts.toFixed(1)}pts`)
    if (premiumMoved) bits.push(`premium ${premiumChangePct >= 0 ? '+' : ''}${premiumChangePct.toFixed(1)}%`)
    if (deltaMoved) bits.push(`delta ${hedgeAction === 'BUY PRESSURE' ? 'rising' : 'falling'} ${deltaMagChange >= 0 ? '+' : ''}${deltaMagChange.toFixed(2)}`)
    narrative = `Stock flat but ${bits.join(', ')} - dealer hedge/vol picture shifting underneath.`
    color = '#f97316'
  } else if (hedgeAction === 'BUY PRESSURE') {
    narrative = 'Delta magnitude rising toward 1 - dealer likely adding hedge, buy pressure building.'
    color = '#22c55e'
  } else if (hedgeAction === 'SELL PRESSURE') {
    narrative = 'Delta magnitude falling toward .5 - dealer likely cutting hedge, sell pressure building.'
    color = '#ef4444'
  } else if (ivRegime === 'EXPANDING') {
    narrative = 'IV expanding - volatility regime widening.'
    color = '#00e5ff'
  } else if (ivRegime === 'COMPRESSING') {
    narrative = 'IV compressing - volatility regime tightening.'
    color = '#eab308'
  }

  const { signals: multiDaySignals } = evaluateMultiDaySignals(leg, side)

  return { ivRegime, hedgeAction, stockFlat, abnormal, narrative, color, multiDaySignals, ivMoved, premiumMoved, deltaMoved, premiumChangePct }
}

// Three stacked indicator panes (IV / Premium / Delta) for ONE chosen leg (call or put),
// all sharing a single x-axis so they line up with the 5-min price chart above them -
// same real Black-Scholes-derived bar history, just split into separate panes instead of
// one normalized overlay, since each series has its own unit (%, $, raw delta).
function LegCard({ label, leg }: { label: string; leg: LegState | null }) {
  if (!leg || !leg.baseline || !leg.now) {
    return (
      <div style={{ flex: 1, padding: '20px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', color: '#777', fontSize: '15px', fontWeight: 700 }}>
        {label}: no data
      </div>
    )
  }
  const v = evaluateLeg(leg, label === 'CALL' ? 'call' : 'put')
  const sideColor = label === 'CALL' ? '#22c55e' : '#ef4444'
  const metric = (lbl: string, openVal: string, nowVal: string, valColor: string) => (
    <div style={{ flex: 1, minWidth: '120px', padding: '10px 12px', borderRadius: '6px', background: 'rgba(255,255,255,0.04)' }}>
      <div style={{ fontSize: '12px', fontWeight: 800, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>{lbl}</div>
      <div style={{ fontSize: '13px', color: '#fff', opacity: 0.75, marginBottom: '2px' }}>{openVal}</div>
      <div style={{ fontSize: '20px', fontWeight: 900, color: valColor }}>{nowVal}</div>
    </div>
  )

  return (
    <div style={{
      flex: 1, minWidth: '460px', borderRadius: '10px', overflow: 'hidden',
      border: v.abnormal ? '2px solid #f97316' : '1px solid rgba(255,255,255,0.14)',
      background: 'linear-gradient(165deg, #1c1c1c 0%, #0a0a0a 55%, #000000 100%)',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.6)',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px',
        background: '#050505', borderBottom: `1px solid ${sideColor}55`,
      }}>
        <span style={{ fontWeight: 900, fontSize: '18px', color: sideColor, letterSpacing: '0.04em' }}>{label} ${leg.strike}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#fff' }}>OI {leg.oi.toLocaleString()}</span>
          {v.abnormal && (
            <span style={{ fontSize: '11px', fontWeight: 900, color: '#f97316', background: '#000', border: '1px solid #f97316', borderRadius: '4px', padding: '2px 7px' }}>
              ABNORMALITY
            </span>
          )}
        </div>
      </div>
      <div style={{ padding: '16px' }}>
        <div style={{ fontSize: '12px', color: '#fff', opacity: 0.7, fontWeight: 600, marginBottom: '10px' }}>vs {leg.baselineLabel}</div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {metric('Implied Volatility', `${leg.baseline.iv.toFixed(1)}%`, `${leg.now.iv.toFixed(1)}%`, '#a855f7')}
          {metric('Premium', `$${leg.baseline.premium.toFixed(2)}`, `$${leg.now.premium.toFixed(2)}`, '#22c55e')}
          {metric('Delta', leg.baseline.delta.toFixed(2), leg.now.delta.toFixed(2), '#22d3ee')}
        </div>
        <div style={{ display: 'flex', gap: '6px', marginTop: '12px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', fontWeight: 800, padding: '4px 9px', borderRadius: '4px', background: 'rgba(255,255,255,0.08)', color: v.ivRegime === 'FLAT' ? '#fff' : v.ivRegime === 'EXPANDING' ? '#00e5ff' : '#eab308' }}>
            IV {v.ivRegime}
          </span>
          <span style={{ fontSize: '12px', fontWeight: 800, padding: '4px 9px', borderRadius: '4px', background: 'rgba(255,255,255,0.08)', color: v.hedgeAction === 'STEADY' ? '#fff' : v.hedgeAction === 'BUY PRESSURE' ? '#22c55e' : '#ef4444' }}>
            {v.hedgeAction}
          </span>
        </div>
        <div style={{ fontSize: '14px', fontWeight: 600, color: v.abnormal ? '#f97316' : '#fff', marginTop: '12px', lineHeight: 1.5 }}>{v.narrative}</div>
        {v.multiDaySignals.length > 0 && (
          <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ fontSize: '11px', color: '#fff', opacity: 0.6, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>2-5 Day Outlook</div>
            {v.multiDaySignals.map((sig) => (
              <div key={sig.key} style={{ marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 900, padding: '4px 9px', borderRadius: '4px', background: '#000', border: `1px solid ${sig.color}`, color: sig.color }}>
                  {sig.label}
                  {sig.bias !== 'NEUTRAL' && ` · ${sig.bias}`}
                </span>
                <div style={{ fontSize: '13px', color: '#fff', opacity: 0.85, marginTop: '5px', lineHeight: 1.5 }}>{sig.narrative}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Full-chain OI profile for the selected expiry - calls (green) and puts (red) diverging
// bars per strike, so you can see exactly how open interest is stacked around spot.
// Clicking a bar picks that strike as the explicit call/put leg to chart, overriding the
// automatic highest-OI-of-the-2-nearest-strikes pick.
function OIChainView({
  chain, currentPrice, selectedCall, selectedPut, onPickCall, onPickPut,
}: {
  chain: { calls: ChainSide; puts: ChainSide }
  currentPrice: number
  selectedCall: string | null
  selectedPut: string | null
  onPickCall: (strike: string) => void
  onPickPut: (strike: string) => void
}) {
  const strikes = Array.from(new Set([...Object.keys(chain.calls), ...Object.keys(chain.puts)]))
    .map((s) => parseFloat(s))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b)
  if (strikes.length === 0) return <div style={{ fontSize: '12px', color: '#555', padding: '10px' }}>No chain data.</div>

  // Original key strings (e.g. "150.00") don't always round-trip cleanly through
  // parseFloat/String (e.g. "150"), so keep a lookup back to the real chain key —
  // otherwise chain.calls[strikeKey] misses and clicking a strike silently no-ops.
  const strikeKeyByValue = new Map<number, string>()
  Object.keys(chain.calls).forEach((k) => strikeKeyByValue.set(parseFloat(k), k))
  Object.keys(chain.puts).forEach((k) => { if (!strikeKeyByValue.has(parseFloat(k))) strikeKeyByValue.set(parseFloat(k), k) })

  const maxOI = Math.max(
    1,
    ...strikes.map((s) => Math.max(chain.calls[s]?.open_interest || 0, chain.puts[s]?.open_interest || 0))
  )
  // Show the 14 strikes closest to spot so the bars stay readable.
  const nearStrikes = strikes
    .map((s) => ({ s, dist: Math.abs(s - currentPrice) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 14)
    .map((x) => x.s)
    .sort((a, b) => a - b)

  return (
    <div style={{ marginTop: '14px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#888', marginBottom: '8px' }}>
        <span style={{ color: '#ef4444', fontWeight: 800 }}>PUT (click row to chart)</span>
        <span style={{ color: '#666' }}>strike</span>
        <span style={{ color: '#22c55e', fontWeight: 800 }}>CALL (click row to chart)</span>
      </div>
      {nearStrikes.map((strike) => {
        const strikeKey = strikeKeyByValue.get(strike) ?? String(strike)
        const callData = chain.calls[strikeKey]
        const putData = chain.puts[strikeKey]
        const callOI = callData?.open_interest || 0
        const putOI = putData?.open_interest || 0
        const isATM = nearStrikes.reduce((a, b) => (Math.abs(a - currentPrice) < Math.abs(b - currentPrice) ? a : b)) === strike
        const isCallSel = selectedCall === strikeKey
        const isPutSel = selectedPut === strikeKey
        return (
          <div key={strike} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 1fr', alignItems: 'center', gap: '8px', padding: '3px 0' }}>
            <button
              type="button"
              disabled={!putData}
              onClick={() => putData && onPickPut(strikeKey)}
              style={{
                display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px', width: '100%',
                cursor: putData ? 'pointer' : 'default', background: isPutSel ? 'rgba(239,68,68,0.18)' : 'transparent',
                border: 'none', borderRadius: '4px', padding: '6px 8px', font: 'inherit',
              }}
            >
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#ffffff', minWidth: '110px', textAlign: 'right' }}>
                {putData ? `$${(putData.last_price ?? 0).toFixed(2)} · Δ${(putData.greeks?.delta ?? 0).toFixed(2)}` : ''}
              </span>
              <div style={{ width: `${(putOI / maxOI) * 100}%`, minWidth: putOI ? '2px' : 0, height: '12px', background: isPutSel ? '#ff8080' : '#ef4444' }} />
              <span style={{ fontSize: '14px', fontWeight: 800, color: '#ef4444', minWidth: '48px', textAlign: 'right' }}>{putOI.toLocaleString()}</span>
            </button>
            <div style={{ textAlign: 'center', fontSize: '14px', fontWeight: 800, color: isATM ? '#ff8500' : '#ffffff' }}>
              ${strike}
            </div>
            <button
              type="button"
              disabled={!callData}
              onClick={() => callData && onPickCall(strikeKey)}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
                cursor: callData ? 'pointer' : 'default', background: isCallSel ? 'rgba(34,197,94,0.18)' : 'transparent',
                border: 'none', borderRadius: '4px', padding: '6px 8px', font: 'inherit',
              }}
            >
              <span style={{ fontSize: '14px', fontWeight: 800, color: '#22c55e', minWidth: '48px' }}>{callOI.toLocaleString()}</span>
              <div style={{ width: `${(callOI / maxOI) * 100}%`, minWidth: callOI ? '2px' : 0, height: '12px', background: isCallSel ? '#7ef0a8' : '#22c55e' }} />
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#ffffff', minWidth: '110px' }}>
                {callData ? `$${(callData.last_price ?? 0).toFixed(2)} · Δ${(callData.greeks?.delta ?? 0).toFixed(2)}` : ''}
              </span>
            </button>
          </div>
        )
      })}
    </div>
  )
}

// Shared per-ticker card (expiry/chain/legs/chart) - used by both the manual watchlist
// and the scanner results, so a scanned ticker looks and behaves identically to one
// you searched/added by hand.
function TickerCard({
  ticker, s, chainOpen, onToggleChain, selectedCall, selectedPut, onPickCall, onPickPut,
  onExpiryChange, legSide, onSetLegSide, onRemove,
}: {
  ticker: string
  s: TickerState | undefined
  chainOpen: boolean
  onToggleChain: () => void
  selectedCall: string | null
  selectedPut: string | null
  onPickCall: (strike: string) => void
  onPickPut: (strike: string) => void
  onExpiryChange: (expiry: string) => void
  legSide: 'call' | 'put'
  onSetLegSide: (side: 'call' | 'put') => void
  onRemove?: () => void
}) {
  return (
    <div style={{ background: '#000', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <span style={{ fontWeight: 900, fontSize: '18px', color: '#fff' }}>{ticker}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {s?.currentPrice && <span style={{ fontSize: '14px', color: '#aaa' }}>${s.currentPrice.toFixed(2)}</span>}
          {onRemove && <button onClick={onRemove} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}>×</button>}
        </div>
      </div>
      {!s && <div style={{ fontSize: '13px', color: '#555' }}>Loading…</div>}
      {s?.error && <div style={{ fontSize: '13px', color: '#ef4444' }}>{s.error}</div>}
      {s && !s.error && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
            <span style={{ fontSize: '12px', color: '#666' }}>Expiry:</span>
            <select
              value={s.expiry || ''}
              onChange={(e) => onExpiryChange(e.target.value)}
              style={{ background: '#111', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '4px', padding: '4px 6px', fontSize: '12px' }}
            >
              {s.availableExpiries.map((e) => (
                <option key={e.date} value={e.date}>{e.date} ({e.days}d)</option>
              ))}
            </select>
            <button
              onClick={onToggleChain}
              style={{ background: 'none', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', padding: '4px 8px', color: '#aaa', fontSize: '11px', cursor: 'pointer' }}
            >
              {chainOpen ? 'Hide Chain' : 'View Chain'}
            </button>
          </div>
          {chainOpen && s.rawChain && s.expiry && s.currentPrice && (
            <OIChainView
              chain={s.rawChain[s.expiry]}
              currentPrice={s.currentPrice}
              selectedCall={selectedCall}
              selectedPut={selectedPut}
              onPickCall={onPickCall}
              onPickPut={onPickPut}
            />
          )}
          <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginTop: '14px' }}>
            <LegCard label="CALL" leg={s.call} />
            <LegCard label="PUT" leg={s.put} />
          </div>
          <div style={{ marginTop: '18px' }}>
            {(() => {
              const side = legSide
              const leg = side === 'call' ? s.call : s.put
              const panes = leg
                ? [
                  { label: 'IV', color: '#a855f7', data: leg.history.map((p) => ({ t: p.ts, v: p.iv })), fmt: (v: number) => `${v.toFixed(1)}%` },
                  { label: 'Premium', color: '#22c55e', data: leg.history.map((p) => ({ t: p.ts, v: p.premium })), fmt: (v: number) => `$${v.toFixed(2)}` },
                  { label: 'Delta', color: '#22d3ee', data: leg.history.map((p) => ({ t: p.ts, v: p.delta })), fmt: (v: number) => v.toFixed(2) },
                ]
                : []
              const v = leg && leg.now && leg.baseline ? evaluateLeg(leg, side) : null
              const badgeColor = v ? (v.hedgeAction === 'BUY PRESSURE' ? '#22c55e' : v.hedgeAction === 'SELL PRESSURE' ? '#ef4444' : '#9ca3af') : '#555'
              const badgeText = v ? (v.hedgeAction === 'BUY PRESSURE' ? 'BULLISH HEDGE FLOW' : v.hedgeAction === 'SELL PRESSURE' ? 'BEARISH HEDGE FLOW' : 'NEUTRAL') : 'NO DATA'
              return (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {(['call', 'put'] as const).map((opt) => (
                        <button
                          key={opt}
                          onClick={() => onSetLegSide(opt)}
                          style={{
                            background: side === opt ? (opt === 'call' ? '#22c55e' : '#ef4444') : '#111',
                            color: side === opt ? '#000' : '#aaa',
                            border: `1px solid ${side === opt ? 'transparent' : 'rgba(255,255,255,0.15)'}`,
                            borderRadius: '4px', padding: '4px 12px', fontSize: '11px', fontWeight: 800, cursor: 'pointer',
                          }}
                        >
                          {opt.toUpperCase()} {opt === 'call' ? (s.call ? `$${s.call.strike}` : '') : (s.put ? `$${s.put.strike}` : '')}
                        </button>
                      ))}
                    </div>
                    <span style={{ fontSize: '11px', fontWeight: 800, color: badgeColor, border: `1px solid ${badgeColor}`, borderRadius: '4px', padding: '2px 8px' }}>
                      {badgeText}
                    </span>
                  </div>
                  <div style={{ background: '#000000', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', overflow: 'hidden' }}>
                    <TradePopupChart symbol={ticker} fallbackCandles={[]} initialTimeframe="5M" containerWidth="100%" indicatorPanes={panes} />
                  </div>
                </>
              )
            })()}
          </div>
        </>
      )}
    </div>
  )
}

// ── 100-ticker abnormality scanner ──────────────────────────────────────────
// Single names only (no SPY/QQQ) - these are the names where dealer hedging shows
// up most cleanly since there's one underlying's OI concentration to watch, not a
// basket. Parallel/bulk-batched the same way scanAll() does the watchlist, just
// with a bigger list and higher concurrency.
const SCAN_LIST = [
  'AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMD', 'GOOGL', 'AMZN', 'META', 'NFLX', 'MU',
  'PLTR', 'SHOP', 'SOFI', 'COIN', 'MARA', 'RIOT', 'SNOW', 'CRWD', 'PANW', 'NET',
  'DDOG', 'ZS', 'OKTA', 'SQ', 'PYPL', 'UBER', 'LYFT', 'ABNB', 'DIS', 'BA',
  'CAT', 'DE', 'XOM', 'CVX', 'JPM', 'GS', 'MS', 'BAC', 'WFC', 'C',
  'V', 'MA', 'AXP', 'COST', 'WMT', 'TGT', 'HD', 'LOW', 'NKE', 'SBUX',
  'MCD', 'KO', 'PEP', 'PG', 'JNJ', 'PFE', 'MRNA', 'UNH', 'CVS', 'T',
  'VZ', 'TMUS', 'INTC', 'QCOM', 'AVGO', 'TXN', 'ADBE', 'CRM', 'ORCL', 'IBM',
  'CSCO', 'NOW', 'WDAY', 'SNPS', 'CDNS', 'LRCX', 'AMAT', 'ASML', 'TSM', 'ARM',
  'SMCI', 'DELL', 'HPQ', 'F', 'GM', 'RIVN', 'LCID', 'NIO', 'XPEV', 'LI',
  'BABA', 'JD', 'PDD', 'SE', 'MELI', 'ROKU', 'SNAP', 'PINS', 'TWLO', 'DOCU',
]
const SCAN_CONCURRENCY = 10

type ScanResult = {
  ticker: string
  state: TickerState
  call: Verdict | null
  put: Verdict | null
}

type ScannerPanelHandle = { runScan: () => void }

// The 3-column layout the scanner renders - one column per metric (IV / Delta / Premium),
// each grouping the 2 multi-day signal keys that belong to that metric.
const CATEGORY_COLUMNS: { title: string; color: string; keys: MultiDaySignal['key'][] }[] = [
  { title: 'Implied Volatility', color: '#a855f7', keys: ['MOVE_COMING', 'CHOP_COMING'] },
  { title: 'Delta / Hedging', color: '#22d3ee', keys: ['HEDGE_UP', 'HEDGE_DOWN'] },
  { title: 'Premium', color: '#22c55e', keys: ['PREMIUM_DECAY', 'PREMIUM_STRENGTH'] },
]

type ColumnEntry = { ticker: string; color: string; label: string; narrative: string; side: 'call' | 'put'; strike: number; price: number | null }

// Every ticker that made it into "visible" is abnormal by definition (stock flat, one of
// IV/premium/delta moved a lot same-session) - so it always belongs in at least one of the
// 3 columns. Multi-day signals (the 2-5 day read) win when present; otherwise fall back to
// the same-session verdict for that metric so nothing is ever left uncategorized.
function bestForColumn(r: ScanResult, col: { keys: MultiDaySignal['key'][] }): ColumnEntry | null {
  const sides: Array<{ side: 'call' | 'put'; verdict: Verdict | null; leg: LegState | null }> = [
    { side: 'call', verdict: r.call, leg: r.state.call },
    { side: 'put', verdict: r.put, leg: r.state.put },
  ]
  for (const { side, verdict, leg } of sides) {
    if (!verdict || !leg) continue
    const sig = verdict.multiDaySignals.find((s) => col.keys.includes(s.key))
    if (sig) return { ticker: r.ticker, color: sig.color, label: sig.bias !== 'NEUTRAL' ? sig.bias : sig.label, narrative: sig.narrative, side, strike: leg.strike, price: r.state.currentPrice }
  }
  for (const { side, verdict, leg } of sides) {
    if (!verdict || !leg) continue
    if (col.keys.includes('MOVE_COMING') && verdict.ivRegime !== 'FLAT') {
      const compressing = verdict.ivRegime === 'COMPRESSING'
      return { ticker: r.ticker, color: compressing ? '#eab308' : '#00e5ff', label: compressing ? 'IV COMPRESSING' : 'IV EXPANDING', narrative: verdict.narrative, side, strike: leg.strike, price: r.state.currentPrice }
    }
    if (col.keys.includes('HEDGE_UP') && verdict.hedgeAction !== 'STEADY') {
      const up = verdict.hedgeAction === 'BUY PRESSURE'
      return { ticker: r.ticker, color: up ? '#22c55e' : '#ef4444', label: verdict.hedgeAction, narrative: verdict.narrative, side, strike: leg.strike, price: r.state.currentPrice }
    }
    if (col.keys.includes('PREMIUM_DECAY') && verdict.premiumMoved) {
      const decay = verdict.premiumChangePct < 0
      return { ticker: r.ticker, color: decay ? '#9ca3af' : '#f97316', label: decay ? 'PREMIUM DECAY' : 'PREMIUM HOLDING STRONG', narrative: verdict.narrative, side, strike: leg.strike, price: r.state.currentPrice }
    }
  }
  return null
}

const ScannerPanel = forwardRef<ScannerPanelHandle, { onScanningChange: (scanning: boolean, progress: { done: number; total: number }) => void }>(
  function ScannerPanel({ onScanningChange }, ref) {
    const [scanning, setScanning] = useState(false)
    const [progress, setProgress] = useState({ done: 0, total: 0 })
    const [results, setResults] = useState<ScanResult[]>([])
    const [onlyAbnormal] = useState(true)
    const [chainViewOpen, setChainViewOpen] = useState<Record<string, boolean>>({})
    const [strikeOverrides, setStrikeOverrides] = useState<Record<string, { call?: string; put?: string }>>({})
    const [legSide, setLegSide] = useState<Record<string, 'call' | 'put'>>({})

    const runScan = async () => {
      setScanning(true)
      onScanningChange(true, { done: 0, total: SCAN_LIST.length })
      setResults([])
      setProgress({ done: 0, total: SCAN_LIST.length })
      const riskFreeRate = (await getRiskFreeRate()) ?? 0.05
      const collected: ScanResult[] = []
      for (let i = 0; i < SCAN_LIST.length; i += SCAN_CONCURRENCY) {
        const batch = SCAN_LIST.slice(i, i + SCAN_CONCURRENCY)
        const batchResults = await Promise.all(batch.map(async (ticker): Promise<ScanResult> => {
          const state = await loadTicker(ticker, riskFreeRate)
          return {
            ticker, state,
            call: state.call ? evaluateLeg(state.call, 'call') : null,
            put: state.put ? evaluateLeg(state.put, 'put') : null,
          }
        }))
        collected.push(...batchResults)
        setProgress({ done: collected.length, total: SCAN_LIST.length })
        onScanningChange(true, { done: collected.length, total: SCAN_LIST.length })
        setResults([...collected])
      }
      setScanning(false)
      onScanningChange(false, { done: SCAN_LIST.length, total: SCAN_LIST.length })
    }

    useImperativeHandle(ref, () => ({ runScan }))

    // Re-scans just one ticker from the results list, used when the user picks a
    // different expiry/strike on a scanned card - identical pattern to the main watchlist's scanOne.
    const rescanOne = async (ticker: string, expiryOverride?: string, callStrikeOverride?: string, putStrikeOverride?: string) => {
      const riskFreeRate = (await getRiskFreeRate()) ?? 0.05
      const state = await loadTicker(ticker, riskFreeRate, expiryOverride, callStrikeOverride, putStrikeOverride)
      setResults((prev) => prev.map((r) => (r.ticker === ticker
        ? { ticker, state, call: state.call ? evaluateLeg(state.call, 'call') : null, put: state.put ? evaluateLeg(state.put, 'put') : null }
        : r)))
    }

    const pickStrike = (ticker: string, side: 'call' | 'put', strike: string) => {
      setStrikeOverrides((prev) => {
        const next = { ...prev, [ticker]: { ...prev[ticker], [side]: strike } }
        const r = results.find((x) => x.ticker === ticker)
        rescanOne(ticker, r?.state.expiry || undefined, side === 'call' ? strike : next[ticker]?.call, side === 'put' ? strike : next[ticker]?.put)
        return next
      })
    }

    const visible = (onlyAbnormal ? results.filter((r) => r.call?.abnormal || r.put?.abnormal) : results)
    const [expandedTicker, setExpandedTicker] = useState<string | null>(null)
    const expandedResult = expandedTicker ? visible.find((r) => r.ticker === expandedTicker) : null
    const expandedRef = useRef<HTMLDivElement | null>(null)

    // The expanded card renders far below a tall 3-column grid - without this, clicking a row
    // near the top looks like it did nothing because the detail panel is off-screen.
    useEffect(() => {
      if (expandedTicker && expandedRef.current) {
        expandedRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }, [expandedTicker])

    const renderCard = (r: ScanResult) => (
      <TickerCard
        key={r.ticker}
        ticker={r.ticker}
        s={r.state}
        chainOpen={!!chainViewOpen[r.ticker]}
        onToggleChain={() => setChainViewOpen((prev) => ({ ...prev, [r.ticker]: !prev[r.ticker] }))}
        selectedCall={strikeOverrides[r.ticker]?.call ?? (r.state.call ? String(r.state.call.strike) : null)}
        selectedPut={strikeOverrides[r.ticker]?.put ?? (r.state.put ? String(r.state.put.strike) : null)}
        onPickCall={(strike) => pickStrike(r.ticker, 'call', strike)}
        onPickPut={(strike) => pickStrike(r.ticker, 'put', strike)}
        onExpiryChange={(expiry) => rescanOne(r.ticker, expiry)}
        legSide={legSide[r.ticker] || 'call'}
        onSetLegSide={(side) => setLegSide((prev) => ({ ...prev, [r.ticker]: side }))}
      />
    )

    // One row per ticker matched in a column - clicking it expands the full call/put
    // breakdown for that ticker in the panel below the 3 columns.
    const renderRow = (entry: ColumnEntry) => {
      const selected = expandedTicker === entry.ticker
      const sideColor = entry.side === 'call' ? '#22c55e' : '#ef4444'
      return (
        <div
          key={entry.ticker}
          onClick={() => setExpandedTicker(selected ? null : entry.ticker)}
          style={{
            padding: '14px 16px', borderRadius: '8px', cursor: 'pointer', marginBottom: '10px',
            background: selected ? 'linear-gradient(165deg, #1c1c1c 0%, #0a0a0a 60%, #000 100%)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${selected ? '#ff8500' : 'rgba(255,255,255,0.1)'}`,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '9px' }}>
              <span style={{ fontWeight: 900, fontSize: '16px', color: selected ? '#ff8500' : '#fff' }}>{entry.ticker}</span>
              <span style={{ fontSize: '12px', fontWeight: 800, color: sideColor }}>{entry.side.toUpperCase()} ${entry.strike}</span>
              {entry.price != null && <span style={{ fontSize: '12px', color: '#888' }}>${entry.price.toFixed(2)}</span>}
            </div>
            <span style={{ fontSize: '11px', fontWeight: 800, color: entry.color, border: `1px solid ${entry.color}`, borderRadius: '4px', padding: '3px 8px', whiteSpace: 'nowrap' }}>
              {entry.label}
            </span>
          </div>
          <div style={{ fontSize: '12.5px', color: selected ? '#ddd' : '#999', marginTop: '7px', lineHeight: 1.5 }}>{entry.narrative}</div>
        </div>
      )
    }

    return (
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(260px, 1fr))', gap: '16px', marginBottom: '20px' }}>
          {CATEGORY_COLUMNS.map((col) => {
            const rows = visible
              .map((r) => bestForColumn(r, col))
              .filter((x): x is ColumnEntry => !!x)
            return (
              <div key={col.title} style={{
                background: 'linear-gradient(165deg, #1c1c1c 0%, #0a0a0a 55%, #000 100%)',
                border: '1px solid rgba(255,255,255,0.14)', borderRadius: '10px', padding: '16px',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.6)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '14px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: col.color }} />
                  <span style={{ fontWeight: 900, fontSize: '16px', color: '#fff', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{col.title}</span>
                </div>
                {rows.length === 0 && <div style={{ fontSize: '12px', color: '#666', textAlign: 'center' }}>No signals yet.</div>}
                {rows.map((entry) => (
                  <div key={entry.ticker}>
                    {renderRow(entry)}
                    {expandedTicker === entry.ticker && expandedResult && (
                      <div ref={expandedRef} style={{ marginBottom: '10px', paddingTop: '2px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                          <span style={{ fontWeight: 900, fontSize: '13px', color: '#ff8500', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                            {expandedResult.ticker} Detail
                          </span>
                          <button
                            onClick={() => setExpandedTicker(null)}
                            style={{ background: 'none', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', padding: '2px 8px', color: '#aaa', fontSize: '10px', cursor: 'pointer' }}
                          >
                            Close
                          </button>
                        </div>
                        {renderCard(expandedResult)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    )
  })

export default function DealerManagementPanel() {
  const [watchlist, setWatchlist] = useState<string[]>(DEFAULT_WATCHLIST)
  const [states, setStates] = useState<Record<string, TickerState>>({})
  const [tickerInput, setTickerInput] = useState('')
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [chainViewOpen, setChainViewOpen] = useState<Record<string, boolean>>({})
  const [strikeOverrides, setStrikeOverrides] = useState<Record<string, { call?: string; put?: string }>>({})
  const [legSide, setLegSide] = useState<Record<string, 'call' | 'put'>>({})
  const [abnormalScanning, setAbnormalScanning] = useState(false)
  const [abnormalProgress, setAbnormalProgress] = useState({ done: 0, total: 0 })
  const scannerRef = useRef<ScannerPanelHandle>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_WATCHLIST_KEY)
      if (saved) setWatchlist(JSON.parse(saved))
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    try { localStorage.setItem(STORAGE_WATCHLIST_KEY, JSON.stringify(watchlist)) } catch { /* ignore */ }
  }, [watchlist])

  const scanAll = async () => {
    setScanning(true)
    const riskFreeRate = (await getRiskFreeRate()) ?? 0.05
    // Bulk/parallel: fan out in capped-concurrency batches (same pattern as /api/bulk-historical-data)
    // rather than one-at-a-time, so a full watchlist scan is one wave of requests, not N sequential ones.
    const results: TickerState[] = []
    for (let i = 0; i < watchlist.length; i += MAX_CONCURRENT_TICKERS) {
      const batch = watchlist.slice(i, i + MAX_CONCURRENT_TICKERS)
      const batchResults = await Promise.all(batch.map((t) => {
        const override = strikeOverrides[t]
        const s = states[t]
        return loadTicker(t, riskFreeRate, s?.expiry || undefined, override?.call, override?.put)
      }))
      results.push(...batchResults)
    }
    setStates((prev) => {
      const next = { ...prev }
      results.forEach((r) => { next[r.ticker] = r })
      return next
    })
    setScanning(false)
  }

  useEffect(() => {
    scanAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchlist.join(',')])

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(scanAll, 60000)
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, watchlist.join(',')])

  // Re-scans just one ticker, used when the user picks a different expiry or strike.
  const scanOne = async (ticker: string, expiryOverride?: string, callStrikeOverride?: string, putStrikeOverride?: string) => {
    const riskFreeRate = (await getRiskFreeRate()) ?? 0.05
    const result = await loadTicker(ticker, riskFreeRate, expiryOverride, callStrikeOverride, putStrikeOverride)
    setStates((prev) => ({ ...prev, [ticker]: result }))
  }

  // Clicking a strike in the chain view pins that side's leg explicitly, overriding the
  // automatic highest-OI pick, and immediately re-scans so the charts update.
  const pickStrike = (ticker: string, side: 'call' | 'put', strike: string) => {
    setStrikeOverrides((prev) => {
      const next = { ...prev, [ticker]: { ...prev[ticker], [side]: strike } }
      const s = states[ticker]
      scanOne(ticker, s?.expiry || undefined, side === 'call' ? strike : next[ticker]?.call, side === 'put' ? strike : next[ticker]?.put)
      return next
    })
  }

  const addTicker = () => {
    const t = tickerInput.trim().toUpperCase()
    if (!t || watchlist.includes(t)) return
    setWatchlist((prev) => [...prev, t])
    setTickerInput('')
  }

  const removeTicker = (t: string) => {
    setWatchlist((prev) => prev.filter((x) => x !== t))
    setStates((prev) => { const next = { ...prev }; delete next[t]; return next })
  }

  return (
    <div style={{ padding: '20px', color: '#eee' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px',
        padding: '0 0 16px', marginBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.1)',
      }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: '22px', color: '#fff', letterSpacing: '0.03em' }}>Dealer Management</div>
          <div style={{ fontSize: '12px', color: '#777', fontWeight: 500, marginTop: '2px' }}>Options flow &amp; dealer hedging monitor</div>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <input
            value={tickerInput}
            onChange={(e) => setTickerInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addTicker() }}
            placeholder="Add ticker..."
            style={{ background: '#111', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '5px', padding: '8px 10px', color: '#fff', fontSize: '13px', width: '120px' }}
          />
          <button onClick={addTicker} style={{ background: '#ff8500', border: 'none', borderRadius: '5px', padding: '8px 14px', color: '#000', fontWeight: 800, fontSize: '12px', cursor: 'pointer' }}>
            ADD
          </button>
          <button onClick={scanAll} disabled={scanning} style={{ background: scanning ? '#333' : '#1a1a1a', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '5px', padding: '8px 14px', color: '#fff', fontWeight: 800, fontSize: '12px', cursor: scanning ? 'default' : 'pointer' }}>
            {scanning ? 'SCANNING…' : 'SCAN NOW'}
          </button>
          <button
            onClick={() => scannerRef.current?.runScan()}
            disabled={abnormalScanning}
            style={{ background: abnormalScanning ? '#333' : '#ff8500', border: 'none', borderRadius: '5px', padding: '8px 14px', color: abnormalScanning ? '#fff' : '#000', fontWeight: 800, fontSize: '12px', cursor: abnormalScanning ? 'default' : 'pointer' }}
          >
            {abnormalScanning ? `SCANNING ${abnormalProgress.done}/${abnormalProgress.total}…` : 'SCAN FOR ABNORMALITY'}
          </button>
          <label style={{ fontSize: '12px', color: '#999', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
            Auto 60s
          </label>
        </div>
      </div>

      <ScannerPanel ref={scannerRef} onScanningChange={(s, p) => { setAbnormalScanning(s); setAbnormalProgress(p) }} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(960px, 1fr))', gap: '18px' }}>
        {watchlist.map((ticker) => {
          const s = states[ticker]
          return (
            <TickerCard
              key={ticker}
              ticker={ticker}
              s={s}
              chainOpen={!!chainViewOpen[ticker]}
              onToggleChain={() => setChainViewOpen((prev) => ({ ...prev, [ticker]: !prev[ticker] }))}
              selectedCall={strikeOverrides[ticker]?.call ?? (s?.call ? String(s.call.strike) : null)}
              selectedPut={strikeOverrides[ticker]?.put ?? (s?.put ? String(s.put.strike) : null)}
              onPickCall={(strike) => pickStrike(ticker, 'call', strike)}
              onPickPut={(strike) => pickStrike(ticker, 'put', strike)}
              onExpiryChange={(expiry) => scanOne(ticker, expiry)}
              legSide={legSide[ticker] || 'call'}
              onSetLegSide={(side) => setLegSide((prev) => ({ ...prev, [ticker]: side }))}
              onRemove={() => removeTicker(ticker)}
            />
          )
        })}
      </div>
    </div>
  )
}
