'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import BuySellPortfolio, { type AddTradePayload, type PortfolioRef } from './BuySellPortfolio'

import { TOP_1000_SYMBOLS } from '@/lib/Top1000Symbols'

const POLYGON_API_KEY = process.env.NEXT_PUBLIC_POLYGON_API_KEY || ''
const BATCH_SIZE = 20

// Fetch live ask (falls back to midpoint → last trade) for an option contract
async function fetchLiveAsk(symbol: string, optionTicker: string): Promise<number | null> {
  try {
    const url = `https://api.polygon.io/v3/snapshot/options/${encodeURIComponent(symbol)}/${encodeURIComponent(optionTicker)}?apiKey=${POLYGON_API_KEY}`
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    const json = await res.json()
    const r = json.results
    if (!r) return null
    // Use ask price for entry (what you actually pay), fall back to mid → last trade → day close
    return r.last_quote?.ask ?? r.last_quote?.midpoint ?? r.last_trade?.price ?? r.day?.close ?? null
  } catch {
    return null
  }
}

function buildOptionTicker(symbol: string, expiration: string, type: 'call' | 'put', strike: number): string {
  const [y, m, d] = expiration.split('-')
  const dateStr = y.slice(2) + m + d
  const typeChar = type === 'call' ? 'C' : 'P'
  const strikeStr = Math.round(strike * 1000).toString().padStart(8, '0')
  return `O:${symbol}${dateStr}${typeChar}${strikeStr}`
}

interface Bar {
  o: number
  h: number
  l: number
  c: number
  v: number
  t?: number
}

export interface BSTrade {
  strike: number
  expiration: string
  dte: number
  entry: number
  t1Stock: number
  t2Stock: number
  t1Premium: number
  t2Premium: number
  stopPremium: number
}

export interface SeasonalityInfo {
  sweetSpot: { period: string; totalReturn: number; startDay: number; endDay: number }
  painPoint: { period: string; totalReturn: number; startDay: number; endDay: number }
  best30Day: { period: string; return: number; startDay: number; endDay: number }
  worst30Day: { period: string; return: number; startDay: number; endDay: number }
  inSweetSpot: boolean
  inPainPoint: boolean
  in30dBullish: boolean
  in30dBearish: boolean
  seasonallyConfirmed: boolean
}

export interface SeasonalityInfo {
  sweetSpot: { period: string; totalReturn: number; startDay: number; endDay: number }
  painPoint: { period: string; totalReturn: number; startDay: number; endDay: number }
  best30Day: { period: string; return: number; startDay: number; endDay: number }
  worst30Day: { period: string; return: number; startDay: number; endDay: number }
  inSweetSpot: boolean
  inPainPoint: boolean
  in30dBullish: boolean
  in30dBearish: boolean
  seasonallyConfirmed: boolean
}

export interface ScanResult {
  symbol: string
  signal: 'BUY' | 'SELL'
  score: number
  avgHighVal: number
  avgLowVal: number
  yearlyMin: number
  yearlyMax: number
  label: 'BELOW YEARLY LOW' | 'JUST BELOW AVERAGE' | 'ABOVE AVERAGE'
  currentPrice: number
  priceChangePct: number
  bars: Bar[]
  crossBarIdx: number
  atr14: number
  trade: BSTrade
  scores: number[]
  thresholdYears: 1 | 3 | 5 | 10
  seasonality?: SeasonalityInfo
}

export interface ConfluenceResult {
  symbol: string
  signal: 'BUY' | 'SELL'
  hitCount: 2 | 3
  hits: Array<{ tf: 1 | 5 | 10; signal: 'BUY' | 'SELL' }>
  currentPrice: number
  priceChangePct: number
  chartResult: ScanResult
  allTfResults: Partial<Record<1 | 5 | 10, ScanResult>>
  trade: BSTrade
  seasonality?: SeasonalityInfo
}

// ─── Score calculation ─────────────────────────────────────────────────────────
// 8 microstructure factors. Zero lagging oscillators.
// Reads WHAT THE MARKET IS DOING WITH PRICE — not price itself.
//
// 1. Wyckoff VSA (22%)         — effort (vol) vs result (price travel + close pos)
// 2. Candle Close Persistence (18%) — WHERE price settles within range, smoothed
// 3. Tail Rejection Score (14%)     — aggression of in-bar buying/selling pressure
// 4. Smart Money Divergence (14%)   — candle body direction vs price trend (open→close)
// 5. Momentum Deceleration (10%)    — derivative of momentum; catches exhaustion early
// 6. Vol-Price Correlation (10%)    — rolling Pearson: does volume CONFIRM price?
// 7. Absorption Detection (8%)       — high vol + narrow spread = supply being absorbed
// 8. Multi-period RS vs SPY (4%)    — structural relative strength for context
function calcSmoothedScores(bars: Bar[], spyBars: Bar[]): number[] {
  const n = bars.length
  if (n < 80) return []

  const closes = bars.map((b) => b.c)
  const highs = bars.map((b) => b.h)
  const lows = bars.map((b) => b.l)
  const vols = bars.map((b) => b.v)
  const opens = bars.map((b) => b.o)

  const calcEma = (src: number[], period: number): number[] => {
    const k = 2 / (period + 1)
    const out: number[] = [src[0]]
    for (let i = 1; i < src.length; i++) out.push(src[i] * k + out[i - 1] * (1 - k))
    return out
  }

  // ATR (needed for normalisation)
  const atrArr = new Array<number>(n).fill(0)
  for (let i = 1; i < n; i++) {
    const tr = Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]))
    atrArr[i] = i < 14 ? tr : (atrArr[i - 1] * 13) / 14 + tr / 14
  }

  // 20-day avg volume
  const avgVol20 = new Array<number>(n).fill(0)
  for (let i = 20; i < n; i++)
    avgVol20[i] = vols.slice(i - 19, i + 1).reduce((a, b) => a + b, 0) / 20

  // ── 1. Wyckoff VSA ──────────────────────────────────────────────────────────
  // Effort (volume) vs Result (ATR-relative spread × close position in bar).
  // NO SUPPLY bar: vol < 70% avg AND price rises → easiest markup = institutions loaded.
  // CLIMAX bar: vol > 200% avg AND wide spread AND close NOT near top → selling climax if down.
  // We score the bar's QUALITY, not just direction.
  const vsaArr = new Array<number>(n).fill(0)
  for (let i = 5; i < n; i++) {
    const rng = highs[i] - lows[i]
    const atr = atrArr[i] || 1
    const avgV = avgVol20[i] || vols[i] || 1
    const closePos = rng > 0 ? (closes[i] - lows[i]) / rng : 0.5
    const effort = Math.log1p(vols[i] / avgV)  // log scale vol ratio
    const spread = rng / atr                    // bar size vs ATR

    // No-supply bonus: small vol + up move = no sellers present
    const noSupply = vols[i] < avgV * 0.7 && closes[i] > closes[i - 1] ? 0.6 : 0

    // Climax penalty/signal: volume explosion + price rejecting in wrong direction
    const isClimax = vols[i] > avgV * 2.0 && spread > 1.5
    const climaxSign = isClimax ? (closePos < 0.4 ? -1 : closePos > 0.6 ? 1 : 0) * 0.8 : 0

    vsaArr[i] = Math.max(-3, Math.min(3, effort * spread * (closePos - 0.5) * 2 + noSupply + climaxSign))
  }
  const vsaSmooth = calcEma(vsaArr, 5)
  const vsaScore = new Array<number>(n).fill(0)
  for (let i = 40; i < n; i++) {
    const w = vsaSmooth.slice(i - 39, i + 1)
    const maxAbs = Math.max(...w.map(Math.abs), 1e-9)
    vsaScore[i] = Math.max(-100, Math.min(100, (vsaSmooth[i] / maxAbs) * 100))
  }

  // ── 2. Candle Close Position Persistence ───────────────────────────────────
  // NOT price direction. WHERE does price consistently END within its daily range?
  // EMA5 of closePos vs EMA20 baseline. If EMA5 > EMA20 = buyers persistently winning
  // the intraday battle. If < = sellers dominating end-of-day prints.
  const closePosArr = bars.map((_, i) => {
    const rng = highs[i] - lows[i]
    return rng > 0 ? (closes[i] - lows[i]) / rng : 0.5
  })
  const cpEma5 = calcEma(closePosArr, 5)
  const cpEma20 = calcEma(closePosArr, 20)
  const ccppScore = new Array<number>(n).fill(0)
  for (let i = 25; i < n; i++) {
    const crossover = (cpEma5[i] - cpEma20[i]) * 200          // divergence × 200 → ±100 range
    const absLevel = (cpEma5[i] - 0.5) * 200                  // absolute bias
    ccppScore[i] = Math.max(-100, Math.min(100, crossover * 0.65 + absLevel * 0.35))
  }

  // ── 3. Tail Rejection Score ─────────────────────────────────────────────────
  // Lower wick length = how aggressively buyers rejected the lows WITHIN the bar.
  // Upper wick length = how aggressively sellers rejected the highs.
  // NET = lower − upper. Sustained buyers beating sellers = accumulation.
  // This is intraday micro-structure, completely different from close-to-close indicators.
  const tailRaw = bars.map((_, i) => {
    const rng = highs[i] - lows[i]
    if (!rng) return 0
    return (closes[i] - lows[i]) / rng - (highs[i] - closes[i]) / rng
  })
  const tailSmooth = calcEma(tailRaw, 7)
  const tailScore = new Array<number>(n).fill(0)
  for (let i = 20; i < n; i++)
    tailScore[i] = Math.max(-100, Math.min(100, tailSmooth[i] * 100))

  // ── 4. Smart Money Divergence ───────────────────────────────────────────────
  // Smart money is informed → acts at the OPEN. Retail chases → buys near the CLOSE.
  // Candle body = (close - open) / range. Positive = buyers won the open-to-close battle.
  // KEY INSIGHT: if body is persistently BULLISH but price still drifting DOWN
  // → institutions are quietly absorbing the sell-off. This is the exact setup
  // Wyckoff calls "Phase B accumulation" — invisible to all standard oscillators.
  const bodyArr = bars.map((_, i) => {
    const rng = highs[i] - lows[i]
    return rng > 0 ? (closes[i] - opens[i]) / rng : 0
  })
  const bodyEma = calcEma(bodyArr, 10)
  const smDivScore = new Array<number>(n).fill(0)
  for (let i = 15; i < n; i++) {
    const priceBias = closes[i] > closes[i - 10] ? 1 : closes[i] < closes[i - 10] ? -1 : 0
    const body = bodyEma[i]
    // Divergence: body direction ≠ price direction = smart money fighting the trend
    if (Math.sign(body) !== priceBias && Math.abs(body) > 0.04) {
      // Bullish body + falling price = accumulation (BUY)
      // Bearish body + rising price = distribution (SELL)
      smDivScore[i] = Math.max(-100, Math.min(100, body * 500))
    } else {
      // Agreement = mild trend confirmation
      smDivScore[i] = Math.max(-100, Math.min(100, body * priceBias * 80))
    }
  }

  // ── 5. Momentum Deceleration ────────────────────────────────────────────────
  // Not momentum. The CHANGE IN MOMENTUM. This fires BEFORE reversals, not after.
  // If 20-day move is up but 2-day move is slowing → rally losing steam → SELL prep.
  // If 20-day move is down but 2-day move is slowing → decline exhausting → BUY prep.
  // Formula: decel = 1 - |mom2| / (|mom5| + ε). Higher decel = more exhausted.
  const decelScore = new Array<number>(n).fill(0)
  for (let i = 25; i < n; i++) {
    const atr = atrArr[i] || 1
    const mom20 = (closes[i] - closes[i - 20]) / (atr * Math.sqrt(20))
    const mom5 = (closes[i] - closes[i - 5]) / (atr * Math.sqrt(5))
    const mom2 = (closes[i] - closes[i - 2]) / (atr * Math.sqrt(2))
    // Only score when there's a clear trend at 20-day level
    if (Math.abs(mom20) > 0.15 && Math.sign(mom20) === Math.sign(mom5)) {
      const decel = Math.max(0, 1 - Math.abs(mom2) / (Math.abs(mom5) + 0.01))
      // Rising trend decelerating = sell pressure. Falling trend decelerating = buy pressure.
      decelScore[i] = Math.max(-100, Math.min(100, -Math.sign(mom20) * decel * 100))
    }
  }

  // ── 6. Volume-Price Correlation ─────────────────────────────────────────────
  // 10-day rolling Pearson correlation between daily returns and volume deviation.
  // High positive correlation in uptrend = HEALTHY (vol confirms price) = continuation.
  // Negative correlation in uptrend = DIVERGENCE (price going up on shrinking vol) = top.
  // Negative correlation in downtrend = CAPITULATION (high vol crashing = exhaustion) = bottom.
  const vpCorrScore = new Array<number>(n).fill(0)
  for (let i = 15; i < n; i++) {
    const len = 10
    const avgV = avgVol20[i] || 1
    let sx = 0, sy = 0, sxy = 0, sx2 = 0, sy2 = 0
    for (let j = i - len + 1; j <= i; j++) {
      const x = closes[j - 1] > 0 ? (closes[j] - closes[j - 1]) / closes[j - 1] : 0
      const y = vols[j] / avgV - 1
      sx += x; sy += y; sxy += x * y; sx2 += x * x; sy2 += y * y
    }
    const denom = Math.sqrt((sx2 - sx * sx / len) * (sy2 - sy * sy / len))
    const corr = denom > 1e-10 ? (sxy - sx * sy / len) / denom : 0
    const pDir = closes[i] > closes[i - 10] ? 1 : -1
    // Positive: vol confirms price direction → trend healthy
    // Negative in rally: distribution. Negative in selloff: capitulation (buy).
    vpCorrScore[i] = Math.max(-100, Math.min(100, corr * pDir * 100))
  }

  // ── 7. Absorption Score ─────────────────────────────────────────────────────
  // Absorption = high volume + narrow range + close in middle.
  // This means supply IS being met and neutralised — not yet resolved, but build-up.
  // Bullish absorption (after down move): supply being absorbed below = impending rally.
  // Bearish absorption (after up move): demand being absorbed above = impending decline.
  const absRaw = new Array<number>(n).fill(0)
  for (let i = 10; i < n; i++) {
    const rng = highs[i] - lows[i]
    const atr = atrArr[i] || 1
    const avgV = avgVol20[i] || 1
    const closePos = rng > 0 ? (closes[i] - lows[i]) / rng : 0.5
    const isNarrow = rng / atr < 0.8
    const isHighVol = vols[i] > avgV * 1.3
    const isMidClose = closePos > 0.3 && closePos < 0.7
    if (isNarrow && isHighVol && isMidClose) {
      // Context: were we trending down (bullish absorption) or up (bearish absorption)?
      const trend5 = closes[i] - closes[i - 5]
      absRaw[i] = trend5 < 0 ? 1 : trend5 > 0 ? -1 : 0
    }
  }
  const absSmooth = calcEma(absRaw, 5)
  const absScore = absSmooth.map((v) => Math.max(-100, Math.min(100, v * 100)))

  // ── 8. Multi-period Relative Strength vs SPY ───────────────────────────────
  const rsArr = new Array<number>(n).fill(0)
  for (let i = 63; i < n; i++) {
    const off = spyBars.length - n
    const si = off + i
    if (si < 0 || si >= spyBars.length) continue
    let rs5 = 0, rs20 = 0, rs60 = 0
    if (i >= 5 && si - 5 >= 0 && bars[i - 5]?.c > 0 && spyBars[si - 5]?.c > 0)
      rs5 = Math.max(-100, Math.min(100, ((bars[i].c - bars[i - 5].c) / bars[i - 5].c - (spyBars[si].c - spyBars[si - 5].c) / spyBars[si - 5].c) * 500))
    if (i >= 20 && si - 20 >= 0 && bars[i - 20]?.c > 0 && spyBars[si - 20]?.c > 0)
      rs20 = Math.max(-100, Math.min(100, ((bars[i].c - bars[i - 20].c) / bars[i - 20].c - (spyBars[si].c - spyBars[si - 20].c) / spyBars[si - 20].c) * 300))
    if (i >= 60 && si - 60 >= 0 && bars[i - 60]?.c > 0 && spyBars[si - 60]?.c > 0)
      rs60 = Math.max(-100, Math.min(100, ((bars[i].c - bars[i - 60].c) / bars[i - 60].c - (spyBars[si].c - spyBars[si - 60].c) / spyBars[si - 60].c) * 200))
    rsArr[i] = rs5 * 0.35 + rs20 * 0.35 + rs60 * 0.30
  }

  // ── Composite ───────────────────────────────────────────────────────────────
  const rawScores = bars.map((_, i) => {
    if (i < 63) return 0
    return Math.max(-100, Math.min(100,
      vsaScore[i] * 0.22 +
      ccppScore[i] * 0.18 +
      tailScore[i] * 0.14 +
      smDivScore[i] * 0.14 +
      decelScore[i] * 0.10 +
      vpCorrScore[i] * 0.10 +
      absScore[i] * 0.08 +
      rsArr[i] * 0.04
    ))
  })

  const emaK = 2 / 4
  const smoothed: number[] = [rawScores[0]]
  for (let i = 1; i < n; i++) smoothed.push(rawScores[i] * emaK + smoothed[i - 1] * (1 - emaK))
  return smoothed
}

