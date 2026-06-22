'use client'

import { TbStar } from 'react-icons/tb'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'

import { calculateFlowGrade, calculateLeapGradeShared } from '@/lib/flowGrading'
import { useFlowTrackingPanelMobile } from './useFlowTrackingPanelMobile'

const EFIChart = dynamic(() => import('@/components/trading/EFICharting'), { ssr: false })

// ─── Flow Portfolio Types ─────────────────────────────────────────────────────
const FP_STORAGE_KEY = 'flow_portfolio_v1'
const FP_STARTING_BALANCE = 25_000
const FP_POLL_MS = 30_000

interface FlowPortfolioTrade {
  id: string
  underlying: string
  strike: number
  expiry: string
  optionType: 'call' | 'put'
  optionTicker: string
  fillStyle: string
  isSoldToOpen: boolean
  entryPrice: number
  contracts: number
  stopLoss: number
  t1: number
  t2: number
  t1Filled: boolean
  t1FillPrice: number
  t2Filled: boolean
  t2FillPrice: number
  currentPrice: number
  status: 'OPEN' | 'PARTIAL' | 'CLOSED'
  realizedPnl: number
  addedAt: number
  autoSellArmed: boolean
  tradeTimestamp: string
  totalPremium: number
  tradeType: string
}

interface FPAlert {
  id: string
  symbol: string
  type: 'ADDED' | 'T1_HIT' | 'T2_HIT' | 'STOP_LOSS' | 'GAP_FILL' | 'CLOSED' | 'BOUGHT' | 'SOLD' | 'TRIGGER'
  message: string
  timestamp: number
  read: boolean
  action?: 'BUY' | 'SELL'
}

