'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// ─── Config ────────────────────────────────────────────────────────────────────
const POLYGON_API_KEY = process.env.NEXT_PUBLIC_POLYGON_API_KEY || ''
const CHART_BARS = 120   // visible candles in chart
const HV_PERIOD_SHORT = 4
const HV_PERIOD_MID = 20
const HV_PERIOD_LONG = 60
const CONTRACT_THRESHOLD = 0.60  // HV4D / HV60D below this = contracting

// ─── Types ────────────────────────────────────────────────────────────────────
type Bar = { t: number; o: number; h: number; l: number; c: number; v: number }

interface ContraEvent {
  barIdx: number        // index into bars[]
  compressionPct: number
}

interface POILevel {
  barIdx: number        // pivot bar index in bars[]
  price: number
  type: 'R' | 'S'      // Resistance or Support
  volRatio: number     // vol / avgVol20 at that bar
}

interface ActivePattern {
  label: string
  context: string
  type: 'BUY' | 'SELL'
}

interface TickerResult {
  ticker: string
  lastClose: number
  todayRet: number
  bars: Bar[]
  // BuySell — thresholds match BuySellScanner exactly
  bsScores: number[]
  bsCurrent: number
  bsAvg1yr: number
  bsAvg3yr: number
  bsAvgHighVal: number   // top-10% avg of scores (BUY threshold, matches BuySellScanner avgHighVal)
  bsAvgLowVal: number    // bottom-10% avg of scores (SELL threshold, matches BuySellScanner avgLowVal)
  bsSignal: 'BUY' | 'SELL' | 'NEUTRAL'
  // HV
  hvArr4: number[]
  hvArr20: number[]
  hvArr60: number[]
  hvCurrent4: number
  hvCurrent60: number
  hvContractPct: number
  isContracting: boolean
  // Contraction + POI
  contraEvents: ContraEvent[]
  poiLevels: POILevel[]
  // Patterns
  activePatterns: ActivePattern[]
  // Combined verdict
  bullVotes: number
  bearVotes: number
  verdict: 'ONE WAY LONG' | 'ONE WAY SHORT' | 'CONTRACTION SETUP' | 'MIXED'
  verdictColor: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function pctile(arr: number[], p: number): number {
  const s = [...arr].filter(v => isFinite(v)).sort((a, b) => a - b)
  if (!s.length) return 0
  const idx = Math.max(0, Math.min(s.length - 1, Math.floor((s.length - 1) * p / 100)))
  return s[idx]
}

// ─── Contraction event scanner (exact StraddleTown logic) ──────────────────
function computeContraEvents(bars: Bar[]): ContraEvent[] {
  const n = bars.length
  if (n < 125) return []

  // Pre-compute rolling 4-day range% for each bar
  const range4D = new Array(n).fill(0)
  for (let i = 4; i < n; i++) {
    let h = bars[i].h, l = bars[i].l
    for (let j = i - 4; j < i; j++) { h = Math.max(h, bars[j].h); l = Math.min(l, bars[j].l) }
    range4D[i] = l > 0 ? ((h - l) / l) * 100 : 0
  }

  // Rolling 120-bar average of range4D = avgHV4D at each bar
  const avgHV4D = new Array(n).fill(0)
  let hvSum = 0
  for (let i = 0; i < n; i++) {
    hvSum += range4D[i]
    if (i >= 120) hvSum -= range4D[i - 120]
    avgHV4D[i] = i >= 4 ? hvSum / Math.min(i + 1, 120) : 0
  }

  const events: ContraEvent[] = []
  let inC = false, peakC = 0, lastIdx = -1

  for (let i = 124; i < n; i++) {
    const avgHV = avgHV4D[i]
    if (!avgHV || avgHV < 1.5) {
      if (inC && lastIdx >= 0) { events.push({ barIdx: lastIdx, compressionPct: peakC }); inC = false; peakC = 0; lastIdx = -1 }
      continue
    }
    // Last 4 bars
    const lb = bars.slice(i - 3, i + 1)
    const high4 = Math.max(...lb.map(b => b.h))
    const low4 = Math.min(...lb.map(b => b.l))
    const rangePercent = low4 > 0 ? ((high4 - low4) / low4) * 100 : 0
    const compressionPct = ((avgHV - rangePercent) / avgHV) * 100
    const netMove = Math.abs(lb[3].c - lb[0].c)
    const currentRange = high4 - low4
    const notTrending = currentRange > 0 ? netMove / currentRange < 0.8 : false
    const avgBarRange = lb.reduce((s, b) => s + (b.h - b.l), 0) / 4
    const curBarTight = avgBarRange > 0 && (lb[3].h - lb[3].l) <= avgBarRange * 2.0
    const qualifies = compressionPct > 40 && notTrending && curBarTight

    if (qualifies) {
      if (!inC) { inC = true; peakC = compressionPct } else if (compressionPct > peakC) peakC = compressionPct
      lastIdx = i
    } else {
      if (inC && lastIdx >= 0) { events.push({ barIdx: lastIdx, compressionPct: peakC }); inC = false; peakC = 0; lastIdx = -1 }
    }
  }
  if (inC && lastIdx >= 0) events.push({ barIdx: lastIdx, compressionPct: peakC })
  return events
}

// ─── POI pivot detector (swing highs/lows as price-level bubbles) ─────────────
// Scans only the last CHART_BARS window so every barIdx maps directly into the
// visible slice — identical to how ST places dark-pool bubbles at cxFn(barIdx).
function computePOILevels(bars: Bar[], chartBars: number): POILevel[] {
  const n = bars.length
  if (n < 30) return []
  const LOOKBACK = 5  // bars each side (smaller so we get more hits in 120-bar window)
  // Only scan within the visible window — need LOOKBACK padding on each side
  const scanStart = Math.max(LOOKBACK, n - chartBars)
  const scanEnd = n - LOOKBACK

  // avgVol20 array (full history for accurate baseline)
  const avgVol20 = new Array(n).fill(0)
  for (let i = 20; i < n; i++) avgVol20[i] = bars.slice(i - 19, i + 1).reduce((s, b) => s + b.v, 0) / 20

  const pois: POILevel[] = []
  for (let i = scanStart; i < scanEnd; i++) {
    const win = bars.slice(i - LOOKBACK, i + LOOKBACK + 1)
    const maxH = Math.max(...win.map(b => b.h))
    const minL = Math.min(...win.map(b => b.l))
    const volRatio = avgVol20[i] > 0 ? bars[i].v / avgVol20[i] : 1
    if (bars[i].h >= maxH) pois.push({ barIdx: i, price: bars[i].h, type: 'R', volRatio })
    if (bars[i].l <= minL) pois.push({ barIdx: i, price: bars[i].l, type: 'S', volRatio })
  }
  // Keep top 10 by volRatio (ST uses top 10 DP days)
  return pois.sort((a, b) => b.volRatio - a.volRatio).slice(0, 10)
}

// ─── Rolling HV ───────────────────────────────────────────────────────────────
function computeRollingHV(bars: Bar[], period: number): number[] {
  const n = bars.length
  const out = new Array(n).fill(0)
  for (let i = period; i < n; i++) {
    const rets: number[] = []
    for (let j = i - period + 1; j <= i; j++) {
      if (bars[j - 1].c > 0) rets.push(Math.log(bars[j].c / bars[j - 1].c))
    }
    if (rets.length < 2) continue
    const mean = rets.reduce((s, r) => s + r, 0) / rets.length
    const variance = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / (rets.length - 1)
    out[i] = Math.sqrt(variance) * Math.sqrt(252) * 100
  }
  return out
}

// ─── BuySell 8-factor score (identical to BuySellScanner.tsx calcSmoothedScores) ─
function calcBSScores(bars: Bar[], spyBars: Bar[]): number[] {
  const n = bars.length
  if (n < 80) return new Array(n).fill(0)

  const closes = bars.map(b => b.c)
  const highs = bars.map(b => b.h)
  const lows = bars.map(b => b.l)
  const vols = bars.map(b => b.v)
  const opens = bars.map(b => b.o)

  const calcEma = (src: number[], period: number): number[] => {
    const k = 2 / (period + 1)
    const out: number[] = [src[0]]
    for (let i = 1; i < src.length; i++) out.push(src[i] * k + out[i - 1] * (1 - k))
    return out
  }

  const atrArr = new Array<number>(n).fill(0)
  for (let i = 1; i < n; i++) {
    const tr = Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]))
    atrArr[i] = i < 14 ? tr : (atrArr[i - 1] * 13) / 14 + tr / 14
  }

  const avgVol20 = new Array<number>(n).fill(0)
  for (let i = 20; i < n; i++)
    avgVol20[i] = vols.slice(i - 19, i + 1).reduce((a, b) => a + b, 0) / 20

  // 1. Wyckoff VSA
  const vsaArr = new Array<number>(n).fill(0)
  for (let i = 5; i < n; i++) {
    const rng = highs[i] - lows[i]
    const atr = atrArr[i] || 1
    const avgV = avgVol20[i] || vols[i] || 1
    const closePos = rng > 0 ? (closes[i] - lows[i]) / rng : 0.5
    const effort = Math.log1p(vols[i] / avgV)
    const spread = rng / atr
    const noSupply = vols[i] < avgV * 0.7 && closes[i] > closes[i - 1] ? 0.6 : 0
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

  // 2. Candle Close Position Persistence
  const closePosArr = bars.map((_, i) => {
    const rng = highs[i] - lows[i]
    return rng > 0 ? (closes[i] - lows[i]) / rng : 0.5
  })
  const cpEma5 = calcEma(closePosArr, 5)
  const cpEma20 = calcEma(closePosArr, 20)
  const ccppScore = new Array<number>(n).fill(0)
  for (let i = 25; i < n; i++) {
    const crossover = (cpEma5[i] - cpEma20[i]) * 200
    const absLevel = (cpEma5[i] - 0.5) * 200
    ccppScore[i] = Math.max(-100, Math.min(100, crossover * 0.65 + absLevel * 0.35))
  }

  // 3. Tail Rejection
  const tailRaw = bars.map((_, i) => {
    const rng = highs[i] - lows[i]
    if (!rng) return 0
    return (closes[i] - lows[i]) / rng - (highs[i] - closes[i]) / rng
  })
  const tailSmooth = calcEma(tailRaw, 7)
  const tailScore = new Array<number>(n).fill(0)
  for (let i = 20; i < n; i++)
    tailScore[i] = Math.max(-100, Math.min(100, tailSmooth[i] * 100))

  // 4. Smart Money Divergence
  const bodyArr = bars.map((_, i) => {
    const rng = highs[i] - lows[i]
    return rng > 0 ? (closes[i] - opens[i]) / rng : 0
  })
  const bodyEma = calcEma(bodyArr, 10)
  const smDivScore = new Array<number>(n).fill(0)
  for (let i = 15; i < n; i++) {
    const priceBias = closes[i] > closes[i - 10] ? 1 : closes[i] < closes[i - 10] ? -1 : 0
    const body = bodyEma[i]
    if (Math.sign(body) !== priceBias && Math.abs(body) > 0.04) {
      smDivScore[i] = Math.max(-100, Math.min(100, body * 500))
    } else {
      smDivScore[i] = Math.max(-100, Math.min(100, body * priceBias * 80))
    }
  }

  // 5. Momentum Deceleration
  const decelScore = new Array<number>(n).fill(0)
  for (let i = 25; i < n; i++) {
    const atr = atrArr[i] || 1
    const mom20 = (closes[i] - closes[i - 20]) / (atr * Math.sqrt(20))
    const mom5 = (closes[i] - closes[i - 5]) / (atr * Math.sqrt(5))
    const mom2 = (closes[i] - closes[i - 2]) / (atr * Math.sqrt(2))
    if (Math.abs(mom20) > 0.15 && Math.sign(mom20) === Math.sign(mom5)) {
      const decel = Math.max(0, 1 - Math.abs(mom2) / (Math.abs(mom5) + 0.01))
      decelScore[i] = Math.max(-100, Math.min(100, -Math.sign(mom20) * decel * 100))
    }
  }

  // 6. Volume-Price Correlation
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
    vpCorrScore[i] = Math.max(-100, Math.min(100, corr * pDir * 100))
  }

  // 7. Absorption
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
      const trend5 = closes[i] - closes[i - 5]
      absRaw[i] = trend5 < 0 ? 1 : trend5 > 0 ? -1 : 0
    }
  }
  const absSmooth = calcEma(absRaw, 5)
  const absScore = absSmooth.map(v => Math.max(-100, Math.min(100, v * 100)))

  // 8. Multi-period RS vs SPY
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

  // Composite + EMA smooth
  const rawScores = bars.map((_, i) => {
    if (i < 63) return 0
    return Math.max(-100, Math.min(100,
      vsaScore[i] * 0.22 + ccppScore[i] * 0.18 + tailScore[i] * 0.14 +
      smDivScore[i] * 0.14 + decelScore[i] * 0.10 + vpCorrScore[i] * 0.10 +
      absScore[i] * 0.08 + rsArr[i] * 0.04
    ))
  })
  const emaK = 2 / 4
  const smoothed: number[] = [rawScores[0]]
  for (let i = 1; i < n; i++) smoothed.push(rawScores[i] * emaK + smoothed[i - 1] * (1 - emaK))
  return smoothed
}

