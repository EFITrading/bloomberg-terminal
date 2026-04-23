'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'

import { TOP_1800_SYMBOLS } from '@/lib/Top1000Symbols'

// ── Constants ──────────────────────────────────────────────────────────────────
const CONTRACTION_THRESHOLD = 40 // only show strong contractions — skip anything below 40%
const MIN_AVG_HV = 1.5            // lowered from 3.0 — allow lower-vol names
const SCAN_TRADING_DAYS = 2       // only contractions within the past 2 trading days
const DP_LOOKBACK_DAYS = 90       // trading days of dark pool data for POI detection
const CHART_VISIBLE_DAYS = 60 // candles shown in chart
const FETCH_CAL_DAYS = 500 // calendar days to fetch (for avgHV lookback)
const DARK_POOL_EXCHANGES = new Set([4, 6, 16, 201, 202, 203])
const LIT_BLOCK_MIN_NOTIONAL = 250_000
const RISK_FREE_RATE = 0.0387
const OHLCV_CONCURRENCY = 8 // parallel OHLCV fetches
const MAX_SYMBOLS = 1000 // maximum symbols in universe
// Mag 8: excluded from auto POI scan — use the per-card "Scan POI" button instead
const MAG8_SYMBOLS = new Set(['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'NFLX', 'AVGO'])
// Low-volatility exclusions (avgHV4D < 4.5%) — not worth scanning for straddles
// Kept: MCD (3.71%), BRK.B (3.40%) — user preference
const LOW_VOL_EXCLUSIONS = new Set([
  // Utilities
  'FTS', 'DUK', 'ATO', 'CMS', 'WEC', 'SO', 'FE', 'AEE', 'AEP', 'XEL', 'PPL', 'CNP', 'ED', 'PEG', 'DTE', 'NGG', 'ETR',
  // REITs
  'O', 'VICI', 'CPT', 'AVB',
  // MLPs / Pipelines
  'ET', 'EPD', 'MPLX', 'ENB', 'TRP',
  // Canadian Banks
  'RY', 'BNS', 'TD', 'SLF',
  // Defensive / Slow movers
  'KO', 'PG', 'JNJ', 'CB', 'AFL', 'TJX', 'NSC', 'UNP', 'RSG', 'TAK', 'GGG', 'SNA',
  // Telecom
  'VZ', 'AZN',
  // Other sub-4.5% names
  'GTLS', 'EA', 'BUD', 'ACGL', 'ITW', 'VTR', 'NVS', 'ROST', 'HON', 'LIN', 'WM', 'WCN',
])

// ── Types ──────────────────────────────────────────────────────────────────────
interface Bar {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  t: number
}
interface ContraEvent {
  date: string
  price: number
  compressionPct: number
  squeezeOn: boolean
}
interface DPPrint {
  price: number
  size: number
  ts: number
}
interface DPDay {
  date: string
  top10: DPPrint[]
  totalNotional: number
  topPrint: DPPrint
}
interface POILevel {
  price: number
  totalNotional: number
  printCount: number
  dates: string[]
}
interface StraddleTrade {
  currentPrice: number
  iv: number
  dte: number
  expiration: string
  callStrike: number
  callEntry: number
  callT1Stock: number
  callT1Premium: number
  callT2Stock: number
  callT2Premium: number
  callStop: number
  putStrike: number
  putEntry: number
  putT1Stock: number
  putT1Premium: number
  putT2Stock: number
  putT2Premium: number
  putStop: number
  totalCost: number
  upperBE: number
  lowerBE: number
}
interface ScanResult {
  symbol: string
  currentPrice: number
  compressionPct: number
  squeezeOn: boolean
  hasPOI: boolean
  topPOI: POILevel | null
  setupActive: boolean
  bars: Bar[]
  allEvents: ContraEvent[]
  recentEvents: ContraEvent[]
  dpDays: DPDay[]
  poiLevels: POILevel[]
  trade: StraddleTrade | null
  poiScanPending?: boolean
}
interface ScanStats {
  totalSymbols: number
  ohlcvDone: number
  contractionHits: number
  dpDone: number
  setupsFound: number
}

// ── Black-Scholes Helpers ─────────────────────────────────────────────────────
function nCDF(x: number): number {
  const sign = x >= 0 ? 1 : -1
  x = Math.abs(x)
  const t = 1 / (1 + 0.3275911 * x)
  const poly =
    t *
    (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))))
  return 0.5 * (1 + sign * (1 - poly * Math.exp(-x * x)))
}

function bsPrice(S: number, K: number, T: number, r: number, sig: number, isCall: boolean): number {
  if (T <= 0) return isCall ? Math.max(0, S - K) : Math.max(0, K - S)
  const d1 = (Math.log(S / K) + (r + 0.5 * sig * sig) * T) / (sig * Math.sqrt(T))
  const d2 = d1 - sig * Math.sqrt(T)
  return isCall
    ? S * nCDF(d1) - K * Math.exp(-r * T) * nCDF(d2)
    : K * Math.exp(-r * T) * nCDF(-d2) - S * nCDF(-d1)
}

function findStrike80(S: number, r: number, sig: number, T: number, isCall: boolean): number {
  // Same logic as EFICharting findStrikeForProbability(targetProb=80):
  //   chanceOfProfitSellCall = (1 - N(d2)) * 100 = 80  →  N(d2) = 0.20  →  d2 = -0.8416
  //   chanceOfProfitSellPut  = N(d2) * 100 = 80         →  N(d2) = 0.80  →  d2 = +0.8416
  // d2 = (log(S/K) + (r - 0.5*sig²)*T) / (sig*√T)
  // Solve for K: K = S * exp(∓0.8416 * sig*√T + (r - 0.5*sig²)*T)
  const zInv = 0.8416
  const drift = (r - 0.5 * sig * sig) * T  // d2 drift (not d1)
  if (isCall) {
    return S * Math.exp(zInv * sig * Math.sqrt(T) + drift)
  } else {
    return S * Math.exp(-zInv * sig * Math.sqrt(T) + drift)
  }
}

function calcAnnualIV(bars: Bar[]): number {
  const closes = bars.slice(-21).map((b) => b.close)
  if (closes.length < 2) return 0.3
  const rets = closes.slice(1).map((c, i) => Math.log(c / closes[i]))
  const mean = rets.reduce((s, r) => s + r, 0) / rets.length
  const variance = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / (rets.length - 1)
  return Math.sqrt(variance) * Math.sqrt(252)
}

// Format a Date as YYYY-MM-DD using LOCAL calendar date (avoids UTC shift)
function toLocalDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function nextWeeklyExpiry(minDaysOut = 7): string {
  const d = new Date()
  d.setDate(d.getDate() + minDaysOut)
  while (d.getDay() !== 5) d.setDate(d.getDate() + 1)
  return toLocalDateStr(d)
}

// Returns the nearest Friday that is >= minCalDays calendar days from today
function fridayMinDaysOut(minCalDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + minCalDays)
  while (d.getDay() !== 5) d.setDate(d.getDate() + 1)
  return toLocalDateStr(d)
}

// Fetch the nearest REAL listed expiry from Polygon >= minDaysOut.
// Falls back to fridayMinDaysOut if no data or API error.
async function fetchNearestRealExpiry(
  symbol: string,
  minDaysOut: number,
  apiKey: string,
): Promise<string> {
  const earliest = fridayMinDaysOut(minDaysOut)
  try {
    const url =
      `https://api.polygon.io/v3/reference/options/contracts` +
      `?underlying_ticker=${symbol}&contract_type=call&expiration_date.gte=${earliest}` +
      `&order=asc&sort=expiration_date&limit=10&apiKey=${apiKey}`
    const res = await fetch(url)
    if (!res.ok) return earliest
    const data = await res.json()
    const contracts: { expiration_date: string }[] = data?.results ?? []
    if (!contracts.length) return earliest
    const expiries = [...new Set(contracts.map((c) => c.expiration_date))].sort()
    return expiries[0] // nearest real listed expiry >= minDaysOut
  } catch {
    return earliest
  }
}

// Determines bubble tier of the top POI based on which rank-position
// the highest-notional DP day near that POI falls in the sorted DP list.
function getTopPOIBubbleTier(
  dpDays: DPDay[],
  topPOI: POILevel | null,
): 'gold' | 'blue' | 'gray' {
  if (!topPOI || !dpDays.length) return 'gray'
  const sorted = [...dpDays]
    .filter(d => d?.totalNotional > 0 && d?.topPrint)
    .sort((a, b) => b.totalNotional - a.totalNotional)
  const thr = topPOI.price * 0.0075
  for (let i = 0; i < sorted.length; i++) {
    if (Math.abs(sorted[i].topPrint.price - topPOI.price) <= thr) {
      if (i === 0) return 'gold'
      if (i === 1) return 'blue'
      return 'gray'
    }
  }
  return 'gray'
}

// ── Contraction Logic — matching ConsolidationHistoryScreener.tsx exactly ─────
function calcEMA(vals: number[], p: number): number {
  if (vals.length < p) return 0
  const k = 2 / (p + 1)
  let e = vals.slice(0, p).reduce((s, v) => s + v, 0) / p
  for (let i = p; i < vals.length; i++) e = (vals[i] - e) * k + e
  return e
}

function calcATR(bars: Bar[], p = 14): number {
  if (bars.length < p + 1) return 0
  const trs: number[] = []
  for (let i = 1; i < bars.length; i++) {
    const h = bars[i].high,
      l = bars[i].low,
      pc = bars[i - 1].close
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)))
  }
  return trs.slice(-p).reduce((s, t) => s + t, 0) / p
}

function ttmSqueeze(bars: Bar[], p = 20): boolean {
  if (bars.length < p) return false
  const cl = bars.slice(-p).map((b) => b.close)
  const sma = cl.reduce((s, c) => s + c, 0) / p
  const std = Math.sqrt(cl.reduce((s, c) => s + (c - sma) ** 2, 0) / p)
  const ema = calcEMA(cl, p)
  const atr = calcATR(bars, p)
  return sma + 2 * std < ema + 1.5 * atr && sma - 2 * std > ema - 1.5 * atr
}

function calcHV4D(bars: Bar[], lookback = 120): number {
  if (bars.length < lookback) return 0
  const rb = bars.slice(-lookback)
  const moves: number[] = []
  for (let i = 4; i < rb.length; i++) {
    const h = Math.max(...rb.slice(i - 4, i + 1).map((b) => b.high))
    const l = Math.min(...rb.slice(i - 4, i + 1).map((b) => b.low))
    moves.push(((h - l) / l) * 100)
  }
  return moves.length ? moves.reduce((s, m) => s + m, 0) / moves.length : 0
}

// DEBUG counters — reset per scan, used to log one sample of each fail reason
const _dbg = { hvLow: 0, compLow: 0, trending: 0, notTight: 0, pass: 0, sampled: 0 }

function detectContraction(bars: Bar[]): { qualifies: boolean; compressionPct: number } {
  if (bars.length < 120) return { qualifies: false, compressionPct: 0 }
  const lb = bars.slice(-4)
  if (lb.length < 4) return { qualifies: false, compressionPct: 0 }
  const avgHV = calcHV4D(bars)
  if (!avgHV || avgHV < MIN_AVG_HV) {
    _dbg.hvLow++
    return { qualifies: false, compressionPct: 0 }
  }
  const high = Math.max(...lb.map((b) => b.high))
  const low = Math.min(...lb.map((b) => b.low))
  const currentRange = high - low
  const rangePercent = (currentRange / low) * 100
  const compressionPct = ((avgHV - rangePercent) / avgHV) * 100
  const netMove = Math.abs(lb[lb.length - 1].close - lb[0].close)
  const notTrending = currentRange > 0 ? netMove / currentRange < 0.8 : false
  const curBar = lb[lb.length - 1]
  const avgBarRange = lb.reduce((s, b) => s + (b.high - b.low), 0) / lb.length
  const curBarTight = avgBarRange > 0 && curBar.high - curBar.low <= avgBarRange * 2.0
  const qualifies = compressionPct > CONTRACTION_THRESHOLD && notTrending && curBarTight
  if (!qualifies) {
    if (compressionPct <= CONTRACTION_THRESHOLD) _dbg.compLow++
    else if (!notTrending) _dbg.trending++
    else if (!curBarTight) _dbg.notTight++
    // log first 3 near-misses so we can see real numbers
    if (_dbg.sampled < 3) {
      _dbg.sampled++
      console.log(`[ST-DC] FAIL sample[${_dbg.sampled}] avgHV=${avgHV.toFixed(2)} rangePercent=${rangePercent.toFixed(2)} compressionPct=${compressionPct.toFixed(1)} (need>${CONTRACTION_THRESHOLD}) notTrending=${notTrending} curBarTight=${curBarTight} | netMove/range=${currentRange > 0 ? (netMove / currentRange).toFixed(2) : 'N/A'} curBarRange=${(curBar.high - curBar.low).toFixed(2)} avgBarRange=${avgBarRange.toFixed(2)}`)
    }
  } else {
    _dbg.pass++
  }
  return { qualifies, compressionPct }
}

function scanHistory(allBars: Bar[]): ContraEvent[] {
  const events: ContraEvent[] = []
  let inC = false,
    peakC = 0,
    lastIdx = -1
  const emit = () => {
    if (!inC || lastIdx < 0) return
    events.push({
      date: allBars[lastIdx].date,
      price: allBars[lastIdx].close,
      compressionPct: peakC,
      squeezeOn: ttmSqueeze(allBars.slice(0, lastIdx + 1)),
    })
    inC = false
    peakC = 0
    lastIdx = -1
  }
  for (let i = 120; i < allBars.length; i++) {
    const r = detectContraction(allBars.slice(0, i + 1))
    if (r.qualifies) {
      if (!inC) {
        inC = true
        peakC = r.compressionPct
      } else if (r.compressionPct > peakC) peakC = r.compressionPct
      lastIdx = i
    } else {
      if (inC) emit()
    }
  }
  if (inC) emit()
  return events
}

// ── POI Clustering — top 10 ───────────────────────────────────────────────────
function clusterPOI(dpDays: DPDay[]): POILevel[] {
  const pts: { price: number; notional: number; date: string }[] = []
  for (const d of dpDays)
    for (const p of d.top10) pts.push({ price: p.price, notional: p.size * p.price, date: d.date })
  if (!pts.length) return []
  pts.sort((a, b) => a.price - b.price)
  const clusters: POILevel[] = []
  let i = 0
  while (i < pts.length) {
    const ref = pts[i].price,
      thr = ref * 0.0075
    const g: typeof pts = []
    while (i < pts.length && Math.abs(pts[i].price - ref) <= thr) {
      g.push(pts[i])
      i++
    }
    clusters.push({
      price: g.reduce((s, p) => s + p.price, 0) / g.length,
      totalNotional: g.reduce((s, p) => s + p.notional, 0),
      printCount: g.length,
      dates: [...new Set(g.map((p) => p.date))].sort().slice(-3),
    })
  }
  return clusters.sort((a, b) => b.totalNotional - a.totalNotional).slice(0, 10) // TOP 10
}

