'use client'

import { TbStar } from 'react-icons/tb'

import React, { useEffect, useRef, useState } from 'react'

import { calculateFlowGrade } from '@/lib/flowGrading'

const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf'

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
  return `${month}/${day}/${year}`
}

const generateFlowId = (trade: OptionsFlowData): string =>
  `${trade.underlying_ticker}-${trade.strike}-${trade.expiry}-${trade.type}-${trade.trade_timestamp}-${trade.trade_size}`

export default function FlowTrackingPanel() {
  const [isMounted, setIsMounted] = useState(false)
  const [trackedFlows, setTrackedFlows] = useState<OptionsFlowData[]>([])
  const [flowTrackingFilters, setFlowTrackingFilters] = useState({
    gradeFilter: 'ALL' as 'ALL' | 'A' | 'B' | 'C' | 'D' | 'F',
    showDownSixtyPlus: false,
    showCharts: typeof window !== 'undefined' && window.innerWidth >= 768,
    showWeeklies: false,
  })
  const [swipedFlowId, setSwipedFlowId] = useState<string | null>(null)
  const [touchStart, setTouchStart] = useState<number>(0)
  const [touchCurrent, setTouchCurrent] = useState<number>(0)
  const [currentOptionPrices, setCurrentOptionPrices] = useState<Record<string, number>>({})
  const [currentStockPrices, setCurrentStockPrices] = useState<Record<string, number>>({})
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
    const saved = localStorage.getItem('flowTrackingWatchlist')
    if (saved) {
      try {
        const flows: OptionsFlowData[] = JSON.parse(saved)
        setTrackedFlows(flows)
      } catch {
        /* ignore */
      }
    }
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

  if (!isMounted) return null

  return (
    <div className="relative bg-black w-full h-full overflow-auto">
      {/* Panel Header */}
      <div className="sticky top-0 bg-black z-10 border-b border-gray-700 p-4">
        <h2
          className="text-3xl font-black text-center"
          style={{
            fontFamily: 'Impact, Arial Black, sans-serif',
            background:
              'linear-gradient(90deg, #ff0000 0%, #00ff00 33%, #ffd700 66%, #ff0000 100%)',
            backgroundSize: '200% 100%',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            letterSpacing: '3px',
            fontWeight: 900,
            animation: 'ftGradientShift 3s ease infinite',
          }}
        >
          LIVE FLOW TRACKING
        </h2>
        <style>{`@keyframes ftGradientShift { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }`}</style>

        {/* Filters */}
        <div
          className="mt-3"
          style={{ background: '#000000', borderRadius: '8px', padding: '12px' }}
        >
          <div className="flex items-center gap-3 justify-center flex-wrap">
            <span style={{ color: '#ffffff', fontSize: '21px', fontWeight: 'bold' }}>
              Flows: {trackedFlows.length}
            </span>
            <div
              style={{
                width: '2px',
                height: '30px',
                background: 'rgba(255,133,0,0.3)',
                margin: '0 8px',
              }}
            />
            <span style={{ color: '#ff8500', fontSize: '21px', fontWeight: 'bold' }}>Grade:</span>
            <select
              value={flowTrackingFilters.gradeFilter}
              onChange={(e) =>
                setFlowTrackingFilters((prev) => ({ ...prev, gradeFilter: e.target.value as any }))
              }
              style={{
                padding: '6px 12px',
                fontSize: '20px',
                fontWeight: 'bold',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                background: '#000000',
                color: '#ffffff',
                outline: 'none',
                minWidth: '100px',
                boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.8)',
              }}
            >
              <option value="ALL">ALL</option>
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
              <option value="D">D</option>
              <option value="F">F</option>
            </select>
            <div
              style={{
                width: '2px',
                height: '30px',
                background: 'rgba(255,133,0,0.3)',
                margin: '0 8px',
              }}
            />
            {[
              {
                key: 'showDownSixtyPlus',
                label: 'Down 60%+',
                activeColor: '#ff0000',
                textColor: '#ff0000',
              },
              { key: 'showCharts', label: 'Chart', activeColor: '#00ffff', textColor: '#00ffff' },
              {
                key: 'showWeeklies',
                label: 'Weeklies',
                activeColor: '#00ff00',
                textColor: '#00ff00',
              },
            ].map(({ key, label, activeColor, textColor }) => (
              <button
                key={key}
                onClick={() =>
                  setFlowTrackingFilters((prev) => ({
                    ...prev,
                    [key]: !prev[key as keyof typeof prev],
                  }))
                }
                style={{
                  padding: '6px 14px',
                  fontSize: '20px',
                  fontWeight: 'bold',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  background: flowTrackingFilters[key as keyof typeof flowTrackingFilters]
                    ? activeColor
                    : '#000000',
                  color: flowTrackingFilters[key as keyof typeof flowTrackingFilters]
                    ? '#000000'
                    : textColor,
                  transition: 'all 0.2s',
                  boxShadow: flowTrackingFilters[key as keyof typeof flowTrackingFilters]
                    ? `0 2px 8px ${activeColor}40`
                    : 'inset 2px 2px 4px rgba(0,0,0,0.8)',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Panel Content */}
      <div
        className="overflow-y-auto overflow-x-hidden p-3"
        style={{ height: 'calc(100vh - 220px)' }}
      >
        {trackedFlows.length === 0 ? (
          <div className="text-center py-12 text-orange-400">
            <TbStar className="w-16 h-16 text-orange-500 mb-4 mx-auto" />
            <p className="text-lg font-semibold">No flows tracked yet</p>
            <p className="text-sm mt-2">Click the star icon next to any flow to track it</p>
          </div>
        ) : (
          (() => {
            // Build comboMap from tracked flows (same logic as OptionsFlowTable)
            const comboMap = new Map<string, boolean>()
            const comboCount = new Map<string, number>()
            trackedFlows.forEach((f) => {
              const key = `${f.underlying_ticker}-${f.strike}-${f.expiry}-${f.type}-${f.fill_style || ''}`
              comboCount.set(key, (comboCount.get(key) || 0) + 1)
            })
            comboCount.forEach((count, key) => {
              if (count > 1) comboMap.set(key, true)
            })
            // Empty RS/stddev maps — same defaults as OptionsFlowTable uses during initial load
            const emptyRS = new Map<string, number>()
            const defaultStdDevs = new Map<string, number>(
              trackedFlows.map((f) => [f.underlying_ticker, 2.5])
            )

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
                  const daysToExpiry = Math.floor(
                    (new Date(flow.expiry).getTime() - Date.now()) / 86400000
                  )
                  if (daysToExpiry > 7) return false
                }
                return true
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
                const liveGrade = calculateFlowGrade(
                  flowWithOriginalPrice,
                  currentOptionPrices,
                  currentStockPrices,
                  emptyRS,
                  defaultStdDevs,
                  comboMap
                )

                const flowId = generateFlowId(flow)
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
                    className="relative overflow-hidden mb-3"
                    style={{
                      boxShadow:
                        '0 8px 32px rgba(0,0,0,0.9), 0 2px 0 rgba(255,255,255,0.06) inset, 0 -2px 0 rgba(0,0,0,0.8) inset',
                      borderRadius: '6px',
                      perspective: '1000px',
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
                        <table className="w-full text-center" style={{ tableLayout: 'fixed' }}>
                          <tbody>
                            <tr className="border-b border-gray-700">
                              <td className="p-1" style={{ width: '15%' }}>
                                <div className="flex flex-col items-center space-y-0.5">
                                  <span className="bg-gradient-to-b from-gray-800 to-black text-orange-500 font-bold px-1.5 py-0.5 border border-gray-500/70 text-xl">
                                    {flow.underlying_ticker}
                                  </span>
                                  <span className="text-lg text-white font-bold">
                                    {formatTime(flow.trade_timestamp)}
                                  </span>
                                </div>
                              </td>
                              <td className="p-1" style={{ width: '15%' }}>
                                <div className="flex flex-col items-center space-y-0.5">
                                  <span className="text-white font-semibold text-xl">
                                    ${flow.strike}
                                  </span>
                                  <span
                                    className={`font-bold text-lg ${flow.type === 'call' ? 'text-green-500' : 'text-red-500'}`}
                                  >
                                    {flow.type.toUpperCase()}
                                  </span>
                                </div>
                              </td>
                              <td className="p-1" style={{ width: '30%' }}>
                                <div className="flex flex-col items-center space-y-0.5">
                                  <div className="flex items-center gap-0.5 flex-wrap justify-center">
                                    <span className="text-cyan-400 font-bold text-xl">
                                      {flow.trade_size.toLocaleString()}
                                    </span>
                                    <span className="text-yellow-400 text-xl">
                                      @${entryPrice.toFixed(2)}
                                    </span>
                                    {fillStyle && (
                                      <span
                                        className={`text-xl font-bold ${fillStyle === 'A' || fillStyle === 'AA' ? 'text-green-400' : fillStyle === 'B' || fillStyle === 'BB' ? 'text-red-400' : 'text-orange-400'}`}
                                      >
                                        {fillStyle}
                                      </span>
                                    )}
                                  </div>
                                  <span className="font-bold text-lg text-green-400">
                                    {formatCurrency(flow.total_premium)}
                                  </span>
                                </div>
                              </td>
                              <td className="p-1" style={{ width: '20%' }}>
                                <div className="flex flex-col items-center space-y-0.5">
                                  <span className="text-white text-lg">
                                    {formatDate(flow.expiry)}
                                  </span>
                                  {flow.trade_type &&
                                    (flow.trade_type === 'SWEEP' ||
                                      flow.trade_type === 'BLOCK') && (
                                      <span
                                        className="font-bold text-lg"
                                        style={{
                                          color:
                                            flow.trade_type === 'SWEEP'
                                              ? '#FFD700'
                                              : 'rgba(0,150,255,1)',
                                        }}
                                      >
                                        {flow.trade_type}
                                      </span>
                                    )}
                                </div>
                              </td>
                              <td className="p-1" style={{ width: '20%' }}>
                                <div className="flex flex-col items-center space-y-0.5">
                                  {currentPrice && currentPrice > 0 ? (
                                    <span
                                      className="font-bold text-lg"
                                      style={{ color: priceHigher ? '#00ff00' : '#ff0000' }}
                                    >
                                      {priceHigher ? '+' : ''}
                                      {percentChange.toFixed(1)}%
                                    </span>
                                  ) : (
                                    <span className="text-lg text-gray-500">-</span>
                                  )}
                                  {liveGrade.grade !== 'N/A' && (
                                    <span
                                      className="font-black text-xl"
                                      style={{
                                        color: liveGrade.color,
                                        textShadow: `0 0 8px ${liveGrade.color}88`,
                                      }}
                                    >
                                      {liveGrade.grade}
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          </tbody>
                        </table>
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
    </div>
  )
}