// ─── Active pattern detector (per-stock percentile thresholds, last-bar check) ─
function detectActivePatterns(bars: Bar[]): ActivePattern[] {
  const n = bars.length
  if (n < 252) return []
  const L = n - 1

  const rets = bars.map((b, i) => i === 0 ? 0 : (b.c - bars[i - 1].c) / bars[i - 1].c * 100)
  const gaps = bars.map((b, i) => i === 0 ? 0 : (b.o - bars[i - 1].c) / bars[i - 1].c * 100)
  const vols = bars.map(b => b.v)
  const cpos = bars.map(b => { const r = b.h - b.l; return r > 0 ? (b.c - b.l) / r : 0.5 })

  const retP5 = pctile(rets, 5)
  const retP25 = pctile(rets, 25)
  const retP75 = pctile(rets, 75)
  const retP95 = pctile(rets, 95)
  const gapP5 = pctile(gaps, 5)
  const gapP95 = pctile(gaps, 95)
  const volP5 = pctile(vols, 5)
  const volP95 = pctile(vols, 95)

  // Streak lengths
  const strLens = bars.map((_, i) => {
    if (i === 0) return 0
    let len = 0
    const dir = rets[i] >= 0 ? 1 : -1
    for (let j = i; j >= 1; j--) {
      if ((rets[j] >= 0 ? 1 : -1) === dir) len++
      else break
    }
    return len
  })
  const strP75 = pctile(strLens, 75)

  // DD from ATH
  let ath = bars[0].h
  const dd = bars.map(b => { ath = Math.max(ath, b.h); return (1 - b.c / ath) * 100 })
  const ddP90 = pctile(dd, 90)

  const lRet = rets[L]
  const lGap = gaps[L]
  const lVol = vols[L]
  const lCPos = cpos[L]
  const lDD = dd[L]
  const lStr = strLens[L]

  // Previous streak (before current bar)
  let prevStrLen = 0
  if (L >= 1) {
    const prevDir = rets[L - 1] >= 0 ? 1 : -1
    for (let j = L - 1; j >= 1; j--) {
      if ((rets[j] >= 0 ? 1 : -1) === prevDir) prevStrLen++
      else break
    }
  }

  const patterns: ActivePattern[] = []

  // 1. Fade on no volume — small down day on bottom-5% volume
  if (lVol <= volP5 && lRet < 0 && lRet > retP25) {
    patterns.push({ label: 'FADE ON NO VOLUME', context: `Declining on bottom-5% vol — no conviction behind the selling`, type: 'BUY' })
  }

  // 2. Vol dry-up on up move — rally losing fuel
  if (lVol <= volP5 && lRet > 0 && lRet < retP75) {
    patterns.push({ label: 'DRY-UP UP MOVE', context: `Rising on bottom-5% vol — markup running out of energy`, type: 'SELL' })
  }

  // 3. Buying climax — extreme vol + extreme close high
  if (lVol >= volP95 && lRet >= retP95 && lCPos > 0.75) {
    patterns.push({ label: 'BUYING CLIMAX', context: `Top-5% volume + extreme close near high — potential distribution top`, type: 'SELL' })
  }

  // 4. Selling climax — extreme vol + extreme close low
  if (lVol >= volP95 && lRet <= retP5 && lCPos < 0.25) {
    patterns.push({ label: 'SELLING CLIMAX', context: `Top-5% volume + extreme close near low — capitulation / exhaustion bottom`, type: 'BUY' })
  }

  // 5. Gap down reversal — gapped hard down but closed positive
  if (lGap <= gapP5 && lRet > 0) {
    patterns.push({ label: 'GAP DOWN REVERSAL', context: `Gapped down ≤p5 at open, buyers stepped in — closed positive`, type: 'BUY' })
  }

  // 6. Gap up reversal — gapped hard up but closed negative
  if (lGap >= gapP95 && lRet < 0) {
    patterns.push({ label: 'GAP UP REVERSAL', context: `Gapped up ≥p95 at open, sellers took over — closed negative`, type: 'SELL' })
  }

  // 7. Deep drawdown + extreme bounce day
  if (lDD >= ddP90 && lRet >= retP95) {
    patterns.push({ label: 'DEEP BEAR PANIC BOUNCE', context: `≥p90 drawdown from ATH + extreme up day — potential panic capitulation low`, type: 'BUY' })
  }

  // 8. First up day after extended down streak
  if (lRet > 0 && prevStrLen >= strP75 && rets[L - 1] < 0) {
    patterns.push({ label: 'FIRST UP DAY AFTER EXTENDED DOWN STREAK', context: `Down streak ≥p75 length just reversed — momentum exhaustion`, type: 'BUY' })
  }

  // 9. First down day after extended up streak
  if (lRet < 0 && prevStrLen >= strP75 && rets[L - 1] > 0) {
    patterns.push({ label: 'FIRST DOWN DAY AFTER EXTENDED UP STREAK', context: `Up streak ≥p75 length just reversed — rally exhaustion`, type: 'SELL' })
  }

  // 10. Extreme gap + extreme close in same direction (conviction day)
  if (lGap >= gapP95 && lRet >= retP95 && lCPos > 0.80) {
    patterns.push({ label: 'CONVICTION UP DAY', context: `Gap ≥p95 + close ≥p95 + high in range — institutional buying confirmation`, type: 'BUY' })
  }
  if (lGap <= gapP5 && lRet <= retP5 && lCPos < 0.20) {
    patterns.push({ label: 'CONVICTION DOWN DAY', context: `Gap ≤p5 + close ≤p5 + low in range — institutional selling confirmation`, type: 'SELL' })
  }

  return patterns
}