function fpUid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function fpFmtUsd(val: number, sign = true): string {
  const abs = Math.abs(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (!sign) return `$${abs}`
  return `${val >= 0 ? '+' : '-'}$${abs}`
}

function fpFmtPct(val: number): string {
  return `${val >= 0 ? '+' : ''}${val.toFixed(1)}%`
}

function fpLoadData(): { trades: FlowPortfolioTrade[]; alerts: FPAlert[]; cash: number; equity: { ts: number; value: number; realized?: number }[] } {
  try {
    const raw = localStorage.getItem(FP_STORAGE_KEY)
    if (raw) {
      const d = JSON.parse(raw)
      return {
        trades: (d.trades ?? []).map((t: FlowPortfolioTrade) => ({ autoSellArmed: true, ...t })),
        alerts: d.alerts ?? [],
        cash: d.cash ?? FP_STARTING_BALANCE,
        equity: d.equity ?? [{ ts: Date.now(), value: FP_STARTING_BALANCE }],
      }
    }
  } catch { /* ignore */ }
  return { trades: [], alerts: [], cash: FP_STARTING_BALANCE, equity: [{ ts: Date.now(), value: FP_STARTING_BALANCE }] }
}

const POLYGON_API_KEY = process.env.NEXT_PUBLIC_POLYGON_API_KEY || ''

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
  trade_type: 'SWEEP' | 'BLOCK' | 'MINI' | 'MULTI-LEG'
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

const generateFlowId = (trade: OptionsFlowData): string =>
  `${trade.underlying_ticker}-${trade.strike}-${trade.expiry}-${trade.type}-${trade.trade_timestamp}-${trade.trade_size}`

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
}: {
  onClose?: () => void
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
} = {}) {
  const [isMounted, setIsMounted] = useState(false)
  const [chartSymbol, setChartSymbol] = useState('SPY')
  const [chartContainerHeight, setChartContainerHeight] = useState(600)
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const [pnlChartWidth, setPnlChartWidth] = useState(460)
  const pnlChartRef = useRef<HTMLDivElement>(null)
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

  // ── Panel Tab ─────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'TRACKING' | 'PORTFOLIO'>('TRACKING')

  // ── Flow Portfolio State ──────────────────────────────────────────────────
  const [fpTrades, setFpTrades] = useState<FlowPortfolioTrade[]>([])
  const [fpAlerts, setFpAlerts] = useState<FPAlert[]>([])
  const [fpCash, setFpCash] = useState(FP_STARTING_BALANCE)
  const [fpEquity, setFpEquity] = useState<{ ts: number; value: number; realized?: number }[]>([{ ts: Date.now(), value: FP_STARTING_BALANCE, realized: 0 }])
  const [fpChartTf, setFpChartTf] = useState<'5m' | '1h' | '4h' | '1D'>('1D')
  const [fpPortfolioTab, setFpPortfolioTab] = useState<'POSITIONS' | 'ALERTS' | 'CLOSED'>('POSITIONS')
  const [fpOptionPrices, setFpOptionPrices] = useState<Record<string, number>>({})
  const [fpSettingsOpen, setFpSettingsOpen] = useState(false)
  const [fpShowUnrealized, setFpShowUnrealized] = useState(true)
  const [fpShowStats, setFpShowStats] = useState(true)
  const [fpShowAccount, setFpShowAccount] = useState(true)
  const [fpShowTotalRtn, setFpShowTotalRtn] = useState(true)
  const [fpShowRealized, setFpShowRealized] = useState(true)
  const [fpShowOpenPnl, setFpShowOpenPnl] = useState(true)
  const [fpFlowDetailId, setFpFlowDetailId] = useState<string | null>(null)
  const fpSellTimerRef = useRef<{ id: ReturnType<typeof setTimeout>; tradeId: string } | null>(null)
  const fpInitialized = useRef(false)

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

    // Load portfolio
    if (!fpInitialized.current) {
      fpInitialized.current = true
      const fpData = fpLoadData()
      setFpTrades(fpData.trades)
      setFpAlerts(fpData.alerts)
      setFpCash(fpData.cash)
      setFpEquity(fpData.equity)
    }

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

  // Measure P&L chart container width
  useEffect(() => {
    const el = pnlChartRef.current
    if (!el) return
    // Measure immediately
    const rect = el.getBoundingClientRect()
    if (rect.width > 50) setPnlChartWidth(Math.round(rect.width))
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w && w > 50) setPnlChartWidth(Math.round(w))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [activeTab])

  // Persist portfolio to localStorage whenever it changes
  const fpSave = useCallback(
    (trades: FlowPortfolioTrade[], alerts: FPAlert[], cash: number, equity: { ts: number; value: number; realized?: number }[]) => {
      try {
        localStorage.setItem(FP_STORAGE_KEY, JSON.stringify({ trades, alerts, cash, equity }))
      } catch { /* ignore */ }
    },
    []
  )

  // Poll option prices for open/partial portfolio positions every 30s
  useEffect(() => {
    const openTrades = fpTrades.filter((t) => t.status !== 'CLOSED')
    if (openTrades.length === 0) return
    const doFetch = async () => {
      const update: Record<string, number> = {}
      await Promise.allSettled(
        openTrades.map(async (t, idx) => {
          await new Promise((r) => setTimeout(r, idx * 30))
          try {
            const res = await fetch(
              `https://api.polygon.io/v3/snapshot/options/${t.underlying}/${t.optionTicker}?apikey=${POLYGON_API_KEY}`,
              { signal: AbortSignal.timeout(5000) }
            )
            if (res.ok) {
              const data = await res.json()
              if (data.results?.last_quote) {
                const mid = ((data.results.last_quote.bid || 0) + (data.results.last_quote.ask || 0)) / 2
                if (mid > 0) update[t.optionTicker] = mid
              }
            }
          } catch { /* silent */ }
        })
      )
      if (Object.keys(update).length > 0) setFpOptionPrices((prev) => ({ ...prev, ...update }))
    }
    doFetch()
    const interval = setInterval(doFetch, FP_POLL_MS)
    return () => clearInterval(interval)
  }, [fpTrades.filter((t) => t.status !== 'CLOSED').map((t) => t.id).join(',')])

  // Auto-sell logic: process open trades whenever prices update
  useEffect(() => {
    if (Object.keys(fpOptionPrices).length === 0) return
    const openTrades = fpTrades.filter((t) => t.status !== 'CLOSED' && t.autoSellArmed)
    if (openTrades.length === 0) return

    let didChange = false
    let newCash = fpCash
    const newAlerts: FPAlert[] = []
    const updatedTrades = fpTrades.map((trade) => {
      if (trade.status === 'CLOSED') return trade
      const livePrice = fpOptionPrices[trade.optionTicker]
      if (!livePrice || livePrice <= 0) return { ...trade, currentPrice: trade.currentPrice }
      const updated = { ...trade, currentPrice: livePrice }
      // P&L direction: sold-to-open flips sign
      const effectiveChange = trade.isSoldToOpen
        ? (trade.entryPrice - livePrice) / trade.entryPrice
        : (livePrice - trade.entryPrice) / trade.entryPrice

      // Stop loss: -50%
      if (!updated.t1Filled && effectiveChange <= -0.5) {
        const proceeds = livePrice * updated.contracts * 100
        const costBasis = updated.entryPrice * updated.contracts * 100
        updated.realizedPnl += proceeds - costBasis
        newCash += proceeds
        updated.status = 'CLOSED'
        didChange = true
        newAlerts.push({ id: fpUid(), symbol: updated.underlying, type: 'STOP_LOSS', message: `${updated.underlying} ${updated.strike}${updated.optionType === 'call' ? 'C' : 'P'} STOP LOSS at $${livePrice.toFixed(2)} — ${fpFmtUsd(proceeds - costBasis)}`, timestamp: Date.now(), read: false })
        return updated
      }
      // Gap fill: jumped past T2 without T1
      if (!updated.t1Filled && livePrice >= updated.t2) {
        const proceeds = livePrice * updated.contracts * 100
        const costBasis = updated.entryPrice * updated.contracts * 100
        updated.realizedPnl += proceeds - costBasis
        newCash += proceeds
        updated.status = 'CLOSED'
        didChange = true
        newAlerts.push({ id: fpUid(), symbol: updated.underlying, type: 'GAP_FILL', message: `${updated.underlying} ${updated.strike}${updated.optionType === 'call' ? 'C' : 'P'} GAP FILL → T2 $${livePrice.toFixed(2)} — ${fpFmtUsd(proceeds - costBasis)}`, timestamp: Date.now(), read: false })
        return updated
      }
      // T1 hit
      if (!updated.t1Filled && livePrice >= updated.t1) {
        const sellContracts = Math.max(1, Math.floor(updated.contracts / 2))
        const proceeds = livePrice * sellContracts * 100
        const costBasis = updated.entryPrice * sellContracts * 100
        updated.realizedPnl += proceeds - costBasis
        newCash += proceeds
        updated.contracts = updated.contracts - sellContracts
        updated.t1Filled = true
        updated.t1FillPrice = livePrice
        updated.status = updated.contracts > 0 ? 'PARTIAL' : 'CLOSED'
        didChange = true
        newAlerts.push({ id: fpUid(), symbol: updated.underlying, type: 'T1_HIT', message: `${updated.underlying} ${updated.strike}${updated.optionType === 'call' ? 'C' : 'P'} T1 HIT $${livePrice.toFixed(2)} — sold ${sellContracts} contract(s)`, timestamp: Date.now(), read: false })
        return updated
      }
      // T2 hit (after T1)
      if (updated.t1Filled && !updated.t2Filled && livePrice >= updated.t2) {
        const proceeds = livePrice * updated.contracts * 100
        const costBasis = updated.entryPrice * updated.contracts * 100
        updated.realizedPnl += proceeds - costBasis
        newCash += proceeds
        updated.contracts = 0
        updated.t2Filled = true
        updated.t2FillPrice = livePrice
        updated.status = 'CLOSED'
        didChange = true
        newAlerts.push({ id: fpUid(), symbol: updated.underlying, type: 'T2_HIT', message: `${updated.underlying} ${updated.strike}${updated.optionType === 'call' ? 'C' : 'P'} T2 HIT $${livePrice.toFixed(2)} — ${fpFmtUsd(proceeds - costBasis)}`, timestamp: Date.now(), read: false })
        return updated
      }
      return updated
    })

    if (didChange) {
      const openValue = updatedTrades
        .filter((t) => t.status !== 'CLOSED')
        .reduce((s, t) => s + (fpOptionPrices[t.optionTicker] || t.entryPrice) * t.contracts * 100, 0)
      const totalEquity = newCash + openValue
      const realizedAtPoint = updatedTrades.reduce((s, t) => s + t.realizedPnl, 0)
      const newEquityPoint = { ts: Date.now(), value: totalEquity, realized: realizedAtPoint }
      const updatedAlerts = [...newAlerts, ...fpAlerts].slice(0, 200)
      setFpTrades(updatedTrades)
      setFpCash(newCash)
      setFpAlerts(updatedAlerts)
      setFpEquity((prev) => [...prev, newEquityPoint].slice(-2000))
      fpSave(updatedTrades, updatedAlerts, newCash, [...fpEquity, newEquityPoint].slice(-2000))
    } else {
      // Update currentPrice AND record equity snapshot every minute for continuous P/L tracking
      const updatedWithPrices = fpTrades.map((t) => {
        const lp = fpOptionPrices[t.optionTicker]
        return lp && lp > 0 ? { ...t, currentPrice: lp } : t
      })
      const openValue = updatedWithPrices
        .filter((t) => t.status !== 'CLOSED')
        .reduce((s, t) => s + (fpOptionPrices[t.optionTicker] || t.entryPrice) * t.contracts * 100, 0)
      const totalEquity = fpCash + openValue
      const realizedAtPoint = updatedWithPrices.reduce((s, t) => s + t.realizedPnl, 0)
      const nowTs = Date.now()
      const lastTs = fpEquity[fpEquity.length - 1]?.ts ?? 0
      setFpTrades(updatedWithPrices)
      if (nowTs - lastTs >= 60_000) {
        const newEquityPoint = { ts: nowTs, value: totalEquity, realized: realizedAtPoint }
        const newEquity = [...fpEquity, newEquityPoint].slice(-2000)
        setFpEquity(newEquity)
        fpSave(updatedWithPrices, fpAlerts, fpCash, newEquity)
      }
    }
  }, [fpOptionPrices])

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
          `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${start}/${end}?adjusted=true&sort=asc&limit=30&apiKey=${POLYGON_API_KEY}`,
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
            `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apikey=${POLYGON_API_KEY}`,
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
              `https://api.polygon.io/v3/snapshot/options/${trade.underlying_ticker}/${optionTicker}?apikey=${POLYGON_API_KEY}`,
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
        `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/${multiplier}/${timespan}/${from}/${to}?adjusted=true&sort=asc&apiKey=${POLYGON_API_KEY}`
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
        `https://api.polygon.io/v2/aggs/ticker/${optionTicker}/range/${multiplier}/${timespan}/${from}/${to}?adjusted=true&sort=asc&apiKey=${POLYGON_API_KEY}`
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

  // ── Portfolio helpers ─────────────────────────────────────────────────────
  const fpIsInPortfolio = (flow: OptionsFlowData): boolean => {
    const expiry = flow.expiry.replace(/-/g, '').slice(2)
    const strikeFormatted = String(Math.round(flow.strike * 1000)).padStart(8, '0')
    const optType = flow.type.toLowerCase() === 'call' ? 'C' : 'P'
    const optionTicker = `O:${normalizeTickerForOptions(flow.underlying_ticker)}${expiry}${optType}${strikeFormatted}`
    return fpTrades.some((t) => t.optionTicker === optionTicker && t.status !== 'CLOSED')
  }

  const fpAddTrade = (flow: OptionsFlowData, overridePrice?: number) => {
    const expiry = flow.expiry.replace(/-/g, '').slice(2)
    const strikeFormatted = String(Math.round(flow.strike * 1000)).padStart(8, '0')
    const optType = flow.type.toLowerCase() === 'call' ? 'C' : 'P'
    const optionTicker = `O:${normalizeTickerForOptions(flow.underlying_ticker)}${expiry}${optType}${strikeFormatted}`
    const fillStyle = flow.fill_style || ''
    const isSoldToOpen = fillStyle === 'B' || fillStyle === 'BB'
    const entryPrice = overridePrice ?? ((flow as any).originalPrice || flow.premium_per_contract)
    const contracts = 2
    const cost = entryPrice * contracts * 100
    const newTrade: FlowPortfolioTrade = {
      id: fpUid(),
      underlying: flow.underlying_ticker,
      strike: flow.strike,
      expiry: flow.expiry,
      optionType: flow.type,
      optionTicker,
      fillStyle,
      isSoldToOpen,
      entryPrice,
      contracts,
      stopLoss: entryPrice * 0.5,
      t1: entryPrice * 1.8,
      t2: entryPrice * 2.5,
      t1Filled: false,
      t1FillPrice: 0,
      t2Filled: false,
      t2FillPrice: 0,
      currentPrice: entryPrice,
      status: 'OPEN',
      realizedPnl: 0,
      addedAt: Date.now(),
      autoSellArmed: true,
      tradeTimestamp: flow.trade_timestamp,
      totalPremium: flow.total_premium,
      tradeType: flow.trade_type,
    }
    const newCash = fpCash - cost
    const newTrades = [newTrade, ...fpTrades]
    const newAlert: FPAlert = {
      id: fpUid(),
      symbol: flow.underlying_ticker,
      type: 'ADDED',
      message: `Added ${flow.underlying_ticker} ${flow.strike}${flow.type === 'call' ? 'C' : 'P'} @ $${entryPrice.toFixed(2)} × ${contracts} — cost $${(cost).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      timestamp: Date.now(),
      read: false,
    }
    const newAlerts = [newAlert, ...fpAlerts].slice(0, 200)
    setFpTrades(newTrades)
    setFpCash(newCash)
    setFpAlerts(newAlerts)
    fpSave(newTrades, newAlerts, newCash, fpEquity)
  }

  const fpRemoveTrade = (tradeId: string) => {
    const trade = fpTrades.find((t) => t.id === tradeId)
    if (!trade) return
    // Refund open positions at current market price
    let refund = 0
    if (trade.status !== 'CLOSED' && trade.contracts > 0) {
      const lp = fpOptionPrices[trade.optionTicker] || trade.entryPrice
      refund = lp * trade.contracts * 100
    }
    const newTrades = fpTrades.filter((t) => t.id !== tradeId)
    const newCash = fpCash + refund
    setFpTrades(newTrades)
    setFpCash(newCash)
    fpSave(newTrades, fpAlerts, newCash, fpEquity)
  }

  const fpResetPortfolio = () => {
    const fresh = { trades: [], alerts: [], cash: FP_STARTING_BALANCE, equity: [{ ts: Date.now(), value: FP_STARTING_BALANCE }] }
    setFpTrades(fresh.trades)
    setFpAlerts(fresh.alerts)
    setFpCash(fresh.cash)
    setFpEquity(fresh.equity)
    fpSave(fresh.trades, fresh.alerts, fresh.cash, fresh.equity)
  }

  const fpMarkAlertsRead = () => {
    const updated = fpAlerts.map((a) => ({ ...a, read: true }))
    setFpAlerts(updated)
    fpSave(fpTrades, updated, fpCash, fpEquity)
  }

  // Compute portfolio metrics
  const fpOpenValue = fpTrades
    .filter((t) => t.status !== 'CLOSED')
    .reduce((s, t) => s + (fpOptionPrices[t.optionTicker] || t.entryPrice) * t.contracts * 100, 0)
  const fpTotalEquity = fpCash + fpOpenValue
  const fpTotalReturn = ((fpTotalEquity - FP_STARTING_BALANCE) / FP_STARTING_BALANCE) * 100
  const fpTotalRealizedPnl = fpTrades.reduce((s, t) => s + t.realizedPnl, 0)
  const fpOpenUnrealized = fpTrades
    .filter((t) => t.status !== 'CLOSED')
    .reduce((s, t) => {
      const lp = fpOptionPrices[t.optionTicker] || t.entryPrice
      const raw = (lp - t.entryPrice) * t.contracts * 100
      return s + (t.isSoldToOpen ? -raw : raw)
    }, 0)
  const fpUnreadCount = fpAlerts.filter((a) => !a.read).length

  return (
    <div className="relative bg-black w-full" style={{ ...(isMobile ? { flex: 1, minHeight: 0 } : {}), height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* ── Tab Bar ── */}
      <div style={{ display: 'flex', alignItems: 'stretch', background: 'linear-gradient(180deg,#0d0d0d 0%,#080808 100%)', flexShrink: 0, position: 'relative', padding: '6px 6px 0', gap: '4px', borderBottom: '1px solid rgba(255,133,0,0.15)' }}>
        {(['TRACKING', 'PORTFOLIO'] as const).map((tab) => {
          const isActive = activeTab === tab
          const tabLabel = tab === 'TRACKING' ? 'A+ Tracker' : 'Flow Portfolio'
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                flex: 1,
                padding: '9px 4px 8px',
                fontWeight: 900,
                letterSpacing: '2px',
                textTransform: 'uppercase',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                position: 'relative',
                borderRadius: '6px 6px 0 0',
                transition: 'color 0.15s',
                color: isActive ? '#ff8500' : '#ffffff',
                fontSize: '14px',
                borderBottom: isActive ? '2px solid #ff8500' : '2px solid transparent',
              }}
            >
              {tabLabel}
              {tab === 'PORTFOLIO' && fpUnreadCount > 0 && (
                <span style={{ position: 'absolute', top: '4px', right: '8px', background: '#ff8500', color: '#000', borderRadius: '999px', fontSize: '9px', fontWeight: 900, padding: '1px 5px', lineHeight: 1.4 }}>{fpUnreadCount}</span>
              )}
            </button>
          )
        })}
        {/* Close button — sits after tabs, styled as a tab */}
        {onClose && (
          <button
            onClick={onClose}
            style={{
              flexShrink: 0,
              width: '36px',
              height: '32px',
              margin: '4px 2px 0',
              padding: 0,
              background: '#ff8500',
              border: '2px solid #ff8500',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#000',
              fontSize: '22px',
              fontWeight: 700,
              lineHeight: 1,
              transition: 'background 0.15s, border-color 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#ff6a00'; e.currentTarget.style.borderColor = '#ff6a00' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#ff8500'; e.currentTarget.style.borderColor = '#ff8500' }}
            aria-label="Close"
          >
            &times;
          </button>
        )}
      </div>

      {/* ── TRACKING TAB ── */}
      {activeTab === 'TRACKING' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
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
                    const currentPrice = currentOptionPrices[optionTicker]
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
                        currentOptionPrices,
                        currentStockPrices,
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
                      const grA = calculateFlowGrade({ ...a, premium_per_contract: ep }, currentOptionPrices, currentStockPrices, emptyRS, defaultStdDevs, comboMap).grade
                      const ep2 = (b as any).originalPrice || b.premium_per_contract
                      const grB = calculateFlowGrade({ ...b, premium_per_contract: ep2 }, currentOptionPrices, currentStockPrices, emptyRS, defaultStdDevs, comboMap).grade
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
                    const currentPrice = currentOptionPrices[optionTicker]
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
                        currentOptionPrices,
                        currentStockPrices,
                        leapRsData,
                        leap52wkData,
                        leapSeasonalData
                      )
                      : calculateFlowGrade(
                        flowWithOriginalPrice,
                        currentOptionPrices,
                        currentStockPrices,
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
                    const rzStockNow = currentStockPrices[flow.underlying_ticker]
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
                onSymbolChange={(s) => setChartSymbol(s)}
              />
            </div>
          </div>
          )}
        </div>
      )}

      {/* ── PORTFOLIO TAB ── */}
      {activeTab === 'PORTFOLIO' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: '"JetBrains Mono","Courier New",monospace' }}>
          {/* Header metrics HUD */}
          <div style={{ padding: '10px 12px 8px', background: '#000', borderBottom: '1px solid #1f2937', flexShrink: 0 }}>
            {/* Metrics row + inline settings gear */}
            <div style={{ display: 'flex', alignItems: 'stretch', gap: '6px' }}>
              {([
                { key: 'acc', show: fpShowAccount, label: 'ACCOUNT', value: `$${fpTotalEquity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, color: fpTotalEquity >= FP_STARTING_BALANCE ? '#00ff88' : '#ff4466' },
                { key: 'rtn', show: fpShowTotalRtn, label: 'TOTAL RTN', value: fpFmtPct(fpTotalReturn), color: fpTotalReturn >= 0 ? '#00ff88' : '#ff4466' },
                { key: 'rel', show: fpShowRealized, label: 'REALIZED', value: fpFmtUsd(fpTotalRealizedPnl), color: fpTotalRealizedPnl >= 0 ? '#00ff88' : '#ff4466' },
                { key: 'opn', show: fpShowOpenPnl, label: 'OPEN P&L', value: fpFmtUsd(fpOpenUnrealized), color: fpOpenUnrealized >= 0 ? '#00ff88' : '#ff4466' },
              ] as { key: string; show: boolean; label: string; value: string; color: string }[]).filter((m) => m.show).map((m) => (
                <div key={m.key} style={{ flex: 1, background: '#000000', backgroundImage: 'linear-gradient(180deg,#1a1a1a 0%,#000000 60%,#0d0d0d 100%)', border: `1px solid ${m.color}40`, borderRadius: '6px', padding: '6px 8px', textAlign: 'center', minWidth: 0, boxShadow: `inset 0 1px 0 rgba(255,255,255,0.08), 0 0 10px ${m.color}18` }}>
                  <div style={{ fontSize: '13px', color: '#ffffff', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '2px', fontWeight: 700 }}>{m.label}</div>
                  <div style={{ fontSize: '20px', fontWeight: 900, color: m.color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.value}</div>
                </div>
              ))}
              {/* Settings gear inline */}
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <button
                  onClick={() => setFpSettingsOpen((p) => !p)}
                  style={{ height: '100%', background: fpSettingsOpen ? '#1a1a1a' : 'linear-gradient(180deg,#141414 0%,#0a0a0a 100%)', border: '1px solid #374151', borderRadius: '4px', color: '#ffffff', cursor: 'pointer', padding: '0 10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  title="Settings"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
                </button>
                {fpSettingsOpen && (
                  <div style={{ position: 'absolute', top: '100%', right: 0, zIndex: 50, marginTop: '4px', background: '#0d0d0d', border: '1px solid #2a2a2a', borderRadius: '8px', minWidth: '220px', boxShadow: '0 8px 28px rgba(0,0,0,0.8)', overflow: 'hidden' }}>
                    {/* Section: display toggles */}
                    <div style={{ padding: '7px 12px 4px', fontSize: '10px', color: '#6b7280', letterSpacing: '1.5px', fontWeight: 700, textTransform: 'uppercase' }}>DISPLAY</div>
                    {([
                      { label: 'Account', state: fpShowAccount, set: setFpShowAccount },
                      { label: 'Total RTN', state: fpShowTotalRtn, set: setFpShowTotalRtn },
                      { label: 'Realized P&L', state: fpShowRealized, set: setFpShowRealized },
                      { label: 'Open P&L', state: fpShowOpenPnl, set: setFpShowOpenPnl },
                    ] as { label: string; state: boolean; set: React.Dispatch<React.SetStateAction<boolean>> }[]).map(({ label, state, set }) => (
                      <button key={label} onClick={() => set((p) => !p)} style={{ width: '100%', padding: '8px 14px', background: 'transparent', border: 'none', color: '#ffffff', fontSize: '13px', fontWeight: 600, cursor: 'pointer', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: '"JetBrains Mono",monospace' }}>
                        <span>{label}</span>
                        <span style={{ color: state ? '#00ff88' : '#4b5563', fontWeight: 800, fontSize: '12px' }}>{state ? 'ON' : 'OFF'}</span>
                      </button>
                    ))}
                    <div style={{ height: '1px', background: '#1f2937', margin: '4px 0' }} />
                    {/* Section: chart */}
                    <div style={{ padding: '4px 12px 2px', fontSize: '10px', color: '#6b7280', letterSpacing: '1.5px', fontWeight: 700, textTransform: 'uppercase' }}>CHART</div>
                    {([
                      { label: 'Unrealized Line', state: fpShowUnrealized, set: setFpShowUnrealized },
                      { label: 'Win Rate Stats', state: fpShowStats, set: setFpShowStats },
                    ] as { label: string; state: boolean; set: React.Dispatch<React.SetStateAction<boolean>> }[]).map(({ label, state, set }) => (
                      <button key={label} onClick={() => set((p) => !p)} style={{ width: '100%', padding: '8px 14px', background: 'transparent', border: 'none', color: '#ffffff', fontSize: '13px', fontWeight: 600, cursor: 'pointer', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: '"JetBrains Mono",monospace' }}>
                        <span>{label}</span>
                        <span style={{ color: state ? '#00ff88' : '#4b5563', fontWeight: 800, fontSize: '12px' }}>{state ? 'ON' : 'OFF'}</span>
                      </button>
                    ))}
                    <div style={{ height: '1px', background: '#1f2937', margin: '4px 0' }} />
                    {/* Reset */}
                    <button onClick={() => { setFpSettingsOpen(false); if (window.confirm('Reset portfolio to $25,000?')) fpResetPortfolio() }} style={{ width: '100%', padding: '9px 14px', background: 'transparent', border: 'none', color: '#ef4444', fontSize: '13px', fontWeight: 700, cursor: 'pointer', textAlign: 'left', fontFamily: '"JetBrains Mono",monospace', letterSpacing: '0.5px' }}>
                      ↺  Reset Account
                    </button>
                  </div>
                )}
              </div>
            </div>
            {/* P&L Chart */}
            {fpEquity.length > 1 && (() => {
              const TF_MS: Record<string, number> = { '5m': 4 * 60 * 60 * 1000, '1h': 6.5 * 60 * 60 * 1000, '4h': 32 * 60 * 60 * 1000 }
              const now = Date.now()
              const raw = fpChartTf === '1D'
                ? fpEquity
                : fpEquity.filter((e) => now - e.ts <= TF_MS[fpChartTf])
              const data = raw.length > 0 ? raw : fpEquity.slice(-2)
              const pnlData = data.map((e) => ({ ts: e.ts, total: e.value - FP_STARTING_BALANCE, realized: e.realized ?? 0 }))

              const W = pnlChartWidth, H = 425
              const pad = { l: 64, r: 12, t: 14, b: 36 }
              const cW = W - pad.l - pad.r, cH = H - pad.t - pad.b

              const allVals = pnlData.flatMap((p) => [p.total, p.realized])
              const rawMin = Math.min(...allVals), rawMax = Math.max(...allVals)
              const pad5 = (rawMax - rawMin) * 0.08 || 50
              const minV = rawMin - pad5, maxV = rawMax + pad5
              const range = maxV - minV || 1

              const xS = (i: number) => pad.l + (pnlData.length < 2 ? cW : (i / (pnlData.length - 1)) * cW)
              const yS = (v: number) => pad.t + cH - ((v - minV) / range) * cH
              const zeroY = Math.max(pad.t, Math.min(H - pad.b, yS(0)))

              const totalPath = pnlData.map((p, i) => `${i === 0 ? 'M' : 'L'}${xS(i).toFixed(1)},${yS(p.total).toFixed(1)}`).join(' ')
              const realizedPath = pnlData.map((p, i) => `${i === 0 ? 'M' : 'L'}${xS(i).toFixed(1)},${yS(p.realized).toFixed(1)}`).join(' ')
              const fillPath = `${totalPath} L${xS(pnlData.length - 1).toFixed(1)},${zeroY.toFixed(1)} L${xS(0).toFixed(1)},${zeroY.toFixed(1)} Z`

              const lastTotal = pnlData[pnlData.length - 1].total
              const lastRealized = pnlData[pnlData.length - 1].realized
              const totalColor = lastTotal >= 0 ? '#00ff88' : '#ff4466'
              const hasRealized = pnlData.some((p) => p.realized !== 0)

              const yTickCount = 5
              const yTicks = Array.from({ length: yTickCount }, (_, i) => minV + (range / (yTickCount - 1)) * i)

              const xTickCount = Math.min(8, pnlData.length)
              const xTickIdxs = pnlData.length < 2 ? [0] : Array.from({ length: xTickCount }, (_, i) => Math.round((i / (xTickCount - 1)) * (pnlData.length - 1)))

              const fmtY = (v: number) => {
                const abs = Math.abs(v)
                const s = v >= 0 ? '+' : '-'
                if (abs >= 1000) return `${s}$${(abs / 1000).toFixed(1)}k`
                return `${s}$${abs.toFixed(0)}`
              }
              const fmtX = (ts: number) => {
                const d = new Date(ts)
                return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              }

              return (
                <div ref={pnlChartRef} style={{ margin: '10px 0 6px', background: '#000000', border: '1px solid #1f2937', borderRadius: '6px', padding: '8px 8px 6px' }}>
                  {/* Header row: legend + timeframe buttons */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '16px', color: totalColor, fontWeight: 700, whiteSpace: 'nowrap', fontFamily: '"JetBrains Mono",monospace' }}>Total P/L: <span style={{ fontSize: '19px', fontWeight: 900 }}>{fmtY(lastTotal)}</span></span>
                    <span style={{ fontSize: '16px', color: '#22d3ee', fontWeight: 700, whiteSpace: 'nowrap', fontFamily: '"JetBrains Mono",monospace' }}>Unrealized P/L: <span style={{ fontSize: '19px', fontWeight: 900 }}>{fmtY(lastTotal - lastRealized)}</span></span>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px' }}>
                      {(['5m', '1h', '4h', '1D'] as const).map((tf) => (
                        <button key={tf} onClick={() => setFpChartTf(tf)} style={{
                          fontSize: '12px', fontWeight: 800, padding: '3px 10px',
                          background: '#000000',
                          border: `1px solid ${fpChartTf === tf ? '#ff8500' : '#2a2a2a'}`,
                          borderRadius: '4px', color: fpChartTf === tf ? '#ff8500' : '#555555',
                          cursor: 'pointer', letterSpacing: '0.5px',
                        }}>{tf}</button>
                      ))}
                    </div>
                  </div>
                  {/* SVG chart */}
                  <svg width={W} height={H} style={{ display: 'block', overflow: 'visible' }}>
                    {/* Y-axis labels only — no grid lines */}
                    {yTicks.map((tick, i) => {
                      const y = yS(tick)
                      return (
                        <g key={i}>
                          <text x={pad.l - 5} y={(y + 5).toFixed(1)} textAnchor="end"
                            fill="#ffffff" fontSize="14" fontFamily="monospace">{fmtY(tick)}</text>
                        </g>
                      )
                    })}
                    {/* Zero line */}
                    <line x1={pad.l} y1={zeroY.toFixed(1)} x2={W - pad.r} y2={zeroY.toFixed(1)} stroke="#555" strokeWidth="1" />
                    {/* Fill */}
                    <path d={fillPath} fill={totalColor} opacity="0.22" />
                    {/* Realized P&L line */}
                    {hasRealized && fpShowUnrealized && (
                      <path d={realizedPath} fill="none" stroke="#ffd700" strokeWidth="2" strokeDasharray="5,3" opacity="1" />
                    )}
                    {/* Total P&L line */}
                    <path d={totalPath} fill="none" stroke={totalColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    {/* End dot */}
                    <circle cx={xS(pnlData.length - 1).toFixed(1)} cy={yS(lastTotal).toFixed(1)} r="3" fill={totalColor} />
                    {/* Y-axis line — solid white */}
                    <line x1={pad.l} y1={pad.t} x2={pad.l} y2={H - pad.b} stroke="#ffffff" strokeWidth="1.5" />
                    {/* X-axis line — solid white */}
                    <line x1={pad.l} y1={H - pad.b} x2={W - pad.r} y2={H - pad.b} stroke="#ffffff" strokeWidth="1.5" />
                    {/* X-axis labels */}
                    {xTickIdxs.map((idx, i) => (
                      <text key={i} x={xS(idx).toFixed(1)} y={H - pad.b + 18} textAnchor={i === 0 ? 'start' : i === xTickIdxs.length - 1 ? 'end' : 'middle'}
                        fill="#ffffff" fontSize="14" fontFamily="monospace">{fmtX(pnlData[idx].ts)}</text>
                    ))}
                    {/* X tick marks */}
                    {xTickIdxs.map((idx, i) => (
                      <line key={i} x1={xS(idx).toFixed(1)} y1={H - pad.b} x2={xS(idx).toFixed(1)} y2={(H - pad.b + 4).toFixed(1)} stroke="#ffffff" strokeWidth="1" />
                    ))}
                  </svg>
                </div>
              )
            })()}
            {/* Win Rate Stats */}
            {fpShowStats && (() => {
              const closed = fpTrades.filter((t) => t.status === 'CLOSED')
              const wins = closed.filter((t) => t.realizedPnl > 0)
              const losses = closed.filter((t) => t.realizedPnl <= 0)
              const winRate = closed.length > 0 ? (wins.length / closed.length) * 100 : 0
              const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.realizedPnl, 0) / wins.length : 0
              const avgLoss = losses.length > 0 ? losses.reduce((s, t) => s + t.realizedPnl, 0) / losses.length : 0
              const rr = avgLoss !== 0 ? Math.abs(avgWin / avgLoss) : 0
              return (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '4px', margin: '6px 0 0' }}>
                  {[
                    { label: 'WIN RATE', value: closed.length > 0 ? `${winRate.toFixed(0)}%` : '—', color: winRate >= 50 ? '#00ff88' : '#ff4466' },
                    { label: 'AVG WIN', value: wins.length > 0 ? `+$${avgWin.toFixed(0)}` : '—', color: '#00ff88' },
                    { label: 'AVG LOSS', value: losses.length > 0 ? `-$${Math.abs(avgLoss).toFixed(0)}` : '—', color: '#ff4466' },
                    { label: 'R:R', value: rr > 0 ? rr.toFixed(2) : '—', color: rr >= 1 ? '#00ff88' : '#ff4466' },
                  ].map((s) => (
                    <div key={s.label} style={{ background: '#000000', backgroundImage: 'linear-gradient(180deg,#1a1a1a 0%,#000000 60%,#0d0d0d 100%)', border: `1px solid ${s.color}40`, borderRadius: '6px', padding: '6px 8px', textAlign: 'center', boxShadow: `inset 0 1px 0 rgba(255,255,255,0.08), 0 0 10px ${s.color}18` }}>
                      <div style={{ fontSize: '14px', color: '#ffffff', letterSpacing: '0.8px', marginBottom: '2px', fontWeight: 700 }}>{s.label}</div>
                      <div style={{ fontSize: '20px', fontWeight: 900, color: s.color }}>{s.value}</div>
                    </div>
                  ))}
                </div>
              )
            })()}
          </div>

          {/* Sub-tabs: POSITIONS | ALERTS | CLOSED */}
          <div style={{ display: 'flex', borderBottom: '1px solid #1f2937', flexShrink: 0 }}>
            {(['POSITIONS', 'ALERTS', 'CLOSED'] as const).map((st) => (
              <button
                key={st}
                onClick={() => { setFpPortfolioTab(st); if (st === 'ALERTS') fpMarkAlertsRead() }}
                style={{
                  flex: 1, padding: '6px 4px', fontSize: '18px', fontWeight: 700, letterSpacing: '1.5px',
                  textTransform: 'uppercase', background: 'transparent', border: 'none', cursor: 'pointer',
                  color: fpPortfolioTab === st ? '#ff8500' : '#ffffff',
                  borderBottom: fpPortfolioTab === st ? '2px solid #ff8500' : '2px solid transparent',
                  transition: 'all 0.15s', position: 'relative',
                }}
              >
                {st}
                {st === 'ALERTS' && fpUnreadCount > 0 && (
                  <span style={{ marginLeft: '4px', background: '#ff8500', color: '#000', borderRadius: '999px', fontSize: '17px', fontWeight: 900, padding: '1px 5px' }}>{fpUnreadCount}</span>
                )}
              </button>
            ))}
          </div>

          {/* Scrollable content */}
          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '8px' }}>
            {fpPortfolioTab === 'POSITIONS' && (() => {
              const open = fpTrades.filter((t) => t.status === 'OPEN' || t.status === 'PARTIAL')
              const closed = fpTrades.filter((t) => t.status === 'CLOSED')

              const renderTrade = (trade: FlowPortfolioTrade) => {
                const lp = fpOptionPrices[trade.optionTicker] || trade.currentPrice || trade.entryPrice
                const rawPct = lp > 0 ? ((lp - trade.entryPrice) / trade.entryPrice) * 100 : 0
                const pnlPct = trade.isSoldToOpen ? -rawPct : rawPct
                const openPnl = trade.status !== 'CLOSED' ? (trade.isSoldToOpen ? (trade.entryPrice - lp) : (lp - trade.entryPrice)) * trade.contracts * 100 : 0
                const totalPnl = trade.realizedPnl + openPnl
                const pnlColor = totalPnl >= 0 ? '#00ff88' : '#ff3333'
                const pctColor = pnlPct >= 0 ? '#00ff88' : '#ff3333'
                const accentColor = trade.optionType === 'call' ? '#00ff88' : '#ff3333'
                const expD = new Date(trade.expiry + 'T12:00:00')
                const expiryDisplay = `${expD.getMonth() + 1}/${expD.getDate()}/${String(expD.getFullYear()).slice(-2)}`
                const isClosed = trade.status === 'CLOSED'
                const parentZones = dealerZoneCacheFromParent?.[trade.underlying]
                const zones = parentZones && (parentZones.golden !== null || parentZones.purple !== null)
                  ? parentZones
                  : (ownDealerZones[trade.underlying] ?? null)
                const tradeSize = trade.entryPrice > 0 ? Math.round(trade.totalPremium / (trade.entryPrice * 100)) : 0
                const flowTime = trade.tradeTimestamp ? new Date(trade.tradeTimestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : ''

                if (isClosed) {
                  return (
                    <div key={trade.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px 7px 0', background: 'linear-gradient(180deg,#0e0e0f 0%,#080808 100%)', border: '1px solid #252530', borderRadius: '6px', overflow: 'hidden', opacity: 0.75 }}>
                      <div style={{ width: '3px', alignSelf: 'stretch', background: pnlColor, borderRadius: '0 2px 2px 0', flexShrink: 0 }} />
                      <span style={{ fontSize: '17px', fontWeight: 800, color: '#ffffff', minWidth: '50px' }}>{trade.underlying}</span>
                      <span style={{ fontSize: '16px', color: accentColor, fontWeight: 700 }}>${trade.strike}{trade.optionType === 'call' ? 'C' : 'P'}</span>
                      <span style={{ fontSize: '15px', color: '#ffffff', fontWeight: 700 }}>{expiryDisplay}</span>
                      <span style={{ fontSize: '15px', color: '#ffffff' }}>${trade.entryPrice.toFixed(2)} → ${lp.toFixed(2)}</span>
                      <span style={{ fontSize: '16px', fontWeight: 700, color: pnlColor, marginLeft: 'auto' }}>{fpFmtUsd(totalPnl)}</span>
                    </div>
                  )
                }

                return (
                  <div key={trade.id} style={{ background: 'linear-gradient(180deg,#111214 0%,#0a0a0b 60%,#050506 100%)', border: `1px solid ${accentColor}45`, borderRadius: '8px', overflow: 'hidden', marginBottom: '6px', boxShadow: '0 4px 14px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.04)' }}>
                    <div style={{ height: '3px', background: `linear-gradient(90deg,${accentColor} 0%,transparent 70%)` }} />
                    {/* Row 1: Ticker · Strike CALL/PUT · 2 @$price · Expiry · Live price · % change · $ P&L */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '10px 10px 6px', flexWrap: 'nowrap' }}>
                      <span style={{ fontSize: '26px', fontWeight: 900, color: '#ffffff', flexShrink: 0 }}>{trade.underlying}</span>
                      <span style={{ fontSize: '20px', fontWeight: 700, color: accentColor, flexShrink: 0 }}>${trade.strike} {trade.optionType === 'call' ? 'CALL' : 'PUT'}</span>
                      <span style={{ fontSize: '18px', fontWeight: 700, color: '#ffffff', flexShrink: 0 }}>{trade.contracts} <span style={{ color: '#ffffff' }}>@</span><span style={{ color: '#fbbf24' }}>${trade.entryPrice.toFixed(2)}</span></span>
                      <span style={{ fontSize: '18px', fontWeight: 700, color: '#ffffff', flexShrink: 0 }}>{expiryDisplay}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto', backgroundColor: '#000000', backgroundImage: 'linear-gradient(180deg,#1a1a1a 0%,#000000 50%,#0d0d0d 100%)', border: `1px solid ${pnlColor}44`, borderRadius: '8px', padding: '4px 10px', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)', flexShrink: 0 }}>
                        <span style={{ fontSize: '16px', fontWeight: 800, color: '#ffffff' }}>${lp.toFixed(2)}</span>
                        <span style={{ fontSize: '15px', fontWeight: 800, color: pctColor }}>{pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%</span>
                        <span style={{ fontSize: '15px', fontWeight: 800, color: pnlColor }}>{fpFmtUsd(totalPnl)}</span>
                      </span>
                    </div>
                    {/* Row 2: Magnet · Pivot · T1 · T2 · SL · Sell */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 10px 10px', flexWrap: 'nowrap' }}>
                      {zones && zones.golden != null && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '13px', fontWeight: 800, backgroundColor: '#000000', backgroundImage: 'linear-gradient(180deg,#1a1a1a 0%,#000000 50%,#0d0d0d 100%)', border: '1px solid rgba(255,215,0,0.6)', borderRadius: '4px', padding: '3px 8px', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)', flexShrink: 0 }}>
                          <span style={{ color: '#FFD700', letterSpacing: '0.6px' }}>MAGNET</span>
                          <span style={{ color: '#FFD700', fontWeight: 900 }}>${zones.golden}</span>
                        </span>
                      )}
                      {zones && zones.purple != null && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '13px', fontWeight: 800, backgroundColor: '#000000', backgroundImage: 'linear-gradient(180deg,#1a1a1a 0%,#000000 50%,#0d0d0d 100%)', border: '1px solid rgba(168,85,247,0.6)', borderRadius: '4px', padding: '3px 8px', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)', flexShrink: 0 }}>
                          <span style={{ color: '#a855f7', letterSpacing: '0.6px' }}>PIVOT</span>
                          <span style={{ color: '#a855f7', fontWeight: 900 }}>${zones.purple}</span>
                        </span>
                      )}
                      <span style={{ fontSize: '13px', fontWeight: 800, backgroundColor: '#000000', backgroundImage: 'linear-gradient(180deg,#1a1a1a 0%,#000000 50%,#0d0d0d 100%)', border: `1px solid ${trade.t1Filled ? '#374151' : '#00ff88'}`, borderRadius: '4px', padding: '3px 8px', color: trade.t1Filled ? '#4b5563' : '#00ff88', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)', textDecoration: trade.t1Filled ? 'line-through' : 'none', flexShrink: 0 }}>T1 ${trade.t1.toFixed(2)}</span>
                      <span style={{ fontSize: '13px', fontWeight: 800, backgroundColor: '#000000', backgroundImage: 'linear-gradient(180deg,#1a1a1a 0%,#000000 50%,#0d0d0d 100%)', border: `1px solid ${trade.t2Filled ? '#374151' : '#00ff88'}`, borderRadius: '4px', padding: '3px 8px', color: trade.t2Filled ? '#4b5563' : '#00ff88', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)', textDecoration: trade.t2Filled ? 'line-through' : 'none', flexShrink: 0 }}>T2 ${trade.t2.toFixed(2)}</span>
                      <span style={{ fontSize: '13px', fontWeight: 800, backgroundColor: '#000000', backgroundImage: 'linear-gradient(180deg,#1a1a1a 0%,#000000 50%,#0d0d0d 100%)', border: '1px solid #ff3333', borderRadius: '4px', padding: '3px 8px', color: '#ff3333', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)', flexShrink: 0 }}>SL ${trade.stopLoss.toFixed(2)}</span>
                      <button
                        onClick={() => {
                          if (fpSellTimerRef.current && fpSellTimerRef.current.tradeId === trade.id) {
                            clearTimeout(fpSellTimerRef.current.id)
                            fpSellTimerRef.current = null
                            setFpFlowDetailId(prev => prev === trade.id ? null : trade.id)
                          } else {
                            if (fpSellTimerRef.current) clearTimeout(fpSellTimerRef.current.id)
                            fpSellTimerRef.current = { id: setTimeout(() => { fpRemoveTrade(trade.id); fpSellTimerRef.current = null }, 300), tradeId: trade.id }
                          }
                        }}
                        style={{ fontSize: '13px', fontWeight: 800, padding: '3px 10px', border: '1px solid #ff3333', borderRadius: '4px', cursor: 'pointer', background: '#000000', backgroundImage: 'linear-gradient(180deg,#1a1a1a 0%,#000000 50%,#0d0d0d 100%)', color: '#ff3333', flexShrink: 0, marginLeft: 'auto', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)' }}
                        title="Sell · Double-click for flow details"
                      >Sell</button>
                    </div>
                    {/* Flow detail row (double-click Sell to toggle) */}
                    {fpFlowDetailId === trade.id && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px 10px', borderTop: '1px solid rgba(255,255,255,0.07)', flexWrap: 'wrap' }}>
                        {flowTime && <span style={{ fontSize: '13px', color: '#6b7280', fontWeight: 600 }}>{flowTime}</span>}
                        <span style={{ fontSize: '13px', color: '#ffffff', fontWeight: 800 }}>{trade.underlying}</span>
                        <span style={{ fontSize: '13px', color: accentColor, fontWeight: 700 }}>${trade.strike} {trade.optionType === 'call' ? 'CALL' : 'PUT'}</span>
                        {tradeSize > 0 && <span style={{ fontSize: '13px', color: '#ffffff', fontWeight: 600 }}>{tradeSize.toLocaleString()}ct</span>}
                        <span style={{ fontSize: '13px', color: '#fbbf24', fontWeight: 700 }}>${trade.entryPrice.toFixed(2)}</span>
                        <span style={{ fontSize: '13px', color: '#ffffff', fontWeight: 600 }}>{expiryDisplay}</span>
                        {trade.tradeType && <span style={{ fontSize: '12px', fontWeight: 800, color: trade.tradeType === 'SWEEP' ? '#FFD700' : '#00e5ff', border: `1px solid ${trade.tradeType === 'SWEEP' ? 'rgba(255,215,0,0.6)' : 'rgba(0,229,255,0.5)'}`, borderRadius: '9999px', padding: '1px 7px', backgroundColor: '#000', backgroundImage: 'linear-gradient(180deg,#1e1e1e 0%,#000 50%,#111 100%)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15)' }}>{trade.tradeType}</span>}
                      </div>
                    )}
                    {(trade.t1Filled || trade.realizedPnl !== 0) && (
                      <div style={{ display: 'flex', gap: '10px', padding: '6px 10px 8px', borderTop: '1px solid #1a1f2e' }}>
                        <span style={{ fontSize: '13px', color: '#ffffff' }}>Realized: <span style={{ color: trade.realizedPnl >= 0 ? '#00ff88' : '#ff3333', fontWeight: 700 }}>{fpFmtUsd(trade.realizedPnl)}</span></span>
                        {trade.t1Filled && <span style={{ fontSize: '13px', color: '#ffd700' }}>T1 @ ${trade.t1FillPrice.toFixed(2)}</span>}
                        {trade.t2Filled && <span style={{ fontSize: '13px', color: '#00ff88' }}>T2 @ ${trade.t2FillPrice.toFixed(2)}</span>}
                      </div>
                    )}
                  </div>
                )
              }

              // Section header helper
              const SectionHeader = ({ label, count, color }: { label: string; count: number; color: string }) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', marginTop: '4px', background: '#000000', backgroundImage: `linear-gradient(180deg,#1c1c1c 0%,#000000 60%,#0d0d0d 100%)`, border: `1px solid ${color}50`, borderRadius: '6px', padding: '8px 12px', boxShadow: `inset 0 1px 0 rgba(255,255,255,0.1), 0 0 12px ${color}18` }}>
                  <span style={{ fontSize: '16px', fontWeight: 900, letterSpacing: '2px', color, textTransform: 'uppercase' }}>{label}</span>
                  <span style={{ fontSize: '14px', fontWeight: 800, color: '#000000', background: color, borderRadius: '999px', padding: '2px 9px', lineHeight: 1.5 }}>{count}</span>
                </div>
              )

              return (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '45fr 14px 55fr', gap: '0 5px', alignItems: 'start' }}>
                    {/* ── LEFT: WATCHLIST ── */}
                    {(() => {
                      const wlComboMap: Map<string, boolean> = comboTradeMapFromParent ?? new Map<string, boolean>()
                      const wlRS = relativeStrengthData ?? new Map<string, number>()
                      const wlStdDevs = ownStdDevs.size > 0 ? ownStdDevs : (historicalStdDevsFromParent ?? new Map<string, number>())
                      const flows = liveFlowsFromParent ?? trackedFlows
                      return (
                        <div style={{ maxHeight: '700px', overflowY: 'auto', paddingRight: '2px' }}>
                          <SectionHeader label="Flow on Watch" count={flows.length} color="#ff8500" />
                          {flows.length === 0 ? (
                            <div style={{ padding: '16px', background: '#08090a', border: '1px solid #1a1f2e', borderRadius: '8px', color: '#4b5563', fontSize: '14px', textAlign: 'center' }}>No live flows available</div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                              {flows.map((flow) => {
                                const today = new Date(); today.setHours(0, 0, 0, 0)
                                const expDate = new Date(flow.expiry); expDate.setHours(0, 0, 0, 0)
                                const isExpired = expDate < today
                                const alreadyIn = fpIsInPortfolio(flow)
                                const ep = (flow as any).originalPrice || flow.premium_per_contract
                                const fillStyle = flow.fill_style || ''
                                const isSoldToOpen = fillStyle === 'B' || fillStyle === 'BB'
                                const dte = Math.max(0, Math.floor((expDate.getTime() - today.getTime()) / 86400000))
                                const expStr = flow.expiry.replace(/-/g, '').slice(2)
                                const strikeStr = String(Math.round(flow.strike * 1000)).padStart(8, '0')
                                const optType = flow.type.toLowerCase() === 'call' ? 'C' : 'P'
                                const optTicker = `O:${normalizeTickerForOptions(flow.underlying_ticker)}${expStr}${optType}${strikeStr}`
                                const curPrice = currentOptionPrices[optTicker]
                                const liveBuyPrice = curPrice && curPrice > 0 ? curPrice : ep
                                let pctChange = 0, priceHigher = false
                                if (curPrice && curPrice > 0) {
                                  const raw = ((curPrice - ep) / ep) * 100
                                  pctChange = isSoldToOpen ? -raw : raw
                                  priceHigher = pctChange > 0
                                }
                                const liveGrade = calculateFlowGrade(
                                  { ...flow, premium_per_contract: ep },
                                  currentOptionPrices, currentStockPrices, wlRS, wlStdDevs, wlComboMap
                                )
                                const accentColor = flow.type === 'call' ? '#00ff88' : '#ff3333'
                                const fsColor = fillStyle === 'A' || fillStyle === 'AA' ? '#00ff88' : fillStyle === 'B' || fillStyle === 'BB' ? '#ff4466' : '#ff8500'
                                const expiryShort = formatDate(flow.expiry)
                                const parentZones = dealerZoneCacheFromParent?.[flow.underlying_ticker]
                                const zones = parentZones && (parentZones.golden !== null || parentZones.purple !== null)
                                  ? parentZones
                                  : (ownDealerZones[flow.underlying_ticker] ?? null)

                                return (
                                  <div key={generateFlowId(flow)} style={{ background: 'linear-gradient(180deg,#111214 0%,#080809 100%)', border: `1px solid ${alreadyIn ? 'rgba(255,133,0,0.5)' : isExpired ? '#1f2937' : `${accentColor}40`}`, borderRadius: '8px', overflow: 'hidden', opacity: isExpired ? 0.45 : 1, boxShadow: '0 4px 12px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)' }}>
                                    <div style={{ height: '3px', background: `linear-gradient(90deg,${alreadyIn ? '#ff8500' : accentColor} 0%,transparent 70%)` }} />
                                    {/* Row 1: Ticker · Strike CALL/PUT · contracts@price+fill · BLOCK/SWEEP badge */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '8px 10px 3px', flexWrap: 'nowrap' }}>
                                      <span style={{ fontSize: '26px', fontWeight: 900, color: '#ffffff', letterSpacing: '-0.3px', flexShrink: 0 }}>{flow.underlying_ticker}</span>
                                      <span style={{ fontSize: '21px', fontWeight: 800, color: accentColor, flexShrink: 0 }}>${flow.strike} {flow.type.toUpperCase()}</span>
                                      <span style={{ fontSize: '19px', color: '#ffffff', fontWeight: 700, flexShrink: 0 }}>{flow.trade_size.toLocaleString()}<span style={{ color: '#ffffff' }}>@</span><span style={{ color: '#fbbf24' }}>${ep.toFixed(2)}</span>{fillStyle && fillStyle !== 'N/A' && <span style={{ color: fsColor }}>{fillStyle}</span>}</span>
                                      {(flow.trade_type === 'SWEEP' || flow.trade_type === 'BLOCK') && (
                                        <span style={{ fontSize: '16px', fontWeight: 800, letterSpacing: '0.05em', backgroundColor: '#000000', backgroundImage: 'linear-gradient(180deg,#1e1e1e 0%,#000000 50%,#111111 100%)', color: flow.trade_type === 'SWEEP' ? '#FFD700' : '#00e5ff', border: `1px solid ${flow.trade_type === 'SWEEP' ? 'rgba(255,215,0,0.6)' : 'rgba(0,229,255,0.5)'}`, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15)', borderRadius: '9999px', padding: '2px 8px', flexShrink: 0 }}>
                                          {flow.trade_type}
                                        </span>
                                      )}
                                    </div>
                                    {/* Row 2: Premium · Expiry · Stock > Current */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '2px 10px 3px', flexWrap: 'nowrap' }}>
                                      <span style={{ fontSize: '19px', color: '#00ff88', fontWeight: 700, flexShrink: 0 }}>{formatCurrency(flow.total_premium)}</span>
                                      <span style={{ fontSize: '17px', color: dte <= 7 ? '#ef4444' : '#ffffff', fontWeight: 700, flexShrink: 0 }}>{expiryShort}{isExpired && <span style={{ fontSize: '15px', background: '#374151', borderRadius: '3px', padding: '1px 3px', marginLeft: '4px' }}>EXP</span>}</span>
                                      {flow.spot_price > 0 && (
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '3px', flexShrink: 0 }}>
                                          <span style={{ fontSize: '17px', color: '#ffffff', fontWeight: 700 }}>${flow.spot_price.toFixed(1)}</span>
                                          <span style={{ fontSize: '15px', color: '#ffffff', fontWeight: 700 }}>{'>'}</span>
                                          <span style={{ fontSize: '17px', fontWeight: 700, color: currentStockPrices[flow.underlying_ticker] ? (currentStockPrices[flow.underlying_ticker] >= flow.spot_price ? '#00ff88' : '#ff4466') : '#ffffff' }}>
                                            {currentStockPrices[flow.underlying_ticker] ? `$${currentStockPrices[flow.underlying_ticker].toFixed(1)}` : '—'}
                                          </span>
                                        </span>
                                      )}
                                    </div>
                                    {/* Row 3: Magnet · Pivot · Score · Buy */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '2px 10px 8px', flexWrap: 'nowrap' }}>
                                      {zones && zones.golden != null && (
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '3px', fontWeight: 800, backgroundColor: '#000000', backgroundImage: 'linear-gradient(180deg,#1a1a1a 0%,#000000 50%,#0d0d0d 100%)', border: '1px solid rgba(255,215,0,0.6)', borderRadius: '4px', padding: '3px 8px', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)', flexShrink: 0 }}>
                                          <span style={{ fontSize: '12px', color: '#FFD700', letterSpacing: '0.6px' }}>MAGNET</span>
                                          <span style={{ fontSize: '14px', fontWeight: 900, color: '#FFD700' }}>${zones.golden}</span>
                                          {zones.goldenExpiry && <span style={{ fontSize: '11px', fontWeight: 700, color: '#FFD700' }}>{zones.goldenExpiry.slice(5).replace('-', '/')}</span>}
                                        </span>
                                      )}
                                      {zones && zones.purple != null && (
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '3px', fontWeight: 800, backgroundColor: '#000000', backgroundImage: 'linear-gradient(180deg,#1a1a1a 0%,#000000 50%,#0d0d0d 100%)', border: '1px solid rgba(168,85,247,0.6)', borderRadius: '4px', padding: '3px 8px', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)', flexShrink: 0 }}>
                                          <span style={{ fontSize: '12px', color: '#a855f7', letterSpacing: '0.6px' }}>PIVOT</span>
                                          <span style={{ fontSize: '14px', fontWeight: 900, color: '#a855f7' }}>${zones.purple}</span>
                                          {zones.purpleExpiry && <span style={{ fontSize: '11px', fontWeight: 700, color: '#a855f7' }}>{zones.purpleExpiry.slice(5).replace('-', '/')}</span>}
                                        </span>
                                      )}
                                      {liveGrade.grade !== 'N/A' && (
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, backgroundColor: '#000000', backgroundImage: 'linear-gradient(180deg,#1a1a1a 0%,#000000 50%,#0d0d0d 100%)', border: `1px solid ${liveGrade.color}99`, borderRadius: '4px', padding: '3px 8px', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)' }}>
                                          <span style={{ fontSize: '19px', fontWeight: 900, color: liveGrade.color }}>{liveGrade.grade}</span>
                                          {curPrice && curPrice > 0 && <span style={{ fontSize: '13px', fontWeight: 800, color: priceHigher ? '#00ff88' : '#ff4466' }}>{priceHigher ? '+' : ''}{pctChange.toFixed(1)}%</span>}
                                        </span>
                                      )}
                                      {(!liveGrade.grade || liveGrade.grade === 'N/A') && curPrice && curPrice > 0 && (
                                        <span style={{ fontSize: '15px', fontWeight: 800, color: priceHigher ? '#00ff88' : '#ff4466', flexShrink: 0 }}>{priceHigher ? '+' : ''}{pctChange.toFixed(1)}%</span>
                                      )}
                                      <button onClick={() => { if (!alreadyIn) fpAddTrade(flow, liveBuyPrice) }} disabled={alreadyIn || isExpired} style={{ fontSize: '15px', fontWeight: 800, padding: '4px 8px', border: '1px solid #00ff88', borderRadius: '5px', cursor: alreadyIn || isExpired ? 'default' : 'pointer', background: alreadyIn ? 'rgba(0,255,136,0.12)' : 'linear-gradient(180deg,rgba(0,255,136,0.25) 0%,rgba(0,255,136,0.1) 100%)', color: '#00ff88', flexShrink: 0, boxShadow: alreadyIn ? 'none' : '0 1px 6px rgba(0,255,136,0.25)', whiteSpace: 'nowrap', marginLeft: 'auto' }}>{alreadyIn ? '✓ In' : `Buy $${liveBuyPrice.toFixed(1)}`}</button>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })()}

                    {/* ── DNA Separator ── */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '46px', gap: 0 }}>
                      {Array.from({ length: 32 }, (_, i) => (
                        <React.Fragment key={i}>
                          <div style={{
                            width: i % 2 === 0 ? '8px' : '5px',
                            height: i % 2 === 0 ? '8px' : '5px',
                            borderRadius: '50%',
                            background: i % 3 === 0 ? '#ff8500' : i % 3 === 1 ? '#00ff88' : '#2a2a2a',
                            boxShadow: i % 3 < 2 ? `0 0 5px ${i % 3 === 0 ? '#ff850080' : '#00ff8880'}` : 'none',
                            flexShrink: 0
                          }} />
                          <div style={{ width: '1px', height: '12px', background: i % 3 === 0 ? 'linear-gradient(180deg,#ff8500,#ff850015)' : i % 3 === 1 ? 'linear-gradient(180deg,#00ff88,#00ff8815)' : 'linear-gradient(180deg,#2a2a2a,#111)', flexShrink: 0 }} />
                        </React.Fragment>
                      ))}
                    </div>

                    {/* ── RIGHT: OPEN POSITIONS ── */}
                    <div style={{ maxHeight: '700px', overflowY: 'auto', paddingRight: '2px' }}>
                      {open.length > 0 ? (
                        <>
                          <SectionHeader label="Open Flow Positions" count={open.length} color="#00ff88" />
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {open.map(renderTrade)}
                          </div>
                        </>
                      ) : (
                        <div style={{ textAlign: 'center', padding: '24px 8px', color: '#ffffff', fontSize: '13px', fontWeight: 600, letterSpacing: '1px', border: '1px dashed #374151', borderRadius: '6px', marginTop: '2px' }}>
                          No open positions
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ── CLOSED POSITIONS moved to CLOSED tab ── */}
                </>
              )
            })()}

            {fpPortfolioTab === 'CLOSED' && (() => {
              const closed = fpTrades.filter((t) => t.status === 'CLOSED')
              if (closed.length === 0) return (
                <div style={{ textAlign: 'center', padding: '40px 16px', color: '#6b7280', fontSize: '14px', fontWeight: 600 }}>No closed trades yet</div>
              )
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {closed.map((trade) => {
                    const lp = fpOptionPrices[trade.optionTicker] || trade.currentPrice || trade.entryPrice
                    const totalPnl = trade.realizedPnl
                    const pnlColor = totalPnl >= 0 ? '#00ff88' : '#ff3333'
                    const accentColor = trade.optionType === 'call' ? '#00ff88' : '#ff3333'
                    const expD = new Date(trade.expiry + 'T12:00:00')
                    const expiryDisplay = `${expD.getMonth() + 1}/${expD.getDate()}/${String(expD.getFullYear()).slice(-2)}`
                    return (
                      <div key={trade.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px 10px 0', background: 'linear-gradient(180deg,#0e0e0f 0%,#080808 100%)', border: '1px solid #252530', borderRadius: '6px', overflow: 'hidden' }}>
                        <div style={{ width: '4px', alignSelf: 'stretch', background: pnlColor, borderRadius: '0 2px 2px 0', flexShrink: 0 }} />
                        <span style={{ fontSize: '21px', fontWeight: 800, color: '#ffffff', minWidth: '50px' }}>{trade.underlying}</span>
                        <span style={{ fontSize: '20px', color: accentColor, fontWeight: 700 }}>${trade.strike}{trade.optionType === 'call' ? 'C' : 'P'}</span>
                        <span style={{ fontSize: '19px', color: '#ffffff', fontWeight: 700 }}>{expiryDisplay}</span>
                        <span style={{ fontSize: '19px', color: '#ffffff', fontWeight: 600 }}>${trade.entryPrice.toFixed(2)} → ${lp.toFixed(2)}</span>
                        <span style={{ fontSize: '20px', fontWeight: 800, color: pnlColor, marginLeft: 'auto' }}>{fpFmtUsd(totalPnl)}</span>
                      </div>
                    )
                  })}
                </div>
              )
            })()}

            {fpPortfolioTab === 'ALERTS' && (
              fpAlerts.length === 0
                ? (
                  <div style={{ textAlign: 'center', padding: '40px 16px' }}>
                    <div style={{ fontSize: '28px', marginBottom: '8px' }}>🔔</div>
                    <div style={{ color: '#ffffff', fontSize: '14px', fontWeight: 600 }}>No alerts yet</div>
                    <div style={{ color: '#ffffff', fontSize: '12px', marginTop: '4px', opacity: 0.7 }}>Alerts fire when T1/T2/SL hit, positions open or close, and trade triggers appear</div>
                  </div>
                )
                : fpAlerts.slice().reverse().map((alert) => {
                  const iconMap: Record<string, string> = {
                    T1_HIT: '🎯', T2_HIT: '🚀', STOP_LOSS: '🛑', GAP_FILL: '⚡',
                    CLOSED: '✅', ADDED: '➕', BOUGHT: '💚', SOLD: '🔴', TRIGGER: '⚡',
                  }
                  const colorMap: Record<string, string> = {
                    T1_HIT: '#ffd700', T2_HIT: '#00ff88', STOP_LOSS: '#ff4466',
                    GAP_FILL: '#ff8500', CLOSED: '#6b7280', ADDED: '#60a5fa',
                    BOUGHT: '#00ff88', SOLD: '#ff4466', TRIGGER: '#ff8500',
                  }
                  const accentColor = colorMap[alert.type] || '#ffffff'
                  const actionLabel = alert.action === 'BUY' ? 'BOUGHT' : alert.action === 'SELL' ? 'SOLD' : null
                  return (
                    <div key={alert.id} style={{ marginBottom: '6px', background: alert.read ? '#08090a' : '#0d0f14', border: `1px solid ${alert.read ? '#1a1f2e' : `${accentColor}50`}`, borderRadius: '6px', overflow: 'hidden' }}>
                      <div style={{ height: '2px', background: alert.read ? '#1a1f2e' : `linear-gradient(90deg,${accentColor} 0%,transparent 100%)` }} />
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 12px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '20px', flexShrink: 0 }}>{iconMap[alert.type] || '🔔'}</span>
                        <span style={{ fontSize: '14px', fontWeight: 900, color: accentColor, letterSpacing: '1px', textTransform: 'uppercase', border: `1px solid ${accentColor}50`, borderRadius: '3px', padding: '2px 7px', flexShrink: 0, backgroundColor: `${accentColor}12` }}>{alert.type.replace('_', ' ')}</span>
                        <span style={{ fontSize: '13px', color: '#6b7280', fontWeight: 600, flexShrink: 0 }}>{new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        {actionLabel && <span style={{ fontSize: '14px', fontWeight: 800, color: alert.action === 'BUY' ? '#00ff88' : '#ff4466', border: `1px solid ${alert.action === 'BUY' ? '#00ff8850' : '#ff446650'}`, borderRadius: '3px', padding: '2px 7px', flexShrink: 0 }}>{actionLabel}</span>}
                        <span style={{ fontSize: '15px', color: '#ffffff', fontWeight: alert.read ? 500 : 700, flex: 1, minWidth: '120px' }}>{alert.message}</span>
                        {!alert.read && <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#ff8500', flexShrink: 0 }} />}
                      </div>
                    </div>
                  )
                })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
