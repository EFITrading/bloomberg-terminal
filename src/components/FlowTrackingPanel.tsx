'use client'

import { TbStar } from 'react-icons/tb'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'

import { calculateFlowGrade, calculateLeapGradeShared } from '@/lib/flowGrading'
import { useFlowTrackingPanelMobile } from './useFlowTrackingPanelMobile'

const EFIChart = dynamic(() => import('@/components/trading/EFICharting'), { ssr: false })
const AlgoFlowScreener = dynamic(() => import('@/components/AlgoFlowScreener'), { ssr: false })
// Same candlestick + SPY/industry ratio chart used by the Market Regimes sidebar - reused
// here exactly so SweepSense card charts look/behave identically.
const TradeCardChart = dynamic(
  () => import('@/components/trading/RegimesPanel').then((m) => m.TradeCardChart),
  { ssr: false }
)

const POLYGON_API_KEY = ''


interface OptionsFlowData {
  ticker: string
  underlying_ticker: string
  strike: number
  expiry: string
  type: 'call' | 'put'
  trade_size: number
  premium_per_contract: number
  total_premium: number
  spot_price: number
  exchange_name: string
  trade_type: 'SWEEP' | 'BLOCK' | 'MINI' | 'MULTI-LEG' | 'SUPER SWEEP' | 'SUPER BLOCK'
  trade_timestamp: string
  moneyness: 'ATM' | 'ITM' | 'OTM'
  days_to_expiry: number
  fill_style?: 'A' | 'AA' | 'B' | 'BB' | 'N/A' | string
  volume?: number
  open_interest?: number
  vol_oi_ratio?: number
  classification?: string
  delta?: number
  gamma?: number
  theta?: number
  vega?: number
  implied_volatility?: number
  current_price?: number
  bid?: number
  ask?: number
  bid_ask_spread?: number
}

const normalizeTickerForOptions = (ticker: string): string => ticker.replace(/\./g, '')

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)

const formatTime = (timestamp: string) =>
  new Date(timestamp).toLocaleTimeString('en-US', {
    hour12: true,
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Los_Angeles',
  })

const formatDate = (dateString: string) => {
  const [year, month, day] = dateString.split('-')
  return `${month}/${day}/${String(year).slice(-2)}`
}

// Compact dollar formatting for tight desktop rows - caps at ~4 chars after the $ sign
// ($1.1K instead of $1,132) so the Build A Trade summary row never wraps to a second line.
const formatCompactDollars = (value: number): string => {
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`
  return `${sign}$${Math.round(abs)}`
}

// Caps a stock price at 4 significant digits for mobile SweepSense cards ($333.4 instead of
// $333.43) so the spot/current price row stays compact.
const fmt4sigMobile = (val: number): string => {
  if (!val || val <= 0) return '0'
  return parseFloat(val.toPrecision(4)).toString()
}

const generateFlowId = (trade: OptionsFlowData): string =>
  `${trade.underlying_ticker}-${trade.strike}-${trade.expiry}-${trade.type}-${trade.trade_timestamp}-${trade.trade_size}`

// Snap a theoretical Black-Scholes strike to the nearest strike increment actually listed on
// real option chains (varies by underlying price level), so "Build A Trade" strikes are real,
// tradable strikes instead of raw decimals like $238.34.
function roundToRealStrike(k: number, spot: number): number {
  const inc = spot < 25 ? 0.5 : spot < 200 ? 1 : spot < 500 ? 5 : 10
  return Math.round(k / inc) * inc
}

function _bsNCD(x: number): number {
  const a1 = 0.254829592,
    a2 = -0.284496736,
    a3 = 1.421413741,
    a4 = -1.453152027,
    a5 = 1.061405429,
    p = 0.3275911
  const sign = x >= 0 ? 1 : -1
  const ax = Math.abs(x)
  const t = 1.0 / (1.0 + p * ax)
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax)
  return 0.5 * (1 + sign * y)
}
function _bsD2FTP(S: number, K: number, r: number, sigma: number, T: number): number {
  return (Math.log(S / K) + (r - 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T))
}
function bsStrikeForProbFTP(
  S: number,
  sigma: number,
  dte: number,
  prob: number,
  isCall: boolean
): number | null {
  if (!sigma || sigma <= 0 || dte <= 0) return null
  const r = 0.0387
  const T = dte / 365
  const copCall = (K: number) => (1 - _bsNCD(_bsD2FTP(S, K, r, sigma, T))) * 100
  const copPut = (K: number) => _bsNCD(_bsD2FTP(S, K, r, sigma, T)) * 100
  if (isCall) {
    let lo = S + 0.01,
      hi = S * 1.5
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2
      const p = copCall(mid)
      if (Math.abs(p - prob) < 0.1) return mid
      p < prob ? (lo = mid) : (hi = mid)
    }
    return (lo + hi) / 2
  } else {
    let lo = S * 0.5,
      hi = S - 0.01
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2
      const p = copPut(mid)
      if (Math.abs(p - prob) < 0.1) return mid
      p < prob ? (hi = mid) : (lo = mid)
    }
    return (lo + hi) / 2
  }
}

// Full Black-Scholes option price (same formula as blackScholesCalculator.ts / ChainCalculator.tsx
// used by the options calculator elsewhere in the app) - used to translate a stock price target
// into the corresponding option premium target.
function _bsD1FTP(S: number, K: number, r: number, sigma: number, T: number): number {
  return (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T))
}
// ── FlowBias helpers: Spam / Structural / Gamma detection off the raw flow-trade list for
// the selected TODAY/3D/1W window (same buttons that drive the historical breakdown).
// Shared raw-trade shape carrying everything the FlowBias detail modal needs to render a
// table row matching the main Options Flow table's columns (Time/C-P/Strike/Premium/Expiry/
// Size+Fill/Type/Spot).
type FlowBiasRawTrade = {
  strike: number
  type: string
  expiry?: string
  trade_timestamp?: string
  fillStyle?: string
  tradeSize?: number
  premium?: number
  totalPremium?: number
  spot?: number
  tradeType?: string
}

// Glossy black badge styling matching OptionsFlowTable's getTradeTypeColor, replicated locally
// since that helper is not exported from OptionsFlowTable.tsx.
function getFlowBiasTypeBadgeStyle(tradeType: string | undefined): React.CSSProperties {
  const glossyBlack: React.CSSProperties = {
    backgroundColor: '#000000',
    backgroundImage: 'linear-gradient(180deg, #1e1e1e 0%, #000000 50%, #111111 100%)',
  }
  const glossyOverlay = 'inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -1px 0 rgba(0,0,0,0.8)'
  const common: React.CSSProperties = {
    ...glossyBlack,
    boxShadow: glossyOverlay,
    borderRadius: '9999px',
    letterSpacing: '0.05em',
    fontWeight: 800,
    padding: '3px 10px',
    fontSize: '12px',
    display: 'inline-block',
  }
  if (tradeType === 'SWEEP') {
    return { ...common, color: '#FFD700', border: '1px solid rgba(255,215,0,0.6)' }
  }
  if (tradeType === 'SUPER SWEEP') {
    return { ...common, color: '#FFD700', border: '1px solid #FFD700', boxShadow: `${glossyOverlay}, 0 0 8px rgba(255,215,0,0.6)`, fontWeight: 900 }
  }
  if (tradeType === 'BLOCK') {
    return { ...common, color: '#00e5ff', border: '1px solid rgba(0,229,255,0.5)' }
  }
  if (tradeType === 'SUPER BLOCK') {
    return { ...common, color: '#00e5ff', border: '1px solid #00e5ff', boxShadow: `${glossyOverlay}, 0 0 8px rgba(0,229,255,0.6)`, fontWeight: 900 }
  }
  if (tradeType === 'MULTI-LEG') {
    return {
      ...common,
      backgroundColor: '#1e0a3c',
      backgroundImage: 'linear-gradient(180deg, #3b1d6e 0%, #1e0a3c 50%, #2d1555 100%)',
      color: '#d8b4fe',
      border: '1px solid rgba(168,85,247,0.5)',
    }
  }
  return { ...common, color: '#9ca3af', border: '1px solid rgba(156,163,175,0.4)' }
}

// Days-to-expiry off a raw flow print's own expiry string (not the card's DTE) - each print in
// a spam group could technically differ, though in practice grouping is per-expiry already.
function computeDteFromExpiry(expiry: string): number {
  const exp = new Date(expiry + 'T00:00:00')
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return Math.max(0, Math.round((exp.getTime() - now.getTime()) / 86400000))
}

// OTM + within the 90%-probability-of-profit band (between spot and the 90% POP strike) - keeps
// Flow Spammer / uniqueness scoring focused on realistic OTM strikes, excluding ATM prints and
// prints too far out-of-the-money to matter.
function isWithin90PopOtm(strike: number, spot: number, sigma: number, dte: number, isCall: boolean): boolean {
  if (!spot || spot <= 0) return true
  const inc = spot < 25 ? 0.5 : spot < 200 ? 1 : spot < 500 ? 5 : 10
  const isAtm = Math.abs(strike - spot) < inc * 1.5
  if (isAtm) return false
  if (!sigma || sigma <= 0 || dte <= 0) return true // can't evaluate probability - don't over-filter
  const k90 = bsStrikeForProbFTP(spot, sigma, dte, 90, isCall)
  if (k90 === null) return true
  return isCall ? strike > spot && strike <= k90 : strike < spot && strike >= k90
}

// Greedily cancels opposing buy (A/AA) vs sell (B/BB) prints at the same strike/expiry whose
// contract sizes are within 30% of each other - e.g. 1000@1.2A vs 800@1.2B is a 20% size diff
// so both cancel out; a 31%+ size diff means both stay and count toward the spam group.
function cancelOffsettingTrades(trades: Array<FlowBiasRawTrade>): Array<FlowBiasRawTrade> {
  const isBuy = (t: FlowBiasRawTrade) => t.fillStyle === 'A' || t.fillStyle === 'AA'
  const isSell = (t: FlowBiasRawTrade) => t.fillStyle === 'B' || t.fillStyle === 'BB'
  const cancelled = new Set<FlowBiasRawTrade>()
  const usedSells = new Set<FlowBiasRawTrade>()
  const sells = trades.filter(isSell)
  for (const buy of trades) {
    if (!isBuy(buy)) continue
    const buySize = buy.tradeSize || 0
    if (!buySize) continue
    let bestSell: FlowBiasRawTrade | null = null
    let bestDiff = Infinity
    for (const sell of sells) {
      if (usedSells.has(sell)) continue
      const sellSize = sell.tradeSize || 0
      if (!sellSize) continue
      const diff = Math.abs(buySize - sellSize) / Math.max(buySize, sellSize)
      if (diff <= 0.3 && diff < bestDiff) { bestDiff = diff; bestSell = sell }
    }
    if (bestSell) {
      usedSells.add(bestSell)
      cancelled.add(buy)
      cancelled.add(bestSell)
    }
  }
  return trades.filter((t) => !cancelled.has(t))
}

function computeSpamLabel(
  rawTrades: Array<FlowBiasRawTrade>,
  cardType: 'call' | 'put',
  formatDate: (d: string) => string,
  spot?: number,
  sigma?: number
): { label: string; trades: Array<FlowBiasRawTrade>; level: number | null } {
  const groups: Record<string, Array<FlowBiasRawTrade>> = {}
  for (const t of rawTrades) {
    if (t.tradeType === 'MULTI-LEG') continue
    if (t.type !== cardType || !t.expiry || !t.trade_timestamp) continue
    const tDte = computeDteFromExpiry(t.expiry)
    // Flow Spammer only looks at near-term flow - anything past 35 DTE is excluded outright.
    if (tDte > 35) continue
    // Only OTM strikes within the 90% probability-of-profit band count toward Flow Spammer.
    if (spot && spot > 0) {
      if (!isWithin90PopOtm(t.strike, spot, sigma || 0, tDte, cardType === 'call')) continue
    }
    const key = `${t.strike}|${t.expiry}`
    if (!groups[key]) groups[key] = []
    groups[key].push(t)
  }
  let best: { key: string; trades: typeof rawTrades } | null = null
  for (const [key, groupTrades] of Object.entries(groups)) {
    // A and AA (buys) can be cancelled out by B and BB (sells) of similar size at this strike/expiry.
    const survivors = cancelOffsettingTrades(groupTrades)
    if (survivors.length >= 3 && (!best || survivors.length > best.trades.length)) best = { key, trades: survivors }
  }
  if (!best) return { label: 'No Spammer Detected', trades: [], level: null }
  const [strikeStr, expiry] = best.key.split('|')
  const times = best.trades.map((t) => new Date(t.trade_timestamp!).getTime()).sort((a, b) => a - b)
  const getETHour = (ms: number) => {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(ms))
    const h = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10)
    const m = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10)
    return h + m / 60
  }
  const hoursET = times.map(getETHour)
  let cadence: string
  if (hoursET.every((h) => h <= 11.5)) cadence = 'At Open'
  else if (hoursET.every((h) => h >= 15)) cadence = 'Near Close'
  else {
    const gaps: number[] = []
    for (let i = 1; i < times.length; i++) gaps.push((times[i] - times[i - 1]) / 3600000)
    const avgGap = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0
    cadence = avgGap <= 1 ? 'All Day' : avgGap <= 3 ? 'Half Day' : 'Scattered'
  }
  const label = cardType === 'call' ? 'Calls' : 'Puts'
  const buyCount = best.trades.filter((t) => t.fillStyle === 'A' || t.fillStyle === 'AA').length
  const sellCount = best.trades.filter((t) => t.fillStyle === 'B' || t.fillStyle === 'BB').length
  const direction = buyCount > sellCount ? 'Buying' : sellCount > buyCount ? 'Selling' : null
  const sideName = cardType === 'call' ? 'Call' : 'Put'
  const prefix = direction ? `Flow ${sideName} ${direction} Spammer` : 'Flow Spammer'
  return { label: `${prefix}: $${strikeStr} ${label} ${formatDate(expiry)} Expiry - ${cadence}`, trades: best.trades, level: parseFloat(strikeStr) }
}

// Grading system for the Flow Spammer heatmap modal - scores (0-100) how "unique"/significant
// this strike+expiry spam group is relative to the whole day's flow for the ticker, across 4
// criteria: (1) % share of the day's total premium flow, (2) how spread-out in time the prints
// were, (3) whether the strikes are OTM-but-within-90%-POP (not ATM, not too far OTM), and
// (4) whether the individual print sizes are similarly-sized (not wildly different).
type SpamUniquenessScore = {
  volumeSharePct: number
  volumeSharePoints: number
  cadenceMinutesAvg: number | null
  cadencePoints: number
  probPoints: number
  sizePoints: number
  overall: number
}

function computeSpamUniquenessScore(
  spamTrades: Array<FlowBiasRawTrade>,
  allDayTrades: Array<FlowBiasRawTrade>,
  spot: number | undefined,
  sigma: number | undefined,
  cardDte: number | undefined,
  cardType: 'call' | 'put'
): SpamUniquenessScore {
  const sumPremium = (arr: Array<FlowBiasRawTrade>) => arr.reduce((s, t) => s + (t.totalPremium || 0), 0)
  // 1) Day's flow share - >=25% of the day's total premium for this ticker = full points, <=5% = ~0.
  const spamPremium = sumPremium(spamTrades)
  const totalPremium = sumPremium(allDayTrades) || 1
  const volumeSharePct = (spamPremium / totalPremium) * 100
  const volumeSharePoints = Math.max(0, Math.min(100, ((volumeSharePct - 5) / (25 - 5)) * 100))

  // 2) Cadence - average gap (hours) between consecutive prints; 30min-1h+ spacing = full points,
  // all bunched within seconds/minutes = ~0 points. With fewer than 2 gaps to measure, there isn't
  // enough data to judge cadence at all - score neutral (50) instead of unfairly zeroing it out.
  const times = spamTrades
    .map((t) => (t.trade_timestamp ? new Date(t.trade_timestamp).getTime() : null))
    .filter((t): t is number => t !== null)
    .sort((a, b) => a - b)
  const gapsHrs: number[] = []
  for (let i = 1; i < times.length; i++) gapsHrs.push((times[i] - times[i - 1]) / 3600000)
  const hasCadenceData = gapsHrs.length > 0
  const avgGapHrs = hasCadenceData ? gapsHrs.reduce((a, b) => a + b, 0) / gapsHrs.length : 0
  const cadencePoints = hasCadenceData ? Math.max(0, Math.min(100, (avgGapHrs / 0.5) * 100)) : 50

  // 3) OTM + within 90% POP (not ATM) - fraction of the group's prints that qualify.
  const isCall = cardType === 'call'
  let probPoints = 100
  if (spot && spot > 0 && spamTrades.length > 0) {
    const qualifying = spamTrades.filter((t) => {
      const tDte = t.expiry ? computeDteFromExpiry(t.expiry) : (cardDte || 0)
      return isWithin90PopOtm(t.strike, spot, sigma || 0, tDte, isCall)
    })
    probPoints = (qualifying.length / spamTrades.length) * 100
  }

  // 4) Size uniformity - are the individual print premiums clustered within 30% of the median,
  // instead of wildly different sizes (e.g. $50K next to $1.3M)?
  const premiums = spamTrades.map((t) => t.totalPremium || 0).filter((p) => p > 0)
  let sizePoints = 100
  if (premiums.length >= 2) {
    const sorted = [...premiums].sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]
    const withinBand = premiums.filter((p) => median > 0 && Math.abs(p - median) / median <= 0.3)
    sizePoints = (withinBand.length / premiums.length) * 100
  }

  const overall = (volumeSharePoints + cadencePoints + probPoints + sizePoints) / 4

  return {
    volumeSharePct,
    volumeSharePoints,
    cadenceMinutesAvg: hasCadenceData ? avgGapHrs * 60 : null,
    cadencePoints,
    probPoints,
    sizePoints,
    overall,
  }
}

function spamScoreColor(pts: number): string {
  if (pts >= 70) return '#22c55e'
  if (pts >= 40) return '#eab308'
  return '#ef4444'
}

// Places a point at radius `r` from center (cx,cy) at `angleDeg`, measured clockwise from
// straight up (12 o'clock) - standard radar/spider-chart polar convention.
function polarPoint(cx: number, cy: number, r: number, angleDeg: number): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function gradeLabel(pts: number): string {
  if (pts >= 80) return 'EXTREME'
  if (pts >= 60) return 'HIGH'
  if (pts >= 40) return 'MODERATE'
  if (pts >= 20) return 'LOW'
  return 'MINIMAL'
}

function polarPointDeg(cx: number, cy: number, r: number, angleDeg: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) }
}

function gaugeArcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  // Sample points directly along the true circle instead of relying on the SVG arc ("A") command,
  // which can pick the wrong one of its two possible arcs and render a lopsided/bulging shape.
  const steps = 24
  const pts: string[] = []
  for (let i = 0; i <= steps; i++) {
    const angle = startDeg + ((endDeg - startDeg) * i) / steps
    const p = polarPointDeg(cx, cy, r, angle)
    pts.push(`${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
  }
  return pts.join(' ')
}

// Single semicircle gauge (Fear & Greed index style) showing only the FINAL Spam Uniqueness
// result - a needle sweeping across a smooth red-to-green gradient arc and a grade readout
// underneath. No per-criterion breakdown or scoring math is exposed - just the verdict.
function SpamUniquenessGauge({ score }: { score: SpamUniquenessScore }) {
  const cx = 130, cy = 122, r = 92
  const pct = Math.max(0, Math.min(100, score.overall))
  const needleAngle = 180 - (pct / 100) * 180
  const needleTip = polarPointDeg(cx, cy, r - 26, needleAngle)
  const needleBack = polarPointDeg(cx, cy, 12, needleAngle + 180)
  const color = spamScoreColor(pct)
  const ticks = [0, 25, 50, 75, 100]
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '22px 30px 18px',
      borderRadius: '16px', background: 'radial-gradient(120% 140% at 50% 0%, #202020 0%, #0c0c0c 55%, #000000 100%)',
      border: '1px solid #2e2e2e', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10), inset 0 0 30px rgba(0,0,0,0.5), 0 8px 24px rgba(0,0,0,0.65)',
    }}>
      <svg width={260} height={142} viewBox="0 0 260 142">
        <defs>
          <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ef4444" />
            <stop offset="25%" stopColor="#f97316" />
            <stop offset="50%" stopColor="#eab308" />
            <stop offset="75%" stopColor="#84cc16" />
            <stop offset="100%" stopColor="#22c55e" />
          </linearGradient>
        </defs>
        {/* Track (subtle base ring) */}
        <path d={gaugeArcPath(cx, cy, r, 180, 0)} stroke="rgba(255,255,255,0.06)" strokeWidth={14} fill="none" strokeLinecap="round" />
        {/* Smooth colored gradient arc */}
        <path d={gaugeArcPath(cx, cy, r, 180, 0)} stroke="url(#gaugeGradient)" strokeWidth={14} fill="none" strokeLinecap="round" />
        {/* Tick marks */}
        {ticks.map((t) => {
          const a = 180 - (t / 100) * 180
          const p0 = polarPointDeg(cx, cy, r + 11, a)
          const p1 = polarPointDeg(cx, cy, r + 17, a)
          return <line key={t} x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke="#555555" strokeWidth={2} strokeLinecap="round" />
        })}
        {/* Needle */}
        <line x1={needleBack.x} y1={needleBack.y} x2={needleTip.x} y2={needleTip.y} stroke="#ffffff" strokeWidth={3} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={9} fill="#0a0a0a" stroke="#ffffff" strokeWidth={2.5} />
        <text x={cx - r - 6} y={cy + 22} fill="#ffffff" fontSize="9" fontWeight={800} letterSpacing="0.5" textAnchor="start">MINIMAL</text>
        <text x={cx + r + 6} y={cy + 22} fill="#ffffff" fontSize="9" fontWeight={800} letterSpacing="0.5" textAnchor="end">EXTREME</text>
      </svg>
      <div style={{ fontSize: '26px', fontWeight: 900, color, letterSpacing: '2px', marginTop: '2px', textShadow: `0 0 18px ${color}55` }}>
        {gradeLabel(pct)}
      </div>
      <div style={{ fontSize: '11px', color: '#ffffff', fontWeight: 700, marginTop: '3px', letterSpacing: '0.5px' }}>SPAM UNIQUENESS READ</div>
    </div>
  )
}

// Finds the strike (or narrow cluster of 2-3 nearby strikes) where the given trades are
// most heavily concentrated, and returns the volume-weighted average of that cluster.
// e.g. resistance forming at $100/$101/$102 with clustered flow -> returns (100+101+102)/3 = 101.
function findConcentratedStrikeLevel(trades: Array<{ strike: number }>): number | null {
  if (!trades.length) return null
  const counts = new Map<number, number>()
  for (const t of trades) counts.set(t.strike, (counts.get(t.strike) ?? 0) + 1)
  const strikes = [...counts.keys()].sort((a, b) => a - b)
  if (!strikes.length) return null

  // "2-3 strikes around the same area" - use this underlying's real strike increment (same
  // convention as roundToRealStrike) so the cluster window scales with the stock's price level.
  const sample = strikes[0]
  const inc = sample < 25 ? 0.5 : sample < 200 ? 1 : sample < 500 ? 5 : 10
  const maxGap = inc * 2.5

  let bestWeight = 0
  let bestWeightedStrike = strikes[0]
  let i = 0
  while (i < strikes.length) {
    let j = i
    let weight = counts.get(strikes[i])!
    let weightedSum = strikes[i] * counts.get(strikes[i])!
    while (j + 1 < strikes.length && strikes[j + 1] - strikes[j] <= maxGap) {
      j++
      weight += counts.get(strikes[j])!
      weightedSum += strikes[j] * counts.get(strikes[j])!
    }
    if (weight > bestWeight) {
      bestWeight = weight
      bestWeightedStrike = weightedSum / weight
    }
    i = j + 1
  }
  return bestWeightedStrike
}

// Probability-of-profit (%) for a given strike - the inverse of bsStrikeForProbFTP (that one
// solves strike-from-probability; this solves probability-from-strike using the same d2 math).
function popForStrike(S: number, K: number, sigma: number, dte: number, isCall: boolean): number | null {
  if (!sigma || sigma <= 0 || dte <= 0 || !S || S <= 0) return null
  const r = 0.0387
  const T = dte / 365
  const d2 = _bsD2FTP(S, K, r, sigma, T)
  return isCall ? (1 - _bsNCD(d2)) * 100 : _bsNCD(d2) * 100
}

// Buckets one option side's trades into 5-point POP bands (60-65%, 80-85%, etc.) and returns
// the band with the most trades that all share the SAME fill-style direction (all A/AA "buy" or
// all B/BB "sell") - requires at least 3 trades in that band/direction to qualify.
function bestStructuralBand(
  trades: Array<FlowBiasRawTrade>,
  spot: number,
  sigma: number
): { trades: Array<FlowBiasRawTrade>; style: 'buy' | 'sell' } | null {
  const isBuy = (t: FlowBiasRawTrade) => t.fillStyle === 'A' || t.fillStyle === 'AA'
  const isSell = (t: FlowBiasRawTrade) => t.fillStyle === 'B' || t.fillStyle === 'BB'
  const isCall = trades[0]?.type === 'call'
  const banded: Record<string, Array<FlowBiasRawTrade>> = {}
  for (const t of trades) {
    if (!isBuy(t) && !isSell(t)) continue
    const tDte = t.expiry ? computeDteFromExpiry(t.expiry) : 0
    const pop = popForStrike(spot, t.strike, sigma, tDte, isCall)
    if (pop === null) continue
    const bandStart = Math.floor(pop / 5) * 5
    const key = `${bandStart}|${isBuy(t) ? 'buy' : 'sell'}`
    if (!banded[key]) banded[key] = []
    banded[key].push(t)
  }
  let best: { trades: Array<FlowBiasRawTrade>; style: 'buy' | 'sell' } | null = null
  for (const [key, groupTrades] of Object.entries(banded)) {
    if (groupTrades.length < 3) continue
    if (!best || groupTrades.length > best.trades.length) {
      const style = key.split('|')[1] as 'buy' | 'sell'
      best = { trades: groupTrades, style }
    }
  }
  return best
}

