'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'

import { getRiskFreeRate } from '@/lib/riskFreeRate'
import StraddlePortfolio, { spAddPosition } from './StraddlePortfolio'
import type { StraddlePosition } from './StraddlePortfolio'

import { TOP_1800_SYMBOLS } from '@/lib/Top1000Symbols'
// ── Constants ──────────────────────────────────────────────────────────────────
const MIN_AVG_HV = 1.5            // lowered from 3.0 — allow lower-vol names
const SCAN_TRADING_DAYS = 2       // only contractions within the past 2 trading days
const DP_LOOKBACK_DAYS = 90       // trading days of dark pool data for POI detection (full scan / Mag8)
const TICKER_LOOKBACK_DAYS = 252  // trading days for single-ticker contraction + DP scan
const CHART_VISIBLE_DAYS = 60 // candles shown in chart
const FETCH_CAL_DAYS = 500 // calendar days to fetch (for avgHV lookback)
const DARK_POOL_EXCHANGES = new Set([4, 6, 16, 201, 202, 203])
const LIT_BLOCK_MIN_NOTIONAL = 250_000
const CONTRACTION_THRESHOLD = 1 // minimum 1% compression — column assignment handles range splits
// Risk-free rate — updated at runtime from Treasury API via getRiskFreeRate()
let RISK_FREE_RATE = 0.0442
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
  // Manually excluded
  'HOLX', 'EXAS',
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
  setupTier: 'high-pressure' | 'pivotal' | null
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

// Returns the nearest Monday that is >= minCalDays calendar days from today
function mondayMinDaysOut(minCalDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + minCalDays)
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1)
  return toLocalDateStr(d)
}

// Fetch the nearest REAL listed expiry from Polygon.
// preferMonday=true (Thursday pivotal): look for Monday contract first; if none, fall back to following Friday (7+ days).
// High Pressure: minDaysOut=21 → nearest real expiry 3+ weeks out (may be monthly).
async function fetchNearestRealExpiry(
  symbol: string,
  minDaysOut: number,
  apiKey: string,
  preferMonday = false,
): Promise<string> {
  const earliest = fridayMinDaysOut(minDaysOut)
  try {
    const windowEnd = fridayMinDaysOut(minDaysOut + (preferMonday ? 15 : 7))
    const fromDate = preferMonday
      ? toLocalDateStr(new Date(Date.now() + 86_400_000)) // tomorrow
      : earliest
    const url =
      `https://api.polygon.io/v3/reference/options/contracts` +
      `?underlying_ticker=${symbol}&contract_type=call` +
      `&expiration_date.gte=${fromDate}&expiration_date.lte=${windowEnd}` +
      `&order=asc&sort=expiration_date&limit=20&apiKey=${apiKey}`
    const res = await fetch(url)
    if (!res.ok) return earliest
    const data = await res.json()
    const contracts: { expiration_date: string }[] = data?.results ?? []
    if (!contracts.length) return earliest
    const expiries = [...new Set(contracts.map((c) => c.expiration_date))].sort()
    if (preferMonday) {
      // Prefer nearest Monday expiry (MWF stocks); fall back to following Friday
      const monday = expiries.find(e => new Date(e + 'T12:00:00').getDay() === 1)
      if (monday) return monday
      const nextFri = fridayMinDaysOut(7)
      return expiries.find(e => e >= nextFri) ?? nextFri
    }
    return expiries.find(e => e >= earliest) ?? earliest
  } catch {
    return earliest
  }
}

// Fetch real market ask prices for straddle legs from Polygon snapshot API.
// Snaps to the listed strike nearest to the Black-Scholes-derived strike.
async function fetchRealStraddlePrices(
  symbol: string,
  expiration: string,
  callStrike: number,
  putStrike: number,
  currentPrice: number,
  apiKey: string,
): Promise<{ callAsk: number | null; putAsk: number | null; callStrike: number; putStrike: number } | null> {
  try {
    const callLo = (currentPrice * 0.98).toFixed(2)
    const callHi = (currentPrice * 1.45).toFixed(2)
    const putLo = (currentPrice * 0.65).toFixed(2)
    const putHi = (currentPrice * 1.02).toFixed(2)
    const base = `https://api.polygon.io/v3/snapshot/options/${encodeURIComponent(symbol)}`
    const [callRes, putRes] = await Promise.all([
      fetch(`${base}?expiration_date=${expiration}&contract_type=call&strike_price.gte=${callLo}&strike_price.lte=${callHi}&order=asc&sort=strike_price&limit=50&apiKey=${apiKey}`, { cache: 'no-store' }),
      fetch(`${base}?expiration_date=${expiration}&contract_type=put&strike_price.gte=${putLo}&strike_price.lte=${putHi}&order=asc&sort=strike_price&limit=50&apiKey=${apiKey}`, { cache: 'no-store' }),
    ])
    if (!callRes.ok || !putRes.ok) return null
    const [callJson, putJson] = await Promise.all([callRes.json(), putRes.json()])
    const snap = (contracts: Record<string, unknown>[], target: number) => {
      if (!contracts.length) return { price: null as number | null, strike: target }
      const best = contracts.reduce((b, c) => {
        const sa = (c.details as Record<string, number>)?.strike_price ?? 0
        const sb = (b.details as Record<string, number>)?.strike_price ?? 0
        return Math.abs(sa - target) < Math.abs(sb - target) ? c : b
      })
      const lq = best.last_quote as Record<string, number> | undefined
      const lt = best.last_trade as Record<string, number> | undefined
      const day = best.day as Record<string, number> | undefined
      const rawPrice = lq?.ask ?? lq?.midpoint ?? lt?.price ?? day?.close
      return {
        price: typeof rawPrice === 'number' ? rawPrice : null,
        strike: (best.details as Record<string, number>)?.strike_price ?? target,
      }
    }
    const callData = snap(callJson.results ?? [], callStrike)
    const putData = snap(putJson.results ?? [], putStrike)
    return { callAsk: callData.price, putAsk: putData.price, callStrike: callData.strike, putStrike: putData.strike }
  } catch {
    return null
  }
}

// Patch a StraddleTrade with real market ask prices, updating BE and cost.
function patchTradeWithRealPrices(
  trade: StraddleTrade,
  real: { callAsk: number | null; putAsk: number | null; callStrike: number; putStrike: number },
): StraddleTrade {
  const callEntry = real.callAsk ?? trade.callEntry
  const putEntry = real.putAsk ?? trade.putEntry
  const callStrike = real.callStrike
  const putStrike = real.putStrike
  return {
    ...trade,
    callStrike,
    putStrike,
    callEntry,
    putEntry,
    callStop: callEntry * 0.5,
    putStop: putEntry * 0.5,
    totalCost: (callEntry + putEntry) * 100,
    upperBE: callStrike + callEntry + putEntry,
    lowerBE: putStrike - (callEntry + putEntry),
  }
}

// Determines bubble tier of the top POI based on which rank-position
// Rank a recent POI cluster by its position in the full 90-day sorted cluster list.
// Gold = cluster is the #1 most-notional level over 90 days.
// Blue = #2. Gray = anything lower.
function getTopPOIBubbleTier(
  allPOI: POILevel[],
  topRecentPOI: POILevel | null,
): 'gold' | 'blue' | 'gray' {
  if (!topRecentPOI || !allPOI.length) return 'gray'
  const thr = topRecentPOI.price * 0.0075
  const idx = allPOI.findIndex(p => Math.abs(p.price - topRecentPOI.price) <= thr)
  if (idx === 0) return 'gold'
  if (idx === 1) return 'blue'
  return 'gray'
}