// ─── Main analysis ────────────────────────────────────────────────────────────
function analyze(ticker: string, bars: Bar[], spyBars: Bar[]): TickerResult {
  const n = bars.length
  const L = n - 1

  const lastClose = bars[L].c
  const todayRet = L > 0 ? (bars[L].c - bars[L - 1].c) / bars[L - 1].c * 100 : 0

  // BuySell
  const bsScores = calcBSScores(bars, spyBars)
  const bsCurrent = bsScores[L]
  const last252 = bsScores.slice(Math.max(0, n - 252))
  const bsAvg1yr = last252.reduce((s, v) => s + v, 0) / (last252.length || 1)
  const last756 = bsScores.slice(Math.max(0, n - 756))
  const bsAvg3yr = last756.reduce((s, v) => s + v, 0) / (last756.length || 1)
  const bsSignal: 'BUY' | 'SELL' | 'NEUTRAL' =
    bsCurrent > bsAvg1yr + 2 ? 'BUY' :
      bsCurrent < bsAvg1yr - 2 ? 'SELL' : 'NEUTRAL'

  // HV
  const hvArr4 = computeRollingHV(bars, HV_PERIOD_SHORT)
  const hvArr20 = computeRollingHV(bars, HV_PERIOD_MID)
  const hvArr60 = computeRollingHV(bars, HV_PERIOD_LONG)
  const hvCurrent4 = hvArr4[L]
  const hvCurrent60 = hvArr60[L]
  const hvRatio = hvCurrent60 > 0 ? hvCurrent4 / hvCurrent60 : 1
  const hvContractPct = Math.max(0, (1 - hvRatio) * 100)
  const isContracting = hvRatio < CONTRACT_THRESHOLD

  // Contraction events + POI
  const contraEvents = computeContraEvents(bars)
  const poiLevels = computePOILevels(bars, CHART_BARS)

  // Patterns
  const activePatterns = detectActivePatterns(bars)
  const patBullVotes = activePatterns.filter(p => p.type === 'BUY').length
  const patBearVotes = activePatterns.filter(p => p.type === 'SELL').length

  // Votes
  const bullVotes = (bsSignal === 'BUY' ? 1 : 0) + Math.min(2, patBullVotes)
  const bearVotes = (bsSignal === 'SELL' ? 1 : 0) + Math.min(2, patBearVotes)

  let verdict: TickerResult['verdict']
  let verdictColor: string
  if (isContracting && bullVotes === bearVotes) {
    verdict = 'CONTRACTION SETUP'; verdictColor = '#ff8c00'
  } else if (bullVotes > bearVotes && bullVotes >= 2) {
    verdict = 'ONE WAY LONG'; verdictColor = '#00ff88'
  } else if (bearVotes > bullVotes && bearVotes >= 2) {
    verdict = 'ONE WAY SHORT'; verdictColor = '#ff3333'
  } else {
    verdict = 'MIXED'; verdictColor = 'rgba(255,255,255,0.4)'
  }

  return {
    ticker, lastClose, todayRet, bars,
    bsScores, bsCurrent, bsAvg1yr, bsAvg3yr, bsSignal,
    hvArr4, hvArr20, hvArr60, hvCurrent4, hvCurrent60, hvContractPct, isContracting,
    contraEvents, poiLevels,
    activePatterns,
    bullVotes, bearVotes, verdict, verdictColor,
  }
}