function computeStructuralLabel(
  rawTrades: Array<FlowBiasRawTrade> | undefined,
  spot: number | undefined,
  sigma: number | undefined
): { label: string; trades: Array<FlowBiasRawTrade>; level: number | null; putLevel: number | null; isResistance: boolean } {
  if (!rawTrades || !rawTrades.length || !spot || spot <= 0) return { label: 'No Structural Formation Detected', trades: [], level: null, putLevel: null, isResistance: true }

  // Only expiries within 45 trading days count toward a structural formation.
  const eligible = rawTrades.filter((t) => t.tradeType !== 'MULTI-LEG' && t.expiry && computeDteFromExpiry(t.expiry) <= 45)
  if (!eligible.length) return { label: 'No Structural Formation Detected', trades: [], level: null, putLevel: null, isResistance: true }

  // Anchor on the most-traded expiry, then only keep expiries within 7 days of it - never mix
  // e.g. a July expiry with a November expiry into the same wall.
  const expiryCounts: Record<string, number> = {}
  for (const t of eligible) expiryCounts[t.expiry!] = (expiryCounts[t.expiry!] || 0) + 1
  const anchorExpiry = Object.entries(expiryCounts).sort((a, b) => b[1] - a[1])[0][0]
  const anchorTime = new Date(anchorExpiry).getTime()
  const windowed = eligible.filter((t) => Math.abs(new Date(t.expiry!).getTime() - anchorTime) <= 7 * 86400000)

  const calls = windowed.filter((t) => t.type === 'call')
  const puts = windowed.filter((t) => t.type === 'put')

  const callBand = calls.length >= 3 ? bestStructuralBand(calls, spot, sigma || 0) : null
  const putBand = puts.length >= 3 ? bestStructuralBand(puts, spot, sigma || 0) : null
  if (!callBand || !putBand) return { label: 'No Structural Formation Detected', trades: [], level: null, putLevel: null, isResistance: true }

  // Crossed-flow rule: one side buying (A/AA), the other side selling (B/BB) - if both sides
  // are the same direction (both buy or both sell), it does not qualify as a real structure.
  if (callBand.style === putBand.style) return { label: 'No Structural Formation Detected', trades: [], level: null, putLevel: null, isResistance: true }

  // Combined premium size must be within 35% of each other - lopsided walls (e.g. $1.5M calls
  // vs $5M puts) don't count as a matched two-sided structure.
  const callPremium = callBand.trades.reduce((s, t) => s + (t.totalPremium || 0), 0)
  const putPremium = putBand.trades.reduce((s, t) => s + (t.totalPremium || 0), 0)
  const maxPrem = Math.max(callPremium, putPremium)
  if (maxPrem === 0 || Math.abs(callPremium - putPremium) / maxPrem > 0.35) {
    return { label: 'No Structural Formation Detected', trades: [], level: null, putLevel: null, isResistance: true }
  }

  const callLevel = findConcentratedStrikeLevel(callBand.trades)
  const putLevel = findConcentratedStrikeLevel(putBand.trades)
  if (callLevel === null || putLevel === null) return { label: 'No Structural Formation Detected', trades: [], level: null, putLevel: null, isResistance: true }

  const label = `Traders have built a Call wall at $${callLevel.toFixed(2)} and a Put wall at $${putLevel.toFixed(2)}`
  return { label, trades: [...callBand.trades, ...putBand.trades], level: callLevel, putLevel, isResistance: true }
}

// Cumulative-premium wall-growth chart - shows the Call wall and Put wall premium building
// throughout the day (each print adds to the running total for its side) so you can see which
// side built up faster/bigger and whether momentum stalled (a flattening line = the wall lost
// steam - no more prints adding to it - vs. a steadily climbing line = still building).
function StructuralWallChart({
  trades, callLevel, putLevel,
}: {
  trades: Array<FlowBiasRawTrade>
  callLevel: number | null
  putLevel: number | null
}) {
  const buildSeries = (side: 'call' | 'put') => {
    const pts = trades
      .filter((t) => t.type === side && t.trade_timestamp)
      .map((t) => ({ ts: new Date(t.trade_timestamp!).getTime(), prem: t.totalPremium || 0 }))
      .sort((a, b) => a.ts - b.ts)
    let running = 0
    return pts.map((p) => { running += p.prem; return { ts: p.ts, cum: running } })
  }
  const callSeries = buildSeries('call')
  const putSeries = buildSeries('put')
  if (callSeries.length === 0 && putSeries.length === 0) return null

  const W = 720, H = 200, padL = 60, padR = 20, padT = 16, padB = 28
  const allTs = [...callSeries.map((p) => p.ts), ...putSeries.map((p) => p.ts)]
  const minTs = Math.min(...allTs), maxTs = Math.max(...allTs)
  const tsRange = Math.max(1, maxTs - minTs)
  const maxCum = Math.max(callSeries[callSeries.length - 1]?.cum || 0, putSeries[putSeries.length - 1]?.cum || 0, 1)
  const x = (ts: number) => padL + ((ts - minTs) / tsRange) * (W - padL - padR)
  const y = (v: number) => padT + (1 - v / maxCum) * (H - padT - padB)
  const pathFor = (series: Array<{ ts: number; cum: number }>) =>
    series.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.ts).toFixed(1)} ${y(p.cum).toFixed(1)}`).join(' ')
  const fmtPrem = (v: number) => (v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : `$${(v / 1000).toFixed(0)}K`)

  return (
    <div style={{ padding: '14px 20px', borderBottom: '1px solid #262626', background: '#050505' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <span style={{ color: '#ffffff', fontWeight: 800, fontSize: '13px', letterSpacing: '0.5px' }}>WALL GROWTH THROUGHOUT THE DAY</span>
        <span style={{ display: 'flex', gap: '14px', fontSize: '11px', fontWeight: 800 }}>
          {callLevel !== null && <span style={{ color: '#22c55e' }}>■ CALL WALL ${callLevel.toFixed(2)}</span>}
          {putLevel !== null && <span style={{ color: '#ef4444' }}>■ PUT WALL ${putLevel.toFixed(2)}</span>}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: `${H}px`, display: 'block' }}>
        <line x1={padL} y1={padT} x2={padL} y2={H - padB} stroke="rgba(255,255,255,0.15)" strokeWidth={1} />
        <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="rgba(255,255,255,0.15)" strokeWidth={1} />
        {callSeries.length > 0 && <path d={pathFor(callSeries)} fill="none" stroke="#22c55e" strokeWidth={2.5} />}
        {putSeries.length > 0 && <path d={pathFor(putSeries)} fill="none" stroke="#ef4444" strokeWidth={2.5} />}
        {callSeries.map((p, i) => <circle key={`c${i}`} cx={x(p.ts)} cy={y(p.cum)} r={3} fill="#22c55e" />)}
        {putSeries.map((p, i) => <circle key={`p${i}`} cx={x(p.ts)} cy={y(p.cum)} r={3} fill="#ef4444" />)}
        <text x={padL - 8} y={y(maxCum) + 4} fill="#888" fontSize="9" textAnchor="end">{fmtPrem(maxCum)}</text>
        <text x={padL - 8} y={H - padB} fill="#888" fontSize="9" textAnchor="end">$0</text>
      </svg>
    </div>
  )
}

function computeGammaLabel(
  rawTrades: Array<FlowBiasRawTrade>,
  cardType: 'call' | 'put',
  target1Level: number | null,
  target2Level: number | null,
  targetUp: boolean,
  isLongTerm: boolean,
  cardExpiry: string,
  spot: number | undefined
): { label: string; trades: Array<FlowBiasRawTrade> } {
  if (isLongTerm) return { label: 'No Gamma Attack', trades: [] }
  if (target1Level === null && target2Level === null) return { label: 'No Gamma Attack', trades: [] }
  const isBuy = (t: FlowBiasRawTrade) => t.fillStyle === 'A' || t.fillStyle === 'AA'
  // Restrict to the SAME expiry as the card's own contract, buy-side (A/AA) prints only - gamma
  // pressure is expiry-specific dealer positioning built from real buying, not sold/opened flow.
  const sameExpiryBuys = rawTrades.filter((t) => t.tradeType !== 'MULTI-LEG' && t.type === cardType && t.expiry === cardExpiry && isBuy(t))
  if (!sameExpiryBuys.length) return { label: 'No Gamma Attack', trades: [] }

  const inc = spot && spot > 0 ? (spot < 25 ? 0.5 : spot < 200 ? 1 : spot < 500 ? 5 : 10) : 1
  const isAtm = (strike: number) => !!spot && Math.abs(strike - spot) < inc * 1.5
  // 80-90% probability-of-profit band = between spot and the further of target1(80%)/target2(90%)
  // in the move direction (same target levels the trade-management ladder already computes).
  const outerTarget = target1Level !== null && target2Level !== null
    ? (targetUp ? Math.max(target1Level, target2Level) : Math.min(target1Level, target2Level))
    : (target1Level ?? target2Level)
  const inPopBand = (strike: number) => {
    if (!spot || outerTarget === null || outerTarget === undefined) return false
    return targetUp ? strike >= spot && strike <= outerTarget : strike <= spot && strike >= outerTarget
  }

  const qualifying = sameExpiryBuys.filter((t) => isAtm(t.strike) || inPopBand(t.strike))
  if (qualifying.length >= 3) return { label: 'Gamma Squeeze in Formation', trades: qualifying }
  return { label: 'No Gamma Attack', trades: [] }
}

function bsOptionPriceFTP(S: number, K: number, T: number, r: number, sigma: number, isCall: boolean): number {
  if (T <= 0) return isCall ? Math.max(0, S - K) : Math.max(0, K - S)
  const d1 = _bsD1FTP(S, K, r, sigma, T)
  const d2 = d1 - sigma * Math.sqrt(T)
  return isCall
    ? S * _bsNCD(d1) - K * Math.exp(-r * T) * _bsNCD(d2)
    : K * Math.exp(-r * T) * _bsNCD(-d2) - S * _bsNCD(-d1)
}

// Black-Scholes gamma (same d1 as the option-price/POP helpers above) - rate of change of delta
// per $1 move in the underlying, used to plot the Gamma Attack chart's exposure curve.
function _bsGammaFTP(S: number, K: number, r: number, sigma: number, T: number): number {
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) return 0
  const d1 = _bsD1FTP(S, K, r, sigma, T)
  const pdf = Math.exp(-0.5 * d1 * d1) / Math.sqrt(2 * Math.PI)
  return pdf / (S * sigma * Math.sqrt(T))
}

// Dedicated Gamma-For-The-Day card - fetches TODAY's real intraday 5-minute candles for the
// underlying and computes this strike's actual Black-Scholes gamma at every candle close, so
// the line genuinely tracks gamma exposure building/decaying across the real session (not just
// at the handful of qualifying print timestamps). Headline stat shows the CURRENT gamma value.
// This is a standalone card - it does not reuse the candlestick TradeCardChart component.
function GammaDayCard({
  ticker, trades, strike, spot, sigma, cardExpiry,
}: {
  ticker: string
  trades: Array<FlowBiasRawTrade>
  strike: number
  spot?: number
  sigma?: number
  cardExpiry?: string
}) {
  const [candles, setCandles] = React.useState<Array<{ ts: number; close: number }>>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    // Request a trailing window (not just today) - requesting startDate===endDate===today
    // returns nothing whenever the client's "today" doesn't line up with the last actual
    // trading session in the feed (weekends/holidays/pre-market). We then keep only the
    // candles from the most recent trading day actually present in the response.
    const to = new Date().toISOString().split('T')[0]
    const from = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
    fetch('/api/bulk-chart-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbols: [ticker], timeframe: '5m', startDate: from, endDate: to }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        const raw = data.data?.[ticker] || []
        let parsed = raw
          .map((c: any) => ({ ts: c.timestamp ?? c.t, close: c.close }))
          .filter((c: { ts: number; close: number }) => c.ts && c.close > 0)
          .sort((a: any, b: any) => a.ts - b.ts)
        if (parsed.length) {
          const lastDay = new Date(parsed[parsed.length - 1].ts).toDateString()
          parsed = parsed.filter((c: { ts: number }) => new Date(c.ts).toDateString() === lastDay)
        }
        setCandles(parsed)
      })
      .catch(() => { if (!cancelled) setCandles([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [ticker])

  const dte = cardExpiry ? Math.max(computeDteFromExpiry(cardExpiry), 1) : 1
  const T = dte / 365
  const ivUsed = sigma && sigma > 0 ? sigma : 0.3
  const gammaAt = (s: number) => _bsGammaFTP(s, strike, 0.0387, ivUsed, T)

  // Qualifying flow prints at this strike/expiry, sorted by time — this is the "new OI" the
  // flow actually added. We accumulate contract size over the session so the exposure line
  // reflects how much MORE impactful gamma became as that new money built up, not just the
  // raw per-contract gamma value.
  const qualifyingTrades = trades
    .filter((t) => t.trade_timestamp && t.tradeSize && t.tradeSize > 0)
    .map((t) => ({ ts: new Date(t.trade_timestamp!).getTime(), size: t.tradeSize! }))
    .sort((a, b) => a.ts - b.ts)
  const attackBeginsTs = qualifyingTrades[0]?.ts
  const totalNewContracts = qualifyingTrades.reduce((sum, t) => sum + t.size, 0)
  const cumulativeContractsAt = (ts: number) => qualifyingTrades.reduce((sum, t) => (t.ts <= ts ? sum + t.size : sum), 0)
  // $ gamma exposure = gamma * contracts * 100 shares/contract * spot price (dollar move per 1pt).
  const exposureAt = (s: number, contracts: number) => gammaAt(s) * Math.max(contracts, 0) * 100 * s

  const gammaPoints = candles.map((c) => ({ ts: c.ts, gamma: exposureAt(c.close, cumulativeContractsAt(c.ts)) }))
  const currentGamma = gammaPoints.length > 0
    ? gammaPoints[gammaPoints.length - 1].gamma
    : exposureAt(spot || strike, totalNewContracts)
  const fmtExposure = (v: number) => {
    const abs = Math.abs(v)
    if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`
    if (abs >= 1_000) return `$${(v / 1_000).toFixed(1)}K`
    return `$${v.toFixed(0)}`
  }

  return (
    <div style={{ padding: '16px 20px', borderBottom: '1px solid #262626', background: '#050505' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '6px' }}>
        <div style={{ color: '#ffffff', fontWeight: 800, fontSize: '13px', letterSpacing: '0.5px' }}>
          {ticker} GAMMA EXPOSURE TODAY — ${strike.toFixed(2)} STRIKE ({totalNewContracts.toLocaleString()} NEW CONTRACTS)
        </div>
        <div style={{ fontSize: '15px', fontWeight: 900, color: '#a8ff3e' }}>
          GAMMA EXPOSURE: {fmtExposure(currentGamma)}
        </div>
      </div>
      {loading ? (
        <div style={{ height: '260px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', fontSize: '12px', fontWeight: 700 }}>
          LOADING TODAY&apos;S SESSION…
        </div>
      ) : gammaPoints.length === 0 ? (
        <div style={{ height: '260px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', fontSize: '12px', fontWeight: 700 }}>
          NO INTRADAY DATA AVAILABLE
        </div>
      ) : (
        <GammaDayChartSvg points={gammaPoints} attackBeginsTs={attackBeginsTs} valueFormatter={fmtExposure} />
      )}
    </div>
  )
}