// ─── Options trade helpers ───────────────────────────────────────────────────
function nextWeeklyFriday(minDte: number): { date: string; dte: number } {
  const now = new Date()
  const d = new Date(now)
  d.setDate(d.getDate() + minDte)
  while (d.getDay() !== 5) d.setDate(d.getDate() + 1)
  const dte = Math.round((d.getTime() - now.getTime()) / 86400000)
  // Use local date components to avoid UTC offset shifting the date
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return { date: `${y}-${m}-${day}`, dte }
}

function roundToStrike(price: number): number {
  if (price >= 500) return Math.round(price / 10) * 10
  if (price >= 200) return Math.round(price / 5) * 5
  if (price >= 50) return Math.round(price / 2.5) * 2.5
  if (price >= 20) return Math.round(price)
  return Math.round(price / 0.5) * 0.5
}

function calcBarATR14(bars: Bar[]): number {
  if (bars.length < 2) return 0
  let sum = 0, count = 0
  for (let i = Math.max(1, bars.length - 14); i < bars.length; i++) {
    const tr = Math.max(bars[i].h - bars[i].l, Math.abs(bars[i].h - bars[i - 1].c), Math.abs(bars[i].l - bars[i - 1].c))
    sum += tr; count++
  }
  return count > 0 ? sum / count : 0
}

function buildBSTrade(signal: 'BUY' | 'SELL', currentPrice: number, bars: Bar[], minDte = 14): BSTrade {
  const atr = calcBarATR14(bars)
  const strike = roundToStrike(currentPrice)
  const { date: expiration, dte } = nextWeeklyFriday(minDte)
  const entry = Math.max(0.10, atr * 0.4 * Math.sqrt(dte / 14))
  const isCall = signal === 'BUY'
  const t1Stock = isCall ? currentPrice + atr * 1.5 : currentPrice - atr * 1.5
  const t2Stock = isCall ? currentPrice + atr * 3.0 : currentPrice - atr * 3.0
  const t1Intrinsic = Math.max(0, isCall ? t1Stock - strike : strike - t1Stock)
  const t2Intrinsic = Math.max(0, isCall ? t2Stock - strike : strike - t2Stock)
  const t1Premium = t1Intrinsic + entry * 0.3
  const t2Premium = t2Intrinsic + entry * 0.1
  const stopPremium = entry * 0.5
  return { strike, expiration, dte, entry, t1Stock, t2Stock, t1Premium, t2Premium, stopPremium }
}