// ─── Chart component ──────────────────────────────────────────────────────────
function OneWayChart({ result }: { result: TickerResult }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 })
  const dragRef = useRef<{ active: boolean; lastX: number }>({ active: false, lastX: 0 })

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    const W = rect.width
    const H = rect.height
    if (W < 2 || H < 2) return
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const { bars, bsScores, hvArr4, hvArr60, contraEvents, poiLevels } = result
    const n = bars.length
    // viewRef-based slicing for zoom/pan (exactly like BuySellIndicatorModal)
    if (viewRef.current.end === 0) viewRef.current = { start: Math.max(0, n - CHART_BARS), end: n }
    const vw = viewRef.current
    const clStart = Math.max(0, Math.min(vw.start, n - 2))
    const clEnd = Math.max(clStart + 2, Math.min(vw.end, n))
    if (clStart !== vw.start || clEnd !== vw.end) viewRef.current = { start: clStart, end: clEnd }
    const sliceStart = clStart
    const slice = bars.slice(clStart, clEnd)
    const bsSlice = bsScores.slice(clStart, clEnd)
    const hv4Slice = hvArr4.slice(clStart, clEnd)
    const hv60Slice = hvArr60.slice(clStart, clEnd)
    const vis = slice.length
    if (vis === 0) return

    // Layout — identical proportions to StraddleTown
    const PAD = { top: 20, right: 142, bottom: 62, left: 8 }
    const SCORE_H = Math.round(H * 0.18)
    const HV_H = Math.round(H * 0.12)
    const GAP = 4
    const PRICE_H = H - PAD.top - PAD.bottom - SCORE_H - HV_H - GAP * 2
    const PRICE_T = PAD.top
    const SCORE_T = PRICE_T + PRICE_H + GAP
    const HV_T = SCORE_T + SCORE_H + GAP
    const chartW = W - PAD.left - PAD.right
    // INNER padding matches StraddleTown exactly — 18px left+right inside chartW
    const INNER = 18
    const spacing = (chartW - INNER * 2) / Math.max(vis, 1)
    const bw = Math.max(1.5, spacing * 0.62)
    const cxFn = (i: number) => PAD.left + INNER + i * spacing + spacing / 2

    // Background gradient (same as ST)
    const bgGrad = ctx.createLinearGradient(0, 0, 0, H)
    bgGrad.addColorStop(0, '#030a12')
    bgGrad.addColorStop(1, '#000000')
    ctx.fillStyle = bgGrad
    ctx.fillRect(0, 0, W, H)

    // ── Price scale ──────────────────────────────────────────────────────────
    // Include POI prices in range (same as ST)
    const visHighs = slice.map(b => b.h)
    const visLows = slice.map(b => b.l)
    const candleMin = Math.min(...visLows)
    const candleMax = Math.max(...visHighs)
    const candleSpan = candleMax - candleMin
    const poiPrices = poiLevels
      .map(l => l.price)
      .filter(p => p > 0 && p >= candleMin - candleSpan * 0.2 && p <= candleMax + candleSpan * 0.2)
    const rawMin = Math.min(candleMin, ...poiPrices)
    const rawMax = Math.max(candleMax, ...poiPrices)
    const padP = (rawMax - rawMin) * 0.05
    const pMin = rawMin - padP, pMax = rawMax + padP, pRange = pMax - pMin
    const pyFn = (p: number) => PRICE_T + ((pMax - p) / pRange) * PRICE_H
    const toHY = (v: number, hvMax: number) => HV_T + HV_H - (v / (hvMax || 1)) * HV_H

    // ── Grid lines (price) ───────────────────────────────────────────────────
    ctx.lineWidth = 1
    for (let gi = 0; gi <= 5; gi++) {
      const gp = pMin + (gi / 5) * pRange
      const gy = Math.round(pyFn(gp)) + 0.5
      ctx.strokeStyle = gi === 2 || gi === 3 ? 'rgba(0,229,255,0.07)' : 'rgba(255,255,255,0.03)'
      ctx.beginPath(); ctx.moveTo(PAD.left, gy); ctx.lineTo(W - PAD.right, gy); ctx.stroke()
      const label = gp >= 1000 ? gp.toFixed(0) : gp >= 100 ? gp.toFixed(1) : gp.toFixed(2)
      ctx.fillStyle = '#ffffff'; ctx.font = '800 11px "JetBrains Mono",monospace'
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
      ctx.fillText(label, W - PAD.right + 8, gy)
    }

    // Y-axis + X-axis border lines (same as ST)
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(W - PAD.right + 0.5, PAD.top); ctx.lineTo(W - PAD.right + 0.5, PAD.top + PRICE_H); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(PAD.left, PAD.top + PRICE_H + 0.5); ctx.lineTo(W - PAD.right, PAD.top + PRICE_H + 0.5); ctx.stroke()

    // ── POI bubbles (exact ST dark-pool bubble style, colored by R/S) ────────
    const BUBBLE_STYLES_POI = [
      // Resistance: red/orange tiers
      { base: ['rgba(255,80,40,0.75)', 'rgba(200,40,10,0.60)', 'rgba(120,20,0,0.40)'] as [string, string, string], rim: 'rgba(255,100,60,0.80)', dot: 'rgba(255,60,30,0.95)', lw: 1.2 },
      { base: ['rgba(255,120,60,0.70)', 'rgba(200,70,20,0.55)', 'rgba(120,30,0,0.35)'] as [string, string, string], rim: 'rgba(255,140,80,0.75)', dot: 'rgba(240,100,50,0.95)', lw: 1.0 },
      { base: ['rgba(200,60,30,0.60)', 'rgba(150,30,10,0.45)', 'rgba(80,10,0,0.25)'] as [string, string, string], rim: 'rgba(220,80,50,0.65)', dot: 'rgba(190,50,20,0.85)', lw: 0.9 },
    ]
    const BUBBLE_STYLES_SUP = [
      // Support: green tiers
      { base: ['rgba(0,220,120,0.75)', 'rgba(0,160,70,0.60)', 'rgba(0,80,30,0.40)'] as [string, string, string], rim: 'rgba(0,255,140,0.80)', dot: 'rgba(0,200,100,0.95)', lw: 1.2 },
      { base: ['rgba(0,180,100,0.70)', 'rgba(0,130,55,0.55)', 'rgba(0,60,25,0.35)'] as [string, string, string], rim: 'rgba(0,210,120,0.75)', dot: 'rgba(0,170,85,0.95)', lw: 1.0 },
      { base: ['rgba(0,140,70,0.60)', 'rgba(0,100,40,0.45)', 'rgba(0,50,15,0.25)'] as [string, string, string], rim: 'rgba(0,165,80,0.65)', dot: 'rgba(0,130,55,0.85)', lw: 0.9 },
    ]

    // ── POI bubbles — placed at candle bar + price, exactly like ST dark-pool bubbles ──
    const maxVolRatio = poiLevels.length > 0 ? Math.max(...poiLevels.map(l => l.volRatio)) : 1
    ctx.save()
    const allPOI = [...poiLevels].sort((a, b) => b.volRatio - a.volRatio)
    for (let rank = 0; rank < allPOI.length; rank++) {
      const poi = allPOI[rank]
      const visIdx = poi.barIdx - sliceStart
      if (visIdx < 0 || visIdx >= vis) continue
      const cx = cxFn(visIdx)
      const py2 = pyFn(poi.price)
      if (py2 < PAD.top || py2 > PAD.top + PRICE_H) continue
      const r = Math.max(3.5, Math.min(20, Math.sqrt(poi.volRatio / maxVolRatio) * 20))
      // Color: resistance = red tier, support = green tier (same tier positions as ST gold/blue/white)
      const styles = poi.type === 'R' ? BUBBLE_STYLES_POI : BUBBLE_STYLES_SUP
      const s = styles[Math.min(rank < 3 ? rank : 2, styles.length - 1)]
      const bg = ctx.createRadialGradient(cx, py2, r * 0.1, cx, py2, r)
      bg.addColorStop(0, s.base[0])
      bg.addColorStop(0.5, s.base[1])
      bg.addColorStop(1, s.base[2])
      ctx.beginPath(); ctx.arc(cx, py2, r, 0, Math.PI * 2)
      ctx.fillStyle = bg; ctx.fill()
      ctx.strokeStyle = s.rim; ctx.lineWidth = s.lw; ctx.stroke()
      ctx.beginPath(); ctx.arc(cx, py2, Math.max(2, r * 0.17), 0, Math.PI * 2)
      ctx.fillStyle = s.dot; ctx.fill()
    }
    ctx.restore()

    // ── Candles (EFI pixel-perfect, matches BuySellScanner exactly) ─────────
    ctx.save()
    ctx.beginPath(); ctx.rect(PAD.left, PRICE_T, chartW, PRICE_H); ctx.clip()
    for (let i = 0; i < vis; i++) {
      const c = slice[i]
      const isUp = c.c >= c.o
      const color = isUp ? '#00ff00' : '#ff0000'
      // EFI: x from left edge of candle slot, not center
      const crispX = Math.floor(cxFn(i) - bw / 2)
      const crispW = Math.max(1, Math.floor(bw))
      const wickCx = Math.floor(crispX + crispW / 2)
      const highY = Math.floor(pyFn(c.h))
      const lowY = Math.floor(pyFn(c.l))
      const openY = Math.floor(pyFn(c.o))
      const closeY = Math.floor(pyFn(c.c))
      // Wick
      ctx.strokeStyle = color; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(wickCx, highY); ctx.lineTo(wickCx, lowY); ctx.stroke()
      // Body — centered with 1px margin each side (EFI exact)
      const bodyH = Math.max(1, Math.abs(closeY - openY))
      const bodyY = Math.min(openY, closeY)
      const bodyW = Math.max(2, crispW - 2)
      const bodyOffX = Math.floor((crispW - bodyW) / 2)
      ctx.fillStyle = color
      ctx.fillRect(crispX + bodyOffX, bodyY, bodyW, bodyH)
      ctx.strokeStyle = color; ctx.lineWidth = 1
      ctx.strokeRect(crispX + bodyOffX, bodyY, bodyW, bodyH)
    }
    ctx.restore()

    // ── Contraction diamond markers (exact ST style) ──────────────────────────
    // Filter to events visible in the current slice
    const visContra = contraEvents.filter(ev => ev.barIdx >= sliceStart && ev.barIdx < sliceStart + vis)
    const maxComp = visContra.length > 0 ? Math.max(...visContra.map(e => e.compressionPct)) : 100
    ctx.save()
    for (const ev of visContra) {
      const visIdx = ev.barIdx - sliceStart
      const cx = cxFn(visIdx)
      const norm = Math.sqrt(ev.compressionPct / maxComp)
      const r = Math.max(5, Math.min(22, norm * 22))
      const candleLowY = pyFn(slice[visIdx].l)
      const cy = candleLowY + r + 4
      if (cy - r < PAD.top || cy > PAD.top + PRICE_H + r) continue
      const baseG = ctx.createLinearGradient(cx, cy - r, cx, cy + r)
      baseG.addColorStop(0, 'rgba(255,200,60,0.95)')
      baseG.addColorStop(0.5, 'rgba(255,120,0,0.80)')
      baseG.addColorStop(1, 'rgba(180,50,0,0.60)')
      ctx.beginPath()
      ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy)
      ctx.closePath()
      ctx.fillStyle = baseG; ctx.fill()
      ctx.strokeStyle = 'rgba(255,220,80,0.95)'; ctx.lineWidth = 1.5; ctx.stroke()
      // Gloss overlay
      const gloss = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.3, r * 0.05, cx, cy - r * 0.1, r * 0.6)
      gloss.addColorStop(0, 'rgba(255,255,255,0.65)')
      gloss.addColorStop(0.5, 'rgba(255,255,255,0.15)')
      gloss.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.beginPath()
      ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy)
      ctx.closePath(); ctx.fillStyle = gloss; ctx.fill()
      // % label
      const fs = Math.max(9, Math.min(13, r * 0.6))
      ctx.fillStyle = '#fff'; ctx.font = `700 ${fs}px "JetBrains Mono",monospace`
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(`${ev.compressionPct.toFixed(0)}%`, cx, cy)
    }
    ctx.restore()

    // Current price label
    if (n > 0) {
      const py = Math.round(pyFn(bars[n - 1].c)) + 0.5
      ctx.fillStyle = '#FF8C00'; ctx.font = '900 11px "JetBrains Mono",monospace'
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
      ctx.fillText(bars[n - 1].c.toFixed(2), W - PAD.right + 8, py)
    }
    ctx.setLineDash([]); ctx.globalAlpha = 1

    // ── X-axis date labels ────────────────────────────────────────────────────
    const xIdxs = [0, Math.floor(vis * 0.25), Math.floor(vis * 0.5), Math.floor(vis * 0.75), vis - 1]
      .filter((v, i, a) => a.indexOf(v) === i && v < vis)
    ctx.fillStyle = '#ffffff'; ctx.font = '700 9px "JetBrains Mono",monospace'
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    for (const i of xIdxs) {
      const d = new Date(slice[i].t)
      ctx.fillText(`${d.getUTCMonth() + 1}/${d.getUTCDate()}`, cxFn(i), H - PAD.bottom + 6)
    }

    // ── Section dividers ──────────────────────────────────────────────────────
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1; ctx.setLineDash([])
    ctx.beginPath(); ctx.moveTo(PAD.left, SCORE_T); ctx.lineTo(W - PAD.right, SCORE_T); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(PAD.left, HV_T); ctx.lineTo(W - PAD.right, HV_T); ctx.stroke()

    // Section labels
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 9px "JetBrains Mono",monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
    ctx.fillText('BS SCORE', PAD.left + 2, SCORE_T + 10)
    ctx.fillText('VOLATILITY', PAD.left + 2, HV_T + 10)

    // ── BuySell score section — pixel-perfect match to BuySellIndicatorModal ─
    const { bsAvgHighVal, bsAvgLowVal } = result
    const scRawMax = Math.max(...bsSlice)
    const scRawMin = Math.min(...bsSlice)
    const scRawRange = scRawMax - scRawMin || 1
    const sPad = scRawRange * 0.22
    const paddedMax = scRawMax + sPad
    const paddedMin = scRawMin - sPad
    const paddedRange = paddedMax - paddedMin
    const toYS = (v: number) => SCORE_T + SCORE_H - ((v - paddedMin) / paddedRange) * SCORE_H
    const avgHighY = toYS(bsAvgHighVal)
    const avgLowY = toYS(bsAvgLowVal)
    const midY = toYS(0)

    // Panel bg tint
    ctx.fillStyle = 'rgba(0,255,60,0.02)'
    ctx.fillRect(PAD.left, SCORE_T, chartW, SCORE_H)

    ctx.save()
    ctx.beginPath(); ctx.rect(PAD.left, SCORE_T, chartW, SCORE_H); ctx.clip()

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1
    for (let gi = 0; gi <= 4; gi++) {
      const gy = SCORE_T + (SCORE_H / 4) * gi
      ctx.beginPath(); ctx.moveTo(PAD.left, gy); ctx.lineTo(W - PAD.right, gy); ctx.stroke()
    }
    for (let gi = 0; gi <= 6; gi++) {
      const gx = PAD.left + (chartW / 6) * gi
      ctx.beginPath(); ctx.moveTo(gx, SCORE_T); ctx.lineTo(gx, SCORE_T + SCORE_H); ctx.stroke()
    }

    // Zone fills (same 4 zones as BuySellIndicatorModal)
    if (avgHighY > SCORE_T) { ctx.fillStyle = 'rgba(0,255,0,0.07)'; ctx.fillRect(PAD.left, SCORE_T, chartW, Math.min(avgHighY - SCORE_T, SCORE_H)) }
    if (midY > SCORE_T && avgHighY < midY) { ctx.fillStyle = 'rgba(0,255,0,0.04)'; ctx.fillRect(PAD.left, avgHighY, chartW, midY - avgHighY) }
    if (midY < SCORE_T + SCORE_H && avgLowY > midY) { ctx.fillStyle = 'rgba(255,50,50,0.04)'; ctx.fillRect(PAD.left, midY, chartW, avgLowY - midY) }
    if (avgLowY < SCORE_T + SCORE_H) { ctx.fillStyle = 'rgba(255,50,50,0.10)'; ctx.fillRect(PAD.left, avgLowY, chartW, SCORE_T + SCORE_H - avgLowY) }

    // Zero line (dashed)
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1; ctx.setLineDash([5, 5])
    ctx.beginPath(); ctx.moveTo(PAD.left, midY); ctx.lineTo(W - PAD.right, midY); ctx.stroke()
    ctx.setLineDash([])

    // AVG HIGH line + label inside panel
    ctx.strokeStyle = '#00e040'; ctx.lineWidth = 1.5; ctx.setLineDash([8, 5])
    ctx.beginPath(); ctx.moveTo(PAD.left, avgHighY); ctx.lineTo(W - PAD.right, avgHighY); ctx.stroke()
    ctx.setLineDash([])
    ctx.font = 'bold 9px "JetBrains Mono",monospace'; ctx.fillStyle = '#00e040'
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'
    ctx.fillText(`AVG HIGH  +${Math.round(bsAvgHighVal)}`, W - PAD.right - 4, avgHighY - 2)

    // AVG LOW line + label inside panel
    ctx.strokeStyle = '#ff3232'; ctx.lineWidth = 1.5; ctx.setLineDash([8, 5])
    ctx.beginPath(); ctx.moveTo(PAD.left, avgLowY); ctx.lineTo(W - PAD.right, avgLowY); ctx.stroke()
    ctx.setLineDash([])
    ctx.font = 'bold 9px "JetBrains Mono",monospace'; ctx.fillStyle = '#ff3232'
    ctx.textAlign = 'right'; ctx.textBaseline = 'top'
    ctx.fillText(`AVG LOW  ${Math.round(bsAvgLowVal)}`, W - PAD.right - 4, avgLowY + 2)

    // Per-segment score line (green/gray/red based on threshold proximity, exact BS logic)
    for (let idx = 1; idx < vis; idx++) {
      const prev = bsSlice[idx - 1], curr = bsSlice[idx]
      const mid = (prev + curr) / 2
      ctx.strokeStyle = mid >= bsAvgHighVal * 0.85 ? '#00ff00' : mid <= bsAvgLowVal * 0.85 ? '#ff3232' : '#e0e0e0'
      ctx.lineWidth = 2.5; ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(cxFn(idx - 1), toYS(prev))
      ctx.lineTo(cxFn(idx), toYS(curr))
      ctx.stroke()
    }

    // Current score dot
    const lastScore = bsSlice[vis - 1]
    const dotColor = lastScore >= bsAvgHighVal ? '#00ff00' : lastScore <= bsAvgLowVal ? '#ff3232' : '#ff8500'
    ctx.beginPath()
    ctx.arc(cxFn(vis - 1), toYS(lastScore), 5, 0, Math.PI * 2)
    ctx.fillStyle = dotColor; ctx.fill()

    ctx.restore()

    // Panel border
    ctx.strokeStyle = 'rgba(0,255,80,0.35)'; ctx.lineWidth = 1
    ctx.strokeRect(PAD.left, SCORE_T, chartW, SCORE_H)

    // Right Y-axis score labels (scRawMax / 0 / scRawMin)
    const yAxisX = W - PAD.right + 6
    ctx.font = 'bold 10px "JetBrains Mono",monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    for (const [v, clr] of [[scRawMax, scRawMax > 0 ? '#00ff00' : '#ff3232'], [0, '#777'], [scRawMin, scRawMin < 0 ? '#ff3232' : '#00ff00']] as [number, string][]) {
      ctx.fillStyle = clr
      ctx.fillText(Math.round(v) > 0 ? `+${Math.round(v)}` : `${Math.round(v)}`, yAxisX, toYS(v))
    }
    // Current score label (orange, larger)
    ctx.font = 'bold 11px "JetBrains Mono",monospace'; ctx.fillStyle = dotColor
    ctx.fillText(lastScore > 0 ? `+${Math.round(lastScore)}` : `${Math.round(lastScore)}`, yAxisX, toYS(lastScore))

    // Panel title
    ctx.fillStyle = 'rgba(0,255,80,0.65)'; ctx.font = 'bold 9px "JetBrains Mono",monospace'
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
    ctx.fillText('BUY/SELL PRESSURE', PAD.left + 4, SCORE_T + 10)

    // ── HV section ────────────────────────────────────────────────────────────
    const validHV4 = hv4Slice.filter(v => v > 0)
    const validHV60 = hv60Slice.filter(v => v > 0)
    const hvMax = Math.max(...validHV4, ...validHV60, 40) * 1.1

    // Contraction fill
    ctx.fillStyle = 'rgba(255,140,0,0.10)'
    ctx.beginPath(); let hvFill = false
    for (let idx = 0; idx < vis; idx++) {
      const v4 = hv4Slice[idx], v60 = hv60Slice[idx]
      if (v4 <= 0 || v60 <= 0 || v4 >= v60) continue
      if (!hvFill) { ctx.moveTo(cxFn(idx), toHY(v4, hvMax)); hvFill = true } else ctx.lineTo(cxFn(idx), toHY(v4, hvMax))
    }
    if (hvFill) { ctx.lineTo(W - PAD.right, HV_T + HV_H); ctx.lineTo(PAD.left, HV_T + HV_H); ctx.closePath(); ctx.fill() }

    // HV60 baseline
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1; ctx.setLineDash([])
    let hv60s = false; ctx.beginPath()
    for (let idx = 0; idx < vis; idx++) {
      const v = hv60Slice[idx]; if (v <= 0) continue
      if (!hv60s) { ctx.moveTo(cxFn(idx), toHY(v, hvMax)); hv60s = true } else ctx.lineTo(cxFn(idx), toHY(v, hvMax))
    }
    if (hv60s) ctx.stroke()

    // HV4 (orange=contracting, green=normal)
    ctx.lineWidth = 1.8; ctx.setLineDash([])
    let ph4x = 0, ph4y = 0, hv4s = false
    for (let idx = 0; idx < vis; idx++) {
      const v4 = hv4Slice[idx], v60 = hv60Slice[idx]; if (v4 <= 0) continue
      const x = cxFn(idx); const y = toHY(v4, hvMax)
      ctx.strokeStyle = (v60 > 0 && v4 / v60 < CONTRACT_THRESHOLD) ? '#ff8c00' : '#00ff88'
      if (!hv4s) { ph4x = x; ph4y = y; hv4s = true } else {
        ctx.beginPath(); ctx.moveTo(ph4x, ph4y); ctx.lineTo(x, y); ctx.stroke()
        ph4x = x; ph4y = y
      }
    }

    // HV labels
    const lHV4 = hv4Slice[hv4Slice.length - 1]
    const lHV60 = hv60Slice[hv60Slice.length - 1]
    ctx.font = '9px "JetBrains Mono",monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillStyle = '#ff8c00'
    if (lHV4 > 0) ctx.fillText(`HV4  ${lHV4.toFixed(1)}%`, W - PAD.right + 8, Math.max(HV_T + 10, Math.min(HV_T + HV_H - 4, toHY(lHV4, hvMax))))
    ctx.fillStyle = '#ffffff'
    if (lHV60 > 0) ctx.fillText(`HV60 ${lHV60.toFixed(1)}%`, W - PAD.right + 8, Math.max(HV_T + 10, Math.min(HV_T + HV_H - 4, toHY(lHV60, hvMax) + 14)))

  }, [result])

  // Reset view to last CHART_BARS whenever result (ticker) changes
  useEffect(() => {
    const n = result.bars.length
    viewRef.current = { start: Math.max(0, n - CHART_BARS), end: n }
    draw()
  }, [result, draw])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ro = new ResizeObserver(() => draw())
    ro.observe(canvas.parentElement!)
    return () => ro.disconnect()
  }, [draw])

  // ── Wheel zoom + drag pan (exact BuySellIndicatorModal logic) ─────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const n = result.bars.length
      const { start, end } = viewRef.current
      const count = end - start
      const factor = e.deltaY > 0 ? 1.12 : 0.88
      const newCount = Math.max(20, Math.min(n, Math.round(count * factor)))
      const newStart = Math.max(0, n - newCount)
      viewRef.current = { start: newStart, end: Math.min(newStart + newCount, n) }
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
      const cW = canvas.offsetWidth - 8 - 142  // PAD.left - PAD.right
      if (cW <= 0 || count <= 1) return
      const barDelta = Math.round((-dx / cW) * count)
      if (barDelta === 0) return
      const n = result.bars.length
      const newStart = Math.max(0, Math.min(n - count, start + barDelta))
      viewRef.current = { start: newStart, end: newStart + count }
      draw()
    }
    const onMouseUp = () => {
      dragRef.current.active = false
      canvas.style.cursor = 'default'
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
  }, [draw, result])

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', display: 'block' }}
    />
  )
}