function buildStraddleTrade(
  allBars: Bar[],
  symbol?: string,
  compressionPct = 0,
  bubbleTier: 'gold' | 'blue' | 'gray' = 'gray',
  expirationOverride?: string,
): StraddleTrade {
  const sym = symbol ?? '?'
  const currentPrice = allBars[allBars.length - 1].close

  // ── IV debug ──────────────────────────────────────────────────────────────
  const rawIV = calcAnnualIV(allBars)
  const iv = Math.max(0.05, rawIV)
  const ivCloses = allBars.slice(-21).map(b => b.close)
  const ivRets = ivCloses.slice(1).map((c, i) => Math.log(c / ivCloses[i]))
  const ivMean = ivRets.reduce((s, r) => s + r, 0) / ivRets.length
  const ivVariance = ivRets.reduce((s, r) => s + (r - ivMean) ** 2, 0) / (ivRets.length - 1)
  console.log(
    `[ST:iv] ${sym} bars=${allBars.length} last21closes=[${ivCloses.slice(0, 3).map(c => c.toFixed(2)).join(',')}...${ivCloses.slice(-1)[0].toFixed(2)}]` +
    ` dailyVariance=${ivVariance.toFixed(6)} dailyVol=${(Math.sqrt(ivVariance) * 100).toFixed(3)}%` +
    ` rawIV=${(rawIV * 100).toFixed(2)}% clampedIV=${(iv * 100).toFixed(2)}%`
  )

  // ── Expiry selection ───────────────────────────────────────────────────────
  // Extreme (65%+): this week's Friday; if today is Thursday → following Friday
  // Strong  (50-64%): always following week's Friday (7-13 days out)
  // Moderate(40-49%): this week's Friday IF POI is gold/blue AND within 3 days; else 3 weeks out
  const todayDow = new Date().getDay() // 0=Sun … 4=Thu … 5=Fri
  const isThursday = todayDow === 4
  const poiIsRecent = bubbleTier !== 'gray'
  // Use real expiry if provided (fetched from Polygon), otherwise fall back to theoretical Friday
  let expiration: string
  if (expirationOverride) {
    expiration = expirationOverride
  } else if (compressionPct >= 65) {
    expiration = isThursday ? fridayMinDaysOut(8) : fridayMinDaysOut(0)
  } else if (compressionPct >= 50) {
    expiration = fridayMinDaysOut(7)
  } else {
    expiration = poiIsRecent ? fridayMinDaysOut(0) : fridayMinDaysOut(21)
  }
  console.log(`[ST:expiry] ${sym} bubbleTier=${bubbleTier} compressionPct=${compressionPct.toFixed(1)}% → expiration=${expiration}`)

  const today = new Date()
  const expD = new Date(expiration)
  const dteFull = (expD.getTime() - today.getTime()) / 86_400_000
  const dte = Math.max(1, Math.ceil(dteFull))
  const T = dte / 365
  console.log(
    `[ST:expiry] ${sym} today=${today.toISOString().split('T')[0]} expiry=${expiration}` +
    ` dteFull=${dteFull.toFixed(2)} dteCeil=${dte} T=${T.toFixed(6)}`
  )

  // ── Strike search debug ───────────────────────────────────────────────────
  const callStrikeRaw = findStrike80(currentPrice, RISK_FREE_RATE, iv, T, true)
  const putStrikeRaw = findStrike80(currentPrice, RISK_FREE_RATE, iv, T, false)
  const callStrike = Math.round(callStrikeRaw)
  const putStrike = Math.round(putStrikeRaw)
  // verify 20-delta prob at chosen strikes
  const d1Call = (Math.log(currentPrice / callStrike) + (RISK_FREE_RATE + 0.5 * iv * iv) * T) / (iv * Math.sqrt(T))
  const d2Call = d1Call - iv * Math.sqrt(T)
  const d1Put = (Math.log(currentPrice / putStrike) + (RISK_FREE_RATE + 0.5 * iv * iv) * T) / (iv * Math.sqrt(T))
  const d2Put = d1Put - iv * Math.sqrt(T)
  const callProb20 = (1 - nCDF(d2Call)) * 100  // prob call expires ITM
  const putProb20 = nCDF(-d2Put) * 100          // prob put expires ITM
  console.log(
    `[ST:strikes] ${sym} S=${currentPrice.toFixed(2)}` +
    ` | callK_raw=${callStrikeRaw.toFixed(3)} callK=${callStrike} d1=${d1Call.toFixed(3)} d2=${d2Call.toFixed(3)} pITM=${callProb20.toFixed(1)}% (want~20%)` +
    ` | putK_raw=${putStrikeRaw.toFixed(3)} putK=${putStrike} d1=${d1Put.toFixed(3)} d2=${d2Put.toFixed(3)} pITM=${putProb20.toFixed(1)}% (want~20%)` +
    (callProb20 < 5 || callProb20 > 40 ? ` ⚠️ callK prob way off` : '') +
    (putProb20 < 5 || putProb20 > 40 ? ` ⚠️ putK prob way off` : '')
  )

  // ── Premium debug ─────────────────────────────────────────────────────────
  const callEntry = bsPrice(currentPrice, callStrike, T, RISK_FREE_RATE, iv, true)
  const putEntry = bsPrice(currentPrice, putStrike, T, RISK_FREE_RATE, iv, false)
  // d1/d2 for premium calculation
  const d1CP = (Math.log(currentPrice / callStrike) + (RISK_FREE_RATE + 0.5 * iv * iv) * T) / (iv * Math.sqrt(T))
  const d2CP = d1CP - iv * Math.sqrt(T)
  const d1PP = (Math.log(currentPrice / putStrike) + (RISK_FREE_RATE + 0.5 * iv * iv) * T) / (iv * Math.sqrt(T))
  const d2PP = d1PP - iv * Math.sqrt(T)
  console.log(
    `[ST:premium] ${sym}` +
    ` | CALL: S=${currentPrice.toFixed(2)} K=${callStrike} T=${T.toFixed(4)} IV=${(iv * 100).toFixed(1)}% r=${RISK_FREE_RATE}` +
    ` d1=${d1CP.toFixed(3)} d2=${d2CP.toFixed(3)} N(d1)=${nCDF(d1CP).toFixed(4)} N(d2)=${nCDF(d2CP).toFixed(4)} prem=$${callEntry.toFixed(3)}` +
    (callEntry < 0.01 ? ' ⚠️ NEAR-ZERO' : '') +
    ` | PUT: K=${putStrike}` +
    ` d1=${d1PP.toFixed(3)} d2=${d2PP.toFixed(3)} N(-d2)=${nCDF(-d2PP).toFixed(4)} N(-d1)=${nCDF(-d1PP).toFixed(4)} prem=$${putEntry.toFixed(3)}` +
    (putEntry < 0.01 ? ' ⚠️ NEAR-ZERO' : '')
  )

  const expMove1SD = currentPrice * iv * Math.sqrt(T)
  const expMove15SD = expMove1SD * 1.5

  const callT1Stock = currentPrice + expMove1SD * 0.84
  const callT2Stock = currentPrice + expMove15SD
  const callT1Premium = bsPrice(callT1Stock, callStrike, T * 0.7, RISK_FREE_RATE, iv, true)
  const callT2Premium = bsPrice(callT2Stock, callStrike, T * 0.5, RISK_FREE_RATE, iv, true)

  const putT1Stock = currentPrice - expMove1SD * 0.84
  const putT2Stock = currentPrice - expMove15SD
  const putT1Premium = bsPrice(putT1Stock, putStrike, T * 0.7, RISK_FREE_RATE, iv, false)
  const putT2Premium = bsPrice(putT2Stock, putStrike, T * 0.5, RISK_FREE_RATE, iv, false)

  return {
    currentPrice,
    iv,
    dte,
    expiration,
    callStrike,
    callEntry,
    callT1Stock,
    callT1Premium,
    callT2Stock,
    callT2Premium,
    callStop: callEntry * 0.5,
    putStrike,
    putEntry,
    putT1Stock,
    putT1Premium,
    putT2Stock,
    putT2Premium,
    putStop: putEntry * 0.5,
    totalCost: (callEntry + putEntry) * 100,
    upperBE: callStrike + callEntry + putEntry,
    lowerBE: putStrike - (callEntry + putEntry),
  }
}

// ── Format Helpers ─────────────────────────────────────────────────────────────
function fmtN(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}
function fmtDate(d: string): string {
  return new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}
