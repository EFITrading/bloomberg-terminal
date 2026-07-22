'use client'

import { TbStar } from 'react-icons/tb'

import React, { useCallback, useEffect, useRef, useState } from 'react'
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

function computeSpamLabel(
  rawTrades: Array<FlowBiasRawTrade>,
  cardType: 'call' | 'put',
  formatDate: (d: string) => string
): { label: string; trades: Array<FlowBiasRawTrade> } {
  const groups: Record<string, Array<FlowBiasRawTrade>> = {}
  for (const t of rawTrades) {
    if (t.tradeType === 'MULTI-LEG') continue
    if (t.type !== cardType || !t.expiry || !t.trade_timestamp) continue
    const key = `${t.strike}|${t.expiry}`
    if (!groups[key]) groups[key] = []
    groups[key].push(t)
  }
  let best: { key: string; trades: typeof rawTrades } | null = null
  for (const [key, trades] of Object.entries(groups)) {
    if (trades.length >= 3 && (!best || trades.length > best.trades.length)) best = { key, trades }
  }
  if (!best) return { label: 'No Spammer Detected', trades: [] }
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
  return { label: `Flow Spammer: $${strikeStr} ${label} ${formatDate(expiry)} Expiry - ${cadence}`, trades: best.trades }
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

function computeStructuralLabel(
  rawTrades: Array<FlowBiasRawTrade> | undefined,
  spot: number | undefined
): { label: string; trades: Array<FlowBiasRawTrade> } {
  if (!rawTrades || !rawTrades.length || !spot || spot <= 0) return { label: 'No Structural Formation Detected', trades: [] }

  const isSold = (fs?: string) => fs === 'B' || fs === 'BB'

  // Resistance = calls SOLD (B/BB) at/above spot - the seller is capping upside, a real overhead wall.
  const callsSoldAbove = rawTrades.filter((t) => t.tradeType !== 'MULTI-LEG' && t.type === 'call' && isSold(t.fillStyle) && t.strike >= spot)
  // Support = puts SOLD (B/BB) at/below spot - the seller is willing to buy stock there, a real floor.
  const putsSoldBelow = rawTrades.filter((t) => t.tradeType !== 'MULTI-LEG' && t.type === 'put' && isSold(t.fillStyle) && t.strike <= spot)

  const MIN_PRINTS = 3
  if (callsSoldAbove.length < MIN_PRINTS && putsSoldBelow.length < MIN_PRINTS) {
    return { label: 'No Structural Formation Detected', trades: [] }
  }

  if (callsSoldAbove.length >= putsSoldBelow.length) {
    const level = findConcentratedStrikeLevel(callsSoldAbove)
    const label = level !== null ? `Traders are building Structural Resistance near $${level.toFixed(2)}` : 'Traders are building Structural Resistance'
    return { label, trades: callsSoldAbove }
  }
  const level = findConcentratedStrikeLevel(putsSoldBelow)
  const label = level !== null ? `Traders are building Structural Support near $${level.toFixed(2)}` : 'Traders are building Structural Support'
  return { label, trades: putsSoldBelow }
}

function computeGammaLabel(
  rawTrades: Array<FlowBiasRawTrade>,
  cardType: 'call' | 'put',
  target1Level: number | null,
  targetUp: boolean,
  isLongTerm: boolean
): { label: string; trades: Array<FlowBiasRawTrade> } {
  if (isLongTerm) return { label: 'No Gamma Attack', trades: [] }
  if (target1Level === null) return { label: 'No Gamma Attack', trades: [] }
  const candidates = rawTrades.filter((t) => t.tradeType !== 'MULTI-LEG' && t.type === cardType)
  if (!candidates.length) return { label: 'No Gamma Attack', trades: [] }
  const beyond = candidates.filter((t) => (targetUp ? t.strike >= target1Level : t.strike <= target1Level))
  if (beyond.length > candidates.length / 2) return { label: 'Gamma Squeeze in Formation', trades: beyond }
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

// Flow sentiment gauge - 4 liquid-fill quadrant boxes (Bull/Bear Calls & Puts) plus the arc
// gauge/needle, identical visual language to the Market Overview / EFI toolbar's Options Flow
// dropdown "Flow Sentiment Gauge" (EFICharting.tsx), driven off the same breakdown percentages
// already computed for this trade's flow composition.
function FlowQuadrantBoxes({ breakdown, isMobileCard = false }: { breakdown: { buyCallsPct: number; bearCallsPct: number; buyPutsPct: number; bearPutsPct: number }; isMobileCard?: boolean }) {
  const uid = React.useId()
  const bc = breakdown.buyCallsPct
  const rc = breakdown.bearCallsPct
  const bp = breakdown.buyPutsPct
  const rp = breakdown.bearPutsPct
  const boxes = [
    { lbl: 'BULL', sub: 'CALLS', val: bc, color: '#10b981' },
    { lbl: 'BEAR', sub: 'CALLS', val: rc, color: '#4da6ff' },
    { lbl: 'BULL', sub: 'PUTS', val: bp, color: '#ffcc00' },
    { lbl: 'BEAR', sub: 'PUTS', val: rp, color: '#ff2222' },
  ]
  const maxVal = Math.max(bc, rc, bp, rp, 0.0001)
  const boxH = isMobileCard ? 62 : 107

  return (
    <div style={{
      display: isMobileCard ? 'grid' : 'flex',
      gridTemplateColumns: isMobileCard ? '54px' : undefined,
      flexDirection: isMobileCard ? undefined : 'row',
      alignItems: isMobileCard ? undefined : 'flex-end',
      gap: '3px', height: isMobileCard ? `${boxH * 4 + 9}px` : '118px',
    }}>
      <style>{`
        @keyframes ftpfq-glow-${uid} { 0%, 100% { filter: brightness(1); } 50% { filter: brightness(1.25); } }
      `}</style>
      {boxes.map((box, i) => {
        const pct = Math.max(0, Math.min(100, box.val))
        const isTop = pct === maxVal && pct > 0
        const barH = Math.max(8, (pct / 100) * boxH)
        return (
          <div key={i} style={{
            position: 'relative', width: '54px', height: `${boxH}px`, borderRadius: '4px', overflow: 'hidden',
            background: 'rgba(255,255,255,0.05)', border: `1px solid ${isTop ? box.color : 'rgba(255,255,255,0.1)'}`,
            boxShadow: isTop ? `0 0 10px ${box.color}55` : 'none',
            display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          }}>
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0, height: `${barH}px`,
              background: `linear-gradient(180deg, ${box.color} 0%, ${box.color}99 100%)`,
              animation: isTop ? `ftpfq-glow-${uid} 1.6s ease-in-out infinite` : 'none',
            }} />
            <span style={{
              position: 'relative', zIndex: 1, color: '#ffffff', fontSize: '10px', fontWeight: 900, letterSpacing: '0.06em',
              lineHeight: 1.15, textAlign: 'center', padding: '4px 2px 0', textShadow: '0 1px 2px rgba(0,0,0,0.9)',
            }}>
              {box.lbl}<br />{box.sub}
            </span>
            <span style={{
              position: 'relative', zIndex: 1, color: '#ffffff', fontSize: '18px', fontWeight: 900, textAlign: 'center',
              padding: '0 0 5px', textShadow: '0 1px 3px rgba(0,0,0,0.9)',
            }}>
              {pct.toFixed(0)}%
            </span>
          </div>
        )
      })}
    </div>
  )
}