function fmtBSExpiry(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ─── Seasonality helpers ──────────────────────────────────────────────────────
function getDayOfYearFromMs(ms: number): number {
  const date = new Date(ms)
  const start = new Date(date.getFullYear(), 0, 0)
  return Math.floor((date.getTime() - start.getTime()) / 86400000)
}

function buildSeasonalDailyData(tickerBars: Bar[], spyBars: Bar[]) {
  const spyLookup: Record<number, Bar> = {}
  for (const b of spyBars) if (b.t) spyLookup[b.t] = b

  const dailyGroups: Record<number, number[]> = {}

  for (let i = 1; i < tickerBars.length; i++) {
    const cur = tickerBars[i]
    const prev = tickerBars[i - 1]
    if (!cur.t || !prev.t) continue
    const dayOfYear = getDayOfYearFromMs(cur.t)
    const stockRet = ((cur.c - prev.c) / prev.c) * 100
    const curSpy = spyLookup[cur.t]
    const prevSpy = spyLookup[prev.t]
    if (!curSpy || !prevSpy) continue
    const spyRet = ((curSpy.c - prevSpy.c) / prevSpy.c) * 100
    const rel = stockRet - spyRet
    if (!dailyGroups[dayOfYear]) dailyGroups[dayOfYear] = []
    dailyGroups[dayOfYear].push(rel)
  }

  const result: Array<{ dayOfYear: number; monthName: string; day: number; avgReturn: number }> = []
  for (let d = 1; d <= 365; d++) {
    const arr = dailyGroups[d]
    if (!arr || arr.length === 0) continue
    const avg = arr.reduce((s, v) => s + v, 0) / arr.length
    const rep = new Date(2024, 0, d)
    result.push({
      dayOfYear: d,
      monthName: rep.toLocaleDateString('en-US', { month: 'short' }),
      day: rep.getDate(),
      avgReturn: avg,
    })
  }
  return result
}

function computeSeasonality(tickerBars: Bar[], spyBars: Bar[], signal: 'BUY' | 'SELL'): SeasonalityInfo {
  const daily = buildSeasonalDailyData(tickerBars, spyBars)

  // Sweet spot / Pain point: 50-90 day sliding window
  let bestSS = { startDay: 1, endDay: 50, avgReturn: -999, period: '', totalReturn: 0 }
  let worstPP = { startDay: 1, endDay: 50, avgReturn: 999, period: '', totalReturn: 0 }

  for (let ws = 50; ws <= 90; ws++) {
    for (let sd = 1; sd <= 365 - ws; sd++) {
      const ed = sd + ws - 1
      const win = daily.filter((d) => d.dayOfYear >= sd && d.dayOfYear <= ed)
      if (win.length < Math.floor(ws * 0.8)) continue
      let cum = 0, avg = 0
      for (const d of win) { cum += d.avgReturn; avg += d.avgReturn }
      avg /= win.length
      if (cum > bestSS.totalReturn) {
        const s = daily.find((d) => d.dayOfYear === sd)
        const e = daily.find((d) => d.dayOfYear === ed)
        if (s && e) bestSS = { startDay: sd, endDay: ed, avgReturn: avg, totalReturn: cum, period: `${s.monthName} ${s.day} – ${e.monthName} ${e.day}` }
      }
      if (cum < worstPP.totalReturn) {
        const s = daily.find((d) => d.dayOfYear === sd)
        const e = daily.find((d) => d.dayOfYear === ed)
        if (s && e) worstPP = { startDay: sd, endDay: ed, avgReturn: avg, totalReturn: cum, period: `${s.monthName} ${s.day} – ${e.monthName} ${e.day}` }
      }
    }
  }

  // 30-day sliding window
  let best30 = { startDay: 1, endDay: 30, avgReturn: -999, period: '', returnTotal: 0 }
  let worst30 = { startDay: 1, endDay: 30, avgReturn: 999, period: '', returnTotal: 0 }

  for (let sd = 1; sd <= 365 - 30; sd++) {
    const ed = sd + 29
    const win = daily.filter((d) => d.dayOfYear >= sd && d.dayOfYear <= ed)
    if (win.length < 25) continue
    const avg = win.reduce((s, d) => s + d.avgReturn, 0) / win.length
    if (avg > best30.avgReturn) {
      const s = daily.find((d) => d.dayOfYear === sd)
      const e = daily.find((d) => d.dayOfYear === ed)
      if (s && e) best30 = { startDay: sd, endDay: ed, avgReturn: avg, period: `${s.monthName} ${s.day} – ${e.monthName} ${e.day}`, returnTotal: avg * 30 }
    }
    if (avg < worst30.avgReturn) {
      const s = daily.find((d) => d.dayOfYear === sd)
      const e = daily.find((d) => d.dayOfYear === ed)
      if (s && e) worst30 = { startDay: sd, endDay: ed, avgReturn: avg, period: `${s.monthName} ${s.day} – ${e.monthName} ${e.day}`, returnTotal: avg * 30 }
    }
  }

  const todayDoy = getDayOfYearFromMs(Date.now())
  const inSweetSpot = todayDoy >= bestSS.startDay && todayDoy <= bestSS.endDay
  const inPainPoint = todayDoy >= worstPP.startDay && todayDoy <= worstPP.endDay
  const in30dBullish = todayDoy >= best30.startDay && todayDoy <= best30.endDay
  const in30dBearish = todayDoy >= worst30.startDay && todayDoy <= worst30.endDay

  const seasonallyConfirmed = signal === 'BUY'
    ? (inSweetSpot || in30dBullish)
    : (inPainPoint || in30dBearish)

  return {
    sweetSpot: { period: bestSS.period, totalReturn: bestSS.totalReturn, startDay: bestSS.startDay, endDay: bestSS.endDay },
    painPoint: { period: worstPP.period, totalReturn: worstPP.totalReturn, startDay: worstPP.startDay, endDay: worstPP.endDay },
    best30Day: { period: best30.period, return: best30.returnTotal, startDay: best30.startDay, endDay: best30.endDay },
    worst30Day: { period: worst30.period, return: worst30.returnTotal, startDay: worst30.startDay, endDay: worst30.endDay },
    inSweetSpot, inPainPoint, in30dBullish, in30dBearish, seasonallyConfirmed,
  }
}

function buildResult(symbol: string, bars: Bar[], spyBars: Bar[], thresholdYears: 1 | 3 | 5 | 10 = 3, overrideLookback?: number): ScanResult | null {
  const smoothed = calcSmoothedScores(bars, spyBars)
  if (smoothed.length < 10) return null

  const barsPerYear = 252
  const lookback = Math.min(barsPerYear * thresholdYears, smoothed.length)
  const recent = smoothed.slice(smoothed.length - lookback)

  const sorted = [...recent].sort((a, b) => a - b)
  const top10 = sorted.slice(Math.floor(sorted.length * 0.9))
  const bot10 = sorted.slice(0, Math.ceil(sorted.length * 0.1))

  const avgHighVal =
    top10.length > 0 ? top10.reduce((a, b) => a + b, 0) / top10.length : Math.max(...recent)
  const avgLowVal =
    bot10.length > 0 ? bot10.reduce((a, b) => a + b, 0) / bot10.length : Math.min(...recent)
  const yearlyMin = Math.min(...recent)
  const yearlyMax = Math.max(...recent)
  const n = smoothed.length
  const currentScore = smoothed[n - 1]
  // SPY 20d simple avg (regime filter) at today's bar
  const spyOff = spyBars.length - bars.length
  const spySI = spyOff + n - 1
  const spySlice = spyBars.slice(Math.max(0, spySI - 19), spySI + 1).map(b => b.c)
  const spyEma20 = spySlice.length > 0 ? spySlice.reduce((a, b) => a + b, 0) / spySlice.length : 0
  const spyClose = spySI >= 0 && spySI < spyBars.length ? spyBars[spySI].c : 0
  const spyBull = spyClose > spyEma20
  const spyBear = spyClose < spyEma20 && spyEma20 > 0

  // ── Simple crossover logic ──────────────────────────────────────────
  // BUY:  score was below tLo, crosses back above it
  // SELL: score was above tHi, crosses back below it
  // SELL uses a tighter lookback (must be more recent to reduce false signals)
  const BUY_LOOKBACK = overrideLookback ?? (thresholdYears === 1 ? 1 : thresholdYears === 3 ? 2 : 3)
  const SELL_LOOKBACK = overrideLookback ?? 1  // SELL must be fresh — no old crossovers
  const LOOKBACK = BUY_LOOKBACK
  const skipProximity = overrideLookback != null
  let isBuy = false
  let isSell = false
  let crossBarIdx = -1

  // In loose/override mode use a 252-bar threshold window (matches detectSignal)
  const thresholdWindow = overrideLookback != null ? 252 : barsPerYear * thresholdYears

  for (let offset = 0; offset < LOOKBACK && offset < n - 1; offset++) {
    const ci = n - 1 - offset
    const sc = smoothed[ci]
    const scP = smoothed[ci - 1]

    const tWindow = smoothed.slice(Math.max(0, ci - thresholdWindow), ci)
    if (tWindow.length < 10) continue
    const tSorted = [...tWindow].sort((a, b) => a - b)
    const tHi = tSorted.slice(Math.floor(tSorted.length * 0.9)).reduce((a, b) => a + b, 0) /
      Math.ceil(tSorted.length * 0.1)
    const tLo = tSorted.slice(0, Math.ceil(tSorted.length * 0.1)).reduce((a, b) => a + b, 0) /
      Math.ceil(tSorted.length * 0.1)

    if (!isBuy && offset < BUY_LOOKBACK && scP <= tLo && sc > tLo) {
      isBuy = true
      crossBarIdx = ci
    }

    if (!isSell && offset < SELL_LOOKBACK && scP >= tHi && sc < tHi) {
      isSell = true
      crossBarIdx = ci
    }

    if (isBuy || isSell) break
  }

  // Proximity filter: current score must be within 20% of the zone range from the threshold.
  // Rejects signals where the crossover happened days ago and score has since drifted far away.
  const zoneRange = Math.abs(avgHighVal - avgLowVal) || 1
  const proximityBand = zoneRange * 0.20
  if (!skipProximity) {
    if (isSell && currentScore < avgHighVal - proximityBand) { isSell = false; crossBarIdx = -1 }
    if (isBuy && currentScore > avgLowVal + proximityBand) { isBuy = false; crossBarIdx = -1 }
  }

  // For label/price calcs reference back to the cross bar (or last bar)
  const refIdx = crossBarIdx >= 0 ? crossBarIdx : n - 1
  const priceDrop5 = refIdx >= 5 && bars[refIdx - 5].c > 0
    ? (bars[refIdx].c - bars[refIdx - 5].c) / bars[refIdx - 5].c * 100 : 0

  if (!isBuy && !isSell) return null

  const signal: 'BUY' | 'SELL' = isBuy ? 'BUY' : 'SELL'

  // ── SELL: must be in top 30% of 52-week price range ─────────────────────
  if (signal === 'SELL') {
    const barsFor52w = bars.slice(-252)
    const high52 = Math.max(...barsFor52w.map(b => b.h))
    const low52 = Math.min(...barsFor52w.map(b => b.l))
    const range52 = high52 - low52
    const posInRange = range52 > 0 ? (bars[bars.length - 1].c - low52) / range52 : 0.5
    if (posInRange < 0.70) return null // not in top 30% of 52w range — skip
  }

  // Position label
  let label: ScanResult['label']
  if (signal === 'BUY') {
    label = priceDrop5 <= -5.0 ? 'BELOW YEARLY LOW' : 'JUST BELOW AVERAGE'
  } else {
    label = 'ABOVE AVERAGE'
  }

  const currentPrice = bars[bars.length - 1].c
  const prevPrice = bars[bars.length - 2]?.c || currentPrice
  const priceChangePct = prevPrice > 0 ? ((currentPrice - prevPrice) / prevPrice) * 100 : 0
  const atr14 = calcBarATR14(bars)
  const trade = buildBSTrade(signal, currentPrice, bars)

  // Keep ALL fetched bars so the chart can display the full selected period
  const chartBars = Math.min(barsPerYear * thresholdYears, bars.length)
  return {
    symbol,
    signal,
    score: Math.round(currentScore),
    avgHighVal: Math.round(avgHighVal),
    avgLowVal: Math.round(avgLowVal),
    yearlyMin: Math.round(yearlyMin),
    yearlyMax: Math.round(yearlyMax),
    label,
    currentPrice,
    priceChangePct,
    bars: bars.slice(-chartBars),
    crossBarIdx: Math.max(0, crossBarIdx - Math.max(0, bars.length - chartBars)),
    atr14,
    trade,
    scores: smoothed.slice(-chartBars),
    thresholdYears,
  }
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function BuySellScanner() {
  // chart symbol state removed (popup removed)
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')
  const [confluenceBuyResults, setConfluenceBuyResults] = useState<ConfluenceResult[]>([])
  const [confluenceSellResults, setConfluenceSellResults] = useState<ConfluenceResult[]>([])
  const [earningsMap, setEarningsMap] = useState<Map<string, { date: string; time: string }>>(new Map())

  // ── Fetch earnings calendar (current + next month) on mount ───────────────
  useEffect(() => {
    const now = new Date()
    const months = [
      { year: now.getFullYear(), month: now.getMonth() },
      { year: now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear(), month: (now.getMonth() + 1) % 12 },
    ]
    Promise.all(months.map(({ year, month }) =>
      fetch(`/api/earnings-calendar?year=${year}&month=${month}`).then(r => r.json()).catch(() => ({ success: false }))
    )).then(results => {
      const map = new Map<string, { date: string; time: string }>()
      for (const data of results) {
        if (!data.success || !Array.isArray(data.events)) continue
        for (const ev of data.events) {
          const match = ev.event?.match(/\(([^)]+)\)/)
          if (!match) continue
          const sym = match[1].trim().toUpperCase()
          if (!map.has(sym)) {
            const timing = ev.time === 'Pre-Market' ? 'Pre-Market' : 'After-Hours'
            map.set(sym, { date: ev.date, time: timing })
          }
        }
      }
      setEarningsMap(map)
    })
  }, [])
  const [portfolioOpen, setPortfolioOpen] = useState(false)
  const portfolioRef = useRef<PortfolioRef>(null)
  const [tickerSearch, setTickerSearch] = useState('')
  const [tickerScanning, setTickerScanning] = useState(false)

  // ── Live-ask fetch + addTrade helper ──────────────────────────────────────
  const makeAddHandler = useCallback((payload: Omit<AddTradePayload, 'entryPrice'>) => {
    return async () => {
      const optTicker = buildOptionTicker(payload.symbol, payload.expiration, payload.optionType, payload.strike)
      const liveAsk = await fetchLiveAsk(payload.symbol, optTicker)
      if (liveAsk === null) return // no price, don't add
      portfolioRef.current?.addTrade({ ...payload, entryPrice: liveAsk })
    }
  }, [])
  const [lastScanTime, setLastScanTime] = useState<Date | null>(null)
  const [filterView, setFilterView] = useState<'both' | 'buy' | 'sell'>('both')
  const abortRef = useRef(false)
  // ── Persist TF selection per-symbol so it survives result updates ──
  const confluenceTfSelectionRef = useRef<Map<string, 1 | 5 | 10>>(new Map())
  // ── Bar cache: reuse scan data in modal instead of re-fetching ──
  const barsCacheRef = useRef<Map<string, Bar[]>>(new Map())
  const spyCacheRef = useRef<Bar[]>([])

  // Clear stale results when the threshold period or mode changes \u2014 user must rescan
  useEffect(() => {
    setConfluenceBuyResults([])
    setConfluenceSellResults([])
    setLastScanTime(null)
  }, [])

  const runScan = useCallback(async () => {
    if (scanning) return
    setScanning(true)
    abortRef.current = false
    setConfluenceBuyResults([])
    setConfluenceSellResults([])
    setProgress(0)

    const today = new Date().toISOString().split('T')[0]
    const daysBack = 5600
    const barLimit = 4000
    const from = new Date(Date.now() - daysBack * 86400_000).toISOString().split('T')[0]

    // Pre-fetch SPY
    setProgressLabel('LOADING SPY DATA...')
    barsCacheRef.current.clear()
    let spyBars: Bar[] = []
    try {
      const spyUrl = `https://api.polygon.io/v2/aggs/ticker/SPY/range/1/day/${from}/${today}?adjusted=true&sort=asc&limit=${barLimit}&apikey=${POLYGON_API_KEY}`
      const spyRes = await fetch(spyUrl, { cache: 'no-store' })
      const spyJson = await spyRes.json()
      spyBars = (spyJson.results || []).map((b: any) => ({
        o: b.o,
        h: b.h,
        l: b.l,
        c: b.c,
        v: b.v,
        t: b.t,
      }))
      spyCacheRef.current = spyBars
    } catch {
      // proceed without RS component if SPY fails
    }

    const symbols = [...new Set(TOP_1000_SYMBOLS)]
    const total = symbols.length
    let processed = 0

    for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
      if (abortRef.current) break
      const batch = symbols.slice(i, i + BATCH_SIZE)
      setProgressLabel(`SCANNING ${batch[0]}…  (${processed}/${total})`)

      await Promise.allSettled(
        batch.map(async (sym) => {
          try {
            const res = await fetch(
              `https://api.polygon.io/v2/aggs/ticker/${sym}/range/1/day/${from}/${today}?adjusted=true&sort=asc&limit=${barLimit}&apikey=${POLYGON_API_KEY}`,
              { cache: 'no-store' }
            )
            const json = await res.json()
            const raw: any[] = json.results || []
            if (raw.length < 55) return
            const bars: Bar[] = raw.map((b: any) => ({
              o: b.o,
              h: b.h,
              l: b.l,
              c: b.c,
              v: b.v,
              t: b.t,
            }))

            // Run all 3 timeframes and look for ≥2 agreeing
            // Only include a timeframe if the ticker has enough history for it
            const MIN_BARS: Record<1 | 5 | 10, number> = { 1: 300, 5: 1260, 10: 2520 }
            const tfs: Array<1 | 5 | 10> = [1, 5, 10]
            const tfResults = tfs.map((tf) => {
              const r = bars.length >= MIN_BARS[tf] ? buildResult(sym, bars, spyBars, tf) : null
              return { tf, result: r }
            })
            const hits = tfResults
              .filter((x) => x.result !== null)
              .map((x) => ({ tf: x.tf, signal: x.result!.signal }))

            const buyHits = hits.filter((h) => h.signal === 'BUY')
            const sellHits = hits.filter((h) => h.signal === 'SELL')
            const dominant = buyHits.length >= 2 ? 'BUY' : sellHits.length >= 2 ? 'SELL' : null
            if (!dominant) return

            const dominantHits = dominant === 'BUY' ? buyHits : sellHits
            if (dominantHits.length < 2) return

            // Use the 3yr result for chart display (most balanced), fall back to any
            const allTfResults: Partial<Record<1 | 5 | 10, ScanResult>> = {}
            tfResults.forEach((x) => { if (x.result) allTfResults[x.tf] = x.result })
            const chartResult =
              allTfResults[5] ??
              allTfResults[1] ??
              allTfResults[10]!
            if (!chartResult) return

            const currentPrice = bars[bars.length - 1].c
            const prevPrice = bars[bars.length - 2]?.c || currentPrice
            const priceChangePct = prevPrice > 0 ? ((currentPrice - prevPrice) / prevPrice) * 100 : 0

            // 3-5 week expiry for confluence trades (21 day min → next Friday ≥ 21 days out)
            const confluenceTrade = buildBSTrade(dominant, currentPrice, bars, 21)

            // Seasonality filter: require ≥5 years of data (1260 bars) for reliable results
            if (bars.length < 1260) return
            const seasonality = computeSeasonality(bars, spyBars, dominant)
            if (!seasonality.seasonallyConfirmed) return

            const cr: ConfluenceResult = {
              symbol: sym,
              signal: dominant,
              hitCount: dominantHits.length as 2 | 3,
              hits: dominantHits,
              currentPrice,
              priceChangePct,
              chartResult,
              allTfResults,
              trade: confluenceTrade,
              seasonality,
            }
            barsCacheRef.current.set(sym, bars)
            if (dominant === 'BUY') {
              setConfluenceBuyResults((prev) => {
                const filtered = prev.filter((r) => r.symbol !== sym)
                return [...filtered, cr].sort((a, b) => b.hitCount - a.hitCount || b.chartResult.score - a.chartResult.score)
              })
            } else {
              setConfluenceSellResults((prev) => {
                const filtered = prev.filter((r) => r.symbol !== sym)
                return [...filtered, cr].sort((a, b) => b.hitCount - a.hitCount || a.chartResult.score - b.chartResult.score)
              })
            }
          } catch {
            // skip failed symbol
          }
        })
      )

      processed += batch.length
      setProgress(Math.round((processed / total) * 100))

      // Brief pause between batches to respect rate limits
      if (i + BATCH_SIZE < symbols.length && !abortRef.current) {
        await new Promise((r) => setTimeout(r, 200))
      }
    }

    setScanning(false)
    setProgressLabel('')
    setLastScanTime(new Date())
  }, [scanning])

  const stopScan = () => {
    abortRef.current = true
    setScanning(false)
    setProgressLabel('')
  }

  const runTickerScan = useCallback(async () => {
    const sym = tickerSearch.trim().toUpperCase()
    console.log(`[TickerScan] START sym=${sym} tickerScanning=${tickerScanning} scanning=${scanning}`)
    if (!sym || tickerScanning || scanning) { console.log('[TickerScan] BLOCKED early exit'); return }
    setTickerScanning(true)
    setConfluenceBuyResults([])
    setConfluenceSellResults([])
    setLastScanTime(null)
    try {
      const today = new Date().toISOString().split('T')[0]
      const daysBack = 5600
      const barLimit = 4000
      const from = new Date(Date.now() - daysBack * 86400_000).toISOString().split('T')[0]
      console.log(`[TickerScan] mode=confluence from=${from} to=${today} barLimit=${barLimit}`)

      // Fetch SPY + ticker in parallel
      let spyBars: Bar[] = spyCacheRef.current
      if (!spyBars.length) {
        console.log('[TickerScan] Fetching SPY bars…')
        const spyRes = await fetch(`https://api.polygon.io/v2/aggs/ticker/SPY/range/1/day/${from}/${today}?adjusted=true&sort=asc&limit=${barLimit}&apikey=${POLYGON_API_KEY}`, { cache: 'no-store' })
        const spyJson = await spyRes.json()
        spyBars = (spyJson.results || []).map((b: any) => ({ o: b.o, h: b.h, l: b.l, c: b.c, v: b.v, t: b.t }))
        spyCacheRef.current = spyBars
        console.log(`[TickerScan] SPY bars fetched: ${spyBars.length}`)
      } else {
        console.log(`[TickerScan] SPY bars from cache: ${spyBars.length}`)
      }

      console.log(`[TickerScan] Fetching ${sym} bars…`)
      const tickerRes = await fetch(`https://api.polygon.io/v2/aggs/ticker/${sym}/range/1/day/${from}/${today}?adjusted=true&sort=asc&limit=${barLimit}&apikey=${POLYGON_API_KEY}`, { cache: 'no-store' })
      const tickerJson = await tickerRes.json()
      console.log(`[TickerScan] Polygon response status=${tickerRes.status} resultsCount=${tickerJson.results?.length ?? 0} resultsType=${tickerJson.resultsCount} ticker=${tickerJson.ticker} status=${tickerJson.status}`)
      const raw: any[] = tickerJson.results || []
      if (raw.length < 55) {
        console.log(`[TickerScan] BAIL: not enough bars (${raw.length} < 55)`)
        setTickerScanning(false)
        return
      }
      const bars: Bar[] = raw.map((b: any) => ({ o: b.o, h: b.h, l: b.l, c: b.c, v: b.v, t: b.t }))
      barsCacheRef.current.set(sym, bars)
      console.log(`[TickerScan] bars loaded: ${bars.length}`)

      console.log('[TickerScan] Running CONFLUENCE mode…')
      const MIN_BARS: Record<1 | 5 | 10, number> = { 1: 300, 5: 1260, 10: 2520 }
      const tfs: Array<1 | 5 | 10> = [1, 5, 10]
      const tfResults = tfs.map((tf) => {
        const r = bars.length >= MIN_BARS[tf] ? buildResult(sym, bars, spyBars, tf) : null
        console.log(`[TickerScan] TF=${tf}yr bars=${bars.length} minBars=${MIN_BARS[tf]} result=${r ? r.signal : 'null'}`)
        return { tf, result: r }
      })
      const hits = tfResults.filter((x) => x.result !== null).map((x) => ({ tf: x.tf, signal: x.result!.signal }))
      const buyHits = hits.filter((h) => h.signal === 'BUY')
      const sellHits = hits.filter((h) => h.signal === 'SELL')
      const dominant = buyHits.length >= 2 ? 'BUY' : sellHits.length >= 2 ? 'SELL' : null
      console.log(`[TickerScan] confluence hits=${hits.length} buyHits=${buyHits.length} sellHits=${sellHits.length} dominant=${dominant}`)
      if (dominant) {
        const dominantHits = dominant === 'BUY' ? buyHits : sellHits
        const allTfResults: Partial<Record<1 | 5 | 10, ScanResult>> = {}
        tfResults.forEach((x) => { if (x.result) allTfResults[x.tf] = x.result })
        const chartResult = allTfResults[5] ?? allTfResults[1] ?? allTfResults[10]!
        if (chartResult) {
          const currentPrice = bars[bars.length - 1].c
          const prevPrice = bars[bars.length - 2]?.c || currentPrice
          const priceChangePct = prevPrice > 0 ? ((currentPrice - prevPrice) / prevPrice) * 100 : 0
          const confluenceTrade = buildBSTrade(dominant, currentPrice, bars, 21)
          const seasonality = bars.length >= 1260 ? computeSeasonality(bars, spyBars, dominant) : { seasonallyConfirmed: true, sweetSpot: { period: '', totalReturn: 0, startDay: 0, endDay: 0 }, painPoint: { period: '', totalReturn: 0, startDay: 0, endDay: 0 }, best30Day: { period: '', return: 0, startDay: 0, endDay: 0 }, worst30Day: { period: '', return: 0, startDay: 0, endDay: 0 }, inSweetSpot: false, inPainPoint: false, in30dBullish: false, in30dBearish: false } satisfies SeasonalityInfo
          const cr: ConfluenceResult = { symbol: sym, signal: dominant, hitCount: dominantHits.length as 2 | 3, hits: dominantHits, currentPrice, priceChangePct, chartResult, allTfResults, trade: confluenceTrade, seasonality }
          console.log(`[TickerScan] Setting confluence result: ${dominant}`)
          if (dominant === 'BUY') setConfluenceBuyResults([cr])
          else setConfluenceSellResults([cr])
        }
      }
      setLastScanTime(new Date())
    } catch (err) {
      console.error('[TickerScan] CAUGHT ERROR:', err)
    }
    setTickerScanning(false)
    console.log('[TickerScan] DONE')
  }, [tickerSearch, tickerScanning, scanning])

  const totalFound = confluenceBuyResults.length + confluenceSellResults.length

  // Determine which results to show based on filter
  const visibleBuy = filterView !== 'sell' ? confluenceBuyResults : []
  const visibleSell = filterView !== 'buy' ? confluenceSellResults : []

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#000000',
        color: '#ffffff',
        fontFamily: '"JetBrains Mono", "Courier New", monospace',
        marginRight: portfolioOpen ? 900 : 0,
        transition: 'margin-right 0.2s ease',
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          borderBottom: '2px solid rgba(255,255,255,0.12)',
          padding: '28px 32px 20px 32px',
          background: 'linear-gradient(180deg, #0a0a0a 0%, #000000 100%)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap' }}>
          {/* Title */}
          <div>
            <div
              style={{
                fontSize: '28px',
                fontWeight: '900',
                letterSpacing: '4px',
                textTransform: 'uppercase',
                lineHeight: 1,
              }}
            >
              <span style={{ color: '#00ff00' }}>BUY</span>
              <span style={{ color: '#ffffff', margin: '0 8px' }}>/</span>
              <span style={{ color: '#ff3232' }}>SELL</span>
              <span style={{ color: '#ffffff', marginLeft: '12px' }}>SCANNER</span>
            </div>
            <div
              style={{
                fontSize: '13px',
                fontWeight: '700',
                letterSpacing: '2px',
                color: '#ff8500',
                marginTop: '6px',
                textTransform: 'uppercase',
              }}
            >
              TOP 1000 SYMBOLS · AVG LINE SIGNALS
            </div>
          </div>


          {/* Scan / Stop button */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '16px' }}>
            {lastScanTime && !scanning && (
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: '700',
                  color: '#ff8500',
                  letterSpacing: '1px',
                }}
              >
                LAST SCAN: {lastScanTime.toLocaleTimeString()}
              </div>
            )}

            {scanning && (
              <button
                onClick={stopScan}
                style={{
                  background: 'transparent',
                  border: '2px solid #ff3232',
                  color: '#ff3232',
                  fontSize: '14px',
                  fontWeight: '800',
                  letterSpacing: '2px',
                  padding: '10px 24px',
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                  fontFamily: 'inherit',
                }}
              >
                STOP
              </button>
            )}

            {/* ── Single ticker search ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 0, border: '2px solid rgba(255,255,255,0.18)', background: '#080808' }}>
              <input
                value={tickerSearch}
                onChange={e => setTickerSearch(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && runTickerScan()}
                placeholder="TICKER"
                maxLength={8}
                style={{
                  fontFamily: 'inherit',
                  fontSize: 14,
                  fontWeight: 900,
                  letterSpacing: 2,
                  color: '#ffffff',
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  padding: '10px 12px',
                  width: 90,
                  textTransform: 'uppercase',
                }}
              />
              <button
                onClick={runTickerScan}
                disabled={tickerScanning || scanning || !tickerSearch.trim()}
                style={{
                  fontFamily: 'inherit',
                  fontSize: 12,
                  fontWeight: 900,
                  letterSpacing: 2,
                  padding: '10px 14px',
                  cursor: tickerScanning || scanning || !tickerSearch.trim() ? 'not-allowed' : 'pointer',
                  background: tickerScanning ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.12)',
                  border: 'none',
                  borderLeft: '2px solid rgba(255,255,255,0.18)',
                  color: tickerScanning || !tickerSearch.trim() ? 'rgba(255,255,255,0.3)' : '#ffffff',
                  textTransform: 'uppercase',
                }}
              >
                {tickerScanning ? '…' : 'SCAN'}
              </button>
            </div>

            <button
              onClick={() => setPortfolioOpen((o) => !o)}
              style={{
                background: portfolioOpen
                  ? 'linear-gradient(135deg, #00E5FF 0%, #0099b3 100%)'
                  : 'rgba(0,229,255,0.08)',
                border: portfolioOpen ? '2px solid #00E5FF' : '2px solid rgba(0,229,255,0.3)',
                color: portfolioOpen ? '#000' : '#00E5FF',
                fontSize: '13px',
                fontWeight: '900',
                letterSpacing: '2px',
                padding: '10px 20px',
                cursor: 'pointer',
                textTransform: 'uppercase',
                fontFamily: 'inherit',
              }}
            >
              ◆ PORTFOLIO
            </button>


            <button
              onClick={scanning ? undefined : runScan}
              disabled={scanning}
              style={{
                background: scanning
                  ? 'rgba(255,255,255,0.05)'
                  : 'linear-gradient(135deg, #ff8500 0%, #cc6a00 100%)',
                border: scanning ? '2px solid rgba(255,255,255,0.2)' : '2px solid #ff8500',
                color: scanning ? 'rgba(255,255,255,0.4)' : '#000000',
                fontSize: '15px',
                fontWeight: '900',
                letterSpacing: '2px',
                padding: '12px 32px',
                cursor: scanning ? 'not-allowed' : 'pointer',
                textTransform: 'uppercase',
                fontFamily: 'inherit',
              }}
            >
              {scanning ? 'SCANNING...' : totalFound > 0 ? 'RESCAN' : 'SCAN NOW'}
            </button>
          </div>
        </div>

        {/* Progress bar */}
        {scanning && (
          <div style={{ marginTop: '16px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '6px',
              }}
            >
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: '700',
                  color: '#ff8500',
                  letterSpacing: '1px',
                }}
              >
                {progressLabel}
              </span>
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#ffffff' }}>
                {progress}%
              </span>
            </div>
            <div
              style={{
                height: '6px',
                background: 'rgba(255,255,255,0.1)',
                borderRadius: '3px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${progress}%`,
                  background: 'linear-gradient(90deg, #ff8500, #ffcc00)',
                  transition: 'width 0.3s ease',
                  borderRadius: '3px',
                }}
              />
            </div>
            <div
              style={{
                marginTop: '8px',
                display: 'flex',
                gap: '24px',
                fontSize: '13px',
                fontWeight: '700',
              }}
            >
              <span>
                <span style={{ color: '#00ff00' }}>{confluenceBuyResults.length}</span>
                <span style={{ color: '#ffffff' }}> BUY</span>
              </span>
              <span>
                <span style={{ color: '#ff3232' }}>{confluenceSellResults.length}</span>
                <span style={{ color: '#ffffff' }}> SELL</span>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── Filter tabs + stats ── */}
      {totalFound > 0 && (
        <div
          style={{
            padding: '16px 32px',
            background: '#050505',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            flexWrap: 'wrap',
          }}
        >
          {/* Summary badges */}
          <div
            style={{
              background: 'rgba(0,255,0,0.08)',
              border: '2px solid #00ff00',
              padding: '8px 20px',
              fontSize: '15px',
              fontWeight: '900',
              letterSpacing: '2px',
              color: '#00ff00',
            }}
          >
            {confluenceBuyResults.length} BUY
          </div>
          <div
            style={{
              background: 'rgba(255,50,50,0.08)',
              border: '2px solid #ff3232',
              padding: '8px 20px',
              fontSize: '15px',
              fontWeight: '900',
              letterSpacing: '2px',
              color: '#ff3232',
            }}
          >
            {confluenceSellResults.length} SELL
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
            {(['both', 'buy', 'sell'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilterView(f)}
                style={{
                  background: filterView === f ? '#ff8500' : 'transparent',
                  border: `2px solid ${filterView === f ? '#ff8500' : 'rgba(255,255,255,0.2)'}`,
                  color: filterView === f ? '#000000' : '#ffffff',
                  fontSize: '13px',
                  fontWeight: '800',
                  letterSpacing: '1.5px',
                  padding: '8px 16px',
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                  fontFamily: 'inherit',
                }}
              >
                {f === 'both' ? 'ALL' : f}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {!scanning && totalFound === 0 && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '80px 32px',
            gap: '24px',
          }}
        >
          {/* Legend */}
          <div
            style={{
              display: 'flex',
              gap: '40px',
              marginBottom: '8px',
              flexWrap: 'wrap',
              justifyContent: 'center',
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <div
                style={{
                  width: '120px',
                  height: '4px',
                  background: '#00ff00',
                  margin: '0 auto 8px auto',
                  borderTop: '2px dashed #00ff00',
                }}
              />
              <div
                style={{
                  fontSize: '13px',
                  fontWeight: '700',
                  color: '#00ff00',
                  letterSpacing: '1px',
                }}
              >
                GREEN DOTTED
              </div>
              <div
                style={{ fontSize: '12px', fontWeight: '700', color: '#ffffff', marginTop: '4px' }}
              >
                AVG HIGH LINE
              </div>
              <div
                style={{ fontSize: '11px', fontWeight: '700', color: '#00ff00', marginTop: '2px' }}
              >
                → BUY SIGNAL
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div
                style={{
                  width: '120px',
                  height: '4px',
                  background: '#ff3232',
                  margin: '0 auto 8px auto',
                  borderTop: '2px dashed #ff3232',
                }}
              />
              <div
                style={{
                  fontSize: '13px',
                  fontWeight: '700',
                  color: '#ff3232',
                  letterSpacing: '1px',
                }}
              >
                RED DOTTED
              </div>
              <div
                style={{ fontSize: '12px', fontWeight: '700', color: '#ffffff', marginTop: '4px' }}
              >
                AVG LOW LINE
              </div>
              <div
                style={{ fontSize: '11px', fontWeight: '700', color: '#ff3232', marginTop: '2px' }}
              >
                → SELL SIGNAL
              </div>
            </div>
          </div>

          <div
            style={{
              fontSize: '18px',
              fontWeight: '800',
              color: '#ffffff',
              letterSpacing: '3px',
              textTransform: 'uppercase',
            }}
          >
            PRESS SCAN NOW TO BEGIN
          </div>
          <div
            style={{
              fontSize: '13px',
              fontWeight: '700',
              color: '#ff8500',
              letterSpacing: '1.5px',
              textAlign: 'center',
              lineHeight: 1.8,
            }}
          >
            SCANS TOP 1000 SYMBOLS · USES 1-YEAR DAILY DATA
            <br />
            FINDS STOCKS ABOVE THE GREEN AVERAGE LINE (BUY)
            <br />
            OR BELOW THE RED AVERAGE LINE (SELL)
          </div>
        </div>
      )}

      {/* ── Results grid ── */}
      {totalFound > 0 && (
        <div style={{ padding: '24px 32px 80px 32px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', alignItems: 'start' }}>

          {/* LEFT: BUY section */}
          <div>
            <div
              style={{
                fontSize: '20px',
                fontWeight: '900',
                letterSpacing: '4px',
                color: '#00ff00',
                textTransform: 'uppercase',
                marginBottom: '20px',
                borderLeft: '5px solid #00ff00',
                paddingLeft: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
              }}
            >
              <span>BUY SIGNALS</span>
              <span
                style={{
                  background: '#00ff00',
                  color: '#000000',
                  fontSize: '14px',
                  fontWeight: '900',
                  padding: '2px 12px',
                  letterSpacing: '2px',
                }}
              >
                {visibleBuy.length}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
              {visibleBuy.map((r) => <ConfluenceCard key={r.symbol} result={r} tfSelectionMap={confluenceTfSelectionRef.current} earnings={earningsMap.get(r.symbol)} onAddToPortfolio={makeAddHandler({ symbol: r.symbol, signal: r.signal, optionDesc: `$${r.trade.strike % 1 === 0 ? r.trade.strike.toFixed(0) : r.trade.strike.toFixed(1)} ${r.signal === 'BUY' ? 'Calls' : 'Puts'} ${r.trade.expiration}`, strike: r.trade.strike, expiration: r.trade.expiration, optionType: r.signal === 'BUY' ? 'call' : 'put', score: r.chartResult?.score, label: r.chartResult?.label, currentStockPrice: r.currentPrice, priceChangePct: r.priceChangePct, dte: r.trade.dte, t1Stock: r.trade.t1Stock, t2Stock: r.trade.t2Stock, stopPremium: r.trade.stopPremium, seasonality: r.seasonality ? { sweetSpot: r.seasonality.sweetSpot, painPoint: r.seasonality.painPoint, best30Day: r.seasonality.best30Day, inSweetSpot: r.seasonality.inSweetSpot, inPainPoint: r.seasonality.inPainPoint, seasonallyConfirmed: r.seasonality.seasonallyConfirmed } : undefined })} />)}
              {visibleBuy.length === 0 && (
                <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, fontWeight: 700, letterSpacing: '1px', padding: '20px 0' }}>NO BUY SIGNALS</div>
              )}
            </div>
          </div>

          {/* RIGHT: SELL section */}
          <div>
            <div
              style={{
                fontSize: '20px',
                fontWeight: '900',
                letterSpacing: '4px',
                color: '#ff3232',
                textTransform: 'uppercase',
                marginBottom: '20px',
                borderLeft: '5px solid #ff3232',
                paddingLeft: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
              }}
            >
              <span>SELL / SHORT SIGNALS</span>
              <span
                style={{
                  background: '#ff3232',
                  color: '#000000',
                  fontSize: '14px',
                  fontWeight: '900',
                  padding: '2px 12px',
                  letterSpacing: '2px',
                }}
              >
                {visibleSell.length}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
              {visibleSell.map((r) => <ConfluenceCard key={r.symbol} result={r} tfSelectionMap={confluenceTfSelectionRef.current} earnings={earningsMap.get(r.symbol)} onAddToPortfolio={makeAddHandler({ symbol: r.symbol, signal: r.signal, optionDesc: `$${r.trade.strike % 1 === 0 ? r.trade.strike.toFixed(0) : r.trade.strike.toFixed(1)} ${r.signal === 'BUY' ? 'Calls' : 'Puts'} ${r.trade.expiration}`, strike: r.trade.strike, expiration: r.trade.expiration, optionType: r.signal === 'BUY' ? 'call' : 'put', score: r.chartResult?.score, label: r.chartResult?.label, currentStockPrice: r.currentPrice, priceChangePct: r.priceChangePct, dte: r.trade.dte, t1Stock: r.trade.t1Stock, t2Stock: r.trade.t2Stock, stopPremium: r.trade.stopPremium, seasonality: r.seasonality ? { sweetSpot: r.seasonality.sweetSpot, painPoint: r.seasonality.painPoint, best30Day: r.seasonality.best30Day, inSweetSpot: r.seasonality.inSweetSpot, inPainPoint: r.seasonality.inPainPoint, seasonallyConfirmed: r.seasonality.seasonallyConfirmed } : undefined })} />)}
              {visibleSell.length === 0 && (
                <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, fontWeight: 700, letterSpacing: '1px', padding: '20px 0' }}>NO SELL SIGNALS</div>
              )}
            </div>
          </div>

        </div>
      )}

      {/* ── Portfolio Panel ── */}
      {portfolioOpen && (
        <BuySellPortfolio ref={portfolioRef} onClose={() => setPortfolioOpen(false)} />
      )}


    </div>
  )
}