function fmtExpiry(d: string): string {
  return new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

// ── Concurrency helper ────────────────────────────────────────────────────────
async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
  onEach?: (result: T, index: number) => void,
  signal?: AbortSignal
): Promise<T[]> {
  const results: T[] = new Array(tasks.length)
  let nextIdx = 0
  const worker = async () => {
    while (nextIdx < tasks.length) {
      if (signal?.aborted) return
      const idx = nextIdx++
      try {
        results[idx] = await tasks[idx]()
        if (onEach) onEach(results[idx], idx)
      } catch {
        // skip failed task — results[idx] stays undefined
      }
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, worker)
  await Promise.all(workers)
  return results
}

// ── Symbol universe from Top1000Symbols.ts ───────────────────────────────────
async function fetchTopSymbols(
  _apiKey: string,
  limit: number,
  _signal: AbortSignal
): Promise<string[]> {
  return TOP_1800_SYMBOLS.slice(0, limit).filter(s => !LOW_VOL_EXCLUSIONS.has(s))
}
; ('JPM',
  'LLY',
  'V',
  'MA',
  'UNH',
  'XOM',
  'WMT',
  'ORCL',
  'HD',
  'PG',
  'COST',
  'BAC',
  'NFLX',
  'AMD',
  'KO',
  'ABBV',
  'MRK',
  'CVX',
  'WFC',
  'CRM',
  'CSCO',
  'MCD',
  'ACN',
  'PEP',
  'LIN',
  'ABT',
  'MS',
  'BX',
  'GE',
  'TMO',
  'GS',
  'IBM',
  'ISRG',
  'NOW',
  'AXP',
  'CAT',
  'RTX',
  'SPGI',
  'UBER',
  'INTU',
  'TXN',
  'VZ',
  'NEE',
  'UNP',
  'T',
  'ETN',
  'BA',
  'PFE',
  'HON',
  'AMGN',
  'LOW',
  'DE',
  'BKNG',
  'AMAT',
  'ADI',
  'CMCSA',
  'BMY',
  'TJX',
  'PANW',
  'SYK',
  'VRTX',
  'ADP',
  'BSX',
  'MU',
  'PLD',
  'LMT',
  'C',
  'GEV',
  'SCHW',
  'INTC',
  'MDT',
  'GILD',
  'CB',
  'NKE',
  'CI',
  'SO',
  'CMG',
  'MMC',
  'DUK',
  'ELV',
  'AMT',
  'AON',
  'WM',
  'ICE',
  'ZTS',
  'SHW',
  'CTAS',
  'USB',
  'COF',
  'MCO',
  'FCX',
  'MDLZ',
  'PH',
  'MPC',
  'EMR',
  'TDG',
  'APD',
  'CEG',
  'GD',
  'APH',
  'SNPS',
  'CDNS',
  'CME',
  'ITW',
  'MSI',
  'EOG',
  'ORLY',
  'MCK',
  'REGN',
  'ECL',
  'HCA',
  'BDX',
  'NOC',
  'PSA',
  'SPG',
  'NSC',
  'KMB',
  'WMB',
  'TT',
  'PSX',
  'ROP',
  'WELL',
  'OXY',
  'BBY',
  'KR',
  'HUM',
  'CL',
  'AFL',
  'F',
  'GM',
  'PCAR',
  'CARR',
  'COP',
  'MET',
  'AIG',
  'EW',
  'GWW',
  'GLW',
  'PCG',
  'FIS',
  'PAYX',
  'NEM',
  'DLR',
  'AZO',
  'FAST',
  'A',
  'FICO',
  'CPRT',
  'VRSK',
  'ACGL',
  'PWR',
  'VLO',
  'FANG',
  'CTVA',
  'BK',
  'TFC',
  'STZ',
  'RSG',
  'URI',
  'KVUE',
  'LRCX',
  'ODFL',
  'MCHP',
  'DD',
  'IQV',
  'FTNT',
  'SRE',
  'DG',
  'MPWR',
  'TEL',
  'DXCM',
  'HSY',
  'MSCI',
  'EFX',
  'VICI',
  'VMC',
  'MLM',
  'MAR',
  'DLTR',
  'DHI',
  'IDXX',
  'EXC',
  'GEHC',
  'CDW',
  'KHC',
  'XEL',
  'GIS',
  'DFS',
  'WAB',
  'WEC',
  'CBRE',
  'ON',
  'AVB',
  'ED',
  'MTD',
  'FTV',
  'TSCO',
  'OTIS',
  'KEYS',
  'RCL',
  'HST',
  'EXR',
  'EBAY',
  'DOV',
  'ETR',
  'DECK',
  'PPL',
  'CHD',
  'ROK',
  'ANSS',
  'LHX',
  'APTV',
  'SBUX',
  'NXPI',
  'TTWO',
  'TRV',
  'WBA',
  'AMP',
  'TROW',
  'BBB',
  'CBOE',
  'STT',
  'LEN',
  'LUV',
  'UAL',
  'CCL',
  'WYNN',
  'MGM',
  'LVS',
  'NCLH',
  'DAL',
  'AAL',
  'HA',
  'SAVE',
  'HAL',
  'DVN',
  'BKR',
  'SLB',
  'CVI',
  'MRO',
  'APA',
  'PDCE',
  'OVV',
  'SM',
  'PYPL',
  'SQ',
  'AFRM',
  'COIN',
  'HOOD',
  'SOFI',
  'MARA',
  'RIOT',
  'CIFR',
  'HUT',
  'PLTR',
  'RBLX',
  'SNAP',
  'PINS',
  'TWTR',
  'U',
  'DDOG',
  'ZS',
  'CRWD',
  'NET',
  'MDB',
  'ESTC',
  'CFLT',
  'GTLB',
  'OKTA',
  'ZI',
  'PATH',
  'ASAN',
  'SMAR',
  'FROG',
  'SNOW',
  'ABNB',
  'DASH',
  'LYFT',
  'NERDZ',
  'RIVN',
  'LCID',
  'NIO',
  'LI',
  'XPEV',
  'BIDU',
  'JD',
  'BABA',
  'PDD',
  'TCOM',
  'NTES',
  'EDU',
  'TAL',
  'YUMC',
  'ZTO',
  'PTON',
  'W',
  'ETSY',
  'CHWY',
  'WISH',
  'OSTK',
  'PRTS',
  'COHU',
  'KLIC',
  'ACLS',
  'GXO',
  'XPO',
  'SAIA',
  'WERN',
  'JBHT',
  'KNX',
  'CHRW',
  'EXPD',
  'HXL',
  'RXO',
  'DHR',
  'WAT',
  'REPX',
  'TECH',
  'PKI',
  'HOLX',
  'ALGN',
  'HSIC',
  'TFX',
  'PODD',
  'INSP',
  'AXNX',
  'NVCR',
  'TMDX',
  'IRTC',
  'LIVN',
  'ATRC',
  'SWAV',
  'CRVS',
  'SRDX',
  'AMD',
  'INTC',
  'QCOM',
  'TER',
  'KLAC',
  'LRCX',
  'AMAT',
  'ENTG',
  'ONTO',
  'UCTT',
  'IP',
  'PKG',
  'SEE',
  'SON',
  'BERY',
  'MYE',
  'GEF',
  'ATR',
  'PTVE',
  'SLGN',
  'FMC',
  'CF',
  'MOS',
  'NTR',
  'ICL',
  'CTLT',
  'AVNT',
  'RPM',
  'PPG',
  'ASH',
  'AXTA',
  'H.B.Fuller',
  'HUN',
  'CE',
  'CC',
  'OLN',
  'TROX',
  'VNTR',
  'GRFS',
  'JPM',
  'BAC',
  'WFC',
  'C',
  'USB',
  'TFC',
  'PNC',
  'FITB',
  'KEY',
  'RF',
  'CFG',
  'HBAN',
  'MTB',
  'STI',
  'BOH',
  'SIVB',
  'WAL',
  'FHN',
  'PBCT',
  'TCF',
  'INT',
  'ICE',
  'CME',
  'CBOE',
  'NDAQ',
  'BMO',
  'TD',
  'RY',
  'BNS',
  'ENB',
  'CNQ',
  'TRP',
  'SU',
  'CVE',
  'IMO',
  'MEG',
  'PEY',
  'ERF',
  'WCP',
  'BTE',
  'ARX',
  'VOD',
  'BP',
  'SHEL',
  'TTE',
  'AZN',
  'GSK',
  'SNY',
  'ROG',
  'NVS',
  'NOVN',
  'SAP',
  'ASML',
  'ADYEN',
  'HEIA',
  'PHIA',
  'ABN',
  'ING',
  'AEGN',
  'UNA',
  'RAND',
  'RIO',
  'BHP',
  'GLEN',
  'AAL',
  'BA',
  'BARC',
  'HSBA',
  'LLOY',
  'NWG',
  'PRU',
  'AV',
  'LGEN',
  'SLA',
  'RSA',
  'ADM',
  'BT',
  'VOD',
  'MEO',
  'SKY',
  'SVT',
  'AOF',
  'BCO',
  'SMCP',
  'ML',
  'CAP',
  'SAN',
  'GLE',
  'BNP',
  'ACA',
  'SGO',
  'OR',
  'LR',
  'MC',
  'CFR',
  'RMS',
  'TFI',
  'KNIN',
  'NESN',
  'NOVN',
  'ZURN',
  'ATVI',
  'EA',
  'TTWO',
  'RBLX',
  'U',
  'GMBL',
  'DKNG',
  'PENN',
  'PDYPY',
  'GAN',
  'DIS',
  'PARA',
  'WBD',
  'FOX',
  'FOXA',
  'NWSA',
  'NYT',
  'TRIP',
  'IAC',
  'ZG',
  'AMCX',
  'SGAM',
  'FUBO',
  'SIRI',
  'IHRT',
  'CARG',
  'CARS',
  'CDK',
  'CLVT',
  'IHS',
  'SPCE',
  'ASTS',
  'RDW',
  'MNTS',
  'BRPH',
  'ASTR',
  'RKLB',
  'PL',
  'BWXT',
  'DRS',
  'HEI',
  'HEICO',
  'TDY',
  'TGI',
  'KTOS',
  'LDOS',
  'VEC',
  'PAE',
  'KEYW',
  'CACI',
  'SAIC',
  'BAH',
  'MANT',
  'VRSN',
  'IBM',
  'CSC',
  'DXC',
  'EPAM',
  'GLOB',
  'LNKD',
  'WIT',
  'INFY',
  'TCS',
  'HCL',
  'TECH.M',
  'HEXW',
  'MPHASIS',
  'SIFY',
  'GOOGL',
  'META',
  'AMZN',
  'MSFT',
  'AAPL',
  'NFLX',
  'SPOT',
  'SNDL',
  'LYFT',
  'CRM',
  'NOW',
  'WDAY',
  'VEEV',
  'PAYC',
  'PCTY',
  'SPSN',
  'SWTX',
  'TNET',
  'HRB',
  'ADP',
  'PAYX',
  'WU',
  'FIS',
  'FISV',
  'GPN',
  'MA',
  'V',
  'PYPL',
  'SQ',
  'XOM',
  'CVX',
  'COP',
  'EOG',
  'PXD',
  'DVN',
  'FANG',
  'OXY',
  'MPC',
  'VLO',
  'PSX',
  'HES',
  'MRO',
  'APA',
  'OKE',
  'WMB',
  'KMI',
  'ET',
  'EPD',
  'MMP',
  'NEE',
  'DUK',
  'SO',
  'AEP',
  'D',
  'EXC',
  'PCG',
  'PEG',
  'ES',
  'XEL',
  'ED',
  'ETR',
  'PPL',
  'FE',
  'CMS',
  'NI',
  'AES',
  'DTE',
  'WEC',
  'CNP',
  'WELL',
  'VTR',
  'PEAK',
  'HR',
  'OHI',
  'MPW',
  'SBRA',
  'CTRE',
  'LTC',
  'UHT',
  'AMT',
  'CCI',
  'SBAC',
  'SBA',
  'EQIX',
  'DLR',
  'QTS',
  'IRM',
  'CONE',
  'UNIT',
  'PLD',
  'PSA',
  'EXR',
  'LSI',
  'NSA',
  'CUBE',
  'REXR',
  'EGP',
  'LXP',
  'GTY',
  'O',
  'WPC',
  'NNN',
  'STOR',
  'SRC',
  'VICI',
  'GLPI',
  'PENN',
  'BYD',
  'CHDN',
  'MAR',
  'HLT',
  'IHG',
  'H',
  'CHH',
  'WH',
  'STAY',
  'RHP',
  'SHO',
  'APLE',
  'PK',
  'BHR',
  'CLDT',
  'CPLG',
  'INN',
  'SLCH',
  'SOHO',
  'XHR',
  'DH',
  'BTB',
  'SPG',
  'MAC',
  'CBL',
  'WPG',
  'TCO',
  'REG',
  'KIM',
  'AKR',
  'BRX',
  'ROIC',
  'EQR',
  'AVB',
  'ESSummons',
  'UDR',
  'MAA',
  'CPT',
  'NMI',
  'JBG',
  'AIRC',
  'IRT',
  'AMH',
  'INVH',
  'TRICON',
  'SFR',
  'NVR',
  'PHM',
  'TOL',
  'MDC',
  'LGIH',
  'CCS',
  'TMHC',
  'KBH',
  'BZH',
  'MHO',
  'SKY',
  'CVCO',
  'UCP',
  'GRBK',
  'TPH',
  'NWHM',
  'SCI',
  'CSV',
  'MATW',
  'HI',
  'FL',
  'PLCE',
  'ANF',
  'PVH',
  'RL',
  'G-III',
  'GES',
  'FOSL',
  'WWW',
  'BOOT',
  'CATO',
  'JWN',
  'DDS',
  'KSS',
  'M',
  'SSI',
  'BBBY',
  'BIG',
  'JCP',
  'TUEM',
  'EXPR',
  'ZUMZ',
  'HIBB',
  'SPWH',
  'BGFV',
  'CATO',
  'TGT',
  'WMT',
  'COST',
  'BJ',
  'SFM',
  'WINN',
  'ACI',
  'SVU',
  'CHEF',
  'CASY'
)

// ── Fetch OHLCV for a single symbol ───────────────────────────────────────────
async function fetchOHLCV(
  symbol: string,
  apiKey: string,
  signal: AbortSignal
): Promise<Bar[] | null> {
  try {
    const toDate = new Date().toISOString().split('T')[0]
    const from = new Date()
    from.setDate(from.getDate() - FETCH_CAL_DAYS)
    const fromDate = from.toISOString().split('T')[0]
    const res = await fetch(
      `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${fromDate}/${toDate}?adjusted=true&sort=asc&limit=1000&apiKey=${apiKey}`,
      { signal }
    )
    if (!res.ok) return null
    const json = await res.json()
    if (!json.results?.length) return null
    return (
      json.results as { t: number; o: number; h: number; l: number; c: number; v: number }[]
    ).map((r) => ({
      date: new Date(r.t).toISOString().split('T')[0],
      open: r.o,
      high: r.h,
      low: r.l,
      close: r.c,
      volume: r.v,
      t: r.t,
    }))
  } catch {
    return null
  }
}

// ── RP: Dark pool scanner (exact match to POIScreener logic) ──────────────────
type RawTrade = { sip_timestamp: number; price: number; size: number; exchange: number }

async function scanDPDays(
  dates: string[],
  symbol: string,
  apiKey: string,
  onProgress: (pct: number) => void,
  signal: AbortSignal
): Promise<DPDay[]> {
  let aborted = false
  signal.addEventListener('abort', () => {
    aborted = true
  })

  // Global semaphore: caps total in-flight Polygon requests across all workers + pagination
  const MAX_INFLIGHT = 20
  let _inflight = 0
  const _waiting: Array<() => void> = []
  const _acquire = (): Promise<void> => new Promise(resolve => {
    if (_inflight < MAX_INFLIGHT) { _inflight++; resolve() }
    else _waiting.push(() => { _inflight++; resolve() })
  })
  const _release = () => {
    _inflight--
    if (_waiting.length) _waiting.shift()!()
  }

  const fetchWindow = async (url: string): Promise<RawTrade[]> => {
    const trades: RawTrade[] = []
    let nextUrl: string | null = url
    let page = 0
    while (nextUrl && !aborted) {
      let res: Response
      await _acquire()
      try {
        res = await fetch(nextUrl)
      } catch (err) {
        _release()
        break
      }
      _release()
      if (!res.ok) {
        await res.text().catch(() => { })
        break
      }
      const json = await res.json()
      for (const t of json.results || []) trades.push(t)
      nextUrl = json.next_url ? json.next_url + `&apiKey=${apiKey}` : null
      page++
    }
    return trades
  }

  const SESSION_PREFIX = `poi_dp_${symbol}_`
  const todayStr = new Date().toISOString().split('T')[0]

  const readDPCache = (dk: string): DPDay | null => {
    if (dk === todayStr) return null
    try {
      const raw = sessionStorage.getItem(SESSION_PREFIX + dk)
      return raw ? (JSON.parse(raw) as DPDay) : null
    } catch { return null }
  }
  const writeDPCache = (dk: string, day: DPDay) => {
    if (dk === todayStr) return
    try { sessionStorage.setItem(SESSION_PREFIX + dk, JSON.stringify(day)) } catch { /* quota */ }
  }

  const resultMap: Record<string, DPDay> = {}
  const uncachedDates: string[] = []
  for (const dk of dates) {
    const cached = readDPCache(dk)
    if (cached) resultMap[dk] = cached
    else uncachedDates.push(dk)
  }

  const CONCURRENCY = 35
  const queue = [...uncachedDates]
  const total = dates.length
  let done = total - uncachedDates.length
  const maybeReport = () => onProgress(Math.round((done / total) * 100))
  maybeReport() // report cached progress immediately

  const fetchDayKey = async (dateKey: string): Promise<DPDay | null> => {
    const dayStartMs = new Date(dateKey).getTime()
    const d = new Date(dateKey + 'T12:00:00Z')
    const yr = d.getUTCFullYear()
    const marchSun = new Date(Date.UTC(yr, 2, 8))
    while (marchSun.getUTCDay() !== 0) marchSun.setUTCDate(marchSun.getUTCDate() + 1)
    const novSun = new Date(Date.UTC(yr, 10, 1))
    while (novSun.getUTCDay() !== 0) novSun.setUTCDate(novSun.getUTCDate() + 1)
    const isEDT = d >= marchSun && d < novSun
    const etOffsetMs = isEDT ? 4 * 3600_000 : 5 * 3600_000
    const rthOpenUtcMs = 9 * 3600_000 + 30 * 60_000 + etOffsetMs
    const rthCloseUtcMs = 16 * 3600_000 + 15 * 60_000 + etOffsetMs
    const rthStartNs = (dayStartMs + rthOpenUtcMs) * 1_000_000
    const rthEndNs = (dayStartMs + rthCloseUtcMs) * 1_000_000
    const WIN = 4
    const winNs = (rthEndNs - rthStartNs) / WIN
    const windowUrls = Array.from({ length: WIN }, (_, i) => {
      const s = rthStartNs + i * winNs
      const e = rthStartNs + (i + 1) * winNs
      return `https://api.polygon.io/v3/trades/${symbol}?timestamp.gte=${s}&timestamp.lte=${e}&limit=50000&order=asc&apiKey=${apiKey}`
    })
    try {
      const winResults = await Promise.all(windowUrls.map(fetchWindow))
      const allTrades: RawTrade[] = ([] as RawTrade[]).concat(...winResults)
      const dpTrades = allTrades.filter(
        (t) =>
          DARK_POOL_EXCHANGES.has(t.exchange) ||
          (!DARK_POOL_EXCHANGES.has(t.exchange) && t.size * t.price >= LIT_BLOCK_MIN_NOTIONAL)
      )
      if (dpTrades.length > 0) {
        const totalNotional = dpTrades.reduce((s, t) => s + t.size * t.price, 0)
        const sorted = [...dpTrades].sort((a, b) => b.size * b.price - a.size * a.price)
        const raw0 = sorted[0]
        return {
          date: dateKey,
          top10: sorted.slice(0, 10).map((t) => ({ price: t.price, size: t.size, ts: Math.floor(t.sip_timestamp / 1_000_000) })),
          totalNotional,
          topPrint: { price: raw0.price, size: raw0.size, ts: Math.floor(raw0.sip_timestamp / 1_000_000) },
        }
      }
    } catch { /* skip failed day */ }
    return null
  }

  const dpWorker = async () => {
    while (queue.length > 0 && !aborted) {
      const dateKey = queue.shift()!
      const day = await fetchDayKey(dateKey)
      if (day && !aborted) {
        resultMap[dateKey] = day
        writeDPCache(dateKey, day)
      }
      done++
      maybeReport()
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, Math.max(1, uncachedDates.length)) }, dpWorker))
  return Object.values(resultMap).filter((d) => d?.date != null).sort((a, b) => a.date.localeCompare(b.date))
}