function FlowSentimentGauge({ breakdown, isMobileCard = false }: { breakdown: { buyCallsPct: number; bearCallsPct: number; buyPutsPct: number; bearPutsPct: number }; isMobileCard?: boolean }) {
  const uid = React.useId()
  const bc = breakdown.buyCallsPct / 100
  const rc = breakdown.bearCallsPct / 100
  const bp = breakdown.buyPutsPct / 100
  const rp = breakdown.bearPutsPct / 100

  const score = Math.max(-1, Math.min(1, (bc * 0.8 + bp * 0.6 - rc * 0.6 - rp * 0.8) / 0.8))
  const gaugePercent = (score + 1) / 2
  const zones = [
    { start: 0, end: 0.2, color: '#ef4444', label: 'Bear Trend' },
    { start: 0.2, end: 0.4, color: '#f97316', label: 'Bear Chop' },
    { start: 0.4, end: 0.6, color: '#eab308', label: 'Neutral' },
    { start: 0.6, end: 0.8, color: '#84cc16', label: 'Bull Chop' },
    { start: 0.8, end: 1.0, color: '#22c55e', label: 'Bull Trend' },
  ]
  const zone = zones.find((z) => gaugePercent >= z.start && gaugePercent <= z.end) ?? zones[4]

  const gaugeW = isMobileCard ? 290 : 300
  const tk = 40
  const radius = (gaugeW - tk) / 2
  const C = Math.PI * radius
  const vbW = gaugeW
  const vbH = Math.round(gaugeW / 2) + 34
  const svgW = gaugeW
  const svgH = vbH
  const arcCY = Math.round(gaugeW / 2)
  const arcCX = gaugeW / 2
  const x0 = tk / 2, x1 = vbW - tk / 2
  const arcPath = `M ${x0} ${arcCY} A ${radius} ${radius} 0 0 1 ${x1} ${arcCY}`
  const needleAngle = (1 - gaugePercent) * Math.PI
  const needleLen = radius * 0.74
  const nx = arcCX + needleLen * Math.cos(needleAngle)
  const ny = arcCY - needleLen * Math.sin(needleAngle)
  const pctStr = `${score >= 0 ? '+' : ''}${(score * 100).toFixed(0)}%`
  const lfs = isMobileCard ? 15 : 16
  // Fill grows outward from the center (neutral) toward bear (left) or bull (right),
  // instead of always starting at the bear corner.
  const fillStart = Math.min(0.5, gaugePercent)
  const fillLen = Math.abs(gaugePercent - 0.5)
  const fillDasharray = `${Math.max(0.1, fillLen * C)} ${C * 10}`
  const fillDashoffset = -fillStart * C

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <svg width={svgW} height={svgH} viewBox={`0 0 ${vbW} ${vbH}`} style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <linearGradient id={`ftp-g-sheen-${uid}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.22)" />
            <stop offset="55%" stopColor="rgba(255,255,255,0.04)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.25)" />
          </linearGradient>
          <linearGradient id={`ftp-g-act-${uid}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.30)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.20)" />
          </linearGradient>
          <filter id={`ftp-glow-${uid}`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id={`ftp-glow-sm-${uid}`} x="-15%" y="-15%" width="130%" height="130%">
            <feGaussianBlur stdDeviation="2" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        <path d={arcPath} fill="none" stroke="rgba(0,0,0,0.6)" strokeWidth={tk + 6} strokeLinecap="round" />
        <path d={arcPath} fill="none" stroke="#0d1117" strokeWidth={tk} strokeLinecap="round" />
        <path d={arcPath} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={tk - 4} strokeLinecap="round" />

        {zones.map((z) => (
          <path key={z.start} d={arcPath} fill="none"
            stroke={z.color} strokeWidth={tk - 4} strokeLinecap="butt"
            strokeDasharray={`${(z.end - z.start) * C} ${C * 10}`}
            strokeDashoffset={z.start * C}
            opacity={0.4}
          />
        ))}

        {[0.2, 0.4, 0.6, 0.8].map((f) => {
          const a = (1 - f) * Math.PI
          const r1 = radius - tk / 2 - 2, r2 = radius + tk / 2 + 2
          return (
            <line key={f}
              x1={arcCX + r1 * Math.cos(a)} y1={arcCY - r1 * Math.sin(a)}
              x2={arcCX + r2 * Math.cos(a)} y2={arcCY - r2 * Math.sin(a)}
              stroke="rgba(0,0,0,0.8)" strokeWidth={4}
            />
          )
        })}

        <path d={arcPath} fill="none"
          stroke={zone.color} strokeWidth={tk - 2} strokeLinecap="round"
          strokeDasharray={fillDasharray}
          strokeDashoffset={fillDashoffset}
          opacity={1}
          filter={`url(#ftp-glow-${uid})`}
        />
        <path d={arcPath} fill="none"
          stroke={`url(#ftp-g-act-${uid})`} strokeWidth={Math.round((tk - 2) * 0.55)} strokeLinecap="round"
          strokeDasharray={fillDasharray}
          strokeDashoffset={fillDashoffset}
          opacity={0.7}
        />

        <path d={arcPath} fill="none"
          stroke={`url(#ftp-g-sheen-${uid})`} strokeWidth={tk - 2} strokeLinecap="round"
          opacity={0.55}
        />
        <path d={arcPath} fill="none"
          stroke="rgba(255,255,255,0.12)" strokeWidth={3} strokeLinecap="round"
          style={{ transform: `translate(0, -${tk / 2 - 2}px)` }}
          opacity={0.8}
        />

        {zones.map((z) => {
          const f = (z.start + z.end) / 2
          const a = (1 - f) * Math.PI
          const lr = radius
          const lx = arcCX + lr * Math.cos(a)
          const ly = arcCY - lr * Math.sin(a)
          const parts = z.label.split(' ')
          const lh = lfs
          return parts.map((word, wi) => {
            const yo = parts.length > 1 ? (wi - (parts.length - 1) / 2) * lh : 0
            return (
              <text key={`${z.start}-${wi}`}
                x={lx} y={ly + yo}
                textAnchor="middle" dominantBaseline="middle"
                fill={z.color} fontSize={lfs - 3}
                fontFamily="JetBrains Mono,monospace" fontWeight="900"
                stroke="#000000" strokeWidth={2.5} paintOrder="stroke"
              >{word}</text>
            )
          })
        })}

        <line x1={arcCX + 1} y1={arcCY + 1} x2={nx + 1} y2={ny + 1}
          stroke="rgba(0,0,0,0.5)" strokeWidth={5} strokeLinecap="round"
        />
        <line x1={arcCX} y1={arcCY} x2={nx} y2={ny}
          stroke={zone.color} strokeWidth={4.5} strokeLinecap="round"
          filter={`url(#ftp-glow-sm-${uid})`}
        />
        <line x1={arcCX} y1={arcCY} x2={nx} y2={ny}
          stroke="rgba(255,255,255,0.4)" strokeWidth={2} strokeLinecap="round"
        />

        <circle cx={arcCX} cy={arcCY} r={18} fill="rgba(0,0,0,0.95)" stroke="rgba(255,255,255,0.15)" strokeWidth="2" />
        <circle cx={arcCX} cy={arcCY} r={12} fill={zone.color} filter={`url(#ftp-glow-sm-${uid})`} />
        <circle cx={arcCX - 3.5} cy={arcCY - 3.5} r={4} fill="rgba(255,255,255,0.5)" />

        {!isMobileCard && (
          <>
            <text x={x0} y={arcCY + 30} fill="#ef4444" fontSize={16} fontFamily="JetBrains Mono,monospace" fontWeight="900">BEAR</text>
            <text x={x1} y={arcCY + 30} textAnchor="end" fill="#22c55e" fontSize={16} fontFamily="JetBrains Mono,monospace" fontWeight="900">BULL</text>
          </>
        )}

        {!isMobileCard && (
          <text x={arcCX} y={arcCY + 44} textAnchor="middle"
            fill="#ffffff" fontSize={23}
            fontFamily="JetBrains Mono,monospace" fontWeight="900"
          >{pctStr}</text>
        )}
      </svg>

      {!isMobileCard && (
        <div style={{ textAlign: 'center', fontSize: 15, fontFamily: 'JetBrains Mono,monospace', fontWeight: 900, color: zone.color, letterSpacing: '0.12em' }}>
          {zone.label.toUpperCase()}
        </div>
      )}
    </div>
  )
}