// Uses the same top-3 DP days by notional as the chart bubbles (amber=rank0, blue=rank1, silver=rank2).
// daysDiff = triggerDate - dpDayDate (positive = POI before contraction, negative = after)
//   extreme  = amber bubble (rank 0): -2 ≤ daysDiff ≤ 3
//   strong   = blue  bubble (rank 1): -2 ≤ daysDiff ≤ 2
//   moderate = gray  bubble (rank 2):  -1 ≤ daysDiff ≤ 1
function computeSetupTier(
  dpDays: DPDay[],
  triggerDate: string,
): { setupTier: 'extreme' | 'strong' | 'moderate' | null; activePOI: POILevel | null } {
  const top3 = [...dpDays]
    .filter(d => d.totalNotional > 0 && d.topPrint)
    .sort((a, b) => b.totalNotional - a.totalNotional)
    .slice(0, 3)
  for (let rank = 0; rank < top3.length; rank++) {
    const day = top3[rank]
    const diff = (new Date(triggerDate).getTime() - new Date(day.date).getTime()) / 86_400_000
    const inWindow = rank === 0 ? diff >= -2 && diff <= 3
      : rank === 1 ? diff >= -2 && diff <= 2
        : diff >= -1 && diff <= 1
    if (!inWindow) continue
    const activePOI: POILevel = { price: day.topPrint.price, totalNotional: day.totalNotional, printCount: 1, dates: [day.date] }
    if (rank === 0) return { setupTier: 'extreme', activePOI }
    if (rank === 1) return { setupTier: 'strong', activePOI }
    return { setupTier: 'moderate', activePOI }
  }
  return { setupTier: null, activePOI: null }
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

function detectContraction(bars: Bar[]): { qualifies: boolean; compressionPct: number } {
  if (bars.length < 120) return { qualifies: false, compressionPct: 0 }
  const lb = bars.slice(-4)
  if (lb.length < 4) return { qualifies: false, compressionPct: 0 }
  const avgHV = calcHV4D(bars)
  if (!avgHV || avgHV < MIN_AVG_HV) {
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
  return { qualifies, compressionPct }
}

// ── Bubble notional label formatter ──────────────────────────────────────────
function fmtBubbleNotional(n: number): string {
  const B = 1_000_000_000
  const v = n / B
  if (v < 1) return v.toFixed(2) + 'X'          // e.g. 0.12X
  if (v < 10) return v.toFixed(2) + 'Y'          // e.g. 1.32Y
  if (v < 100) return v.toFixed(2) + 'Z'          // e.g. 32.12Z
  return Math.round(v) + 'Z'                       // e.g. 420Z
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

// ── Contraction Breakout Score ────────────────────────────────────────────────
// For each historical contraction event with at least 1 bar of data after it,
// scores how quickly the stock closed outside the 4-bar contraction range:
//   same day (d=0) or next day (d=1)  → 10 pts
//   2 days after (d=2)               → 7.5 pts
//   3 days after (d=3)               → 5 pts
//   4+ days or never broke out        → 0 pts
// Returns { totalPts, maxPts, pct } where pct = totalPts / maxPts (0–1),
// or null when no scoreable events exist.
function calcContractionBreakoutScore(
  bars: Bar[],
  allEvents: ContraEvent[],
): { totalPts: number; maxPts: number; pct: number } | null {
  if (!allEvents.length || bars.length < 5) return null
  const dateToIdx = new Map<string, number>()
  for (let i = 0; i < bars.length; i++) dateToIdx.set(bars[i].date, i)
  let totalPts = 0
  let maxPts = 0
  for (const ev of allEvents) {
    const evIdx = dateToIdx.get(ev.date)
    if (evIdx === undefined) continue
    // Need at least 1 future bar to be scoreable
    if (evIdx + 1 >= bars.length) continue
    // Contraction range: high/low of the 4 bars ending at the event bar
    const startIdx = Math.max(0, evIdx - 3)
    const rangeBars = bars.slice(startIdx, evIdx + 1)
    const rangeHigh = Math.max(...rangeBars.map((b) => b.high))
    const rangeLow = Math.min(...rangeBars.map((b) => b.low))
    const rangeSz = rangeHigh - rangeLow
    const upperTarget = rangeHigh + 0.55 * rangeSz
    const lowerTarget = rangeLow - 0.55 * rangeSz
    maxPts += 10
    // Check day 0 (same day) through day 3 — breakout when bar trades 0.55x range beyond high/low (intraday, no close required)
    for (let d = 0; d <= 3; d++) {
      const checkIdx = evIdx + d
      if (checkIdx >= bars.length) break
      const bar = bars[checkIdx]
      if (bar.high >= upperTarget || bar.low <= lowerTarget) {
        if (d <= 1) totalPts += 10
        else if (d === 2) totalPts += 7.5
        else totalPts += 5
        break
      }
    }
    // 0 pts added if no breakout within 3 days
  }
  if (maxPts === 0) return null
  // Require at least 2 scoreable historical events
  const eventCount = maxPts / 10
  if (eventCount < 2) return null
  return { totalPts, maxPts, pct: totalPts / maxPts }
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

  // ── Expiry selection ───────────────────────────────────────────────────────
  // High Pressure (77%+ or 0-35%): 3 weeks out (monthly contract if real expiry fetched)
  // Pivotal (36-76%): this week's Friday; on Thursday → Monday if available, else following Friday
  const isHighPressure = compressionPct >= 77 || compressionPct <= 35
  const isThursday = new Date().getDay() === 4
  let expiration: string
  if (expirationOverride) {
    expiration = expirationOverride
  } else if (isHighPressure) {
    expiration = fridayMinDaysOut(21) // 3 weeks out fallback
  } else {
    // Pivotal: weekly (this Friday); Thursday → skip to Monday or following Friday
    expiration = isThursday ? mondayMinDaysOut(1) : fridayMinDaysOut(0)
  }

  const today = new Date()
  const expD = new Date(expiration)
  const dteFull = (expD.getTime() - today.getTime()) / 86_400_000
  const dte = Math.max(1, Math.ceil(dteFull))
  const T = dte / 365

  // ── Strike search ───────────────────────────────────────────────────────────
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

  // ── Premium ───────────────────────────────────────────────────────────────
  const callEntry = bsPrice(currentPrice, callStrike, T, RISK_FREE_RATE, iv, true)
  const putEntry = bsPrice(currentPrice, putStrike, T, RISK_FREE_RATE, iv, false)
  void callProb20; void putProb20

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

// ── Terminal logger — POSTs to /api/log so output appears in the Next.js dev terminal ──
function tlog(msg: string) {
  fetch('/api/log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ msg }) }).catch(() => { })
}

// ── Format Helpers ─────────────────────────────────────────────────────────────
function fmtN(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}
function fmtDate(d: string): string {
  const dt = new Date(d + 'T00:00:00Z')
  const mon = dt.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
  const day = dt.getUTCDate()
  return `${mon} ${day}`
}
function fmtExpiry(d: string): string {
  return new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function getUpcomingExpiries(currentExpiry?: string): string[] {
  const s = new Set<string>()
  for (let i = 0; i <= 9; i++) s.add(fridayMinDaysOut(i * 7))
  if (new Date().getDay() === 4) s.add(mondayMinDaysOut(1))
  if (currentExpiry) s.add(currentExpiry)
  return [...s].sort()
}

function fmtExpiryShort(d: string): string {
  const dt = new Date(d + 'T00:00:00Z')
  const day = dt.getUTCDate()
  const month = dt.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
  const suffix = (day % 100 >= 11 && day % 100 <= 13) ? 'th' : ['th', 'st', 'nd', 'rd', 'th', 'th', 'th', 'th', 'th', 'th'][day % 10]
  return `${month} ${day}${suffix}`
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

// ── Fetch OHLCV for a single symbol ───────────────────────────────────────────
async function fetchOHLCV(
  symbol: string,
  apiKey: string,
  signal: AbortSignal,
  calDays: number = FETCH_CAL_DAYS,
  limit: number = 1000
): Promise<Bar[] | null> {
  try {
    const toDate = new Date().toISOString().split('T')[0]
    const from = new Date()
    from.setDate(from.getDate() - calDays)
    const fromDate = from.toISOString().split('T')[0]
    const res = await fetch(
      `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${fromDate}/${toDate}?adjusted=true&sort=asc&limit=${limit}&apiKey=${apiKey}`,
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

// ── Global Polygon rate limiter — shared across ALL scanDPDays calls ──────────
// Hard cap: max 4 simultaneous fetch() calls to api.polygon.io at any time.
const _POLY_MAX = 4
let _polyInflight = 0
const _polyWaiting: Array<() => void> = []
const polyAcquire = (): Promise<void> => new Promise(resolve => {
  if (_polyInflight < _POLY_MAX) { _polyInflight++; resolve() }
  else _polyWaiting.push(() => { _polyInflight++; resolve() })
})
const polyRelease = () => {
  _polyInflight--
  if (_polyWaiting.length) _polyWaiting.shift()!()
}

// ── RP: Dark pool scanner (exact match to POIScreener logic) ──────────────────
type RawTrade = { sip_timestamp: number; price: number; size: number; exchange: number }

async function scanDPDays(
  dates: string[],
  symbol: string,
  apiKey: string,
  onProgress: (pct: number) => void,
  signal: AbortSignal,
  maxConcurrency = 3
): Promise<DPDay[]> {
  let aborted = false
  signal.addEventListener('abort', () => {
    aborted = true
  })

  // Use the module-level global semaphore — no per-call semaphore needed
  const _acquire = polyAcquire
  const _release = polyRelease

  // Fetch with retry + exponential backoff + jitter — handles ERR_CONNECTION_RESET
  const fetchWithRetry = async (url: string, maxAttempts = 4): Promise<Response | null> => {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (aborted) return null
      // Per-attempt 10s timeout — prevents hanging connections from blocking the semaphore
      const ac = new AbortController()
      const timer = setTimeout(() => ac.abort(), 10_000)
      try {
        const res = await fetch(url, { signal: ac.signal })
        clearTimeout(timer)
        if (res.ok) return res
        // 429 rate-limited — back off longer
        if (res.status === 429) {
          const delay = 2000 * (attempt + 1) + Math.random() * 500
          await new Promise(r => setTimeout(r, delay))
          continue
        }
        await res.text().catch(() => { })
        return null // non-retryable HTTP error
      } catch {
        clearTimeout(timer)
        if (aborted) return null
        // ERR_CONNECTION_RESET or network error — retry with backoff
        if (attempt < maxAttempts - 1) {
          const delay = Math.min(300 * Math.pow(2, attempt) + Math.random() * 200, 3000)
          await new Promise(r => setTimeout(r, delay))
        }
      }
    }
    return null
  }

  // ── Streaming fetch: processes each page as it arrives, keeps only top-50 DP
  // prints per window by notional. Raw trade objects are NEVER accumulated —
  // memory is bounded at O(50) per window instead of O(pages × 50 000).
  const fetchWindowStreaming = async (url: string): Promise<{ prints: DPPrint[]; windowNotional: number }> => {
    let top: DPPrint[] = []
    let windowNotional = 0
    let nextUrl: string | null = url
    while (nextUrl && !aborted) {
      await _acquire()
      const res = await fetchWithRetry(nextUrl)
      _release()
      if (!res) break
      let json: { results?: RawTrade[]; next_url?: string }
      try { json = await res.json() } catch {
        // Body stream cut mid-transfer — data already acquired, just stop paginating
        break
      }
      // Process each trade inline — never push to a large accumulator
      for (const t of (json.results || []) as RawTrade[]) {
        const notional = t.size * t.price
        const isDarkPool = DARK_POOL_EXCHANGES.has(t.exchange)
        if (isDarkPool || notional >= LIT_BLOCK_MIN_NOTIONAL) {
          windowNotional += notional
          top.push({ price: t.price, size: t.size, ts: Math.floor(t.sip_timestamp / 1_000_000) })
        }
      }
      // Trim to top-50 by notional after every page — never grows unbounded
      if (top.length > 50) {
        top = top.sort((a, b) => b.size * b.price - a.size * a.price).slice(0, 50)
      }
      // Do NOT follow cursor pagination — each window is already time-bounded.
      // Cursor requests are the primary cause of ERR_CONNECTION_RESET.
      nextUrl = null
    }
    return { prints: top, windowNotional }
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

  const CONCURRENCY = maxConcurrency
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
    const WIN = 3
    const winNs = (rthEndNs - rthStartNs) / WIN
    const windowUrls = Array.from({ length: WIN }, (_, i) => {
      const s = rthStartNs + i * winNs
      const e = rthStartNs + (i + 1) * winNs
      return `https://api.polygon.io/v3/trades/${symbol}?timestamp.gte=${s}&timestamp.lte=${e}&limit=10000&order=asc&apiKey=${apiKey}`
    })
    try {
      // Run windows sequentially — never more than 1 in-flight per day to avoid Polygon TCP resets
      const winResults: Array<{ prints: DPPrint[]; windowNotional: number }> = []
      for (const url of windowUrls) {
        if (aborted) break
        winResults.push(await fetchWindowStreaming(url))
      }
      // Merge top-50 from every window, rerank, then take final top-10
      const allPrints = winResults
        .flatMap(w => w.prints)
        .sort((a, b) => b.size * b.price - a.size * a.price)
      // Sum true total notional (tracked per-window across ALL qualified trades)
      const totalNotional = winResults.reduce((s, w) => s + w.windowNotional, 0)
      if (allPrints.length > 0) {
        const top10 = allPrints.slice(0, 10)
        return {
          date: dateKey,
          top10,
          totalNotional,
          topPrint: top10[0],
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
  symbol,
  trade,
}: {
  candles: Bar[]
  events: ContraEvent[]
  dpDays: DPDay[]
  poiLevels: POILevel[]
  forceHeight?: number
  symbol?: string
  trade?: StraddleTrade | null
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const crosshairRef = useRef<{ cx: number; cy: number } | null>(null)
  const viewRef = useRef({ startIdx: 0, visibleCount: Math.max(candles.length, 10) })
  const [width, setWidth] = useState(900)
  const [height, setHeight] = useState(forceHeight ?? 749)
  const [chartTf, setChartTf] = useState<'5m' | '1h' | '1d'>('1d')
  const [intradayBars, setIntradayBars] = useState<Bar[] | null>(null)
  const [tfFetching, setTfFetching] = useState(false)

  const activeCandles = intradayBars ?? candles

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

  // Reset view when active candles change (timeframe switch)
  useEffect(() => {
    viewRef.current = { startIdx: 0, visibleCount: activeCandles.length }
  }, [activeCandles])

  // Fetch intraday data when timeframe changes
  useEffect(() => {
    if (chartTf === '1d') { setIntradayBars(null); return }
    if (!symbol) return
    setTfFetching(true)
    const days = chartTf === '5m' ? 20 : 365
    const end = new Date().toISOString().split('T')[0]
    const start = new Date(Date.now() - days * 86400000).toISOString().split('T')[0]
    fetch('/api/bulk-chart-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbols: [symbol], timeframe: chartTf, startDate: start, endDate: end }),
    })
      .then(r => r.json())
      .then(d => {
        const raw: any[] = d.data?.[symbol!] ?? []
        setIntradayBars(raw.length > 0 ? raw.map((b: any) => ({
          date: b.date, open: b.open, high: b.high, low: b.low,
          close: b.close, volume: b.volume ?? 0, t: b.timestamp,
        })) : null)
      })
      .catch(() => setIntradayBars(null))
      .finally(() => setTfFetching(false))
  }, [chartTf, symbol])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || activeCandles.length === 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const PAD = height < 300
      ? { top: 8, right: 60, bottom: 36, left: 4 }
      : { top: 20, right: 90, bottom: 40, left: 8 }
    const chartW = width - PAD.left - PAD.right
    const chartH = height - PAD.top - PAD.bottom

    const n = activeCandles.length
    let { startIdx, visibleCount } = viewRef.current
    visibleCount = Math.max(10, Math.min(n, visibleCount))
    startIdx = Math.max(0, Math.min(n - visibleCount, startIdx))
    viewRef.current = { startIdx, visibleCount }
    const vis = activeCandles.slice(startIdx, startIdx + visibleCount)

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

    // Pre/after-hours shading for intraday timeframes (exact EFI chart logic)
    if (chartTf !== '1d') {
      const preMarketStart = 1 * 60      // 1:00 AM PST
      const marketStart = 6 * 60 + 30 // 6:30 AM PST
      const marketEnd = 13 * 60     // 1:00 PM PST
      const afterHoursEnd = 17 * 60     // 5:00 PM PST
      for (let i = 0; i < vis.length; i++) {
        const bar = vis[i]
        if (!bar.t) continue
        const pstStr = new Date(bar.t).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })
        const pstDate = new Date(pstStr)
        const totalMin = pstDate.getHours() * 60 + pstDate.getMinutes()
        const x = cxFn(i) - spacing / 2
        if (totalMin >= preMarketStart && totalMin < marketStart) {
          ctx.fillStyle = 'rgba(255, 140, 60, 0.08)'
          ctx.fillRect(x, PAD.top, spacing, chartH)
        } else if (totalMin >= marketEnd && totalMin < afterHoursEnd) {
          ctx.fillStyle = 'rgba(100, 150, 200, 0.08)'
          ctx.fillRect(x, PAD.top, spacing, chartH)
        }
      }
    }

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
    const currentPrice = activeCandles[n - 1]?.close ?? 0

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

    // ── T1/T2 straddle target levels — dashed lines + Y-axis price ticks ─────
    if (trade) {
      const chartRight = width - PAD.right
      const tradeLevels = [
        { price: trade.callT2Stock, color: '#00FFB0' },
        { price: trade.callT1Stock, color: '#00FF88' },
        { price: trade.putT1Stock, color: '#FF3050' },
        { price: trade.putT2Stock, color: '#FF0030' },
      ]
      ctx.save()
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'left'
      ctx.font = '800 24px "JetBrains Mono",monospace'
      for (const lvl of tradeLevels) {
        const ly = pyFn(lvl.price)
        if (ly < PAD.top || ly > PAD.top + chartH) continue
        // dashed horizontal line across chart area only
        ctx.strokeStyle = lvl.color
        ctx.lineWidth = 1.5
        ctx.globalAlpha = 0.65
        ctx.setLineDash([8, 5])
        ctx.beginPath()
        ctx.moveTo(PAD.left, ly)
        ctx.lineTo(chartRight, ly)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.globalAlpha = 1
        // price label on Y-axis (right margin) — black bg to cover grid labels
        const priceStr = lvl.price >= 1000 ? lvl.price.toFixed(0) : lvl.price.toFixed(2)
        const lw2 = ctx.measureText(priceStr).width
        ctx.fillStyle = '#000000'
        ctx.fillRect(chartRight + 1, ly - 12, lw2 + 14, 24)
        ctx.fillStyle = lvl.color
        ctx.fillText(priceStr, chartRight + 8, ly)
      }
      ctx.restore()
    }

    // Current price label (no horizontal line)
    if (startIdx + visibleCount >= n) {
      const py = Math.round(pyFn(activeCandles[n - 1].close))
      const priceStr = activeCandles[n - 1].close.toFixed(2)
      ctx.font = '900 24px "JetBrains Mono",monospace'
      const pw = ctx.measureText(priceStr).width
      // solid black background so it never overlaps grid labels
      ctx.fillStyle = '#000000'
      ctx.fillRect(width - PAD.right + 1, py - 14, pw + 14, 28)
      ctx.fillStyle = '#FF8C00'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(priceStr, width - PAD.right + 8, py)
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
      .slice(0, 3)
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
      // notional label below bubble
      const label = fmtBubbleNotional(print.notional)
      const fontSize = Math.max(9, Math.min(14, r * 0.85))
      ctx.font = `700 ${fontSize}px "JetBrains Mono",monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      const lw2 = ctx.measureText(label).width
      ctx.fillStyle = 'rgba(0,0,0,0.65)'
      ctx.fillRect(cx - lw2 / 2 - 2, py2 + r + 2, lw2 + 4, fontSize + 2)
      ctx.fillStyle = print.rank === 0 ? '#FFD700' : print.rank === 1 ? '#41B6F6' : '#CCCCCC'
      ctx.fillText(label, cx, py2 + r + 3)
    }
    ctx.restore()

    // X-axis labels — first, middle, last
    const xIdxs = [0, Math.floor(vc * 0.5), vc - 1]
    ctx.fillStyle = '#ffffff'
    ctx.font = '700 24px "JetBrains Mono",monospace'
    ctx.textBaseline = 'top'
    for (let ii = 0; ii < xIdxs.length; ii++) {
      const i = xIdxs[ii]
      const lbl = fmtDate(vis[i].date)
      const rawX = cxFn(i)
      if (ii === 0) {
        ctx.textAlign = 'left'
        ctx.fillText(lbl, PAD.left, height - PAD.bottom + 6)
      } else if (ii === xIdxs.length - 1) {
        ctx.textAlign = 'right'
        ctx.fillText(lbl, width - PAD.right, height - PAD.bottom + 6)
      } else {
        ctx.textAlign = 'center'
        ctx.fillText(lbl, rawX, height - PAD.bottom + 6)
      }
    }

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
      ctx.strokeStyle = 'rgba(0,229,255,0.5)'
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

      // ── Y-axis price label ────────────────────────────────────────────────
      const priceAtCursor = pMax - ((ch.cy - PAD.top) / chartH) * pRange
      const pl =
        priceAtCursor >= 1000
          ? priceAtCursor.toFixed(0)
          : priceAtCursor >= 100
            ? priceAtCursor.toFixed(1)
            : priceAtCursor.toFixed(2)
      ctx.font = '800 24px "JetBrains Mono",monospace'
      const priceW = ctx.measureText(pl).width
      const yLabelX = width - PAD.right + 1
      const yLabelY = Math.round(ch.cy)
      const yPadX = 6, yPadY = 5
      ctx.fillStyle = '#000000'
      ctx.fillRect(yLabelX, yLabelY - 12 - yPadY, priceW + yPadX * 2, 24 + yPadY * 2)
      ctx.fillStyle = '#00E5FF'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(pl, yLabelX + yPadX, yLabelY)

      // ── X-axis date label ─────────────────────────────────────────────────
      const fracX = (ch.cx - PAD.left - 18) / Math.max(spacing, 1)
      const hovIdx = Math.round(fracX)
      if (hovIdx >= 0 && hovIdx < vis.length) {
        const dateLabel = fmtDate(vis[hovIdx].date)
        ctx.font = '700 24px "JetBrains Mono",monospace'
        const dateW = ctx.measureText(dateLabel).width
        const xLabelY = PAD.top + chartH + 1
        const xLabelX = Math.min(Math.max(Math.round(ch.cx) - dateW / 2, PAD.left), width - PAD.right - dateW)
        const xPadX = 6, xPadY = 4
        ctx.fillStyle = '#000000'
        ctx.fillRect(xLabelX - xPadX, xLabelY, dateW + xPadX * 2, PAD.bottom - 2)
        ctx.fillStyle = '#00E5FF'
        ctx.textAlign = 'left'
        ctx.textBaseline = 'top'
        ctx.fillText(dateLabel, xLabelX, xLabelY + xPadY)
      }

      ctx.restore()
    }
  }, [activeCandles, chartTf, events, dpDays, poiLevels, trade, width, height])

  useEffect(() => {
    draw()
  }, [draw])

  // Wheel zoom + drag (right-anchored, matches BuySellScanner)
  useEffect(() => {
    const el = containerRef.current
    if (!el || activeCandles.length === 0) return
    const PAD_L = height < 300 ? 4 : 8
    const PAD_R = height < 300 ? 60 : 142

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      const n = activeCandles.length
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
      // Don't capture if the user clicked a button or other interactive element
      if ((e.target as HTMLElement).closest('button, a, input, select')) return
      el.setPointerCapture(e.pointerId)
      isDragging = true
      dragStartX = e.clientX
      dragStartIdx = viewRef.current.startIdx
      el.style.cursor = 'grabbing'
    }

    const handlePointerMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect()
      crosshairRef.current = { cx: e.clientX - rect.left, cy: e.clientY - rect.top }
      if (isDragging) {
        const { visibleCount } = viewRef.current
        const chartW = el.offsetWidth - PAD_L - PAD_R
        const delta = Math.round((dragStartX - e.clientX) * (visibleCount / chartW))
        const maxStart = Math.max(0, activeCandles.length - visibleCount)
        const newStart = Math.max(0, Math.min(maxStart, dragStartIdx + delta))
        viewRef.current = { ...viewRef.current, startIdx: newStart }
      }
      draw()
    }

    const handlePointerUp = () => { isDragging = false; el.style.cursor = 'grab' }
    const handlePointerLeave = () => { crosshairRef.current = null; draw() }

    el.style.cursor = 'grab'
    el.addEventListener('wheel', handleWheel, { passive: false })
    el.addEventListener('pointerdown', handlePointerDown)
    el.addEventListener('pointermove', handlePointerMove)
    el.addEventListener('pointerup', handlePointerUp)
    el.addEventListener('pointercancel', handlePointerUp)
    el.addEventListener('pointerleave', handlePointerLeave)
    return () => {
      el.removeEventListener('wheel', handleWheel)
      el.removeEventListener('pointerdown', handlePointerDown)
      el.removeEventListener('pointermove', handlePointerMove)
      el.removeEventListener('pointerup', handlePointerUp)
      el.removeEventListener('pointercancel', handlePointerUp)
      el.removeEventListener('pointerleave', handlePointerLeave)
    }
  }, [activeCandles.length, width, height, draw])

  return (
    <div ref={containerRef} style={{ flex: 1, width: '100%', position: 'relative', minHeight: 0 }}>
      {/* Timeframe buttons — top-left overlay */}
      <div style={{ position: 'absolute', top: 6, left: 60, zIndex: 10, display: 'flex', gap: 4 }}>
        {(['5m', '1h', '1d'] as const).map(tf => (
          <button
            key={tf}
            onClick={() => setChartTf(tf)}
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 11,
              fontWeight: 700,
              padding: '3px 8px',
              borderRadius: 3,
              cursor: 'pointer',
              letterSpacing: '0.5px',
              background: chartTf === tf
                ? 'linear-gradient(180deg,#FF9A00,#CC6600)'
                : 'linear-gradient(180deg,#1a1a1a,#0a0a0a)',
              color: chartTf === tf ? '#000' : '#FFFFFF',
              border: chartTf === tf
                ? '1px solid #FF9A00'
                : '1px solid rgba(255,255,255,0.16)',
              boxShadow: chartTf === tf ? '0 0 8px rgba(255,154,0,0.4)' : 'none',
            }}
          >
            {tf.toUpperCase()}
          </button>
        ))}
        {tfFetching && (
          <span style={{ fontSize: 10, color: 'rgba(255,154,0,0.7)', alignSelf: 'center' }}>...</span>
        )}
      </div>
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          display: 'block',
          userSelect: 'none',
          pointerEvents: 'none',
        }}
      />

    </div>
  )
}

// ── Straddle Trade Card ───────────────────────────────────────────────────────
function TradeCard({
  trade,
  symbol: _symbol,
  side,
  expiryOptions,
  selectedExpiry,
  onExpiryChange,
  expiryLoading,
}: {
  trade: StraddleTrade
  symbol: string
  side: 'call' | 'put'
  expiryOptions?: string[]
  selectedExpiry?: string
  onExpiryChange?: (expiry: string) => void
  expiryLoading?: boolean
}) {
  const isCall = side === 'call'
  const accent = isCall ? '#00FF88' : '#FF3050'
  const accent2 = isCall ? '#00CC6A' : '#CC1E36'
  const glowColor = isCall ? 'rgba(0,255,136,0.14)' : 'rgba(255,48,80,0.14)'
  const borderClr = isCall ? 'rgba(0,255,136,0.30)' : 'rgba(255,48,80,0.30)'
  const headerBg = isCall
    ? 'linear-gradient(135deg, rgba(0,38,20,0.97) 0%, rgba(0,16,10,0.99) 100%)'
    : 'linear-gradient(135deg, rgba(44,0,10,0.97) 0%, rgba(24,0,6,0.99) 100%)'

  const strike = isCall ? trade.callStrike : trade.putStrike
  const entry = isCall ? trade.callEntry : trade.putEntry
  const t1Stock = isCall ? trade.callT1Stock : trade.putT1Stock
  const t1Prem = isCall ? trade.callT1Premium : trade.putT1Premium
  const t2Stock = isCall ? trade.callT2Stock : trade.putT2Stock
  const t2Prem = isCall ? trade.callT2Premium : trade.putT2Premium

  const t1PremChange = entry > 0 ? ((t1Prem - entry) / entry) * 100 : 0
  const t2PremChange = entry > 0 ? ((t2Prem - entry) / entry) * 100 : 0
  const t1StockChange = ((t1Stock - trade.currentPrice) / trade.currentPrice) * 100
  const t2StockChange = ((t2Stock - trade.currentPrice) / trade.currentPrice) * 100

  const mono: React.CSSProperties = { fontFamily: 'JetBrains Mono, monospace' }

  const Row = ({
    label,
    labelColor,
    stockPrice,
    stockChg,
    premium,
    premChg,
    rowBg,
  }: {
    label: string
    labelColor: string
    stockPrice: number
    stockChg: number
    premium: number
    premChg: number
    rowBg: string
  }) => (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '48px 1fr 1fr',
      padding: '10px 14px',
      borderBottom: '1px solid rgba(255,255,255,0.07)',
      background: rowBg,
      gap: 6,
      alignItems: 'center',
    }}>
      {/* Level badge */}
      <div style={{
        ...mono, fontSize: 13, fontWeight: 900, color: labelColor,
        background: '#000', border: `1px solid ${labelColor}`,
        borderRadius: 3, padding: '4px 5px', textAlign: 'center',
        letterSpacing: '0.5px', whiteSpace: 'nowrap',
      }}>
        {label}
      </div>
      {/* Stock price */}
      <div>
        <div style={{ ...mono, fontSize: 19, fontWeight: 800, color: '#FFFFFF', lineHeight: 1.25 }}>
          ${stockPrice.toFixed(2)}
        </div>
        <div style={{ ...mono, fontSize: 14, fontWeight: 700, color: '#FFFFFF' }}>
          {stockChg >= 0 ? '+' : ''}{stockChg.toFixed(1)}%
        </div>
      </div>
      {/* Premium */}
      <div>
        <div style={{ ...mono, fontSize: 19, fontWeight: 800, color: '#FFFFFF', lineHeight: 1.25 }}>
          ${premium.toFixed(2)}
        </div>
        <div style={{ ...mono, fontSize: 14, fontWeight: 700, color: premChg >= 0 ? '#00FF88' : '#FF3050' }}>
          {premChg >= 0 ? '+' : ''}{premChg.toFixed(0)}%
        </div>
      </div>
    </div>
  )

  return (
    <div style={{
      background: 'linear-gradient(175deg, #07111e 0%, #03080f 60%, #010406 100%)',
      border: `1px solid ${borderClr}`,
      borderTop: `2px solid ${accent}`,
      borderRadius: 6,
      overflow: 'hidden',
      boxShadow: `0 3px 20px ${glowColor}`,
    }}>
      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{
        background: headerBg,
        borderBottom: `1px solid ${borderClr}`,
        padding: '10px 12px 9px',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ ...mono, fontSize: 21, fontWeight: 900, color: '#FFFFFF', letterSpacing: '0.3px' }}>
                ${strike}
              </span>
              <span style={{ ...mono, fontSize: 20, fontWeight: 800, color: accent }}>
                @${entry.toFixed(2)}
              </span>
            </div>
            <span style={{ ...mono, fontSize: 21, fontWeight: 900, color: '#FFFFFF', letterSpacing: '0.3px' }}>
              {isCall ? 'Calls' : 'Puts'}
            </span>
          </div>
          {/* Expiry selector — only on call card; put card mirrors the value */}
          {isCall && expiryOptions && onExpiryChange ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {expiryLoading && (
                  <svg width="10" height="10" viewBox="0 0 11 11" style={{ animation: 'stSpin 0.8s linear infinite', flexShrink: 0 }} fill="none">
                    <circle cx="5.5" cy="5.5" r="4" stroke="rgba(255,154,0,0.3)" strokeWidth="1.5" />
                    <path d="M5.5 1.5 A4 4 0 0 1 9.5 5.5" stroke="#FF9A00" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                )}
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, fontWeight: 900, color: '#FF9A00', letterSpacing: '1px', textAlign: 'center', lineHeight: 1.2, opacity: 0.75 }}>
                  ADJUST<br />EXPIRY
                </span>
              </div>
              <select
                value={selectedExpiry ?? ''}
                onChange={e => { e.stopPropagation(); onExpiryChange(e.target.value) }}
                onClick={e => e.stopPropagation()}
                style={{
                  fontFamily: 'JetBrains Mono, monospace', fontSize: 12, fontWeight: 800, letterSpacing: '0.5px',
                  color: '#FF9A00',
                  background: 'linear-gradient(180deg, #1a1a1a 0%, #000000 100%)',
                  border: '1px solid rgba(255,154,0,0.5)',
                  borderRadius: 5,
                  padding: '5px 8px',
                  cursor: 'pointer', outline: 'none',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.7)',
                }}
              >
                {expiryOptions.map(exp => (
                  <option key={exp} value={exp} style={{ background: '#000000', color: '#FF9A00' }}>
                    {fmtExpiryShort(exp)}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <span style={{ ...mono, fontSize: 14, fontWeight: 700, color: '#FFFFFF' }}>
              {fmtExpiry(trade.expiration)}
            </span>
          )}
        </div>
      </div>

      {/* ── Column headers ─────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '48px 1fr 1fr',
        padding: '6px 14px',
        background: 'rgba(0,0,0,0.50)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        gap: 6,
      }}>
        {['', 'STOCK', 'PREM'].map(h => (
          <div key={h} style={{ ...mono, fontSize: 13, fontWeight: 800, color: '#FF9A00', letterSpacing: '1px' }}>
            {h}
          </div>
        ))}
      </div>

      <Row
        label="T1"
        labelColor={accent}
        stockPrice={t1Stock}
        stockChg={t1StockChange}
        premium={t1Prem}
        premChg={t1PremChange}
        rowBg={`${accent}08`}
      />
      <Row
        label="T2"
        labelColor={accent2}
        stockPrice={t2Stock}
        stockChg={t2StockChange}
        premium={t2Prem}
        premChg={t2PremChange}
        rowBg={`${accent2}06`}
      />
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
  onAddToPortfolio,
  poiLoadingSet,
}: {
  results: ScanResult[]
  onSelect: (r: ScanResult) => void
  onScanPOI: (r: ScanResult) => void
  onAddToPortfolio: (r: ScanResult) => void
  poiLoadingSet: Set<string>
}) {
  const [addedSymbols, setAddedSymbols] = useState<Set<string>>(new Set())
  const [expiryBySymbol, setExpiryBySymbol] = useState<Map<string, string>>(new Map())
  const [expiryTradeBySymbol, setExpiryTradeBySymbol] = useState<Map<string, StraddleTrade | null>>(new Map())
  const [expiryLoadingSet, setExpiryLoadingSet] = useState<Set<string>>(new Set())
  const handleExpiryChange = useCallback(async (r: ScanResult, newExpiry: string) => {
    setExpiryBySymbol(prev => { const m = new Map(prev); m.set(r.symbol, newExpiry); return m })
    setExpiryLoadingSet(prev => { const s = new Set(prev); s.add(r.symbol); return s })
    try {
      const apiKey = process.env.NEXT_PUBLIC_POLYGON_API_KEY ?? ''
      const trade = buildStraddleTrade(r.bars, r.symbol, r.compressionPct, 'gray', newExpiry)
      const real = await fetchRealStraddlePrices(r.symbol, newExpiry, trade.callStrike, trade.putStrike, r.currentPrice, apiKey)
      const patched = real ? patchTradeWithRealPrices(trade, real) : trade
      setExpiryTradeBySymbol(prev => { const m = new Map(prev); m.set(r.symbol, patched); return m })
    } catch { /* keep existing */ } finally {
      setExpiryLoadingSet(prev => { const s = new Set(prev); s.delete(r.symbol); return s })
    }
  }, [])
  const mono: React.CSSProperties = { fontFamily: 'JetBrains Mono, monospace' }
  const [aOnlyTiers, setAOnlyTiers] = useState<Set<string>>(new Set())
  const [rareOnlyTiers, setRareOnlyTiers] = useState<Set<string>>(new Set())
  const [sortPctTiers, setSortPctTiers] = useState<Map<string, 'desc' | 'asc'>>(new Map())
  const toggleAOnly = (label: string) => setAOnlyTiers(prev => { const s = new Set(prev); s.has(label) ? s.delete(label) : s.add(label); return s })
  const toggleRareOnly = (label: string) => setRareOnlyTiers(prev => { const s = new Set(prev); s.has(label) ? s.delete(label) : s.add(label); return s })
  const toggleSortPct = (label: string) => setSortPctTiers(prev => {
    const m = new Map(prev)
    if (!m.has(label)) m.set(label, 'desc')
    else if (m.get(label) === 'desc') m.set(label, 'asc')
    else m.delete(label)
    return m
  })

  const sorted = [...results].sort((a, b) => {
    if (a.setupActive !== b.setupActive) return a.setupActive ? -1 : 1
    return b.compressionPct - a.compressionPct
  })
  if (!sorted.length) return null

  type Tier = { label: string; accent: string; items: ScanResult[] }
  const tiers: Tier[] = [
    { label: 'PIVOTAL SPOT + HIGH VOL', accent: '#41B6F6', items: [] },
    { label: 'HIGH PRESSURE + LOW VOL', accent: '#FFD700', items: [] },
  ]
  for (const r of sorted) {
    if (r.setupTier === 'high-pressure') tiers[1].items.push(r)
    else tiers[0].items.push(r)
  }

  const compressColor = (r: ScanResult) => {
    if (r.setupTier === 'high-pressure') return '#FFD700'
    return '#41B6F6'
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
      {tiers.map(tier => {
        const aOn = aOnlyTiers.has(tier.label)
        const rOn = rareOnlyTiers.has(tier.label)
        const pctOn = sortPctTiers.get(tier.label)
        const filteredItems = (pctOn
          ? [...tier.items].sort((a, b) => pctOn === 'asc' ? a.compressionPct - b.compressionPct : b.compressionPct - a.compressionPct)
          : tier.items
        ).filter(r => {
          if (aOn) { const sc = calcContractionBreakoutScore(r.bars, r.allEvents); if (!sc || (sc.pct * 100) < 75) return false }
          if (rOn && !r.squeezeOn) return false
          return true
        })
        const noPOIItems = filteredItems.filter(r => !r.hasPOI)
        const anyScanning = noPOIItems.some(r => poiLoadingSet.has(r.symbol))
        return (
          <div key={tier.label} style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 155px)', minHeight: 0, scrollbarWidth: 'thin', scrollbarColor: `${tier.accent}55 rgba(255,255,255,0.04)` }}>
            {/* Tier header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              position: 'sticky', top: 0, zIndex: 2,
              background: `linear-gradient(180deg, #0d1f35 0%, #081629 55%, #060f20 100%)`,
              boxShadow: `inset 0 1px 0 rgba(255,255,255,0.07), inset 0 -1px 0 ${tier.accent}30, 0 4px 16px rgba(0,0,0,0.55)`,
              borderLeft: `3px solid ${tier.accent}`,
              borderBottom: `1px solid ${tier.accent}45`,
              padding: '11px 14px 11px 16px',
              borderRadius: '0 3px 0 0',
            }}>
              {/* Left: label + count */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span style={{ ...mono, fontSize: 17, fontWeight: 900, color: tier.accent, letterSpacing: '3.5px', textShadow: `0 0 18px ${tier.accent}55` }}>
                  {tier.label}
                </span>
                <span style={{
                  ...mono, fontSize: 12, fontWeight: 800, color: tier.accent,
                  background: `${tier.accent}14`, borderRadius: 4,
                  padding: '1px 7px', border: `1px solid ${tier.accent}30`,
                  letterSpacing: '0.5px',
                }}>
                  {filteredItems.length}
                </span>
              </div>
              {/* Right: all buttons */}
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => toggleAOnly(tier.label)} style={{
                  ...mono, fontSize: 12, fontWeight: 900, letterSpacing: '1px',
                  padding: '5px 13px', borderRadius: 4, cursor: 'pointer', transition: 'all 0.12s',
                  background: aOn ? 'linear-gradient(180deg,#00FF88,#00bb66)' : 'linear-gradient(180deg,#1c1c1c,#080808)',
                  color: aOn ? '#000' : '#00FF88',
                  border: `1px solid #00FF88`,
                  boxShadow: aOn ? 'inset 0 1px 0 rgba(255,255,255,0.2), 0 0 10px rgba(0,255,136,0.4)' : 'inset 0 1px 0 rgba(255,255,255,0.06)',
                  outline: 'none',
                }}>A SCORE</button>
                <button onClick={() => toggleRareOnly(tier.label)} style={{
                  ...mono, fontSize: 12, fontWeight: 900, letterSpacing: '1px',
                  padding: '5px 13px', borderRadius: 4, cursor: 'pointer', transition: 'all 0.12s',
                  background: rOn ? 'linear-gradient(180deg,#FFFFFF,#cccccc)' : 'linear-gradient(180deg,#1c1c1c,#080808)',
                  color: rOn ? '#000' : '#FFFFFF',
                  border: `1px solid #FFFFFF`,
                  boxShadow: rOn ? 'inset 0 1px 0 rgba(255,255,255,0.3), 0 0 10px rgba(255,255,255,0.3)' : 'inset 0 1px 0 rgba(255,255,255,0.06)',
                  outline: 'none',
                }}>RARE</button>
                <button onClick={() => toggleSortPct(tier.label)} style={{
                  ...mono, fontSize: 12, fontWeight: 900, letterSpacing: '1px',
                  padding: '5px 13px', borderRadius: 4, cursor: 'pointer', transition: 'all 0.12s',
                  background: pctOn ? 'linear-gradient(180deg,#FF9A00,#cc6600)' : 'linear-gradient(180deg,#1c1c1c,#080808)',
                  color: pctOn ? '#000' : '#FF9A00',
                  border: `1px solid #FF9A00`,
                  boxShadow: pctOn ? 'inset 0 1px 0 rgba(255,255,255,0.2), 0 0 10px rgba(255,154,0,0.4)' : 'inset 0 1px 0 rgba(255,255,255,0.06)',
                  outline: 'none',
                }}>{pctOn === 'desc' ? '% ↓' : pctOn === 'asc' ? '% ↑' : '% HIGH'}</button>
                {noPOIItems.length > 0 && (
                  <button
                    disabled={anyScanning}
                    onClick={() => noPOIItems.forEach(r => onScanPOI(r))}
                    style={{
                      ...mono, fontSize: 12, fontWeight: 900, letterSpacing: '1px',
                      padding: '5px 13px', borderRadius: 4, cursor: anyScanning ? 'default' : 'pointer',
                      outline: 'none', transition: 'all 0.12s',
                      background: anyScanning ? 'linear-gradient(180deg,#1c1c1c,#080808)' : 'linear-gradient(180deg,#1c1c1c,#080808)',
                      color: anyScanning ? 'rgba(0,212,255,0.4)' : '#00D4FF',
                      border: `1px solid #00D4FF`,
                      boxShadow: anyScanning ? 'none' : 'inset 0 1px 0 rgba(255,255,255,0.06)',
                      display: 'flex', alignItems: 'center', gap: 5,
                    }}
                  >
                    {anyScanning
                      ? <><svg width="10" height="10" viewBox="0 0 11 11" style={{ animation: 'stSpin 0.8s linear infinite' }} fill="none"><circle cx="5.5" cy="5.5" r="4" stroke="rgba(0,212,255,0.3)" strokeWidth="1.5" /><path d="M5.5 1.5 A4 4 0 0 1 9.5 5.5" stroke="#00D4FF" strokeWidth="1.5" strokeLinecap="round" /></svg>SCANNING...</>
                      : <>SCAN ALL POI ({noPOIItems.length})</>
                    }
                  </button>
                )}
              </div>
            </div>

            {/* Cards stacked vertically per tier — independently scrollable */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingRight: 4, paddingTop: 14, paddingBottom: 20 }}>
              {filteredItems.map(r => {
                const latestEvt = r.recentEvents[r.recentEvents.length - 1]
                const poiDate = r.topPOI?.dates?.[r.topPOI.dates.length - 1] ?? null
                const prevClose = r.bars.length >= 2 ? r.bars[r.bars.length - 2].close : null
                const dayChangePct = prevClose ? ((r.currentPrice - prevClose) / prevClose) * 100 : null
                const effectiveTrade = expiryTradeBySymbol.get(r.symbol) ?? r.trade
                const selectedExpiry = expiryBySymbol.get(r.symbol) ?? effectiveTrade?.expiration
                const expiryOptions = getUpcomingExpiries(effectiveTrade?.expiration)
                const dayChangeColor = dayChangePct == null ? '#FFFFFF' : dayChangePct >= 0 ? '#00FF88' : '#FF4060'
                return (
                  <div
                    key={r.symbol}
                    style={{
                      background: '#000000',
                      border: `2px solid ${compressColor(r)}`,
                      borderRadius: 6,
                      padding: '14px 16px 4px',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                      overflow: 'hidden',
                      transition: 'border-color 0.15s, background 0.15s',
                      boxShadow: `0 0 10px ${compressColor(r)}22`,
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
                        <span style={{
                          ...mono, fontSize: 11, fontWeight: 800,
                          color: r.squeezeOn ? '#00FF88' : 'rgba(255,255,255,0.28)',
                          background: r.squeezeOn ? 'rgba(0,255,136,0.1)' : 'rgba(255,255,255,0.04)',
                          border: r.squeezeOn ? '1px solid rgba(0,255,136,0.35)' : '1px solid rgba(255,255,255,0.1)',
                          borderRadius: 3, padding: '2px 7px', letterSpacing: '0.8px',
                        }}>
                          {r.squeezeOn ? 'RARE' : 'COMMON'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {/* SCAN POI button — always visible when no POI yet */}
                        {!r.hasPOI && (
                          <button
                            disabled={poiLoadingSet.has(r.symbol)}
                            onClick={e => { e.stopPropagation(); onScanPOI(r) }}
                            style={{
                              ...mono,
                              fontSize: 12,
                              fontWeight: 900,
                              letterSpacing: '1.5px',
                              color: '#000000',
                              background: poiLoadingSet.has(r.symbol)
                                ? 'linear-gradient(180deg, #b36200 0%, #7a3e00 100%)'
                                : 'linear-gradient(180deg, #FF9A00 0%, #CC6600 100%)',
                              border: '1px solid rgba(255,180,0,0.6)',
                              boxShadow: poiLoadingSet.has(r.symbol)
                                ? 'none'
                                : 'inset 0 1px 0 rgba(255,255,255,0.25), 0 2px 8px rgba(255,140,0,0.4)',
                              borderRadius: 5,
                              padding: '5px 13px',
                              cursor: poiLoadingSet.has(r.symbol) ? 'default' : 'pointer',
                              transition: 'all 0.15s',
                              display: 'flex', alignItems: 'center', gap: 6,
                            }}
                          >
                            {poiLoadingSet.has(r.symbol)
                              ? <><svg width="11" height="11" viewBox="0 0 11 11" style={{ animation: 'stSpin 0.8s linear infinite' }} fill="none"><circle cx="5.5" cy="5.5" r="4" stroke="rgba(0,0,0,0.5)" strokeWidth="1.5" /><path d="M5.5 1.5 A4 4 0 0 1 9.5 5.5" stroke="#000" strokeWidth="1.5" strokeLinecap="round" /></svg>SCANNING...</>
                              : <><svg width="11" height="11" viewBox="0 0 11 11" fill="none"><circle cx="4.5" cy="4.5" r="3.2" stroke="#000" strokeWidth="1.4" /><line x1="7" y1="7" x2="10" y2="10" stroke="#000" strokeWidth="1.4" strokeLinecap="round" /></svg>SCAN POI</>
                            }
                          </button>
                        )}
                        <div style={{
                          ...mono, fontSize: 20, fontWeight: 900,
                          color: compressColor(r),
                          background: `${compressColor(r)}18`,
                          border: `1px solid ${compressColor(r)}44`,
                          borderRadius: 4,
                          padding: '3px 10px',
                        }}>
                          {r.compressionPct.toFixed(0)}%
                        </div>
                        {(() => {
                          const sc = calcContractionBreakoutScore(r.bars, r.allEvents)
                          if (!sc) return null
                          const pct = sc.pct * 100
                          const grade = pct >= 75 ? 'A' : pct >= 50 ? 'B' : pct >= 25 ? 'C' : 'D'
                          const gradeColor = grade === 'A' ? '#00FF88' : grade === 'B' ? '#FF9A00' : grade === 'C' ? '#FFD700' : '#FF3050'
                          return (
                            <div style={{
                              ...mono,
                              display: 'flex', flexDirection: 'column', alignItems: 'center',
                              color: gradeColor,
                              background: `${gradeColor}18`,
                              border: `1px solid ${gradeColor}44`,
                              borderRadius: 4,
                              padding: '2px 10px 3px',
                              lineHeight: 1.15,
                            }}>
                              <span style={{ fontSize: 22, fontWeight: 900 }}>{grade}</span>
                            </div>
                          )
                        })()}
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
                          {effectiveTrade && (
                            <span style={{ marginLeft: 16, fontSize: 17, fontWeight: 800, color: '#FF8C00', letterSpacing: '0.5px' }}>
                              Trade Cost : <span style={{ color: '#FF2040', fontWeight: 900 }}>-${effectiveTrade.totalCost.toFixed(0)}</span>
                            </span>
                          )}
                        </div>
                        {/* Strikes + targets — two columns */}
                        {effectiveTrade ? (
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
                              {/* Row 2: strike + price */}
                              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', fontSize: 16, fontWeight: 700, justifyContent: 'center' }}>
                                <span style={{ color: '#FFFFFF', fontWeight: 900 }}>${effectiveTrade.callStrike.toFixed(0)} Calls</span>
                                <span style={{ color: '#FFD080', fontWeight: 800 }}>@${effectiveTrade.callEntry.toFixed(2)}</span>
                              </div>
                              {/* Row 3: targets side by side */}
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                                <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                                  <span style={{ color: '#00FF00', fontSize: 16, fontWeight: 900, letterSpacing: '1.5px' }}>Target #1</span>
                                  <span style={{ color: '#00FF00', fontSize: 18, fontWeight: 900 }}>${effectiveTrade.callT1Stock.toFixed(2)}</span>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                                  <span style={{ color: '#00FF00', fontSize: 16, fontWeight: 900, letterSpacing: '1.5px' }}>Target #2</span>
                                  <span style={{ color: '#00FF00', fontSize: 18, fontWeight: 900 }}>${effectiveTrade.callT2Stock.toFixed(2)}</span>
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
                              {/* Row 2: strike + price */}
                              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', fontSize: 16, fontWeight: 700, justifyContent: 'center' }}>
                                <span style={{ color: '#FFFFFF', fontWeight: 900 }}>${effectiveTrade.putStrike.toFixed(0)} Puts</span>
                                <span style={{ color: '#FFD080', fontWeight: 800 }}>@${effectiveTrade.putEntry.toFixed(2)}</span>
                              </div>
                              {/* Row 3: targets side by side */}
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                                <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                                  <span style={{ color: '#FF2040', fontSize: 16, fontWeight: 900, letterSpacing: '1.5px' }}>Target #1</span>
                                  <span style={{ color: '#FF2040', fontSize: 18, fontWeight: 900 }}>${effectiveTrade.putT1Stock.toFixed(2)}</span>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                                  <span style={{ color: '#FF2040', fontSize: 16, fontWeight: 900, letterSpacing: '1.5px' }}>Target #2</span>
                                  <span style={{ color: '#FF2040', fontSize: 18, fontWeight: 900 }}>${effectiveTrade.putT2Stock.toFixed(2)}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div style={{ ...mono, fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>— no trade data</div>
                        )}
                      </div>
                    ) : r.poiScanPending ? (
                      <div style={{ ...mono, fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.5px' }}>
                        — no POI detected in scan window
                      </div>
                    ) : null}

                    {/* Row 4: Chart + Trade cards side by side */}
                    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginTop: 4, marginLeft: -16, marginRight: -16 }}>
                      <div style={{ flex: 1, height: 520, borderRadius: 4, overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                        <StraddleChart
                          candles={r.bars.slice(-CHART_VISIBLE_DAYS)}
                          events={r.allEvents}
                          dpDays={r.dpDays}
                          poiLevels={r.poiLevels}
                          symbol={r.symbol}
                          trade={effectiveTrade}
                        />
                      </div>
                      {r.setupActive && effectiveTrade && (
                        <div style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
                          <TradeCard trade={effectiveTrade} symbol={r.symbol} side="call"
                            expiryOptions={expiryOptions}
                            selectedExpiry={selectedExpiry}
                            onExpiryChange={newExpiry => handleExpiryChange(r, newExpiry)}
                            expiryLoading={expiryLoadingSet.has(r.symbol)}
                          />
                          <TradeCard trade={effectiveTrade} symbol={r.symbol} side="put" />
                          <button
                            onClick={() => {
                              if (addedSymbols.has(r.symbol)) return
                              onAddToPortfolio(r)
                              setAddedSymbols(prev => new Set([...prev, r.symbol]))
                            }}
                            style={{
                              fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 900,
                              letterSpacing: '1px', padding: '7px 0', cursor: addedSymbols.has(r.symbol) ? 'default' : 'pointer',
                              borderRadius: 5,
                              border: addedSymbols.has(r.symbol) ? '1px solid rgba(0,255,136,0.4)' : '1px solid rgba(255,154,0,0.35)',
                              background: addedSymbols.has(r.symbol) ? 'rgba(0,255,136,0.08)' : 'rgba(255,154,0,0.08)',
                              color: addedSymbols.has(r.symbol) ? '#00FF88' : '#FF9A00',
                              outline: 'none', width: '100%', transition: 'all 0.12s',
                            }}
                            onMouseEnter={e => { if (!addedSymbols.has(r.symbol)) { e.currentTarget.style.background = 'rgba(255,154,0,0.18)'; e.currentTarget.style.borderColor = 'rgba(255,154,0,0.6)' } }}
                            onMouseLeave={e => { if (!addedSymbols.has(r.symbol)) { e.currentTarget.style.background = 'rgba(255,154,0,0.08)'; e.currentTarget.style.borderColor = 'rgba(255,154,0,0.35)' } }}
                          >
                            {addedSymbols.has(r.symbol) ? '✓ IN PORTFOLIO' : '+ ADD TO PORTFOLIO'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Signal Card ───────────────────────────────────────────────────────────────
// ── Main Component ─────────────────────────────────────────────────────────────
export default function StraddleTownScreener({ autoRun = false }: { autoRun?: boolean }) {
  const mono: React.CSSProperties = { fontFamily: 'JetBrains Mono, monospace' }
  const API_KEY = process.env.NEXT_PUBLIC_POLYGON_API_KEY ?? ''
  const abortRef = useRef<AbortController | null>(null)


  useEffect(() => {
    getRiskFreeRate().then(r => { if (r !== null) RISK_FREE_RATE = r })
  }, [])

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
  const [viewMode, setViewMode] = useState<ViewMode>('setups')
  const [minCompression, setMinCompression] = useState<number>(40)
  const [sqzOnly, setSqzOnly] = useState(false)
  const [showPortfolio, setShowPortfolio] = useState(false)

  const addToPortfolio = useCallback((r: ScanResult) => {
    if (!r.trade || !r.setupTier) return
    const pos: Omit<StraddlePosition, 'id'> = {
      symbol: r.symbol, tier: r.setupTier, addedAt: Date.now(),
      stockPriceAtEntry: r.trade.currentPrice, expiration: r.trade.expiration, status: 'OPEN',
      call: {
        strike: r.trade.callStrike, entryPrice: r.trade.callEntry, contracts: 1,
        t1Stock: r.trade.callT1Stock, t2Stock: r.trade.callT2Stock,
        t1Prem: r.trade.callT1Premium, t2Prem: r.trade.callT2Premium,
        stopPrice: r.trade.callStop, status: 'OPEN', closedPrice: null, closedAt: null
      },
      put: {
        strike: r.trade.putStrike, entryPrice: r.trade.putEntry, contracts: 1,
        t1Stock: r.trade.putT1Stock, t2Stock: r.trade.putT2Stock,
        t1Prem: r.trade.putT1Premium, t2Prem: r.trade.putT2Premium,
        stopPrice: r.trade.putStop, status: 'OPEN', closedPrice: null, closedAt: null
      },
    }
    spAddPosition(pos)
    setShowPortfolio(true)
  }, [])


  // ── Detail view state (when user clicks a row) ─────────────────────────────
  const [selected, setSelected] = useState<ScanResult | null>(null)
  const [selectedFromTickerSearch, setSelectedFromTickerSearch] = useState(false)

  // ── Individual ticker search ───────────────────────────────────────────────
  const [tickerSearch, setTickerSearch] = useState('')
  const [tickerScanning, setTickerScanning] = useState(false)
  const [tickerScanStatus, setTickerScanStatus] = useState<{ phase: 'ohlcv' | 'dp'; dpDate?: string; dpDone: number; dpTotal: number } | null>(null)
  const [tickerSearchedSymbols, setTickerSearchedSymbols] = useState<string[]>([])
  const [tickerLookback, setTickerLookback] = useState<252 | 756 | 1260>(252) // 1Y / 3Y / 5Y

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
    const mode = 'contraction' as const

    setPhase('fetching-symbols')
    setResults([])
    setSelected(null)
    setErrorMsg(null)
    setStats({ totalSymbols: 0, ohlcvDone: 0, contractionHits: 0, dpDone: 0, setupsFound: 0 })

    try {
      // ── Phase 1: fetch symbol universe ───────────────────────────────────
      const symbols = await fetchTopSymbols(API_KEY, MAX_SYMBOLS, signal)
      if (signal.aborted) return
      if (!symbols.length) {
        // shouldn't happen since hardcoded fallback is always non-empty
        throw new Error('Symbol universe is empty')
      }

      setStats((s) => ({ ...s, totalSymbols: symbols.length }))
      setPhase('scanning-ohlcv')

      // ── Phase 2: OHLCV + contraction scan — parallel Web Workers ────────
      // Split symbol universe across N workers (one per logical CPU, max 8).
      // Each worker fetches + detects independently; hits stream back via postMessage.
      const contractionHits: {
        symbol: string
        bars: Bar[]
        allEvents: ContraEvent[]
        recentEvents: ContraEvent[]
      }[] = []

      const OHLCV_WORKER_COUNT = Math.min(8, typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency ?? 4) : 4)
      const chunkSize = Math.ceil(symbols.length / OHLCV_WORKER_COUNT)
      const chunks = Array.from({ length: OHLCV_WORKER_COUNT }, (_, i) =>
        symbols.slice(i * chunkSize, (i + 1) * chunkSize)
      ).filter(c => c.length > 0)

      await new Promise<void>((resolve) => {
        let doneWorkers = 0
        const ohlcvWorkers: Worker[] = []
        const cleanup = () => ohlcvWorkers.forEach(w => w.terminate())

        signal.addEventListener('abort', () => { cleanup(); resolve() }, { once: true })

        for (const [wi, chunk] of chunks.entries()) {
          const worker = new Worker('/workers/straddleScanWorker.js')
          ohlcvWorkers.push(worker)

          worker.onmessage = (e) => {
            if (signal.aborted) return
            const msg = e.data
            if (msg.type === 'hit') {
              contractionHits.push({ symbol: msg.symbol, bars: msg.bars, allEvents: msg.allEvents, recentEvents: msg.recentEvents })
              setStats(s => ({ ...s, contractionHits: s.contractionHits + 1 }))
            } else if (msg.type === 'progress') {
              setStats(s => ({ ...s, ohlcvDone: s.ohlcvDone + 1 }))
            } else if (msg.type === 'log') {
              tlog(msg.msg)
            } else if (msg.type === 'done') {
              doneWorkers++
              if (doneWorkers === chunks.length) { cleanup(); resolve() }
            }
          }

          worker.onerror = (err) => {
            tlog(`[SCAN-W${wi}] worker error: ${err.message}`)
            doneWorkers++
            if (doneWorkers === chunks.length) { cleanup(); resolve() }
          }

          worker.postMessage({
            symbols: chunk,
            apiKey: API_KEY,
            calDays: FETCH_CAL_DAYS,
            ohlcvLimit: 1000,
            scanMode: mode,
            workerId: wi,
          })
        }
      })

      if (signal.aborted) return

      // ── Phase 3: dark pool scan — only if mode includes POI ────────────
      setPhase('scanning-dp')

      if (mode === 'contraction') {
        // Contraction-only mode: emit results directly without DP scan
        for (const hit of contractionHits) {
          if (signal.aborted) break
          const { symbol: sym, bars, allEvents: allEvts, recentEvents: recentEvts } = hit
          const latestEvent = recentEvts[recentEvts.length - 1]
          const compressionPct = latestEvent?.compressionPct ?? 0
          const setupActive = recentEvts.length > 0
          const setupTier: ScanResult['setupTier'] = (compressionPct >= 77 || compressionPct <= 35) ? 'high-pressure' : 'pivotal'
          const bubbleTier: 'gold' | 'blue' | 'gray' = setupTier === 'high-pressure' ? 'gold' : 'blue'
          let trade = setupActive ? buildStraddleTrade(bars, sym, compressionPct, bubbleTier) : null
          if (trade) {
            const rp = await fetchRealStraddlePrices(sym, trade.expiration, trade.callStrike, trade.putStrike, trade.currentPrice, API_KEY)
            if (rp) trade = patchTradeWithRealPrices(trade, rp)
          }
          const result: ScanResult = {
            symbol: sym,
            currentPrice: bars[bars.length - 1].close,
            compressionPct,
            squeezeOn: latestEvent?.squeezeOn ?? false,
            hasPOI: false,
            topPOI: null,
            setupActive,
            setupTier,
            bars,
            allEvents: allEvts,
            recentEvents: recentEvts,
            dpDays: [],
            poiLevels: [],
            trade,
            poiScanPending: false,
          }
          addResult(result)
          setStats((s) => ({ ...s, dpDone: s.dpDone + 1 }))
        }
        setPhase('done')
        return
      }

      // ── Phase 3: dark pool scan — pool of 4 Web Workers ───────────────
      // Main thread manages cache + dispatches one symbol per worker at a time.
      // Workers only do network fetching; POI clustering + trade building stay here.
      const DP_POOL_SIZE = 6
      const mag8Hits = contractionHits.filter(h => MAG8_SYMBOLS.has(h.symbol))
      const hitsMap = new Map(contractionHits.map(h => [h.symbol, h]))

      // Only scan DP for pivotal range (36-76%) + Rare or A score
      const dpScanSymbols = new Set<string>()
      for (const h of contractionHits) {
        if (MAG8_SYMBOLS.has(h.symbol)) continue
        const latestEvt = h.recentEvents[h.recentEvents.length - 1]
        const cPct = latestEvt?.compressionPct ?? 0
        if (cPct < 36 || cPct > 76) continue
        const isRare = latestEvt?.squeezeOn ?? false
        const score = calcContractionBreakoutScore(h.bars, h.allEvents)
        const isAScore = score !== null && score.pct * 100 >= 75
        if (isRare || isAScore) dpScanSymbols.add(h.symbol)
      }
      const dpQueue = contractionHits.filter(h => dpScanSymbols.has(h.symbol))
      tlog(`[DP] Phase 3 start - ${dpQueue.length} pivotal+Rare/A to scan (POI), pool=${DP_POOL_SIZE}`)

      // Emit Mag8 symbols immediately as pending (no DP scan)
      for (const hit of mag8Hits) {
        if (signal.aborted) break
        const latestEvt = hit.recentEvents[hit.recentEvents.length - 1]
        const pendingResult: ScanResult = {
          symbol: hit.symbol,
          currentPrice: hit.bars[hit.bars.length - 1].close,
          compressionPct: latestEvt?.compressionPct ?? 0,
          squeezeOn: latestEvt?.squeezeOn ?? false,
          hasPOI: false,
          topPOI: null,
          setupActive: false,
          setupTier: null,
          bars: hit.bars,
          allEvents: hit.allEvents,
          recentEvents: hit.recentEvents,
          dpDays: [],
          poiLevels: [],
          trade: null,
          poiScanPending: true,
        }
        addResult(pendingResult)
        setStats((s) => ({ ...s, dpDone: s.dpDone + 1 }))
      }

      // Emit High Pressure + Pivotal-without-Rare/A directly (no DP scan needed)
      for (const hit of contractionHits) {
        if (signal.aborted) break
        if (MAG8_SYMBOLS.has(hit.symbol)) continue
        if (dpScanSymbols.has(hit.symbol)) continue
        const latestEvent = hit.recentEvents[hit.recentEvents.length - 1]
        const compressionPct = latestEvent?.compressionPct ?? 0
        const setupTier: ScanResult['setupTier'] = (compressionPct >= 77 || compressionPct <= 35) ? 'high-pressure' : 'pivotal'
        const bubbleTier: 'gold' | 'blue' | 'gray' = setupTier === 'high-pressure' ? 'gold' : 'blue'
        const setupActive = hit.recentEvents.length > 0
        const hpRealExpiry = (setupActive && setupTier === 'high-pressure')
          ? await fetchNearestRealExpiry(hit.symbol, 21, API_KEY)
          : undefined
        let trade = setupActive ? buildStraddleTrade(hit.bars, hit.symbol, compressionPct, bubbleTier, hpRealExpiry) : null
        if (trade) {
          const rp = await fetchRealStraddlePrices(hit.symbol, trade.expiration, trade.callStrike, trade.putStrike, trade.currentPrice, API_KEY)
          if (rp) trade = patchTradeWithRealPrices(trade, rp)
        }
        const result: ScanResult = {
          symbol: hit.symbol,
          currentPrice: hit.bars[hit.bars.length - 1].close,
          compressionPct,
          squeezeOn: latestEvent?.squeezeOn ?? false,
          hasPOI: false,
          topPOI: null,
          setupActive,
          setupTier,
          bars: hit.bars,
          allEvents: hit.allEvents,
          recentEvents: hit.recentEvents,
          dpDays: [],
          poiLevels: [],
          trade,
          poiScanPending: false,
        }
        addResult(result)
        setStats(s => ({ ...s, dpDone: s.dpDone + 1 }))
      }

      if (dpQueue.length > 0 && !signal.aborted) {
        const todayStr = new Date().toISOString().split('T')[0]

        await new Promise<void>((resolve) => {
          const actualPoolSize = Math.min(DP_POOL_SIZE, dpQueue.length)
          let activeWorkers = actualPoolSize
          const dpWorkers: Worker[] = Array.from({ length: actualPoolSize }, (_, i) => new Worker('/workers/straddleDPWorker.js'))
          const cleanup = () => dpWorkers.forEach(w => w.terminate())

          signal.addEventListener('abort', () => { cleanup(); resolve() }, { once: true })

          const dispatch = async (worker: Worker, wid: number) => {
            if (signal.aborted || dpQueue.length === 0) {
              activeWorkers--
              if (activeWorkers === 0) { cleanup(); resolve() }
              return
            }
            const hit = dpQueue.shift()!
            const sym = hit.symbol
            const daysToScan = hit.bars.slice(-DP_LOOKBACK_DAYS).map(b => b.date)

            // Main thread checks cache — send only uncached dates to worker
            const cachedDays: DPDay[] = []
            const uncachedDates: string[] = []
            for (const date of daysToScan) {
              if (date === todayStr) { uncachedDates.push(date); continue }
              try {
                const raw = sessionStorage.getItem(`poi_dp_${sym}_${date}`)
                if (raw) { cachedDays.push(JSON.parse(raw)); continue }
              } catch { /* ignore */ }
              uncachedDates.push(date)
            }

            const cachedCount = cachedDays.length
            tlog(`[DP-W${wid}] dispatching ${sym} — ${uncachedDates.length} uncached / ${cachedCount} cached dates`)
            worker.postMessage({ symbol: sym, dates: uncachedDates, apiKey: API_KEY, workerId: wid })

            worker.onmessage = async (e) => {
              if (signal.aborted) return
              const msg = e.data
              if (msg.type === 'log') {
                tlog(msg.msg)
              } else if (msg.type === 'progress') {
                // progress tick — no-op here (logged inside worker)
              } else if (msg.type === 'done') {
                // Write new results to cache
                for (const day of (msg.dpDays as DPDay[])) {
                  try { sessionStorage.setItem(`poi_dp_${sym}_${day.date}`, JSON.stringify(day)) } catch { /* quota */ }
                }

                // Merge cached + fresh, sorted by date
                const dpResults: DPDay[] = [...cachedDays, ...msg.dpDays].sort((a, b) => a.date.localeCompare(b.date))

                const hitData = hitsMap.get(sym)!

                // triggerDate = most recent contraction date. POI tier = gold/blue/gray based on 90-day notional rank.
                const triggerDate = hitData.recentEvents.length > 0
                  ? hitData.recentEvents[hitData.recentEvents.length - 1].date
                  : hitData.bars[hitData.bars.length - 1].date

                const poi = clusterPOI(dpResults)
                const { activePOI } = computeSetupTier(dpResults, triggerDate)
                const setupTier: ScanResult['setupTier'] = 'pivotal' // DP scan only runs for pivotal-range stocks
                const bubbleTier: 'gold' | 'blue' | 'gray' = 'blue'
                const hasPOI = activePOI !== null
                const setupActive = hitData.recentEvents.length > 0 && hasPOI

                // ── DEBUG: log POI reasoning for every symbol ─────────────
                const contractionDates = hitData.recentEvents.map(e => e.date)
                const dpDateRange = dpResults.length
                  ? `${dpResults[0].date} → ${dpResults[dpResults.length - 1].date}`
                  : 'NO DP DAYS'
                const allPoiDates = poi.flatMap(p => p.dates)
                console.group(`[ST POI] ${sym}`)
                console.log(`  contraction dates        : ${contractionDates.join(', ') || 'NONE'}`)
                console.log(`  trigger date             : ${triggerDate}`)
                console.log(`  dpDays returned          : ${dpResults.length} | range: ${dpDateRange}`)
                console.log(`  poi clusters             : ${poi.length} | all poi dates: ${[...new Set(allPoiDates)].sort().slice(-10).join(', ')}`)
                console.log(`  activePOI=$${activePOI?.price.toFixed(2) ?? 'none'} | bubbleTier=${bubbleTier} | setupTier=${setupTier}`)
                console.log(`  hasPOI=${hasPOI} | setupActive=${setupActive}`)
                if (!hasPOI && dpResults.length === 0) {
                  console.warn(`  ⚠ Worker returned 0 dp days — check rate limiting or date window`)
                }
                console.groupEnd()
                // ─────────────────────────────────────────────────────────

                const latestEvent = hitData.recentEvents[hitData.recentEvents.length - 1]
                const compressionPct = latestEvent?.compressionPct ?? 0
                const isThur = new Date().getDay() === 4
                const realExpiry = setupActive ? await fetchNearestRealExpiry(sym, isThur ? 1 : 0, API_KEY, isThur) : undefined
                let trade = setupActive ? buildStraddleTrade(hitData.bars, sym, compressionPct, bubbleTier, realExpiry) : null
                if (trade) {
                  const rp = await fetchRealStraddlePrices(sym, trade.expiration, trade.callStrike, trade.putStrike, trade.currentPrice, API_KEY)
                  if (rp) trade = patchTradeWithRealPrices(trade, rp)
                }

                const result: ScanResult = {
                  symbol: sym,
                  currentPrice: hitData.bars[hitData.bars.length - 1].close,
                  compressionPct,
                  squeezeOn: latestEvent?.squeezeOn ?? false,
                  hasPOI,
                  topPOI: activePOI,
                  setupActive,
                  setupTier,
                  bars: hitData.bars,
                  allEvents: hitData.allEvents,
                  recentEvents: hitData.recentEvents,
                  dpDays: dpResults,
                  poiLevels: poi,
                  trade,
                }
                addResult(result)
                setStats((s) => ({
                  ...s,
                  dpDone: s.dpDone + 1,
                  setupsFound: s.setupsFound + (setupActive ? 1 : 0),
                }))
                tlog(`[DP-W${wid}] ${sym} done — hasPOI=${hasPOI} setupActive=${setupActive} dpDays=${dpResults.length}`)

                // Re-use this worker for the next symbol in the queue
                dispatch(worker, wid)
              }
            }

            worker.onerror = (err) => {
              tlog(`[DP-W${wid}] ${sym} worker error: ${err.message}`)
              setStats(s => ({ ...s, dpDone: s.dpDone + 1 }))
              dispatch(worker, wid)
            }
          }

          for (const [wi, worker] of dpWorkers.entries()) {
            dispatch(worker, wi)
          }
        })
      }

      setPhase('done')
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') return
      setErrorMsg(err instanceof Error ? err.message : 'Scan failed')
      setPhase('error')
    }
  }, [API_KEY, addResult])

  // Auto-run the scan on mount when the sidebar has pre-fetching enabled
  const autoRunFiredRef = useRef(false)
  useEffect(() => {
    if (autoRun && !autoRunFiredRef.current) {
      autoRunFiredRef.current = true
      run()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── On-demand POI scan for Mag 8 cards ────────────────────────────────────
  const scanPoiForSymbol = useCallback(async (r: ScanResult) => {
    const sym = r.symbol
    setPoiLoadingSet(prev => new Set([...prev, sym]))
    try {
      const ac = new AbortController()
      const daysToScan = r.bars.slice(-DP_LOOKBACK_DAYS).map(b => b.date)
      const dpResults = await scanDPDays(daysToScan, sym, API_KEY, () => undefined, ac.signal)
      const poi = clusterPOI(dpResults)
      // Just put the bubbles on the chart — don't change card visibility or trade
      setResults(prev => prev.map(res => res.symbol === sym ? {
        ...res,
        dpDays: dpResults,
        poiLevels: poi,
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
    setTickerScanStatus({ phase: 'ohlcv', dpDone: 0, dpTotal: 0 })
    setSelected(null)
    const lookback = tickerLookback
    // Calendar days + limit needed for each lookback window:
    // 1Y = 252 td → ~400 cal days, limit 400
    // 3Y = 756 td → ~1200 cal days, limit 1200
    // 5Y = 1260 td → ~1900 cal days, limit 2000
    const calDays = lookback === 252 ? 400 : lookback === 756 ? 1200 : 1900
    const ohlcvLimit = lookback === 252 ? 400 : lookback === 756 ? 1200 : 2000
    try {
      const ac = new AbortController()
      const bars = await fetchOHLCV(sym, API_KEY, ac.signal, calDays, ohlcvLimit)
      if (!bars || bars.length < 120) {
        setTickerScanning(false)
        setTickerScanStatus(null)
        return
      }
      const allEvts = scanHistory(bars)
      // Filter contraction events to the selected lookback window
      const tickerWindowDates = new Set(bars.slice(-lookback).map((b) => b.date))
      const allEvtsWindow = allEvts.filter((e) => tickerWindowDates.has(e.date))
      const lastNDates = new Set(bars.slice(-SCAN_TRADING_DAYS).map((b) => b.date))
      const recentEvts = allEvtsWindow.filter((e) => lastNDates.has(e.date))

      const daysToScan = bars.slice(-lookback).map((b) => b.date)
      const dpTotal = daysToScan.length
      setTickerScanStatus({ phase: 'dp', dpDone: 0, dpTotal })
      let dpDoneCount = 0
      const dpResults = await scanDPDays(daysToScan, sym, API_KEY, (pct) => {
        dpDoneCount = Math.round((pct / 100) * dpTotal)
        const approxDateIdx = Math.min(dpDoneCount, daysToScan.length - 1)
        setTickerScanStatus({ phase: 'dp', dpDate: daysToScan[approxDateIdx], dpDone: dpDoneCount, dpTotal })
      }, ac.signal)
      // Individual ticker scan — show all POI clusters, apply same tier rules
      const allPOI = clusterPOI(dpResults)
      const latestEvt = recentEvts[recentEvts.length - 1]
      const compressionPct = latestEvt?.compressionPct ?? 0
      const tickerTriggerDate = recentEvts.length > 0
        ? recentEvts[recentEvts.length - 1].date
        : bars[bars.length - 1].date
      const { activePOI: tickerActivePOI } = computeSetupTier(dpResults, tickerTriggerDate)
      const setupTier: ScanResult['setupTier'] = (compressionPct >= 77 || compressionPct <= 35) ? 'high-pressure' : 'pivotal'
      const bubbleTier: 'gold' | 'blue' | 'gray' = setupTier === 'high-pressure' ? 'gold' : 'blue'
      const hasPOI = tickerActivePOI !== null
      const setupActive = recentEvts.length > 0 && hasPOI
      const isThur = new Date().getDay() === 4
      const preferMonday = setupTier !== 'high-pressure' && isThur
      const minDays = setupTier === 'high-pressure' ? 21 : (isThur ? 1 : 0)
      const realExpiry = setupActive ? await fetchNearestRealExpiry(sym, minDays, API_KEY, preferMonday) : undefined
      let trade = setupActive ? buildStraddleTrade(bars, sym, compressionPct, bubbleTier, realExpiry) : null
      if (trade) {
        const rp = await fetchRealStraddlePrices(sym, trade.expiration, trade.callStrike, trade.putStrike, trade.currentPrice, API_KEY)
        if (rp) trade = patchTradeWithRealPrices(trade, rp)
      }

      const result: ScanResult = {
        symbol: sym,
        currentPrice: bars[bars.length - 1].close,
        compressionPct,
        squeezeOn: latestEvt?.squeezeOn ?? false,
        hasPOI,
        topPOI: tickerActivePOI,
        setupActive,
        setupTier,
        bars,
        allEvents: allEvtsWindow,
        recentEvents: recentEvts,
        dpDays: dpResults,
        poiLevels: allPOI,
        trade,
      }
      addResult(result)
      setSelected(result)
      setSelectedFromTickerSearch(true)
      setPhase('done')
      setTickerSearchedSymbols(prev => [...prev.filter(s => s !== sym), sym])
    } finally {
      setTickerScanning(false)
      setTickerScanStatus(null)
    }
  }, [tickerSearch, tickerScanning, tickerLookback, API_KEY, addResult])

  const removeTickerResult = useCallback((sym: string) => {
    setTickerSearchedSymbols(prev => prev.filter(s => s !== sym))
    setResults(prev => prev.filter(r => r.symbol !== sym))
    setSelected(sel => sel?.symbol === sym ? null : sel)
  }, [])

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
        </div>

        {/* Chart */}
        <div style={{ height: selectedFromTickerSearch ? 1300 : 749, position: 'relative', flexShrink: 0 }}>
          <StraddleChart
            candles={selectedFromTickerSearch ? r.bars : r.bars.slice(-CHART_VISIBLE_DAYS)}
            events={r.allEvents}
            dpDays={r.dpDays}
            poiLevels={r.poiLevels}
            forceHeight={selectedFromTickerSearch ? 1300 : undefined}
            symbol={r.symbol}
            trade={r.trade}
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
        position: 'relative',
      }}
    >
      {/* ── Panel Header ─────────────────────────────────────────────────── */}
      <div
        style={{
          background: 'linear-gradient(180deg, #0e0f12 0%, #080a0d 100%)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          padding: '0 28px',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          boxShadow: '0 2px 24px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.04)',
        }}
      >
        {/* ── SINGLE ROW: Brand · Legends · Controls ─── */}
        <style>{`
          @keyframes stSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          @keyframes stPulse { 0%,100% { transform: scale(1); opacity:1; } 50% { transform: scale(0.85); opacity:0.6; } }
          @keyframes stScanDot { 0%,100% { transform: translateX(0); opacity:1; } 50% { transform: translateX(3px); opacity:0.4; } }
        `}</style>
        <div className="straddle-controls-row" style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 58 }}>

          {/* Brand */}
          <div className="straddle-brand" style={{ display: 'flex', alignItems: 'center', gap: 12, paddingRight: 24, borderRight: '1px solid rgba(255,255,255,0.07)', flexShrink: 0, alignSelf: 'stretch' }}>
            <div style={{ width: 4, height: 30, background: 'linear-gradient(180deg,#FF8C00,#FFD700)', borderRadius: 2, flexShrink: 0, boxShadow: '0 0 10px rgba(255,140,0,0.45)' }} />
            <div>
              <div style={{ ...mono, fontWeight: 900, fontSize: 21, color: '#FFFFFF', letterSpacing: '4px', lineHeight: 1 }}>STRADDLE TOWN</div>
            </div>
          </div>

          {/* Search + Scan */}
          <div style={{
            display: 'flex', alignItems: 'stretch', borderRadius: 8, overflow: 'hidden', flexShrink: 0,
            height: 45,
            border: '1px solid rgba(30,80,160,0.5)',
            background: 'linear-gradient(180deg, #0e1e3a 0%, #070f1e 100%)',
            boxShadow: '0 4px 0 rgba(0,0,0,0.6), inset 0 1px 0 rgba(60,120,255,0.1)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', paddingLeft: 10, color: 'rgba(255,255,255,0.35)' }}>
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.5" />
                <line x1="8.5" y1="8.5" x2="12" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <input
              value={tickerSearch}
              onChange={e => setTickerSearch(e.target.value.toUpperCase())}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); runTickerScan() } }}
              placeholder="TICKER"
              maxLength={8}
              style={{
                ...mono, fontSize: 14, fontWeight: 700, letterSpacing: 2,
                color: '#ffffff', background: 'transparent', border: 'none', outline: 'none',
                padding: '0 8px', width: 72, textTransform: 'uppercase',
              }}
            />
            <button
              onClick={runTickerScan}
              disabled={tickerScanning}
              style={{
                ...mono, fontSize: 14, fontWeight: 900, letterSpacing: 2,
                cursor: tickerScanning ? 'not-allowed' : 'pointer',
                background: 'transparent',
                border: 'none', borderLeft: '1px solid rgba(30,80,160,0.4)',
                color: tickerScanning ? 'rgba(255,255,255,0.3)' : '#FFFFFF',
                padding: '0 14px', display: 'flex', alignItems: 'center', gap: 7,
              }}
            >
              {tickerScanning
                ? <svg width="11" height="11" viewBox="0 0 11 11" style={{ animation: 'stPulse 0.8s ease-in-out infinite' }}><rect x="2" y="2" width="7" height="7" rx="1" fill="currentColor" /></svg>
                : <svg width="11" height="11" viewBox="0 0 11 11"><polygon points="2,1 10,5.5 2,10" fill="currentColor" /></svg>
              }
              {tickerScanning ? 'SCANNING' : 'SCAN'}
            </button>
          </div>



          {/* Stop / Rescan — no initial scan-all in toolbar */}
          {isScanning ? (
            <button onClick={() => abortRef.current?.abort()} style={{
              ...mono, fontSize: 16, fontWeight: 900, letterSpacing: 2, padding: '0 25px', height: 45,
              cursor: 'pointer', borderRadius: 8, flexShrink: 0,
              background: 'linear-gradient(180deg, #FF2040 0%, #A00018 100%)',
              border: '1px solid rgba(255,60,80,0.6)',
              boxShadow: '0 4px 0 rgba(80,0,10,0.8), 0 6px 16px rgba(255,40,60,0.25), inset 0 1px 0 rgba(255,160,160,0.25)',
              color: '#FFFFFF', display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <svg width="12" height="12" viewBox="0 0 10 10" style={{ animation: 'stPulse 1s ease-in-out infinite' }}><rect width="10" height="10" rx="1.5" fill="currentColor" /></svg>
              STOP
            </button>
          ) : (phase === 'done' || phase === 'error') ? (
            <button onClick={run} style={{
              ...mono, fontSize: 16, fontWeight: 900, letterSpacing: 2, padding: '0 25px', height: 45,
              cursor: 'pointer', borderRadius: 8, flexShrink: 0,
              background: 'linear-gradient(180deg, #FF9A00 0%, #CC6000 100%)',
              border: '1px solid rgba(255,180,0,0.6)',
              boxShadow: '0 4px 0 rgba(100,30,0,0.8), 0 6px 16px rgba(255,140,0,0.25), inset 0 1px 0 rgba(255,230,100,0.35)',
              color: '#000000', display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.1s',
            }}
              onMouseDown={e => (e.currentTarget.style.transform = 'translateY(2px)', e.currentTarget.style.boxShadow = '0 2px 0 rgba(100,30,0,0.8), 0 3px 8px rgba(255,140,0,0.2), inset 0 1px 0 rgba(255,230,100,0.2)')}
              onMouseUp={e => (e.currentTarget.style.transform = '', e.currentTarget.style.boxShadow = '0 4px 0 rgba(100,30,0,0.8), 0 6px 16px rgba(255,140,0,0.25), inset 0 1px 0 rgba(255,230,100,0.35)')}
              onMouseLeave={e => (e.currentTarget.style.transform = '', e.currentTarget.style.boxShadow = '0 4px 0 rgba(100,30,0,0.8), 0 6px 16px rgba(255,140,0,0.25), inset 0 1px 0 rgba(255,230,100,0.35)')}
            >
              <svg width="14" height="14" viewBox="0 0 13 13" fill="none" style={{ animation: 'stSpin 2s linear infinite' }}>
                <path d="M11 6.5A4.5 4.5 0 1 1 9.2 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
                <polygon points="9.2,0.5 12.5,3.5 6.5,3.5" fill="currentColor" />
              </svg>
              RESCAN
            </button>
          ) : null}

          {/* Portfolio button */}
          <button onClick={() => setShowPortfolio(true)} style={{
            ...mono, fontSize: 14, fontWeight: 900, letterSpacing: 1.5, padding: '0 18px', height: 45,
            cursor: 'pointer', borderRadius: 8, flexShrink: 0,
            background: 'linear-gradient(180deg, #0e1e3a 0%, #070f1e 100%)',
            border: '1px solid rgba(255,154,0,0.35)',
            boxShadow: '0 4px 0 rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)',
            color: '#FF9A00',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
              <polygon points="10,2 18,8 15,18 5,18 2,8" fill="rgba(255,154,0,0.15)" stroke="#FF9A00" strokeWidth="1.5" />
              <circle cx="10" cy="11" r="3" fill="#FF9A00" opacity="0.8" />
            </svg>
            PORTFOLIO
          </button>

          {/* Ticker result chips */}
          {tickerSearchedSymbols.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginLeft: 4 }}>
              {tickerSearchedSymbols.map(sym => {
                const r = results.find(x => x.symbol === sym)
                const isActive = selected?.symbol === sym
                return (
                  <div
                    key={sym}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 0,
                      border: isActive ? '1px solid rgba(255,140,0,0.7)' : '1px solid rgba(255,255,255,0.15)',
                      borderRadius: 4,
                      background: isActive ? 'rgba(255,140,0,0.1)' : 'rgba(255,255,255,0.03)',
                      overflow: 'hidden',
                    }}
                  >
                    <button
                      onClick={() => { if (r) { setSelected(r); setSelectedFromTickerSearch(true) } }}
                      style={{
                        ...mono, fontSize: 12, fontWeight: 900, letterSpacing: 1.5,
                        color: isActive ? '#FF8C00' : '#FFFFFF',
                        background: 'transparent', border: 'none', padding: '5px 10px', cursor: 'pointer',
                      }}
                    >
                      {sym}
                      {r?.setupActive && <span style={{ color: '#FF8C00', marginLeft: 4 }}>⚡</span>}
                    </button>
                    <button
                      onClick={() => removeTickerResult(sym)}
                      style={{
                        ...mono, fontSize: 11, fontWeight: 900,
                        color: 'rgba(255,255,255,0.4)',
                        background: 'transparent', border: 'none',
                        borderLeft: '1px solid rgba(255,255,255,0.08)',
                        padding: '5px 8px', cursor: 'pointer', lineHeight: 1,
                      }}
                      title={`Remove ${sym}`}
                    >
                      ×
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Diamond + Bubble legends — right side */}
          {(isScanning || phase === 'done') && (
            <>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 22px', borderLeft: '1px solid rgba(255,255,255,0.07)', flexShrink: 0, alignSelf: 'stretch' }}>
                <svg width="18" height="18" viewBox="0 0 14 14" style={{ flexShrink: 0 }}>
                  <circle cx="7" cy="7" r="6" fill="rgba(255,180,40,0.2)" stroke="rgba(255,200,60,0.9)" strokeWidth="1.5" />
                  <circle cx="5" cy="5" r="1.5" fill="rgba(255,230,120,0.7)" />
                </svg>
                <span style={{ ...mono, fontSize: 16, fontWeight: 900, color: '#FF8C00', letterSpacing: '1.5px' }}>BUBBLES</span>
                <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.1)' }} />
                <svg width="18" height="18" viewBox="0 0 14 14" style={{ flexShrink: 0 }}>
                  <circle cx="7" cy="7" r="6" fill="rgba(255,200,60,0.2)" stroke="rgba(255,215,0,0.9)" strokeWidth="1.5" />
                  <circle cx="5" cy="5" r="1.5" fill="rgba(255,240,140,0.7)" />
                </svg>
                <span style={{ ...mono, fontSize: 16, fontWeight: 700, color: '#FFD700' }}>Gold:</span>
                <span style={{ ...mono, fontSize: 16, color: '#FFFFFF' }}>Dealer Levels</span>
                <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.1)' }} />
                <svg width="18" height="18" viewBox="0 0 14 14" style={{ flexShrink: 0 }}>
                  <circle cx="7" cy="7" r="6" fill="rgba(80,180,255,0.15)" stroke="rgba(100,200,255,0.9)" strokeWidth="1.5" />
                  <circle cx="5" cy="5" r="1.5" fill="rgba(180,230,255,0.7)" />
                </svg>
                <span style={{ ...mono, fontSize: 16, fontWeight: 700, color: '#41B6F6' }}>Blue:</span>
                <span style={{ ...mono, fontSize: 16, color: '#FFFFFF' }}>Institutional</span>
                <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.1)' }} />
                <svg width="18" height="18" viewBox="0 0 14 14" style={{ flexShrink: 0 }}>
                  <circle cx="7" cy="7" r="6" fill="rgba(160,160,160,0.15)" stroke="rgba(185,185,185,0.75)" strokeWidth="1.5" />
                  <circle cx="5" cy="5" r="1.5" fill="rgba(210,210,210,0.6)" />
                </svg>
                <span style={{ ...mono, fontSize: 16, fontWeight: 700, color: '#CCCCCC' }}>Gray:</span>
                <span style={{ ...mono, fontSize: 16, color: '#FFFFFF' }}>Leveraged Traders</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Filter bar (removed — now in header) ─────────────────────────── */}

      {/* ── Scanning fullscreen overlay ─────────────────────────────────── */}
      {isScanning && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 20,
          background: 'radial-gradient(ellipse at 50% 40%, rgba(18,8,0,0.98) 0%, rgba(0,0,0,0.99) 70%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 52, overflow: 'hidden',
        }}>
          <style>{`
            @keyframes stBlobPulse { 0%,100%{opacity:0.45;transform:scale(1)} 50%{opacity:0.9;transform:scale(1.22)} }
            @keyframes stTitlePulse2 { 0%,100%{opacity:1} 50%{opacity:0.72} }
          `}</style>

          {/* Ambient background grid + glows */}
          <div style={{
            position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 0,
            backgroundImage: 'linear-gradient(rgba(255,140,0,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,140,0,0.03) 1px,transparent 1px)',
            backgroundSize: '44px 44px'
          }}>
            <div style={{ position: 'absolute', top: '-130px', left: '-90px', width: '440px', height: '440px', borderRadius: '50%', background: 'radial-gradient(circle,rgba(255,140,0,0.09) 0%,transparent 70%)', animation: 'stBlobPulse 4.5s ease-in-out infinite' }} />
            <div style={{ position: 'absolute', bottom: '-130px', right: '-90px', width: '440px', height: '440px', borderRadius: '50%', background: 'radial-gradient(circle,rgba(255,80,0,0.08) 0%,transparent 70%)', animation: 'stBlobPulse 4.5s ease-in-out infinite 2.2s' }} />
          </div>

          {/* Content */}
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 40 }}>

            {/* Headline */}
            <div style={{ textAlign: 'center' }}>
              <div style={{ ...mono, fontSize: 20, fontWeight: 900, color: 'rgba(255,255,255,0.38)', letterSpacing: '14px', textTransform: 'uppercase', marginBottom: 14 }}>STRADDLE TOWN</div>
              <div style={{ ...mono, fontSize: 36, fontWeight: 900, color: '#ffffff', letterSpacing: '5px', lineHeight: 1.1, animation: 'stTitlePulse2 2.8s ease-in-out infinite', textShadow: '0 0 50px rgba(255,255,255,0.1),0 2px 0 #999,0 6px 24px rgba(0,0,0,0.9)' }}>SCANNING FOR</div>
              <div style={{ ...mono, fontSize: 28, fontWeight: 900, color: '#FF8C00', letterSpacing: '3px', lineHeight: 1.45, textShadow: '0 0 32px rgba(255,140,0,0.45)', marginTop: 8 }}>DEALER &amp; TRADER POSITIONING</div>
              <div style={{ ...mono, fontSize: 28, fontWeight: 900, color: '#FF8C00', letterSpacing: '3px', textShadow: '0 0 32px rgba(255,140,0,0.45)' }}>AT PIVOTAL POINTS</div>
            </div>

            {/* Dual-ring spinner */}
            <div style={{ position: 'relative', width: 110, height: 110 }}>
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '5px solid rgba(255,255,255,0.06)', borderTopColor: '#FF8C00', animation: 'stSpin 0.9s linear infinite' }} />
              <div style={{ position: 'absolute', inset: 14, borderRadius: '50%', border: '4px solid rgba(255,255,255,0.04)', borderTopColor: 'rgba(255,140,0,0.55)', animation: 'stSpin 1.5s linear infinite reverse' }} />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#FF8C00', boxShadow: '0 0 14px rgba(255,140,0,0.9)' }} />
              </div>
            </div>

            {/* Status text */}
            <div style={{ ...mono, fontSize: 18, fontWeight: 700, color: '#ffffff', letterSpacing: '2px', textAlign: 'center', textShadow: '0 0 16px rgba(255,255,255,0.2)' }}>
              {phase === 'fetching-symbols'
                ? 'FETCHING SYMBOL UNIVERSE...'
                : phase === 'scanning-ohlcv'
                  ? `ANALYZING MARKET STRUCTURE  —  ${stats.ohlcvDone} / ${stats.totalSymbols}`
                  : `MAPPING DEALER POSITIONING  —  ${stats.dpDone} / ${stats.contractionHits}`}
            </div>

            {/* Progress bar */}
            <div style={{ width: 500, height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
              <div style={{ height: '100%', borderRadius: 2, background: 'linear-gradient(90deg,#FF8C00,#FF2D6B)', boxShadow: '0 0 10px rgba(255,140,0,0.6)', transition: 'width 0.3s ease', width: `${scanPct}%` }} />
            </div>

            {/* Percentage */}
            <div style={{ ...mono, fontSize: 56, fontWeight: 900, color: '#FFD700', lineHeight: 1, letterSpacing: '2px', textShadow: '0 0 28px rgba(255,215,0,0.45)' }}>
              {scanPct}<span style={{ fontSize: 26, color: 'rgba(255,215,0,0.6)' }}>%</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Idle splash ──────────────────────────────────────────────────── */}
      {phase === 'idle' && !tickerScanning && (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 40,
          background: 'radial-gradient(ellipse at 50% 60%, rgba(255,140,0,0.04) 0%, transparent 65%)',
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ ...mono, fontSize: 52, fontWeight: 900, color: '#ffffff', letterSpacing: '6px', lineHeight: 1, textShadow: '0 0 50px rgba(255,255,255,0.07)' }}>
              STRADDLE TOWN
            </div>
            <div style={{ ...mono, fontSize: 20, fontWeight: 700, color: '#FF8C00', letterSpacing: '4px', marginTop: 14, textShadow: '0 0 24px rgba(255,140,0,0.35)' }}>
              DEALER &amp; TRADER POSITIONING SCANNER
            </div>
          </div>
          <button onClick={run} style={{
            ...mono, fontSize: 24, fontWeight: 900, letterSpacing: '4px',
            padding: '18px 60px', cursor: 'pointer', borderRadius: 10,
            background: 'linear-gradient(180deg, #FF9A00 0%, #CC6000 100%)',
            border: '1px solid rgba(255,180,0,0.6)',
            boxShadow: '0 5px 0 rgba(100,30,0,0.9), 0 8px 24px rgba(255,140,0,0.3), inset 0 1px 0 rgba(255,230,100,0.4)',
            color: '#000000', display: 'flex', alignItems: 'center', gap: 14, transition: 'all 0.1s',
          }}
            onMouseDown={e => { e.currentTarget.style.transform = 'translateY(3px)'; e.currentTarget.style.boxShadow = '0 2px 0 rgba(100,30,0,0.9),0 4px 12px rgba(255,140,0,0.2),inset 0 1px 0 rgba(255,230,100,0.25)' }}
            onMouseUp={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 5px 0 rgba(100,30,0,0.9),0 8px 24px rgba(255,140,0,0.3),inset 0 1px 0 rgba(255,230,100,0.4)' }}
            onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 5px 0 rgba(100,30,0,0.9),0 8px 24px rgba(255,140,0,0.3),inset 0 1px 0 rgba(255,230,100,0.4)' }}
          >
            <svg width="22" height="22" viewBox="0 0 12 12"><polygon points="1,1 11,6 1,11" fill="currentColor" /></svg>
            SCAN NOW
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
            overflow: 'auto',
            padding: '16px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
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
                if (sqzOnly && !r.squeezeOn) return false
                return true
              })}
              onSelect={r => { setSelected(r); setSelectedFromTickerSearch(false) }}
              onScanPOI={scanPoiForSymbol}
              onAddToPortfolio={addToPortfolio}
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
          paddingTop: '1%',
          gap: 36,
        }}>
          {/* Spinner ring — doubled size */}
          <div style={{ position: 'relative', width: 128, height: 128 }}>
            <div style={{
              position: 'absolute', inset: 0,
              borderRadius: '50%',
              border: '5px solid rgba(255,140,0,0.12)',
            }} />
            <div style={{
              position: 'absolute', inset: 0,
              borderRadius: '50%',
              border: '5px solid transparent',
              borderTopColor: '#FF8C00',
              animation: 'stSpin 0.9s linear infinite',
            }} />
            <div style={{
              position: 'absolute', inset: 18,
              borderRadius: '50%',
              border: '3px solid transparent',
              borderTopColor: 'rgba(255,45,107,0.7)',
              animation: 'stSpin 1.4s linear infinite reverse',
            }} />
            <div style={{
              position: 'absolute', inset: 38,
              borderRadius: '50%',
              border: '2px solid transparent',
              borderTopColor: 'rgba(0,229,255,0.5)',
              animation: 'stSpin 2s linear infinite',
            }} />
          </div>

          {/* Symbol */}
          <div style={{ ...mono, fontSize: 52, fontWeight: 900, color: '#FFFFFF', letterSpacing: '10px', lineHeight: 1 }}>
            {tickerSearch.trim().toUpperCase()}
          </div>

          {/* Phase label */}
          <div style={{ ...mono, fontSize: 18, fontWeight: 700, color: '#FF8C00', letterSpacing: '4px' }}>
            {tickerScanStatus?.phase === 'ohlcv' ? 'FETCHING OHLCV DATA' : 'SCANNING POI'}
          </div>

          {/* Progress detail */}
          {tickerScanStatus?.phase === 'dp' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, width: '100%', maxWidth: 480 }}>
              {/* Progress bar */}
              <div style={{ width: '100%', height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                <div style={{
                  height: '100%',
                  borderRadius: 2,
                  background: 'linear-gradient(90deg, #FF8C00, #FF2D6B)',
                  boxShadow: '0 0 8px rgba(255,140,0,0.5)',
                  transition: 'width 0.25s ease',
                  width: `${tickerScanStatus.dpTotal > 0 ? Math.round((tickerScanStatus.dpDone / tickerScanStatus.dpTotal) * 100) : 0}%`,
                }} />
              </div>
              {/* Stats row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ ...mono, fontSize: 36, fontWeight: 900, color: '#FFD700', lineHeight: 1 }}>
                    {tickerScanStatus.dpTotal > 0 ? Math.round((tickerScanStatus.dpDone / tickerScanStatus.dpTotal) * 100) : 0}%
                  </div>
                  <div style={{ ...mono, fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '2px', marginTop: 4 }}>COMPLETE</div>
                </div>
                <div style={{ width: 1, height: 40, background: 'rgba(255,255,255,0.08)' }} />
                <div style={{ textAlign: 'center' }}>
                  <div style={{ ...mono, fontSize: 36, fontWeight: 900, color: '#00E5FF', lineHeight: 1 }}>
                    {tickerScanStatus.dpDone}<span style={{ fontSize: 18, color: 'rgba(255,255,255,0.4)' }}>/{tickerScanStatus.dpTotal}</span>
                  </div>
                  <div style={{ ...mono, fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '2px', marginTop: 4 }}>DAYS SCANNED</div>
                </div>
                <div style={{ width: 1, height: 40, background: 'rgba(255,255,255,0.08)' }} />
                <div style={{ textAlign: 'center' }}>
                  <div style={{ ...mono, fontSize: 22, fontWeight: 900, color: '#FFFFFF', lineHeight: 1 }}>
                    {tickerScanStatus.dpDate ?? '—'}
                  </div>
                  <div style={{ ...mono, fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '2px', marginTop: 4 }}>CURRENT DATE</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.6} }
        @keyframes stSpin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>

      {showPortfolio && <StraddlePortfolio onClose={() => setShowPortfolio(false)} />}
    </div>
  )
}