// ─── Per-ticker card ──────────────────────────────────────────────────────────
function OneWayCard({ ticker, onRemove }: { ticker: string; onRemove: () => void }) {
  const [result, setResult] = useState<TickerResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingPhase, setLoadingPhase] = useState('')
  const [error, setError] = useState<string | null>(null)

  const mono: React.CSSProperties = { fontFamily: "'JetBrains Mono', 'Consolas', monospace" }

  // yield to React so the loading phase label re-renders before heavy sync work
  const tick = () => new Promise<void>(r => setTimeout(r, 0))

  const load = useCallback(async () => {
    setLoading(true); setError(null); setResult(null)

    try {
      const today = new Date().toISOString().split('T')[0]
      const fromDate = new Date()
      fromDate.setFullYear(fromDate.getFullYear() - 6)
      const from = fromDate.toISOString().split('T')[0]
      const limit = 1600

      setLoadingPhase('FETCHING MARKET DATA...')
      const [tickerRes, spyRes] = await Promise.all([
        fetch(`https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/1/day/${from}/${today}?adjusted=true&sort=asc&limit=${limit}&apikey=${POLYGON_API_KEY}`, { cache: 'no-store' }),
        fetch(`https://api.polygon.io/v2/aggs/ticker/SPY/range/1/day/${from}/${today}?adjusted=true&sort=asc&limit=${limit}&apikey=${POLYGON_API_KEY}`, { cache: 'no-store' }),
      ])
      const [tj, sj] = await Promise.all([tickerRes.json(), spyRes.json()])

      const toBar = (r: { t: number; o: number; h: number; l: number; c: number; v: number }): Bar => ({ t: r.t, o: r.o, h: r.h, l: r.l, c: r.c, v: r.v })
      const bars: Bar[] = (tj.results ?? []).filter((r: { c: number }) => r.c > 0).map(toBar)
      const spyBars: Bar[] = (sj.results ?? []).filter((r: { c: number }) => r.c > 0).map(toBar)

      if (bars.length < 252) { setError(`Not enough data (${bars.length} bars — need at least 252)`); return }

      const n = bars.length
      const L = n - 1

      setLoadingPhase('COMPUTING MICROSTRUCTURE SCORE...'); await tick()
      const bsScores = calcBSScores(bars, spyBars)
      const bsCurrent = bsScores[L]
      const last252 = bsScores.slice(Math.max(0, n - 252))
      const bsAvg1yr = last252.reduce((s, v) => s + v, 0) / (last252.length || 1)
      const last756 = bsScores.slice(Math.max(0, n - 756))
      const bsAvg3yr = last756.reduce((s, v) => s + v, 0) / (last756.length || 1)
      // Threshold logic matching BuySellScanner buildResult exactly
      // Use 3-year window (756 bars), top-10% avg = BUY threshold, bottom-10% avg = SELL threshold
      const bsWindow = bsScores.slice(Math.max(0, n - 756))
      const bsSorted = [...bsWindow].sort((a, b) => a - b)
      const top10 = bsSorted.slice(Math.floor(bsSorted.length * 0.9))
      const bot10 = bsSorted.slice(0, Math.ceil(bsSorted.length * 0.1))
      const bsAvgHighVal = top10.length > 0 ? top10.reduce((a, b) => a + b, 0) / top10.length : Math.max(...bsWindow)
      const bsAvgLowVal = bot10.length > 0 ? bot10.reduce((a, b) => a + b, 0) / bot10.length : Math.min(...bsWindow)
      // Crossover signal matching BuySellScanner: score crosses above avgLow = BUY, crosses below avgHigh = SELL
      const prevScore = bsScores[L - 1] ?? bsCurrent
      const bsSignal: 'BUY' | 'SELL' | 'NEUTRAL' =
        (prevScore <= bsAvgLowVal && bsCurrent > bsAvgLowVal) ? 'BUY' :
          (prevScore >= bsAvgHighVal && bsCurrent < bsAvgHighVal) ? 'SELL' :
            bsCurrent > bsAvgHighVal ? 'BUY' :
              bsCurrent < bsAvgLowVal ? 'SELL' : 'NEUTRAL'

      setLoadingPhase('COMPUTING VOLATILITY REGIME...'); await tick()
      const hvArr4 = computeRollingHV(bars, HV_PERIOD_SHORT)
      const hvArr20 = computeRollingHV(bars, HV_PERIOD_MID)
      const hvArr60 = computeRollingHV(bars, HV_PERIOD_LONG)
      const hvCurrent4 = hvArr4[L]
      const hvCurrent60 = hvArr60[L]
      const hvRatio = hvCurrent60 > 0 ? hvCurrent4 / hvCurrent60 : 1
      const hvContractPct = Math.max(0, (1 - hvRatio) * 100)
      const isContracting = hvRatio < CONTRACT_THRESHOLD

      setLoadingPhase('SCANNING CONTRACTION EVENTS...'); await tick()
      const contraEvents = computeContraEvents(bars)

      setLoadingPhase('DETECTING POI LEVELS...'); await tick()
      const poiLevels = computePOILevels(bars, CHART_BARS)

      setLoadingPhase('DETECTING ACTIVE PATTERNS...'); await tick()
      const activePatterns = detectActivePatterns(bars)
      const patBullVotes = activePatterns.filter(p => p.type === 'BUY').length
      const patBearVotes = activePatterns.filter(p => p.type === 'SELL').length

      setLoadingPhase('BUILDING SIGNAL CONFLUENCE...'); await tick()
      const lastClose = bars[L].c
      const todayRet = L > 0 ? (bars[L].c - bars[L - 1].c) / bars[L - 1].c * 100 : 0
      const bullVotes = (bsSignal === 'BUY' ? 1 : 0) + Math.min(2, patBullVotes)
      const bearVotes = (bsSignal === 'SELL' ? 1 : 0) + Math.min(2, patBearVotes)
      let verdict: TickerResult['verdict']
      let verdictColor: string
      if (isContracting && bullVotes === bearVotes) {
        verdict = 'CONTRACTION SETUP'; verdictColor = '#ff8c00'
      } else if (bullVotes > bearVotes && bullVotes >= 2) {
        verdict = 'ONE WAY LONG'; verdictColor = '#00ff88'
      } else if (bearVotes > bullVotes && bearVotes >= 2) {
        verdict = 'ONE WAY SHORT'; verdictColor = '#ff3333'
      } else {
        verdict = 'MIXED'; verdictColor = 'rgba(255,255,255,0.4)'
      }

      setResult({
        ticker, lastClose, todayRet, bars,
        bsScores, bsCurrent, bsAvg1yr, bsAvg3yr, bsAvgHighVal, bsAvgLowVal, bsSignal,
        hvArr4, hvArr20, hvArr60, hvCurrent4, hvCurrent60, hvContractPct, isContracting,
        contraEvents, poiLevels,
        activePatterns,
        bullVotes, bearVotes, verdict, verdictColor,
      })
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [ticker])

  useEffect(() => { load() }, [load])

  const cardStyle: React.CSSProperties = {
    background: '#080808',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 6,
    overflow: 'hidden',
    boxShadow: '0 2px 16px rgba(0,0,0,0.6)',
    display: 'flex',
    flexDirection: 'column',
  }

  if (loading) return (
    <div style={{ ...cardStyle, padding: '40px 32px', textAlign: 'center', borderTop: '3px solid rgba(255,140,0,0.5)' }}>
      <div style={{ color: '#ff8c00', fontSize: 10, letterSpacing: 5, marginBottom: 10, ...mono }}>ONE WAY ANALYSIS</div>
      <div style={{ color: '#fff', fontSize: 24, fontWeight: 900, letterSpacing: 4, marginBottom: 18, ...mono }}>{ticker}</div>
      {/* Spinner bar */}
      <div style={{ width: '100%', height: 2, background: 'rgba(255,255,255,0.07)', borderRadius: 1, overflow: 'hidden', marginBottom: 14 }}>
        <div style={{
          height: '100%', width: '40%', borderRadius: 1,
          background: 'linear-gradient(90deg, transparent, #ff8c00, transparent)',
          animation: 'owa-scan 1.4s ease-in-out infinite',
        }} />
      </div>
      <style>{`@keyframes owa-scan { 0%{transform:translateX(-100%)} 100%{transform:translateX(350%)} }`}</style>
      <div style={{ color: '#ff8c00', fontSize: 11, fontWeight: 700, letterSpacing: 2, ...mono }}>{loadingPhase}</div>
    </div>
  )

  if (error) return (
    <div style={{ ...cardStyle, padding: 20, borderTop: '3px solid rgba(255,51,51,0.6)' }}>
      <div style={{ color: '#ff3333', fontSize: 13, ...mono }}><span style={{ fontWeight: 900 }}>{ticker} ERROR: </span>{error}</div>
    </div>
  )

  if (!result) return null

  const retColor = result.todayRet >= 0 ? '#00ff88' : '#ff3333'
  const verdictBg = result.verdict === 'ONE WAY LONG' ? 'rgba(0,255,136,0.12)' :
    result.verdict === 'ONE WAY SHORT' ? 'rgba(255,51,51,0.12)' :
      result.verdict === 'CONTRACTION SETUP' ? 'rgba(255,140,0,0.12)' : 'rgba(255,255,255,0.05)'
  const verdictBorder = result.verdict === 'ONE WAY LONG' ? 'rgba(0,255,136,0.3)' :
    result.verdict === 'ONE WAY SHORT' ? 'rgba(255,51,51,0.3)' :
      result.verdict === 'CONTRACTION SETUP' ? 'rgba(255,140,0,0.3)' : 'rgba(255,255,255,0.1)'

  const bsColor = result.bsSignal === 'BUY' ? '#00ff88' : result.bsSignal === 'SELL' ? '#ff3333' : '#ffffff'
  const hvColor = result.isContracting ? '#ff8c00' : '#00ff88'

  return (
    <div style={{ ...cardStyle, borderTop: `3px solid ${result.verdictColor}` }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ padding: '14px 18px 12px', background: '#0c0c0c', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          {/* Left: ticker + price */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ color: '#fff', fontSize: 26, fontWeight: 900, letterSpacing: 3, ...mono }}>{result.ticker}</span>
            <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 18, fontWeight: 700, ...mono }}>${result.lastClose.toFixed(2)}</span>
            <span style={{
              color: retColor, fontSize: 12, fontWeight: 700,
              background: result.todayRet >= 0 ? 'rgba(0,255,136,0.08)' : 'rgba(255,51,51,0.08)',
              border: `1px solid ${retColor}33`, borderRadius: 3, padding: '2px 7px', ...mono
            }}>{result.todayRet >= 0 ? '+' : ''}{result.todayRet.toFixed(2)}%</span>
          </div>

          {/* Right: verdict + remove */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              background: verdictBg, border: `1px solid ${verdictBorder}`,
              borderRadius: 4, padding: '5px 12px',
              color: result.verdictColor, fontSize: 11, fontWeight: 900, letterSpacing: 2, ...mono
            }}>{result.verdict}</div>
            <span onClick={onRemove} style={{ color: 'rgba(255,80,80,0.6)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</span>
          </div>
        </div>

        {/* Signal tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 10 }}>
          {/* BuySell */}
          <div style={{ background: '#111', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 4, padding: '7px 10px' }}>
            <div style={{ color: '#ffffff', fontSize: 9, letterSpacing: 2, marginBottom: 3, ...mono }}>MICROSTRUCTURE</div>
            <div style={{ color: bsColor, fontSize: 13, fontWeight: 900, letterSpacing: 1, ...mono }}>{result.bsSignal}</div>
            <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 10, ...mono }}>score {result.bsCurrent.toFixed(1)} · 1yr avg {result.bsAvg1yr.toFixed(1)}</div>
          </div>

          {/* Volatility */}
          <div style={{ background: '#111', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 4, padding: '7px 10px' }}>
            <div style={{ color: '#ffffff', fontSize: 9, letterSpacing: 2, marginBottom: 3, ...mono }}>VOLATILITY REGIME</div>
            <div style={{ color: hvColor, fontSize: 13, fontWeight: 900, letterSpacing: 1, ...mono }}>
              {result.isContracting ? `CONTRACTING ${result.hvContractPct.toFixed(0)}%` : 'EXPANDED'}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 10, ...mono }}>HV4 {result.hvCurrent4.toFixed(1)}% · HV60 {result.hvCurrent60.toFixed(1)}%</div>
          </div>

          {/* Patterns */}
          <div style={{ background: '#111', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 4, padding: '7px 10px' }}>
            <div style={{ color: '#ffffff', fontSize: 9, letterSpacing: 2, marginBottom: 3, ...mono }}>ACTIVE PATTERNS</div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {result.activePatterns.filter(p => p.type === 'BUY').length > 0 && (
                <div style={{ color: '#00ff88', fontSize: 13, fontWeight: 900, ...mono }}>
                  {result.activePatterns.filter(p => p.type === 'BUY').length} BUY
                </div>
              )}
              {result.activePatterns.filter(p => p.type === 'SELL').length > 0 && (
                <div style={{ color: '#ff3333', fontSize: 13, fontWeight: 900, ...mono }}>
                  {result.activePatterns.filter(p => p.type === 'SELL').length} SELL
                </div>
              )}
              {result.activePatterns.length === 0 && (
                <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, ...mono }}>NONE</div>
              )}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 10, ...mono }}>
              {result.bullVotes} bull vs {result.bearVotes} bear votes
            </div>
          </div>
        </div>
      </div>

      {/* ── Chart ──────────────────────────────────────────────────────────── */}
      <div style={{ height: 780, position: 'relative', background: '#000' }}>
        <OneWayChart result={result} />
      </div>

      {/* ── Active patterns list ────────────────────────────────────────────── */}
      {result.activePatterns.length > 0 && (
        <div style={{ padding: '10px 14px 12px', borderTop: '1px solid rgba(255,255,255,0.06)', background: '#040404' }}>
          <div style={{ color: '#ffffff', fontSize: 9, letterSpacing: 3, marginBottom: 7, ...mono }}>ACTIVE NOW</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {result.activePatterns.map((p, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'flex-start', gap: 8,
                background: p.type === 'BUY' ? 'rgba(0,255,136,0.04)' : 'rgba(255,51,51,0.04)',
                border: `1px solid ${p.type === 'BUY' ? 'rgba(0,255,136,0.12)' : 'rgba(255,51,51,0.12)'}`,
                borderRadius: 3, padding: '5px 8px',
              }}>
                <div style={{
                  color: '#000', background: p.type === 'BUY' ? '#00ff88' : '#ff3333',
                  fontSize: 8, fontWeight: 900, padding: '2px 5px', borderRadius: 2, flexShrink: 0, ...mono
                }}>{p.type}</div>
                <div>
                  <div style={{ color: p.type === 'BUY' ? '#00ff88' : '#ff3333', fontSize: 11, fontWeight: 900, letterSpacing: 1, ...mono }}>{p.label}</div>
                  <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 10, marginTop: 1, ...mono }}>{p.context}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main panel ───────────────────────────────────────────────────────────────
export default function OneWayAnalysis() {
  const [tickers, setTickers] = useState<string[]>([])
  const [input, setInput] = useState('')

  const mono: React.CSSProperties = { fontFamily: "'JetBrains Mono', 'Consolas', monospace" }

  const addTicker = () => {
    const sym = input.trim().toUpperCase()
    if (!sym || tickers.includes(sym)) { setInput(''); return }
    setTickers(prev => [...prev, sym])
    setInput('')
  }

  const removeTicker = (t: string) => setTickers(prev => prev.filter(x => x !== t))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#000', color: '#fff' }}>

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div style={{
        padding: '14px 24px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        background: '#060606',
        display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
      }}>
        <div>
          <div style={{ color: '#ff8c00', fontSize: 11, fontWeight: 900, letterSpacing: 4, ...mono }}>ONE WAY ANALYSIS</div>
          <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 10, letterSpacing: 1, marginTop: 2, ...mono }}>
            MICROSTRUCTURE · VOLATILITY REGIME · BACKTESTED PATTERNS
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1, maxWidth: 360 }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && addTicker()}
            placeholder="TICKER SYMBOL..."
            style={{
              flex: 1, background: '#111', border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 4, color: '#fff', padding: '7px 12px',
              fontSize: 13, fontWeight: 700, letterSpacing: 1, outline: 'none', ...mono,
            }}
          />
          <button onClick={addTicker} style={{
            background: '#00ff88', color: '#000', border: 'none', borderRadius: 4,
            padding: '7px 16px', fontSize: 12, fontWeight: 900, cursor: 'pointer', letterSpacing: 1, ...mono,
          }}>+ ADD</button>
        </div>

        {tickers.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {tickers.map(t => (
              <div key={t} style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: '#111', border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 3, padding: '3px 8px 3px 10px',
                fontSize: 12, fontWeight: 700, color: '#fff', ...mono,
              }}>
                {t}
                <span onClick={() => removeTicker(t)} style={{ color: 'rgba(255,80,80,0.6)', cursor: 'pointer', fontSize: 15, lineHeight: 1 }}>×</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Card grid ───────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 32px' }}>
        {tickers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 32px', color: 'rgba(255,255,255,0.2)', ...mono }}>
            <div style={{ fontSize: 13, letterSpacing: 3, marginBottom: 8 }}>NO TICKERS ADDED</div>
            <div style={{ fontSize: 11, letterSpacing: 1 }}>ADD A TICKER ABOVE TO SEE COMBINED SIGNAL CONFLUENCE</div>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: tickers.length === 1 ? '1fr' : '1fr 1fr',
            gap: 20,
            alignItems: 'start',
          }}>
            {tickers.map(t => (
              <OneWayCard key={t} ticker={t} onRemove={() => removeTicker(t)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