function GammaDayChartSvg({
  points, attackBeginsTs, valueFormatter,
}: {
  points: Array<{ ts: number; gamma: number }>
  attackBeginsTs?: number
  valueFormatter?: (v: number) => string
}) {
  const fmtY = valueFormatter || ((v: number) => v.toFixed(4))
  const W = 760, H = 260, padL = 74, padR = 24, padT = 22, padB = 40
  const minTs = points[0].ts, maxTs = points[points.length - 1].ts
  const tsRange = Math.max(1, maxTs - minTs)
  const rawMinG = Math.min(...points.map((p) => p.gamma))
  const rawMaxG = Math.max(...points.map((p) => p.gamma))
  // Pad the y-domain by 10% of the range on each side (instead of always starting at 0) so the
  // line actually uses the full vertical space instead of hugging the top when values cluster.
  const gSpan = Math.max(rawMaxG - rawMinG, rawMaxG * 0.05, 0.0001)
  const minG = Math.max(0, rawMinG - gSpan * 0.15)
  const maxG = rawMaxG + gSpan * 0.15
  const gRange = Math.max(maxG - minG, 0.0001)
  const x = (ts: number) => padL + ((ts - minTs) / tsRange) * (W - padL - padR)
  const y = (g: number) => padT + (1 - (g - minG) / gRange) * (H - padT - padB)
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.ts).toFixed(1)} ${y(p.gamma).toFixed(1)}`).join(' ')
  const areaD = `${pathD} L ${x(points[points.length - 1].ts).toFixed(1)} ${H - padB} L ${x(points[0].ts).toFixed(1)} ${H - padB} Z`
  const attackX = attackBeginsTs && attackBeginsTs >= minTs && attackBeginsTs <= maxTs ? x(attackBeginsTs) : null
  const fmtTime = (ts: number) => new Date(ts).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })

  // 5 evenly-spaced horizontal gridlines/labels across the padded y-domain.
  const yTickCount = 5
  const yTicks = Array.from({ length: yTickCount }, (_, i) => minG + (gRange * i) / (yTickCount - 1))
  // Up to 6 evenly-spaced x-axis time labels across the session.
  const xTickCount = Math.min(6, points.length)
  const xTicks = Array.from({ length: xTickCount }, (_, i) => minTs + (tsRange * i) / (xTickCount - 1))

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: `${H}px`, display: 'block' }}>
      <defs>
        <linearGradient id="gammaDayFill" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#a8ff3e" stopOpacity={0.35} />
          <stop offset="100%" stopColor="#a8ff3e" stopOpacity={0} />
        </linearGradient>
      </defs>
      {yTicks.map((g, i) => (
        <line key={i} x1={padL} y1={y(g)} x2={W - padR} y2={y(g)} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
      ))}
      <line x1={padL} y1={padT} x2={padL} y2={H - padB} stroke="rgba(255,255,255,0.2)" strokeWidth={1} />
      <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="rgba(255,255,255,0.2)" strokeWidth={1} />
      <path d={areaD} fill="url(#gammaDayFill)" stroke="none" />
      <path d={pathD} fill="none" stroke="#a8ff3e" strokeWidth={2.5} />
      {attackX !== null && (
        <>
          <line x1={attackX} y1={padT} x2={attackX} y2={H - padB} stroke="#ff8c00" strokeWidth={1.5} strokeDasharray="4 3" />
          <text x={attackX + 5} y={padT + 13} fill="#ff8c00" fontSize="12" fontWeight={800}>GAMMA ATTACK BEGINS</text>
        </>
      )}
      {yTicks.map((g, i) => (
        <text key={i} x={padL - 8} y={y(g) + 4} fill="#ffffff" fontSize="11" fontWeight={600} textAnchor="end">{fmtY(g)}</text>
      ))}
      {xTicks.map((ts, i) => (
        <text
          key={i}
          x={x(ts)}
          y={H - padB + 20}
          fill="#ffffff"
          fontSize="11"
          fontWeight={600}
          textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}
        >
          {fmtTime(ts)}
        </text>
      ))}
    </svg>
  )
}
// Inverse-solve for the stock price that produces a given option premium (bisection - the BS
// price is monotonic in S: increasing for calls, decreasing for puts). Used to express the
// premium-based stop loss as an equivalent stock price, same as the profit targets.
function bsStockForPremiumFTP(
  targetPremium: number,
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number,
  isCall: boolean,
  searchDown: boolean
): number | null {
  if (!sigma || sigma <= 0 || T <= 0) return null
  let lo = searchDown ? S * 0.2 : S,
    hi = searchDown ? S : S * 3
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    const p = bsOptionPriceFTP(mid, K, T, r, sigma, isCall)
    const tooLow = isCall ? p < targetPremium : p > targetPremium
    if (tooLow) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

// Trade direction + profit targets/stop loss - identical logic to the Market Regimes
// sidebar (RegimesPanel/EFICharting): calls => bullish (up), puts => bearish (down), but a
// B/BB fill style (sold-to-open / hit-the-bid) flips the read to the opposite direction.
// Targets are the 80%/90% probability stock-price levels (Black-Scholes), stop loss is the
// option-premium stop derived from delta/IV/DTE exactly as the Regimes cards compute it.
// `sigma`/`dte`/`spot` are the resolved ATM IV / DTE / live spot already computed upstream in
// OptionsFlowTable's SweepSense gate (same values driving the entry plan) - raw flow prints
// rarely carry `implied_volatility`, so those resolved values are preferred when present.
function calcTradeManagement(trade: OptionsFlowData, sigmaOverride?: number, dteOverride?: number, spotOverride?: number) {
  const fs = trade.fill_style || ''
  const isSoldToOpen = fs === 'B' || fs === 'BB'
  const isCall = trade.type === 'call'
  const targetUp = (isCall && !isSoldToOpen) || (!isCall && isSoldToOpen)

  const sigma = sigmaOverride && sigmaOverride > 0
    ? sigmaOverride
    : (trade.implied_volatility && trade.implied_volatility > 0 ? trade.implied_volatility : 0)
  const dte = dteOverride && dteOverride > 0 ? Math.round(dteOverride) : Math.max(0, Math.round(trade.days_to_expiry))
  const spot = spotOverride && spotOverride > 0 ? spotOverride : trade.spot_price
  const target1 = sigma > 0 ? bsStrikeForProbFTP(spot, sigma, dte, 80, targetUp) : null
  const target2 = sigma > 0 ? bsStrikeForProbFTP(spot, sigma, dte, 90, targetUp) : null

  const delta = Math.abs(trade.delta || 0.5)
  let baseStopPercent = 0.3
  if (delta > 0.7) baseStopPercent = 0.15
  else if (delta >= 0.6) baseStopPercent = 0.2
  else if (delta >= 0.4) baseStopPercent = 0.25
  else if (delta >= 0.25) baseStopPercent = 0.35
  else baseStopPercent = 0.4
  if (dte < 7) baseStopPercent = Math.max(0.1, baseStopPercent - 0.1)
  else if (dte < 14) baseStopPercent = Math.max(0.15, baseStopPercent - 0.05)
  const ivAdjustment = sigma ? Math.max(0, (sigma - 0.3) * 0.5) : 0
  const adjustedStopPercent = Math.min(0.5, baseStopPercent + ivAdjustment)
  const entryPremium = trade.premium_per_contract
  const stopLoss = entryPremium > 0 ? entryPremium * (1 - adjustedStopPercent) : null
  const thetaDecay = Math.abs(trade.theta || 0)

  // ── Option premium at each stock target/stop - same Black-Scholes heatmap-grid reprice
  // convention as the options calculator (ChainCalculator.tsx heatMapTimeSeries grid): the
  // baseline is priced at today's full DTE, but the TARGET reprice uses a *decayed* remaining
  // DTE (not the full current DTE) since price move alone isn't enough - time has to pass to
  // get there too. Short-dated contracts (<=10 DTE) assume half the time has burned off by the
  // time price gets there; longer-dated contracts assume 2/3 has burned off (1/3 DTE left).
  const r = 0.0387
  const T = dte / 365
  const K = trade.strike
  const decayedDte = Math.max(1, dte <= 10 ? Math.round(dte / 2) : Math.round(dte / 3))
  const Tdecayed = decayedDte / 365
  const pctVsEntry = (price: number | null) => {
    if (price === null || entryPremium <= 0) return null
    const raw = ((price - entryPremium) / entryPremium) * 100
    return isSoldToOpen ? -raw : raw
  }
  const target1OptionPrice = sigma > 0 && target1 !== null ? bsOptionPriceFTP(target1, K, Tdecayed, r, sigma, isCall) : null
  const target2OptionPrice = sigma > 0 && target2 !== null ? bsOptionPriceFTP(target2, K, Tdecayed, r, sigma, isCall) : null
  const stopStockPrice =
    sigma > 0 && stopLoss !== null
      ? bsStockForPremiumFTP(stopLoss, spot, K, Tdecayed, r, sigma, isCall, targetUp)
      : null
  const target1Pct = pctVsEntry(target1OptionPrice)
  const target2Pct = pctVsEntry(target2OptionPrice)
  const stopPct = pctVsEntry(stopLoss)

  return {
    targetUp,
    target1,
    target2,
    stopLoss,
    thetaDecay,
    target1OptionPrice,
    target2OptionPrice,
    stopStockPrice,
    target1Pct,
    target2Pct,
    stopPct,
  }
}

// Flow sentiment panel - unified design combining the 4 bull/bear call/put premium-split rows
// AND the overall trend gauge into a single compact candy-black card (replaces the previous
// separate quadrant-box grid + arc gauge, same underlying breakdown percentages).
function FlowSentimentPanel({ breakdown, isMobileCard = false }: { breakdown: { buyCallsPct: number; bearCallsPct: number; buyPutsPct: number; bearPutsPct: number }; isMobileCard?: boolean }) {
  const bc = breakdown.buyCallsPct
  const rc = breakdown.bearCallsPct
  const bp = breakdown.buyPutsPct
  const rp = breakdown.bearPutsPct
  const maxVal = Math.max(bc, rc, bp, rp, 0.0001)
  const rows = [
    { lbl: 'BULL CALLS', val: bc, color: '#10b981' },
    { lbl: 'BEAR CALLS', val: rc, color: '#4da6ff' },
    { lbl: 'BULL PUTS', val: bp, color: '#ffcc00' },
    { lbl: 'BEAR PUTS', val: rp, color: '#ff2222' },
  ]

  const score = Math.max(-1, Math.min(1, ((bc / 100) * 0.8 + (bp / 100) * 0.6 - (rc / 100) * 0.6 - (rp / 100) * 0.8) / 0.8))
  const gaugePercent = (score + 1) / 2
  const zones = [
    { start: 0, end: 0.2, color: '#ef4444', label: 'Bear Trend' },
    { start: 0.2, end: 0.4, color: '#f97316', label: 'Bear Chop' },
    { start: 0.4, end: 0.6, color: '#eab308', label: 'Neutral' },
    { start: 0.6, end: 0.8, color: '#84cc16', label: 'Bull Chop' },
    { start: 0.8, end: 1.0, color: '#22c55e', label: 'Bull Trend' },
  ]
  const zone = zones.find((z) => gaugePercent >= z.start && gaugePercent <= z.end) ?? zones[4]
  const pctStr = `${score >= 0 ? '+' : ''}${(score * 100).toFixed(0)}%`

  return (
    <div style={{
      width: isMobileCard ? '100%' : '260px',
      display: 'flex', flexDirection: 'column', gap: '7px',
      padding: isMobileCard ? '8px 10px' : '10px 12px', borderRadius: '8px',
      background: 'linear-gradient(180deg, #141414 0%, #060606 60%, #000000 100%)',
      border: '1px solid rgba(255,255,255,0.08)',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), inset 0 -2px 4px rgba(0,0,0,0.7)',
    }}>
      {rows.map((row) => {
        const pct = Math.max(0, Math.min(100, row.val))
        const isTop = pct === maxVal && pct > 0
        return (
          <div key={row.lbl} style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
            <span style={{
              width: '68px', flexShrink: 0, fontSize: '9px', fontWeight: 900, letterSpacing: '0.04em',
              color: '#ffffff',
            }}>{row.lbl}</span>
            <div style={{ flex: 1, height: '10px', borderRadius: '5px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
              <div style={{
                width: `${pct}%`, height: '100%',
                background: `linear-gradient(90deg, ${row.color}99 0%, ${row.color} 100%)`,
                boxShadow: isTop ? `0 0 6px ${row.color}88` : 'none',
              }} />
            </div>
            <span style={{ width: '30px', textAlign: 'right', flexShrink: 0, fontSize: '11px', fontWeight: 900, color: '#ffffff' }}>
              {pct.toFixed(0)}%
            </span>
          </div>
        )
      })}

      <div style={{ marginTop: '3px' }}>
        <div style={{
          position: 'relative', height: '8px', borderRadius: '4px',
          background: 'linear-gradient(90deg, #ef4444 0%, #f97316 25%, #eab308 50%, #84cc16 75%, #22c55e 100%)',
          opacity: 0.85,
        }}>
          <div style={{
            position: 'absolute', top: '-3px', left: `calc(${gaugePercent * 100}% - 6px)`,
            width: '12px', height: '14px', borderRadius: '3px',
            background: '#ffffff', border: `2px solid ${zone.color}`, boxShadow: `0 0 6px ${zone.color}`,
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '5px' }}>
          <span style={{ fontSize: '9px', fontWeight: 800, color: '#ef4444', letterSpacing: '0.06em' }}>BEAR</span>
          <span style={{ fontSize: isMobileCard ? '11px' : '12px', fontWeight: 900, color: zone.color, letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
            {pctStr} {zone.label.toUpperCase()}
          </span>
          <span style={{ fontSize: '9px', fontWeight: 800, color: '#22c55e', letterSpacing: '0.06em' }}>BULL</span>
        </div>
      </div>
    </div>
  )
}

// ── SweepSense Tab: rich live view of every SweepSense-qualifying trade, sourced directly
// from the OptionsFlowTable data to the left. Auto-populates - no scan button needed.
// Small animated line-icon set for the SweepSense quick-filter control row. Deliberately not
// emoji - crisp, single-color SVG strokes (Feather/Lucide-style) with a subtle per-icon motion
// so the active/inactive states read clearly at a glance.
function QuickFilterIcon({ icon, color }: { icon: 'ready' | 'missed' | 'hedge' | 'directional' | 'sweep' | 'gamma' | 'structural' | 'spam' | 'summary'; color: string }) {
  const common = { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (icon) {
    case 'summary':
      return (
        <svg {...common}>
          <path d="M6 4h9l3 3v13H6z" />
          <path d="M15 4v3h3" style={{ animation: 'qfPulseScale 2.4s ease-in-out infinite' }} />
          <path d="M9 12h6M9 15h6M9 9h3" style={{ strokeDasharray: 18, animation: 'qfCheckDraw 2.4s ease-in-out infinite' }} />
        </svg>
      )
    case 'ready':
      return (
        <svg {...common}>
          <rect x="4" y="3" width="16" height="18" rx="2" />
          <path d="M9 3h6v3H9z" />
          <path d="M8 13l2.5 2.5L16 10" style={{ strokeDasharray: 16, animation: 'qfCheckDraw 2.2s ease-in-out infinite' }} />
        </svg>
      )
    case 'missed':
      return (
        <svg {...common} style={{ animation: 'qfMissedShake 2.4s ease-in-out infinite' }}>
          <circle cx="12" cy="12" r="9" />
          <path d="M9 9l6 6M15 9l-6 6" />
        </svg>
      )
    case 'hedge':
      return (
        <svg {...common} style={{ animation: 'qfShieldGlow 2.2s ease-in-out infinite' }}>
          <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
          <path d="M9.5 12l1.8 1.8L15 9.5" />
        </svg>
      )
    case 'directional':
      return (
        <svg {...common} style={{ animation: 'qfSpin 4.5s linear infinite', transformOrigin: '12px 12px' }}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 4v3M12 17v3M4 12h3M17 12h3" />
          <path d="M12 7l2.2 4.8L19 14l-4.8 2.2L12 21l-2.2-4.8L5 14l4.8-2.2z" />
        </svg>
      )
    case 'sweep':
      return (
        <svg {...common}>
          <path d="M4 8h11M4 12h14M4 16h9" style={{ animation: 'qfSweepDrift 1.8s ease-in-out infinite' }} />
        </svg>
      )
    case 'gamma':
      return (
        <svg {...common} style={{ animation: 'qfBolt 2s ease-in-out infinite' }}>
          <path d="M13 2L4 14h6l-1 8 9-12h-6z" />
        </svg>
      )
    case 'structural':
      return (
        <svg {...common}>
          <path d="M4 21V9l8-5 8 5v12" />
          <path d="M9 21v-7h6v7M4 9h16" />
        </svg>
      )
    case 'spam':
      return (
        <svg {...common} style={{ animation: 'qfStack 1.6s ease-in-out infinite' }}>
          <rect x="5" y="4" width="14" height="5" rx="1" />
          <rect x="5" y="10.5" width="14" height="5" rx="1" />
          <rect x="5" y="17" width="14" height="4" rx="1" />
        </svg>
      )
    default:
      return null
  }
}

function SweepSenseTab({
  data,
  allFlowData,
  isScanning,
  progress,
  summaryMode,
  onRemove,
}: {
  summaryMode: boolean
  // When provided, each card renders a small remove ('x') button (top-right) that calls this -
  // used by the A+ Tracker tab (user-tracked flows) so a card can be untracked; SweepSense's own
  // qualifying-trade cards never pass this since there's nothing to "remove" there.
  onRemove?: (trade: OptionsFlowData) => void
  // Full unfiltered flow array - grouped by ticker below to feed the card's AlgoFlow chart mode.
  allFlowData?: OptionsFlowData[]
  data: {
    trades: Array<{
      trade: OptionsFlowData
      grade: string
      gradeColor: string
      convictionScore: number
      pctMove: number | null
      currentStockPrice: number | null
      currentOptionPrice: number | null
      contractPctChange: number | null
      magnet: number | null
      pivot: number | null
      sigCode: string
      sigColor: string
      planText: string
      qualifiedAt: number
      sigma?: number
      dte?: number
      spot?: number
      breakdown: { buyCallsPct: number; bearCallsPct: number; buyPutsPct: number; bearPutsPct: number }
      liveRawTrades?: Array<FlowBiasRawTrade>
      otherLegs?: OptionsFlowData[]
      flowSpamLabel?: string
      gammaAttackLabel?: string
      structuralLabel?: string
      nextEarningsDate?: string | null
    }>
    stats: { buyCallsPct: number; bearCallsPct: number; buyPutsPct: number; bearPutsPct: number }
    bubbles: Array<{ ticker: string; premium: number; bias: 'bull' | 'bear'; biasStrength: number }>
  } | null
  isScanning?: boolean
  progress?: { current: number; total: number } | null
}) {
  const fmtPrem = (v: number) => (v >= 1000000 ? `$${(v / 1000000).toFixed(1)}M` : `$${(v / 1000).toFixed(0)}K`)
  const [openCharts, setOpenCharts] = useState<Set<string>>(new Set())
  // Per-card chart mode toggle: 'stock' (default candlestick TradeCardChart) or 'algoflow'
  // (embeds AlgoFlowScreener for that ticker - same net bull/bear + 4-line flow chart).
  const [chartModeByFlowId, setChartModeByFlowId] = useState<Record<string, 'stock' | 'algoflow'>>({})

  // Deep-link support: ?openFlow=<flowId> in the URL (e.g. from a Discord alert) auto-expands
  // that card's interactive chart and scrolls it into view once its trades have loaded.
  useEffect(() => {
    const targetFlowId = new URLSearchParams(window.location.search).get('openFlow')
    if (!targetFlowId || !data?.trades?.length) return
    const match = data.trades.some(({ trade }) => generateFlowId(trade) === targetFlowId)
    if (!match) return
    setOpenCharts((prev) => new Set(prev).add(targetFlowId))
    setTimeout(() => {
      document.querySelector(`[data-flow-id="${targetFlowId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 300)
  }, [data])

  const tickerTradesMap = useMemo(() => {
    const map = new Map<string, OptionsFlowData[]>()
    if (!allFlowData) return map
    for (const t of allFlowData) {
      const list = map.get(t.underlying_ticker)
      if (list) list.push(t)
      else map.set(t.underlying_ticker, [t])
    }
    return map
  }, [allFlowData])

  // ── Scanning screen background: same weather-particle canvas (rain/snow/storm cycling)
  // used by the main OptionsFlowTable loading screen - self-contained here so the SweepSense
  // tab's scan screen gets the same cool animated backdrop instead of a bare spinner.
  const [weatherCanvas, setWeatherCanvas] = useState<HTMLCanvasElement | null>(null)
  const weatherModeRef = React.useRef(0)

  React.useEffect(() => {
    if (!isScanning) return
    const canvas = weatherCanvas
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    let lightning = 0
    let lightningAlpha = 0
    type WP = { x: number; y: number; vx: number; vy: number; len: number; r: number; alpha: number; depth: number; drift: number; rot: number; rotV: number }
    let particles: WP[] = []
    let prevMode = -1

    const W = () => canvas.offsetWidth
    const H = () => canvas.offsetHeight

    const init = (mode: number) => {
      particles = []
      const w = W(), h = H()
      if (mode === 0) {
        for (let i = 0; i < 320; i++) {
          const d = 0.3 + Math.random() * 0.7
          particles.push({ x: Math.random() * w, y: Math.random() * h, vx: -1.2 - d * 2.5, vy: 9 + d * 12, len: 8 + d * 22, r: 0.5 + d * 0.9, alpha: 0.12 + d * 0.5, depth: d, drift: 0, rot: 0, rotV: 0 })
        }
      } else if (mode === 1) {
        for (let i = 0; i < 220; i++) {
          const d = Math.random()
          const layer = d < 0.33 ? 0 : d < 0.66 ? 1 : 2
          particles.push({ x: Math.random() * w, y: Math.random() * h, vx: 0, vy: 0.4 + layer * 0.9 + Math.random() * 0.5, len: 0, r: 1 + layer * 2.2 + Math.random() * 1.5, alpha: 0.15 + layer * 0.35 + Math.random() * 0.25, depth: d, drift: (Math.random() - 0.5) * 0.4, rot: Math.random() * Math.PI * 2, rotV: (Math.random() - 0.5) * 0.025 })
        }
      } else {
        for (let i = 0; i < 400; i++) {
          const d = 0.3 + Math.random() * 0.7
          particles.push({ x: Math.random() * w, y: Math.random() * h, vx: -7 - d * 10, vy: 4 + d * 7, len: 14 + d * 32, r: 0.35 + d * 0.7, alpha: 0.08 + d * 0.4, depth: d, drift: 0, rot: 0, rotV: 0 })
        }
      }
    }

    const draw = () => {
      const mode = weatherModeRef.current
      const w = W(), h = H()
      if (!canvas.width || canvas.width !== w) { canvas.width = w; canvas.height = h }
      if (mode !== prevMode) { init(mode); prevMode = mode; lightning = 0 }

      if (mode === 0) {
        // RAIN
        ctx.fillStyle = '#020407'; ctx.fillRect(0, 0, w, h)
        const fog = ctx.createLinearGradient(0, 0, 0, h)
        fog.addColorStop(0, 'rgba(5,15,30,0.35)'); fog.addColorStop(1, 'rgba(2,6,14,0)')
        ctx.fillStyle = fog; ctx.fillRect(0, 0, w, h)
        if (lightning > 0) {
          ctx.fillStyle = `rgba(180,220,255,${lightningAlpha * lightning / 6})`; ctx.fillRect(0, 0, w, h); lightning--
        } else if (Math.random() < 0.0018) { lightning = 4 + Math.floor(Math.random() * 4); lightningAlpha = 0.1 + Math.random() * 0.15 }
        ctx.lineCap = 'round'
        for (const p of particles) {
          ctx.beginPath(); ctx.strokeStyle = `rgba(160,205,255,${p.alpha})`; ctx.lineWidth = p.r
          const a = Math.atan2(p.vy, p.vx); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.cos(a) * p.len, p.y + Math.sin(a) * p.len); ctx.stroke()
          p.x += p.vx * 0.55; p.y += p.vy * 0.55
          if (p.y > h + p.len) { p.y = -p.len; p.x = Math.random() * w }
          if (p.x < -p.len) { p.x = w + p.len; p.y = Math.random() * h }
        }
      } else if (mode === 1) {
        // SNOW
        ctx.fillStyle = '#020309'; ctx.fillRect(0, 0, w, h)
        const atm = ctx.createRadialGradient(w * 0.5, h * 0.15, 0, w * 0.5, h * 0.5, w * 0.65)
        atm.addColorStop(0, 'rgba(12,22,55,0.35)'); atm.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = atm; ctx.fillRect(0, 0, w, h)
        const wind = Math.sin(Date.now() * 0.00025) * 0.35
        for (const p of particles) {
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha = p.alpha
          if (p.r > 2.8) {
            ctx.strokeStyle = `rgba(220,238,255,${p.alpha})`; ctx.lineWidth = 0.75
            for (let a2 = 0; a2 < 6; a2++) {
              const ax = Math.cos(a2 * Math.PI / 3), ay = Math.sin(a2 * Math.PI / 3)
              ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(ax * p.r, ay * p.r); ctx.stroke()
              ctx.beginPath(); ctx.moveTo(ax * p.r * 0.5, ay * p.r * 0.5)
              ctx.lineTo(ax * p.r * 0.5 + Math.cos(a2 * Math.PI / 3 + Math.PI / 2) * p.r * 0.28, ay * p.r * 0.5 + Math.sin(a2 * Math.PI / 3 + Math.PI / 2) * p.r * 0.28); ctx.stroke()
            }
          } else {
            const g = ctx.createRadialGradient(0, 0, 0, 0, 0, p.r * 1.8)
            g.addColorStop(0, `rgba(240,250,255,${p.alpha})`); g.addColorStop(1, 'rgba(200,225,255,0)')
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, p.r * 1.8, 0, Math.PI * 2); ctx.fill()
          }
          ctx.restore(); ctx.globalAlpha = 1
          p.drift += (Math.random() - 0.5) * 0.012; p.drift = Math.max(-0.55, Math.min(0.55, p.drift))
          p.x += p.drift + wind; p.y += p.vy; p.rot += p.rotV
          if (p.y > h + p.r * 2) { p.y = -p.r * 2; p.x = Math.random() * w }
          if (p.x < -p.r * 2) p.x = w + p.r * 2
          if (p.x > w + p.r * 2) p.x = -p.r * 2
        }
      } else {
        // STORM
        ctx.fillStyle = '#010203'; ctx.fillRect(0, 0, w, h)
        for (let l = 0; l < 3; l++) {
          const fy = h * (0.2 + l * 0.3) + Math.sin(Date.now() * 0.00009 + l * 2) * 25
          const fg = ctx.createLinearGradient(0, fy - 50, 0, fy + 90)
          fg.addColorStop(0, 'rgba(10,18,30,0)'); fg.addColorStop(0.5, 'rgba(14,24,42,0.2)'); fg.addColorStop(1, 'rgba(10,18,30,0)')
          ctx.fillStyle = fg; ctx.fillRect(0, fy - 50, w, 140)
        }
        if (lightning > 0) {
          ctx.fillStyle = `rgba(200,230,255,${lightningAlpha * lightning / 8})`; ctx.fillRect(0, 0, w, h)
          if (lightning === 8) {
            ctx.beginPath(); ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.lineWidth = 1.5
            let bx = w * 0.25 + Math.random() * w * 0.5, by = 0; ctx.moveTo(bx, 0)
            while (by < h * 0.72) { by += 18 + Math.random() * 28; bx += (Math.random() - 0.5) * 55; ctx.lineTo(bx, by) }
            ctx.stroke()
          }
          lightning--
        } else if (Math.random() < 0.005) { lightning = 6 + Math.floor(Math.random() * 6); lightningAlpha = 0.13 + Math.random() * 0.2 }
        ctx.lineCap = 'round'
        for (const p of particles) {
          ctx.beginPath(); ctx.strokeStyle = `rgba(130,180,230,${p.alpha})`; ctx.lineWidth = p.r
          const a = Math.atan2(p.vy, p.vx); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.cos(a) * p.len, p.y + Math.sin(a) * p.len); ctx.stroke()
          p.x += p.vx * 0.65; p.y += p.vy * 0.65
          if (p.y > h + p.len) { p.y = -p.len; p.x = Math.random() * (w + 150) - 75 }
          if (p.x < -p.len * 2) { p.x = w + p.len; p.y = Math.random() * h }
        }
      }
      raf = requestAnimationFrame(draw)
    }

    canvas.width = W(); canvas.height = H()
    init(weatherModeRef.current); prevMode = weatherModeRef.current
    draw()
    const ro = new ResizeObserver(() => { canvas.width = W(); canvas.height = H(); init(weatherModeRef.current) })
    ro.observe(canvas)
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [isScanning, weatherCanvas])

  React.useEffect(() => {
    if (!isScanning) return
    const t = setInterval(() => { weatherModeRef.current = (weatherModeRef.current + 1) % 3 }, 14000)
    return () => clearInterval(t)
  }, [isScanning])

  const SS_LOADING_QUOTES = [
    { text: 'The trend is your friend - until it bends.', author: 'Wall Street Proverb' },
    { text: 'Markets can remain irrational longer than you can remain solvent.', author: 'John Maynard Keynes' },
    { text: 'In the short run the market is a voting machine. In the long run, a weighing machine.', author: 'Benjamin Graham' },
    { text: 'The stock market is filled with individuals who know the price of everything, but the value of nothing.', author: 'Philip Fisher' },
    { text: 'The four most dangerous words in investing: "this time it\'s different."', author: 'Sir John Templeton' },
    { text: 'Risk comes from not knowing what you\'re doing.', author: 'Warren Buffett' },
    { text: 'Price is what you pay. Value is what you get.', author: 'Warren Buffett' },
    { text: 'The market is a device for transferring money from the impatient to the patient.', author: 'Warren Buffett' },
    { text: 'It\'s not whether you\'re right or wrong, but how much money you make when you\'re right and lose when you\'re wrong.', author: 'George Soros' },
    { text: 'Know what you own, and know why you own it.', author: 'Peter Lynch' },
    { text: 'Behind every stock is a company. Find out what it\'s doing.', author: 'Peter Lynch' },
    { text: 'I will tell you how to become rich: be fearful when others are greedy. Be greedy when others are fearful.', author: 'Warren Buffett' },
    { text: 'The intelligent investor is a realist who sells to optimists and buys from pessimists.', author: 'Benjamin Graham' },
    { text: 'Wide diversification is only required when investors do not understand what they are doing.', author: 'Warren Buffett' },
    { text: 'An investment in knowledge pays the best interest.', author: 'Benjamin Franklin' },
    { text: 'Money is a terrible master but an excellent servant.', author: 'P.T. Barnum' },
    { text: 'The biggest risk is not taking any risk at all.', author: 'Mark Zuckerberg' },
    { text: 'The secret of getting ahead is getting started.', author: 'Mark Twain' },
    { text: 'Block trades don\'t lie. Institutions leave footprints.', author: 'EFI Research' },
    { text: 'When sweep orders cluster, the smart money is speaking.', author: 'EFI Research' },
    { text: 'Volume is the weapon of the informed trader.', author: 'EFI Research' },
    { text: 'The best trades come from where conviction meets flow.', author: 'EFI Research' },
    { text: 'Follow the smart money - it always leaves a trail in options.', author: 'EFI Research' },
    { text: 'Premium doesn\'t lie. Size tells the story.', author: 'EFI Research' },
    { text: 'Unusual options activity today is tomorrow\'s headline.', author: 'EFI Research' },
    { text: 'Options flow is the heartbeat of institutional conviction.', author: 'EFI Research' },
    { text: 'The dark pool is where certainty trades. Follow the size.', author: 'EFI Research' },
    { text: 'A sweep across multiple exchanges is a trader screaming urgency.', author: 'EFI Research' },
    { text: 'When IV crush comes, preparation determines winners from losers.', author: 'EFI Research' },
    { text: 'The goal of a successful trader is to make the best trades. Money is secondary.', author: 'Alexander Elder' },
    { text: 'Trading is 30% strategy, 70% psychology. Master yourself first.', author: 'Mark Douglas' },
    { text: 'Losers average losers. Size up only when you\'re right.', author: 'Paul Tudor Jones' },
    { text: 'The most important quality for an investor is temperament, not intellect.', author: 'Warren Buffett' },
    { text: 'Win or lose, everybody gets what they want out of the market.', author: 'Ed Seykota' },
    { text: 'Cut your losses short and let your profits run.', author: 'Trading Maxim' },
    { text: 'The hard part isn\'t knowing what to do - it\'s sitting on your hands when there\'s nothing to do.', author: 'Jesse Livermore' },
    { text: 'Never risk more than 1% of your total equity on any single trade.', author: 'Larry Hite' },
    { text: 'Amateurs go broke taking large losses. Professionals go broke taking small profits.', author: 'Thomas Bulkowski' },
    { text: 'You don\'t need to be brilliant, just wiser than the other guys on average, for a long time.', author: 'Charlie Munger' },
    { text: 'Invert, always invert. Avoid stupidity rather than seeking brilliance.', author: 'Charlie Munger' },
  ]
  const [loadingQuoteIndex, setLoadingQuoteIndex] = useState(0)
  React.useEffect(() => {
    if (!isScanning) return
    const iv = setInterval(() => setLoadingQuoteIndex((i) => (i + 1) % SS_LOADING_QUOTES.length), 3000)
    return () => clearInterval(iv)
  }, [isScanning])
  // FlowBias detail modal - clicking Spam/Structural/Gamma rows shows exactly which raw prints
  // were matched to produce that label.
  const [flowBiasDetail, setFlowBiasDetail] = useState<{
    title: string
    trades: Array<FlowBiasRawTrade>
    uniqueness?: SpamUniquenessScore
    gammaMeta?: { ticker: string; strike: number; spot?: number; sigma?: number; expiry?: string }
    structuralMeta?: { callLevel: number | null; putLevel: number | null }
  } | null>(null)
  const [riskLevel, setRiskLevel] = useState<Record<string, 'PROB' | 'ONAROLE' | 'LUCKY'>>({})
  // Top control row quick filters - "Ready 4 Pickup" (has an active entry plan), "He Missed"
  // (stock moved the most % against the implied trade direction), "Hedge"/"Directional"
  // (based on where the strike sits relative to the 90%/80% probability-of-profit level),
  // "Sweep" (trade type), and "Gamma Attack"/"Structural"/"Spam" (FlowBias rows active).
  type QuickFilterKey = 'READY' | 'MISSED' | 'HEDGE' | 'DIRECTIONAL' | 'SWEEP' | 'GAMMA' | 'STRUCTURAL' | 'SPAM'
  const [openFilterDropdown, setOpenFilterDropdown] = useState<'TIMING' | 'BIAS' | 'SPECIALS' | null>(null)
  // Multiple filters can be combined (AND'd) on BOTH desktop and mobile. READY/MISSED are
  // mutually exclusive of each other, and HEDGE/DIRECTIONAL are mutually exclusive of each
  // other (a trade can't be both a hedge and directional at once) - everything else
  // (SWEEP/GAMMA/STRUCTURAL/SPAM) can be freely combined with anything, including each other
  // and with HEDGE/DIRECTIONAL (e.g. "Directional + Sweep" or "Hedge + Gamma Attack" are valid).
  const [mobileFilters, setMobileFilters] = useState<Set<QuickFilterKey>>(new Set())
  const toggleMobileFilter = (key: QuickFilterKey) => {
    setMobileFilters((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        if (key === 'READY') next.delete('MISSED')
        if (key === 'MISSED') next.delete('READY')
        if (key === 'HEDGE') next.delete('DIRECTIONAL')
        if (key === 'DIRECTIONAL') next.delete('HEDGE')
        next.add(key)
      }
      return next
    })
  }
  // Mobile layout: card grid collapses from a 108px-left-rail layout to a single stacked
  // column, font sizes shrink, and the ladder/gauge row stacks vertically instead of
  // side-by-side, below this breakpoint.
  const [isMobileCard, setIsMobileCard] = useState(false)
  useEffect(() => {
    const check = () => setIsMobileCard(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  // Real listed options chain (real strikes/expirations/premiums from Polygon), fetched
  // on-demand per underlying ticker once a Build A Trade risk level is picked for that card -
  // no theoretical/rounded/guessed strikes, only what's actually tradable.
  const [chainData, setChainData] = useState<Record<string, Record<string, { calls: Record<string, any>; puts: Record<string, any> }>>>({})
  const chainLoadingRef = React.useRef<Set<string>>(new Set())
  const [chainLoadingTick, setChainLoadingTick] = useState(0)

  const wantedChainTickers = data ? Array.from(new Set(
    data.trades
      .filter(({ trade }) => riskLevel[generateFlowId(trade)])
      .map(({ trade }) => trade.underlying_ticker)
  )) : []

  useEffect(() => {
    wantedChainTickers.forEach((ticker) => {
      if (chainData[ticker] || chainLoadingRef.current.has(ticker)) return
      chainLoadingRef.current.add(ticker)
      setChainLoadingTick((t) => t + 1)
      fetch(`/api/options-chain?ticker=${encodeURIComponent(ticker)}`)
        .then((r) => r.json())
        .then((json) => {
          if (json?.success && json.data) {
            setChainData((prev) => ({ ...prev, [ticker]: json.data }))
          }
        })
        .catch(() => { /* silent - real chain unavailable, built trade stays hidden */ })
        .finally(() => {
          chainLoadingRef.current.delete(ticker)
          setChainLoadingTick((t) => t + 1)
        })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedChainTickers.join(',')])

  // Historical flow % breakdown - lets each card look back further than "today" (past 3
  // trading days / past week = 5 trading days) by pulling saved flow batches straight from
  // the DB (/api/flows/[date]) and re-aggregating the buy/bear call/put premium split.
  const [historicalRange, setHistoricalRange] = useState<Record<string, '3D' | '1W'>>({})
  const [historicalBreakdown, setHistoricalBreakdown] = useState<Record<string, { buyCallsPct: number; bearCallsPct: number; buyPutsPct: number; bearPutsPct: number }>>({})
  const historicalLoadingRef = React.useRef<Set<string>>(new Set())
  const [historicalLoadingTick, setHistoricalLoadingTick] = useState(0)

  const getPastTradingDays = (n: number): string[] => {
    const out: string[] = []
    const d = new Date()
    d.setDate(d.getDate() - 1) // start from yesterday - "today" is already the live scan
    while (out.length < n) {
      const dow = d.getDay()
      if (dow !== 0 && dow !== 6) out.push(d.toISOString().slice(0, 10))
      d.setDate(d.getDate() - 1)
    }
    return out
  }

  const wantedHistoricalKeys = data ? Array.from(new Set(
    data.trades
      .map(({ trade }) => ({ ticker: trade.underlying_ticker, flowId: generateFlowId(trade) }))
      .filter(({ flowId }) => historicalRange[flowId])
      .map(({ ticker, flowId }) => `${ticker}|${historicalRange[flowId]}`)
  )) : []

  useEffect(() => {
    wantedHistoricalKeys.forEach((key) => {
      if (historicalBreakdown[key] || historicalLoadingRef.current.has(key)) return
      historicalLoadingRef.current.add(key)
      setHistoricalLoadingTick((t) => t + 1)
      const [ticker, range] = key.split('|')
      const days = getPastTradingDays(range === '1W' ? 5 : 3)
      Promise.all(
        days.map((day) =>
          fetch(`/api/flows/${day}?tickers=${encodeURIComponent(ticker)}`)
            .then((r) => (r.ok ? r.json() : { data: [] }))
            .catch(() => ({ data: [] }))
        )
      ).then((results) => {
        let buyCalls = 0, bearCalls = 0, buyPuts = 0, bearPuts = 0
        for (const res of results) {
          const trades: any[] = Array.isArray(res?.data) ? res.data : []
          for (const t of trades) {
            const fs = (t.fill_style || '') as string
            const isCall = t.type === 'call'
            // Sentiment depends on BOTH call/put and buy/sell aggressor: buying calls (A/AA) =
            // bullish, selling calls (B/BB) = bearish, buying puts (A/AA) = bearish, selling
            // puts (B/BB) = bullish. Base on call/put, then flip on a sell fill.
            let isBullish = isCall
            if (fs === 'B' || fs === 'BB') isBullish = !isBullish
            const isBearish = !isBullish
            const prem = t.total_premium || 0
            if (isCall && isBullish) buyCalls += prem
            else if (isCall && isBearish) bearCalls += prem
            else if (!isCall && isBullish) buyPuts += prem
            else if (!isCall && isBearish) bearPuts += prem
          }
        }
        const total = buyCalls + bearCalls + buyPuts + bearPuts || 1
        setHistoricalBreakdown((prev) => ({
          ...prev,
          [key]: {
            buyCallsPct: (buyCalls / total) * 100,
            bearCallsPct: (bearCalls / total) * 100,
            buyPutsPct: (buyPuts / total) * 100,
            bearPutsPct: (bearPuts / total) * 100,
          },
        }))
      }).finally(() => {
        historicalLoadingRef.current.delete(key)
        setHistoricalLoadingTick((t) => t + 1)
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedHistoricalKeys.join(',')])

  // FlowBias (Spam / Structural / Gamma) - needs the RAW trade list (not just aggregated
  // percentages) for the selected TODAY/3D/1W window, so it fetches independently of the
  // percentage-only historicalBreakdown above.
  const [flowBiasRaw, setFlowBiasRaw] = useState<Record<string, Array<FlowBiasRawTrade>>>({})
  const flowBiasLoadingRef = React.useRef<Set<string>>(new Set())
  const [flowBiasLoadingTick, setFlowBiasLoadingTick] = useState(0)

  const wantedFlowBiasKeys = data ? Array.from(new Set(
    data.trades.map(({ trade }) => {
      const flowId = generateFlowId(trade)
      const range = historicalRange[flowId] || 'TODAY'
      return `${trade.underlying_ticker}|${range}`
    })
  )) : []

  useEffect(() => {
    wantedFlowBiasKeys.forEach((key) => {
      if (flowBiasRaw[key] || flowBiasLoadingRef.current.has(key)) return
      flowBiasLoadingRef.current.add(key)
      setFlowBiasLoadingTick((t) => t + 1)
      const [ticker, range] = key.split('|')
      const days = range === 'TODAY' ? [new Date().toISOString().slice(0, 10)] : getPastTradingDays(range === '1W' ? 5 : 3)
      Promise.all(
        days.map((day) =>
          fetch(`/api/flows/${day}?tickers=${encodeURIComponent(ticker)}`)
            .then((r) => (r.ok ? r.json() : { data: [] }))
            .catch(() => ({ data: [] }))
        )
      ).then(async (results) => {
        const merged: Array<FlowBiasRawTrade> = []
        for (const res of results) {
          const trades: any[] = Array.isArray(res?.data) ? res.data : []
          for (const t of trades) {
            if (t.strike && t.expiry && t.type && t.trade_timestamp) {
              merged.push({
                strike: t.strike,
                expiry: t.expiry,
                type: t.type,
                trade_timestamp: t.trade_timestamp,
                fillStyle: t.fill_style || '',
                tradeSize: t.trade_size,
                premium: t.premium_per_contract,
                totalPremium: t.total_premium,
                spot: t.spot_price,
                tradeType: t.classification || t.trade_type,
              })
            }
          }
        }
        // "Today" has no flow rows yet before/outside market hours - fall back to the most
        // recent completed trading day so the structural/spam/gamma labels still have data.
        if (range === 'TODAY' && merged.length === 0) {
          const fallbackDays = getPastTradingDays(3)
          for (const day of fallbackDays) {
            if (merged.length > 0) break
            try {
              const r = await fetch(`/api/flows/${day}?tickers=${encodeURIComponent(ticker)}`)
              const res = r.ok ? await r.json() : { data: [] }
              const trades: any[] = Array.isArray(res?.data) ? res.data : []
              for (const t of trades) {
                if (t.strike && t.expiry && t.type && t.trade_timestamp) {
                  merged.push({
                    strike: t.strike,
                    expiry: t.expiry,
                    type: t.type,
                    trade_timestamp: t.trade_timestamp,
                    fillStyle: t.fill_style || '',
                    tradeSize: t.trade_size,
                    premium: t.premium_per_contract,
                    totalPremium: t.total_premium,
                    spot: t.spot_price,
                    tradeType: t.classification || t.trade_type,
                  })
                }
              }
            } catch {
              // ignore and try next fallback day
            }
          }
        }
        setFlowBiasRaw((prev) => ({ ...prev, [key]: merged }))
      }).finally(() => {
        flowBiasLoadingRef.current.delete(key)
        setFlowBiasLoadingTick((t) => t + 1)
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedFlowBiasKeys.join(',')])

  // Next earnings date per underlying - shown under Taken/Qualified so a trade near an
  // earnings print is visible at a glance. Smart processing: fetch each calendar MONTH only
  // once (shared across every ticker that needs it, not once per ticker), scanning the current
  // month plus the next 2 months and stopping at the first match found per ticker - this keeps
  // the SweepSense scan from hammering the earnings API once per card.
  const [earningsMonthCache, setEarningsMonthCache] = useState<Record<string, Array<{ ticker: string; date: string; dayNum: number; month: number; year: number; time: string }>>>({})
  const earningsMonthLoadingRef = React.useRef<Set<string>>(new Set())
  const [earningsMonthTick, setEarningsMonthTick] = useState(0)

  const wantedEarningsMonthKeys = React.useMemo(() => {
    if (!data || data.trades.length === 0) return []
    const now = new Date()
    return Array.from({ length: 3 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
      return `${d.getFullYear()}-${d.getMonth()}`
    })
  }, [data])

  // Every trade in a DB-loaded SweepSense snapshot already carries its own baked-in
  // `nextEarningsDate` (computed once, at save-time) - skip the live earnings-calendar
  // fetch entirely in that case instead of re-scanning 3 months of events for nothing.
  const allTradesHaveSavedEarnings = !data || data.trades.every((t) => t.nextEarningsDate !== undefined)

  useEffect(() => {
    if (allTradesHaveSavedEarnings) {
      return
    }
    wantedEarningsMonthKeys.forEach((key) => {
      if (earningsMonthCache[key] || earningsMonthLoadingRef.current.has(key)) return
      earningsMonthLoadingRef.current.add(key)
      setEarningsMonthTick((t) => t + 1)
      const [yearStr, monthStr] = key.split('-')
      fetch(`/api/earnings-calendar?year=${yearStr}&month=${monthStr}`)
        .then((r) => (r.ok ? r.json() : { success: false, events: [] }))
        .then((json) => {
          const rows = Array.isArray(json?.events)
            ? json.events
              .map((ev: any) => {
                const m = ev.event?.match(/\(([A-Z]{1,5})\)/)
                if (!m) return null
                return { ticker: m[1], date: ev.date, dayNum: ev.dayNum, month: ev.month, year: ev.year, time: ev.time }
              })
              .filter((r: any): r is NonNullable<typeof r> => r !== null)
            : []
          setEarningsMonthCache((prev) => ({ ...prev, [key]: rows }))
        })
        .catch((err) => {
          setEarningsMonthCache((prev) => ({ ...prev, [key]: [] }))
        })
        .finally(() => {
          earningsMonthLoadingRef.current.delete(key)
          setEarningsMonthTick((t) => t + 1)
        })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedEarningsMonthKeys.join(',')])

  // For each underlying, pick the nearest upcoming earnings date (today or later) across the
  // 3 cached months; null once all 3 months are loaded and nothing upcoming was found.
  const earningsByTicker = React.useMemo(() => {
    const result: Record<string, { label: string; timing: string; daysAway: number; year: number; month: number; dayNum: number } | null> = {}
    if (!data) return result
    const monthsReady = wantedEarningsMonthKeys.every((key) => earningsMonthCache[key])
    if (!monthsReady) return result
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const tickers = Array.from(new Set(data.trades.map(({ trade }) => trade.underlying_ticker)))
    for (const ticker of tickers) {
      let best: { label: string; timing: string; daysAway: number; year: number; month: number; dayNum: number } | null = null
      for (const key of wantedEarningsMonthKeys) {
        for (const row of earningsMonthCache[key] || []) {
          if (row.ticker !== ticker) continue
          const evDate = new Date(row.year, row.month, row.dayNum)
          const daysAway = Math.round((evDate.getTime() - today.getTime()) / 86400000)
          if (daysAway < 0) continue
          if (!best || daysAway < best.daysAway) {
            best = { label: row.date, timing: row.time, daysAway, year: row.year, month: row.month, dayNum: row.dayNum }
          }
        }
      }
      result[ticker] = best
    }
    return result
  }, [data, earningsMonthCache, wantedEarningsMonthKeys])

  // Implied earnings move % - identical math to the Calendar tab's "Implied Move" (NewsPanelV2
  // fetchImpliedMove): average ATM (within 5% of spot) IV across the weekly-options expiry
  // (Friday of the earnings week, falling back to the next available expiry), solved into
  // theoretical 80%-probability call/put strikes via Black-Scholes, snapped to the nearest real
  // listed strike, then expressed as a single one-sided % move = (call80 - put80) / spot / 2.
  const [impliedMoves, setImpliedMoves] = useState<Record<string, number>>({})
  const impliedMoveFetchedRef = React.useRef<Set<string>>(new Set())

  const fetchImpliedMoveForTicker = React.useCallback(async (ticker: string, earningsDate: Date) => {
    const key = `${ticker}-${earningsDate.toISOString().split('T')[0]}`
    if (impliedMoveFetchedRef.current.has(key)) return
    impliedMoveFetchedRef.current.add(key)
    try {
      // Friday of the earnings week (weekly options expiry)
      const base = new Date(earningsDate)
      const baseDay = base.getDay()
      const fridayOffset = baseDay === 0 ? 5 : 5 - baseDay
      base.setDate(base.getDate() + (fridayOffset < 0 ? fridayOffset + 7 : fridayOffset))
      const fridayStr = base.toISOString().split('T')[0]

      const priceRes = await fetch(`/api/polygon/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apikey=${POLYGON_API_KEY}`)
      if (!priceRes.ok) return
      const priceData = await priceRes.json()
      const stockPrice: number = priceData?.ticker?.lastTrade?.p || priceData?.ticker?.day?.c || priceData?.ticker?.prevDay?.c
      if (!stockPrice || stockPrice <= 0) return

      const contractsRes = await fetch(`/api/polygon/v3/reference/options/contracts?underlying_ticker=${ticker}&expiration_date=${fridayStr}&limit=500&apikey=${POLYGON_API_KEY}`)
      if (!contractsRes.ok) return
      const contractsData = await contractsRes.json()
      const results: any[] = contractsData?.results ?? []

      let usedExpiry = fridayStr
      if (results.length === 0) {
        const refRes = await fetch(`/api/polygon/v3/reference/options/contracts?underlying_ticker=${ticker}&expiration_date.gte=${fridayStr}&limit=50&apikey=${POLYGON_API_KEY}`)
        if (!refRes.ok) return
        const refData = await refRes.json()
        if (!refData?.results?.length) return
        usedExpiry = refData.results[0].expiration_date
        const fallbackRes = await fetch(`/api/polygon/v3/reference/options/contracts?underlying_ticker=${ticker}&expiration_date=${usedExpiry}&limit=500&apikey=${POLYGON_API_KEY}`)
        if (!fallbackRes.ok) return
        const fallbackData = await fallbackRes.json()
        if (!fallbackData?.results?.length) return
        results.push(...fallbackData.results)
      }

      const callOptions: any[] = results.filter((c: any) => c.contract_type === 'call')
      const putOptions: any[] = results.filter((c: any) => c.contract_type === 'put')
      const allStrikes: number[] = [...new Set([...callOptions, ...putOptions].map((o: any) => o.strike_price as number))].sort((a, b) => a - b)

      const atmOptions: any[] = [...callOptions, ...putOptions].filter((opt: any) => {
        const pctDiff = Math.abs((opt.strike_price - stockPrice) / stockPrice)
        return pctDiff < 0.05
      })
      if (atmOptions.length === 0) return

      const IV_BATCH = 5
      const ivMap: Record<string, number> = {}
      for (let i = 0; i < atmOptions.length; i += IV_BATCH) {
        const batch = atmOptions.slice(i, i + IV_BATCH)
        await Promise.all(batch.map(async (opt: any) => {
          try {
            const snap = await fetch(`/api/polygon/v3/snapshot/options/${ticker}/${opt.ticker}?apikey=${POLYGON_API_KEY}`)
            const snapData = await snap.json()
            ivMap[opt.ticker] = snapData?.results?.implied_volatility ?? 0
          } catch {
            ivMap[opt.ticker] = 0
          }
        }))
        if (i + IV_BATCH < atmOptions.length) await new Promise((r) => setTimeout(r, 200))
      }

      const validIVs = atmOptions.map((o: any) => ivMap[o.ticker] ?? 0).filter((iv) => iv > 0)
      if (validIVs.length === 0) return
      const avgIV = validIVs.reduce((s: number, v: number) => s + v, 0) / validIVs.length
      if (avgIV < 0.01 || avgIV > 5) return

      const [eY, eM, eD] = usedExpiry.split('-').map(Number)
      const expiryDate = new Date(eY, eM - 1, eD)
      const now = new Date()
      const daysToExpiry = Math.max(1, Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
      const T = daysToExpiry / 365
      const r = 0.0387

      const call80Theoretical = bsStrikeForProbFTP(stockPrice, avgIV, daysToExpiry, 80, true)
      const put80Theoretical = bsStrikeForProbFTP(stockPrice, avgIV, daysToExpiry, 80, false)
      if (call80Theoretical === null || put80Theoretical === null) return

      const findClosestStrike = (theoretical: number) =>
        allStrikes.reduce((prev, curr) => (Math.abs(curr - theoretical) < Math.abs(prev - theoretical) ? curr : prev), allStrikes[0])

      const call80 = findClosestStrike(call80Theoretical)
      const put80 = findClosestStrike(put80Theoretical)
      const pct = ((call80 - put80) / stockPrice) * 100 / 2

      setImpliedMoves((prev) => ({ ...prev, [ticker]: pct }))
    } catch {
      // silent fail - card just shows the earnings date with no implied move %
    }
  }, [])

  useEffect(() => {
    Object.entries(earningsByTicker).forEach(([ticker, info]) => {
      if (!info) return
      const earningsDateObj = new Date(info.year, info.month, info.dayNum)
      fetchImpliedMoveForTicker(ticker, earningsDateObj)
    })
  }, [earningsByTicker, fetchImpliedMoveForTicker])

  const progressPct = progress && progress.total > 0
    ? Math.max(0, Math.min(100, Math.round((progress.current / progress.total) * 100)))
    : null

  // The top quick-filter row (Ready 4 Pickup / He Missed / Hedge / Directional / Sweep /
  // Gamma Attack / Structural / Spam) reads Gamma Attack/Structural/Spam labels which depend
  // on flowBiasRaw having finished fetching for every ticker currently in view. Keep the row
  // grayed out and unclickable until the scan itself is done AND all of that per-ticker
  // flow-bias data (plus the earnings-date lookups) has actually loaded in, so the buttons
  // never filter against half-loaded data.
  const allFlowBiasLoaded = wantedFlowBiasKeys.length === 0 || wantedFlowBiasKeys.every((key) => !!flowBiasRaw[key])
  const allEarningsLoaded = allTradesHaveSavedEarnings ||
    wantedEarningsMonthKeys.length === 0 || wantedEarningsMonthKeys.every((key) => !!earningsMonthCache[key])
  const quickFiltersReady = !isScanning && allFlowBiasLoaded && allEarningsLoaded

  if (isScanning) {
    return (
      <div style={{
        flex: 1, position: 'relative', overflow: 'hidden',
        background: '#000',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '28px',
      }}>
        <style>{`
          @keyframes ssSpinGlow {
            0%, 100% { box-shadow: 0 0 14px rgba(168,255,62,0.5); }
            50% { box-shadow: 0 0 28px rgba(168,255,62,0.85); }
          }
          @keyframes ssTitlePulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.78; }
          }
        `}</style>
        {/* Weather-particle canvas background - rain/snow/storm cycling every 14s */}
        <canvas
          ref={(el) => setWeatherCanvas(el)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', zIndex: 0 }}
        />
        <div style={{
          position: 'absolute', inset: 0, zIndex: 0,
          background: 'radial-gradient(ellipse at 50% 40%, rgba(0,12,4,0.55) 0%, rgba(0,0,0,0.75) 70%)',
        }} />

        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '28px' }}>
          <div style={{
            color: '#a8ff3e', fontWeight: 900, fontSize: '22px', letterSpacing: '3px', textAlign: 'center',
            animation: 'ssTitlePulse 2.5s ease-in-out infinite', textShadow: '0 0 24px rgba(168,255,62,0.35)',
          }}>
            SWEEPSENSE
          </div>
          <div style={{ position: 'relative', width: '96px', height: '96px' }}>
            <div style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              border: '6px solid rgba(168,255,62,0.08)', borderTopColor: '#a8ff3e',
              animation: 'spin 0.85s linear infinite, ssSpinGlow 1.7s ease-in-out infinite',
            }} />
            <div style={{
              position: 'absolute', inset: '14px', borderRadius: '50%',
              border: '5px solid rgba(100,220,20,0.08)', borderTopColor: '#6dcc00',
              animation: 'spin 1.3s linear infinite reverse',
            }} />
          </div>
          <div style={{ width: '260px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{
              width: '100%', height: '10px', borderRadius: '6px', overflow: 'hidden',
              background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(168,255,62,0.25)',
            }}>
              <div style={{
                height: '100%',
                width: `${progressPct ?? 0}%`,
                background: 'linear-gradient(90deg, #6dcc00 0%, #a8ff3e 100%)',
                transition: 'width 0.3s ease',
                boxShadow: progressPct && progressPct > 0 ? '0 0 10px rgba(168,255,62,0.7)' : 'none',
              }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#a8ff3e', fontWeight: 800, fontSize: '13px', letterSpacing: '0.5px' }}>
                {progressPct !== null ? `${progressPct}%` : 'INITIALIZING...'}
              </span>
              {progress && progress.total > 0 && (
                <span style={{ color: '#6dcc00', fontWeight: 600, fontSize: '11px' }}>
                  {progress.current.toLocaleString()} / {progress.total.toLocaleString()} contracts
                </span>
              )}
            </div>
          </div>

          {/* Rotating quote card */}
          <div style={{
            maxWidth: 'min(560px, 88vw)', textAlign: 'center',
            padding: '18px 26px',
            borderRadius: '14px',
            border: '1px solid rgba(168,255,62,0.18)',
            background: 'linear-gradient(160deg, rgba(168,255,62,0.06) 0%, rgba(100,220,20,0.02) 55%, rgba(0,0,0,0.35) 100%)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.4), 0 16px 50px rgba(0,0,0,0.6)',
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', top: 0, left: '10%', right: '10%', height: '1px', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.14), transparent)' }} />
            <div style={{ fontSize: '28px', fontStyle: 'italic', color: '#f3f4f6', lineHeight: 1.6, fontWeight: 400 }}>
              &ldquo;{SS_LOADING_QUOTES[loadingQuoteIndex % SS_LOADING_QUOTES.length].text}&rdquo;
            </div>
            <div style={{ fontSize: '24px', color: '#a8ff3e', fontWeight: 700, marginTop: '12px', letterSpacing: '0.5px' }}>
              - {SS_LOADING_QUOTES[loadingQuoteIndex % SS_LOADING_QUOTES.length].author}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!data || data.trades.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '10px', padding: '40px' }}>
        <span style={{ fontSize: '40px' }}>⚡</span>
        <span style={{ color: '#22ff9c', fontWeight: 900, fontSize: '16px', letterSpacing: '1px' }}>NO FLOWS YET</span>
        <span style={{ color: '#666', fontSize: '12px', textAlign: 'center' }}>
          Click the SweepSense button in the table toolbar to scan for short-term + long-term qualifying flows.
        </span>
      </div>
    )
  }

  const { trades } = data

  // "Ready 4 Pickup" - not just "does a plan exist", but "has price actually reached the
  // magnet/pivot entry trigger yet". A plan telling you to "wait for price to approach down
  // to $X and buy there" (or run up / break above / break below) is NOT ready until the live
  // stock price has actually gotten there - only plans that are immediately actionable right
  // now ("you can enter and trade toward $X as your target") count as ready without a gate.
  const isReadyForPickup = (item: (typeof trades)[number]) => {
    const { planText, currentStockPrice, spot, trade } = item
    const noPlan = planText === 'No Plan detected.' || planText === 'Waiting on dealer magnet/pivot data to build an entry plan.'
    if (noPlan) return false
    const livePrice = currentStockPrice && currentStockPrice > 0 ? currentStockPrice : (spot && spot > 0 ? spot : trade.spot_price)
    const dollarMatch = planText.match(/\$([0-9]+(?:\.[0-9]+)?)/)
    const level = dollarMatch ? parseFloat(dollarMatch[1]) : null
    if (level === null || !livePrice || livePrice <= 0) return true
    if (planText.includes('approach down to')) return livePrice <= level
    if (planText.includes('run up to approach')) return livePrice >= level
    if (planText.includes('break above')) return livePrice > level
    if (planText.includes('break below')) return livePrice < level
    return true
  }

  // "He Missed" - stock moved against the implied trade direction (bought calls/sold puts
  // implies bullish, sold calls/bought puts implies bearish); returns the magnitude of the
  // wrong-direction move, or null if the move actually went the right way / is unknown.
  const missedMagnitude = (item: (typeof trades)[number]): number | null => {
    const { trade, pctMove } = item
    if (pctMove === null || pctMove === undefined) return null
    const fs = trade.fill_style || ''
    let impliedBullish = trade.type === 'call'
    if (fs === 'B' || fs === 'BB') impliedBullish = !impliedBullish
    const wentWrongWay = impliedBullish ? pctMove < 0 : pctMove > 0
    return wentWrongWay ? Math.abs(pctMove) : null
  }

  // Hedge vs Directional - based on where the strike sits relative to the probability-of-profit
  // level. Bought (A/AA) contracts: POP > 90% = Hedge (deep ITM/stock-replacement), POP <= 90%
  // = Directional. Sold (B/BB) contracts use the inverted 80% threshold per spec: POP > 80% =
  // Directional, POP <= 80% = Hedge. MULTI-LEG trades are excluded entirely.
  const classifyHedgeDirectional = (item: (typeof trades)[number]): 'HEDGE' | 'DIRECTIONAL' | null => {
    const { trade, sigma, dte, spot } = item
    if (trade.trade_type === 'MULTI-LEG' || trade.classification === 'MULTI-LEG') return null
    const fs = trade.fill_style || ''
    const isBuy = fs === 'A' || fs === 'AA'
    const isSell = fs === 'B' || fs === 'BB'
    if (!isBuy && !isSell) return null
    const effSpot = spot && spot > 0 ? spot : trade.spot_price
    const effSigma = sigma && sigma > 0 ? sigma : (trade.implied_volatility || 0)
    const effDte = dte && dte > 0 ? dte : trade.days_to_expiry
    if (!effSpot || effSpot <= 0 || !effSigma || effSigma <= 0 || !effDte || effDte <= 0) return null
    const pop = popForStrike(effSpot, trade.strike, effSigma, effDte, trade.type === 'call')
    if (pop === null) return null
    if (isSell) return pop > 80 ? 'DIRECTIONAL' : 'HEDGE'
    return pop > 90 ? 'HEDGE' : 'DIRECTIONAL'
  }

  // Sweep - same classification convention used by the trade-type badges below.
  const tradeTypeOf = (item: (typeof trades)[number]) => item.trade.classification || item.trade.trade_type
  const isSweepTrade = (item: (typeof trades)[number]) => {
    const v = tradeTypeOf(item)
    return v === 'SWEEP' || v === 'SUPER SWEEP'
  }

  // Gamma Attack / Structural / Spam - reruns the exact same detection functions used by the
  // FlowBias rows further down in the card, so "active" here means the card itself is currently
  // showing a real (non-"No X Detected"/"Loading") label for that row.
  const computeBiasFlags = (item: (typeof trades)[number]) => {
    const { trade, sigma, dte, spot, liveRawTrades } = item
    const isLongTerm = trade.days_to_expiry >= 30
    const { targetUp, target1, target2 } = calcTradeManagement(trade, sigma, dte, spot)
    const flowId = generateFlowId(trade)
    const histRange = historicalRange[flowId]
    const flowBiasKey = `${trade.underlying_ticker}|${histRange || 'TODAY'}`
    const flowBiasTrades = flowBiasRaw[flowBiasKey]
    const flowBiasReady = !!flowBiasTrades
    const spamResult = flowBiasReady
      ? computeSpamLabel(flowBiasTrades!, trade.type, formatDate, spot, sigma)
      : { label: 'Loading…', trades: [], level: null }
    const structuralResult = computeStructuralLabel(liveRawTrades, spot, sigma)
    const gammaResult = flowBiasReady
      ? computeGammaLabel(flowBiasTrades!, trade.type, target1, target2, targetUp, isLongTerm, trade.expiry, spot)
      : { label: 'Loading…', trades: [] }
    return {
      spamActive: spamResult.label !== 'No Spammer Detected' && spamResult.label !== 'Loading…',
      structuralActive: structuralResult.label !== 'No Structural Formation Detected',
      gammaActive: gammaResult.label !== 'No Gamma Attack' && gammaResult.label !== 'Loading…',
    }
  }

  // Filters are combinable (AND'd) on both mobile and desktop now - same Set + rules apply
  // to both layouts, so "Directional + Sweep", "Hedge + Gamma Attack", etc. all work as long
  // as they aren't mutually-contradictory (HEDGE vs DIRECTIONAL, READY vs MISSED).
  let filteredTrades = trades
  if (mobileFilters.has('READY')) filteredTrades = filteredTrades.filter(isReadyForPickup)
  if (mobileFilters.has('MISSED')) {
    filteredTrades = filteredTrades
      .map((t) => ({ t, mag: missedMagnitude(t) }))
      .filter((x): x is { t: (typeof trades)[number]; mag: number } => x.mag !== null)
      .sort((a, b) => b.mag - a.mag)
      .map((x) => x.t)
  }
  if (mobileFilters.has('HEDGE')) filteredTrades = filteredTrades.filter((t) => classifyHedgeDirectional(t) === 'HEDGE')
  if (mobileFilters.has('DIRECTIONAL')) filteredTrades = filteredTrades.filter((t) => classifyHedgeDirectional(t) === 'DIRECTIONAL')
  if (mobileFilters.has('SWEEP')) filteredTrades = filteredTrades.filter(isSweepTrade)
  if (mobileFilters.has('GAMMA')) filteredTrades = filteredTrades.filter((t) => computeBiasFlags(t).gammaActive)
  if (mobileFilters.has('STRUCTURAL')) filteredTrades = filteredTrades.filter((t) => computeBiasFlags(t).structuralActive)
  if (mobileFilters.has('SPAM')) filteredTrades = filteredTrades.filter((t) => computeBiasFlags(t).spamActive)

  const quickFilterButtons: Array<{ key: QuickFilterKey; label: string; icon: 'ready' | 'missed' | 'hedge' | 'directional' | 'sweep' | 'gamma' | 'structural' | 'spam' }> = [
    { key: 'READY', label: 'Ready 4 Pickup', icon: 'ready' },
    { key: 'MISSED', label: 'He Missed', icon: 'missed' },
    { key: 'HEDGE', label: 'Hedge', icon: 'hedge' },
    { key: 'DIRECTIONAL', label: 'Directional', icon: 'directional' },
    { key: 'SWEEP', label: 'Sweep', icon: 'sweep' },
    { key: 'GAMMA', label: 'Gamma Attack', icon: 'gamma' },
    { key: 'STRUCTURAL', label: 'Structural', icon: 'structural' },
    { key: 'SPAM', label: 'Spam', icon: 'spam' },
  ]

  const ORANGE = '#ff8c1a'

  return (
    <div className="custom-scrollbar" style={{
      flex: 1, overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch',
      // Extra bottom padding on mobile so the last card can scroll clear of the fixed
      // MobileBottomNav bar (60px tall, sits at the very top z-index over everything,
      // including this full-screen panel) instead of being cut off/hidden behind it.
      padding: isMobileCard ? '0 14px calc(60px + env(safe-area-inset-bottom) + 24px)' : '0 14px 14px',
      display: 'flex', flexDirection: 'column', gap: '16px', background: '#000',
    }}>
      <style>{`
        @keyframes qfSweepDrift { 0%, 100% { transform: translateX(-2px); opacity: 0.65; } 50% { transform: translateX(2px); opacity: 1; } }
        @keyframes qfPulseScale { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.16); } }
        @keyframes qfSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes qfBolt { 0%, 100% { opacity: 1; filter: drop-shadow(0 0 0px currentColor); } 45% { opacity: 0.55; } 50% { opacity: 1; filter: drop-shadow(0 0 4px currentColor); } 55% { opacity: 0.55; } }
        @keyframes qfShieldGlow { 0%, 100% { filter: drop-shadow(0 0 0px currentColor); } 50% { filter: drop-shadow(0 0 3px currentColor); } }
        @keyframes qfStack { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-1.5px); } }
        @keyframes qfCheckDraw { 0% { stroke-dashoffset: 16; } 60%, 100% { stroke-dashoffset: 0; } }
        @keyframes qfMissedShake { 0%, 100% { transform: translateX(0); } 20% { transform: translateX(-2px); } 40% { transform: translateX(2px); } 60% { transform: translateX(-1.5px); } 80% { transform: translateX(1.5px); } }
      `}</style>
      <div style={{ position: 'sticky', top: 0, zIndex: 30, flexShrink: 0, background: '#000', paddingTop: '14px', marginTop: '-14px' }}>
        <div
          style={{
            display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center',
            padding: '12px 16px',
            borderRadius: '16px',
            background: 'linear-gradient(155deg, #060a16 0%, #040610 38%, #180b02 72%, #1f0e02 100%)',
            border: '1px solid rgba(255,140,26,0.28)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -3px 6px rgba(0,0,0,0.7), 0 10px 26px rgba(0,0,0,0.6), 0 0 26px -10px rgba(255,120,0,0.35)',
            position: 'relative',
          }}
        >
          <div style={{ position: 'absolute', top: 0, left: '4%', right: '4%', height: '1px', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent)' }} />
          {!quickFiltersReady && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 50, borderRadius: '16px',
              background: 'rgba(0,0,0,0.55)', cursor: 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '11px', fontWeight: 800, letterSpacing: '0.5px', color: '#888',
            }}>
              LOADING SWEEPSENSE DATA…
            </div>
          )}
          {isMobileCard ? (
            [
              { key: 'TIMING' as const, label: 'Timing', items: quickFilterButtons.filter((b) => b.key === 'READY' || b.key === 'MISSED') },
              { key: 'BIAS' as const, label: 'Bias', items: quickFilterButtons.filter((b) => b.key === 'HEDGE' || b.key === 'DIRECTIONAL' || b.key === 'SWEEP') },
              { key: 'SPECIALS' as const, label: 'Specials', items: quickFilterButtons.filter((b) => b.key === 'GAMMA' || b.key === 'STRUCTURAL' || b.key === 'SPAM') },
            ].map((group) => {
              const groupActive = group.items.some((b) => mobileFilters.has(b.key))
              const isOpen = openFilterDropdown === group.key
              return (
                <div key={group.key} style={{ position: 'relative', flex: '1 1 0', minWidth: 0 }}>
                  <button
                    disabled={!quickFiltersReady}
                    onClick={() => quickFiltersReady && setOpenFilterDropdown(isOpen ? null : group.key)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                      width: '100%',
                      padding: '8px 8px',
                      borderRadius: '9999px',
                      fontSize: '12px',
                      fontWeight: 800,
                      letterSpacing: '0.3px',
                      cursor: quickFiltersReady ? 'pointer' : 'not-allowed',
                      opacity: quickFiltersReady ? 1 : 0.4,
                      background: 'linear-gradient(180deg, #1c1c1c 0%, #000000 55%, #0e0e0e 100%)',
                      border: groupActive ? `1px solid ${ORANGE}` : '1px solid rgba(255,255,255,0.16)',
                      color: groupActive ? ORANGE : '#ffffff',
                      boxShadow: groupActive
                        ? `inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -1px 0 rgba(0,0,0,0.85), 0 0 14px -2px ${ORANGE}99`
                        : 'inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(0,0,0,0.85)',
                      transition: 'all 0.15s ease',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {group.label}
                    <span style={{ fontSize: '9px', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }}>▼</span>
                  </button>
                  {isOpen && (
                    <div style={{
                      position: 'absolute', top: 'calc(100% + 6px)', ...(group.key === 'SPECIALS' ? { right: 0 } : { left: 0 }), zIndex: 40,
                      width: 'max-content', minWidth: '100%', maxWidth: '220px',
                      display: 'flex', flexDirection: 'column', gap: '6px',
                      padding: '8px',
                      borderRadius: '12px',
                      background: 'linear-gradient(155deg, #0a0e1a 0%, #050710 55%, #1a0d02 100%)',
                      border: '1px solid rgba(255,140,26,0.35)',
                      boxShadow: '0 10px 26px rgba(0,0,0,0.7)',
                    }}>
                      {group.items.map(({ key, label }) => {
                        const active = mobileFilters.has(key)
                        return (
                          <button
                            key={key}
                            onClick={() => toggleMobileFilter(key)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '9px',
                              padding: '8px 12px',
                              borderRadius: '8px',
                              fontSize: '12.5px',
                              fontWeight: 800,
                              letterSpacing: '0.3px',
                              whiteSpace: 'nowrap',
                              cursor: 'pointer',
                              background: 'linear-gradient(180deg, #1c1c1c 0%, #000000 55%, #0e0e0e 100%)',
                              border: active ? `1px solid ${ORANGE}` : '1px solid rgba(255,255,255,0.16)',
                              color: active ? ORANGE : '#ffffff',
                              boxShadow: active
                                ? `inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -1px 0 rgba(0,0,0,0.85), 0 0 14px -2px ${ORANGE}99`
                                : 'inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(0,0,0,0.85)',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            <span style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                              width: '15px', height: '15px', borderRadius: '4px',
                              border: `1.5px solid ${active ? ORANGE : 'rgba(255,255,255,0.4)'}`,
                              background: active ? ORANGE : 'transparent',
                            }}>
                              {active && (
                                <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="#000000" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M4 12l5 5L20 6" />
                                </svg>
                              )}
                            </span>
                            {label}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })
          ) : (
            quickFilterButtons.map(({ key, label, icon }) => {
              const active = mobileFilters.has(key)
              return (
                <button
                  key={key}
                  disabled={!quickFiltersReady}
                  onClick={() => quickFiltersReady && toggleMobileFilter(key)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '7px',
                    padding: '8px 16px',
                    borderRadius: '9999px',
                    fontSize: '13.75px',
                    fontWeight: 800,
                    letterSpacing: '0.4px',
                    cursor: quickFiltersReady ? 'pointer' : 'not-allowed',
                    opacity: quickFiltersReady ? 1 : 0.4,
                    background: 'linear-gradient(180deg, #1c1c1c 0%, #000000 55%, #0e0e0e 100%)',
                    border: active ? `1px solid ${ORANGE}` : '1px solid rgba(255,255,255,0.16)',
                    color: active ? ORANGE : '#ffffff',
                    boxShadow: active
                      ? `inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -1px 0 rgba(0,0,0,0.85), 0 0 14px -2px ${ORANGE}99`
                      : 'inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(0,0,0,0.85)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <QuickFilterIcon icon={icon} color={active ? ORANGE : '#ffffff'} />
                  {label}
                </button>
              )
            })
          )}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {filteredTrades.map(({ trade, convictionScore, pctMove, currentStockPrice, currentOptionPrice, contractPctChange, sigCode, sigColor, planText, qualifiedAt, breakdown, sigma, dte, spot, liveRawTrades, otherLegs, flowSpamLabel: savedSpamLabel, gammaAttackLabel: savedGammaLabel, structuralLabel: savedStructuralLabel, nextEarningsDate: savedEarningsDate }) => {
          const isCall = trade.type === 'call'
          const isLongTerm = trade.days_to_expiry >= 30
          const fs = trade.fill_style || ''
          const tradeTypeVal = trade.classification || trade.trade_type
          // Prefer the saved, baked-in earnings date from the DB snapshot (instant, no live
          // fetch needed) - only fall back to the live earningsByTicker lookup (which has
          // richer daysAway/timing info) when the trade doesn't carry one yet.
          const liveEarningsInfo = earningsByTicker[trade.underlying_ticker]
          const earningsInfo = liveEarningsInfo ?? (savedEarningsDate ? (() => {
            const d = new Date(savedEarningsDate)
            const today = new Date(); today.setHours(0, 0, 0, 0)
            const daysAway = Math.round((d.getTime() - today.getTime()) / 86400000)
            return { label: savedEarningsDate, timing: '', daysAway, year: d.getFullYear(), month: d.getMonth(), dayNum: d.getDate() }
          })() : null)
          // Red/urgent inside 7 days (earnings risk on the position), amber inside 21 days,
          // otherwise a neutral gray - keeps the label calm unless a print is actually close.
          const earningsColor = !earningsInfo ? '#666' : earningsInfo.daysAway <= 7 ? '#ef4444' : earningsInfo.daysAway <= 21 ? '#eab308' : '#9ca3af'
          const earningsMovePct = earningsInfo ? impliedMoves[trade.underlying_ticker] : undefined
          const earningsText = earningsInfo
            ? `${earningsInfo.label}${earningsMovePct !== undefined ? ` ${Math.round(Math.abs(earningsMovePct))}%` : ''}`
            : '--'
          const isSweepBadge = tradeTypeVal === 'SWEEP'
          const isBlockBadge = tradeTypeVal === 'BLOCK'
          const hasPlan = planText !== 'No Plan detected.' && planText !== 'Waiting on dealer magnet/pivot data to build an entry plan.'

          // Conviction bracket - drives the gauge ring, stars, and card accent color.
          const convColor = convictionScore >= 80 ? '#22c55e' : convictionScore >= 60 ? '#eab308' : '#ef4444'
          const filledStars = Math.max(1, Math.min(5, Math.round(convictionScore / 20)))
          const ringCircumference = 2 * Math.PI * 34
          const ringOffset = ringCircumference * (1 - convictionScore / 100)

          const moveColor = contractPctChange === null ? '#fff' : contractPctChange >= 0 ? '#22c55e' : '#ef4444'
          const flowBiasScore = (breakdown.buyCallsPct + breakdown.buyPutsPct - breakdown.bearCallsPct - breakdown.bearPutsPct) / 100
          const aiTakeText = hasPlan ? planText : (Math.abs(flowBiasScore) < 0.2
            ? 'Flow is mixed across calls and puts. Watching for a clearer directional lean before conviction builds further.'
            : flowBiasScore > 0
              ? 'Buy-side flow is dominating this name. Positioning leans bullish with institutional money backing the move.'
              : 'Sell-side/put flow is dominating this name. Positioning leans bearish or hedging-driven.')

          const flowId = generateFlowId(trade)
          const {
            targetUp, target1, target2, stopLoss,
            target1OptionPrice, target2OptionPrice, stopStockPrice,
            target1Pct, target2Pct, stopPct,
          } = calcTradeManagement(trade, sigma, dte, spot)

          // ── Build A Trade: recompute a strike/expiry/target ladder from scratch based on
          // the user's chosen risk profile. Uses the REAL listed options chain (real
          // strikes, real expirations, real last-traded/bid-ask premiums pulled from
          // /api/options-chain) - theoretical Black-Scholes math is only used to rank which
          // real, actually-listed strike/expiry best matches the target probability, never to
          // invent a price or strike that doesn't exist on the chain.
          const histRange = historicalRange[flowId]
          const histKey = histRange ? `${trade.underlying_ticker}|${histRange}` : null
          const histBreakdown = histKey ? historicalBreakdown[histKey] : null
          const histLoading = !!histRange && !histBreakdown
          const effectiveBreakdown = histBreakdown || breakdown

          const flowBiasKey = `${trade.underlying_ticker}|${histRange || 'TODAY'}`
          const flowBiasTrades = flowBiasRaw[flowBiasKey]
          const flowBiasReady = !!flowBiasTrades
          // Prefer the label already computed + persisted by the parent (OptionsFlowTable's
          // sweepSenseData memo / saved DB snapshot) so the card never gets stuck on
          // "Loading…" waiting on this component's own separate flowBiasRaw fetch, and so
          // what's displayed always matches exactly what got saved to the DB.
          // NOTE: the saved/DB label is only ever text - it never persisted the matched raw
          // trades or strike level, so once the live flowBiasRaw/liveRawTrades data is actually
          // available we ALWAYS prefer the freshly-computed live result (real trades + level)
          // even if a saved label exists, so the row stays clickable (popup needs trades.length
          // > 0) and the chart's Spam/Structural/Gamma lines get a real strike instead of null.
          // The saved label is only used as an immediate-paint placeholder before the live data
          // has loaded.
          const spamResult = flowBiasReady
            ? computeSpamLabel(flowBiasTrades!, trade.type, formatDate, spot, sigma)
            : (savedSpamLabel
              ? { label: savedSpamLabel, trades: [] as Array<FlowBiasRawTrade>, level: null as number | null }
              : { label: 'Loading…', trades: [], level: null })
          // Flow Spammer uniqueness heatmap scoring - only computed once a spam group is actually detected.
          const spamUniqueness = (flowBiasReady && spamResult.trades.length > 0)
            ? computeSpamUniquenessScore(spamResult.trades, flowBiasTrades!, spot, sigma, dte, trade.type)
            : undefined
          // Structural support = puts SOLD (B/BB) at/below spot (a real floor); resistance = calls
          // SOLD (B/BB) at/above spot (a real overhead wall). Uses the SAME live in-memory flow feed
          // the quadrant boxes/gauge use (liveRawTrades) - no extra DB round-trip needed.
          const structuralResult = (liveRawTrades && liveRawTrades.length > 0)
            ? computeStructuralLabel(liveRawTrades, spot, sigma)
            : (savedStructuralLabel
              ? { label: savedStructuralLabel, trades: [] as Array<FlowBiasRawTrade>, level: null as number | null, putLevel: null as number | null, isResistance: true }
              : computeStructuralLabel(liveRawTrades, spot, sigma))
          const gammaResult = flowBiasReady
            ? computeGammaLabel(flowBiasTrades!, trade.type, target1, target2, targetUp, isLongTerm, trade.expiry, spot)
            : (savedGammaLabel
              ? { label: savedGammaLabel, trades: [] as Array<FlowBiasRawTrade> }
              : { label: 'Loading…', trades: [] })
          const spamLabel = spamResult.label
          const structuralLabel = structuralResult.label
          const gammaLabel = gammaResult.label

          // No default risk profile - the built-trade box/ladder only appears once the user
          // explicitly clicks PROBABILITY / ON A ROLE / LUCKY for this card.
          const risk = riskLevel[flowId]
          const baseDte = Math.max(1, Math.round(dte ?? trade.days_to_expiry))
          const baseSigma = sigma && sigma > 0 ? sigma : (trade.implied_volatility || 0)
          const baseSpot = spot && spot > 0 ? spot : trade.spot_price
          const isSoldToOpen = fs === 'B' || fs === 'BB'
          const tickerChain = chainData[trade.underlying_ticker]
          const chainStillLoading = !!risk && !tickerChain
          let builtTrade: {
            strike: number; dte: number; premium: number; expiryDate: string
            t1Strike: number | null; t2Strike: number | null
            t1Opt: number | null; t2Opt: number | null
            t1Pct: number | null; t2Pct: number | null
            stopStrike: number | null; stopOpt: number | null; stopPct: number | null
            ivPct: number | null; bePct: number | null
          } | null = null

          // Find the real listed contract (from the fetched chain) whose strike is closest to
          // a theoretical target strike, within a specific real expiration date.
          const findRealContract = (expiry: string, targetStrike: number): { strike: number; premium: number } | null => {
            const side = tickerChain?.[expiry]?.[isCall ? 'calls' : 'puts']
            if (!side) return null
            let best: { strike: number; premium: number } | null = null
            let bestDiff = Infinity
            for (const strikeKey of Object.keys(side)) {
              const strikeNum = parseFloat(strikeKey)
              const diff = Math.abs(strikeNum - targetStrike)
              if (diff < bestDiff) {
                const c = side[strikeKey]
                const premium = c.last_price > 0 ? c.last_price : (c.bid + c.ask) / 2
                if (premium > 0) { bestDiff = diff; best = { strike: strikeNum, premium } }
              }
            }
            return best
          }

          if (risk && baseSigma > 0 && tickerChain) {
            let builtDte = baseDte
            let strikeProb = 75
            let t1Prob = 80, t2Prob = 90
            let noStop = false
            if (risk === 'PROB') {
              builtDte = Math.round(isLongTerm ? baseDte * 1.5 : baseDte * 2)
              strikeProb = 72.5
            } else if (risk === 'ONAROLE') {
              builtDte = baseDte
              strikeProb = 78
              t1Prob = 75; t2Prob = 85
            } else if (risk === 'LUCKY') {
              builtDte = isLongTerm ? Math.round(baseDte * 0.625) : baseDte
              strikeProb = 82.5
              t1Prob = 85; t2Prob = 95
              noStop = true
            }

            // Pick the real listed expiration date closest to the target DTE.
            const targetExpiryMs = Date.now() + builtDte * 86400000
            const realExpiries = Object.keys(tickerChain)
            let expiryDate: string | null = null
            let bestExpDiff = Infinity
            for (const exp of realExpiries) {
              const diff = Math.abs(new Date(exp + 'T00:00:00Z').getTime() - targetExpiryMs)
              if (diff < bestExpDiff) { bestExpDiff = diff; expiryDate = exp }
            }

            if (expiryDate) {
              const realDte = Math.max(1, Math.round((new Date(expiryDate + 'T00:00:00Z').getTime() - Date.now()) / 86400000))
              const r = 0.0387
              // Same decayed-DTE reprice convention as the calculator's heatmap grid
              // (ChainCalculator.tsx): a stock-price target isn't reached with the same DTE
              // still remaining - time has to pass too. Short-dated (<=10 DTE) assumes half the
              // time has burned off, longer-dated assumes 2/3 burned off (1/3 DTE left).
              const decayedDte = Math.max(1, realDte <= 10 ? Math.round(realDte / 2) : Math.round(realDte / 3))
              const Tdecayed = decayedDte / 365
              // strikeProb is expressed as desired PoP (probability of profit / finishing ITM),
              // but bsStrikeForProbFTP solves for P(price ends BELOW strike) = prob - so the
              // main-contract strike needs the COMPLEMENT passed in (100 - PoP) to actually land
              // on a strike with that PoP. T1/T2 keep the raw prob - those are percentile
              // stretch-targets (80th/90th pctl move), not PoP picks, so no complement there.
              const rawBuiltStrike = bsStrikeForProbFTP(baseSpot, baseSigma, realDte, 100 - strikeProb, targetUp)
              const rawT1Strike = bsStrikeForProbFTP(baseSpot, baseSigma, realDte, t1Prob, targetUp)
              const rawT2Strike = bsStrikeForProbFTP(baseSpot, baseSigma, realDte, t2Prob, targetUp)

              const mainContract = rawBuiltStrike !== null ? findRealContract(expiryDate, rawBuiltStrike) : null
              if (mainContract) {
                // Target 1/2 and the stop all reprice the SAME contract just bought
                // (mainContract.strike) at the target/stop STOCK price, using the decayed DTE -
                // never a different real strike's current live quote. That's the same
                // one-contract-repriced-at-a-future-price-and-time logic as the calculator.
                const t1Opt = rawT1Strike !== null
                  ? bsOptionPriceFTP(rawT1Strike, mainContract.strike, Tdecayed, r, baseSigma, isCall)
                  : null
                const t2Opt = rawT2Strike !== null
                  ? bsOptionPriceFTP(rawT2Strike, mainContract.strike, Tdecayed, r, baseSigma, isCall)
                  : null

                // Stop-loss: same delta-tiered premium-decline convention as calcTradeManagement,
                // using this contract's own delta from the chain (falls back to a mid delta if
                // the chain didn't return greeks).
                const mainDelta = Math.abs(tickerChain?.[expiryDate]?.[isCall ? 'calls' : 'puts']?.[String(mainContract.strike)]?.greeks?.delta ?? 0.5)
                let baseStopPercent = 0.3
                if (mainDelta > 0.7) baseStopPercent = 0.15
                else if (mainDelta >= 0.6) baseStopPercent = 0.2
                else if (mainDelta >= 0.4) baseStopPercent = 0.25
                else if (mainDelta >= 0.25) baseStopPercent = 0.35
                else baseStopPercent = 0.4
                if (realDte < 7) baseStopPercent = Math.max(0.1, baseStopPercent - 0.1)
                else if (realDte < 14) baseStopPercent = Math.max(0.15, baseStopPercent - 0.05)
                const ivAdjustment = baseSigma ? Math.max(0, (baseSigma - 0.3) * 0.5) : 0
                const adjustedStopPercent = Math.min(0.5, baseStopPercent + ivAdjustment)
                const stopOpt = noStop ? null : mainContract.premium * (1 - adjustedStopPercent)

                const pctVsBuilt = (p: number | null) => {
                  if (p === null || mainContract.premium <= 0) return null
                  const raw = ((p - mainContract.premium) / mainContract.premium) * 100
                  return isSoldToOpen ? -raw : raw
                }

                // IV of the actual purchased contract + breakeven distance (% move from
                // current spot needed for the stock to reach the contract's breakeven price).
                const mainContractData = tickerChain?.[expiryDate]?.[isCall ? 'calls' : 'puts']?.[String(mainContract.strike)]
                const ivPct = mainContractData?.implied_volatility ? mainContractData.implied_volatility * 100 : null
                const breakevenPrice = isCall ? mainContract.strike + mainContract.premium : mainContract.strike - mainContract.premium
                const bePct = baseSpot > 0 ? Math.abs((breakevenPrice - baseSpot) / baseSpot) * 100 : null

                builtTrade = {
                  strike: mainContract.strike, dte: realDte, premium: mainContract.premium, expiryDate,
                  t1Strike: rawT1Strike, t2Strike: rawT2Strike,
                  t1Opt, t2Opt,
                  t1Pct: pctVsBuilt(t1Opt), t2Pct: pctVsBuilt(t2Opt),
                  stopStrike: null, stopOpt, stopPct: stopOpt !== null ? pctVsBuilt(stopOpt) : null,
                  ivPct, bePct,
                }
              }
            }
          }

          const ladderTarget1 = builtTrade ? builtTrade.t1Strike : target1
          const ladderTarget2 = builtTrade ? builtTrade.t2Strike : target2
          const ladderT1Opt = builtTrade ? builtTrade.t1Opt : target1OptionPrice
          const ladderT2Opt = builtTrade ? builtTrade.t2Opt : target2OptionPrice
          const ladderT1Pct = builtTrade ? builtTrade.t1Pct : target1Pct
          const ladderT2Pct = builtTrade ? builtTrade.t2Pct : target2Pct
          const ladderStopStock = builtTrade ? null : stopStockPrice
          const ladderStopOpt = builtTrade ? builtTrade.stopOpt : stopLoss
          const ladderStopPct = builtTrade ? builtTrade.stopPct : stopPct

          const dirColor = targetUp ? '#22c55e' : '#ef4444'
          const dirGlow = targetUp ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)'

          // Headless scrape hook (Discord alert bot) - not rendered, just a stable JSON snapshot
          // of everything the card already computed so nothing gets reimplemented server-side.
          const readyForPickupNow = (() => {
            const noPlan = planText === 'No Plan detected.' || planText === 'Waiting on dealer magnet/pivot data to build an entry plan.'
            if (noPlan) return false
            const livePrice = currentStockPrice && currentStockPrice > 0 ? currentStockPrice : (spot && spot > 0 ? spot : trade.spot_price)
            const dollarMatch = planText.match(/\$([0-9]+(?:\.[0-9]+)?)/)
            const level = dollarMatch ? parseFloat(dollarMatch[1]) : null
            if (level === null || !livePrice || livePrice <= 0) return true
            if (planText.includes('approach down to')) return livePrice <= level
            if (planText.includes('run up to approach')) return livePrice >= level
            if (planText.includes('break above')) return livePrice > level
            if (planText.includes('break below')) return livePrice < level
            return true
          })()
          const flowAlertPayload = JSON.stringify({
            flowId, ticker: trade.underlying_ticker, ready: readyForPickupNow,
            direction: targetUp ? 'BULLISH' : 'BEARISH', tradeType: tradeTypeVal,
            term: isLongTerm ? 'LONG TERM' : 'SHORT TERM',
            strike: trade.strike, expiry: trade.expiry, optionType: trade.type,
            fillStyle: fs, tradeSize: trade.trade_size, premiumPerContract: trade.premium_per_contract,
            totalPremium: trade.total_premium, currentPremium: currentOptionPrice !== null ? currentOptionPrice * trade.trade_size * 100 : null,
            contractPctChange, entrySpot: trade.spot_price, currentStockPrice,
            takenAt: trade.trade_timestamp, qualifiedAt,
            convictionScore, planText,
            breakdown: { buyCallsPct: breakdown.buyCallsPct, bearCallsPct: breakdown.bearCallsPct, buyPutsPct: breakdown.buyPutsPct, bearPutsPct: breakdown.bearPutsPct },
            trendScorePct: Math.round(Math.max(-1, Math.min(1, flowBiasScore)) * 100),
            spamLabel, gammaLabel, structuralLabel,
            target1: ladderTarget1, target1Opt: ladderT1Opt, target1Pct: ladderT1Pct,
            target2: ladderTarget2, target2Opt: ladderT2Opt, target2Pct: ladderT2Pct,
            stop: ladderStopStock, stopOpt: ladderStopOpt, stopPct: ladderStopPct,
            earnings: earningsText,
            probabilityTrade: builtTrade,
          })

          return (
            <div
              key={flowId}
              data-flow-id={flowId}
              data-flow-payload={flowAlertPayload}
              style={{
                position: 'relative', overflow: 'hidden',
                background: '#000',
                border: `1px solid ${convColor}44`,
                clipPath: isMobileCard ? 'none' : 'polygon(0 0, calc(100% - 22px) 0, 100% 22px, 100% 100%, 22px 100%, 0 calc(100% - 22px))',
                boxShadow: `0 0 0 1px rgba(255,255,255,0.03), 0 18px 40px rgba(0,0,0,0.65), 0 0 40px -12px ${dirGlow}`,
                display: 'grid', gridTemplateColumns: isMobileCard ? '1fr' : '108px 1fr',
                alignItems: summaryMode ? 'start' : 'stretch',
              }}
            >
              {onRemove && (
                <button
                  onClick={(e) => { e.stopPropagation(); onRemove(trade) }}
                  title="Remove from A+ Tracker"
                  style={{
                    position: 'absolute', top: '6px', right: '6px', zIndex: 20,
                    width: '22px', height: '22px', borderRadius: '9999px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(0,0,0,0.75)', border: '1px solid rgba(239,68,68,0.6)',
                    color: '#ef4444', fontSize: '13px', fontWeight: 900, cursor: 'pointer', lineHeight: 1,
                  }}
                >×</button>
              )}
              {/* ── LEFT RAIL: conviction dial + direction + duration, stacked vertically ── */}
              <div style={{
                position: 'relative', display: 'flex',
                flexDirection: isMobileCard ? 'column' : 'column',
                alignItems: isMobileCard ? 'stretch' : 'center',
                justifyContent: 'flex-start',
                flexWrap: 'nowrap',
                gap: isMobileCard ? '8px' : (summaryMode ? '6px' : '10px'), padding: isMobileCard ? '8px 10px' : (summaryMode ? '12px 8px 10px' : '18px 8px 16px'),
                background: `linear-gradient(180deg, ${convColor}22 0%, #000 55%)`,
                borderRight: isMobileCard ? 'none' : `1px solid ${convColor}33`,
                borderBottom: isMobileCard ? `1px solid ${convColor}33` : 'none',
              }}>
                {isMobileCard ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ color: '#ffffff', fontSize: '14px', fontWeight: 900, letterSpacing: '-0.02em', flexShrink: 0 }}>{trade.underlying_ticker}</span>
                    <div style={{ position: 'relative', width: '40px', height: '40px', flexShrink: 0 }}>
                      <svg width={40} height={40} viewBox="0 0 84 84" style={{ transform: 'rotate(-90deg)' }}>
                        <circle cx="42" cy="42" r="34" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
                        <circle
                          cx="42" cy="42" r="34" fill="none" stroke={convColor} strokeWidth="6" strokeLinecap="round"
                          strokeDasharray={ringCircumference} strokeDashoffset={ringOffset}
                          style={{ filter: `drop-shadow(0 0 5px ${convColor})` }}
                        />
                      </svg>
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ color: '#ffffff', fontSize: '15px', fontWeight: 900, lineHeight: 1 }}>{convictionScore}</span>
                      </div>
                    </div>
                    {tradeTypeVal === 'MULTI-LEG' && (
                      <span style={{
                        display: 'inline-block', fontWeight: 800, fontSize: '10px', letterSpacing: '0.06em',
                        padding: '3px 8px', borderRadius: '3px',
                        background: '#fff', color: '#000', flexShrink: 0,
                      }}>
                        MULTI-LEG
                      </span>
                    )}
                    {(!summaryMode || isMobileCard) && (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', color: dirColor, fontWeight: 900, flexShrink: 0 }}>
                        <span style={{ fontSize: '14px', lineHeight: 1 }}>{targetUp ? '▲' : '▼'}</span>
                        <span style={{ fontSize: '9px', letterSpacing: '0.1em' }}>{targetUp ? 'BULLISH' : 'BEARISH'}</span>
                      </div>
                    )}
                    {tradeTypeVal !== 'MULTI-LEG' && (
                      <span style={{
                        display: 'inline-block', fontWeight: 800, fontSize: '11px', letterSpacing: '0.06em',
                        padding: '3px 8px', borderRadius: '3px',
                        background: isSweepBadge ? '#FFD700' : isBlockBadge ? '#00e5ff' : '#fff',
                        color: '#000', flexShrink: 0,
                      }}>
                        {tradeTypeVal}
                      </span>
                    )}
                    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '1px', flexShrink: 0 }}>
                      <span style={{ color: '#ffffff', fontSize: '11px', fontWeight: 900, whiteSpace: 'nowrap' }}>
                        {currentOptionPrice !== null ? fmtPrem(currentOptionPrice * trade.trade_size * 100) : '--'}
                      </span>
                      <span style={{ color: contractPctChange !== null && contractPctChange >= 0 ? '#22c55e' : '#ef4444', fontSize: '10px', fontWeight: 900, whiteSpace: 'nowrap' }}>
                        {contractPctChange !== null ? `${contractPctChange >= 0 ? '+' : ''}${contractPctChange.toFixed(1)}%` : '--'}
                      </span>
                    </span>

                    {(!summaryMode || isMobileCard) && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flexShrink: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px' }}>
                          <span style={{ color: '#ffffff', fontSize: '9px', fontWeight: 800, letterSpacing: '0.06em' }}>Taken:</span>
                          <span style={{ color: '#22d3ee', fontSize: '11px', fontWeight: 800, whiteSpace: 'nowrap' }}>{formatTime(trade.trade_timestamp)}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px' }}>
                          <span style={{ color: '#ffffff', fontSize: '9px', fontWeight: 800, letterSpacing: '0.06em' }}>Qualified:</span>
                          <span style={{ color: '#a8ff3e', fontSize: '11px', fontWeight: 800, whiteSpace: 'nowrap' }}>{formatTime(new Date(qualifiedAt).toISOString())}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px' }}>
                          <span style={{ color: '#ffffff', fontSize: '9px', fontWeight: 800, letterSpacing: '0.06em' }}>Earnings:</span>
                          <span style={{ color: earningsColor, fontSize: '11px', fontWeight: 800, whiteSpace: 'nowrap' }}>
                            {earningsInfo ? `${earningsText} (${earningsInfo.timing})` : '--'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <span style={{ color: '#ffffff', fontSize: '17px', fontWeight: 900, letterSpacing: '-0.02em', flexShrink: 0 }}>{trade.underlying_ticker}</span>
                    <div style={{ position: 'relative', width: summaryMode ? '54px' : '78px', height: summaryMode ? '54px' : '78px', flexShrink: 0 }}>
                      <svg width={summaryMode ? 54 : 78} height={summaryMode ? 54 : 78} viewBox="0 0 84 84" style={{ transform: 'rotate(-90deg)' }}>
                        <circle cx="42" cy="42" r="34" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
                        <circle
                          cx="42" cy="42" r="34" fill="none" stroke={convColor} strokeWidth="6" strokeLinecap="round"
                          strokeDasharray={ringCircumference} strokeDashoffset={ringOffset}
                          style={{ filter: `drop-shadow(0 0 5px ${convColor})` }}
                        />
                      </svg>
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ color: '#ffffff', fontSize: summaryMode ? '22px' : '32px', fontWeight: 900, lineHeight: 1 }}>{convictionScore}</span>
                        {!summaryMode && <span style={{ color: convColor, fontSize: '10px', fontWeight: 800, letterSpacing: '0.15em' }}>SCORE</span>}
                      </div>
                    </div>
                    {tradeTypeVal === 'MULTI-LEG' && (
                      <span style={{
                        display: 'inline-block', fontWeight: 800, fontSize: '11px', letterSpacing: '0.06em',
                        padding: '3px 10px', borderRadius: '3px', background: '#fff', color: '#000',
                      }}>
                        MULTI-LEG
                      </span>
                    )}
                    {!summaryMode && (
                      <div style={{
                        marginTop: '2px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
                        color: dirColor, fontWeight: 900, flexShrink: 0,
                      }}>
                        <span style={{ fontSize: '25px', lineHeight: 1 }}>{targetUp ? '▲' : '▼'}</span>
                        <span style={{ fontSize: '11px', letterSpacing: '0.1em' }}>{targetUp ? 'BULLISH' : 'BEARISH'}</span>
                      </div>
                    )}

                    {summaryMode && (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: '4px',
                        color: dirColor, fontWeight: 900, flexShrink: 0,
                      }}>
                        <span style={{ fontSize: '14px', lineHeight: 1 }}>{targetUp ? '▲' : '▼'}</span>
                        <span style={{ fontSize: '11px', letterSpacing: '0.08em' }}>{targetUp ? 'BULLISH' : 'BEARISH'}</span>
                      </div>
                    )}

                    {summaryMode && (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px', flexShrink: 0 }}>
                        <span style={{ color: '#ffffff', fontSize: '9px', fontWeight: 800, letterSpacing: '0.08em' }}>EARNINGS</span>
                        <span style={{ color: earningsColor, fontSize: '12px', fontWeight: 800, whiteSpace: 'nowrap' }}>
                          {earningsInfo ? earningsText : '--'}
                        </span>
                      </div>
                    )}

                    {!summaryMode && <div style={{ flexGrow: 0.5 }} />}

                    {!summaryMode && (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px', flexShrink: 0 }}>
                        <span style={{ color: '#ffffff', fontSize: '10px', fontWeight: 800, letterSpacing: '0.08em' }}>TAKEN</span>
                        <span style={{ color: '#22d3ee', fontSize: '13px', fontWeight: 800, whiteSpace: 'nowrap' }}>{formatTime(trade.trade_timestamp)}</span>
                      </div>
                    )}
                    {!summaryMode && (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px', marginTop: '4px', flexShrink: 0 }}>
                        <span style={{ color: '#ffffff', fontSize: '10px', fontWeight: 800, letterSpacing: '0.08em' }}>QUALIFIED</span>
                        <span style={{ color: '#a8ff3e', fontSize: '13px', fontWeight: 800, whiteSpace: 'nowrap' }}>{formatTime(new Date(qualifiedAt).toISOString())}</span>
                      </div>
                    )}
                    {!summaryMode && (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px', marginTop: '4px', flexShrink: 0 }}>
                        <span style={{ color: '#ffffff', fontSize: '10px', fontWeight: 800, letterSpacing: '0.08em' }}>EARNINGS</span>
                        <span style={{ color: earningsColor, fontSize: '13px', fontWeight: 800, whiteSpace: 'nowrap' }}>
                          {earningsInfo ? earningsText : '--'}
                        </span>
                      </div>
                    )}

                    <div style={{ flexGrow: 1 }} />
                  </>
                )}
              </div>

              {/* ── RIGHT CONTENT ── */}
              <div style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
                {/* Header strip: ticker + badges + strike/expiry/size/premium all in one row, POSITION on the right */}
                <div style={{
                  position: 'relative', padding: isMobileCard ? '12px 8px 10px' : '16px 20px 14px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)',
                  background: isLongTerm
                    ? 'linear-gradient(180deg, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0) 45%), linear-gradient(90deg, #000a14 0%, #001220 100%)'
                    : 'linear-gradient(180deg, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0) 45%), linear-gradient(90deg, #140f00 0%, #1f1700 100%)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -1px 0 rgba(0,0,0,0.5)',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, height: '50%', pointerEvents: 'none',
                    background: 'linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 100%)',
                  }} />
                  {isMobileCard ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {/* Row: strike/type, size@price+fill, premium, expiry */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                        <span style={{ color: isCall ? '#22c55e' : '#ef4444', fontSize: '11px', fontWeight: 800, whiteSpace: 'nowrap' }}>
                          ${trade.strike} {trade.type.toUpperCase()}
                        </span>
                        <span style={{ fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                          <span style={{ color: '#22d3ee' }}>{trade.trade_size.toLocaleString()}</span>
                          <span style={{ color: '#ffffff' }}>@${trade.premium_per_contract.toFixed(2)}</span>
                          {['A', 'AA', 'B', 'BB'].includes(fs) && (
                            <span style={{
                              marginLeft: '4px', fontSize: '11px', fontWeight: 800, padding: '2px 6px', borderRadius: '4px',
                              color: fs === 'A' ? '#4ade80' : fs === 'AA' ? '#86efac' : fs === 'B' ? '#f87171' : '#fca5a5',
                              background: fs === 'A' ? 'rgba(74,222,128,0.1)' : fs === 'AA' ? 'rgba(134,239,172,0.1)' : fs === 'B' ? 'rgba(248,113,113,0.1)' : 'rgba(252,165,165,0.1)',
                              border: `1px solid ${fs === 'A' ? 'rgba(74,222,128,0.3)' : fs === 'AA' ? 'rgba(134,239,172,0.3)' : fs === 'B' ? 'rgba(248,113,113,0.3)' : 'rgba(252,165,165,0.3)'}`,
                            }}>{fs}</span>
                          )}
                        </span>
                        <span style={{ color: '#4ade80', fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                          {fmtPrem(trade.total_premium)}
                        </span>
                        <span style={{ color: '#ffffff', fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                          {formatDate(trade.expiry)}
                        </span>
                        <span style={{ color: '#ffffff', fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                          {trade.spot_price > 0 ? `$${fmt4sigMobile(trade.spot_price)}` : '--'}
                        </span>
                        <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '11px', whiteSpace: 'nowrap' }}>{'>'}</span>
                        <span style={{
                          fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap',
                          color: currentStockPrice === null ? '#ffffff'
                            : currentStockPrice > trade.spot_price ? '#22c55e'
                              : currentStockPrice < trade.spot_price ? '#ef4444' : '#ffffff',
                        }}>
                          {currentStockPrice !== null && currentStockPrice > 0 ? `$${fmt4sigMobile(currentStockPrice)}` : '--'}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', color: isCall ? '#22c55e' : '#ef4444',
                        fontWeight: 900, fontSize: '13px', letterSpacing: '0.05em',
                        background: isCall ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)', borderRadius: '4px', padding: '3px 8px',
                        border: `1px solid ${isCall ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'}`,
                      }}>
                        {trade.type.toUpperCase()}
                      </span>
                      {tradeTypeVal !== 'MULTI-LEG' && (
                        <span style={{
                          display: 'inline-block', fontWeight: 800, fontSize: '12px', letterSpacing: '0.08em',
                          padding: '4px 10px', clipPath: 'polygon(6px 0, 100% 0, calc(100% - 6px) 100%, 0 100%)',
                          background: isSweepBadge ? '#FFD700' : isBlockBadge ? '#00e5ff' : '#fff',
                          color: '#000',
                        }}>
                          {tradeTypeVal}
                        </span>
                      )}

                      <span style={{ color: '#ffffff', fontSize: '16px', fontWeight: 700 }}>
                        ${trade.strike} {trade.type.toUpperCase()}
                      </span>
                      <span style={{ color: '#ffffff', fontSize: '16px', fontWeight: 700 }}>
                        {formatDate(trade.expiry)}
                      </span>
                      <span style={{ fontSize: '16px', fontWeight: 700 }}>
                        <span style={{ color: '#22d3ee' }}>{trade.trade_size.toLocaleString()}</span>
                        <span style={{ color: '#ffffff' }}>@${trade.premium_per_contract.toFixed(2)}</span>
                        {['A', 'AA', 'B', 'BB'].includes(fs) && (
                          <span style={{
                            marginLeft: '4px', fontSize: '12px', fontWeight: 800, padding: '2px 6px', borderRadius: '4px',
                            color: fs === 'A' ? '#4ade80' : fs === 'AA' ? '#86efac' : fs === 'B' ? '#f87171' : '#fca5a5',
                            background: fs === 'A' ? 'rgba(74,222,128,0.1)' : fs === 'AA' ? 'rgba(134,239,172,0.1)' : fs === 'B' ? 'rgba(248,113,113,0.1)' : 'rgba(252,165,165,0.1)',
                            border: `1px solid ${fs === 'A' ? 'rgba(74,222,128,0.3)' : fs === 'AA' ? 'rgba(134,239,172,0.3)' : fs === 'B' ? 'rgba(248,113,113,0.3)' : 'rgba(252,165,165,0.3)'}`,
                          }}>{fs}</span>
                        )}
                      </span>
                      <span style={{ color: '#4ade80', fontSize: '16px', fontWeight: 700 }}>
                        {fmtPrem(trade.total_premium)}
                      </span>

                      <span style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                        <span style={{ color: '#ffffff', fontSize: '19px', fontWeight: 900 }}>
                          {currentOptionPrice !== null ? fmtPrem(currentOptionPrice * trade.trade_size * 100) : '--'}
                        </span>
                        <span style={{ color: contractPctChange !== null && contractPctChange >= 0 ? '#22c55e' : '#ef4444', fontSize: '17px', fontWeight: 900 }}>
                          {contractPctChange !== null ? `${contractPctChange >= 0 ? '+' : ''}${contractPctChange.toFixed(1)}%` : '--'}
                        </span>
                      </span>

                      <span style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                        <span style={{ color: '#ffffff', fontSize: '14px', fontWeight: 700 }}>
                          {trade.spot_price > 0 ? `$${trade.spot_price.toFixed(2)}` : '--'}
                        </span>
                        <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '12px' }}>{'>'}</span>
                        <span style={{
                          fontSize: '14px', fontWeight: 700,
                          color: currentStockPrice === null ? '#ffffff'
                            : currentStockPrice > trade.spot_price ? '#22c55e'
                              : currentStockPrice < trade.spot_price ? '#ef4444' : '#ffffff',
                        }}>
                          {currentStockPrice !== null && currentStockPrice > 0 ? `$${currentStockPrice.toFixed(2)}` : '--'}
                        </span>
                      </span>

                      <span style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.15,
                        marginLeft: 'auto', fontSize: '11px', fontWeight: 800, letterSpacing: '0.1em', padding: '5px 10px', borderRadius: '4px',
                        color: isLongTerm ? '#00e5ff' : '#ffd400', background: isLongTerm ? 'rgba(0,229,255,0.12)' : 'rgba(255,212,0,0.12)',
                        border: `1px solid ${isLongTerm ? 'rgba(0,229,255,0.4)' : 'rgba(255,212,0,0.4)'}`,
                      }}>
                        <span>{isLongTerm ? 'LONG' : 'SHORT'}</span>
                        <span>TERM</span>
                      </span>
                    </div>
                  )}
                  {/* MULTI-LEG combo: show the other leg(s) of the paired buy/sell trade alongside the primary leg above */}
                  {otherLegs && otherLegs.length > 0 && (
                    <div style={{
                      display: 'flex', flexDirection: 'column', gap: isMobileCard ? '6px' : '8px',
                      marginTop: isMobileCard ? '8px' : '10px', paddingTop: isMobileCard ? '8px' : '10px',
                      borderTop: '1px dashed rgba(255,255,255,0.15)',
                    }}>
                      {otherLegs.map((leg, i) => {
                        const legFs = leg.fill_style || ''
                        const legIsCall = leg.type === 'call'
                        return (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: isMobileCard ? '8px' : '12px', flexWrap: 'wrap' }}>
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', color: legIsCall ? '#22c55e' : '#ef4444',
                              fontWeight: 900, fontSize: isMobileCard ? '11px' : '13px', letterSpacing: '0.05em',
                              background: legIsCall ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)', borderRadius: '4px', padding: '3px 8px',
                              border: `1px solid ${legIsCall ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'}`,
                            }}>
                              {leg.type.toUpperCase()}
                            </span>
                            <span style={{ color: '#ffffff', fontSize: isMobileCard ? '14px' : '16px', fontWeight: 700 }}>
                              ${leg.strike} {leg.type.toUpperCase()}
                            </span>
                            <span style={{ color: '#ffffff', fontSize: isMobileCard ? '14px' : '16px', fontWeight: 700 }}>
                              {formatDate(leg.expiry)}
                            </span>
                            <span style={{ fontSize: isMobileCard ? '14px' : '16px', fontWeight: 700 }}>
                              <span style={{ color: '#22d3ee' }}>{leg.trade_size.toLocaleString()}</span>
                              <span style={{ color: '#ffffff' }}>@${leg.premium_per_contract.toFixed(2)}</span>
                              {['A', 'AA', 'B', 'BB'].includes(legFs) && (
                                <span style={{
                                  marginLeft: '4px', fontSize: isMobileCard ? '11px' : '12px', fontWeight: 800, padding: '2px 6px', borderRadius: '4px',
                                  color: legFs === 'A' ? '#4ade80' : legFs === 'AA' ? '#86efac' : legFs === 'B' ? '#f87171' : '#fca5a5',
                                  background: legFs === 'A' ? 'rgba(74,222,128,0.1)' : legFs === 'AA' ? 'rgba(134,239,172,0.1)' : legFs === 'B' ? 'rgba(248,113,113,0.1)' : 'rgba(252,165,165,0.1)',
                                  border: `1px solid ${legFs === 'A' ? 'rgba(74,222,128,0.3)' : legFs === 'AA' ? 'rgba(134,239,172,0.3)' : legFs === 'B' ? 'rgba(248,113,113,0.3)' : 'rgba(252,165,165,0.3)'}`,
                                }}>{legFs}</span>
                              )}
                            </span>
                            <span style={{ color: '#4ade80', fontSize: isMobileCard ? '14px' : '16px', fontWeight: 700 }}>
                              {fmtPrem(leg.total_premium)}
                            </span>
                            <span style={{ display: 'flex', alignItems: 'baseline', gap: isMobileCard ? '4px' : '6px' }}>
                              <span style={{ color: '#ffffff', fontSize: isMobileCard ? '11px' : '14px', fontWeight: 700 }}>
                                {leg.spot_price > 0 ? `$${leg.spot_price.toFixed(2)}` : (spot ? `$${spot.toFixed(2)}` : '--')}
                              </span>
                              <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: isMobileCard ? '10px' : '12px' }}>{'>'}</span>
                              <span style={{
                                fontSize: isMobileCard ? '11px' : '14px', fontWeight: 700,
                                color: currentStockPrice === null ? '#ffffff'
                                  : currentStockPrice > leg.spot_price ? '#22c55e'
                                    : currentStockPrice < leg.spot_price ? '#ef4444' : '#ffffff',
                              }}>
                                {currentStockPrice !== null && currentStockPrice > 0 ? `$${currentStockPrice.toFixed(2)}` : '--'}
                              </span>
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Entry plan - angled callout ribbon */}
                <div style={{
                  position: 'relative', margin: isMobileCard ? '12px 8px 0' : (summaryMode ? '8px 16px 0' : '12px 16px 0'), padding: isMobileCard ? '8px 10px' : '10px 14px 10px 18px',
                  background: `linear-gradient(90deg, ${sigColor}1a 0%, transparent 100%)`,
                  borderLeft: `3px solid ${sigColor}`, borderRadius: '2px',
                  boxSizing: 'border-box',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '3px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: sigColor, boxShadow: `0 0 6px ${sigColor}`, flexShrink: 0 }} />
                      <span style={{ color: sigColor, fontWeight: 900, fontSize: isMobileCard ? '12px' : '13px', letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>ENTRY PLAN</span>
                    </div>
                    <button
                      onClick={() => setOpenCharts((prev) => {
                        const next = new Set(prev)
                        if (next.has(flowId)) next.delete(flowId)
                        else next.add(flowId)
                        return next
                      })}
                      style={{
                        cursor: 'pointer', flexShrink: 0,
                        display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '4px',
                        background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
                        color: '#ffffff', fontSize: isMobileCard ? '9px' : '10px', fontWeight: 800, letterSpacing: '0.06em',
                      }}
                    >
                      Chart{openCharts.has(flowId) ? '−' : '+'}
                    </button>
                  </div>
                  <div style={{ color: '#ffffff', fontSize: isMobileCard ? '12px' : '15px', lineHeight: 1.45, wordBreak: 'break-word' }}>{aiTakeText}</div>
                </div>
                {summaryMode && <div style={{ paddingBottom: '2px' }} />}

                {!summaryMode && (
                  <>
                    {/* Build A Trade - risk-profile driven strike/expiry rebuilder */}
                    <div style={{ padding: isMobileCard ? '6px 12px 0' : '6px 16px 0' }}>
                      {isMobileCard ? (
                        <div style={{
                          display: 'flex', gap: '8px', alignItems: 'center',
                          background: 'linear-gradient(180deg, #161616 0%, #060606 55%, #000000 100%)',
                          border: '1px solid rgba(255,255,255,0.08)',
                          borderRadius: '999px',
                          padding: '5px 8px',
                          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -2px 4px rgba(0,0,0,0.8), 0 2px 6px rgba(0,0,0,0.5)',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: '1 1 0', minWidth: 0 }}>
                            <span style={{ color: '#ffffff', fontSize: '9px', fontWeight: 800, letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>Risk Tolerance</span>
                            <select
                              value={riskLevel[flowId] ?? ''}
                              onChange={(e) => setRiskLevel((prev) => {
                                const next = { ...prev }
                                const v = e.target.value
                                if (!v) delete next[flowId]
                                else next[flowId] = v as 'PROB' | 'ONAROLE' | 'LUCKY'
                                return next
                              })}
                              style={{
                                flex: '1 1 0', minWidth: 0, cursor: 'pointer', padding: '5px 6px', borderRadius: '999px', fontWeight: 900,
                                fontSize: '10px', letterSpacing: '0.04em',
                                color: '#ffffff', colorScheme: 'dark',
                                background: 'linear-gradient(180deg, #1c1c1c 0%, #0a0a0a 55%, #000000 100%)',
                                border: '1px solid rgba(255,255,255,0.18)',
                              }}
                            >
                              <option value="" style={{ background: '#0a0a0a', color: '#ffffff' }}>NONE</option>
                              <option value="PROB" style={{ background: '#0a0a0a', color: '#ffffff' }}>PROBABILITY</option>
                              <option value="ONAROLE" style={{ background: '#0a0a0a', color: '#ffffff' }}>ON A ROLE</option>
                              <option value="LUCKY" style={{ background: '#0a0a0a', color: '#ffffff' }}>LUCKY</option>
                            </select>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: '1 1 0', minWidth: 0 }}>
                            <span style={{ color: '#ffffff', fontSize: '9px', fontWeight: 800, letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>FlowBias</span>
                            <select
                              value={histRange ?? ''}
                              onChange={(e) => setHistoricalRange((prev) => {
                                const next = { ...prev }
                                const v = e.target.value
                                if (!v) delete next[flowId]
                                else next[flowId] = v as '3D' | '1W'
                                return next
                              })}
                              style={{
                                flex: '1 1 0', minWidth: 0, cursor: 'pointer', padding: '5px 6px', borderRadius: '999px', fontWeight: 800,
                                fontSize: '10px', letterSpacing: '0.04em',
                                color: '#ff8c00', colorScheme: 'dark',
                                background: 'linear-gradient(180deg, #1c1c1c 0%, #0a0a0a 55%, #000000 100%)',
                                border: '1px solid rgba(255,140,0,0.4)',
                              }}
                            >
                              <option value="" style={{ background: '#0a0a0a', color: '#ff8c00' }}>TODAY</option>
                              <option value="3D" style={{ background: '#0a0a0a', color: '#ff8c00' }}>3D</option>
                              <option value="1W" style={{ background: '#0a0a0a', color: '#ff8c00' }}>1W</option>
                            </select>
                          </div>
                        </div>
                      ) : (
                        <div style={{
                          display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center',
                          background: 'linear-gradient(180deg, #161616 0%, #060606 55%, #000000 100%)',
                          border: '1px solid rgba(255,255,255,0.08)',
                          borderRadius: '999px',
                          padding: '6px 10px',
                          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -2px 4px rgba(0,0,0,0.8), 0 2px 6px rgba(0,0,0,0.5)',
                        }}>
                          {([
                            { key: 'PROB', label: 'PROBABILITY', desc: 'Favor the win, more time, 70–75% PoP strike', color: '#22c55e' },
                            { key: 'ONAROLE', label: 'ON A ROLE', desc: 'Balanced risk/reward, ~78% PoP strike', color: '#eab308' },
                            { key: 'LUCKY', label: 'LUCKY', desc: 'Degen mode: tighter DTE, 80-85% PoP, no stop', color: '#ec4899' },
                          ] as const).map((opt) => (
                            <button
                              key={opt.key}
                              title={opt.desc}
                              onClick={() => setRiskLevel((prev) => {
                                const next = { ...prev }
                                if (next[flowId] === opt.key) delete next[flowId]
                                else next[flowId] = opt.key
                                return next
                              })}
                              style={{
                                cursor: 'pointer', padding: '8px 16px', borderRadius: '999px', fontWeight: 900,
                                fontSize: '12px', letterSpacing: '0.06em', whiteSpace: 'nowrap', flexShrink: 0,
                                color: opt.color,
                                background: riskLevel[flowId] === opt.key
                                  ? `linear-gradient(180deg, #2b2b2b 0%, #050505 55%, #000000 100%)`
                                  : 'linear-gradient(180deg, #1c1c1c 0%, #0a0a0a 55%, #000000 100%)',
                                border: riskLevel[flowId] === opt.key ? `1px solid ${opt.color}` : '1px solid rgba(255,255,255,0.12)',
                                boxShadow: riskLevel[flowId] === opt.key ? `0 0 10px ${opt.color}66, inset 0 0 8px ${opt.color}33` : 'inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -2px 4px rgba(0,0,0,0.7)',
                              }}
                            >
                              {opt.label}
                            </button>
                          ))}

                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto', flexShrink: 0 }}>
                            <span style={{ color: '#ffffff', fontSize: '11px', fontWeight: 800, letterSpacing: '0.06em', marginRight: '2px', whiteSpace: 'nowrap' }}>
                              FlowBias :
                            </span>
                            {([
                              { key: null, label: 'TODAY' },
                              { key: '3D' as const, label: '3D' },
                              { key: '1W' as const, label: '1W' },
                            ]).map((opt) => {
                              const selected = (histRange ?? null) === opt.key
                              return (
                                <button
                                  key={opt.label}
                                  onClick={() => setHistoricalRange((prev) => {
                                    const next = { ...prev }
                                    if (opt.key === null) delete next[flowId]
                                    else next[flowId] = opt.key
                                    return next
                                  })}
                                  style={{
                                    cursor: 'pointer', padding: '8px 14px', borderRadius: '999px', fontWeight: 800,
                                    fontSize: '11px', letterSpacing: '0.06em', whiteSpace: 'nowrap', flexShrink: 0,
                                    color: selected ? '#ff8c00' : '#ffffff',
                                    background: selected
                                      ? 'linear-gradient(180deg, #2b2b2b 0%, #050505 55%, #000000 100%)'
                                      : 'linear-gradient(180deg, #1c1c1c 0%, #0a0a0a 55%, #000000 100%)',
                                    border: `1px solid ${selected ? '#ff8c00' : 'rgba(255,255,255,0.18)'}`,
                                    boxShadow: selected
                                      ? 'inset 0 2px 3px rgba(0,0,0,0.85), inset 0 -1px 0 rgba(255,140,0,0.35), 0 2px 4px rgba(0,0,0,0.6)'
                                      : 'inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -3px 5px rgba(0,0,0,0.7), 0 2px 4px rgba(0,0,0,0.6)',
                                    textShadow: '0 1px 1px rgba(0,0,0,0.8)',
                                  }}
                                >
                                  {opt.label}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {chainStillLoading && (
                        <div style={{ marginTop: '10px', color: 'rgba(255,255,255,0.4)', fontSize: '12px', fontWeight: 700 }}>
                          Fetching data…
                        </div>
                      )}
                    </div>

                    {/* Targets ladder + sentiment cluster - one neat single row (stacks vertically on mobile) */}
                    <div style={{
                      display: 'flex', flexDirection: isMobileCard ? 'column' : 'row', flexWrap: isMobileCard ? 'nowrap' : 'nowrap', gap: '10px', alignItems: isMobileCard ? 'stretch' : 'flex-start',
                      padding: '10px 16px 0',
                      overflowX: 'visible',
                      overflowY: 'visible',
                    }}>
                      <div style={{ flex: isMobileCard ? '1 1 auto' : '1 1 380px', minWidth: isMobileCard ? '0' : '340px', width: isMobileCard ? '100%' : undefined, maxWidth: undefined, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {[
                          { lbl: 'TARGET 1', stock: ladderTarget1, opt: ladderT1Opt, pct: ladderT1Pct, w: '62%' },
                          { lbl: 'TARGET 2', stock: ladderTarget2, opt: ladderT2Opt, pct: ladderT2Pct, w: '84%' },
                          { lbl: 'STOP', stock: ladderStopStock, opt: ladderStopOpt, pct: ladderStopPct, w: '38%', isStop: true },
                        ].map((row) => (
                          <div key={row.lbl} style={{
                            display: 'flex', alignItems: 'center', gap: isMobileCard ? '6px' : '10px', padding: isMobileCard ? '6px 8px' : '7px 10px',
                            background: row.isStop ? 'rgba(255,0,0,0.06)' : 'rgba(0,255,0,0.05)',
                            borderLeft: `3px solid ${row.isStop ? '#ff3333' : '#00e676'}`,
                            flexWrap: isMobileCard ? 'nowrap' : 'nowrap',
                            minWidth: 0,
                          }}>
                            <span style={{
                              flex: isMobileCard ? '0 0 46px' : '0 0 84px', fontSize: isMobileCard ? '10px' : '12px', fontWeight: 900, letterSpacing: isMobileCard ? '0.02em' : '0.08em', whiteSpace: 'nowrap',
                              color: row.isStop ? '#ff6666' : '#5ef2a6',
                            }}>{isMobileCard ? row.lbl.replace('TARGET ', 'T') : row.lbl}</span>
                            <div style={{ flex: '0 0 auto', width: isMobileCard ? '30px' : '70px', height: '5px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{ width: row.w, height: '100%', background: row.isStop ? '#ff3333' : '#00e676' }} />
                            </div>
                            <span style={{ color: '#ffffff', fontSize: isMobileCard ? '12px' : '15px', fontWeight: 800, whiteSpace: 'nowrap' }}>
                              {typeof row.stock === 'number' ? `$${row.stock.toFixed(2)}` : 'N/A'}
                            </span>
                            <span style={{ color: '#ffffff', fontSize: isMobileCard ? '11px' : '13px', flexShrink: 0 }}>/</span>
                            <span style={{ color: row.isStop ? '#ff6666' : '#5ef2a6', fontSize: isMobileCard ? '12px' : '15px', fontWeight: 800, whiteSpace: 'nowrap' }}>
                              {typeof row.opt === 'number' ? `$${row.opt.toFixed(2)}` : 'N/A'}
                            </span>
                            {typeof row.pct === 'number' && (
                              <span style={{
                                marginLeft: isMobileCard ? '4px' : 'auto', fontWeight: 800, fontSize: isMobileCard ? '11px' : '13px', padding: '1px 6px', borderRadius: '4px', whiteSpace: 'nowrap', flexShrink: 0,
                                color: row.pct >= 0 ? '#00ff00' : '#ff0000',
                                background: row.pct >= 0 ? 'rgba(0,255,0,0.1)' : 'rgba(255,0,0,0.1)',
                              }}>
                                {row.pct >= 0 ? '▲' : '▼'} {Math.abs(row.pct).toFixed(0)}%
                              </span>
                            )}
                          </div>
                        ))}

                        {/* Built trade summary - directly under STOP, inside the ladder column (not
                        a sibling of the whole ladder+gauge row, which is taller due to the gauge) */}
                        {builtTrade && (
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: isMobileCard ? '8px' : '10px', flexWrap: isMobileCard ? 'wrap' : 'nowrap',
                            padding: isMobileCard ? '8px 12px' : '10px 16px', borderRadius: '6px',
                            background: '#050505',
                            border: '1px solid rgba(255,255,255,0.1)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 4px 14px rgba(0,0,0,0.6)',
                          }}>
                            <span style={{ color: isCall ? '#22c55e' : '#ff1a1a', fontSize: isMobileCard ? '14px' : '16px', fontWeight: 900, textShadow: 'none', opacity: 1, whiteSpace: 'nowrap' }}>
                              ${builtTrade.strike.toFixed(2)} {trade.type.toUpperCase()}
                            </span>
                            <span style={{ color: '#ffffff', fontSize: isMobileCard ? '13px' : '15px', fontWeight: 700, whiteSpace: 'nowrap' }}>{formatDate(builtTrade.expiryDate)}</span>
                            <span style={{ color: '#ffffff', fontSize: isMobileCard ? '15px' : '17px', fontWeight: 900, whiteSpace: 'nowrap' }}>
                              {formatCompactDollars(builtTrade.premium * 100)}
                            </span>
                            <div style={{
                              marginLeft: isMobileCard ? 0 : 'auto', display: 'flex', alignItems: 'center', gap: '8px',
                              padding: '5px 10px', borderRadius: '5px',
                              background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.15)', flexShrink: 0,
                            }}>
                              {typeof builtTrade.ivPct === 'number' && (
                                <span style={{ color: '#c084fc', fontSize: '13px', fontWeight: 900, textShadow: 'none', opacity: 1, whiteSpace: 'nowrap' }}>
                                  IV: {builtTrade.ivPct.toFixed(0)}%
                                </span>
                              )}
                              {typeof builtTrade.bePct === 'number' && (
                                <span style={{ color: '#00ff66', fontSize: '13px', fontWeight: 900, textShadow: 'none', opacity: 1, whiteSpace: 'nowrap' }}>
                                  BE: {builtTrade.bePct.toFixed(1)}%
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Sentiment cluster: unified panel (bull/bear call/put split rows + trend
                      gauge in one card) plus the FlowBias (Spam/Structural/Gamma) rows next to it. */}
                      {isMobileCard ? (
                        <div style={{
                          display: 'flex', flexDirection: 'column', width: '100%',
                          gap: '8px', marginTop: 0, opacity: histLoading ? 0.4 : 1,
                        }}>
                          <FlowSentimentPanel breakdown={effectiveBreakdown} isMobileCard={isMobileCard} />
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }}>
                            {[
                              { text: spamLabel, active: spamLabel !== 'No Spammer Detected' && spamLabel !== 'Loading…', title: 'Flow Spammer', trades: spamResult.trades, uniqueness: spamUniqueness, gammaMeta: undefined, structuralMeta: undefined },
                              { text: structuralLabel, active: structuralLabel !== 'No Structural Formation Detected', title: 'Structural Support/Resistance', trades: structuralResult.trades, uniqueness: undefined, gammaMeta: undefined, structuralMeta: { callLevel: structuralResult.level, putLevel: structuralResult.putLevel } },
                              { text: gammaLabel, active: gammaLabel === 'Gamma Squeeze in Formation', title: 'Gamma Attack', trades: gammaResult.trades, uniqueness: undefined, gammaMeta: { ticker: trade.underlying_ticker, strike: trade.strike, spot, sigma, expiry: trade.expiry }, structuralMeta: undefined },
                            ].map((row, i) => (
                              <div
                                key={i}
                                onClick={() => row.active && row.trades.length > 0 && setFlowBiasDetail({ title: `${trade.underlying_ticker} - ${row.title}`, trades: row.trades, uniqueness: row.uniqueness, gammaMeta: row.gammaMeta, structuralMeta: row.structuralMeta })}
                                style={{
                                  display: 'flex', alignItems: 'center', padding: '4px 8px', borderRadius: '4px',
                                  background: '#000000',
                                  border: `1px solid ${row.active ? 'rgba(255,140,0,0.35)' : 'rgba(255,255,255,0.08)'}`,
                                  cursor: row.active && row.trades.length > 0 ? 'pointer' : 'default',
                                }}
                              >
                                <span style={{ color: row.active ? '#ff8c00' : '#ffffff', fontSize: '11px', fontWeight: 800, whiteSpace: 'normal' }}>
                                  {row.text}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'row', gap: '14px', alignItems: 'flex-start', flexWrap: 'nowrap', marginTop: '0', opacity: histLoading ? 0.4 : 1 }}>
                          <FlowSentimentPanel breakdown={effectiveBreakdown} isMobileCard={isMobileCard} />
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '228px' }}>
                            {[
                              { text: spamLabel, active: spamLabel !== 'No Spammer Detected' && spamLabel !== 'Loading…', title: 'Flow Spammer', trades: spamResult.trades, uniqueness: spamUniqueness, gammaMeta: undefined, structuralMeta: undefined },
                              { text: structuralLabel, active: structuralLabel !== 'No Structural Formation Detected', title: 'Structural Support/Resistance', trades: structuralResult.trades, uniqueness: undefined, gammaMeta: undefined, structuralMeta: { callLevel: structuralResult.level, putLevel: structuralResult.putLevel } },
                              { text: gammaLabel, active: gammaLabel === 'Gamma Squeeze in Formation', title: 'Gamma Attack', trades: gammaResult.trades, uniqueness: undefined, gammaMeta: { ticker: trade.underlying_ticker, strike: trade.strike, spot, sigma, expiry: trade.expiry }, structuralMeta: undefined },
                            ].map((row, i) => (
                              <div
                                key={i}
                                onClick={() => row.active && row.trades.length > 0 && setFlowBiasDetail({ title: `${trade.underlying_ticker} - ${row.title}`, trades: row.trades, uniqueness: row.uniqueness, gammaMeta: row.gammaMeta, structuralMeta: row.structuralMeta })}
                                style={{
                                  display: 'flex', alignItems: 'center', padding: '4px 8px', borderRadius: '4px',
                                  background: '#000000',
                                  border: `1px solid ${row.active ? 'rgba(255,140,0,0.35)' : 'rgba(255,255,255,0.08)'}`,
                                  cursor: row.active && row.trades.length > 0 ? 'pointer' : 'default',
                                }}
                              >
                                <span style={{ color: row.active ? '#ff8c00' : '#ffffff', fontSize: '11px', fontWeight: 800, whiteSpace: 'normal' }}>
                                  {row.text}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Chart */}
                    {openCharts.has(flowId) && (
                      <div style={{ padding: '0 16px 16px' }}>
                        <TradeCardChart
                          symbol={trade.underlying_ticker}
                          chartMode={chartModeByFlowId[flowId] ?? 'stock'}
                          onToggleChartMode={() => setChartModeByFlowId((prev) => ({
                            ...prev,
                            [flowId]: (prev[flowId] ?? 'stock') === 'stock' ? 'algoflow' : 'stock',
                          }))}
                          algoFlowTicker={trade.underlying_ticker}
                          algoFlowTrades={tickerTradesMap.get(trade.underlying_ticker) || [trade]}
                          target1Price={typeof ladderTarget1 === 'number' ? ladderTarget1 : undefined}
                          target2Price={typeof ladderTarget2 === 'number' ? ladderTarget2 : undefined}
                          stopPrice={typeof ladderStopStock === 'number' ? ladderStopStock : undefined}
                          gammaLevel={gammaLabel === 'Gamma Squeeze in Formation' ? target1 : null}
                          structuralLevel={structuralResult.level}
                          structuralIsResistance={structuralResult.isResistance}
                          spamLevel={spamLabel !== 'No Spammer Detected' && spamLabel !== 'Loading…' ? spamResult.level : null}
                        />
                      </div>
                    )}
                  </>
                )}

              </div>
            </div>
          )
        })}
      </div>

      {/* FlowBias detail modal - shows exactly which raw prints were matched for the clicked
          Spam/Structural/Gamma label, in the same column layout as the main Options Flow table
          (Time / C-P / Strike / Premium / Expiry / Size+Fill / Type / Spot). */}
      {flowBiasDetail && (
        <div
          onClick={() => setFlowBiasDetail(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#000000', border: '1px solid #262626', borderRadius: '12px',
              maxWidth: '820px', width: '100%', maxHeight: '70vh', display: 'flex', flexDirection: 'column',
              boxShadow: '0 16px 48px rgba(0,0,0,0.95)', overflow: 'hidden',
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 20px', background: '#000000', borderBottom: '1px solid #262626',
            }}>
              <span style={{ color: '#ff8c00', fontWeight: 800, fontSize: '18px', letterSpacing: '0.3px' }}>{flowBiasDetail.title}</span>
              <span
                onClick={() => setFlowBiasDetail(null)}
                style={{
                  color: '#ffffff', fontSize: '20px', cursor: 'pointer', lineHeight: 1,
                  width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: '6px', background: '#0d0d0d', border: '1px solid #262626',
                }}
              >
                ×
              </span>
            </div>
            <div style={{ overflowY: 'auto', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ position: 'sticky', top: 0, background: '#000000' }}>
                    {['TIME', 'C/P', 'STRIKE', 'SIZE', 'PREMIUM', 'EXPIRY', 'SPOT', 'TYPE'].map((h) => (
                      <th key={h} style={{
                        textAlign: 'left', padding: '11px 15px', fontSize: '13px', fontWeight: 900,
                        color: '#ffffff', borderBottom: '2px solid #262626', whiteSpace: 'nowrap', letterSpacing: '0.5px',
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {flowBiasDetail.trades.map((t, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? '#000000' : '#0a0a0a', borderBottom: '1px solid #1a1a1a' }}>
                      <td style={{ padding: '9px 15px', fontSize: '15px', color: '#ffffff', whiteSpace: 'nowrap' }}>
                        {t.trade_timestamp
                          ? new Date(t.trade_timestamp).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' })
                          : '—'}
                      </td>
                      <td style={{ padding: '9px 15px', fontSize: '15px', fontWeight: 800, color: t.type === 'call' ? '#22c55e' : '#ef4444' }}>
                        {t.type.toUpperCase()}
                      </td>
                      <td style={{ padding: '9px 15px', fontSize: '15px', fontWeight: 700, color: '#ffffff' }}>
                        ${t.strike.toFixed(2)}
                      </td>
                      <td style={{ padding: '9px 15px', fontSize: '15px', color: '#ffffff', whiteSpace: 'nowrap' }}>
                        {typeof t.tradeSize === 'number' ? t.tradeSize.toLocaleString() : '—'}
                        {typeof t.premium === 'number' && (
                          <span style={{ color: '#ffffff' }}> @ {t.premium.toFixed(2)}</span>
                        )}
                        {t.fillStyle && (
                          <span style={{
                            color: (t.fillStyle === 'A' || t.fillStyle === 'AA') ? '#22c55e' : (t.fillStyle === 'B' || t.fillStyle === 'BB') ? '#ef4444' : '#c084fc',
                            fontWeight: 800, marginLeft: '6px',
                          }}>
                            {t.fillStyle}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '9px 15px', fontSize: '15px', color: '#22c55e', fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {typeof t.totalPremium === 'number' ? `$${t.totalPremium.toLocaleString()}` : '—'}
                      </td>
                      <td style={{ padding: '9px 15px', fontSize: '15px', color: '#ffffff', whiteSpace: 'nowrap' }}>
                        {t.expiry ? formatDate(t.expiry) : '—'}
                      </td>
                      <td style={{ padding: '9px 15px', fontSize: '15px', color: '#ffffff', fontWeight: 700 }}>
                        {typeof t.spot === 'number' ? `$${t.spot.toFixed(2)}` : '—'}
                      </td>
                      <td style={{ padding: '9px 15px', whiteSpace: 'nowrap' }}>
                        {t.tradeType ? (
                          <span style={getFlowBiasTypeBadgeStyle(t.tradeType)}>{t.tradeType}</span>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function FlowTrackingPanel({
  onClose,
  relativeStrengthData,
  historicalStdDevs: historicalStdDevsFromParent,
  comboTradeMap: comboTradeMapFromParent,
  dealerZoneCache: dealerZoneCacheFromParent,
  liveFlows: liveFlowsFromParent,
  hideChart = false,
  leapRsData,
  leap52wkData,
  leapSeasonalData,
  algoFlowTrades,
  algoFlowTicker,
  allFlowData,
  parentOptionPrices,
  parentStockPrices,
  sweepSenseData,
  sweepSenseScanning,
  sweepSenseProgress,
  trackedFlowsSweepData,
  onRemoveTrackedFlow,
  initialTab,
}: {
  onClose?: () => void
  initialTab?: 'TRACKER' | 'SWEEPSENSE'
  relativeStrengthData?: Map<string, number>
  historicalStdDevs?: Map<string, number>
  comboTradeMap?: Map<string, boolean>
  dealerZoneCache?: Record<
    string,
    {
      golden: number | null
      purple: number | null
      atmIV: number | null
      goldenExpiry?: string | null
      purpleExpiry?: string | null
    }
  >
  liveFlows?: OptionsFlowData[]
  hideChart?: boolean
  leapRsData?: Map<string, { rs5d: number; rs13d: number; rs21d: number }>
  leap52wkData?: Map<string, { high52: number; low52: number }>
  leapSeasonalData?: Map<string, { inSweetSpot: boolean; inPainPoint: boolean }>
  algoFlowTrades?: OptionsFlowData[]
  algoFlowTicker?: string
  // Full unfiltered flow array (same `data` prop OptionsFlowTable renders) - used by SweepSense
  // cards to feed the per-ticker AlgoFlow chart toggle with real trades instead of a subset.
  allFlowData?: OptionsFlowData[]
  parentOptionPrices?: Record<string, number>
  parentStockPrices?: Record<string, number>
  sweepSenseData?: {
    trades: Array<{
      trade: OptionsFlowData
      grade: string
      gradeColor: string
      convictionScore: number
      pctMove: number | null
      currentStockPrice: number | null
      currentOptionPrice: number | null
      contractPctChange: number | null
      magnet: number | null
      pivot: number | null
      sigCode: string
      sigColor: string
      planText: string
      qualifiedAt: number
      sigma?: number
      dte?: number
      spot?: number
      breakdown: { buyCallsPct: number; bearCallsPct: number; buyPutsPct: number; bearPutsPct: number }
      otherLegs?: OptionsFlowData[]
      flowSpamLabel?: string
      gammaAttackLabel?: string
      structuralLabel?: string
      nextEarningsDate?: string | null
    }>
    stats: { buyCallsPct: number; bearCallsPct: number; buyPutsPct: number; bearPutsPct: number }
    bubbles: Array<{ ticker: string; premium: number; bias: 'bull' | 'bear'; biasStrength: number }>
  } | null
  sweepSenseScanning?: boolean
  sweepSenseProgress?: { current: number; total: number } | null
  // Same exact per-trade shape as sweepSenseData above, computed by the parent from the
  // user's explicitly tracked flows (trackedFlows) instead of the SweepSense A-grade gate -
  // every tracked flow is graded/enriched the same way but NEVER filtered by grade, so the
  // A+ Tracker tab can show the identical SweepSense card design (gauge, spam/gamma/structural,
  // entry plan) for any tracked flow while still surfacing its real conviction score.
  trackedFlowsSweepData?: {
    trades: Array<{
      trade: OptionsFlowData
      grade: string
      gradeColor: string
      convictionScore: number
      pctMove: number | null
      currentStockPrice: number | null
      currentOptionPrice: number | null
      contractPctChange: number | null
      magnet: number | null
      pivot: number | null
      sigCode: string
      sigColor: string
      planText: string
      qualifiedAt: number
      sigma?: number
      dte?: number
      spot?: number
      breakdown: { buyCallsPct: number; bearCallsPct: number; buyPutsPct: number; bearPutsPct: number }
      liveRawTrades?: Array<FlowBiasRawTrade>
      otherLegs?: OptionsFlowData[]
      flowSpamLabel?: string
      gammaAttackLabel?: string
      structuralLabel?: string
      nextEarningsDate?: string | null
    }>
    stats: { buyCallsPct: number; bearCallsPct: number; buyPutsPct: number; bearPutsPct: number }
    bubbles: Array<{ ticker: string; premium: number; bias: 'bull' | 'bear'; biasStrength: number }>
  } | null
  // The REAL remove handler, owned by OptionsFlowTable (the source of trackedFlowsSweepData) -
  // must be used instead of this component's own local removeFromFlowTracking below, which only
  // ever mutated FlowTrackingPanel's own unused local `trackedFlows`/localStorage copy and never
  // actually affected the parent's trackedFlows state that trackedFlowsSweepData is built from
  // (so the X button appeared to do nothing - the card was rebuilt right back from the parent).
  onRemoveTrackedFlow?: (trade: OptionsFlowData) => void
} = {}) {
  const [panelTab, setPanelTab] = useState<'TRACKER' | 'SWEEPSENSE'>(initialTab ?? 'SWEEPSENSE')
  const [sweepSenseSummaryMode, setSweepSenseSummaryMode] = useState(false)
  useEffect(() => {
    if (initialTab) setPanelTab(initialTab)
  }, [initialTab])
  const [isMounted, setIsMounted] = useState(false)
  const [chartSymbol, setChartSymbol] = useState('SPY')
  const [chartContainerHeight, setChartContainerHeight] = useState(600)
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const [chartSymbolInput, setChartSymbolInput] = useState('SPY')
  const [trackedFlows, setTrackedFlows] = useState<OptionsFlowData[]>([])
  const { isMobile, swipedFlowId, setSwipedFlowId, touchStart, setTouchStart, touchCurrent, setTouchCurrent } = useFlowTrackingPanelMobile()

  const [flowTrackingFilters, setFlowTrackingFilters] = useState({
    gradeFilter: 'ALL' as 'ALL' | 'A' | 'B' | 'C' | 'D' | 'F',
    typeFilter: 'ALL' as 'ALL' | 'NOTABLE' | 'LEAPS',
    gradeSort: 'NONE' as 'NONE' | 'HIGH' | 'LOW',
    contractsSort: 'NONE' as 'NONE' | 'HIGH' | 'LOW',
    premiumSort: 'NONE' as 'NONE' | 'HIGH' | 'LOW',
    expirySort: 'NONE' as 'NONE' | 'NEAR' | 'FAR',
    showDownSixtyPlus: false,
    showCharts: !isMobile,
    showWeeklies: false,
  })
  const [currentOptionPrices, setCurrentOptionPrices] = useState<Record<string, number>>({})
  const [currentStockPrices, setCurrentStockPrices] = useState<Record<string, number>>({})
  // Prefer parent-provided prices so grades match the flow table exactly
  const effectiveOptionPrices = parentOptionPrices && Object.keys(parentOptionPrices).length > 0
    ? { ...currentOptionPrices, ...parentOptionPrices }
    : currentOptionPrices
  const effectiveStockPrices = parentStockPrices && Object.keys(parentStockPrices).length > 0
    ? { ...currentStockPrices, ...parentStockPrices }
    : currentStockPrices
  const [ownStdDevs, setOwnStdDevs] = useState<Map<string, number>>(new Map())
  const [ownStdDevFailed, setOwnStdDevFailed] = useState<Set<string>>(new Set())
  const [ownDealerZones, setOwnDealerZones] = useState<
    Record<string, { golden: number | null; purple: number | null; atmIV: number | null }>
  >({})
  const [stockChartData, setStockChartData] = useState<
    Record<string, { price: number; timestamp: number }[]>
  >({})
  const [optionsPremiumData, setOptionsPremiumData] = useState<
    Record<string, { price: number; timestamp: number }[]>
  >({})
  const [flowChartTimeframes, setFlowChartTimeframes] = useState<
    Record<string, { stock: '1D' | '1W' | '1M'; option: '1D' | '1W' | '1M' }>
  >({})

  const prevTrackedFlowsLength = useRef(0)

  // Load from localStorage on mount
  useEffect(() => {
    setIsMounted(true)

    const loadWatchlist = () => {
      const saved = localStorage.getItem('flowTrackingWatchlist')
      if (saved) {
        try {
          const flows: OptionsFlowData[] = JSON.parse(saved)
          setTrackedFlows(flows)
        } catch (e) {
          console.error('[FlowTrackingPanel] loadWatchlist parse error:', e)
        }
      }
    }

    loadWatchlist()

    // Re-load whenever OptionsFlowTable writes to watchlist (same-tab writes don't fire the native storage event)
    const onWatchlistUpdated = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.flows) {
        setTrackedFlows(detail.flows as OptionsFlowData[])
      } else {
        loadWatchlist()
      }
    }
    window.addEventListener('flowWatchlistUpdated', onWatchlistUpdated)

    return () => {
      window.removeEventListener('flowWatchlistUpdated', onWatchlistUpdated)
    }
  }, [])

  // Measure chart container height so EFIChart fills it exactly
  useEffect(() => {
    const el = chartContainerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height
      if (h && h > 50) setChartContainerHeight(Math.round(h))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Remove expired flows + fetch prices when trackedFlows change
  useEffect(() => {
    if (trackedFlows.length === 0) return
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    const active = trackedFlows.filter((flow) => {
      const exp = new Date(flow.expiry)
      exp.setHours(0, 0, 0, 0)
      return now <= exp
    })
    if (active.length !== trackedFlows.length) {
      localStorage.setItem('flowTrackingWatchlist', JSON.stringify(active))
      setTrackedFlows(active)
      return
    }
    if (trackedFlows.length > prevTrackedFlowsLength.current) {
      fetchCurrentOptionPrices(trackedFlows)
    }
    prevTrackedFlowsLength.current = trackedFlows.length
  }, [trackedFlows.length])

  // Poll prices every 30s
  useEffect(() => {
    if (trackedFlows.length === 0) return
    fetchCurrentOptionPrices(trackedFlows)
    fetchCurrentStockPrices(trackedFlows)
    const interval = setInterval(() => {
      fetchCurrentOptionPrices(trackedFlows)
      fetchCurrentStockPrices(trackedFlows)
    }, 30000)
    return () => clearInterval(interval)
  }, [trackedFlows.length])

  // Fetch stdDevs for tracked tickers once on mount / when new tickers appear
  useEffect(() => {
    if (trackedFlows.length === 0) return
    const tickers = [...new Set(trackedFlows.map((f) => f.underlying_ticker))]
    const missing = tickers.filter((t) => !ownStdDevs.has(t))
    if (missing.length === 0) return
    missing.forEach(async (ticker, idx) => {
      await new Promise((r) => setTimeout(r, idx * 150))
      try {
        const end = new Date().toISOString().split('T')[0]
        const start = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]
        const res = await fetch(
          `/api/polygon/v2/aggs/ticker/${ticker}/range/1/day/${start}/${end}?adjusted=true&sort=asc&limit=30&apiKey=${POLYGON_API_KEY}`,
          { signal: AbortSignal.timeout(8000) }
        )
        if (res.ok) {
          const data = await res.json()
          if (data.results && data.results.length > 1) {
            const returns: number[] = []
            for (let i = 1; i < data.results.length; i++) {
              const prev = data.results[i - 1].c
              const curr = data.results[i].c
              returns.push(((curr - prev) / prev) * 100)
            }
            const mean = returns.reduce((a, b) => a + b, 0) / returns.length
            const variance = returns.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / returns.length
            setOwnStdDevs((prev) => new Map(prev).set(ticker, Math.sqrt(variance)))
          } else {
            setOwnStdDevFailed((prev) => new Set(prev).add(ticker))
          }
        } else {
          setOwnStdDevFailed((prev) => new Set(prev).add(ticker))
        }
      } catch {
        setOwnStdDevFailed((prev) => new Set(prev).add(ticker))
      }
    })
  }, [trackedFlows.length])

  // Fetch dealer zones (magnet/pivot/atmIV) for tracked tickers
  useEffect(() => {
    if (trackedFlows.length === 0) return
    const tickers = [...new Set(trackedFlows.map((f) => f.underlying_ticker))]
    const missing = tickers.filter((t) => {
      const parent = dealerZoneCacheFromParent?.[t]
      if (parent && (parent.golden !== null || parent.purple !== null)) return false
      return !(t in ownDealerZones)
    })
    if (missing.length === 0) return
    missing.forEach(async (ticker, idx) => {
      await new Promise((r) => setTimeout(r, idx * 200))
      try {
        const res = await fetch(`/api/dealer-zones?ticker=${ticker}`, {
          signal: AbortSignal.timeout(8000),
        })
        if (res.ok) {
          const result = await res.json()
          if (result.success) {
            setOwnDealerZones((prev) => ({
              ...prev,
              [ticker]: {
                golden: result.golden ?? null,
                purple: result.purple ?? null,
                atmIV: result.atmIV ?? null,
              },
            }))
            return
          }
        }
        setOwnDealerZones((prev) => ({
          ...prev,
          [ticker]: { golden: null, purple: null, atmIV: null },
        }))
      } catch {
        setOwnDealerZones((prev) => ({
          ...prev,
          [ticker]: { golden: null, purple: null, atmIV: null },
        }))
      }
    })
  }, [trackedFlows.length])

  const fetchCurrentStockPrices = async (trades: OptionsFlowData[]) => {
    const tickers = [...new Set(trades.map((t) => t.underlying_ticker))]
    if (tickers.length === 0) return
    const update: Record<string, number> = {}
    await Promise.allSettled(
      tickers.map(async (ticker, idx) => {
        await new Promise((r) => setTimeout(r, idx * 50))
        try {
          const res = await fetch(
            `/api/polygon/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apikey=${POLYGON_API_KEY}`,
            { signal: AbortSignal.timeout(5000) }
          )
          if (res.ok) {
            const data = await res.json()
            if (data.status === 'OK' && data.ticker) {
              const price = data.ticker.lastTrade?.p || data.ticker.prevDay?.c
              if (price && price > 0) update[ticker] = price
            }
          }
        } catch {
          /* silent */
        }
      })
    )
    setCurrentStockPrices((prev) => ({ ...prev, ...update }))
  }

  const fetchCurrentOptionPrices = async (trades: OptionsFlowData[]) => {
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    const active = trades.filter((t) => {
      const exp = new Date(t.expiry)
      exp.setHours(0, 0, 0, 0)
      return now <= exp
    })
    if (active.length === 0) return
    const pricesUpdate: Record<string, number> = {}
    const BATCH_SIZE = 15
    for (let i = 0; i < active.length; i += BATCH_SIZE) {
      const batch = active.slice(i, i + BATCH_SIZE)
      await Promise.allSettled(
        batch.map(async (trade, idx) => {
          await new Promise((r) => setTimeout(r, idx * 30))
          try {
            const expiry = trade.expiry.replace(/-/g, '').slice(2)
            const strikeFormatted = String(Math.round(trade.strike * 1000)).padStart(8, '0')
            const optionType = trade.type.toLowerCase() === 'call' ? 'C' : 'P'
            const optionTicker = `O:${normalizeTickerForOptions(trade.underlying_ticker)}${expiry}${optionType}${strikeFormatted}`
            const res = await fetch(
              `/api/polygon/v3/snapshot/options/${trade.underlying_ticker}/${optionTicker}?apikey=${POLYGON_API_KEY}`,
              { signal: AbortSignal.timeout(5000) }
            )
            if (res.ok) {
              const data = await res.json()
              if (data.results?.last_quote) {
                const mid =
                  ((data.results.last_quote.bid || 0) + (data.results.last_quote.ask || 0)) / 2
                if (mid > 0) pricesUpdate[optionTicker] = mid
              }
            }
          } catch {
            /* silent */
          }
        })
      )
    }
    setCurrentOptionPrices((prev) => ({ ...prev, ...pricesUpdate }))
  }

  const fetchStockChartDataForFlow = async (
    flowId: string,
    ticker: string,
    timeframe: '1D' | '1W' | '1M'
  ) => {
    try {
      let multiplier = 5,
        timespan = 'minute'
      const now = new Date()
      let from = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        .toISOString()
        .split('T')[0]
      const to = now.toISOString().split('T')[0]
      if (timeframe === '1W') {
        multiplier = 1
        timespan = 'hour'
        from = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
      } else if (timeframe === '1M') {
        multiplier = 1
        timespan = 'day'
        from = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]
      }
      const res = await fetch(
        `/api/polygon/v2/aggs/ticker/${ticker}/range/${multiplier}/${timespan}/${from}/${to}?adjusted=true&sort=asc&apiKey=${POLYGON_API_KEY}`
      )
      if (res.ok) {
        const data = await res.json()
        if (data.results?.length > 0)
          setStockChartData((prev) => ({
            ...prev,
            [flowId]: data.results.map((b: any) => ({ price: b.c, timestamp: b.t })),
          }))
      }
    } catch {
      /* silent */
    }
  }

  const fetchOptionPremiumDataForFlow = async (
    flowId: string,
    trade: OptionsFlowData,
    timeframe: '1D' | '1W' | '1M'
  ) => {
    try {
      const expiry = trade.expiry.replace(/-/g, '').slice(2)
      const strikeFormatted = String(Math.round(trade.strike * 1000)).padStart(8, '0')
      const optionType = trade.type.toLowerCase() === 'call' ? 'C' : 'P'
      const optionTicker = `O:${normalizeTickerForOptions(trade.underlying_ticker)}${expiry}${optionType}${strikeFormatted}`
      let multiplier = 5,
        timespan = 'minute'
      const now = new Date()
      let from = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        .toISOString()
        .split('T')[0]
      const to = now.toISOString().split('T')[0]
      if (timeframe === '1W') {
        multiplier = 30
        timespan = 'minute'
        from = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
      } else if (timeframe === '1M') {
        multiplier = 1
        timespan = 'hour'
        from = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]
      }
      const res = await fetch(
        `/api/polygon/v2/aggs/ticker/${optionTicker}/range/${multiplier}/${timespan}/${from}/${to}?adjusted=true&sort=asc&apiKey=${POLYGON_API_KEY}`
      )
      if (res.ok) {
        const data = await res.json()
        if (data.results?.length > 0)
          setOptionsPremiumData((prev) => ({
            ...prev,
            [flowId]: data.results.map((b: any) => ({ price: b.c, timestamp: b.t })),
          }))
      }
    } catch {
      /* silent */
    }
  }

  const removeFromFlowTracking = (trade: OptionsFlowData) => {
    const flowId = generateFlowId(trade)
    const updated = trackedFlows.filter((t) => generateFlowId(t) !== flowId)
    setTrackedFlows(updated)
    localStorage.setItem('flowTrackingWatchlist', JSON.stringify(updated))
  }

  return (
    <div className="relative bg-black w-full" style={{ ...(isMobile ? { flex: 1, minHeight: 0 } : {}), height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* ── Tab Bar ── */}
      <div style={{
        display: 'flex', alignItems: 'stretch', flexShrink: 0, position: 'relative', gap: 0,
        background: 'linear-gradient(180deg, #1a1a1a 0%, #000000 55%, #0a0a0a 100%)',
        borderBottom: '2px solid rgba(255,133,0,0.35)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.6)',
      }}>
        <div style={{ display: 'flex', flex: 1, gap: isMobile ? '4px' : '6px', padding: isMobile ? '4px' : '6px' }}>
          {(!isMobile || panelTab === 'SWEEPSENSE') && (
            <button
              onClick={() => setPanelTab('SWEEPSENSE')}
              style={{
                flex: 1, padding: isMobile ? '6px 6px' : '12px 8px', cursor: isMobile ? 'default' : 'pointer',
                border: panelTab === 'SWEEPSENSE' ? '1px solid rgba(255,133,0,0.45)' : '1px solid rgba(255,255,255,0.10)',
                borderRadius: isMobile ? '6px' : '10px',
                background: 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                boxShadow: panelTab === 'SWEEPSENSE'
                  ? '0 0 10px rgba(255,133,0,0.25), inset 0 1px 0 rgba(255,255,255,0.15)'
                  : 'inset 0 1px 0 rgba(255,255,255,0.10)',
                color: panelTab === 'SWEEPSENSE' ? '#ff8500' : '#ffffff',
                fontWeight: 900, fontSize: isMobile ? '9px' : '17px', letterSpacing: isMobile ? '0.5px' : '1px', textTransform: 'uppercase',
                transition: 'all 0.18s ease',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: isMobile ? '4px' : '8px',
              }}
            >
              ⚡ {isMobile ? 'SweepSense Flow Picker' : 'SWEEPSENSE'}
              {sweepSenseData && sweepSenseData.trades.length > 0 && (
                <span style={{
                  background: 'rgba(255,133,0,0.18)',
                  color: '#ff8500',
                  borderRadius: '9999px', fontSize: isMobile ? '9px' : '13px', fontWeight: 900, padding: isMobile ? '1px 6px' : '2px 9px', minWidth: isMobile ? '16px' : '22px', textAlign: 'center',
                }}>
                  {sweepSenseData.trades.length}
                </span>
              )}
            </button>
          )}
          {(!isMobile || panelTab === 'SWEEPSENSE') && panelTab === 'SWEEPSENSE' && (
            <button
              onClick={(e) => { e.stopPropagation(); setSweepSenseSummaryMode((v) => !v) }}
              style={{
                flex: isMobile ? undefined : '0 0 auto',
                padding: isMobile ? '6px 8px' : '12px 14px', cursor: 'pointer',
                border: sweepSenseSummaryMode ? '1px solid rgba(255,133,0,0.5)' : '1px solid rgba(255,255,255,0.10)',
                borderRadius: isMobile ? '6px' : '10px',
                background: sweepSenseSummaryMode
                  ? 'linear-gradient(180deg, rgba(255,133,0,0.22) 0%, rgba(255,133,0,0.06) 100%)'
                  : 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                boxShadow: sweepSenseSummaryMode
                  ? '0 0 10px rgba(255,133,0,0.25), inset 0 1px 0 rgba(255,255,255,0.15)'
                  : 'inset 0 1px 0 rgba(255,255,255,0.10)',
                color: sweepSenseSummaryMode ? '#ff8500' : '#ffffff',
                fontWeight: 900, fontSize: isMobile ? '9px' : '14px', letterSpacing: '0.5px', textTransform: 'uppercase',
                transition: 'all 0.18s ease',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', whiteSpace: 'nowrap',
              }}
            >
              <QuickFilterIcon icon="summary" color={sweepSenseSummaryMode ? '#ff8500' : '#ffffff'} />
              Summary
            </button>
          )}
          {(!isMobile || panelTab === 'TRACKER') && (
            <button
              onClick={() => setPanelTab('TRACKER')}
              style={{
                flex: 1, padding: isMobile ? '6px 6px' : '12px 8px', cursor: isMobile ? 'default' : 'pointer',
                border: panelTab === 'TRACKER' ? '1px solid rgba(255,133,0,0.45)' : '1px solid rgba(255,255,255,0.10)',
                borderRadius: isMobile ? '6px' : '10px',
                background: 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                boxShadow: panelTab === 'TRACKER'
                  ? '0 0 10px rgba(255,133,0,0.25), inset 0 1px 0 rgba(255,255,255,0.15)'
                  : 'inset 0 1px 0 rgba(255,255,255,0.10)',
                color: panelTab === 'TRACKER' ? '#ff8500' : '#ffffff',
                fontWeight: 900, fontSize: isMobile ? '9px' : '17px', letterSpacing: isMobile ? '0.5px' : '1px', textTransform: 'uppercase',
                transition: 'all 0.18s ease',
              }}
            >{isMobile ? 'A+ Tracker' : 'A+ TRACKER'}</button>
          )}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              flexShrink: 0,
              width: '48px',
              margin: '6px 6px 6px 0',
              padding: 0,
              borderRadius: '10px',
              background: 'linear-gradient(180deg, rgba(255,150,20,0.35) 0%, rgba(255,110,0,0.18) 100%)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              border: '1px solid rgba(255,133,0,0.55)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ff8500',
              fontSize: '24px',
              fontWeight: 700,
              lineHeight: 1,
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,133,0,0.4)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'linear-gradient(180deg, rgba(255,150,20,0.35) 0%, rgba(255,110,0,0.18) 100%)' }}
            aria-label="Close"
          >
            &times;
          </button>
        )}
      </div>

      {/* ── SWEEPSENSE TAB ── */}
      {/* Kept mounted (display toggle, not conditional render) so switching to the TRACKER
          tab and back does NOT unmount this component - an unmount would wipe its flowBiasRaw/
          earningsMonthCache state, forcing every per-ticker FlowBias/Earnings fetch to redo
          itself from scratch on every tab switch. */}
      <div style={{ flex: 1, display: panelTab === 'SWEEPSENSE' ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
        <SweepSenseTab data={sweepSenseData ?? null} allFlowData={allFlowData} isScanning={sweepSenseScanning} progress={sweepSenseProgress} summaryMode={sweepSenseSummaryMode} />
      </div>

      {/* ── TRACKING TAB ── */}
      <div style={{ flex: 1, display: panelTab === 'TRACKER' ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
        {/* Reuses the EXACT same SweepSense card design/logic (gauge, spam/gamma/structural
            detection, entry plan, breakdown gauge) for every explicitly tracked flow - the only
            difference from the SWEEPSENSE tab is there is no A-/A/A+ grade gate here (any tracked
            flow shows up), the real conviction score is just displayed on the card either way. */}
        <SweepSenseTab
          data={trackedFlowsSweepData ?? null}
          allFlowData={allFlowData}
          isScanning={false}
          progress={null}
          summaryMode={sweepSenseSummaryMode}
          onRemove={onRemoveTrackedFlow ?? removeFromFlowTracking}
        />
      </div>

    </div>
  )
}