// ── Combined Canvas Chart ─────────────────────────────────────────────────────
function StraddleChart({
  candles,
  events,
  dpDays,
  poiLevels,
  forceHeight,
}: {
  candles: Bar[]
  events: ContraEvent[]
  dpDays: DPDay[]
  poiLevels: POILevel[]
  forceHeight?: number
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const crosshairRef = useRef<{ cx: number; cy: number } | null>(null)
  const viewRef = useRef({ startIdx: 0, visibleCount: Math.max(candles.length, 10) })
  const [width, setWidth] = useState(900)
  const [height, setHeight] = useState(forceHeight ?? 749)

  useEffect(() => {
    if (forceHeight) setHeight(forceHeight)
    if (!containerRef.current) return
    const obs = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (rect?.width > 0) setWidth(Math.floor(rect.width))
      if (!forceHeight && rect?.height > 0) setHeight(Math.floor(rect.height))
    })
    obs.observe(containerRef.current)
    if (containerRef.current.clientWidth > 0) setWidth(containerRef.current.clientWidth)
    if (!forceHeight && containerRef.current.clientHeight > 0) setHeight(containerRef.current.clientHeight)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    viewRef.current = { startIdx: 0, visibleCount: candles.length }
  }, [candles])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || candles.length === 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const PAD = height < 300
      ? { top: 8, right: 60, bottom: 36, left: 4 }
      : { top: 20, right: 142, bottom: 62, left: 8 }
    const chartW = width - PAD.left - PAD.right
    const chartH = height - PAD.top - PAD.bottom

    const n = candles.length
    let { startIdx, visibleCount } = viewRef.current
    visibleCount = Math.max(10, Math.min(n, visibleCount))
    startIdx = Math.max(0, Math.min(n - visibleCount, startIdx))
    viewRef.current = { startIdx, visibleCount }
    const vis = candles.slice(startIdx, startIdx + visibleCount)

    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    ctx.scale(dpr, dpr)

    // Background
    const bgGrad = ctx.createLinearGradient(0, 0, 0, height)
    bgGrad.addColorStop(0, '#030a12')
    bgGrad.addColorStop(1, '#000000')
    ctx.fillStyle = bgGrad
    ctx.fillRect(0, 0, width, height)

    // Price range — based on visible candle highs/lows; include only POI prices in range
    const visHighs = vis.map((c) => c.high)
    const visLows = vis.map((c) => c.low)
    const candleMin = Math.min(...visLows)
    const candleMax = Math.max(...visHighs)
    const candleSpan = candleMax - candleMin
    // include POI prices that are within 20% of the candle span (don't distort scale for far-away levels)
    const poiPrices = poiLevels
      .map((l) => l.price)
      .filter((p) => p > 0 && p >= candleMin - candleSpan * 0.2 && p <= candleMax + candleSpan * 0.2)
    const rawMin = Math.min(candleMin, ...poiPrices)
    const rawMax = Math.max(candleMax, ...poiPrices)
    const padP = (rawMax - rawMin) * 0.05   // 5% margin above and below
    const pMin = rawMin - padP,
      pMax = rawMax + padP,
      pRange = pMax - pMin
    const pyFn = (p: number) => PAD.top + ((pMax - p) / pRange) * chartH

    // Candle layout
    const vc = vis.length
    const INNER = 18
    const spacing = (chartW - INNER * 2) / Math.max(vc, 1)
    const bw = Math.max(1.5, spacing * 0.62)
    const cxFn = (i: number) => PAD.left + INNER + i * spacing + spacing / 2

    // Grid lines
    ctx.lineWidth = 1
    for (let gi = 0; gi <= 5; gi++) {
      const gp = pMin + (gi / 5) * pRange
      const gy = Math.round(pyFn(gp)) + 0.5
      ctx.strokeStyle = gi === 2 || gi === 3 ? 'rgba(0,229,255,0.07)' : 'rgba(255,255,255,0.03)'
      ctx.beginPath()
      ctx.moveTo(PAD.left, gy)
      ctx.lineTo(width - PAD.right, gy)
      ctx.stroke()
      const label = gp >= 1000 ? gp.toFixed(0) : gp >= 100 ? gp.toFixed(1) : gp.toFixed(2)
      ctx.fillStyle = '#ffffff'
      ctx.font = '800 24px "JetBrains Mono",monospace'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(label, width - PAD.right + 8, gy)
    }

    // Y-axis border
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(width - PAD.right + 0.5, PAD.top)
    ctx.lineTo(width - PAD.right + 0.5, PAD.top + chartH)
    ctx.stroke()

    // X-axis border
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(PAD.left, PAD.top + chartH + 0.5)
    ctx.lineTo(width - PAD.right, PAD.top + chartH + 0.5)
    ctx.stroke()

    // ── POI level horizontal lines removed (bubbles only) ──────────────────────────
    const currentPrice = candles[n - 1]?.close ?? 0

    // ── Candles ──────────────────────────────────────────────────────────────
    for (let i = 0; i < vis.length; i++) {
      const c = vis[i],
        x = Math.round(cxFn(i)),
        isUp = c.close >= c.open
      const base = isUp ? '#00C853' : '#FF1744'
      const top = isUp ? '#69F0AE' : '#FF6D6D'
      const dark = isUp ? '#005C24' : '#8B0000'
      const bTop = Math.round(pyFn(Math.max(c.open, c.close)))
      const bBot = Math.round(pyFn(Math.min(c.open, c.close)))
      const bH = Math.max(1, bBot - bTop)
      const bX = x - Math.floor(bw / 2),
        bW = Math.ceil(bw)
      // Wick
      ctx.strokeStyle = base
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x + 0.5, Math.round(pyFn(c.high)))
      ctx.lineTo(x + 0.5, Math.round(pyFn(c.low)))
      ctx.stroke()
      // Body
      if (bH > 1 && bW >= 2) {
        const g = ctx.createLinearGradient(bX, bTop, bX + bW, bBot)
        g.addColorStop(0, top)
        g.addColorStop(0.4, base)
        g.addColorStop(1, dark)
        ctx.fillStyle = g
        ctx.fillRect(bX, bTop, bW, bH)
        const glossW = Math.max(1, Math.floor(bW * 0.35)),
          glossH = Math.max(1, Math.floor(bH * 0.45))
        const gl = ctx.createLinearGradient(bX, bTop, bX, bTop + glossH)
        gl.addColorStop(0, 'rgba(255,255,255,0.35)')
        gl.addColorStop(1, 'rgba(255,255,255,0)')
        ctx.fillStyle = gl
        ctx.fillRect(bX + 1, bTop + 1, glossW, glossH)
      } else {
        ctx.fillStyle = base
        ctx.fillRect(bX, bTop, bW, bH)
      }
    }

    // Current price label (no horizontal line)
    if (startIdx + visibleCount >= n) {
      const py = Math.round(pyFn(candles[n - 1].close)) + 0.5
      ctx.fillStyle = '#FF8C00'
      ctx.font = '900 24px "JetBrains Mono",monospace'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(candles[n - 1].close.toFixed(2), width - PAD.right + 8, py)
    }
    ctx.setLineDash([])
    ctx.globalAlpha = 1

    // ── Contraction diamond markers ───────────────────────────────────────────
    const dateToVisIdx = new Map<string, number>()
    for (let i = 0; i < vis.length; i++) dateToVisIdx.set(vis[i].date, i)

    const maxComp = events.length > 0 ? Math.max(...events.map((e) => e.compressionPct)) : 100
    ctx.save()
    for (const ev of events) {
      const visIdx = dateToVisIdx.get(ev.date)
      if (visIdx === undefined) continue
      const cx = cxFn(visIdx)
      // size the diamond first so we can offset below the low wick
      const norm = Math.sqrt(ev.compressionPct / maxComp)
      const r = Math.max(5, Math.min(22, norm * 22))
      // position center below the candle's low wick + 4px gap
      const candleLowY = pyFn(vis[visIdx].low)
      const cy = candleLowY + r + 4
      if (cy - r < PAD.top || cy > PAD.top + chartH + r) continue
      const baseG = ctx.createLinearGradient(cx, cy - r, cx, cy + r)
      baseG.addColorStop(0, 'rgba(255,200,60,0.95)')
      baseG.addColorStop(0.5, 'rgba(255,120,0,0.80)')
      baseG.addColorStop(1, 'rgba(180,50,0,0.60)')
      ctx.beginPath()
      ctx.moveTo(cx, cy - r)
      ctx.lineTo(cx + r, cy)
      ctx.lineTo(cx, cy + r)
      ctx.lineTo(cx - r, cy)
      ctx.closePath()
      ctx.fillStyle = baseG
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,220,80,0.95)'
      ctx.lineWidth = 1.5
      ctx.stroke()
      const gloss = ctx.createRadialGradient(
        cx - r * 0.25,
        cy - r * 0.3,
        r * 0.05,
        cx,
        cy - r * 0.1,
        r * 0.6
      )
      gloss.addColorStop(0, 'rgba(255,255,255,0.65)')
      gloss.addColorStop(0.5, 'rgba(255,255,255,0.15)')
      gloss.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.beginPath()
      ctx.moveTo(cx, cy - r)
      ctx.lineTo(cx + r, cy)
      ctx.lineTo(cx, cy + r)
      ctx.lineTo(cx - r, cy)
      ctx.closePath()
      ctx.fillStyle = gloss
      ctx.fill()
      const fs = Math.max(9, Math.min(13, r * 0.6))
      ctx.fillStyle = '#fff'
      ctx.font = `700 ${fs}px "JetBrains Mono",monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(`${ev.compressionPct.toFixed(0)}%`, cx, cy)
    }
    ctx.restore()

    // ── Dark pool bubble markers (top 10 by notional, DP days only) ──────────
    const BUBBLE_STYLES = [
      {
        base: ['rgba(255,160,40,0.75)', 'rgba(220,100,10,0.60)', 'rgba(140,50,0,0.40)'] as [
          string,
          string,
          string,
        ],
        rim: 'rgba(255,180,60,0.80)',
        dot: 'rgba(255,120,0,0.95)',
        lw: 1.2,
      },
      {
        base: ['rgba(80,180,255,0.70)', 'rgba(20,120,210,0.55)', 'rgba(0,60,140,0.35)'] as [
          string,
          string,
          string,
        ],
        rim: 'rgba(100,200,255,0.75)',
        dot: 'rgba(41,182,246,0.95)',
        lw: 1.0,
      },
      {
        base: ['rgba(245,245,245,0.80)', 'rgba(195,195,195,0.62)', 'rgba(110,110,110,0.35)'] as [
          string,
          string,
          string,
        ],
        rim: 'rgba(255,255,255,0.85)',
        dot: 'rgba(225,225,225,0.95)',
        lw: 1.0,
      },
      {
        base: ['rgba(160,160,160,0.70)', 'rgba(100,100,100,0.52)', 'rgba(50,50,50,0.30)'] as [
          string,
          string,
          string,
        ],
        rim: 'rgba(185,185,185,0.72)',
        dot: 'rgba(145,145,145,0.92)',
        lw: 0.9,
      },
      {
        base: ['rgba(115,115,115,0.48)', 'rgba(75,75,75,0.32)', 'rgba(35,35,35,0.15)'] as [
          string,
          string,
          string,
        ],
        rim: 'rgba(145,145,145,0.45)',
        dot: 'rgba(100,100,100,0.72)',
        lw: 0.8,
      },
    ]
    const sortedDP = [...dpDays]
      .filter((d) => d?.totalNotional > 0 && d?.topPrint)
      .sort((a, b) => b.totalNotional - a.totalNotional)
    const top10DP = sortedDP
      .slice(0, 10)
      .map((dp, i) => ({
        price: dp.topPrint.price,
        ts: dp.topPrint.ts,
        notional: dp.totalNotional,
        rank: i,
      }))
    const maxDPN = top10DP.length > 0 ? top10DP[0].notional : 1
    const candleMs = 86_400_000

    ctx.save()
    for (const print of top10DP) {
      const idx = vis.findIndex((c) => {
        const ds = Date.parse(c.date + 'T00:00:00Z')
        return print.ts >= ds && print.ts < ds + candleMs
      })
      if (idx === -1) continue
      const cx = cxFn(idx),
        py2 = pyFn(print.price)
      if (py2 < PAD.top || py2 > PAD.top + chartH) continue
      const r = Math.max(3.5, Math.min(20, Math.sqrt(print.notional / maxDPN) * 20))
      const s = BUBBLE_STYLES[Math.min(print.rank, 4)]
      const bg = ctx.createRadialGradient(cx, py2, r * 0.1, cx, py2, r)
      bg.addColorStop(0, s.base[0])
      bg.addColorStop(0.5, s.base[1])
      bg.addColorStop(1, s.base[2])
      ctx.beginPath()
      ctx.arc(cx, py2, r, 0, Math.PI * 2)
      ctx.fillStyle = bg
      ctx.fill()
      ctx.strokeStyle = s.rim
      ctx.lineWidth = s.lw
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(cx, py2, Math.max(2, r * 0.17), 0, Math.PI * 2)
      ctx.fillStyle = s.dot
      ctx.fill()
    }
    ctx.restore()

    // X-axis labels
    const xIdxs = [
      0,
      Math.floor(vc * 0.25),
      Math.floor(vc * 0.5),
      Math.floor(vc * 0.75),
      vc - 1,
    ].filter((v, i, a) => a.indexOf(v) === i && v < vc)
    ctx.fillStyle = '#ffffff'
    ctx.font = '700 24px "JetBrains Mono",monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    for (const i of xIdxs) ctx.fillText(fmtDate(vis[i].date), cxFn(i), height - PAD.bottom + 6)

    // Crosshair
    const ch = crosshairRef.current
    if (
      ch &&
      ch.cx >= PAD.left &&
      ch.cx <= width - PAD.right &&
      ch.cy >= PAD.top &&
      ch.cy <= PAD.top + chartH
    ) {
      ctx.save()
      ctx.setLineDash([4, 4])
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(Math.round(ch.cx) + 0.5, PAD.top)
      ctx.lineTo(Math.round(ch.cx) + 0.5, PAD.top + chartH)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(PAD.left, Math.round(ch.cy) + 0.5)
      ctx.lineTo(width - PAD.right, Math.round(ch.cy) + 0.5)
      ctx.stroke()
      ctx.setLineDash([])
      const priceAtCursor = pMax - ((ch.cy - PAD.top) / chartH) * pRange
      const pl =
        priceAtCursor >= 1000
          ? priceAtCursor.toFixed(0)
          : priceAtCursor >= 100
            ? priceAtCursor.toFixed(1)
            : priceAtCursor.toFixed(2)
      ctx.fillStyle = 'rgba(10,10,20,0.92)'
      ctx.fillRect(width - PAD.right + 1, Math.round(ch.cy) - 16, PAD.right - 2, 32)
      ctx.fillStyle = '#00E5FF'
      ctx.font = '700 17px "JetBrains Mono",monospace'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(pl, width - PAD.right + 6, Math.round(ch.cy))
      ctx.restore()
    }
  }, [candles, events, dpDays, poiLevels, width, height])

  useEffect(() => {
    draw()
  }, [draw])

  // Wheel zoom + drag (right-anchored, matches BuySellScanner)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || candles.length === 0) return
    const PAD_L = height < 300 ? 4 : 8
    const PAD_R = height < 300 ? 60 : 142

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      const n = candles.length
      const { visibleCount } = viewRef.current
      const factor = e.deltaY > 0 ? 1.12 : 0.89
      let newVC = Math.round(visibleCount * factor)
      newVC = Math.max(5, Math.min(n, newVC))
      const maxStart = Math.max(0, n - newVC)
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
      crosshairRef.current = { cx: e.clientX - rect.left, cy: e.clientY - rect.top }
      if (isDragging) {
        const { visibleCount } = viewRef.current
        const chartW = canvas.offsetWidth - PAD_L - PAD_R
        const delta = Math.round((dragStartX - e.clientX) * (visibleCount / chartW))
        const maxStart = Math.max(0, candles.length - visibleCount)
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
  }, [candles.length, width, height, draw])

  return (
    <div ref={containerRef} style={{ flex: 1, width: '100%', position: 'relative', minHeight: 0 }}>
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          display: 'block',
          cursor: 'grab',
          userSelect: 'none',
        }}
      />
      {/* Legend */}
      <div
        style={{
          position: 'absolute',
          top: 6,
          left: 14,
          display: 'flex',
          gap: 14,
          alignItems: 'center',
          pointerEvents: 'none',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div
            style={{
              width: 10,
              height: 10,
              background: 'linear-gradient(135deg,rgba(255,200,60,0.95),rgba(255,120,0,0.8))',
              border: '1px solid rgba(255,220,80,0.95)',
              transform: 'rotate(45deg)',
            }}
          />
          <span
            style={{
              color: '#fff',
              fontSize: 10,
              fontFamily: 'JetBrains Mono,monospace',
              fontWeight: 700,
            }}
          >
            CONTRACTION
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <svg width="12" height="12">
            <circle
              cx="6"
              cy="6"
              r="5"
              fill="rgba(255,140,40,0.8)"
              stroke="rgba(255,180,60,0.8)"
              strokeWidth="1"
            />
          </svg>
          <span
            style={{
              color: '#fff',
              fontSize: 10,
              fontFamily: 'JetBrains Mono,monospace',
              fontWeight: 700,
            }}
          >
            POI
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Straddle Trade Card ───────────────────────────────────────────────────────
function TradeCard({
  trade,
  symbol,
  side,
}: {
  trade: StraddleTrade
  symbol: string
  side: 'call' | 'put'
}) {
  const isCall = side === 'call'
  const accent = isCall ? '#00FF88' : '#FF4060'
  const accentDim = isCall ? 'rgba(0,255,136,0.12)' : 'rgba(255,64,96,0.12)'
  const accentBorder = isCall ? 'rgba(0,255,136,0.25)' : 'rgba(255,64,96,0.25)'

  const strike = isCall ? trade.callStrike : trade.putStrike
  const entry = isCall ? trade.callEntry : trade.putEntry
  const t1Stock = isCall ? trade.callT1Stock : trade.putT1Stock
  const t1Prem = isCall ? trade.callT1Premium : trade.putT1Premium
  const t2Stock = isCall ? trade.callT2Stock : trade.putT2Stock
  const t2Prem = isCall ? trade.callT2Premium : trade.putT2Premium
  const stop = isCall ? trade.callStop : trade.putStop

  const t1PremChange = entry > 0 ? ((t1Prem - entry) / entry) * 100 : 0
  const t2PremChange = entry > 0 ? ((t2Prem - entry) / entry) * 100 : 0
  const t1StockChange = ((t1Stock - trade.currentPrice) / trade.currentPrice) * 100
  const t2StockChange = ((t2Stock - trade.currentPrice) / trade.currentPrice) * 100

  const mono: React.CSSProperties = { fontFamily: 'JetBrains Mono, monospace' }

  const Row = ({
    label,
    stockPrice,
    stockChg,
    premium,
    premChg,
    color,
  }: {
    label: string
    stockPrice: number
    stockChg: number
    premium: number
    premChg: number
    color: string
  }) => (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '64px 1fr 1fr',
        gap: 0,
        padding: '9px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      <div
        style={{
          ...mono,
          fontSize: 16,
          fontWeight: 800,
          color: 'rgba(255,255,255,0.5)',
          letterSpacing: '1.5px',
          alignSelf: 'center',
        }}
      >
        {label}
      </div>
      <div>
        <div style={{ ...mono, fontSize: 22, fontWeight: 700, color }}>
          ${stockPrice.toFixed(2)}
        </div>
        <div style={{ ...mono, fontSize: 16, fontWeight: 600, color: `${color}99` }}>
          {stockChg >= 0 ? '+' : ''}
          {stockChg.toFixed(1)}% stk
        </div>
      </div>
      <div>
        <div style={{ ...mono, fontSize: 22, fontWeight: 700, color: '#ffffff' }}>
          ${premium.toFixed(2)}
        </div>
        <div
          style={{
            ...mono,
            fontSize: 16,
            fontWeight: 600,
            color: premChg >= 0 ? '#00FF88' : '#FF4060',
          }}
        >
          {premChg >= 0 ? '+' : ''}
          {premChg.toFixed(0)}% opt
        </div>
      </div>
    </div>
  )

  return (
    <div
      style={{
        background: 'linear-gradient(160deg, #060d16 0%, #020609 100%)',
        border: `1px solid ${accentBorder}`,
        borderTop: `2px solid ${accent}`,
        borderRadius: 6,
        overflow: 'hidden',
        boxShadow: `0 0 24px ${accentDim}`,
      }}
    >
      {/* Card header */}
      <div
        style={{
          padding: '12px 16px 8px',
          background: accentDim,
          borderBottom: `1px solid ${accentBorder}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <span
            style={{
              ...mono,
              fontSize: 29,
              fontWeight: 800,
              color: accent,
              letterSpacing: '1.5px',
            }}
          >
            {isCall ? '▲ CALL' : '▼ PUT'}
          </span>
          <span
            style={{
              ...mono,
              fontSize: 21,
              fontWeight: 700,
              color: 'rgba(255,255,255,0.7)',
              marginLeft: 12,
            }}
          >
            {symbol} ${strike} {isCall ? 'CALL' : 'PUT'}
          </span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ ...mono, fontSize: 17, fontWeight: 700, color: 'rgba(255,255,255,0.55)' }}>
            EXP {fmtExpiry(trade.expiration)}
          </div>
          <div style={{ ...mono, fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,0.4)' }}>
            {trade.dte}DTE · IV {(trade.iv * 100).toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Entry row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '64px 1fr 1fr',
          gap: 0,
          padding: '10px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          background: 'rgba(255,255,255,0.02)',
        }}
      >
        <div
          style={{
            ...mono,
            fontSize: 16,
            fontWeight: 800,
            color: 'rgba(255,255,255,0.5)',
            letterSpacing: '1.5px',
            alignSelf: 'center',
          }}
        >
          ENTRY
        </div>
        <div style={{ ...mono, fontSize: 22, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>
          ${entry.toFixed(2)}
        </div>
        <div style={{ ...mono, fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,0.45)' }}>
          per contract
          <br />
          x100 = ${(entry * 100).toFixed(0)}
        </div>
      </div>

      {/* Column headers */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '64px 1fr 1fr',
          gap: 0,
          padding: '5px 16px',
          background: 'rgba(0,0,0,0.4)',
        }}
      >
        <div
          style={{
            ...mono,
            fontSize: 14,
            fontWeight: 800,
            color: 'rgba(255,255,255,0.3)',
            letterSpacing: '1.5px',
          }}
        >
          LEVEL
        </div>
        <div
          style={{
            ...mono,
            fontSize: 14,
            fontWeight: 800,
            color: 'rgba(255,255,255,0.3)',
            letterSpacing: '1.5px',
          }}
        >
          STOCK PRICE
        </div>
        <div
          style={{
            ...mono,
            fontSize: 14,
            fontWeight: 800,
            color: 'rgba(255,255,255,0.3)',
            letterSpacing: '1.5px',
          }}
        >
          OPTION PREMIUM
        </div>
      </div>

      <Row
        label="T1"
        stockPrice={t1Stock}
        stockChg={t1StockChange}
        premium={t1Prem}
        premChg={t1PremChange}
        color={isCall ? '#00FF88' : '#FF4060'}
      />
      <Row
        label="T2"
        stockPrice={t2Stock}
        stockChg={t2StockChange}
        premium={t2Prem}
        premChg={t2PremChange}
        color={isCall ? '#00E87A' : '#FF2048'}
      />

      {/* Stop loss */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '64px 1fr 1fr',
          gap: 0,
          padding: '9px 16px',
        }}
      >
        <div
          style={{
            ...mono,
            fontSize: 16,
            fontWeight: 800,
            color: 'rgba(255,100,80,0.8)',
            letterSpacing: '1.5px',
            alignSelf: 'center',
          }}
        >
          STOP
        </div>
        <div>
          <div style={{ ...mono, fontSize: 22, fontWeight: 700, color: '#FF6040' }}>
            ${stop.toFixed(2)}
          </div>
          <div style={{ ...mono, fontSize: 16, fontWeight: 600, color: 'rgba(255,96,64,0.7)' }}>
            -50% of entry
          </div>
        </div>
        <div
          style={{
            ...mono,
            fontSize: 16,
            fontWeight: 600,
            color: 'rgba(255,96,64,0.55)',
            alignSelf: 'center',
          }}
        >
          If option drops to ${stop.toFixed(2)}, exit full position
        </div>
      </div>
    </div>
  )
}

