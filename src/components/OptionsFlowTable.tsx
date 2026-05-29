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

// Polygon removes periods from tickers in option symbols (e.g., BRK.B ? BRKB)

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

          console.error(`? Error enriching ${trade.underlying_ticker}:`, error)

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

// -- Pure Black-Scholes helpers (same math as DealerOpenInterestChart) --
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

  onAlgoFlowClick?: () => void
}

const ALL_UNIQUE_FILTERS = ['ITM', 'OTM', 'SWEEP_ONLY', 'BLOCK_ONLY', 'MULTI_LEG_ONLY', 'WEEKLY_ONLY', 'MINI_ONLY']

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

  onAlgoFlowClick,
}) => {
  const [sortField, setSortField] = useState<keyof OptionsFlowData | 'positioning_grade' | 'leap_grade'>(
    'trade_timestamp'
  )

  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  const [filterType, setFilterType] = useState<string>('all')

  const [selectedOptionTypes, setSelectedOptionTypes] = useState<string[]>(['call', 'put'])
  const [selectedOrderSides, setSelectedOrderSides] = useState<string[]>([])

  const [selectedPremiumFilters, setSelectedPremiumFilters] = useState<string[]>([])

  const [customMinPremium, setCustomMinPremium] = useState<string>('')

  const [customMaxPremium, setCustomMaxPremium] = useState<string>('')

  const [selectedTickerFilters, setSelectedTickerFilters] = useState<string[]>([])

  const [selectedUniqueFilters, setSelectedUniqueFilters] = useState<string[]>(ALL_UNIQUE_FILTERS)

  const [expirationStartDate, setExpirationStartDate] = useState<string>('')

  const [expirationEndDate, setExpirationEndDate] = useState<string>('')

  const [blacklistedTickers, setBlacklistedTickers] = useState<string[]>(() => {
    const empty14 = ['', '', '', '', '', '', '', '', '', '', '', '', '', '']
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('optionsflow_blacklist')
        if (saved) {
          const parsed: string[] = JSON.parse(saved)
          // Pad to 14 slots if fewer were saved
          while (parsed.length < 14) parsed.push('')
          return parsed
        }
      } catch { }
    }
    return empty14
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
  const [leapActive, setLeapActive] = useState<boolean>(false)

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
  const [leapRsData, setLeapRsData] = useState<Map<string, { rs5d: number; rs13d: number; rs21d: number }>>(new Map())
  const [leap52wkData, setLeap52wkData] = useState<Map<string, { high52: number; low52: number }>>(new Map())
  const [leapSeasonalData, setLeapSeasonalData] = useState<Map<string, { inSweetSpot: boolean; inPainPoint: boolean }>>(new Map())
  const [modeLoadingStep, setModeLoadingStep] = useState<{ mode: 'LEAP' | 'EFI'; step: string } | null>(null)

  // ---- Canvas scene components for loading screen art ----
  // ---- Bloomberg-graphic loading scenes (panel built dynamically from live data) ----
  const _sceneFont = '"Arial Black","Arial Bold",Impact,sans-serif'

  const LoadingCrashScene = React.useCallback(() => (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#060102' }}>
      {/* Bear photo — right 60%, fade left */}
      <div style={{ position: 'absolute', right: 0, top: 0, width: '62%', height: '100%', overflow: 'hidden' }}>
        <img src="/loading/bear.jpg" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', filter: 'contrast(1.5) brightness(0.55) saturate(0.4)' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg,#060102 0%,rgba(6,1,2,0.75) 28%,rgba(6,1,2,0) 100%)' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(200,0,0,0.22)', mixBlendMode: 'screen' }} />
      </div>
      {/* Left text panel */}
      <div style={{ position: 'absolute', left: 0, top: 0, width: '66%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingLeft: '5%', paddingRight: '2%', gap: 0 }}>
        <div style={{ color: '#fff', fontFamily: _sceneFont, fontWeight: 900, fontSize: 'clamp(24px,4.8vw,52px)', lineHeight: 1, textTransform: 'uppercase', letterSpacing: '0.02em', textShadow: '2px 2px 8px rgba(0,0,0,0.9)' }}>MARKETS IN</div>
        <div style={{ color: '#e01010', fontFamily: _sceneFont, fontWeight: 900, fontSize: 'clamp(38px,7.5vw,82px)', lineHeight: 1.0, textTransform: 'uppercase', letterSpacing: '0.01em', textShadow: '0 0 30px rgba(230,0,0,0.5)', marginBottom: '4%' }}>FREEFALL</div>
        <div style={{ width: '80%', height: '2px', background: 'rgba(200,20,20,0.7)', marginBottom: '4%' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(3px,0.7vh,8px)' }}>
          {([['S&P 500', '-4.32%'], ['NASDAQ', '-5.16%'], ['DOW', '-1,276.37']] as [string, string][]).map(([t, v]) => (
            <div key={t} style={{ display: 'flex', gap: 'clamp(8px,2vw,20px)', alignItems: 'baseline' }}>
              <span style={{ color: 'rgba(255,255,255,0.65)', fontFamily: 'monospace', fontWeight: 'bold', fontSize: 'clamp(10px,1.4vw,15px)', minWidth: '4.5em' }}>{t}</span>
              <span style={{ color: '#e03535', fontFamily: 'monospace', fontWeight: 'bold', fontSize: 'clamp(10px,1.5vw,16px)' }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
      {/* Top-right badge */}
      <div style={{ position: 'absolute', top: '4%', right: '2%', color: 'rgba(210,30,30,0.92)', fontFamily: 'monospace', fontWeight: 'bold', fontSize: 'clamp(9px,1.1vw,13px)', letterSpacing: '0.08em' }}>▼ CIRCUIT BREAKER TRIGGERED</div>
      {/* Scanlines */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(0deg,rgba(0,0,0,0.05) 0px,rgba(0,0,0,0.05) 1px,transparent 1px,transparent 3px)', pointerEvents: 'none' }} />
    </div>
  ), [])

  const LoadingBullScene = React.useCallback(() => (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#010602' }}>
      {/* Bull statue photo — left 55%, fade right */}
      <div style={{ position: 'absolute', left: 0, top: 0, width: '55%', height: '100%', overflow: 'hidden' }}>
        <img src="/loading/bull.jpg" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', filter: 'contrast(1.6) brightness(0.5) saturate(0.3)' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(270deg,#010602 0%,rgba(1,6,2,0.65) 25%,rgba(1,6,2,0) 100%)' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,200,60,0.28)', mixBlendMode: 'screen' }} />
      </div>
      {/* Right text panel */}
      <div style={{ position: 'absolute', right: 0, top: 0, width: '58%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingRight: '5%', paddingLeft: '2%', gap: 0, textAlign: 'right', alignItems: 'flex-end' }}>
        <div style={{ color: '#fff', fontFamily: _sceneFont, fontWeight: 900, fontSize: 'clamp(24px,4.8vw,52px)', lineHeight: 1, textTransform: 'uppercase', letterSpacing: '0.02em', textShadow: '2px 2px 8px rgba(0,0,0,0.9)' }}>BULL MARKET</div>
        <div style={{ color: '#00e040', fontFamily: _sceneFont, fontWeight: 900, fontSize: 'clamp(26px,5.2vw,58px)', lineHeight: 1.0, textTransform: 'uppercase', letterSpacing: '0.01em', textShadow: '0 0 30px rgba(0,220,60,0.5)', marginBottom: '4%' }}>STILL ALIVE?</div>
        <div style={{ width: '80%', height: '2px', background: 'rgba(0,200,60,0.7)', marginBottom: '4%' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(3px,0.7vh,8px)', alignItems: 'flex-end' }}>
          {([['S&P 500', '+1.42%'], ['DOW', '+1.18%'], ['NASDAQ', '+2.35%'], ['VIX', '-8.91%']] as [string, string][]).map(([t, v]) => (
            <div key={t} style={{ display: 'flex', gap: 'clamp(8px,2vw,20px)', alignItems: 'baseline' }}>
              <span style={{ color: 'rgba(255,255,255,0.65)', fontFamily: 'monospace', fontWeight: 'bold', fontSize: 'clamp(10px,1.4vw,15px)', minWidth: '4.5em', textAlign: 'right' }}>{t}</span>
              <span style={{ color: '#00e040', fontFamily: 'monospace', fontWeight: 'bold', fontSize: 'clamp(10px,1.5vw,16px)' }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
      {/* Top-left badge */}
      <div style={{ position: 'absolute', top: '4%', left: '2%', color: 'rgba(0,200,60,0.92)', fontFamily: 'monospace', fontWeight: 'bold', fontSize: 'clamp(9px,1.1vw,13px)', letterSpacing: '0.08em' }}>▲ RISK ON — BULLS IN CONTROL</div>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(0deg,rgba(0,0,0,0.05) 0px,rgba(0,0,0,0.05) 1px,transparent 1px,transparent 3px)', pointerEvents: 'none' }} />
    </div>
  ), [])

  const LoadingWatchScene = React.useCallback(() => (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#010308' }}>
      {/* Trader photo — right 60%, fade left */}
      <div style={{ position: 'absolute', right: 0, top: 0, width: '60%', height: '100%', overflow: 'hidden' }}>
        <img src="/loading/trader.jpg" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top', filter: 'contrast(1.6) brightness(0.45) saturate(0.3) hue-rotate(180deg)' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg,#010308 0%,rgba(1,3,8,0.72) 25%,rgba(1,3,8,0) 100%)' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,140,255,0.2)', mixBlendMode: 'screen' }} />
      </div>
      {/* Left text panel */}
      <div style={{ position: 'absolute', left: 0, top: 0, width: '65%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingLeft: '5%', paddingRight: '2%', gap: 0 }}>
        <div style={{ color: 'rgba(255,255,255,0.55)', fontFamily: 'monospace', fontWeight: 'bold', fontSize: 'clamp(9px,1.3vw,14px)', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '2%' }}>REAL-TIME SWEEP SCANNER</div>
        <div style={{ color: '#fff', fontFamily: _sceneFont, fontWeight: 900, fontSize: 'clamp(22px,4.5vw,48px)', lineHeight: 1, textTransform: 'uppercase', letterSpacing: '0.02em', textShadow: '2px 2px 8px rgba(0,0,0,0.9)' }}>UNUSUAL</div>
        <div style={{ color: '#00aaff', fontFamily: _sceneFont, fontWeight: 900, fontSize: 'clamp(22px,4.5vw,48px)', lineHeight: 1, textTransform: 'uppercase', letterSpacing: '0.02em', textShadow: '0 0 30px rgba(0,150,255,0.5)' }}>OPTIONS</div>
        <div style={{ color: '#fff', fontFamily: _sceneFont, fontWeight: 900, fontSize: 'clamp(22px,4.5vw,48px)', lineHeight: 1, textTransform: 'uppercase', letterSpacing: '0.02em', textShadow: '2px 2px 8px rgba(0,0,0,0.9)', marginBottom: '4%' }}>ACTIVITY</div>
        <div style={{ width: '80%', height: '2px', background: 'rgba(0,150,255,0.7)', marginBottom: '4%' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(3px,0.7vh,8px)' }}>
          {([['SWEEPS', 'DETECTED'], ['BLOCKS', 'DETECTED'], ['DARK POOL', 'ACTIVE'], ['IV RANK', 'ELEVATED']] as [string, string][]).map(([t, v]) => (
            <div key={t} style={{ display: 'flex', gap: 'clamp(8px,2vw,20px)', alignItems: 'baseline' }}>
              <span style={{ color: 'rgba(255,255,255,0.6)', fontFamily: 'monospace', fontWeight: 'bold', fontSize: 'clamp(9px,1.3vw,14px)', minWidth: '5.5em' }}>{t}</span>
              <span style={{ color: '#00ccff', fontFamily: 'monospace', fontWeight: 'bold', fontSize: 'clamp(9px,1.3vw,14px)' }}>● {v}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ position: 'absolute', top: '4%', right: '2%', color: 'rgba(0,200,255,0.9)', fontFamily: 'monospace', fontWeight: 'bold', fontSize: 'clamp(9px,1.1vw,13px)', letterSpacing: '0.08em' }}>● SCANNING FLOW...</div>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(0deg,rgba(0,0,0,0.05) 0px,rgba(0,0,0,0.05) 1px,transparent 1px,transparent 3px)', pointerEvents: 'none' }} />
    </div>
  ), [])

  const LoadingFloorScene = React.useCallback(() => (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#060400' }}>
      {/* NYSE building — left 55%, fade right */}
      <div style={{ position: 'absolute', left: 0, top: 0, width: '55%', height: '100%', overflow: 'hidden' }}>
        <img src="/loading/nyse.jpg" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', filter: 'contrast(1.5) brightness(0.5) saturate(0.4)' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(270deg,#060400 0%,rgba(6,4,0,0.62) 25%,rgba(6,4,0,0) 100%)' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,140,0,0.2)', mixBlendMode: 'screen' }} />
      </div>
      {/* Right text panel */}
      <div style={{ position: 'absolute', right: 0, top: 0, width: '58%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingRight: '5%', paddingLeft: '2%', gap: 0, textAlign: 'right', alignItems: 'flex-end' }}>
        <div style={{ color: 'rgba(255,180,50,0.7)', fontFamily: 'monospace', fontWeight: 'bold', fontSize: 'clamp(9px,1.3vw,14px)', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '2%' }}>NEW YORK STOCK EXCHANGE</div>
        <div style={{ color: '#fff', fontFamily: _sceneFont, fontWeight: 900, fontSize: 'clamp(28px,5.5vw,60px)', lineHeight: 1, textTransform: 'uppercase', letterSpacing: '0.02em', textShadow: '2px 2px 8px rgba(0,0,0,0.9)' }}>TRADING</div>
        <div style={{ color: '#ffaa00', fontFamily: _sceneFont, fontWeight: 900, fontSize: 'clamp(28px,5.5vw,60px)', lineHeight: 1, textTransform: 'uppercase', letterSpacing: '0.02em', textShadow: '0 0 30px rgba(255,140,0,0.5)', marginBottom: '4%' }}>THE FLOOR</div>
        <div style={{ width: '80%', height: '2px', background: 'rgba(255,140,0,0.7)', marginBottom: '4%' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(3px,0.7vh,8px)', alignItems: 'flex-end' }}>
          {([['AAPL', '+2.3%'], ['NVDA', '+4.1%'], ['TSLA', '-1.8%'], ['SPY', '+0.9%']] as [string, string][]).map(([t, v]) => (
            <div key={t} style={{ display: 'flex', gap: 'clamp(8px,2vw,20px)', alignItems: 'baseline' }}>
              <span style={{ color: 'rgba(255,255,255,0.65)', fontFamily: 'monospace', fontWeight: 'bold', fontSize: 'clamp(10px,1.4vw,15px)', minWidth: '4em', textAlign: 'right' }}>{t}</span>
              <span style={{ color: v.startsWith('+') ? '#00e060' : '#e03535', fontFamily: 'monospace', fontWeight: 'bold', fontSize: 'clamp(10px,1.5vw,16px)' }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ position: 'absolute', top: '4%', left: '2%', color: 'rgba(255,160,30,0.9)', fontFamily: 'monospace', fontWeight: 'bold', fontSize: 'clamp(9px,1.1vw,13px)', letterSpacing: '0.08em' }}>NYSE · MARKET OPEN</div>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(0deg,rgba(0,0,0,0.05) 0px,rgba(0,0,0,0.05) 1px,transparent 1px,transparent 3px)', pointerEvents: 'none' }} />
    </div>
  ), [])
  // ---- end Bloomberg-graphic scenes ----


  const EFI_LOADING_QUOTES = [
    { text: 'The trend is your friend — until it bends.', author: 'Wall Street Proverb' },
    { text: 'Block trades don\'t lie. Institutions leave footprints.', author: 'EFI Research' },
    { text: 'When sweep orders cluster, the smart money is speaking.', author: 'EFI Research' },
    { text: 'Markets can remain irrational longer than you can remain solvent.', author: 'John Maynard Keynes' },
    { text: 'Volume is the weapon of the informed trader.', author: 'EFI Research' },
    { text: 'The stock market is filled with individuals who know the price of everything, but the value of nothing.', author: 'Philip Fisher' },
    { text: 'In the short run the market is a voting machine. In the long run, a weighing machine.', author: 'Benjamin Graham' },
    { text: 'The best trades come from where conviction meets flow.', author: 'EFI Research' },
    { text: 'Risk comes from not knowing what you\'re doing.', author: 'Warren Buffett' },
    { text: 'Follow the smart money — it always leaves a trail in options.', author: 'EFI Research' },
    { text: 'The four most dangerous words in investing: \'this time it\'s different\'.', author: 'Sir John Templeton' },
    { text: 'Premium doesn\'t lie. Size tells the story.', author: 'EFI Research' },
    { text: 'Unusual options activity today is tomorrow\'s headline.', author: 'EFI Research' },
    { text: 'Every large position started as an idea someone believed in enough to size up.', author: 'EFI Research' },
  ]
  const [loadingQuoteIndex, setLoadingQuoteIndex] = useState(0)
  const [loadingArtIndex, setLoadingArtIndex] = useState(0)

  const [historicalDataLoading, setHistoricalDataLoading] = useState<Set<string>>(new Set())

  // Rotate quote every 10s while loading
  React.useEffect(() => {
    if (gradingProgress === null && modeLoadingStep === null && !loading) return
    const iv = setInterval(() => setLoadingQuoteIndex(i => (i + 1) % EFI_LOADING_QUOTES.length), 10000)
    return () => clearInterval(iv)
  }, [gradingProgress !== null, modeLoadingStep !== null, loading])

  // Cycle art panel every 8s — only when snapshot hasn't locked a scene yet
  const [snapDriven, setSnapDriven] = React.useState(false)
  const [mktSnap, setMktSnap] = React.useState<Record<string, number> | null>(null)
  const [mktCtx, setMktCtx] = React.useState<{ sectors: Record<string, number>; movers: Array<{ ticker: string; pct: number; price: number }>; headlines: Array<{ title: string; urgency: number; time_ago: string; tickers: string[] }> } | null>(null)

  React.useEffect(() => {
    if (!loading || snapDriven) return
    const iv = setInterval(() => setLoadingArtIndex(i => (i + 1) % 7), 8000)
    return () => clearInterval(iv)
  }, [loading, snapDriven])

  // Fetch live SPY + sector data on mount (pre-load before any scan) and lock scene
  // Headlines use /api/news — same endpoint + filtering as the news panel
  React.useEffect(() => {
    let cancelled = false
    const doFetch = async () => {
      try {
        const [snapRes, newsRes] = await Promise.all([
          fetch('/api/market-snapshot'),
          fetch('/api/news?category=breaking&limit=6'),
        ])
        if (cancelled) return
        if (!snapRes.ok) return
        const d: Record<string, any> = await snapRes.json()
        if (cancelled || !d || typeof d !== 'object' || d.error) return
        const sectors: Record<string, number> = d.sectors && typeof d.sectors === 'object' ? d.sectors : d
        const spy = sectors['SPY'] ?? NaN
        if (isNaN(spy)) return // markets closed / no data — keep cycling
        setMktSnap(sectors)
        // Use /api/news headlines (same quality filters as news panel) — fall back to market-snapshot headlines
        let headlines: Array<{ title: string; urgency: number; time_ago: string; tickers: string[] }> = d.headlines ?? []
        if (newsRes.ok) {
          const newsData = await newsRes.json()
          if (newsData.success && Array.isArray(newsData.articles) && newsData.articles.length > 0) {
            headlines = newsData.articles.slice(0, 6).map((a: any) => ({
              title: String(a.title ?? ''),
              urgency: typeof a.urgency === 'number' ? a.urgency : 0.5,
              time_ago: String(a.time_ago ?? ''),
              tickers: Array.isArray(a.tickers) ? a.tickers : [],
            }))
          }
        }
        setMktCtx({ sectors, movers: Array.isArray(d.movers) ? d.movers : [], headlines })
        setSnapDriven(true)
        const bearVariants = [0, 4]  // bear.jpg, cryptocrash.jpg
        const bullVariants = [1, 5, 6]  // bull.jpg, bullwall.jpg, cryptorally.jpg
        const rng = (arr: number[]) => arr[Math.floor(Math.random() * arr.length)]
        setLoadingArtIndex(spy <= -1.5 ? rng(bearVariants) : spy >= 1.5 ? rng(bullVariants) : spy < 0 ? 2 : 3)
      } catch { /* silent */ }
    }
    doFetch()
    return () => { cancelled = true }
  }, [])

  // Single scene renderer — uses live data when available, hardcoded fallback otherwise
  const LoadingScenePanel = React.useCallback((): React.ReactElement => {
    const fnt = _sceneFont
    const spyRaw = mktSnap != null ? (mktSnap['SPY'] ?? NaN) : NaN
    const sceneIdx: number = loadingArtIndex
    const fmtChg = (v: number): string => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
    const allSectors = mktSnap
      ? Object.entries(mktSnap)
        .filter(([s]) => s !== 'SPY')
        .map(([s, v]) => ({ s, v }))
        .sort((a, b) => a.v - b.v) // ascending: worst first
      : null
    const spyVal = mktSnap ? mktSnap['SPY'] : null

    // Live movers + headlines from enriched snapshot
    const movers = mktCtx?.movers ?? []
    const headlines = mktCtx?.headlines ?? []
    const bigLosers: [string, string][] = movers.filter(m => m.pct < 0).slice(0, 2).map(m => [m.ticker, fmtChg(m.pct)])
    const bigGainers: [string, string][] = movers.filter(m => m.pct > 0).slice(0, 2).map(m => [m.ticker, fmtChg(m.pct)])
    const findH = (re: RegExp) => headlines.find(h => re.test(h.title)) ?? headlines[0] ?? null
    const truncate = (s: string, n = 85) => s.length > n ? s.slice(0, n - 1) + '…' : s

    if (sceneIdx === 0) {
      // MARKETS IN FREEFALL — bear photo full bg, biggest losers + bearish headline
      const headline = findH(/crash|plunge|selloff|sell.off|tariff|rout|recession|halt|circuit/i)
      const rows: [string, string][] = bigLosers.length > 0
        ? [['S&P 500', fmtChg(spyVal ?? -2.1)], ...bigLosers.slice(0, 2)]
        : spyVal != null && allSectors
          ? [['S&P 500', fmtChg(spyVal)], ...allSectors.slice(0, 2).map(x => [x.s, fmtChg(x.v)] as [string, string])]
          : [['S&P 500', '-4.32%'], ['NASDAQ', '-5.16%'], ['DOW', '-1,276.37']]
      return (
        <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#060102' }}>
          {/* Full-screen image */}
          <div style={{ position: 'absolute', inset: 0 }}>
            <img src="/loading/bear.jpg" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', filter: 'contrast(1.4) brightness(0.6) saturate(0.45)' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(6,1,2,0) 55%, rgba(6,1,2,0.7) 72%, rgba(6,1,2,0.96) 88%, #060102 100%)' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(200,0,0,0.18)', mixBlendMode: 'screen' }} />
          </div>
          {/* Narrow text panel — right 26% */}
          <div style={{ position: 'absolute', right: 0, top: 0, width: '26%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'right', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', alignSelf: 'flex-end', gap: '4px' }}>
              <div style={{ color: '#fff', fontFamily: fnt, fontWeight: 900, fontSize: 'clamp(14px,2.2vw,28px)', lineHeight: 1, textTransform: 'uppercase', textShadow: '2px 2px 8px rgba(0,0,0,0.9)', background: '#000', padding: '2px 10px' }}>MARKETS IN</div>
              <div style={{ color: '#e01010', fontFamily: fnt, fontWeight: 900, fontSize: 'clamp(18px,3vw,38px)', lineHeight: 1.05, textTransform: 'uppercase', textShadow: '0 0 20px rgba(230,0,0,0.6)', marginBottom: '8%', background: '#000', padding: '2px 10px' }}>FREEFALL</div>
              <div style={{ width: '100%', height: '2px', background: 'rgba(200,20,20,0.7)', marginBottom: '8%' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(4px,0.9vh,10px)', alignItems: 'flex-end' }}>
                {rows.map(([t, v]) => (
                  <div key={t} style={{ display: 'flex', gap: '8px', alignItems: 'baseline', background: '#000', padding: '2px 10px' }}>
                    <span style={{ color: '#ffffff', fontFamily: 'monospace', fontWeight: 'bold', fontSize: 'clamp(16px,2vw,24px)' }}>{t}</span>
                    <span style={{ color: '#e03535', fontFamily: 'monospace', fontWeight: 'bold', fontSize: 'clamp(18px,2.1vw,25px)' }}>{v}</span>
                  </div>
                ))}
              </div>
              {headline && <>
                <div style={{ width: '100%', height: '2px', background: '#aa1111', margin: '5% 0 3%' }} />
                <div style={{ color: '#ff4422', fontFamily: 'monospace', fontWeight: 900, fontSize: 'clamp(18px,2.05vw,23px)', letterSpacing: '0.18em', marginBottom: 4, background: '#000', padding: '2px 10px' }}>● BREAKING</div>
                <div style={{ color: '#ffffff', fontFamily: 'monospace', fontSize: 'clamp(14px,1.5vw,19px)', fontWeight: 600, lineHeight: 1.4, textAlign: 'right', overflowWrap: 'break-word', wordBreak: 'break-word', background: '#000', padding: '2px 10px' }}>{truncate(headline.title)}</div>
                <div style={{ color: '#ff9988', fontFamily: 'monospace', fontSize: 'clamp(13px,1.38vw,16px)', marginTop: 3, background: '#000', padding: '2px 10px' }}>{headline.time_ago}{headline.tickers.length > 0 ? ` · ${headline.tickers.slice(0, 3).map(tk => { const mv = movers.find(x => x.ticker === tk); return mv ? `${tk} ${fmtChg(mv.pct)}` : tk }).join('  ')}` : ''}</div>
              </>}
            </div>
          </div>
          <div style={{ position: 'absolute', top: '4%', left: '2%', color: 'rgba(210,30,30,0.92)', fontFamily: 'monospace', fontWeight: 'bold', fontSize: 'clamp(9px,1.1vw,13px)', letterSpacing: '0.08em' }}>▼ CIRCUIT BREAKER TRIGGERED</div>
          <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(0deg,rgba(0,0,0,0.04) 0px,rgba(0,0,0,0.04) 1px,transparent 1px,transparent 3px)', pointerEvents: 'none' }} />
        </div>
      )
    }
    if (sceneIdx === 1) {
      // BULL MARKET STILL ALIVE — bull statue full bg, biggest gainers + bullish headline
      const headline = findH(/beat|earnings beat|surge|rally|bullish|upgrade|record high|raises guidance|soar/i)
      const rows: [string, string][] = bigGainers.length > 0
        ? [['S&P 500', fmtChg(spyVal ?? 1.8)], ...bigGainers.slice(0, 2)]
        : spyVal != null && allSectors
          ? [['S&P 500', fmtChg(spyVal)], ...allSectors.slice(-2).reverse().map(x => [x.s, fmtChg(x.v)] as [string, string])]
          : [['S&P 500', '+1.42%'], ['DOW', '+1.18%'], ['NASDAQ', '+2.35%']]
      return (
        <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#010602' }}>
          {/* Full-screen image */}
          <div style={{ position: 'absolute', inset: 0 }}>
            <img src="/loading/bull.jpg" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', filter: 'contrast(1.5) brightness(0.62) saturate(0.35)' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(1,6,2,0) 55%, rgba(1,6,2,0.7) 72%, rgba(1,6,2,0.96) 88%, #010602 100%)' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,200,60,0.2)', mixBlendMode: 'screen' }} />
          </div>
          {/* Narrow text panel — right 26% */}
          <div style={{ position: 'absolute', right: 0, top: 0, width: '26%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'right', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', alignSelf: 'flex-end', gap: '4px' }}>
              <div style={{ color: '#fff', fontFamily: fnt, fontWeight: 900, fontSize: 'clamp(13px,2vw,26px)', lineHeight: 1, textTransform: 'uppercase', textShadow: '2px 2px 8px rgba(0,0,0,0.9)', background: '#000', padding: '2px 10px' }}>BULL MARKET</div>
              <div style={{ color: '#00e040', fontFamily: fnt, fontWeight: 900, fontSize: 'clamp(15px,2.4vw,30px)', lineHeight: 1.05, textTransform: 'uppercase', textShadow: '0 0 20px rgba(0,220,60,0.6)', marginBottom: '8%', background: '#000', padding: '2px 10px' }}>STILL ALIVE?</div>
              <div style={{ width: '100%', height: '2px', background: 'rgba(0,200,60,0.7)', marginBottom: '8%' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(4px,0.9vh,10px)', alignItems: 'flex-end' }}>
                {rows.map(([t, v]) => (
                  <div key={t} style={{ display: 'flex', gap: '8px', alignItems: 'baseline', background: '#000', padding: '2px 10px' }}>
                    <span style={{ color: '#ffffff', fontFamily: 'monospace', fontWeight: 'bold', fontSize: 'clamp(16px,2vw,24px)' }}>{t}</span>
                    <span style={{ color: '#00e040', fontFamily: 'monospace', fontWeight: 'bold', fontSize: 'clamp(18px,2.1vw,25px)' }}>{v}</span>
                  </div>
                ))}
              </div>
              {headline && <>
                <div style={{ width: '100%', height: '2px', background: '#007733', margin: '5% 0 3%' }} />
                <div style={{ color: '#00e040', fontFamily: 'monospace', fontWeight: 900, fontSize: 'clamp(18px,2.05vw,23px)', letterSpacing: '0.18em', marginBottom: 4, background: '#000', padding: '2px 10px' }}>● BREAKING</div>
                <div style={{ color: '#ffffff', fontFamily: 'monospace', fontSize: 'clamp(14px,1.5vw,19px)', fontWeight: 600, lineHeight: 1.4, textAlign: 'right', overflowWrap: 'break-word', wordBreak: 'break-word', background: '#000', padding: '2px 10px' }}>{truncate(headline.title)}</div>
                <div style={{ color: '#88ffaa', fontFamily: 'monospace', fontSize: 'clamp(13px,1.38vw,16px)', marginTop: 3, background: '#000', padding: '2px 10px' }}>{headline.time_ago}{headline.tickers.length > 0 ? ` · ${headline.tickers.slice(0, 3).map(tk => { const mv = movers.find(x => x.ticker === tk); return mv ? `${tk} ${fmtChg(mv.pct)}` : tk }).join('  ')}` : ''}</div>
              </>}
            </div>
          </div>
          <div style={{ position: 'absolute', top: '4%', left: '2%', color: 'rgba(0,200,60,0.92)', fontFamily: 'monospace', fontWeight: 'bold', fontSize: 'clamp(9px,1.1vw,13px)', letterSpacing: '0.08em' }}>▲ RISK ON — BULLS IN CONTROL</div>
          <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(0deg,rgba(0,0,0,0.04) 0px,rgba(0,0,0,0.04) 1px,transparent 1px,transparent 3px)', pointerEvents: 'none' }} />
        </div>
      )
    }
    if (sceneIdx === 2) {
      // UNUSUAL ACTIVITY — trader photo full bg, most volatile movers + related headline
      const volatileMvs: [string, string][] = [...movers].sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct)).slice(0, 2).map(m => [m.ticker, fmtChg(m.pct)])
      const topMoverTicker = movers[0]?.ticker ?? ''
      const headline = headlines.find(h => topMoverTicker !== '' && h.tickers.includes(topMoverTicker))
        ?? findH(/options|flow|unusual|sweep|block|volatile|implied|puts|calls/i)
      const rows: [string, string][] = volatileMvs.length > 0
        ? [['S&P 500', fmtChg(spyVal ?? -0.4)], ...volatileMvs.slice(0, 2)]
        : spyVal != null && allSectors
          ? [['S&P 500', fmtChg(spyVal)], ...[...allSectors].sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).slice(0, 2).map(x => [x.s, fmtChg(x.v)] as [string, string])]
          : [['S&P 500', '-0.4%'], ['XLK', '-1.2%'], ['XLY', '-0.8%']]
      return (
        <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#010308' }}>
          {/* Full-screen image */}
          <div style={{ position: 'absolute', inset: 0 }}>
            <img src="/loading/trader.jpg" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top', filter: 'contrast(1.5) brightness(0.55) saturate(0.35) hue-rotate(180deg)' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(1,3,8,0) 55%, rgba(1,3,8,0.7) 72%, rgba(1,3,8,0.96) 88%, #010308 100%)' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,140,255,0.18)', mixBlendMode: 'screen' }} />
          </div>
          {/* Narrow text panel — right 26% */}
          <div style={{ position: 'absolute', right: 0, top: 0, width: '26%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'right', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', alignSelf: 'flex-end', gap: '4px' }}>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace', fontWeight: 'bold', fontSize: 'clamp(8px,1vw,11px)', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '6%', background: '#000', padding: '2px 10px' }}>REAL-TIME SWEEP SCANNER</div>
              <div style={{ color: '#fff', fontFamily: fnt, fontWeight: 900, fontSize: 'clamp(13px,2vw,26px)', lineHeight: 1, textTransform: 'uppercase', textShadow: '2px 2px 8px rgba(0,0,0,0.9)', background: '#000', padding: '2px 10px' }}>UNUSUAL</div>
              <div style={{ color: '#00aaff', fontFamily: fnt, fontWeight: 900, fontSize: 'clamp(13px,2vw,26px)', lineHeight: 1, textTransform: 'uppercase', textShadow: '0 0 20px rgba(0,150,255,0.6)', background: '#000', padding: '2px 10px' }}>OPTIONS</div>
              <div style={{ color: '#fff', fontFamily: fnt, fontWeight: 900, fontSize: 'clamp(13px,2vw,26px)', lineHeight: 1, textTransform: 'uppercase', textShadow: '2px 2px 8px rgba(0,0,0,0.9)', marginBottom: '8%', background: '#000', padding: '2px 10px' }}>ACTIVITY</div>
              <div style={{ width: '100%', height: '2px', background: 'rgba(0,150,255,0.7)', marginBottom: '8%' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(4px,0.9vh,10px)', alignItems: 'flex-end' }}>
                {rows.map(([t, v]) => (
                  <div key={t} style={{ display: 'flex', gap: '8px', alignItems: 'baseline', background: '#000', padding: '2px 10px' }}>
                    <span style={{ color: '#ffffff', fontFamily: 'monospace', fontWeight: 'bold', fontSize: 'clamp(16px,2vw,24px)' }}>{t}</span>
                    <span style={{ color: v.startsWith('-') ? '#e03535' : '#00ccff', fontFamily: 'monospace', fontWeight: 'bold', fontSize: 'clamp(18px,2.1vw,25px)' }}>{v}</span>
                  </div>
                ))}
              </div>
              {headline && <>
                <div style={{ width: '100%', height: '2px', background: '#0066bb', margin: '5% 0 3%' }} />
                <div style={{ color: '#00ccff', fontFamily: 'monospace', fontWeight: 900, fontSize: 'clamp(18px,2.05vw,23px)', letterSpacing: '0.18em', marginBottom: 4, background: '#000', padding: '2px 10px' }}>● BREAKING</div>
                <div style={{ color: '#ffffff', fontFamily: 'monospace', fontSize: 'clamp(14px,1.5vw,19px)', fontWeight: 600, lineHeight: 1.4, textAlign: 'right', overflowWrap: 'break-word', wordBreak: 'break-word', background: '#000', padding: '2px 10px' }}>{truncate(headline.title)}</div>
                <div style={{ color: '#88ddff', fontFamily: 'monospace', fontSize: 'clamp(13px,1.38vw,16px)', marginTop: 3, background: '#000', padding: '2px 10px' }}>{headline.time_ago}{headline.tickers.length > 0 ? ` · ${headline.tickers.slice(0, 3).map(tk => { const mv = movers.find(x => x.ticker === tk); return mv ? `${tk} ${fmtChg(mv.pct)}` : tk }).join('  ')}` : ''}</div>
              </>}
            </div>
          </div>
          <div style={{ position: 'absolute', top: '4%', left: '2%', color: 'rgba(0,200,255,0.9)', fontFamily: 'monospace', fontWeight: 'bold', fontSize: 'clamp(9px,1.1vw,13px)', letterSpacing: '0.08em' }}>● SCANNING FLOW...</div>
          <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(0deg,rgba(0,0,0,0.04) 0px,rgba(0,0,0,0.04) 1px,transparent 1px,transparent 3px)', pointerEvents: 'none' }} />
        </div>
      )
    }
    // sceneIdx === 4: CRYPTO CRASH — alternate bear scene (cryptocrash.jpg)
    if (sceneIdx === 4) {
      const headline = findH(/crash|plunge|collapse|selloff|bitcoin|crypto|halt|suspend|circuit/i)
      const rows: [string, string][] = bigLosers.length > 0
        ? [['S&P 500', fmtChg(spyVal ?? -2)], ...bigLosers.slice(0, 2)]
        : spyVal != null && allSectors
          ? [['S&P 500', fmtChg(spyVal)], ...allSectors.slice(0, 2).map(x => [x.s, fmtChg(x.v)] as [string, string])]
          : [['S&P 500', '-2.1%'], ['XLK', '-3.2%'], ['XLY', '-2.8%']]
      return (
        <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#060102' }}>
          <div style={{ position: 'absolute', inset: 0 }}>
            <img src="/loading/cryptocrash.jpg" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', filter: 'contrast(1.5) brightness(0.55) saturate(0.6)' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(6,1,2,0) 55%, rgba(6,1,2,0.7) 72%, rgba(6,1,2,0.96) 88%, #060102 100%)' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(200,0,0,0.2)', mixBlendMode: 'screen' }} />
          </div>
          <div style={{ position: 'absolute', right: 0, top: 0, width: '26%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'right', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', alignSelf: 'flex-end', gap: '4px' }}>
              <div style={{ color: '#fff', fontFamily: fnt, fontWeight: 900, fontSize: 'clamp(14px,2.2vw,28px)', lineHeight: 1, textTransform: 'uppercase', textShadow: '2px 2px 8px rgba(0,0,0,0.9)', background: '#000', padding: '2px 10px' }}>CRYPTO</div>
              <div style={{ color: '#cc0000', fontFamily: fnt, fontWeight: 900, fontSize: 'clamp(18px,3vw,38px)', lineHeight: 1.05, textTransform: 'uppercase', textShadow: '0 0 20px rgba(200,0,0,0.6)', marginBottom: '8%', background: '#000', padding: '2px 10px' }}>IN FREEFALL</div>
              <div style={{ width: '100%', height: '2px', background: 'rgba(200,20,20,0.7)', marginBottom: '8%' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(4px,0.9vh,10px)', alignItems: 'flex-end' }}>
                {rows.map(([t, v]) => (
                  <div key={t} style={{ display: 'flex', gap: '8px', alignItems: 'baseline', background: '#000', padding: '2px 10px' }}>
                    <span style={{ color: '#ffffff', fontFamily: 'monospace', fontWeight: 'bold', fontSize: 'clamp(16px,2vw,24px)' }}>{t}</span>
                    <span style={{ color: '#cc0000', fontFamily: 'monospace', fontWeight: 'bold', fontSize: 'clamp(18px,2.1vw,25px)' }}>{v}</span>
                  </div>
                ))}
              </div>
              {headline && <>
                <div style={{ width: '100%', height: '2px', background: '#880000', margin: '5% 0 3%' }} />
                <div style={{ color: '#ff2200', fontFamily: 'monospace', fontWeight: 900, fontSize: 'clamp(18px,2.05vw,23px)', letterSpacing: '0.18em', marginBottom: 4, background: '#000', padding: '2px 10px' }}>● BREAKING</div>
                <div style={{ color: '#ffffff', fontFamily: 'monospace', fontSize: 'clamp(14px,1.5vw,19px)', fontWeight: 600, lineHeight: 1.4, textAlign: 'right', overflowWrap: 'break-word', wordBreak: 'break-word', background: '#000', padding: '2px 10px' }}>{truncate(headline.title)}</div>
                <div style={{ color: '#ff7766', fontFamily: 'monospace', fontSize: 'clamp(13px,1.38vw,16px)', marginTop: 3, background: '#000', padding: '2px 10px' }}>{headline.time_ago}{headline.tickers.length > 0 ? ` · ${headline.tickers.slice(0, 3).map(tk => { const mv = movers.find(x => x.ticker === tk); return mv ? `${tk} ${fmtChg(mv.pct)}` : tk }).join('  ')}` : ''}</div>
              </>}
            </div>
          </div>
          <div style={{ position: 'absolute', top: '4%', left: '2%', color: 'rgba(210,30,30,0.92)', fontFamily: 'monospace', fontWeight: 'bold', fontSize: 'clamp(9px,1.1vw,13px)', letterSpacing: '0.08em' }}>▼ CRYPTO MARKET SELLOFF</div>
          <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(0deg,rgba(0,0,0,0.04) 0px,rgba(0,0,0,0.04) 1px,transparent 1px,transparent 3px)', pointerEvents: 'none' }} />
        </div>
      )
    }
    // sceneIdx === 5: WALL ST BULL RUN — golden bull scene (bullwall.jpg)
    if (sceneIdx === 5) {
      const headline = findH(/beat|earnings beat|surge|rally|bullish|upgrade|record high|raises guidance|soar|ath/i)
      const rows: [string, string][] = bigGainers.length > 0
        ? [['S&P 500', fmtChg(spyVal ?? 1.8)], ...bigGainers.slice(0, 2)]
        : spyVal != null && allSectors
          ? [['S&P 500', fmtChg(spyVal)], ...allSectors.slice(-2).reverse().map(x => [x.s, fmtChg(x.v)] as [string, string])]
          : [['S&P 500', '+1.8%'], ['XLK', '+2.1%'], ['XLY', '+1.6%']]
      return (
        <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#020100' }}>
          <div style={{ position: 'absolute', inset: 0 }}>
            <img src="/loading/bullwall.jpg" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', filter: 'contrast(1.4) brightness(0.6) saturate(0.5)' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(2,1,0,0) 55%, rgba(2,1,0,0.7) 72%, rgba(2,1,0,0.96) 88%, #020100 100%)' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(180,130,0,0.15)', mixBlendMode: 'screen' }} />
          </div>
          <div style={{ position: 'absolute', right: 0, top: 0, width: '26%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'right', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', alignSelf: 'flex-end', gap: '4px' }}>
              <div style={{ color: '#fff', fontFamily: fnt, fontWeight: 900, fontSize: 'clamp(14px,2.2vw,28px)', lineHeight: 1, textTransform: 'uppercase', textShadow: '2px 2px 8px rgba(0,0,0,0.9)', background: '#000', padding: '2px 10px' }}>WALL ST</div>
              <div style={{ color: '#ffd700', fontFamily: fnt, fontWeight: 900, fontSize: 'clamp(18px,3vw,38px)', lineHeight: 1.05, textTransform: 'uppercase', textShadow: '0 0 20px rgba(255,200,0,0.6)', marginBottom: '8%', background: '#000', padding: '2px 10px' }}>BULL RUN</div>
              <div style={{ width: '100%', height: '2px', background: 'rgba(255,200,0,0.7)', marginBottom: '8%' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(4px,0.9vh,10px)', alignItems: 'flex-end' }}>
                {rows.map(([t, v]) => (
                  <div key={t} style={{ display: 'flex', gap: '8px', alignItems: 'baseline', background: '#000', padding: '2px 10px' }}>
                    <span style={{ color: '#ffffff', fontFamily: 'monospace', fontWeight: 'bold', fontSize: 'clamp(16px,2vw,24px)' }}>{t}</span>
                    <span style={{ color: '#00e040', fontFamily: 'monospace', fontWeight: 'bold', fontSize: 'clamp(18px,2.1vw,25px)' }}>{v}</span>
                  </div>
                ))}
              </div>
              {headline && <>
                <div style={{ width: '100%', height: '2px', background: '#997700', margin: '5% 0 3%' }} />
                <div style={{ color: '#ffd700', fontFamily: 'monospace', fontWeight: 900, fontSize: 'clamp(18px,2.05vw,23px)', letterSpacing: '0.18em', marginBottom: 4, background: '#000', padding: '2px 10px' }}>● BREAKING</div>
                <div style={{ color: '#ffffff', fontFamily: 'monospace', fontSize: 'clamp(14px,1.5vw,19px)', fontWeight: 600, lineHeight: 1.4, textAlign: 'right', overflowWrap: 'break-word', wordBreak: 'break-word', background: '#000', padding: '2px 10px' }}>{truncate(headline.title)}</div>
                <div style={{ color: '#ffdd88', fontFamily: 'monospace', fontSize: 'clamp(13px,1.38vw,16px)', marginTop: 3, background: '#000', padding: '2px 10px' }}>{headline.time_ago}{headline.tickers.length > 0 ? ` · ${headline.tickers.slice(0, 3).map(tk => { const mv = movers.find(x => x.ticker === tk); return mv ? `${tk} ${fmtChg(mv.pct)}` : tk }).join('  ')}` : ''}</div>
              </>}
            </div>
          </div>
          <div style={{ position: 'absolute', top: '4%', left: '2%', color: 'rgba(255,200,0,0.9)', fontFamily: 'monospace', fontWeight: 'bold', fontSize: 'clamp(9px,1.1vw,13px)', letterSpacing: '0.08em' }}>▲ WALL ST RALLYING</div>
          <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(0deg,rgba(0,0,0,0.04) 0px,rgba(0,0,0,0.04) 1px,transparent 1px,transparent 3px)', pointerEvents: 'none' }} />
        </div>
      )
    }
    // sceneIdx === 6: MARKET SURGING — crypto rally neon green scene (cryptorally.jpg)
    if (sceneIdx === 6) {
      const headline = findH(/surge|rally|record|soar|bitcoin|crypto|btc|eth|ath|all.time/i)
      const rows: [string, string][] = bigGainers.length > 0
        ? [['S&P 500', fmtChg(spyVal ?? 2)], ...bigGainers.slice(0, 2)]
        : spyVal != null && allSectors
          ? [['S&P 500', fmtChg(spyVal)], ...allSectors.slice(-2).reverse().map(x => [x.s, fmtChg(x.v)] as [string, string])]
          : [['S&P 500', '+2.0%'], ['XLK', '+3.1%'], ['NVDA', '+5.2%']]
      return (
        <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#010208' }}>
          <div style={{ position: 'absolute', inset: 0 }}>
            <img src="/loading/cryptorally.jpg" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', filter: 'contrast(1.5) brightness(0.55) saturate(0.45)' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(1,2,8,0) 55%, rgba(1,2,8,0.7) 72%, rgba(1,2,8,0.96) 88%, #010208 100%)' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,220,100,0.12)', mixBlendMode: 'screen' }} />
          </div>
          <div style={{ position: 'absolute', right: 0, top: 0, width: '26%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'right', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', alignSelf: 'flex-end', gap: '4px' }}>
              <div style={{ color: '#fff', fontFamily: fnt, fontWeight: 900, fontSize: 'clamp(14px,2.2vw,28px)', lineHeight: 1, textTransform: 'uppercase', textShadow: '2px 2px 8px rgba(0,0,0,0.9)', background: '#000', padding: '2px 10px' }}>MARKET</div>
              <div style={{ color: '#00ff88', fontFamily: fnt, fontWeight: 900, fontSize: 'clamp(18px,3vw,38px)', lineHeight: 1.05, textTransform: 'uppercase', textShadow: '0 0 20px rgba(0,255,100,0.7)', marginBottom: '8%', background: '#000', padding: '2px 10px' }}>SURGING</div>
              <div style={{ width: '100%', height: '2px', background: 'rgba(0,255,100,0.7)', marginBottom: '8%' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(4px,0.9vh,10px)', alignItems: 'flex-end' }}>
                {rows.map(([t, v]) => (
                  <div key={t} style={{ display: 'flex', gap: '8px', alignItems: 'baseline', background: '#000', padding: '2px 10px' }}>
                    <span style={{ color: '#ffffff', fontFamily: 'monospace', fontWeight: 'bold', fontSize: 'clamp(16px,2vw,24px)' }}>{t}</span>
                    <span style={{ color: '#00ff88', fontFamily: 'monospace', fontWeight: 'bold', fontSize: 'clamp(18px,2.1vw,25px)' }}>{v}</span>
                  </div>
                ))}
              </div>
              {headline && <>
                <div style={{ width: '100%', height: '2px', background: '#007744', margin: '5% 0 3%' }} />
                <div style={{ color: '#00ff88', fontFamily: 'monospace', fontWeight: 900, fontSize: 'clamp(18px,2.05vw,23px)', letterSpacing: '0.18em', marginBottom: 4, background: '#000', padding: '2px 10px' }}>● BREAKING</div>
                <div style={{ color: '#ffffff', fontFamily: 'monospace', fontSize: 'clamp(14px,1.5vw,19px)', fontWeight: 600, lineHeight: 1.4, textAlign: 'right', overflowWrap: 'break-word', wordBreak: 'break-word', background: '#000', padding: '2px 10px' }}>{truncate(headline.title)}</div>
                <div style={{ color: '#88ffcc', fontFamily: 'monospace', fontSize: 'clamp(13px,1.38vw,16px)', marginTop: 3, background: '#000', padding: '2px 10px' }}>{headline.time_ago}{headline.tickers.length > 0 ? ` · ${headline.tickers.slice(0, 3).map(tk => { const mv = movers.find(x => x.ticker === tk); return mv ? `${tk} ${fmtChg(mv.pct)}` : tk }).join('  ')}` : ''}</div>
              </>}
            </div>
          </div>
          <div style={{ position: 'absolute', top: '4%', left: '2%', color: 'rgba(0,255,100,0.9)', fontFamily: 'monospace', fontWeight: 'bold', fontSize: 'clamp(9px,1.1vw,13px)', letterSpacing: '0.08em' }}>▲ RISK ASSETS SURGING</div>
          <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(0deg,rgba(0,0,0,0.04) 0px,rgba(0,0,0,0.04) 1px,transparent 1px,transparent 3px)', pointerEvents: 'none' }} />
        </div>
      )
    }
    // sceneIdx === 3: TRADING THE FLOOR — NYSE photo full bg, top gainer + loser + headline
    const headline3 = headlines[0] ?? null
    const rows3: [string, string][] = (() => {
      const spyR: [string, string] = ['S&P 500', fmtChg(spyVal ?? 0.3)]
      if (bigGainers.length > 0 || bigLosers.length > 0) {
        const picks: [string, string][] = []
        if (bigGainers[0]) picks.push(bigGainers[0])
        if (bigLosers[0]) picks.push(bigLosers[0])
        return [spyR, ...picks]
      }
      if (spyVal != null && allSectors && allSectors.length > 1) {
        const top1 = allSectors[allSectors.length - 1]
        const bot1 = allSectors[0]
        return [spyR, [top1.s, fmtChg(top1.v)], [bot1.s, fmtChg(bot1.v)]]
      }
      return [spyR, ['XLU', '+1.1%'], ['XLE', '-0.8%']]
    })()
    return (
      <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#060400' }}>
        {/* Full-screen image */}
        <div style={{ position: 'absolute', inset: 0 }}>
          <img src="/loading/nyse.jpg" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', filter: 'contrast(1.4) brightness(0.62) saturate(0.45)' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(6,4,0,0) 55%, rgba(6,4,0,0.7) 72%, rgba(6,4,0,0.96) 88%, #060400 100%)' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,140,0,0.15)', mixBlendMode: 'screen' }} />
        </div>
        {/* Narrow text panel — right 26% */}
        <div style={{ position: 'absolute', right: 0, top: 0, width: '26%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'right', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', alignSelf: 'flex-end', gap: '4px' }}>
            <div style={{ color: 'rgba(255,180,50,0.65)', fontFamily: 'monospace', fontWeight: 'bold', fontSize: 'clamp(8px,1vw,11px)', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '6%', background: '#000', padding: '2px 10px' }}>NEW YORK STOCK EXCHANGE</div>
            <div style={{ color: '#fff', fontFamily: fnt, fontWeight: 900, fontSize: 'clamp(16px,2.6vw,34px)', lineHeight: 1, textTransform: 'uppercase', textShadow: '2px 2px 8px rgba(0,0,0,0.9)', background: '#000', padding: '2px 10px' }}>TRADING</div>
            <div style={{ color: '#ffaa00', fontFamily: fnt, fontWeight: 900, fontSize: 'clamp(16px,2.6vw,34px)', lineHeight: 1.05, textTransform: 'uppercase', textShadow: '0 0 20px rgba(255,140,0,0.6)', marginBottom: '8%', background: '#000', padding: '2px 10px' }}>THE FLOOR</div>
            <div style={{ width: '100%', height: '2px', background: 'rgba(255,140,0,0.7)', marginBottom: '8%' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(4px,0.9vh,10px)', alignItems: 'flex-end' }}>
              {rows3.map(([t, v]) => (
                <div key={t} style={{ display: 'flex', gap: '8px', alignItems: 'baseline', background: '#000', padding: '2px 10px' }}>
                  <span style={{ color: '#ffffff', fontFamily: 'monospace', fontWeight: 'bold', fontSize: 'clamp(16px,2vw,24px)' }}>{t}</span>
                  <span style={{ color: v.startsWith('+') ? '#00e060' : '#e03535', fontFamily: 'monospace', fontWeight: 'bold', fontSize: 'clamp(18px,2.1vw,25px)' }}>{v}</span>
                </div>
              ))}
            </div>
            {headline3 && <>
              <div style={{ width: '100%', height: '2px', background: '#aa7700', margin: '5% 0 3%' }} />
              <div style={{ color: '#ffaa00', fontFamily: 'monospace', fontWeight: 900, fontSize: 'clamp(18px,2.05vw,23px)', letterSpacing: '0.18em', marginBottom: 4, background: '#000', padding: '2px 10px' }}>● BREAKING</div>
              <div style={{ color: '#ffffff', fontFamily: 'monospace', fontSize: 'clamp(14px,1.5vw,19px)', fontWeight: 600, lineHeight: 1.4, textAlign: 'right', overflowWrap: 'break-word', wordBreak: 'break-word', background: '#000', padding: '2px 10px' }}>{truncate(headline3.title)}</div>
              <div style={{ color: '#ffcc66', fontFamily: 'monospace', fontSize: 'clamp(13px,1.38vw,16px)', marginTop: 3, background: '#000', padding: '2px 10px' }}>{headline3.time_ago}{headline3.tickers.length > 0 ? ` · ${headline3.tickers.slice(0, 3).map(tk => { const mv = movers.find(x => x.ticker === tk); return mv ? `${tk} ${fmtChg(mv.pct)}` : tk }).join('  ')}` : ''}</div>
            </>}
          </div>
        </div>
        <div style={{ position: 'absolute', top: '4%', left: '2%', color: 'rgba(255,160,30,0.9)', fontFamily: 'monospace', fontWeight: 'bold', fontSize: 'clamp(9px,1.1vw,13px)', letterSpacing: '0.08em' }}>NYSE · MARKET OPEN</div>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(0deg,rgba(0,0,0,0.04) 0px,rgba(0,0,0,0.04) 1px,transparent 1px,transparent 3px)', pointerEvents: 'none' }} />
      </div>
    )
  }, [mktSnap, mktCtx, snapDriven, loadingArtIndex])

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

  // Cache: key = `${ticker}_${expiry}` ? { golden: strike|null, purple: strike|null }
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

  const [blacklistEnabled, setBlacklistEnabled] = useState<boolean>(false)

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
      setModeLoadingStep(null)

      return
    }

    setOptionPricesFetching(true)

    setGradingProgress({ current: 0, total: activeTrades.length }) // Parallel batch processing for faster fetching

    try {

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

    } finally {
      setOptionPricesFetching(false)
      setGradingProgress(null)
      setModeLoadingStep(null)
    }
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

  // Calculate multi-period RS vs SPY for LEAP grading (5D/13D/21D)

  const calculateLeapRS = async (
    trades: OptionsFlowData[]
  ): Promise<Map<string, { rs5d: number; rs13d: number; rs21d: number }>> => {
    const rsMap = new Map<string, { rs5d: number; rs13d: number; rs21d: number }>()
    const tickers = [...new Set(trades.map((t) => t.underlying_ticker))]

    const today = new Date()
    const endStr = today.toISOString().split('T')[0]
    const startDate = new Date(today)
    startDate.setDate(startDate.getDate() - 38) // 38 calendar days to cover 21+ trading days
    const startStr = startDate.toISOString().split('T')[0]

    // Fetch SPY once
    let spyResults: Array<{ c: number }> = []
    try {
      const spyRes = await fetch(
        `https://api.polygon.io/v2/aggs/ticker/SPY/range/1/day/${startStr}/${endStr}?adjusted=true&sort=asc&apiKey=${POLYGON_API_KEY}`,
        { signal: AbortSignal.timeout(8000) }
      )
      const spyData = await spyRes.json()
      spyResults = spyData.results || []
    } catch {
      // silent fail
    }

    if (spyResults.length < 6) return rsMap

    const pctChange = (arr: Array<{ c: number }>, n: number): number | null => {
      if (arr.length < n + 1) return null
      const recent = arr[arr.length - 1].c
      const old = arr[arr.length - 1 - n].c
      return ((recent - old) / old) * 100
    }

    const spy5d = pctChange(spyResults, Math.min(5, spyResults.length - 1))
    const spy13d = pctChange(spyResults, Math.min(13, spyResults.length - 1))
    const spy21d = pctChange(spyResults, Math.min(21, spyResults.length - 1))

    const BATCH_SIZE = 20
    for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
      const batch = tickers.slice(i, i + BATCH_SIZE)
      await Promise.all(
        batch.map(async (ticker, idx) => {
          await new Promise((resolve) => setTimeout(resolve, idx * 50))
          try {
            const stockRes = await fetch(
              `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${startStr}/${endStr}?adjusted=true&sort=asc&apiKey=${POLYGON_API_KEY}`,
              { signal: AbortSignal.timeout(8000) }
            )
            if (!stockRes.ok) return
            const stockData = await stockRes.json()
            const stockResults: Array<{ c: number }> = stockData.results || []
            if (stockResults.length < 6) return

            const stock5d = pctChange(stockResults, Math.min(5, stockResults.length - 1))
            const stock13d = pctChange(stockResults, Math.min(13, stockResults.length - 1))
            const stock21d = pctChange(stockResults, Math.min(21, stockResults.length - 1))

            rsMap.set(ticker, {
              rs5d: stock5d !== null && spy5d !== null ? stock5d - spy5d : 0,
              rs13d: stock13d !== null && spy13d !== null ? stock13d - spy13d : 0,
              rs21d: stock21d !== null && spy21d !== null ? stock21d - spy21d : 0,
            })
          } catch {
            // silent fail
          }
        })
      )
    }

    return rsMap
  }

  // Fetch 52-week high/low for a set of tickers (for LEAP bonus scoring)
  const fetchLeap52wkData = async (tickers: string[]): Promise<Map<string, { high52: number; low52: number }>> => {
    const result = new Map<string, { high52: number; low52: number }>()
    const BATCH_SIZE = 5
    for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
      const batch = tickers.slice(i, i + BATCH_SIZE)
      await Promise.allSettled(
        batch.map(async (ticker) => {
          try {
            const endDate = new Date().toISOString().split('T')[0]
            const startDate = new Date(Date.now() - 366 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
            const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${startDate}/${endDate}?adjusted=true&sort=asc&limit=400&apiKey=${POLYGON_API_KEY}`
            const resp = await fetch(url, { signal: AbortSignal.timeout(10000) })
            if (!resp.ok) return
            const data = await resp.json()
            if (data.results && data.results.length > 0) {
              const high52 = Math.max(...data.results.map((r: any) => r.h))
              const low52 = Math.min(...data.results.map((r: any) => r.l))
              result.set(ticker, { high52, low52 })
            }
          } catch { /* silent */ }
        })
      )
      if (i + BATCH_SIZE < tickers.length) {
        await new Promise(r => setTimeout(r, 200))
      }
    }
    return result
  }

  // Compute seasonal sweet-spot / pain-point for a ticker using 15y of Polygon daily bars
  // Returns whether today's day-of-year falls within the best sweet spot or worst pain point window
  const fetchLeapSeasonalData = async (
    tickers: string[]
  ): Promise<Map<string, { inSweetSpot: boolean; inPainPoint: boolean }>> => {
    const result = new Map<string, { inSweetSpot: boolean; inPainPoint: boolean }>()

    // Helper: day-of-year for a Date
    const getDayOfYear = (d: Date) => {
      const start = new Date(d.getFullYear(), 0, 0)
      const diff = d.getTime() - start.getTime()
      return Math.floor(diff / (1000 * 60 * 60 * 24))
    }

    const SEASONAL_BATCH_SIZE = 3
    for (let bi = 0; bi < tickers.length; bi += SEASONAL_BATCH_SIZE) {
      const batch = tickers.slice(bi, bi + SEASONAL_BATCH_SIZE)
      await Promise.allSettled(
        batch.map(async (ticker) => {
          try {
            const endDate = new Date().toISOString().split('T')[0]
            const startDate = new Date(Date.now() - 15 * 365.25 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
            const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${startDate}/${endDate}?adjusted=true&sort=asc&limit=5000&apiKey=${POLYGON_API_KEY}`
            const resp = await fetch(url, { signal: AbortSignal.timeout(15000) })
            if (!resp.ok) return
            const json = await resp.json()
            const bars: { t: number; c: number }[] = json.results || []
            if (bars.length < 20) return

            // Build daily avgReturn map (same algorithm as SeasonalityChart processDailySeasonalData)
            const dailyGroups: { [day: number]: number[] } = {}
            for (let j = 1; j < bars.length; j++) {
              const prev = bars[j - 1]
              const curr = bars[j]
              const dayOfYear = getDayOfYear(new Date(curr.t))
              const ret = ((curr.c - prev.c) / prev.c) * 100
              if (!dailyGroups[dayOfYear]) dailyGroups[dayOfYear] = []
              dailyGroups[dayOfYear].push(ret)
            }

            // Build dailyData with avgReturn per day-of-year
            const dailyData: { dayOfYear: number; avgReturn: number }[] = []
            for (let day = 1; day <= 365; day++) {
              const group = dailyGroups[day]
              if (!group || group.length === 0) continue
              const avgReturn = group.reduce((s, r) => s + r, 0) / group.length
              dailyData.push({ dayOfYear: day, avgReturn })
            }

            // Find best sweet spot and worst pain point (50-90 day windows)
            let bestSweetSpot = { startDay: 1, endDay: 50, totalReturn: -9999 }
            let worstPainPoint = { startDay: 1, endDay: 50, totalReturn: 9999 }

            for (let windowSize = 50; windowSize <= 90; windowSize++) {
              for (let startDay = 1; startDay <= 365 - windowSize; startDay++) {
                const endDay = startDay + windowSize - 1
                const windowData = dailyData.filter(d => d.dayOfYear >= startDay && d.dayOfYear <= endDay)
                if (windowData.length < Math.floor(windowSize * 0.8)) continue
                const cumulativeReturn = windowData.reduce((s, d) => s + d.avgReturn, 0)
                if (cumulativeReturn > bestSweetSpot.totalReturn) {
                  bestSweetSpot = { startDay, endDay, totalReturn: cumulativeReturn }
                }
                if (cumulativeReturn < worstPainPoint.totalReturn) {
                  worstPainPoint = { startDay, endDay, totalReturn: cumulativeReturn }
                }
              }
            }

            const todayDayOfYear = getDayOfYear(new Date())
            const inSweetSpot = todayDayOfYear >= bestSweetSpot.startDay && todayDayOfYear <= bestSweetSpot.endDay
            const inPainPoint = todayDayOfYear >= worstPainPoint.startDay && todayDayOfYear <= worstPainPoint.endDay
            result.set(ticker, { inSweetSpot, inPainPoint })
          } catch { /* silent */ }
        })
      )
      if (bi + SEASONAL_BATCH_SIZE < tickers.length) {
        await new Promise(r => setTimeout(r, 300))
      }
    }
    return result
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
      }
    } else {
      scores.priceAction = 0

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

    } else {
      scores.volumeOI = 0
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

    // ── DEBUG: FLOW TABLE grade ───────────────────────────────────────────────
    console.debug(
      `[GRADE DEBUG] FLOW TABLE | ${trade.underlying_ticker} ${trade.type.toUpperCase()} $${trade.strike} exp:${trade.expiry}`,
      {
        grade,
        totalScore: confidenceScore,
        breakdown: {
          expiration: `${scores.expiration}/25`,
          contractPnL: `${scores.contractPrice}/15`,
          relativeStrength: `${scores.relativeStrength}/10  ← LIVE RS (not frozen)`,
          combo: `${scores.combo}/10`,
          priceAction: `${scores.priceAction}/10  ← MAX is 10 here (A+ Tracker caps at 25)`,
          volumeVsOI: `${scores.volumeOI}/15  ← ONLY scored in flow table (A+ Tracker omits this)`,
          stockReaction: `${scores.stockReaction}/15`,
        },
        inputs: {
          currentOptionPrice: currentPrice,
          entryPrice,
          rawPercentChange: ((currentPrice - entryPrice) / entryPrice) * 100,
          adjustedPctChange: percentChange,
          daysToExpiry: trade.days_to_expiry,
          fillStyle: trade.fill_style,
          isSoldToOpen,
          entryStockPrice: trade.spot_price,
          currentStockPrice: currentPrices[trade.underlying_ticker],
          stdDev: historicalStdDevs.get(trade.underlying_ticker),
          tradeVolume: trade.volume ?? null,
          tradeOI: trade.open_interest ?? null,
        },
      }
    )
    // ─────────────────────────────────────────────────────────────────────────

    return { grade, score: confidenceScore, color: scoreColor, breakdown, scores, stdDevError }
  }

  // LEAP grading system · 4 criteria, normalized to 100

  const calculateLeapGrade = (
    trade: OptionsFlowData,
    _comboMap: Map<string, boolean>
  ): {
    grade: string
    score: number
    color: string
    breakdown: string
    stdDevError: boolean
    scores: {
      contractPrice: number
      relativeStrength: number
      volumeOI: number
      stockReaction: number
      bonus52w: number
      seasonalBonus: number
    }
  } => {
    const expiry = trade.expiry.replace(/-/g, '').slice(2)
    const strikeFormatted = String(Math.round(trade.strike * 1000)).padStart(8, '0')
    const optionType = trade.type.toLowerCase() === 'call' ? 'C' : 'P'
    const normalizedTicker = normalizeTickerForOptions(trade.underlying_ticker)
    const optionTicker = `O:${normalizedTicker}${expiry}${optionType}${strikeFormatted}`
    const currentPrice = currentOptionPrices[optionTicker]
    const entryPrice = trade.premium_per_contract



    const scores = {
      contractPrice: 0,
      relativeStrength: 0,
      volumeOI: 0,
      stockReaction: 0,
      bonus52w: 0,
      seasonalBonus: 0,
    }

    if (!currentPrice || currentPrice <= 0) {
      return {
        grade: 'N/A',
        score: 0,
        color: '#9ca3af',
        breakdown: 'Loading prices...',
        stdDevError: stdDevFailed.has(trade.underlying_ticker),
        scores,
      }
    }

    // 1. Contract P&L (15 pts max)
    // Sweet spot for LEAP: down 15-20% = consolidation / still cheap
    const tradeFillStyle = trade.fill_style || ''
    const isSoldToOpen = tradeFillStyle === 'B' || tradeFillStyle === 'BB'
    const rawPct = ((currentPrice - entryPrice) / entryPrice) * 100
    const pct = isSoldToOpen ? -rawPct : rawPct

    if (pct <= -40) scores.contractPrice = -7.5       // blown up · penalize
    else if (pct <= -20) scores.contractPrice = 7.5   // down 20-40%: half points
    else if (pct <= -15) scores.contractPrice = 15    // down 15-20%: sweet spot, full points
    else if (pct <= -10) scores.contractPrice = 8     // down 10-15%: partial
    else if (pct <= 10) scores.contractPrice = 0      // flat ·10%: no points
    else if (pct <= 20) scores.contractPrice = 3      // up 10-20%: small reward
    else scores.contractPrice = 5                     // up 20%+: 1/3 of max (5 pts)

    // 2. Relative Strength (30 pts max) · weighted 5D·30% + 13D·40% + 21D·30%
    const leapRs = leapRsData.get(trade.underlying_ticker)
    if (leapRs) {
      const { rs5d, rs13d, rs21d } = leapRs
      const weightedRS = rs5d * 0.3 + rs13d * 0.4 + rs21d * 0.3

      const isCall = trade.type === 'call'
      const fill = tradeFillStyle
      // Bullish: call A/AA or put B
      const isBullish =
        (isCall && (fill === 'A' || fill === 'AA')) || (!isCall && fill === 'B')
      // Bearish: put A/AA or call BB
      const isBearish =
        (!isCall && (fill === 'A' || fill === 'AA')) || (isCall && fill === 'BB')

      const aligned = (isBullish && weightedRS > 0) || (isBearish && weightedRS < 0)
      const magnitude = Math.abs(weightedRS)

      if (aligned) {
        if (magnitude >= 3) scores.relativeStrength = 30
        else if (magnitude >= 1.5) scores.relativeStrength = 20
        else scores.relativeStrength = 10
      }
    }

    // 3. Volume vs OI (15 pts max)
    const tradeVolume = trade.volume ?? null
    const tradeOI = trade.open_interest ?? null
    if (tradeVolume !== null && tradeOI !== null && tradeOI > 0) {
      const ratio = tradeVolume / tradeOI
      if (ratio >= 1.5) scores.volumeOI = 15
      else if (ratio >= 1.0) scores.volumeOI = 7.5
      else if (ratio >= 0.5) scores.volumeOI = 5
    }

    // 4. Stock Reaction (15 pts max) · 4hr and 1d checkpoints
    const isCall = trade.type === 'call'
    const fill = tradeFillStyle
    const currentStockPrice = currentPrices[trade.underlying_ticker]
    const entryStockPrice = trade.spot_price

    if (currentStockPrice && entryStockPrice) {
      const stockPct = ((currentStockPrice - entryStockPrice) / entryStockPrice) * 100
      const isBullishFlow =
        (isCall && (fill === 'A' || fill === 'AA')) || (!isCall && (fill === 'B' || fill === 'BB'))
      const isBearishFlow =
        (isCall && (fill === 'B' || fill === 'BB')) || (!isCall && (fill === 'A' || fill === 'AA'))

      const reversed =
        (isBullishFlow && stockPct <= -1.0) || (isBearishFlow && stockPct >= 1.0)
      const followed =
        (isBullishFlow && stockPct >= 1.0) || (isBearishFlow && stockPct <= -1.0)
      const chopped = Math.abs(stockPct) < 1.0

      const hoursElapsed =
        (new Date().getTime() - new Date(trade.trade_timestamp).getTime()) / (1000 * 60 * 60)

      if (hoursElapsed >= 4) {
        // 4-hour checkpoint
        if (reversed) scores.stockReaction += 7.5
        else if (chopped) scores.stockReaction += 5
        else if (followed) scores.stockReaction += 2.5

        if (hoursElapsed >= 24) {
          // 1-day checkpoint
          if (reversed) scores.stockReaction += 7.5
          else if (chopped) scores.stockReaction += 5
          else if (followed) scores.stockReaction += 2.5
        }
      }
    }

    // Bonus 1: 52-week high/low alignment (+7.5 pts = +10% of 75)
    const wkRange = leap52wkData.get(trade.underlying_ticker)
    const stockNow = currentPrices[trade.underlying_ticker]
    if (wkRange && stockNow && stockNow > 0) {
      const isBullishFill =
        (isCall && (fill === 'A' || fill === 'AA')) ||
        (!isCall && (fill === 'B' || fill === 'BB'))
      const isBearishFill =
        (!isCall && (fill === 'A' || fill === 'AA')) ||
        (isCall && (fill === 'B' || fill === 'BB'))
      const nearHigh = stockNow >= wkRange.high52 * 0.98
      const nearLow = stockNow <= wkRange.low52 * 1.02
      if (isBullishFill && nearHigh) scores.bonus52w = 7.5
      else if (isBearishFill && nearLow) scores.bonus52w = 7.5
    }

    // Bonus 2: Seasonality sweet-spot / pain-point alignment (+15 pts = +20% of 75)
    const seasonal = leapSeasonalData.get(trade.underlying_ticker)
    if (seasonal) {
      const isBullishFill =
        (isCall && (fill === 'A' || fill === 'AA')) ||
        (!isCall && (fill === 'B' || fill === 'BB'))
      const isBearishFill =
        (!isCall && (fill === 'A' || fill === 'AA')) ||
        (isCall && (fill === 'B' || fill === 'BB'))
      if (isBullishFill && seasonal.inSweetSpot) scores.seasonalBonus = 15
      else if (isBearishFill && seasonal.inPainPoint) scores.seasonalBonus = 15
    }

    // Base max = 75; bonus points push score up but cap stays at 75
    const rawScore =
      scores.contractPrice + scores.relativeStrength + scores.volumeOI + scores.stockReaction +
      scores.bonus52w + scores.seasonalBonus
    const confidenceScore = Math.min(75, Math.max(0, rawScore))

    let grade = 'F'
    if (confidenceScore >= 64) grade = 'A+'
    else if (confidenceScore >= 60) grade = 'A'
    else if (confidenceScore >= 56) grade = 'A-'
    else if (confidenceScore >= 53) grade = 'B+'
    else if (confidenceScore >= 49) grade = 'B'
    else if (confidenceScore >= 45) grade = 'B-'
    else if (confidenceScore >= 41) grade = 'C+'
    else if (confidenceScore >= 38) grade = 'C'
    else if (confidenceScore >= 34) grade = 'C-'
    else if (confidenceScore >= 30) grade = 'D+'
    else if (confidenceScore >= 26) grade = 'D'
    else if (confidenceScore >= 22) grade = 'D-'

    let scoreColor = '#ff0000'
    if (confidenceScore >= 64) scoreColor = '#00ff00'
    else if (confidenceScore >= 53) scoreColor = '#84cc16'
    else if (confidenceScore >= 38) scoreColor = '#fbbf24'
    else if (confidenceScore >= 22) scoreColor = '#3b82f6'

    const leapRsForBreakdown = leapRsData.get(trade.underlying_ticker)
    const breakdown =
      `LEAP Score: ${confidenceScore}/75\n\n` +
      `Contract P&L: ${scores.contractPrice}/15  (option ?: ${((currentPrice - entryPrice) / entryPrice * 100).toFixed(1)}%)\n` +
      `RS (5D/13D/21D): ${scores.relativeStrength}/30  ` +
      (leapRsForBreakdown
        ? `(5D: ${leapRsForBreakdown.rs5d.toFixed(2)}%, 13D: ${leapRsForBreakdown.rs13d.toFixed(2)}%, 21D: ${leapRsForBreakdown.rs21d.toFixed(2)}%)`
        : '(loading...)') +
      `\nVolume vs OI: ${scores.volumeOI}/15` +
      `\nStock Reaction (4h/1d): ${scores.stockReaction}/15` +
      (scores.bonus52w > 0 ? `\n52W Breakout Bonus: +${scores.bonus52w}` : '') +
      (scores.seasonalBonus > 0 ? `\nSeasonality Bonus: +${scores.seasonalBonus}` : '')

    return {
      grade,
      score: confidenceScore,
      color: scoreColor,
      breakdown,
      stdDevError: stdDevFailed.has(trade.underlying_ticker),
      scores,
    }
  }

  // LEAP criteria checker
  const meetsLeapCriteria = (trade: OptionsFlowData): boolean => {
    // 1. Expiry: 30·180 days
    if (trade.days_to_expiry < 30 || trade.days_to_expiry > 180) return false
    // 2. Premium: $250k·$2m
    if (trade.total_premium < 250000 || trade.total_premium > 2000000) return false
    // 3. Contracts: 300+
    if (trade.trade_size < 300) return false
    // 4. ATM or OTM only
    if (!trade.moneyness || !['ATM', 'OTM'].includes(trade.moneyness)) return false
    return true
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

  // Notable Trade Analysis · targets + dealer zones
  const openNotableAnalysis = async (trade: OptionsFlowData) => {
    setSelectedNotableTrade(trade)
    setNotableAnalysisLoading(true)
    setNotableAnalysisData(null)

    try {
      const isCall = trade.type === 'call'
      const spotPrice = trade.spot_price
      const expiryForApi = trade.expiry

      // -- Fetch real option chain for IV + tower detection --
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
          // -- EXACT same Black-Scholes as DealerOpenInterestChart --
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

          // -- EXACT tower detection from DealerOpenInterestChart --
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
    window.dispatchEvent(new CustomEvent('flowWatchlistUpdated', { detail: { flows: newTrackedFlows } }))
    console.log('[FlowTracking] addToFlowTracking ? saved', newTrackedFlows.length, 'flows to localStorage')

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
    window.dispatchEvent(new CustomEvent('flowWatchlistUpdated', { detail: { flows: newTrackedFlows } }))
    console.log('[FlowTracking] removeFromFlowTracking ? saved', newTrackedFlows.length, 'flows to localStorage')
  }

  // Save current flow data to database

  const handleSaveFlow = async () => {
    try {
      setSavingFlow(true)
      setSaveStatus('idle')
      setSaveErrorMsg('')

      const _now = new Date()
      const today = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}-${String(_now.getDate()).padStart(2, '0')}`
      console.log('[SaveFlow] RAW data prop count (before filters):', data?.length)
      console.log('[SaveFlow] FILTERED display count (filteredAndSortedData):', filteredAndSortedData?.length)
      console.log('[SaveFlow] Saving filteredAndSortedData · count:', filteredAndSortedData?.length)

      // Compress payload client-side to avoid 413 Payload Too Large
      const dataString = JSON.stringify({ date: today, data: filteredAndSortedData })
      const encoded = new TextEncoder().encode(dataString)
      console.log('[SaveFlow] Payload size (uncompressed):', (encoded.length / 1024 / 1024).toFixed(2), 'MB')
      const cs = new CompressionStream('gzip')
      const writer = cs.writable.getWriter()
      writer.write(encoded)
      writer.close()
      const compressedBuffer = await new Response(cs.readable).arrayBuffer()
      console.log('[SaveFlow] Compressed size:', (compressedBuffer.byteLength / 1024 / 1024).toFixed(2), 'MB · sending to /api/flows/save')

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
      console.log('[History] Fetching /api/flows/dates...')

      const response = await fetch('/api/flows/dates')
      console.log('[History] /api/flows/dates status:', response.status, response.statusText)

      if (!response.ok) {
        const errText = await response.text().catch(() => '(no body)')
        console.error('[History] Error body:', errText)
        throw new Error(`Failed to load history: HTTP ${response.status} · ${errText}`)
      }

      const rawText = await response.text()
      let dates: any[]
      try { dates = JSON.parse(rawText) } catch (e) {
        throw new Error(`Response was not JSON: ${rawText.slice(0, 200)}`)
      }
      if (!Array.isArray(dates)) {
        console.error('[History] Response is not an array:', dates)
        throw new Error(`Expected array, got: ${JSON.stringify(dates).slice(0, 200)}`)
      }
      setSavedFlowDates(dates)
      setIsHistoryDialogOpen(true)
    } catch (error) {
      console.error('[History] loadFlowHistory threw:', error)
      alert(`Failed to load history: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setLoadingHistory(false)
    }
  }

  // Load specific flow by date

  const handleLoadFlow = async (date: string) => {
    try {
      setLoadingFlowDate(date)
      const encodedDate = encodeURIComponent(date)
      const url = `/api/flows/${encodedDate}`

      const response = await fetch(url)

      if (!response.ok) {
        const errText = await response.text().catch(() => '(no body)')
        throw new Error(`HTTP ${response.status} · ${errText}`)
      }

      const flowData = await response.json()

      onDataUpdate && onDataUpdate(flowData.data)
      setIsHistoryDialogOpen(false)
    } catch (error) {
      alert(`Failed to load flow: ${error instanceof Error ? error.message : String(error)}`)
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
      const encodedDate = encodeURIComponent(date)
      const url = `/api/flows/${encodedDate}`
      console.log('[DeleteFlow] DELETE', url, '| raw date:', date)

      const response = await fetch(url, { method: 'DELETE' })
      console.log('[DeleteFlow] Response status:', response.status, response.statusText)

      if (!response.ok) {
        const errText = await response.text().catch(() => '(no body)')
        console.error('[DeleteFlow] Error body:', errText)
        throw new Error(`HTTP ${response.status} · ${errText}`)
      }

      const result = await response.json().catch(() => ({}))
      console.log('[DeleteFlow] Success:', result)

      setSavedFlowDates((prev) => {
        const next = prev.filter((f) => f.date !== date)
        console.log('[DeleteFlow] Removed from local list. Remaining:', next.length)
        return next
      })
    } catch (error) {
      console.error('[DeleteFlow] threw:', error)
      alert(`Failed to delete: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const handleSort = (field: keyof OptionsFlowData | 'positioning_grade' | 'leap_grade') => {
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

    // Step 1: Fast deduplication using Set (O(n) instead of O(n·))

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

    // LEAP filter - when active, show ONLY trades that meet LEAP criteria
    if (leapActive) {
      filtered = filtered.filter((trade) => meetsLeapCriteria(trade))
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
              return (
                trade.underlying_ticker.length === 3 &&
                !mag7Stocks.includes(trade.underlying_ticker)
              )

            case 'STOCK_ONLY':
              return trade.underlying_ticker.length >= 3

            case 'MAG7_ONLY':
              return mag7Stocks.includes(trade.underlying_ticker)

            case 'EXCLUDE_MAG7':
              return !mag7Stocks.includes(trade.underlying_ticker)

            case 'EXCLUDE_ETF': {
              const etfList = new Set(['SPY', 'QQQ', 'IWM', 'EFA', 'EEM', 'VTI', 'IEFA', 'AGG', 'LQD', 'HYG', 'XLF', 'XLE', 'XLK', 'XLV', 'XLI', 'XLU', 'XLP', 'XLY', 'XLB', 'XLRE', 'XLC', 'GLD', 'SLV', 'TLT', 'IEF', 'SHY', 'VTEB', 'VXUS', 'BND', 'BNDX', 'DIA', 'SMH', 'VXX', 'UVXY'])
              return !etfList.has(trade.underlying_ticker)
            }

            case 'HIGHLIGHTS_ONLY':
              return meetsEfiCriteria(trade)

            default:
              return true
          }
        })
      })
    }

    // Unique filters (visibility toggles — unchecked = hide that category)

    const hasDeselected = ALL_UNIQUE_FILTERS.some(f => !selectedUniqueFilters.includes(f))
    if (hasDeselected) {
      filtered = filtered.filter((trade) => {
        if (trade.moneyness === 'ITM' && !selectedUniqueFilters.includes('ITM')) return false
        if (trade.moneyness === 'OTM' && !selectedUniqueFilters.includes('OTM')) return false
        if (trade.trade_type === 'SWEEP' && !selectedUniqueFilters.includes('SWEEP_ONLY')) return false
        if (trade.trade_type === 'BLOCK' && !selectedUniqueFilters.includes('BLOCK_ONLY')) return false
        if (trade.trade_type === 'MULTI-LEG' && !selectedUniqueFilters.includes('MULTI_LEG_ONLY')) return false
        if (trade.trade_type === 'MINI' && !selectedUniqueFilters.includes('MINI_ONLY')) return false
        if (!selectedUniqueFilters.includes('WEEKLY_ONLY')) {
          const expiryDate = new Date(trade.expiry)
          const today = new Date()
          const daysToExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
          if (daysToExpiry <= 7) return false
        }
        return true
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

    const activeBlacklistedTickers = blacklistEnabled ? blacklistedTickers.filter((ticker) => ticker.trim() !== '') : []

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
      // Special handling for positioning grade sorting (can't use cache due to initialization order)

      if (sortField === 'positioning_grade') {
        const gradeA = calculatePositioningGrade(a, comboTradeMap)

        const gradeB = calculatePositioningGrade(b, comboTradeMap)

        // Use the numeric score for sorting (higher score = better grade)

        // DESC: High to Low (A+ to F), ASC: Low to High (F to A+)

        const result =
          sortDirection === 'desc' ? gradeB.score - gradeA.score : gradeA.score - gradeB.score

        return result
      }

      if (sortField === 'leap_grade') {
        const gradeA = calculateLeapGrade(a, comboTradeMap)
        const gradeB = calculateLeapGrade(b, comboTradeMap)
        return sortDirection === 'desc' ? gradeB.score - gradeA.score : gradeA.score - gradeB.score
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
    blacklistEnabled,
    selectedOrderSides,
    tradesWithFillStyles,
    efiHighlightsActive,
    leapActive,
    quickFilters,
    notableFilterActive,
  ])

  // Memoize all grade calculations - massive performance boost for 100+ trades

  const gradesCache = useMemo(() => {
    const cache = new Map<string, ReturnType<typeof calculatePositioningGrade> | ReturnType<typeof calculateLeapGrade>>()

    filteredAndSortedData.forEach((trade) => {
      const tradeId = `${trade.underlying_ticker}-${trade.strike}-${trade.expiry}-${trade.type}-${trade.trade_timestamp}`
      const result = leapActive
        ? calculateLeapGrade(trade, comboTradeMap)
        : calculatePositioningGrade(trade, comboTradeMap)
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
    leapRsData,
    leapActive,
    historicalStdDevs,
    leap52wkData,
    leapSeasonalData,
  ])

  // Helper function to get cached grade

  const getCachedGrade = (trade: OptionsFlowData) => {
    const tradeId = `${trade.underlying_ticker}-${trade.strike}-${trade.expiry}-${trade.type}-${trade.trade_timestamp}`

    return (
      gradesCache.get(tradeId) ||
      (leapActive
        ? calculateLeapGrade(trade, comboTradeMap)
        : calculatePositioningGrade(trade, comboTradeMap))
    )
  }

  // Automatically enrich trades with Vol/OI AND Fill Style in ONE combined call - IMMEDIATELY as part of scan

  useEffect(() => {
    // ? NO ENRICHMENT NEEDED! All data comes pre-enriched from backend snapshot API

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
    // Deduplicate by ticker · one fetch covers ALL expirations for the ticker
    const seenTickers = new Set<string>()
    for (const trade of notableTrades) {
      const key = trade.underlying_ticker
      if (key in dealerZoneCache || seenTickers.has(key)) continue
      seenTickers.add(key)

      // -- Priority 1: use DealerAttraction's live-computed values if available --
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

      // -- Priority 2: fetch from server-side snapshot API --
      setDealerZoneCache((prev) =>
        key in prev ? prev : { ...prev, [key]: { golden: null, purple: null, atmIV: null } }
      )
      // Delegate entirely to the dealer-zones API · same computation as DealerAttraction
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

  // Fetch current option prices when EFI Highlights or LEAP is ON

  useEffect(() => {
    if ((efiHighlightsActive || leapActive) && filteredAndSortedData.length > 0) {
      // Include active mode in hash so LEAP and EFI each trigger their own independent fetch
      const activeMode = leapActive ? 'LEAP' : 'EFI'
      const datasetHash = `${activeMode}-${data.length}-${data
        .slice(0, 5)
        .map((d) => d.underlying_ticker)
        .join('-')}`

      // Only fetch if we haven't fetched for this dataset + mode combination yet

      if (datasetHash !== pricesFetchedForDataset) {
        fetchCurrentOptionPrices(filteredAndSortedData)

        setPricesFetchedForDataset(datasetHash)
      }
    }
  }, [efiHighlightsActive, leapActive, data.length])

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

      // columns · grade col appended only when EFI active
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

        // -- Background --
        ctx.fillStyle = '#000000'
        ctx.fillRect(0, 0, totalW, totalH)

        // -- Title bar --
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
        ctx.fillText('? EFI OPTIONS FLOW', PAD, TITLE_H / 2)
        ctx.fillStyle = '#ffffff'
        ctx.font = '15px "Courier New", monospace'
        ctx.textAlign = 'right'
        ctx.fillText(
          new Date().toLocaleString('en-US', { month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) +
          (totalPages > 1 ? `   ${page + 1}/${totalPages}  ·  ${allTrades.length} TRADES` : `   ${allTrades.length} TRADES`),
          totalW - PAD, TITLE_H / 2
        )

        // -- Header (glossy black) --
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

        // -- Rows --
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

          // SYMBOL · orange ticker style matching the UI
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

          // SIZE · "1,234 @ 3.40 A"
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

        // -- Footer --
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
        ctx.fillText('EFI TRADING  ·  efitrading.com', totalW / 2, fY + FOOTER_H / 2)

        // -- Download --
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
        window.dispatchEvent(new CustomEvent('flowWatchlistUpdated', { detail: { flows: activeFlows } }))
        console.log('[FlowTracking] expired flows removed ? saved', activeFlows.length, 'flows to localStorage')

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
            className="filter-dialog fixed left-0 md:left-1/2 transform md:-translate-x-1/2 w-full md:w-auto md:max-w-[985px] max-h-[85vh] md:h-auto md:max-h-[55vh] overflow-y-auto z-[9999]"
            style={{
              top: typeof window !== 'undefined' && window.innerWidth < 768 ? '130px' : '224px',
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
                  &#x2715;
                </button>
              </div>

              {/* Mobile: Premium Redesigned Layout */}

              {isMobileView && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {/* -- OPTIONS + TYPE -- */}
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

                  {/* -- PREMIUM -- */}
                  <div
                    style={{
                      background: '#000',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '12px',
                      padding: '10px',
                      boxShadow: '0 0 0 1px rgba(255,255,255,0.05), 0 8px 24px rgba(0,0,0,0.95)',
                      alignSelf: 'flex-start',
                      width: '100%',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        marginBottom: '8px',
                        paddingBottom: '6px',
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
                        gap: '5px',
                        marginBottom: '6px',
                      }}
                    >
                      {[
                        { label: '= $50K', value: '50000' },
                        { label: '= $99K', value: '99000' },
                        { label: '= $200K', value: '200000' },
                        { label: '= $1M', value: '1000000' },
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
                              padding: '6px 4px',
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
                        gap: '5px',
                        paddingTop: '6px',
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
                            paddingTop: '6px',
                            paddingBottom: '6px',
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
                          placeholder="$8"
                          style={{
                            width: '100%',
                            paddingLeft: '40px',
                            paddingRight: '8px',
                            paddingTop: '6px',
                            paddingBottom: '6px',
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

                  {/* -- TICKER + SPECIAL -- */}
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
                          { label: 'NO ETF', value: 'EXCLUDE_ETF' },
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

                  {/* -- BLACKLIST -- */}
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
                          flex: 1,
                        }}
                      >
                        Blacklist
                      </span>
                      <button
                        onClick={() => setBlacklistEnabled((v) => !v)}
                        style={{
                          padding: '3px 10px',
                          borderRadius: '6px',
                          border: blacklistEnabled ? '1px solid #ef4444' : '1px solid rgba(255,255,255,0.15)',
                          background: blacklistEnabled ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.05)',
                          color: blacklistEnabled ? '#fca5a5' : 'rgba(255,255,255,0.4)',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          letterSpacing: '1px',
                        }}
                      >
                        {blacklistEnabled ? 'ON' : 'OFF'}
                      </button>
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

                  {/* -- EXPIRATION -- */}
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
                    {/* OPTIONS TYPE + UNIQUE FILTERS */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
                            { label: 'ITM', value: 'ITM', color: '#22c55e' },
                            { label: 'OTM', value: 'OTM', color: '#ffffff' },
                            { label: 'Sweep Only', value: 'SWEEP_ONLY', color: '#22d3ee' },
                            { label: 'Block Only', value: 'BLOCK_ONLY', color: '#22d3ee' },
                            { label: 'Multi-Leg', value: 'MULTI_LEG_ONLY', color: '#a855f7' },
                            { label: 'Weekly', value: 'WEEKLY_ONLY', color: '#f97316' },
                            { label: 'Mini Only', value: 'MINI_ONLY', color: '#84cc16' },
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
                                  padding: '7px 8px',
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
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                {label}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    </div>{/* end OPTIONS TYPE + UNIQUE FILTERS */}

                    {/* PREMIUM + BLACK LIST stacked */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {/* PREMIUM */}
                      <div
                        style={{
                          background: '#000',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: '12px',
                          padding: '14px',
                          boxShadow: '0 0 0 1px rgba(255,255,255,0.05), 0 8px 24px rgba(0,0,0,0.95)',
                          alignSelf: 'start',
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
                            gap: '6px',
                            marginBottom: '7px',
                          }}
                        >
                          {[
                            { label: '= $50K', value: '50000' },
                            { label: '= $99K', value: '99000' },
                            { label: '= $200K', value: '200000' },
                            { label: '= $1M', value: '1000000' },
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
                                  padding: '7px 8px',
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
                            gap: '6px',
                            paddingTop: '7px',
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
                                paddingTop: '7px',
                                paddingBottom: '7px',
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
                              placeholder="$8"
                              style={{
                                width: '100%',
                                paddingLeft: '40px',
                                paddingRight: '8px',
                                paddingTop: '7px',
                                paddingBottom: '7px',
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
                              flex: 1,
                            }}
                          >
                            Black List
                          </span>
                          <button
                            onClick={() => setBlacklistEnabled((v) => !v)}
                            style={{
                              padding: '3px 10px',
                              borderRadius: '6px',
                              border: blacklistEnabled ? '1px solid #ef4444' : '1px solid rgba(255,255,255,0.15)',
                              background: blacklistEnabled ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.05)',
                              color: blacklistEnabled ? '#fca5a5' : 'rgba(255,255,255,0.4)',
                              fontSize: '11px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              letterSpacing: '1px',
                            }}
                          >
                            {blacklistEnabled ? 'ON' : 'OFF'}
                          </button>
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
                    </div>{/* end PREMIUM + BLACK LIST column */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
                            { label: 'Exclude ETFs', value: 'EXCLUDE_ETF' },
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
                    </div>{/* end TICKER + OPTIONS EXPIRATION */}
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {savedFlowDates.map((flow, i) => {
                    // Parse date string directly (YYYY-MM-DD) to avoid any timezone shifting.
                    const dateStr = typeof flow.date === 'string'
                      ? flow.date.slice(0, 10)
                      : new Date(flow.date).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
                    const [yr, mo, dy] = dateStr.split('-').map(Number)
                    const tradingDate = new Date(yr, mo - 1, dy) // local midnight · no shift
                    const dateLabel = tradingDate.toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      timeZone: 'America/Los_Angeles',
                    })
                    // Time label from createdAt in PST/PDT
                    const savedAt = new Date(flow.createdAt)
                    const timeLabel = savedAt.toLocaleTimeString('en-US', {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true,
                      timeZone: 'America/Los_Angeles',
                    })
                    const tradeCount: number | null = (flow as any).tradeCount ?? null
                    return (
                      <div
                        key={flow.date}
                        style={{
                          background: 'linear-gradient(135deg, #111111 0%, #0a0a0a 50%, #131313 100%)',
                          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 2px 8px rgba(0,0,0,0.8)',
                          border: '1px solid #1e1e1e',
                          padding: '13px 18px',
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
                              fontSize: '19px',
                              fontWeight: 700,
                              letterSpacing: '0.5px',
                              marginBottom: '5px',
                            }}
                          >
                            {dateLabel}
                          </div>
                          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                            <span
                              style={{
                                color: '#ff6600',
                                fontSize: '15px',
                                fontWeight: 700,
                                letterSpacing: '1px',
                              }}
                            >
                              {tradeCount != null
                                ? `${tradeCount.toLocaleString()} TRADES`
                                : '· TRADES'}
                            </span>
                            <span
                              style={{
                                color: '#00e5ff',
                                fontSize: '15px',
                                fontWeight: 700,
                                letterSpacing: '0.5px',
                              }}
                            >
                              SAVED {timeLabel}
                            </span>
                          </div>
                        </div>

                        {/* Right: actions */}
                        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                          <button
                            onClick={() => handleDownloadFlowExcel(flow.date, dateLabel)}
                            title="Download as Excel"
                            style={{
                              background: 'linear-gradient(180deg, #1a1a1a 0%, #000000 60%, #0d0d0d 100%)',
                              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), 0 2px 6px rgba(0,0,0,0.9)',
                              color: '#00e564',
                              border: '1px solid #00e564',
                              padding: '9px 15px',
                              fontSize: '14px',
                              fontWeight: 700,
                              letterSpacing: '1.5px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '5px',
                            }}
                          >
                            ? XLS
                          </button>
                          <button
                            onClick={() => handleLoadFlow(flow.date)}
                            disabled={loadingFlowDate === flow.date}
                            style={{
                              background: 'linear-gradient(180deg, #1a1a1a 0%, #000000 60%, #0d0d0d 100%)',
                              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), 0 2px 6px rgba(0,0,0,0.9)',
                              color: '#ff6600',
                              border: '1px solid #ff6600',
                              padding: '9px 17px',
                              fontSize: '14px',
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
                              background: 'linear-gradient(180deg, #1a1a1a 0%, #000000 60%, #0d0d0d 100%)',
                              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), 0 2px 6px rgba(0,0,0,0.9)',
                              color: '#ff2222',
                              border: '1px solid #ff2222',
                              padding: '9px 13px',
                              fontSize: '14px',
                              fontWeight: 700,
                              letterSpacing: '1px',
                              cursor: 'pointer',
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

          marginRight: isSidebarPanel || isMobileView ? '0' : '38%',

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
                  width: efiHighlightsActive ? '54px' : '90px',
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
                {/* LEAP Button - mobile */}
                <button
                  onClick={async () => {
                    const newState = !leapActive
                    setLeapActive(newState)
                    if (efiHighlightsActive) setEfiHighlightsActive(false)
                    if (newState) {
                      setModeLoadingStep({ mode: 'LEAP', step: 'Calculating Relative Strength...' })
                      await new Promise<void>(r => setTimeout(r, 0))
                      const rsData = await calculateLeapRS(filteredAndSortedData)
                      setLeapRsData(rsData)
                      const tickers = [...new Set(filteredAndSortedData.map(t => t.underlying_ticker))]
                      setModeLoadingStep({ mode: 'LEAP', step: 'Fetching 52-Week Ranges...' })
                      await new Promise<void>(r => setTimeout(r, 0))
                      const [wkData, seasonData] = await Promise.all([
                        fetchLeap52wkData(tickers),
                        (async () => {
                          setModeLoadingStep({ mode: 'LEAP', step: 'Analyzing Seasonality...' })
                          return fetchLeapSeasonalData(tickers)
                        })(),
                      ])
                      setLeap52wkData(wkData)
                      setLeapSeasonalData(seasonData)
                      setModeLoadingStep(null)
                    } else {
                      setModeLoadingStep(null)
                    }
                  }}
                  className="px-2 font-black uppercase transition-all duration-200 flex items-center gap-1 hover:scale-[1.02] active:scale-[0.98] focus:outline-none"
                  style={{
                    height: '40px',
                    background: leapActive
                      ? 'linear-gradient(180deg, #00c9ff 0%, #0099cc 50%, #007aa3 100%)'
                      : 'linear-gradient(180deg, #1a1a1a 0%, #000000 50%, #000000 100%)',
                    border: leapActive ? '1px solid #00e5ff' : '2px solid #2a2a2a',
                    borderRadius: '4px',
                    fontSize: '10px',
                    letterSpacing: '0.5px',
                    fontWeight: '900',
                    boxShadow: leapActive
                      ? 'inset 0 1px 0 rgba(255,255,255,0.4), 0 0 10px rgba(0,200,255,0.4)'
                      : 'inset 0 2px 8px rgba(0,0,0,0.9)',
                    color: leapActive ? '#000000' : '#00c9ff',
                  }}
                >
                  Leap Picks
                </button>

                {/* Highlights Button */}

                <button
                  onClick={async () => {
                    const newState = !efiHighlightsActive
                    setEfiHighlightsActive(newState)
                    if (newState) {
                      setLeapActive(false)
                      setModeLoadingStep({ mode: 'EFI', step: 'Calculating Relative Strength...' })
                      const efiTrades = filteredAndSortedData.filter(meetsEfiCriteria)
                      const rsData = await calculateRelativeStrength(efiTrades)
                      setRelativeStrengthData(rsData)
                      setModeLoadingStep(null)
                    } else {
                      setModeLoadingStep(null)
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
                        ? 'SAVED ?'
                        : saveStatus === 'error'
                          ? 'ERROR ?'
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
            className="hidden md:block"
            style={{
              width: '100%',

              overflow: 'visible',

              background: 'linear-gradient(180deg, #141414 0%, #080808 100%)',

              borderBottom: '1px solid #ff8500',

              borderTop: '1px solid rgba(255,255,255,0.06)',

              boxShadow: '0 4px 24px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.04)',

              paddingLeft: '20px',

              paddingRight: '16px',
            }}
          >
            <div
              className="control-bar flex items-center justify-between"
              style={{ width: '100%', maxWidth: '1800px', height: '52px' }}
            >
              <div className="flex items-center gap-2" style={{ flexShrink: 0, height: '100%' }}>
                {/* Compact Search Bar */}

                <div className="relative" style={{ width: '148px' }}>
                  <div className="absolute left-3 top-1/2 transform -translate-y-1/2 z-10 pointer-events-none">
                    <svg
                      width="13" height="13"
                      fill="none"
                      stroke="#ff8500"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
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

                      e.target.style.borderColor = '#ff8500'

                      e.target.style.boxShadow = '0 0 0 1px rgba(255,133,0,0.15)'
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

                      e.target.style.borderColor = '#2a2a2a'

                      e.target.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.05), inset 0 -1px 0 rgba(0,0,0,0.4)'
                    }}
                    placeholder="TICKER"
                    className="text-white font-mono placeholder-gray-600"
                    style={{
                      width: '100%',

                      height: '34px',

                      paddingLeft: '2.1rem',

                      paddingRight: '0.75rem',

                      borderRadius: '6px',

                      fontSize: '12px',

                      fontWeight: '700',

                      letterSpacing: '1.5px',

                      background: 'linear-gradient(180deg, #1c1c1c 0%, #0e0e0e 100%)',

                      border: '1px solid #2a2a2a',

                      textTransform: 'uppercase',

                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.5), 0 2px 4px rgba(0,0,0,0.5)',

                      outline: 'none',

                      transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
                    }}
                    maxLength={20}
                  />
                </div>

                {/* Historical Days Dropdown */}
                {onHistoricalDaysChange && (
                  <select
                    value={historicalDays}
                    onChange={(e) => onHistoricalDaysChange(e.target.value)}
                    style={{
                      height: 31,
                      padding: '0 22px 0 9px',
                      background: historicalDays !== '1D' ? '#000' : '#000',
                      border: `1px solid ${historicalDays !== '1D' ? 'rgba(255,133,0,0.65)' : '#2a2a2a'}`,
                      color: historicalDays !== '1D' ? '#ff8500' : '#888',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07), inset 0 -1px 0 rgba(0,0,0,0.5), 0 2px 4px rgba(0,0,0,0.4)',
                      fontSize: 12,
                      fontWeight: 700,
                      letterSpacing: '0.1em',
                      cursor: 'pointer',
                      borderRadius: 5,
                      outline: 'none',
                      minWidth: 80,
                      transition: 'border-color 0.15s ease',
                      appearance: 'none' as any,
                      WebkitAppearance: 'none' as any,
                      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5' viewBox='0 0 8 5'%3E%3Cpath d='M1 1l3 3 3-3' stroke='%23666' stroke-width='1.2' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'right 7px center',
                    }}
                  >
                    <option value="1D" style={{ background: '#000', color: '#ccc' }}>TODAY</option>
                    <option value="2" style={{ background: '#000', color: '#ccc' }}>2 DAYS</option>
                    <option value="3" style={{ background: '#000', color: '#ccc' }}>3 DAYS</option>
                    <option value="4" style={{ background: '#000', color: '#ccc' }}>4 DAYS</option>
                    <option value="5" style={{ background: '#000', color: '#ccc' }}>5 DAYS</option>
                    <option value="7" style={{ background: '#000', color: '#ccc' }}>7 DAYS</option>
                    <option value="10" style={{ background: '#000', color: '#ccc' }}>10 DAYS</option>
                    <option value="14" style={{ background: '#000', color: '#ccc' }}>14 DAYS</option>
                    <option value="20" style={{ background: '#000', color: '#ccc' }}>20 DAYS</option>
                    <option value="30" style={{ background: '#000', color: '#ccc' }}>30 DAYS</option>
                    <option value="45" style={{ background: '#000', color: '#ccc' }}>45 DAYS</option>
                    <option value="60" style={{ background: '#000', color: '#ccc' }}>60 DAYS</option>
                    <option value="90" style={{ background: '#000', color: '#ccc' }}>90 DAYS</option>
                    <option value="126" style={{ background: '#000', color: '#ccc' }}>126 DAYS</option>
                    <option value="189" style={{ background: '#000', color: '#ccc' }}>189 DAYS</option>
                    <option value="252" style={{ background: '#000', color: '#ccc' }}>252 DAYS</option>
                  </select>
                )}

                {/* Divider */}
                <div className="hidden md:block" style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.14)' }}></div>

                {/* Scan Shortcuts */}

                <div className="hidden md:flex items-center gap-2">
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
                        value="ALL"
                        style={{ background: '#000000', color: '#ffffff', fontWeight: '900' }}
                      >
                        ALL TICKERS
                      </option>
                      <option
                        value="MAG7"
                        style={{ background: '#000000', color: '#a855f7', fontWeight: '900' }}
                      >
                        MAG7
                      </option>
                      <option
                        value="ETF"
                        style={{ background: '#000000', color: '#ff8500', fontWeight: '900' }}
                      >
                        ETF
                      </option>
                    </select>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setInputTicker('ALL')
                          onTickerChange('ALL')
                          onRefresh?.('ALL')
                        }}
                        className="toolbar-pill font-bold uppercase transition-all duration-150"
                        style={{
                          height: '31px',
                          padding: '0 13px',
                          background: inputTicker === 'ALL' ? 'linear-gradient(180deg, rgba(255,133,0,0.22) 0%, rgba(255,133,0,0.06) 55%, rgba(0,0,0,0.2) 100%)' : 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 55%, rgba(0,0,0,0.25) 100%)',
                          border: inputTicker === 'ALL' ? '1px solid #ff8500' : '1px solid #666',
                          borderRadius: '20px',
                          fontSize: '12px',
                          letterSpacing: '1.2px',
                          fontWeight: '700',
                          boxShadow: inputTicker === 'ALL' ? 'inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(0,0,0,0.45), 0 0 10px rgba(255,133,0,0.22)' : 'inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.35)',
                          outline: 'none',
                          color: inputTicker === 'ALL' ? '#ffaa55' : '#d4d4d4',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        All Tickers
                      </button>

                      <button
                        onClick={() => {
                          setInputTicker('MAG7')
                          onTickerChange('MAG7')
                          onRefresh?.('MAG7')
                        }}
                        className="toolbar-pill font-bold uppercase transition-all duration-150"
                        style={{
                          height: '31px',
                          padding: '0 13px',
                          background: inputTicker === 'MAG7' ? 'linear-gradient(180deg, rgba(168,85,247,0.26) 0%, rgba(168,85,247,0.07) 55%, rgba(0,0,0,0.2) 100%)' : 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 55%, rgba(0,0,0,0.25) 100%)',
                          border: inputTicker === 'MAG7' ? '1px solid #c084fc' : '1px solid #a855f7',
                          borderRadius: '20px',
                          fontSize: '12px',
                          letterSpacing: '1.2px',
                          fontWeight: '700',
                          boxShadow: inputTicker === 'MAG7' ? 'inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -1px 0 rgba(0,0,0,0.45), 0 0 12px rgba(168,85,247,0.28)' : 'inset 0 1px 0 rgba(255,255,255,0.07), inset 0 -1px 0 rgba(0,0,0,0.35)',
                          outline: 'none',
                          color: inputTicker === 'MAG7' ? '#d8aaff' : '#c084fc',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        MAG7 ONLY
                      </button>

                      <button
                        onClick={() => {
                          setInputTicker('ETF')
                          onTickerChange('ETF')
                          onRefresh?.('ETF')
                        }}
                        className="toolbar-pill font-bold uppercase transition-all duration-150"
                        style={{
                          height: '31px',
                          padding: '0 13px',
                          background: inputTicker === 'ETF' ? 'linear-gradient(180deg, rgba(255,133,0,0.22) 0%, rgba(255,133,0,0.06) 55%, rgba(0,0,0,0.2) 100%)' : 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 55%, rgba(0,0,0,0.25) 100%)',
                          border: inputTicker === 'ETF' ? '1px solid #ff8500' : '1px solid #cc6a00',
                          borderRadius: '20px',
                          fontSize: '12px',
                          letterSpacing: '1.2px',
                          fontWeight: '700',
                          boxShadow: inputTicker === 'ETF' ? 'inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(0,0,0,0.45), 0 0 10px rgba(255,133,0,0.22)' : 'inset 0 1px 0 rgba(255,255,255,0.07), inset 0 -1px 0 rgba(0,0,0,0.35)',
                          outline: 'none',
                          color: inputTicker === 'ETF' ? '#ffaa55' : '#ff8500',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        ETF ONLY
                      </button>
                    </>
                  )}
                </div>

                {/* Divider */}

                {!isSidebarPanel && (
                  <div
                    className="hidden md:block"
                    style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.14)' }}
                  ></div>
                )}

                {/* Quick Filters */}

                <div className="hidden md:flex items-center gap-2">
                  {efiHighlightsActive && (
                    <button
                      onClick={() => setNotableFilterActive(!notableFilterActive)}
                      className="toolbar-pill font-bold uppercase transition-all duration-150"
                      style={{
                        height: '31px',
                        padding: '0 13px',
                        background: notableFilterActive ? 'linear-gradient(180deg, rgba(255,215,0,0.3) 0%, rgba(255,215,0,0.09) 55%, rgba(255,215,0,0.18) 100%)' : 'linear-gradient(180deg, rgba(255,215,0,0.12) 0%, rgba(255,215,0,0.03) 100%)',
                        border: notableFilterActive ? '1px solid #ffd700' : '1px solid #c8a500',
                        borderRadius: '20px',
                        fontSize: '11px',
                        letterSpacing: '1.5px',
                        fontWeight: '700',
                        boxShadow: notableFilterActive ? 'inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -1px 0 rgba(0,0,0,0.45), 0 0 10px rgba(255,215,0,0.22)' : 'inset 0 1px 0 rgba(255,255,255,0.07), inset 0 -1px 0 rgba(0,0,0,0.35)',
                        outline: 'none',
                        color: notableFilterActive ? '#ffd700' : '#c8a500',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      NOTABLE
                    </button>
                  )}
                </div>

                {/* Divider */}

                <div
                  className="hidden md:block"
                  style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.14)' }}
                ></div>

                {/* LEAP Toggle */}
                <button
                  onClick={async () => {
                    const newState = !leapActive
                    setLeapActive(newState)
                    if (efiHighlightsActive) setEfiHighlightsActive(false)
                    if (newState) {
                      setModeLoadingStep({ mode: 'LEAP', step: 'Calculating Relative Strength...' })
                      await new Promise<void>(r => setTimeout(r, 0))
                      const rsData = await calculateLeapRS(filteredAndSortedData)
                      setLeapRsData(rsData)
                      const tickers = [...new Set(filteredAndSortedData.map(t => t.underlying_ticker))]
                      setModeLoadingStep({ mode: 'LEAP', step: 'Fetching 52-Week Ranges...' })
                      await new Promise<void>(r => setTimeout(r, 0))
                      const [wkData, seasonData] = await Promise.all([
                        fetchLeap52wkData(tickers),
                        (async () => {
                          setModeLoadingStep({ mode: 'LEAP', step: 'Analyzing Seasonality...' })
                          return fetchLeapSeasonalData(tickers)
                        })(),
                      ])
                      setLeap52wkData(wkData)
                      setLeapSeasonalData(seasonData)
                      setModeLoadingStep(null)
                    } else {
                      setModeLoadingStep(null)
                    }
                  }}
                  className={`toolbar-mode${leapActive ? ' toolbar-mode--active' : ''} flex items-center gap-1.5 font-bold uppercase transition-all duration-150 focus:outline-none`}
                  style={{
                    height: '35px',
                    padding: '0 15px',
                    background: leapActive
                      ? 'linear-gradient(180deg, rgba(0,212,255,0.24) 0%, rgba(0,150,200,0.08) 55%, rgba(0,0,0,0.2) 100%)'
                      : 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 55%, rgba(0,0,0,0.25) 100%)',
                    border: leapActive ? '1px solid #00d4ff' : '1px solid #0099bb',
                    borderRadius: '7px',
                    fontSize: '12px',
                    letterSpacing: '1.5px',
                    fontWeight: '700',
                    boxShadow: leapActive ? 'inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -1px 0 rgba(0,0,0,0.45), 0 0 14px rgba(0,200,255,0.28)' : 'inset 0 1px 0 rgba(255,255,255,0.09), inset 0 -1px 0 rgba(0,0,0,0.4)',
                    color: '#00d4ff',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span className="tb-icon" style={{ display: 'flex', alignItems: 'center' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                      <polyline points="17 6 23 6 23 12" />
                    </svg>
                  </span>
                  Leap Picks
                </button>

                {/* Premium EFI Highlights Toggle */}

                <button
                  onClick={async () => {
                    const newState = !efiHighlightsActive
                    setEfiHighlightsActive(newState)
                    if (newState) {
                      setLeapActive(false)
                      setModeLoadingStep({ mode: 'EFI', step: 'Calculating Relative Strength...' })
                      const efiTrades = filteredAndSortedData.filter(meetsEfiCriteria)
                      const rsData = await calculateRelativeStrength(efiTrades)
                      setRelativeStrengthData(rsData)
                      setModeLoadingStep(null)
                    } else {
                      setModeLoadingStep(null)
                    }
                  }}
                  className={`toolbar-mode${efiHighlightsActive ? ' toolbar-mode--active' : ''} flex items-center gap-1.5 font-bold uppercase transition-all duration-150 focus:outline-none`}
                  style={{
                    height: '35px',
                    padding: '0 15px',
                    background: efiHighlightsActive
                      ? 'linear-gradient(180deg, rgba(245,166,35,0.24) 0%, rgba(245,133,0,0.08) 55%, rgba(0,0,0,0.2) 100%)'
                      : 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 55%, rgba(0,0,0,0.25) 100%)',
                    border: efiHighlightsActive ? '1px solid #f5a623' : '1px solid #b87010',
                    borderRadius: '7px',
                    fontSize: '12px',
                    letterSpacing: '1.5px',
                    fontWeight: '700',
                    boxShadow: efiHighlightsActive ? 'inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -1px 0 rgba(0,0,0,0.45), 0 0 14px rgba(245,166,35,0.25)' : 'inset 0 1px 0 rgba(255,255,255,0.09), inset 0 -1px 0 rgba(0,0,0,0.4)',
                    color: '#f5a623',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span className="tb-icon" style={{ display: 'flex', alignItems: 'center' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" fill={efiHighlightsActive ? 'currentColor' : 'none'} strokeWidth={efiHighlightsActive ? 0 : 2} />
                    </svg>
                  </span>

                  <span>HIGHLIGHTS</span>

                  <span
                    style={{
                      fontSize: '9px',
                      letterSpacing: '0.1em',
                      color: efiHighlightsActive ? '#f5d978' : '#888',
                      fontWeight: '900',
                      transition: 'color 0.15s ease',
                    }}
                  >
                    {efiHighlightsActive ? 'ON' : 'OFF'}
                  </span>
                </button>

                {/* Grading Progress — now shown in fullscreen overlay, hidden from header */}

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
                        ·
                      </button>
                    </div>
                  </div>
                )}

                {/* Divider */}
                <div className="hidden md:block" style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.14)' }}></div>

                {/* Action Buttons */}

                <div className="flex items-center gap-1.5">
                  {/* Algo Flow Button */}
                  {onAlgoFlowClick && (
                    <button
                      onClick={onAlgoFlowClick}
                      title="Algo Flow"
                      className="hidden md:flex items-center gap-1.5 font-bold uppercase transition-all duration-150 focus:outline-none"
                      style={{
                        height: '35px',
                        padding: '0 13px',
                        background: 'linear-gradient(180deg, rgba(255,133,0,0.22) 0%, rgba(255,133,0,0.06) 55%, rgba(0,0,0,0.2) 100%)',
                        border: '1px solid #ff8500',
                        borderRadius: '7px',
                        fontSize: '12px',
                        letterSpacing: '1.2px',
                        fontWeight: '700',
                        color: '#ffaa55',
                        cursor: 'pointer',
                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.45), 0 0 10px rgba(255,133,0,0.18)',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center' }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                        </svg>
                      </span>
                      Algo Flow
                    </button>
                  )}

                  {!isSidebarPanel && (
                    <button
                      onClick={() => onRefresh?.()}
                      disabled={loading}
                      title={loading ? (streamingStatus || 'Scanning...') : 'Refresh'}
                      className={`toolbar-btn-refresh hidden md:flex items-center justify-center transition-all duration-150 focus:outline-none ${loading ? 'cursor-not-allowed opacity-40' : ''}`}
                      style={{
                        width: '42px',
                        height: '42px',
                        background: 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 55%, rgba(0,0,0,0.3) 100%)',
                        border: '1px solid #0ea5e9',
                        borderRadius: '7px',
                        cursor: loading ? 'not-allowed' : 'pointer',
                        transition: 'all 0.15s ease',
                        color: '#0ea5e9',
                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.6), 0 2px 6px rgba(0,0,0,0.5)',
                      }}
                      onMouseEnter={(e) => {
                        if (!loading) {
                          e.currentTarget.style.borderColor = 'rgba(14,165,233,1)'
                          e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(0,0,0,0.6), 0 0 14px rgba(14,165,233,0.35)'
                          e.currentTarget.style.background = 'linear-gradient(180deg, rgba(14,165,233,0.28) 0%, rgba(14,165,233,0.08) 55%, rgba(0,0,0,0.15) 100%)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = '#0ea5e9'
                        e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.6), 0 2px 6px rgba(0,0,0,0.5)'
                        e.currentTarget.style.background = 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 55%, rgba(0,0,0,0.3) 100%)'
                      }}
                    >
                      <span className="tb-icon" style={{ display: 'flex', alignItems: 'center' }}>
                        {loading ? (
                          <svg className="animate-spin" width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                        ) : (
                          <svg width="17" height="17" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                        )}
                      </span>
                    </button>
                  )}

                  {/* Clear Data Button - Desktop Only */}

                  {onClearData && (
                    <button
                      onClick={onClearData}
                      disabled={loading}
                      title="Clear Data"
                      className={`toolbar-btn-clear hidden md:flex items-center justify-center transition-all duration-150 focus:outline-none ${loading ? 'cursor-not-allowed opacity-40' : ''}`}
                      style={{
                        width: '42px',
                        height: '42px',
                        background: 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 55%, rgba(0,0,0,0.3) 100%)',
                        border: '1px solid #ef4444',
                        borderRadius: '7px',
                        cursor: loading ? 'not-allowed' : 'pointer',
                        transition: 'all 0.15s ease',
                        color: '#ef4444',
                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.6), 0 2px 6px rgba(0,0,0,0.5)',
                      }}
                      onMouseEnter={(e) => {
                        if (!loading) {
                          e.currentTarget.style.borderColor = 'rgba(239,68,68,1)'
                          e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(0,0,0,0.6), 0 0 14px rgba(239,68,68,0.35)'
                          e.currentTarget.style.background = 'linear-gradient(180deg, rgba(239,68,68,0.28) 0%, rgba(239,68,68,0.08) 55%, rgba(0,0,0,0.15) 100%)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = '#ef4444'
                        e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.6), 0 2px 6px rgba(0,0,0,0.5)'
                        e.currentTarget.style.background = 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 55%, rgba(0,0,0,0.3) 100%)'
                      }}
                    >
                      <span className="tb-icon" style={{ display: 'flex', alignItems: 'center' }}>
                        <svg width="17" height="17" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </span>
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
                              loadFlowHistory()
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
                    title={savingFlow ? 'Saving...' : saveStatus === 'success' ? 'Saved!' : saveStatus === 'error' ? 'Error saving' : 'Save Flow'}
                    className={`toolbar-btn-save${saveStatus === 'success' ? ' tb-save-success' : ''} hidden md:flex items-center justify-center transition-all duration-150 focus:outline-none ${savingFlow || !data || data.length === 0 ? 'cursor-not-allowed opacity-40' : ''}`}
                    style={{
                      width: '42px',
                      height: '42px',
                      background: saveStatus === 'success' ? 'linear-gradient(180deg, rgba(34,197,94,0.22) 0%, rgba(34,197,94,0.06) 55%, rgba(0,0,0,0.2) 100%)' : saveStatus === 'error' ? 'linear-gradient(180deg, rgba(239,68,68,0.22) 0%, rgba(239,68,68,0.06) 55%, rgba(0,0,0,0.2) 100%)' : 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 55%, rgba(0,0,0,0.3) 100%)',
                      border: saveStatus === 'success' ? '1px solid #22c55e' : saveStatus === 'error' ? '1px solid #ef4444' : '1px solid #3b82f6',
                      borderRadius: '7px',
                      cursor: savingFlow || !data || data.length === 0 ? 'not-allowed' : 'pointer',
                      transition: 'all 0.15s ease',
                      color: saveStatus === 'success' ? '#22c55e' : saveStatus === 'error' ? '#ef4444' : '#3b82f6',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.6), 0 2px 6px rgba(0,0,0,0.5)',
                    }}
                    onMouseEnter={(e) => {
                      if (!savingFlow && data && data.length > 0) {
                        e.currentTarget.style.borderColor = 'rgba(59,130,246,1)'
                        e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(0,0,0,0.6), 0 0 14px rgba(59,130,246,0.35)'
                        e.currentTarget.style.background = 'linear-gradient(180deg, rgba(59,130,246,0.28) 0%, rgba(59,130,246,0.08) 55%, rgba(0,0,0,0.15) 100%)'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (saveStatus !== 'success' && saveStatus !== 'error') {
                        e.currentTarget.style.borderColor = '#3b82f6'
                        e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.6), 0 2px 6px rgba(0,0,0,0.5)'
                        e.currentTarget.style.background = 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 55%, rgba(0,0,0,0.3) 100%)'
                      }
                    }}
                  >
                    <span className="tb-icon" style={{ display: 'flex', alignItems: 'center' }}>
                      {savingFlow ? (
                        <svg className="animate-spin" width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                      ) : saveStatus === 'success' ? (
                        <svg width="17" height="17" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 13l4 4L19 7" />
                        </svg>
                      ) : saveStatus === 'error' ? (
                        <svg width="17" height="17" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      ) : (
                        <svg width="17" height="17" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                        </svg>
                      )}
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
                    title="Download as image"
                    className="toolbar-btn-img hidden md:flex items-center justify-center transition-all duration-150 focus:outline-none"
                    style={{
                      width: '42px',
                      height: '42px',
                      background: 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 55%, rgba(0,0,0,0.3) 100%)',
                      border: '1px solid #22c55e',
                      borderRadius: '7px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      color: '#22c55e',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.6), 0 2px 6px rgba(0,0,0,0.5)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(34,197,94,1)'
                      e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(0,0,0,0.6), 0 0 14px rgba(34,197,94,0.35)'
                      e.currentTarget.style.background = 'linear-gradient(180deg, rgba(34,197,94,0.28) 0%, rgba(34,197,94,0.08) 55%, rgba(0,0,0,0.15) 100%)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#22c55e'
                      e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.6), 0 2px 6px rgba(0,0,0,0.5)'
                      e.currentTarget.style.background = 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 55%, rgba(0,0,0,0.3) 100%)'
                    }}
                  >
                    <span className="tb-icon" style={{ display: 'flex', alignItems: 'center' }}>
                      <svg width="17" height="17" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </span>
                  </button>

                  <button
                    onClick={loadFlowHistory}
                    disabled={loadingHistory}
                    title={loadingHistory ? 'Loading...' : 'Flow History'}
                    className={`toolbar-btn-history hidden md:flex items-center justify-center transition-all duration-150 focus:outline-none ${loadingHistory ? 'cursor-not-allowed opacity-40' : ''}`}
                    style={{
                      width: '42px',
                      height: '42px',
                      background: 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 55%, rgba(0,0,0,0.3) 100%)',
                      border: '1px solid #8b5cf6',
                      borderRadius: '7px',
                      cursor: loadingHistory ? 'not-allowed' : 'pointer',
                      transition: 'all 0.15s ease',
                      color: '#8b5cf6',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.6), 0 2px 6px rgba(0,0,0,0.5)',
                    }}
                    onMouseEnter={(e) => {
                      if (!loadingHistory) {
                        e.currentTarget.style.borderColor = 'rgba(139,92,246,1)'
                        e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(0,0,0,0.6), 0 0 14px rgba(139,92,246,0.35)'
                        e.currentTarget.style.background = 'linear-gradient(180deg, rgba(139,92,246,0.28) 0%, rgba(139,92,246,0.08) 55%, rgba(0,0,0,0.15) 100%)'
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#8b5cf6'
                      e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.6), 0 2px 6px rgba(0,0,0,0.5)'
                      e.currentTarget.style.background = 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 55%, rgba(0,0,0,0.3) 100%)'
                    }}
                  >
                    <span className="tb-icon" style={{ display: 'flex', alignItems: 'center' }}>
                      {loadingHistory ? (
                        <svg className="animate-spin" width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                      ) : (
                        <svg width="17" height="17" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      )}
                    </span>
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

                {/* Divider */}
                <div className="hidden md:block" style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.14)' }}></div>

                {/* Right Section - Desktop Only */}

                <div
                  className="hidden md:flex stats-section items-center gap-2"
                  style={{ flexShrink: 0 }}
                >
                  {/* Filter Button */}

                  <button
                    onClick={() => {
                      setIsFilterDialogOpen(true)
                    }}
                    className="flex items-center gap-2 font-bold uppercase transition-all duration-150 focus:outline-none"
                    style={{
                      height: '35px',
                      padding: '0 15px',
                      background: 'linear-gradient(180deg, rgba(255,133,0,0.22) 0%, rgba(255,133,0,0.07) 55%, rgba(0,0,0,0.2) 100%)',
                      border: '1px solid rgba(255,133,0,0.72)',
                      borderRadius: '7px',
                      fontSize: '12px',
                      letterSpacing: '1.5px',
                      fontWeight: '700',
                      cursor: 'pointer',
                      color: '#ff8500',
                      transition: 'all 0.15s ease',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -1px 0 rgba(0,0,0,0.5), 0 2px 4px rgba(0,0,0,0.4)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'linear-gradient(180deg, rgba(255,133,0,0.35) 0%, rgba(255,133,0,0.12) 55%, rgba(0,0,0,0.1) 100%)'
                      e.currentTarget.style.borderColor = 'rgba(255,133,0,1)'
                      e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -1px 0 rgba(0,0,0,0.6), 0 0 16px rgba(255,133,0,0.35)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'linear-gradient(180deg, rgba(255,133,0,0.22) 0%, rgba(255,133,0,0.07) 55%, rgba(0,0,0,0.2) 100%)'
                      e.currentTarget.style.borderColor = 'rgba(255,133,0,0.72)'
                      e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -1px 0 rgba(0,0,0,0.5), 0 2px 4px rgba(0,0,0,0.4)'
                    }}
                  >
                    <svg
                      width="12" height="12"
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

                  <div className="control-bar-divider hidden md:block" style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.14)' }}></div>

                  {/* Stats Section */}

                  <div className="flex items-center gap-3">
                    {/* Date Display */}

                    {marketInfo && (
                      <div style={{ fontSize: '11px', color: '#8a8a8a', fontFamily: 'monospace', letterSpacing: '0.05em' }}>
                        {marketInfo.data_date}
                      </div>
                    )}

                    {/* Trade Count */}

                    <div style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ color: '#ff8500', fontWeight: '700', fontFamily: 'monospace' }}>
                        {filteredAndSortedData.length.toLocaleString()}
                      </span>
                      <span style={{ color: '#777', fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase' }}>trades</span>
                    </div>

                    {/* Pagination Info */}

                    <div style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '3px', color: '#8a8a8a', fontFamily: 'monospace' }}>
                      <span>{currentPage}</span>
                      <span style={{ color: '#555', fontSize: '10px' }}>/</span>
                      <span>{totalPages}</span>
                    </div>

                    {/* Pagination Controls */}

                    {filteredAndSortedData.length > itemsPerPage && (
                      <div className="pagination flex items-center gap-0.5">
                        <button
                          onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                          disabled={currentPage === 1}
                          className="flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150"
                          style={{ width: '24px', height: '24px', background: 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)', border: '1px solid rgba(255,255,255,0.16)', borderRadius: '4px', color: '#aaa', fontSize: '13px', cursor: currentPage === 1 ? 'not-allowed' : 'pointer', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07), inset 0 -1px 0 rgba(0,0,0,0.3)' }}
                        >
                          ‹
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
                              className="flex items-center justify-center transition-all duration-150"
                              style={{
                                width: '24px',
                                height: '24px',
                                background: currentPage === pageNum ? 'rgba(255,133,0,0.9)' : 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)',
                                border: currentPage === pageNum ? '1px solid rgba(255,133,0,0.9)' : '1px solid rgba(255,255,255,0.16)',
                                borderRadius: '4px',
                                color: currentPage === pageNum ? '#000' : '#aaa',
                                fontSize: '10px',
                                fontWeight: currentPage === pageNum ? '700' : '500',
                                fontFamily: 'monospace',
                                cursor: 'pointer',
                                boxShadow: currentPage === pageNum ? 'inset 0 1px 0 rgba(255,255,255,0.25), 0 0 8px rgba(255,133,0,0.2)' : 'inset 0 1px 0 rgba(255,255,255,0.07), inset 0 -1px 0 rgba(0,0,0,0.3)',
                              }}
                            >
                              {pageNum}
                            </button>
                          )
                        })}

                        <button
                          onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                          disabled={currentPage === totalPages}
                          className="flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150"
                          style={{ width: '24px', height: '24px', background: 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)', border: '1px solid rgba(255,255,255,0.16)', borderRadius: '4px', color: '#aaa', fontSize: '13px', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07), inset 0 -1px 0 rgba(0,0,0,0.3)' }}
                        >
                          ›
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

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

        <div className="bg-black border border-gray-800 flex-1 options-flow-table-container" style={{ position: 'relative' }}>

          {/* Fullscreen scan loading overlay — shown while streaming with no data yet */}
          {loading && data.length === 0 && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 49,
              background: 'linear-gradient(160deg, #010c1c 0%, #020a16 35%, #020d1a 65%, #010b14 100%)',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: '48px',
              overflow: 'hidden',
            }}>
              <style>{`
                @keyframes scanTitlePulse {
                  0%, 100% { opacity: 1; }
                  50% { opacity: 0.80; }
                }
                @keyframes scanWave1 {
                  0%, 100% { transform: translateX(0px) translateY(0px); }
                  50% { transform: translateX(-40px) translateY(-14px); }
                }
                @keyframes scanWave2 {
                  0%, 100% { transform: translateX(0px) translateY(0px); }
                  50% { transform: translateX(30px) translateY(10px); }
                }
                @keyframes scanWave3 {
                  0%, 100% { transform: translateX(0px) translateY(0px); }
                  50% { transform: translateX(-18px) translateY(7px); }
                }
                @keyframes scanAurora1 {
                  0%, 100% { transform: translateX(-5%) scaleY(1) skewX(0deg); opacity: 0.7; }
                  50% { transform: translateX(5%) scaleY(1.18) skewX(2.5deg); opacity: 1; }
                }
                @keyframes scanAurora2 {
                  0%, 100% { transform: translateX(4%) scaleY(1) skewX(0deg); opacity: 0.55; }
                  50% { transform: translateX(-4%) scaleY(1.13) skewX(-2deg); opacity: 0.9; }
                }
                @keyframes scanShardA {
                  0%, 100% { opacity: 0.07; }
                  50% { opacity: 0.21; }
                }
                @keyframes scanShardB {
                  0%, 100% { opacity: 0.05; }
                  50% { opacity: 0.17; }
                }
                @keyframes scanFracture {
                  0%, 100% { opacity: 0.10; }
                  50% { opacity: 0.22; }
                }
                @keyframes scanCenterBreath {
                  0%, 100% { opacity: 0.35; transform: translate(-50%, -50%) scale(1); }
                  50% { opacity: 0.65; transform: translate(-50%, -50%) scale(1.14); }
                }
                @keyframes scanParticle {
                  0% { transform: translateY(0px) translateX(0px); opacity: 0; }
                  15% { opacity: 0.7; }
                  85% { opacity: 0.3; }
                  100% { transform: translateY(-90px) translateX(14px); opacity: 0; }
                }
                @keyframes artFadeIn {
                  0% { opacity: 0; }
                  100% { opacity: 1; }
                }
              `}</style>

              {/* === ABSTRACT DYNAMIC BACKGROUND === */}
              <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 0 }}>

                {/* Deep noise texture base */}
                <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 120% 80% at 55% 60%, rgba(0,40,90,0.45) 0%, transparent 60%), radial-gradient(ellipse 80% 60% at 20% 30%, rgba(0,20,60,0.3) 0%, transparent 55%)' }} />

                {/* Aurora band 1 — wide cyan sweep across top */}
                <div style={{
                  position: 'absolute', top: '-12%', left: '-10%', width: '120%', height: '50%',
                  background: 'linear-gradient(180deg, transparent 0%, rgba(0,140,255,0.04) 30%, rgba(0,90,200,0.065) 60%, transparent 100%)',
                  animation: 'scanAurora1 9s ease-in-out infinite',
                  transformOrigin: '50% 50%',
                }} />
                {/* Aurora band 2 — mid teal */}
                <div style={{
                  position: 'absolute', top: '32%', left: '-10%', width: '120%', height: '38%',
                  background: 'linear-gradient(180deg, transparent 0%, rgba(0,200,170,0.028) 40%, rgba(0,130,120,0.048) 70%, transparent 100%)',
                  animation: 'scanAurora2 12s ease-in-out infinite',
                  transformOrigin: '50% 50%',
                }} />
                {/* Aurora band 3 — deep violet bottom */}
                <div style={{
                  position: 'absolute', bottom: '-8%', left: '-10%', width: '120%', height: '32%',
                  background: 'linear-gradient(0deg, transparent 0%, rgba(50,30,130,0.04) 50%, transparent 100%)',
                  animation: 'scanAurora1 15s ease-in-out infinite 4s',
                  transformOrigin: '50% 50%',
                }} />

                {/* Wave layer 1 — deep slow */}
                <div style={{ position: 'absolute', bottom: 0, left: '-5%', width: '110%', height: '200px', animation: 'scanWave1 14s ease-in-out infinite' }}>
                  <svg viewBox="0 0 1440 200" preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }}>
                    <path d="M0,100 C180,165 360,35 540,100 C720,165 900,35 1080,100 C1260,165 1380,75 1440,100 L1440,200 L0,200 Z" fill="rgba(0,100,185,0.05)" />
                  </svg>
                </div>
                {/* Wave layer 2 */}
                <div style={{ position: 'absolute', bottom: 0, left: '-5%', width: '110%', height: '155px', animation: 'scanWave2 10s ease-in-out infinite' }}>
                  <svg viewBox="0 0 1440 155" preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }}>
                    <path d="M0,78 C240,128 480,28 720,78 C960,128 1200,28 1440,78 L1440,155 L0,155 Z" fill="rgba(0,155,225,0.038)" />
                  </svg>
                </div>
                {/* Wave layer 3 — surface sheen */}
                <div style={{ position: 'absolute', bottom: 0, left: '-5%', width: '110%', height: '110px', animation: 'scanWave3 7.5s ease-in-out infinite' }}>
                  <svg viewBox="0 0 1440 110" preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }}>
                    <path d="M0,55 C360,95 720,15 1080,55 C1260,75 1380,40 1440,55 L1440,110 L0,110 Z" fill="rgba(0,210,255,0.028)" />
                  </svg>
                </div>

                {/* Glass shards — clipped polygons with crystalline borders */}
                <div style={{ position: 'absolute', top: '4%', left: '2%', width: '185px', height: '155px', clipPath: 'polygon(18% 0%, 92% 7%, 100% 58%, 58% 100%, 0% 73%)', background: 'linear-gradient(135deg, rgba(80,185,255,0.07) 0%, rgba(0,55,120,0) 100%)', border: '1px solid rgba(120,215,255,0.13)', animation: 'scanShardA 5.2s ease-in-out infinite' }} />
                <div style={{ position: 'absolute', top: '12%', right: '4%', width: '165px', height: '205px', clipPath: 'polygon(48% 0%, 100% 22%, 88% 92%, 14% 100%, 0% 52%)', background: 'linear-gradient(148deg, rgba(0,225,200,0.065) 0%, rgba(0,75,100,0) 100%)', border: '1px solid rgba(75,225,200,0.11)', animation: 'scanShardB 6.5s ease-in-out infinite 1.2s' }} />
                <div style={{ position: 'absolute', bottom: '18%', left: '6%', width: '145px', height: '185px', clipPath: 'polygon(8% 4%, 82% 0%, 100% 68%, 62% 100%, 4% 83%)', background: 'linear-gradient(122deg, rgba(40,165,255,0.065) 0%, rgba(0,45,140,0) 100%)', border: '1px solid rgba(100,195,255,0.11)', animation: 'scanShardA 7.2s ease-in-out infinite 2.3s' }} />
                <div style={{ position: 'absolute', bottom: '8%', right: '6%', width: '205px', height: '165px', clipPath: 'polygon(0% 14%, 72% 0%, 100% 48%, 82% 100%, 8% 92%)', background: 'linear-gradient(158deg, rgba(0,205,255,0.055) 0%, rgba(0,55,120,0) 100%)', border: '1px solid rgba(75,205,255,0.10)', animation: 'scanShardB 8.5s ease-in-out infinite 0.6s' }} />
                <div style={{ position: 'absolute', top: '38%', left: '-3%', width: '125px', height: '225px', clipPath: 'polygon(14% 0%, 100% 8%, 92% 72%, 38% 100%, 0% 58%)', background: 'linear-gradient(90deg, rgba(55,165,245,0.055) 0%, transparent 100%)', border: '1px solid rgba(100,185,255,0.09)', animation: 'scanShardA 9.3s ease-in-out infinite 3.5s' }} />
                <div style={{ position: 'absolute', top: '8%', left: '38%', width: '105px', height: '145px', clipPath: 'polygon(28% 0%, 100% 18%, 82% 100%, 0% 82%)', background: 'linear-gradient(198deg, rgba(0,245,215,0.045) 0%, transparent 100%)', border: '1px solid rgba(0,225,200,0.09)', animation: 'scanShardB 6.8s ease-in-out infinite 1.8s' }} />
                <div style={{ position: 'absolute', top: '55%', right: '2%', width: '135px', height: '175px', clipPath: 'polygon(5% 10%, 78% 0%, 100% 62%, 55% 100%, 0% 78%)', background: 'linear-gradient(115deg, rgba(60,140,255,0.055) 0%, transparent 100%)', border: '1px solid rgba(90,175,255,0.09)', animation: 'scanShardA 7.8s ease-in-out infinite 0.9s' }} />

                {/* SVG glass fracture crack lines radiating from lower-center focal point */}
                <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', animation: 'scanFracture 4.5s ease-in-out infinite', pointerEvents: 'none' }} xmlns="http://www.w3.org/2000/svg">
                  <line x1="42%" y1="75%" x2="58%" y2="28%" stroke="rgba(145,215,255,0.55)" strokeWidth="0.75" />
                  <line x1="58%" y1="28%" x2="82%" y2="12%" stroke="rgba(145,215,255,0.45)" strokeWidth="0.65" />
                  <line x1="82%" y1="12%" x2="97%" y2="4%" stroke="rgba(145,215,255,0.28)" strokeWidth="0.5" />
                  <line x1="58%" y1="28%" x2="74%" y2="52%" stroke="rgba(145,215,255,0.42)" strokeWidth="0.65" />
                  <line x1="74%" y1="52%" x2="90%" y2="68%" stroke="rgba(145,215,255,0.28)" strokeWidth="0.5" />
                  <line x1="90%" y1="68%" x2="99%" y2="88%" stroke="rgba(145,215,255,0.18)" strokeWidth="0.4" />
                  <line x1="58%" y1="28%" x2="40%" y2="10%" stroke="rgba(145,215,255,0.42)" strokeWidth="0.65" />
                  <line x1="40%" y1="10%" x2="18%" y2="2%" stroke="rgba(145,215,255,0.28)" strokeWidth="0.5" />
                  <line x1="42%" y1="75%" x2="18%" y2="52%" stroke="rgba(145,215,255,0.42)" strokeWidth="0.65" />
                  <line x1="18%" y1="52%" x2="2%" y2="32%" stroke="rgba(145,215,255,0.25)" strokeWidth="0.5" />
                  <line x1="42%" y1="75%" x2="22%" y2="92%" stroke="rgba(145,215,255,0.32)" strokeWidth="0.5" />
                  <line x1="42%" y1="75%" x2="62%" y2="90%" stroke="rgba(145,215,255,0.32)" strokeWidth="0.5" />
                  <line x1="62%" y1="90%" x2="76%" y2="98%" stroke="rgba(145,215,255,0.18)" strokeWidth="0.4" />
                  {/* Secondary focal upper-right */}
                  <line x1="76%" y1="22%" x2="62%" y2="46%" stroke="rgba(75,225,200,0.32)" strokeWidth="0.5" />
                  <line x1="76%" y1="22%" x2="91%" y2="35%" stroke="rgba(75,225,200,0.25)" strokeWidth="0.45" />
                  <line x1="76%" y1="22%" x2="68%" y2="8%" stroke="rgba(75,225,200,0.30)" strokeWidth="0.5" />
                  {/* Tertiary left */}
                  <line x1="22%" y1="38%" x2="35%" y2="58%" stroke="rgba(100,180,255,0.22)" strokeWidth="0.45" />
                  <line x1="22%" y1="38%" x2="8%" y2="50%" stroke="rgba(100,180,255,0.20)" strokeWidth="0.4" />
                  <line x1="22%" y1="38%" x2="28%" y2="18%" stroke="rgba(100,180,255,0.22)" strokeWidth="0.45" />
                </svg>

                {/* Central breathing glow */}
                <div style={{
                  position: 'absolute', top: '50%', left: '50%',
                  width: '750px', height: '750px',
                  background: 'radial-gradient(circle, rgba(0,110,255,0.042) 0%, rgba(0,55,175,0.022) 38%, transparent 65%)',
                  animation: 'scanCenterBreath 6.5s ease-in-out infinite',
                  borderRadius: '50%',
                }} />

                {/* Floating light particles */}
                {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                  <div key={i} style={{
                    position: 'absolute',
                    left: `${10 + i * 11}%`,
                    bottom: `${14 + (i % 4) * 14}%`,
                    width: '3px', height: '3px',
                    borderRadius: '50%',
                    background: i % 3 === 0 ? 'rgba(0,200,255,0.65)' : i % 3 === 1 ? 'rgba(0,225,185,0.55)' : 'rgba(110,185,255,0.60)',
                    boxShadow: i % 3 === 0 ? '0 0 7px rgba(0,200,255,0.45)' : i % 3 === 1 ? '0 0 7px rgba(0,225,185,0.38)' : '0 0 7px rgba(110,185,255,0.42)',
                    animation: 'scanParticle ' + (6 + i * 1.2) + 's ease-in-out infinite',
                    animationDelay: (i * 0.75) + 's',
                  }} />
                ))}
              </div>

              {/* === LOADING ART PANEL — rendered after abstract bg so same zIndex wins (later in DOM = on top) === */}
              <div key={loadingArtIndex} style={{ position: 'absolute', inset: 0, zIndex: 0, opacity: 0.72, animation: 'artFadeIn 1.4s ease-in-out', pointerEvents: 'none' }}>
                {LoadingScenePanel()}
              </div>

              {/* Content */}
              <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '44px' }}>
                {/* Title */}
                <div style={{ textAlign: 'center' }}>
                  <div style={{
                    fontSize: '72px', fontWeight: 900, color: '#ffffff', letterSpacing: '8px', lineHeight: 1,
                    animation: 'scanTitlePulse 2.8s ease-in-out infinite',
                    textShadow: '0 0 60px rgba(255,255,255,0.12), 0 1px 0 #ccc, 0 2px 0 #999, 0 6px 20px rgba(0,0,0,0.8)',
                    WebkitTextStroke: '0.5px rgba(255,255,255,0.15)',
                  }}>{selectedTicker ? selectedTicker.toUpperCase() : 'OPTIONS'}</div>
                  <div style={{
                    fontSize: '26px', fontWeight: 800, color: 'rgba(255,255,255,0.55)', letterSpacing: '14px', marginTop: '8px',
                    textShadow: '0 0 20px rgba(255,255,255,0.08)',
                  }}>FLOW SCAN</div>
                </div>

                {/* Dual-ring spinner */}
                <div style={{ position: 'relative', width: '110px', height: '110px' }}>
                  <div style={{
                    position: 'absolute', inset: 0, borderRadius: '50%',
                    border: '5px solid rgba(255,255,255,0.06)',
                    borderTopColor: '#ffffff',
                    animation: 'spin 0.9s linear infinite',
                  }} />
                  <div style={{
                    position: 'absolute', inset: '14px', borderRadius: '50%',
                    border: '4px solid rgba(255,255,255,0.04)',
                    borderTopColor: 'rgba(255,255,255,0.5)',
                    animation: 'spin 1.5s linear infinite reverse',
                    boxShadow: '0 0 8px rgba(255,255,255,0.15)',
                  }} />
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ffffff', boxShadow: '0 0 12px rgba(255,255,255,0.9)' }} />
                  </div>
                </div>

                {/* Status text — solid white, Worker prefix stripped */}
                <div style={{ fontSize: '16px', fontWeight: 600, color: '#ffffff', letterSpacing: '0.5px', textAlign: 'center', maxWidth: '600px', textShadow: '0 0 20px rgba(255,255,255,0.3)' }}>
                  {streamingStatus
                    ? streamingStatus.replace(/^Worker\s+\d+:\s*/i, '')
                    : 'Scanning options flow...'}
                </div>

                {/* Quote card */}
                <div style={{
                  maxWidth: '680px', textAlign: 'center',
                  padding: '30px 40px',
                  borderRadius: '14px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'linear-gradient(160deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 55%, rgba(0,0,0,0.3) 100%)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07), inset 0 -1px 0 rgba(0,0,0,0.5), 0 16px 50px rgba(0,0,0,0.6)',
                  position: 'relative', overflow: 'hidden',
                }}>
                  <div style={{ position: 'absolute', top: 0, left: '10%', right: '10%', height: '1px', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.14), transparent)' }} />
                  <div style={{ fontSize: '19px', fontStyle: 'italic', color: '#f1f5f9', lineHeight: 1.7, fontWeight: 400 }}>
                    &ldquo;{EFI_LOADING_QUOTES[loadingQuoteIndex % EFI_LOADING_QUOTES.length].text}&rdquo;
                  </div>
                  <div style={{ fontSize: '15px', color: 'rgba(255,255,255,0.5)', fontWeight: 600, marginTop: '16px', letterSpacing: '0.5px' }}>
                    — {EFI_LOADING_QUOTES[loadingQuoteIndex % EFI_LOADING_QUOTES.length].author}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Fullscreen loading overlay — only when user actively triggered LEAP/EFI (not auto-refresh on mount) */}
          {(modeLoadingStep !== null || (gradingProgress !== null && (efiHighlightsActive || leapActive))) && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 50,
              background: 'radial-gradient(ellipse at 50% 40%, rgba(20,10,0,0.98) 0%, rgba(0,0,0,0.99) 70%)',
              backdropFilter: 'blur(8px)',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: '52px',
              overflow: 'hidden',
            }}>
              <style>{`
                @keyframes efiBlobPulse {
                  0%, 100% { opacity: 0.45; transform: scale(1); }
                  50% { opacity: 0.9; transform: scale(1.2); }
                }
                @keyframes efiFloatUp {
                  0%, 100% { transform: translateY(0px); opacity: 0.14; }
                  50% { transform: translateY(-20px); opacity: 0.26; }
                }
                @keyframes efiFloatDown {
                  0%, 100% { transform: translateY(0px); opacity: 0.11; }
                  50% { transform: translateY(16px); opacity: 0.21; }
                }
                @keyframes efiTitlePulse {
                  0%, 100% { opacity: 1; }
                  50% { opacity: 0.78; }
                }
                @keyframes efiShine {
                  0% { transform: translateX(-100%) skewX(-20deg); }
                  100% { transform: translateX(400%) skewX(-20deg); }
                }
                @keyframes efiSpinnerGlow {
                  0%, 100% { box-shadow: 0 0 14px rgba(255,149,0,0.5); }
                  50% { box-shadow: 0 0 28px rgba(255,149,0,0.85); }
                }
              `}</style>

              {/* Abstract terminal background */}
              <div style={{
                position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 0,
                backgroundImage: `
                  linear-gradient(rgba(255,149,0,0.028) 1px, transparent 1px),
                  linear-gradient(90deg, rgba(255,149,0,0.028) 1px, transparent 1px)
                `,
                backgroundSize: '44px 44px',
              }}>
                {/* Radial glow blobs */}
                <div style={{ position: 'absolute', top: '-140px', left: '-100px', width: '460px', height: '460px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,149,0,0.09) 0%, transparent 70%)', animation: 'efiBlobPulse 4.5s ease-in-out infinite' }} />
                <div style={{ position: 'absolute', bottom: '-140px', right: '-100px', width: '460px', height: '460px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,102,0,0.09) 0%, transparent 70%)', animation: 'efiBlobPulse 4.5s ease-in-out infinite 2.2s' }} />
                {/* Floating data stream labels */}
                {['0xA4F1 ? SWEEP +23.4%', '0xB2E3 ? BLOCK 847K', '0xC1D5 ? OI RATIO 2.14', '0xD3F7 ? IV RANK 0.77', '0xE5A9 ? DELTA 0.38', '0xF6B2 ? GAMMA 0.021'].map((txt, i) => (
                  <div key={i} style={{
                    position: 'absolute',
                    left: `${6 + i * 15}%`,
                    top: `${10 + (i % 3) * 28}%`,
                    fontSize: '11px', color: 'rgba(255,149,0,0.16)', fontFamily: 'monospace', fontWeight: 500,
                    animation: `${i % 2 === 0 ? 'efiFloatUp' : 'efiFloatDown'} ${5 + i * 1.2}s ease-in-out infinite`,
                    whiteSpace: 'nowrap',
                  }}>{txt}</div>
                ))}
              </div>

              {/* Content layer */}
              <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '52px' }}>

                {/* 3D Glossy Title */}
                <div style={{ textAlign: 'center' }}>
                  <div style={{
                    fontSize: '84px', fontWeight: 900, color: '#ffb347', letterSpacing: '6px', lineHeight: 1,
                    animation: 'efiTitlePulse 2.5s ease-in-out infinite',
                    textShadow: '0 1px 0 #e08000, 0 2px 0 #cc7000, 0 3px 0 #b86000, 0 4px 0 #a45000, 0 5px 0 #904000, 0 6px 12px rgba(0,0,0,0.7), 0 10px 30px rgba(255,149,0,0.25)',
                    WebkitTextStroke: '0.5px rgba(255,200,80,0.3)',
                  }}>FLOW</div>
                  <div style={{
                    fontSize: '31px', fontWeight: 800, color: '#ffffff', letterSpacing: '11px', marginTop: '10px',
                    textShadow: '0 1px 0 #888, 0 2px 4px rgba(0,0,0,0.8), 0 0 20px rgba(255,255,255,0.08)',
                  }}>HIGHLIGHTS</div>
                </div>

                {/* Glossy dual-ring spinner */}
                <div style={{ position: 'relative', width: '136px', height: '136px' }}>
                  <div style={{
                    position: 'absolute', inset: 0, borderRadius: '50%',
                    border: '6px solid rgba(255,149,0,0.08)',
                    borderTopColor: '#ff9500',
                    animation: 'spin 0.85s linear infinite, efiSpinnerGlow 1.7s ease-in-out infinite',
                  }} />
                  <div style={{
                    position: 'absolute', inset: '17px', borderRadius: '50%',
                    border: '5px solid rgba(255,102,0,0.08)',
                    borderTopColor: '#ff6600',
                    animation: 'spin 1.3s linear infinite reverse',
                    boxShadow: '0 0 10px rgba(255,102,0,0.4)',
                  }} />
                  {/* Centre dot */}
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'radial-gradient(circle, #ffb347 0%, #ff6600 100%)', boxShadow: '0 0 12px rgba(255,149,0,0.9)' }} />
                  </div>
                </div>

                {/* Step label */}
                <div style={{
                  fontSize: '22px', fontWeight: 700, color: '#ff9500', letterSpacing: '2px', textTransform: 'uppercase',
                  textShadow: '0 0 20px rgba(255,149,0,0.5)',
                }}>
                  {modeLoadingStep?.step ?? 'Grading Flows...'}
                </div>

                {/* Progress bar */}
                {gradingProgress && (
                  <div style={{ width: '552px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                      <span style={{ fontSize: '19px', color: '#ffffff', fontWeight: 700, textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>Analyzing trades</span>
                      <span style={{ fontSize: '22px', fontWeight: 900, color: '#ffffff', textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
                        {Math.round((gradingProgress.current / gradingProgress.total) * 100)}%
                      </span>
                    </div>
                    {/* 3D glossy bar track */}
                    <div style={{
                      height: '9px', borderRadius: '5px', overflow: 'hidden',
                      background: 'linear-gradient(180deg, #0d0d0d 0%, #1a1a1a 100%)',
                      border: '1px solid rgba(255,149,0,0.15)',
                      boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.8), inset 0 -1px 2px rgba(255,149,0,0.05)',
                      position: 'relative',
                    }}>
                      <div style={{
                        height: '100%',
                        background: 'linear-gradient(180deg, #ffb347 0%, #ff9500 50%, #e07500 100%)',
                        borderRadius: '5px',
                        transition: 'width 0.4s ease',
                        width: `${(gradingProgress.current / gradingProgress.total) * 100}%`,
                        position: 'relative',
                        boxShadow: '0 0 10px rgba(255,149,0,0.6)',
                      }}>
                        {/* Glossy shine on fill */}
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '50%', background: 'linear-gradient(180deg, rgba(255,255,255,0.22) 0%, transparent 100%)', borderRadius: '5px 5px 0 0' }} />
                        {/* Moving shine sweep */}
                        <div style={{ position: 'absolute', top: 0, bottom: 0, width: '40px', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent)', animation: 'efiShine 2s linear infinite' }} />
                      </div>
                    </div>
                    <div style={{ textAlign: 'center', marginTop: '12px', fontSize: '18px', fontWeight: 700, color: '#ffffff', textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
                      {gradingProgress.current.toLocaleString()} / {gradingProgress.total.toLocaleString()} trades
                    </div>
                  </div>
                )}

                {/* Rotating quote — glossy glass card */}
                <div style={{
                  maxWidth: '810px', textAlign: 'center',
                  padding: '38px 46px',
                  borderRadius: '16px',
                  border: '1px solid rgba(255,149,0,0.22)',
                  background: 'linear-gradient(160deg, rgba(255,149,0,0.10) 0%, rgba(255,80,0,0.04) 55%, rgba(0,0,0,0.35) 100%)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07), inset 0 -1px 0 rgba(0,0,0,0.4), 0 16px 50px rgba(0,0,0,0.6), 0 4px 20px rgba(255,149,0,0.1)',
                  position: 'relative', overflow: 'hidden',
                }}>
                  {/* Glass top-edge highlight */}
                  <div style={{ position: 'absolute', top: 0, left: '10%', right: '10%', height: '1px', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent)' }} />
                  <div style={{ fontSize: '24px', fontStyle: 'italic', color: '#f3f4f6', lineHeight: 1.65, fontWeight: 400, textShadow: '0 1px 6px rgba(0,0,0,0.5)' }}>
                    &ldquo;{EFI_LOADING_QUOTES[loadingQuoteIndex % EFI_LOADING_QUOTES.length].text}&rdquo;
                  </div>
                  <div style={{ fontSize: '19px', color: '#ff9500', fontWeight: 700, marginTop: '22px', letterSpacing: '0.5px', textShadow: '0 0 12px rgba(255,149,0,0.4)' }}>
                    — {EFI_LOADING_QUOTES[loadingQuoteIndex % EFI_LOADING_QUOTES.length].author}
                  </div>
                </div>
              </div>
            </div>
          )}
          <div className="p-0">
            <div
              className="table-scroll-container custom-scrollbar overflow-y-auto overflow-x-auto"
              style={{
                height: 'calc(100vh - 160px)',
                paddingBottom: '100px',
                scrollBehavior: 'smooth',
              }}
            >
              <table className="w-full options-flow-table" style={{ marginBottom: '80px' }}>
                <thead className="col-thead sticky top-0 z-[1]">
                  <tr>
                    {/* TIME */}
                    <th
                      className={`col-hdr col-sortable text-left${sortField === 'trade_timestamp' ? ' col-active' : ''}`}
                      onClick={() => handleSort('trade_timestamp')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <svg className="hidden md:block" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
                        <span className="hidden md:inline">TIME</span>
                        <span className="md:hidden" style={{ fontSize: 10, letterSpacing: '1px' }}>SYM</span>
                      </div>
                    </th>

                    {/* SYMBOL */}
                    <th
                      className={`col-hdr col-sortable hidden md:table-cell text-left${sortField === 'underlying_ticker' ? ' col-active' : ''}`}
                      onClick={() => handleSort('underlying_ticker')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" /></svg>
                        SYMBOL
                        <span style={{ display: 'inline-flex', alignItems: 'center', marginLeft: 1 }}>
                          {sortField === 'underlying_ticker' && (
                            <svg width="7" height="8" viewBox="0 0 7 8" fill="currentColor" aria-hidden="true">{sortDirection === 'asc' ? <path d="M3.5 1L7 7H0Z" /> : <path d="M3.5 7L0 1H7Z" />}</svg>
                          )}
                        </span>
                      </div>
                    </th>

                    {/* CALL/PUT */}
                    <th
                      className={`col-hdr col-sortable text-left${sortField === 'type' ? ' col-active' : ''}`}
                      onClick={() => handleSort('type')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <svg className="hidden md:block" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>
                        <span className="hidden md:inline">{notableFilterActive ? 'C/P' : 'CALL / PUT'}</span>
                        <span className="md:hidden" style={{ fontSize: 10 }}>C/P</span>
                        <span className="hidden md:inline-flex" style={{ alignItems: 'center', marginLeft: 1 }}>
                          {sortField === 'type' && (
                            <svg width="7" height="8" viewBox="0 0 7 8" fill="currentColor" aria-hidden="true">{sortDirection === 'asc' ? <path d="M3.5 1L7 7H0Z" /> : <path d="M3.5 7L0 1H7Z" />}</svg>
                          )}
                        </span>
                      </div>
                    </th>

                    {/* STRIKE */}
                    <th
                      className={`col-hdr col-sortable hidden md:table-cell text-left${sortField === 'strike' ? ' col-active' : ''}`}
                      onClick={() => handleSort('strike')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" /><line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" /><line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" /></svg>
                        STRIKE
                        <span style={{ display: 'inline-flex', alignItems: 'center', marginLeft: 1 }}>
                          {sortField === 'strike' && (
                            <svg width="7" height="8" viewBox="0 0 7 8" fill="currentColor" aria-hidden="true">{sortDirection === 'asc' ? <path d="M3.5 1L7 7H0Z" /> : <path d="M3.5 7L0 1H7Z" />}</svg>
                          )}
                        </span>
                      </div>
                    </th>

                    {/* SIZE */}
                    <th
                      className={`col-hdr col-sortable text-left${sortField === 'trade_size' ? ' col-active' : ''}`}
                      onClick={() => handleSort('trade_size')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <svg className="hidden md:block" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="3" width="20" height="4" rx="1" /><rect x="2" y="10" width="20" height="4" rx="1" /><rect x="2" y="17" width="20" height="4" rx="1" /></svg>
                        SIZE
                        <span style={{ display: 'inline-flex', alignItems: 'center', marginLeft: 1 }}>
                          {sortField === 'trade_size' && (
                            <svg width="7" height="8" viewBox="0 0 7 8" fill="currentColor" aria-hidden="true">{sortDirection === 'asc' ? <path d="M3.5 1L7 7H0Z" /> : <path d="M3.5 7L0 1H7Z" />}</svg>
                          )}
                        </span>
                      </div>
                    </th>

                    {/* PREMIUM */}
                    <th
                      className={`col-hdr col-sortable hidden md:table-cell text-left${sortField === 'total_premium' ? ' col-active' : ''}`}
                      onClick={() => handleSort('total_premium')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M12 6v2m0 8v2m-3-5h6m-6 0a3 3 0 006 0m-6 0a3 3 0 010-6h6" /></svg>
                        PREMIUM
                        <span style={{ display: 'inline-flex', alignItems: 'center', marginLeft: 1 }}>
                          {sortField === 'total_premium' && (
                            <svg width="7" height="8" viewBox="0 0 7 8" fill="currentColor" aria-hidden="true">{sortDirection === 'asc' ? <path d="M3.5 1L7 7H0Z" /> : <path d="M3.5 7L0 1H7Z" />}</svg>
                          )}
                        </span>
                      </div>
                    </th>

                    {/* EXPIRATION */}
                    <th
                      className={`col-hdr col-sortable text-left${sortField === 'expiry' ? ' col-active' : ''}`}
                      onClick={() => handleSort('expiry')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <svg className="hidden md:block" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                        <span className="hidden md:inline">EXPIRATION</span>
                        <span className="md:hidden" style={{ fontSize: 10 }}>EXP</span>
                        <span className="hidden md:inline-flex" style={{ alignItems: 'center', marginLeft: 1 }}>
                          {sortField === 'expiry' && (
                            <svg width="7" height="8" viewBox="0 0 7 8" fill="currentColor" aria-hidden="true">{sortDirection === 'asc' ? <path d="M3.5 1L7 7H0Z" /> : <path d="M3.5 7L0 1H7Z" />}</svg>
                          )}
                        </span>
                      </div>
                    </th>

                    {/* SPOT ? CURR */}
                    <th
                      className={`col-hdr col-sortable text-left${sortField === 'spot_price' ? ' col-active' : ''}`}
                      onClick={() => handleSort('spot_price')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <svg className="hidden md:block" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" /></svg>
                        <span className="hidden md:inline">SPOT ? CURR</span>
                        <span className="md:hidden" style={{ fontSize: 10 }}>SPOT</span>
                        <span className="hidden md:inline-flex" style={{ alignItems: 'center', marginLeft: 1 }}>
                          {sortField === 'spot_price' && (
                            <svg width="7" height="8" viewBox="0 0 7 8" fill="currentColor" aria-hidden="true">{sortDirection === 'asc' ? <path d="M3.5 1L7 7H0Z" /> : <path d="M3.5 7L0 1H7Z" />}</svg>
                          )}
                        </span>
                      </div>
                    </th>

                    {/* VOL/OI — not sortable */}
                    <th className="col-hdr hidden md:table-cell text-left">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                        VOL/OI
                      </div>
                    </th>

                    {/* TYPE */}
                    <th
                      className={`col-hdr col-sortable hidden md:table-cell text-left${sortField === 'trade_type' ? ' col-active' : ''}`}
                      onClick={() => handleSort('trade_type')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 7H4a2 2 0 00-2 2v8a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2zm-9 6H7m4-3H7m9 3h.01M17 10h.01" /></svg>
                        TYPE
                        <span style={{ display: 'inline-flex', alignItems: 'center', marginLeft: 1 }}>
                          {sortField === 'trade_type' && (
                            <svg width="7" height="8" viewBox="0 0 7 8" fill="currentColor" aria-hidden="true">{sortDirection === 'asc' ? <path d="M3.5 1L7 7H0Z" /> : <path d="M3.5 7L0 1H7Z" />}</svg>
                          )}
                        </span>
                      </div>
                    </th>

                    {/* Conditional: TARGETS */}
                    {notableFilterActive && (
                      <th className="col-hdr hidden md:table-cell text-left">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                          TARGETS
                        </div>
                      </th>
                    )}

                    {/* Conditional: DEALER */}
                    {notableFilterActive && (
                      <th className="col-hdr hidden md:table-cell text-left">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87m-4-12a4 4 0 010 7.75" /></svg>
                          DEALER
                        </div>
                      </th>
                    )}

                    {/* Conditional: GRADE / LEAP */}
                    {(efiHighlightsActive || leapActive) && (
                      <th
                        className={`col-hdr col-sortable text-left${sortField === (leapActive ? 'leap_grade' : 'positioning_grade') ? ' col-active' : ''}`}
                        onClick={() => handleSort(leapActive ? 'leap_grade' : 'positioning_grade')}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <svg className="hidden md:block" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                          <span className="hidden md:inline">{leapActive ? 'LEAP' : 'POSITION'}</span>
                          <span className="md:hidden" style={{ fontSize: 10 }}>GRD</span>
                          <span className="hidden md:inline-flex" style={{ alignItems: 'center', marginLeft: 1 }}>
                            {sortField === (leapActive ? 'leap_grade' : 'positioning_grade') && (
                              <svg width="7" height="8" viewBox="0 0 7 8" fill="currentColor" aria-hidden="true">{sortDirection === 'asc' ? <path d="M3.5 1L7 7H0Z" /> : <path d="M3.5 7L0 1H7Z" />}</svg>
                            )}
                          </span>
                        </div>
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
                          className="border-b border-slate-700/50 transition-all duration-150"
                          onClick={() => {
                            if (isNotablePick) openNotableAnalysis(trade)
                          }}
                          onMouseEnter={(e) => {
                            const el = e.currentTarget
                            el.style.transform = 'scaleY(1.12) translateZ(0)'
                            el.style.boxShadow = '0 6px 24px rgba(0,0,0,0.95)'
                            el.style.zIndex = '2'
                            el.style.position = 'relative'
                            el.style.background = 'linear-gradient(to right, #1a1400, #111100, #0d0d0d)'
                            el.style.borderLeft = '2px solid #ff6600'
                            el.style.fontSize = '115%'
                          }}
                          onMouseLeave={(e) => {
                            const el = e.currentTarget
                            el.style.transform = 'scaleY(1) translateZ(0)'
                            el.style.boxShadow = 'none'
                            el.style.zIndex = '1'
                            el.style.borderLeft = ''
                            el.style.fontSize = ''
                            el.style.background = index % 2 === 0 ? '#000000' : '#0a0a0a'
                          }}
                          style={{
                            cursor: isNotablePick ? 'pointer' : 'default',
                            backgroundColor: index % 2 === 0 ? '#000000' : '#0a0a0a',

                            position: 'relative' as const,

                            zIndex: hoveredGradeIndex === index ? 99999 : 'auto',
                          }}
                        >
                          <td className="p-2 md:p-6 text-white text-xs md:text-xl font-medium border-r border-gray-700/30 time-cell text-left">
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
                              {notableFilterActive ? formatTime(trade.trade_timestamp) : formatTimeWithSeconds(trade.trade_timestamp)}
                            </div>
                          </td>

                          <td className="hidden md:table-cell p-2 md:p-6 border-r border-gray-700/30" style={{ position: 'relative' }}>
                            {(() => {
                              const fs = (trade.fill_style || '').toUpperCase()
                              const isCall = trade.type?.toLowerCase() === 'call'
                              const isBullish = (isCall && (fs === 'A' || fs === 'AA')) || (!isCall && (fs === 'B' || fs === 'BB'))
                              const isBearish = (!isCall && (fs === 'A' || fs === 'AA')) || (isCall && (fs === 'B' || fs === 'BB'))
                              if (!isBullish && !isBearish) return null
                              return (
                                <div style={{
                                  position: 'absolute',
                                  left: 0,
                                  top: '10%',
                                  bottom: '10%',
                                  width: '4px',
                                  borderRadius: '0 2px 2px 0',
                                  background: isBullish
                                    ? 'linear-gradient(180deg, #4ade80 0%, #16a34a 50%, #4ade80 100%)'
                                    : 'linear-gradient(180deg, #f87171 0%, #dc2626 50%, #f87171 100%)',
                                  boxShadow: isBullish
                                    ? '0 0 8px rgba(74,222,128,0.8), inset 0 1px 0 rgba(255,255,255,0.4)'
                                    : '0 0 8px rgba(248,113,113,0.8), inset 0 1px 0 rgba(255,255,255,0.4)',
                                }} />
                              )
                            })()}
                            <div className="flex items-center justify-center gap-2">
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

                            <div className="hidden md:block text-center">{trade.type.toUpperCase()}</div>
                          </td>

                          <td
                            className="hidden md:table-cell p-2 md:p-6 text-xs md:text-xl font-semibold border-r border-gray-700/30 strike-cell text-center"
                            style={
                              isNotablePick
                                ? { color: '#FFD700', fontWeight: 'bold' }
                                : { color: 'white' }
                            }
                          >
                            ${trade.strike}
                          </td>

                          <td className="p-2 md:p-6 font-medium text-xs md:text-xl text-white border-r border-gray-700/30 size-premium-cell text-left">
                            {/* Mobile: Size@Price+Grade + Premium stacked */}

                            <div className="md:hidden flex flex-col items-center space-y-1">
                              <div className="flex items-center justify-center gap-1">
                                <span className="text-cyan-400 font-bold text-xs">
                                  {trade.trade_size.toLocaleString()}
                                </span>

                                <span className="text-yellow-400 font-bold text-xs">
                                  @{trade.premium_per_contract.toFixed(2)}
                                </span>

                                {['A', 'AA', 'B', 'BB'].includes((trade as any).fill_style) && (
                                  <span
                                    className={`ml-1 px-2 py-1 rounded-full font-bold text-xs shadow-lg ${(trade as any).fill_style === 'A'
                                      ? 'text-green-400 bg-green-400/20 border border-green-400/40'
                                      : (trade as any).fill_style === 'AA'
                                        ? 'text-green-300 bg-green-300/20 border border-green-300/40'
                                        : (trade as any).fill_style === 'B'
                                          ? 'text-red-400 bg-red-400/20 border border-red-400/40'
                                          : 'text-red-300 bg-red-300/20 border border-red-300/40'
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

                                  {['A', 'AA', 'B', 'BB'].includes((trade as any).fill_style) && (
                                    <span
                                      className={`fill-style-badge ml-1 px-1 md:px-2 py-0.5 rounded-md font-bold ${(trade as any).fill_style === 'A'
                                        ? 'text-green-400 bg-green-400/10 border border-green-400/30'
                                        : (trade as any).fill_style === 'AA'
                                          ? 'text-green-300 bg-green-300/10 border border-green-300/30'
                                          : (trade as any).fill_style === 'B'
                                            ? 'text-red-400 bg-red-400/10 border border-red-400/30'
                                            : 'text-red-300 bg-red-300/10 border border-red-300/30'
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

                          <td className="p-2 md:p-6 text-xs md:text-xl text-white border-r border-gray-700/30 expiry-cell text-left">
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

                          <td className="p-2 md:p-6 text-xs md:text-xl font-medium border-r border-gray-700/30 price-display text-left">
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

                          <td className="hidden md:table-cell p-2 md:p-6 border-r border-gray-700/30 text-center">
                            <span
                              className={`${getTradeTypeColor(trade.classification || trade.trade_type).className} px-4 py-2 text-xs md:text-lg`}
                              style={getTradeTypeColor(trade.classification || trade.trade_type).style}
                            >
                              {(trade.classification || trade.trade_type) === 'MULTI-LEG'
                                ? 'ML'
                                : trade.classification || trade.trade_type}
                            </span>
                          </td>

                          {/* -- Targets column -- */}
                          {notableFilterActive &&
                            (() => {
                              const isCall = trade.type === 'call'
                              const fillStyle = trade.fill_style || ''
                              const isSoldToOpen = fillStyle === 'B' || fillStyle === 'BB'
                              // A/AA: directional · calls go up, puts go down
                              // B/BB: inversed  · calls go down (sold call = bearish), puts go up (sold put = bullish)
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
                                    <span style={{ color: '#333', fontSize: '12px' }}>·</span>
                                  )}
                                </td>
                              )
                            })()}

                          {/* -- Dealer column -- */}
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
                                    <span style={{ color: '#333', fontSize: '12px' }}>·</span>
                                  )}
                                </td>
                              )
                            })()}

                          {(efiHighlightsActive || leapActive) &&
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

                                            position: 'relative',
                                          }}
                                        >
                                          {grade}

                                          {false &&
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
                                                <div style={{ marginBottom: '8px', fontWeight: 'bold', fontSize: '16px' }}>
                                                  {leapActive ? 'LEAP' : ''} Score:{' '}
                                                  <span style={{ color: scoreColor }}>{gradeData.score}/75</span>
                                                </div>

                                                {leapActive ? (
                                                  <>
                                                    {([['Contract P&L', gradeData.scores.contractPrice, 15], ['Rel. Strength', gradeData.scores.relativeStrength, 30], ['Vol / OI', gradeData.scores.volumeOI, 15], ['Stock Reaction', gradeData.scores.stockReaction, 15]] as [string, number, number][]).map(([label, val, max]) => (
                                                      <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
                                                        <span>{label}</span>
                                                        <span style={{ color: val <= 0 ? '#ff0000' : val >= max ? '#00ff00' : '#fbbf24' }}>
                                                          {val}/{max}
                                                        </span>
                                                      </div>
                                                    ))}
                                                    {(gradeData.scores as any).bonus52w > 0 && (
                                                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', color: '#00e5ff' }}>
                                                        <span>52W Breakout Bonus</span>
                                                        <span>+{(gradeData.scores as any).bonus52w}</span>
                                                      </div>
                                                    )}
                                                    {(gradeData.scores as any).seasonalBonus > 0 && (
                                                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', color: '#a78bfa' }}>
                                                        <span>Seasonality Bonus</span>
                                                        <span>+{(gradeData.scores as any).seasonalBonus}</span>
                                                      </div>
                                                    )}
                                                  </>
                                                ) : (
                                                  <>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                      <span>Expiration:</span>
                                                      <span style={{ color: (gradeData.scores as any).expiration === 0 ? '#ff0000' : (gradeData.scores as any).expiration === 25 ? '#00ff00' : '#ffffff' }}>{(gradeData.scores as any).expiration}/25</span>
                                                    </div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                      <span>Rel. Strength:</span>
                                                      <span style={{ color: gradeData.scores.relativeStrength === 0 ? '#ff0000' : gradeData.scores.relativeStrength === 10 ? '#00ff00' : '#ffffff' }}>{gradeData.scores.relativeStrength}/10</span>
                                                    </div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                      <span>Contract P&L:</span>
                                                      <span style={{ color: gradeData.scores.contractPrice === 0 ? '#ff0000' : gradeData.scores.contractPrice === 15 ? '#00ff00' : '#ffffff' }}>{gradeData.scores.contractPrice}/15</span>
                                                    </div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                      <span>Combo Trade:</span>
                                                      <span style={{ color: (gradeData.scores as any).combo === 0 ? '#ff0000' : (gradeData.scores as any).combo === 10 ? '#00ff00' : '#ffffff' }}>{(gradeData.scores as any).combo}/10</span>
                                                    </div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                      <span>Price Action:</span>
                                                      <span style={{ color: (gradeData.scores as any).priceAction === 0 ? '#ff0000' : (gradeData.scores as any).priceAction === 10 ? '#00ff00' : '#ffffff' }}>{(gradeData.scores as any).priceAction}/10</span>
                                                    </div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                      <span>Volume vs OI:</span>
                                                      <span style={{ color: gradeData.scores.volumeOI === 0 ? '#ff0000' : gradeData.scores.volumeOI === 15 ? '#00ff00' : '#ffffff' }}>{gradeData.scores.volumeOI}/15</span>
                                                    </div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                      <span>Stock Reaction:</span>
                                                      <span style={{ color: gradeData.scores.stockReaction === 0 ? '#ff0000' : gradeData.scores.stockReaction === 15 ? '#00ff00' : '#ffffff' }}>{gradeData.scores.stockReaction}/15</span>
                                                    </div>
                                                    {gradeData.stdDevError && (
                                                      <div style={{ color: '#ef4444', fontSize: '12px', marginTop: '4px', fontStyle: 'italic' }}>? StdDev fetch failed &#8212; Price Action unscored</div>
                                                    )}
                                                  </>
                                                )}

                                                <div style={{ position: 'absolute', top: '-10px', left: '50%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '10px solid transparent', borderRight: '10px solid transparent', borderBottom: `10px solid ${scoreColor}` }}></div>
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
                                                <div style={{ marginBottom: '8px', fontWeight: 'bold', fontSize: '16px' }}>
                                                  {leapActive ? 'LEAP' : ''} Score:{' '}
                                                  <span style={{ color: scoreColor }}>{gradeData.score}/75</span>
                                                </div>

                                                {leapActive ? (
                                                  <>
                                                    {([['Contract P&L', gradeData.scores.contractPrice, 15], ['Rel. Strength', gradeData.scores.relativeStrength, 30], ['Vol / OI', gradeData.scores.volumeOI, 15], ['Stock Reaction', gradeData.scores.stockReaction, 15]] as [string, number, number][]).map(([label, val, max]) => (
                                                      <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
                                                        <span>{label}</span>
                                                        <span style={{ color: val <= 0 ? '#ff0000' : val >= max ? '#00ff00' : '#fbbf24' }}>
                                                          {val}/{max}
                                                        </span>
                                                      </div>
                                                    ))}
                                                    {(gradeData.scores as any).bonus52w > 0 && (
                                                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', color: '#00e5ff' }}>
                                                        <span>52W Breakout Bonus</span>
                                                        <span>+{(gradeData.scores as any).bonus52w}</span>
                                                      </div>
                                                    )}
                                                    {(gradeData.scores as any).seasonalBonus > 0 && (
                                                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', color: '#a78bfa' }}>
                                                        <span>Seasonality Bonus</span>
                                                        <span>+{(gradeData.scores as any).seasonalBonus}</span>
                                                      </div>
                                                    )}
                                                  </>
                                                ) : (
                                                  <>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                      <span>Expiration:</span>
                                                      <span style={{ color: (gradeData.scores as any).expiration === 0 ? '#ff0000' : (gradeData.scores as any).expiration === 25 ? '#00ff00' : '#ffffff' }}>{(gradeData.scores as any).expiration}/25</span>
                                                    </div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                      <span>Rel. Strength:</span>
                                                      <span style={{ color: gradeData.scores.relativeStrength === 0 ? '#ff0000' : gradeData.scores.relativeStrength === 10 ? '#00ff00' : '#ffffff' }}>{gradeData.scores.relativeStrength}/10</span>
                                                    </div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                      <span>Contract P&L:</span>
                                                      <span style={{ color: gradeData.scores.contractPrice === 0 ? '#ff0000' : gradeData.scores.contractPrice === 15 ? '#00ff00' : '#ffffff' }}>{gradeData.scores.contractPrice}/15</span>
                                                    </div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                      <span>Combo Trade:</span>
                                                      <span style={{ color: (gradeData.scores as any).combo === 0 ? '#ff0000' : (gradeData.scores as any).combo === 10 ? '#00ff00' : '#ffffff' }}>{(gradeData.scores as any).combo}/10</span>
                                                    </div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                      <span>Price Action:</span>
                                                      <span style={{ color: (gradeData.scores as any).priceAction === 0 ? '#ff0000' : (gradeData.scores as any).priceAction === 10 ? '#00ff00' : '#ffffff' }}>{(gradeData.scores as any).priceAction}/10</span>
                                                    </div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                      <span>Volume vs OI:</span>
                                                      <span style={{ color: gradeData.scores.volumeOI === 0 ? '#ff0000' : gradeData.scores.volumeOI === 15 ? '#00ff00' : '#ffffff' }}>{gradeData.scores.volumeOI}/15</span>
                                                    </div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                      <span>Stock Reaction:</span>
                                                      <span style={{ color: gradeData.scores.stockReaction === 0 ? '#ff0000' : gradeData.scores.stockReaction === 15 ? '#00ff00' : '#ffffff' }}>{gradeData.scores.stockReaction}/15</span>
                                                    </div>
                                                    {gradeData.stdDevError && (
                                                      <div style={{ color: '#ef4444', fontSize: '12px', marginTop: '4px', fontStyle: 'italic' }}>? StdDev fetch failed · Price Action unscored</div>
                                                    )}
                                                  </>
                                                )}

                                                <div style={{ position: 'absolute', bottom: '-10px', left: '50%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '10px solid transparent', borderRight: '10px solid transparent', borderTop: `10px solid ${scoreColor}` }}></div>
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

                        {/* Mobile 3rd row: T1 / T2 / Magnet / Pivot · only for notable picks on mobile */}
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
                                        {zones2?.golden != null ? `$${zones2.golden}` : '—'}
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
                                        {zones2?.purple != null ? `$${zones2.purple}` : '—'}
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

                        <span>{streamingStatus ? streamingStatus.replace(/^Worker\s+\d+:\s*/i, '') : 'Loading premium options flow data...'}</span>
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
              A+ Tracker
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
            <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', justifyContent: 'center' }}>
              {/* Flow count badge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', background: '#0d0d0d', border: '1px solid #1f2937', borderRadius: '6px', padding: '5px 10px' }}>
                <span style={{ fontSize: '11px', letterSpacing: '1.5px', color: '#4b5563', fontWeight: 700, textTransform: 'uppercase' }}>Flows</span>
                <span style={{ fontSize: '16px', fontWeight: 900, color: '#ff8500' }}>{trackedFlows.length}</span>
              </div>

              <div style={{ width: '1px', height: '24px', background: '#1f2937', flexShrink: 0 }} />

              {/* Grade filter pills */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '3px', background: '#0d0d0d', border: '1px solid #1f2937', borderRadius: '6px', padding: '4px' }}>
                {(['ALL', 'A', 'B', 'C', 'D', 'F'] as const).map((g) => {
                  const active = flowTrackingFilters.gradeFilter === g
                  const gradeColor = g === 'ALL' ? '#ff8500' : g === 'A' ? '#00ff88' : g === 'B' ? '#22d3ee' : g === 'C' ? '#fbbf24' : g === 'D' ? '#fb923c' : '#ef4444'
                  return (
                    <button key={g} onClick={() => setFlowTrackingFilters((prev) => ({ ...prev, gradeFilter: g }))} style={{ fontSize: '13px', fontWeight: 800, padding: '3px 9px', borderRadius: '4px', cursor: 'pointer', border: active ? `1px solid ${gradeColor}` : '1px solid transparent', background: active ? `${gradeColor}18` : 'transparent', color: active ? gradeColor : '#374151', transition: 'all 0.15s' }}>{g}</button>
                  )
                })}
              </div>

              <div style={{ width: '1px', height: '24px', background: '#1f2937', flexShrink: 0 }} />

              {/* Toggle buttons */}
              {([
                { key: 'showWeeklies' as const, label: 'Weeklies', color: '#a78bfa' },
                { key: 'showDownSixtyPlus' as const, label: '?60%+', color: '#ef4444' },
                { key: 'showCharts' as const, label: 'Charts', color: '#22d3ee' },
              ]).map(({ key, label, color }) => {
                const active = flowTrackingFilters[key]
                return (
                  <button key={key} onClick={() => setFlowTrackingFilters((prev) => ({ ...prev, [key]: !prev[key] }))} style={{ fontSize: '13px', fontWeight: 700, padding: '5px 12px', borderRadius: '6px', cursor: 'pointer', border: `1px solid ${active ? color : '#1f2937'}`, background: active ? `${color}18` : '#0d0d0d', color: active ? color : '#4b5563', transition: 'all 0.15s', letterSpacing: '0.3px' }}>{label}</button>
                )
              })}
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
            width: '38%',
            height: '100vh',
            position: 'fixed',
            top: 125,
            right: 0,
            overflowY: 'auto',
            borderLeft: '1px solid #374151',
            background: '#000000',
            zIndex: 1002,
          }}
        >
          <FlowTrackingPanel
            relativeStrengthData={relativeStrengthData}
            historicalStdDevs={historicalStdDevs}
            comboTradeMap={comboTradeMap}
            dealerZoneCache={dealerZoneCache}
            liveFlows={trackedFlows}
          />
        </div>
      )}
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
            liveFlows={trackedFlows}
          />
        </div>
      )}
    </div>
  )
}
