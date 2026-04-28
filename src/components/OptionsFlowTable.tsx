'use client'

import { TbStar, TbStarFilled } from 'react-icons/tb'
import * as XLSX from 'xlsx'

import React, { useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
// Import your existing Polygon service

import { polygonService } from '@/lib/polygonService'
import { useDealerZonesStore } from '@/store/dealerZonesStore'

import '../app/options-flow/mobile.css'
import FlowTrackingPanel from './FlowTrackingPanel'

// Polygon API key for bid/ask analysis

const POLYGON_API_KEY = process.env.NEXT_PUBLIC_POLYGON_API_KEY || ''

// Helper function to normalize ticker for options contracts

// Polygon removes periods from tickers in option symbols (e.g., BRK.B → BRKB)

const normalizeTickerForOptions = (ticker: string): string => {
  return ticker.replace(/\./g, '')
}

// BID/ASK EXECUTION ANALYSIS - OPTIMIZED FOR HIGH VOLUME

// COMBINED ENRICHMENT - Fetch Vol/OI AND Fill Style in ONE API call per trade

const enrichTradeDataCombined = async (
  trades: any[],

  updateCallback: (results: any[]) => void
): Promise<any[]> => {
  if (trades.length === 0) return trades

  const BATCH_SIZE = 50 // Process 50 trades per batch

  const BATCH_DELAY = 200 // 200ms delay between batches (5 req/sec limit)

  const REQUEST_DELAY = 20 // 20ms stagger between requests

  const batches = []

  for (let i = 0; i < trades.length; i += BATCH_SIZE) {
    batches.push(trades.slice(i, i + BATCH_SIZE))
  }

  const allResults = []

  let successCount = 0

  let failCount = 0

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex]

    const batchResults = await Promise.all(
      batch.map(async (trade, tradeIndex) => {
        await new Promise((resolve) => setTimeout(resolve, tradeIndex * REQUEST_DELAY))

        try {
          const expiry = trade.expiry.replace(/-/g, '').slice(2)

          const strikeFormatted = String(Math.round(trade.strike * 1000)).padStart(8, '0')

          const optionType = trade.type.toLowerCase() === 'call' ? 'C' : 'P'

          const optionTicker = `O:${normalizeTickerForOptions(trade.underlying_ticker)}${expiry}${optionType}${strikeFormatted}`

          // Use snapshot endpoint - gets EVERYTHING in one call (quotes, greeks, Vol/OI)

          const snapshotUrl = `https://api.polygon.io/v3/snapshot/options/${trade.underlying_ticker}/${optionTicker}?apikey=${POLYGON_API_KEY}`

          const response = await fetch(snapshotUrl, {
            signal: AbortSignal.timeout(8000),
          })

          if (!response.ok) {
            return { ...trade, fill_style: 'N/A', volume: null, open_interest: null }
          }

          const data = await response.json()

          if (data.results) {
            const result = data.results

            // Extract Vol/OI

            const volume = result.day?.volume || null

            const openInterest = result.open_interest || null

            // Extract IV from snapshot (used for Targets column)
            const impliedVolatility: number | null =
              result.implied_volatility || result.greeks?.iv || null

            successCount++

            // Extract fill style from last quote

            let fillStyle = 'N/A'

            if (result.last_quote) {
              const bid = result.last_quote.bid

              const ask = result.last_quote.ask

              const fillPrice = trade.premium_per_contract

              if (bid && ask && fillPrice) {
                const midpoint = (bid + ask) / 2

                if (fillPrice >= ask + 0.01) {
                  fillStyle = 'AA'
                } else if (fillPrice <= bid - 0.01) {
                  fillStyle = 'BB'
                } else if (fillPrice === ask) {
                  fillStyle = 'A'
                } else if (fillPrice === bid) {
                  fillStyle = 'B'
                } else if (fillPrice >= midpoint) {
                  fillStyle = 'A'
                } else {
                  fillStyle = 'B'
                }
              }
            }

            return {
              ...trade,
              fill_style: fillStyle,
              volume,
              open_interest: openInterest,
              implied_volatility: impliedVolatility ?? trade.implied_volatility,
            }
          }

          return { ...trade, fill_style: 'N/A', volume: null, open_interest: null }
        } catch (error) {
          failCount++

          console.error(`❌ Error enriching ${trade.underlying_ticker}:`, error)

          return { ...trade, fill_style: 'N/A', volume: null, open_interest: null }
        }
      })
    )

    allResults.push(...batchResults)

    updateCallback([...allResults])

    if (batchIndex < batches.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY))
    }
  }

  return allResults
}

// OLD SEPARATE FUNCTIONS - DEPRECATED (keeping for backwards compatibility)

const analyzeBidAskExecutionLightning = async (
  trades: any[],

  updateCallback: (results: any[]) => void
): Promise<any[]> => {
  if (trades.length === 0) return trades

  const BATCH_SIZE = 50 // Increased from 10 to 50 for speed

  const BATCH_DELAY = 200 // 200ms delay for rate limit compliance

  const batches = []

  for (let i = 0; i < trades.length; i += BATCH_SIZE) {
    batches.push(trades.slice(i, i + BATCH_SIZE))
  }

  const allResults = []

  // Process batches sequentially to avoid overwhelming the network

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex]

    if (batchIndex % 100 === 0) {
    }

    const batchResults = await Promise.all(
      batch.map(async (trade, tradeIndex) => {
        // Minimal stagger - 5ms each instead of 20ms

        await new Promise((resolve) => setTimeout(resolve, tradeIndex * 5))

        try {
          const expiry = trade.expiry.replace(/-/g, '').slice(2)

          const strikeFormatted = String(Math.round(trade.strike * 1000)).padStart(8, '0')

          const optionType = trade.type.toLowerCase() === 'call' ? 'C' : 'P'

          const optionTicker = `O:${normalizeTickerForOptions(trade.underlying_ticker)}${expiry}${optionType}${strikeFormatted}`

          const tradeTime = new Date(trade.trade_timestamp)

          const checkTimestamp = tradeTime.getTime() * 1000000

          const quotesUrl = `https://api.polygon.io/v3/quotes/${optionTicker}?timestamp.lte=${checkTimestamp}&limit=1&apikey=${POLYGON_API_KEY}`

          const response = await fetch(quotesUrl)

          const data = await response.json()

          if (data.results && data.results.length > 0) {
            const quote = data.results[0]

            const bid = quote.bid_price

            const ask = quote.ask_price

            const fillPrice = trade.premium_per_contract

            if (bid && ask && fillPrice) {
              let fillStyle = 'N/A'

              const midpoint = (bid + ask) / 2

              // Above Ask: Must be at least 1 cent above ask price

              if (fillPrice >= ask + 0.01) {
                fillStyle = 'AA'

                // Below Bid: Must be at least 1 cent below bid price
              } else if (fillPrice <= bid - 0.01) {
                fillStyle = 'BB'

                // At Ask: Exactly at ask price
              } else if (fillPrice === ask) {
                fillStyle = 'A'

                // At Bid: Exactly at bid price
              } else if (fillPrice === bid) {
                fillStyle = 'B'

                // Between bid and ask: Use midpoint logic
              } else if (fillPrice >= midpoint) {
                fillStyle = 'A'
              } else {
                fillStyle = 'B'
              }

              return { ...trade, fill_style: fillStyle }
            }
          }

          return { ...trade, fill_style: 'N/A' }
        } catch (error) {
          return { ...trade, fill_style: 'N/A' }
        }
      })
    )

    allResults.push(...batchResults)

    // Update the UI with processed trades in real-time

    updateCallback([...allResults])

    // Add delay between batches to prevent overwhelming the API

    if (batchIndex < batches.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY))
    }
  }
  return allResults
}

// VOLUME & OPEN INTEREST FETCHING - ULTRA-FAST PARALLEL PROCESSING

const fetchVolumeAndOpenInterest = async (
  trades: any[],

  updateCallback: (results: any[]) => void
): Promise<any[]> => {
  if (trades.length === 0) return trades

  const BATCH_SIZE = 10 // Process only 10 trades per batch (very conservative)

  const BATCH_DELAY = 200 // 200ms delay between batches (5 req/sec limit)

  const REQUEST_DELAY = 100 // 100ms stagger between requests within batch

  const batches = []

  for (let i = 0; i < trades.length; i += BATCH_SIZE) {
    batches.push(trades.slice(i, i + BATCH_SIZE))
  }
  const allResults = []

  // Process batches sequentially with massive parallel requests within each batch

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex]

    if (batchIndex % 10 === 0) {
    }

    const batchResults = await Promise.all(
      batch.map(async (trade, tradeIndex) => {
        // Stagger requests to prevent connection resets

        await new Promise((resolve) => setTimeout(resolve, tradeIndex * REQUEST_DELAY))

        try {
          const ticker = trade.underlying_ticker

          const strike = trade.strike

          const optionType = trade.type.toLowerCase() // 'call' or 'put'

          const expiration = trade.expiry // Format: 2025-10-28

          // Build option symbol: O:SPY251028C00679000

          const expDate = expiration.split('-') // ['2025', '10', '28']

          const year = expDate[0].slice(2) // '25'

          const month = expDate[1] // '10'

          const day = expDate[2] // '28'

          const callPut = optionType === 'call' ? 'C' : 'P'

          const strikeStr = Math.round(strike * 1000)
            .toString()
            .padStart(8, '0') // 00679000

          const optionSymbol = `O:${ticker}${year}${month}${day}${callPut}${strikeStr}`

          const snapshotUrl = `https://api.polygon.io/v3/snapshot/options/${ticker}/${optionSymbol}?apikey=${POLYGON_API_KEY}`

          const response = await fetch(snapshotUrl, {
            signal: AbortSignal.timeout(8000), // Longer timeout
          })

          if (!response.ok) {
            return { ...trade, volume: 0, open_interest: 0 }
          }

          const data = await response.json()

          if (data.status === 'OK' && data.results) {
            const snap = data.results

            const volume = snap.day?.volume || 0

            const openInterest = snap.open_interest || 0

            return {
              ...trade,

              volume: volume,

              open_interest: openInterest,
            }
          }

          return { ...trade, volume: 0, open_interest: 0 }
        } catch (error) {
          return { ...trade, volume: 0, open_interest: 0 }
        }
      })
    )

    allResults.push(...batchResults)

    // Update the UI with processed trades in real-time

    updateCallback([...allResults])

    // Delay between batches to prevent rate limiting

    if (batchIndex < batches.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY))
    }
  }
  return allResults
}

// Memoized price display component to prevent flickering

const PriceDisplay = React.memo(function PriceDisplay({
  spotPrice,

  currentPrice,

  isLoading,

  ticker,

  isNotablePick,
}: {
  spotPrice: number

  currentPrice?: number

  isLoading?: boolean

  ticker: string

  isNotablePick?: boolean
}) {
  // Don't show anything if spot price is missing or invalid

  if (!spotPrice || spotPrice <= 0) {
    return <span className="text-gray-500">No Price Data</span>
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <span style={{ color: 'white', fontWeight: 'bold' }}>${spotPrice.toFixed(2)}</span>

        <span className="text-gray-400">{'>>'} </span>

        <span className="text-gray-400 animate-pulse">fetching...</span>
      </div>
    )
  }

  if (!currentPrice || currentPrice <= 0) {
    // Show just spot price if current price not available

    return (
      <div className="flex items-center gap-2">
        <span style={{ color: 'white', fontWeight: isNotablePick ? 'bold' : undefined }}>
          ${spotPrice.toFixed(2)}
        </span>

        <span className="text-gray-600">{'>>'} </span>

        <span className="text-gray-500">--</span>
      </div>
    )
  }

  const colorClass =
    currentPrice > spotPrice
      ? 'text-green-400 font-bold'
      : currentPrice < spotPrice
        ? 'text-red-400 font-bold'
        : 'text-white'

  return (
    <div className="flex items-center gap-2">
      <span style={{ color: 'white', fontWeight: isNotablePick ? 'bold' : undefined }}>
        ${spotPrice.toFixed(2)}
      </span>

      <span className="text-gray-400">{'>>'} </span>

      <span className={colorClass}>${currentPrice.toFixed(2)}</span>
    </div>
  )
})

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

  base_open_interest?: number

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

interface OptionsFlowSummary {
  total_trades: number

  total_premium: number

  unique_symbols: number

  trade_types: {
    BLOCK: number

    SWEEP: number

    'MULTI-LEG': number

    MINI: number
  }

  call_put_ratio: {
    calls: number

    puts: number
  }

  processing_time_ms: number
}

interface MarketInfo {
  status: 'LIVE' | 'LAST_TRADING_DAY'

  is_live: boolean

  data_date: string

  market_open: boolean
}