// ── Results Table ─────────────────────────────────────────────────────────────
function fmtNotional(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

function ResultsTable({
  results,
  onSelect,
  onScanPOI,
  poiLoadingSet,
}: {
  results: ScanResult[]
  onSelect: (r: ScanResult) => void
  onScanPOI: (r: ScanResult) => void
  poiLoadingSet: Set<string>
}) {
  const mono: React.CSSProperties = { fontFamily: 'JetBrains Mono, monospace' }

  const sorted = [...results].sort((a, b) => {
    if (a.setupActive !== b.setupActive) return a.setupActive ? -1 : 1
    return b.compressionPct - a.compressionPct
  })
  if (!sorted.length) return null

  type Tier = { label: string; emoji: string; accent: string; items: ScanResult[] }
  const tiers: Tier[] = [
    { label: 'EXTREME COMPRESSION', emoji: '🔥', accent: '#FFD700', items: [] },
    { label: 'STRONG COMPRESSION', emoji: '⚡', accent: '#9B30FF', items: [] },
    { label: 'MODERATE COMPRESSION', emoji: '◆', accent: '#41B6F6', items: [] },
  ]
  for (const r of sorted) {
    if (r.compressionPct >= 65) tiers[0].items.push(r)
    else if (r.compressionPct >= 50) tiers[1].items.push(r)
    else tiers[2].items.push(r)
  }

  const compressColor = (pct: number) => {
    if (pct >= 65) return '#FFD700'  // extreme → gold
    if (pct >= 50) return '#9B30FF'  // strong  → purple
    return '#41B6F6'                 // moderate → blue
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, alignItems: 'start', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      {tiers.map(tier => (
        <div key={tier.label} style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
          {/* Tier header */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            borderBottom: `2px solid ${tier.accent}33`,
            paddingBottom: 8, marginBottom: 14,
            flexShrink: 0,
          }}>
            <span style={{ fontSize: 22 }}>{tier.emoji}</span>
            <span style={{ ...mono, fontSize: 14, fontWeight: 900, color: tier.accent, letterSpacing: '2px' }}>
              {tier.label}
            </span>
            <span style={{ ...mono, fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.3)', marginLeft: 4 }}>
              {tier.items.length}
            </span>
          </div>

          {/* Cards stacked vertically per tier — independently scrollable */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, overflowY: 'auto', minHeight: 0, paddingRight: 4 }}>
            {tier.items.map(r => {
              const latestEvt = r.recentEvents[r.recentEvents.length - 1]
              const poiDate = r.topPOI?.dates?.[r.topPOI.dates.length - 1] ?? null
              const prevClose = r.bars.length >= 2 ? r.bars[r.bars.length - 2].close : null
              const dayChangePct = prevClose ? ((r.currentPrice - prevClose) / prevClose) * 100 : null
              const dayChangeColor = dayChangePct == null ? '#FFFFFF' : dayChangePct >= 0 ? '#00FF88' : '#FF4060'
              return (
                <div
                  key={r.symbol}
                  style={{
                    background: '#000000',
                    border: `2px solid ${compressColor(r.compressionPct)}`,
                    borderRadius: 6,
                    padding: '14px 16px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    transition: 'border-color 0.15s, background 0.15s',
                    boxShadow: `0 0 10px ${compressColor(r.compressionPct)}22`,
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = '#080808'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = '#000000'
                  }}
                >
                  {/* Row 1: Symbol + price + day change + date + squeeze + compress badge */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ ...mono, fontSize: 24, fontWeight: 900, color: '#FFFFFF', letterSpacing: '1px' }}>
                        {r.symbol}
                      </span>
                      <span style={{ ...mono, fontSize: 16, fontWeight: 700, color: '#FFFFFF' }}>
                        ${r.currentPrice >= 1000 ? r.currentPrice.toFixed(0) : r.currentPrice.toFixed(2)}
                      </span>
                      {dayChangePct != null && (
                        <span style={{ ...mono, fontSize: 14, fontWeight: 700, color: dayChangeColor }}>
                          {dayChangePct >= 0 ? '+' : ''}{dayChangePct.toFixed(2)}%
                        </span>
                      )}
                      <span style={{ ...mono, fontSize: 15, fontWeight: 700, color: '#FFFFFF' }}>
                        📅 {latestEvt ? fmtDate(latestEvt.date) : '—'}
                      </span>
                      {r.squeezeOn && (
                        <span style={{
                          ...mono, fontSize: 12, fontWeight: 700,
                          color: '#00FF88',
                        }}>
                          ● SQZ ON
                        </span>
                      )}
                    </div>
                    <div style={{
                      ...mono, fontSize: 20, fontWeight: 900,
                      color: compressColor(r.compressionPct),
                      background: `${compressColor(r.compressionPct)}18`,
                      border: `1px solid ${compressColor(r.compressionPct)}44`,
                      borderRadius: 4,
                      padding: '3px 10px',
                    }}>
                      {r.compressionPct.toFixed(0)}%
                    </div>
                  </div>

                  {/* Row 3: POI info — two separate rows */}
                  {r.hasPOI && r.topPOI ? (
                    <div style={{
                      background: 'linear-gradient(160deg, rgba(8,14,32,0.98) 0%, rgba(5,9,22,0.99) 55%, rgba(2,5,14,1) 100%)',
                      border: '1px solid rgba(60,100,220,0.30)',
                      borderRadius: 6,
                      padding: '10px 12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                      boxShadow: 'inset 0 1px 0 rgba(100,160,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.7), 0 2px 10px rgba(0,0,0,0.7)',
                    }}>
                      {/* POI price + date + trade cost */}
                      <div style={{ ...mono, fontSize: 20, fontWeight: 800, color: '#FFFFFF', letterSpacing: '0.5px' }}>
                        Point of Interest : <span style={{ color: '#FFAA28' }}>${r.topPOI.price.toFixed(2)}</span>
                        {poiDate && (
                          <span style={{ fontWeight: 600, color: '#FFFFFF', marginLeft: 12 }}>
                            {fmtExpiry(poiDate)}
                          </span>
                        )}
                        {r.trade && (
                          <span style={{ marginLeft: 16, fontSize: 17, fontWeight: 800, color: '#FF8C00', letterSpacing: '0.5px' }}>
                            Trade Cost : <span style={{ color: '#FF2040', fontWeight: 900 }}>-${r.trade.totalCost.toFixed(0)}</span>
                          </span>
                        )}
                      </div>
                      {/* Strikes + targets — two columns */}
                      {r.trade ? (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 4 }}>
                          {/* UPSIDE column */}
                          <div style={{
                            ...mono, display: 'flex', flexDirection: 'column', gap: 8,
                            background: 'linear-gradient(160deg, rgba(0,30,12,0.97) 0%, rgba(0,18,8,1) 100%)',
                            border: '1px solid rgba(0,255,0,0.18)',
                            borderTop: '2px solid #00FF00',
                            borderRadius: 5,
                            padding: '12px 14px',
                            boxShadow: 'inset 0 1px 0 rgba(0,255,80,0.08), 0 2px 8px rgba(0,0,0,0.5)',
                          }}>
                            {/* Row 1: centered label */}
                            <div style={{ textAlign: 'center', color: '#00FF00', fontSize: 14, fontWeight: 900, letterSpacing: '2px' }}>↑ UPSIDE</div>
                            {/* Row 2: strike + expiry + price */}
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', fontSize: 16, fontWeight: 700, justifyContent: 'center' }}>
                              <span style={{ color: '#FFFFFF', fontWeight: 900 }}>${r.trade.callStrike.toFixed(0)} Calls</span>
                              <span style={{ color: '#FFFFFF' }}>{fmtExpiry(r.trade.expiration)}</span>
                              <span style={{ color: '#FFD080', fontWeight: 800 }}>@${r.trade.callEntry.toFixed(2)}</span>
                            </div>
                            {/* Row 3: targets side by side */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                              <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                                <span style={{ color: '#00FF00', fontSize: 16, fontWeight: 900, letterSpacing: '1.5px' }}>Target #1</span>
                                <span style={{ color: '#00FF00', fontSize: 18, fontWeight: 900 }}>${r.trade.callT1Stock.toFixed(2)}</span>
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                                <span style={{ color: '#00FF00', fontSize: 16, fontWeight: 900, letterSpacing: '1.5px' }}>Target #2</span>
                                <span style={{ color: '#00FF00', fontSize: 18, fontWeight: 900 }}>${r.trade.callT2Stock.toFixed(2)}</span>
                              </div>
                            </div>
                          </div>
                          {/* DOWNSIDE column */}
                          <div style={{
                            ...mono, display: 'flex', flexDirection: 'column', gap: 8,
                            background: 'linear-gradient(160deg, rgba(30,0,8,0.97) 0%, rgba(18,0,4,1) 100%)',
                            border: '1px solid rgba(255,32,64,0.18)',
                            borderTop: '2px solid #FF2040',
                            borderRadius: 5,
                            padding: '12px 14px',
                            boxShadow: 'inset 0 1px 0 rgba(255,50,80,0.08), 0 2px 8px rgba(0,0,0,0.5)',
                          }}>
                            {/* Row 1: centered label */}
                            <div style={{ textAlign: 'center', color: '#FF2040', fontSize: 14, fontWeight: 900, letterSpacing: '2px' }}>↓ DOWNSIDE</div>
                            {/* Row 2: strike + expiry + price */}
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', fontSize: 16, fontWeight: 700, justifyContent: 'center' }}>
                              <span style={{ color: '#FFFFFF', fontWeight: 900 }}>${r.trade.putStrike.toFixed(0)} Puts</span>
                              <span style={{ color: '#FFFFFF' }}>{fmtExpiry(r.trade.expiration)}</span>
                              <span style={{ color: '#FFD080', fontWeight: 800 }}>@${r.trade.putEntry.toFixed(2)}</span>
                            </div>
                            {/* Row 3: targets side by side */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                              <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                                <span style={{ color: '#FF2040', fontSize: 16, fontWeight: 900, letterSpacing: '1.5px' }}>Target #1</span>
                                <span style={{ color: '#FF2040', fontSize: 18, fontWeight: 900 }}>${r.trade.putT1Stock.toFixed(2)}</span>
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                                <span style={{ color: '#FF2040', fontSize: 16, fontWeight: 900, letterSpacing: '1.5px' }}>Target #2</span>
                                <span style={{ color: '#FF2040', fontSize: 18, fontWeight: 900 }}>${r.trade.putT2Stock.toFixed(2)}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div style={{ ...mono, fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>— no trade data</div>
                      )}
                    </div>
                  ) : r.poiScanPending ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <button
                        disabled={poiLoadingSet.has(r.symbol)}
                        onClick={e => { e.stopPropagation(); onScanPOI(r) }}
                        style={{
                          ...mono,
                          fontSize: 12,
                          fontWeight: 800,
                          letterSpacing: '1.5px',
                          color: poiLoadingSet.has(r.symbol) ? 'rgba(255,255,255,0.35)' : '#FFAA28',
                          background: poiLoadingSet.has(r.symbol) ? 'rgba(255,255,255,0.04)' : 'rgba(255,170,40,0.10)',
                          border: `1px solid ${poiLoadingSet.has(r.symbol) ? 'rgba(255,255,255,0.12)' : 'rgba(255,170,40,0.35)'}`,
                          borderRadius: 4,
                          padding: '6px 14px',
                          cursor: poiLoadingSet.has(r.symbol) ? 'default' : 'pointer',
                          transition: 'all 0.15s',
                        }}
                      >
                        {poiLoadingSet.has(r.symbol) ? '⏳ SCANNING POI...' : '🔍 SCAN POI'}
                      </button>
                      {!poiLoadingSet.has(r.symbol) && (
                        <span style={{ ...mono, fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
                          high-volume — manual scan
                        </span>
                      )}
                    </div>
                  ) : (
                    <div style={{ ...mono, fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.5px' }}>
                      — no POI detected in scan window
                    </div>
                  )}

                  {/* Row 4: Inline chart */}
                  <div style={{ height: 280, borderRadius: 4, overflow: 'hidden', marginTop: 4, display: 'flex', flexDirection: 'column' }}>
                    <StraddleChart
                      candles={r.bars.slice(-CHART_VISIBLE_DAYS)}
                      events={r.allEvents}
                      dpDays={r.dpDays}
                      poiLevels={r.poiLevels}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Signal Card ───────────────────────────────────────────────────────────────
// ── Main Component ─────────────────────────────────────────────────────────────
export default function StraddleTownScreener() {
  const mono: React.CSSProperties = { fontFamily: 'JetBrains Mono, monospace' }
  const API_KEY = process.env.NEXT_PUBLIC_POLYGON_API_KEY ?? ''
  const abortRef = useRef<AbortController | null>(null)

  // ── Screener state ─────────────────────────────────────────────────────────
  type Phase = 'idle' | 'fetching-symbols' | 'scanning-ohlcv' | 'scanning-dp' | 'done' | 'error'
  const [phase, setPhase] = useState<Phase>('idle')
  const [stats, setStats] = useState<ScanStats>({
    totalSymbols: 0,
    ohlcvDone: 0,
    contractionHits: 0,
    dpDone: 0,
    setupsFound: 0,
  })
  const [results, setResults] = useState<ScanResult[]>([])
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [poiLoadingSet, setPoiLoadingSet] = useState<Set<string>>(new Set())
  type ViewMode = 'setups' | 'all' | 'poi-only' | 'contraction-only'
  type BubbleFilter = 'all' | 'gold' | 'blue' | 'gray'
  const [viewMode, setViewMode] = useState<ViewMode>('setups')
  const [minCompression, setMinCompression] = useState<number>(40)
  const [bubbleFilter, setBubbleFilter] = useState<BubbleFilter>('all')
  const [sqzOnly, setSqzOnly] = useState(false)

  // ── Detail view state (when user clicks a row) ─────────────────────────────
  const [selected, setSelected] = useState<ScanResult | null>(null)
  const [selectedFromTickerSearch, setSelectedFromTickerSearch] = useState(false)

  // ── Individual ticker search ───────────────────────────────────────────────
  const [tickerSearch, setTickerSearch] = useState('')
  const [tickerScanning, setTickerScanning] = useState(false)

  const addResult = useCallback((r: ScanResult) => {
    setResults((prev) => {
      const next = [...prev.filter((x) => x.symbol !== r.symbol), r]
      return next.sort((a, b) => {
        if (a.setupActive !== b.setupActive) return a.setupActive ? -1 : 1
        return b.compressionPct - a.compressionPct
      })
    })
  }, [])

  const run = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const { signal } = controller

    setPhase('fetching-symbols')
    setResults([])
    setSelected(null)
    setErrorMsg(null)
    setStats({ totalSymbols: 0, ohlcvDone: 0, contractionHits: 0, dpDone: 0, setupsFound: 0 })

    try {
      // ── Phase 1: fetch symbol universe ───────────────────────────────────
      const symbols = await fetchTopSymbols(API_KEY, MAX_SYMBOLS, signal)
      console.log(`[ST] Phase1 done — symbols=${symbols.length} | API_KEY present=${!!API_KEY}`)
      if (signal.aborted) return
      if (!symbols.length) {
        // shouldn't happen since hardcoded fallback is always non-empty
        throw new Error('Symbol universe is empty')
      }

      // reset debug counters for this scan run
      _dbg.hvLow = 0; _dbg.compLow = 0; _dbg.trending = 0; _dbg.notTight = 0; _dbg.pass = 0; _dbg.sampled = 0

      setStats((s) => ({ ...s, totalSymbols: symbols.length }))
      setPhase('scanning-ohlcv')

      // ── Phase 2: OHLCV + contraction scan (concurrent batches) ───────────
      // contractionHits collects [symbol, bars, allEvents, recentEvents]
      const contractionHits: {
        symbol: string
        bars: Bar[]
        allEvents: ContraEvent[]
        recentEvents: ContraEvent[]
      }[] = []

      let _ohlcvNull = 0, _ohlcvShort = 0, _ohlcvOk = 0, _noEvts = 0, _hasEvts = 0
      let _taskAborted = 0, _taskThrew = 0

      console.log(`[ST] Pre-Phase2 signal.aborted=${signal.aborted} | tasks=${symbols.length}`)

      // ── raw fetch probe: bypass fetchOHLCV wrapper, add 8s timeout ─────────
      {
        const testSym = symbols[0]
        const toDate = new Date().toISOString().split('T')[0]
        const from = new Date(); from.setDate(from.getDate() - FETCH_CAL_DAYS)
        const fromDate = from.toISOString().split('T')[0]
        const testUrl = `https://api.polygon.io/v2/aggs/ticker/${testSym}/range/1/day/${fromDate}/${toDate}?adjusted=true&sort=asc&limit=5&apiKey=${API_KEY}`
        console.log(`[ST] Raw probe start: ${testSym} | url=${testUrl.replace(API_KEY, 'KEY')}`)
        const timeout = new Promise<'timeout'>((res) => setTimeout(() => res('timeout'), 8000))
        const t0 = Date.now()
        try {
          const winner = await Promise.race([fetch(testUrl, { signal }), timeout])
          if (winner === 'timeout') {
            console.error(`[ST] Raw probe TIMED OUT after 8s — fetch is hanging (likely rate-limited or firewall drop)`)
          } else {
            const res = winner as Response
            console.log(`[ST] Raw probe HTTP ${res.status} ${res.statusText} in ${Date.now() - t0}ms`)
            const text = await res.text().catch(() => '(could not read body)')
            console.log(`[ST] Raw probe body snippet: ${text.slice(0, 300)}`)
          }
        } catch (e: unknown) {
          console.error(`[ST] Raw probe threw in ${Date.now() - t0}ms:`, e)
        }
      }

      const ohlcvTasks = symbols.map((sym) => async () => {
        if (signal.aborted) { _taskAborted++; return }
        let bars: Bar[] | null = null
        try {
          bars = await fetchOHLCV(sym, API_KEY, signal)
        } catch (e: unknown) {
          _taskThrew++
          if (_taskThrew <= 2) console.error(`[ST] fetchOHLCV threw for ${sym}:`, e)
          return
        }
        if (!bars) { _ohlcvNull++; return }
        if (bars.length < 120) { _ohlcvShort++; return }
        _ohlcvOk++

        const allEvts = scanHistory(bars)
        const lastNDates = new Set(bars.slice(-SCAN_TRADING_DAYS).map((b) => b.date))
        const recentEvts = allEvts.filter((e) => lastNDates.has(e.date))

        setStats((s) => ({ ...s, ohlcvDone: s.ohlcvDone + 1 }))

        const strongRecentEvts = recentEvts.filter((e) => e.compressionPct > CONTRACTION_THRESHOLD)
        if (strongRecentEvts.length > 0) {
          _hasEvts++
          contractionHits.push({ symbol: sym, bars, allEvents: allEvts, recentEvents: strongRecentEvts })
          setStats((s) => ({ ...s, contractionHits: s.contractionHits + 1 }))
        } else {
          _noEvts++
          if (_noEvts === 1) {
            const lastBar = bars[bars.length - 1]
            const avgHV = calcHV4D(bars)
            const lb4 = bars.slice(-4)
            const h4 = Math.max(...lb4.map((b) => b.high))
            const l4 = Math.min(...lb4.map((b) => b.low))
            const rangePercent = (h4 - l4) / l4 * 100
            const compressionPct = avgHV ? ((avgHV - rangePercent) / avgHV) * 100 : NaN
            console.log(`[ST] First zero-event sample: ${sym} | bars=${bars.length} allEvts=${allEvts.length} lastDate=${lastBar.date} lastClose=${lastBar.close.toFixed(2)} avgHV=${avgHV.toFixed(2)} rangePercent=${rangePercent.toFixed(2)} compressionPct=${compressionPct.toFixed(1)} lastNDates=[${[...lastNDates].join(',')}]`)
          }
        }
      })

      await runWithConcurrency(ohlcvTasks, OHLCV_CONCURRENCY, undefined, signal)
      console.log(`[ST] Phase2 done — taskAborted=${_taskAborted} taskThrew=${_taskThrew} ohlcvNull=${_ohlcvNull} ohlcvShort=${_ohlcvShort} ohlcvOk=${_ohlcvOk} | noEvts=${_noEvts} contractionHits=${_hasEvts} | post-signal.aborted=${signal.aborted}`)
      console.log(`[ST] detectContraction fail reasons — hvLow=${_dbg.hvLow} compressionLow=${_dbg.compLow} trending=${_dbg.trending} notTight=${_dbg.notTight} | pass=${_dbg.pass}`)
      if (signal.aborted) return

      // ── Phase 3: dark pool scan — sequential per contraction hit ─────────
      setPhase('scanning-dp')

      for (const hit of contractionHits) {
        if (signal.aborted) break
        const { symbol: sym, bars, allEvents: allEvts, recentEvents: recentEvts } = hit

        const daysToScan = bars.slice(-DP_LOOKBACK_DAYS).map((b) => b.date)

        if (MAG8_SYMBOLS.has(sym)) {
          // High-volume symbol — skip auto POI scan, let user trigger it manually
          const latestEvt = recentEvts[recentEvts.length - 1]
          const pendingResult: ScanResult = {
            symbol: sym,
            currentPrice: bars[bars.length - 1].close,
            compressionPct: latestEvt?.compressionPct ?? 0,
            squeezeOn: latestEvt?.squeezeOn ?? false,
            hasPOI: false,
            topPOI: null,
            setupActive: false,
            bars,
            allEvents: allEvts,
            recentEvents: recentEvts,
            dpDays: [],
            poiLevels: [],
            trade: null,
            poiScanPending: true,
          }
          addResult(pendingResult)
          setStats((s) => ({ ...s, dpDone: s.dpDone + 1 }))
          continue
        }

        const dpResults = await scanDPDays(daysToScan, sym, API_KEY, () => undefined, signal)
        if (signal.aborted) break

        const poi = clusterPOI(dpResults)
        // Require the POI cluster to have at least one DP print within the last 3 calendar days
        const poiCutoff = new Date()
        poiCutoff.setDate(poiCutoff.getDate() - 3)
        const poiCutoffStr = poiCutoff.toISOString().split('T')[0]
        const recentPOI = poi.filter(p => p.dates.some(d => d >= poiCutoffStr))
        const hasPOI = recentPOI.length > 0
        const setupActive = recentEvts.length > 0 && hasPOI

        const latestEvent = recentEvts[recentEvts.length - 1]
        const compressionPct = latestEvent?.compressionPct ?? 0
        const bubbleTier = getTopPOIBubbleTier(dpResults, recentPOI[0] ?? null)
        const isThur = new Date().getDay() === 4
        const minDays = compressionPct >= 65 && !isThur ? 0 : compressionPct >= 65 ? 8 : compressionPct >= 50 ? 7 : (bubbleTier !== 'gray' ? 0 : 21)
        const realExpiry = setupActive ? await fetchNearestRealExpiry(sym, minDays, API_KEY) : undefined
        const trade = setupActive ? buildStraddleTrade(bars, sym, compressionPct, bubbleTier, realExpiry) : null

        const result: ScanResult = {
          symbol: sym,
          currentPrice: bars[bars.length - 1].close,
          compressionPct: latestEvent?.compressionPct ?? 0,
          squeezeOn: latestEvent?.squeezeOn ?? false,
          hasPOI,
          topPOI: recentPOI[0] ?? null,
          setupActive,
          bars,
          allEvents: allEvts,
          recentEvents: recentEvts,
          dpDays: dpResults,
          poiLevels: recentPOI,
          trade,
        }

        addResult(result)
        setStats((s) => ({
          ...s,
          dpDone: s.dpDone + 1,
          setupsFound: s.setupsFound + (setupActive ? 1 : 0),
        }))
      }

      setPhase('done')
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') return
      setErrorMsg(err instanceof Error ? err.message : 'Scan failed')
      setPhase('error')
    }
  }, [API_KEY, addResult])

  // ── On-demand POI scan for Mag 8 cards ────────────────────────────────────
  const scanPoiForSymbol = useCallback(async (r: ScanResult) => {
    const sym = r.symbol
    setPoiLoadingSet(prev => new Set([...prev, sym]))
    try {
      const ac = new AbortController()
      const daysToScan = r.bars.slice(-DP_LOOKBACK_DAYS).map(b => b.date)
      const dpResults = await scanDPDays(daysToScan, sym, API_KEY, () => undefined, ac.signal)
      const poi = clusterPOI(dpResults)
      const poiCutoff = new Date()
      poiCutoff.setDate(poiCutoff.getDate() - 3)
      const poiCutoffStr = poiCutoff.toISOString().split('T')[0]
      const recentPOI = poi.filter(p => p.dates.some(d => d >= poiCutoffStr))
      const hasPOI = recentPOI.length > 0
      const setupActive = r.recentEvents.length > 0 && hasPOI
      const latestEvent = r.recentEvents[r.recentEvents.length - 1]
      const compressionPct = latestEvent?.compressionPct ?? 0
      const bubbleTier = getTopPOIBubbleTier(dpResults, recentPOI[0] ?? null)
      const isThursday2 = new Date().getDay() === 4
      const minDays2 = compressionPct >= 65 && !isThursday2 ? 0 : compressionPct >= 65 ? 8 : compressionPct >= 50 ? 7 : (bubbleTier !== 'gray' ? 0 : 21)
      const realExpiry2 = setupActive ? await fetchNearestRealExpiry(sym, minDays2, API_KEY) : undefined
      const trade = setupActive ? buildStraddleTrade(r.bars, sym, compressionPct, bubbleTier, realExpiry2) : null
      setResults(prev => prev.map(res => res.symbol === sym ? {
        ...res,
        hasPOI,
        topPOI: recentPOI[0] ?? null,
        setupActive,
        dpDays: dpResults,
        poiLevels: recentPOI,
        trade,
        poiScanPending: false,
      } : res))
    } finally {
      setPoiLoadingSet(prev => { const n = new Set(prev); n.delete(sym); return n })
    }
  }, [API_KEY])

  // ── Individual ticker scan ─────────────────────────────────────────────────
  const runTickerScan = useCallback(async () => {
    const sym = tickerSearch.trim().toUpperCase()
    if (!sym || tickerScanning) return
    setTickerScanning(true)
    setSelected(null)
    try {
      const ac = new AbortController()
      const bars = await fetchOHLCV(sym, API_KEY, ac.signal)
      if (!bars || bars.length < 120) {
        setTickerScanning(false)
        return
      }
      const allEvts = scanHistory(bars)
      // Individual scan — show all events, no recency filter
      const lastNDates = new Set(bars.slice(-SCAN_TRADING_DAYS).map((b) => b.date))
      const recentEvts = allEvts.filter((e) => lastNDates.has(e.date))

      const daysToScan = bars.slice(-252).map((b) => b.date)
      const dpResults = await scanDPDays(daysToScan, sym, API_KEY, () => undefined, ac.signal)
      // Individual scan — show all POI clusters, no recency filter
      const allPOI = clusterPOI(dpResults)
      const hasPOI = allPOI.length > 0
      const latestEvt = recentEvts[recentEvts.length - 1]
      const compressionPct = latestEvt?.compressionPct ?? 0
      const setupActive = recentEvts.length > 0 && hasPOI
      const bubbleTier = getTopPOIBubbleTier(dpResults, allPOI[0] ?? null)
      const isThur = new Date().getDay() === 4
      const minDays = compressionPct >= 65 && !isThur ? 0 : compressionPct >= 65 ? 8 : compressionPct >= 50 ? 7 : (bubbleTier !== 'gray' ? 0 : 21)
      const realExpiry = setupActive ? await fetchNearestRealExpiry(sym, minDays, API_KEY) : undefined
      const trade = setupActive ? buildStraddleTrade(bars, sym, compressionPct, bubbleTier, realExpiry) : null

      const result: ScanResult = {
        symbol: sym,
        currentPrice: bars[bars.length - 1].close,
        compressionPct,
        squeezeOn: latestEvt?.squeezeOn ?? false,
        hasPOI,
        topPOI: allPOI[0] ?? null,
        setupActive,
        bars,
        allEvents: allEvts,
        recentEvents: recentEvts,
        dpDays: dpResults,
        poiLevels: allPOI,
        trade,
      }
      addResult(result)
      setSelected(result)
      setSelectedFromTickerSearch(true)
      setPhase('done')
    } finally {
      setTickerScanning(false)
    }
  }, [tickerSearch, tickerScanning, API_KEY, addResult])

  // ── If a row is selected, show detail view ─────────────────────────────────
  const DetailView = () => {
    if (!selected) return null
    const r = selected
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'auto',
          padding: '16px 24px',
          gap: 20,
        }}
      >
        {/* Back bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button
            onClick={() => setSelected(null)}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 4,
              padding: '5px 14px',
              cursor: 'pointer',
              ...mono,
              fontSize: 11,
              fontWeight: 700,
              color: '#fff',
            }}
          >
            ← BACK
          </button>
          <span
            style={{
              ...mono,
              fontSize: 20,
              fontWeight: 800,
              color: '#FFFFFF',
              letterSpacing: '2px',
            }}
          >
            {r.symbol}
          </span>
          <span style={{ ...mono, fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.5)' }}>
            ${r.currentPrice.toFixed(2)}
          </span>
          {r.setupActive && (
            <span
              style={{
                ...mono,
                fontSize: 11,
                fontWeight: 800,
                color: '#FF8C00',
                background: 'rgba(255,140,0,0.1)',
                border: '1px solid rgba(255,140,0,0.35)',
                borderRadius: 3,
                padding: '3px 10px',
              }}
            >
              ⚡ SETUP ACTIVE
            </span>
          )}
        </div>

        {/* Chart */}
        <div style={{ height: selectedFromTickerSearch ? 1300 : 749, position: 'relative', flexShrink: 0 }}>
          <StraddleChart
            candles={r.bars.slice(-CHART_VISIBLE_DAYS)}
            events={r.allEvents}
            dpDays={r.dpDays}
            poiLevels={r.poiLevels}
            forceHeight={selectedFromTickerSearch ? 1300 : undefined}
          />
        </div>

        {/* Squeeze ON pill */}
        {r.recentEvents.length > 0 && r.recentEvents[r.recentEvents.length - 1].squeezeOn && (
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div
              style={{
                ...mono,
                fontSize: 13,
                fontWeight: 800,
                letterSpacing: '2px',
                color: '#00FF88',
                background: 'rgba(0,255,136,0.1)',
                border: '1px solid rgba(0,255,136,0.35)',
                borderRadius: 4,
                padding: '5px 18px',
              }}
            >
              ● ON
            </div>
          </div>
        )}

        {/* Trade cards */}
        {r.setupActive && r.trade ? (
          <>
            <div
              style={{
                ...mono,
                fontSize: 11,
                fontWeight: 800,
                color: 'rgba(255,68,221,0.7)',
                letterSpacing: '3px',
                textAlign: 'center',
                marginTop: 4,
              }}
            >
              ── STRADDLE TRADE SETUP ──
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <TradeCard trade={r.trade} symbol={r.symbol} side="call" />
              <TradeCard trade={r.trade} symbol={r.symbol} side="put" />
            </div>
            <div
              style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 6,
                padding: '14px 20px',
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 16,
              }}
            >
              {[
                {
                  label: 'TOTAL COST',
                  value: `$${r.trade.totalCost.toFixed(0)}`,
                  sub: 'per straddle (100 × 2 legs)',
                  color: '#fff',
                },
                {
                  label: 'UPPER BE',
                  value: `$${r.trade.upperBE.toFixed(2)}`,
                  sub: `${(((r.trade.upperBE - r.currentPrice) / r.currentPrice) * 100).toFixed(1)}% above`,
                  color: '#00FF88',
                },
                {
                  label: 'LOWER BE',
                  value: `$${r.trade.lowerBE.toFixed(2)}`,
                  sub: `${(((r.trade.lowerBE - r.currentPrice) / r.currentPrice) * 100).toFixed(1)}% below`,
                  color: '#FF4060',
                },
                {
                  label: 'IV ESTIMATE',
                  value: `${(r.trade.iv * 100).toFixed(1)}%`,
                  sub: '20-period log HV annualized',
                  color: '#60A5FA',
                },
              ].map((item) => (
                <div key={item.label}>
                  <div
                    style={{
                      ...mono,
                      fontSize: 9,
                      fontWeight: 800,
                      color: 'rgba(255,255,255,0.35)',
                      letterSpacing: '1.5px',
                      marginBottom: 4,
                    }}
                  >
                    {item.label}
                  </div>
                  <div style={{ ...mono, fontSize: 18, fontWeight: 800, color: item.color }}>
                    {item.value}
                  </div>
                  <div
                    style={{
                      ...mono,
                      fontSize: 9,
                      fontWeight: 600,
                      color: 'rgba(255,255,255,0.35)',
                    }}
                  >
                    {item.sub}
                  </div>
                </div>
              ))}
            </div>
            <div
              style={{
                ...mono,
                fontSize: 9,
                color: 'rgba(255,255,255,0.2)',
                letterSpacing: '0.8px',
                textAlign: 'center',
                paddingBottom: 8,
              }}
            >
              ESTIMATED PREMIUMS VIA BLACK-SCHOLES · 80% OTM STRIKE · STOP AT 50% OF ENTRY PREMIUM ·
              NOT FINANCIAL ADVICE
            </div>
          </>
        ) : null}
      </div>
    )
  }

  const isScanning =
    phase === 'fetching-symbols' || phase === 'scanning-ohlcv' || phase === 'scanning-dp'
  const scanPct =
    stats.totalSymbols > 0
      ? phase === 'fetching-symbols'
        ? 2
        : phase === 'scanning-ohlcv'
          ? Math.round(2 + (stats.ohlcvDone / stats.totalSymbols) * 60)
          : phase === 'scanning-dp' && stats.contractionHits > 0
            ? Math.round(62 + (stats.dpDone / stats.contractionHits) * 38)
            : phase === 'done'
              ? 100
              : 0
      : 0

  return (
    <div
      style={{
        background: '#000000',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 8,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      {/* ── Panel Header ─────────────────────────────────────────────────── */}
      <div
        style={{
          background: 'linear-gradient(180deg, #0e0f12 0%, #080a0d 100%)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          padding: '0 28px',
          display: 'flex',
          alignItems: 'center',
          gap: 28,
          flexShrink: 0,
          boxShadow: '0 2px 24px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.04)',
          minHeight: 72,
          flexWrap: 'wrap',
        }}
      >
        {/* Brand block */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14,
          borderRight: '1px solid rgba(255,255,255,0.07)',
          paddingRight: 28, alignSelf: 'stretch', paddingTop: 12, paddingBottom: 12,
        }}>
          <div style={{
            width: 5, height: 36,
            background: 'linear-gradient(180deg, #FFB800 0%, #FF2D6B 100%)',
            borderRadius: 3, flexShrink: 0,
            boxShadow: '0 0 10px rgba(255,184,0,0.4)',
          }} />
          <div>
            <div style={{ ...mono, fontWeight: 900, fontSize: 26, color: '#FFFFFF', letterSpacing: '5px', lineHeight: 1, textShadow: '0 0 20px rgba(255,255,255,0.15)' }}>
              STRADDLE TOWN
            </div>
            <div style={{ ...mono, fontSize: 10, color: '#FF8C00', letterSpacing: '3px', marginTop: 4, fontWeight: 700 }}>
              VOLATILITY · POI · AI
            </div>
          </div>
        </div>

        {/* Inline filters — shown once scan starts */}
        {(isScanning || phase === 'done') && (() => {
          const glossy = (active: boolean, activeColor: string): React.CSSProperties => ({
            ...mono,
            fontSize: 14,
            fontWeight: 900,
            letterSpacing: '1.5px',
            cursor: 'pointer',
            borderRadius: 5,
            padding: '7px 18px',
            border: active ? `1px solid ${activeColor}99` : '1px solid rgba(255,255,255,0.10)',
            color: active ? activeColor : '#FFFFFF',
            background: active
              ? `linear-gradient(180deg, ${activeColor}28 0%, ${activeColor}10 100%)`
              : 'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)',
            boxShadow: active
              ? `0 0 10px ${activeColor}33, inset 0 1px 0 ${activeColor}22`
              : 'inset 0 1px 0 rgba(255,255,255,0.05)',
          })
          const lbl: React.CSSProperties = { ...mono, fontSize: 14, fontWeight: 900, color: '#FFFFFF', letterSpacing: '2px' }
          const div = <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.08)', flexShrink: 0 }} />
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={lbl}>VIEW</span>
                <button style={glossy(viewMode === 'setups', '#00FF88')} onClick={() => setViewMode('setups')}>SETUPS ONLY</button>
                <button style={glossy(viewMode === 'all', '#FF8C00')} onClick={() => setViewMode('all')}>ALL CONTRACTIONS</button>
                <button style={glossy(viewMode === 'poi-only', '#FFD700')} onClick={() => setViewMode('poi-only')}>POI ONLY</button>
                <button style={glossy(viewMode === 'contraction-only', '#41B6F6')} onClick={() => setViewMode('contraction-only')}>CONTRACTION ONLY</button>
              </div>
              {div}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={lbl}>COMPRESSION</span>
                {([40, 50, 65] as const).map(v => (
                  <button key={v} style={glossy(minCompression === v, '#FF8C00')} onClick={() => setMinCompression(v)}>{v}%+</button>
                ))}
              </div>
              {div}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={lbl}>BUBBLE</span>
                <button style={glossy(bubbleFilter === 'all', '#FFFFFF')} onClick={() => setBubbleFilter('all')}>ALL</button>
                <button style={glossy(bubbleFilter === 'gold', '#FFD700')} onClick={() => setBubbleFilter('gold')}>● GOLD</button>
                <button style={glossy(bubbleFilter === 'blue', '#41B6F6')} onClick={() => setBubbleFilter('blue')}>● BLUE</button>
                <button style={glossy(bubbleFilter === 'gray', '#AAAAAA')} onClick={() => setBubbleFilter('gray')}>● GRAY</button>
              </div>
              {div}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={lbl}>PRESSURE</span>
                <button style={glossy(sqzOnly, '#A855F7')} onClick={() => setSqzOnly(s => !s)}>{sqzOnly ? 'ON' : 'OFF'}</button>
              </div>
            </div>
          )
        })()}

        {/* Action buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto' }}>
          {/* Individual ticker search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4, background: '#080a0d', overflow: 'hidden' }}>
            <input
              value={tickerSearch}
              onChange={e => setTickerSearch(e.target.value.toUpperCase())}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); runTickerScan() } }}
              placeholder="TICKER"
              maxLength={8}
              style={{
                ...mono,
                fontSize: 13,
                fontWeight: 900,
                letterSpacing: 2,
                color: '#ffffff',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                padding: '8px 12px',
                width: 90,
                textTransform: 'uppercase',
              }}
            />
            <button
              onClick={runTickerScan}
              disabled={tickerScanning}
              style={{
                ...mono,
                fontSize: 11,
                fontWeight: 900,
                letterSpacing: 2,
                padding: '8px 14px',
                cursor: tickerScanning ? 'not-allowed' : 'pointer',
                background: tickerScanning ? 'rgba(255,255,255,0.04)' : 'rgba(255,140,0,0.18)',
                border: 'none',
                borderLeft: '1px solid rgba(255,140,0,0.3)',
                color: tickerScanning ? 'rgba(255,255,255,0.3)' : '#FF8C00',
                textTransform: 'uppercase',
              }}
            >
              {tickerScanning ? '…' : '▶ SCAN'}
            </button>
          </div>
          {phase === 'idle' || phase === 'error' ? (
            <button
              onClick={run}
              style={{
                background: 'linear-gradient(135deg, rgba(255,140,0,0.22) 0%, rgba(255,45,107,0.16) 100%)',
                border: '1px solid rgba(255,140,0,0.5)',
                borderRadius: 5,
                padding: '10px 26px',
                cursor: 'pointer',
                ...mono,
                fontSize: 12,
                fontWeight: 900,
                color: '#FFFFFF',
                letterSpacing: '2px',
                boxShadow: '0 0 16px rgba(255,140,0,0.18)',
              }}
            >
              ▶ RUN SCAN
            </button>
          ) : isScanning ? (
            <button
              onClick={() => abortRef.current?.abort()}
              style={{
                background: 'rgba(255,40,60,0.16)',
                border: '1px solid rgba(255,40,60,0.5)',
                borderRadius: 5,
                padding: '10px 26px',
                cursor: 'pointer',
                ...mono,
                fontSize: 12,
                fontWeight: 900,
                color: '#FF4060',
                letterSpacing: '2px',
              }}
            >
              ■ STOP
            </button>
          ) : (
            <button
              onClick={run}
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 4,
                padding: '8px 22px',
                cursor: 'pointer',
                ...mono,
                fontSize: 11,
                fontWeight: 900,
                color: '#FFFFFF',
                letterSpacing: '2px',
              }}
            >
              ↺ RESCAN
            </button>
          )}
        </div>
      </div>

      {/* ── Filter bar (removed — now in header) ─────────────────────────── */}

      {/* ── Progress bar ─────────────────────────────────────────────────── */}
      {isScanning && (
        <div style={{ flexShrink: 0, background: '#0a0b0d', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 24px 4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 6, height: 6, borderRadius: '50%',
                background: '#FF8C00',
                boxShadow: '0 0 6px #FF8C00',
                animation: 'pulse 1.2s ease-in-out infinite',
                flexShrink: 0,
              }} />
              <span style={{ ...mono, fontSize: 10, fontWeight: 800, color: '#FFFFFF', letterSpacing: '2px' }}>
                {phase === 'fetching-symbols'
                  ? 'FETCHING UNIVERSE'
                  : phase === 'scanning-ohlcv'
                    ? `SCANNING OHLCV — ${stats.ohlcvDone} / ${stats.totalSymbols}`
                    : `POI SCAN — ${stats.dpDone} / ${stats.contractionHits} HITS`}
              </span>
            </div>
            <span style={{ ...mono, fontSize: 11, fontWeight: 900, color: '#FFD700', letterSpacing: '1px' }}>
              {scanPct}%
            </span>
          </div>
          <div style={{ height: 2, background: 'rgba(255,255,255,0.04)' }}>
            <div style={{
              height: '100%',
              width: `${scanPct}%`,
              background: 'linear-gradient(90deg, #FF8C00, #FF2D6B)',
              boxShadow: '0 0 8px rgba(255,140,0,0.5)',
              transition: 'width 0.3s ease',
            }} />
          </div>
        </div>
      )}

      {/* ── Idle splash ──────────────────────────────────────────────────── */}
      {phase === 'idle' && !tickerScanning && (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 18,
            padding: 40,
          }}
        >
          <div style={{ ...mono, fontSize: 13, fontWeight: 900, color: '#FFFFFF', letterSpacing: '4px' }}>
            READY TO SCAN
          </div>
          <div style={{ ...mono, fontSize: 11, color: 'rgba(255,255,255,0.4)', textAlign: 'center', maxWidth: 460, lineHeight: 1.7 }}>
            Fetches top {MAX_SYMBOLS} symbols · Contraction detection · POI clustering
          </div>
          <button
            onClick={run}
            style={{
              background: 'linear-gradient(135deg, rgba(255,140,0,0.2) 0%, rgba(255,45,107,0.14) 100%)',
              border: '1px solid rgba(255,140,0,0.45)',
              borderRadius: 5,
              padding: '12px 40px',
              cursor: 'pointer',
              ...mono,
              fontSize: 13,
              fontWeight: 900,
              color: '#FFFFFF',
              letterSpacing: '2.5px',
              marginTop: 8,
              boxShadow: '0 0 20px rgba(255,140,0,0.12)',
            }}
          >
            ▶ RUN SCAN
          </button>
        </div>
      )}

      {/* ── Error ────────────────────────────────────────────────────────── */}
      {phase === 'error' && (
        <div style={{ padding: '40px 24px', textAlign: 'center' }}>
          <div style={{ ...mono, fontSize: 13, fontWeight: 700, color: '#FF4060' }}>
            {errorMsg ?? 'SCAN FAILED'}
          </div>
          <button
            onClick={run}
            style={{
              marginTop: 16,
              background: 'rgba(255,0,0,0.1)',
              border: '1px solid rgba(255,0,0,0.3)',
              borderRadius: 4,
              padding: '6px 16px',
              cursor: 'pointer',
              ...mono,
              fontSize: 11,
              fontWeight: 700,
              color: '#FF4060',
            }}
          >
            RETRY
          </button>
        </div>
      )}

      {/* ── Screener results (top-level) or detail view ───────────────────── */}
      {(isScanning || phase === 'done') && !selected && (
        <div
          style={{
            flex: 1,
            overflow: 'hidden',
            padding: '16px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            minHeight: 0,
          }}
        >
          {results.length === 0 && isScanning && (
            <div
              style={{
                ...mono,
                fontSize: 11,
                color: 'rgba(255,255,255,0.2)',
                letterSpacing: '1px',
                paddingTop: 12,
              }}
            >
              Scanning… results will appear live as each symbol is processed.
            </div>
          )}
          {results.length > 0 && (
            <ResultsTable
              results={results.filter(r => {
                if (viewMode === 'setups' && !r.setupActive) return false
                if (viewMode === 'poi-only' && !r.hasPOI) return false
                if (viewMode === 'contraction-only' && r.recentEvents.length === 0) return false
                if (r.compressionPct < minCompression) return false
                if (sqzOnly && !r.squeezeOn) return false
                if (bubbleFilter !== 'all') {
                  const tier = getTopPOIBubbleTier(r.dpDays, r.topPOI)
                  if (tier !== bubbleFilter) return false
                }
                return true
              })}
              onSelect={r => { setSelected(r); setSelectedFromTickerSearch(false) }}
              onScanPOI={scanPoiForSymbol}
              poiLoadingSet={poiLoadingSet}
            />
          )}
        </div>
      )}

      {selected && <DetailView />}

      {/* ── Individual ticker loading ─────────────────────────────────────── */}
      {tickerScanning && !selected && (
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
          paddingTop: '12%',
          gap: 28,
        }}>
          {/* Spinner ring */}
          <div style={{ position: 'relative', width: 64, height: 64 }}>
            <div style={{
              position: 'absolute', inset: 0,
              borderRadius: '50%',
              border: '3px solid rgba(255,140,0,0.12)',
            }} />
            <div style={{
              position: 'absolute', inset: 0,
              borderRadius: '50%',
              border: '3px solid transparent',
              borderTopColor: '#FF8C00',
              animation: 'stSpin 0.9s linear infinite',
            }} />
            <div style={{
              position: 'absolute', inset: 10,
              borderRadius: '50%',
              border: '2px solid transparent',
              borderTopColor: 'rgba(255,45,107,0.7)',
              animation: 'stSpin 1.4s linear infinite reverse',
            }} />
          </div>
          <div style={{ ...mono, fontSize: 26, fontWeight: 900, color: '#FFFFFF', letterSpacing: '6px' }}>
            SCANNING {tickerSearch.trim().toUpperCase()}
          </div>
          <div style={{ ...mono, fontSize: 20, color: 'rgba(255,255,255,0.35)', letterSpacing: '3px' }}>
            FETCHING OHLCV · DARK POOL · POI
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.6} }
        @keyframes stSpin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>
    </div>
  )
}