// ─── Confluence Card ──────────────────────────────────────────────────────────
function ConfluenceCard({ result, tfSelectionMap, earnings, onAddToPortfolio }: { result: ConfluenceResult; tfSelectionMap: Map<string, 1 | 5 | 10>; earnings?: { date: string; time: string }; onAddToPortfolio?: () => void }) {
  const [adding, setAdding] = useState(false)
  const [liveAsk, setLiveAsk] = useState<number | null | 'loading'>('loading')
  const isBuy = result.signal === 'BUY'
  const accent = isBuy ? '#00FF88' : '#FF4060'
  const accentBorder = isBuy ? 'rgba(0,255,136,0.28)' : 'rgba(255,64,96,0.28)'
  const priceColor = result.priceChangePct >= 0 ? '#00FF88' : '#FF4060'

  useEffect(() => {
    const optTicker = buildOptionTicker(result.symbol, result.trade.expiration, result.signal === 'BUY' ? 'call' : 'put', result.trade.strike)
    fetchLiveAsk(result.symbol, optTicker).then(ask => setLiveAsk(ask))
  }, [result.symbol, result.trade.expiration, result.signal, result.trade.strike])

  // Default to 5Y if available, else first available TF — persist selection in parent map
  const defaultTf: 1 | 5 | 10 = result.allTfResults[5] ? 5 : result.allTfResults[1] ? 1 : 10
  const [selectedTf, setSelectedTf] = useState<1 | 5 | 10>(() => tfSelectionMap.get(result.symbol) ?? defaultTf)
  const displayResult = result.allTfResults[selectedTf] ?? result.chartResult

  return (
    <div
      style={{
        background: 'linear-gradient(160deg, #0a0520 0%, #080318 100%)',
        border: `1px solid ${accentBorder}`,
        borderTop: `3px solid ${accent}`,
        borderRadius: 7,
        overflow: 'hidden',
        boxShadow: '0 4px 28px rgba(0,0,0,0.75)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header row — symbol, price, TF buttons, BUY/SELL badge */}
      <div style={{ padding: '10px 14px 8px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 20, fontWeight: 900, letterSpacing: 2, color: '#fff', fontFamily: '"JetBrains Mono",monospace' }}>{result.symbol}</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: priceColor, fontFamily: '"JetBrains Mono",monospace' }}>
          ${result.currentPrice.toFixed(2)}
          <span style={{ fontSize: 12, marginLeft: 4 }}>({result.priceChangePct >= 0 ? '+' : ''}{result.priceChangePct.toFixed(2)}%)</span>
        </span>
        {earnings && (
          <span style={{
            fontFamily: '"JetBrains Mono",monospace',
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: '1px',
            color: '#FFD700',
            background: 'rgba(255,215,0,0.1)',
            border: '1px solid rgba(255,215,0,0.35)',
            borderRadius: 3,
            padding: '2px 7px',
            whiteSpace: 'nowrap',
          }}>
            ⚡ Earnings {earnings.date} · {earnings.time}
          </span>
        )}
        {/* TF switcher buttons removed */}
        <span style={{
          marginLeft: 'auto',
          background: isBuy ? 'rgba(0,255,136,0.15)' : 'rgba(255,64,96,0.15)',
          border: `1px solid ${accent}`,
          color: accent,
          fontSize: 11, fontWeight: 900, letterSpacing: 2, padding: '2px 8px', borderRadius: 3,
          fontFamily: '"JetBrains Mono",monospace',
        }}>{result.signal}</span>
        <button
          onClick={async (e) => {
            e.stopPropagation()
            if (!onAddToPortfolio || adding) return
            setAdding(true)
            await onAddToPortfolio()
            setAdding(false)
          }}
          title="Add to Portfolio"
          disabled={adding}
          style={{
            background: adding ? 'rgba(0,229,255,0.05)' : 'rgba(0,229,255,0.1)',
            border: '1px solid rgba(0,229,255,0.4)',
            color: adding ? 'rgba(0,229,255,0.4)' : '#00E5FF',
            fontSize: 14,
            fontWeight: 900,
            padding: '3px 10px',
            borderRadius: 3,
            cursor: adding ? 'wait' : 'pointer',
            fontFamily: '"JetBrains Mono",monospace',
          }}
        >
          {adding ? '…' : '◆'}
        </button>
      </div>

      {/* Trade row: Strike · Expiry · @entry · T1 · T2 · SL */}
      <div style={{
        padding: '7px 14px',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap',
        background: 'rgba(255,255,255,0.03)',
      }}>
        <span style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 16, fontWeight: 900, color: '#FFFFFF' }}>
          ${result.trade.strike % 1 === 0 ? result.trade.strike.toFixed(0) : result.trade.strike.toFixed(1)} {isBuy ? 'Calls' : 'Puts'}
        </span>
        <span style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 14, fontWeight: 700, color: '#ffffff' }}>
          {fmtBSExpiry(result.trade.expiration)}
        </span>
        <span style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 15, fontWeight: 900, color: '#FFD700' }}>
          {liveAsk === 'loading' ? '@…' : liveAsk === null ? '@---' : `@$${liveAsk.toFixed(2)}`}
        </span>
        <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.15)', alignSelf: 'center', flexShrink: 0 }} />
        <span style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 12, fontWeight: 900, color: accent }}>T1</span>
        <span style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 14, fontWeight: 900, color: accent }}>${result.trade.t1Stock.toFixed(2)}</span>
        <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.15)', alignSelf: 'center', flexShrink: 0 }} />
        <span style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 12, fontWeight: 900, color: accent }}>T2</span>
        <span style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 14, fontWeight: 900, color: accent }}>${result.trade.t2Stock.toFixed(2)}</span>
        <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.15)', alignSelf: 'center', flexShrink: 0 }} />
        <span style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 12, fontWeight: 900, color: '#FF2222' }}>SL</span>
        <span style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 14, fontWeight: 900, color: '#FF2222' }}>${result.trade.stopPremium.toFixed(2)}</span>
      </div>

      {/* Mini chart — switches with selectedTf */}
      {result.seasonality && (
        <SeasonalityRow seasonality={result.seasonality} signal={result.signal} />
      )}
      <div style={{ height: 364, padding: '0 4px 4px' }}>
        <BuySellMiniChart
          bars={displayResult.bars}
          scores={displayResult.scores}
          avgHighVal={displayResult.avgHighVal}
          avgLowVal={displayResult.avgLowVal}
          signal={displayResult.signal}
          crossBarIdx={displayResult.crossBarIdx}
          thresholdYears={displayResult.thresholdYears}
        />
      </div>
    </div>
  )
}

