'use client'

import { TbStar } from 'react-icons/tb'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'

import { calculateFlowGrade, calculateLeapGradeShared } from '@/lib/flowGrading'
import { useFlowTrackingPanelMobile } from './useFlowTrackingPanelMobile'

const EFIChart = dynamic(() => import('@/components/trading/EFICharting'), { ssr: false })
const AlgoFlowScreener = dynamic(() => import('@/components/AlgoFlowScreener'), { ssr: false })

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
  algoFlowTrades,
  algoFlowTicker,
  parentOptionPrices,
  parentStockPrices,
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
  algoFlowTrades?: OptionsFlowData[]
  algoFlowTicker?: string
  parentOptionPrices?: Record<string, number>
  parentStockPrices?: Record<string, number>
} = {}) {
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
      <div style={{ display: 'flex', alignItems: 'stretch', background: 'linear-gradient(180deg,#0d0d0d 0%,#080808 100%)', flexShrink: 0, position: 'relative', padding: '6px 6px 0', gap: '4px', borderBottom: '1px solid rgba(255,133,0,0.15)', justifyContent: 'flex-end' }}>
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