// ── SweepSense Tab: rich live view of every SweepSense-qualifying trade, sourced directly
// from the OptionsFlowTable data to the left. Auto-populates - no scan button needed.
function SweepSenseTab({
  data,
  isScanning,
  progress,
}: {
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
    }>
    stats: { buyCallsPct: number; bearCallsPct: number; buyPutsPct: number; bearPutsPct: number }
    bubbles: Array<{ ticker: string; premium: number; bias: 'bull' | 'bear'; biasStrength: number }>
  } | null
  isScanning?: boolean
  progress?: { current: number; total: number } | null
}) {
  const fmtPrem = (v: number) => (v >= 1000000 ? `$${(v / 1000000).toFixed(1)}M` : `$${(v / 1000).toFixed(0)}K`)
  const [openCharts, setOpenCharts] = useState<Set<string>>(new Set())
  // FlowBias detail modal - clicking Spam/Structural/Gamma rows shows exactly which raw prints
  // were matched to produce that label.
  const [flowBiasDetail, setFlowBiasDetail] = useState<{
    title: string
    trades: Array<FlowBiasRawTrade>
  } | null>(null)
  const [riskLevel, setRiskLevel] = useState<Record<string, 'PROB' | 'ONAROLE' | 'LUCKY'>>({})
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
            const isBullish = !fs || fs === 'N/A' || fs === 'A' || fs === 'AA'
            const isBearish = fs === 'B' || fs === 'BB'
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

  const progressPct = progress && progress.total > 0
    ? Math.max(0, Math.min(100, Math.round((progress.current / progress.total) * 100)))
    : null

  if (isScanning) {
    return (
      <div style={{
        flex: 1, position: 'relative', overflow: 'hidden',
        background: 'radial-gradient(ellipse at 50% 40%, rgba(0,12,4,0.98) 0%, rgba(0,0,0,0.99) 70%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '28px',
      }}>
        <style>{`
          @keyframes ssSpinGlow {
            0%, 100% { box-shadow: 0 0 14px rgba(168,255,62,0.5); }
            50% { box-shadow: 0 0 28px rgba(168,255,62,0.85); }
          }
        `}</style>
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
        <div style={{ color: '#22ff9c', fontWeight: 900, fontSize: '18px', letterSpacing: '1.5px', textAlign: 'center' }}>
          SCANNING SHORT-TERM &amp; LONG-TERM FLOW...
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

  return (
    <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '14px', display: 'flex', flexDirection: 'column', gap: '16px', background: '#000' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {trades.map(({ trade, convictionScore, pctMove, currentStockPrice, currentOptionPrice, contractPctChange, sigCode, sigColor, planText, qualifiedAt, breakdown, sigma, dte, spot, liveRawTrades }) => {
          const isCall = trade.type === 'call'
          const isLongTerm = trade.days_to_expiry >= 30
          const fs = trade.fill_style || ''
          const tradeTypeVal = trade.classification || trade.trade_type
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
          const spamResult = flowBiasReady ? computeSpamLabel(flowBiasTrades!, trade.type, formatDate) : { label: 'Loading…', trades: [] }
          // Structural support = puts SOLD (B/BB) at/below spot (a real floor); resistance = calls
          // SOLD (B/BB) at/above spot (a real overhead wall). Uses the SAME live in-memory flow feed
          // the quadrant boxes/gauge use (liveRawTrades) - no extra DB round-trip needed.
          const structuralResult = computeStructuralLabel(liveRawTrades, spot)
          const gammaResult = flowBiasReady ? computeGammaLabel(flowBiasTrades!, trade.type, target1, targetUp, isLongTerm) : { label: 'Loading…', trades: [] }
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
          return (
            <div
              key={flowId}
              style={{
                position: 'relative', overflow: 'hidden',
                background: '#000',
                border: `1px solid ${convColor}44`,
                clipPath: isMobileCard ? 'none' : 'polygon(0 0, calc(100% - 22px) 0, 100% 22px, 100% 100%, 22px 100%, 0 calc(100% - 22px))',
                boxShadow: `0 0 0 1px rgba(255,255,255,0.03), 0 18px 40px rgba(0,0,0,0.65), 0 0 40px -12px ${dirGlow}`,
                display: 'grid', gridTemplateColumns: isMobileCard ? '1fr' : '108px 1fr',
              }}
            >
              {/* ── LEFT RAIL: conviction dial + direction + duration, stacked vertically ── */}
              <div style={{
                position: 'relative', display: 'flex',
                flexDirection: isMobileCard ? 'row' : 'column',
                alignItems: 'center',
                justifyContent: isMobileCard ? 'flex-start' : 'flex-start',
                flexWrap: isMobileCard ? 'wrap' : 'nowrap',
                gap: isMobileCard ? '10px' : '10px', padding: isMobileCard ? '10px 12px' : '18px 8px 16px',
                background: `linear-gradient(180deg, ${convColor}22 0%, #000 55%)`,
                borderRight: isMobileCard ? 'none' : `1px solid ${convColor}33`,
                borderBottom: isMobileCard ? `1px solid ${convColor}33` : 'none',
              }}>
                <span style={{ color: '#ffffff', fontSize: '17px', fontWeight: 900, letterSpacing: '-0.02em' }}>{trade.underlying_ticker}</span>
                <div style={{ position: 'relative', width: isMobileCard ? '54px' : '78px', height: isMobileCard ? '54px' : '78px' }}>
                  <svg width={isMobileCard ? 54 : 78} height={isMobileCard ? 54 : 78} viewBox="0 0 84 84" style={{ transform: 'rotate(-90deg)' }}>
                    <circle cx="42" cy="42" r="34" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
                    <circle
                      cx="42" cy="42" r="34" fill="none" stroke={convColor} strokeWidth="6" strokeLinecap="round"
                      strokeDasharray={ringCircumference} strokeDashoffset={ringOffset}
                      style={{ filter: `drop-shadow(0 0 5px ${convColor})` }}
                    />
                  </svg>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ color: '#ffffff', fontSize: isMobileCard ? '22px' : '32px', fontWeight: 900, lineHeight: 1 }}>{convictionScore}</span>
                    {!isMobileCard && <span style={{ color: convColor, fontSize: '10px', fontWeight: 800, letterSpacing: '0.15em' }}>SCORE</span>}
                  </div>
                </div>
                {!isMobileCard && (
                  <div style={{ display: 'flex', gap: '1px' }}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <span key={i} style={{ color: i < filledStars ? convColor : 'rgba(255,255,255,0.15)', fontSize: '14px' }}>★</span>
                    ))}
                  </div>
                )}
                <div style={{
                  marginTop: isMobileCard ? 0 : '2px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
                  color: dirColor, fontWeight: 900,
                }}>
                  <span style={{ fontSize: isMobileCard ? '18px' : '25px', lineHeight: 1 }}>{targetUp ? '▲' : '▼'}</span>
                  <span style={{ fontSize: '11px', letterSpacing: '0.1em' }}>{targetUp ? 'BULLISH' : 'BEARISH'}</span>
                </div>

                {!isMobileCard && <div style={{ flexGrow: 0.5 }} />}

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' }}>
                  <span style={{ color: '#ffffff', fontSize: '10px', fontWeight: 800, letterSpacing: '0.08em' }}>TAKEN</span>
                  <span style={{ color: '#22d3ee', fontSize: '13px', fontWeight: 800 }}>{formatTime(trade.trade_timestamp)}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px', marginTop: isMobileCard ? 0 : '4px' }}>
                  <span style={{ color: '#ffffff', fontSize: '10px', fontWeight: 800, letterSpacing: '0.08em' }}>QUALIFIED</span>
                  <span style={{ color: '#a8ff3e', fontSize: '13px', fontWeight: 800 }}>{formatTime(new Date(qualifiedAt).toISOString())}</span>
                </div>

                {!isMobileCard && <div style={{ flexGrow: 1 }} />}
              </div>

              {/* ── RIGHT CONTENT ── */}
              <div style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
                {/* Header strip: ticker + badges + strike/expiry/size/premium all in one row, POSITION on the right */}
                <div style={{
                  position: 'relative', padding: isMobileCard ? '12px 14px 10px' : '16px 20px 14px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)',
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    {!isMobileCard && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', color: isCall ? '#22c55e' : '#ef4444',
                        fontWeight: 900, fontSize: '13px', letterSpacing: '0.05em',
                        background: isCall ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)', borderRadius: '4px', padding: '3px 8px',
                        border: `1px solid ${isCall ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'}`,
                      }}>
                        {trade.type.toUpperCase()}
                      </span>
                    )}
                    <span style={{
                      display: 'inline-block', fontWeight: 800, fontSize: isMobileCard ? '13px' : '12px', letterSpacing: '0.08em',
                      padding: '4px 10px', clipPath: 'polygon(6px 0, 100% 0, calc(100% - 6px) 100%, 0 100%)',
                      background: isSweepBadge ? '#FFD700' : isBlockBadge ? '#00e5ff' : '#fff',
                      color: '#000',
                    }}>
                      {tradeTypeVal}
                    </span>

                    <span style={{ color: '#ffffff', fontSize: isMobileCard ? '13px' : '16px', fontWeight: 700 }}>
                      ${trade.strike} {trade.type.toUpperCase()}
                    </span>
                    <span style={{ color: '#ffffff', fontSize: isMobileCard ? '13px' : '16px', fontWeight: 700 }}>
                      {formatDate(trade.expiry)}
                    </span>
                    <span style={{ fontSize: isMobileCard ? '13px' : '16px', fontWeight: 700 }}>
                      <span style={{ color: '#22d3ee' }}>{trade.trade_size.toLocaleString()}</span>
                      <span style={{ color: '#ffffff' }}>@${trade.premium_per_contract.toFixed(2)}</span>
                      {['A', 'AA', 'B', 'BB'].includes(fs) && (
                        <span style={{
                          marginLeft: '4px', fontSize: isMobileCard ? '13px' : '12px', fontWeight: 800, padding: '2px 6px', borderRadius: '4px',
                          color: fs === 'A' ? '#4ade80' : fs === 'AA' ? '#86efac' : fs === 'B' ? '#f87171' : '#fca5a5',
                          background: fs === 'A' ? 'rgba(74,222,128,0.1)' : fs === 'AA' ? 'rgba(134,239,172,0.1)' : fs === 'B' ? 'rgba(248,113,113,0.1)' : 'rgba(252,165,165,0.1)',
                          border: `1px solid ${fs === 'A' ? 'rgba(74,222,128,0.3)' : fs === 'AA' ? 'rgba(134,239,172,0.3)' : fs === 'B' ? 'rgba(248,113,113,0.3)' : 'rgba(252,165,165,0.3)'}`,
                        }}>{fs}</span>
                      )}
                    </span>
                    <span style={{ color: '#4ade80', fontSize: isMobileCard ? '13px' : '16px', fontWeight: 700 }}>
                      {fmtPrem(trade.total_premium)}
                    </span>

                    <span style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                      <span style={{ color: '#ffffff', fontSize: isMobileCard ? '13px' : '19px', fontWeight: 900 }}>
                        {currentOptionPrice !== null ? fmtPrem(currentOptionPrice * trade.trade_size * 100) : '--'}
                      </span>
                      <span style={{ color: contractPctChange !== null && contractPctChange >= 0 ? '#22c55e' : '#ef4444', fontSize: isMobileCard ? '13px' : '17px', fontWeight: 900 }}>
                        {contractPctChange !== null ? `${contractPctChange >= 0 ? '+' : ''}${contractPctChange.toFixed(1)}%` : '--'}
                      </span>
                    </span>

                    <span style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                      <span style={{ color: '#ffffff', fontSize: isMobileCard ? '13px' : '14px', fontWeight: 700 }}>
                        {trade.spot_price > 0 ? `$${trade.spot_price.toFixed(2)}` : '--'}
                      </span>
                      <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: isMobileCard ? '13px' : '12px' }}>{'>'}</span>
                      <span style={{
                        fontSize: isMobileCard ? '13px' : '14px', fontWeight: 700,
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
                </div>

                {/* Entry plan - angled callout ribbon */}
                <div style={{
                  position: 'relative', margin: '12px 16px 0', padding: '10px 14px 10px 18px',
                  background: `linear-gradient(90deg, ${sigColor}1a 0%, transparent 100%)`,
                  borderLeft: `3px solid ${sigColor}`, borderRadius: '2px',
                }}>
                  <button
                    onClick={() => setOpenCharts((prev) => {
                      const next = new Set(prev)
                      if (next.has(flowId)) next.delete(flowId)
                      else next.add(flowId)
                      return next
                    })}
                    style={{
                      position: 'absolute', top: '8px', right: '10px', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '4px',
                      background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
                      color: '#ffffff', fontSize: '10px', fontWeight: 800, letterSpacing: '0.06em',
                    }}
                  >
                    Chart{openCharts.has(flowId) ? '−' : '+'}
                  </button>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: sigColor, boxShadow: `0 0 6px ${sigColor}` }} />
                    <span style={{ color: sigColor, fontWeight: 900, fontSize: '13px', letterSpacing: '0.1em' }}>ENTRY PLAN</span>
                  </div>
                  <div style={{ color: '#ffffff', fontSize: '15px', lineHeight: 1.5 }}>{aiTakeText}</div>
                </div>

                {/* Build A Trade - risk-profile driven strike/expiry rebuilder */}
                <div style={{ padding: isMobileCard ? '6px 12px 0' : '6px 16px 0' }}>
                  <div style={{
                    display: 'flex', gap: isMobileCard ? '4px' : '8px', flexWrap: isMobileCard ? 'nowrap' : 'wrap', alignItems: 'center',
                    overflowX: isMobileCard ? 'auto' : undefined,
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
                          cursor: 'pointer', padding: isMobileCard ? '6px 8px' : '8px 14px', borderRadius: '5px', fontWeight: 900,
                          fontSize: isMobileCard ? '10px' : '12px', letterSpacing: '0.06em', whiteSpace: 'nowrap', flexShrink: 0,
                          color: opt.color,
                          background: '#000000',
                          border: riskLevel[flowId] === opt.key ? `1px solid ${opt.color}` : '1px solid rgba(255,255,255,0.1)',
                          boxShadow: riskLevel[flowId] === opt.key ? `0 0 10px ${opt.color}66, inset 0 0 8px ${opt.color}33` : 'none',
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}

                    <div style={{ display: 'flex', alignItems: 'center', gap: isMobileCard ? '4px' : '6px', marginLeft: isMobileCard ? '4px' : 'auto', flexShrink: 0 }}>
                      <span style={{ color: '#ffffff', fontSize: isMobileCard ? '10px' : '11px', fontWeight: 800, letterSpacing: '0.06em', marginRight: '2px', whiteSpace: 'nowrap' }}>
                        {isMobileCard ? 'FB:' : 'FlowBias :'}
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
                              cursor: 'pointer', padding: isMobileCard ? '6px 8px' : '8px 12px', borderRadius: '6px', fontWeight: 800,
                              fontSize: isMobileCard ? '10px' : '11px', letterSpacing: '0.06em', whiteSpace: 'nowrap', flexShrink: 0,
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

                  {chainStillLoading && (
                    <div style={{ marginTop: '10px', color: 'rgba(255,255,255,0.4)', fontSize: '12px', fontWeight: 700 }}>
                      Fetching data…
                    </div>
                  )}
                </div>

                {/* Targets ladder + sentiment cluster - one neat single row (stacks vertically on mobile) */}
                <div style={{
                  display: 'flex', flexWrap: isMobileCard ? 'wrap' : 'nowrap', gap: '18px', alignItems: isMobileCard ? 'stretch' : 'flex-start',
                  padding: '10px 16px 0', overflowX: isMobileCard ? 'visible' : 'auto',
                }}>
                  <div style={{ flex: isMobileCard ? '1 1 auto' : '1 1 380px', minWidth: isMobileCard ? '0' : '340px', width: isMobileCard ? '100%' : undefined, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {[
                      { lbl: 'TARGET 1', stock: ladderTarget1, opt: ladderT1Opt, pct: ladderT1Pct, w: '62%' },
                      { lbl: 'TARGET 2', stock: ladderTarget2, opt: ladderT2Opt, pct: ladderT2Pct, w: '84%' },
                      { lbl: 'STOP', stock: ladderStopStock, opt: ladderStopOpt, pct: ladderStopPct, w: '38%', isStop: true },
                    ].map((row) => (
                      <div key={row.lbl} style={{
                        display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 10px',
                        background: row.isStop ? 'rgba(255,0,0,0.06)' : 'rgba(0,255,0,0.05)',
                        borderLeft: `3px solid ${row.isStop ? '#ff3333' : '#00e676'}`,
                      }}>
                        <span style={{
                          flex: '0 0 84px', fontSize: '12px', fontWeight: 900, letterSpacing: '0.08em', whiteSpace: 'nowrap',
                          color: row.isStop ? '#ff6666' : '#5ef2a6',
                        }}>{row.lbl}</span>
                        <div style={{ flex: '0 0 auto', width: '70px', height: '5px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ width: row.w, height: '100%', background: row.isStop ? '#ff3333' : '#00e676' }} />
                        </div>
                        <span style={{ color: '#ffffff', fontSize: '15px', fontWeight: 800 }}>
                          {typeof row.stock === 'number' ? `$${row.stock.toFixed(2)}` : 'N/A'}
                        </span>
                        <span style={{ color: '#ffffff', fontSize: '13px' }}>/</span>
                        <span style={{ color: row.isStop ? '#ff6666' : '#5ef2a6', fontSize: '15px', fontWeight: 800 }}>
                          {typeof row.opt === 'number' ? `$${row.opt.toFixed(2)}` : 'N/A'}
                        </span>
                        {typeof row.pct === 'number' && (
                          <span style={{
                            marginLeft: 'auto', fontWeight: 800, fontSize: '13px', padding: '1px 6px', borderRadius: '4px',
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

                  {/* Sentiment cluster: quadrant boxes + gauge, same row as the ladder. FlowBias
                      rows (Spam / Structural / Gamma) sit directly below the 4 boxes only - NOT
                      stretched across the gauge/whole row - so the boxes column shrink-wraps.
                      On mobile: boxes stay a 1-column/4-row stack on the left; FlowBias text sits
                      to the right at normal compact size, with the gauge nested directly below
                      the text (sized to fit the leftover height so the whole cluster matches the
                      boxes' total height). */}
                  {isMobileCard ? (
                    <div style={{
                      display: 'flex', flexDirection: 'row',
                      gap: '8px', alignItems: 'flex-start', flexWrap: 'nowrap',
                      marginTop: 0, opacity: histLoading ? 0.4 : 1,
                    }}>
                      <FlowQuadrantBoxes breakdown={effectiveBreakdown} isMobileCard={isMobileCard} />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%', height: '257px' }}>
                        {[
                          { text: spamLabel, active: spamLabel !== 'No Spammer Detected' && spamLabel !== 'Loading…', title: 'Flow Spammer', trades: spamResult.trades },
                          { text: structuralLabel, active: structuralLabel !== 'No Structural Formation Detected', title: 'Structural Support/Resistance', trades: structuralResult.trades },
                          { text: gammaLabel, active: gammaLabel === 'Gamma Squeeze in Formation', title: 'Gamma Attack', trades: gammaResult.trades },
                        ].map((row, i) => (
                          <div
                            key={i}
                            onClick={() => row.active && row.trades.length > 0 && setFlowBiasDetail({ title: `${trade.underlying_ticker} - ${row.title}`, trades: row.trades })}
                            style={{
                              display: 'flex', alignItems: 'center', padding: '4px 8px', borderRadius: '4px',
                              background: row.active ? 'rgba(255,140,0,0.1)' : 'rgba(255,255,255,0.03)',
                              border: `1px solid ${row.active ? 'rgba(255,140,0,0.35)' : 'rgba(255,255,255,0.08)'}`,
                              cursor: row.active && row.trades.length > 0 ? 'pointer' : 'default',
                            }}
                          >
                            <span style={{ color: row.active ? '#ff8c00' : '#ffffff', fontSize: '11px', fontWeight: 800, whiteSpace: 'normal' }}>
                              {row.text}
                            </span>
                          </div>
                        ))}
                        <div style={{ display: 'flex', justifyContent: 'center', flex: 1 }}>
                          <FlowSentimentGauge breakdown={effectiveBreakdown} isMobileCard={isMobileCard} />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'row', gap: '14px', alignItems: 'flex-start', flexWrap: 'nowrap', marginTop: '-14px', opacity: histLoading ? 0.4 : 1 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <FlowQuadrantBoxes breakdown={effectiveBreakdown} isMobileCard={isMobileCard} />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '228px' }}>
                          {[
                            { text: spamLabel, active: spamLabel !== 'No Spammer Detected' && spamLabel !== 'Loading…', title: 'Flow Spammer', trades: spamResult.trades },
                            { text: structuralLabel, active: structuralLabel !== 'No Structural Formation Detected', title: 'Structural Support/Resistance', trades: structuralResult.trades },
                            { text: gammaLabel, active: gammaLabel === 'Gamma Squeeze in Formation', title: 'Gamma Attack', trades: gammaResult.trades },
                          ].map((row, i) => (
                            <div
                              key={i}
                              onClick={() => row.active && row.trades.length > 0 && setFlowBiasDetail({ title: `${trade.underlying_ticker} - ${row.title}`, trades: row.trades })}
                              style={{
                                display: 'flex', alignItems: 'center', padding: '4px 8px', borderRadius: '4px',
                                background: row.active ? 'rgba(255,140,0,0.1)' : 'rgba(255,255,255,0.03)',
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
                      <FlowSentimentGauge breakdown={effectiveBreakdown} isMobileCard={isMobileCard} />
                    </div>
                  )}
                </div>

                {/* Chart */}
                {openCharts.has(flowId) && (
                  <div style={{ padding: '0 16px 16px' }}>
                    <TradeCardChart
                      symbol={trade.underlying_ticker}
                      target1Price={typeof ladderTarget1 === 'number' ? ladderTarget1 : undefined}
                      target2Price={typeof ladderTarget2 === 'number' ? ladderTarget2 : undefined}
                      stopPrice={typeof ladderStopStock === 'number' ? ladderStopStock : undefined}
                    />
                  </div>
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
  parentOptionPrices,
  parentStockPrices,
  sweepSenseData,
  sweepSenseScanning,
  sweepSenseProgress,
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
    }>
    stats: { buyCallsPct: number; bearCallsPct: number; buyPutsPct: number; bearPutsPct: number }
    bubbles: Array<{ ticker: string; premium: number; bias: 'bull' | 'bear'; biasStrength: number }>
  } | null
  sweepSenseScanning?: boolean
  sweepSenseProgress?: { current: number; total: number } | null
} = {}) {
  const [panelTab, setPanelTab] = useState<'TRACKER' | 'SWEEPSENSE'>(initialTab ?? 'SWEEPSENSE')
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
      {panelTab === 'SWEEPSENSE' && (
        <SweepSenseTab data={sweepSenseData ?? null} isScanning={sweepSenseScanning} progress={sweepSenseProgress} />
      )}

      {/* ── TRACKING TAB ── */}
      <div style={{ flex: 1, display: panelTab === 'TRACKER' ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
        {/* Panel Header */}
        <div
          className="ftp-header z-10 border-b border-gray-800"
          style={{ flexShrink: 0, padding: '8px 12px', position: 'relative', background: 'linear-gradient(180deg,#111 0%,#0a0a0a 100%)' }}
        >
          {/* Filters — single row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'nowrap', overflowX: 'auto' }}>
            {/* Type pills */}
            {(['ALL', 'NOTABLE', 'LEAPS'] as const).map((t) => {
              const active = flowTrackingFilters.typeFilter === t
              return (
                <button key={t} onClick={() => setFlowTrackingFilters((prev) => ({ ...prev, typeFilter: t }))} style={{ fontSize: '13px', fontWeight: 800, padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', border: `1px solid ${active ? '#ff8500' : '#2a2a2a'}`, background: 'linear-gradient(180deg,#1a1a1a 0%,#111 100%)', color: active ? '#ff8500' : '#ffffff', transition: 'color 0.15s, border-color 0.15s', letterSpacing: '0.5px', flexShrink: 0 }}>{t}</button>
              )
            })}
            <div style={{ width: '1px', height: '22px', background: '#2a2a2a', flexShrink: 0 }} />
            {/* Grade pills */}
            {(isMobile ? (['ALL', 'A', 'B', 'C'] as const) : (['ALL', 'A', 'B', 'C', 'D', 'F'] as const)).map((g) => {
              const active = flowTrackingFilters.gradeFilter === g
              const gc = g === 'ALL' ? '#ff8500' : g === 'A' ? '#00ff88' : g === 'B' ? '#22d3ee' : g === 'C' ? '#fbbf24' : g === 'D' ? '#fb923c' : '#ef4444'
              return (
                <button key={g} onClick={() => setFlowTrackingFilters((prev) => ({ ...prev, gradeFilter: g }))} style={{ fontSize: '13px', fontWeight: 800, padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', border: `1px solid ${active ? gc : '#2a2a2a'}`, background: 'linear-gradient(180deg,#1a1a1a 0%,#111 100%)', color: active ? gc : '#ffffff', transition: 'color 0.15s, border-color 0.15s', flexShrink: 0 }}>{g}</button>
              )
            })}
            <div style={{ width: '1px', height: '22px', background: '#2a2a2a', flexShrink: 0 }} />
            {/* Sort buttons */}
            <button onClick={() => setFlowTrackingFilters((prev) => ({ ...prev, gradeSort: prev.gradeSort === 'HIGH' ? 'LOW' : prev.gradeSort === 'LOW' ? 'NONE' : 'HIGH', contractsSort: 'NONE', premiumSort: 'NONE', expirySort: 'NONE' }))} style={{ fontSize: '13px', fontWeight: 700, padding: '6px 11px', borderRadius: '6px', cursor: 'pointer', border: `1px solid ${flowTrackingFilters.gradeSort !== 'NONE' ? '#a78bfa' : '#2a2a2a'}`, background: 'linear-gradient(180deg,#1a1a1a 0%,#111 100%)', color: flowTrackingFilters.gradeSort !== 'NONE' ? '#a78bfa' : '#ffffff', transition: 'color 0.15s, border-color 0.15s', whiteSpace: 'nowrap' as const, flexShrink: 0 }}>Grade {flowTrackingFilters.gradeSort === 'HIGH' ? '↓' : flowTrackingFilters.gradeSort === 'LOW' ? '↑' : '↕'}</button>
            <button onClick={() => setFlowTrackingFilters((prev) => ({ ...prev, contractsSort: prev.contractsSort === 'HIGH' ? 'LOW' : prev.contractsSort === 'LOW' ? 'NONE' : 'HIGH', gradeSort: 'NONE', premiumSort: 'NONE', expirySort: 'NONE' }))} style={{ fontSize: '13px', fontWeight: 700, padding: '6px 11px', borderRadius: '6px', cursor: 'pointer', border: `1px solid ${flowTrackingFilters.contractsSort !== 'NONE' ? '#22d3ee' : '#2a2a2a'}`, background: 'linear-gradient(180deg,#1a1a1a 0%,#111 100%)', color: flowTrackingFilters.contractsSort !== 'NONE' ? '#22d3ee' : '#ffffff', transition: 'color 0.15s, border-color 0.15s', whiteSpace: 'nowrap' as const, flexShrink: 0 }}>Ct% {flowTrackingFilters.contractsSort === 'HIGH' ? '↓' : flowTrackingFilters.contractsSort === 'LOW' ? '↑' : '↕'}</button>
            <button onClick={() => setFlowTrackingFilters((prev) => ({ ...prev, premiumSort: prev.premiumSort === 'HIGH' ? 'LOW' : prev.premiumSort === 'LOW' ? 'NONE' : 'HIGH', gradeSort: 'NONE', contractsSort: 'NONE', expirySort: 'NONE' }))} style={{ fontSize: '13px', fontWeight: 700, padding: '6px 11px', borderRadius: '6px', cursor: 'pointer', border: `1px solid ${flowTrackingFilters.premiumSort !== 'NONE' ? '#4ade80' : '#2a2a2a'}`, background: 'linear-gradient(180deg,#1a1a1a 0%,#111 100%)', color: flowTrackingFilters.premiumSort !== 'NONE' ? '#4ade80' : '#ffffff', transition: 'color 0.15s, border-color 0.15s', whiteSpace: 'nowrap' as const, flexShrink: 0 }}>Prem {flowTrackingFilters.premiumSort === 'HIGH' ? '↓' : flowTrackingFilters.premiumSort === 'LOW' ? '↑' : '↕'}</button>
            <button onClick={() => setFlowTrackingFilters((prev) => ({ ...prev, expirySort: prev.expirySort === 'NEAR' ? 'FAR' : prev.expirySort === 'FAR' ? 'NONE' : 'NEAR', gradeSort: 'NONE', contractsSort: 'NONE', premiumSort: 'NONE' }))} style={{ fontSize: '13px', fontWeight: 700, padding: '6px 11px', borderRadius: '6px', cursor: 'pointer', border: `1px solid ${flowTrackingFilters.expirySort !== 'NONE' ? '#fb923c' : '#2a2a2a'}`, background: 'linear-gradient(180deg,#1a1a1a 0%,#111 100%)', color: flowTrackingFilters.expirySort !== 'NONE' ? '#fb923c' : '#ffffff', transition: 'color 0.15s, border-color 0.15s', whiteSpace: 'nowrap' as const, flexShrink: 0 }}>Exp {flowTrackingFilters.expirySort === 'NEAR' ? '↑' : flowTrackingFilters.expirySort === 'FAR' ? '↓' : '↕'}</button>
            {/* Flows count */}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
              <span style={{ fontSize: '11px', letterSpacing: '1px', color: '#555', fontWeight: 700, textTransform: 'uppercase' as const }}>Flows</span>
              <span style={{ fontSize: '16px', fontWeight: 900, color: '#ff8500' }}>{trackedFlows.length}</span>
            </div>
          </div>
        </div>
        {/* Tracking scrollable content */}
        <div
          className="overflow-y-auto overflow-x-hidden p-3"
          style={isMobile ? { flex: '1 1 0', minHeight: 0 } : { flex: '1 1 45%', minHeight: 0, maxHeight: '45%' }}
        >
          {trackedFlows.length === 0 ? (
            <div className="text-center py-12 text-orange-400">
              <TbStar className="w-16 h-16 text-orange-500 mb-4 mx-auto" />
              <p className="text-lg font-semibold">No flows tracked yet</p>
              <p className="text-sm mt-2">Click the star icon next to any flow to track it</p>
            </div>
          ) : (
            (() => {
              // Use parent's comboTradeMap (built from all trades with opposite-leg detection)
              // If not provided, fall back to opposite-leg detection within tracked flows
              let comboMap: Map<string, boolean>
              if (comboTradeMapFromParent) {
                comboMap = comboTradeMapFromParent
              } else {
                comboMap = new Map<string, boolean>()
                const byBase = new Map<string, typeof trackedFlows>()
                trackedFlows.forEach((f) => {
                  const key = `${f.underlying_ticker}-${f.expiry}`
                  if (!byBase.has(key)) byBase.set(key, [])
                  byBase.get(key)!.push(f)
                })
                byBase.forEach((trades) => {
                  trades.forEach((trade) => {
                    const tradeKey = `${trade.underlying_ticker}-${trade.strike}-${trade.expiry}-${trade.type}-${trade.fill_style || ''}`
                    const isCall = trade.type === 'call'
                    const fillStyle = trade.fill_style || ''
                    const hasCombo = trades.some((t) => {
                      if (Math.abs(t.strike - trade.strike) > trade.strike * 0.1) return false
                      const oppFill = t.fill_style || ''
                      const oppType = t.type.toLowerCase()
                      if (isCall && (fillStyle === 'A' || fillStyle === 'AA'))
                        return oppType === 'put' && (oppFill === 'B' || oppFill === 'BB')
                      if (isCall && (fillStyle === 'B' || fillStyle === 'BB'))
                        return oppType === 'put' && (oppFill === 'A' || oppFill === 'AA')
                      if (!isCall && (fillStyle === 'B' || fillStyle === 'BB'))
                        return oppType === 'call' && (oppFill === 'A' || oppFill === 'AA')
                      if (!isCall && (fillStyle === 'A' || fillStyle === 'AA'))
                        return oppType === 'call' && (oppFill === 'B' || oppFill === 'BB')
                      return false
                    })
                    comboMap.set(tradeKey, hasCombo)
                  })
                })
              }
              // Use real RS/stddev data from parent if available, otherwise fall back to defaults
              const emptyRS = relativeStrengthData ?? new Map<string, number>()
              const defaultStdDevs =
                ownStdDevs.size > 0
                  ? ownStdDevs
                  : (historicalStdDevsFromParent ?? new Map<string, number>())

              return trackedFlows
                .filter((flow) => {
                  const expiryDate = new Date(flow.expiry)
                  const now = new Date()
                  expiryDate.setHours(0, 0, 0, 0)
                  now.setHours(0, 0, 0, 0)
                  if (now > expiryDate) return false

                  const expiry = flow.expiry.replace(/-/g, '').slice(2)
                  const strikeFormatted = String(Math.round(flow.strike * 1000)).padStart(8, '0')
                  const optionType = flow.type.toLowerCase() === 'call' ? 'C' : 'P'
                  const optionTicker = `O:${normalizeTickerForOptions(flow.underlying_ticker)}${expiry}${optionType}${strikeFormatted}`
                  const currentPrice = effectiveOptionPrices[optionTicker]
                  const entryPrice = (flow as any).originalPrice || flow.premium_per_contract

                  // Type filter
                  if (flowTrackingFilters.typeFilter === 'NOTABLE') {
                    const fs = flow.fill_style || ''
                    const isNotable = fs === 'A' || fs === 'AA' || fs === 'B' || fs === 'BB' || flow.trade_type === 'SWEEP' || flow.trade_type === 'BLOCK'
                    if (!isNotable) return false
                  }
                  if (flowTrackingFilters.typeFilter === 'LEAPS') {
                    const todayMs = new Date().setHours(0, 0, 0, 0)
                    const expD = new Date(flow.expiry)
                    const expLocal = new Date(expD.getUTCFullYear(), expD.getUTCMonth(), expD.getUTCDate())
                    if ((expLocal.getTime() - todayMs) / 86400000 < 180) return false
                  }

                  if (flowTrackingFilters.gradeFilter !== 'ALL') {
                    const flowWithOriginalPrice = { ...flow, premium_per_contract: entryPrice }
                    const result = calculateFlowGrade(
                      flowWithOriginalPrice,
                      effectiveOptionPrices,
                      effectiveStockPrices,
                      emptyRS,
                      defaultStdDevs,
                      comboMap
                    )
                    if (result.grade === 'N/A') return false
                    const gradeChar = result.grade.charAt(0)
                    if (gradeChar !== flowTrackingFilters.gradeFilter) return false
                  }
                  if (flowTrackingFilters.showDownSixtyPlus && currentPrice && currentPrice > 0) {
                    const rawPct = ((currentPrice - entryPrice) / entryPrice) * 100
                    const flowFill = flow.fill_style || ''
                    const isSold = flowFill === 'B' || flowFill === 'BB'
                    if ((isSold ? -rawPct : rawPct) > -60) return false
                  }
                  if (flowTrackingFilters.showWeeklies) {
                    const todayMs = new Date().setHours(0, 0, 0, 0)
                    const expD = new Date(flow.expiry)
                    const expLocal = new Date(expD.getUTCFullYear(), expD.getUTCMonth(), expD.getUTCDate())
                    const daysToExpiry = Math.floor((expLocal.getTime() - todayMs) / 86400000)
                    if (daysToExpiry > 7) return false
                  }
                  return true
                })
                .sort((a, b) => {
                  if (flowTrackingFilters.premiumSort !== 'NONE') {
                    const premA = ((a as any).originalPrice || a.premium_per_contract) * a.trade_size * 100
                    const premB = ((b as any).originalPrice || b.premium_per_contract) * b.trade_size * 100
                    const diff = premA - premB
                    return flowTrackingFilters.premiumSort === 'HIGH' ? -diff : diff
                  }
                  if (flowTrackingFilters.expirySort !== 'NONE') {
                    const diff = new Date(a.expiry).getTime() - new Date(b.expiry).getTime()
                    return flowTrackingFilters.expirySort === 'NEAR' ? diff : -diff
                  }
                  if (flowTrackingFilters.gradeSort !== 'NONE') {
                    const gradeOrder: Record<string, number> = { 'A+': 0, 'A': 1, 'A-': 2, 'B+': 3, 'B': 4, 'B-': 5, 'C+': 6, 'C': 7, 'C-': 8, 'D+': 9, 'D': 10, 'D-': 11, 'F': 12, 'N/A': 13 }
                    const ep = (a as any).originalPrice || a.premium_per_contract
                    const grA = calculateFlowGrade({ ...a, premium_per_contract: ep }, effectiveOptionPrices, effectiveStockPrices, emptyRS, defaultStdDevs, comboMap).grade
                    const ep2 = (b as any).originalPrice || b.premium_per_contract
                    const grB = calculateFlowGrade({ ...b, premium_per_contract: ep2 }, effectiveOptionPrices, effectiveStockPrices, emptyRS, defaultStdDevs, comboMap).grade
                    const diff = (gradeOrder[grA] ?? 13) - (gradeOrder[grB] ?? 13)
                    return flowTrackingFilters.gradeSort === 'HIGH' ? diff : -diff
                  }
                  if (flowTrackingFilters.contractsSort !== 'NONE') {
                    const diff = a.trade_size - b.trade_size
                    return flowTrackingFilters.contractsSort === 'HIGH' ? -diff : diff
                  }
                  return 0
                })
                .map((flow) => {
                  const expiry = flow.expiry.replace(/-/g, '').slice(2)
                  const strikeFormatted = String(Math.round(flow.strike * 1000)).padStart(8, '0')
                  const optionType = flow.type.toLowerCase() === 'call' ? 'C' : 'P'
                  const optionTicker = `O:${normalizeTickerForOptions(flow.underlying_ticker)}${expiry}${optionType}${strikeFormatted}`
                  const currentPrice = effectiveOptionPrices[optionTicker]
                  const entryPrice = (flow as any).originalPrice || flow.premium_per_contract
                  const fillStyle = flow.fill_style || ''
                  const isSoldToOpen = fillStyle === 'B' || fillStyle === 'BB'
                  let percentChange = 0,
                    priceHigher = false
                  if (currentPrice && currentPrice > 0) {
                    const raw = ((currentPrice - entryPrice) / entryPrice) * 100
                    percentChange = isSoldToOpen ? -raw : raw
                    priceHigher = percentChange > 0
                  }

                  // Use the real grading system
                  const flowWithOriginalPrice = { ...flow, premium_per_contract: entryPrice }
                  const isLeapTrade = (flow as any).gradeMode === 'leap'
                  const liveGrade = isLeapTrade && leapRsData && leap52wkData && leapSeasonalData
                    ? calculateLeapGradeShared(
                      flowWithOriginalPrice,
                      effectiveOptionPrices,
                      effectiveStockPrices,
                      leapRsData,
                      leap52wkData,
                      leapSeasonalData
                    )
                    : calculateFlowGrade(
                      flowWithOriginalPrice,
                      effectiveOptionPrices,
                      effectiveStockPrices,
                      emptyRS,
                      defaultStdDevs,
                      comboMap
                    )

                  const flowId = generateFlowId(flow)
                  // Zone / target computations (hoisted for inline columns)
                  const rzParentZones = dealerZoneCacheFromParent?.[flow.underlying_ticker]
                  const rzZones = rzParentZones && (rzParentZones.golden !== null || rzParentZones.purple !== null) ? rzParentZones : (ownDealerZones[flow.underlying_ticker] ?? null)
                  const rzIsSold = fillStyle === 'B' || fillStyle === 'BB'
                  const rzTargetUp = (flow.type === 'call' && !rzIsSold) || (flow.type !== 'call' && rzIsSold)
                  const rzTodayMs = new Date().setHours(0, 0, 0, 0)
                  const rzExpD = new Date(flow.expiry)
                  const rzExpLocal = new Date(rzExpD.getUTCFullYear(), rzExpD.getUTCMonth(), rzExpD.getUTCDate())
                  const rzLiveDTE = Math.max(0, Math.floor((rzExpLocal.getTime() - rzTodayMs) / 86400000))
                  const rzSigma = rzZones?.atmIV && rzZones.atmIV > 0 ? rzZones.atmIV : (flow.implied_volatility && flow.implied_volatility > 0 ? flow.implied_volatility : 0)
                  const rzT1 = rzSigma > 0 ? bsStrikeForProbFTP(flow.spot_price, rzSigma, rzLiveDTE, 80, rzTargetUp) : null
                  const rzT2 = rzSigma > 0 ? bsStrikeForProbFTP(flow.spot_price, rzSigma, rzLiveDTE, 90, rzTargetUp) : null
                  const rzTargetColor = rzTargetUp ? '#00ff88' : '#ff4466'
                  const rzStockNow = effectiveStockPrices[flow.underlying_ticker]
                  const rzFlowStock = (flow as any).originalStockPrice || flow.spot_price
                  const isThisFlowSwiped = swipedFlowId === flowId
                  const swipeOffset = isThisFlowSwiped ? Math.min(0, touchCurrent - touchStart) : 0

                  const handleTouchStart = (e: React.TouchEvent) => {
                    setSwipedFlowId(flowId)
                    setTouchStart(e.touches[0].clientX)
                    setTouchCurrent(e.touches[0].clientX)
                  }
                  const handleTouchMove = (e: React.TouchEvent) => {
                    if (swipedFlowId === flowId) setTouchCurrent(e.touches[0].clientX)
                  }
                  const handleTouchEnd = () => {
                    if (Math.abs(swipeOffset) < 50) {
                      setSwipedFlowId(null)
                      setTouchStart(0)
                      setTouchCurrent(0)
                    }
                  }

                  return (
                    <div
                      key={flowId}
                      className="relative overflow-hidden"
                      style={{
                        boxShadow:
                          '0 8px 32px rgba(0,0,0,0.9), 0 2px 0 rgba(255,255,255,0.06) inset, 0 -2px 0 rgba(0,0,0,0.8) inset',
                        borderRadius: '6px',
                        perspective: '1000px',
                        marginBottom: '2px',
                        borderBottom: '1px solid rgba(255,136,0,0.35)',
                      }}
                    >
                      {/* Swipe-to-delete (mobile) */}
                      <div
                        className="md:hidden absolute right-0 top-0 bottom-0 flex items-center justify-center bg-red-600 px-6"
                        style={{ width: '100px' }}
                      >
                        <button
                          onClick={() => {
                            removeFromFlowTracking(flow)
                            setSwipedFlowId(null)
                            setTouchStart(0)
                            setTouchCurrent(0)
                          }}
                          className="text-white font-bold text-lg"
                        >
                          DELETE
                        </button>
                      </div>

                      <div
                        className="rounded transition-all duration-200 relative"
                        style={{
                          transform: `translateX(${swipeOffset}px)`,
                          transition:
                            swipedFlowId === flowId && touchCurrent !== touchStart
                              ? 'none'
                              : 'transform 0.3s ease-out',
                          background:
                            'linear-gradient(180deg, #1a1a1a 0%, #0d0d0d 40%, #050505 100%)',
                          border: '1px solid rgba(255,136,0,0.25)',
                          borderTop: '1px solid rgba(255,255,255,0.10)',
                          borderBottom: '1px solid rgba(0,0,0,0.9)',
                          boxShadow:
                            '0 4px 16px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.07), inset 0 -1px 0 rgba(0,0,0,0.6)',
                        }}
                        onTouchStart={handleTouchStart}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                      >
                        {/* Desktop delete button */}
                        <button
                          onClick={() => removeFromFlowTracking(flow)}
                          className="hidden md:block absolute top-1 right-1 z-10 text-red-500 hover:text-red-400 transition-colors bg-black/80 rounded-full p-1"
                          title={`Remove | Added: ${(flow as any).addedAt ? formatTime((flow as any).addedAt) : formatTime(flow.trade_timestamp)}`}
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            strokeWidth={3}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>



                        <div className="p-1">
                          {isMobile ? (
                            /* ── MOBILE: 6-col row + Magnet/Pivot/T1/T2 second row ── */
                            <table className="w-full text-center" style={{ tableLayout: 'fixed' }}>
                              <tbody>
                                <tr>
                                  <td className="p-1" style={{ width: '14%', borderRight: '1px solid rgba(255,255,255,0.12)' }}>
                                    <div className="flex flex-col items-center space-y-0.5">
                                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#ff8500', background: 'linear-gradient(180deg,#1f1f1f,#000)', border: '1px solid rgba(107,114,128,0.7)', padding: '1px 5px' }}>{flow.underlying_ticker}</span>
                                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#ffffff', whiteSpace: 'nowrap' }}>{formatTime(flow.trade_timestamp)}</span>
                                    </div>
                                  </td>
                                  <td className="p-1" style={{ width: '12%', borderRight: '1px solid rgba(255,255,255,0.12)' }}>
                                    <div className="flex flex-col items-center space-y-0.5">
                                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff' }}>${flow.strike}</span>
                                      <span style={{ fontSize: '13px', fontWeight: 700, color: flow.type === 'call' ? '#22c55e' : '#ef4444' }}>{flow.type.toUpperCase()}</span>
                                    </div>
                                  </td>
                                  <td className="p-1" style={{ width: '24%', borderRight: '1px solid rgba(255,255,255,0.12)' }}>
                                    <div className="flex flex-col items-center space-y-0.5">
                                      <div className="flex items-center gap-0.5 flex-wrap justify-center">
                                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#22d3ee' }}>{flow.trade_size.toLocaleString()}</span>
                                        <span style={{ fontSize: '13px', color: '#facc15' }}>@${entryPrice.toFixed(2)}</span>
                                        {fillStyle && <span style={{ fontSize: '13px', fontWeight: 700, color: fillStyle === 'A' || fillStyle === 'AA' ? '#4ade80' : fillStyle === 'B' || fillStyle === 'BB' ? '#f87171' : '#fb923c' }}>{fillStyle}</span>}
                                      </div>
                                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#4ade80' }}>{formatCurrency(flow.total_premium)}</span>
                                    </div>
                                  </td>
                                  <td className="p-1" style={{ width: '14%', borderRight: '1px solid rgba(255,255,255,0.12)' }}>
                                    <div className="flex flex-col items-center space-y-0.5">
                                      <span style={{ fontSize: '13px', color: '#ffffff' }}>{formatDate(flow.expiry)}</span>
                                      {flow.trade_type && (flow.trade_type === 'SWEEP' || flow.trade_type === 'BLOCK') && <span style={{ fontSize: '13px', fontWeight: 700, color: flow.trade_type === 'SWEEP' ? '#FFD700' : 'rgba(0,150,255,1)' }}>{flow.trade_type}</span>}
                                    </div>
                                  </td>
                                  <td className="p-1" style={{ width: '20%', borderRight: '1px solid rgba(255,255,255,0.12)' }}>
                                    <div className="flex flex-col items-center space-y-0.5">
                                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff' }}>${rzFlowStock.toFixed(2)}</span>
                                      <span style={{ fontSize: '13px', fontWeight: 800, color: rzStockNow ? (rzStockNow >= rzFlowStock ? '#00ff88' : '#ff4466') : '#ffffff' }}>{rzStockNow ? `$${rzStockNow.toFixed(2)}` : '—'}</span>
                                    </div>
                                  </td>
                                  <td className="p-1" style={{ width: '16%' }}>
                                    <div className="flex flex-col items-center space-y-0.5">
                                      {currentPrice && currentPrice > 0 ? <span style={{ fontSize: '13px', fontWeight: 700, color: priceHigher ? '#00ff00' : '#ff0000' }}>{priceHigher ? '+' : ''}{percentChange.toFixed(1)}%</span> : <span style={{ fontSize: '13px', color: '#6b7280' }}>-</span>}
                                      {liveGrade.grade !== 'N/A' && <span style={{ fontSize: '15px', fontWeight: 900, color: liveGrade.color, textShadow: `0 0 8px ${liveGrade.color}88` }}>{liveGrade.grade}</span>}
                                      {ownStdDevFailed.has(flow.underlying_ticker) && <span title="StdDev fetch failed" style={{ color: '#ef4444', fontSize: '11px', fontWeight: 'bold', cursor: 'help' }}>⚠</span>}
                                    </div>
                                  </td>
                                </tr>
                                <tr>
                                  <td colSpan={6} style={{ borderTop: '1px solid rgba(255,255,255,0.08)', padding: '4px 8px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', gap: '6px' }}>
                                      <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                        <span style={{ fontSize: '12px', fontWeight: 700, color: '#FFD700' }}>Magnet</span>
                                        <span style={{ fontSize: '13px', fontWeight: 800, color: '#FFD700' }}>{rzZones?.golden ? `$${rzZones.golden.toFixed(2)}` : '—'}</span>
                                      </span>
                                      <span style={{ width: '1px', height: '14px', background: 'rgba(255,255,255,0.1)', flexShrink: 0 }} />
                                      <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                        <span style={{ fontSize: '12px', fontWeight: 700, color: '#a855f7' }}>Pivot</span>
                                        <span style={{ fontSize: '13px', fontWeight: 800, color: '#a855f7' }}>{rzZones?.purple ? `$${rzZones.purple.toFixed(2)}` : '—'}</span>
                                      </span>
                                      <span style={{ width: '1px', height: '14px', background: 'rgba(255,255,255,0.1)', flexShrink: 0 }} />
                                      <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                        <span style={{ fontSize: '12px', fontWeight: 700, color: rzTargetColor }}>T1</span>
                                        <span style={{ fontSize: '13px', fontWeight: 800, color: rzTargetColor }}>{rzT1 ? `$${rzT1.toFixed(2)}` : '—'}</span>
                                      </span>
                                      <span style={{ width: '1px', height: '14px', background: 'rgba(255,255,255,0.1)', flexShrink: 0 }} />
                                      <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                        <span style={{ fontSize: '12px', fontWeight: 700, color: rzTargetColor }}>T2</span>
                                        <span style={{ fontSize: '13px', fontWeight: 800, color: rzTargetColor }}>{rzT2 ? `$${rzT2.toFixed(2)}` : '—'}</span>
                                      </span>
                                    </div>
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          ) : (
                            /* ── DESKTOP: original 8-col single row ── */
                            <table className="w-full text-center" style={{ tableLayout: 'fixed' }}>
                              <tbody>
                                <tr>
                                  <td className="p-1" style={{ width: '9%', borderRight: '1px solid rgba(255,255,255,0.12)' }}>
                                    <div className="flex flex-col items-center space-y-0.5">
                                      <span className="bg-gradient-to-b from-gray-800 to-black text-orange-500 font-bold px-1.5 py-0.5 border border-gray-500/70 text-xl">{flow.underlying_ticker}</span>
                                      <span className="text-lg text-white font-bold">{formatTime(flow.trade_timestamp)}</span>
                                    </div>
                                  </td>
                                  <td className="p-1" style={{ width: '9%', borderRight: '1px solid rgba(255,255,255,0.12)' }}>
                                    <div className="flex flex-col items-center space-y-0.5">
                                      <span className="text-white font-semibold text-xl">${flow.strike}</span>
                                      <span className={`font-bold text-lg ${flow.type === 'call' ? 'text-green-500' : 'text-red-500'}`}>{flow.type.toUpperCase()}</span>
                                    </div>
                                  </td>
                                  <td className="p-1" style={{ width: '19%', borderRight: '1px solid rgba(255,255,255,0.12)' }}>
                                    <div className="flex flex-col items-center space-y-0.5">
                                      <div className="flex items-center gap-0.5 flex-wrap justify-center">
                                        <span className="text-cyan-400 font-bold text-xl">{flow.trade_size.toLocaleString()}</span>
                                        <span className="text-yellow-400 text-xl">@${entryPrice.toFixed(2)}</span>
                                        {fillStyle && <span className={`text-xl font-bold ${fillStyle === 'A' || fillStyle === 'AA' ? 'text-green-400' : fillStyle === 'B' || fillStyle === 'BB' ? 'text-red-400' : 'text-orange-400'}`}>{fillStyle}</span>}
                                      </div>
                                      <span className="font-bold text-lg text-green-400">{formatCurrency(flow.total_premium)}</span>
                                    </div>
                                  </td>
                                  <td className="p-1" style={{ width: '11%', borderRight: '1px solid rgba(255,255,255,0.12)' }}>
                                    <div className="flex flex-col items-center space-y-0.5">
                                      <span className="text-white text-lg">{formatDate(flow.expiry)}</span>
                                      {flow.trade_type && (flow.trade_type === 'SWEEP' || flow.trade_type === 'BLOCK') && <span className="font-bold text-lg" style={{ color: flow.trade_type === 'SWEEP' ? '#FFD700' : 'rgba(0,150,255,1)' }}>{flow.trade_type}</span>}
                                    </div>
                                  </td>
                                  <td className="p-1" style={{ width: '17%', borderRight: '1px solid rgba(255,255,255,0.12)' }}>
                                    <div className="flex flex-col items-center space-y-0.5">
                                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <span style={{ fontSize: '14px', fontWeight: 700, color: '#FFD700', letterSpacing: '0.3px' }}>Magnet</span>
                                        <span style={{ fontSize: '20px', fontWeight: 800, color: '#FFD700' }}>{rzZones?.golden ? `$${rzZones.golden.toFixed(2)}` : '—'}</span>
                                      </span>
                                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <span style={{ fontSize: '14px', fontWeight: 700, color: '#a855f7', letterSpacing: '0.3px' }}>Pivot</span>
                                        <span style={{ fontSize: '20px', fontWeight: 800, color: '#a855f7' }}>{rzZones?.purple ? `$${rzZones.purple.toFixed(2)}` : '—'}</span>
                                      </span>
                                    </div>
                                  </td>
                                  <td className="p-1" style={{ width: '14%', borderRight: '1px solid rgba(255,255,255,0.12)' }}>
                                    <div className="flex flex-col items-center space-y-0.5">
                                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <span style={{ fontSize: '14px', fontWeight: 700, color: rzTargetColor, letterSpacing: '0.3px' }}>T1</span>
                                        <span style={{ fontSize: '20px', fontWeight: 800, color: rzTargetColor }}>{rzT1 ? `$${rzT1.toFixed(2)}` : '—'}</span>
                                      </span>
                                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <span style={{ fontSize: '14px', fontWeight: 700, color: rzTargetColor, letterSpacing: '0.3px' }}>T2</span>
                                        <span style={{ fontSize: '20px', fontWeight: 800, color: rzTargetColor }}>{rzT2 ? `$${rzT2.toFixed(2)}` : '—'}</span>
                                      </span>
                                    </div>
                                  </td>
                                  <td className="p-1" style={{ width: '12%', borderRight: '1px solid rgba(255,255,255,0.12)' }}>
                                    <div className="flex flex-col items-center space-y-0.5">
                                      <span style={{ fontSize: '20px', fontWeight: 700, color: '#ffffff' }}>${rzFlowStock.toFixed(2)}</span>
                                      <span style={{ fontSize: '20px', fontWeight: 800, color: rzStockNow ? (rzStockNow >= rzFlowStock ? '#00ff88' : '#ff4466') : '#ffffff' }}>{rzStockNow ? `$${rzStockNow.toFixed(2)}` : '—'}</span>
                                    </div>
                                  </td>
                                  <td className="p-1" style={{ width: '9%' }}>
                                    <div className="flex flex-col items-center space-y-0.5">
                                      {currentPrice && currentPrice > 0 ? <span className="font-bold text-lg" style={{ color: priceHigher ? '#00ff00' : '#ff0000' }}>{priceHigher ? '+' : ''}{percentChange.toFixed(1)}%</span> : <span className="text-lg text-gray-500">-</span>}
                                      {liveGrade.grade !== 'N/A' && <span className="font-black text-xl" style={{ color: liveGrade.color, textShadow: `0 0 8px ${liveGrade.color}88` }}>{liveGrade.grade}</span>}
                                      {ownStdDevFailed.has(flow.underlying_ticker) && <span title="StdDev fetch failed — Price Action unscored" style={{ color: '#ef4444', fontSize: '12px', fontWeight: 'bold', cursor: 'help' }}>⚠</span>}
                                    </div>
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          )}
                        </div>

                        {/* Stock Chart */}
                        {flowTrackingFilters.showCharts &&
                          (() => {
                            const chartData = stockChartData[flowId] || []
                            if (chartData.length === 0) return null
                            const width = 648,
                              height = 117
                            const padding = { left: 45, right: 80, top: 10, bottom: 25 }
                            const chartWidth = width - padding.left - padding.right
                            const chartHeight = height - padding.top - padding.bottom
                            const prices = chartData.map((d) => d.price)
                            const minPrice = Math.min(...prices),
                              maxPrice = Math.max(...prices)
                            const priceRange = maxPrice - minPrice || 1
                            const points = chartData
                              .map(
                                (p, i) =>
                                  `${(padding.left + (i / (chartData.length - 1)) * chartWidth).toFixed(2)},${(padding.top + chartHeight - ((p.price - minPrice) / priceRange) * chartHeight).toFixed(2)}`
                              )
                              .join(' ')
                            const curP = prices[prices.length - 1]
                            const prevClose = (flow as any).originalStockPrice || flow.spot_price
                            const isUp = curP >= prevClose
                            const changePercent = ((curP - prevClose) / prevClose) * 100
                            const stockTimeframe = flowChartTimeframes[flowId]?.stock || '1D'
                            return (
                              <div className="border-t border-gray-700 pt-3 mt-3 px-1">
                                <div className="relative mb-2">
                                  <div
                                    className="text-center text-base text-orange-400 font-bold"
                                    style={{ fontSize: '20px' }}
                                  >
                                    Stock
                                  </div>
                                  <div className="absolute right-0 top-0 flex gap-1">
                                    {(['1D', '1W', '1M'] as const).map((tf) => (
                                      <button
                                        key={tf}
                                        onClick={() => {
                                          setFlowChartTimeframes((prev) => ({
                                            ...prev,
                                            [flowId]: { ...prev[flowId], stock: tf },
                                          }))
                                          fetchStockChartDataForFlow(
                                            flowId,
                                            flow.underlying_ticker,
                                            tf
                                          )
                                        }}
                                        className={`px-2 py-1 text-xs font-bold rounded transition-colors ${stockTimeframe === tf ? 'bg-orange-500 text-black' : 'bg-gray-800 text-orange-400 hover:bg-gray-700'}`}
                                      >
                                        {tf}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                                <svg width={width} height={height} className="overflow-visible">
                                  <line
                                    x1={padding.left}
                                    y1={padding.top}
                                    x2={padding.left}
                                    y2={padding.top + chartHeight}
                                    stroke="#444"
                                    strokeWidth="1"
                                  />
                                  <line
                                    x1={padding.left}
                                    y1={padding.top + chartHeight}
                                    x2={padding.left + chartWidth}
                                    y2={padding.top + chartHeight}
                                    stroke="#444"
                                    strokeWidth="1"
                                  />
                                  <polyline
                                    fill="none"
                                    stroke={isUp ? '#00ff00' : '#ff0000'}
                                    strokeWidth="1.5"
                                    points={points}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                  <text
                                    x={padding.left + chartWidth + 10}
                                    y={
                                      padding.top +
                                      chartHeight -
                                      ((curP - minPrice) / priceRange) * chartHeight +
                                      4
                                    }
                                    textAnchor="start"
                                    fill={isUp ? '#00ff00' : '#ff0000'}
                                    fontSize="18"
                                    fontWeight="bold"
                                  >
                                    ${curP.toFixed(2)}
                                  </text>
                                  <text
                                    x={padding.left + chartWidth + 10}
                                    y={
                                      padding.top +
                                      chartHeight -
                                      ((curP - minPrice) / priceRange) * chartHeight +
                                      18
                                    }
                                    textAnchor="start"
                                    fill={isUp ? '#00ff00' : '#ff0000'}
                                    fontSize="16.5"
                                    fontWeight="bold"
                                  >
                                    {isUp ? '+' : ''}
                                    {changePercent.toFixed(2)}%
                                  </text>
                                </svg>
                              </div>
                            )
                          })()}

                        {/* Options Premium Chart */}
                        {flowTrackingFilters.showCharts &&
                          (() => {
                            const premiumData = optionsPremiumData[flowId] || []
                            if (premiumData.length === 0) return null
                            const width = 648,
                              height = 117
                            const padding = { left: 45, right: 80, top: 10, bottom: 25 }
                            const chartWidth = width - padding.left - padding.right
                            const chartHeight = height - padding.top - padding.bottom
                            const prices = premiumData.map((d) => d.price)
                            const minPrice = Math.min(...prices),
                              maxPrice = Math.max(...prices)
                            const priceRange = maxPrice - minPrice || 1
                            const points = premiumData
                              .map(
                                (p, i) =>
                                  `${(padding.left + (i / (premiumData.length - 1)) * chartWidth).toFixed(2)},${(padding.top + chartHeight - ((p.price - minPrice) / priceRange) * chartHeight).toFixed(2)}`
                              )
                              .join(' ')
                            const curP = prices[prices.length - 1]
                            const ep = (flow as any).originalPrice || flow.premium_per_contract
                            const isUp = curP >= ep
                            const changePercent = ((curP - ep) / ep) * 100
                            const optionTimeframe = flowChartTimeframes[flowId]?.option || '1D'
                            return (
                              <div className="border-t border-gray-700 pt-3 mt-3 px-1">
                                <div className="relative mb-2">
                                  <div
                                    className="text-center text-base text-cyan-400 font-bold"
                                    style={{ fontSize: '20px' }}
                                  >
                                    Contract
                                  </div>
                                  <div className="absolute right-0 top-0 flex gap-1">
                                    {(['1D', '1W', '1M'] as const).map((tf) => (
                                      <button
                                        key={tf}
                                        onClick={() => {
                                          setFlowChartTimeframes((prev) => ({
                                            ...prev,
                                            [flowId]: { ...prev[flowId], option: tf },
                                          }))
                                          fetchOptionPremiumDataForFlow(flowId, flow, tf)
                                        }}
                                        className={`px-2 py-1 text-xs font-bold rounded transition-colors ${optionTimeframe === tf ? 'bg-cyan-500 text-black' : 'bg-gray-800 text-cyan-400 hover:bg-gray-700'}`}
                                      >
                                        {tf}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                                <svg width={width} height={height} className="overflow-visible">
                                  <line
                                    x1={padding.left}
                                    y1={padding.top}
                                    x2={padding.left}
                                    y2={padding.top + chartHeight}
                                    stroke="#444"
                                    strokeWidth="1"
                                  />
                                  <line
                                    x1={padding.left}
                                    y1={padding.top + chartHeight}
                                    x2={padding.left + chartWidth}
                                    y2={padding.top + chartHeight}
                                    stroke="#444"
                                    strokeWidth="1"
                                  />
                                  <polyline
                                    fill="none"
                                    stroke={isUp ? '#00ff88' : '#ff4466'}
                                    strokeWidth="1.5"
                                    points={points}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                  <text
                                    x={padding.left + chartWidth + 10}
                                    y={
                                      padding.top +
                                      chartHeight -
                                      ((curP - minPrice) / priceRange) * chartHeight +
                                      4
                                    }
                                    textAnchor="start"
                                    fill={isUp ? '#00ff88' : '#ff4466'}
                                    fontSize="18"
                                    fontWeight="bold"
                                  >
                                    ${curP.toFixed(2)}
                                  </text>
                                  <text
                                    x={padding.left + chartWidth + 10}
                                    y={
                                      padding.top +
                                      chartHeight -
                                      ((curP - minPrice) / priceRange) * chartHeight +
                                      18
                                    }
                                    textAnchor="start"
                                    fill={isUp ? '#00ff88' : '#ff4466'}
                                    fontSize="16.5"
                                    fontWeight="bold"
                                  >
                                    {isUp ? '+' : ''}
                                    {changePercent.toFixed(2)}%
                                  </text>
                                </svg>
                              </div>
                            )
                          })()}
                      </div>
                    </div>
                  )
                })
            })()
          )}
        </div>
        {/* EFI Chart */}
        {!hideChart && !isMobile && (<div ref={chartContainerRef} style={{ flex: '1 1 55%', minHeight: 0, position: 'relative', overflow: 'hidden', borderTop: '1px solid #1f2937' }}>
          {/* Chart fills full 55% */}
          <div style={{ width: '100%', height: '100%' }}>
            <style>{`
            button[title*='Watchlist'], button[title*='watchlist'], button[title*='favorite'],
            button[title*='star'], button[title*='multi chart'], button[title*='Multi Chart'],
            button[title*='Chart Layout'] { display: none !important; }
            button[title='Candles'], button[title='Line'],
            button[title*='Switch to'] { display: none !important; }
          `}</style>
            <EFIChart
              symbol={chartSymbol}
              initialTimeframe="1d"
              height={Math.max(200, chartContainerHeight - (isMobile ? 60 : 0))}
              lwToolbarPosition="left"
              lwNavyButtonTheme={true}
              disableSidebarAutoScan={true}
              hideDesktopSidebar={true}
              compactToolbar={true}
              onSymbolChange={(s) => setChartSymbol(s)}
            />
          </div>
        </div>
        )}
      </div>

    </div>
  )
}