// ── Pure Black-Scholes helpers (same math as DealerOpenInterestChart) ──
function _bsNormalCDF(x: number): number {
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
function _bsD2(S: number, K: number, r: number, sigma: number, T: number): number {
  return (Math.log(S / K) + (r - 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T))
}
function bsStrikeForProb(
  S: number,
  sigma: number,
  dte: number,
  prob: number,
  isCall: boolean
): number | null {
  if (!sigma || sigma <= 0 || dte <= 0) return null
  const r = 0.0387
  const T = dte / 365
  const copCall = (K: number) => (1 - _bsNormalCDF(_bsD2(S, K, r, sigma, T))) * 100
  const copPut = (K: number) => _bsNormalCDF(_bsD2(S, K, r, sigma, T)) * 100
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
interface OptionsFlowTableProps {
  data: OptionsFlowData[]

  summary: OptionsFlowSummary

  marketInfo?: MarketInfo

  loading?: boolean

  onRefresh?: (ticker?: string) => void

  onClearData?: () => void

  onDataUpdate?: (data: OptionsFlowData[]) => void

  selectedTicker: string

  onTickerChange: (ticker: string) => void

  streamingStatus?: string

  streamingProgress?: { current: number; total: number } | null

  streamError?: string

  useDropdowns?: boolean

  hideFlowTracking?: boolean

  showFlowTrackingInline?: boolean

  isSidebarPanel?: boolean

  historicalDays?: string

  onHistoricalDaysChange?: (days: string) => void
}

export const OptionsFlowTable: React.FC<OptionsFlowTableProps> = ({
  data,

  summary,

  marketInfo,

  loading = false,

  onRefresh,

  onClearData,

  onDataUpdate,

  selectedTicker,

  onTickerChange,

  streamingStatus,

  streamingProgress,

  streamError,

  useDropdowns = false,

  hideFlowTracking = false,

  showFlowTrackingInline = false,

  isSidebarPanel = false,

  historicalDays = '1D',

  onHistoricalDaysChange,
}) => {
  const [sortField, setSortField] = useState<keyof OptionsFlowData | 'positioning_grade'>(
    'trade_timestamp'
  )

  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  const [filterType, setFilterType] = useState<string>('all')

  const [selectedOptionTypes, setSelectedOptionTypes] = useState<string[]>(['call', 'put'])
  const [selectedOrderSides, setSelectedOrderSides] = useState<string[]>([])

  const [selectedPremiumFilters, setSelectedPremiumFilters] = useState<string[]>(
    typeof window !== 'undefined' && window.innerWidth < 768 ? ['50000'] : []
  )

  const [customMinPremium, setCustomMinPremium] = useState<string>('')

  const [customMaxPremium, setCustomMaxPremium] = useState<string>('')

  const [selectedTickerFilters, setSelectedTickerFilters] = useState<string[]>([])

  const [selectedUniqueFilters, setSelectedUniqueFilters] = useState<string[]>(
    typeof window !== 'undefined' && window.innerWidth < 768 ? ['OTM'] : []
  )

  const [expirationStartDate, setExpirationStartDate] = useState<string>('')

  const [expirationEndDate, setExpirationEndDate] = useState<string>('')

  const [blacklistedTickers, setBlacklistedTickers] = useState<string[]>(() => {
    const empty10 = ['', '', '', '', '', '', '', '', '', '']
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('optionsflow_blacklist')
        if (saved) {
          const parsed: string[] = JSON.parse(saved)
          // Pad to 10 slots if fewer were saved
          while (parsed.length < 10) parsed.push('')
          return parsed
        }
      } catch { }
    }
    return empty10
  })

  const [selectedTickerFilter, setSelectedTickerFilter] = useState<string>('')

  const [inputTicker, setInputTicker] = useState<string>('')

  const [isInputFocused, setIsInputFocused] = useState<boolean>(false)

  const [isFilterDialogOpen, setIsFilterDialogOpen] = useState<boolean>(false)

  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState<boolean>(false)

  const [savedFlowDates, setSavedFlowDates] = useState<
    Array<{ date: string; size: number; createdAt: string }>
  >([])

  const [loadingHistory, setLoadingHistory] = useState<boolean>(false)

  const [savingFlow, setSavingFlow] = useState<boolean>(false)

  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')

  const [saveErrorMsg, setSaveErrorMsg] = useState<string>('')

  const [loadingFlowDate, setLoadingFlowDate] = useState<string | null>(null)

  const [currentPage, setCurrentPage] = useState<number>(1)

  const [itemsPerPage] = useState<number>(250)

  const [quickFilters, setQuickFilters] = useState<{
    otm: boolean

    weekly: boolean

    premium100k: boolean

    sweep: boolean

    block: boolean
  }>({ otm: false, weekly: false, premium100k: false, sweep: false, block: false })

  const [efiHighlightsActive, setEfiHighlightsActive] = useState<boolean>(false)

  const [isFlowTrackingOpen, setIsFlowTrackingOpen] = useState<boolean>(false)

  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false)

  const [currentPrices, setCurrentPrices] = useState<Record<string, number>>({})

  const [priceLoadingState, setPriceLoadingState] = useState<Record<string, boolean>>({})

  const [currentOptionPrices, setCurrentOptionPrices] = useState<Record<string, number>>({})

  const [optionPricesFetching, setOptionPricesFetching] = useState<boolean>(false)

  const [gradingProgress, setGradingProgress] = useState<{ current: number; total: number } | null>(
    null
  )

  const [tradesWithFillStyles, setTradesWithFillStyles] = useState<OptionsFlowData[]>([])

  const [stockChartData, setStockChartData] = useState<
    Record<string, { price: number; timestamp: number }[]>
  >({})

  const [optionsPremiumData, setOptionsPremiumData] = useState<
    Record<string, { price: number; timestamp: number }[]>
  >({})

  const [chartTimeframe, setChartTimeframe] = useState<'1D' | '1W' | '1M'>('1D')

  const [flowChartTimeframes, setFlowChartTimeframes] = useState<
    Record<string, { stock: '1D' | '1W' | '1M'; option: '1D' | '1W' | '1M' }>
  >({})

  const [isMounted, setIsMounted] = useState(false)
  const [isMobileView, setIsMobileView] = useState(false)

  // State for historical price data - storing last 3 days of high/low ranges

  const [historicalRanges, setHistoricalRanges] = useState<
    Map<string, { high: number; low: number }[]>
  >(new Map())

  const [historicalStdDevs, setHistoricalStdDevs] = useState<Map<string, number>>(new Map())
  const [stdDevFailed, setStdDevFailed] = useState<Set<string>>(new Set())

  const [relativeStrengthData, setRelativeStrengthData] = useState<Map<string, number>>(new Map()) // ticker -> RS value

  const [historicalDataLoading, setHistoricalDataLoading] = useState<Set<string>>(new Set())

  const [hoveredGradeIndex, setHoveredGradeIndex] = useState<number | null>(null)

  const [notableFilterActive, setNotableFilterActive] = useState<boolean>(false)

  const [selectedNotableTrade, setSelectedNotableTrade] = useState<OptionsFlowData | null>(null)
  const [notableAnalysisLoading, setNotableAnalysisLoading] = useState<boolean>(false)
  const [notableAnalysisData, setNotableAnalysisData] = useState<{
    t1: number
    t2: number
    spotAtEntry: number
    pctToT1: number
    pctToT2: number
    goldenZones: Array<{ strike: number; oi: number; expiry: string }>
    purpleZones: Array<{ strike: number; oi: number; expiry: string }>
  } | null>(null)

  // Cache: key = `${ticker}_${expiry}` → { golden: strike|null, purple: strike|null }
  const getDealerZone = useDealerZonesStore((s) => s.getZone)
  const [dealerZoneCache, setDealerZoneCache] = useState<
    Record<
      string,
      {
        golden: number | null
        purple: number | null
        atmIV: number | null
        goldenExpiry?: string | null
        purpleExpiry?: string | null
      }
    >
  >({})

  const [pricesFetchedForDataset, setPricesFetchedForDataset] = useState<string>('') // Track if prices were fetched for current dataset

  // State for option price checkpoints for Stock Reaction Score

  const [optionPriceCheckpoints, setOptionPriceCheckpoints] = useState<
    Map<
      string,
      {
        optionPrice1Hr: number | null

        optionPrice3Hr: number | null

        stockPrice2Hr: number | null
      }
    >
  >(new Map())

  // Flow Tracking (Watchlist) state - panel always visible

  const [trackedFlows, setTrackedFlows] = useState<OptionsFlowData[]>([])

  // Flow Tracking filters

  const [flowTrackingFilters, setFlowTrackingFilters] = useState({
    gradeFilter: 'ALL' as 'ALL' | 'A' | 'B' | 'C' | 'D' | 'F',

    showDownSixtyPlus: false,

    showCharts: typeof window !== 'undefined' && window.innerWidth < 768 ? false : true,

    showWeeklies: false,
  })

  // Swipe-to-delete state for mobile

  const [swipedFlowId, setSwipedFlowId] = useState<string | null>(null)

  const [touchStart, setTouchStart] = useState<number>(0)

  const [touchCurrent, setTouchCurrent] = useState<number>(0)

  // Mobile view detection
  useEffect(() => {
    const checkMobile = () => setIsMobileView(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Persist blacklisted tickers to localStorage
  useEffect(() => {
    localStorage.setItem('optionsflow_blacklist', JSON.stringify(blacklistedTickers))
  }, [blacklistedTickers])

  // Ensure blacklist always has 10 slots (migrate old 5-slot saves)
  useEffect(() => {
    if (blacklistedTickers.length < 10) {
      setBlacklistedTickers((prev) => {
        const padded = [...prev]
        while (padded.length < 10) padded.push('')
        return padded
      })
    }
  }, [])

  // Ensure component is mounted on client side to avoid hydration issues

  useEffect(() => {
    setIsMounted(true)

    // Load tracked flows from localStorage

    const savedFlows = localStorage.getItem('flowTrackingWatchlist')

    if (savedFlows) {
      try {
        const flows = JSON.parse(savedFlows)

        setTrackedFlows(flows)

        // Fetch range data for all loaded flows

        const uniqueTickers: string[] = [
          ...new Set(flows.map((f: OptionsFlowData) => f.underlying_ticker)),
        ] as string[]

        Promise.all(
          uniqueTickers.map(async (ticker: string) => {
            if (!historicalRanges.has(ticker) && !historicalDataLoading.has(ticker)) {
              setHistoricalDataLoading((prev) => new Set(prev).add(ticker))

              try {
                const ranges = await fetchHistoricalRanges(ticker)

                setHistoricalRanges((prev) => new Map(prev).set(ticker, ranges))
              } catch (error) {
                console.error(`Failed to fetch ranges for ${ticker}:`, error)
              } finally {
                setHistoricalDataLoading((prev) => {
                  const newSet = new Set(prev)

                  newSet.delete(ticker)

                  return newSet
                })
              }
            }
          })
        )
      } catch (error) {
        console.error('Error loading tracked flows:', error)
      }
    }
  }, [])

  // Debug: Monitor filter dialog state changes

  useEffect(() => {
    // Removed excessive logging for performance
  }, [isFilterDialogOpen])

  // Prevent body from scrolling to eliminate page-level scrollbar

  // Only run on client-side to avoid hydration mismatch

  useEffect(() => {
    if (typeof window !== 'undefined') {
      document.body.style.overflow = 'hidden'

      document.documentElement.style.overflow = 'hidden'

      return () => {
        document.body.style.overflow = ''

        document.documentElement.style.overflow = ''
      }
    }
  }, [])

  // Fetch current prices using the direct API call that works (anti-flicker)

  const fetchCurrentPrices = async (tickers: string[]) => {
    const uniqueTickers = [...new Set(tickers)]

    if (uniqueTickers.length === 0) {
      return
    }

    // Set all tickers to loading state initially

    const initialLoadingState: Record<string, boolean> = {}

    uniqueTickers.forEach((ticker) => {
      initialLoadingState[ticker] = true
    })

    setPriceLoadingState((prev) => ({ ...prev, ...initialLoadingState }))

    // OPTIMIZED PARALLEL BATCH PROCESSING with rate limit respect

    const BATCH_SIZE = 15 // Process 15 tickers per batch (increased from 3)

    const BATCH_DELAY = 200 // 200ms between batches (5 req/sec limit)

    const MAX_CONCURRENT_BATCHES = 3 // Process 3 batches in parallel

    // Split tickers into batches

    const batches = []

    for (let i = 0; i < uniqueTickers.length; i += BATCH_SIZE) {
      batches.push(uniqueTickers.slice(i, i + BATCH_SIZE))
    }

    // Shared accumulator for all price updates

    const allPricesUpdate: Record<string, number> = {}

    // Process batches with sliding window concurrency

    const processBatch = async (batch: string[], batchIndex: number) => {
      const batchPricesUpdate: Record<string, number> = {}

      const batchLoadingUpdate: Record<string, boolean> = {}

      const batchPromises = batch.map(async (ticker, tickerIndex) => {
        // Stagger requests within batch to avoid burst

        await new Promise((resolve) => setTimeout(resolve, tickerIndex * 50))

        try {
          const response = await fetch(
            `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apikey=${POLYGON_API_KEY}`,

            {
              method: 'GET',

              headers: { Accept: 'application/json' },

              signal: AbortSignal.timeout(8000),
            }
          )

          if (response.ok) {
            const data = await response.json()

            if (data.status === 'OK' && data.ticker) {
              const lastTradePrice = data.ticker.lastTrade?.p

              const prevDayClose = data.ticker.prevDay?.c

              const price = lastTradePrice || prevDayClose

              if (price && price > 0) {
                batchPricesUpdate[ticker] = price

                allPricesUpdate[ticker] = price
              }
            }
          }
        } catch {
          // silent
        }

        batchLoadingUpdate[ticker] = false
      })

      await Promise.allSettled(batchPromises)

      // Update UI after each batch completes

      setPriceLoadingState((prev) => ({ ...prev, ...batchLoadingUpdate }))

      setCurrentPrices((prev) => ({ ...prev, ...batchPricesUpdate }))
    }

    // Process batches with controlled concurrency

    for (let i = 0; i < batches.length; i += MAX_CONCURRENT_BATCHES) {
      const concurrentBatches = batches.slice(i, i + MAX_CONCURRENT_BATCHES)

      const batchPromises = concurrentBatches.map((batch, idx) => processBatch(batch, i + idx))

      await Promise.allSettled(batchPromises)

      // Delay before next round of concurrent batches

      if (i + MAX_CONCURRENT_BATCHES < batches.length) {
        await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY))
      }
    }
  }

  // Fetch current prices when data changes (debounced)

  useEffect(() => {
    if (!data || data.length === 0) {
      return
    }

    // Debounce API calls to prevent excessive requests

    const debounceTimer = setTimeout(() => {
      const tickers = [...new Set(data.map((trade) => trade.underlying_ticker))]
      fetchCurrentPrices(tickers)
    }, 500) // 500ms debounce

    return () => clearTimeout(debounceTimer)
  }, [data])

  // Auto-refresh prices every 5 minutes (optimized)

  useEffect(() => {
    if (!data || data.length === 0) return
    const interval = setInterval(
      () => {
        const uniqueTickers = [...new Set(data.map((trade) => trade.underlying_ticker))]

        // Only refresh prices

        fetchCurrentPrices(uniqueTickers)
      },
      5 * 60 * 1000
    ) // 5 minutes

    return () => {
      clearInterval(interval)
    }
  }, [data.length]) // Only re-setup when data length changes, not content

  // Fetch real 30-day stdDevs for all visible tickers (Price Action grading)
  useEffect(() => {
    if (!data || data.length === 0) return
    const tickers = [...new Set(data.map((t) => t.underlying_ticker))]
    const missing = tickers.filter((t) => !historicalStdDevs.has(t))
    if (missing.length === 0) return
    const STDDEV_API_KEY = process.env.NEXT_PUBLIC_POLYGON_API_KEY || ''
    missing.forEach(async (ticker, idx) => {
      await new Promise((r) => setTimeout(r, idx * 100))
      try {
        const end = new Date().toISOString().split('T')[0]
        const start = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]
        const res = await fetch(
          `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${start}/${end}?adjusted=true&sort=asc&limit=30&apiKey=${STDDEV_API_KEY}`,
          { signal: AbortSignal.timeout(8000) }
        )
        if (res.ok) {
          const json = await res.json()
          if (json.results && json.results.length > 1) {
            const returns: number[] = []
            for (let i = 1; i < json.results.length; i++) {
              const prev = json.results[i - 1].c
              const curr = json.results[i].c
              returns.push(((curr - prev) / prev) * 100)
            }
            const mean = returns.reduce((a, b) => a + b, 0) / returns.length
            const variance = returns.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / returns.length
            setHistoricalStdDevs((prev) => new Map(prev).set(ticker, Math.sqrt(variance)))
          } else {
            setStdDevFailed((prev) => new Set(prev).add(ticker))
          }
        } else {
          setStdDevFailed((prev) => new Set(prev).add(ticker))
        }
      } catch {
        setStdDevFailed((prev) => new Set(prev).add(ticker))
      }
    })
  }, [data.length])

  // Fetch historical ranges when EFI Highlights is active

  useEffect(() => {
    if (!efiHighlightsActive || !data || data.length === 0) return

    const uniqueTickers = [...new Set(data.map((trade) => trade.underlying_ticker))]

    const fetchAllRanges = async () => {
      const rangesMap = new Map<string, { high: number; low: number }[]>()

      const toFetch = uniqueTickers.filter(
        (ticker) => !historicalRanges.has(ticker) && !historicalDataLoading.has(ticker)
      )

      if (toFetch.length === 0) return

      // Mark all as loading

      setHistoricalDataLoading((prev) => {
        const newSet = new Set(prev)

        toFetch.forEach((ticker) => newSet.add(ticker))

        return newSet
      })

      // Parallel batch processing with concurrency control

      const RANGE_BATCH_SIZE = 12 // 12 tickers per batch

      const MAX_CONCURRENT_BATCHES = 3 // 3 batches in parallel

      const batches = []

      for (let i = 0; i < toFetch.length; i += RANGE_BATCH_SIZE) {
        batches.push(toFetch.slice(i, i + RANGE_BATCH_SIZE))
      }

      const processBatch = async (batch: string[], batchIndex: number) => {
        const rangePromises = batch.map(async (ticker, tickerIndex) => {
          // Stagger within batch

          await new Promise((resolve) => setTimeout(resolve, tickerIndex * 25))

          try {
            const ranges = await fetchHistoricalRanges(ticker)

            rangesMap.set(ticker, ranges)
          } catch (error) {
            // Silent fail
          }
        })

        await Promise.allSettled(rangePromises)
      }

      // Process batches with sliding window concurrency

      for (let i = 0; i < batches.length; i += MAX_CONCURRENT_BATCHES) {
        const concurrentBatches = batches.slice(i, i + MAX_CONCURRENT_BATCHES)

        await Promise.allSettled(
          concurrentBatches.map((batch, idx) => processBatch(batch, i + idx))
        )

        if (i + MAX_CONCURRENT_BATCHES < batches.length) {
          await new Promise((resolve) => setTimeout(resolve, 150))
        }
      }

      if (rangesMap.size > 0) {
        setHistoricalRanges((prev) => new Map([...prev, ...rangesMap]))
      }
    }

    fetchAllRanges()
  }, [efiHighlightsActive, data.length])

  // Fetch current option prices for position tracking (only when EFI Highlights is ON)

  const fetchCurrentOptionPrices = async (trades: OptionsFlowData[]) => {
    const POLYGON_API_KEY = process.env.NEXT_PUBLIC_POLYGON_API_KEY || ''

    const pricesUpdate: Record<string, number> = {}

    const failed: string[] = []

    // Filter out expired options before fetching prices
    // Parse expiry as local date (append T12:00:00 to avoid UTC midnight shifting the date back a day in negative-offset timezones)
    const todayStr = new Date().toLocaleDateString('en-CA') // "YYYY-MM-DD" in local time

    const activeTrades = trades.filter((trade) => {
      return trade.expiry >= todayStr // string compare works perfectly for ISO date format
    })

    if (activeTrades.length === 0) {
      setOptionPricesFetching(false)

      return
    }

    setOptionPricesFetching(true)

    setGradingProgress({ current: 0, total: activeTrades.length }) // Parallel batch processing for faster fetching

    const BATCH_SIZE = 15 // 15 contracts per batch

    const MAX_CONCURRENT_BATCHES = 3 // Process 3 batches in parallel

    const batches = []

    for (let i = 0; i < activeTrades.length; i += BATCH_SIZE) {
      batches.push(activeTrades.slice(i, i + BATCH_SIZE))
    }

    let processedCount = 0

    // Process batches with controlled concurrency

    const processBatch = async (batch: OptionsFlowData[], batchIndex: number) => {
      const batchResults = await Promise.allSettled(
        batch.map(async (trade, tradeIndex) => {
          // Stagger within batch to avoid burst

          await new Promise((resolve) => setTimeout(resolve, tradeIndex * 30))

          try {
            const expiry = trade.expiry.replace(/-/g, '').slice(2)

            const strikeFormatted = String(Math.round(trade.strike * 1000)).padStart(8, '0')

            const optionType = trade.type.toLowerCase() === 'call' ? 'C' : 'P'

            const normalizedTicker = normalizeTickerForOptions(trade.underlying_ticker)

            const optionTicker = `O:${normalizedTicker}${expiry}${optionType}${strikeFormatted}`

            const snapshotUrl = `https://api.polygon.io/v3/snapshot/options/${trade.underlying_ticker}/${optionTicker}?apikey=${POLYGON_API_KEY}`

            const response = await fetch(snapshotUrl, {
              signal: AbortSignal.timeout(5000),
            })

            if (response.ok) {
              const data = await response.json()

              if (data.results && data.results.last_quote) {
                const bid = data.results.last_quote.bid || 0

                const ask = data.results.last_quote.ask || 0

                const currentPrice = (bid + ask) / 2

                if (currentPrice > 0) {
                  pricesUpdate[optionTicker] = currentPrice
                }
              }
            } else if (response.status === 404) {
              // Try historical endpoint for expired options

              const expiryDate = new Date(trade.expiry)

              const formattedExpiry = expiryDate.toISOString().split('T')[0]

              const historicalUrl = `https://api.polygon.io/v2/aggs/ticker/${optionTicker}/range/1/day/${formattedExpiry}/${formattedExpiry}?apikey=${POLYGON_API_KEY}`

              const histResponse = await fetch(historicalUrl, {
                signal: AbortSignal.timeout(5000),
              })

              if (histResponse.ok) {
                const histData = await histResponse.json()

                if (histData.results && histData.results.length > 0) {
                  const lastBar = histData.results[histData.results.length - 1]

                  const currentPrice = lastBar.c // closing price

                  if (currentPrice > 0) {
                    pricesUpdate[optionTicker] = currentPrice
                  }
                }
              }
            }
          } catch (error) {
            // Silent fail for network errors
          }
        })
      )

      // Update progress only (no state update per batch to avoid re-renders)
      processedCount += batch.length

      setGradingProgress({ current: processedCount, total: trades.length })
    }

    // Process batches with sliding window concurrency

    for (let i = 0; i < batches.length; i += MAX_CONCURRENT_BATCHES) {
      const concurrentBatches = batches.slice(i, i + MAX_CONCURRENT_BATCHES)

      await Promise.allSettled(concurrentBatches.map((batch, idx) => processBatch(batch, i + idx)))

      // Small delay before next round

      if (i + MAX_CONCURRENT_BATCHES < batches.length) {
        await new Promise((resolve) => setTimeout(resolve, 150))
      }
    }

    // Single state update after ALL batches complete - prevents per-batch re-renders
    setCurrentOptionPrices((prev) => ({ ...prev, ...pricesUpdate }))

    setOptionPricesFetching(false)

    setGradingProgress(null)
  }

  // Fetch stock chart data for a single flow with specific timeframe

  const fetchStockChartDataForFlow = async (
    flowId: string,
    ticker: string,
    timeframe: '1D' | '1W' | '1M'
  ) => {
    const POLYGON_API_KEY = process.env.NEXT_PUBLIC_POLYGON_API_KEY || ''

    try {
      let multiplier = 5

      let timespan = 'minute'

      const now = new Date()

      let from = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        .toISOString()
        .split('T')[0]

      const to = now.toISOString().split('T')[0]

      if (timeframe === '1W') {
        multiplier = 1

        timespan = 'hour'

        from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      } else if (timeframe === '1M') {
        multiplier = 1

        timespan = 'day'

        from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      }

      const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/${multiplier}/${timespan}/${from}/${to}?adjusted=true&sort=asc&apiKey=${POLYGON_API_KEY}`

      const response = await fetch(url)

      if (response.ok) {
        const data = await response.json()

        if (data.results && data.results.length > 0) {
          const chartData = data.results.map((bar: any) => ({
            price: bar.c,

            timestamp: bar.t,
          }))

          setStockChartData((prev) => ({ ...prev, [flowId]: chartData }))
        }
      }
    } catch (error) {
      console.error(`Failed to fetch chart data for ${ticker}:`, error)
    }
  }

  // Fetch options premium data for a single flow with specific timeframe

  const fetchOptionPremiumDataForFlow = async (
    flowId: string,
    trade: OptionsFlowData,
    timeframe: '1D' | '1W' | '1M'
  ) => {
    const POLYGON_API_KEY = process.env.NEXT_PUBLIC_POLYGON_API_KEY || ''

    try {
      const expiry = trade.expiry.replace(/-/g, '').slice(2)

      const strikeFormatted = String(Math.round(trade.strike * 1000)).padStart(8, '0')

      const optionType = trade.type.toLowerCase() === 'call' ? 'C' : 'P'

      const normalizedTicker = normalizeTickerForOptions(trade.underlying_ticker)

      const optionTicker = `O:${normalizedTicker}${expiry}${optionType}${strikeFormatted}`

      let multiplier = 5

      let timespan = 'minute'

      const now = new Date()

      let from = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        .toISOString()
        .split('T')[0]

      const to = now.toISOString().split('T')[0]

      if (timeframe === '1W') {
        multiplier = 30

        timespan = 'minute'

        from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      } else if (timeframe === '1M') {
        multiplier = 1

        timespan = 'hour'

        from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      }

      const url = `https://api.polygon.io/v2/aggs/ticker/${optionTicker}/range/${multiplier}/${timespan}/${from}/${to}?adjusted=true&sort=asc&apiKey=${POLYGON_API_KEY}`

      const response = await fetch(url)

      if (response.ok) {
        const data = await response.json()

        if (data.results && data.results.length > 0) {
          const premiumData = data.results.map((bar: any) => ({
            price: bar.c,

            timestamp: bar.t,
          }))

          setOptionsPremiumData((prev) => ({ ...prev, [flowId]: premiumData }))
        }
      }
    } catch (error) {
      console.error(`Failed to fetch premium data for ${trade.underlying_ticker}:`, error)
    }
  }

  // Fetch stock chart data for mini charts

  const fetchStockChartData = async (tickers: string[]) => {
    const POLYGON_API_KEY = process.env.NEXT_PUBLIC_POLYGON_API_KEY || ''

    const chartData: Record<string, { price: number; timestamp: number }[]> = {}
    for (const ticker of tickers) {
      try {
        let multiplier = 5

        let timespan = 'minute'

        const now = new Date()

        let from = new Date(now.getFullYear(), now.getMonth(), now.getDate())
          .toISOString()
          .split('T')[0] // Today at midnight

        const to = now.toISOString().split('T')[0] // Today

        if (chartTimeframe === '1W') {
          multiplier = 1

          timespan = 'hour'

          from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // 7 days ago
        } else if (chartTimeframe === '1M') {
          multiplier = 1

          timespan = 'day'

          from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // 30 days ago
        }

        const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/${multiplier}/${timespan}/${from}/${to}?adjusted=true&sort=asc&apiKey=${POLYGON_API_KEY}`

        const response = await fetch(url)

        if (response.ok) {
          const data = await response.json()

          if (data.results && data.results.length > 0) {
            chartData[ticker] = data.results.map((bar: any) => ({
              price: bar.c,

              timestamp: bar.t,
            }))
          }
        }

        await new Promise((resolve) => setTimeout(resolve, 100))
      } catch (error) {
        console.error(`Failed to fetch chart data for ${ticker}:`, error)
      }
    }

    setStockChartData((prev) => ({ ...prev, ...chartData }))
  }

  // Fetch options premium data for mini charts

  const fetchOptionsPremiumData = async (trades: OptionsFlowData[]) => {
    const POLYGON_API_KEY = process.env.NEXT_PUBLIC_POLYGON_API_KEY || ''

    const premiumData: Record<string, { price: number; timestamp: number }[]> = {}
    for (const trade of trades) {
      try {
        const expiry = trade.expiry.replace(/-/g, '').slice(2)

        const strikeFormatted = String(Math.round(trade.strike * 1000)).padStart(8, '0')

        const optionType = trade.type.toLowerCase() === 'call' ? 'C' : 'P'

        const normalizedTicker = normalizeTickerForOptions(trade.underlying_ticker)

        const optionTicker = `O:${normalizedTicker}${expiry}${optionType}${strikeFormatted}`

        let multiplier = 5

        let timespan = 'minute'

        const now = new Date()

        let from = new Date(now.getFullYear(), now.getMonth(), now.getDate())
          .toISOString()
          .split('T')[0] // Today at midnight

        const to = now.toISOString().split('T')[0] // Today

        if (chartTimeframe === '1W') {
          multiplier = 30

          timespan = 'minute'

          from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // 7 days ago
        } else if (chartTimeframe === '1M') {
          multiplier = 1

          timespan = 'hour'

          from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // 30 days ago
        }

        const url = `https://api.polygon.io/v2/aggs/ticker/${optionTicker}/range/${multiplier}/${timespan}/${from}/${to}?adjusted=true&sort=asc&apiKey=${POLYGON_API_KEY}`

        const response = await fetch(url)

        if (response.ok) {
          const data = await response.json()

          if (data.results && data.results.length > 0) {
            premiumData[optionTicker] = data.results.map((bar: any) => ({
              price: bar.c,

              timestamp: bar.t,
            }))
          }
        }

        await new Promise((resolve) => setTimeout(resolve, 120))
      } catch (error) {
        console.error(`Failed to fetch premium data for ${trade.underlying_ticker}:`, error)
      }
    }

    setOptionsPremiumData((prev) => ({ ...prev, ...premiumData }))
  }

  // Function to fetch historical prices and calculate standard deviation

  const fetchHistoricalRanges = async (
    ticker: string
  ): Promise<{ high: number; low: number }[]> => {
    try {
      // Get last 3 trading days (7 calendar days to ensure we get at least 3)

      const endDate = new Date().toISOString().split('T')[0]

      const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

      const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${startDate}/${endDate}?adjusted=true&sort=asc&apiKey=${POLYGON_API_KEY}`

      const response = await fetch(url, {
        signal: AbortSignal.timeout(8000), // 8 second timeout
      })

      if (!response.ok) {
        return [] // Silent fail on HTTP errors
      }

      const data = await response.json()

      if (data.results && data.results.length >= 3) {
        // Get last 3 days

        const last3Days = data.results.slice(-3)

        const ranges = last3Days.map((r: any) => ({
          high: r.h,

          low: r.l,

          date: new Date(r.t).toISOString().split('T')[0],
        }))

        return ranges
      }

      return []
    } catch (error) {
      // Silent fail - connection resets are common with parallel fetching

      return []
    }
  }

  // Calculate Relative Strength for trades - fetches historical data for stock and SPY

  const calculateRelativeStrength = async (
    trades: OptionsFlowData[]
  ): Promise<Map<string, number>> => {
    const rsMap = new Map<string, number>()

    // Get unique tickers from trades

    const tickers = [...new Set(trades.map((t) => t.underlying_ticker))]

    // Batch process tickers

    const BATCH_SIZE = 20

    for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
      const batch = tickers.slice(i, i + BATCH_SIZE)

      await Promise.all(
        batch.map(async (ticker, idx) => {
          await new Promise((resolve) => setTimeout(resolve, idx * 50)) // Stagger requests

          try {
            // Get trades for this ticker to determine date range

            const tickerTrades = trades.filter((t) => t.underlying_ticker === ticker)

            if (tickerTrades.length === 0) return

            // Use earliest trade timestamp to determine lookback period

            const earliestTrade = new Date(
              Math.min(...tickerTrades.map((t) => new Date(t.trade_timestamp).getTime()))
            )

            // Fetch 1-3 days before earliest trade

            const endDate = new Date(earliestTrade)

            endDate.setDate(endDate.getDate() - 1) // 1 day before trade

            const startDate = new Date(earliestTrade)

            startDate.setDate(startDate.getDate() - 5) // 5 days to ensure we get 3 trading days

            const endStr = endDate.toISOString().split('T')[0]

            const startStr = startDate.toISOString().split('T')[0]

            // Fetch stock data

            const stockUrl = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${startStr}/${endStr}?adjusted=true&sort=asc&apiKey=${POLYGON_API_KEY}`

            const spyUrl = `https://api.polygon.io/v2/aggs/ticker/SPY/range/1/day/${startStr}/${endStr}?adjusted=true&sort=asc&apiKey=${POLYGON_API_KEY}`

            const [stockRes, spyRes] = await Promise.all([
              fetch(stockUrl, { signal: AbortSignal.timeout(5000) }),

              fetch(spyUrl, { signal: AbortSignal.timeout(5000) }),
            ])

            if (!stockRes.ok || !spyRes.ok) return

            const stockData = await stockRes.json()

            const spyData = await spyRes.json()

            if (
              stockData.results &&
              spyData.results &&
              stockData.results.length >= 2 &&
              spyData.results.length >= 2
            ) {
              // Calculate % change over last 1-3 days

              const stockOld = stockData.results[0].c

              const stockNew = stockData.results[stockData.results.length - 1].c

              const stockChange = ((stockNew - stockOld) / stockOld) * 100

              const spyOld = spyData.results[0].c

              const spyNew = spyData.results[spyData.results.length - 1].c

              const spyChange = ((spyNew - spyOld) / spyOld) * 100

              // RS = stock % change - SPY % change

              const rs = stockChange - spyChange

              rsMap.set(ticker, rs)

              // Also calculate and store actual std dev

              const returns = []

              for (let j = 1; j < stockData.results.length; j++) {
                const prevClose = stockData.results[j - 1].c

                const currClose = stockData.results[j].c

                const dailyReturn = ((currClose - prevClose) / prevClose) * 100

                returns.push(dailyReturn)
              }

              if (returns.length > 1) {
                const mean = returns.reduce((a, b) => a + b, 0) / returns.length

                const variance =
                  returns.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / returns.length

                const stdDev = Math.sqrt(variance)

                setHistoricalStdDevs((prev) => new Map(prev).set(ticker, stdDev))
              }
            }
          } catch (error) {
            // Silent fail
          }
        })
      )
    }

    return rsMap
  }

  // Calculate positioning grade for EFI trades - COMPLETE 100-POINT SYSTEM

  const calculatePositioningGrade = (
    trade: OptionsFlowData,
    comboMap: Map<string, boolean>
  ): {
    grade: string

    score: number

    color: string

    breakdown: string

    stdDevError: boolean

    scores: {
      expiration: number

      contractPrice: number

      relativeStrength: number

      combo: number

      priceAction: number

      volumeOI: number

      stockReaction: number
    }
  } => {
    // Get option ticker for current price lookup

    const expiry = trade.expiry.replace(/-/g, '').slice(2)

    const strikeFormatted = String(Math.round(trade.strike * 1000)).padStart(8, '0')

    const optionType = trade.type.toLowerCase() === 'call' ? 'C' : 'P'

    const normalizedTicker = normalizeTickerForOptions(trade.underlying_ticker)

    const optionTicker = `O:${normalizedTicker}${expiry}${optionType}${strikeFormatted}`

    const currentPrice = currentOptionPrices[optionTicker]

    const entryPrice = trade.premium_per_contract

    let confidenceScore = 0

    const scores = {
      expiration: 0,

      contractPrice: 0,

      relativeStrength: 0,

      combo: 0,

      priceAction: 0,

      volumeOI: 0,

      stockReaction: 0,
    }

    // 1. Expiration Score (25 points max)

    const daysToExpiry = trade.days_to_expiry

    if (daysToExpiry <= 7) scores.expiration = 25
    else if (daysToExpiry <= 14) scores.expiration = 20
    else if (daysToExpiry <= 21) scores.expiration = 15
    else if (daysToExpiry <= 28) scores.expiration = 10
    else if (daysToExpiry <= 42) scores.expiration = 5

    confidenceScore += scores.expiration

    // 2. Contract Price Score (25 points max) - based on position P&L

    if (!currentPrice || currentPrice <= 0) {
      // Return early with a neutral grade if price is unavailable (prices loading)

      return {
        grade: 'N/A',

        score: confidenceScore,

        color: '#9ca3af',

        breakdown: `Score: ${confidenceScore}/100\nExpiration: ${scores.expiration}/25\nContract P&L: 0/15\nRelative Strength: 0/10\nCombo Trade: 0/10\nPrice Action: 0/10\nVolume vs OI: 0/15\nStock Reaction: 0/15`,

        stdDevError: stdDevFailed.has(trade.underlying_ticker),

        scores,
      }
    }

    const rawPercentChange = ((currentPrice - entryPrice) / entryPrice) * 100
    // B/BB = sold to open: profit when contract loses value, loss when it gains (infinite loss side)
    const tradeFillStyle = trade.fill_style || ''
    const isSoldToOpen = tradeFillStyle === 'B' || tradeFillStyle === 'BB'
    const percentChange = isSoldToOpen ? -rawPercentChange : rawPercentChange

    if (percentChange <= -40) scores.contractPrice = 15
    else if (percentChange <= -20) scores.contractPrice = 12
    else if (percentChange >= -10 && percentChange <= 10) scores.contractPrice = 10
    else if (percentChange >= 20) scores.contractPrice = 3
    else scores.contractPrice = 6

    confidenceScore += scores.contractPrice

    // 3. Relative Strength Score (10 points max) - Award points if trade aligns with RS

    const rs = relativeStrengthData.get(trade.underlying_ticker)

    if (rs !== undefined) {
      const fillStyle = trade.fill_style || ''

      const isCall = trade.type === 'call'

      const isBullishFlow =
        (isCall && (fillStyle === 'A' || fillStyle === 'AA')) ||
        (!isCall && (fillStyle === 'B' || fillStyle === 'BB'))

      const isBearishFlow =
        (isCall && (fillStyle === 'B' || fillStyle === 'BB')) ||
        (!isCall && (fillStyle === 'A' || fillStyle === 'AA'))

      // Award 10 points if trade direction aligns with RS

      const aligned = (isBullishFlow && rs > 0) || (isBearishFlow && rs < 0)

      if (aligned) scores.relativeStrength = 10
    }

    confidenceScore += scores.relativeStrength

    // 4. Combo Trade Score (10 points max) - using pre-computed map for O(1) lookup

    const fillStyle = trade.fill_style || ''

    const comboLookupKey = `${trade.underlying_ticker}-${trade.strike}-${trade.expiry}-${trade.type}-${fillStyle}`

    const hasComboTrade = comboMap.get(comboLookupKey) || false

    if (hasComboTrade) scores.combo = 10

    confidenceScore += scores.combo

    // Shared variables for sections 5 and 6
    const entryStockPrice = trade.spot_price
    const currentStockPrice = currentPrices[trade.underlying_ticker]
    const tradeTime = new Date(trade.trade_timestamp)
    const currentTime = new Date()
    const isCall = trade.type === 'call'

    // 5. Price Action Score (10 points max) - Consolidation OR Reversal Bet
    const stdDev = historicalStdDevs.get(trade.underlying_ticker)

    if (currentStockPrice && entryStockPrice && stdDev) {
      const hoursElapsed = (currentTime.getTime() - tradeTime.getTime()) / (1000 * 60 * 60)
      const tradingDaysElapsed = Math.floor(hoursElapsed / 6.5)

      const stockPercentChange = ((currentStockPrice - entryStockPrice) / entryStockPrice) * 100
      const absMove = Math.abs(stockPercentChange)
      const withinStdDev = absMove <= stdDev

      // SCENARIO A: Stock stayed calm (consolidation)
      if (withinStdDev) {
        if (tradingDaysElapsed >= 3) scores.priceAction = 10
        else if (tradingDaysElapsed >= 2) scores.priceAction = 8
        else if (tradingDaysElapsed >= 1) scores.priceAction = 6
        else scores.priceAction = 4
        console.debug(
          `[EFI Grade] ${trade.underlying_ticker} Price Action (consolidation): +${scores.priceAction}/10 | daysElapsed=${tradingDaysElapsed}, withinStdDev=${withinStdDev}`
        )
      }
      // SCENARIO B: Stock moved big - check if flow is contrarian reversal bet
      else {
        const isBullishFlow =
          (isCall && (fillStyle === 'A' || fillStyle === 'AA')) ||
          (!isCall && (fillStyle === 'B' || fillStyle === 'BB'))
        const isBearishFlow =
          (isCall && (fillStyle === 'B' || fillStyle === 'BB')) ||
          (!isCall && (fillStyle === 'A' || fillStyle === 'AA'))
        const isReversalBet =
          (stockPercentChange < -stdDev && isBullishFlow) ||
          (stockPercentChange > stdDev && isBearishFlow)

        if (isReversalBet) {
          if (tradingDaysElapsed >= 3) scores.priceAction = 10
          else if (tradingDaysElapsed >= 2) scores.priceAction = 8
          else if (tradingDaysElapsed >= 1) scores.priceAction = 6
          else scores.priceAction = 5
        } else {
          scores.priceAction = 4
        }
        console.debug(
          `[EFI Grade] ${trade.underlying_ticker} Price Action (big move): +${scores.priceAction}/10 | isReversalBet=${isReversalBet}, daysElapsed=${tradingDaysElapsed}, stockPct=${stockPercentChange.toFixed(2)}%, stdDev=${stdDev.toFixed(2)}%`
        )
      }
    } else {
      scores.priceAction = 0
      console.debug(
        `[EFI Grade] ${trade.underlying_ticker} Price Action: 0/10 (missing data — currentStockPrice=${currentStockPrice}, entryStockPrice=${entryStockPrice}, stdDev=${stdDev})`
      )
    }

    confidenceScore += scores.priceAction

    // 7. Volume vs Open Interest Score (15 points max)
    // Rewards high relative volume vs open interest on the traded strike
    const tradeVolume = trade.volume ?? null
    const tradeOI = trade.open_interest ?? null

    if (tradeVolume !== null && tradeOI !== null && tradeOI > 0) {
      const volOIRatio = tradeVolume / tradeOI

      if (volOIRatio >= 1.5) {
        scores.volumeOI = 15 // Volume > OI by 50%+
      } else if (volOIRatio >= 1.0) {
        scores.volumeOI = 10 // Volume >= OI but < 150% of OI
      } else if (volOIRatio >= 0.5) {
        scores.volumeOI = 5 // Volume >= half of OI but < OI
      } else {
        scores.volumeOI = 0 // Volume < half of OI
      }

      console.debug(
        `[EFI Grade] ${trade.underlying_ticker} Volume vs OI: +${scores.volumeOI}/15 | volume=${tradeVolume}, OI=${tradeOI}, ratio=${volOIRatio.toFixed(3)} (${(volOIRatio * 100).toFixed(1)}% of OI)`
      )
    } else {
      scores.volumeOI = 0
      console.debug(
        `[EFI Grade] ${trade.underlying_ticker} Volume vs OI: 0/15 (missing data — volume=${tradeVolume}, OI=${tradeOI})`
      )
    }

    confidenceScore += scores.volumeOI

    // 8. Stock Reaction Score (15 points max)
    // Measure stock movement 1 hour and 3 hours after trade placement
    if (currentStockPrice && entryStockPrice) {
      const stockPercentChange = ((currentStockPrice - entryStockPrice) / entryStockPrice) * 100

      // Determine trade direction (bullish or bearish)
      const isBullish =
        (isCall && (fillStyle === 'A' || fillStyle === 'AA')) ||
        (!isCall && (fillStyle === 'B' || fillStyle === 'BB'))
      const isBearish =
        (isCall && (fillStyle === 'B' || fillStyle === 'BB')) ||
        (!isCall && (fillStyle === 'A' || fillStyle === 'AA'))

      // Check if stock reversed against trade direction
      const reversed =
        (isBullish && stockPercentChange <= -1.0) || (isBearish && stockPercentChange >= 1.0)
      const followed =
        (isBullish && stockPercentChange >= 1.0) || (isBearish && stockPercentChange <= -1.0)
      const chopped = Math.abs(stockPercentChange) < 1.0

      // Calculate time elapsed since trade
      const hoursElapsed = (currentTime.getTime() - tradeTime.getTime()) / (1000 * 60 * 60)

      // Award points based on time checkpoints
      if (hoursElapsed >= 1) {
        // 1-hour checkpoint (50% of points)
        if (reversed) scores.stockReaction += 7.5
        else if (chopped) scores.stockReaction += 5
        else if (followed) scores.stockReaction += 2.5

        if (hoursElapsed >= 3) {
          // 3-hour checkpoint (remaining 50%)
          if (reversed) scores.stockReaction += 7.5
          else if (chopped) scores.stockReaction += 5
          else if (followed) scores.stockReaction += 2.5
        }
      }
    }

    confidenceScore += scores.stockReaction

    // Color code confidence score
    let scoreColor = '#ff0000' // F = Red
    if (confidenceScore >= 85)
      scoreColor = '#00ff00' // A = Bright Green
    else if (confidenceScore >= 70)
      scoreColor = '#84cc16' // B = Lime Green
    else if (confidenceScore >= 50)
      scoreColor = '#fbbf24' // C = Yellow
    else if (confidenceScore >= 33) scoreColor = '#3b82f6' // D = Blue

    // Grade letter
    let grade = 'F'
    if (confidenceScore >= 85) grade = 'A+'
    else if (confidenceScore >= 80) grade = 'A'
    else if (confidenceScore >= 75) grade = 'A-'
    else if (confidenceScore >= 70) grade = 'B+'
    else if (confidenceScore >= 65) grade = 'B'
    else if (confidenceScore >= 60) grade = 'B-'
    else if (confidenceScore >= 55) grade = 'C+'
    else if (confidenceScore >= 50) grade = 'C'
    else if (confidenceScore >= 48) grade = 'C-'
    else if (confidenceScore >= 43) grade = 'D+'
    else if (confidenceScore >= 38) grade = 'D'
    else if (confidenceScore >= 33) grade = 'D-'

    // Create breakdown tooltip text

    const breakdown = `Score: ${confidenceScore}/100

Expiration: ${scores.expiration}/25

Contract P&L: ${scores.contractPrice}/15

Relative Strength: ${scores.relativeStrength}/10

Combo Trade: ${scores.combo}/10

Price Action: ${scores.priceAction}/10

Volume vs OI: ${scores.volumeOI}/15

Stock Reaction: ${scores.stockReaction}/15`

    const stdDevError = stdDevFailed.has(trade.underlying_ticker)

    return { grade, score: confidenceScore, color: scoreColor, breakdown, scores, stdDevError }
  }

  // EFI Highlights criteria checker

  const meetsEfiCriteria = (trade: OptionsFlowData): boolean => {
    // 1. Check expiration (0-35 trading days)

    if (trade.days_to_expiry < 0 || trade.days_to_expiry > 35) {
      return false
    }

    // 2. Check premium ($85k - $690k)

    if (trade.total_premium < 85000 || trade.total_premium > 690000) {
      return false
    }

    // 3. Check contracts (350 minimum, no max)

    if (trade.trade_size < 350) {
      return false
    }

    // 4. Check OTM status

    if (!trade.moneyness || trade.moneyness !== 'OTM') {
      return false
    }

    return true
  }

  // Notable Flow Pick criteria checker (8 criteria)

  const meetsNotableCriteria = (trade: OptionsFlowData): boolean => {
    // 1. Expiration: 0-21 days
    const todayMidnight = new Date()
    todayMidnight.setHours(0, 0, 0, 0)
    const expiryD = new Date(trade.expiry)
    const expiryLocal = new Date(
      expiryD.getUTCFullYear(),
      expiryD.getUTCMonth(),
      expiryD.getUTCDate()
    )
    const daysToExpiry = Math.floor(
      (expiryLocal.getTime() - todayMidnight.getTime()) / (1000 * 60 * 60 * 24)
    )

    if (daysToExpiry < 0 || daysToExpiry > 21) return false

    // 2. OTM only

    if (!trade.moneyness || trade.moneyness !== 'OTM') return false

    // 3. Premium: $120k-$220k

    if (trade.total_premium < 120000 || trade.total_premium > 220000) return false

    // 4. SWEEP or BLOCK only

    const tradeClass = trade.classification || trade.trade_type || ''
    if (!['SWEEP', 'BLOCK'].includes(tradeClass)) return false

    // 5. Contracts: 600-1300

    if (trade.trade_size < 600 || trade.trade_size > 1300) return false

    // 6. Option price: $0.45-$3.70

    if (trade.premium_per_contract < 0.45 || trade.premium_per_contract > 3.70) return false

    // 7. Grades: B+, A-, A, A+ only (no grade lower than B+)

    if (!optionPricesFetching && Object.keys(currentOptionPrices).length > 0) {
      const gradeData = calculatePositioningGrade(trade, comboTradeMap)

      const validGrades = ['B+', 'A-', 'A', 'A+']

      if (!validGrades.includes(gradeData.grade)) return false
    }

    // 8. Fill styles: A, AA, B, BB only

    const fillStyle = (trade as any).fill_style || ''

    if (!['A', 'AA', 'B', 'BB'].includes(fillStyle)) return false

    return true
  }

  // Notable Trade Analysis — targets + dealer zones
  const openNotableAnalysis = async (trade: OptionsFlowData) => {
    setSelectedNotableTrade(trade)
    setNotableAnalysisLoading(true)
    setNotableAnalysisData(null)

    try {
      const isCall = trade.type === 'call'
      const spotPrice = trade.spot_price
      const expiryForApi = trade.expiry

      // ── Fetch real option chain for IV + tower detection ──
      const response = await fetch(
        `/api/options-chain?ticker=${trade.underlying_ticker}&expiration=${expiryForApi}`
      )
      const result = await response.json()

      let t1 = 0
      let t2 = 0
      let pctToT1 = 0
      let pctToT2 = 0
      let goldenZone: { strike: number; oi: number } | null = null
      let purpleZone: { strike: number; oi: number } | null = null

      if (result.success && result.data) {
        const expData = result.data[expiryForApi] || (Object.values(result.data)[0] as any)

        if (expData) {
          // ── EXACT same Black-Scholes as DealerOpenInterestChart ──
          const normalCDF = (x: number): number => {
            const a1 = 0.254829592,
              a2 = -0.284496736,
              a3 = 1.421413741,
              a4 = -1.453152027,
              a5 = 1.061405429,
              p = 0.3275911
            const sign = x >= 0 ? 1 : -1
            x = Math.abs(x)
            const t = 1.0 / (1.0 + p * x)
            const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x)
            return 0.5 * (1 + sign * y)
          }
          const calculateD2 = (S: number, K: number, r: number, sigma: number, T: number) => {
            const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T))
            return d1 - sigma * Math.sqrt(T)
          }
          const chanceOfProfitSellCall = (
            S: number,
            K: number,
            r: number,
            sigma: number,
            T: number
          ) => (1 - normalCDF(calculateD2(S, K, r, sigma, T))) * 100
          const chanceOfProfitSellPut = (
            S: number,
            K: number,
            r: number,
            sigma: number,
            T: number
          ) => normalCDF(calculateD2(S, K, r, sigma, T)) * 100
          const findStrikeForProbability = (
            S: number,
            r: number,
            sigma: number,
            T: number,
            targetProb: number,
            isCallDir: boolean
          ): number => {
            if (isCallDir) {
              let low = S + 0.01,
                high = S * 1.5
              for (let i = 0; i < 50; i++) {
                const mid = (low + high) / 2
                const prob = chanceOfProfitSellCall(S, mid, r, sigma, T)
                if (Math.abs(prob - targetProb) < 0.1) return mid
                if (prob < targetProb) low = mid
                else high = mid
              }
              return (low + high) / 2
            } else {
              let low = S * 0.5,
                high = S - 0.01
              for (let i = 0; i < 50; i++) {
                const mid = (low + high) / 2
                const prob = chanceOfProfitSellPut(S, mid, r, sigma, T)
                if (Math.abs(prob - targetProb) < 0.1) return mid
                if (prob < targetProb) high = mid
                else low = mid
              }
              return (low + high) / 2
            }
          }

          // Compute avgIV from ATM options (same as DealerOpenInterestChart)
          const allContracts: Array<{ strike: number; iv: number }> = []
          Object.entries(expData.calls || {}).forEach(([s, d]: [string, any]) => {
            if (d.implied_volatility > 0)
              allContracts.push({ strike: parseFloat(s), iv: d.implied_volatility })
          })
          Object.entries(expData.puts || {}).forEach(([s, d]: [string, any]) => {
            if (d.implied_volatility > 0)
              allContracts.push({ strike: parseFloat(s), iv: d.implied_volatility })
          })
          const atmContracts = allContracts.filter(
            (c) => Math.abs((c.strike - spotPrice) / spotPrice) <= 0.05
          )
          const avgIV =
            atmContracts.length > 0
              ? atmContracts.reduce((sum, c) => sum + c.iv, 0) / atmContracts.length
              : trade.implied_volatility || 0.3

          const daysToExpiry = trade.days_to_expiry > 0 ? trade.days_to_expiry : 1
          const T = daysToExpiry / 365
          const r = 0.0387

          // For CALL: T1 = call80 (80% range upper), T2 = call90
          // For PUT:  T1 = put80 (80% range lower),  T2 = put90
          t1 = +findStrikeForProbability(spotPrice, r, avgIV, T, 80, isCall).toFixed(2)
          t2 = +findStrikeForProbability(spotPrice, r, avgIV, T, 90, isCall).toFixed(2)
          pctToT1 = +((Math.abs(t1 - spotPrice) / spotPrice) * 100).toFixed(2)
          pctToT2 = +((Math.abs(t2 - spotPrice) / spotPrice) * 100).toFixed(2)

          // ── EXACT tower detection from DealerOpenInterestChart ──
          // Build OI arrays sorted by strike
          const callEntries = Object.entries(expData.calls || {})
            .map(([s, d]: [string, any]) => ({ strike: parseFloat(s), oi: d.open_interest || 0 }))
            .filter((e) => e.oi > 0)
            .sort((a, b) => a.strike - b.strike)

          const putEntries = Object.entries(expData.puts || {})
            .map(([s, d]: [string, any]) => ({ strike: parseFloat(s), oi: d.open_interest || 0 }))
            .filter((e) => e.oi > 0)
            .sort((a, b) => a.strike - b.strike)

          // Detect top tower: highest OI center where left+right neighbors are 25-65% of center
          const detectTopTower = (entries: Array<{ strike: number; oi: number }>) => {
            const sorted = [...entries].sort((a, b) => b.oi - a.oi)
            for (const candidate of sorted) {
              const idx = entries.findIndex((e) => e.strike === candidate.strike)
              if (idx <= 0 || idx >= entries.length - 1) continue
              const leftPct = (entries[idx - 1].oi / candidate.oi) * 100
              const rightPct = (entries[idx + 1].oi / candidate.oi) * 100
              if (leftPct >= 25 && leftPct <= 65 && rightPct >= 25 && rightPct <= 65) {
                return candidate
              }
            }
            // fallback: highest OI strike
            return sorted[0] || null
          }

          goldenZone = detectTopTower(callEntries)
          purpleZone = detectTopTower(putEntries)
        }
      }

      setNotableAnalysisData({
        t1,
        t2,
        spotAtEntry: spotPrice,
        pctToT1,
        pctToT2,
        goldenZones: goldenZone ? [{ ...goldenZone, expiry: expiryForApi }] : [],
        purpleZones: purpleZone ? [{ ...purpleZone, expiry: expiryForApi }] : [],
      })
    } catch (err) {
      console.error('[NOTABLE] Analysis failed', err)
      setNotableAnalysisData({
        t1: 0,
        t2: 0,
        spotAtEntry: trade.spot_price,
        pctToT1: 0,
        pctToT2: 0,
        goldenZones: [],
        purpleZones: [],
      })
    } finally {
      setNotableAnalysisLoading(false)
    }
  }

  // Flow Tracking (Watchlist) Functions

  const generateFlowId = (trade: OptionsFlowData): string => {
    return `${trade.underlying_ticker}-${trade.strike}-${trade.expiry}-${trade.type}-${trade.trade_timestamp}-${trade.trade_size}`
  }

  const isInFlowTracking = (trade: OptionsFlowData): boolean => {
    const flowId = generateFlowId(trade)

    return trackedFlows.some((t) => generateFlowId(t) === flowId)
  }

  const addToFlowTracking = async (trade: OptionsFlowData) => {
    // Store original data with timestamp - only current price and grade will update
    const gradeResult = calculatePositioningGrade(trade, comboTradeMap)

    const flowToTrack = {
      ...trade,

      addedAt: new Date().toISOString(),

      originalPrice: trade.premium_per_contract,

      originalStockPrice: trade.spot_price,

      classification: gradeResult.grade,

      frozenComboScore: gradeResult.scores.combo,

      frozenRsScore: gradeResult.scores.relativeStrength,
    }

    const newTrackedFlows = [...trackedFlows, flowToTrack]

    setTrackedFlows(newTrackedFlows)

    localStorage.setItem('flowTrackingWatchlist', JSON.stringify(newTrackedFlows))

    // Generate flow ID for chart data

    const flowId = generateFlowId(trade)

    // Fetch chart data for this flow with default 1D timeframe

    fetchStockChartDataForFlow(flowId, trade.underlying_ticker, '1D')

    fetchOptionPremiumDataForFlow(flowId, trade, '1D')
  }

  const removeFromFlowTracking = (trade: OptionsFlowData) => {
    const flowId = generateFlowId(trade)

    const newTrackedFlows = trackedFlows.filter((t) => generateFlowId(t) !== flowId)

    setTrackedFlows(newTrackedFlows)

    localStorage.setItem('flowTrackingWatchlist', JSON.stringify(newTrackedFlows))
  }

  // Save current flow data to database

  const handleSaveFlow = async () => {
    try {
      setSavingFlow(true)
      setSaveStatus('idle')
      setSaveErrorMsg('')

      const today = new Date().toISOString().split('T')[0]
      console.log('[SaveFlow] Starting save for date:', today, '| trades count:', data?.length)

      // Compress payload client-side to avoid 413 Payload Too Large
      const dataString = JSON.stringify({ date: today, data })
      const encoded = new TextEncoder().encode(dataString)
      console.log('[SaveFlow] Payload size (uncompressed):', (encoded.length / 1024 / 1024).toFixed(2), 'MB')
      const cs = new CompressionStream('gzip')
      const writer = cs.writable.getWriter()
      writer.write(encoded)
      writer.close()
      const compressedBuffer = await new Response(cs.readable).arrayBuffer()
      console.log('[SaveFlow] Compressed size:', (compressedBuffer.byteLength / 1024 / 1024).toFixed(2), 'MB — sending to /api/flows/save')

      const response = await fetch('/api/flows/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: compressedBuffer,
      })

      console.log('[SaveFlow] Response status:', response.status, response.statusText)
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        console.error('[SaveFlow] Error response body:', errData)
        throw new Error(errData.error || `HTTP ${response.status}`)
      }

      const result = await response.json()
      console.log('[SaveFlow] Success:', result)
      setSaveStatus('success')
      setTimeout(() => setSaveStatus('idle'), 3000)
    } catch (error) {
      console.error('[SaveFlow] Caught error:', error)
      setSaveErrorMsg(error instanceof Error ? error.message : 'Unknown error')
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 4000)
    } finally {
      setSavingFlow(false)
    }
  }

  // Load saved flow dates

  const loadFlowHistory = async () => {
    try {
      setLoadingHistory(true)

      const response = await fetch('/api/flows/dates')

      if (!response.ok) {
        throw new Error('Failed to load history')
      }

      const dates = await response.json()

      setSavedFlowDates(dates)

      setIsHistoryDialogOpen(true)
    } catch (error) {
      console.error('Error loading history:', error)
    } finally {
      setLoadingHistory(false)
    }
  }

  // Load specific flow by date

  const handleLoadFlow = async (date: string) => {
    try {
      setLoadingFlowDate(date)

      const response = await fetch(`/api/flows/${date}`)

      if (!response.ok) {
        throw new Error('Failed to load flow')
      }

      const flowData = await response.json()

      onDataUpdate && onDataUpdate(flowData.data)

      setIsHistoryDialogOpen(false)
    } catch (error) {
      console.error('Error loading flow:', error)
    } finally {
      setLoadingFlowDate(null)
    }
  }

  // Download flow as Excel
  const handleDownloadFlowExcel = async (date: string, dateLabel: string) => {
    try {
      const response = await fetch(`/api/flows/${date}`)
      if (!response.ok) throw new Error('Failed to fetch flow data')
      const flowData = await response.json()
      const trades: OptionsFlowData[] = flowData.data || []

      const rows = trades.map((t) => ({
        Date: date,
        Time: t.trade_timestamp ? new Date(t.trade_timestamp).toLocaleTimeString('en-US', { hour12: false }) : '',
        Ticker: t.underlying_ticker || t.ticker,
        Strike: t.strike,
        Expiry: t.expiry,
        Type: t.type?.toUpperCase(),
        Moneyness: t.moneyness,
        'Trade Type': t.trade_type,
        'Trade Size': t.trade_size,
        'Premium/Contract': t.premium_per_contract,
        'Total Premium': t.total_premium,
        'Spot Price': t.spot_price,
        'Days to Expiry': t.days_to_expiry,
        Exchange: t.exchange_name,
        'Fill Style': t.fill_style || '',
        Volume: t.volume ?? '',
        'Open Interest': t.open_interest ?? '',
        'Vol/OI': t.vol_oi_ratio ?? '',
        IV: t.implied_volatility ? (t.implied_volatility * 100).toFixed(2) + '%' : '',
        Delta: t.delta ?? '',
        Gamma: t.gamma ?? '',
        Theta: t.theta ?? '',
        Vega: t.vega ?? '',
      }))

      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Options Flow')
      XLSX.writeFile(wb, `options-flow-${date}.xlsx`)
    } catch (error) {
      console.error('[DownloadExcel] Error:', error)
      alert('Failed to download Excel file')
    }
  }

  // Delete flow by date

  const handleDeleteFlow = async (date: string) => {
    if (!confirm(`Delete flow from ${date}?`)) return

    try {
      const response = await fetch(`/api/flows/${date}`, { method: 'DELETE' })

      if (!response.ok) {
        throw new Error('Failed to delete flow')
      }

      // Reload history

      setSavedFlowDates((prev) => prev.filter((f) => f.date !== date))
    } catch (error) {
      console.error('Error deleting flow:', error)
    }
  }

  const handleSort = (field: keyof OptionsFlowData | 'positioning_grade') => {
    if (sortField === field) {
      const newDirection = sortDirection === 'asc' ? 'desc' : 'asc'
      setSortDirection(newDirection)
    } else {
      setSortField(field)

      setSortDirection('desc')
    }
  }

  // Pre-compute combo trade map for O(1) lookups instead of O(n) for each trade

  const comboTradeMap = useMemo(() => {
    const map = new Map<string, boolean>()

    // Group trades by ticker-expiry-strike range for combo detection

    const tradesByKey = new Map<string, OptionsFlowData[]>()

    tradesWithFillStyles.forEach((trade) => {
      const baseKey = `${trade.underlying_ticker}-${trade.expiry}`

      if (!tradesByKey.has(baseKey)) {
        tradesByKey.set(baseKey, [])
      }

      tradesByKey.get(baseKey)!.push(trade)
    })

    // Check each trade group for combos

    tradesByKey.forEach((trades, baseKey) => {
      trades.forEach((trade) => {
        const tradeKey = `${trade.underlying_ticker}-${trade.strike}-${trade.expiry}-${trade.type}-${trade.fill_style}`

        // Look for opposite leg

        const isCall = trade.type === 'call'

        const fillStyle = trade.fill_style || ''

        const hasCombo = trades.some((t) => {
          if (Math.abs(t.strike - trade.strike) > trade.strike * 0.1) return false

          const oppositeFill = t.fill_style || ''

          const oppositeType = t.type.toLowerCase()

          // Bullish combo: Calls with A/AA + Puts with B/BB

          if (isCall && (fillStyle === 'A' || fillStyle === 'AA')) {
            return oppositeType === 'put' && (oppositeFill === 'B' || oppositeFill === 'BB')
          }

          // Bearish combo: Calls with B/BB + Puts with A/AA

          if (isCall && (fillStyle === 'B' || fillStyle === 'BB')) {
            return oppositeType === 'put' && (oppositeFill === 'A' || oppositeFill === 'AA')
          }

          // For puts, reverse logic

          if (!isCall && (fillStyle === 'B' || fillStyle === 'BB')) {
            return oppositeType === 'call' && (oppositeFill === 'A' || oppositeFill === 'AA')
          }

          if (!isCall && (fillStyle === 'A' || fillStyle === 'AA')) {
            return oppositeType === 'call' && (oppositeFill === 'B' || oppositeFill === 'BB')
          }

          return false
        })

        map.set(tradeKey, hasCombo)
      })
    })

    return map
  }, [tradesWithFillStyles])

  const filteredAndSortedData = useMemo(() => {
    // OPTIMIZED: Only merge if we have enriched data, otherwise just use raw

    let sourceData: OptionsFlowData[]

    if (tradesWithFillStyles.length === 0) {
      // No enriched data yet - use raw data directly (fast path)

      sourceData = data
    } else if (tradesWithFillStyles.length === data.length) {
      // All data enriched - use enriched directly (fast path)

      sourceData = tradesWithFillStyles
    } else {
      // Partial enrichment - merge (slower path, but only during processing)

      const enrichedMap = new Map()

      tradesWithFillStyles.forEach((trade) => {
        const key = `${trade.underlying_ticker}-${trade.strike}-${trade.expiry}-${trade.type}-${trade.trade_timestamp}`

        enrichedMap.set(key, trade)
      })

      sourceData = data.map((trade) => {
        const key = `${trade.underlying_ticker}-${trade.strike}-${trade.expiry}-${trade.type}-${trade.trade_timestamp}`

        return enrichedMap.get(key) || trade
      })
    }

    // Step 1: Fast deduplication using Set (O(n) instead of O(n²))

    const seen = new Set<string>()

    const deduplicatedData = sourceData.filter((trade: OptionsFlowData) => {
      const tradeKey = `${trade.underlying_ticker}-${trade.strike}-${trade.expiry}-${trade.type}-${trade.trade_size}-${trade.total_premium}-${trade.spot_price}-${trade.trade_timestamp}-${trade.exchange_name}`

      if (seen.has(tradeKey)) {
        return false // Duplicate
      }

      seen.add(tradeKey)

      return true // First occurrence
    })

    // Log deduplication results only when needed

    if (sourceData.length !== deduplicatedData.length) {
      const duplicatesRemoved = sourceData.length - deduplicatedData.length
    }

    // Step 2: Bundle small trades (<$500) for same contract within 1 minute

    const bundledData: OptionsFlowData[] = []

    const smallTradeGroups = new Map<string, OptionsFlowData[]>()

    // First pass: separate large trades and group small trades

    deduplicatedData.forEach((trade: OptionsFlowData) => {
      if (trade.total_premium >= 500) {
        // Large trade - keep as is

        bundledData.push(trade)
      } else {
        // Small trade - group by contract and minute

        const tradeTime = new Date(trade.trade_timestamp)

        const minuteKey = `${tradeTime.getFullYear()}-${tradeTime.getMonth()}-${tradeTime.getDate()}-${tradeTime.getHours()}-${tradeTime.getMinutes()}`

        const groupKey = `${trade.underlying_ticker}-${trade.strike}-${trade.expiry}-${trade.type}-${minuteKey}`

        if (!smallTradeGroups.has(groupKey)) {
          smallTradeGroups.set(groupKey, [])
        }

        smallTradeGroups.get(groupKey)!.push(trade)
      }
    })

    // Second pass: bundle small trades

    smallTradeGroups.forEach((trades, groupKey) => {
      if (trades.length === 1) {
        // Only one small trade in this group - keep as is

        bundledData.push(trades[0])
      } else {
        // Multiple small trades - bundle them

        const totalContracts = trades.reduce((sum, t) => sum + t.trade_size, 0)

        const totalPremium = trades.reduce((sum, t) => sum + t.total_premium, 0)

        const avgPricePerContract = totalPremium / totalContracts

        // Use the first trade as template and update values

        const bundledTrade: OptionsFlowData = {
          ...trades[0],

          trade_size: totalContracts,

          premium_per_contract: avgPricePerContract,

          total_premium: totalPremium,

          exchange_name: `BUNDLED (${trades.length} trades)`,

          // Keep the earliest timestamp as string

          trade_timestamp: trades.reduce((earliest, t) =>
            new Date(t.trade_timestamp) < new Date(earliest.trade_timestamp) ? t : earliest
          ).trade_timestamp,
        }

        bundledData.push(bundledTrade)
      }
    })

    let filtered = bundledData

    // EFI Highlights filter - when active, show ONLY trades that meet EFI criteria

    if (efiHighlightsActive) {
      filtered = filtered.filter((trade) => meetsEfiCriteria(trade))
    }

    // Apply filters - Option Type (checkbox)

    if (selectedOptionTypes.length > 0 && selectedOptionTypes.length < 2) {
      filtered = filtered.filter((trade) => selectedOptionTypes.includes(trade.type))
    }

    // Order side filter (Buy = A/AA, Sell = B/BB)

    if (selectedOrderSides.length > 0 && selectedOrderSides.length < 2) {
      filtered = filtered.filter((trade) => {
        const fs = (trade.fill_style || '').toUpperCase()
        if (selectedOrderSides.includes('buy') && selectedOrderSides.includes('sell')) return true
        if (selectedOrderSides.includes('buy')) return fs === 'A' || fs === 'AA'
        if (selectedOrderSides.includes('sell')) return fs === 'B' || fs === 'BB'
        return true
      })
    }

    // Premium filters (checkbox + custom range)

    if (selectedPremiumFilters.length > 0 || customMinPremium || customMaxPremium) {
      filtered = filtered.filter((trade) => {
        let passesPresetFilters = true

        let passesCustomRange = true

        // Check preset filters

        if (selectedPremiumFilters.length > 0) {
          passesPresetFilters = selectedPremiumFilters.some((filter) => {
            switch (filter) {
              case '50000':
                return trade.total_premium >= 50000

              case '99000':
                return trade.total_premium >= 99000

              case '200000':
                return trade.total_premium >= 200000

              case '1000000':
                return trade.total_premium >= 1000000

              default:
                return true
            }
          })
        }

        // Check custom range

        if (customMinPremium || customMaxPremium) {
          const minVal = customMinPremium ? parseFloat(customMinPremium) : 0

          const maxVal = customMaxPremium ? parseFloat(customMaxPremium) : Infinity

          passesCustomRange = trade.total_premium >= minVal && trade.total_premium <= maxVal
        }

        return passesPresetFilters && passesCustomRange
      })
    }

    // Ticker filters (checkbox)

    if (selectedTickerFilters.length > 0) {
      const mag7Stocks = ['AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'NVDA', 'TSLA', 'META']

      filtered = filtered.filter((trade) => {
        return selectedTickerFilters.every((filter) => {
          switch (filter) {
            case 'ETF_ONLY':
              // Assuming ETFs can be identified by ticker patterns or we need additional data

              // For now, using a simple heuristic - ETFs often have 3 letters

              return (
                trade.underlying_ticker.length === 3 &&
                !mag7Stocks.includes(trade.underlying_ticker)
              )

            case 'STOCK_ONLY':
              // Exclude ETFs (assuming stocks are everything that's not in a common ETF pattern)

              return trade.underlying_ticker.length >= 3

            case 'MAG7_ONLY':
              return mag7Stocks.includes(trade.underlying_ticker)

            case 'EXCLUDE_MAG7':
              return !mag7Stocks.includes(trade.underlying_ticker)

            case 'HIGHLIGHTS_ONLY':
              return meetsEfiCriteria(trade)

            default:
              return true
          }
        })
      })
    }

    // Unique filters (checkbox)

    if (selectedUniqueFilters.length > 0) {
      filtered = filtered.filter((trade) => {
        return selectedUniqueFilters.every((filter) => {
          switch (filter) {
            case 'ITM':
              return trade.moneyness === 'ITM'

            case 'OTM':
              return trade.moneyness === 'OTM'

            case 'SWEEP_ONLY':
              return trade.trade_type === 'SWEEP'

            case 'BLOCK_ONLY':
              return trade.trade_type === 'BLOCK'

            case 'MULTI_LEG_ONLY':
              return trade.trade_type === 'MULTI-LEG'

            case 'WEEKLY_ONLY':
              // Check if expiration is within 7 days

              const expiryDate = new Date(trade.expiry)

              const today = new Date()

              const daysToExpiry = Math.ceil(
                (expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
              )

              return daysToExpiry <= 7

            case 'MINI_ONLY':
              return trade.trade_type === 'MINI'

            default:
              return true
          }
        })
      })
    }

    // Quick Filters

    if (quickFilters.otm) {
      filtered = filtered.filter((trade) => trade.moneyness === 'OTM')
    }

    if (quickFilters.weekly) {
      const today = new Date()

      const oneWeekFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)

      filtered = filtered.filter((trade) => {
        const expiryDate = new Date(trade.expiry)

        return expiryDate <= oneWeekFromNow
      })
    }

    if (quickFilters.premium100k) {
      filtered = filtered.filter((trade) => trade.total_premium >= 100000)
    }

    if (quickFilters.sweep) {
      filtered = filtered.filter((trade) => trade.trade_type === 'SWEEP')
    }

    if (quickFilters.block) {
      filtered = filtered.filter((trade) => trade.trade_type === 'BLOCK')
    }

    // Expiration date range filter

    if (expirationStartDate || expirationEndDate) {
      filtered = filtered.filter((trade) => {
        const tradeExpiryDate = new Date(trade.expiry)

        const startDate = expirationStartDate ? new Date(expirationStartDate) : null

        const endDate = expirationEndDate ? new Date(expirationEndDate) : null

        if (startDate && endDate) {
          return tradeExpiryDate >= startDate && tradeExpiryDate <= endDate
        } else if (startDate) {
          return tradeExpiryDate >= startDate
        } else if (endDate) {
          return tradeExpiryDate <= endDate
        }

        return true
      })
    }

    // Blacklisted tickers filter

    const activeBlacklistedTickers = blacklistedTickers.filter((ticker) => ticker.trim() !== '')

    if (activeBlacklistedTickers.length > 0) {
      filtered = filtered.filter((trade) => {
        return !activeBlacklistedTickers.includes(trade.underlying_ticker.toUpperCase())
      })
    }

    // Selected ticker filter

    if (selectedTickerFilter) {
      filtered = filtered.filter((trade) => trade.underlying_ticker === selectedTickerFilter)
    }

    // Notable Flow Pick filter (only active when EFI Highlights is on AND prices are loaded)

    if (efiHighlightsActive && notableFilterActive && !optionPricesFetching) {
      filtered = filtered.filter((trade) => meetsNotableCriteria(trade))
    }

    // Apply sorting

    filtered.sort((a, b) => {
      // Special handling for positioning grade sorting (custom field)

      if (sortField === 'positioning_grade') {
        // Calculate grades inline for sorting (can't use cache due to initialization order)

        const gradeA = calculatePositioningGrade(a, comboTradeMap)

        const gradeB = calculatePositioningGrade(b, comboTradeMap)

        // Use the numeric score for sorting (higher score = better grade)

        // DESC: High to Low (A+ to F), ASC: Low to High (F to A+)

        const result =
          sortDirection === 'desc' ? gradeB.score - gradeA.score : gradeA.score - gradeB.score

        return result
      }

      const aValue = a[sortField as keyof OptionsFlowData]

      const bValue = b[sortField as keyof OptionsFlowData]

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue)
      }

      const numA = Number(aValue)

      const numB = Number(bValue)

      return sortDirection === 'asc' ? numA - numB : numB - numA
    })

    return filtered
  }, [
    data,
    sortField,
    sortDirection,
    selectedOptionTypes,
    selectedPremiumFilters,
    customMinPremium,
    customMaxPremium,
    selectedTickerFilters,
    selectedUniqueFilters,
    expirationStartDate,
    expirationEndDate,
    selectedTickerFilter,
    blacklistedTickers,
    selectedOrderSides,
    tradesWithFillStyles,
    efiHighlightsActive,
    quickFilters,
    notableFilterActive,
  ])

  // Memoize all grade calculations - massive performance boost for 100+ trades

  const gradesCache = useMemo(() => {
    const cache = new Map<string, ReturnType<typeof calculatePositioningGrade>>()

    filteredAndSortedData.forEach((trade) => {
      const tradeId = `${trade.underlying_ticker}-${trade.strike}-${trade.expiry}-${trade.type}-${trade.trade_timestamp}`
      const result = calculatePositioningGrade(trade, comboTradeMap)
      cache.set(tradeId, result)

      if (efiHighlightsActive && meetsEfiCriteria(trade)) {
        const expiry = trade.expiry.replace(/-/g, '').slice(2)
        const strikeFormatted = String(Math.round(trade.strike * 1000)).padStart(8, '0')
        const optionType = trade.type.toLowerCase() === 'call' ? 'C' : 'P'
        const normalizedTicker = (trade.underlying_ticker || '').replace(/\./g, '')
        const opTicker = `O:${normalizedTicker}${expiry}${optionType}${strikeFormatted}`

      }
    })

    return cache
  }, [
    filteredAndSortedData,
    historicalRanges,
    currentPrices,
    currentOptionPrices,
    optionPriceCheckpoints,
    comboTradeMap,
    relativeStrengthData,
    historicalStdDevs,
  ])

  // Helper function to get cached grade

  const getCachedGrade = (trade: OptionsFlowData) => {
    const tradeId = `${trade.underlying_ticker}-${trade.strike}-${trade.expiry}-${trade.type}-${trade.trade_timestamp}`

    return gradesCache.get(tradeId) || calculatePositioningGrade(trade, comboTradeMap)
  }

  // Automatically enrich trades with Vol/OI AND Fill Style in ONE combined call - IMMEDIATELY as part of scan

  useEffect(() => {
    // ✅ NO ENRICHMENT NEEDED! All data comes pre-enriched from backend snapshot API

    // Backend now returns: vol, OI, vol/OI ratio, Greeks, bid/ask, fill_style, classification

    // Just pass through the data directly - instant display like Unusual Whales!

    setTradesWithFillStyles(data)
  }, [data])

  // Pagination logic

  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage

    const endIndex = startIndex + itemsPerPage

    return filteredAndSortedData.slice(startIndex, endIndex)
  }, [filteredAndSortedData, currentPage, itemsPerPage])

  const totalPages = Math.ceil(filteredAndSortedData.length / itemsPerPage)

  // Auto-fetch dealer zones for all visible notable trades
  useEffect(() => {
    const notableTrades = paginatedData.filter(
      (t) => notableFilterActive || (efiHighlightsActive && meetsNotableCriteria(t))
    )
    // Deduplicate by ticker — one fetch covers ALL expirations for the ticker
    const seenTickers = new Set<string>()
    for (const trade of notableTrades) {
      const key = trade.underlying_ticker
      if (key in dealerZoneCache || seenTickers.has(key)) continue
      seenTickers.add(key)

      // ── Priority 1: use DealerAttraction's live-computed values if available ──
      const storeZone = getDealerZone(key)
      if (storeZone) {
        setDealerZoneCache((prev) => ({
          ...prev,
          [key]: {
            golden: storeZone.golden,
            purple: storeZone.purple,
            atmIV: storeZone.atmIV,
            goldenExpiry: storeZone.goldenDetail?.expiry ?? null,
            purpleExpiry: storeZone.purpleDetail?.expiry ?? null,
          },
        }))
        continue
      }

      // ── Priority 2: fetch from server-side snapshot API ──
      setDealerZoneCache((prev) =>
        key in prev ? prev : { ...prev, [key]: { golden: null, purple: null, atmIV: null } }
      )
      // Delegate entirely to the dealer-zones API — same computation as DealerAttraction
      fetch(`/api/dealer-zones?ticker=${trade.underlying_ticker}`)
        .then((r) => r.json())
        .then((result: any) => {
          if (!result.success) return
          const golden = result.golden ?? null
          const purple = result.purple ?? null
          const atmIV = result.atmIV ?? null
          const goldenExpiry = result.goldenDetail?.expiry ?? null
          const purpleExpiry = result.purpleDetail?.expiry ?? null
          setDealerZoneCache((prev) => ({
            ...prev,
            [key]: { golden, purple, atmIV, goldenExpiry, purpleExpiry },
          }))
        })
        .catch(() => { })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paginatedData, notableFilterActive, efiHighlightsActive])

  // Reset to page 1 when filters change

  useEffect(() => {
    setCurrentPage(1)
  }, [
    selectedOptionTypes,
    selectedPremiumFilters,
    customMinPremium,
    customMaxPremium,
    selectedTickerFilters,
    selectedUniqueFilters,
    expirationStartDate,
    expirationEndDate,
    selectedTickerFilter,
    blacklistedTickers,
    selectedOrderSides,
  ])

  // Fetch current option prices when EFI Highlights is ON

  useEffect(() => {
    if (efiHighlightsActive && filteredAndSortedData.length > 0) {
      // Create a hash of the current dataset (based on data length + first few tickers)

      const datasetHash = `${data.length}-${data
        .slice(0, 5)
        .map((d) => d.underlying_ticker)
        .join('-')}`

      // Only fetch if we haven't fetched for this dataset yet

      if (datasetHash !== pricesFetchedForDataset) {
        fetchCurrentOptionPrices(filteredAndSortedData)

        setPricesFetchedForDataset(datasetHash)
      }
    }
  }, [efiHighlightsActive, data.length])

  // Fetch chart data for tracked flows when EFI is active or flows are added

  // Use useRef to track previous flows length to avoid unnecessary re-renders

  const prevTrackedFlowsLength = React.useRef(trackedFlows.length)

  // Ref for screenshot capture
  const captureRef = useRef<HTMLDivElement>(null)

  // Download page as a clean canvas-drawn image
  const handleDownloadImage = () => {
    try {
      const allTrades = filteredAndSortedData
      if (!allTrades || allTrades.length === 0) return

      const PAGE_SIZE = 15
      const dpr = 2
      const ROW_H = 44
      const HEADER_H = 64
      const TITLE_H = 53
      const FOOTER_H = 34
      const PAD = 14

      // columns — grade col appended only when EFI active
      const baseCols = [
        { label: 'TIME', w: 118 },
        { label: 'SYMBOL', w: 80 },
        { label: 'C/P', w: 54 },
        { label: 'STRIKE', w: 72 },
        { label: 'SIZE', w: 185 },
        { label: 'PREMIUM', w: 90 },
        { label: 'EXPIRY', w: 112 },
        { label: 'SPOT >> CURRENT', w: 200 },
        { label: 'TYPE', w: 110 },
      ]
      const gradeCol = { label: 'POSITION', w: 100 }
      const targetsCol = { label: 'TARGETS', w: 140 }
      const dealerCol = { label: 'DEALER', w: 170 }
      let cols = [...baseCols]
      if (efiHighlightsActive) cols = [...cols, gradeCol]
      if (notableFilterActive) cols = [...cols, targetsCol, dealerCol]

      const totalW = PAD + cols.reduce((s, c) => s + c.w + 6, 0) + PAD
      const dateStr = new Date().toISOString().split('T')[0]

      const fillColor = (fs: string) => {
        if (fs === 'A' || fs === 'AA') return '#00ff88'
        if (fs === 'B' || fs === 'BB') return '#ff4444'
        return '#aaaaaa'
      }
      const typeColor = (v: string) => {
        if (v === 'SWEEP') return '#ffee00'
        if (v === 'BLOCK') return '#00e5ff'
        if (v === 'MULTI-LEG') return '#cc44ff'
        return '#ffffff'
      }
      const gradeColor = (g: string) => {
        if (g.startsWith('A')) return '#00ff00'
        if (g.startsWith('B')) return '#84cc16'
        if (g.startsWith('C')) return '#fbbf24'
        if (g.startsWith('D')) return '#3b82f6'
        return '#ff0000'
      }

      const totalPages = Math.ceil(allTrades.length / PAGE_SIZE)

      for (let page = 0; page < 1; page++) {
        const trades = allTrades.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
        const totalH = TITLE_H + HEADER_H + trades.length * ROW_H + FOOTER_H

        const canvas = document.createElement('canvas')
        canvas.width = totalW * dpr
        canvas.height = totalH * dpr
        const ctx = canvas.getContext('2d')!
        ctx.scale(dpr, dpr)

        // ── Background ──
        ctx.fillStyle = '#000000'
        ctx.fillRect(0, 0, totalW, totalH)

        // ── Title bar ──
        ctx.fillStyle = '#080808'
        ctx.fillRect(0, 0, totalW, TITLE_H)
        // orange bottom border
        ctx.strokeStyle = '#ff8500'
        ctx.lineWidth = 2
        ctx.beginPath(); ctx.moveTo(0, TITLE_H); ctx.lineTo(totalW, TITLE_H); ctx.stroke()
        ctx.fillStyle = '#ff8500'
        ctx.font = 'bold 21px "Courier New", monospace'
        ctx.textAlign = 'left'
        ctx.textBaseline = 'middle'
        ctx.fillText('⬡ EFI OPTIONS FLOW', PAD, TITLE_H / 2)
        ctx.fillStyle = '#ffffff'
        ctx.font = '15px "Courier New", monospace'
        ctx.textAlign = 'right'
        ctx.fillText(
          new Date().toLocaleString('en-US', { month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) +
          (totalPages > 1 ? `   ${page + 1}/${totalPages}  •  ${allTrades.length} TRADES` : `   ${allTrades.length} TRADES`),
          totalW - PAD, TITLE_H / 2
        )

        // ── Header (glossy black) ──
        const hY = TITLE_H
        // Base black fill
        ctx.fillStyle = '#050505'
        ctx.fillRect(0, hY, totalW, HEADER_H)
        // Glossy gradient overlay
        const headerGloss = ctx.createLinearGradient(0, hY, 0, hY + HEADER_H)
        headerGloss.addColorStop(0, 'rgba(255,255,255,0.10)')
        headerGloss.addColorStop(0.45, 'rgba(255,255,255,0.04)')
        headerGloss.addColorStop(0.5, 'rgba(0,0,0,0)')
        headerGloss.addColorStop(1, 'rgba(0,0,0,0.25)')
        ctx.fillStyle = headerGloss
        ctx.fillRect(0, hY, totalW, HEADER_H)
        // Subtle top highlight line
        ctx.strokeStyle = 'rgba(255,255,255,0.18)'
        ctx.lineWidth = 1
        ctx.beginPath(); ctx.moveTo(0, hY + 1); ctx.lineTo(totalW, hY + 1); ctx.stroke()
        // Orange bottom border
        ctx.strokeStyle = '#ff8500'
        ctx.lineWidth = 2
        ctx.beginPath(); ctx.moveTo(0, hY + HEADER_H); ctx.lineTo(totalW, hY + HEADER_H); ctx.stroke()

        let hx = PAD
        cols.forEach((col) => {
          ctx.fillStyle = '#ffffff'
          ctx.font = 'bold 15px "Courier New", monospace'
          ctx.textAlign = 'left'
          ctx.textBaseline = 'middle'
          // Text shadow effect (draw twice with offset)
          ctx.font = 'bold 15px "Courier New", monospace'
          ctx.fillStyle = 'rgba(0,0,0,0.8)'
          ctx.fillText(col.label, hx + 1, hY + HEADER_H / 2 + 1)
          ctx.fillStyle = '#ff8500'
          ctx.fillText(col.label, hx, hY + HEADER_H / 2)
          hx += col.w + 6
        })

        // ── Rows ──
        trades.forEach((trade, i) => {
          const rY = TITLE_H + HEADER_H + i * ROW_H
          ctx.fillStyle = i % 2 === 0 ? '#050505' : '#0c0c0c'
          ctx.fillRect(0, rY, totalW, ROW_H)
          ctx.strokeStyle = '#1c1c1c'
          ctx.lineWidth = 0.5
          ctx.beginPath(); ctx.moveTo(0, rY + ROW_H); ctx.lineTo(totalW, rY + ROW_H); ctx.stroke()

          const mid = rY + ROW_H / 2
          const fs = (trade as any).fill_style || ''
          const tradeTypeRaw = (trade.classification || trade.trade_type || '').toUpperCase()
          const curPx = currentPrices[trade.underlying_ticker] ?? trade.current_price ?? 0

          ctx.textBaseline = 'middle'
          ctx.font = '15px "Courier New", monospace'

          let rx = PAD

          // TIME
          ctx.fillStyle = '#ffffff'
          ctx.textAlign = 'left'
          ctx.fillText(new Date(trade.trade_timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }), rx, mid)
          rx += cols[0].w + 6

          // SYMBOL — orange ticker style matching the UI
          ctx.fillStyle = '#ff8500'
          ctx.font = 'bold 15px "Courier New", monospace'
          ctx.fillText(trade.underlying_ticker, rx, mid)
          ctx.font = '15px "Courier New", monospace'
          rx += cols[1].w + 6

          // C/P
          ctx.fillStyle = trade.type === 'call' ? '#00ff88' : '#ff3333'
          ctx.font = 'bold 16px "Courier New", monospace'
          ctx.fillText(trade.type.toUpperCase(), rx, mid)
          ctx.font = '15px "Courier New", monospace'
          rx += cols[2].w + 6

          // STRIKE
          ctx.fillStyle = '#ffffff'
          ctx.fillText(`$${trade.strike}`, rx, mid)
          rx += cols[3].w + 6

          // SIZE — "1,234 @ 3.40 A"
          const sizeStr = trade.trade_size.toLocaleString()
          const priceStr = trade.premium_per_contract.toFixed(2)
          ctx.fillStyle = '#00ccff'
          ctx.fillText(sizeStr, rx, mid)
          const sw = ctx.measureText(sizeStr).width
          ctx.fillStyle = '#ffffff'
          ctx.fillText(' @ ', rx + sw, mid)
          const atW = ctx.measureText(' @ ').width
          ctx.fillStyle = '#ffdd00'
          ctx.fillText(priceStr, rx + sw + atW, mid)
          if (fs && fs !== 'N/A') {
            const prW = ctx.measureText(priceStr).width
            ctx.fillStyle = fillColor(fs)
            ctx.font = 'bold 14px "Courier New", monospace'
            ctx.fillText(fs, rx + sw + atW + prW + 4, mid)
            ctx.font = '15px "Courier New", monospace'
          }
          rx += cols[4].w + 6

          // PREMIUM
          ctx.fillStyle = '#00ff88'
          ctx.font = 'bold 16px "Courier New", monospace'
          ctx.fillText(`$${(trade.total_premium / 1000).toFixed(0)}K`, rx, mid)
          ctx.font = '15px "Courier New", monospace'
          rx += cols[5].w + 6

          // EXPIRY
          ctx.fillStyle = '#ffffff'
          ctx.fillText(trade.expiry, rx, mid)
          rx += cols[6].w + 6

          // SPOT >> CURRENT
          const spotStr = `$${trade.spot_price?.toFixed(2) ?? '—'}`
          ctx.fillStyle = '#ffffff'
          ctx.fillText(spotStr, rx, mid)
          const spW = ctx.measureText(spotStr).width
          ctx.fillStyle = '#ffffff'
          ctx.fillText(' >> ', rx + spW, mid)
          const arrW = ctx.measureText(' >> ').width
          const curStr = curPx ? `$${curPx.toFixed(2)}` : '—'
          ctx.fillStyle = curPx > trade.spot_price ? '#00ff88' : '#ff3333'
          ctx.font = 'bold 15px "Courier New", monospace'
          ctx.fillText(curStr, rx + spW + arrW, mid)
          ctx.font = '15px "Courier New", monospace'
          rx += cols[7].w + 6

          // TYPE
          ctx.fillStyle = typeColor(tradeTypeRaw)
          ctx.font = 'bold 14px "Courier New", monospace'
          ctx.fillText(tradeTypeRaw, rx, mid)
          ctx.font = '15px "Courier New", monospace'
          rx += cols[8].w + 6

          // POSITION / GRADE (only when EFI active)
          if (efiHighlightsActive) {
            const gradeData = calculatePositioningGrade(trade, comboTradeMap)
            if (gradeData && gradeData.grade !== 'N/A') {
              const { grade } = gradeData
              const gColor = gradeColor(grade)
              const expiryShort = trade.expiry.replace(/-/g, '').slice(2)
              const strikeFormatted = String(Math.round(trade.strike * 1000)).padStart(8, '0')
              const optionType = trade.type.toLowerCase() === 'call' ? 'C' : 'P'
              const normalizedTk = trade.underlying_ticker.replace(/[^A-Z]/g, '')
              const optionKey = `O:${normalizedTk}${expiryShort}${optionType}${strikeFormatted}`
              const curOptPx = currentOptionPrices[optionKey] ?? null
              const isSoldToOpen = (trade as any).fill_style === 'B' || (trade as any).fill_style === 'BB'
              let pctStr = ''
              if (curOptPx && trade.premium_per_contract) {
                const raw = ((curOptPx - trade.premium_per_contract) / trade.premium_per_contract) * 100
                const pct = isSoldToOpen ? -raw : raw
                pctStr = (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%'
              }
              ctx.fillStyle = gColor
              ctx.font = 'italic 20px Impact, Georgia, serif'
              ctx.textAlign = 'left'
              ctx.fillText(grade, rx, mid - (pctStr ? 8 : 0))
              if (pctStr) {
                const pctColor = pctStr.startsWith('+') ? '#00ff88' : '#ff3333'
                ctx.fillStyle = pctColor
                ctx.font = 'bold 14px "Courier New", monospace'
                ctx.fillText(pctStr, rx, mid + 9)
              }
              ctx.font = '15px "Courier New", monospace'
            } else {
              ctx.fillStyle = '#ffffff'
              ctx.font = '15px "Courier New", monospace'
              ctx.textAlign = 'left'
              ctx.fillText('—', rx, mid)
            }
            rx += gradeCol.w + 6
          }

          // TARGETS (only when notable active)
          if (notableFilterActive) {
            const isCall = trade.type === 'call'
            const isSoldToOpen = (trade as any).fill_style === 'B' || (trade as any).fill_style === 'BB'
            const targetIsUpside = (isCall && !isSoldToOpen) || (!isCall && isSoldToOpen)
            const cachedIV = dealerZoneCache[trade.underlying_ticker]?.atmIV
            const sigma = cachedIV && cachedIV > 0
              ? cachedIV
              : (trade.implied_volatility && trade.implied_volatility > 0 ? trade.implied_volatility : 0)
            const t1 = sigma > 0 ? bsStrikeForProb(trade.spot_price, sigma, trade.days_to_expiry, 80, targetIsUpside) : null
            const t2 = sigma > 0 ? bsStrikeForProb(trade.spot_price, sigma, trade.days_to_expiry, 90, targetIsUpside) : null
            ctx.font = '15px "Courier New", monospace'
            ctx.textAlign = 'left'
            if (t1 && t2) {
              ctx.fillStyle = '#00ff88'
              ctx.font = 'bold 12px "Courier New", monospace'
              ctx.fillText('T1', rx, mid - 8)
              ctx.fillStyle = '#ffffff'
              ctx.font = 'bold 15px "Courier New", monospace'
              ctx.fillText(`$${t1.toFixed(2)}`, rx + 22, mid - 8)
              ctx.fillStyle = '#ff8800'
              ctx.font = 'bold 12px "Courier New", monospace'
              ctx.fillText('T2', rx, mid + 8)
              ctx.fillStyle = '#ffffff'
              ctx.font = 'bold 15px "Courier New", monospace'
              ctx.fillText(`$${t2.toFixed(2)}`, rx + 22, mid + 8)
            } else {
              ctx.fillStyle = '#ffffff'
              ctx.font = '15px "Courier New", monospace'
              ctx.fillText('—', rx, mid)
            }
            rx += targetsCol.w + 6
          }

          // DEALER (only when notable active)
          if (notableFilterActive) {
            const zones = dealerZoneCache[trade.underlying_ticker]
            ctx.textAlign = 'left'
            if (zones) {
              // Build combined price+expiry strings so no measureText font mismatch
              const magnetVal = zones.golden != null
                ? `$${zones.golden}${zones.goldenExpiry ? '  ' + zones.goldenExpiry.slice(5).replace('-', '/') : ''}`
                : '—'
              const pivotVal = zones.purple != null
                ? `$${zones.purple}${zones.purpleExpiry ? '  ' + zones.purpleExpiry.slice(5).replace('-', '/') : ''}`
                : '—'
              ctx.font = 'bold 11px "Courier New", monospace'
              ctx.fillStyle = '#FFD700'
              ctx.fillText('MAGNET', rx, mid - 8)
              ctx.font = 'bold 14px "Courier New", monospace'
              ctx.fillText(magnetVal, rx + 60, mid - 8)
              ctx.font = 'bold 11px "Courier New", monospace'
              ctx.fillStyle = '#a855f7'
              ctx.fillText('PIVOT', rx, mid + 8)
              ctx.font = 'bold 14px "Courier New", monospace'
              ctx.fillText(pivotVal, rx + 60, mid + 8)
            } else {
              ctx.fillStyle = '#ffffff'
              ctx.font = '15px "Courier New", monospace'
              ctx.fillText('—', rx, mid)
            }
          }
        })

        // ── Footer ──
        const fY = TITLE_H + HEADER_H + trades.length * ROW_H
        ctx.fillStyle = '#080808'
        ctx.fillRect(0, fY, totalW, FOOTER_H)
        ctx.strokeStyle = '#ff8500'
        ctx.lineWidth = 1
        ctx.beginPath(); ctx.moveTo(0, fY); ctx.lineTo(totalW, fY); ctx.stroke()
        ctx.fillStyle = '#ffffff'
        ctx.font = '14px "Courier New", monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('EFI TRADING  •  efitrading.com', totalW / 2, fY + FOOTER_H / 2)

        // ── Download ──
        const dataUrl = canvas.toDataURL('image/png')
        const link = document.createElement('a')
        link.download = totalPages > 1
          ? `options-flow-${dateStr}-${page + 1}of${totalPages}.png`
          : `options-flow-${dateStr}.png`
        link.href = dataUrl
        link.style.display = 'none'
        document.body.appendChild(link)
        link.click()
        setTimeout(() => document.body.removeChild(link), 100)
      }
    } catch (err) {
      console.error('[Download] Error:', err)
    }
  }

  useEffect(() => {
    // Clean up expired flows and only fetch if flows exist

    if (trackedFlows.length > 0) {
      // Remove expired flows

      const now = new Date()

      now.setHours(0, 0, 0, 0)

      const activeFlows = trackedFlows.filter((flow) => {
        const expiryDate = new Date(flow.expiry)

        expiryDate.setHours(0, 0, 0, 0)

        return now <= expiryDate
      })

      // If expired flows were removed, update localStorage

      if (activeFlows.length !== trackedFlows.length) {
        localStorage.setItem('flowTrackingWatchlist', JSON.stringify(activeFlows))

        setTrackedFlows(activeFlows)

        return // Exit early, the state update will trigger this effect again
      }

      // Only fetch if flows were added (length increased) or EFI is active

      if (efiHighlightsActive || trackedFlows.length > prevTrackedFlowsLength.current) {
        // Fetch option prices for grading

        fetchCurrentOptionPrices(trackedFlows)

        // Fetch current stock prices for grading

        const uniqueTickers = [...new Set(trackedFlows.map((t) => t.underlying_ticker))]

        fetchCurrentPrices(uniqueTickers)

        // Fetch chart data for each flow with their individual timeframes

        trackedFlows.forEach((flow) => {
          const flowId = generateFlowId(flow)

          const stockTimeframe = flowChartTimeframes[flowId]?.stock || '1D'

          const optionTimeframe = flowChartTimeframes[flowId]?.option || '1D'

          // Fetch stock chart data for this flow

          fetchStockChartDataForFlow(flowId, flow.underlying_ticker, stockTimeframe)

          // Fetch options premium data for this flow

          fetchOptionPremiumDataForFlow(flowId, flow, optionTimeframe)
        })

        // Update ref

        prevTrackedFlowsLength.current = trackedFlows.length
      }
    }
  }, [trackedFlows.length, efiHighlightsActive])

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',

      currency: 'USD',

      minimumFractionDigits: 0,

      maximumFractionDigits: 0,
    }).format(value)
  }

  const handleTickerClick = (ticker: string) => {
    if (selectedTickerFilter === ticker) {
      // If clicking the same ticker, clear the filter

      setSelectedTickerFilter('')
    } else {
      // Set new ticker filter

      setSelectedTickerFilter(ticker)
    }
  }

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp)
    const timeStr = date.toLocaleTimeString('en-US', {
      hour12: true,
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/Los_Angeles',
    })
    if (historicalDays !== '1D') {
      const m = date.toLocaleString('en-US', { month: 'numeric', timeZone: 'America/Los_Angeles' })
      const d = date.toLocaleString('en-US', { day: 'numeric', timeZone: 'America/Los_Angeles' })
      return `${m}/${d} ${timeStr}`
    }
    return timeStr
  }

  const formatTimeWithSeconds = (timestamp: string) => {
    const date = new Date(timestamp)
    const timeStr = date.toLocaleTimeString('en-US', {
      hour12: true,
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'America/Los_Angeles',
    })
    if (historicalDays !== '1D') {
      const m = date.toLocaleString('en-US', { month: 'numeric', timeZone: 'America/Los_Angeles' })
      const d = date.toLocaleString('en-US', { day: 'numeric', timeZone: 'America/Los_Angeles' })
      return `${m}/${d} ${timeStr}`
    }
    return timeStr
  }

  const formatDate = (dateString: string) => {
    // Parse date string manually to avoid timezone issues

    // Expected format: YYYY-MM-DD

    const [year, month, day] = dateString.split('-')

    return `${month}/${day}/${year}`
  }

  const getTradeTypeColor = (tradeType: string): { className: string; style: React.CSSProperties } => {
    const base = 'trade-type-badge inline-block font-bold'

    const glossyBlack: React.CSSProperties = {
      backgroundColor: '#000000',
      backgroundImage: 'linear-gradient(180deg, #1e1e1e 0%, #000000 50%, #111111 100%)',
    }

    const glossyOverlay = 'inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -1px 0 rgba(0,0,0,0.8)'

    if (tradeType === 'SWEEP') {
      return {
        className: base,
        style: {
          ...glossyBlack,
          color: '#FFD700',
          border: '1px solid rgba(255,215,0,0.6)',
          boxShadow: glossyOverlay,
          borderRadius: '9999px',
          letterSpacing: '0.05em',
        },
      }
    }

    if (tradeType === 'BLOCK') {
      return {
        className: base,
        style: {
          ...glossyBlack,
          color: '#00e5ff',
          border: '1px solid rgba(0,229,255,0.5)',
          boxShadow: glossyOverlay,
          borderRadius: '9999px',
          letterSpacing: '0.05em',
        },
      }
    }

    if (tradeType === 'MULTI-LEG') {
      return {
        className: base,
        style: {
          backgroundColor: '#1e0a3c',
          backgroundImage: 'linear-gradient(180deg, #3b1d6e 0%, #1e0a3c 50%, #2d1555 100%)',
          color: '#d8b4fe',
          border: '1px solid rgba(168,85,247,0.5)',
          boxShadow: glossyOverlay,
          borderRadius: '9999px',
          letterSpacing: '0.05em',
        },
      }
    }

    if (tradeType === 'MINI') {
      return {
        className: base,
        style: {
          backgroundColor: '#052e16',
          backgroundImage: 'linear-gradient(180deg, #14532d 0%, #052e16 50%, #0f3d22 100%)',
          color: '#86efac',
          border: '1px solid rgba(134,239,172,0.4)',
          boxShadow: glossyOverlay,
          borderRadius: '9999px',
          letterSpacing: '0.05em',
        },
      }
    }

    return {
      className: base,
      style: {
        ...glossyBlack,
        color: '#9ca3af',
        border: '1px solid rgba(156,163,175,0.4)',
        boxShadow: glossyOverlay,
        borderRadius: '9999px',
        letterSpacing: '0.05em',
      },
    }
  }

  const getCallPutColor = (type: string) => {
    return type === 'call' ? 'text-green-500 font-bold text-xl' : 'text-red-500 font-bold text-xl'
  }

  const getTickerStyle = (ticker: string) => {
    // Box-style background for ticker symbols - orange text with silver-black background

    return 'bg-gradient-to-b from-gray-800 to-black text-orange-500 font-bold px-6 py-3 border border-gray-500/70 shadow-lg text-lg tracking-wide rounded-sm min-w-[80px]'
  }

  // Prevent hydration mismatch - only render after client mount

  if (!isMounted) {
    return null
  }

  return (
    <div style={{ display: 'flex', width: '100%', alignItems: 'flex-start' }}>
      {/* Filter Dialog Modal */}

      {isFilterDialogOpen && (
        <>
          {/* Invisible backdrop for click-to-close */}

          <div
            className="fixed top-16 md:inset-0 bottom-0 left-0 right-0 z-[9998]"
            onClick={() => {
              setIsFilterDialogOpen(false)
            }}
          />

          {/* Modal Content */}

          <div
            className="filter-dialog fixed left-0 md:left-1/2 transform md:-translate-x-1/2 w-full md:w-auto md:max-w-4xl max-h-[85vh] md:h-auto md:max-h-[55vh] overflow-y-auto z-[9999]"
            style={{
              top: typeof window !== 'undefined' && window.innerWidth < 768 ? '180px' : '224px',
              background:
                typeof window !== 'undefined' && window.innerWidth < 768 ? '#000000' : '#000',
              border:
                typeof window !== 'undefined' && window.innerWidth < 768
                  ? '1px solid rgba(255,255,255,0.1)'
                  : '1px solid #4b5563',
              borderRadius:
                typeof window !== 'undefined' && window.innerWidth < 768 ? '16px' : '8px',
              padding: typeof window !== 'undefined' && window.innerWidth < 768 ? '16px' : '16px',
              boxShadow:
                typeof window !== 'undefined' && window.innerWidth < 768
                  ? '0 0 0 1px rgba(255,255,255,0.04), 0 32px 64px rgba(0,0,0,0.95)'
                  : '0 4px 16px rgba(0,0,0,0.5)',
            }}
          >
            <div className="filter-dialog-content">
              <div className="flex justify-center items-center mb-6 relative">
                <h2 className="text-2xl md:text-2xl font-bold italic text-orange-400 md:text-orange-400">
                  <span
                    className="hidden md:inline"
                    style={{
                      fontFamily: 'Georgia, serif',
                      textShadow: '0 0 8px rgba(255, 165, 0, 0.3)',
                      letterSpacing: '0.5px',
                    }}
                  >
                    Options Flow Filters
                  </span>

                  <span
                    className="inline md:hidden"
                    style={{
                      fontFamily: 'system-ui, -apple-system, sans-serif',
                      fontSize: '18px',
                      fontWeight: 800,
                      letterSpacing: '3px',
                      textTransform: 'uppercase',
                      background: 'linear-gradient(90deg, #ffffff 0%, #d1d5db 100%)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                      fontStyle: 'normal',
                    }}
                  >
                    FLOW FILTERS
                  </span>
                </h2>

                <button
                  onClick={() => setIsFilterDialogOpen(false)}
                  className="absolute right-0 font-bold"
                  style={{
                    color: '#ffffff',
                    fontSize: '22px',
                    lineHeight: 1,
                    padding: '2px 6px',
                    background: '#111',
                    borderRadius: '6px',
                    border: '1px solid rgba(255,255,255,0.15)',
                  }}
                >
                  ×
                </button>
              </div>

              {/* Mobile: Premium Redesigned Layout */}

              {isMobileView && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {/* ── OPTIONS + TYPE ── */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    {/* OPTIONS */}
                    <div
                      style={{
                        background: '#000',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '12px',
                        padding: '12px',
                        boxShadow: '0 0 0 1px rgba(255,255,255,0.05), 0 8px 24px rgba(0,0,0,0.95)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          marginBottom: '10px',
                          paddingBottom: '8px',
                          borderBottom: '1px solid rgba(255,255,255,0.08)',
                        }}
                      >
                        <div
                          style={{
                            width: '3px',
                            height: '14px',
                            borderRadius: '2px',
                            background: 'linear-gradient(180deg, #10b981, #ef4444)',
                          }}
                        />
                        <span
                          style={{
                            fontSize: '13px',
                            fontWeight: 800,
                            letterSpacing: '2px',
                            textTransform: 'uppercase',
                            color: '#ffffff',
                          }}
                        >
                          Options
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {[
                          {
                            label: 'CALLS',
                            value: 'call',
                            color: '#10b981',
                            glow: 'rgba(16,185,129,0.25)',
                          },
                          {
                            label: 'PUTS',
                            value: 'put',
                            color: '#ef4444',
                            glow: 'rgba(239,68,68,0.25)',
                          },
                        ].map(({ label, value, color, glow }) => {
                          const active = selectedOptionTypes.includes(value)
                          return (
                            <button
                              key={value}
                              onClick={() =>
                                setSelectedOptionTypes((prev) =>
                                  active ? prev.filter((t) => t !== value) : [...prev, value]
                                )
                              }
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '7px',
                                padding: '9px 8px',
                                borderRadius: '8px',
                                border: `1px solid ${active ? color : 'rgba(255,255,255,0.06)'}`,
                                background: active
                                  ? `linear-gradient(135deg, ${color}22 0%, ${color}11 100%)`
                                  : 'rgba(255,255,255,0.02)',
                                boxShadow: active
                                  ? `0 0 12px ${glow}, inset 0 1px 0 rgba(255,255,255,0.08)`
                                  : 'none',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                width: '100%',
                              }}
                            >
                              <div
                                style={{
                                  width: '7px',
                                  height: '7px',
                                  borderRadius: '50%',
                                  background: active ? color : '#374151',
                                  boxShadow: active ? `0 0 6px ${color}` : 'none',
                                  transition: 'all 0.15s ease',
                                  flexShrink: 0,
                                }}
                              />
                              <span
                                style={{
                                  fontSize: '16px',
                                  fontWeight: 800,
                                  letterSpacing: '1.5px',
                                  color: active ? color : '#ffffff',
                                }}
                              >
                                {label}
                              </span>
                            </button>
                          )
                        })}
                        <div
                          style={{
                            marginTop: '8px',
                            paddingTop: '8px',
                            borderTop: '1px solid rgba(255,255,255,0.07)',
                          }}
                        >
                          {[
                            {
                              label: 'BUY',
                              value: 'buy',
                              color: '#22d3ee',
                              glow: 'rgba(34,211,238,0.25)',
                            },
                            {
                              label: 'SELL',
                              value: 'sell',
                              color: '#f97316',
                              glow: 'rgba(249,115,22,0.25)',
                            },
                          ].map(({ label, value, color, glow }) => {
                            const active = selectedOrderSides.includes(value)
                            return (
                              <button
                                key={value}
                                onClick={() =>
                                  setSelectedOrderSides((prev) =>
                                    active ? prev.filter((s) => s !== value) : [...prev, value]
                                  )
                                }
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '7px',
                                  padding: '8px 8px',
                                  marginBottom: '6px',
                                  borderRadius: '8px',
                                  border: `1px solid ${active ? color : 'rgba(255,255,255,0.06)'}`,
                                  background: active
                                    ? `linear-gradient(135deg, ${color}22 0%, ${color}11 100%)`
                                    : 'rgba(255,255,255,0.02)',
                                  boxShadow: active ? `0 0 12px ${glow}` : 'none',
                                  cursor: 'pointer',
                                  transition: 'all 0.15s ease',
                                  width: '100%',
                                }}
                              >
                                <div
                                  style={{
                                    width: '7px',
                                    height: '7px',
                                    borderRadius: '50%',
                                    background: active ? color : '#374151',
                                    boxShadow: active ? `0 0 6px ${color}` : 'none',
                                    transition: 'all 0.15s ease',
                                    flexShrink: 0,
                                  }}
                                />
                                <span
                                  style={{
                                    fontSize: '14px',
                                    fontWeight: 800,
                                    letterSpacing: '1.5px',
                                    color: active ? color : '#ffffff',
                                  }}
                                >
                                  {label}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    </div>

                    {/* TYPE */}
                    <div
                      style={{
                        background: '#000',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '12px',
                        padding: '12px',
                        boxShadow: '0 0 0 1px rgba(255,255,255,0.05), 0 8px 24px rgba(0,0,0,0.95)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          marginBottom: '10px',
                          paddingBottom: '8px',
                          borderBottom: '1px solid rgba(255,255,255,0.08)',
                        }}
                      >
                        <div
                          style={{
                            width: '3px',
                            height: '14px',
                            borderRadius: '2px',
                            background: 'linear-gradient(180deg, #6366f1, #f59e0b)',
                          }}
                        />
                        <span
                          style={{
                            fontSize: '13px',
                            fontWeight: 800,
                            letterSpacing: '2px',
                            textTransform: 'uppercase',
                            color: '#ffffff',
                          }}
                        >
                          Type
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {[
                          {
                            label: 'BLOCK',
                            value: 'block',
                            color: '#6366f1',
                            glow: 'rgba(99,102,241,0.25)',
                          },
                          {
                            label: 'SWEEP',
                            value: 'sweep',
                            color: '#f59e0b',
                            glow: 'rgba(245,158,11,0.25)',
                          },
                        ].map(({ label, value, color, glow }) => {
                          const active = selectedUniqueFilters.includes(value)
                          return (
                            <button
                              key={value}
                              onClick={() =>
                                setSelectedUniqueFilters((prev) =>
                                  active ? prev.filter((f) => f !== value) : [...prev, value]
                                )
                              }
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '7px',
                                padding: '9px 8px',
                                borderRadius: '8px',
                                border: `1px solid ${active ? color : 'rgba(255,255,255,0.06)'}`,
                                background: active
                                  ? `linear-gradient(135deg, ${color}22 0%, ${color}11 100%)`
                                  : 'rgba(255,255,255,0.02)',
                                boxShadow: active
                                  ? `0 0 12px ${glow}, inset 0 1px 0 rgba(255,255,255,0.08)`
                                  : 'none',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                width: '100%',
                              }}
                            >
                              <div
                                style={{
                                  width: '7px',
                                  height: '7px',
                                  borderRadius: '50%',
                                  background: active ? color : '#374151',
                                  boxShadow: active ? `0 0 6px ${color}` : 'none',
                                  transition: 'all 0.15s ease',
                                  flexShrink: 0,
                                }}
                              />
                              <span
                                style={{
                                  fontSize: '16px',
                                  fontWeight: 800,
                                  letterSpacing: '1.5px',
                                  color: active ? color : '#ffffff',
                                }}
                              >
                                {label}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>

                  {/* ── PREMIUM ── */}
                  <div
                    style={{
                      background: '#000',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '12px',
                      padding: '12px',
                      boxShadow: '0 0 0 1px rgba(255,255,255,0.05), 0 8px 24px rgba(0,0,0,0.95)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        marginBottom: '10px',
                        paddingBottom: '8px',
                        borderBottom: '1px solid rgba(255,255,255,0.08)',
                      }}
                    >
                      <div
                        style={{
                          width: '3px',
                          height: '14px',
                          borderRadius: '2px',
                          background: 'linear-gradient(180deg, #10b981, #059669)',
                        }}
                      />
                      <span
                        style={{
                          fontSize: '13px',
                          fontWeight: 800,
                          letterSpacing: '2px',
                          textTransform: 'uppercase',
                          color: '#ffffff',
                        }}
                      >
                        Premium
                      </span>
                    </div>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '6px',
                        marginBottom: '10px',
                      }}
                    >
                      {[
                        { label: '≥ $50K', value: '50000' },
                        { label: '≥ $99K', value: '99000' },
                        { label: '≥ $200K', value: '200000' },
                        { label: '≥ $1M', value: '1000000' },
                      ].map(({ label, value }) => {
                        const active = selectedPremiumFilters.includes(value)
                        return (
                          <button
                            key={value}
                            onClick={() =>
                              setSelectedPremiumFilters((prev) =>
                                active ? prev.filter((f) => f !== value) : [...prev, value]
                              )
                            }
                            style={{
                              padding: '9px 6px',
                              borderRadius: '8px',
                              border: `1px solid ${active ? '#10b981' : 'rgba(255,255,255,0.06)'}`,
                              background: active
                                ? 'linear-gradient(135deg, rgba(16,185,129,0.2) 0%, rgba(16,185,129,0.08) 100%)'
                                : 'rgba(255,255,255,0.02)',
                              boxShadow: active
                                ? '0 0 12px rgba(16,185,129,0.2), inset 0 1px 0 rgba(255,255,255,0.06)'
                                : 'none',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                              fontSize: '16px',
                              fontWeight: 800,
                              letterSpacing: '0.5px',
                              color: active ? '#10b981' : '#ffffff',
                            }}
                          >
                            {label}
                          </button>
                        )
                      })}
                    </div>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '8px',
                        paddingTop: '10px',
                        borderTop: '1px solid rgba(255,255,255,0.05)',
                      }}
                    >
                      <div style={{ position: 'relative' }}>
                        <span
                          style={{
                            position: 'absolute',
                            left: '10px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            fontSize: '14px',
                            color: '#94a3b8',
                            pointerEvents: 'none',
                            fontWeight: 700,
                          }}
                        >
                          MIN
                        </span>
                        <input
                          type="number"
                          value={customMinPremium}
                          onChange={(e) => setCustomMinPremium(e.target.value)}
                          placeholder="$0"
                          style={{
                            width: '100%',
                            paddingLeft: '38px',
                            paddingRight: '8px',
                            paddingTop: '9px',
                            paddingBottom: '9px',
                            background: '#000',
                            border: '1px solid rgba(255,255,255,0.15)',
                            borderRadius: '8px',
                            color: '#ffffff',
                            fontSize: '16px',
                            fontWeight: 700,
                            outline: 'none',
                            boxSizing: 'border-box',
                          }}
                        />
                      </div>
                      <div style={{ position: 'relative' }}>
                        <span
                          style={{
                            position: 'absolute',
                            left: '10px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            fontSize: '14px',
                            color: '#94a3b8',
                            pointerEvents: 'none',
                            fontWeight: 700,
                          }}
                        >
                          MAX
                        </span>
                        <input
                          type="number"
                          value={customMaxPremium}
                          onChange={(e) => setCustomMaxPremium(e.target.value)}
                          placeholder="$∞"
                          style={{
                            width: '100%',
                            paddingLeft: '40px',
                            paddingRight: '8px',
                            paddingTop: '9px',
                            paddingBottom: '9px',
                            background: '#000',
                            border: '1px solid rgba(255,255,255,0.15)',
                            borderRadius: '8px',
                            color: '#ffffff',
                            fontSize: '16px',
                            fontWeight: 700,
                            outline: 'none',
                            boxSizing: 'border-box',
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* ── TICKER + SPECIAL ── */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    {/* TICKER */}
                    <div
                      style={{
                        background: '#000',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '12px',
                        padding: '12px',
                        boxShadow: '0 0 0 1px rgba(255,255,255,0.05), 0 8px 24px rgba(0,0,0,0.95)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          marginBottom: '10px',
                          paddingBottom: '8px',
                          borderBottom: '1px solid rgba(255,255,255,0.08)',
                        }}
                      >
                        <div
                          style={{
                            width: '3px',
                            height: '14px',
                            borderRadius: '2px',
                            background: 'linear-gradient(180deg, #3b82f6, #1d4ed8)',
                          }}
                        />
                        <span
                          style={{
                            fontSize: '13px',
                            fontWeight: 800,
                            letterSpacing: '2px',
                            textTransform: 'uppercase',
                            color: '#ffffff',
                          }}
                        >
                          Ticker
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        {[
                          { label: 'ETF', value: 'ETF_ONLY' },
                          { label: 'STOCK', value: 'STOCK_ONLY' },
                          { label: 'MAG 7', value: 'MAG7_ONLY' },
                          { label: 'NO MAG7', value: 'EXCLUDE_MAG7' },
                        ].map(({ label, value }) => {
                          const active = selectedTickerFilters.includes(value)
                          return (
                            <button
                              key={value}
                              onClick={() =>
                                setSelectedTickerFilters((prev) =>
                                  active ? prev.filter((f) => f !== value) : [...prev, value]
                                )
                              }
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '7px',
                                padding: '7px 8px',
                                borderRadius: '7px',
                                border: `1px solid ${active ? '#3b82f6' : 'rgba(255,255,255,0.05)'}`,
                                background: active
                                  ? 'rgba(59,130,246,0.12)'
                                  : 'rgba(255,255,255,0.02)',
                                boxShadow: active ? '0 0 10px rgba(59,130,246,0.2)' : 'none',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                width: '100%',
                              }}
                            >
                              <div
                                style={{
                                  width: '6px',
                                  height: '6px',
                                  borderRadius: '50%',
                                  background: active ? '#3b82f6' : '#374151',
                                  boxShadow: active ? '0 0 5px #3b82f6' : 'none',
                                  flexShrink: 0,
                                }}
                              />
                              <span
                                style={{
                                  fontSize: '13px',
                                  fontWeight: 800,
                                  letterSpacing: '1px',
                                  color: active ? '#93c5fd' : '#ffffff',
                                }}
                              >
                                {label}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* SPECIAL */}
                    <div
                      style={{
                        background: '#000',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '12px',
                        padding: '12px',
                        boxShadow: '0 0 0 1px rgba(255,255,255,0.05), 0 8px 24px rgba(0,0,0,0.95)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          marginBottom: '10px',
                          paddingBottom: '8px',
                          borderBottom: '1px solid rgba(255,255,255,0.08)',
                        }}
                      >
                        <div
                          style={{
                            width: '3px',
                            height: '14px',
                            borderRadius: '2px',
                            background: 'linear-gradient(180deg, #06b6d4, #0891b2)',
                          }}
                        />
                        <span
                          style={{
                            fontSize: '13px',
                            fontWeight: 800,
                            letterSpacing: '2px',
                            textTransform: 'uppercase',
                            color: '#ffffff',
                          }}
                        >
                          Special
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        {[
                          { label: 'ITM', value: 'ITM' },
                          { label: 'OTM', value: 'OTM' },
                          { label: 'WEEKLY', value: 'WEEKLY_ONLY' },
                          { label: 'MINI', value: 'MINI_ONLY' },
                        ].map(({ label, value }) => {
                          const active = selectedUniqueFilters.includes(value)
                          return (
                            <button
                              key={value}
                              onClick={() =>
                                setSelectedUniqueFilters((prev) =>
                                  active ? prev.filter((f) => f !== value) : [...prev, value]
                                )
                              }
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '7px',
                                padding: '7px 8px',
                                borderRadius: '7px',
                                border: `1px solid ${active ? '#06b6d4' : 'rgba(255,255,255,0.05)'}`,
                                background: active
                                  ? 'rgba(6,182,212,0.12)'
                                  : 'rgba(255,255,255,0.02)',
                                boxShadow: active ? '0 0 10px rgba(6,182,212,0.2)' : 'none',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                width: '100%',
                              }}
                            >
                              <div
                                style={{
                                  width: '6px',
                                  height: '6px',
                                  borderRadius: '50%',
                                  background: active ? '#06b6d4' : '#374151',
                                  boxShadow: active ? '0 0 5px #06b6d4' : 'none',
                                  flexShrink: 0,
                                }}
                              />
                              <span
                                style={{
                                  fontSize: '13px',
                                  fontWeight: 800,
                                  letterSpacing: '1px',
                                  color: active ? '#67e8f9' : '#ffffff',
                                }}
                              >
                                {label}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>

                  {/* ── BLACKLIST ── */}
                  <div
                    style={{
                      background: '#000',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '12px',
                      padding: '12px',
                      boxShadow: '0 0 0 1px rgba(255,255,255,0.05), 0 8px 24px rgba(0,0,0,0.95)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        marginBottom: '10px',
                        paddingBottom: '8px',
                        borderBottom: '1px solid rgba(255,255,255,0.08)',
                      }}
                    >
                      <div
                        style={{
                          width: '3px',
                          height: '14px',
                          borderRadius: '2px',
                          background: 'linear-gradient(180deg, #ef4444, #b91c1c)',
                        }}
                      />
                      <span
                        style={{
                          fontSize: '13px',
                          fontWeight: 800,
                          letterSpacing: '2px',
                          textTransform: 'uppercase',
                          color: '#ffffff',
                        }}
                      >
                        Blacklist
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                      {blacklistedTickers.slice(0, 10).map((ticker, index) => (
                        <input
                          key={index}
                          type="text"
                          value={ticker}
                          onChange={(e) => {
                            const t = [...blacklistedTickers]
                            t[index] = e.target.value.toUpperCase()
                            setBlacklistedTickers(t)
                          }}
                          placeholder={`#${index + 1}`}
                          maxLength={6}
                          style={{
                            padding: '9px 6px',
                            textAlign: 'center',
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(239,68,68,0.2)',
                            borderRadius: '8px',
                            color: '#fca5a5',
                            fontSize: '16px',
                            fontWeight: 800,
                            letterSpacing: '1px',
                            outline: 'none',
                            width: '100%',
                            boxSizing: 'border-box',
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* ── EXPIRATION ── */}
                  <div
                    style={{
                      background: '#000',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '12px',
                      padding: '12px',
                      boxShadow: '0 0 0 1px rgba(255,255,255,0.05), 0 8px 24px rgba(0,0,0,0.95)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        marginBottom: '10px',
                        paddingBottom: '8px',
                        borderBottom: '1px solid rgba(255,255,255,0.08)',
                      }}
                    >
                      <div
                        style={{
                          width: '3px',
                          height: '14px',
                          borderRadius: '2px',
                          background: 'linear-gradient(180deg, #a855f7, #7c3aed)',
                        }}
                      />
                      <span
                        style={{
                          fontSize: '13px',
                          fontWeight: 800,
                          letterSpacing: '2px',
                          textTransform: 'uppercase',
                          color: '#ffffff',
                        }}
                      >
                        Expiration
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <div>
                        <span
                          style={{
                            display: 'block',
                            fontSize: '12px',
                            fontWeight: 800,
                            letterSpacing: '1.5px',
                            color: '#94a3b8',
                            marginBottom: '5px',
                            textTransform: 'uppercase',
                          }}
                        >
                          Start
                        </span>
                        <input
                          type="date"
                          value={expirationStartDate}
                          onChange={(e) => setExpirationStartDate(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '9px 8px',
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(168,85,247,0.3)',
                            borderRadius: '8px',
                            color: '#e9d5ff',
                            fontSize: '14px',
                            fontWeight: 700,
                            outline: 'none',
                            boxSizing: 'border-box',
                          }}
                        />
                      </div>
                      <div>
                        <span
                          style={{
                            display: 'block',
                            fontSize: '12px',
                            fontWeight: 800,
                            letterSpacing: '1.5px',
                            color: '#94a3b8',
                            marginBottom: '5px',
                            textTransform: 'uppercase',
                          }}
                        >
                          End
                        </span>
                        <input
                          type="date"
                          value={expirationEndDate}
                          onChange={(e) => setExpirationEndDate(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '9px 8px',
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(168,85,247,0.3)',
                            borderRadius: '8px',
                            color: '#e9d5ff',
                            fontSize: '14px',
                            fontWeight: 700,
                            outline: 'none',
                            boxSizing: 'border-box',
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Desktop: Redesigned Layout */}

              {!isMobileView && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    padding: '0 4px',
                  }}
                >
                  {/* Row 1: Options Type | Premium | Ticker Filter */}
                  <div
                    style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}
                  >
                    {/* OPTIONS TYPE */}
                    <div
                      style={{
                        background: '#000',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '12px',
                        padding: '14px',
                        boxShadow: '0 0 0 1px rgba(255,255,255,0.05), 0 8px 24px rgba(0,0,0,0.95)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          marginBottom: '12px',
                          paddingBottom: '8px',
                          borderBottom: '1px solid rgba(255,255,255,0.08)',
                        }}
                      >
                        <div
                          style={{
                            width: '3px',
                            height: '14px',
                            borderRadius: '2px',
                            background: 'linear-gradient(180deg, #10b981, #ef4444)',
                          }}
                        />
                        <span
                          style={{
                            fontSize: '13px',
                            fontWeight: 800,
                            letterSpacing: '2px',
                            textTransform: 'uppercase',
                            color: '#ffffff',
                          }}
                        >
                          Options Type
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {[
                          {
                            label: 'CALLS',
                            value: 'call',
                            color: '#10b981',
                            glow: 'rgba(16,185,129,0.25)',
                          },
                          {
                            label: 'PUTS',
                            value: 'put',
                            color: '#ef4444',
                            glow: 'rgba(239,68,68,0.25)',
                          },
                        ].map(({ label, value, color, glow }) => {
                          const active = selectedOptionTypes.includes(value)
                          return (
                            <button
                              key={value}
                              onClick={() =>
                                setSelectedOptionTypes((prev) =>
                                  active ? prev.filter((t) => t !== value) : [...prev, value]
                                )
                              }
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                padding: '10px 12px',
                                borderRadius: '8px',
                                border: `1px solid ${active ? color : 'rgba(255,255,255,0.08)'}`,
                                background: active
                                  ? `linear-gradient(135deg, ${color}25 0%, ${color}12 100%)`
                                  : 'rgba(255,255,255,0.02)',
                                boxShadow: active
                                  ? `0 0 14px ${glow}, inset 0 1px 0 rgba(255,255,255,0.08)`
                                  : 'none',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                width: '100%',
                              }}
                            >
                              <div
                                style={{
                                  width: '8px',
                                  height: '8px',
                                  borderRadius: '50%',
                                  background: active ? color : '#374151',
                                  boxShadow: active ? `0 0 6px ${color}` : 'none',
                                  transition: 'all 0.15s ease',
                                  flexShrink: 0,
                                }}
                              />
                              <span
                                style={{
                                  fontSize: '15px',
                                  fontWeight: 800,
                                  letterSpacing: '1.5px',
                                  color: active ? color : '#ffffff',
                                }}
                              >
                                {label}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                      <div
                        style={{
                          marginTop: '8px',
                          paddingTop: '8px',
                          borderTop: '1px solid rgba(255,255,255,0.07)',
                        }}
                      >
                        <span
                          style={{
                            display: 'block',
                            fontSize: '11px',
                            fontWeight: 800,
                            letterSpacing: '1.5px',
                            color: '#94a3b8',
                            marginBottom: '6px',
                            textTransform: 'uppercase',
                          }}
                        >
                          Order Side
                        </span>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {[
                            {
                              label: 'BUY (A/AA)',
                              value: 'buy',
                              color: '#22d3ee',
                              glow: 'rgba(34,211,238,0.25)',
                            },
                            {
                              label: 'SELL (B/BB)',
                              value: 'sell',
                              color: '#f97316',
                              glow: 'rgba(249,115,22,0.25)',
                            },
                          ].map(({ label, value, color, glow }) => {
                            const active = selectedOrderSides.includes(value)
                            return (
                              <button
                                key={value}
                                onClick={() =>
                                  setSelectedOrderSides((prev) =>
                                    active ? prev.filter((s) => s !== value) : [...prev, value]
                                  )
                                }
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '8px',
                                  padding: '9px 12px',
                                  borderRadius: '8px',
                                  border: `1px solid ${active ? color : 'rgba(255,255,255,0.08)'}`,
                                  background: active
                                    ? `linear-gradient(135deg, ${color}25 0%, ${color}12 100%)`
                                    : 'rgba(255,255,255,0.02)',
                                  boxShadow: active ? `0 0 14px ${glow}` : 'none',
                                  cursor: 'pointer',
                                  transition: 'all 0.15s ease',
                                  width: '100%',
                                }}
                              >
                                <div
                                  style={{
                                    width: '8px',
                                    height: '8px',
                                    borderRadius: '50%',
                                    background: active ? color : '#374151',
                                    boxShadow: active ? `0 0 6px ${color}` : 'none',
                                    transition: 'all 0.15s ease',
                                    flexShrink: 0,
                                  }}
                                />
                                <span
                                  style={{
                                    fontSize: '13px',
                                    fontWeight: 800,
                                    letterSpacing: '1px',
                                    color: active ? color : '#ffffff',
                                  }}
                                >
                                  {label}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    </div>

                    {/* PREMIUM */}
                    <div
                      style={{
                        background: '#000',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '12px',
                        padding: '14px',
                        boxShadow: '0 0 0 1px rgba(255,255,255,0.05), 0 8px 24px rgba(0,0,0,0.95)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          marginBottom: '12px',
                          paddingBottom: '8px',
                          borderBottom: '1px solid rgba(255,255,255,0.08)',
                        }}
                      >
                        <div
                          style={{
                            width: '3px',
                            height: '14px',
                            borderRadius: '2px',
                            background: 'linear-gradient(180deg, #10b981, #059669)',
                          }}
                        />
                        <span
                          style={{
                            fontSize: '13px',
                            fontWeight: 800,
                            letterSpacing: '2px',
                            textTransform: 'uppercase',
                            color: '#ffffff',
                          }}
                        >
                          Premium
                        </span>
                      </div>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr',
                          gap: '7px',
                          marginBottom: '10px',
                        }}
                      >
                        {[
                          { label: '≥ $50K', value: '50000' },
                          { label: '≥ $99K', value: '99000' },
                          { label: '≥ $200K', value: '200000' },
                          { label: '≥ $1M', value: '1000000' },
                        ].map(({ label, value }) => {
                          const active = selectedPremiumFilters.includes(value)
                          return (
                            <button
                              key={value}
                              onClick={() =>
                                setSelectedPremiumFilters((prev) =>
                                  active ? prev.filter((f) => f !== value) : [...prev, value]
                                )
                              }
                              style={{
                                padding: '10px 8px',
                                borderRadius: '8px',
                                border: `1px solid ${active ? '#10b981' : 'rgba(255,255,255,0.08)'}`,
                                background: active
                                  ? 'linear-gradient(135deg, rgba(16,185,129,0.2) 0%, rgba(16,185,129,0.08) 100%)'
                                  : 'rgba(255,255,255,0.02)',
                                boxShadow: active ? '0 0 12px rgba(16,185,129,0.2)' : 'none',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                fontSize: '14px',
                                fontWeight: 800,
                                letterSpacing: '0.5px',
                                color: active ? '#10b981' : '#ffffff',
                              }}
                            >
                              {label}
                            </button>
                          )
                        })}
                      </div>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr',
                          gap: '8px',
                          paddingTop: '10px',
                          borderTop: '1px solid rgba(255,255,255,0.08)',
                        }}
                      >
                        <div style={{ position: 'relative' }}>
                          <span
                            style={{
                              position: 'absolute',
                              left: '10px',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              fontSize: '12px',
                              color: '#94a3b8',
                              pointerEvents: 'none',
                              fontWeight: 700,
                            }}
                          >
                            MIN
                          </span>
                          <input
                            type="number"
                            value={customMinPremium}
                            onChange={(e) => setCustomMinPremium(e.target.value)}
                            placeholder="$0"
                            style={{
                              width: '100%',
                              paddingLeft: '40px',
                              paddingRight: '8px',
                              paddingTop: '10px',
                              paddingBottom: '10px',
                              background: '#000',
                              border: '1px solid rgba(255,255,255,0.15)',
                              borderRadius: '8px',
                              color: '#ffffff',
                              fontSize: '14px',
                              fontWeight: 700,
                              outline: 'none',
                              boxSizing: 'border-box',
                            }}
                          />
                        </div>
                        <div style={{ position: 'relative' }}>
                          <span
                            style={{
                              position: 'absolute',
                              left: '10px',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              fontSize: '12px',
                              color: '#94a3b8',
                              pointerEvents: 'none',
                              fontWeight: 700,
                            }}
                          >
                            MAX
                          </span>
                          <input
                            type="number"
                            value={customMaxPremium}
                            onChange={(e) => setCustomMaxPremium(e.target.value)}
                            placeholder="$∞"
                            style={{
                              width: '100%',
                              paddingLeft: '40px',
                              paddingRight: '8px',
                              paddingTop: '10px',
                              paddingBottom: '10px',
                              background: '#000',
                              border: '1px solid rgba(255,255,255,0.15)',
                              borderRadius: '8px',
                              color: '#ffffff',
                              fontSize: '14px',
                              fontWeight: 700,
                              outline: 'none',
                              boxSizing: 'border-box',
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* TICKER FILTER */}
                    <div
                      style={{
                        background: '#000',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '12px',
                        padding: '14px',
                        boxShadow: '0 0 0 1px rgba(255,255,255,0.05), 0 8px 24px rgba(0,0,0,0.95)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          marginBottom: '12px',
                          paddingBottom: '8px',
                          borderBottom: '1px solid rgba(255,255,255,0.08)',
                        }}
                      >
                        <div
                          style={{
                            width: '3px',
                            height: '14px',
                            borderRadius: '2px',
                            background: 'linear-gradient(180deg, #3b82f6, #1d4ed8)',
                          }}
                        />
                        <span
                          style={{
                            fontSize: '13px',
                            fontWeight: 800,
                            letterSpacing: '2px',
                            textTransform: 'uppercase',
                            color: '#ffffff',
                          }}
                        >
                          Ticker Filter
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                        {[
                          { label: 'ETF Only', value: 'ETF_ONLY' },
                          { label: 'Stock Only', value: 'STOCK_ONLY' },
                          { label: 'Mag 7 Only', value: 'MAG7_ONLY' },
                          { label: 'Exclude Mag 7', value: 'EXCLUDE_MAG7' },
                        ].map(({ label, value }) => {
                          const active = selectedTickerFilters.includes(value)
                          return (
                            <button
                              key={value}
                              onClick={() =>
                                setSelectedTickerFilters((prev) =>
                                  active ? prev.filter((f) => f !== value) : [...prev, value]
                                )
                              }
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '9px 10px',
                                borderRadius: '8px',
                                border: `1px solid ${active ? '#3b82f6' : 'rgba(255,255,255,0.07)'}`,
                                background: active
                                  ? 'rgba(59,130,246,0.12)'
                                  : 'rgba(255,255,255,0.02)',
                                boxShadow: active ? '0 0 10px rgba(59,130,246,0.2)' : 'none',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                width: '100%',
                              }}
                            >
                              <div
                                style={{
                                  width: '7px',
                                  height: '7px',
                                  borderRadius: '50%',
                                  background: active ? '#3b82f6' : '#374151',
                                  boxShadow: active ? '0 0 5px #3b82f6' : 'none',
                                  flexShrink: 0,
                                }}
                              />
                              <span
                                style={{
                                  fontSize: '14px',
                                  fontWeight: 800,
                                  letterSpacing: '0.5px',
                                  color: active ? '#93c5fd' : '#ffffff',
                                }}
                              >
                                {label}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Row 2: Unique Filters | Black List | Options Expiration */}
                  <div
                    style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}
                  >
                    {/* UNIQUE FILTERS */}
                    <div
                      style={{
                        background: '#000',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '12px',
                        padding: '14px',
                        boxShadow: '0 0 0 1px rgba(255,255,255,0.05), 0 8px 24px rgba(0,0,0,0.95)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          marginBottom: '12px',
                          paddingBottom: '8px',
                          borderBottom: '1px solid rgba(255,255,255,0.08)',
                        }}
                      >
                        <div
                          style={{
                            width: '3px',
                            height: '14px',
                            borderRadius: '2px',
                            background: 'linear-gradient(180deg, #f59e0b, #fbbf24)',
                          }}
                        />
                        <span
                          style={{
                            fontSize: '13px',
                            fontWeight: 800,
                            letterSpacing: '2px',
                            textTransform: 'uppercase',
                            color: '#ffffff',
                          }}
                        >
                          Unique Filters
                        </span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px' }}>
                        {[
                          { label: 'ITM', value: 'ITM', color: '#f59e0b' },
                          { label: 'OTM', value: 'OTM', color: '#f59e0b' },
                          { label: 'Sweep Only', value: 'SWEEP_ONLY', color: '#f59e0b' },
                          { label: 'Block Only', value: 'BLOCK_ONLY', color: '#f59e0b' },
                          { label: 'Multi-Leg', value: 'MULTI_LEG_ONLY', color: '#a855f7' },
                          { label: 'Weekly', value: 'WEEKLY_ONLY', color: '#f59e0b' },
                          { label: 'Mini Only', value: 'MINI_ONLY', color: '#10b981' },
                        ].map(({ label, value, color }) => {
                          const active = selectedUniqueFilters.includes(value)
                          return (
                            <button
                              key={value}
                              onClick={() =>
                                setSelectedUniqueFilters((prev) =>
                                  active ? prev.filter((f) => f !== value) : [...prev, value]
                                )
                              }
                              style={{
                                padding: '9px 6px',
                                borderRadius: '8px',
                                border: `1px solid ${active ? color : 'rgba(255,255,255,0.07)'}`,
                                background: active ? `${color}18` : 'rgba(255,255,255,0.02)',
                                boxShadow: active ? `0 0 10px ${color}33` : 'none',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                fontSize: '13px',
                                fontWeight: 800,
                                letterSpacing: '0.5px',
                                color: active ? color : '#ffffff',
                              }}
                            >
                              {label}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* BLACK LIST */}
                    <div
                      style={{
                        background: '#000',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '12px',
                        padding: '14px',
                        boxShadow: '0 0 0 1px rgba(255,255,255,0.05), 0 8px 24px rgba(0,0,0,0.95)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          marginBottom: '12px',
                          paddingBottom: '8px',
                          borderBottom: '1px solid rgba(255,255,255,0.08)',
                        }}
                      >
                        <div
                          style={{
                            width: '3px',
                            height: '14px',
                            borderRadius: '2px',
                            background: 'linear-gradient(180deg, #ef4444, #b91c1c)',
                          }}
                        />
                        <span
                          style={{
                            fontSize: '13px',
                            fontWeight: 800,
                            letterSpacing: '2px',
                            textTransform: 'uppercase',
                            color: '#ffffff',
                          }}
                        >
                          Black List
                        </span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px' }}>
                        {blacklistedTickers.map((ticker, index) => (
                          <input
                            key={index}
                            type="text"
                            value={ticker}
                            onChange={(e) => {
                              const t = [...blacklistedTickers]
                              t[index] = e.target.value.toUpperCase()
                              setBlacklistedTickers(t)
                            }}
                            placeholder={`#${index + 1}`}
                            maxLength={6}
                            style={{
                              padding: '9px 8px',
                              textAlign: 'center',
                              background: '#000',
                              border: '1px solid rgba(239,68,68,0.3)',
                              borderRadius: '8px',
                              color: '#fca5a5',
                              fontSize: '14px',
                              fontWeight: 800,
                              letterSpacing: '1px',
                              outline: 'none',
                              width: '100%',
                              boxSizing: 'border-box',
                            }}
                          />
                        ))}
                      </div>
                    </div>

                    {/* OPTIONS EXPIRATION */}
                    <div
                      style={{
                        background: '#000',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '12px',
                        padding: '14px',
                        boxShadow: '0 0 0 1px rgba(255,255,255,0.05), 0 8px 24px rgba(0,0,0,0.95)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          marginBottom: '12px',
                          paddingBottom: '8px',
                          borderBottom: '1px solid rgba(255,255,255,0.08)',
                        }}
                      >
                        <div
                          style={{
                            width: '3px',
                            height: '14px',
                            borderRadius: '2px',
                            background: 'linear-gradient(180deg, #a855f7, #7c3aed)',
                          }}
                        />
                        <span
                          style={{
                            fontSize: '13px',
                            fontWeight: 800,
                            letterSpacing: '2px',
                            textTransform: 'uppercase',
                            color: '#ffffff',
                          }}
                        >
                          Options Expiration
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div>
                          <span
                            style={{
                              display: 'block',
                              fontSize: '12px',
                              fontWeight: 800,
                              letterSpacing: '1.5px',
                              color: '#94a3b8',
                              marginBottom: '6px',
                              textTransform: 'uppercase',
                            }}
                          >
                            Start Date
                          </span>
                          <input
                            type="date"
                            value={expirationStartDate}
                            onChange={(e) => setExpirationStartDate(e.target.value)}
                            style={{
                              width: '100%',
                              padding: '10px 10px',
                              background: '#000',
                              border: '1px solid rgba(168,85,247,0.3)',
                              borderRadius: '8px',
                              color: '#e9d5ff',
                              fontSize: '14px',
                              fontWeight: 700,
                              outline: 'none',
                              boxSizing: 'border-box',
                            }}
                          />
                        </div>
                        <div>
                          <span
                            style={{
                              display: 'block',
                              fontSize: '12px',
                              fontWeight: 800,
                              letterSpacing: '1.5px',
                              color: '#94a3b8',
                              marginBottom: '6px',
                              textTransform: 'uppercase',
                            }}
                          >
                            End Date
                          </span>
                          <input
                            type="date"
                            value={expirationEndDate}
                            onChange={(e) => setExpirationEndDate(e.target.value)}
                            style={{
                              width: '100%',
                              padding: '10px 10px',
                              background: '#000',
                              border: '1px solid rgba(168,85,247,0.3)',
                              borderRadius: '8px',
                              color: '#e9d5ff',
                              fontSize: '14px',
                              fontWeight: 700,
                              outline: 'none',
                              boxSizing: 'border-box',
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div
                className="flex justify-between items-center mt-6 pt-4"
                style={{ borderTop: '1px solid rgba(255,255,255,0.06)', gap: '10px' }}
              >
                <button
                  onClick={() => {
                    setSelectedOptionTypes([])
                    setSelectedPremiumFilters([])
                    setSelectedTickerFilters([])
                    setSelectedUniqueFilters([])
                    setCustomMinPremium('')
                    setCustomMaxPremium('')
                    setExpirationStartDate('')
                    setExpirationEndDate('')
                    setBlacklistedTickers(['', '', '', '', '', '', '', '', '', ''])
                    setSelectedOrderSides([])
                  }}
                  style={{
                    flex: 1,
                    padding: '12px',
                    background: '#111',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: '10px',
                    color: '#ffffff',
                    fontSize: '16px',
                    fontWeight: 800,
                    letterSpacing: '1.5px',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.4)')
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)')
                  }
                >
                  Clear All
                </button>

                <Button
                  onClick={() => setIsFilterDialogOpen(false)}
                  style={{
                    flex: 2,
                    padding: '12px',
                    background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                    border: 'none',
                    borderRadius: '10px',
                    color: '#fff',
                    fontSize: '16px',
                    fontWeight: 800,
                    letterSpacing: '1.5px',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(249,115,22,0.35)',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(1.1)')}
                  onMouseLeave={(e) => (e.currentTarget.style.filter = 'brightness(1)')}
                >
                  Apply Filters
                </Button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* History Dialog Modal */}

      {isHistoryDialogOpen && (
        <>
          {/* Backdrop */}

          <div
            className="fixed inset-0 z-[9998] bg-black/70"
            onClick={() => setIsHistoryDialogOpen(false)}
          />

          {/* Modal Content */}

          <div
            className="fixed left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[9999] w-[92%] max-w-xl max-h-[80vh] overflow-hidden flex flex-col"
            style={{
              background: '#000000',
              border: '1px solid #ff6600',
              fontFamily: '"SF Mono", "Courier New", monospace',
            }}
          >
            {/* Header */}
            <div
              style={{
                borderBottom: '1px solid #ff6600',
                padding: '16px 16px',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {/* Centered title */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span
                  style={{
                    fontSize: '29px',
                    fontWeight: 900,
                    letterSpacing: '6px',
                    textTransform: 'uppercase',
                    background:
                      'linear-gradient(180deg, #ffffff 0%, #ff6600 40%, #ff3300 70%, #aa2200 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  FLOW HISTORY
                </span>
              </div>
              {/* ESC pinned to right */}
              <button
                onClick={() => setIsHistoryDialogOpen(false)}
                style={{
                  position: 'absolute',
                  right: '16px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: '1px solid #333',
                  color: '#888',
                  fontSize: '14px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  cursor: 'pointer',
                  letterSpacing: '1px',
                }}
              >
                ESC
              </button>
            </div>

            {/* Body */}
            <div style={{ overflowY: 'auto', flex: 1, padding: '8px' }}>
              {savedFlowDates.length === 0 ? (
                <div
                  style={{
                    padding: '40px',
                    textAlign: 'center',
                    color: '#444',
                    fontSize: '11px',
                    letterSpacing: '2px',
                  }}
                >
                  NO SAVED SESSIONS
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {savedFlowDates.map((flow, i) => {
                    const d = new Date(flow.date)
                    const localDate = new Date(
                      d.getUTCFullYear(),
                      d.getUTCMonth(),
                      d.getUTCDate(),
                      12
                    )
                    const dateLabel = localDate.toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })
                    const timeLabel = new Date(flow.createdAt).toLocaleTimeString('en-US', {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true,
                    })
                    const tradeCount: number | null = (flow as any).tradeCount ?? null
                    return (
                      <div
                        key={flow.date}
                        style={{
                          background: '#0a0a0a',
                          border: '1px solid #1a1a1a',
                          padding: '10px 14px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '12px',
                        }}
                      >
                        {/* Left: date + meta */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              color: '#ffffff',
                              fontSize: '15px',
                              fontWeight: 700,
                              letterSpacing: '0.5px',
                              marginBottom: '4px',
                            }}
                          >
                            {dateLabel}
                          </div>
                          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                            <span
                              style={{
                                color: '#ff6600',
                                fontSize: '12px',
                                fontWeight: 700,
                                letterSpacing: '1px',
                              }}
                            >
                              {tradeCount != null
                                ? `${tradeCount.toLocaleString()} TRADES`
                                : '— TRADES'}
                            </span>
                            <span
                              style={{
                                color: '#00e5ff',
                                fontSize: '12px',
                                fontWeight: 700,
                                letterSpacing: '0.5px',
                              }}
                            >
                              SAVED {timeLabel}
                            </span>
                          </div>
                        </div>

                        {/* Right: actions */}
                        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                          <button
                            onClick={() => handleDownloadFlowExcel(flow.date, dateLabel)}
                            title="Download as Excel"
                            style={{
                              background: 'rgba(0,229,100,0.12)',
                              color: '#00e564',
                              border: '1px solid rgba(0,229,100,0.35)',
                              padding: '6px 12px',
                              fontSize: '11px',
                              fontWeight: 700,
                              letterSpacing: '1.5px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '5px',
                            }}
                          >
                            ↓ XLS
                          </button>
                          <button
                            onClick={() => handleLoadFlow(flow.date)}
                            disabled={loadingFlowDate === flow.date}
                            style={{
                              background: '#ff6600',
                              color: '#000',
                              border: 'none',
                              padding: '6px 14px',
                              fontSize: '11px',
                              fontWeight: 700,
                              letterSpacing: '1.5px',
                              cursor: 'pointer',
                              opacity: loadingFlowDate === flow.date ? 0.6 : 1,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                            }}
                          >
                            {loadingFlowDate === flow.date ? (
                              <>
                                <svg
                                  className="w-3 h-3 animate-spin"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                >
                                  <circle
                                    className="opacity-25"
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    strokeWidth="4"
                                  ></circle>
                                  <path
                                    className="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                  ></path>
                                </svg>
                                LOADING
                              </>
                            ) : (
                              'LOAD'
                            )}
                          </button>
                          <button
                            onClick={() => handleDeleteFlow(flow.date)}
                            style={{
                              background: 'transparent',
                              color: '#555',
                              border: '1px solid #222',
                              padding: '6px 10px',
                              fontSize: '11px',
                              fontWeight: 700,
                              letterSpacing: '1px',
                              cursor: 'pointer',
                            }}
                            onMouseEnter={(e) => {
                              ; (e.currentTarget as HTMLButtonElement).style.borderColor = '#ff3333'
                                ; (e.currentTarget as HTMLButtonElement).style.color = '#ff3333'
                            }}
                            onMouseLeave={(e) => {
                              ; (e.currentTarget as HTMLButtonElement).style.borderColor = '#222'
                                ; (e.currentTarget as HTMLButtonElement).style.color = '#555'
                            }}
                          >
                            DEL
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <div
        ref={captureRef}
        className={`bg-black flex flex-col ${isFlowTrackingOpen ? 'md:flex hidden' : 'flex'}`}
        style={{
          minHeight: showFlowTrackingInline ? 'auto' : '100vh',

          width: isSidebarPanel ? '100%' : isMobileView ? '100%' : '74%',

          marginRight: isSidebarPanel || isMobileView ? '0' : '26%',

          marginTop: '0',

          display: showFlowTrackingInline ? 'none' : undefined,
        }}
      >
        {/* Premium Control Bar */}

        <div
          className="bg-black border-b border-gray-700 flex-shrink-0"
          style={{
            position: 'relative',

            zIndex: 1001,

            width: '100%',

            overflow: 'visible',

            marginTop: isSidebarPanel ? '0' : '-52px',
          }}
        >
          {/* Mobile Layout - 2 Rows */}

          <div className="md:hidden px-4 py-0">
            {/* Row 1: Search, Highlights, Clear, Filter, Track */}

            <div className="flex items-center gap-3">
              {/* Search Bar */}

              <div
                className="relative"
                style={{
                  width: efiHighlightsActive ? '90px' : '150px',
                  flexShrink: 0,
                  transition: 'width 0.2s',
                }}
              >
                <div className="absolute left-3 top-1/2 transform -translate-y-1/2 z-10 pointer-events-none">
                  <svg
                    className="w-4 h-4 text-orange-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={2.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </div>

                <input
                  type="text"
                  value={inputTicker}
                  onChange={(e) => setInputTicker(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && inputTicker.trim()) {
                      const ticker = inputTicker.trim()

                      onTickerChange(ticker)

                      onRefresh?.(ticker)
                    }
                  }}
                  placeholder="TICKER"
                  className="text-white font-mono placeholder-gray-500 transition-all duration-200 w-full"
                  style={{
                    height: '40px',

                    paddingLeft: '2rem',

                    paddingRight: '0.5rem',

                    borderRadius: '4px',

                    fontSize: '12px',

                    fontWeight: '700',

                    letterSpacing: '1px',

                    background: 'linear-gradient(180deg, #000000 0%, #0a0a0a 100%)',

                    border: '2px solid #1f1f1f',

                    textTransform: 'uppercase',

                    boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.9)',

                    outline: 'none',
                  }}
                  maxLength={20}
                />
              </div>

              {/* Right side buttons */}

              <div className="flex items-center gap-2">
                {/* Highlights Button */}

                <button
                  onClick={async () => {
                    const newState = !efiHighlightsActive
                    setEfiHighlightsActive(newState)
                    if (newState) {
                      const efiTrades = filteredAndSortedData.filter(meetsEfiCriteria)
                      const rsData = await calculateRelativeStrength(efiTrades)
                      setRelativeStrengthData(rsData)
                    }
                  }}
                  className="px-2 text-white font-black uppercase transition-all duration-200 flex items-center gap-1 hover:scale-[1.02] active:scale-[0.98] focus:outline-none"
                  style={{
                    height: '40px',

                    background: efiHighlightsActive
                      ? 'linear-gradient(180deg, #ff9500 0%, #ff8500 50%, #ff7500 100%)'
                      : 'linear-gradient(180deg, #1a1a1a 0%, #000000 50%, #000000 100%)',

                    border: efiHighlightsActive ? '1px solid #ffaa00' : '2px solid #2a2a2a',

                    borderRadius: '4px',

                    fontSize: '10px',

                    letterSpacing: '0.5px',

                    fontWeight: '900',

                    boxShadow: efiHighlightsActive
                      ? 'inset 0 1px 0 rgba(255, 255, 255, 0.4), inset 0 -2px 0 rgba(0, 0, 0, 0.3)'
                      : 'inset 0 2px 8px rgba(0, 0, 0, 0.9)',
                  }}
                >
                  <svg
                    className={`w-3 h-3 transition-all duration-200 ${efiHighlightsActive ? 'text-black' : 'text-orange-500'}`}
                    fill={efiHighlightsActive ? 'currentColor' : 'none'}
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                    />
                  </svg>

                  <span style={{ color: efiHighlightsActive ? '#000000' : '#ffffff' }}>
                    HIGHLIGHTS
                  </span>
                </button>

                {/* Notable Button - mobile, shown when EFI Highlights active */}
                {efiHighlightsActive && (
                  <button
                    onClick={() => setNotableFilterActive(!notableFilterActive)}
                    className="px-2 font-black uppercase transition-all duration-200 flex items-center hover:scale-[1.02] active:scale-[0.98] focus:outline-none"
                    style={{
                      height: '40px',
                      background: notableFilterActive
                        ? 'linear-gradient(180deg, #FFD700 0%, #FFA500 100%)'
                        : 'linear-gradient(180deg, #1a1a1a 0%, #000000 100%)',
                      border: notableFilterActive ? '2px solid #FFD700' : '2px solid #2a2a2a',
                      borderRadius: '4px',
                      fontSize: '10px',
                      letterSpacing: '0.5px',
                      fontWeight: '900',
                      boxShadow: notableFilterActive
                        ? '0 0 10px rgba(255, 215, 0, 0.5), inset 0 2px 8px rgba(0, 0, 0, 0.3)'
                        : 'inset 0 2px 8px rgba(0, 0, 0, 0.9)',
                      color: notableFilterActive ? '#000000' : '#FFD700',
                    }}
                  >
                    NOTABLE
                  </button>
                )}

                {/* Filter Button */}

                <button
                  onClick={() => {
                    setIsFilterDialogOpen(true)
                  }}
                  className="px-2 text-white font-black uppercase transition-all duration-200 flex items-center gap-1 hover:scale-[1.02] active:scale-[0.98] focus:outline-none"
                  style={{
                    height: '40px',

                    background: 'linear-gradient(180deg, #1a1a1a 0%, #000000 50%, #000000 100%)',

                    border: '2px solid #ff8500',

                    borderRadius: '4px',

                    fontSize: '10px',

                    letterSpacing: '0.5px',

                    fontWeight: '900',

                    boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.9)',
                  }}
                >
                  <svg
                    className="w-3 h-3 text-orange-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={2.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                    />
                  </svg>

                  <span>FILTER</span>
                </button>

                {/* Flow Tracking Button */}

                <button
                  onClick={() => setIsFlowTrackingOpen(!isFlowTrackingOpen)}
                  className={`px-2 text-white font-black uppercase transition-all duration-200 flex items-center gap-1 hover:scale-[1.02] active:scale-[0.98] focus:outline-none`}
                  style={{
                    height: '40px',

                    background: isFlowTrackingOpen
                      ? 'linear-gradient(180deg, #10b981 0%, #059669 100%)'
                      : 'linear-gradient(180deg, #1a1a1a 0%, #000000 50%, #000000 100%)',

                    border: isFlowTrackingOpen ? '2px solid #10b981' : '2px solid #6b7280',

                    borderRadius: '4px',

                    fontSize: '10px',

                    letterSpacing: '0.5px',

                    fontWeight: '900',

                    boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.9)',
                  }}
                >
                  <svg
                    className="w-3 h-3 text-green-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={2.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                    />
                  </svg>

                  <span>TRACK</span>
                </button>

                {/* Mobile Dropdown Menu - Replace trash icon */}

                <div className="relative">
                  <button
                    onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                    disabled={loading}
                    className={`px-2 text-white font-black uppercase transition-all duration-200 flex items-center justify-center focus:outline-none ${loading
                      ? 'cursor-not-allowed opacity-40'
                      : 'hover:scale-[1.02] active:scale-[0.98]'
                      }`}
                    style={{
                      height: '40px',

                      width: '40px',

                      background: 'linear-gradient(180deg, #1a1a1a 0%, #000000 50%, #000000 100%)',

                      border: '2px solid #6b7280',

                      borderRadius: '4px',

                      boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.9)',
                    }}
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                    </svg>
                  </button>

                  {/* Dropdown Menu */}

                  {mobileMenuOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-[9998]"
                        onClick={() => setMobileMenuOpen(false)}
                      />

                      <div
                        className="fixed z-[99999]"
                        style={{
                          top: '190px',
                          right: '8px',
                          width: '134px',
                          background: '#000',
                          border: '2px solid #f97316',
                          borderRadius: '6px',
                          boxShadow: '0 8px 32px rgba(0,0,0,0.9)',
                        }}
                      >
                        {/* SAVE */}
                        <button
                          onClick={() => {
                            handleSaveFlow()
                            setMobileMenuOpen(false)
                          }}
                          disabled={savingFlow || !data || data.length === 0}
                          className="w-full flex items-center justify-center gap-3 group disabled:opacity-40 disabled:cursor-not-allowed"
                          style={{
                            background: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)',
                            color: '#fff',
                            fontWeight: 900,
                            fontSize: '16px',
                            padding: '13px 10px',
                            borderBottom: '1px solid #1e3a8a',
                            letterSpacing: '1px',
                            transition: 'filter 0.15s ease',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(1.15)')}
                          onMouseLeave={(e) => (e.currentTarget.style.filter = 'brightness(1)')}
                          onMouseDown={(e) => (e.currentTarget.style.filter = 'brightness(0.9)')}
                          onMouseUp={(e) => (e.currentTarget.style.filter = 'brightness(1.15)')}
                        >
                          <svg
                            style={{
                              width: '20px',
                              height: '20px',
                              transition: 'transform 0.2s ease',
                            }}
                            className="group-hover:-translate-y-0.5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            strokeWidth={2.2}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"
                            />
                            <polyline
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              points="17 21 17 13 7 13 7 21"
                            />
                            <polyline
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              points="7 3 7 8 15 8"
                            />
                          </svg>
                          <span>SAVE</span>
                        </button>

                        {/* HISTORY */}
                        <button
                          onClick={() => {
                            loadFlowHistory()
                            setMobileMenuOpen(false)
                          }}
                          disabled={loadingHistory}
                          className="w-full flex items-center justify-center gap-3 group disabled:opacity-40 disabled:cursor-not-allowed"
                          style={{
                            background: 'linear-gradient(135deg, #f0f0f0 0%, #e5e7eb 100%)',
                            color: '#111',
                            fontWeight: 900,
                            fontSize: '16px',
                            padding: '13px 10px',
                            borderBottom: '1px solid #9ca3af',
                            letterSpacing: '1px',
                            transition: 'filter 0.15s ease',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(0.93)')}
                          onMouseLeave={(e) => (e.currentTarget.style.filter = 'brightness(1)')}
                          onMouseDown={(e) => (e.currentTarget.style.filter = 'brightness(0.85)')}
                          onMouseUp={(e) => (e.currentTarget.style.filter = 'brightness(0.93)')}
                        >
                          <svg
                            style={{
                              width: '20px',
                              height: '20px',
                              transition: 'transform 0.2s ease',
                            }}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            strokeWidth={2.2}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                          <span>HISTORY</span>
                        </button>

                        {/* CLEAR */}
                        {onClearData && (
                          <button
                            onClick={() => {
                              onClearData()
                              setMobileMenuOpen(false)
                            }}
                            disabled={loading}
                            className="w-full flex items-center justify-center gap-3 group disabled:opacity-40 disabled:cursor-not-allowed"
                            style={{
                              background: 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)',
                              color: '#fff',
                              fontWeight: 900,
                              fontSize: '16px',
                              padding: '13px 10px',
                              borderRadius: '0 0 6px 6px',
                              letterSpacing: '1px',
                              transition: 'filter 0.15s ease',
                            }}
                            onMouseEnter={(e) =>
                              (e.currentTarget.style.filter = 'brightness(1.15)')
                            }
                            onMouseLeave={(e) => (e.currentTarget.style.filter = 'brightness(1)')}
                            onMouseDown={(e) => (e.currentTarget.style.filter = 'brightness(0.9)')}
                            onMouseUp={(e) => (e.currentTarget.style.filter = 'brightness(1.15)')}
                          >
                            <svg
                              style={{
                                width: '20px',
                                height: '20px',
                                transition: 'transform 0.2s ease',
                              }}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              strokeWidth={2.2}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                            <span>CLEAR</span>
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* Save Button */}

                <button
                  onClick={handleSaveFlow}
                  disabled={savingFlow || !data || data.length === 0}
                  className={`hidden md:flex px-2 text-white font-black uppercase transition-all duration-200 items-center gap-1 focus:outline-none ${savingFlow || !data || data.length === 0
                    ? 'cursor-not-allowed opacity-40'
                    : 'hover:scale-[1.02] active:scale-[0.98]'
                    }`}
                  style={{
                    height: '40px',

                    background: 'linear-gradient(180deg, #1a1a1a 0%, #000000 50%, #000000 100%)',

                    border: '2px solid #3b82f6',

                    borderRadius: '4px',

                    fontSize: '10px',

                    letterSpacing: '0.5px',

                    fontWeight: '900',

                    boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.9)',
                  }}
                >
                  {savingFlow ? (
                    <svg
                      className="w-3 h-3 text-blue-400 animate-spin"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>

                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                  ) : (
                    <svg
                      className="w-3 h-3 text-blue-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      strokeWidth={2.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
                      />
                    </svg>
                  )}

                  <span
                    style={{
                      color:
                        saveStatus === 'success'
                          ? '#22c55e'
                          : saveStatus === 'error'
                            ? '#ef4444'
                            : undefined,
                    }}
                  >
                    {savingFlow
                      ? 'SAVING...'
                      : saveStatus === 'success'
                        ? 'SAVED ✓'
                        : saveStatus === 'error'
                          ? 'ERROR ✗'
                          : 'SAVE'}
                  </span>
                </button>
                {saveStatus === 'error' && saveErrorMsg && (
                  <span
                    style={{
                      fontSize: '9px',
                      color: '#ef4444',
                      maxWidth: '120px',
                      lineHeight: 1.2,
                    }}
                  >
                    {saveErrorMsg}
                  </span>
                )}

                {/* History Button */}

                {/* Download as Image Button */}

                <button
                  onClick={handleDownloadImage}
                  className="hidden md:flex px-2 text-white font-black uppercase transition-all duration-200 items-center gap-1 focus:outline-none hover:scale-[1.02] active:scale-[0.98]"
                  style={{
                    height: '40px',
                    background: 'linear-gradient(180deg, #1a1a1a 0%, #000000 50%, #000000 100%)',
                    border: '2px solid #22c55e',
                    borderRadius: '4px',
                    fontSize: '10px',
                    letterSpacing: '0.5px',
                    fontWeight: '900',
                    boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.9)',
                  }}
                  title="Download page as image"
                >
                  <svg
                    className="w-3 h-3 text-green-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={2.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  <span style={{ color: '#22c55e' }}>IMG</span>
                </button>

                <button
                  onClick={loadFlowHistory}
                  disabled={loadingHistory}
                  className={`hidden md:flex px-2 text-white font-black uppercase transition-all duration-200 items-center gap-1 focus:outline-none ${loadingHistory
                    ? 'cursor-not-allowed opacity-40'
                    : 'hover:scale-[1.02] active:scale-[0.98]'
                    }`}
                  style={{
                    height: '40px',

                    background: 'linear-gradient(180deg, #1a1a1a 0%, #000000 50%, #000000 100%)',

                    border: '2px solid #8b5cf6',

                    borderRadius: '4px',

                    fontSize: '10px',

                    letterSpacing: '0.5px',

                    fontWeight: '900',

                    boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.9)',
                  }}
                >
                  {loadingHistory ? (
                    <svg
                      className="w-3 h-3 text-purple-400 animate-spin"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>

                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                  ) : (
                    <svg
                      className="w-3 h-3 text-purple-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      strokeWidth={2.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  )}

                  <span>{loadingHistory ? 'LOADING...' : 'HISTORY'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Desktop Layout - Single Row */}

          <div
            className="hidden md:block px-8 py-0 bg-black"
            style={{
              width: '100%',

              overflow: 'visible',

              background: 'linear-gradient(180deg, #0d0d0d 0%, #000000 100%)',

              borderBottom: '1px solid #ff8500',

              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 133, 0, 0.1)',
            }}
          >
            <div
              className="control-bar flex items-center justify-between"
              style={{ width: '100%', maxWidth: '1800px' }}
            >
              <div className="flex items-center gap-3" style={{ flexShrink: 0 }}>
                {/* Compact Search Bar */}

                <div className="relative" style={{ width: '160px' }}>
                  <div className="absolute left-3 top-1/2 transform -translate-y-1/2 z-10 pointer-events-none">
                    <svg
                      className="w-5 h-5 text-orange-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      strokeWidth={2.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                  </div>

                  <input
                    type="text"
                    value={inputTicker}
                    onChange={(e) => setInputTicker(e.target.value.toUpperCase())}
                    onFocus={(e) => {
                      setIsInputFocused(true)

                      e.target.style.border = '2px solid #ff8500'

                      e.target.style.boxShadow = 'inset 0 2px 8px rgba(0, 0, 0, 0.9)'
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && inputTicker.trim()) {
                        const ticker = inputTicker.trim()

                        onTickerChange(ticker)

                        onRefresh?.(ticker)

                        setIsInputFocused(false)
                      }
                    }}
                    onBlur={(e) => {
                      setIsInputFocused(false)

                      e.target.style.border = '2px solid #1f1f1f'

                      e.target.style.boxShadow = 'inset 0 2px 8px rgba(0, 0, 0, 0.9)'
                    }}
                    placeholder="TICKER"
                    className="text-white font-mono placeholder-gray-500 transition-all duration-200"
                    style={{
                      width: '100%',

                      height: '48px',

                      paddingLeft: '2.5rem',

                      paddingRight: '1rem',

                      borderRadius: '4px',

                      fontSize: '14px',

                      fontWeight: '700',

                      letterSpacing: '1.2px',

                      background: 'linear-gradient(180deg, #000000 0%, #0a0a0a 100%)',

                      border: '2px solid #1f1f1f',

                      textTransform: 'uppercase',

                      boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.9)',

                      outline: 'none',
                    }}
                    maxLength={20}
                  />
                </div>

                {/* Historical Days Dropdown */}
                {onHistoricalDaysChange && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', color: '#555', textTransform: 'uppercase', fontFamily: '"JetBrains Mono",monospace', paddingLeft: 2 }}>
                      HIST DAYS
                    </span>
                    <select
                      value={historicalDays}
                      onChange={(e) => onHistoricalDaysChange(e.target.value)}
                      style={{
                        height: 36,
                        padding: '0 10px',
                        background: historicalDays !== '1D' ? 'rgba(255,133,0,0.12)' : '#0a0a0a',
                        border: `1px solid ${historicalDays !== '1D' ? '#ff8500' : '#2a2a2a'}`,
                        color: historicalDays !== '1D' ? '#ff8500' : '#888',
                        fontSize: 12,
                        fontWeight: 700,
                        letterSpacing: '0.1em',
                        fontFamily: '"JetBrains Mono",monospace',
                        cursor: 'pointer',
                        borderRadius: 3,
                        outline: 'none',
                        minWidth: 90,
                      }}
                    >
                      <option value="1D">TODAY</option>
                      <option value="2">2 DAYS</option>
                      <option value="3">3 DAYS</option>
                      <option value="4">4 DAYS</option>
                      <option value="5">5 DAYS</option>
                      <option value="7">7 DAYS</option>
                      <option value="10">10 DAYS</option>
                      <option value="14">14 DAYS</option>
                      <option value="20">20 DAYS</option>
                      <option value="30">30 DAYS</option>
                      <option value="45">45 DAYS</option>
                      <option value="60">60 DAYS</option>
                      <option value="90">90 DAYS</option>
                      <option value="126">126 DAYS</option>
                      <option value="189">189 DAYS</option>
                      <option value="252">252 DAYS</option>
                    </select>
                  </div>
                )}

                {/* Scan Shortcuts */}

                <div className="hidden md:flex items-center gap-2">
                  {useDropdowns ? (
                    <select
                      value={selectedOptionTypes.length === 1 ? selectedOptionTypes[0] : 'both'}
                      onChange={(e) => {
                        if (e.target.value === 'both') {
                          setSelectedOptionTypes(['call', 'put'])
                        } else {
                          setSelectedOptionTypes([e.target.value])
                        }
                      }}
                      className="font-black uppercase transition-all duration-200 cursor-pointer"
                      style={{
                        height: '40px',
                        padding: '0 34px 0 14px',
                        background: '#000000',
                        border: '1px solid #383838',
                        borderRadius: '7px',
                        fontSize: '16px',
                        letterSpacing: '1.5px',
                        fontWeight: '900',
                        outline: 'none',
                        color: '#ffffff',
                        cursor: 'pointer',
                        appearance: 'none',
                        WebkitAppearance: 'none',
                        boxShadow:
                          '0 4px 12px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.07), inset 0 -1px 0 rgba(0,0,0,0.5)',
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23888' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'right 11px center',
                      }}
                    >
                      <option
                        value="both"
                        style={{ background: '#000000', color: '#ffffff', fontWeight: '900' }}
                      >
                        BOTH
                      </option>
                      <option
                        value="call"
                        style={{ background: '#000000', color: '#84cc16', fontWeight: '900' }}
                      >
                        CALLS
                      </option>
                      <option
                        value="put"
                        style={{ background: '#000000', color: '#dc2626', fontWeight: '900' }}
                      >
                        PUTS
                      </option>
                    </select>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setSelectedOptionTypes(['call'])
                        }}
                        className="px-4 font-bold uppercase transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                        style={{
                          height: '48px',

                          background: 'linear-gradient(180deg, #1a1a1a 0%, #000000 100%)',

                          border: '2px solid #2a2a2a',

                          borderRadius: '4px',

                          fontSize: '15px',

                          letterSpacing: '1.2px',

                          fontWeight: '900',

                          boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.9)',

                          outline: 'none',

                          color: '#84cc16',
                        }}
                      >
                        CALLS
                      </button>

                      <button
                        onClick={() => {
                          setSelectedOptionTypes(['put'])
                        }}
                        className="px-4 font-bold uppercase transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                        style={{
                          height: '48px',

                          background: 'linear-gradient(180deg, #1a1a1a 0%, #000000 100%)',

                          border: '2px solid #2a2a2a',

                          borderRadius: '4px',

                          fontSize: '15px',

                          letterSpacing: '1.2px',

                          fontWeight: '900',

                          boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.9)',

                          outline: 'none',

                          color: '#dc2626',
                        }}
                      >
                        PUTS
                      </button>
                    </>
                  )}

                  {useDropdowns ? (
                    <select
                      value={
                        inputTicker === 'ETF' || inputTicker === 'MAG7' || inputTicker === 'ALL'
                          ? inputTicker
                          : ''
                      }
                      onChange={(e) => {
                        if (e.target.value) {
                          setInputTicker(e.target.value)
                          onTickerChange(e.target.value)
                          onRefresh?.(e.target.value)
                        }
                      }}
                      className="font-black uppercase transition-all duration-200 cursor-pointer"
                      style={{
                        height: '40px',
                        padding: '0 34px 0 14px',
                        background: '#000000',
                        border: '1px solid #383838',
                        borderRadius: '7px',
                        fontSize: '16px',
                        letterSpacing: '1.5px',
                        fontWeight: '900',
                        outline: 'none',
                        color: '#ffffff',
                        cursor: 'pointer',
                        appearance: 'none',
                        WebkitAppearance: 'none',
                        boxShadow:
                          '0 4px 12px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.07), inset 0 -1px 0 rgba(0,0,0,0.5)',
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23888' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'right 11px center',
                      }}
                    >
                      <option
                        value=""
                        style={{ background: '#000000', color: '#ffffff', fontWeight: '900' }}
                      >
                        PRESETS
                      </option>
                      <option
                        value="ETF"
                        style={{ background: '#000000', color: '#ff8500', fontWeight: '900' }}
                      >
                        ETF
                      </option>
                      <option
                        value="MAG7"
                        style={{ background: '#000000', color: '#a855f7', fontWeight: '900' }}
                      >
                        MAG7
                      </option>
                      <option
                        value="ALL"
                        style={{ background: '#000000', color: '#ffffff', fontWeight: '900' }}
                      >
                        ALL
                      </option>
                    </select>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setInputTicker('ETF')

                          onTickerChange('ETF')

                          onRefresh?.('ETF')
                        }}
                        className="px-4 font-bold uppercase transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                        style={{
                          height: '48px',

                          background: 'linear-gradient(180deg, #1a1a1a 0%, #000000 100%)',

                          border: '2px solid #2a2a2a',

                          borderRadius: '4px',

                          fontSize: '15px',

                          letterSpacing: '1.2px',

                          fontWeight: '900',

                          boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.9)',

                          outline: 'none',

                          color: '#ff8500',
                        }}
                      >
                        ETF
                      </button>

                      <button
                        onClick={() => {
                          setInputTicker('MAG7')

                          onTickerChange('MAG7')

                          onRefresh?.('MAG7')
                        }}
                        className="px-4 font-bold uppercase transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                        style={{
                          height: '48px',

                          background: 'linear-gradient(180deg, #1a1a1a 0%, #000000 100%)',

                          border: '2px solid #2a2a2a',

                          borderRadius: '4px',

                          fontSize: '15px',

                          letterSpacing: '1.2px',

                          fontWeight: '900',

                          boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.9)',

                          outline: 'none',

                          color: '#a855f7',
                        }}
                      >
                        MAG7
                      </button>

                      <button
                        onClick={() => {
                          setInputTicker('ALL')

                          onTickerChange('ALL')

                          onRefresh?.('ALL')
                        }}
                        className="px-4 font-bold uppercase transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                        style={{
                          height: '48px',

                          background: 'linear-gradient(180deg, #1a1a1a 0%, #000000 100%)',

                          border: '2px solid #2a2a2a',

                          borderRadius: '4px',

                          fontSize: '15px',

                          letterSpacing: '1.2px',

                          fontWeight: '900',

                          boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.9)',

                          outline: 'none',

                          color: '#ffffff',
                        }}
                      >
                        ALL
                      </button>
                    </>
                  )}
                </div>

                {/* Divider */}

                {!isSidebarPanel && (
                  <div
                    className="hidden md:block"
                    style={{ width: '1px', height: '48px', background: '#2a2a2a' }}
                  ></div>
                )}

                {/* Quick Filters */}

                <div className="hidden md:flex items-center gap-2">
                  {useDropdowns ? (
                    <select
                      value={
                        quickFilters.otm
                          ? 'otm'
                          : quickFilters.premium100k
                            ? 'premium100k'
                            : quickFilters.weekly
                              ? 'weekly'
                              : quickFilters.sweep
                                ? 'sweep'
                                : quickFilters.block
                                  ? 'block'
                                  : ''
                      }
                      onChange={(e) => {
                        const value = e.target.value
                        setQuickFilters({
                          otm: value === 'otm',
                          premium100k: value === 'premium100k',
                          weekly: value === 'weekly',
                          sweep: value === 'sweep',
                          block: value === 'block',
                        })
                      }}
                      className="font-black uppercase cursor-pointer transition-all duration-200"
                      style={{
                        height: '40px',
                        padding: '0 34px 0 14px',
                        background: '#000000',
                        border: '1px solid #383838',
                        borderRadius: '7px',
                        fontSize: '16px',
                        letterSpacing: '1.5px',
                        fontWeight: '900',
                        outline: 'none',
                        color: quickFilters.otm
                          ? '#3b82f6'
                          : quickFilters.premium100k
                            ? '#22c55e'
                            : quickFilters.weekly
                              ? '#ef4444'
                              : quickFilters.sweep
                                ? '#fbbf24'
                                : quickFilters.block
                                  ? '#a855f7'
                                  : '#ffffff',
                        cursor: 'pointer',
                        appearance: 'none',
                        WebkitAppearance: 'none',
                        boxShadow:
                          '0 4px 12px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.07), inset 0 -1px 0 rgba(0,0,0,0.5)',
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23888' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'right 11px center',
                      }}
                    >
                      <option
                        value=""
                        style={{ background: '#000000', color: '#ffffff', fontWeight: '900' }}
                      >
                        FILTERS
                      </option>
                      <option
                        value="otm"
                        style={{ background: '#000000', color: '#3b82f6', fontWeight: '900' }}
                      >
                        OTM
                      </option>
                      <option
                        value="premium100k"
                        style={{ background: '#000000', color: '#22c55e', fontWeight: '900' }}
                      >
                        100K+
                      </option>
                      <option
                        value="weekly"
                        style={{ background: '#000000', color: '#ef4444', fontWeight: '900' }}
                      >
                        WKLYs
                      </option>
                      <option
                        value="sweep"
                        style={{ background: '#000000', color: '#fbbf24', fontWeight: '900' }}
                      >
                        SWEEP
                      </option>
                      <option
                        value="block"
                        style={{ background: '#000000', color: '#a855f7', fontWeight: '900' }}
                      >
                        BLOCK
                      </option>
                    </select>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setQuickFilters((prev) => ({ ...prev, otm: !prev.otm }))
                        }}
                        className="px-4 font-bold uppercase transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                        style={{
                          height: '48px',

                          background: 'linear-gradient(180deg, #1a1a1a 0%, #000000 100%)',

                          border: '2px solid #2a2a2a',

                          borderRadius: '4px',

                          fontSize: '12px',

                          letterSpacing: '1px',

                          fontWeight: '900',

                          boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.9)',

                          outline: 'none',

                          color: '#3b82f6',
                        }}
                      >
                        OTM
                      </button>

                      <button
                        onClick={() => {
                          setQuickFilters((prev) => ({ ...prev, premium100k: !prev.premium100k }))
                        }}
                        className="px-4 font-bold uppercase transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                        style={{
                          height: '48px',

                          background: 'linear-gradient(180deg, #1a1a1a 0%, #000000 100%)',

                          border: '2px solid #2a2a2a',

                          borderRadius: '4px',

                          fontSize: '12px',

                          letterSpacing: '1px',

                          fontWeight: '900',

                          boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.9)',

                          outline: 'none',

                          color: '#22c55e',
                        }}
                      >
                        100K+
                      </button>

                      <button
                        onClick={() => {
                          setQuickFilters((prev) => ({ ...prev, weekly: !prev.weekly }))
                        }}
                        className="px-4 font-bold uppercase transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                        style={{
                          height: '48px',

                          background: 'linear-gradient(180deg, #1a1a1a 0%, #000000 100%)',

                          border: '2px solid #2a2a2a',

                          borderRadius: '4px',

                          fontSize: '12px',

                          letterSpacing: '1px',

                          fontWeight: '900',

                          boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.9)',

                          outline: 'none',

                          color: '#ef4444',
                        }}
                      >
                        WKLYs
                      </button>

                      <button
                        onClick={() => {
                          setQuickFilters((prev) => ({ ...prev, sweep: !prev.sweep }))
                        }}
                        className="px-4 font-bold uppercase transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                        style={{
                          height: '48px',

                          background: 'linear-gradient(180deg, #1a1a1a 0%, #000000 100%)',

                          border: '2px solid #2a2a2a',

                          borderRadius: '4px',

                          fontSize: '12px',

                          letterSpacing: '1px',

                          fontWeight: '900',

                          boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.9)',

                          outline: 'none',

                          color: '#fbbf24',
                        }}
                      >
                        SWEEP
                      </button>

                      <button
                        onClick={() => {
                          setQuickFilters((prev) => ({ ...prev, block: !prev.block }))
                        }}
                        className="px-4 font-bold uppercase transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                        style={{
                          height: '48px',

                          background: 'linear-gradient(180deg, #1a1a1a 0%, #000000 100%)',

                          border: '2px solid #2a2a2a',

                          borderRadius: '4px',

                          fontSize: '12px',

                          letterSpacing: '1px',

                          fontWeight: '900',

                          boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.9)',

                          outline: 'none',

                          color: '#a855f7',
                        }}
                      >
                        BLOCK
                      </button>
                    </>
                  )}

                  {efiHighlightsActive && (
                    <button
                      onClick={() => setNotableFilterActive(!notableFilterActive)}
                      className="px-4 font-bold uppercase transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                      style={{
                        height: '48px',

                        background: notableFilterActive
                          ? 'linear-gradient(180deg, #FFD700 0%, #FFA500 100%)'
                          : 'linear-gradient(180deg, #1a1a1a 0%, #000000 100%)',

                        border: notableFilterActive ? '2px solid #FFD700' : '2px solid #2a2a2a',

                        borderRadius: '4px',

                        fontSize: '12px',

                        letterSpacing: '1px',

                        fontWeight: '900',

                        boxShadow: notableFilterActive
                          ? '0 0 12px rgba(255, 215, 0, 0.6), inset 0 2px 8px rgba(0, 0, 0, 0.3)'
                          : 'inset 0 2px 8px rgba(0, 0, 0, 0.9)',

                        outline: 'none',

                        color: notableFilterActive ? '#000000' : '#FFD700',
                      }}
                    >
                      NOTABLE
                    </button>
                  )}
                </div>

                {/* Divider */}

                <div
                  className="hidden md:block"
                  style={{ width: '1px', height: '48px', background: '#2a2a2a' }}
                ></div>

                {/* Premium EFI Highlights Toggle */}

                <button
                  onClick={async () => {
                    const newState = !efiHighlightsActive
                    setEfiHighlightsActive(newState)
                    if (newState) {
                      const efiTrades = filteredAndSortedData.filter(meetsEfiCriteria)
                      const rsData = await calculateRelativeStrength(efiTrades)
                      setRelativeStrengthData(rsData)
                    }
                  }}
                  className="px-4 md:px-8 text-white font-black uppercase transition-all duration-200 flex items-center gap-2 md:gap-3 hover:scale-[1.02] active:scale-[0.98] focus:outline-none"
                  style={{
                    height: '48px',

                    background: efiHighlightsActive
                      ? 'linear-gradient(180deg, #ff9500 0%, #ff8500 50%, #ff7500 100%)'
                      : 'linear-gradient(180deg, #1a1a1a 0%, #000000 50%, #000000 100%)',

                    border: efiHighlightsActive ? '1px solid #ffaa00' : '2px solid #2a2a2a',

                    borderRadius: '4px',

                    fontSize: '14px',

                    letterSpacing: '1.5px',

                    fontWeight: '900',

                    boxShadow: efiHighlightsActive
                      ? 'inset 0 1px 0 rgba(255, 255, 255, 0.4), inset 0 -2px 0 rgba(0, 0, 0, 0.3)'
                      : 'inset 0 2px 8px rgba(0, 0, 0, 0.9)',
                  }}
                  onMouseEnter={(e) => {
                    if (efiHighlightsActive) {
                      e.currentTarget.style.boxShadow =
                        'inset 0 1px 0 rgba(255, 255, 255, 0.5), inset 0 -2px 0 rgba(0, 0, 0, 0.3)'
                    } else {
                      e.currentTarget.style.boxShadow = 'inset 0 2px 8px rgba(0, 0, 0, 0.9)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (efiHighlightsActive) {
                      e.currentTarget.style.boxShadow =
                        'inset 0 1px 0 rgba(255, 255, 255, 0.4), inset 0 -2px 0 rgba(0, 0, 0, 0.3)'
                    } else {
                      e.currentTarget.style.boxShadow = 'inset 0 2px 8px rgba(0, 0, 0, 0.9)'
                    }
                  }}
                >
                  <svg
                    className={`w-5 h-5 transition-all duration-200 ${efiHighlightsActive ? 'text-black' : 'text-orange-500'}`}
                    fill={efiHighlightsActive ? 'currentColor' : 'none'}
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                    />
                  </svg>

                  <span style={{ color: efiHighlightsActive ? '#000000' : '#ffffff' }}>
                    HIGHLIGHTS
                  </span>

                  <div
                    className={`px-3 py-1 font-black rounded transition-all duration-200`}
                    style={{
                      fontSize: '11px',

                      letterSpacing: '1px',

                      background: efiHighlightsActive
                        ? 'rgba(0, 0, 0, 0.4)'
                        : 'rgba(255, 133, 0, 0.1)',

                      color: efiHighlightsActive ? '#ff8500' : '#666666',

                      boxShadow: efiHighlightsActive
                        ? 'inset 0 1px 3px rgba(0, 0, 0, 0.5)'
                        : 'inset 0 1px 3px rgba(0, 0, 0, 0.8)',
                    }}
                  >
                    {efiHighlightsActive ? 'ON' : 'OFF'}
                  </div>
                </button>

                {/* Grading Progress Indicator */}

                {gradingProgress && (
                  <div
                    className="flex items-center gap-2 px-4 py-2 rounded"
                    style={{
                      background: 'rgba(255, 149, 0, 0.1)',
                      border: '1px solid rgba(255, 149, 0, 0.3)',
                    }}
                  >
                    <div className="text-orange-500 font-bold text-sm">
                      GRADING: {Math.round((gradingProgress.current / gradingProgress.total) * 100)}
                      %
                    </div>

                    <div
                      className="w-32 h-2 bg-black rounded-full overflow-hidden"
                      style={{ border: '1px solid rgba(255, 149, 0, 0.3)' }}
                    >
                      <div
                        className="h-full bg-gradient-to-r from-orange-500 to-orange-400 transition-all duration-300"
                        style={{
                          width: `${(gradingProgress.current / gradingProgress.total) * 100}%`,
                        }}
                      />
                    </div>

                    <div className="text-gray-400 text-xs">
                      {gradingProgress.current}/{gradingProgress.total}
                    </div>
                  </div>
                )}

                {/* Active Ticker Filter */}

                {selectedTickerFilter && (
                  <div className="flex items-center gap-3">
                    <span className="text-gray-300 text-sm font-medium">Filtered:</span>

                    <div className="flex items-center gap-2 bg-orange-950/30 border border-orange-500/50 rounded-lg px-3 py-2 h-10">
                      <span className="text-orange-400 font-mono font-semibold text-sm">
                        {selectedTickerFilter}
                      </span>

                      <button
                        onClick={() => setSelectedTickerFilter('')}
                        className="text-orange-400 hover:text-white hover:bg-orange-500 rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold transition-all duration-200"
                        title="Clear filter"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                )}

                {/* Premium Action Buttons */}

                <div className="flex items-center gap-3">
                  {!isSidebarPanel && (
                    <button
                      onClick={() => onRefresh?.()}
                      disabled={loading}
                      className={`hidden md:flex px-9 text-white font-black uppercase transition-all duration-200 items-center gap-3 focus:outline-none ${loading
                        ? 'cursor-not-allowed opacity-40'
                        : 'hover:scale-[1.02] active:scale-[0.98]'
                        }`}
                      style={{
                        height: '48px',

                        background:
                          'linear-gradient(180deg, #1a1a1a 0%, #000000 50%, #000000 100%)',

                        border: '2px solid #0ea5e9',

                        borderRadius: '4px',

                        fontSize: '14px',

                        letterSpacing: '1.5px',

                        fontWeight: '900',

                        boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.9)',
                      }}
                      onMouseEnter={(e) => {
                        if (!loading) {
                          e.currentTarget.style.boxShadow = 'inset 0 2px 8px rgba(0, 0, 0, 0.9)'

                          e.currentTarget.style.border = '2px solid #38bdf8'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!loading) {
                          e.currentTarget.style.boxShadow = 'inset 0 2px 8px rgba(0, 0, 0, 0.9)'

                          e.currentTarget.style.border = '2px solid #0ea5e9'
                        }
                      }}
                    >
                      {loading ? (
                        <>
                          <svg
                            className="animate-spin h-5 w-5 text-cyan-400"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={2.5}
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            ></circle>

                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            ></path>
                          </svg>

                          <span>{streamingStatus || 'SCANNING...'}</span>
                        </>
                      ) : (
                        <>
                          <svg
                            className="w-5 h-5 text-cyan-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            strokeWidth={2.5}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                            />
                          </svg>

                          <span>REFRESH</span>
                        </>
                      )}
                    </button>
                  )}

                  {/* Clear Data Button - Desktop Only */}

                  {onClearData && (
                    <button
                      onClick={onClearData}
                      disabled={loading}
                      className={`hidden md:flex px-4 md:px-9 text-white font-black uppercase transition-all duration-200 items-center gap-2 md:gap-3 focus:outline-none ${loading
                        ? 'cursor-not-allowed opacity-40'
                        : 'hover:scale-[1.02] active:scale-[0.98]'
                        }`}
                      style={{
                        height: '48px',

                        background:
                          'linear-gradient(180deg, #1a1a1a 0%, #000000 50%, #000000 100%)',

                        border: '2px solid #ef4444',

                        borderRadius: '4px',

                        fontSize: '14px',

                        letterSpacing: '1.5px',

                        fontWeight: '900',

                        boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.9)',
                      }}
                      onMouseEnter={(e) => {
                        if (!loading) {
                          e.currentTarget.style.boxShadow = 'inset 0 2px 8px rgba(0, 0, 0, 0.9)'

                          e.currentTarget.style.border = '2px solid #f87171'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!loading) {
                          e.currentTarget.style.boxShadow = 'inset 0 2px 8px rgba(0, 0, 0, 0.9)'

                          e.currentTarget.style.border = '2px solid #ef4444'
                        }
                      }}
                    >
                      <svg
                        className="w-5 h-5 text-red-500"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        strokeWidth={2.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>

                      <span>CLEAR</span>
                    </button>
                  )}

                  {/* Mobile Dropdown Menu Button */}

                  <div className="md:hidden relative">
                    <button
                      onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                      disabled={loading}
                      className={`px-4 text-white font-black uppercase transition-all duration-200 flex items-center gap-2 focus:outline-none ${loading
                        ? 'cursor-not-allowed opacity-40'
                        : 'hover:scale-[1.02] active:scale-[0.98]'
                        }`}
                      style={{
                        height: '48px',

                        background:
                          'linear-gradient(180deg, #1a1a1a 0%, #000000 50%, #000000 100%)',

                        border: '2px solid #6b7280',

                        borderRadius: '4px',

                        fontSize: '14px',

                        letterSpacing: '1.5px',

                        fontWeight: '900',

                        boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.9)',
                      }}
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                      </svg>
                    </button>

                    {/* Dropdown Menu */}

                    {mobileMenuOpen && (
                      <>
                        <div
                          className="fixed inset-0 z-40"
                          onClick={() => setMobileMenuOpen(false)}
                        />

                        <div className="absolute right-0 mt-2 w-48 bg-black border border-orange-500 rounded shadow-lg z-50">
                          <button
                            onClick={() => {
                              handleSaveFlow()

                              setMobileMenuOpen(false)
                            }}
                            disabled={savingFlow || !data || data.length === 0}
                            className="w-full text-left px-4 py-3 text-white hover:bg-gray-800 flex items-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <svg
                              className="w-5 h-5 text-blue-400"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              strokeWidth={2}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
                              />
                            </svg>

                            <span className="font-bold">Save</span>
                          </button>

                          <button
                            onClick={() => {
                              setIsHistoryDialogOpen(true)

                              setMobileMenuOpen(false)
                            }}
                            disabled={loadingHistory}
                            className="w-full text-left px-4 py-3 text-white hover:bg-gray-800 flex items-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <svg
                              className="w-5 h-5 text-purple-400"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              strokeWidth={2}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                              />
                            </svg>

                            <span className="font-bold">History</span>
                          </button>

                          {onClearData && (
                            <button
                              onClick={() => {
                                onClearData()

                                setMobileMenuOpen(false)
                              }}
                              disabled={loading}
                              className="w-full text-left px-4 py-3 text-red-400 hover:bg-gray-800 flex items-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed border-t border-gray-700"
                            >
                              <svg
                                className="w-5 h-5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                strokeWidth={2}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                />
                              </svg>

                              <span className="font-bold">Clear</span>
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Save Button - Desktop Only */}

                  <button
                    onClick={handleSaveFlow}
                    disabled={savingFlow || !data || data.length === 0}
                    className={`hidden md:flex px-4 text-white font-black uppercase transition-all duration-200 items-center gap-2 focus:outline-none ${savingFlow || !data || data.length === 0
                      ? 'cursor-not-allowed opacity-40'
                      : 'hover:scale-[1.02] active:scale-[0.98]'
                      }`}
                    style={{
                      height: '48px',

                      background: 'linear-gradient(180deg, #1a1a1a 0%, #000000 50%, #000000 100%)',

                      border: '2px solid #3b82f6',

                      borderRadius: '4px',

                      fontSize: '14px',

                      letterSpacing: '1.5px',

                      fontWeight: '900',

                      boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.9)',
                    }}
                  >
                    {savingFlow ? (
                      <svg
                        className="w-5 h-5 text-blue-400 animate-spin"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>

                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                    ) : (
                      <svg
                        className="w-5 h-5 text-blue-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        strokeWidth={2.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
                        />
                      </svg>
                    )}

                    <span
                      style={{
                        color:
                          saveStatus === 'success'
                            ? '#22c55e'
                            : saveStatus === 'error'
                              ? '#ef4444'
                              : undefined,
                      }}
                    >
                      {savingFlow
                        ? 'SAVING...'
                        : saveStatus === 'success'
                          ? 'SAVED ✓'
                          : saveStatus === 'error'
                            ? 'ERROR ✗'
                            : 'SAVE'}
                    </span>
                  </button>
                  {saveStatus === 'error' && saveErrorMsg && (
                    <span
                      style={{
                        fontSize: '9px',
                        color: '#ef4444',
                        maxWidth: '120px',
                        lineHeight: 1.2,
                      }}
                    >
                      {saveErrorMsg}
                    </span>
                  )}

                  {/* History Button - Desktop Only */}

                  {/* Download as Image Button - Desktop Only */}

                  <button
                    onClick={handleDownloadImage}
                    className="hidden md:flex px-4 text-white font-black uppercase transition-all duration-200 items-center gap-2 focus:outline-none hover:scale-[1.02] active:scale-[0.98]"
                    style={{
                      height: '48px',
                      background: 'linear-gradient(180deg, #1a1a1a 0%, #000000 50%, #000000 100%)',
                      border: '2px solid #22c55e',
                      borderRadius: '4px',
                      fontSize: '14px',
                      letterSpacing: '1.5px',
                      fontWeight: '900',
                      boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.9)',
                    }}
                    title="Download page as image"
                  >
                    <svg
                      className="w-5 h-5 text-green-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      strokeWidth={2.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                    <span style={{ color: '#22c55e' }}>IMG</span>
                  </button>

                  <button
                    onClick={loadFlowHistory}
                    disabled={loadingHistory}
                    className={`hidden md:flex px-4 text-white font-black uppercase transition-all duration-200 items-center gap-2 focus:outline-none ${loadingHistory
                      ? 'cursor-not-allowed opacity-40'
                      : 'hover:scale-[1.02] active:scale-[0.98]'
                      }`}
                    style={{
                      height: '48px',

                      background: 'linear-gradient(180deg, #1a1a1a 0%, #000000 50%, #000000 100%)',

                      border: '2px solid #8b5cf6',

                      borderRadius: '4px',

                      fontSize: '14px',

                      letterSpacing: '1.5px',

                      fontWeight: '900',

                      boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.9)',
                    }}
                  >
                    {loadingHistory ? (
                      <svg
                        className="w-5 h-5 text-purple-400 animate-spin"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>

                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                    ) : (
                      <svg
                        className="w-5 h-5 text-purple-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        strokeWidth={2.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    )}

                    <span>{loadingHistory ? 'LOADING...' : 'HISTORY'}</span>
                  </button>

                  {/* Flow Tracking Button - Mobile Only */}

                  <button
                    onClick={() => setIsFlowTrackingOpen(!isFlowTrackingOpen)}
                    className={`md:hidden px-4 text-white font-black uppercase transition-all duration-200 flex items-center gap-2 hover:scale-[1.02] active:scale-[0.98] focus:outline-none`}
                    style={{
                      height: '48px',

                      background: isFlowTrackingOpen
                        ? 'linear-gradient(180deg, #10b981 0%, #059669 100%)'
                        : 'linear-gradient(180deg, #1a1a1a 0%, #000000 50%, #000000 100%)',

                      border: isFlowTrackingOpen ? '2px solid #10b981' : '2px solid #6b7280',

                      borderRadius: '4px',

                      fontSize: '14px',

                      letterSpacing: '1.5px',

                      fontWeight: '900',

                      boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.9)',
                    }}
                    onMouseEnter={(e) => {
                      if (!loading) {
                        e.currentTarget.style.boxShadow = 'inset 0 2px 8px rgba(0, 0, 0, 0.9)'

                        e.currentTarget.style.border = isFlowTrackingOpen
                          ? '2px solid #34d399'
                          : '2px solid #9ca3af'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!loading) {
                        e.currentTarget.style.boxShadow = 'inset 0 2px 8px rgba(0, 0, 0, 0.9)'

                        e.currentTarget.style.border = isFlowTrackingOpen
                          ? '2px solid #10b981'
                          : '2px solid #6b7280'
                      }
                    }}
                  >
                    <svg
                      className="w-5 h-5 text-green-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      strokeWidth={2.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                      />
                    </svg>

                    <span>TRACK</span>
                  </button>
                </div>

                {/* Right Section - Desktop Only */}

                <div
                  className="hidden md:flex stats-section flex-col md:flex-row items-start md:items-center gap-2 md:gap-3 w-full md:w-auto"
                  style={{ flexShrink: 0, minWidth: 'auto' }}
                >
                  {/* Filter Button */}

                  <button
                    onClick={() => {
                      setIsFilterDialogOpen(true)
                    }}
                    className="px-4 md:px-9 text-white font-black uppercase transition-all duration-200 flex items-center gap-2 md:gap-3 hover:scale-[1.02] active:scale-[0.98] focus:outline-none"
                    style={{
                      height: '48px',

                      background: 'linear-gradient(180deg, #1a1a1a 0%, #000000 50%, #000000 100%)',

                      border: '2px solid #ff8500',

                      borderRadius: '4px',

                      fontSize: '14px',

                      letterSpacing: '1.5px',

                      fontWeight: '900',

                      boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.9)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.boxShadow = 'inset 0 2px 8px rgba(0, 0, 0, 0.9)'

                      e.currentTarget.style.border = '2px solid #ffaa00'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.boxShadow = 'inset 0 2px 8px rgba(0, 0, 0, 0.9)'

                      e.currentTarget.style.border = '2px solid #ff8500'
                    }}
                  >
                    <svg
                      className="w-5 h-5 text-orange-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      strokeWidth={2.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                      />
                    </svg>

                    <span>FILTER</span>
                  </button>

                  {/* Vertical Divider */}

                  <div className="control-bar-divider hidden md:block w-px h-8 bg-gray-700"></div>

                  {/* Stats Section */}

                  <div className="flex flex-col md:flex-row items-start md:items-center gap-1 md:gap-3">
                    {/* Date Display */}

                    {marketInfo && (
                      <div className="text-xs md:text-sm text-gray-400 font-mono">
                        {marketInfo.data_date}
                      </div>
                    )}

                    {/* Trade Count */}

                    <div className="text-xs md:text-sm text-gray-300">
                      <span className="text-orange-400 font-bold font-mono">
                        {filteredAndSortedData.length.toLocaleString()}
                      </span>

                      <span className="text-gray-400 ml-1">trades</span>
                    </div>

                    {/* Pagination Info */}

                    <div className="text-xs md:text-sm text-gray-300">
                      Page{' '}
                      <span className="text-orange-400 font-bold font-mono">{currentPage}</span>
                      <span className="text-gray-500 mx-1">of</span>
                      <span className="text-orange-400 font-bold font-mono">{totalPages}</span>
                    </div>

                    {/* Pagination Controls */}

                    {filteredAndSortedData.length > itemsPerPage && (
                      <div className="pagination flex items-center gap-0.5 md:gap-1">
                        <button
                          onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                          disabled={currentPage === 1}
                          className="w-7 h-7 md:w-8 md:h-8 flex items-center justify-center text-xs bg-black border border-gray-600 text-gray-300 hover:border-gray-500 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed rounded transition-all duration-150"
                        >
                          ←
                        </button>

                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                          let pageNum

                          if (totalPages <= 5) {
                            pageNum = i + 1
                          } else if (currentPage <= 3) {
                            pageNum = i + 1
                          } else if (currentPage >= totalPages - 2) {
                            pageNum = totalPages - 4 + i
                          } else {
                            pageNum = currentPage - 2 + i
                          }

                          return (
                            <button
                              key={pageNum}
                              onClick={() => setCurrentPage(pageNum)}
                              className={`w-7 h-7 md:w-8 md:h-8 flex items-center justify-center text-xs border rounded transition-all duration-150 ${currentPage === pageNum
                                ? 'bg-orange-500 text-black border-orange-500 font-bold'
                                : 'bg-black border-gray-600 text-gray-300 hover:border-gray-500 hover:text-white'
                                }`}
                            >
                              {pageNum}
                            </button>
                          )
                        })}

                        <button
                          onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                          disabled={currentPage === totalPages}
                          className="w-7 h-7 md:w-8 md:h-8 flex items-center justify-center text-xs bg-black border border-gray-600 text-gray-300 hover:border-gray-500 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed rounded transition-all duration-150"
                        >
                          →
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Error Banner */}

        {streamError && (
          <div className="bg-red-900/20 border-l-4 border-red-500 px-6 py-4 mx-8 my-4 rounded-r-lg">
            <div className="flex items-center gap-3">
              <svg
                className="w-6 h-6 text-red-500 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>

              <div>
                <p className="text-red-400 font-semibold">Connection Error</p>

                <p className="text-red-300 text-sm">{streamError}</p>
              </div>
            </div>
          </div>
        )}

        {/* Main Table */}

        <div className="bg-black border border-gray-800 flex-1 options-flow-table-container">
          <div className="p-0">
            <div
              className="table-scroll-container custom-scrollbar overflow-y-auto overflow-x-auto"
              style={{
                height: 'calc(100vh - 240px)',
                paddingBottom: '100px',
                scrollBehavior: 'smooth',
              }}
            >
              <table className="w-full options-flow-table" style={{ marginBottom: '80px' }}>
                <thead className="sticky top-0 bg-gradient-to-b from-yellow-900/10 via-gray-900 to-black z-[1] border-b-2 border-gray-600 shadow-2xl">
                  <tr>
                    <th
                      className="text-center md:text-left p-2 md:p-6 cursor-pointer bg-gradient-to-b from-yellow-900/10 to-black hover:from-yellow-800/15 hover:to-black text-orange-400 font-bold text-xs md:text-xl transition-all duration-200 border-r border-gray-700"
                      onClick={() => handleSort('trade_timestamp')}
                    >
                      <span className="md:hidden">Symbol</span>

                      <span className="hidden md:inline">Time</span>

                      {sortField === 'trade_timestamp' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>

                    <th
                      className="hidden md:table-cell text-center md:text-left p-2 md:p-6 cursor-pointer bg-gradient-to-b from-yellow-900/10 to-black hover:from-yellow-800/15 hover:to-black text-orange-400 font-bold text-xs md:text-xl transition-all duration-200 border-r border-gray-700"
                      onClick={() => handleSort('underlying_ticker')}
                    >
                      Symbol{' '}
                      {sortField === 'underlying_ticker' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>

                    <th
                      className="text-center md:text-left p-2 md:p-6 cursor-pointer bg-gradient-to-b from-yellow-900/10 via-gray-900/80 to-black hover:from-yellow-800/15 hover:via-gray-800/90 hover:to-black text-orange-400 font-bold text-xs md:text-xl transition-all duration-200 border-r border-gray-700 shadow-lg shadow-black/50 hover:shadow-xl hover:shadow-orange-500/20 backdrop-blur-sm"
                      onClick={() => handleSort('type')}
                    >
                      <span className="md:hidden">Strike</span>

                      <span className="hidden md:inline">Call/Put</span>

                      {sortField === 'type' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>

                    <th
                      className="hidden md:table-cell text-center md:text-left p-2 md:p-6 cursor-pointer bg-gradient-to-b from-yellow-900/10 via-black to-black hover:from-yellow-800/20 hover:via-gray-900 hover:to-black text-orange-400 font-bold text-xs md:text-xl transition-all duration-200 border-r border-gray-700"
                      onClick={() => handleSort('strike')}
                    >
                      Strike {sortField === 'strike' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>

                    <th
                      className="text-center md:text-left p-2 md:p-6 cursor-pointer bg-gradient-to-b from-yellow-900/10 via-black to-black hover:from-yellow-800/20 hover:via-gray-900 hover:to-black text-orange-400 font-bold text-xs md:text-xl transition-all duration-200 border-r border-gray-700"
                      onClick={() => handleSort('trade_size')}
                    >
                      <span className="md:hidden">Size</span>

                      <span className="hidden md:inline">Size</span>

                      {sortField === 'trade_size' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>

                    <th
                      className="hidden md:table-cell text-center md:text-left p-2 md:p-6 cursor-pointer bg-gradient-to-b from-yellow-900/10 via-black to-black hover:from-yellow-800/20 hover:via-gray-900 hover:to-black text-orange-400 font-bold text-xs md:text-xl transition-all duration-200 border-r border-gray-700"
                      onClick={() => handleSort('total_premium')}
                    >
                      Premium{' '}
                      {sortField === 'total_premium' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>

                    <th
                      className="text-center md:text-left p-2 md:p-6 cursor-pointer bg-gradient-to-b from-yellow-900/10 via-black to-black hover:from-yellow-800/20 hover:via-gray-900 hover:to-black text-orange-400 font-bold text-xs md:text-xl transition-all duration-200 border-r border-gray-700"
                      onClick={() => handleSort('expiry')}
                    >
                      <span className="md:hidden">Expiry / Type</span>

                      <span className="hidden md:inline">Expiration</span>

                      {sortField === 'expiry' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>

                    <th
                      className="text-center md:text-left p-2 md:p-6 cursor-pointer bg-gradient-to-b from-yellow-900/10 via-black to-black hover:from-yellow-800/20 hover:via-gray-900 hover:to-black text-orange-400 font-bold text-xs md:text-xl transition-all duration-200 border-r border-gray-700"
                      onClick={() => handleSort('spot_price')}
                    >
                      <span className="hidden md:inline">Spot {'>>'} Current</span>

                      <span className="md:hidden">Spot</span>

                      {sortField === 'spot_price' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>

                    <th className="hidden md:table-cell text-center md:text-left p-2 md:p-6 bg-gradient-to-b from-yellow-900/10 via-black to-black text-orange-400 font-bold text-xs md:text-xl transition-all duration-200 border-r border-gray-700">
                      VOL/OI
                    </th>

                    <th
                      className="hidden md:table-cell text-center md:text-left p-2 md:p-6 cursor-pointer bg-gradient-to-b from-yellow-900/10 via-gray-900/80 to-black hover:from-yellow-800/15 hover:via-gray-800/90 hover:to-black text-orange-400 font-bold text-xs md:text-xl transition-all duration-200 shadow-lg shadow-black/50 hover:shadow-xl hover:shadow-orange-500/20 backdrop-blur-sm"
                      onClick={() => handleSort('trade_type')}
                    >
                      Type {sortField === 'trade_type' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>

                    {notableFilterActive && (
                      <th className="hidden md:table-cell text-left p-2 md:p-6 bg-gradient-to-b from-yellow-900/10 via-black to-black text-orange-400 font-bold text-xs md:text-xl border-r border-gray-700">
                        Targets
                      </th>
                    )}
                    {notableFilterActive && (
                      <th className="hidden md:table-cell text-left p-2 md:p-6 bg-gradient-to-b from-yellow-900/10 via-black to-black text-orange-400 font-bold text-xs md:text-xl border-r border-gray-700">
                        Dealer
                      </th>
                    )}

                    {efiHighlightsActive && (
                      <th
                        className="text-center md:text-left p-2 md:p-6 cursor-pointer bg-gradient-to-b from-yellow-900/10 via-black to-black hover:from-yellow-800/20 hover:via-gray-900 hover:to-black text-orange-400 font-bold text-xs md:text-xl transition-all duration-200 border-r border-gray-700"
                        onClick={() => {
                          handleSort('positioning_grade')
                        }}
                      >
                        <span className="md:hidden">Grade</span>

                        <span className="hidden md:inline">Position</span>

                        {sortField === 'positioning_grade' && (sortDirection === 'asc' ? '↑' : '↓')}
                      </th>
                    )}
                  </tr>
                </thead>

                <tbody>
                  {paginatedData.map((trade, index) => {
                    const isEfiHighlight = efiHighlightsActive && meetsEfiCriteria(trade)

                    const isNotablePick =
                      notableFilterActive || (efiHighlightsActive && meetsNotableCriteria(trade))

                    // Determine if EFI highlight is bullish or bearish

                    let isBullishEfi = false

                    let isBearishEfi = false

                    if (isEfiHighlight) {
                      const fillStyle = (trade as any).fill_style || ''

                      const isCall = trade.type.toLowerCase() === 'call'

                      if (fillStyle === 'A' || fillStyle === 'AA') {
                        // Ask side - buying

                        isBullishEfi = isCall // Buying calls = bullish

                        isBearishEfi = !isCall // Buying puts = bearish
                      } else if (fillStyle === 'B' || fillStyle === 'BB') {
                        // Bid side - selling

                        isBullishEfi = !isCall // Selling puts = bullish

                        isBearishEfi = isCall // Selling calls = bearish
                      }
                    }

                    return (
                      <React.Fragment
                        key={`${trade.ticker}-${trade.strike}-${trade.trade_timestamp}-${trade.trade_size}-${index}`}
                      >
                        <tr
                          className="border-b border-slate-700/50 hover:bg-slate-800/40 transition-all duration-300 hover:shadow-lg"
                          onClick={() => {
                            if (isNotablePick) openNotableAnalysis(trade)
                          }}
                          style={{
                            cursor: isNotablePick ? 'pointer' : 'default',

                            ...(isEfiHighlight
                              ? isBullishEfi
                                ? {
                                  background: `linear-gradient(to right, rgba(0, 255, 0, 0.04), transparent 40%)`,
                                  borderLeft: '3px solid rgba(0, 255, 0, 0.5)',
                                }
                                : {
                                  background: `linear-gradient(to right, rgba(255, 0, 0, 0.04), transparent 40%)`,
                                  borderLeft: '3px solid rgba(255, 0, 0, 0.5)',
                                }
                              : {
                                backgroundColor: index % 2 === 0 ? '#000000' : '#0a0a0a',
                              }),

                            position: 'relative' as const,

                            zIndex: hoveredGradeIndex === index ? 99999 : 'auto',
                          }}
                        >
                          <td className="p-2 md:p-6 text-white text-xs md:text-xl font-medium border-r border-gray-700/30 time-cell text-center">
                            {/* Mobile: Ticker + Time stacked */}

                            <div className="md:hidden flex flex-col items-center space-y-1">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  onClick={() => handleTickerClick(trade.underlying_ticker)}
                                  className={`ticker-button ${getTickerStyle(trade.underlying_ticker)} hover:bg-gray-900 hover:text-orange-400 transition-all duration-200 px-2 py-1 rounded-lg cursor-pointer border-none shadow-sm text-xs ${selectedTickerFilter === trade.underlying_ticker
                                    ? 'ring-2 ring-orange-500 bg-gray-800/50'
                                    : ''
                                    }`}
                                >
                                  {trade.underlying_ticker}
                                </button>

                                <button
                                  onClick={() =>
                                    isInFlowTracking(trade)
                                      ? removeFromFlowTracking(trade)
                                      : addToFlowTracking(trade)
                                  }
                                  className="text-white hover:text-orange-400 transition-colors"
                                  title={
                                    isInFlowTracking(trade)
                                      ? 'Remove from Flow Tracking'
                                      : 'Add to Flow Tracking'
                                  }
                                >
                                  {isInFlowTracking(trade) ? (
                                    <TbStarFilled className="w-3 h-3 text-orange-400" />
                                  ) : (
                                    <TbStar className="w-3 h-3" />
                                  )}
                                </button>
                              </div>

                              <div
                                className="text-xs"
                                style={
                                  isNotablePick
                                    ? { color: '#FFD700', fontWeight: 'bold' }
                                    : { color: '#d1d5db' }
                                }
                              >
                                {formatTime(trade.trade_timestamp)}
                              </div>
                            </div>

                            {/* Desktop: Time only */}

                            <div
                              className="hidden md:block"
                              style={isNotablePick ? { color: '#FFD700', fontWeight: 'bold' } : {}}
                            >
                              {formatTimeWithSeconds(trade.trade_timestamp)}
                            </div>
                          </td>

                          <td className="hidden md:table-cell p-2 md:p-6 border-r border-gray-700/30">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleTickerClick(trade.underlying_ticker)}
                                className={`ticker-button ${getTickerStyle(trade.underlying_ticker)} hover:bg-gray-900 hover:text-orange-400 transition-all duration-200 px-2 md:px-3 py-1 md:py-2 rounded-lg cursor-pointer border-none shadow-sm text-xs md:text-lg ${selectedTickerFilter === trade.underlying_ticker
                                  ? 'ring-2 ring-orange-500 bg-gray-800/50'
                                  : ''
                                  }`}
                                style={
                                  isNotablePick ? { color: '#FFD700', fontWeight: 'bold' } : {}
                                }
                              >
                                {trade.underlying_ticker}
                              </button>

                              <button
                                onClick={() =>
                                  isInFlowTracking(trade)
                                    ? removeFromFlowTracking(trade)
                                    : addToFlowTracking(trade)
                                }
                                className="text-white hover:text-orange-400 transition-colors"
                                title={
                                  isInFlowTracking(trade)
                                    ? 'Remove from Flow Tracking'
                                    : 'Add to Flow Tracking'
                                }
                              >
                                {isInFlowTracking(trade) ? (
                                  <TbStarFilled className="w-4 h-4 text-orange-400" />
                                ) : (
                                  <TbStar className="w-4 h-4" />
                                )}
                              </button>
                            </div>
                          </td>

                          <td
                            className={`p-2 md:p-6 text-sm md:text-xl font-bold border-r border-gray-700/30 call-put-text text-center ${getCallPutColor(trade.type)}`}
                          >
                            {/* Mobile: Strike + Call/Put stacked */}

                            <div className="md:hidden flex flex-col items-center space-y-1">
                              <div
                                className="text-xs font-semibold"
                                style={
                                  isNotablePick
                                    ? { color: '#FFD700', fontWeight: 'bold' }
                                    : { color: 'white' }
                                }
                              >
                                ${trade.strike}
                              </div>

                              <div className={`text-xs font-bold ${getCallPutColor(trade.type)}`}>
                                {trade.type.toUpperCase()}
                              </div>
                            </div>

                            {/* Desktop: Call/Put only */}

                            <div className="hidden md:block">{trade.type.toUpperCase()}</div>
                          </td>

                          <td
                            className="hidden md:table-cell p-2 md:p-6 text-xs md:text-xl font-semibold border-r border-gray-700/30 strike-cell"
                            style={
                              isNotablePick
                                ? { color: '#FFD700', fontWeight: 'bold' }
                                : { color: 'white' }
                            }
                          >
                            ${trade.strike}
                          </td>

                          <td className="p-2 md:p-6 font-medium text-xs md:text-xl text-white border-r border-gray-700/30 size-premium-cell text-center">
                            {/* Mobile: Size@Price+Grade + Premium stacked */}

                            <div className="md:hidden flex flex-col items-center space-y-1">
                              <div className="flex items-center justify-center gap-1">
                                <span className="text-cyan-400 font-bold text-xs">
                                  {trade.trade_size.toLocaleString()}
                                </span>

                                <span className="text-yellow-400 font-bold text-xs">
                                  @{trade.premium_per_contract.toFixed(2)}
                                </span>

                                {(trade as any).fill_style && (
                                  <span
                                    className={`ml-1 px-2 py-1 rounded-full font-bold text-xs shadow-lg ${(trade as any).fill_style === 'A'
                                      ? 'text-green-400 bg-green-400/20 border border-green-400/40'
                                      : (trade as any).fill_style === 'AA'
                                        ? 'text-green-300 bg-green-300/20 border border-green-300/40'
                                        : (trade as any).fill_style === 'B'
                                          ? 'text-red-400 bg-red-400/20 border border-red-400/40'
                                          : (trade as any).fill_style === 'BB'
                                            ? 'text-red-300 bg-red-300/20 border border-red-300/40'
                                            : 'text-gray-500 bg-gray-500/20 border border-gray-500/40'
                                      }`}
                                  >
                                    {(trade as any).fill_style}
                                  </span>
                                )}
                              </div>

                              <div className="text-green-400 font-bold text-xs">
                                {formatCurrency(trade.total_premium)}
                              </div>
                            </div>

                            {/* Desktop: Original layout */}

                            <div className="hidden md:block">
                              <div className="flex flex-col space-y-0.5 md:space-y-1">
                                <div className="flex flex-wrap items-center gap-1">
                                  <span
                                    className="text-cyan-400 font-bold size-text"
                                    style={{ fontSize: '12px' }}
                                  >
                                    <span className="hidden md:inline" style={{ fontSize: '19px' }}>
                                      {trade.trade_size.toLocaleString()}
                                    </span>
                                  </span>

                                  <span
                                    className="text-slate-400 premium-at"
                                    style={{ fontSize: '12px' }}
                                  >
                                    <span className="hidden md:inline" style={{ fontSize: '19px' }}>
                                      {' '}
                                      @{' '}
                                    </span>
                                  </span>

                                  <span
                                    className="text-yellow-400 font-bold premium-value"
                                    style={{ fontSize: '12px' }}
                                  >
                                    <span className="hidden md:inline" style={{ fontSize: '19px' }}>
                                      {trade.premium_per_contract.toFixed(2)}
                                    </span>
                                  </span>

                                  {(trade as any).fill_style && (
                                    <span
                                      className={`fill-style-badge ml-1 px-1 md:px-2 py-0.5 rounded-md font-bold ${(trade as any).fill_style === 'A'
                                        ? 'text-green-400 bg-green-400/10 border border-green-400/30'
                                        : (trade as any).fill_style === 'AA'
                                          ? 'text-green-300 bg-green-300/10 border border-green-300/30'
                                          : (trade as any).fill_style === 'B'
                                            ? 'text-red-400 bg-red-400/10 border border-red-400/30'
                                            : (trade as any).fill_style === 'BB'
                                              ? 'text-red-300 bg-red-300/10 border border-red-300/30'
                                              : 'text-gray-500 bg-gray-500/10 border border-gray-500/30'
                                        }`}
                                      style={{ fontSize: '12px' }}
                                    >
                                      <span
                                        className="hidden md:inline"
                                        style={{ fontSize: '15px' }}
                                      >
                                        {(trade as any).fill_style}
                                      </span>
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="hidden md:table-cell p-2 md:p-6 font-bold text-xs md:text-xl text-green-400 border-r border-gray-700/30 premium-text">
                            {formatCurrency(trade.total_premium)}
                          </td>

                          <td className="p-2 md:p-6 text-xs md:text-xl text-white border-r border-gray-700/30 expiry-cell text-center">
                            {/* Mobile: Expiry + Type stacked */}

                            <div className="md:hidden flex flex-col items-center space-y-1">
                              <div
                                className="text-xs font-semibold"
                                style={
                                  isNotablePick
                                    ? { color: '#FFD700', fontWeight: 'bold' }
                                    : { color: 'white' }
                                }
                              >
                                {formatDate(trade.expiry)}
                              </div>

                              <span
                                className={`${getTradeTypeColor(trade.classification || trade.trade_type).className} px-3 py-1 text-xs`}
                                style={getTradeTypeColor(trade.classification || trade.trade_type).style}
                              >
                                {trade.classification || trade.trade_type}
                              </span>
                            </div>

                            {/* Desktop: Expiry only */}

                            <div
                              className="hidden md:block"
                              style={isNotablePick ? { color: '#FFD700', fontWeight: 'bold' } : {}}
                            >
                              {formatDate(trade.expiry)}
                            </div>
                          </td>

                          <td className="p-2 md:p-6 text-xs md:text-xl font-medium border-r border-gray-700/30 price-display text-center">
                            {/* Mobile: Spot + Current stacked vertically */}

                            <div className="md:hidden flex flex-col items-center space-y-1">
                              <div className="text-xs">
                                <span className="font-bold" style={{ color: 'white' }}>
                                  $
                                  {typeof trade.spot_price === 'number'
                                    ? trade.spot_price.toFixed(2)
                                    : parseFloat(trade.spot_price).toFixed(2)}
                                </span>
                              </div>

                              <div className="text-xs">
                                <span
                                  className={`font-bold ${((currentPrices[trade.underlying_ticker] || trade.current_price) ?? 0) > trade.spot_price ? 'text-green-400' : 'text-red-400'}`}
                                >
                                  $
                                  {(
                                    (currentPrices[trade.underlying_ticker] ||
                                      trade.current_price) ??
                                    0
                                  ).toFixed(2)}
                                </span>
                              </div>
                            </div>

                            {/* Desktop: Normal layout */}

                            <div className="hidden md:block">
                              <PriceDisplay
                                spotPrice={trade.spot_price}
                                currentPrice={
                                  currentPrices[trade.underlying_ticker] || trade.current_price
                                }
                                isLoading={priceLoadingState[trade.underlying_ticker]}
                                ticker={trade.underlying_ticker}
                                isNotablePick={isNotablePick}
                              />
                            </div>
                          </td>

                          <td className="hidden md:table-cell p-2 md:p-6 text-xs md:text-xl text-white border-r border-gray-700/30 vol-oi-display">
                            {typeof trade.volume === 'number' &&
                              typeof trade.open_interest === 'number' ? (
                              <div className="flex items-center justify-center gap-1">
                                <span
                                  className="text-cyan-400 font-bold"
                                  style={{ fontSize: '19.2px' }}
                                >
                                  {trade.volume.toLocaleString()}
                                </span>

                                <span className="text-gray-400" style={{ fontSize: '16.8px' }}>
                                  /
                                </span>

                                <span
                                  className="font-bold"
                                  style={{
                                    fontSize: '19.2px',
                                    color:
                                      trade.base_open_interest !== undefined &&
                                        trade.open_interest !== trade.base_open_interest
                                        ? '#FFD700'
                                        : '#a855f7',
                                  }}
                                >
                                  {trade.open_interest.toLocaleString()}
                                </span>
                              </div>
                            ) : (
                              <span className="text-gray-500" style={{ fontSize: '19.2px' }}>
                                --
                              </span>
                            )}
                          </td>

                          <td className="hidden md:table-cell p-2 md:p-6 border-r border-gray-700/30">
                            <span
                              className={`${getTradeTypeColor(trade.classification || trade.trade_type).className} px-4 py-2 text-xs md:text-lg`}
                              style={getTradeTypeColor(trade.classification || trade.trade_type).style}
                            >
                              {(trade.classification || trade.trade_type) === 'MULTI-LEG'
                                ? 'ML'
                                : trade.classification || trade.trade_type}
                            </span>
                          </td>

                          {/* ── Targets column ── */}
                          {notableFilterActive &&
                            (() => {
                              const isCall = trade.type === 'call'
                              const fillStyle = trade.fill_style || ''
                              const isSoldToOpen = fillStyle === 'B' || fillStyle === 'BB'
                              // A/AA: directional — calls go up, puts go down
                              // B/BB: inversed  — calls go down (sold call = bearish), puts go up (sold put = bullish)
                              const targetIsUpside =
                                (isCall && !isSoldToOpen) || (!isCall && isSoldToOpen)
                              const cacheKeyT = trade.underlying_ticker
                              const cachedIV = dealerZoneCache[cacheKeyT]?.atmIV
                              const sigma =
                                cachedIV && cachedIV > 0
                                  ? cachedIV
                                  : trade.implied_volatility && trade.implied_volatility > 0
                                    ? trade.implied_volatility
                                    : 0
                              const t1 =
                                sigma > 0
                                  ? bsStrikeForProb(
                                    trade.spot_price,
                                    sigma,
                                    trade.days_to_expiry,
                                    80,
                                    targetIsUpside
                                  )
                                  : null
                              const t2 =
                                sigma > 0
                                  ? bsStrikeForProb(
                                    trade.spot_price,
                                    sigma,
                                    trade.days_to_expiry,
                                    90,
                                    targetIsUpside
                                  )
                                  : null
                              return (
                                <td className="hidden md:table-cell p-3 md:p-5 border-r border-gray-700/30 align-middle">
                                  {t1 && t2 ? (
                                    <div
                                      style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '5px',
                                      }}
                                    >
                                      <div
                                        style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '6px',
                                        }}
                                      >
                                        <span
                                          style={{
                                            fontSize: '12px',
                                            fontWeight: 700,
                                            color: '#00ff88',
                                            letterSpacing: '1px',
                                            minWidth: '22px',
                                          }}
                                        >
                                          T1
                                        </span>
                                        <span
                                          style={{
                                            fontSize: '17px',
                                            fontWeight: 900,
                                            color: '#ffffff',
                                            letterSpacing: '-0.5px',
                                          }}
                                        >
                                          ${t1.toFixed(2)}
                                        </span>
                                      </div>
                                      <div
                                        style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '6px',
                                        }}
                                      >
                                        <span
                                          style={{
                                            fontSize: '12px',
                                            fontWeight: 700,
                                            color: '#FFA500',
                                            letterSpacing: '1px',
                                            minWidth: '22px',
                                          }}
                                        >
                                          T2
                                        </span>
                                        <span
                                          style={{
                                            fontSize: '17px',
                                            fontWeight: 900,
                                            color: '#ffffff',
                                            letterSpacing: '-0.5px',
                                          }}
                                        >
                                          ${t2.toFixed(2)}
                                        </span>
                                      </div>
                                    </div>
                                  ) : (
                                    <span style={{ color: '#333', fontSize: '12px' }}>—</span>
                                  )}
                                </td>
                              )
                            })()}

                          {/* ── Dealer column ── */}
                          {notableFilterActive &&
                            (() => {
                              const cacheKey = trade.underlying_ticker
                              const zones = dealerZoneCache[cacheKey]
                              const isNotableRow =
                                notableFilterActive ||
                                (efiHighlightsActive && meetsNotableCriteria(trade))
                              return (
                                <td className="hidden md:table-cell p-3 md:p-5 border-r border-gray-700/30 align-middle">
                                  {isNotableRow ? (
                                    zones ? (
                                      <div
                                        style={{
                                          display: 'flex',
                                          flexDirection: 'column',
                                          gap: '5px',
                                        }}
                                      >
                                        <div
                                          style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                          }}
                                        >
                                          <span
                                            style={{
                                              fontSize: '12px',
                                              fontWeight: 700,
                                              color: '#FFD700',
                                              letterSpacing: '1px',
                                              minWidth: '42px',
                                            }}
                                          >
                                            MAGNET
                                          </span>
                                          <span
                                            style={{
                                              fontSize: '17px',
                                              fontWeight: 900,
                                              color: '#FFD700',
                                              letterSpacing: '-0.5px',
                                            }}
                                          >
                                            {zones.golden != null ? `$${zones.golden}` : '—'}
                                          </span>
                                          {zones.goldenExpiry && (
                                            <span
                                              style={{
                                                fontSize: '13px',
                                                fontWeight: 700,
                                                color: '#FFD700',
                                              }}
                                            >
                                              {zones.goldenExpiry.slice(5).replace('-', '/')}
                                            </span>
                                          )}
                                        </div>
                                        <div
                                          style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                          }}
                                        >
                                          <span
                                            style={{
                                              fontSize: '12px',
                                              fontWeight: 700,
                                              color: '#a855f7',
                                              letterSpacing: '1px',
                                              minWidth: '42px',
                                            }}
                                          >
                                            PIVOT
                                          </span>
                                          <span
                                            style={{
                                              fontSize: '17px',
                                              fontWeight: 900,
                                              color: '#a855f7',
                                              letterSpacing: '-0.5px',
                                            }}
                                          >
                                            {zones.purple != null ? `$${zones.purple}` : '—'}
                                          </span>
                                          {zones.purpleExpiry && (
                                            <span
                                              style={{
                                                fontSize: '13px',
                                                fontWeight: 700,
                                                color: '#a855f7',
                                              }}
                                            >
                                              {zones.purpleExpiry.slice(5).replace('-', '/')}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    ) : (
                                      <span
                                        style={{
                                          color: '#555',
                                          fontSize: '10px',
                                          letterSpacing: '1px',
                                        }}
                                      >
                                        ...
                                      </span>
                                    )
                                  ) : (
                                    <span style={{ color: '#333', fontSize: '12px' }}>—</span>
                                  )}
                                </td>
                              )
                            })()}

                          {efiHighlightsActive &&
                            (() => {
                              const expiry = trade.expiry.replace(/-/g, '').slice(2)

                              const strikeFormatted = String(
                                Math.round(trade.strike * 1000)
                              ).padStart(8, '0')

                              const optionType = trade.type.toLowerCase() === 'call' ? 'C' : 'P'

                              const normalizedTicker = normalizeTickerForOptions(
                                trade.underlying_ticker
                              )

                              const optionTicker = `O:${normalizedTicker}${expiry}${optionType}${strikeFormatted}`

                              const currentPrice = currentOptionPrices[optionTicker]

                              const entryPrice = trade.premium_per_contract

                              // Only calculate grade when prices are fetched

                              if (optionPricesFetching) {
                                return (
                                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-center">
                                    <div className="inline-flex items-center gap-2">
                                      <svg
                                        className="animate-spin h-4 w-4 text-orange-500"
                                        xmlns="http://www.w3.org/2000/svg"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                      >
                                        <circle
                                          className="opacity-25"
                                          cx="12"
                                          cy="12"
                                          r="10"
                                          stroke="currentColor"
                                          strokeWidth="4"
                                        ></circle>

                                        <path
                                          className="opacity-75"
                                          fill="currentColor"
                                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                        ></path>
                                      </svg>

                                      <span className="text-gray-400 text-xs">Loading...</span>
                                    </div>
                                  </td>
                                )
                              }

                              // Calculate grade using the centralized function

                              const gradeData = getCachedGrade(trade)

                              if (currentPrice && currentPrice > 0) {
                                const currentValue = currentPrice * trade.trade_size * 100

                                const entryValue = trade.total_premium

                                const rawPercentChange =
                                  ((currentPrice - entryPrice) / entryPrice) * 100

                                // B/BB = sold to open: profit when contract LOSES value, loss when it gains
                                const displayFillStyle = trade.fill_style || ''
                                const isSoldToOpenDisplay =
                                  displayFillStyle === 'B' || displayFillStyle === 'BB'
                                const percentChange = isSoldToOpenDisplay
                                  ? -rawPercentChange
                                  : rawPercentChange

                                // For sold-to-open: profitable when contract price dropped (priceHigher=false = green)
                                const priceHigher = percentChange > 0

                                // Simple color logic: green if position is in profit, red if in loss
                                const color = priceHigher ? '#00ff00' : '#ff0000'

                                // Smart formatting for value

                                const formatValue = (val: number): string => {
                                  if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`

                                  if (val >= 1000) return `$${(val / 1000).toFixed(1)}K`

                                  return `$${val.toFixed(0)}`
                                }

                                // Use calculated grade data

                                const { grade, color: scoreColor, breakdown } = gradeData

                                return (
                                  <td
                                    className="p-2 md:p-6 border-r border-gray-700/30"
                                    style={{
                                      position: 'relative',

                                      zIndex: hoveredGradeIndex === index ? 99999 : 'auto',
                                    }}
                                  >
                                    {/* Mobile: Compact grade + percentage */}

                                    <div className="md:hidden flex flex-col items-center space-y-1">
                                      <span
                                        style={{
                                          color: scoreColor,

                                          fontWeight: 'bold',

                                          fontSize: '14px',

                                          textShadow: `0 1px 2px rgba(0, 0, 0, 0.8)`,
                                        }}
                                      >
                                        {grade}
                                      </span>

                                      <span
                                        style={{
                                          color,

                                          fontWeight: 'bold',

                                          fontSize: '12px',
                                        }}
                                      >
                                        {priceHigher ? '+' : ''}
                                        {percentChange.toFixed(1)}%
                                      </span>
                                    </div>

                                    {/* Desktop: Original large circle display */}

                                    <div className="hidden md:flex items-center gap-2">
                                      <div
                                        style={{
                                          display: 'inline-flex',

                                          alignItems: 'center',

                                          justifyContent: 'center',

                                          width: '78px',

                                          height: '78px',

                                          border: `6px solid ${scoreColor}`,

                                          borderRadius: '50%',

                                          background: `linear-gradient(135deg, ${scoreColor}20 0%, ${scoreColor}05 50%, ${scoreColor}30 100%)`,

                                          marginLeft: '10px',

                                          transform: 'rotate(-12deg)',

                                          boxShadow: `

 0 8px 16px rgba(0, 0, 0, 0.6),

 inset 0 -3px 8px rgba(0, 0, 0, 0.7),

 inset 0 3px 8px rgba(255, 255, 255, 0.1)

 `,

                                          position: 'relative',
                                        }}
                                      >
                                        <div
                                          style={{
                                            position: 'absolute',

                                            top: '3px',

                                            left: '3px',

                                            right: '3px',

                                            bottom: '3px',

                                            border: `2px dashed ${scoreColor}80`,

                                            borderRadius: '50%',
                                          }}
                                        ></div>

                                        <span
                                          onMouseEnter={() => setHoveredGradeIndex(index)}
                                          onMouseLeave={() => setHoveredGradeIndex(null)}
                                          style={{
                                            color: scoreColor,

                                            fontWeight: 'normal',

                                            fontSize: '20px',

                                            fontStyle: 'italic',

                                            fontFamily: 'Impact, Georgia, serif',

                                            textShadow: `

 0 3px 0 rgba(0, 0, 0, 0.8),

 0 -1px 0 rgba(255, 255, 255, 0.3),

 2px 2px 4px rgba(0, 0, 0, 0.9)

 `,

                                            transform: 'rotate(12deg)',

                                            letterSpacing: '1px',

                                            filter: 'drop-shadow(0 2px 3px rgba(0, 0, 0, 0.8))',

                                            WebkitTextStroke: `0.5px ${scoreColor}`,

                                            cursor: 'help',

                                            position: 'relative',
                                          }}
                                        >
                                          {grade}

                                          {hoveredGradeIndex === index &&
                                            (index < 3 ? (
                                              <div
                                                style={{
                                                  position: 'absolute',

                                                  top: '100%',

                                                  left: '50%',

                                                  transform: 'translateX(-50%) translateY(12px)',

                                                  backgroundColor: '#000000',

                                                  color: '#ffffff',

                                                  padding: '16px 20px',

                                                  borderRadius: '12px',

                                                  fontSize: '15px',

                                                  fontFamily: 'monospace',

                                                  fontStyle: 'normal',

                                                  fontWeight: 'normal',

                                                  whiteSpace: 'pre-line',

                                                  zIndex: 99999,

                                                  minWidth: '280px',

                                                  boxShadow: `

 0 8px 32px rgba(0, 0, 0, 0.8),

 0 0 0 2px ${scoreColor}40

 `,

                                                  border: `2px solid ${scoreColor}`,

                                                  lineHeight: '1.8',

                                                  letterSpacing: '0.5px',

                                                  textShadow: 'none',

                                                  WebkitTextStroke: '0',

                                                  pointerEvents: 'none',
                                                }}
                                              >
                                                <div
                                                  style={{
                                                    marginBottom: '8px',
                                                    fontWeight: 'bold',
                                                    fontSize: '16px',
                                                  }}
                                                >
                                                  Score:{' '}
                                                  <span style={{ color: scoreColor }}>
                                                    {gradeData.score}/100
                                                  </span>
                                                </div>

                                                <div
                                                  style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                  }}
                                                >
                                                  <span>Expiration:</span>

                                                  <span
                                                    style={{
                                                      color:
                                                        gradeData.scores.expiration === 0
                                                          ? '#ff0000'
                                                          : gradeData.scores.expiration === 25
                                                            ? '#00ff00'
                                                            : '#ffffff',
                                                    }}
                                                  >
                                                    {gradeData.scores.expiration}/25
                                                  </span>
                                                </div>

                                                <div
                                                  style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                  }}
                                                >
                                                  <span>Rel. Strength:</span>

                                                  <span
                                                    style={{
                                                      color:
                                                        gradeData.scores.relativeStrength === 0
                                                          ? '#ff0000'
                                                          : gradeData.scores.relativeStrength === 10
                                                            ? '#00ff00'
                                                            : '#ffffff',
                                                    }}
                                                  >
                                                    {gradeData.scores.relativeStrength}/10
                                                  </span>
                                                </div>

                                                <div
                                                  style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                  }}
                                                >
                                                  <span>Contract P&L:</span>

                                                  <span
                                                    style={{
                                                      color:
                                                        gradeData.scores.contractPrice === 0
                                                          ? '#ff0000'
                                                          : gradeData.scores.contractPrice === 15
                                                            ? '#00ff00'
                                                            : '#ffffff',
                                                    }}
                                                  >
                                                    {gradeData.scores.contractPrice}/15
                                                  </span>
                                                </div>

                                                <div
                                                  style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                  }}
                                                >
                                                  <span>Combo Trade:</span>

                                                  <span
                                                    style={{
                                                      color:
                                                        gradeData.scores.combo === 0
                                                          ? '#ff0000'
                                                          : gradeData.scores.combo === 10
                                                            ? '#00ff00'
                                                            : '#ffffff',
                                                    }}
                                                  >
                                                    {gradeData.scores.combo}/10
                                                  </span>
                                                </div>

                                                <div
                                                  style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                  }}
                                                >
                                                  <span>Price Action:</span>

                                                  <span
                                                    style={{
                                                      color:
                                                        gradeData.scores.priceAction === 0
                                                          ? '#ff0000'
                                                          : gradeData.scores.priceAction === 10
                                                            ? '#00ff00'
                                                            : '#ffffff',
                                                    }}
                                                  >
                                                    {gradeData.scores.priceAction}/10
                                                  </span>
                                                </div>

                                                <div
                                                  style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                  }}
                                                >
                                                  <span>Volume vs OI:</span>

                                                  <span
                                                    style={{
                                                      color:
                                                        gradeData.scores.volumeOI === 0
                                                          ? '#ff0000'
                                                          : gradeData.scores.volumeOI === 15
                                                            ? '#00ff00'
                                                            : '#ffffff',
                                                    }}
                                                  >
                                                    {gradeData.scores.volumeOI}/15
                                                  </span>
                                                </div>

                                                <div
                                                  style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                  }}
                                                >
                                                  <span>Stock Reaction:</span>

                                                  <span
                                                    style={{
                                                      color:
                                                        gradeData.scores.stockReaction === 0
                                                          ? '#ff0000'
                                                          : gradeData.scores.stockReaction === 15
                                                            ? '#00ff00'
                                                            : '#ffffff',
                                                    }}
                                                  >
                                                    {gradeData.scores.stockReaction}/15
                                                  </span>
                                                </div>

                                                {gradeData.stdDevError && (
                                                  <div
                                                    style={{
                                                      color: '#ef4444',
                                                      fontSize: '12px',
                                                      marginTop: '4px',
                                                      fontStyle: 'italic',
                                                    }}
                                                  >
                                                    ⚠ StdDev fetch failed — Price Action unscored
                                                  </div>
                                                )}

                                                <div
                                                  style={{
                                                    position: 'absolute',

                                                    top: '-10px',

                                                    left: '50%',

                                                    transform: 'translateX(-50%)',

                                                    width: 0,

                                                    height: 0,

                                                    borderLeft: '10px solid transparent',

                                                    borderRight: '10px solid transparent',

                                                    borderBottom: `10px solid ${scoreColor}`,
                                                  }}
                                                ></div>
                                              </div>
                                            ) : (
                                              <div
                                                style={{
                                                  position: 'absolute',

                                                  bottom: '100%',

                                                  left: '50%',

                                                  transform: 'translateX(-50%) translateY(-12px)',

                                                  backgroundColor: '#000000',

                                                  color: '#ffffff',

                                                  padding: '16px 20px',

                                                  borderRadius: '12px',

                                                  fontSize: '15px',

                                                  fontFamily: 'monospace',

                                                  fontStyle: 'normal',

                                                  fontWeight: 'normal',

                                                  whiteSpace: 'pre-line',

                                                  zIndex: 99999,

                                                  minWidth: '280px',

                                                  boxShadow: `

 0 8px 32px rgba(0, 0, 0, 0.8),

 0 0 0 2px ${scoreColor}40

 `,

                                                  border: `2px solid ${scoreColor}`,

                                                  lineHeight: '1.8',

                                                  letterSpacing: '0.5px',

                                                  textShadow: 'none',

                                                  WebkitTextStroke: '0',

                                                  pointerEvents: 'none',
                                                }}
                                              >
                                                <div
                                                  style={{
                                                    marginBottom: '8px',
                                                    fontWeight: 'bold',
                                                    fontSize: '16px',
                                                  }}
                                                >
                                                  Score:{' '}
                                                  <span style={{ color: scoreColor }}>
                                                    {gradeData.score}/100
                                                  </span>
                                                </div>

                                                <div
                                                  style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                  }}
                                                >
                                                  <span>Expiration:</span>

                                                  <span
                                                    style={{
                                                      color:
                                                        gradeData.scores.expiration === 0
                                                          ? '#ff0000'
                                                          : gradeData.scores.expiration === 25
                                                            ? '#00ff00'
                                                            : '#ffffff',
                                                    }}
                                                  >
                                                    {gradeData.scores.expiration}/25
                                                  </span>
                                                </div>

                                                <div
                                                  style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                  }}
                                                >
                                                  <span>Rel. Strength:</span>

                                                  <span
                                                    style={{
                                                      color:
                                                        gradeData.scores.relativeStrength === 0
                                                          ? '#ff0000'
                                                          : gradeData.scores.relativeStrength === 10
                                                            ? '#00ff00'
                                                            : '#ffffff',
                                                    }}
                                                  >
                                                    {gradeData.scores.relativeStrength}/10
                                                  </span>
                                                </div>

                                                <div
                                                  style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                  }}
                                                >
                                                  <span>Contract P&L:</span>

                                                  <span
                                                    style={{
                                                      color:
                                                        gradeData.scores.contractPrice === 0
                                                          ? '#ff0000'
                                                          : gradeData.scores.contractPrice === 15
                                                            ? '#00ff00'
                                                            : '#ffffff',
                                                    }}
                                                  >
                                                    {gradeData.scores.contractPrice}/15
                                                  </span>
                                                </div>

                                                <div
                                                  style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                  }}
                                                >
                                                  <span>Combo Trade:</span>

                                                  <span
                                                    style={{
                                                      color:
                                                        gradeData.scores.combo === 0
                                                          ? '#ff0000'
                                                          : gradeData.scores.combo === 10
                                                            ? '#00ff00'
                                                            : '#ffffff',
                                                    }}
                                                  >
                                                    {gradeData.scores.combo}/10
                                                  </span>
                                                </div>

                                                <div
                                                  style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                  }}
                                                >
                                                  <span>Price Action:</span>

                                                  <span
                                                    style={{
                                                      color:
                                                        gradeData.scores.priceAction === 0
                                                          ? '#ff0000'
                                                          : gradeData.scores.priceAction === 10
                                                            ? '#00ff00'
                                                            : '#ffffff',
                                                    }}
                                                  >
                                                    {gradeData.scores.priceAction}/10
                                                  </span>
                                                </div>

                                                <div
                                                  style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                  }}
                                                >
                                                  <span>Volume vs OI:</span>

                                                  <span
                                                    style={{
                                                      color:
                                                        gradeData.scores.volumeOI === 0
                                                          ? '#ff0000'
                                                          : gradeData.scores.volumeOI === 15
                                                            ? '#00ff00'
                                                            : '#ffffff',
                                                    }}
                                                  >
                                                    {gradeData.scores.volumeOI}/15
                                                  </span>
                                                </div>

                                                <div
                                                  style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                  }}
                                                >
                                                  <span>Stock Reaction:</span>

                                                  <span
                                                    style={{
                                                      color:
                                                        gradeData.scores.stockReaction === 0
                                                          ? '#ff0000'
                                                          : gradeData.scores.stockReaction === 15
                                                            ? '#00ff00'
                                                            : '#ffffff',
                                                    }}
                                                  >
                                                    {gradeData.scores.stockReaction}/15
                                                  </span>
                                                </div>

                                                {gradeData.stdDevError && (
                                                  <div
                                                    style={{
                                                      color: '#ef4444',
                                                      fontSize: '12px',
                                                      marginTop: '4px',
                                                      fontStyle: 'italic',
                                                    }}
                                                  >
                                                    ⚠ StdDev fetch failed — Price Action unscored
                                                  </div>
                                                )}

                                                <div
                                                  style={{
                                                    position: 'absolute',

                                                    bottom: '-10px',

                                                    left: '50%',

                                                    transform: 'translateX(-50%)',

                                                    width: 0,

                                                    height: 0,

                                                    borderLeft: '10px solid transparent',

                                                    borderRight: '10px solid transparent',

                                                    borderTop: `10px solid ${scoreColor}`,
                                                  }}
                                                ></div>
                                              </div>
                                            ))}
                                        </span>
                                      </div>

                                      <span
                                        style={{
                                          color,
                                          fontWeight: 'bold',
                                          fontSize: '16.8px',
                                          whiteSpace: 'nowrap',
                                        }}
                                      >
                                        ${currentPrice.toFixed(2)}
                                      </span>

                                      <span
                                        style={{ color, fontSize: '14.4px', whiteSpace: 'nowrap' }}
                                      >
                                        {formatValue(currentValue)}
                                      </span>

                                      <span
                                        style={{
                                          color,
                                          fontWeight: 'bold',
                                          fontSize: '15.6px',
                                          whiteSpace: 'nowrap',
                                        }}
                                      >
                                        {priceHigher ? '+' : ''}
                                        {percentChange.toFixed(1)}%
                                      </span>
                                    </div>
                                  </td>
                                )
                              } else {
                                const todayLocal = new Date().toLocaleDateString('en-CA')
                                const isExpired = trade.expiry < todayLocal
                                return (
                                  <td className="p-2 md:p-6 border-r border-gray-700/30">
                                    <span className="text-gray-500 text-sm">
                                      {isExpired ? 'Expired' : 'N/A'}
                                    </span>
                                  </td>
                                )
                              }
                            })()}
                        </tr>

                        {/* Mobile 3rd row: T1 / T2 / Magnet / Pivot — only for notable picks on mobile */}
                        {isMobileView &&
                          isNotablePick &&
                          (() => {
                            const isCall2 = trade.type === 'call'
                            const fillStyle2 = (trade as any).fill_style || ''
                            const isSold2 = fillStyle2 === 'B' || fillStyle2 === 'BB'
                            const targetUp2 = (isCall2 && !isSold2) || (!isCall2 && isSold2)
                            const cachedIV2 = dealerZoneCache[trade.underlying_ticker]?.atmIV
                            const sigma2 =
                              cachedIV2 && cachedIV2 > 0
                                ? cachedIV2
                                : trade.implied_volatility && trade.implied_volatility > 0
                                  ? trade.implied_volatility
                                  : 0
                            const t1m =
                              sigma2 > 0
                                ? bsStrikeForProb(
                                  trade.spot_price,
                                  sigma2,
                                  trade.days_to_expiry,
                                  80,
                                  targetUp2
                                )
                                : null
                            const t2m =
                              sigma2 > 0
                                ? bsStrikeForProb(
                                  trade.spot_price,
                                  sigma2,
                                  trade.days_to_expiry,
                                  90,
                                  targetUp2
                                )
                                : null
                            const zones2 = dealerZoneCache[trade.underlying_ticker]
                            const dirBg = targetUp2 ? 'rgba(0,180,60,0.22)' : 'rgba(200,30,30,0.22)'
                            const dirBorder = targetUp2
                              ? '1px solid rgba(0,220,80,0.5)'
                              : '1px solid rgba(220,40,40,0.5)'
                            return (
                              <tr
                                className="md:hidden border-b border-slate-700/50"
                                style={{ background: 'rgba(0,0,0,0.6)' }}
                              >
                                <td colSpan={99} style={{ padding: '6px 10px' }}>
                                  <div
                                    style={{
                                      display: 'grid',
                                      gridTemplateColumns: '0.8fr 0.8fr 0.9fr 0.9fr',
                                      gap: '4px',
                                    }}
                                  >
                                    {/* T1 */}
                                    <div
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '4px',
                                        background: dirBg,
                                        borderRadius: '4px',
                                        padding: '5px 4px',
                                        border: dirBorder,
                                      }}
                                    >
                                      <span
                                        style={{
                                          fontSize: '9px',
                                          fontWeight: 700,
                                          color: '#ffffff',
                                          letterSpacing: '0.5px',
                                          whiteSpace: 'nowrap',
                                        }}
                                      >
                                        T1
                                      </span>
                                      <span
                                        style={{
                                          fontSize: '13px',
                                          fontWeight: 900,
                                          color: '#ffffff',
                                        }}
                                      >
                                        {t1m ? `$${t1m.toFixed(2)}` : '—'}
                                      </span>
                                    </div>
                                    {/* T2 */}
                                    <div
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '4px',
                                        background: dirBg,
                                        borderRadius: '4px',
                                        padding: '5px 4px',
                                        border: dirBorder,
                                      }}
                                    >
                                      <span
                                        style={{
                                          fontSize: '9px',
                                          fontWeight: 700,
                                          color: '#ffffff',
                                          letterSpacing: '0.5px',
                                          whiteSpace: 'nowrap',
                                        }}
                                      >
                                        T2
                                      </span>
                                      <span
                                        style={{
                                          fontSize: '13px',
                                          fontWeight: 900,
                                          color: '#ffffff',
                                        }}
                                      >
                                        {t2m ? `$${t2m.toFixed(2)}` : '—'}
                                      </span>
                                    </div>
                                    {/* Magnet */}
                                    <div
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '4px',
                                        background: dirBg,
                                        borderRadius: '4px',
                                        padding: '5px 4px',
                                        border: dirBorder,
                                      }}
                                    >
                                      <span
                                        style={{
                                          fontSize: '9px',
                                          fontWeight: 700,
                                          color: '#FFD700',
                                          letterSpacing: '0.5px',
                                          whiteSpace: 'nowrap',
                                        }}
                                      >
                                        MAG
                                      </span>
                                      <span
                                        style={{
                                          fontSize: '13px',
                                          fontWeight: 900,
                                          color: '#FFD700',
                                        }}
                                      >
                                        {zones2?.golden != null ? `$${zones2.golden}` : '…'}
                                        {zones2?.goldenExpiry && (
                                          <span
                                            style={{
                                              fontSize: '9px',
                                              marginLeft: '2px',
                                              color: '#FFD700',
                                            }}
                                          >
                                            {zones2.goldenExpiry.slice(5).replace('-', '/')}
                                          </span>
                                        )}
                                      </span>
                                    </div>
                                    {/* Pivot */}
                                    <div
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '4px',
                                        background: dirBg,
                                        borderRadius: '4px',
                                        padding: '5px 4px',
                                        border: dirBorder,
                                      }}
                                    >
                                      <span
                                        style={{
                                          fontSize: '9px',
                                          fontWeight: 700,
                                          color: '#dd44ff',
                                          letterSpacing: '0.5px',
                                          whiteSpace: 'nowrap',
                                        }}
                                      >
                                        PIV
                                      </span>
                                      <span
                                        style={{
                                          fontSize: '13px',
                                          fontWeight: 900,
                                          color: '#dd44ff',
                                        }}
                                      >
                                        {zones2?.purple != null ? `$${zones2.purple}` : '…'}
                                        {zones2?.purpleExpiry && (
                                          <span
                                            style={{
                                              fontSize: '9px',
                                              marginLeft: '2px',
                                              color: '#dd44ff',
                                            }}
                                          >
                                            {zones2.purpleExpiry.slice(5).replace('-', '/')}
                                          </span>
                                        )}
                                      </span>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )
                          })()}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>

              {paginatedData.length === 0 && filteredAndSortedData.length === 0 && (
                <div className="text-center py-12 text-slate-400 text-2xl font-semibold">
                  {loading ? (
                    <div className="flex flex-col items-center justify-center space-y-4">
                      <div className="flex items-center space-x-3">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>

                        <span>{streamingStatus || 'Loading premium options flow data...'}</span>
                      </div>
                    </div>
                  ) : (
                    'No trades found matching the current filters.'
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {false && (
        <div>
          {/* dead legacy panel - kept for reference only, never renders */}
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

                textShadow: 'none',

                letterSpacing: '3px',

                fontWeight: 900,

                opacity: 1,

                animation: 'gradientShift 3s ease infinite',
              }}
            >
              LIVE FLOW TRACKING
            </h2>

            <style jsx>{`
              @keyframes gradientShift {
                0% {
                  background-position: 0% 50%;
                }

                50% {
                  background-position: 100% 50%;
                }

                100% {
                  background-position: 0% 50%;
                }
              }
            `}</style>

            {/* Filters */}

            <div
              className="mt-3"
              style={{
                background: '#000000',

                borderRadius: '8px',

                padding: '12px',
              }}
            >
              {/* All Filters in One Row */}

              <div className="flex items-center gap-3 justify-center flex-wrap">
                <span style={{ color: '#ffffff', fontSize: '16px', fontWeight: 'bold' }}>
                  Flows: {trackedFlows.length}
                </span>

                <div
                  style={{
                    width: '2px',
                    height: '30px',
                    background: 'rgba(255, 133, 0, 0.3)',
                    margin: '0 8px',
                  }}
                ></div>

                <span style={{ color: '#ff8500', fontSize: '16px', fontWeight: 'bold' }}>
                  Grade:
                </span>

                <select
                  value={flowTrackingFilters.gradeFilter}
                  onChange={(e) =>
                    setFlowTrackingFilters((prev) => ({
                      ...prev,
                      gradeFilter: e.target.value as any,
                    }))
                  }
                  style={{
                    padding: '6px 12px',

                    fontSize: '15px',

                    fontWeight: 'bold',

                    borderRadius: '6px',

                    border: 'none',

                    cursor: 'pointer',

                    background: '#000000',

                    color: '#ffffff',

                    outline: 'none',

                    minWidth: '100px',

                    boxShadow:
                      'inset 2px 2px 4px rgba(0,0,0,0.8), inset -2px -2px 4px rgba(255,255,255,0.05)',
                  }}
                >
                  <option value="ALL" style={{ background: '#000', color: '#ff8500' }}>
                    ALL
                  </option>

                  <option value="A" style={{ background: '#000', color: '#00ff00' }}>
                    A
                  </option>

                  <option value="B" style={{ background: '#000', color: '#ffff00' }}>
                    B
                  </option>

                  <option value="C" style={{ background: '#000', color: '#ff8500' }}>
                    C
                  </option>

                  <option value="D" style={{ background: '#000', color: '#ff0000' }}>
                    D
                  </option>

                  <option value="F" style={{ background: '#000', color: '#ff0000' }}>
                    F
                  </option>
                </select>

                <div
                  style={{
                    width: '2px',
                    height: '30px',
                    background: 'rgba(255, 133, 0, 0.3)',
                    margin: '0 8px',
                  }}
                ></div>

                <button
                  onClick={() =>
                    setFlowTrackingFilters((prev) => ({
                      ...prev,
                      showDownSixtyPlus: !prev.showDownSixtyPlus,
                    }))
                  }
                  style={{
                    padding: '6px 14px',

                    fontSize: '15px',

                    fontWeight: 'bold',

                    borderRadius: '6px',

                    border: 'none',

                    cursor: 'pointer',

                    background: flowTrackingFilters.showDownSixtyPlus ? '#ff0000' : '#000000',

                    color: flowTrackingFilters.showDownSixtyPlus ? '#ffffff' : '#ff0000',

                    transition: 'all 0.2s',

                    boxShadow: flowTrackingFilters.showDownSixtyPlus
                      ? '0 2px 8px rgba(255, 0, 0, 0.4)'
                      : 'inset 2px 2px 4px rgba(0,0,0,0.8), inset -2px -2px 4px rgba(255,255,255,0.05)',
                  }}
                >
                  Down 60%+
                </button>

                <button
                  onClick={() =>
                    setFlowTrackingFilters((prev) => ({ ...prev, showCharts: !prev.showCharts }))
                  }
                  style={{
                    padding: '6px 14px',

                    fontSize: '15px',

                    fontWeight: 'bold',

                    borderRadius: '6px',

                    border: 'none',

                    cursor: 'pointer',

                    background: flowTrackingFilters.showCharts ? '#00ffff' : '#000000',

                    color: flowTrackingFilters.showCharts ? '#000000' : '#00ffff',

                    transition: 'all 0.2s',

                    boxShadow: flowTrackingFilters.showCharts
                      ? '0 2px 8px rgba(0, 255, 255, 0.4)'
                      : 'inset 2px 2px 4px rgba(0,0,0,0.8), inset -2px -2px 4px rgba(255,255,255,0.05)',
                  }}
                >
                  Chart
                </button>

                <button
                  onClick={() =>
                    setFlowTrackingFilters((prev) => ({
                      ...prev,
                      showWeeklies: !prev.showWeeklies,
                    }))
                  }
                  style={{
                    padding: '6px 14px',

                    fontSize: '15px',

                    fontWeight: 'bold',

                    borderRadius: '6px',

                    border: 'none',

                    cursor: 'pointer',

                    background: flowTrackingFilters.showWeeklies ? '#00ff00' : '#000000',

                    color: flowTrackingFilters.showWeeklies ? '#000000' : '#00ff00',

                    transition: 'all 0.2s',

                    boxShadow: flowTrackingFilters.showWeeklies
                      ? '0 2px 8px rgba(0, 255, 0, 0.4)'
                      : 'inset 2px 2px 4px rgba(0,0,0,0.8), inset -2px -2px 4px rgba(255,255,255,0.05)',
                  }}
                >
                  Weeklies
                </button>
              </div>
            </div>
          </div>

          {/* Panel Content with Scrollbar */}

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
              trackedFlows
                .filter((flow) => {
                  // Remove expired options (expired today or earlier)

                  const expiryDate = new Date(flow.expiry)

                  const now = new Date()

                  // Set both dates to midnight for accurate comparison

                  expiryDate.setHours(0, 0, 0, 0)

                  now.setHours(0, 0, 0, 0)

                  // If expiration date has passed, remove it

                  if (now > expiryDate) {
                    return false // Filter out expired options
                  }

                  const expiry = flow.expiry.replace(/-/g, '').slice(2)

                  const strikeFormatted = String(Math.round(flow.strike * 1000)).padStart(8, '0')

                  const optionType = flow.type.toLowerCase() === 'call' ? 'C' : 'P'

                  const normalizedTicker = normalizeTickerForOptions(flow.underlying_ticker)

                  const optionTicker = `O:${normalizedTicker}${expiry}${optionType}${strikeFormatted}`

                  const currentPrice = currentOptionPrices[optionTicker]

                  const entryPrice = (flow as any).originalPrice || flow.premium_per_contract

                  // Calculate grade for filtering

                  let gradeData: any = null

                  if (currentPrice && currentPrice > 0) {
                    try {
                      gradeData = getCachedGrade(flow)
                    } catch (error) {
                      // Grade calculation failed - missing data

                      gradeData = null
                    }
                  }

                  // Grade filter

                  if (flowTrackingFilters.gradeFilter !== 'ALL' && gradeData) {
                    if (gradeData.grade !== flowTrackingFilters.gradeFilter) return false
                  }

                  // Down 60%+ filter

                  if (flowTrackingFilters.showDownSixtyPlus && currentPrice && currentPrice > 0) {
                    const rawPct = ((currentPrice - entryPrice) / entryPrice) * 100
                    const flowFill = flow.fill_style || ''
                    const flowSoldToOpen = flowFill === 'B' || flowFill === 'BB'
                    const percentChange = flowSoldToOpen ? -rawPct : rawPct

                    if (percentChange > -60) return false
                  }

                  // Weeklies filter (0-7 days)

                  if (flowTrackingFilters.showWeeklies) {
                    const expiryDate = new Date(flow.expiry)

                    const daysToExpiry = Math.floor(
                      (expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                    )

                    if (daysToExpiry > 7) return false
                  }

                  return true
                })
                .map((flow) => {
                  // Get current prices for grading (only these update dynamically)

                  const expiry = flow.expiry.replace(/-/g, '').slice(2)

                  const strikeFormatted = String(Math.round(flow.strike * 1000)).padStart(8, '0')

                  const optionType = flow.type.toLowerCase() === 'call' ? 'C' : 'P'

                  const normalizedTicker = normalizeTickerForOptions(flow.underlying_ticker)

                  const optionTicker = `O:${normalizedTicker}${expiry}${optionType}${strikeFormatted}`

                  const currentPrice = currentOptionPrices[optionTicker]

                  // Use original stored price, not current flow data

                  const entryPrice = (flow as any).originalPrice || flow.premium_per_contract

                  // Calculate grade if prices available

                  let gradeData: any = null

                  if (currentPrice && currentPrice > 0) {
                    try {
                      gradeData = getCachedGrade(flow)
                    } catch (error) {
                      // Grade calculation failed - missing data for this ticker

                      console.warn(`Grade calculation failed for ${flow.underlying_ticker}:`, error)

                      gradeData = null
                    }
                  }

                  // Calculate P&L

                  let percentChange = 0

                  let priceHigher = false

                  const fillStyle = flow.fill_style || ''

                  const isSoldToOpen = fillStyle === 'B' || fillStyle === 'BB'

                  if (currentPrice && currentPrice > 0) {
                    const rawPercentChange = ((currentPrice - entryPrice) / entryPrice) * 100

                    // B/BB = sold to open: profit when contract LOSES value (flip the sign)
                    percentChange = isSoldToOpen ? -rawPercentChange : rawPercentChange

                    priceHigher = percentChange > 0
                  }

                  // Determine P&L color based on actual P&L direction

                  let plColor = '#9ca3af' // default gray

                  if (currentPrice && currentPrice > 0) {
                    plColor = priceHigher ? '#00ff00' : '#ff0000'
                  }

                  // Generate flow ID for tracking timeframes

                  const flowId = generateFlowId(flow)

                  // Calculate swipe offset for this flow

                  const isThisFlowSwiped = swipedFlowId === flowId

                  const swipeOffset = isThisFlowSwiped ? Math.min(0, touchCurrent - touchStart) : 0

                  const showDeleteButton = swipeOffset < -50

                  const handleTouchStart = (e: React.TouchEvent) => {
                    setSwipedFlowId(flowId)

                    setTouchStart(e.touches[0].clientX)

                    setTouchCurrent(e.touches[0].clientX)
                  }

                  const handleTouchMove = (e: React.TouchEvent) => {
                    if (swipedFlowId === flowId) {
                      setTouchCurrent(e.touches[0].clientX)
                    }
                  }

                  const handleTouchEnd = () => {
                    if (Math.abs(swipeOffset) < 50) {
                      // Snap back if not swiped enough

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
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.6)',
                      }}
                    >
                      {/* Delete Button - Revealed on Swipe Left (Mobile Only) */}

                      <div
                        className="md:hidden absolute right-0 top-0 bottom-0 flex items-center justify-center bg-red-600 px-6"
                        style={{
                          width: '100px',

                          transition: 'opacity 0.2s',
                        }}
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

                      {/* Main Content - Swipeable */}

                      <div
                        className="bg-black border border-gray-700 rounded hover:border-gray-600 transition-all duration-200 relative"
                        style={{
                          transform: `translateX(${swipeOffset}px)`,

                          transition:
                            swipedFlowId === flowId && touchCurrent !== touchStart
                              ? 'none'
                              : 'transform 0.3s ease-out',
                        }}
                        onTouchStart={handleTouchStart}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                      >
                        {/* Desktop Delete Button - Top Right */}

                        <button
                          onClick={() => removeFromFlowTracking(flow)}
                          className="hidden md:block absolute top-1 right-1 z-10 text-red-500 hover:text-red-400 transition-colors bg-black/80 rounded-full p-1"
                          title={`Remove from tracking | Added: ${(flow as any).addedAt ? formatTime((flow as any).addedAt) : formatTime(flow.trade_timestamp)}`}
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

                        {/* Table Layout for all screen sizes */}

                        <div className="p-1">
                          <table className="w-full text-center" style={{ tableLayout: 'fixed' }}>
                            <tbody>
                              <tr className="border-b border-gray-700">
                                {/* Column 1: Symbol (Ticker + Time stacked) */}

                                <td className="p-1" style={{ width: '15%' }}>
                                  <div className="flex flex-col items-center space-y-0.5">
                                    <span className="bg-gradient-to-b from-gray-800 to-black text-orange-500 font-bold px-1.5 py-0.5 border border-gray-500/70 text-base">
                                      {flow.underlying_ticker}
                                    </span>

                                    <span className="text-sm text-gray-300">
                                      {formatTime(flow.trade_timestamp)}
                                    </span>
                                  </div>
                                </td>

                                {/* Column 2: Strike (Strike + Call/Put stacked) */}

                                <td className="p-1" style={{ width: '15%' }}>
                                  <div className="flex flex-col items-center space-y-0.5">
                                    <span className="text-white font-semibold text-base">
                                      ${flow.strike}
                                    </span>

                                    <span
                                      className={`font-bold text-sm ${flow.type === 'call' ? 'text-green-500' : 'text-red-500'}`}
                                    >
                                      {flow.type.toUpperCase()}
                                    </span>
                                  </div>
                                </td>

                                {/* Column 3: Size (Size@Price+FillStyle + Total Premium stacked) */}

                                <td className="p-1" style={{ width: '30%' }}>
                                  <div className="flex flex-col items-center space-y-0.5">
                                    <div className="flex items-center gap-0.5 flex-wrap justify-center">
                                      <span className="text-cyan-400 font-bold text-base">
                                        {flow.trade_size.toLocaleString()}
                                      </span>

                                      <span className="text-yellow-400 text-base">
                                        @${entryPrice.toFixed(2)}
                                      </span>

                                      {fillStyle && (
                                        <span
                                          className={`text-base font-bold ${fillStyle === 'A' || fillStyle === 'AA' ? 'text-green-400' : fillStyle === 'B' || fillStyle === 'BB' ? 'text-red-400' : 'text-orange-400'}`}
                                        >
                                          {fillStyle}
                                        </span>
                                      )}
                                    </div>

                                    <span className="font-bold text-sm text-green-400">
                                      {formatCurrency(flow.total_premium)}
                                    </span>
                                  </div>
                                </td>

                                {/* Column 4: Expiry/Type (Expiry + Trade Type stacked) */}

                                <td className="p-1" style={{ width: '20%' }}>
                                  <div className="flex flex-col items-center space-y-0.5">
                                    <span className="text-white text-sm">
                                      {formatDate(flow.expiry)}
                                    </span>

                                    {flow.trade_type &&
                                      (flow.trade_type === 'SWEEP' ||
                                        flow.trade_type === 'BLOCK') && (
                                        <span
                                          className="font-bold text-sm"
                                          style={{
                                            color:
                                              flow.trade_type === 'SWEEP'
                                                ? '#FFD700'
                                                : 'rgba(0, 150, 255, 1)',
                                          }}
                                        >
                                          {flow.trade_type}
                                        </span>
                                      )}
                                  </div>
                                </td>

                                {/* Column 5: Grade/P&L (Grade + Percentage stacked) */}

                                <td className="p-1" style={{ width: '20%' }}>
                                  <div className="flex flex-col items-center space-y-0.5">
                                    {gradeData && currentPrice && currentPrice > 0 ? (
                                      <>
                                        <span
                                          className="font-bold text-sm"
                                          style={{
                                            color: gradeData.color,

                                            border: `2px solid ${gradeData.color}`,

                                            borderRadius: '4px',

                                            padding: '2px 6px',

                                            boxShadow: `0 0 6px ${gradeData.color}40`,
                                          }}
                                        >
                                          {gradeData.grade}
                                        </span>

                                        <span
                                          className="font-bold text-sm"
                                          style={{
                                            color: priceHigher ? '#00ff00' : '#ff0000',
                                          }}
                                        >
                                          {priceHigher ? '+' : ''}
                                          {percentChange.toFixed(1)}%
                                        </span>
                                      </>
                                    ) : gradeData ? (
                                      <span
                                        className="font-bold text-sm"
                                        style={{
                                          color: gradeData.color,

                                          border: `2px solid ${gradeData.color}`,

                                          borderRadius: '4px',

                                          padding: '2px 6px',

                                          boxShadow: `0 0 6px ${gradeData.color}40`,
                                        }}
                                      >
                                        {gradeData.grade}
                                      </span>
                                    ) : (
                                      <span className="text-sm text-gray-500">-</span>
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

                            if (chartData.length > 0) {
                              const width = 648

                              const height = 117

                              const padding = { left: 45, right: 80, top: 10, bottom: 25 }

                              const chartWidth = width - padding.left - padding.right

                              const chartHeight = height - padding.top - padding.bottom

                              const prices = chartData.map((d) => d.price)

                              const minPrice = Math.min(...prices)

                              const maxPrice = Math.max(...prices)

                              const priceRange = maxPrice - minPrice || 1

                              const points = chartData
                                .map((point, i) => {
                                  const x = padding.left + (i / (chartData.length - 1)) * chartWidth

                                  const y =
                                    padding.top +
                                    chartHeight -
                                    ((point.price - minPrice) / priceRange) * chartHeight

                                  return `${x.toFixed(2)},${y.toFixed(2)}`
                                })
                                .join(' ')

                              const currentPrice = prices[prices.length - 1]

                              const prevClose = (flow as any).originalStockPrice || flow.spot_price

                              const change = currentPrice - prevClose

                              const changePercent = (change / prevClose) * 100

                              const isUp = change >= 0

                              const tradeTimestamp = new Date(flow.trade_timestamp).getTime()

                              const firstTimestamp = chartData[0].timestamp

                              const lastTimestamp = chartData[chartData.length - 1].timestamp

                              const tradePosition =
                                padding.left +
                                ((tradeTimestamp - firstTimestamp) /
                                  (lastTimestamp - firstTimestamp)) *
                                chartWidth

                              const tradeLineColor = '#9b59b6'

                              const isMarketHours = (timestamp: number) => {
                                const date = new Date(timestamp)

                                const hours = date.getUTCHours() - 5

                                const minutes = date.getUTCMinutes()

                                const totalMinutes = hours * 60 + minutes

                                const marketOpen = 9 * 60 + 30

                                const marketClose = 16 * 60

                                return totalMinutes >= marketOpen && totalMinutes < marketClose
                              }

                              const flowId = generateFlowId(flow)

                              const stockTimeframe = flowChartTimeframes[flowId]?.stock || '1D'

                              const shadingRects =
                                stockTimeframe === '1D'
                                  ? chartData.map((point, i) => {
                                    const x =
                                      padding.left + (i / (chartData.length - 1)) * chartWidth

                                    const nextX =
                                      i < chartData.length - 1
                                        ? padding.left +
                                        ((i + 1) / (chartData.length - 1)) * chartWidth
                                        : padding.left + chartWidth

                                    const rectWidth = nextX - x

                                    const isMarket = isMarketHours(point.timestamp)

                                    if (!isMarket) {
                                      return (
                                        <rect
                                          key={`shade-${i}`}
                                          x={x}
                                          y={padding.top}
                                          width={rectWidth}
                                          height={chartHeight}
                                          fill="#555555"
                                          opacity="0.15"
                                        />
                                      )
                                    }

                                    return null
                                  })
                                  : []

                              // Y-axis labels

                              const yAxisTicks = 3

                              const yLabels = []

                              for (let i = 0; i <= yAxisTicks; i++) {
                                const price = minPrice + (priceRange * i) / yAxisTicks

                                const y = padding.top + chartHeight - (i * chartHeight) / yAxisTicks

                                yLabels.push(
                                  <text
                                    key={`y-${i}`}
                                    x={padding.left - 5}
                                    y={y + 4}
                                    textAnchor="end"
                                    fill="#ffffff"
                                    fontSize="11"
                                    fontWeight="bold"
                                  >
                                    ${price.toFixed(2)}
                                  </text>
                                )
                              }

                              // X-axis labels

                              const xAxisTicks = 3

                              const xLabels = []

                              for (let i = 0; i <= xAxisTicks; i++) {
                                const dataIndex = Math.floor(
                                  ((chartData.length - 1) * i) / xAxisTicks
                                )

                                const timestamp = chartData[dataIndex].timestamp

                                const date = new Date(timestamp)

                                const timeStr = date.toLocaleTimeString('en-US', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  hour12: false,
                                })

                                const x = padding.left + (i * chartWidth) / xAxisTicks

                                xLabels.push(
                                  <text
                                    key={`x-${i}`}
                                    x={x}
                                    y={height - 5}
                                    textAnchor="middle"
                                    fill="#ffffff"
                                    fontSize="10"
                                    fontWeight="bold"
                                  >
                                    {timeStr}
                                  </text>
                                )
                              }

                              return (
                                <div className="border-t border-gray-700 pt-3 mt-3">
                                  <div className="relative mb-2">
                                    <div
                                      className="text-center text-sm text-orange-400 font-bold"
                                      style={{ fontSize: '15px' }}
                                    >
                                      Stock
                                    </div>

                                    <div className="absolute right-0 top-0 flex gap-1">
                                      <button
                                        onClick={() => {
                                          setFlowChartTimeframes((prev) => ({
                                            ...prev,

                                            [flowId]: { ...prev[flowId], stock: '1D' },
                                          }))

                                          fetchStockChartDataForFlow(
                                            flowId,
                                            flow.underlying_ticker,
                                            '1D'
                                          )
                                        }}
                                        className={`px-2 py-1 text-xs font-bold rounded transition-colors ${stockTimeframe === '1D'
                                          ? 'bg-orange-500 text-black'
                                          : 'bg-gray-800 text-orange-400 hover:bg-gray-700'
                                          }`}
                                      >
                                        1D
                                      </button>

                                      <button
                                        onClick={() => {
                                          setFlowChartTimeframes((prev) => ({
                                            ...prev,

                                            [flowId]: { ...prev[flowId], stock: '1W' },
                                          }))

                                          fetchStockChartDataForFlow(
                                            flowId,
                                            flow.underlying_ticker,
                                            '1W'
                                          )
                                        }}
                                        className={`px-2 py-1 text-xs font-bold rounded transition-colors ${stockTimeframe === '1W'
                                          ? 'bg-orange-500 text-black'
                                          : 'bg-gray-800 text-orange-400 hover:bg-gray-700'
                                          }`}
                                      >
                                        1W
                                      </button>

                                      <button
                                        onClick={() => {
                                          setFlowChartTimeframes((prev) => ({
                                            ...prev,

                                            [flowId]: { ...prev[flowId], stock: '1M' },
                                          }))

                                          fetchStockChartDataForFlow(
                                            flowId,
                                            flow.underlying_ticker,
                                            '1M'
                                          )
                                        }}
                                        className={`px-2 py-1 text-xs font-bold rounded transition-colors ${stockTimeframe === '1M'
                                          ? 'bg-orange-500 text-black'
                                          : 'bg-gray-800 text-orange-400 hover:bg-gray-700'
                                          }`}
                                      >
                                        1M
                                      </button>
                                    </div>
                                  </div>

                                  <div className="flex flex-col items-center space-y-1">
                                    <svg width={width} height={height} className="overflow-visible">
                                      {/* Axis lines */}

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

                                      {/* Y-axis labels */}

                                      {yLabels}

                                      {/* X-axis labels */}

                                      {xLabels}

                                      {shadingRects}

                                      {(() => {
                                        const prevY =
                                          padding.top +
                                          chartHeight -
                                          ((prevClose - minPrice) / priceRange) * chartHeight

                                        return (
                                          <line
                                            x1={padding.left}
                                            y1={prevY}
                                            x2={padding.left + chartWidth}
                                            y2={prevY}
                                            stroke="#444444"
                                            strokeWidth="1"
                                            strokeDasharray="3,2"
                                            opacity="0.4"
                                          />
                                        )
                                      })()}

                                      {tradePosition >= padding.left &&
                                        tradePosition <= padding.left + chartWidth && (
                                          <line
                                            x1={tradePosition}
                                            y1={padding.top}
                                            x2={tradePosition}
                                            y2={padding.top + chartHeight}
                                            stroke={tradeLineColor}
                                            strokeWidth="1.5"
                                            strokeDasharray="4,3"
                                            opacity="1"
                                          />
                                        )}

                                      <polyline
                                        fill="none"
                                        stroke={isUp ? '#00ff00' : '#ff0000'}
                                        strokeWidth="2"
                                        points={points}
                                        opacity="0.25"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      />

                                      <polyline
                                        fill="none"
                                        stroke={isUp ? '#00ff00' : '#ff0000'}
                                        strokeWidth="1.5"
                                        points={points}
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      />

                                      {/* Current price label on right Y-axis */}

                                      <text
                                        x={padding.left + chartWidth + 10}
                                        y={
                                          padding.top +
                                          chartHeight -
                                          ((currentPrice - minPrice) / priceRange) * chartHeight +
                                          4
                                        }
                                        textAnchor="start"
                                        fill={isUp ? '#00ff00' : '#ff0000'}
                                        fontSize="18"
                                        fontWeight="bold"
                                      >
                                        ${currentPrice.toFixed(2)}
                                      </text>

                                      {/* Percentage change label on right Y-axis */}

                                      <text
                                        x={padding.left + chartWidth + 10}
                                        y={
                                          padding.top +
                                          chartHeight -
                                          ((currentPrice - minPrice) / priceRange) * chartHeight +
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
                                </div>
                              )
                            }

                            return null
                          })()}

                        {/* Options Premium Chart */}

                        {flowTrackingFilters.showCharts &&
                          (() => {
                            const expiry = flow.expiry.replace(/-/g, '').slice(2)

                            const strikeFormatted = String(Math.round(flow.strike * 1000)).padStart(
                              8,
                              '0'
                            )

                            const optionType = flow.type.toLowerCase() === 'call' ? 'C' : 'P'

                            const normalizedTicker = normalizeTickerForOptions(
                              flow.underlying_ticker
                            )

                            const optionTicker = `O:${normalizedTicker}${expiry}${optionType}${strikeFormatted}`

                            const premiumData = optionsPremiumData[flowId] || []

                            if (premiumData.length > 0) {
                              const width = 648

                              const height = 117

                              const padding = { left: 45, right: 80, top: 10, bottom: 25 }

                              const chartWidth = width - padding.left - padding.right

                              const chartHeight = height - padding.top - padding.bottom

                              const prices = premiumData.map((d) => d.price)

                              const minPrice = Math.min(...prices)

                              const maxPrice = Math.max(...prices)

                              const priceRange = maxPrice - minPrice || 1

                              const points = premiumData
                                .map((point, i) => {
                                  const x =
                                    padding.left + (i / (premiumData.length - 1)) * chartWidth

                                  const y =
                                    padding.top +
                                    chartHeight -
                                    ((point.price - minPrice) / priceRange) * chartHeight

                                  return `${x.toFixed(2)},${y.toFixed(2)}`
                                })
                                .join(' ')

                              const currentPrice = prices[prices.length - 1]

                              const entryPrice =
                                (flow as any).originalPrice || flow.premium_per_contract

                              const change = currentPrice - entryPrice

                              const changePercent = (change / entryPrice) * 100

                              const isUp = change >= 0

                              const tradeTimestamp = new Date(flow.trade_timestamp).getTime()

                              const firstTimestamp = premiumData[0].timestamp

                              const lastTimestamp = premiumData[premiumData.length - 1].timestamp

                              const tradePosition =
                                padding.left +
                                ((tradeTimestamp - firstTimestamp) /
                                  (lastTimestamp - firstTimestamp)) *
                                chartWidth

                              const tradeLineColor = '#9b59b6'

                              const areaPoints = `${padding.left},${padding.top + chartHeight} ${points} ${padding.left + chartWidth},${padding.top + chartHeight}`

                              const areaPath = `M ${areaPoints} Z`

                              // Y-axis labels

                              const yAxisTicks = 3

                              const yLabels = []

                              for (let i = 0; i <= yAxisTicks; i++) {
                                const price = minPrice + (priceRange * i) / yAxisTicks

                                const y = padding.top + chartHeight - (i * chartHeight) / yAxisTicks

                                yLabels.push(
                                  <text
                                    key={`y-${i}`}
                                    x={padding.left - 5}
                                    y={y + 4}
                                    textAnchor="end"
                                    fill="#ffffff"
                                    fontSize="11"
                                    fontWeight="bold"
                                  >
                                    ${price.toFixed(2)}
                                  </text>
                                )
                              }

                              // X-axis labels

                              const xAxisTicks = 3

                              const xLabels = []

                              for (let i = 0; i <= xAxisTicks; i++) {
                                const dataIndex = Math.floor(
                                  ((premiumData.length - 1) * i) / xAxisTicks
                                )

                                const timestamp = premiumData[dataIndex].timestamp

                                const date = new Date(timestamp)

                                const timeStr = date.toLocaleTimeString('en-US', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  hour12: false,
                                })

                                const x = padding.left + (i * chartWidth) / xAxisTicks

                                xLabels.push(
                                  <text
                                    key={`x-${i}`}
                                    x={x}
                                    y={height - 5}
                                    textAnchor="middle"
                                    fill="#ffffff"
                                    fontSize="10"
                                    fontWeight="bold"
                                  >
                                    {timeStr}
                                  </text>
                                )
                              }

                              const optionTimeframe = flowChartTimeframes[flowId]?.option || '1D'

                              return (
                                <div className="border-t border-gray-700 pt-3 mt-3">
                                  <div className="relative mb-2">
                                    <div
                                      className="text-center text-sm text-cyan-400 font-bold"
                                      style={{ fontSize: '15px' }}
                                    >
                                      Contract
                                    </div>

                                    <div className="absolute right-0 top-0 flex gap-1">
                                      <button
                                        onClick={() => {
                                          setFlowChartTimeframes((prev) => ({
                                            ...prev,

                                            [flowId]: { ...prev[flowId], option: '1D' },
                                          }))

                                          fetchOptionPremiumDataForFlow(flowId, flow, '1D')
                                        }}
                                        className={`px-2 py-1 text-xs font-bold rounded transition-colors ${optionTimeframe === '1D'
                                          ? 'bg-cyan-500 text-black'
                                          : 'bg-gray-800 text-cyan-400 hover:bg-gray-700'
                                          }`}
                                      >
                                        1D
                                      </button>

                                      <button
                                        onClick={() => {
                                          setFlowChartTimeframes((prev) => ({
                                            ...prev,

                                            [flowId]: { ...prev[flowId], option: '1W' },
                                          }))

                                          fetchOptionPremiumDataForFlow(flowId, flow, '1W')
                                        }}
                                        className={`px-2 py-1 text-xs font-bold rounded transition-colors ${optionTimeframe === '1W'
                                          ? 'bg-cyan-500 text-black'
                                          : 'bg-gray-800 text-cyan-400 hover:bg-gray-700'
                                          }`}
                                      >
                                        1W
                                      </button>

                                      <button
                                        onClick={() => {
                                          setFlowChartTimeframes((prev) => ({
                                            ...prev,

                                            [flowId]: { ...prev[flowId], option: '1M' },
                                          }))

                                          fetchOptionPremiumDataForFlow(flowId, flow, '1M')
                                        }}
                                        className={`px-2 py-1 text-xs font-bold rounded transition-colors ${optionTimeframe === '1M'
                                          ? 'bg-cyan-500 text-black'
                                          : 'bg-gray-800 text-cyan-400 hover:bg-gray-700'
                                          }`}
                                      >
                                        1M
                                      </button>
                                    </div>
                                  </div>

                                  <div className="flex flex-col items-center space-y-1">
                                    <svg width={width} height={height} className="overflow-visible">
                                      {/* Axis lines */}

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

                                      {/* Y-axis labels */}

                                      {yLabels}

                                      {/* X-axis labels */}

                                      {xLabels}

                                      <path
                                        d={areaPath}
                                        fill={
                                          isUp
                                            ? 'rgba(0, 255, 136, 0.15)'
                                            : 'rgba(255, 68, 102, 0.15)'
                                        }
                                      />

                                      {(() => {
                                        const entryY =
                                          padding.top +
                                          chartHeight -
                                          ((entryPrice - minPrice) / priceRange) * chartHeight

                                        return (
                                          <line
                                            x1={padding.left}
                                            y1={entryY}
                                            x2={padding.left + chartWidth}
                                            y2={entryY}
                                            stroke="#ffaa00"
                                            strokeWidth="1"
                                            strokeDasharray="3,2"
                                            opacity="0.5"
                                          />
                                        )
                                      })()}

                                      {tradePosition >= padding.left &&
                                        tradePosition <= padding.left + chartWidth && (
                                          <line
                                            x1={tradePosition}
                                            y1={padding.top}
                                            x2={tradePosition}
                                            y2={padding.top + chartHeight}
                                            stroke={tradeLineColor}
                                            strokeWidth="1.5"
                                            strokeDasharray="4,3"
                                            opacity="1"
                                          />
                                        )}

                                      <polyline
                                        fill="none"
                                        stroke={isUp ? '#00ff88' : '#ff4466'}
                                        strokeWidth="2"
                                        points={points}
                                        opacity="0.25"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      />

                                      <polyline
                                        fill="none"
                                        stroke={isUp ? '#00ff88' : '#ff4466'}
                                        strokeWidth="1.5"
                                        points={points}
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      />

                                      {/* Current price label on right Y-axis */}

                                      <text
                                        x={padding.left + chartWidth + 10}
                                        y={
                                          padding.top +
                                          chartHeight -
                                          ((currentPrice - minPrice) / priceRange) * chartHeight +
                                          4
                                        }
                                        textAnchor="start"
                                        fill={isUp ? '#00ff88' : '#ff4466'}
                                        fontSize="18"
                                        fontWeight="bold"
                                      >
                                        ${currentPrice.toFixed(2)}
                                      </text>

                                      {/* Percentage change label on right Y-axis */}

                                      <text
                                        x={padding.left + chartWidth + 10}
                                        y={
                                          padding.top +
                                          chartHeight -
                                          ((currentPrice - minPrice) / priceRange) * chartHeight +
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
                                </div>
                              )
                            }

                            return null
                          })()}
                      </div>
                    </div>
                  )
                })
            )}
          </div>
        </div>
      )}
      {!isSidebarPanel && !isMobileView && (
        <div
          style={{
            width: '26%',
            height: '100vh',
            position: 'fixed',
            top: 125,
            right: 0,
            overflowY: 'auto',
            borderLeft: '1px solid #374151',
            background: '#000000',
            zIndex: 50,
          }}
        >
          <FlowTrackingPanel
            relativeStrengthData={relativeStrengthData}
            historicalStdDevs={historicalStdDevs}
            comboTradeMap={comboTradeMap}
            dealerZoneCache={dealerZoneCache}
          />
        </div>
      )}

      {/* Mobile: full-screen overlay when TRACK is active */}
      {!isSidebarPanel && isMobileView && isFlowTrackingOpen && (
        <div
          style={{
            position: 'fixed',
            top: 75,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9990,
            background: '#000000',
            overflowY: 'auto',
          }}
        >
          <FlowTrackingPanel
            onClose={() => setIsFlowTrackingOpen(false)}
            relativeStrengthData={relativeStrengthData}
            historicalStdDevs={historicalStdDevs}
            comboTradeMap={comboTradeMap}
            dealerZoneCache={dealerZoneCache}
          />
        </div>
      )}
    </div>
  )
}