// ─── Inline mini chart ────────────────────────────────────────────────────────
function BuySellMiniChart({
  bars,
  scores,
  avgHighVal,
  avgLowVal,
  signal,
  crossBarIdx,
  thresholdYears,
}: {
  bars: Bar[]
  scores: number[]
  avgHighVal: number
  avgLowVal: number
  signal: 'BUY' | 'SELL'
  crossBarIdx: number
  thresholdYears: 1 | 3 | 5 | 10
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // View: start at most recent data, show last ~120 bars by default (user can zoom out)
  const initVisible = Math.min(120, bars.length)
  const viewRef = useRef({ startIdx: Math.max(0, bars.length - initVisible), visibleCount: initVisible })
  // Crosshair position
  const crosshairRef = useRef<{ x: number; y: number } | null>(null)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || bars.length < 2) return
    const dpr = window.devicePixelRatio || 1
    const W = canvas.offsetWidth
    const H = canvas.offsetHeight
    if (W === 0 || H === 0) return
    canvas.width = W * dpr
    canvas.height = H * dpr
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // ── Layout ────────────────────────────────────────────────────────────
    const PAD_L = 4
    const PAD_R = 80
    const PAD_T = 8
    const PAD_B = 42
    const GAP = 6
    const cW = W - PAD_L - PAD_R
    const totalH = H - PAD_T - PAD_B - GAP
    const PRICE_H = Math.round(totalH * 0.60)   // 60% price
    const SCORE_H = totalH - PRICE_H             // 40% indicator
    const priceT = PAD_T
    const scoreT = PAD_T + PRICE_H + GAP
    const FUTURE = 0

    // Clamp view window — startIdx can extend past the last bar by FUTURE slots
    // so candles are never squeezed; the empty future space sits naturally after them
    const n = bars.length
    let { startIdx, visibleCount } = viewRef.current
    visibleCount = Math.max(FUTURE + 5, Math.min(n + FUTURE, visibleCount))
    const maxStart = Math.max(0, n + FUTURE - visibleCount)
    startIdx = Math.max(0, Math.min(maxStart, startIdx))
    viewRef.current = { startIdx, visibleCount }

    // Only real bars within the viewport (may be fewer than visibleCount at the end)
    const realEnd = Math.min(n, startIdx + visibleCount)
    const visBars = bars.slice(startIdx, realEnd)
    const visScAll = scores.slice(startIdx, realEnd)
    const vc = visBars.length  // actual real bars drawn

    // toX uses visibleCount (total slots) — candles never compressed by future space
    const spacing = cW / Math.max(1, visibleCount)
    const cw = Math.max(1, spacing * 0.75)
    const toX = (i: number) => PAD_L + i * spacing

    // ═══════════════════════════════════════════════════════════════════
    // PRICE PANEL
    // ═══════════════════════════════════════════════════════════════════
    const priceHigh = Math.max(...visBars.map(b => b.h))
    const priceLow = Math.min(...visBars.map(b => b.l))
    const pricePad = (priceHigh - priceLow) * 0.06 || 1
    const pScaleMin = priceLow - pricePad
    const pScaleMax = priceHigh + pricePad
    const pRange = pScaleMax - pScaleMin
    const toYP = (p: number) => priceT + PRICE_H - ((p - pScaleMin) / pRange) * PRICE_H

    ctx.fillStyle = '#000000'
    ctx.fillRect(PAD_L, priceT, cW, PRICE_H)

    ctx.save()
    ctx.beginPath()
    ctx.rect(PAD_L, priceT, cW, PRICE_H)
    ctx.clip()
    visBars.forEach((bar, i) => {
      const isGreen = bar.c >= bar.o
      const color = isGreen ? '#00ff00' : '#ff2222'
      const cx = Math.floor(toX(i))
      const cw2 = Math.max(1, Math.floor(cw))
      const wx = Math.floor(cx + cw2 / 2)
      ctx.strokeStyle = color; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(wx, Math.floor(toYP(bar.h))); ctx.lineTo(wx, Math.floor(toYP(bar.l))); ctx.stroke()
      const bodyTop = Math.floor(Math.min(toYP(bar.o), toYP(bar.c)))
      const bodyH = Math.max(1, Math.ceil(Math.abs(toYP(bar.o) - toYP(bar.c))))
      ctx.fillStyle = color
      ctx.fillRect(cx, bodyTop, cw2, bodyH)
    })
    ctx.restore()

    // Signal marker (adjust for view window)
    const visIdx = crossBarIdx - startIdx
    if (visIdx >= 0 && visIdx < vc) {
      const isBuy = signal === 'BUY'
      const mx = Math.floor(toX(visIdx) + cw / 2)
      const markerY = isBuy
        ? toYP(visBars[visIdx].l) + 14
        : toYP(visBars[visIdx].h) - 14
      const gColor = isBuy ? '#00ff00' : '#ff2222'
      const grad = ctx.createRadialGradient(mx, markerY, 1, mx, markerY, 14)
      grad.addColorStop(0, isBuy ? 'rgba(0,255,0,0.55)' : 'rgba(255,34,34,0.55)')
      grad.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = grad
      ctx.beginPath(); ctx.arc(mx, markerY, 14, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = gColor
      ctx.font = 'bold 12px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(isBuy ? '▲' : '▼', mx, markerY + (isBuy ? 4 : -1))
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.30)'; ctx.lineWidth = 1
    ctx.strokeRect(PAD_L, priceT, cW, PRICE_H)

    ctx.font = 'bold 16px "JetBrains Mono",monospace'
    ctx.textAlign = 'left'
    for (let i = 0; i <= 5; i++) {
      const pv = pScaleMin + (i / 5) * pRange
      const y = toYP(pv)
      if (y < priceT + 2 || y > priceT + PRICE_H - 2) continue
      ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(PAD_L + cW, y); ctx.lineTo(PAD_L + cW + 4, y); ctx.stroke()
      ctx.fillStyle = '#FFFFFF'
      ctx.fillText(`$${pv >= 1000 ? pv.toFixed(0) : pv.toFixed(2)}`, PAD_L + cW + 7, y + 5)
    }
    // Current price — solid orange with black background pill
    const lastBar = visBars[vc - 1]
    const lastY = toYP(lastBar.c)
    if (lastY > priceT + 2 && lastY < priceT + PRICE_H - 2) {
      const priceLbl = `$${lastBar.c >= 1000 ? lastBar.c.toFixed(0) : lastBar.c.toFixed(2)}`
      ctx.font = 'bold 16px "JetBrains Mono",monospace'
      const lblW = ctx.measureText(priceLbl).width + 10
      const lblH = 20
      ctx.fillStyle = '#000000'
      ctx.fillRect(PAD_L + cW + 4, lastY - lblH / 2, lblW, lblH)
      ctx.strokeStyle = '#FF8C00'
      ctx.lineWidth = 1
      ctx.strokeRect(PAD_L + cW + 4, lastY - lblH / 2, lblW, lblH)
      ctx.fillStyle = '#FF8C00'
      ctx.textAlign = 'left'
      ctx.fillText(priceLbl, PAD_L + cW + 9, lastY + 5)
    }

    // ═══════════════════════════════════════════════════════════════════
    // INDICATOR PANEL (40%)
    // ═══════════════════════════════════════════════════════════════════
    const visScores = visScAll.length > 0 ? visScAll : new Array(vc).fill(0)
    const scN = visScores.length
    const scMax = Math.max(...visScores, 1)
    const scMin = Math.min(...visScores, -1)
    const scPad2 = (scMax - scMin) * 0.18 || 5
    const sHi = scMax + scPad2
    const sLo = scMin - scPad2
    const sRng = sHi - sLo
    const toYS = (v: number) => scoreT + SCORE_H - ((v - sLo) / sRng) * SCORE_H

    ctx.fillStyle = '#000000'
    ctx.fillRect(PAD_L, scoreT, cW, SCORE_H)

    ctx.save()
    ctx.beginPath()
    ctx.rect(PAD_L, scoreT, cW, SCORE_H)
    ctx.clip()

    const isBuySig = signal === 'BUY'
    const lineClr = isBuySig ? '#00ff00' : '#ff2222'
    const fillClr = isBuySig ? 'rgba(0,255,0,0.25)' : 'rgba(255,34,34,0.25)'
    const barOff = vc - scN

    ctx.beginPath()
    ctx.moveTo(toX(barOff), scoreT + SCORE_H)
    for (let i = 0; i < scN; i++) ctx.lineTo(toX(i + barOff), toYS(visScores[i]))
    ctx.lineTo(toX(scN - 1 + barOff), scoreT + SCORE_H)
    ctx.closePath()
    ctx.fillStyle = fillClr
    ctx.fill()

    ctx.beginPath()
    ctx.strokeStyle = lineClr; ctx.lineWidth = 2
    ctx.imageSmoothingEnabled = false
    for (let i = 0; i < scN; i++) {
      const x = toX(i + barOff); const y = toYS(visScores[i])
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    }
    ctx.stroke()

    // Green dotted = avgHigh threshold, Red dotted = avgLow threshold
    const ghY = toYS(avgHighVal)
    if (ghY >= scoreT && ghY <= scoreT + SCORE_H) {
      ctx.strokeStyle = '#00ff00'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4])
      ctx.beginPath(); ctx.moveTo(PAD_L, ghY); ctx.lineTo(PAD_L + cW, ghY); ctx.stroke()
      ctx.setLineDash([])
    }
    const rlY = toYS(avgLowVal)
    if (rlY >= scoreT && rlY <= scoreT + SCORE_H) {
      ctx.strokeStyle = '#ff2222'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4])
      ctx.beginPath(); ctx.moveTo(PAD_L, rlY); ctx.lineTo(PAD_L + cW, rlY); ctx.stroke()
      ctx.setLineDash([])
    }
    ctx.restore()

    ctx.strokeStyle = 'rgba(255,255,255,0.30)'; ctx.lineWidth = 1
    ctx.strokeRect(PAD_L, scoreT, cW, SCORE_H)

    // Y-axis labels for avgHigh (green) and avgLow (red) threshold lines
    ctx.font = 'bold 13px "JetBrains Mono",monospace'; ctx.textAlign = 'left'
    if (ghY >= scoreT && ghY <= scoreT + SCORE_H) {
      const lbl = avgHighVal.toFixed(0)
      const lblW = ctx.measureText(lbl).width + 8
      ctx.fillStyle = '#000000'
      ctx.fillRect(PAD_L + cW + 1, ghY - 9, lblW, 18)
      ctx.strokeStyle = '#00ff00'; ctx.lineWidth = 1
      ctx.strokeRect(PAD_L + cW + 1, ghY - 9, lblW, 18)
      ctx.fillStyle = '#00ff00'
      ctx.fillText(lbl, PAD_L + cW + 5, ghY + 4)
    }
    if (rlY >= scoreT && rlY <= scoreT + SCORE_H) {
      const lbl = avgLowVal.toFixed(0)
      const lblW = ctx.measureText(lbl).width + 8
      ctx.fillStyle = '#000000'
      ctx.fillRect(PAD_L + cW + 1, rlY - 9, lblW, 18)
      ctx.strokeStyle = '#ff2222'; ctx.lineWidth = 1
      ctx.strokeRect(PAD_L + cW + 1, rlY - 9, lblW, 18)
      ctx.fillStyle = '#ff2222'
      ctx.fillText(lbl, PAD_L + cW + 5, rlY + 4)
    }

    // Current score — orange boxed label on indicator y-axis
    if (visScores.length > 0) {
      const lastScore = visScores[visScores.length - 1]
      const lastSY = toYS(lastScore)
      if (lastSY >= scoreT && lastSY <= scoreT + SCORE_H) {
        const sLbl = lastScore.toFixed(0)
        const sLblW = ctx.measureText(sLbl).width + 8
        ctx.fillStyle = '#000000'
        ctx.fillRect(PAD_L + cW + 1, lastSY - 9, sLblW, 18)
        ctx.strokeStyle = '#FF8C00'; ctx.lineWidth = 1
        ctx.strokeRect(PAD_L + cW + 1, lastSY - 9, sLblW, 18)
        ctx.fillStyle = '#FF8C00'
        ctx.fillText(sLbl, PAD_L + cW + 5, lastSY + 4)
      }
    }

    ctx.font = 'bold 16px "JetBrains Mono",monospace'; ctx.textAlign = 'left'
    ctx.fillStyle = '#FFFFFF'
    ctx.fillText(isBuySig ? 'BUY' : 'SELL', PAD_L + 5, scoreT + 15)

    // ═══════════════════════════════════════════════════════════════════
    // X-AXIS
    // ═══════════════════════════════════════════════════════════════════
    const axisY = scoreT + SCORE_H
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(PAD_L, axisY); ctx.lineTo(PAD_L + cW, axisY); ctx.stroke()

    ctx.font = 'bold 15px "JetBrains Mono",monospace'; ctx.textAlign = 'center'
    ctx.textBaseline = 'top'

    // Adaptive tick spacing: measure a sample label and ensure minimum pixel gap
    const sampleLbl = '12/31'
    const minPxBetween = ctx.measureText(sampleLbl).width + 24  // min gap between label centres
    // Find a step (in bar units) that gives enough pixel separation
    const pxPerBar = spacing  // pixels per bar slot
    let xstep = Math.max(1, Math.ceil(minPxBetween / pxPerBar))
    // Snap step to a "nice" interval: 1,2,5,10,20,50,100…
    const niceSteps = [1, 2, 5, 10, 20, 50, 100, 200, 500]
    xstep = niceSteps.find(s => s >= xstep) ?? xstep

    const fmtXLbl = (bar: Bar, i: number) =>
      bar.t ? (() => { const d = new Date(bar.t!); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}` })() : `${startIdx + i}`

    const drawTick = (x: number, lbl: string) => {
      const lw = ctx.measureText(lbl).width
      const cx = Math.max(PAD_L + lw / 2 + 2, Math.min(PAD_L + cW - lw / 2 - 2, x))
      ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(cx, axisY); ctx.lineTo(cx, axisY + 4); ctx.stroke()
      ctx.fillStyle = '#FFFFFF'; ctx.fillText(lbl, cx, axisY + 6)
      return { left: cx - lw / 2, right: cx + lw / 2 }
    }

    // Always anchor the last bar label at the right edge
    let lastZone = { left: Infinity, right: Infinity }
    if (vc > 0 && visBars[vc - 1]) {
      const lbl = fmtXLbl(visBars[vc - 1], vc - 1)
      lastZone = drawTick(toX(vc - 1) + cw / 2, lbl)
    }

    // Fill left labels, skip if they collide with previous or the anchored last label
    let prevRight = -Infinity
    for (let bi = 0; bi < vc - 1; bi += xstep) {
      if (!visBars[bi]) continue
      const lbl = fmtXLbl(visBars[bi], bi)
      const lw = ctx.measureText(lbl).width
      const x = toX(bi) + cw / 2
      if (x - lw / 2 < prevRight + 8) continue         // overlaps previous label
      if (x + lw / 2 + 8 > lastZone.left) continue     // would crowd the last label
      const zone = drawTick(x, lbl)
      prevRight = zone.right
    }
    ctx.textBaseline = 'alphabetic'

    // ═══════════════════════════════════════════════════════════════════
    // CROSSHAIR
    // ═══════════════════════════════════════════════════════════════════
    const ch = crosshairRef.current
    if (ch && ch.x >= PAD_L && ch.x <= PAD_L + cW) {
      ctx.save()
      ctx.setLineDash([4, 4])
      ctx.strokeStyle = 'rgba(255,255,255,0.40)'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(Math.round(ch.x) + 0.5, priceT); ctx.lineTo(Math.round(ch.x) + 0.5, axisY); ctx.stroke()
      if (ch.y >= priceT && ch.y <= axisY) {
        ctx.beginPath(); ctx.moveTo(PAD_L, Math.round(ch.y) + 0.5); ctx.lineTo(PAD_L + cW, Math.round(ch.y) + 0.5); ctx.stroke()
      }
      ctx.setLineDash([])
      // Date label on x-axis
      const hIdx = Math.max(0, Math.min(vc - 1, Math.round((ch.x - PAD_L) / (cW / vc))))
      if (visBars[hIdx]?.t) {
        const d = new Date(visBars[hIdx].t!)
        const dLbl = `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`
        ctx.font = 'bold 15px "JetBrains Mono",monospace'
        const dW = ctx.measureText(dLbl).width + 12
        ctx.fillStyle = '#000000'
        ctx.fillRect(Math.round(ch.x) - dW / 2, axisY + 2, dW, 20)
        ctx.fillStyle = '#FF8C00'
        ctx.textAlign = 'center'; ctx.textBaseline = 'top'
        ctx.fillText(dLbl, Math.round(ch.x), axisY + 4)
      }
      // Price label on y-axis
      if (ch.y >= priceT && ch.y <= priceT + PRICE_H) {
        const pAtCursor = pScaleMax - ((ch.y - priceT) / PRICE_H) * pRange
        const pLbl = `$${pAtCursor >= 1000 ? pAtCursor.toFixed(0) : pAtCursor.toFixed(2)}`
        ctx.font = 'bold 16px "JetBrains Mono",monospace'
        const pW = ctx.measureText(pLbl).width + 10
        ctx.fillStyle = '#000000'
        ctx.fillRect(PAD_L + cW + 1, Math.round(ch.y) - 10, pW, 20)
        ctx.fillStyle = '#FF8C00'
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
        ctx.fillText(pLbl, PAD_L + cW + 5, Math.round(ch.y))
      }
      ctx.restore()
    }
  }, [bars, scores, avgHighVal, avgLowVal, signal, crossBarIdx])

  // Reset view when data changes — show last ~120 real bars + FUTURE empty slots at right
  useEffect(() => {
    const FUTURE = 0
    const realVis = Math.min(120, bars.length)
    viewRef.current = {
      startIdx: Math.max(0, bars.length - realVis),
      visibleCount: realVis + FUTURE,
    }
    draw()
  }, [bars, scores, avgHighVal, avgLowVal, signal, crossBarIdx, thresholdYears, draw])

  // Zoom + drag interactions
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || bars.length === 0) return

    const PAD_L = 4; const PAD_R = 80

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      const n = bars.length
      const FUTURE = 0
      const { visibleCount } = viewRef.current
      const factor = e.deltaY > 0 ? 1.12 : 0.89
      let newVC = Math.round(visibleCount * factor)
      newVC = Math.max(FUTURE + 5, Math.min(n + FUTURE, newVC))
      // Always anchor zoom to the right edge (most recent bar stays visible)
      const maxStart = Math.max(0, n + FUTURE - newVC)
      viewRef.current = { startIdx: maxStart, visibleCount: newVC }
      draw()
    }

    let isDragging = false
    let dragStartX = 0
    let dragStartIdx = 0

    const handlePointerDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId)
      isDragging = true
      dragStartX = e.clientX
      dragStartIdx = viewRef.current.startIdx
      canvas.style.cursor = 'grabbing'
    }

    const handlePointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      crosshairRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
      if (isDragging) {
        const { visibleCount } = viewRef.current
        const FUTURE = 0
        const chartW = canvas.offsetWidth - PAD_L - PAD_R
        const delta = Math.round((dragStartX - e.clientX) * (visibleCount / chartW))
        const maxStart = Math.max(0, bars.length + FUTURE - visibleCount)
        const newStart = Math.max(0, Math.min(maxStart, dragStartIdx + delta))
        viewRef.current = { ...viewRef.current, startIdx: newStart }
      }
      draw()
    }

    const handlePointerUp = () => { isDragging = false; canvas.style.cursor = 'grab' }
    const handlePointerLeave = () => { crosshairRef.current = null; draw() }

    canvas.style.cursor = 'grab'
    canvas.addEventListener('wheel', handleWheel, { passive: false })
    canvas.addEventListener('pointerdown', handlePointerDown)
    canvas.addEventListener('pointermove', handlePointerMove)
    canvas.addEventListener('pointerup', handlePointerUp)
    canvas.addEventListener('pointercancel', handlePointerUp)
    canvas.addEventListener('pointerleave', handlePointerLeave)
    return () => {
      canvas.removeEventListener('wheel', handleWheel)
      canvas.removeEventListener('pointerdown', handlePointerDown)
      canvas.removeEventListener('pointermove', handlePointerMove)
      canvas.removeEventListener('pointerup', handlePointerUp)
      canvas.removeEventListener('pointercancel', handlePointerUp)
      canvas.removeEventListener('pointerleave', handlePointerLeave)
    }
  }, [bars, draw])

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', display: 'block', cursor: 'grab' }}
    />
  )
}

// ─── Seasonality Row ──────────────────────────────────────────────────────────
function SeasonalityRow({ seasonality, signal }: { seasonality: SeasonalityInfo; signal: 'BUY' | 'SELL' }) {
  const mono: React.CSSProperties = { fontFamily: '"JetBrains Mono","Courier New",monospace' }
  const isBuy = signal === 'BUY'
  const color = isBuy ? '#00FF88' : '#FF4060'

  const parts: string[] = []
  if (isBuy) {
    if (seasonality.inSweetSpot) parts.push(`SWEET SPOT: ${seasonality.sweetSpot.period}`)
    if (seasonality.in30dBullish) parts.push(`30D BULL: ${seasonality.best30Day.period}`)
  } else {
    if (seasonality.inPainPoint) parts.push(`PAIN POINT: ${seasonality.painPoint.period}`)
    if (seasonality.in30dBearish) parts.push(`30D BEAR: ${seasonality.worst30Day.period}`)
  }

  if (parts.length === 0) return null

  return null
}

// ─── Trade Card ───────────────────────────────────────────────────────────────
function TradeCard({ result, onAddToPortfolio }: { result: ScanResult; onAddToPortfolio?: () => void }) {
  const [adding, setAdding] = useState(false)
  const [liveAsk, setLiveAsk] = useState<number | null | 'loading'>('loading')
  const isBuy = result.signal === 'BUY'
  const accent = isBuy ? '#00FF88' : '#FF4060'

  useEffect(() => {
    const optTicker = buildOptionTicker(result.symbol, result.trade.expiration, result.signal === 'BUY' ? 'call' : 'put', result.trade.strike)
    fetchLiveAsk(result.symbol, optTicker).then(ask => setLiveAsk(ask))
  }, [result.symbol, result.trade.expiration, result.signal, result.trade.strike])
  const accentBorder = isBuy ? 'rgba(0,255,136,0.28)' : 'rgba(255,64,96,0.28)'
  const mono: React.CSSProperties = { fontFamily: '"JetBrains Mono","Courier New",monospace' }
  const priceColor = result.priceChangePct >= 0 ? '#00FF88' : '#FF4060'
  const { trade } = result

  const labelColor =
    result.label === 'BELOW YEARLY LOW'
      ? '#ff3232'
      : result.label === 'JUST BELOW AVERAGE'
        ? '#ff8500'
        : '#00ff00'

  // Use all bars from the selected period — no hardcoded slice
  const barsToShow = result.bars
  const chartCrossIdx = result.crossBarIdx

  return (
    <div
      style={{
        background: 'linear-gradient(160deg, #030d14 0%, #040f18 40%, #030b12 100%)',
        border: `1px solid ${accentBorder}`,
        borderTop: `3px solid ${accent}`,
        borderRadius: 7,
        overflow: 'hidden',
        cursor: 'default',
        boxShadow: '0 4px 28px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255,255,255,0.04)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Row 1: Ticker · price · %chg · BUY/SELL · label */}
      <div
        style={{
          padding: '10px 14px 8px',
          borderBottom: `1px solid rgba(255,255,255,0.06)`,
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <span style={{ ...mono, fontSize: 26, fontWeight: 900, color: accent, letterSpacing: '1px' }}>
          {result.symbol}
        </span>
        <span style={{ ...mono, fontSize: 20, fontWeight: 700, color: '#FFFFFF' }}>
          ${result.currentPrice >= 1000 ? result.currentPrice.toFixed(0) : result.currentPrice.toFixed(2)}
        </span>
        <span style={{ ...mono, fontSize: 16, fontWeight: 700, color: priceColor }}>
          {result.priceChangePct >= 0 ? '+' : ''}{result.priceChangePct.toFixed(2)}%
        </span>
        <div
          style={{
            ...mono, background: accent, color: '#000', fontSize: 14,
            fontWeight: 900, letterSpacing: '2px', padding: '3px 10px', borderRadius: 3,
          }}
        >
          {result.signal}
        </div>
        <span
          style={{
            ...mono, fontSize: 13, fontWeight: 800, letterSpacing: '0.5px',
            color: labelColor, border: `1px solid ${labelColor}55`,
            padding: '2px 7px', borderRadius: 3,
          }}
        >
          {result.label}
        </span>
        <button
          onClick={async (e) => {
            e.stopPropagation()
            if (!onAddToPortfolio || adding) return
            setAdding(true)
            await onAddToPortfolio()
            setAdding(false)
          }}
          title="Add to Portfolio"
          disabled={adding}
          style={{
            ...mono,
            marginLeft: 'auto',
            background: adding ? 'rgba(0,229,255,0.05)' : 'rgba(0,229,255,0.1)',
            border: '1px solid rgba(0,229,255,0.4)',
            color: adding ? 'rgba(0,229,255,0.4)' : '#00E5FF',
            fontSize: 14,
            fontWeight: 900,
            padding: '3px 10px',
            borderRadius: 3,
            cursor: adding ? 'wait' : 'pointer',
            letterSpacing: 1,
          }}
        >
          {adding ? '…' : '◆'}
        </button>
      </div>

      {/* Row 2: Strike · Expiry · @premium · Target#1 · Target#2 · Stop — all on one line */}
      <div
        style={{
          padding: '8px 14px',
          borderBottom: `1px solid rgba(255,255,255,0.05)`,
          display: 'flex',
          alignItems: 'baseline',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <span style={{ ...mono, fontSize: 19, fontWeight: 900, color: '#FFFFFF' }}>
          ${trade.strike % 1 === 0 ? trade.strike.toFixed(0) : trade.strike.toFixed(1)} {isBuy ? 'Calls' : 'Puts'}
        </span>
        <span style={{ ...mono, fontSize: 17, fontWeight: 700, color: '#FFFFFF' }}>
          {fmtBSExpiry(trade.expiration)}
        </span>
        <span style={{ ...mono, fontSize: 17, fontWeight: 900, color: '#FFD080' }}>
          {liveAsk === 'loading' ? '@…' : liveAsk === null ? '@---' : `@$${liveAsk.toFixed(2)}`}
        </span>
        <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.15)', flexShrink: 0, alignSelf: 'center' }} />
        <span style={{ ...mono, fontSize: 14, fontWeight: 900, color: accent, letterSpacing: '0.5px' }}>T1</span>
        <span style={{ ...mono, fontSize: 17, fontWeight: 900, color: accent }}>${trade.t1Stock.toFixed(2)}</span>
        <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.15)', flexShrink: 0, alignSelf: 'center' }} />
        <span style={{ ...mono, fontSize: 14, fontWeight: 900, color: accent, letterSpacing: '0.5px' }}>T2</span>
        <span style={{ ...mono, fontSize: 17, fontWeight: 900, color: accent }}>${trade.t2Stock.toFixed(2)}</span>
        <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.15)', flexShrink: 0, alignSelf: 'center' }} />
        <span style={{ ...mono, fontSize: 14, fontWeight: 900, color: '#FF2222', letterSpacing: '0.5px' }}>SL</span>
        <span style={{ ...mono, fontSize: 17, fontWeight: 900, color: '#FF2222' }}>${trade.stopPremium.toFixed(2)}</span>
      </div>

      {/* Row 3: Chart — 10% taller than before (286px) */}
      {result.seasonality && (
        <SeasonalityRow seasonality={result.seasonality} signal={result.signal} />
      )}
      <div style={{ height: 429, overflow: 'hidden' }}>
        <BuySellMiniChart
          bars={barsToShow}
          scores={result.scores}
          avgHighVal={result.avgHighVal}
          avgLowVal={result.avgLowVal}
          signal={result.signal}
          crossBarIdx={chartCrossIdx}
          thresholdYears={result.thresholdYears}
        />
      </div>
    </div>
  )
}

// ─── Standalone BuySell Indicator Modal ──────────────────────────────────────
function BuySellIndicatorModal({
  symbol,
  result,
  cachedBars,
  cachedSpyBars,
  onClose,
}: {
  symbol: string
  result: ScanResult | null
  cachedBars: Bar[] | null
  cachedSpyBars: Bar[] | null
  onClose: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [loading, setLoading] = useState(!cachedBars)
  const scoresRef = useRef<number[]>([])
  const datesRef = useRef<number[]>([])
  const pricesRef = useRef<{ o: number, h: number, l: number, c: number }[]>([])
  const resultRef = useRef(result)
  resultRef.current = result
  const viewRef = useRef<{ start: number; end: number }>({ start: 0, end: 1260 })
  const dragRef = useRef<{ active: boolean; lastX: number }>({ active: false, lastX: 0 })
  const crosshairRef = useRef<{ visible: boolean; x: number; barIdx: number }>({ visible: false, x: 0, barIdx: -1 })

  // ── Draw function stored in a ref so ResizeObserver can call it ──────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const scores = scoresRef.current
    if (!canvas || scores.length < 2) return

    const dpr = window.devicePixelRatio || 1
    const W = canvas.offsetWidth
    const H = canvas.offsetHeight
    if (W === 0 || H === 0) return

    canvas.width = W * dpr
    canvas.height = H * dpr
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // ── Layout constants ──────────────────────────────────────────────────────
    const PAD_L = 62
    const PAD_R = 72
    const PAD_T = 32   // top margin above price panel
    const GAP = 28   // gap between the two panels (holds divider + labels)
    const PAD_B = 28   // bottom margin below score panel
    const PRICE_H = Math.round((H - PAD_T - GAP - PAD_B) * 0.40)  // 40% price
    const SCORE_H = H - PAD_T - GAP - PAD_B - PRICE_H             // 60% score
    const chartW = W - PAD_L - PAD_R

    // Y origins of each panel
    const priceT = PAD_T
    const scoreT = PAD_T + PRICE_H + GAP

    // Background — solid black
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, W, H)

    const res = resultRef.current
    const totalN = scores.length
    const vw = viewRef.current
    const clStart = Math.max(0, Math.min(vw.start, totalN - 2))
    const clEnd = Math.max(clStart + 2, Math.min(vw.end, totalN))
    if (clStart !== vw.start || clEnd !== vw.end) viewRef.current = { start: clStart, end: clEnd }
    const visible = scores.slice(clStart, clEnd)
    const visibleDates = datesRef.current.slice(clStart, clEnd)
    const visiblePrices = pricesRef.current.slice(clStart, clEnd)
    const n = visible.length
    const FUTURE_BARS = 2  // empty space at right end of both panels

    const toX = (i: number) => PAD_L + (i / (n - 1 + FUTURE_BARS)) * chartW

    // ═══════════════════════════════════════════════════════════════════════
    // PANEL 1 — PRICE  (EFI-exact candlestick rendering)
    // ═══════════════════════════════════════════════════════════════════════
    if (visiblePrices.length >= 2) {
      // Scale: use actual H/L like EFI's adjustedMin/Max + 5% pad
      const priceHigh = Math.max(...visiblePrices.map(b => b.h))
      const priceLow = Math.min(...visiblePrices.map(b => b.l))
      const pricePad = (priceHigh - priceLow) * 0.05 || 1
      const pScaleMin = priceLow - pricePad
      const pScaleMax = priceHigh + pricePad

      // EFI's exact priceToY formula, offset into our panel
      const chartArea = PRICE_H - 25
      const toYP = (price: number) => {
        const ratio = (price - pScaleMin) / (pScaleMax - pScaleMin)
        return priceT + Math.floor(chartArea - ratio * (chartArea - 20) - 10)
      }

      // EFI candleWidth / spacing — match toX scale (n + FUTURE_BARS slots)
      const nc = visiblePrices.length
      const candleSpacing = chartW / (nc - 1 + FUTURE_BARS)
      const candleWidth = Math.max(2, candleSpacing * 0.8)

      // Panel bg tint
      ctx.fillStyle = 'rgba(0,180,255,0.03)'
      ctx.fillRect(PAD_L, priceT, chartW, PRICE_H)

      // Clip to panel so candles never bleed outside
      ctx.save()
      ctx.beginPath()
      ctx.rect(PAD_L, priceT, chartW, PRICE_H)
      ctx.clip()

      // Grid
      ctx.strokeStyle = 'rgba(255,255,255,0.05)'
      ctx.lineWidth = 1
      for (let gi = 0; gi <= 3; gi++) {
        const gy = priceT + (PRICE_H / 3) * gi
        ctx.beginPath(); ctx.moveTo(PAD_L, gy); ctx.lineTo(PAD_L + chartW, gy); ctx.stroke()
      }
      for (let gi = 0; gi <= 6; gi++) {
        const gx = PAD_L + (chartW / 6) * gi
        ctx.beginPath(); ctx.moveTo(gx, priceT); ctx.lineTo(gx, priceT + PRICE_H); ctx.stroke()
      }

      // Draw candlesticks — EFI pixel-perfect logic (drawCandle)
      visiblePrices.forEach((bar, index) => {
        const { o, h, l, c } = bar
        const isGreen = c >= o
        const color = isGreen ? '#00ff00' : '#ff0000'

        const openY = toYP(o)
        const closeY = toYP(c)
        const highY = toYP(h)
        const lowY = toYP(l)

        const crispX = Math.floor(PAD_L + index * candleSpacing)
        const crispWidth = Math.max(1, Math.floor(candleWidth))

        // Wick — always 1px, no +0.5 offset (EFI exact)
        ctx.strokeStyle = color
        ctx.lineWidth = 1
        ctx.beginPath()
        const wickCenterX = Math.floor(crispX + crispWidth / 2)
        ctx.moveTo(wickCenterX, highY)
        ctx.lineTo(wickCenterX, lowY)
        ctx.stroke()

        // Body — centered within candle width with 1px margin each side (EFI exact)
        const bodyH = Math.max(1, Math.abs(closeY - openY))
        const bodyY = Math.min(openY, closeY)
        const bodyWidth = Math.max(2, crispWidth - 2)
        const bodyOffX = Math.floor((crispWidth - bodyWidth) / 2)
        const crispBodyX = crispX + bodyOffX
        const crispBodyY = Math.floor(bodyY)
        const crispBodyW = Math.floor(bodyWidth)
        const crispBodyH = Math.floor(bodyH)

        ctx.fillStyle = color
        ctx.fillRect(crispBodyX, crispBodyY, crispBodyW, crispBodyH)
        ctx.strokeStyle = color
        ctx.lineWidth = 1
        ctx.strokeRect(crispBodyX, crispBodyY, crispBodyW, crispBodyH)
      })

      ctx.restore()

      // Right-axis labels
      const lastBar = visiblePrices[visiblePrices.length - 1]
      const lastClose = lastBar.c
      const priceAxisX = PAD_L + chartW + 6
      ctx.font = 'bold 11px "JetBrains Mono","Courier New",monospace'
      ctx.textAlign = 'left'
      for (const pv of [priceHigh, priceLow]) {
        const py = toYP(pv)
        if (py < priceT + 6 || py > priceT + PRICE_H - 4) continue
        ctx.fillStyle = 'rgba(0,200,255,0.7)'
        ctx.fillText(`$${pv >= 1000 ? pv.toFixed(0) : pv.toFixed(2)}`, priceAxisX, py + 4)
      }
      ctx.font = 'bold 12px "JetBrains Mono","Courier New",monospace'
      ctx.fillStyle = lastBar.c >= lastBar.o ? '#00ff00' : '#ff0000'
      ctx.fillText(
        `$${lastClose >= 1000 ? lastClose.toFixed(0) : lastClose.toFixed(2)}`,
        priceAxisX, toYP(lastClose) + 4
      )
    }

    // Panel border
    ctx.strokeStyle = 'rgba(0,200,255,0.30)'
    ctx.lineWidth = 1
    ctx.strokeRect(PAD_L, priceT, chartW, PRICE_H)

    // Panel title
    ctx.font = 'bold 12px "JetBrains Mono","Courier New",monospace'
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(0,200,255,0.70)'
    ctx.fillText('PRICE', PAD_L + 6, priceT + 14)

    // ── Divider ───────────────────────────────────────────────────────────────
    const divY = priceT + PRICE_H + GAP / 2
    ctx.strokeStyle = 'rgba(255,255,255,0.10)'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.beginPath(); ctx.moveTo(PAD_L, divY); ctx.lineTo(PAD_L + chartW, divY); ctx.stroke()
    ctx.setLineDash([])

    // ═══════════════════════════════════════════════════════════════════════
    // PANEL 2 — SCORE
    // ═══════════════════════════════════════════════════════════════════════
    const avgHighVal = res!.avgHighVal
    const avgLowVal = res!.avgLowVal

    const rawMax = Math.max(...visible)
    const rawMin = Math.min(...visible)
    const rawRange = rawMax - rawMin || 1
    const sPad = rawRange * 0.22
    const paddedMax = rawMax + sPad
    const paddedMin = rawMin - sPad
    const paddedRange = paddedMax - paddedMin

    const toYS = (v: number) => scoreT + SCORE_H - ((v - paddedMin) / paddedRange) * SCORE_H
    const midY = toYS(0)
    const avgHighY = toYS(avgHighVal)
    const avgLowY = toYS(avgLowVal)

    // Panel bg tint
    ctx.fillStyle = 'rgba(0,255,60,0.02)'
    ctx.fillRect(PAD_L, scoreT, chartW, SCORE_H)

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'
    ctx.lineWidth = 1
    for (let i = 0; i <= 4; i++) {
      const y = scoreT + (SCORE_H / 4) * i
      ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(PAD_L + chartW, y); ctx.stroke()
    }
    for (let i = 0; i <= 6; i++) {
      const x = PAD_L + (chartW / 6) * i
      ctx.beginPath(); ctx.moveTo(x, scoreT); ctx.lineTo(x, scoreT + SCORE_H); ctx.stroke()
    }

    // Zone fills
    if (avgHighY > scoreT) { ctx.fillStyle = 'rgba(0,255,0,0.07)'; ctx.fillRect(PAD_L, scoreT, chartW, Math.min(avgHighY - scoreT, SCORE_H)) }
    if (midY > scoreT && avgHighY < midY) { ctx.fillStyle = 'rgba(0,255,0,0.04)'; ctx.fillRect(PAD_L, avgHighY, chartW, midY - avgHighY) }
    if (midY < scoreT + SCORE_H && avgLowY > midY) { ctx.fillStyle = 'rgba(255,50,50,0.04)'; ctx.fillRect(PAD_L, midY, chartW, avgLowY - midY) }
    if (avgLowY < scoreT + SCORE_H) { ctx.fillStyle = 'rgba(255,50,50,0.10)'; ctx.fillRect(PAD_L, avgLowY, chartW, scoreT + SCORE_H - avgLowY) }

    // Zero line
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'
    ctx.lineWidth = 1; ctx.setLineDash([5, 5])
    ctx.beginPath(); ctx.moveTo(PAD_L, midY); ctx.lineTo(PAD_L + chartW, midY); ctx.stroke()
    ctx.setLineDash([])

    // AVG HIGH line
    ctx.strokeStyle = '#00e040'; ctx.lineWidth = 1.5; ctx.setLineDash([8, 5])
    ctx.beginPath(); ctx.moveTo(PAD_L, avgHighY); ctx.lineTo(PAD_L + chartW, avgHighY); ctx.stroke()
    ctx.setLineDash([])
    ctx.font = 'bold 11px "JetBrains Mono","Courier New",monospace'
    ctx.fillStyle = '#00e040'; ctx.textAlign = 'right'
    ctx.fillText(`AVG HIGH  +${Math.round(avgHighVal)}`, PAD_L + chartW - 4, avgHighY - 5)

    // AVG LOW line
    ctx.strokeStyle = '#ff3232'; ctx.lineWidth = 1.5; ctx.setLineDash([8, 5])
    ctx.beginPath(); ctx.moveTo(PAD_L, avgLowY); ctx.lineTo(PAD_L + chartW, avgLowY); ctx.stroke()
    ctx.setLineDash([])
    ctx.font = 'bold 11px "JetBrains Mono","Courier New",monospace'
    ctx.fillStyle = '#ff3232'; ctx.textAlign = 'right'
    ctx.fillText(`AVG LOW  ${Math.round(avgLowVal)}`, PAD_L + chartW - 4, avgLowY + 13)

    // Score line
    for (let i = 1; i < n; i++) {
      const prev = visible[i - 1]
      const curr = visible[i]
      const mid = (prev + curr) / 2
      ctx.strokeStyle = mid >= avgHighVal * 0.85 ? '#00ff00' : mid <= avgLowVal * 0.85 ? '#ff3232' : '#e0e0e0'
      ctx.lineWidth = 2.5; ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(toX(i - 1), toYS(prev))
      ctx.lineTo(toX(i), toYS(curr))
      ctx.stroke()
    }

    // Current score dot
    const lastScore = visible[n - 1]
    const dotColor = lastScore >= avgHighVal ? '#00ff00' : lastScore <= avgLowVal ? '#ff3232' : '#ff8500'
    ctx.beginPath()
    ctx.arc(toX(n - 1), toYS(lastScore), 5, 0, Math.PI * 2)
    ctx.fillStyle = dotColor; ctx.fill()

    // Right Y-axis score labels
    ctx.font = 'bold 13px "JetBrains Mono","Courier New",monospace'
    ctx.textAlign = 'left'
    const yAxisX = PAD_L + chartW + 6
    for (const [v, color] of [
      [rawMax, rawMax > 0 ? '#00ff00' : '#ff3232'],
      [0, '#777777'],
      [rawMin, rawMin < 0 ? '#ff3232' : '#00ff00'],
    ] as [number, string][]) {
      ctx.fillStyle = color
      ctx.fillText(Math.round(v) > 0 ? `+${Math.round(v)}` : `${Math.round(v)}`, yAxisX, toYS(v) + 4)
    }
    ctx.font = 'bold 14px "JetBrains Mono","Courier New",monospace'
    ctx.fillStyle = dotColor
    ctx.fillText(lastScore > 0 ? `+${Math.round(lastScore)}` : `${Math.round(lastScore)}`, yAxisX, toYS(lastScore) + 4)

    // Panel border
    ctx.strokeStyle = 'rgba(0,255,80,0.35)'
    ctx.lineWidth = 1
    ctx.strokeRect(PAD_L, scoreT, chartW, SCORE_H)

    // Panel title
    ctx.font = 'bold 12px "JetBrains Mono","Courier New",monospace'
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(0,255,80,0.65)'
    ctx.fillText('BUY/SELL PRESSURE', PAD_L + 6, scoreT + 14)

    // ── Title bar (top) ───────────────────────────────────────────────────────
    const scoreStr = lastScore > 0 ? `+${Math.round(lastScore)}` : `${Math.round(lastScore)}`
    ctx.font = 'bold 15px "JetBrains Mono","Courier New",monospace'
    ctx.textAlign = 'center'
    ctx.fillStyle = '#ffffff'
    ctx.fillText(`${res?.symbol ?? ''} · SCORE ${scoreStr}`, PAD_L + chartW / 2, PAD_T - 10)

    // ── X-axis date labels (below score panel) ────────────────────────────────
    const NUM_X_TICKS = 7
    const HALF_LABEL = 30
    const xAxisY = scoreT + SCORE_H
    ctx.font = 'bold 14px "JetBrains Mono","Courier New",monospace'
    ctx.fillStyle = '#ffffff'
    for (let t = 0; t < NUM_X_TICKS; t++) {
      const idx = Math.round((t / (NUM_X_TICKS - 1)) * (n - 1))
      const x = toX(idx)
      const ts = visibleDates[idx]
      if (!ts) continue
      const lbl = new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1; ctx.setLineDash([])
      ctx.beginPath(); ctx.moveTo(x, xAxisY); ctx.lineTo(x, xAxisY + 5); ctx.stroke()
      if (x - PAD_L < HALF_LABEL) {
        ctx.textAlign = 'left'; ctx.fillText(lbl, PAD_L, xAxisY + 18)
      } else if (PAD_L + chartW - x < HALF_LABEL) {
        ctx.textAlign = 'right'; ctx.fillText(lbl, PAD_L + chartW, xAxisY + 18)
      } else {
        ctx.textAlign = 'center'; ctx.fillText(lbl, x, xAxisY + 18)
      }
    }

    // ── Crosshair ─────────────────────────────────────────────────────────────
    const ch = crosshairRef.current
    if (ch.visible && ch.barIdx >= 0 && ch.barIdx < n) {
      const cx = toX(ch.barIdx)

      // Vertical line spanning both panels
      ctx.save()
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(cx, priceT)
      ctx.lineTo(cx, scoreT + SCORE_H)
      ctx.stroke()
      ctx.setLineDash([])

      // Horizontal line in price panel at hovered price
      if (visiblePrices.length > ch.barIdx) {
        const bar = visiblePrices[ch.barIdx]
        const priceHigh = Math.max(...visiblePrices.map(b => b.h))
        const priceLow = Math.min(...visiblePrices.map(b => b.l))
        const pricePad = (priceHigh - priceLow) * 0.05 || 1
        const pScaleMin = priceLow - pricePad
        const pScaleMax = priceHigh + pricePad
        const chartAreaP = PRICE_H - 25
        const toYPch = (p: number) => priceT + Math.floor(chartAreaP - ((p - pScaleMin) / (pScaleMax - pScaleMin)) * (chartAreaP - 20) - 10)
        const hoverPrice = bar.c
        const hy = toYPch(hoverPrice)
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'
        ctx.lineWidth = 1
        ctx.setLineDash([4, 4])
        ctx.beginPath(); ctx.moveTo(PAD_L, hy); ctx.lineTo(PAD_L + chartW, hy); ctx.stroke()
        ctx.setLineDash([])
        // Price label on right axis
        const priceLabel = `$${hoverPrice >= 1000 ? hoverPrice.toFixed(0) : hoverPrice.toFixed(2)}`
        ctx.fillStyle = '#000000'
        ctx.fillRect(PAD_L + chartW + 1, hy - 10, PAD_R - 2, 20)
        ctx.fillStyle = '#00dcff'
        ctx.font = 'bold 11px "JetBrains Mono","Courier New",monospace'
        ctx.textAlign = 'left'
        ctx.fillText(priceLabel, PAD_L + chartW + 4, hy + 4)
      }

      // Horizontal line in score panel at hovered score
      if (ch.barIdx < visible.length) {
        const hoverScore = visible[ch.barIdx]
        const rawMax2 = Math.max(...visible)
        const rawMin2 = Math.min(...visible)
        const sPad2 = (rawMax2 - rawMin2) * 0.22 || 1
        const pMax2 = rawMax2 + sPad2
        const pMin2 = rawMin2 - sPad2
        const toYSch = (v: number) => scoreT + SCORE_H - ((v - pMin2) / (pMax2 - pMin2)) * SCORE_H
        const sy = toYSch(hoverScore)
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'
        ctx.lineWidth = 1
        ctx.setLineDash([4, 4])
        ctx.beginPath(); ctx.moveTo(PAD_L, sy); ctx.lineTo(PAD_L + chartW, sy); ctx.stroke()
        ctx.setLineDash([])
        // Score label on right axis
        const scoreLabel = hoverScore > 0 ? `+${Math.round(hoverScore)}` : `${Math.round(hoverScore)}`
        ctx.fillStyle = '#000000'
        ctx.fillRect(PAD_L + chartW + 1, sy - 10, PAD_R - 2, 20)
        ctx.fillStyle = '#ffffff'
        ctx.font = 'bold 11px "JetBrains Mono","Courier New",monospace'
        ctx.textAlign = 'left'
        ctx.fillText(scoreLabel, PAD_L + chartW + 4, sy + 4)
      }

      // Date label below score panel
      const ts = visibleDates[ch.barIdx]
      if (ts) {
        const lbl = new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
        const lblW = ctx.measureText(lbl).width + 10
        const lblX = Math.max(PAD_L, Math.min(PAD_L + chartW - lblW, cx - lblW / 2))
        ctx.fillStyle = 'rgba(40,40,40,0.95)'
        ctx.fillRect(lblX, xAxisY + 2, lblW, 18)
        ctx.fillStyle = '#ffffff'
        ctx.font = 'bold 11px "JetBrains Mono","Courier New",monospace'
        ctx.textAlign = 'left'
        ctx.fillText(lbl, lblX + 5, xAxisY + 14)
      }

      ctx.restore()
    }
  }, [])

  // ── Compute scores (from cache or fresh fetch) ────────────────────────────
  useEffect(() => {
    const compute = (bars: Bar[], spyBars: Bar[]) => {
      const computedScores = calcSmoothedScores(bars, spyBars)
      scoresRef.current = computedScores
      viewRef.current = { start: Math.max(0, computedScores.length - 1260), end: computedScores.length }
      // Store ALL bars so indices align 1:1 with computedScores
      pricesRef.current = bars.map((b) => ({ o: b.o, h: b.h, l: b.l, c: b.c }))
      const hasTs = bars.some((b) => b.t && b.t > 0)
      if (hasTs) {
        datesRef.current = bars.map((b) => b.t ?? 0)
      } else {
        // Bars have no timestamps (old cache); estimate backwards from today
        // 1 trading day ≈ 1.4 calendar days
        const endMs = Date.now()
        datesRef.current = bars.map((_, i) => {
          const daysFromEnd = (bars.length - 1 - i) * 1.4
          return endMs - Math.round(daysFromEnd * 86_400_000)
        })
      }
      setLoading(false)
      // defer draw until after React paints the canvas at full size
      requestAnimationFrame(() => requestAnimationFrame(draw))
    }

    if (cachedBars && cachedBars.length >= 55) {
      const spy = cachedSpyBars ?? []
      compute(cachedBars, spy)
      return
    }

    setLoading(true)
    const today = new Date().toISOString().split('T')[0]
    const from = new Date(Date.now() - 1100 * 86400_000).toISOString().split('T')[0]

    Promise.all([
      fetch(`https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${from}/${today}?adjusted=true&sort=asc&limit=1000&apikey=${POLYGON_API_KEY}`, { cache: 'no-store' }).then((r) => r.json()),
      fetch(`https://api.polygon.io/v2/aggs/ticker/SPY/range/1/day/${from}/${today}?adjusted=true&sort=asc&limit=1000&apikey=${POLYGON_API_KEY}`, { cache: 'no-store' }).then((r) => r.json()),
    ])
      .then(([symJson, spyJson]) => {
        const mapBars = (raw: any[]) => raw.map((b: any) => ({ o: b.o, h: b.h, l: b.l, c: b.c, v: b.v, t: b.t }))
        compute(mapBars(symJson.results || []), mapBars(spyJson.results || []))
      })
      .catch(() => setLoading(false))
  }, [symbol, cachedBars, cachedSpyBars, draw])

  // ── ResizeObserver → redraw on layout change ──────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ro = new ResizeObserver(() => {
      if (scoresRef.current.length > 1) draw()
    })
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [draw])

  // ── Wheel zoom + drag pan ──────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const PL = 14
    const PR = 88

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const all = scoresRef.current
      if (all.length < 2) return
      const { start, end } = viewRef.current
      const count = end - start
      const factor = e.deltaY > 0 ? 1.12 : 0.88
      const newCount = Math.max(20, Math.min(all.length, Math.round(count * factor)))
      // Always anchor zoom to the right edge (most recent bar stays visible)
      const newStart = Math.max(0, all.length - newCount)
      viewRef.current = { start: newStart, end: Math.min(newStart + newCount, all.length) }
      draw()
    }
    const onMouseDown = (e: MouseEvent) => {
      dragRef.current = { active: true, lastX: e.clientX }
      canvas.style.cursor = 'grabbing'
    }
    const onMouseMove = (e: MouseEvent) => {
      if (!dragRef.current.active) return
      const dx = e.clientX - dragRef.current.lastX
      dragRef.current.lastX = e.clientX
      const { start, end } = viewRef.current
      const count = end - start
      const cW = canvas.offsetWidth - PL - PR
      if (cW <= 0 || count <= 1) return
      const barDelta = Math.round((-dx / cW) * count)
      if (barDelta === 0) return
      const all = scoresRef.current
      const newStart = Math.max(0, Math.min(all.length - count, start + barDelta))
      viewRef.current = { start: newStart, end: newStart + count }
      draw()
    }
    const onMouseUp = () => {
      dragRef.current.active = false
      canvas.style.cursor = 'crosshair'
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [draw])

  // ── Crosshair ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const PAD_L = 62, PAD_R = 72, FUTURE_BARS = 2
    const onMove = (e: MouseEvent) => {
      if (dragRef.current.active) return
      const rect = canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const cW = canvas.offsetWidth - PAD_L - PAD_R
      if (cW <= 0) return
      const { start, end } = viewRef.current
      const n = end - start
      const pct = (mx - PAD_L) / cW
      const barIdx = Math.round(pct * (n - 1 + FUTURE_BARS))
      const clampedIdx = Math.max(0, Math.min(n - 1, barIdx))
      crosshairRef.current = { visible: true, x: mx, barIdx: clampedIdx }
      draw()
    }
    const onLeave = () => {
      crosshairRef.current.visible = false
      draw()
    }
    canvas.addEventListener('mousemove', onMove)
    canvas.addEventListener('mouseleave', onLeave)
    return () => {
      canvas.removeEventListener('mousemove', onMove)
      canvas.removeEventListener('mouseleave', onLeave)
    }
  }, [draw])

  const isBuy = result?.signal === 'BUY'
  const accentColor = isBuy ? '#00ff55' : '#ff3232'
  const MONO = '"JetBrains Mono","Courier New",monospace'

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.88)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 'min(960px, 97vw)',
          display: 'flex',
          flexDirection: 'column',
          /* 3D glossy black */
          background: 'linear-gradient(180deg, #060f1e 0%, #040b17 8%, #020810 40%, #010509 100%)',
          /* Glossy green border + outer glow */
          border: `2px solid ${accentColor}`,
          borderRadius: '2px',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Glossy sheen strip at top ── */}
        <div style={{ height: '3px', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent)', pointerEvents: 'none' }} />

        {/* ── Header ── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 24px',
            borderBottom: '1px solid rgba(255,255,255,0.09)',
            background: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, transparent 100%)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <span style={{ fontFamily: MONO, fontSize: '30px', fontWeight: 900, color: '#ffffff', letterSpacing: '4px' }}>
              {symbol}
            </span>
            {result && (
              <span style={{
                background: accentColor,
                color: '#000',
                fontFamily: MONO,
                fontSize: '15px',
                fontWeight: 900,
                letterSpacing: '2px',
                padding: '4px 14px',
              }}>
                {result.signal}
              </span>
            )}
            <span style={{ fontFamily: MONO, fontSize: '13px', fontWeight: 700, color: '#ff8500', letterSpacing: '2px' }}>
              BUY/SELL PRESSURE · 5 YEAR
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.25)',
              color: '#ffffff',
              fontSize: '20px',
              width: '36px',
              height: '36px',
              cursor: 'pointer',
              fontFamily: 'monospace',
              borderRadius: '2px',
            }}
          >
            ✕
          </button>
        </div>

        {/* ── Canvas ── */}
        <div style={{ position: 'relative', height: '840px' }}>
          {loading && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MONO, fontSize: '16px', fontWeight: 700, color: '#ff8500', letterSpacing: '3px' }}>
              LOADING…
            </div>
          )}
          <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', cursor: 'crosshair' }} />
        </div>
      </div>
    </div>
  )
}
