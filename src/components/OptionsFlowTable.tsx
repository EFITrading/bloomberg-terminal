'use client'

import { TbStar, TbStarFilled } from 'react-icons/tb'
import * as XLSX from 'xlsx'

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
// Import your existing Polygon service

import { polygonService } from '@/lib/polygonService'
import { getDatesList, loadDateTrades, setCachedTrades } from '@/lib/flowDataCache'
import DateRangePicker from '@/components/DateRangePicker'
import { useDealerZonesStore } from '@/store/dealerZonesStore'

import '../app/options-flow/mobile.css'
import FlowTrackingPanel from './FlowTrackingPanel'
import OptionsFlowMobileFilterPanel from './OptionsFlowMobileFilterPanel'
import OptionsFlowMobileMenu from './OptionsFlowMobileMenu'
import { useOptionsFlowTableMobile } from './useOptionsFlowTableMobile'

// Polygon API key for bid/ask analysis

const POLYGON_API_KEY: string = ''

// Helper function to normalize ticker for options contracts

// Polygon removes periods from tickers in option symbols (e.g., BRK.B ? BRKB)

const normalizeTickerForOptions = (ticker: string): string => {
  return ticker.replace(/\./g, '')
}



// Format a price to 4 significant figures, no trailing zeros (mobile compact)
function fmt4sig(val: number): string {
  if (!val || val <= 0) return '--'
  return parseFloat(val.toPrecision(4)).toString()
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
  // When spot_price is 0 (live stream trades have no entry price) fall back to
  // showing just the live current price so the cell isn't blank.
  if (!spotPrice || spotPrice <= 0) {
    if (currentPrice && currentPrice > 0) {
      return (
        <span style={{ color: 'white', fontWeight: isNotablePick ? 'bold' : undefined }}>
          ${currentPrice.toFixed(2)}
        </span>
      )
    }
    if (isLoading) return <span className="text-gray-400 animate-pulse text-xs">fetching...</span>
    return <span className="text-gray-500">--</span>
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

  trade_type: 'SWEEP' | 'BLOCK' | 'MINI' | 'MULTI-LEG' | 'SUPER SWEEP' | 'SUPER BLOCK'

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
  exchange_id?: number
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

// -- Refine a raw dealer-gamma magnet/pivot strike (a round OI-derived number like $120) down
// to the EXACT nearby chart level that actually matters - a real daily-close swing point in
// that area rather than the raw strike. Scans the ticker's daily closes for candidates within
// a tight band around the raw level and scores each one on:
//   1) uniqueness  - how rarely price has closed at/near that exact print (a level visited
//      only once or twice reads as a "trapped range" edge, not noise)
//   2) reaction     - how far/fast price moved away in the sessions right after that close
//      (the level either launched price away from it or firmly rejected it)
//   3) trend break  - whether the close reversed a preceding run of same-direction closes
//      (a level that actually broke an up/down trend, not just a random daily print)
// The candidate with the best combined score (closest match wins ties) becomes the refined
// level. Falls back to the raw level (null return) when there isn't enough daily history yet.
function refinePivotalLevel(
  candles: { c: number; h: number; l: number }[] | null | undefined,
  approxLevel: number | null,
  spot: number,
  hardLo?: number,
  hardHi?: number
): number | null {
  if (!candles || candles.length < 20 || approxLevel === null || approxLevel <= 0 || !(spot > 0)) {
    return null
  }

  const n = candles.length

  // Per-stock daily range (ATR-style, high-low over the trailing 20 sessions) instead of a
  // fixed % of price - every ticker moves differently in raw dollars, so the search band,
  // revisit tolerance, and reaction threshold all scale off THIS stock's own actual daily
  // range rather than an arbitrary percentage.
  const atrWindow = candles.slice(Math.max(0, n - 20))
  const avgDailyRange =
    atrWindow.reduce((s, c) => s + Math.max(0, c.h - c.l), 0) / Math.max(1, atrWindow.length)
  const atr = avgDailyRange > 0 ? avgDailyRange : spot * 0.01 // fallback only if range data is degenerate

  // Search band: about 4 average daily ranges on either side of the raw level, intersected
  // with the 90%-probability BS move band (hardLo/hardHi) so every candidate this function can
  // ever return is ALREADY inside the tradeable range - no separate clamp-after-the-fact step
  // needed, which would otherwise snap a real candle close to an arbitrary band-edge price.
  let lo = approxLevel - atr * 4
  let hi = approxLevel + atr * 4
  if (hardLo !== undefined && hardHi !== undefined && hardHi > hardLo) {
    lo = Math.max(lo, hardLo)
    hi = Math.min(hi, hardHi)
    // The raw dealer level sits entirely outside the 90% band - search the whole band instead
    // of nothing, since the raw level itself isn't usable as an anchor here anyway.
    if (lo > hi) {
      lo = hardLo
      hi = hardHi
    }
  }
  const band = Math.max(hi - lo, atr) // used below only for scoring/proximity, never zero

  const win = 3 // compare each close against 3 sessions on either side to qualify as a local swing
  type Cand = { idx: number; level: number; score: number }
  const cands: Cand[] = []

  for (let i = win; i < n - win; i++) {
    const c = candles[i].c
    if (c < lo || c > hi) continue
    let isHigh = true
    let isLow = true
    for (let k = i - win; k <= i + win; k++) {
      if (k === i) continue
      if (candles[k].c >= c) isHigh = false
      if (candles[k].c <= c) isLow = false
    }
    if (!isHigh && !isLow) continue
    cands.push({ idx: i, level: c, score: 0 })
  }
  // Strict local swing highs/lows are ideal, but the 90%-band intersection above can make the
  // search window narrow enough that NONE of this ticker's closes happen to qualify as a strict
  // swing point - that used to silently fall back to the raw round dealer strike every time.
  // Instead, fall back to scoring every close inside the band so a real, unique daily-close
  // level is (almost) always found.
  if (!cands.length) {
    for (let i = 0; i < n; i++) {
      const c = candles[i].c
      if (c < lo || c > hi) continue
      cands.push({ idx: i, level: c, score: 0 })
    }
  }
  if (!cands.length) {
    return null
  }

  for (const cand of cands) {
    const { idx, level } = cand

    // 1) Uniqueness - fewer other daily closes revisiting this exact print (within ~1/3 of a
    // day's typical range) = a rarer, more meaningful "trapped range" edge instead of a level
    // price has churned through repeatedly.
    const tol = atr * 0.3
    let revisits = 0
    for (let k = 0; k < n; k++) {
      if (Math.abs(candles[k].c - level) <= tol) revisits++
    }
    const uniquenessScore = 1 / revisits

    // 2) Reaction - the biggest move away from this level (in multiples of its own daily
    // range) within the next 5 sessions - a real breakout-or-rejection point should be
    // followed by a decisive move measured in THIS stock's own volatility terms.
    let maxMove = 0
    for (let k = idx + 1; k <= Math.min(n - 1, idx + 5); k++) {
      const move = Math.abs(candles[k].c - level) / atr
      if (move > maxMove) maxMove = move
    }

    // 3) Trend break - did this print reverse a preceding directional run of closes?
    let trendBreakBonus = 0
    if (idx > win) {
      const priorRun = candles[idx - 1].c - candles[idx - win - 1].c
      const thisDir = candles[idx + 1] ? candles[idx + 1].c - level : 0
      if ((priorRun < 0 && thisDir > 0) || (priorRun > 0 && thisDir < 0)) trendBreakBonus = 0.5
    }

    // Slight preference for staying close to the raw dealer-derived level (still the strongest
    // directional OI signal) - refinement should sharpen it, not replace it with something far off.
    const proximityPenalty = (Math.abs(level - approxLevel) / band) * 0.6

    cand.score = uniquenessScore * 2 + maxMove * 1.5 + trendBreakBonus - proximityPenalty
  }

  cands.sort((a, b) => b.score - a.score)
  return cands[0].level
}

// -- Plan Entry: the exact Magnet/Pivot entry-plan decision tree used in the Dealer column.
// Extracted as a pure function so the SweepSense tab can reuse the IDENTICAL logic instead
// of reimplementing it.
function computePlanEntry(params: {
  spot: number
  magnet: number | null
  pivot: number | null
  sigma: number
  dte: number
  type: 'call' | 'put'
  fillStyle?: string
  grade: string
  gradeColor: string
}): { sigCode: string; sigColor: string; planText: string } {
  const { spot, magnet: rawMagnetIn, pivot: rawPivotIn, sigma, dte, type, fillStyle, grade, gradeColor } = params
  let sigCode = grade
  let sigColor = gradeColor
  let planText = 'Waiting on dealer magnet/pivot data to build an entry plan.'

  if (!(spot && spot > 0) || (rawMagnetIn === null && rawPivotIn === null)) {
    return { sigCode, sigColor, planText: 'No Plan detected.' }
  }
  if (sigma <= 0) {
    return { sigCode, sigColor, planText: 'No Plan detected.' }
  }
  const call90 = bsStrikeForProb(spot, sigma, dte, 90, true)
  const put90 = bsStrikeForProb(spot, sigma, dte, 90, false)
  if (call90 === null || put90 === null) {
    return { sigCode, sigColor, planText: 'No Plan detected.' }
  }
  const lo90 = Math.min(put90, call90)
  const hi90 = Math.max(put90, call90)

  let impliedBullish = type === 'call'
  if (fillStyle === 'B' || fillStyle === 'BB') impliedBullish = !impliedBullish

  // Clamp magnet/pivot into the 90%-probability BS move band instead of either rejecting
  // them outright (which left "No Plan detected." with no price at all) or leaving them
  // fully unbounded (which could surface a level with a low real chance of being reached).
  // A refined chart level beyond the 90% band gets pulled in to the band's edge so the plan
  // still points at a price that's realistically within reach.
  const clamp90 = (level: number) => Math.min(hi90, Math.max(lo90, level))
  const magnet = rawMagnetIn !== null ? clamp90(rawMagnetIn) : null
  const pivot = rawPivotIn !== null ? clamp90(rawPivotIn) : null

  const magnetAbove = magnet !== null ? magnet > spot : false
  const pivotAbove = pivot !== null ? pivot > spot : false
  const magnetAligned = magnet !== null && ((magnetAbove && impliedBullish) || (!magnetAbove && !impliedBullish))
  const pivotAligned = pivot !== null && ((pivotAbove && impliedBullish) || (!pivotAbove && !impliedBullish))

  const near = 0.025

  type Lvl = { label: 'magnet' | 'pivot'; value: number; aligned: boolean; dist: number }
  const candidates: Lvl[] = []
  if (magnet !== null) candidates.push({ label: 'magnet', value: magnet, aligned: magnetAligned, dist: Math.abs(magnet - spot) })
  if (pivot !== null) candidates.push({ label: 'pivot', value: pivot, aligned: pivotAligned, dist: Math.abs(pivot - spot) })
  candidates.sort((a, b) => a.dist - b.dist)
  const primary = candidates[0] ?? null
  const secondary = candidates[1] ?? null

  if (!primary) {
    return { sigCode: grade, sigColor: gradeColor, planText: 'No Plan detected.' }
  }

  if (primary.aligned) {
    const primaryLabel = primary.label
    const hasStretchTarget = secondary !== null && secondary.aligned
    if (primary.dist / spot <= near) {
      if (spot < primary.value) {
        sigCode = `Break Above $${primary.value.toFixed(2)}`; sigColor = '#00e5ff'
        planText = `Price sits just below the ${primaryLabel} ($${primary.value.toFixed(2)}). Wait for a clean break above ${primary.value.toFixed(2)} with momentum/volume; on confirmed break expect continuation higher — enter on breakout.`
      } else {
        sigCode = `Break Below $${primary.value.toFixed(2)}`; sigColor = '#ff0000'
        planText = `Price sits just above the ${primaryLabel} ($${primary.value.toFixed(2)}). Wait for a clean break below ${primary.value.toFixed(2)} with momentum/volume; on confirmed breakdown expect continuation lower — enter on breakdown.`
      }
    } else {
      sigCode = `Target $${primary.value.toFixed(2)}`; sigColor = '#ff8500'
      planText = `The ${primaryLabel} at $${primary.value.toFixed(2)} aligns with the flow intent. You can enter and trade toward ${primary.value.toFixed(2)} as your target.`
    }
    if (hasStretchTarget) {
      sigCode = impliedBullish ? `Long ? $${secondary!.value.toFixed(2)}` : `Short ? $${secondary!.value.toFixed(2)}`
      planText += ` On a confirmed break past $${primary.value.toFixed(2)}, add/enter more targeting the ${secondary!.label} at $${secondary!.value.toFixed(2)}.`
    }
  } else {
    const primaryLabel = primary.label
    if (impliedBullish) {
      sigCode = `Reversal Long $${primary.value.toFixed(2)}`; sigColor = '#00e5ff'
      planText = `The ${primaryLabel} at $${primary.value.toFixed(2)} sits against the bullish flow intent. Wait for price to approach down to $${primary.value.toFixed(2)} and buy there for entry.`
    } else {
      sigCode = `Reversal Short $${primary.value.toFixed(2)}`; sigColor = '#ff0000'
      planText = `The ${primaryLabel} at $${primary.value.toFixed(2)} sits against the bearish flow intent. Wait for price to run up to approach $${primary.value.toFixed(2)} and short there for entry.`
    }
  }

  return { sigCode, sigColor, planText }
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
  onCancel?: () => void
  hideCharts?: boolean
  /** When true (markets open), hides scan shortcuts and historical selector */
  isLiveMode?: boolean
  liveTradeCount?: number
  liveConnected?: boolean
  onToggleLive?: () => void
  /** When true in live mode, display all trades. When false (default), display $50k+ only. */
  liveShowAll?: boolean
  onToggleLiveShowAll?: () => void
}

const ALL_UNIQUE_FILTERS = ['ITM', 'OTM', 'SWEEP_ONLY', 'BLOCK_ONLY', 'MULTI_LEG_ONLY', 'MINI_ONLY']

const INDEX_TICKERS = new Set(['SPX', 'SPXW', 'NDX', 'NDXP', 'VIX', 'VIXW', 'RUT', 'RUTW', 'DJX'])

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
  onCancel,
  hideCharts = false,
  isLiveMode = false,
  liveTradeCount = 0,
  liveConnected = false,
  onToggleLive,
  liveShowAll = false,
  onToggleLiveShowAll,
}) => {
  const [sortField, setSortField] = useState<keyof OptionsFlowData | 'positioning_grade' | 'leap_grade'>(
    'trade_timestamp'
  )

  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  const [filterType, setFilterType] = useState<string>('all')

  const [selectedOptionTypes, setSelectedOptionTypes] = useState<string[]>([])
  const [selectedOrderSides, setSelectedOrderSides] = useState<string[]>([])

  const [selectedPremiumFilters, setSelectedPremiumFilters] = useState<string[]>([])

  const [customMinPremium, setCustomMinPremium] = useState<string>('')

  const [customMaxPremium, setCustomMaxPremium] = useState<string>('')

  const [selectedTickerFilters, setSelectedTickerFilters] = useState<string[]>([])

  const [selectedUniqueFilters, setSelectedUniqueFilters] = useState<string[]>(ALL_UNIQUE_FILTERS)
  // Exclusive type filter for mobile panel: empty = show all, otherwise show only selected trade types
  const [typeFilter, setTypeFilter] = useState<string[]>([])
  // Exclusive moneyness filter: empty = show all, ['ITM'] = ITM only, etc.
  const [moneynessFilter, setMoneynessFilter] = useState<string[]>([])

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
    Array<{ date: string; size?: number; createdAt?: string; tradeCount?: number | null; source?: string }>
  >([])

  const [loadingHistory, setLoadingHistory] = useState<boolean>(false)

  const [savingFlow, setSavingFlow] = useState<boolean>(false)

  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')
  // Date range calendar picker state
  const [calOpen, setCalOpen] = useState(false)
  const [calYear, setCalYear] = useState(new Date().getFullYear())
  const [calMonth, setCalMonth] = useState(new Date().getMonth())
  const [calHover, setCalHover] = useState<string | null>(null)
  const [calPickStart, setCalPickStart] = useState<string | null>(null) // first click pending end
  const calBtnRef = React.useRef<HTMLButtonElement>(null)
  const [calRect, setCalRect] = useState<{ top: number; left: number } | null>(null)

  const [saveErrorMsg, setSaveErrorMsg] = useState<string>('')

  const [loadingFlowDate, setLoadingFlowDate] = useState<string | null>(null)

  const [currentPage, setCurrentPage] = useState<number>(1)

  const [itemsPerPage] = useState<number>(250)

  const [showMobilePicksDropdown, setShowMobilePicksDropdown] = useState(false)
  const [showScanDropdown, setShowScanDropdown] = useState(false)

  const [quickFilters, setQuickFilters] = useState<{
    otm: boolean

    weekly: boolean

    premium100k: boolean

    sweep: boolean

    block: boolean
  }>({ otm: false, weekly: false, premium100k: false, sweep: false, block: false })

  const [shortTermActive, setEfiHighlightsActive] = useState<boolean>(false)
  const [longTermActive, setLeapActive] = useState<boolean>(false)
  // Dedicated flag for the SweepSense tab's background scan/enrichment ONLY.
  // Deliberately kept separate from shortTermActive/longTermActive so the main table's
  // row filtering/criteria (which read those two) is never touched by the tab's auto-scan.
  const [sweepSenseBgActive, setSweepSenseBgActive] = useState<boolean>(false)
  // Tracks the exact array reference loaded from a saved flow - dedup is skipped for this ref
  const loadedDataRef = useRef<OptionsFlowData[] | null>(null)

  const [isFlowTrackingOpen, setIsFlowTrackingOpen] = useState<boolean>(false)
  // Mobile only: which tab the full-screen FlowTrackingPanel should open to
  // (SweepSense button vs A+ Tracker button in the mobile control bar).
  const [mobileFlowInitialTab, setMobileFlowInitialTab] = useState<'TRACKER' | 'SWEEPSENSE'>('SWEEPSENSE')

  const [currentPrices, setCurrentPrices] = useState<Record<string, number>>({})

  const [priceLoadingState, setPriceLoadingState] = useState<Record<string, boolean>>({})
  // True while any stock price is still being fetched for the current flow dataset
  const stockPricesLoading = Object.values(priceLoadingState).some(v => v)
  // Set true the moment fetchCurrentPrices actually kicks off a batch (the 500ms debounce
  // means stockPricesLoading is still false for a brief window before that) - lets the
  // SweepSense auto-run effect tell "hasn't started yet" apart from "already finished".
  const pricesFetchStartedRef = useRef(false)

  const [currentOptionPrices, setCurrentOptionPrices] = useState<Record<string, number>>({})

  // Live volume/OI refreshed from the SAME Polygon snapshot call as currentOptionPrices -
  // fixes trade.volume/open_interest being frozen at whatever the collector saw once at
  // insert time. Keyed by option ticker (same key shape as currentOptionPrices).
  const [currentOptionVolOi, setCurrentOptionVolOi] = useState<Record<string, { volume: number; open_interest: number }>>({})

  const [optionPricesFetching, setOptionPricesFetching] = useState<boolean>(false)
  // Every option ticker we've ever ATTEMPTED to price, regardless of whether Polygon actually
  // returned a usable price for it (weekends/holidays/delisted contracts can legitimately come
  // back with nothing). Used to stop SweepSense's "settling" gate from waiting forever on
  // contracts that will never resolve - it only needs to know the attempt was made, not that
  // every single one succeeded.
  const attemptedOptionPriceTickersRef = useRef<Set<string>>(new Set())

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
  const [isAdmin, setIsAdmin] = useState(false)
  const { isMobileView, isTabletView, windowWidth } = useOptionsFlowTableMobile()
  // Above 1800px of raw window width, always show the persistent Flow Tracking sidebar
  // (never the slide-in drawer/button). Below that, use the drawer + toggle button.
  const rootRef = useRef<HTMLDivElement>(null)
  const MIN_WINDOW_WIDTH_FOR_SIDEBAR = 1800
  const showFlowSidebar = !isMobileView && !isTabletView && windowWidth >= MIN_WINDOW_WIDTH_FOR_SIDEBAR
  const showFlowDrawer = !isMobileView && !showFlowSidebar



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
  const [modeLoadingStep, setModeLoadingStep] = useState<{ mode: 'SHORT' | 'LONG'; step: string } | null>(null)

  // ---- Weather particle loading background ----
  const [weatherCanvas, setWeatherCanvas] = useState<HTMLCanvasElement | null>(null)
  const weatherCanvasRef = React.useRef<HTMLCanvasElement>(null)
  const weatherModeRef = React.useRef(0)

  React.useEffect(() => {
    if (!loading) return
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
  }, [loading, weatherCanvas])

  React.useEffect(() => {
    if (!loading) return
    const t = setInterval(() => { weatherModeRef.current = (weatherModeRef.current + 1) % 3 }, 14000)
    return () => clearInterval(t)
  }, [loading])

  const EFI_LOADING_QUOTES = [
    // Market wisdom
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
    { text: 'October is one of the peculiarly dangerous months to speculate in stocks. Others are July, January, April...', author: 'Mark Twain' },
    { text: 'An investment in knowledge pays the best interest.', author: 'Benjamin Franklin' },
    { text: 'Money is a terrible master but an excellent servant.', author: 'P.T. Barnum' },
    { text: 'The biggest risk is not taking any risk at all.', author: 'Mark Zuckerberg' },
    { text: 'Diversification is protection against ignorance. It makes little sense if you know what you\'re doing.', author: 'Warren Buffett' },
    { text: 'The secret of getting ahead is getting started.', author: 'Mark Twain' },
    // Options & flow
    { text: 'Block trades don\'t lie. Institutions leave footprints.', author: 'EFI Research' },
    { text: 'When sweep orders cluster, the smart money is speaking.', author: 'EFI Research' },
    { text: 'Volume is the weapon of the informed trader.', author: 'EFI Research' },
    { text: 'The best trades come from where conviction meets flow.', author: 'EFI Research' },
    { text: 'Follow the smart money - it always leaves a trail in options.', author: 'EFI Research' },
    { text: 'Premium doesn\'t lie. Size tells the story.', author: 'EFI Research' },
    { text: 'Unusual options activity today is tomorrow\'s headline.', author: 'EFI Research' },
    { text: 'Every large position started as an idea someone believed in enough to size up.', author: 'EFI Research' },
    { text: 'Options flow is the heartbeat of institutional conviction.', author: 'EFI Research' },
    { text: 'The dark pool is where certainty trades. Follow the size.', author: 'EFI Research' },
    { text: 'A sweep across multiple exchanges is a trader screaming urgency.', author: 'EFI Research' },
    { text: 'When IV crush comes, preparation determines winners from losers.', author: 'EFI Research' },
    // Trading psychology
    { text: 'The goal of a successful trader is to make the best trades. Money is secondary.', author: 'Alexander Elder' },
    { text: 'Trading is 30% strategy, 70% psychology. Master yourself first.', author: 'Mark Douglas' },
    { text: 'Losers average losers. Size up only when you\'re right.', author: 'Paul Tudor Jones' },
    { text: 'The most important quality for an investor is temperament, not intellect.', author: 'Warren Buffett' },
    { text: 'Win or lose, everybody gets what they want out of the market.', author: 'Ed Seykota' },
    { text: 'Cut your losses short and let your profits run.', author: 'Trading Maxim' },
    { text: 'The hard part isn\'t knowing what to do - it\'s sitting on your hands when there\'s nothing to do.', author: 'Jesse Livermore' },
    { text: 'Never risk more than 1% of your total equity on any single trade.', author: 'Larry Hite' },
    { text: 'Amateurs go broke taking large losses. Professionals go broke taking small profits.', author: 'Thomas Bulkowski' },
    { text: 'The market can do anything. Accept the risk, embrace the uncertainty.', author: 'Mark Douglas' },
    { text: 'Confidence is not "I will profit on this trade." Confidence is "I will be fine if I don\'t."', author: 'Yvan Byeajee' },
    // Wealth & success
    { text: 'Compound interest is the eighth wonder of the world. He who understands it, earns it.', author: 'Albert Einstein' },
    { text: 'Do not save what is left after spending; spend what is left after saving.', author: 'Warren Buffett' },
    { text: 'If you don\'t find a way to make money while you sleep, you will work until you die.', author: 'Warren Buffett' },
    { text: 'Opportunities come infrequently. When it rains gold, put out the bucket, not the thimble.', author: 'Warren Buffett' },
    { text: 'The best investment you can make is in yourself.', author: 'Warren Buffett' },
    { text: 'Wealth is not about having a lot of money; it\'s about having a lot of options.', author: 'Chris Rock' },
    { text: 'Financial freedom is available to those who learn about it and work for it.', author: 'Robert Kiyosaki' },
    { text: 'It\'s not how much money you make, but how much you keep and how hard it works for you.', author: 'Robert Kiyosaki' },
    { text: 'Success is not final, failure is not fatal: it is the courage to continue that counts.', author: 'Winston Churchill' },
    { text: 'The rich invest in time. The poor invest in money.', author: 'Warren Buffett' },
    { text: 'Formal education will make you a living; self-education will make you a fortune.', author: 'Jim Rohn' },
    { text: 'The difference between ordinary and extraordinary is that little extra.', author: 'Jimmy Johnson' },
    { text: 'Your income is directly related to the quality of service you provide.', author: 'Earl Nightingale' },
    { text: 'Discipline is the bridge between goals and accomplishment.', author: 'Jim Rohn' },
    { text: 'You don\'t need to be brilliant, just wiser than the other guys on average, for a long time.', author: 'Charlie Munger' },
    { text: 'Invert, always invert. Avoid stupidity rather than seeking brilliance.', author: 'Charlie Munger' },
    { text: 'All I want to know is where I\'m going to die, so I\'ll never go there.', author: 'Charlie Munger' },
    { text: 'The stock market is a no-called-strike game. You don\'t have to swing at everything.', author: 'Warren Buffett' },
  ]
  const [loadingQuoteIndex, setLoadingQuoteIndex] = useState(0)

  const [historicalDataLoading, setHistoricalDataLoading] = useState<Set<string>>(new Set())

  // Rotate quote every 10s while loading
  React.useEffect(() => {
    if (gradingProgress === null && modeLoadingStep === null && !loading) return
    const iv = setInterval(() => setLoadingQuoteIndex(i => (i + 1) % EFI_LOADING_QUOTES.length), 10000)
    return () => clearInterval(iv)
  }, [gradingProgress !== null, modeLoadingStep !== null, loading])

  const LoadingScenePanel = React.useCallback((): React.ReactElement => {
    return (
      <canvas
        ref={(el) => { (weatherCanvasRef as React.MutableRefObject<HTMLCanvasElement | null>).current = el; setWeatherCanvas(el) }}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
      />
    )
  }, [])
  const [hoveredGradeIndex, setHoveredGradeIndex] = useState<number | null>(null)

  const [notableFilterActive, setNotableFilterActive] = useState<boolean>(false)
  // Mobile SweepSense filter button - when active, the main table shows ONLY the trades
  // that qualified for the SweepSense tab (sweepSenseDataStable), hiding everything else.
  const [sweepSenseFilterActive, setSweepSenseFilterActive] = useState<boolean>(false)
  // Mobile: which SweepSense row (if any) is expanded to reveal its breakdown % + Plan Entry
  const [expandedSweepSenseRowId, setExpandedSweepSenseRowId] = useState<string | null>(null)
  // Grade column sort mode - toggles between long_first (cyan) and short_first (yellow)
  const [gradeColumnMode, setGradeColumnMode] = useState<'long_first' | 'short_first'>('long_first')

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

  // Per-expiry ATM IV cache for Plan Entry expected-range gate.
  // Key = `${ticker}_${expiry}` - matches the trade's OWN expiration (not a multi-expiry
  // aggregate like dealerZoneCache.atmIV), same computation as openNotableAnalysis /
  // options-chain page: avg IV of calls+puts within 5% of spot for that specific expiry.
  const [expiryIVCache, setExpiryIVCache] = useState<Record<string, number>>({})

  // Daily candle history per ticker (~1yr) used to refine the raw magnet/pivot gamma strikes
  // down to the EXACT chart level nearby (a real unique swing close - trend-break/rejection/
  // breakout point) instead of the raw round dealer-gamma strike. See refinePivotalLevel below.
  const [dailyCandleCache, setDailyCandleCache] = useState<
    Record<string, { c: number; h: number; l: number }[] | null>
  >({})
  const dailyCandleFetchingRef = useRef<Set<string>>(new Set())
  const dailyCandleRetryCountRef = useRef<Record<string, number>>({})

  // Long-term (LEAP) expected-range cache - keyed by ticker only. Long-term/LEAP trades use the
  // expiry CLOSEST to 45 days out (not the trade's own far-dated expiry) for the ATM IV + DTE used
  // in the Plan Entry / Magnet-Pivot range gate, matching the 45-day window convention.
  const [longTermIVCache, setLongTermIVCache] = useState<Record<string, { iv: number; dte: number }>>({})

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

    showCharts: !isMobileView,

    showWeeklies: false,
  })

  // Swipe-to-delete state for mobile

  const [swipedFlowId, setSwipedFlowId] = useState<string | null>(null)
  const [tabletPanelOpen, setTabletPanelOpen] = useState<boolean>(false)

  const [touchStart, setTouchStart] = useState<number>(0)

  const [touchCurrent, setTouchCurrent] = useState<number>(0)

  // Mobile view detection handled by useOptionsFlowTableMobile hook

  const [blacklistEnabled, setBlacklistEnabled] = useState<boolean>(false)

  // Persist blacklisted tickers to localStorage
  useEffect(() => {
    localStorage.setItem('optionsflow_blacklist', JSON.stringify(blacklistedTickers))
  }, [blacklistedTickers])

  // Ensure blacklist always has 21 slots (migrate old saves)
  useEffect(() => {
    if (blacklistedTickers.length < 21) {
      setBlacklistedTickers((prev) => {
        const padded = [...prev]
        while (padded.length < 21) padded.push('')
        return padded
      })
    }
  }, [])

  // Ensure component is mounted on client side to avoid hydration issues

  useEffect(() => {
    setIsMounted(true)
    // Read admin cookie
    const level = document.cookie.split('; ').find(r => r.startsWith('efi-level='))?.split('=')[1]
    setIsAdmin(level === 'admin')

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
    const INDEX_UNDERLYINGS = new Set(['SPXW', 'SPX', 'NDXP', 'NDX', 'RUTW', 'RUT', 'XSP'])
    const TICKER_RESTORE_MAP: Record<string, string> = { BRKB: 'BRK.B', BRKA: 'BRK.A' }

    const uniqueTickers = [...new Set(tickers)].filter(t => !INDEX_UNDERLYINGS.has(t.toUpperCase()))
    if (uniqueTickers.length === 0) return

    pricesFetchStartedRef.current = true

    // Mark all as loading
    const initialLoadingState: Record<string, boolean> = {}
    uniqueTickers.forEach((t) => { initialLoadingState[t] = true })
    setPriceLoadingState((prev) => ({ ...prev, ...initialLoadingState }))

    const allPricesUpdate: Record<string, number> = {}

    // Bulk snapshot: up to 250 tickers per request, all batches fired in parallel
    const BATCH_SIZE = 250
    const batches: string[][] = []
    for (let i = 0; i < uniqueTickers.length; i += BATCH_SIZE) {
      batches.push(uniqueTickers.slice(i, i + BATCH_SIZE))
    }

    await Promise.allSettled(
      batches.map(async (batch, batchIdx) => {
        const polygonTickers = batch.map(t => TICKER_RESTORE_MAP[t] ?? t)
        try {
          const url = `/api/polygon/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${polygonTickers.join(',')}&apikey=${POLYGON_API_KEY}`
          const response = await fetch(url, { signal: AbortSignal.timeout(10000) })
          if (response.ok) {
            const data = await response.json()
            const results: any[] = data.tickers ?? []
            for (const r of results) {
              const rawTicker = r.ticker
              const internalTicker = Object.entries(TICKER_RESTORE_MAP).find(([, v]) => v === rawTicker)?.[0] ?? rawTicker
              const price = r.lastTrade?.p || r.prevDay?.c
              if (price && price > 0) allPricesUpdate[internalTicker] = price
            }
          }
        } catch { /* silent */ }

        // Clear loading state for this batch
        const loadingUpdate: Record<string, boolean> = {}
        batch.forEach(t => { loadingUpdate[t] = false })
        setPriceLoadingState((prev) => ({ ...prev, ...loadingUpdate }))

        // Partial update per batch so prices appear as they land
        const batchPrices: Record<string, number> = {}
        batch.forEach(t => { if (allPricesUpdate[t]) batchPrices[t] = allPricesUpdate[t] })
        if (Object.keys(batchPrices).length > 0) {
          setCurrentPrices((prev) => ({ ...prev, ...batchPrices }))
        }
      })
    )

  }

  // Fetch current prices when data changes (debounced)

  useEffect(() => {
    if (!data || data.length === 0) {
      return
    }

    // Debounce API calls to prevent excessive requests

    const debounceTimer = setTimeout(() => {
      const tickers = [...new Set(data.map((trade) => trade.underlying_ticker))]
      if (tickers.length > 0) fetchCurrentPrices(tickers)
    }, 500) // 500ms debounce

    return () => clearTimeout(debounceTimer)
  }, [data])

  // Auto-refresh prices every 5 minutes during market hours only.
  // After hours: one-time fetch on load (handled by the debounced effect above), no interval.
  useEffect(() => {
    if (!data || data.length === 0) return

    const marketOpen = (): boolean => {
      const pst = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }))
      const dow = pst.getDay()
      const h = pst.getHours(), m = pst.getMinutes()
      return dow >= 1 && dow <= 5 && (h > 6 || (h === 6 && m >= 30)) && h < 13
    }

    if (!marketOpen()) return // after hours - no interval needed

    const interval = setInterval(() => {
      if (!marketOpen()) return // stop refreshing if market closed mid-interval
      const uniqueTickers = [...new Set(data.map((trade) => trade.underlying_ticker))]
      fetchCurrentPrices(uniqueTickers)
    }, 5 * 60 * 1000)

    return () => clearInterval(interval)
  }, [data.length])

  // Fetch real 30-day stdDevs for all visible tickers (Price Action grading)
  // Only runs once the SweepSense background scan is active - no point fetching on plain page load
  useEffect(() => {
    if (!sweepSenseBgActive) return
    if (!data || data.length === 0) return
    const tickers = [...new Set(data.map((t) => t.underlying_ticker))]
    const missing = tickers.filter((t) => !historicalStdDevs.has(t))
    if (missing.length === 0) return
    const STDDEV_API_KEY: string = ''
    const end = new Date().toISOString().split('T')[0]
    const start = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]

    // Controlled concurrency - 50 parallel at a time to avoid overwhelming the proxy
    const CONCURRENCY = 50
      ; (async () => {
        for (let i = 0; i < missing.length; i += CONCURRENCY) {
          const batch = missing.slice(i, i + CONCURRENCY)
          await Promise.allSettled(
            batch.map(async (ticker) => {
              try {
                const res = await fetch(
                  `/api/polygon/v2/aggs/ticker/${ticker}/range/1/day/${start}/${end}?adjusted=true&sort=asc&limit=30&apiKey=${STDDEV_API_KEY}`,
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
          )
        }
      })()
  }, [data.length, sweepSenseBgActive])

  // Fetch historical ranges when the SweepSense background scan is active

  useEffect(() => {
    if (!sweepSenseBgActive || !data || data.length === 0) return

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
  }, [sweepSenseBgActive, data.length])
  // Fetch current option prices for position tracking (only when EFI Highlights is ON)

  const fetchCurrentOptionPrices = async (trades: OptionsFlowData[]) => {
    const POLYGON_API_KEY: string = ''
    const pricesUpdate: Record<string, number> = {}

    // Filter out expired options before fetching prices
    const todayStr = new Date().toLocaleDateString('en-CA') // "YYYY-MM-DD" in local time
    const activeTrades = trades.filter((trade) => trade.expiry >= todayStr)

    if (activeTrades.length === 0) {
      setOptionPricesFetching(false)
      setModeLoadingStep(null)
      return
    }

    // Deduplicate: build unique option tickers so we never fetch the same contract twice
    const uniqueContracts = new Map<string, string>() // optionTicker -> underlying
    for (const trade of activeTrades) {
      const expiry = trade.expiry.replace(/-/g, '').slice(2)
      const strikeFormatted = String(Math.round(trade.strike * 1000)).padStart(8, '0')
      const optionType = trade.type.toLowerCase() === 'call' ? 'C' : 'P'
      const normalizedTicker = normalizeTickerForOptions(trade.underlying_ticker)
      const optionTicker = `O:${normalizedTicker}${expiry}${optionType}${strikeFormatted}`
      if (!uniqueContracts.has(optionTicker)) {
        uniqueContracts.set(optionTicker, trade.underlying_ticker)
      }
    }

    const uniqueTickers = Array.from(uniqueContracts.keys())
    for (const t of uniqueTickers) attemptedOptionPriceTickersRef.current.add(t)
    setOptionPricesFetching(true)
    setGradingProgress({ current: 0, total: uniqueTickers.length })

    const volOiUpdate: Record<string, { volume: number; open_interest: number }> = {}

    // Group contracts by (underlying, expiry) - the SAME per-underlying options-snapshot
    // endpoint ChainPanel uses (/v3/snapshot/options/{underlying}?expiration_date=...), which
    // actually returns day.close/last_trade for closed-market weekends/holidays, unlike the
    // bulk ticker.any_of universal snapshot endpoint which frequently omits that data entirely
    // for illiquid contracts.
    const groups = new Map<string, { underlying: string; expiry: string; wantedTickers: Set<string> }>()
    for (const trade of activeTrades) {
      const key = `${trade.underlying_ticker}|${trade.expiry}`
      if (!groups.has(key)) {
        groups.set(key, { underlying: trade.underlying_ticker, expiry: trade.expiry, wantedTickers: new Set() })
      }
      const expiry = trade.expiry.replace(/-/g, '').slice(2)
      const strikeFormatted = String(Math.round(trade.strike * 1000)).padStart(8, '0')
      const optionType = trade.type.toLowerCase() === 'call' ? 'C' : 'P'
      const normalizedTicker = normalizeTickerForOptions(trade.underlying_ticker)
      const optionTicker = `O:${normalizedTicker}${expiry}${optionType}${strikeFormatted}`
      groups.get(key)!.wantedTickers.add(optionTicker)
    }

    const _t0 = performance.now()
    try {
      await Promise.allSettled(
        Array.from(groups.values()).map(async ({ underlying, expiry, wantedTickers }) => {
          try {
            let matched = 0
            let nextUrl: string | null =
              `/api/polygon/v3/snapshot/options/${normalizeTickerForOptions(underlying)}?expiration_date=${expiry}&limit=250&apikey=${POLYGON_API_KEY}`
            while (nextUrl && matched < wantedTickers.size) {
              const currentUrl: string = nextUrl
              const response: Response = await fetch(currentUrl, { signal: AbortSignal.timeout(15000) })
              if (!response.ok) break
              const data: any = await response.json()
              const results: any[] = data.results ?? []
              for (const r of results) {
                const ticker = r.details?.ticker
                if (!ticker || !wantedTickers.has(ticker)) continue
                const bid = r.last_quote?.bid ?? 0
                const ask = r.last_quote?.ask ?? 0
                const mid = (bid + ask) / 2
                // Weekends/holidays: market is closed so last_quote is stale-zero. Fall back to
                // last_trade.price, then day.close (day.close IS reliably populated by this
                // per-underlying endpoint even for illiquid contracts, per ChainPanel's proven
                // working logic) so the ticker resolves a real settled price.
                if (mid > 0) pricesUpdate[ticker] = mid
                else if ((r.last_trade?.price ?? 0) > 0) pricesUpdate[ticker] = r.last_trade.price
                else if ((r.day?.close ?? 0) > 0) pricesUpdate[ticker] = r.day.close

                const liveVolume = r.day?.volume ?? 0
                const liveOi = r.open_interest ?? 0
                volOiUpdate[ticker] = { volume: liveVolume, open_interest: liveOi }
                matched++
              }
              // Polygon's own next_url is a raw https://api.polygon.io/... URL with a cursor
              // param - calling it directly from the browser 401s because it has no API key
              // (the key is only injected server-side by our /api/polygon proxy route). Rewrite
              // it back through that same proxy instead of following it as-is.
              if (data.next_url) {
                const rewritten = data.next_url.replace(/^https:\/\/api\.polygon\.io\//, '/api/polygon/')
                nextUrl = `${rewritten}${rewritten.includes('?') ? '&' : '?'}apikey=${POLYGON_API_KEY}`
              } else {
                nextUrl = null
              }
            }
          } catch { /* silent */ }
          setGradingProgress((prev) => prev ? { current: Math.min(prev.current + wantedTickers.size, prev.total), total: prev.total } : null)
        })
      )

      setCurrentOptionPrices((prev) => ({ ...prev, ...pricesUpdate }))
      setCurrentOptionVolOi((prev) => ({ ...prev, ...volOiUpdate }))
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
    const POLYGON_API_KEY: string = ''

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

      const url = `/api/polygon/v2/aggs/ticker/${ticker}/range/${multiplier}/${timespan}/${from}/${to}?adjusted=true&sort=asc&apiKey=${POLYGON_API_KEY}`

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
    const POLYGON_API_KEY: string = ''

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

      const url = `/api/polygon/v2/aggs/ticker/${optionTicker}/range/${multiplier}/${timespan}/${from}/${to}?adjusted=true&sort=asc&apiKey=${POLYGON_API_KEY}`

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
    const POLYGON_API_KEY: string = ''

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

        const url = `/api/polygon/v2/aggs/ticker/${ticker}/range/${multiplier}/${timespan}/${from}/${to}?adjusted=true&sort=asc&apiKey=${POLYGON_API_KEY}`

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
    const POLYGON_API_KEY: string = ''

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

        const url = `/api/polygon/v2/aggs/ticker/${optionTicker}/range/${multiplier}/${timespan}/${from}/${to}?adjusted=true&sort=asc&apiKey=${POLYGON_API_KEY}`

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

      const url = `/api/polygon/v2/aggs/ticker/${ticker}/range/1/day/${startDate}/${endDate}?adjusted=true&sort=asc&apiKey=${POLYGON_API_KEY}`

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

    // Determine the common date range from the earliest trade across all tickers
    const earliestOverall = new Date(
      Math.min(...trades.map((t) => new Date(t.trade_timestamp).getTime()))
    )
    const commonEndDate = new Date(earliestOverall)
    commonEndDate.setDate(commonEndDate.getDate() - 1)
    const commonStartDate = new Date(earliestOverall)
    commonStartDate.setDate(commonStartDate.getDate() - 5)
    const commonEndStr = commonEndDate.toISOString().split('T')[0]
    const commonStartStr = commonStartDate.toISOString().split('T')[0]

    // Fetch SPY once for all tickers
    let spyData: any = null
    try {
      const spyRes = await fetch(
        `/api/polygon/v2/aggs/ticker/SPY/range/1/day/${commonStartStr}/${commonEndStr}?adjusted=true&sort=asc&apiKey=${POLYGON_API_KEY}`,
        { signal: AbortSignal.timeout(20000) }
      )
      if (spyRes.ok) spyData = await spyRes.json()
    } catch (e: any) { /* silent */ }

    // Controlled concurrency - 50 parallel at a time
    const RS_CONCURRENCY = 50
    for (let i = 0; i < tickers.length; i += RS_CONCURRENCY) {
      await Promise.allSettled(
        tickers.slice(i, i + RS_CONCURRENCY).map(async (ticker) => {
          try {
            const tickerTrades = trades.filter((t) => t.underlying_ticker === ticker)
            if (tickerTrades.length === 0) return

            const earliestTrade = new Date(
              Math.min(...tickerTrades.map((t) => new Date(t.trade_timestamp).getTime()))
            )
            const endDate = new Date(earliestTrade)
            endDate.setDate(endDate.getDate() - 1)
            const startDate = new Date(earliestTrade)
            startDate.setDate(startDate.getDate() - 5)
            const endStr = endDate.toISOString().split('T')[0]
            const startStr = startDate.toISOString().split('T')[0]

            const stockRes = await fetch(
              `/api/polygon/v2/aggs/ticker/${ticker}/range/1/day/${startStr}/${endStr}?adjusted=true&sort=asc&apiKey=${POLYGON_API_KEY}`,
              { signal: AbortSignal.timeout(5000) }
            )
            if (!stockRes.ok) return
            const stockData = await stockRes.json()

            // Use pre-fetched SPY data if date range matches, otherwise fetch per-ticker SPY
            let resolvedSpyData = spyData
            if (!resolvedSpyData || startStr !== commonStartStr) {
              const spyRes = await fetch(
                `/api/polygon/v2/aggs/ticker/SPY/range/1/day/${startStr}/${endStr}?adjusted=true&sort=asc&apiKey=${POLYGON_API_KEY}`,
                { signal: AbortSignal.timeout(5000) }
              )
              if (!spyRes.ok) return
              resolvedSpyData = await spyRes.json()
            }

            if (
              stockData.results &&
              resolvedSpyData?.results &&
              stockData.results.length >= 2 &&
              resolvedSpyData.results.length >= 2
            ) {
              // Calculate % change over last 1-3 days

              const stockOld = stockData.results[0].c

              const stockNew = stockData.results[stockData.results.length - 1].c

              const stockChange = ((stockNew - stockOld) / stockOld) * 100

              const spyOld = resolvedSpyData.results[0].c

              const spyNew = resolvedSpyData.results[resolvedSpyData.results.length - 1].c

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
          } catch (error: any) { /* silent */ }
        })
      )
    }

    return rsMap
  }

  // Combined RS - single fetch per ticker serves BOTH short-term (5 trading days)
  // and long-term (5D/13D/21D) RS. Uses limit=30 with sort=desc so actual trading
  // days are counted - no calendar day math, no holiday gaps.
  const calculateCombinedRS = async (
    shortTermTrades: OptionsFlowData[],
    longTermTrades: OptionsFlowData[]
  ): Promise<{
    shortTermRS: Map<string, number>
    longTermRS: Map<string, { rs5d: number; rs13d: number; rs21d: number }>
  }> => {
    const shortTermRS = new Map<string, number>()
    const longTermRS = new Map<string, { rs5d: number; rs13d: number; rs21d: number }>()

    const shortSet = new Set(shortTermTrades.map(t => t.underlying_ticker))
    const longSet = new Set(longTermTrades.map(t => t.underlying_ticker))
    const allTickers = [...new Set([...shortSet, ...longSet])]

    // Wide date range - just needs to cover 30+ trading days back from today
    const today = new Date().toISOString().split('T')[0]
    const threeMonthsAgo = new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0]
    const url = (ticker: string) =>
      `/api/polygon/v2/aggs/ticker/${ticker}/range/1/day/${threeMonthsAgo}/${today}?adjusted=true&sort=desc&limit=30&apiKey=${POLYGON_API_KEY}`

    // Fetch SPY once
    let spyBars: Array<{ c: number }> = []
    try {
      const res = await fetch(url('SPY'), { signal: AbortSignal.timeout(20000) })
      const json = await res.json()
      spyBars = (json.results || []).reverse() // reverse so index 0 = oldest, last = most recent
      console.log(`[CombinedRS] SPY: ${spyBars.length} trading days`)
    } catch (e: any) { /* silent */ }

    if (spyBars.length < 6) {
      return { shortTermRS, longTermRS }
    }

    const pct = (arr: Array<{ c: number }>, n: number) => {
      if (arr.length < n + 1) return null
      return ((arr[arr.length - 1].c - arr[arr.length - 1 - n].c) / arr[arr.length - 1 - n].c) * 100
    }
    const spy5 = pct(spyBars, Math.min(5, spyBars.length - 1))
    const spy13 = pct(spyBars, Math.min(13, spyBars.length - 1))
    const spy21 = pct(spyBars, Math.min(21, spyBars.length - 1))

    // Batch fetch all tickers - 30 at a time so proxy doesn't saturate
    const BATCH = 30
    let resolved = 0, failed = 0
    for (let i = 0; i < allTickers.length; i += BATCH) {
      const batch = allTickers.slice(i, i + BATCH)
      await Promise.allSettled(batch.map(async (ticker) => {
        try {
          const res = await fetch(url(ticker), { signal: AbortSignal.timeout(12000) })
          if (!res.ok) { failed++; return }
          const json = await res.json()
          const bars: Array<{ c: number }> = (json.results || []).reverse()
          if (bars.length < 6) { failed++; return }

          // Short-term: 5 trading-day RS
          if (shortSet.has(ticker)) {
            const s5 = pct(bars, Math.min(5, bars.length - 1))
            if (s5 !== null && spy5 !== null) shortTermRS.set(ticker, s5 - spy5)
          }

          // Long-term: 5D/13D/21D RS
          if (longSet.has(ticker)) {
            longTermRS.set(ticker, {
              rs5d: (pct(bars, Math.min(5, bars.length - 1)) ?? 0) - (spy5 ?? 0),
              rs13d: (pct(bars, Math.min(13, bars.length - 1)) ?? 0) - (spy13 ?? 0),
              rs21d: (pct(bars, Math.min(21, bars.length - 1)) ?? 0) - (spy21 ?? 0),
            })
          }
          resolved++
        } catch (e: any) { failed++; console.warn(`[CombinedRS] ${ticker} threw:`, e?.message) }
      }))
    }
    console.log(`[CombinedRS] resolved:${resolved} failed:${failed} / total:${allTickers.length} | ST:${shortTermRS.size} LT:${longTermRS.size}`)
    return { shortTermRS, longTermRS }
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

    const _lt0 = performance.now()

    // Fetch SPY once
    let spyResults: Array<{ c: number }> = []
    try {
      const spyRes = await fetch(
        `/api/polygon/v2/aggs/ticker/SPY/range/1/day/${startStr}/${endStr}?adjusted=true&sort=asc&apiKey=${POLYGON_API_KEY}`,
        { signal: AbortSignal.timeout(20000) }
      )
      const spyData = await spyRes.json()
      spyResults = spyData.results || []
    } catch {
      // silent fail
    }

    if (spyResults.length < 6) { return rsMap }

    const pctChange = (arr: Array<{ c: number }>, n: number): number | null => {
      if (arr.length < n + 1) return null
      const recent = arr[arr.length - 1].c
      const old = arr[arr.length - 1 - n].c
      return ((recent - old) / old) * 100
    }

    const spy5d = pctChange(spyResults, Math.min(5, spyResults.length - 1))
    const spy13d = pctChange(spyResults, Math.min(13, spyResults.length - 1))
    const spy21d = pctChange(spyResults, Math.min(21, spyResults.length - 1))

    // Controlled concurrency - 50 parallel, no stagger
    const BATCH_SIZE = 50
    let _rsResolved = 0, _rsFailed = 0, _rsTooFewBars = 0
    for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
      const batch = tickers.slice(i, i + BATCH_SIZE)
      await Promise.all(
        batch.map(async (ticker) => {
          try {
            const stockRes = await fetch(
              `/api/polygon/v2/aggs/ticker/${ticker}/range/1/day/${startStr}/${endStr}?adjusted=true&sort=asc&apiKey=${POLYGON_API_KEY}`,
              { signal: AbortSignal.timeout(8000) }
            )
            if (!stockRes.ok) { _rsFailed++; return }
            const stockData = await stockRes.json()
            const stockResults: Array<{ c: number }> = stockData.results || []
            if (stockResults.length < 6) { _rsTooFewBars++; return }

            const stock5d = pctChange(stockResults, Math.min(5, stockResults.length - 1))
            const stock13d = pctChange(stockResults, Math.min(13, stockResults.length - 1))
            const stock21d = pctChange(stockResults, Math.min(21, stockResults.length - 1))

            rsMap.set(ticker, {
              rs5d: stock5d !== null && spy5d !== null ? stock5d - spy5d : 0,
              rs13d: stock13d !== null && spy13d !== null ? stock13d - spy13d : 0,
              rs21d: stock21d !== null && spy21d !== null ? stock21d - spy21d : 0,
            })
            _rsResolved++
          } catch (e: any) { _rsFailed++ }
        })
      )
    }

    void _lt0
    return rsMap
  }

  // Fetch 52-week high/low for a set of tickers (for LEAP bonus scoring)
  const fetchLeap52wkData = async (tickers: string[]): Promise<Map<string, { high52: number; low52: number }>> => {
    const result = new Map<string, { high52: number; low52: number }>()
    const _t0 = performance.now()
    const BATCH_SIZE = 25  // was 5 - proxy handles 25 concurrent fine
    for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
      const batch = tickers.slice(i, i + BATCH_SIZE)
      await Promise.allSettled(
        batch.map(async (ticker) => {
          try {
            const endDate = new Date().toISOString().split('T')[0]
            const startDate = new Date(Date.now() - 366 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
            const url = `/api/polygon/v2/aggs/ticker/${ticker}/range/1/day/${startDate}/${endDate}?adjusted=true&sort=asc&limit=400&apiKey=${POLYGON_API_KEY}`
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
        // no delay - parallel batches don't need staggering
      }
    }
    void _t0
    return result
  }

  // Compute seasonal sweet-spot / pain-point for a ticker using 15y of Polygon daily bars
  // Returns whether today's day-of-year falls within the best sweet spot or worst pain point window
  const fetchLeapSeasonalData = async (
    tickers: string[]
  ): Promise<Map<string, { inSweetSpot: boolean; inPainPoint: boolean }>> => {
    const result = new Map<string, { inSweetSpot: boolean; inPainPoint: boolean }>()
    const _t0 = performance.now()
    const tickersToScan = [...new Set(tickers)]

    // Helper: day-of-year for a Date
    const getDayOfYear = (d: Date) => {
      const start = new Date(d.getFullYear(), 0, 0)
      const diff = d.getTime() - start.getTime()
      return Math.floor(diff / (1000 * 60 * 60 * 24))
    }

    const SEASONAL_BATCH_SIZE = 10  // was 3 - 15yr data is large but proxy handles 10 fine
    for (let bi = 0; bi < tickersToScan.length; bi += SEASONAL_BATCH_SIZE) {
      const batch = tickersToScan.slice(bi, bi + SEASONAL_BATCH_SIZE)
      await Promise.allSettled(
        batch.map(async (ticker) => {
          try {
            const endDate = new Date().toISOString().split('T')[0]
            const startDate = new Date(Date.now() - 15 * 365.25 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
            const url = `/api/polygon/v2/aggs/ticker/${ticker}/range/1/day/${startDate}/${endDate}?adjusted=true&sort=asc&limit=5000&apiKey=${POLYGON_API_KEY}`
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
      if (bi + SEASONAL_BATCH_SIZE < tickersToScan.length) {
        // no delay - remove artificial wait
      }
    }
    void _t0
    return result
  }

  // Calculate positioning grade for EFI trades - COMPLETE 100-POINT SYSTEM

  const calculatePositioningGrade = (
    trade: OptionsFlowData,
    comboMap: Map<string, boolean>,
    overrides?: { optionPrice?: number; stockPrice?: number; asOf?: Date }
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
    // ETFs and index products - skip grading, return N/A
    if (ETF_INDEX_EXCLUSIONS.has(trade.underlying_ticker.toUpperCase())) {
      return { grade: 'N/A', score: 0, color: '#9ca3af', breakdown: 'ETF/Index - not graded', stdDevError: false, scores: { expiration: 0, contractPrice: 0, relativeStrength: 0, combo: 0, priceAction: 0, volumeOI: 0, stockReaction: 0 } }
    }

    // Get option ticker for current price lookup

    const expiry = trade.expiry.replace(/-/g, '').slice(2)

    const strikeFormatted = String(Math.round(trade.strike * 1000)).padStart(8, '0')

    const optionType = trade.type.toLowerCase() === 'call' ? 'C' : 'P'

    const normalizedTicker = normalizeTickerForOptions(trade.underlying_ticker)

    const optionTicker = `O:${normalizedTicker}${expiry}${optionType}${strikeFormatted}`

    const currentPrice = overrides?.optionPrice ?? currentOptionPrices[optionTicker]

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
      // Return early - option price not yet available

      return {
        grade: 'N/A',

        score: confidenceScore,

        color: '#9ca3af',

        breakdown: `Score: ${confidenceScore}/100\nExpiration: ${scores.expiration}/25\nContract P&L: 0/15\nRelative Strength: 0/15\nCombo Trade: 0/10\nPrice Action: 0/10\nVolume vs OI: 0/10\nStock Reaction: 0/15`,

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

    // 3. Relative Strength Score (15 points max) - Award points if trade aligns with RS

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

      // Award 15 points if trade direction aligns with RS

      const aligned = (isBullishFlow && rs > 0) || (isBearishFlow && rs < 0)

      if (aligned) scores.relativeStrength = 15
    }

    confidenceScore += scores.relativeStrength

    // 4. Combo Trade Score - 10 pts normally; 25 pts for MULTI-LEG with buy+sell pair
    const fillStyle = trade.fill_style || ''
    const comboLookupKey = `${trade.underlying_ticker}-${trade.strike}-${trade.expiry}-${trade.type}-${fillStyle}`
    const hasComboTrade = comboMap.get(comboLookupKey) || false
    const isMultiLeg = (trade.classification || trade.trade_type || '').toUpperCase() === 'MULTI-LEG'

    if (isMultiLeg) {
      // Multi-leg: combo replaces vol/OI entirely (25 pts = 10 combo + 15 vol/OI)
      if (hasComboTrade) scores.combo = 25
    } else {
      if (hasComboTrade) scores.combo = 10
    }

    confidenceScore += scores.combo

    // Shared variables for sections 5 and 6
    const entryStockPrice = trade.spot_price
    const currentStockPrice = overrides?.stockPrice ?? currentPrices[trade.underlying_ticker]
    const tradeTime = new Date(trade.trade_timestamp)
    const currentTime = overrides?.asOf ?? new Date()
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

    // 7. Volume vs Open Interest Score (10 pts max)
    // MULTI-LEG: skipped - those pts are folded into the combo score above
    if (!isMultiLeg) {
      const liveVolOi = currentOptionVolOi[optionTicker]
      const tradeVolume = liveVolOi?.volume ?? trade.volume ?? null
      const tradeOI = liveVolOi?.open_interest ?? trade.open_interest ?? null
      if (tradeVolume !== null && tradeOI !== null && tradeOI > 0) {
        const volOIRatio = tradeVolume / tradeOI
        if (volOIRatio >= 1.5) scores.volumeOI = 10
        else if (volOIRatio >= 1.0) scores.volumeOI = 7
        else if (volOIRatio >= 0.5) scores.volumeOI = 3
      }
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

Relative Strength: ${scores.relativeStrength}/15

Combo Trade: ${scores.combo}/10

Price Action: ${scores.priceAction}/10

Volume vs OI: ${scores.volumeOI}/10

Stock Reaction: ${scores.stockReaction}/15`

    const stdDevError = stdDevFailed.has(trade.underlying_ticker)

    return { grade, score: confidenceScore, color: scoreColor, breakdown, scores, stdDevError }
  }

  // LEAP grading system - 4 criteria, normalized to 100

  const calculateLeapGrade = (
    trade: OptionsFlowData,
    _comboMap: Map<string, boolean>,
    overrides?: { optionPrice?: number; stockPrice?: number; asOf?: Date }
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
    // ETFs and index products - skip grading, return N/A
    if (ETF_INDEX_EXCLUSIONS.has(trade.underlying_ticker.toUpperCase())) {
      return { grade: 'N/A', score: 0, color: '#9ca3af', breakdown: 'ETF/Index - not graded', stdDevError: false, scores: { contractPrice: 0, relativeStrength: 0, volumeOI: 0, stockReaction: 0, bonus52w: 0, seasonalBonus: 0 } }
    }
    const expiry = trade.expiry.replace(/-/g, '').slice(2)
    const strikeFormatted = String(Math.round(trade.strike * 1000)).padStart(8, '0')
    const optionType = trade.type.toLowerCase() === 'call' ? 'C' : 'P'
    const normalizedTicker = normalizeTickerForOptions(trade.underlying_ticker)
    const optionTicker = `O:${normalizedTicker}${expiry}${optionType}${strikeFormatted}`
    const currentPrice = overrides?.optionPrice ?? currentOptionPrices[optionTicker]
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

    if (pct <= -40) scores.contractPrice = -7.5       // blown up - penalize
    else if (pct <= -20) scores.contractPrice = 7.5   // down 20-40%: half points
    else if (pct <= -15) scores.contractPrice = 15    // down 15-20%: sweet spot, full points
    else if (pct <= -10) scores.contractPrice = 8     // down 10-15%: partial
    else if (pct <= 10) scores.contractPrice = 0      // flat -10%: no points
    else if (pct <= 20) scores.contractPrice = 3      // up 10-20%: small reward
    else scores.contractPrice = 5                     // up 20%+: 1/3 of max (5 pts)

    // 2. Relative Strength (30 pts max) - weighted 5D-30% + 13D-40% + 21D-30%
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
    // MULTI-LEG: skipped - replaced by buy+sell combo detection below
    const isLeapMultiLeg = (trade.classification || trade.trade_type || '').toUpperCase() === 'MULTI-LEG'
    if (!isLeapMultiLeg) {
      const liveVolOi = currentOptionVolOi[optionTicker]
      const tradeVolume = liveVolOi?.volume ?? trade.volume ?? null
      const tradeOI = liveVolOi?.open_interest ?? trade.open_interest ?? null
      if (tradeVolume !== null && tradeOI !== null && tradeOI > 0) {
        const ratio = tradeVolume / tradeOI
        if (ratio >= 1.5) scores.volumeOI = 15
        else if (ratio >= 1.0) scores.volumeOI = 7.5
        else if (ratio >= 0.5) scores.volumeOI = 5
      }
    } else {
      // Multi-leg: 15 pts if buy+sell pair detected (combo)
      const leapComboKey = `${trade.underlying_ticker}-${trade.strike}-${trade.expiry}-${trade.type}-${tradeFillStyle}`
      if (_comboMap.get(leapComboKey)) scores.volumeOI = 15
    }

    // 4. Stock Reaction (15 pts max) - 4hr and 1d checkpoints
    const isCall = trade.type === 'call'
    const fill = tradeFillStyle
    const currentStockPrice = overrides?.stockPrice ?? currentPrices[trade.underlying_ticker]
    const entryStockPrice = trade.spot_price
    const asOfTime = overrides?.asOf ?? new Date()

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
        (asOfTime.getTime() - new Date(trade.trade_timestamp).getTime()) / (1000 * 60 * 60)

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
    const stockNow = overrides?.stockPrice ?? currentPrices[trade.underlying_ticker]
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
  // ETFs and index products that should not be graded or qualify for LEAP/EFI picks
  const ETF_INDEX_EXCLUSIONS = new Set([
    'SPY', 'QQQ', 'IWM', 'DIA', 'MDY', 'RSP', 'VOO', 'VTI', 'VXX', 'UVXY', 'SVIX',
    'XLF', 'XLK', 'XLE', 'XLV', 'XLI', 'XLU', 'XLP', 'XLY', 'XLB', 'XLRE', 'XLC',
    'SMH', 'SOXX', 'IBB', 'XBI', 'GDX', 'GDXJ', 'SLV', 'GLD', 'TLT', 'HYG', 'LQD',
    'EEM', 'EFA', 'FXI', 'EWZ', 'EWY', 'EWG', 'KWEB', 'ARKK', 'SQQQ', 'TQQQ',
    'SPXL', 'SPXS', 'SOXL', 'SOXS', 'LABU', 'TNA', 'NUGT', 'JDST', 'IBIT',
    'MSTR', 'BITO', 'KOLD', 'USO', 'UCO', 'KRE', 'XHB', 'XOP', 'XME', 'XRT',
    'SPX', 'SPXW', 'NDX', 'NDXP', 'RUT', 'RUTW', 'VIX', 'VIXW', 'XSP',
  ])

  // Cash-settled indexes only - ETFs are allowed for long-term
  const INDEX_ONLY_EXCLUSIONS = new Set([
    'SPX', 'SPXW', 'NDX', 'NDXP', 'RUT', 'RUTW', 'VIX', 'VIXW', 'XSP', 'DJX',
  ])

  // Large-cap tickers that require elevated premium thresholds
  const LARGE_CAP_PREMIUM_TICKERS = new Set(['AAPL', 'NVDA', 'TSLA', 'MSFT', 'GOOGL', 'GOOG', 'LLY', 'META', 'SPCX', 'TSM', 'AVGO', 'MU', 'AMD', 'AMZN'])

  // Long-Term criteria: 35-120 DTE, OTM, indexes excluded
  // Large-caps: $900K+ premium; others: $300K-$1.3M
  const meetsLongTermCriteria = (trade: OptionsFlowData): boolean => {
    if (INDEX_ONLY_EXCLUSIONS.has(trade.underlying_ticker.toUpperCase())) return false
    if (trade.days_to_expiry < 35 || trade.days_to_expiry > 120) return false
    const isLargeCap = LARGE_CAP_PREMIUM_TICKERS.has(trade.underlying_ticker.toUpperCase())
    const minPremium = isLargeCap ? 900000 : 300000
    const maxPremium = isLargeCap ? Infinity : 1300000
    if (trade.total_premium < minPremium || trade.total_premium > maxPremium) return false
    if (trade.trade_size < 450) return false
    if (!trade.moneyness || trade.moneyness !== 'OTM') return false
    // MULTI-LEG trades are excluded from SweepSense entirely
    const tradeType = (trade.classification || trade.trade_type || '').toUpperCase()
    if (tradeType === 'MULTI-LEG') return false
    return true
  }

  // Short-Term criteria: 0-28 DTE, OTM, SWEEP/BLOCK only (MULTI-LEG excluded), ETFs+indexes excluded
  // Large-caps: $450K+ premium; others: $99K-$340K
  const meetsShortTermCriteria = (trade: OptionsFlowData): boolean => {
    if (ETF_INDEX_EXCLUSIONS.has(trade.underlying_ticker.toUpperCase())) return false
    if (trade.days_to_expiry < 0 || trade.days_to_expiry > 28) return false
    const isLargeCap = LARGE_CAP_PREMIUM_TICKERS.has(trade.underlying_ticker.toUpperCase())
    const minPremium = isLargeCap ? 450000 : 99000
    const maxPremium = isLargeCap ? Infinity : 340000
    if (trade.total_premium < minPremium || trade.total_premium > maxPremium) return false
    if (trade.trade_size < 650) return false
    if (!trade.moneyness || trade.moneyness !== 'OTM') return false
    const tradeType = (trade.classification || trade.trade_type || '').toUpperCase()
    // MULTI-LEG trades are excluded from SweepSense entirely
    if (!['SWEEP', 'BLOCK'].includes(tradeType)) return false
    return true
  }

  // Backwards-compat aliases (grading functions reference these)
  const meetsEfiCriteria = meetsShortTermCriteria
  const meetsLeapCriteria = meetsLongTermCriteria

  // SweepSense button removed - scan now runs automatically the first time flow data loads,
  // but only once the main table's current-price fetch has actually started AND finished -
  // otherwise SweepSense grades trades against stale/entry prices instead of live prices.
  const sweepSenseAutoRanRef = useRef(false)
  useEffect(() => {
    if (sweepSenseAutoRanRef.current) {
      return
    }
    if (!data || data.length === 0) {
      return
    }
    if (!pricesFetchStartedRef.current || stockPricesLoading) {
      return
    }
    sweepSenseAutoRanRef.current = true

    const run = async () => {
      // NOTE: intentionally does NOT call setEfiHighlightsActive/setLeapActive - those
      // flags drive the main table's row filtering/criteria and must stay untouched so
      // the table keeps showing its original, unfiltered columns/rows at all times.
      setSweepSenseBgActive(true)
      setModeLoadingStep({ mode: 'SHORT', step: 'SweepSense - Scanning Short-Term & Long-Term...' })
      await new Promise<void>((r) => setTimeout(r, 0))
      const shortTermTrades = data.filter(meetsShortTermCriteria)
      const longTermTrades = data.filter(meetsLongTermCriteria)
      const longTermTickers = [...new Set(longTermTrades.map((t) => t.underlying_ticker))]
      const allUniq = [...shortTermTrades, ...longTermTrades].filter(
        (t, i, arr) => arr.findIndex((x) =>
          x.underlying_ticker === t.underlying_ticker && x.strike === t.strike &&
          x.expiry === t.expiry && x.type === t.type) === i
      )
      try {
        const { shortTermRS, longTermRS } = await calculateCombinedRS(shortTermTrades, longTermTrades)
        setRelativeStrengthData((prev) => new Map([...prev, ...shortTermRS]))
        setLeapRsData((prev) => new Map([...prev, ...longTermRS]))
        const [wkData, seasonData] = await Promise.all([
          fetchLeap52wkData(longTermTickers),
          fetchLeapSeasonalData(longTermTickers),
        ])
        setLeap52wkData((prev) => new Map([...prev, ...wkData]))
        setLeapSeasonalData((prev) => new Map([...prev, ...seasonData]))
        await fetchCurrentOptionPrices(allUniq)
      } catch (err) {
        console.error('[SweepSense] Auto-scan error:', err)
      }
      setModeLoadingStep(null)
    }
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, stockPricesLoading])

  // SweepSense keeps running against LIVE, ever-changing data, but the RS/52wk/seasonal
  // fetches only ran once (at button-click time) for whatever tickers existed then.
  // New trades polling in bring NEW tickers that never get RS/52wk/seasonal data,
  // so their grade score is missing those points and they can never reach A-/A/A+,
  // making the grade gate wipe out the whole result set. This effect keeps those
  // maps topped up for any new ticker that enters the SweepSense candidate pool.
  useEffect(() => {
    if (!sweepSenseBgActive) return
    if (!data || data.length === 0) return

    const shortTermTrades = data.filter(meetsShortTermCriteria)
    const longTermTrades = data.filter(meetsLongTermCriteria)
    const longTermTickers = [...new Set(longTermTrades.map((t) => t.underlying_ticker))]

    const missingRS = shortTermTrades.some((t) => !relativeStrengthData.has(t.underlying_ticker))
    const missingLeapRS = longTermTickers.some((tk) => !leapRsData.has(tk))
    const missing52wk = longTermTickers.some((tk) => !leap52wkData.has(tk))
    const missingSeasonal = longTermTickers.some((tk) => !leapSeasonalData.has(tk))

    if (!missingRS && !missingLeapRS && !missing52wk && !missingSeasonal) return

    const debounceTimer = setTimeout(async () => {
      try {
        if (missingRS || missingLeapRS) {
          const { shortTermRS, longTermRS } = await calculateCombinedRS(shortTermTrades, longTermTrades)
          setRelativeStrengthData((prev) => new Map([...prev, ...shortTermRS]))
          setLeapRsData((prev) => new Map([...prev, ...longTermRS]))
        }
        if (missing52wk || missingSeasonal) {
          const [wkData, seasonData] = await Promise.all([
            fetchLeap52wkData(longTermTickers),
            fetchLeapSeasonalData(longTermTickers),
          ])
          setLeap52wkData((prev) => new Map([...prev, ...wkData]))
          setLeapSeasonalData((prev) => new Map([...prev, ...seasonData]))
        }
      } catch (err) {
        console.error('[SweepSense] backfill error:', err)
      }
    }, 1500)

    return () => clearTimeout(debounceTimer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.length, sweepSenseBgActive])

  // Notable Flow Pick criteria checker (8 criteria)

  const meetsLeapNotableCriteria = (trade: OptionsFlowData): boolean => {
    // Must pass base LEAP criteria first (30-180 DTE, $250k+, 300+ contracts, not ETF)
    if (!meetsLeapCriteria(trade)) return false
    // LEAP Notable: OTM only, premium $150k-$1.5m
    if (!trade.moneyness || trade.moneyness !== 'OTM') return false
    if (trade.total_premium < 150000 || trade.total_premium > 1500000) return false
    // Grade gate: B+ or above required
    if (!optionPricesFetching && Object.keys(currentOptionPrices).length > 0) {
      const expiry = trade.expiry.replace(/-/g, '').slice(2)
      const strikeFormatted = String(Math.round(trade.strike * 1000)).padStart(8, '0')
      const optType = trade.type.toLowerCase() === 'call' ? 'C' : 'P'
      const optKey = `O:${trade.underlying_ticker.replace(/\./g, '')}${expiry}${optType}${strikeFormatted}`
      const optPrice = currentOptionPrices[optKey]
      if (!optPrice) return false
      const gradeData = calculateLeapGrade(trade, comboTradeMap)
      const validGrades = ['B+', 'A-', 'A', 'A+']
      if (!validGrades.includes(gradeData.grade)) return false
    }
    return true
  }

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

  // Notable Trade Analysis - targets + dealer zones
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
    const flowId = generateFlowId(trade)
    // Store original data with timestamp - only current price and grade will update
    // SweepSense: grade the trade with the scorer that matches its criteria
    const useLeapForTrade = longTermActive && shortTermActive
      ? meetsLeapCriteria(trade)
      : longTermActive
    const gradeResult = useLeapForTrade
      ? calculateLeapGrade(trade, comboTradeMap)
      : calculatePositioningGrade(trade, comboTradeMap)

    const flowToTrack = {
      ...trade,
      gradeMode: useLeapForTrade ? 'leap' : 'standard',

      addedAt: new Date().toISOString(),

      originalPrice: trade.premium_per_contract,

      originalStockPrice: trade.spot_price,

      classification: gradeResult.grade,

      frozenComboScore: ('combo' in gradeResult.scores ? gradeResult.scores.combo : 0),

      frozenRsScore: gradeResult.scores.relativeStrength,
    }

    const newTrackedFlows = [...trackedFlows, flowToTrack]

    setTrackedFlows(newTrackedFlows)

    try {
      localStorage.setItem('flowTrackingWatchlist', JSON.stringify(newTrackedFlows))
    } catch (e) {
      console.error('[FlowTracking] localStorage write failed:', e)
    }
    window.dispatchEvent(new CustomEvent('flowWatchlistUpdated', { detail: { flows: newTrackedFlows } }))

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
  }

  // Save current flow data to database

  const handleSaveFlow = async () => {
    try {
      setSavingFlow(true)
      setSaveStatus('idle')
      setSaveErrorMsg('')

      const _now = new Date()
      const rawTrades = data ?? []
      const tradesWithTs = rawTrades.filter((t: any) => t.trade_timestamp)
      if (tradesWithTs.length === 0) throw new Error('No trades with timestamps to save')

      // Group trades by their actual PST trading date
      const pstSample = new Date(tradesWithTs[0].trade_timestamp)
      const pstOffsetMs = pstSample.getTime() - new Date(pstSample.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })).getTime()
      const byDay = new Map<string, any[]>()
      for (const t of rawTrades) {
        let dayKey: string
        if (t.trade_timestamp) {
          const pstMs = new Date(t.trade_timestamp).getTime() - pstOffsetMs
          const d = new Date(pstMs)
          dayKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
        } else {
          dayKey = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}-${String(_now.getDate()).padStart(2, '0')}`
        }
        const group = byDay.get(dayKey) ?? []
        group.push(t)
        byDay.set(dayKey, group)
      }

      // Save each day separately under its own date
      for (const [tradeDate, dayTrades] of Array.from(byDay.entries())) {
        const rawJson = JSON.stringify({ date: tradeDate, data: dayTrades })
        const rawSizeKB = (new TextEncoder().encode(rawJson).byteLength / 1024).toFixed(1)
        const encoded = new TextEncoder().encode(rawJson)
        const cs = new CompressionStream('gzip')
        const writer = cs.writable.getWriter()
        writer.write(encoded)
        writer.close()
        const compressedBuffer = await new Response(cs.readable).arrayBuffer()
        const response = await fetch('/api/flows/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: compressedBuffer,
        })
        if (!response.ok) {
          const errData = await response.json().catch(() => ({}))
          throw new Error(`${tradeDate}: ${errData.error || `HTTP ${response.status}`}`)
        }
      }

      setSaveStatus('success')
      setTimeout(() => setSaveStatus('idle'), 3000)
    } catch (error) {
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
      // Shared cache: returns instantly if already fetched by AlgoFlow or OptionsFlow page
      const dates = await getDatesList()
      if (!Array.isArray(dates)) throw new Error('Expected array from dates cache')
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
      // Shared cache: returns from memory if AlgoFlow already loaded this date
      const trades = await loadDateTrades(date)
      loadedDataRef.current = trades
      onDataUpdate && onDataUpdate(trades)
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
        throw new Error(`HTTP ${response.status} - ${errText}`)
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
    // In live mode: data is already pre-enriched - skip tradesWithFillStyles merge entirely
    // (avoids the one-render lag that causes double-compute flicker on every flush)
    let sourceData: OptionsFlowData[]

    if (isLiveMode) {
      sourceData = data
    } else if (tradesWithFillStyles.length === 0) {
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

    // Patch moneyness for live trades - use currentPrices (or spot_price) to compute real ITM/OTM/ATM
    // Also handles DB-loaded live trades that have spot_price > 0 but no moneyness field (collector omits it)
    sourceData = sourceData.map((trade) => {
      if (trade.spot_price > 0 && trade.moneyness) return trade
      const spot = trade.spot_price > 0 ? trade.spot_price : currentPrices[trade.underlying_ticker]
      if (!spot || spot <= 0) return trade
      const pct = (trade.strike - spot) / spot
      const ATM_BAND = 0.005 // 0.5% band = ATM
      let moneyness: 'ATM' | 'ITM' | 'OTM'
      if (trade.type === 'call') {
        moneyness = pct <= -ATM_BAND ? 'ITM' : pct >= ATM_BAND ? 'OTM' : 'ATM'
      } else {
        moneyness = pct >= ATM_BAND ? 'ITM' : pct <= -ATM_BAND ? 'OTM' : 'ATM'
      }
      if (moneyness === trade.moneyness) return trade
      return { ...trade, moneyness }
    })

    // Live mode ITM depth filter - exclude trades that are too deep in the money.
    // Uses currentPrices (already fetched). Stocks: max 10% ITM. ETFs: max 5% ITM.
    if (isLiveMode) {
      const ITM_ETF_MAX = 0.05   // 5%
      const ITM_STOCK_MAX = 0.10 // 10%
      const etfSetItm = new Set(['SPY', 'QQQ', 'IWM', 'DIA', 'XLF', 'XLK', 'XLE', 'XLV', 'XLI',
        'XLP', 'XLU', 'XLY', 'XLB', 'XLRE', 'XLC', 'SMH', 'GLD', 'SLV', 'TLT', 'HYG', 'LQD',
        'EEM', 'EFA', 'VXX', 'UVXY', 'SQQQ', 'TQQQ', 'SPXL', 'SPXS', 'GDX', 'GDXJ', 'XBI',
        'IBB', 'SOXX', 'ARKK', 'RSP', 'MDY', 'IWF', 'IWD', 'USO', 'IBIT', 'MSTR'])
      sourceData = sourceData.filter((trade) => {
        const spot = currentPrices[trade.underlying_ticker]
        if (!spot || spot <= 0) return true // no price data - let it through
        const isEtf = etfSetItm.has(trade.underlying_ticker.toUpperCase())
        const maxItm = isEtf ? ITM_ETF_MAX : ITM_STOCK_MAX
        // ITM depth: how far in the money is this contract?
        let itmDepth = 0
        if (trade.type === 'call') {
          itmDepth = (spot - trade.strike) / spot // positive = ITM for calls
        } else {
          itmDepth = (trade.strike - spot) / spot // positive = ITM for puts
        }
        return itmDepth <= maxItm // exclude if deeper than threshold
      })
    }

    // Step 1: Fast deduplication using Set (O(n) instead of O(n-))
    // Skipped when data was loaded from a saved flow - it's already clean
    let deduplicatedData: OptionsFlowData[]
    if (data === loadedDataRef.current) {
      // Exact same array reference that came from a saved load - skip dedup
      deduplicatedData = sourceData
    } else {
      const seen = new Set<string>()
      deduplicatedData = sourceData.filter((trade: OptionsFlowData) => {
        const tradeKey = `${trade.underlying_ticker}-${trade.strike}-${trade.expiry}-${trade.type}-${trade.trade_size}-${trade.total_premium}-${trade.trade_timestamp}-${trade.exchange_id ?? trade.exchange_name}`
        if (seen.has(tradeKey)) return false
        seen.add(tradeKey)
        return true
      })
    }

    // Step 2: Bundle small trades (<$500) for same contract within 1 minute
    // Skipped in live mode - every print shows as its own individual row
    let bundledData: OptionsFlowData[]
    if (isLiveMode) {
      bundledData = deduplicatedData
    } else {
      const _bundledData: OptionsFlowData[] = []
      const smallTradeGroups = new Map<string, OptionsFlowData[]>()

      // First pass: separate large trades and group small trades
      deduplicatedData.forEach((trade: OptionsFlowData) => {
        if (trade.total_premium >= 500) {
          _bundledData.push(trade)
        } else {
          const tradeTime = new Date(trade.trade_timestamp)
          const minuteKey = `${tradeTime.getFullYear()}-${tradeTime.getMonth()}-${tradeTime.getDate()}-${tradeTime.getHours()}-${tradeTime.getMinutes()}`
          const groupKey = `${trade.underlying_ticker}-${trade.strike}-${trade.expiry}-${trade.type}-${minuteKey}`
          if (!smallTradeGroups.has(groupKey)) smallTradeGroups.set(groupKey, [])
          smallTradeGroups.get(groupKey)!.push(trade)
        }
      })

      // Second pass: bundle small trades
      smallTradeGroups.forEach((trades) => {
        if (trades.length === 1) {
          _bundledData.push(trades[0])
        } else {
          const totalContracts = trades.reduce((sum, t) => sum + t.trade_size, 0)
          const totalPremium = trades.reduce((sum, t) => sum + t.total_premium, 0)
          const avgPricePerContract = totalPremium / totalContracts
          const bundledTrade: OptionsFlowData = {
            ...trades[0],
            trade_size: totalContracts,
            premium_per_contract: avgPricePerContract,
            total_premium: totalPremium,
            exchange_name: `BUNDLED (${trades.length} trades)`,
            trade_timestamp: trades.reduce((earliest, t) =>
              new Date(t.trade_timestamp) < new Date(earliest.trade_timestamp) ? t : earliest
            ).trade_timestamp,
          }
          _bundledData.push(bundledTrade)
        }
      })
      bundledData = _bundledData
    } // end !isLiveMode bundling block

    let filtered = bundledData
    // SweepSense mode: both active simultaneously - union (OR) so no trades are lost
    if (shortTermActive && longTermActive) {
      filtered = filtered.filter((trade) => meetsEfiCriteria(trade) || meetsLeapCriteria(trade))
    } else if (shortTermActive) {
      filtered = filtered.filter((trade) => meetsEfiCriteria(trade))
    } else if (longTermActive) {
      // LEAP filter - when active alone, show ONLY trades that meet LEAP criteria
      filtered = filtered.filter((trade) => meetsLeapCriteria(trade))
    }

    // Grade gate: once option prices are loaded, keep only A-, A, A+ trades
    if ((shortTermActive || longTermActive) && !optionPricesFetching && Object.keys(currentOptionPrices).length > 0) {
      filtered = filtered.filter((trade) => {
        const useLeap = (shortTermActive && longTermActive)
          ? meetsLongTermCriteria(trade)
          : longTermActive
        const g = useLeap
          ? calculateLeapGrade(trade, comboTradeMap)
          : calculatePositioningGrade(trade, comboTradeMap)
        return ['A-', 'A', 'A+'].includes(g.grade)
      })
    }

    // Apply filters - Option Type (checkbox)

    if (selectedOptionTypes.length > 0) {
      filtered = filtered.filter((trade) => selectedOptionTypes.includes(trade.type))
    }

    // Order side filter - matches fill_style directly from button values
    if (selectedOrderSides.length > 0) {
      const fillStyleMap: Record<string, string[]> = {
        buy_a: ['A'], buy_aa: ['AA'], sell_b: ['B'], sell_bb: ['BB'],
      }
      const allowedStyles = selectedOrderSides.flatMap(v => fillStyleMap[v] ?? [])
      if (allowedStyles.length > 0) {
        filtered = filtered.filter((trade) => allowedStyles.includes((trade.fill_style || '').toUpperCase()))
      }
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

              case 'contract_lt_040': {
                // price per share = total_premium / (trade_size * 100)
                const pricePerShare = trade.trade_size > 0 ? trade.total_premium / (trade.trade_size * 100) : 0
                return pricePerShare < 0.40
              }

              case 'contract_lt_5': {
                const pricePerShare = trade.trade_size > 0 ? trade.total_premium / (trade.trade_size * 100) : 0
                return pricePerShare < 5
              }

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
      const etfSet = new Set(['SPY', 'QQQ', 'IWM', 'EFA', 'EEM', 'VTI', 'IEFA', 'AGG', 'LQD', 'HYG',
        'XLF', 'XLE', 'XLK', 'XLV', 'XLI', 'XLU', 'XLP', 'XLY', 'XLB', 'XLRE', 'XLC',
        'GLD', 'SLV', 'TLT', 'IEF', 'SHY', 'VTEB', 'VXUS', 'BND', 'BNDX',
        'DIA', 'SMH', 'VXX', 'UVXY', 'SQQQ', 'TQQQ', 'SPXL', 'SPXS', 'SPYG', 'SPYV',
        'IVV', 'VOO', 'VEA', 'VWO', 'ARKK', 'ARKG', 'ARKW', 'ARKF', 'ARKQ',
        'RSP', 'MDY', 'IJH', 'IJR', 'IWF', 'IWD', 'IWB', 'IWO', 'IWN',
        'XBI', 'IBB', 'SOXX', 'HACK', 'BOTZ', 'ROBO', 'SKYY', 'CLOU',
        'GDX', 'GDXJ', 'SIL', 'SILJ', 'IAU', 'SGOL',
        'USO', 'UNG', 'PDBC', 'DBO', 'DBB', 'DBC',
        'TBT', 'TMF', 'TMV', 'TLH', 'IEI', 'GOVT',
        'FXI', 'KWEB', 'MCHI', 'ASHR', 'VGK', 'EWJ', 'EWZ', 'EWC', 'EWG', 'EWU',
        'EURL', 'HEDJ', 'DBJP', 'DBEF'])

      // Compute overblown tickers once before the filter loop (O(n) not O(n-))
      let overblownSet: Set<string> | null = null
      if (selectedTickerFilters.includes('OVERBLOWN_TICKERS')) {
        const tradeCounts = new Map<string, number>()
        for (const t of filtered) {
          const tk = t.underlying_ticker
          tradeCounts.set(tk, (tradeCounts.get(tk) ?? 0) + 1)
        }
        const topSpam = [...tradeCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([tk]) => tk)
        overblownSet = new Set(topSpam)
      }

      filtered = filtered.filter((trade) => {
        return selectedTickerFilters.every((filter) => {
          switch (filter) {
            case 'ETF_ONLY':
              return etfSet.has(trade.underlying_ticker)

            case 'STOCK_ONLY':
              return !etfSet.has(trade.underlying_ticker) && !INDEX_TICKERS.has(trade.underlying_ticker.toUpperCase())

            case 'MAG7_ONLY':
              return mag7Stocks.includes(trade.underlying_ticker)

            case 'EXCLUDE_MAG7':
              return !mag7Stocks.includes(trade.underlying_ticker)

            case 'EXCLUDE_ETF':
              return !etfSet.has(trade.underlying_ticker)

            case 'EXCLUDE_FUTURES': {
              const futuresSet = new Set(['SPXW', 'SPX', 'NDXP', 'NDX', 'RUTW', 'RUT', 'XSP', 'VIX', 'VIXW'])
              return !futuresSet.has(trade.underlying_ticker.toUpperCase())
            }

            case 'OVERBLOWN_TICKERS':
              return !overblownSet!.has(trade.underlying_ticker)

            case 'HIGHLIGHTS_ONLY':
              return meetsEfiCriteria(trade)

            default:
              return true
          }
        })
      })
    }

    // Unique filters - trade type visibility (desktop legacy checkboxes, not the new exclusive buttons)
    const hasDeselected = ALL_UNIQUE_FILTERS.some(f => !selectedUniqueFilters.includes(f))
    if (hasDeselected) {
      filtered = filtered.filter((trade) => {
        if (trade.trade_type === 'SWEEP' && !selectedUniqueFilters.includes('SWEEP_ONLY')) return false
        if (trade.trade_type === 'BLOCK' && !selectedUniqueFilters.includes('BLOCK_ONLY')) return false
        if (trade.trade_type === 'MULTI-LEG' && !selectedUniqueFilters.includes('MULTI_LEG_ONLY')) return false
        if (trade.trade_type === 'MINI' && !selectedUniqueFilters.includes('MINI_ONLY')) return false
        return true
      })
    }

    // Moneyness exclusive filter: empty = show all, non-empty = show only selected
    if (moneynessFilter.length > 0) {
      filtered = filtered.filter((trade) => moneynessFilter.includes(trade.moneyness))
    }

    // Type exclusive filter: empty = show all, non-empty = show only selected trade types
    if (typeFilter.length > 0) {
      filtered = filtered.filter((trade) => typeFilter.includes(trade.trade_type))
    }

    // Weekly Expiry - show only =7 day expiries
    if (selectedUniqueFilters.includes('WEEKLY_ONLY')) {
      filtered = filtered.filter((trade) => {
        const expiryDate = new Date(trade.expiry)
        const today = new Date()
        const daysToExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
        return daysToExpiry > 7
      })
    }

    // Monthly Expiry - show only contracts expiring on the 3rd Friday of a month
    if (selectedUniqueFilters.includes('MONTHLY_ONLY')) {
      filtered = filtered.filter((trade) => {
        const d = new Date(trade.expiry)
        if (d.getDay() !== 5) return false // must be Friday
        const month = d.getMonth(), year = d.getFullYear()
        let friCount = 0
        for (let day = 1; day <= d.getDate(); day++) {
          if (new Date(year, month, day).getDay() === 5) friCount++
        }
        return friCount === 3
      })
    }

    // Quadwitching - 3rd Friday of Mar/Jun/Sep/Dec
    if (selectedUniqueFilters.includes('QUAD_WITCHING')) {
      filtered = filtered.filter((trade) => {
        const d = new Date(trade.expiry)
        const m = d.getMonth()
        if (![2, 5, 8, 11].includes(m)) return false
        if (d.getDay() !== 5) return false
        const year = d.getFullYear()
        let friCount = 0
        for (let day = 1; day <= d.getDate(); day++) {
          if (new Date(year, m, day).getDay() === 5) friCount++
        }
        return friCount === 3
      })
    }

    // 0DTE - expiring today
    if (selectedUniqueFilters.includes('ZERO_DTE')) {
      const todayStr = new Date().toISOString().split('T')[0]
      filtered = filtered.filter((trade) => {
        const expStr = trade.expiry.includes('T') ? trade.expiry.split('T')[0] : trade.expiry
        return expStr === todayStr
      })
    }

    // Sector filters - opt-in: if any selected, show only matching tickers
    const activeSectors = ['GROWTH_ONLY', 'VALUE_ONLY', 'DEFENSIVES_ONLY'].filter(f => selectedUniqueFilters.includes(f))
    if (activeSectors.length > 0) {
      const growthSet = new Set(['XLK', 'XLY', 'XLC', 'ARKK', 'ARKW', 'ARKQ', 'ARKG', 'ARKF', 'SKYY', 'CLOU', 'BOTZ', 'ROBO', 'SOXX', 'SMH', 'QQQ', 'TQQQ', 'AAPL', 'MSFT', 'NVDA', 'META', 'GOOGL', 'GOOG', 'AMZN', 'TSLA', 'AMD', 'AVGO', 'ORCL', 'ADBE', 'CRM', 'SNOW', 'PLTR', 'NET', 'DDOG', 'ZS', 'CRWD', 'PANW', 'MU', 'AMAT', 'LRCX', 'KLAC', 'MRVL', 'QCOM', 'INTC', 'TXN', 'NFLX', 'SPOT', 'SHOP', 'SQ', 'PYPL', 'UBER', 'LYFT', 'ABNB', 'DASH', 'COIN', 'MSTR', 'ROKU', 'PINS', 'SNAP', 'RBLX', 'U', 'TTWO', 'EA', 'MTCH', 'ZM', 'DOCU', 'TWLO', 'MDB', 'GTLB', 'PATH', 'AI', 'GENI', 'APP', 'CELH', 'DXCM', 'ISRG', 'VEEV'])
      const valueSet = new Set(['XLI', 'XLF', 'XLB', 'VTV', 'IVE', 'SPYV', 'RSP', 'DIA', 'JPM', 'BAC', 'WFC', 'C', 'GS', 'MS', 'BX', 'KKR', 'APO', 'V', 'MA', 'AXP', 'BLK', 'SCHW', 'CME', 'ICE', 'CB', 'PGR', 'TRV', 'MMC', 'AON', 'CAT', 'DE', 'HON', 'GE', 'RTX', 'LMT', 'NOC', 'BA', 'UNP', 'CSX', 'NSC', 'FDX', 'UPS', 'XOM', 'CVX', 'COP', 'OXY', 'SLB', 'HAL', 'MPC', 'VLO', 'PSX', 'FCX', 'NEM', 'AA', 'NUE', 'X', 'CLF', 'CF', 'MOS', 'ADM', 'BG', 'WMT', 'COST', 'TGT', 'HD', 'LOW'])
      const defSet = new Set(['XLV', 'XLRE', 'XLP', 'XLU', 'IYR', 'VNQ', 'IBB', 'XBI', 'JNJ', 'UNH', 'PFE', 'MRK', 'ABBV', 'LLY', 'BMY', 'AMGN', 'GILD', 'BIIB', 'REGN', 'VRTX', 'MRNA', 'BNTX', 'CVS', 'CI', 'HUM', 'MCK', 'ABC', 'CAH', 'PG', 'KO', 'PEP', 'PM', 'MO', 'MDLZ', 'CL', 'KMB', 'CHD', 'GIS', 'K', 'CPB', 'CAG', 'HRL', 'TSN', 'WBA', 'AMT', 'CCI', 'SBAC', 'EQIX', 'PLD', 'SPG', 'ARE', 'EQR', 'AVB', 'NEE', 'DUK', 'SO', 'AEP', 'D', 'EXC', 'SRE', 'AWK', 'WM', 'RSG', 'T', 'VZ'])
      filtered = filtered.filter((trade) => {
        const tk = trade.underlying_ticker
        if (activeSectors.includes('GROWTH_ONLY') && growthSet.has(tk)) return true
        if (activeSectors.includes('VALUE_ONLY') && valueSet.has(tk)) return true
        if (activeSectors.includes('DEFENSIVES_ONLY') && defSet.has(tk)) return true
        return false
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

    // -- SweepSense dedup -----------------------------------------------------
    // Two-pass reduction ? exactly 1 trade per ticker.
    //
    // Pass 1: same ticker + same expiry + same type + same fill group (A=AA, B=BB)
    //         ? keep only the highest-scoring one.
    //         Eliminates "IREN call A $42 / $44 / $45 same expiry" ? keeps A+ one.
    //
    // Pass 2: from all survivors for the same ticker (across all expiries/types)
    //         ? keep the single highest-scoring trade.
    if ((shortTermActive || longTermActive) && !selectedTickerFilter) {

      const score = (t: OptionsFlowData): number => {
        const fq = t.fill_style === 'AA' ? 4 : t.fill_style === 'A' ? 3
          : t.fill_style === 'BB' ? 2 : t.fill_style === 'B' ? 1 : 0
        const voi = t.vol_oi_ratio ?? 0
        return t.total_premium * fq * (voi >= 1.5 ? 1.3 : voi >= 1.0 ? 1.15 : 1.0)
      }

      // Pass 1: one winner per (ticker + expiry + type + fill-group)
      const p1 = new Map<string, OptionsFlowData>()
      for (const t of filtered) {
        const f = t.fill_style ?? ''
        const fg = (f === 'A' || f === 'AA') ? 'buy' : (f === 'B' || f === 'BB') ? 'sell' : f
        const k = `${t.underlying_ticker}||${t.expiry}||${t.type}||${fg}`
        const ex = p1.get(k)
        if (!ex || score(t) > score(ex)) p1.set(k, t)
      }

      // Pass 2: one winner per ticker across all expiries/types
      const p2 = new Map<string, OptionsFlowData>()
      for (const t of p1.values()) {
        const ex = p2.get(t.underlying_ticker)
        if (!ex || score(t) > score(ex)) p2.set(t.underlying_ticker, t)
      }

      filtered = Array.from(p2.values())
    }
    // -- end SweepSense dedup -------------------------------------------------

    // Apply sorting

    filtered.sort((a, b) => {
      // Grade column: 3-mode sort
      if (sortField === 'positioning_grade' || sortField === 'leap_grade') {
        const scoreOf = (t: OptionsFlowData) => {
          const useLeap = (shortTermActive && longTermActive) ? meetsLongTermCriteria(t) : longTermActive
          return useLeap ? calculateLeapGrade(t, comboTradeMap).score : calculatePositioningGrade(t, comboTradeMap).score
        }
        const isLong = (t: OptionsFlowData) => longTermActive && meetsLongTermCriteria(t)
        const isShort = (t: OptionsFlowData) => shortTermActive && meetsShortTermCriteria(t)

        if (gradeColumnMode === 'long_first') {
          // Long-term (cyan) first by score, then short-term (yellow) by score
          const aLong = isLong(a), bLong = isLong(b)
          if (aLong && !bLong) return -1
          if (!aLong && bLong) return 1
          return scoreOf(b) - scoreOf(a)
        }
        // short_first: Short-term (yellow) first by score, then long-term (cyan) by score
        const aShort = isShort(a), bShort = isShort(b)
        if (aShort && !bShort) return -1
        if (!aShort && bShort) return 1
        return scoreOf(b) - scoreOf(a)
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
    typeFilter,
    moneynessFilter,
    expirationStartDate,
    expirationEndDate,
    selectedTickerFilter,
    blacklistedTickers,
    blacklistEnabled,
    selectedOrderSides,
    tradesWithFillStyles,
    shortTermActive,
    longTermActive,
    quickFilters,
    currentPrices,
    currentOptionPrices,
    optionPricesFetching,
    gradeColumnMode,
    isLiveMode,
    dealerZoneCache,
  ])

  // Memoize all grade calculations - massive performance boost for 100+ trades
  // Skip computation entirely while option prices are still loading to avoid N/A flash
  const gradesCache = useMemo(() => {
    const cache = new Map<string, ReturnType<typeof calculatePositioningGrade> | ReturnType<typeof calculateLeapGrade>>()
    // Skip while fetching OR while highlights/leap is on but prices haven't loaded yet
    if (optionPricesFetching) return cache
    if ((shortTermActive || longTermActive) && Object.keys(currentOptionPrices).length === 0) return cache

    filteredAndSortedData.forEach((trade) => {
      const tradeId = `${trade.underlying_ticker}-${trade.strike}-${trade.expiry}-${trade.type}-${trade.trade_timestamp}`
      // SweepSense: grade each trade with the scorer matching its criteria.
      // LEAP-qualified trades ? LEAP grader; EFI-only trades ? EFI grader.
      // When only one mode is active fall back to that mode's grader.
      const useLeapGrader = longTermActive && shortTermActive
        ? meetsLeapCriteria(trade)          // SweepSense: pick per trade
        : longTermActive                         // single mode
      const result = useLeapGrader
        ? calculateLeapGrade(trade, comboTradeMap)
        : calculatePositioningGrade(trade, comboTradeMap)
      cache.set(tradeId, result)
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
    longTermActive,
    historicalStdDevs,
    leap52wkData,
    leapSeasonalData,
    optionPricesFetching,
  ])

  // Helper function to get cached grade

  const getCachedGrade = (trade: OptionsFlowData) => {
    const tradeId = `${trade.underlying_ticker}-${trade.strike}-${trade.expiry}-${trade.type}-${trade.trade_timestamp}`

    const useLeapGrader = longTermActive && shortTermActive
      ? meetsLeapCriteria(trade)
      : longTermActive
    return (
      gradesCache.get(tradeId) ||
      (useLeapGrader
        ? calculateLeapGrade(trade, comboTradeMap)
        : calculatePositioningGrade(trade, comboTradeMap))
    )
  }

  // SweepSense tab's own qualifying-trade pipeline - computed independently of the main
  // table's filteredAndSortedData/shortTermActive/longTermActive (which stay untouched and
  // keep the table showing its original, unfiltered rows). This reuses the EXACT SAME
  // criteria/grade functions (meetsEfiCriteria, meetsLeapCriteria, calculatePositioningGrade,
  // calculateLeapGrade) and the exact same 2-pass dedup algorithm the old SweepSense button
  // used - just run against raw `data` instead of gating the table's own filtering.
  //
  // The full candidate pool (pre-grade-gate) - this MUST be the source for all background
  // enrichment (option prices, dealer zones, IV caches), not the post-gate qualifying list,
  // otherwise a trade that hasn't been priced yet can never pass the gate to get priced in
  // the first place (deadlock -> permanent "settling"/infinite loading).
  const sweepSenseCandidates = useMemo(() => {
    if (!sweepSenseBgActive || !data || data.length === 0) {
      return [] as OptionsFlowData[]
    }
    // Already-expired contracts can never get a live price fetched (fetchCurrentOptionPrices
    // itself excludes them via the same expiry check), so they must never enter the candidate
    // pool at all - otherwise they sit forever in "neverAttempted" and sweepSenseSettling never
    // clears, permanently blocking the tab from committing results.
    const todayStr = new Date().toLocaleDateString('en-CA')
    const notExpired = data.filter((t) => t.expiry >= todayStr)
    const shortOnly = notExpired.filter((t) => meetsEfiCriteria(t))
    const longOnly = notExpired.filter((t) => meetsLeapCriteria(t))
    const combined = notExpired.filter((trade) => meetsEfiCriteria(trade) || meetsLeapCriteria(trade))
    return combined
  }, [sweepSenseBgActive, data])

  // Records the first moment (wall-clock time) each trade was actually observed to have an
  // A-/A/A+ grade, stamped on every grading pass (which reruns on each price poll) - not just
  // when it happens to win the later per-ticker dedup - so it reflects the real moment the
  // trade turned into an A grade rather than merely when a scan/dedup cycle picked it up.
  const sweepSenseQualifiedAtRef = useRef<Map<string, number>>(new Map())

  // Grade gate + dedup, applied ONCE per candidate here and reused as-is by sweepSenseData
  // below (never recalculated a second time) so the gate decision and the displayed grade
  // can never drift apart from each other as other grading inputs keep changing over time.
  const sweepSenseQualifyingData = useMemo(() => {
    if (sweepSenseCandidates.length === 0) {
      return [] as Array<{ trade: OptionsFlowData; grade: string; gradeColor: string; convictionScore: number }>
    }

    let graded: Array<{ trade: OptionsFlowData; grade: string; gradeColor: string; convictionScore: number }> = []
    if (!optionPricesFetching && Object.keys(currentOptionPrices).length > 0) {
      graded = sweepSenseCandidates
        .map((trade) => {
          const useLeap = meetsLongTermCriteria(trade)
          const g = useLeap ? calculateLeapGrade(trade, comboTradeMap) : calculatePositioningGrade(trade, comboTradeMap)
          // LEAP grades are scaled 0-75; normalize both onto a common 0-100 conviction scale.
          const convictionScore = Math.round(useLeap ? (g.score / 75) * 100 : g.score)
          return { trade, grade: g.grade, gradeColor: g.color, convictionScore }
        })
        .filter((t) => ['A-', 'A', 'A+'].includes(t.grade))
      // Stamp the instant each trade is FIRST seen with an A-grade - this runs every time prices
      // are re-polled, so it captures the real moment the trade crossed into A, not just when a
      // later dedup step happened to surface it.
      for (const item of graded) {
        const flowId = generateFlowId(item.trade)
        if (!sweepSenseQualifiedAtRef.current.has(flowId)) {
          sweepSenseQualifiedAtRef.current.set(flowId, Date.now())
        }
      }
    }

    const score = (t: OptionsFlowData): number => {
      const fq = t.fill_style === 'AA' ? 4 : t.fill_style === 'A' ? 3
        : t.fill_style === 'BB' ? 2 : t.fill_style === 'B' ? 1 : 0
      const voi = t.vol_oi_ratio ?? 0
      return t.total_premium * fq * (voi >= 1.5 ? 1.3 : voi >= 1.0 ? 1.15 : 1.0)
    }
    const p1 = new Map<string, { trade: OptionsFlowData; grade: string; gradeColor: string; convictionScore: number }>()
    for (const item of graded) {
      const f = item.trade.fill_style ?? ''
      const fg = (f === 'A' || f === 'AA') ? 'buy' : (f === 'B' || f === 'BB') ? 'sell' : f
      const k = `${item.trade.underlying_ticker}||${item.trade.expiry}||${item.trade.type}||${fg}`
      const ex = p1.get(k)
      if (!ex || score(item.trade) > score(ex.trade)) p1.set(k, item)
    }
    const p2 = new Map<string, { trade: OptionsFlowData; grade: string; gradeColor: string; convictionScore: number }>()
    for (const item of p1.values()) {
      const ex = p2.get(item.trade.underlying_ticker)
      if (!ex || score(item.trade) > score(ex.trade)) p2.set(item.trade.underlying_ticker, item)
    }
    const finalQualifying = Array.from(p2.values())
    return finalQualifying
  }, [sweepSenseCandidates, comboTradeMap, currentOptionPrices, optionPricesFetching])

  // True while any short/long-term candidate has NEVER even had a price fetch attempted yet
  // (a fresh ticker that just entered the candidate pool), or while a fetch is actively
  // in-flight. Once a price has been ATTEMPTED for a ticker, it no longer blocks - Polygon
  // legitimately returns nothing for some contracts on weekends/holidays or if delisted, and
  // waiting on a guaranteed resolved price for every single one would settle forever.
  const sweepSenseSettling = useMemo(() => {
    if (sweepSenseCandidates.length === 0) return false
    if (optionPricesFetching) {
      return true
    }
    const neverAttempted = sweepSenseCandidates.filter((trade) => {
      const expiry = trade.expiry.replace(/-/g, '').slice(2)
      const strikeFormatted = String(Math.round(trade.strike * 1000)).padStart(8, '0')
      const optionType = trade.type.toLowerCase() === 'call' ? 'C' : 'P'
      const normalizedTicker = normalizeTickerForOptions(trade.underlying_ticker)
      const optionTicker = `O:${normalizedTicker}${expiry}${optionType}${strikeFormatted}`
      return !attemptedOptionPriceTickersRef.current.has(optionTicker)
    })
    const missingPriced = sweepSenseCandidates.filter((trade) => {
      const expiry = trade.expiry.replace(/-/g, '').slice(2)
      const strikeFormatted = String(Math.round(trade.strike * 1000)).padStart(8, '0')
      const optionType = trade.type.toLowerCase() === 'call' ? 'C' : 'P'
      const normalizedTicker = normalizeTickerForOptions(trade.underlying_ticker)
      const optionTicker = `O:${normalizedTicker}${expiry}${optionType}${strikeFormatted}`
      return !(optionTicker in currentOptionPrices)
    })
    return neverAttempted.length > 0
  }, [sweepSenseCandidates, currentOptionPrices, optionPricesFetching])

  // `run()` above only ever fetches prices ONCE (guarded by sweepSenseAutoRanRef) for whatever
  // candidates existed at that moment. But sweepSenseCandidates is a live useMemo that keeps
  // recomputing as new trades stream in, so candidates that qualify AFTER that single fetch
  // would never get a price fetch attempted - permanently stuck in "neverAttempted", which
  // means sweepSenseSettling never turns false and the tab never commits new results. This
  // effect tops up the price fetch for exactly those newly-appeared, never-attempted tickers.
  // Must NOT fire while run()'s own initial fetch (modeLoadingStep set) is still in flight -
  // both calls independently flip optionPricesFetching/gradingProgress, and running them
  // concurrently causes one to stomp the other's "fetch finished" state, so grading counts
  // flip-flop and settling never fully quiets down.
  useEffect(() => {
    if (sweepSenseCandidates.length === 0 || optionPricesFetching || modeLoadingStep !== null) return
    const newlyAppeared = sweepSenseCandidates.filter((trade) => {
      const expiry = trade.expiry.replace(/-/g, '').slice(2)
      const strikeFormatted = String(Math.round(trade.strike * 1000)).padStart(8, '0')
      const optionType = trade.type.toLowerCase() === 'call' ? 'C' : 'P'
      const normalizedTicker = normalizeTickerForOptions(trade.underlying_ticker)
      const optionTicker = `O:${normalizedTicker}${expiry}${optionType}${strikeFormatted}`
      return !attemptedOptionPriceTickersRef.current.has(optionTicker)
    })
    if (newlyAppeared.length === 0) return
    fetchCurrentOptionPrices(newlyAppeared)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sweepSenseCandidates, optionPricesFetching, modeLoadingStep])

  // The REAL moment each trade first graded A-/A/A+, reconstructed by replaying minute-by-minute
  // historical stock + option prices since the trade was taken and re-running the exact same
  // grading formula at each point in time - not just whatever moment our own live polling
  // happened to notice it. Keyed by flowId; resolved asynchronously and cached forever once found.
  const [sweepSenseHistoricalQualifiedAt, setSweepSenseHistoricalQualifiedAt] = useState<Record<string, number>>({})
  const sweepSenseHistoricalFetchingRef = useRef<Set<string>>(new Set())

  const fetchHistoricalQualifiedAt = async (trade: OptionsFlowData, comboMap: Map<string, boolean>) => {
    const flowId = generateFlowId(trade)
    if (sweepSenseHistoricalFetchingRef.current.has(flowId)) return
    sweepSenseHistoricalFetchingRef.current.add(flowId)
    try {
      const useLeap = meetsLongTermCriteria(trade)
      const tradeTime = new Date(trade.trade_timestamp)
      const from = tradeTime.toISOString().split('T')[0]
      const to = new Date().toISOString().split('T')[0]

      const expiry = trade.expiry.replace(/-/g, '').slice(2)
      const strikeFormatted = String(Math.round(trade.strike * 1000)).padStart(8, '0')
      const optionType = trade.type.toLowerCase() === 'call' ? 'C' : 'P'
      const normalizedTicker = normalizeTickerForOptions(trade.underlying_ticker)
      const optionTicker = `O:${normalizedTicker}${expiry}${optionType}${strikeFormatted}`

      const [stockRes, optionRes] = await Promise.all([
        fetch(`/api/polygon/v2/aggs/ticker/${trade.underlying_ticker}/range/1/minute/${from}/${to}?adjusted=true&sort=asc&limit=50000&apiKey=${POLYGON_API_KEY}`, { signal: AbortSignal.timeout(15000) }),
        fetch(`/api/polygon/v2/aggs/ticker/${optionTicker}/range/1/minute/${from}/${to}?adjusted=true&sort=asc&limit=50000&apiKey=${POLYGON_API_KEY}`, { signal: AbortSignal.timeout(15000) }),
      ])
      const stockJson = stockRes.ok ? await stockRes.json() : null
      const optionJson = optionRes.ok ? await optionRes.json() : null
      const stockBars: Array<{ t: number; c: number }> = (stockJson?.results || []).filter((b: { t: number }) => b.t >= tradeTime.getTime())
      const optionBars: Array<{ t: number; c: number }> = (optionJson?.results || []).filter((b: { t: number }) => b.t >= tradeTime.getTime())

      if (stockBars.length === 0 && optionBars.length === 0) return

      // Replay a single merged, forward-filled timeline of both series minute-by-minute and
      // re-run the real grading function at each tick, stopping at the first tick that grades
      // A-/A/A+ - that tick IS the real historical moment the trade became an A grade.
      const timestamps = Array.from(new Set([...stockBars.map((b) => b.t), ...optionBars.map((b) => b.t)])).sort((a, b) => a - b)
      let si = 0, oi = 0
      let lastStock = trade.spot_price
      let lastOption = trade.premium_per_contract
      let foundAt: number | null = null

      for (const t of timestamps) {
        while (si < stockBars.length && stockBars[si].t <= t) { lastStock = stockBars[si].c; si++ }
        while (oi < optionBars.length && optionBars[oi].t <= t) { lastOption = optionBars[oi].c; oi++ }

        const g = useLeap
          ? calculateLeapGrade(trade, comboMap, { optionPrice: lastOption, stockPrice: lastStock, asOf: new Date(t) })
          : calculatePositioningGrade(trade, comboMap, { optionPrice: lastOption, stockPrice: lastStock, asOf: new Date(t) })

        if (['A-', 'A', 'A+'].includes(g.grade)) {
          foundAt = t
          break
        }
      }

      if (foundAt !== null) {
        setSweepSenseHistoricalQualifiedAt((prev) => ({ ...prev, [flowId]: foundAt as number }))
      }
    } catch {
      /* silent - falls back to the live-scan timestamp already recorded */
    } finally {
      sweepSenseHistoricalFetchingRef.current.delete(flowId)
    }
  }

  // Kick off the historical replay for every newly-qualifying trade we haven't resolved yet.
  useEffect(() => {
    if (!sweepSenseBgActive || sweepSenseQualifyingData.length === 0) return
    sweepSenseQualifyingData.forEach(({ trade }) => {
      const flowId = generateFlowId(trade)
      if (flowId in sweepSenseHistoricalQualifiedAt) return
      if (sweepSenseHistoricalFetchingRef.current.has(flowId)) return
      fetchHistoricalQualifiedAt(trade, comboTradeMap)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sweepSenseQualifyingData, sweepSenseBgActive, comboTradeMap])

  // SweepSense tab data - built from `sweepSenseQualifyingData` (above) plus the same
  // dealerZoneCache (magnet/pivot) and the exact Plan Entry logic (computePlanEntry) used
  // previously in the Dealer column. Only populated once the background scan has run.
  const sweepSenseData = useMemo(() => {
    if (!sweepSenseBgActive) {
      return null
    }

    // Per-ticker % buy-call/bear-call/buy-put/bear-put - same bull/bear fill_style
    // classification AlgoFlowScreener already uses (isBullish = A/AA/no-fill, isBearish = B/BB),
    // computed from ALL of that ticker's raw flow prints (not reinvented math).
    const tickerPrem = new Map<string, { buyCalls: number; bearCalls: number; buyPuts: number; bearPuts: number }>()
    // Same live in-memory prints, kept per-ticker as a raw strike/type/fill-style list (no extra
    // DB call) - reused by FlowTrackingPanel to correctly classify structural support (put
    // SELLING, B/BB, below spot) vs resistance (call SELLING, B/BB, above spot) and cluster the
    // strike level, so it can never disagree with the quadrant boxes/gauge built from this same `data`.
    const tickerRawTrades = new Map<string, Array<{ strike: number; type: string; fillStyle: string; expiry: string; trade_timestamp: string; tradeSize: number; premium: number; totalPremium: number; spot: number; tradeType: string }>>()
    for (const t of data) {
      const fs = (t.fill_style || '') as string
      const isCall = t.type === 'call'
      const isBullish = !fs || fs === 'N/A' || fs === 'A' || fs === 'AA'
      const isBearish = fs === 'B' || fs === 'BB'
      const entry = tickerPrem.get(t.underlying_ticker) || { buyCalls: 0, bearCalls: 0, buyPuts: 0, bearPuts: 0 }
      if (isCall && isBullish) entry.buyCalls += t.total_premium
      else if (isCall && isBearish) entry.bearCalls += t.total_premium
      else if (!isCall && isBullish) entry.buyPuts += t.total_premium
      else if (!isCall && isBearish) entry.bearPuts += t.total_premium
      tickerPrem.set(t.underlying_ticker, entry)

      const rawList = tickerRawTrades.get(t.underlying_ticker) || []
      rawList.push({
        strike: t.strike,
        type: t.type,
        fillStyle: fs,
        expiry: t.expiry,
        trade_timestamp: t.trade_timestamp,
        tradeSize: t.trade_size,
        premium: t.premium_per_contract,
        totalPremium: t.total_premium,
        spot: t.spot_price,
        tradeType: t.classification || t.trade_type,
      })
      tickerRawTrades.set(t.underlying_ticker, rawList)
    }

    const trades = sweepSenseQualifyingData.map(({ trade, grade, gradeColor, convictionScore }) => {
      // Grade was already computed once (above, in the gate) - reused as-is here so the
      // gate decision and the displayed grade can never disagree with each other.
      const g = { grade, color: gradeColor }
      const zone = dealerZoneCache[trade.underlying_ticker]
      const rawMagnet = zone?.golden ?? null
      const rawPivot = zone?.purple ?? null
      const cur = currentPrices[trade.underlying_ticker]
      const pctMove = trade.spot_price && cur ? ((cur - trade.spot_price) / trade.spot_price) * 100 : null

      const useLongTerm = meetsLongTermCriteria(trade)
      const sigma = useLongTerm
        ? (longTermIVCache[trade.underlying_ticker]?.iv ?? 0)
        : (expiryIVCache[`${trade.underlying_ticker}_${trade.expiry}`] ?? 0)
      const dte = useLongTerm
        ? (longTermIVCache[trade.underlying_ticker]?.dte ?? 45)
        : (trade.days_to_expiry > 0 ? trade.days_to_expiry : 1)
      const spot = cur ?? trade.spot_price

      // Refine the raw dealer-gamma magnet/pivot strikes down to the exact nearby chart level
      // (real swing close, not the raw round strike) using this ticker's daily candle history,
      // restricted to the same 90%-probability BS move band the plan entry itself uses - so the
      // refined level is guaranteed a realistic, tradeable price (e.g. $119.30 instead of a
      // round $120) rather than a level that later gets clamped to an arbitrary band edge.
      const candles = dailyCandleCache[trade.underlying_ticker]
      const band90Call = sigma > 0 ? bsStrikeForProb(spot, sigma, dte, 90, true) : null
      const band90Put = sigma > 0 ? bsStrikeForProb(spot, sigma, dte, 90, false) : null
      const band90Lo = band90Call !== null && band90Put !== null ? Math.min(band90Call, band90Put) : undefined
      const band90Hi = band90Call !== null && band90Put !== null ? Math.max(band90Call, band90Put) : undefined
      const magnet = refinePivotalLevel(candles, rawMagnet, spot, band90Lo, band90Hi) ?? rawMagnet
      const pivot = refinePivotalLevel(candles, rawPivot, spot, band90Lo, band90Hi) ?? rawPivot

      const { sigCode, sigColor, planText } = computePlanEntry({
        spot, magnet, pivot, sigma, dte, type: trade.type, fillStyle: trade.fill_style, grade: g.grade, gradeColor: g.color,
      })

      const bd = tickerPrem.get(trade.underlying_ticker) || { buyCalls: 0, bearCalls: 0, buyPuts: 0, bearPuts: 0 }
      const bdTotal = bd.buyCalls + bd.bearCalls + bd.buyPuts + bd.bearPuts || 1

      // Real moment this trade first graded A-/A/A+, reconstructed from historical minute bars
      // (fetchHistoricalQualifiedAt) - this is the authoritative value. Falls back to the
      // live-scan timestamp while the historical replay is still resolving, and finally to
      // now() only in the unexpected case neither is available yet.
      const flowId = generateFlowId(trade)
      const qualifiedAt = sweepSenseHistoricalQualifiedAt[flowId]
        ?? sweepSenseQualifiedAtRef.current.get(flowId)
        ?? Date.now()

      // Real CONTRACT (option premium) % change - not stock price - same calc as the grade's
      // Contract P&L score: current option price vs entry premium, B/BB (sold to open) flips sign.
      const optExpiry = trade.expiry.replace(/-/g, '').slice(2)
      const optStrikeFormatted = String(Math.round(trade.strike * 1000)).padStart(8, '0')
      const optType = trade.type.toLowerCase() === 'call' ? 'C' : 'P'
      const optTicker = `O:${normalizeTickerForOptions(trade.underlying_ticker)}${optExpiry}${optType}${optStrikeFormatted}`
      const currentOptionPrice = currentOptionPrices[optTicker] ?? null
      let contractPctChange: number | null = null
      if (currentOptionPrice && currentOptionPrice > 0 && trade.premium_per_contract > 0) {
        const rawPct = ((currentOptionPrice - trade.premium_per_contract) / trade.premium_per_contract) * 100
        const isSoldToOpen = trade.fill_style === 'B' || trade.fill_style === 'BB'
        contractPctChange = isSoldToOpen ? -rawPct : rawPct
      }

      return {
        trade,
        grade: g.grade,
        gradeColor: g.color,
        convictionScore,
        pctMove,
        currentStockPrice: cur ?? null,
        currentOptionPrice,
        contractPctChange,
        magnet,
        pivot,
        sigCode,
        sigColor,
        planText,
        qualifiedAt,
        // Same resolved ATM IV / DTE / live spot used to build the entry plan above - reused
        // as-is for Target 1/2 + stop loss so the numbers can never disagree with the plan text.
        sigma,
        dte,
        spot,
        breakdown: {
          buyCallsPct: (bd.buyCalls / bdTotal) * 100,
          bearCallsPct: (bd.bearCalls / bdTotal) * 100,
          buyPutsPct: (bd.buyPuts / bdTotal) * 100,
          bearPutsPct: (bd.bearPuts / bdTotal) * 100,
        },
        // Raw strike/type list for this ticker from the SAME live `data` feed the breakdown
        // above was built from - lets FlowTrackingPanel cluster the structural support/resistance
        // strike level without a separate DB round-trip.
        liveRawTrades: tickerRawTrades.get(trade.underlying_ticker) || [],
      }
    })

    // Aggregate stats + bubble map - built from the SAME tickerPrem numbers used for each
    // card's individual breakdown, just summed across the tickers that actually qualified.
    let buyCalls = 0, bearCalls = 0, buyPuts = 0, bearPuts = 0
    const bubbles = trades.map(({ trade }) => {
      const bd = tickerPrem.get(trade.underlying_ticker) || { buyCalls: 0, bearCalls: 0, buyPuts: 0, bearPuts: 0 }
      buyCalls += bd.buyCalls
      bearCalls += bd.bearCalls
      buyPuts += bd.buyPuts
      bearPuts += bd.bearPuts
      const premium = bd.buyCalls + bd.bearCalls + bd.buyPuts + bd.bearPuts
      const bullPrem = bd.buyCalls + bd.bearPuts
      const bearPrem = bd.bearCalls + bd.buyPuts
      return {
        ticker: trade.underlying_ticker,
        premium,
        bias: bullPrem >= bearPrem ? ('bull' as const) : ('bear' as const),
        biasStrength: Math.abs(bullPrem - bearPrem) / (premium || 1),
      }
    })
    const statsTotal = buyCalls + bearCalls + buyPuts + bearPuts || 1
    const stats = {
      buyCallsPct: (buyCalls / statsTotal) * 100,
      bearCallsPct: (bearCalls / statsTotal) * 100,
      buyPutsPct: (buyPuts / statsTotal) * 100,
      bearPutsPct: (bearPuts / statsTotal) * 100,
    }

    return { trades, stats, bubbles }
  }, [sweepSenseBgActive, sweepSenseQualifyingData, dealerZoneCache, currentPrices, data, expiryIVCache, longTermIVCache, currentOptionPrices, sweepSenseHistoricalQualifiedAt, dailyCandleCache])

  // The tab must only ever show ONE final, settled result - never the churn of intermediate
  // in-progress computations (which flicker as grades/prices/dealer-zones trickle in). We
  // freeze the last-committed result and only replace it with the newly computed `sweepSenseData`
  // once things have gone quiet (no scan in progress, not still settling, and the computed
  // result hasn't changed for a short debounce window).
  const [sweepSenseDataStable, setSweepSenseDataStable] = useState<typeof sweepSenseData>(null)
  useEffect(() => {
    if (modeLoadingStep !== null || sweepSenseSettling) return
    const timer = setTimeout(() => {
      setSweepSenseDataStable(sweepSenseData)
    }, 900)
    return () => clearTimeout(timer)
  }, [sweepSenseData, modeLoadingStep, sweepSenseSettling])

  // When the mobile SweepSense filter button is active, restrict the visible table to ONLY
  // the trades that qualified for the SweepSense tab - everything else is hidden. Turning the
  // button back off restores the normal filteredAndSortedData view untouched.
  const sweepSenseFilteredView = useMemo(() => {
    if (!sweepSenseFilterActive || !sweepSenseDataStable) return filteredAndSortedData
    const idSet = new Set(sweepSenseDataStable.trades.map(({ trade }) => generateFlowId(trade)))
    return filteredAndSortedData.filter((trade) => idSet.has(generateFlowId(trade)))
  }, [sweepSenseFilterActive, sweepSenseDataStable, filteredAndSortedData])

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

    return sweepSenseFilteredView.slice(startIndex, endIndex)
  }, [sweepSenseFilteredView, currentPage, itemsPerPage])

  const totalPages = Math.ceil(sweepSenseFilteredView.length / itemsPerPage)

  // Auto-fetch dealer zones for the SweepSense tab's qualifying trades (short-term + long-term picks)
  // Skip while a scan is in progress - dealer zones fetch after the scan completes
  useEffect(() => {
    if (!sweepSenseBgActive || modeLoadingStep !== null) return
    const notableTrades = sweepSenseCandidates
    // Deduplicate by ticker - one fetch covers ALL expirations for the ticker
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
      // Delegate entirely to the dealer-zones API - same computation as DealerAttraction
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
  }, [sweepSenseCandidates, sweepSenseBgActive, modeLoadingStep])

  // Auto-fetch ~1yr of daily candles per ticker so magnet/pivot can be refined from a raw
  // dealer-gamma strike into the exact nearby chart level (see refinePivotalLevel above).
  useEffect(() => {
    if (!sweepSenseBgActive || modeLoadingStep !== null) return
    const tickers = [...new Set(sweepSenseCandidates.map((t) => t.underlying_ticker))]
    const MAX_RETRIES = 3
    const missing = tickers.filter((t) => {
      if (dailyCandleFetchingRef.current.has(t)) return false
      if (!(t in dailyCandleCache)) return true
      // A previously-failed ticker (cached as null) would otherwise be stuck forever - retry
      // it a bounded number of times instead of permanently skipping it.
      return dailyCandleCache[t] === null && (dailyCandleRetryCountRef.current[t] ?? 0) < MAX_RETRIES
    })
    if (missing.length === 0) return
    const end = new Date().toISOString().split('T')[0]
    const start = new Date(Date.now() - 365 * 86400000).toISOString().split('T')[0]
    missing.forEach((ticker) => dailyCandleFetchingRef.current.add(ticker))
    missing.forEach((ticker) => {
      ; (async () => {
        const url = `/api/polygon/v2/aggs/ticker/${ticker}/range/1/day/${start}/${end}?adjusted=true&sort=asc&limit=400&apiKey=${POLYGON_API_KEY}`
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
            if (res.ok) {
              const json = await res.json()
              const results = Array.isArray(json?.results) ? json.results : []
              const candles = results.map((b: any) => ({ c: b.c, h: b.h, l: b.l }))
              setDailyCandleCache((prev) => ({ ...prev, [ticker]: candles.length > 0 ? candles : null }))
              dailyCandleFetchingRef.current.delete(ticker)
              return
            }
          } catch {
            // transient failure - fall through to retry loop below
          }
        }
        dailyCandleRetryCountRef.current[ticker] = (dailyCandleRetryCountRef.current[ticker] ?? 0) + 1
        setDailyCandleCache((prev) => ({ ...prev, [ticker]: null }))
        dailyCandleFetchingRef.current.delete(ticker)
      })()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sweepSenseCandidates, sweepSenseBgActive, modeLoadingStep, dailyCandleCache])
  // Uses the SAME single-expiry options-chain fetch + ATM-IV averaging as openNotableAnalysis
  // (the options-chain page's logic) — not the multi-expiry aggregate atmIV from dealer-zones.
  useEffect(() => {
    if (!sweepSenseBgActive || modeLoadingStep !== null) return
    const notableTrades = sweepSenseCandidates
    const seenKeys = new Set<string>()
    for (const trade of notableTrades) {
      const key = `${trade.underlying_ticker}_${trade.expiry}`
      if (key in expiryIVCache || seenKeys.has(key)) continue
      seenKeys.add(key)

      fetch(`/api/options-chain?ticker=${trade.underlying_ticker}&expiration=${trade.expiry}`)
        .then((r) => r.json())
        .then((result: any) => {
          if (!result.success || !result.data) return
          const expData = result.data[trade.expiry] || (Object.values(result.data)[0] as any)
          if (!expData) return
          const spot = currentPrices[trade.underlying_ticker] || trade.spot_price
          if (!spot || spot <= 0) return

          const allContracts: Array<{ strike: number; iv: number }> = []
          Object.entries(expData.calls || {}).forEach(([s, d]: [string, any]) => {
            if (d.implied_volatility > 0) allContracts.push({ strike: parseFloat(s), iv: d.implied_volatility })
          })
          Object.entries(expData.puts || {}).forEach(([s, d]: [string, any]) => {
            if (d.implied_volatility > 0) allContracts.push({ strike: parseFloat(s), iv: d.implied_volatility })
          })
          const atmContracts = allContracts.filter(
            (c) => Math.abs((c.strike - spot) / spot) <= 0.05
          )
          if (atmContracts.length === 0) return
          const avgIV = atmContracts.reduce((sum, c) => sum + c.iv, 0) / atmContracts.length

          setExpiryIVCache((prev) => ({ ...prev, [key]: avgIV }))
        })
        .catch(() => { })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sweepSenseCandidates, sweepSenseBgActive, modeLoadingStep, currentPrices])

  // Auto-fetch the 45-day-window ATM IV for LONG-TERM (LEAP) trades' expected-range gate.
  // Long-term picks use the expiry closest to 45 calendar days out - not the trade's own
  // (much farther-dated) expiry - for the Plan Entry / Magnet-Pivot range calculation.
  useEffect(() => {
    if (!sweepSenseBgActive || modeLoadingStep !== null) return
    const longTermTrades = sweepSenseCandidates.filter(meetsLongTermCriteria)
    const seenTickers = new Set<string>()
    for (const trade of longTermTrades) {
      const ticker = trade.underlying_ticker
      if (ticker in longTermIVCache || seenTickers.has(ticker)) continue
      seenTickers.add(ticker)

      fetch(`/api/options-chain?ticker=${ticker}`)
        .then((r) => r.json())
        .then((result: any) => {
          if (!result.success || !result.data) return
          const spot = currentPrices[ticker] || trade.spot_price
          if (!spot || spot <= 0) return

          const today = new Date()
          const expiries = Object.keys(result.data)
          if (expiries.length === 0) return

          // Pick the expiry whose day-count is closest to 45 calendar days out
          let bestExpiry = expiries[0]
          let bestDiff = Infinity
          let bestDte = 45
          for (const exp of expiries) {
            const expDate = new Date(exp + 'T16:00:00')
            const dte = Math.max(1, Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)))
            const diff = Math.abs(dte - 45)
            if (diff < bestDiff) { bestDiff = diff; bestExpiry = exp; bestDte = dte }
          }

          const expData = result.data[bestExpiry]
          if (!expData) return

          const allContracts: Array<{ strike: number; iv: number }> = []
          Object.entries(expData.calls || {}).forEach(([s, d]: [string, any]) => {
            if (d.implied_volatility > 0) allContracts.push({ strike: parseFloat(s), iv: d.implied_volatility })
          })
          Object.entries(expData.puts || {}).forEach(([s, d]: [string, any]) => {
            if (d.implied_volatility > 0) allContracts.push({ strike: parseFloat(s), iv: d.implied_volatility })
          })
          const atmContracts = allContracts.filter((c) => Math.abs((c.strike - spot) / spot) <= 0.05)
          if (atmContracts.length === 0) return
          const avgIV = atmContracts.reduce((sum, c) => sum + c.iv, 0) / atmContracts.length

          setLongTermIVCache((prev) => ({ ...prev, [ticker]: { iv: avgIV, dte: bestDte } }))
        })
        .catch(() => { })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sweepSenseCandidates, sweepSenseBgActive, modeLoadingStep, currentPrices])

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
    typeFilter,
    moneynessFilter,
    expirationStartDate,
    expirationEndDate,
    selectedTickerFilter,
    blacklistedTickers,
    selectedOrderSides,
  ])

  // Fetch current option prices for the SweepSense tab's candidate pool (pre-grade-gate).
  // The initial fetch happens inside the auto-scan effect (after RS+52wk+seasonal); this just
  // keeps prices refreshed as new candidates enter the pool - MUST cover the full candidate
  // pool (not just already-qualifying trades), otherwise a trade missing its price can never
  // pass the grade gate to get priced in the first place.
  useEffect(() => {
    if (sweepSenseBgActive && sweepSenseCandidates.length > 0) {
      if (modeLoadingStep !== null) return
      const datasetHash = `SS-${sweepSenseCandidates.length}-${sweepSenseCandidates
        .slice(0, 5)
        .map((d) => d.underlying_ticker)
        .join('-')}`
      if (datasetHash !== pricesFetchedForDataset) {
        fetchCurrentOptionPrices(sweepSenseCandidates)
        setPricesFetchedForDataset(datasetHash)
      }
    }
  }, [sweepSenseBgActive, sweepSenseCandidates])

  // Fetch chart data for tracked flows when EFI is active or flows are added

  // Use useRef to track previous flows length to avoid unnecessary re-renders

  const prevTrackedFlowsLength = React.useRef(trackedFlows.length)

  // Ref for screenshot capture
  const captureRef = useRef<HTMLDivElement>(null)

  // Ref for the fixed Premium Control Bar
  const controlBarRef = useRef<HTMLDivElement>(null)

  // Dynamic shim height = nav height + control bar height, kept in sync via ResizeObserver
  const [mobileShimHeight, setMobileShimHeight] = useState(120)

  useLayoutEffect(() => {
    if (!isMobileView) return
    const cb = controlBarRef.current
    if (!cb) return

    const recalc = () => {
      const cbBottom = cb.getBoundingClientRect().bottom
      const containerTop = captureRef.current?.getBoundingClientRect().top ?? 0
      setMobileShimHeight(Math.ceil(cbBottom - containerTop))
    }

    recalc()
    const ro = new ResizeObserver(recalc)
    ro.observe(cb)
    const nav = document.querySelector('nav') as HTMLElement | null
    if (nav) ro.observe(nav)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobileView])

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
        console.log('[FlowTracking] expired flows removed - saved', activeFlows.length, 'flows to localStorage')

        setTrackedFlows(activeFlows)

        return // Exit early, the state update will trigger this effect again
      }

      // Only fetch if flows were added (length increased) or EFI is active

      if (shortTermActive || trackedFlows.length > prevTrackedFlowsLength.current) {
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
  }, [trackedFlows.length, shortTermActive])

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

    if (tradeType === 'SUPER SWEEP') {
      return {
        className: base,
        style: {
          ...glossyBlack,
          color: '#FFD700',
          border: '1px solid #FFD700',
          boxShadow: `${glossyOverlay}, 0 0 8px rgba(255,215,0,0.6)`,
          borderRadius: '9999px',
          letterSpacing: '0.05em',
          fontWeight: 900,
        },
      }
    }

    if (tradeType === 'SUPER BLOCK') {
      return {
        className: base,
        style: {
          ...glossyBlack,
          color: '#00e5ff',
          border: '1px solid #00e5ff',
          boxShadow: `${glossyOverlay}, 0 0 8px rgba(0,229,255,0.6)`,
          borderRadius: '9999px',
          letterSpacing: '0.05em',
          fontWeight: 900,
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

  // Compact toolbar sizing for tablet + mobile - applied directly to inline styles
  const tbH = isTabletView ? '26px' : isMobileView ? '22px' : undefined
  const tbHn = isTabletView ? '26px' : isMobileView ? '22px' : undefined   // numeric-safe alias
  const tbPad = isTabletView ? '0 8px' : isMobileView ? '0 6px' : undefined
  const tbFs = isTabletView ? '10px' : isMobileView ? '9px' : undefined
  const tbLs = isTabletView ? '0.7px' : isMobileView ? '0.4px' : undefined

  return (
    <div ref={rootRef} style={{ display: 'flex', width: '100%', alignItems: 'flex-start' }}>

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
              top: isMobileView ? '130px' : isTabletView ? '110px' : '224px',
              maxWidth: isTabletView ? 'min(94vw, 820px)' : undefined,
              maxHeight: isTabletView ? '82vh' : undefined,
              width: isTabletView ? 'min(94vw, 820px)' : undefined,
              background: isMobileView ? '#000000' : '#000',
              border: isMobileView
                ? '1px solid rgba(255,255,255,0.1)'
                : '1px solid #4b5563',
              borderRadius: isMobileView ? '16px' : '8px',
              padding: isTabletView ? '12px' : isMobileView ? '16px' : '16px',
              boxShadow: isMobileView
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
                      fontSize: isTabletView ? '16px' : undefined,
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
                <OptionsFlowMobileFilterPanel
                  selectedOptionTypes={selectedOptionTypes}
                  setSelectedOptionTypes={setSelectedOptionTypes}
                  selectedOrderSides={selectedOrderSides}
                  setSelectedOrderSides={setSelectedOrderSides}
                  selectedUniqueFilters={selectedUniqueFilters}
                  setSelectedUniqueFilters={setSelectedUniqueFilters}
                  typeFilter={typeFilter}
                  setTypeFilter={setTypeFilter}
                  selectedPremiumFilters={selectedPremiumFilters}
                  setSelectedPremiumFilters={setSelectedPremiumFilters}
                  customMinPremium={customMinPremium}
                  setCustomMinPremium={setCustomMinPremium}
                  customMaxPremium={customMaxPremium}
                  setCustomMaxPremium={setCustomMaxPremium}
                  selectedTickerFilters={selectedTickerFilters}
                  setSelectedTickerFilters={setSelectedTickerFilters}
                  blacklistEnabled={blacklistEnabled}
                  setBlacklistEnabled={setBlacklistEnabled}
                  blacklistedTickers={blacklistedTickers}
                  setBlacklistedTickers={setBlacklistedTickers}
                  expirationStartDate={expirationStartDate}
                  setExpirationStartDate={setExpirationStartDate}
                  expirationEndDate={expirationEndDate}
                  setExpirationEndDate={setExpirationEndDate}
                />
              )}


              {/* Desktop: Redesigned Layout */}

              {!isMobileView && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: isTabletView ? '8px' : '12px',
                    padding: '0 4px',
                  }}
                >
                  {isTabletView && (
                    <style>{`
                      .filter-dialog .filter-dialog-content span,
                      .filter-dialog .filter-dialog-content label,
                      .filter-dialog .filter-dialog-content div[style] {
                        font-size: 11px !important;
                      }
                      .filter-dialog .filter-dialog-content button {
                        font-size: 11px !important;
                        padding: 5px 8px !important;
                        min-height: 28px !important;
                      }
                      .filter-dialog .filter-dialog-content input {
                        font-size: 11px !important;
                        height: 28px !important;
                        padding: 4px 8px !important;
                      }
                      .filter-dialog .filter-dialog-content > div > div {
                        padding: 10px !important;
                        border-radius: 8px !important;
                      }
                    `}</style>
                  )}
                  {/* Row 1: Options Type | Premium | Ticker Filter */}
                  <div
                    style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: isTabletView ? '8px' : '12px' }}
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
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                            {[
                              { label: 'BUY A', value: 'buy_a', color: '#22d3ee', glow: 'rgba(34,211,238,0.25)' },
                              { label: 'BUY AA', value: 'buy_aa', color: '#22d3ee', glow: 'rgba(34,211,238,0.25)' },
                              { label: 'SELL B', value: 'sell_b', color: '#f97316', glow: 'rgba(249,115,22,0.25)' },
                              { label: 'SELL BB', value: 'sell_bb', color: '#f97316', glow: 'rgba(249,115,22,0.25)' },
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
                                    gap: '6px',
                                    padding: '9px 8px',
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
                                      fontSize: '12px',
                                      fontWeight: 800,
                                      letterSpacing: '0.5px',
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
                            { label: 'ITM', value: 'ITM', isType: false },
                            { label: 'OTM', value: 'OTM', isType: false },
                            { label: 'Sweep Only', value: 'SWEEP', isType: true },
                            { label: 'Block Only', value: 'BLOCK', isType: true },
                            { label: 'Multi-Leg', value: 'MULTI-LEG', isType: true },
                            { label: 'Mini Only', value: 'MINI', isType: true },
                          ].map(({ label, value, isType }) => {
                            const active = isType ? typeFilter.includes(value) : moneynessFilter.includes(value)
                            return (
                              <button key={value}
                                onClick={() => {
                                  if (isType) setTypeFilter((prev) => prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value])
                                  else setMoneynessFilter((prev) => prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value])
                                }}
                                style={{ padding: '7px 8px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.07)', background: '#000', cursor: 'pointer', fontSize: '13px', fontWeight: 800, color: active ? '#ff8500' : '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'color 0.15s ease' }}
                              >{label}</button>
                            )
                          })}
                        </div>
                        {/* Sector filters - full-width single-column rows */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                          {[
                            { label: 'Growth  XLK - XLY - XLC - ARKK', value: 'GROWTH_ONLY' },
                            { label: 'Value  XLI - XLF - XLB', value: 'VALUE_ONLY' },
                            { label: 'Defensives  XLV - XLRE - XLP - XLU', value: 'DEFENSIVES_ONLY' },
                          ].map(({ label, value }) => {
                            const sectorActive = selectedUniqueFilters.includes(value)
                            return (
                              <button key={value}
                                onClick={() => setSelectedUniqueFilters((prev) => sectorActive ? prev.filter((f) => f !== value) : [...prev, value])}
                                style={{ padding: '7px 8px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.07)', background: '#000', cursor: 'pointer', fontSize: '12px', fontWeight: 800, color: sectorActive ? '#ff8500' : '#ffffff', width: '100%', textAlign: 'center' as const, transition: 'color 0.15s ease' }}
                              >{label}</button>
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
                            { label: 'Price < $0.40', value: 'contract_lt_040' },
                            { label: 'Price < $5', value: 'contract_lt_5' },
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
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
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
                                padding: '7px 4px',
                                textAlign: 'center',
                                background: '#000',
                                border: '1px solid rgba(239,68,68,0.3)',
                                borderRadius: '8px',
                                color: '#fca5a5',
                                fontSize: '12px',
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
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                          {/* Column headers */}
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 72px 72px', gap: '4px', marginBottom: '4px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '1.5px', textTransform: 'uppercase' as const }}>Group</span>
                            <span style={{ fontSize: '11px', fontWeight: 700, color: '#22c55e', letterSpacing: '1.5px', textTransform: 'uppercase' as const, textAlign: 'center' as const }}>Include</span>
                            <span style={{ fontSize: '11px', fontWeight: 700, color: '#ef4444', letterSpacing: '1.5px', textTransform: 'uppercase' as const, textAlign: 'center' as const }}>Exclude</span>
                          </div>
                          {[
                            { label: 'ETF Only', inc: 'ETF_ONLY', exc: 'EXCLUDE_ETF' },
                            { label: 'Stocks Only', inc: 'STOCK_ONLY', exc: null },
                            { label: 'Mag 7 Only', inc: 'MAG7_ONLY', exc: 'EXCLUDE_MAG7' },
                            { label: 'Excl. Futures', inc: null, exc: 'EXCLUDE_FUTURES' },
                            { label: 'Overblown', inc: 'OVERBLOWN_TICKERS', exc: null },
                          ].map(({ label, inc, exc }) => {
                            const incActive = inc ? selectedTickerFilters.includes(inc) : false
                            const excActive = exc ? selectedTickerFilters.includes(exc) : false
                            const toggle = (val: string, current: boolean) =>
                              setSelectedTickerFilters((prev) =>
                                current
                                  ? prev.filter((f) => f !== val)
                                  : [...prev.filter((f) => f !== (val === inc ? exc ?? '' : inc ?? '')), val]
                              )
                            return (
                              <div key={label} style={{ display: 'grid', gridTemplateColumns: '1fr 72px 72px', gap: '4px', alignItems: 'center' }}>
                                <span style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff', letterSpacing: '0.3px' }}>{label}</span>
                                <button
                                  onClick={() => inc && toggle(inc, incActive)}
                                  disabled={!inc}
                                  style={{ padding: '7px 0', borderRadius: '7px', border: `1px solid ${incActive ? '#22c55e' : 'rgba(255,255,255,0.07)'}`, background: incActive ? 'rgba(34,197,94,0.14)' : 'rgba(255,255,255,0.02)', boxShadow: incActive ? '0 0 8px rgba(34,197,94,0.25)' : 'none', cursor: inc ? 'pointer' : 'not-allowed', opacity: inc ? 1 : 0.2, fontSize: '12px', fontWeight: 800, color: incActive ? '#22c55e' : 'rgba(255,255,255,0.3)', textAlign: 'center' as const, transition: 'all 0.15s ease' }}
                                >{incActive ? '? YES' : 'YES'}</button>
                                <button
                                  onClick={() => exc && toggle(exc, excActive)}
                                  disabled={!exc}
                                  style={{ padding: '7px 0', borderRadius: '7px', border: `1px solid ${excActive ? '#ef4444' : 'rgba(255,255,255,0.07)'}`, background: excActive ? 'rgba(239,68,68,0.14)' : 'rgba(255,255,255,0.02)', boxShadow: excActive ? '0 0 8px rgba(239,68,68,0.25)' : 'none', cursor: exc ? 'pointer' : 'not-allowed', opacity: exc ? 1 : 0.2, fontSize: '12px', fontWeight: 800, color: excActive ? '#ef4444' : 'rgba(255,255,255,0.3)', textAlign: 'center' as const, transition: 'all 0.15s ease' }}
                                >{excActive ? '? NO' : 'NO'}</button>
                              </div>
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
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <DateRangePicker
                            startDate={expirationStartDate}
                            endDate={expirationEndDate}
                            onStartChange={setExpirationStartDate}
                            onEndChange={setExpirationEndDate}
                          />
                          {[
                            { key: 'WEEKLY_ONLY', label: 'Weekly Expiry' },
                            { key: 'MONTHLY_ONLY', label: 'Monthly Expiry' },
                            { key: 'QUAD_WITCHING', label: 'Quad Witching' },
                            { key: 'ZERO_DTE', label: '0DTE Expiry' },
                          ].map(({ key, label }) => {
                            const active = selectedUniqueFilters.includes(key)
                            return (
                              <button key={key} onClick={() => setSelectedUniqueFilters((prev) => active ? prev.filter((f) => f !== key) : [...prev, key])}
                                style={{ width: '100%', padding: '9px 10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.07)', background: '#000', cursor: 'pointer', fontSize: '13px', fontWeight: 800, color: active ? '#ff8500' : '#ffffff', textAlign: 'center' as const, transition: 'color 0.15s ease' }}>
                                {label}
                              </button>
                            )
                          })}
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
                    setBlacklistedTickers(['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''])
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
                    background: 'linear-gradient(180deg, #1c1c1c 0%, #0a0a0a 60%, #040404 100%)',
                    border: '1px solid rgba(255,133,0,0.45)',
                    borderTop: '1px solid rgba(255,133,0,0.7)',
                    borderRadius: '10px',
                    color: '#ff8500',
                    fontSize: '16px',
                    fontWeight: 800,
                    letterSpacing: '1.5px',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    boxShadow: 'inset 0 1px 0 rgba(255,133,0,0.15), inset 0 -1px 0 rgba(0,0,0,0.7)',
                    transition: 'color 0.15s ease',
                  }}
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
              {/* Close -  pinned to right */}
              <button
                onClick={() => setIsHistoryDialogOpen(false)}
                style={{
                  position: 'absolute',
                  right: '14px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  color: '#888',
                  fontSize: '26px',
                  fontWeight: 300,
                  lineHeight: 1,
                  padding: '0 4px',
                  cursor: 'pointer',
                  transition: 'color 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#888')}
                aria-label="Close"
              >
                &times;
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
                    const tradingDate = new Date(yr, mo - 1, dy) // local midnight - no shift
                    const dateLabel = tradingDate.toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      timeZone: 'America/Los_Angeles',
                    })
                    // Time label from createdAt in PST/PDT
                    const savedAt = new Date(flow.createdAt ?? flow.date)
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
                        className="flow-hist-card"
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
                            className="flow-hist-date-label"
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
                          <div className="flow-hist-meta-row" style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                            <span
                              className="flow-hist-trades"
                              style={{
                                color: '#ff6600',
                                fontSize: '15px',
                                fontWeight: 700,
                                letterSpacing: '1px',
                              }}
                            >
                              {tradeCount != null
                                ? `${tradeCount.toLocaleString()} TRADES`
                                : '- TRADES'}
                            </span>
                          </div>
                        </div>

                        {/* Right: actions */}
                        <div className="flow-hist-actions" style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                          <button
                            onClick={() => handleDownloadFlowExcel(flow.date, dateLabel)}
                            title="Download as Excel"
                            className="flow-hist-btn"
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
                            className="flow-hist-btn"
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
                            className="flow-hist-btn"
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
          height: showFlowTrackingInline ? 'auto' : isSidebarPanel ? 'auto' : (isMobileView ? 'calc(100dvh - 60px)' : 'calc(100vh - 119px)'),
          minHeight: showFlowTrackingInline ? 'auto' : undefined,
          overflow: showFlowTrackingInline ? undefined : isSidebarPanel ? 'visible' : 'hidden',

          width: isSidebarPanel ? '100%' : (isMobileView || !showFlowSidebar) ? '100%' : '74%',

          marginRight: isSidebarPanel || isMobileView || !showFlowSidebar ? '0' : '38%',

          marginTop: '0',

          display: showFlowTrackingInline ? 'none' : undefined,
        }}
      >
        {/* Premium Control Bar */}

        <div
          ref={controlBarRef}
          className="bg-black border-b border-gray-700 flex-shrink-0"
          style={{
            position: isSidebarPanel ? 'sticky' : 'fixed',
            top: isSidebarPanel ? 0 : (isMobileView ? '0px' : '119px'),
            left: 0,
            right: 0,
            zIndex: isSidebarPanel ? 10 : 999,
            width: '100%',
            overflow: 'visible',
            marginTop: 0,
          }}
        >
          {/* Mobile Layout - 2 Rows */}

          <div className="md:hidden px-4 py-0">
            {/* Row 1: Search, Highlights, Clear, Filter, Track */}

            <div className="flex items-center gap-px">
              {/* Search Bar */}

              <div
                className="relative"
                style={{
                  width: shortTermActive ? '59px' : '99px',
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
                    if (e.key === 'Enter') {
                      const ticker = inputTicker.trim()
                      setSelectedTickerFilter(ticker)
                      onTickerChange(ticker)
                      onRefresh?.(ticker)
                      console.log('[TickerScan] mobile Enter pressed - ticker:', ticker, '| historicalDays:', historicalDays)
                    }
                    if (e.key === 'Escape') {
                      setInputTicker('')
                      setSelectedTickerFilter('')
                    }
                  }}
                  placeholder="TICKER"
                  className="text-white font-mono placeholder-gray-500 transition-all duration-200 w-full"
                  style={{
                    height: '40px',
                    paddingLeft: '2rem',
                    paddingRight: inputTicker ? '1.5rem' : '0.5rem',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: '700',
                    letterSpacing: '1px',
                    background: 'linear-gradient(180deg, #000000 0%, #0a0a0a 100%)',
                    border: inputTicker ? '2px solid #f59e0b' : '2px solid #1f1f1f',
                    textTransform: 'uppercase',
                    boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.9)',
                    outline: 'none',
                  }}
                  maxLength={20}
                />
                {inputTicker && (
                  <button
                    onClick={() => {
                      setInputTicker('')
                      onTickerChange('')
                      onRefresh?.('')
                    }}
                    style={{
                      position: 'absolute',
                      right: '6px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: '#f59e0b',
                      fontSize: '14px',
                      lineHeight: 1,
                      padding: '2px',
                    }}
                    title="Clear ticker filter"
                  >×</button>
                )}
              </div>

              {/* Right side buttons - order: PICKS, ALGO, TRACK, FILTER, ? */}

              <div className="flex items-center gap-px">
                {/* SweepSense Button removed - scan now runs automatically once flow data loads */}

                {/* Notable Button removed - SweepSense activates it automatically */}

                {/* SweepSense Button (mobile) - opens the full SweepSense card view
                    used on desktop (FlowTrackingPanel's SweepSenseTab, mobile-responsive). */}
                <button
                  onClick={() => {
                    setMobileFlowInitialTab('SWEEPSENSE')
                    setIsFlowTrackingOpen(true)
                  }}
                  className="px-2 font-black uppercase transition-all duration-200 flex items-center gap-1 focus:outline-none"
                  style={{
                    height: '40px',
                    background: isFlowTrackingOpen && mobileFlowInitialTab === 'SWEEPSENSE'
                      ? '#16a34a'
                      : 'linear-gradient(180deg, #1a1a1a 0%, #000000 100%)',
                    border: isFlowTrackingOpen && mobileFlowInitialTab === 'SWEEPSENSE' ? '2px solid #16a34a' : '2px solid #2a2a2a',
                    borderRadius: '4px',
                    fontSize: '10px',
                    letterSpacing: '0.5px',
                    fontWeight: '900',
                    color: isFlowTrackingOpen && mobileFlowInitialTab === 'SWEEPSENSE' ? '#000000' : '#16a34a',
                    boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.9)',
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 12h4l3 8 4-16 3 8h4" />
                  </svg>
                  <span>SweepSense</span>
                </button>

                {/* Algo Flow Button */}
                {onAlgoFlowClick && (
                  <button
                    onClick={onAlgoFlowClick}
                    className="px-2 font-black uppercase transition-all duration-200 flex items-center gap-1 focus:outline-none"
                    style={{
                      height: '40px',
                      background: 'linear-gradient(180deg, #1a1a1a 0%, #000000 100%)',
                      border: '2px solid #2a2a2a',
                      borderRadius: '4px',
                      fontSize: '10px',
                      letterSpacing: '0.5px',
                      fontWeight: '900',
                      color: '#ffaa55',
                      boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.9)',
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                    </svg>
                    <span>AlgoFlow</span>
                  </button>
                )}

                {/* A+ Tracker Button (mobile) - opens FlowTrackingPanel's TRACKER tab */}
                <button
                  onClick={() => {
                    setMobileFlowInitialTab('TRACKER')
                    setIsFlowTrackingOpen(true)
                  }}
                  className="px-2 text-white font-black uppercase transition-all duration-200 flex items-center gap-1 focus:outline-none"
                  style={{
                    height: '40px',
                    background: isFlowTrackingOpen && mobileFlowInitialTab === 'TRACKER'
                      ? 'linear-gradient(180deg, #10b981 0%, #059669 100%)'
                      : 'linear-gradient(180deg, #1a1a1a 0%, #000000 100%)',
                    border: isFlowTrackingOpen && mobileFlowInitialTab === 'TRACKER' ? '2px solid #10b981' : '2px solid #2a2a2a',
                    borderRadius: '4px',
                    fontSize: '10px',
                    letterSpacing: '0.5px',
                    fontWeight: '900',
                    boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.9)',
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={isFlowTrackingOpen && mobileFlowInitialTab === 'TRACKER' ? '#000' : '#10b981'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  <span>A+ Tracker</span>
                </button>

                {/* Filter Button - icon only on mobile */}
                <button
                  onClick={() => setIsFilterDialogOpen(true)}
                  className="px-2 text-white font-black uppercase transition-all duration-200 flex items-center justify-center focus:outline-none"
                  style={{
                    height: '40px',
                    background: 'linear-gradient(180deg, #1a1a1a 0%, #000000 100%)',
                    border: '2px solid #2a2a2a',
                    borderRadius: '4px',
                    boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.9)',
                  }}
                  title="Filter"
                >
                  <svg width="14" height="14" fill="none" stroke="#ff8500" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                </button>

                {/* Mobile Dropdown Menu - see OptionsFlowMobileMenu.tsx */}
                <OptionsFlowMobileMenu
                  variant="fixed"
                  loading={loading}
                  savingFlow={savingFlow}
                  loadingHistory={loadingHistory}
                  data={data}
                  onSave={handleSaveFlow}
                  onHistory={loadFlowHistory}
                  onClear={onClearData}
                />

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
                      ? 'Saving...'
                      : saveStatus === 'success'
                        ? 'Saved'
                        : saveStatus === 'error'
                          ? 'Error'
                          : 'Save'}
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

                  <span>{loadingHistory ? 'Loading...' : 'Historical'}</span>
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
                    <svg width="13" height="13" fill="none" stroke="#ff8500" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
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
                      if (e.key === 'Enter') {
                        const ticker = inputTicker.trim()
                        setSelectedTickerFilter(ticker)
                        onTickerChange(ticker)
                        onRefresh?.(ticker)
                        setIsInputFocused(false)
                        console.log('[TickerScan] desktop Enter pressed - ticker:', ticker, '| historicalDays:', historicalDays)
                      }
                      if (e.key === 'Escape') {
                        setInputTicker('')
                        setSelectedTickerFilter('')
                        setIsInputFocused(false)
                      }
                    }}
                    onBlur={(e) => {
                      setIsInputFocused(false)
                      e.target.style.borderColor = inputTicker ? '#f59e0b' : '#2a2a2a'
                      e.target.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.05), inset 0 -1px 0 rgba(0,0,0,0.4)'
                    }}
                    placeholder="TICKER"
                    className="text-white font-mono placeholder-gray-600"
                    style={{
                      width: '100%',
                      height: '34px',
                      paddingLeft: '2.1rem',
                      paddingRight: inputTicker ? '1.6rem' : '0.75rem',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: '700',
                      letterSpacing: '1.5px',
                      background: 'linear-gradient(180deg, #1c1c1c 0%, #0e0e0e 100%)',
                      border: inputTicker ? '1px solid #f59e0b' : '1px solid #2a2a2a',
                      textTransform: 'uppercase',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.5), 0 2px 4px rgba(0,0,0,0.5)',
                      outline: 'none',
                      transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
                    }}
                    maxLength={20}
                  />
                  {inputTicker && (
                    <button
                      onClick={() => {
                        setInputTicker('')
                        setSelectedTickerFilter('')
                      }}
                      style={{
                        position: 'absolute',
                        right: '6px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#f59e0b',
                        fontSize: '13px',
                        lineHeight: 1,
                        padding: '2px',
                        zIndex: 20,
                      }}
                      title="Clear ticker filter"
                    >×</button>
                  )}

                  {/* Scan quick-pick dropdown arrow */}
                  {!inputTicker && (
                    <button
                      onClick={() => setShowScanDropdown(v => !v)}
                      style={{
                        position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: '#555', fontSize: '10px', lineHeight: 1, padding: '2px', zIndex: 20,
                      }}
                      title="Quick scan"
                    >▾</button>
                  )}

                  {/* Scan dropdown */}
                  {showScanDropdown && (
                    <>
                      <div onClick={() => setShowScanDropdown(false)} style={{ position: 'fixed', inset: 0, zIndex: 9998 }} />
                      <div style={{
                        position: 'absolute', top: 'calc(100% + 4px)', left: 0,
                        zIndex: 9999, minWidth: '150px',
                        background: '#0e0e0e', border: '1px solid rgba(255,133,0,0.45)',
                        borderRadius: '8px', overflow: 'hidden',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.9)',
                      }}>
                        {[
                          { label: 'Scan All', value: 'ALL' },
                          { label: 'Scan MAG7', value: 'MAG7' },
                          { label: 'Scan ETF', value: 'ETF' },
                        ].map(opt => (
                          <button
                            key={opt.value}
                            onClick={() => {
                              setShowScanDropdown(false)
                              if (loading) { onCancel?.(); return }
                              setInputTicker(opt.value)
                              onTickerChange(opt.value)
                              onRefresh?.(opt.value)
                            }}
                            style={{
                              display: 'block', width: '100%', textAlign: 'left',
                              padding: '9px 14px', background: 'none', border: 'none',
                              color: inputTicker === opt.value ? '#ff8500' : '#ccc',
                              fontWeight: 700, fontSize: '11px', letterSpacing: '1px',
                              fontFamily: 'monospace', cursor: 'pointer',
                              borderBottom: '1px solid rgba(255,255,255,0.06)',
                              textTransform: 'uppercase',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,133,0,0.1)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Date range calendar picker */}
                {!isLiveMode && onHistoricalDaysChange && (() => {
                  const today = new Date().toISOString().split('T')[0]
                  const isRange = historicalDays?.startsWith('range:')
                  const parts = isRange ? historicalDays.slice(6).split(':') : []
                  const rangeStart = parts[0] || ''
                  const rangeEnd = parts[1] || ''
                  const displayLabel = isRange && rangeStart && rangeEnd
                    ? rangeStart === rangeEnd ? rangeStart : `${rangeStart} → ${rangeEnd}`
                    : calPickStart ? `${calPickStart} → ...` : 'SELECT DATES'

                  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
                  const firstDow = new Date(calYear, calMonth, 1).getDay()
                  const pad = (n: number) => String(n).padStart(2, '0')
                  const toDs = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`
                  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

                  // Highlight helpers - use calPickStart during selection, rangeStart/End when committed
                  const effStart = calPickStart || rangeStart
                  const effEnd = calPickStart ? (calHover || calPickStart) : rangeEnd
                  const isInRange = (ds: string) => { if (!effStart || !effEnd) return false; const s = effStart < effEnd ? effStart : effEnd; const e = effStart < effEnd ? effEnd : effStart; return ds >= s && ds <= e }
                  const isEdge = (ds: string) => ds === effStart || ds === effEnd

                  const handleDayClick = (ds: string) => {
                    if (!calPickStart) {
                      // First click - set start, wait for end
                      setCalPickStart(ds)
                      setCalHover(ds)
                    } else {
                      // Second click - commit range
                      const s = ds < calPickStart ? ds : calPickStart
                      const e = ds < calPickStart ? calPickStart : ds
                      onHistoricalDaysChange(`range:${s}:${e}`)
                      setCalPickStart(null)
                      setCalHover(null)
                      setCalOpen(false)
                    }
                  }

                  return (
                    <div style={{ position: 'relative' }}>
                      <button
                        ref={calBtnRef}
                        onClick={() => {
                          const rect = calBtnRef.current?.getBoundingClientRect()
                          if (rect) {
                            const popupW = 438
                            // Align right edge of popup with right edge of button, then clamp to viewport
                            const left = Math.max(8, Math.min(rect.right - popupW, window.innerWidth - popupW - 8))
                            setCalRect({ top: rect.bottom + 4, left })
                          }
                          setCalOpen(v => !v)
                        }}
                        className="toolbar-pill"
                        style={{
                          height: tbH || 31, padding: tbPad || '0 10px',
                          background: isRange ? '#0a0500' : '#000',
                          border: `1px solid ${isRange || calPickStart ? 'rgba(255,133,0,0.65)' : '#2a2a2a'}`,
                          color: isRange || calPickStart ? '#ff8500' : '#555',
                          fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
                          borderRadius: 5, outline: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                          fontFamily: 'JetBrains Mono, monospace',
                        }}
                      >{displayLabel} ▾</button>

                      {calOpen && calRect && (
                        <div
                          style={{
                            position: 'fixed',
                            top: calRect.left !== undefined ? calRect.top : 0,
                            left: calRect.left,
                            zIndex: 99999,
                            background: '#0a0a0a', border: '1px solid rgba(255,133,0,0.45)',
                            borderRadius: 15, padding: 24, width: 438,
                            boxShadow: '0 12px 48px rgba(0,0,0,0.9)',
                          }}
                          onMouseLeave={() => calPickStart && setCalHover(calPickStart)}
                        >
                          {/* Month nav */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15 }}>
                            <button onClick={() => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1) } else setCalMonth(m => m - 1) }}
                              style={{ background: 'none', border: 'none', color: '#ff8500', cursor: 'pointer', fontSize: 27, padding: '0 9px', lineHeight: 1 }}>-</button>
                            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 19, fontWeight: 800, color: '#fff', letterSpacing: '0.1em' }}>{monthNames[calMonth]} {calYear}</span>
                            <button onClick={() => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1) } else setCalMonth(m => m + 1) }}
                              style={{ background: 'none', border: 'none', color: '#ff8500', cursor: 'pointer', fontSize: 27, padding: '0 9px', lineHeight: 1 }}>-</button>
                          </div>
                          {/* Day headers */}
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3, marginBottom: 6 }}>
                            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d, i) => (
                              <div key={i} style={{ textAlign: 'center', fontSize: 15, color: '#ff8500', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>{d}</div>
                            ))}
                          </div>
                          {/* Days grid */}
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3 }}>
                            {Array.from({ length: firstDow }).map((_, i) => <div key={`e${i}`} />)}
                            {Array.from({ length: daysInMonth }).map((_, i) => {
                              const ds = toDs(calYear, calMonth, i + 1)
                              const isFuture = ds > today
                              const isWkend = [0, 6].includes(new Date(calYear, calMonth, i + 1).getDay())
                              const edge = isEdge(ds)
                              const highlighted = !edge && isInRange(ds)
                              return (
                                <div key={ds}
                                  onMouseEnter={() => calPickStart && setCalHover(ds)}
                                  onClick={() => !isFuture && handleDayClick(ds)}
                                  style={{
                                    textAlign: 'center', fontSize: 18, fontWeight: edge ? 900 : 600,
                                    fontFamily: 'JetBrains Mono, monospace', padding: '6px 0', borderRadius: 6,
                                    cursor: isFuture ? 'default' : 'pointer',
                                    color: isFuture ? '#333' : edge ? '#000' : isWkend ? '#888' : '#fff',
                                    background: edge ? '#ff8500' : highlighted ? 'rgba(255,133,0,0.22)' : 'transparent',
                                    userSelect: 'none',
                                    transition: 'background 0.08s',
                                  }}
                                >{i + 1}</div>
                              )
                            })}
                          </div>
                          {/* Footer */}
                          <div style={{ marginTop: 15, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12 }}>
                            <span style={{ fontSize: 15, color: '#fff', fontFamily: 'JetBrains Mono, monospace' }}>
                              {calPickStart ? `start: ${calPickStart} - click end` : rangeStart && rangeEnd ? `${rangeStart} → ${rangeEnd}` : 'click start date'}
                            </span>
                            <button onClick={() => { onHistoricalDaysChange('1D'); setCalPickStart(null); setCalHover(null); setCalOpen(false) }}
                              style={{ fontSize: 15, background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace' }}>CLEAR</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })()}

                {/* Live Mode Indicator - shown instead of scan shortcuts when markets are open */}
                {isLiveMode && (
                  <div className="hidden md:flex items-center gap-3">
                    <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.14)' }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 12px', height: '31px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.45)', borderRadius: '20px' }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: liveConnected ? '#10b981' : '#f59e0b', boxShadow: liveConnected ? '0 0 6px #10b981' : '0 0 6px #f59e0b', display: 'inline-block', animation: liveConnected ? 'pulse 1.4s ease-in-out infinite' : 'none' }} />
                      <span style={{ color: liveConnected ? '#34d399' : '#fbbf24', fontFamily: 'monospace', fontWeight: 800, fontSize: 11, letterSpacing: '1.5px' }}>
                        {liveConnected ? 'LIVE' : 'CONNECTING...'}
                      </span>
                      {liveTradeCount > 0 && (
                        <span style={{ color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.5px' }}>
                          {liveTradeCount.toLocaleString()} trades
                        </span>
                      )}
                    </div>
                    {false && (
                      <button
                        onClick={onToggleLive}
                        title="Stop live stream"
                        style={{
                          height: '31px',
                          padding: '0 12px',
                          background: 'rgba(239,68,68,0.1)',
                          border: '1px solid rgba(239,68,68,0.5)',
                          borderRadius: '20px',
                          fontSize: '11px',
                          letterSpacing: '1.2px',
                          fontWeight: 700,
                          color: '#f87171',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="#f87171"><rect width="8" height="8" rx="1" /></svg>
                        STOP
                      </button>
                    )}
                  </div>
                )}

                {/* Divider + Scan Shortcuts - removed, now in ticker dropdown */}

                {/* Divider */}

                {!isSidebarPanel && (
                  <div
                    className="hidden md:block"
                    style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.14)' }}
                  ></div>
                )}

                {/* Quick Filters - Notable button removed, auto-activated by SweepSense */}

                <div className="hidden md:flex items-center gap-2">
                </div>

                {/* Divider */}

                <div
                  className="hidden md:block"
                  style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.14)' }}
                ></div>

                {/* SweepSense Toggle removed - scan now runs automatically once flow data loads */}

                {/* Grading Progress - now shown in fullscreen overlay, hidden from header */}

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
                        -
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
                        height: tbH || '35px',
                        padding: tbPad || '0 13px',
                        background: 'linear-gradient(180deg, rgba(255,133,0,0.22) 0%, rgba(255,133,0,0.06) 55%, rgba(0,0,0,0.2) 100%)',
                        border: '1px solid #ff8500',
                        borderRadius: '7px',
                        fontSize: tbFs || '12px',
                        letterSpacing: tbLs || '1.2px',
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

                  {/* Mobile Dropdown Menu - see OptionsFlowMobileMenu.tsx */}

                  <OptionsFlowMobileMenu
                    variant="dropdown"
                    loading={loading}
                    savingFlow={savingFlow}
                    loadingHistory={loadingHistory}
                    data={data}
                    onSave={handleSaveFlow}
                    onHistory={loadFlowHistory}
                    onClear={onClearData}
                  />

                  {/* Save Button - Desktop Only */}

                  <button
                    onClick={handleSaveFlow}
                    disabled={savingFlow || !data || data.length === 0}
                    title={savingFlow ? 'Saving...' : saveStatus === 'success' ? 'Saved!' : saveStatus === 'error' ? 'Error saving' : 'Save Flow'}
                    className={`toolbar-btn-save${saveStatus === 'success' ? ' tb-save-success' : ''} hidden md:flex items-center gap-2 justify-center transition-all duration-150 focus:outline-none ${savingFlow || !data || data.length === 0 ? 'cursor-not-allowed opacity-40' : ''}${!isAdmin ? ' !hidden' : ''}`}
                    style={{
                      height: tbH || '42px',
                      padding: tbPad || '0 12px',
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
                    <span style={{ fontWeight: 900, color: saveStatus === 'success' ? '#22c55e' : saveStatus === 'error' ? '#ef4444' : undefined }}>{savingFlow ? 'Saving' : saveStatus === 'success' ? 'Saved' : saveStatus === 'error' ? 'Error' : 'Save'}</span>
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

                  <button
                    onClick={loadFlowHistory}
                    disabled={loadingHistory}
                    title={loadingHistory ? 'Loading...' : 'Flow History'}
                    className={`toolbar-btn-history hidden md:flex items-center gap-2 justify-center transition-all duration-150 focus:outline-none ${loadingHistory ? 'cursor-not-allowed opacity-40' : ''}`}
                    style={{
                      height: tbH || '42px',
                      padding: tbPad || '0 12px',
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
                    <span style={{ fontWeight: 900, color: '#8b5cf6' }}>{loadingHistory ? 'Loading' : 'Historical'}</span>
                  </button>

                  {/* Clear Data Button - Desktop Only */}

                  {onClearData && (
                    <button
                      onClick={onClearData}
                      disabled={loading}
                      title="Clear Data"
                      className={`toolbar-btn-clear hidden md:flex items-center justify-center transition-all duration-150 focus:outline-none ${loading ? 'cursor-not-allowed opacity-40' : ''}`}
                      style={{
                        width: tbHn || '42px',
                        height: tbHn || '42px',
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

                  {/* Refresh Button */}

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

                    {/* Pagination Info + Controls - hidden on tablet/laptop (shown at table bottom instead) */}

                    <div style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '3px', color: '#8a8a8a', fontFamily: 'monospace' }} className={windowWidth < 1440 ? 'hidden' : ''}>
                      <span>{currentPage}</span>
                      <span style={{ color: '#555', fontSize: '10px' }}>/</span>
                      <span>{totalPages}</span>
                    </div>

                    {/* Pagination Controls */}

                    {filteredAndSortedData.length > itemsPerPage && (
                      <div className={`pagination flex items-center gap-0.5${windowWidth < 1440 ? ' hidden' : ''}`}>
                        <button
                          onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                          disabled={currentPage === 1}
                          className="flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150"
                          style={{ width: '24px', height: '24px', background: 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)', border: '1px solid rgba(255,255,255,0.16)', borderRadius: '4px', color: '#aaa', fontSize: '13px', cursor: currentPage === 1 ? 'not-allowed' : 'pointer', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07), inset 0 -1px 0 rgba(0,0,0,0.3)' }}
                        >
                          -
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
                          -
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Shim: reserves space for the fixed control bar (nav+ticker+bar height) */}
        <div
          style={{ height: isSidebarPanel ? '0' : (isMobileView ? `${mobileShimHeight}px` : '52px'), flexShrink: 0 }}
          aria-hidden="true"
        />

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

          {/* Fullscreen scan loading overlay - shown while streaming with no data yet */}
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

                {/* Aurora band 1 - wide cyan sweep across top */}
                <div style={{
                  position: 'absolute', top: '-12%', left: '-10%', width: '120%', height: '50%',
                  background: 'linear-gradient(180deg, transparent 0%, rgba(0,140,255,0.04) 30%, rgba(0,90,200,0.065) 60%, transparent 100%)',
                  animation: 'scanAurora1 9s ease-in-out infinite',
                  transformOrigin: '50% 50%',
                }} />
                {/* Aurora band 2 - mid teal */}
                <div style={{
                  position: 'absolute', top: '32%', left: '-10%', width: '120%', height: '38%',
                  background: 'linear-gradient(180deg, transparent 0%, rgba(0,200,170,0.028) 40%, rgba(0,130,120,0.048) 70%, transparent 100%)',
                  animation: 'scanAurora2 12s ease-in-out infinite',
                  transformOrigin: '50% 50%',
                }} />
                {/* Aurora band 3 - deep violet bottom */}
                <div style={{
                  position: 'absolute', bottom: '-8%', left: '-10%', width: '120%', height: '32%',
                  background: 'linear-gradient(0deg, transparent 0%, rgba(50,30,130,0.04) 50%, transparent 100%)',
                  animation: 'scanAurora1 15s ease-in-out infinite 4s',
                  transformOrigin: '50% 50%',
                }} />

                {/* Wave layer 1 - deep slow */}
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
                {/* Wave layer 3 - surface sheen */}
                <div style={{ position: 'absolute', bottom: 0, left: '-5%', width: '110%', height: '110px', animation: 'scanWave3 7.5s ease-in-out infinite' }}>
                  <svg viewBox="0 0 1440 110" preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }}>
                    <path d="M0,55 C360,95 720,15 1080,55 C1260,75 1380,40 1440,55 L1440,110 L0,110 Z" fill="rgba(0,210,255,0.028)" />
                  </svg>
                </div>

                {/* Glass shards - clipped polygons with crystalline borders */}
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

              {/* === LOADING ART PANEL - rendered after abstract bg so same zIndex wins (later in DOM = on top) === */}
              <div key={0} style={{ position: 'absolute', inset: 0, zIndex: 0, opacity: 0.72, animation: 'artFadeIn 1.4s ease-in-out', pointerEvents: 'none' }}>
                {LoadingScenePanel()}
              </div>

              {/* Content */}
              <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'clamp(20px, 5vw, 44px)' }}>
                {/* Title */}
                <div style={{ textAlign: 'center' }}>
                  <div style={{
                    fontSize: 'clamp(36px, 14vw, 72px)', fontWeight: 900, color: '#ffffff', letterSpacing: 'clamp(2px, 2vw, 8px)', lineHeight: 1,
                    animation: 'scanTitlePulse 2.8s ease-in-out infinite',
                    textShadow: '0 0 60px rgba(255,255,255,0.12), 0 1px 0 #ccc, 0 2px 0 #999, 0 6px 20px rgba(0,0,0,0.8)',
                    WebkitTextStroke: '0.5px rgba(255,255,255,0.15)',
                  }}>{selectedTicker ? selectedTicker.toUpperCase() : 'OPTIONS'}</div>
                  <div style={{
                    fontSize: 'clamp(13px, 5vw, 26px)', fontWeight: 800, color: 'rgba(255,255,255,0.55)', letterSpacing: 'clamp(3px, 3vw, 14px)', marginTop: '8px',
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

                {/* Status text - solid white, Worker prefix stripped */}
                <div style={{ fontSize: '16px', fontWeight: 600, color: '#ffffff', letterSpacing: '0.5px', textAlign: 'center', maxWidth: '600px', textShadow: '0 0 20px rgba(255,255,255,0.3)' }}>
                  {streamingStatus
                    ? streamingStatus.replace(/^Worker\s+\d+:\s*/i, '')
                    : 'Scanning options flow...'}
                </div>

                {/* Quote card */}
                <div style={{
                  maxWidth: 'min(680px, 90vw)', textAlign: 'center',
                  padding: 'clamp(14px, 4vw, 30px) clamp(14px, 5vw, 40px)',
                  borderRadius: '14px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'linear-gradient(160deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 55%, rgba(0,0,0,0.3) 100%)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07), inset 0 -1px 0 rgba(0,0,0,0.5), 0 16px 50px rgba(0,0,0,0.6)',
                  position: 'relative', overflow: 'hidden',
                }}>
                  <div style={{ position: 'absolute', top: 0, left: '10%', right: '10%', height: '1px', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.14), transparent)' }} />
                  <div style={{ fontSize: 'clamp(13px, 3.5vw, 19px)', fontStyle: 'italic', color: '#f1f5f9', lineHeight: 1.7, fontWeight: 400 }}>
                    &ldquo;{EFI_LOADING_QUOTES[loadingQuoteIndex % EFI_LOADING_QUOTES.length].text}&rdquo;
                  </div>
                  <div style={{ fontSize: 'clamp(11px, 3vw, 15px)', color: 'rgba(255,255,255,0.5)', fontWeight: 600, marginTop: '16px', letterSpacing: '0.5px' }}>
                    - {EFI_LOADING_QUOTES[loadingQuoteIndex % EFI_LOADING_QUOTES.length].author}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Fullscreen loading overlay removed - SweepSense now scans silently in the
              background; its loading state is shown only inside the Flow Tracking
              panel's SweepSense tab (see sweepSenseScanning prop), not over the table. */}
          {false && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 50,
              background: 'radial-gradient(ellipse at 50% 40%, rgba(0,12,4,0.98) 0%, rgba(0,0,0,0.99) 70%)',
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
                  0%, 100% { box-shadow: 0 0 14px rgba(168,255,62,0.5); }
                  50% { box-shadow: 0 0 28px rgba(168,255,62,0.85); }
                }
              `}</style>

              {/* Abstract terminal background */}
              <div style={{
                position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 0,
                backgroundImage: `
                  linear-gradient(rgba(168,255,62,0.025) 1px, transparent 1px),
                  linear-gradient(90deg, rgba(168,255,62,0.025) 1px, transparent 1px)
                `,
                backgroundSize: '44px 44px',
              }}>
                {/* Radial glow blobs */}
                <div style={{ position: 'absolute', top: '-140px', left: '-100px', width: '460px', height: '460px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(168,255,62,0.08) 0%, transparent 70%)', animation: 'efiBlobPulse 4.5s ease-in-out infinite' }} />
                <div style={{ position: 'absolute', bottom: '-140px', right: '-100px', width: '460px', height: '460px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(100,220,20,0.08) 0%, transparent 70%)', animation: 'efiBlobPulse 4.5s ease-in-out infinite 2.2s' }} />
                {/* Floating data stream labels */}
                {['SHORT-TERM - SWEEP', 'LONG-TERM - BLOCK', 'RS ALIGNED - +3.2%', 'VOL/OI - 1.8x', 'SEASONAL - SWEET SPOT', '52W HIGH - BREAKOUT'].map((txt, i) => (
                  <div key={i} style={{
                    position: 'absolute',
                    left: `${6 + i * 15}%`,
                    top: `${10 + (i % 3) * 28}%`,
                    fontSize: '11px', color: 'rgba(168,255,62,0.14)', fontFamily: 'monospace', fontWeight: 500,
                    animation: `${i % 2 === 0 ? 'efiFloatUp' : 'efiFloatDown'} ${5 + i * 1.2}s ease-in-out infinite`,
                    whiteSpace: 'nowrap',
                  }}>{txt}</div>
                ))}
              </div>

              {/* Content layer */}
              <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'clamp(20px, 5vw, 52px)' }}>

                {/* 3D Glossy Title */}
                <div style={{ textAlign: 'center' }}>
                  <div style={{
                    fontSize: 'clamp(34px, 12vw, 72px)', fontWeight: 900, color: '#a8ff3e', letterSpacing: 'clamp(2px, 1.5vw, 6px)', lineHeight: 1,
                    animation: 'efiTitlePulse 2.5s ease-in-out infinite',
                    textShadow: '0 1px 0 #6dcc00, 0 2px 0 #5ab800, 0 3px 0 #48a400, 0 4px 0 #369000, 0 5px 0 #247c00, 0 6px 12px rgba(0,0,0,0.7), 0 10px 30px rgba(168,255,62,0.2)',
                    WebkitTextStroke: '0.5px rgba(200,255,100,0.3)',
                  }}>SweepSense</div>
                  <div style={{
                    fontSize: 'clamp(12px, 4.5vw, 26px)', fontWeight: 800, color: '#ffffff', letterSpacing: 'clamp(3px, 2.5vw, 11px)', marginTop: '10px',
                    textShadow: '0 1px 0 #444, 0 2px 4px rgba(0,0,0,0.8), 0 0 20px rgba(168,255,62,0.12)',
                  }}>VISION</div>
                </div>

                {/* Glossy dual-ring spinner */}
                <div style={{ position: 'relative', width: '136px', height: '136px' }}>
                  <div style={{
                    position: 'absolute', inset: 0, borderRadius: '50%',
                    border: '6px solid rgba(168,255,62,0.08)',
                    borderTopColor: '#a8ff3e',
                    animation: 'spin 0.85s linear infinite, efiSpinnerGlow 1.7s ease-in-out infinite',
                  }} />
                  <div style={{
                    position: 'absolute', inset: '17px', borderRadius: '50%',
                    border: '5px solid rgba(100,220,20,0.08)',
                    borderTopColor: '#6dcc00',
                    animation: 'spin 1.3s linear infinite reverse',
                    boxShadow: '0 0 10px rgba(100,220,20,0.4)',
                  }} />
                  {/* Centre dot */}
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'radial-gradient(circle, #c8ff60 0%, #a8ff3e 100%)', boxShadow: '0 0 12px rgba(168,255,62,0.9)' }} />
                  </div>
                </div>

                {/* Progress bar */}
                {gradingProgress && (
                  <div style={{ width: 'min(552px, 90vw)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                      <span style={{ fontSize: 'clamp(13px, 4vw, 19px)', color: '#ffffff', fontWeight: 700, textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>Grading trades</span>
                      <span style={{ fontSize: 'clamp(14px, 4.5vw, 22px)', fontWeight: 900, color: '#a8ff3e', textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
                        {Math.round(((gradingProgress?.current ?? 0) / (gradingProgress?.total || 1)) * 100)}%
                      </span>
                    </div>
                    <div style={{
                      height: '9px', borderRadius: '5px', overflow: 'hidden',
                      background: 'linear-gradient(180deg, #0d0d0d 0%, #1a1a1a 100%)',
                      border: '1px solid rgba(168,255,62,0.15)',
                      boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.8)',
                      position: 'relative',
                    }}>
                      <div style={{
                        height: '100%',
                        background: 'linear-gradient(180deg, #c8ff60 0%, #a8ff3e 50%, #6dcc00 100%)',
                        borderRadius: '5px',
                        transition: 'width 0.4s ease',
                        width: `${((gradingProgress?.current ?? 0) / (gradingProgress?.total || 1)) * 100}%`,
                        position: 'relative',
                        boxShadow: '0 0 10px rgba(255,149,0,0.6)',
                      }}>
                        {/* Glossy shine on fill */}
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '50%', background: 'linear-gradient(180deg, rgba(255,255,255,0.22) 0%, transparent 100%)', borderRadius: '5px 5px 0 0' }} />
                        {/* Moving shine sweep */}
                        <div style={{ position: 'absolute', top: 0, bottom: 0, width: '40px', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent)', animation: 'efiShine 2s linear infinite' }} />
                      </div>
                    </div>
                    <div style={{ textAlign: 'center', marginTop: '12px', fontSize: 'clamp(12px, 4vw, 18px)', fontWeight: 700, color: '#ffffff', textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
                      {(gradingProgress?.current ?? 0).toLocaleString()} / {(gradingProgress?.total ?? 0).toLocaleString()} trades
                    </div>
                  </div>
                )}

                {/* Rotating quote - glossy glass card */}
                <div style={{
                  maxWidth: 'min(810px, 90vw)', textAlign: 'center',
                  padding: 'clamp(14px, 4vw, 38px) clamp(14px, 5vw, 46px)',
                  borderRadius: '16px',
                  border: '1px solid rgba(168,255,62,0.18)',
                  background: 'linear-gradient(160deg, rgba(168,255,62,0.07) 0%, rgba(100,220,20,0.03) 55%, rgba(0,0,0,0.35) 100%)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.4), 0 16px 50px rgba(0,0,0,0.6), 0 4px 20px rgba(168,255,62,0.08)',
                  position: 'relative', overflow: 'hidden',
                }}>
                  <div style={{ position: 'absolute', top: 0, left: '10%', right: '10%', height: '1px', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.14), transparent)' }} />
                  <div style={{ fontSize: 'clamp(13px, 4vw, 24px)', fontStyle: 'italic', color: '#f3f4f6', lineHeight: 1.65, fontWeight: 400, textShadow: '0 1px 6px rgba(0,0,0,0.5)' }}>
                    &ldquo;{EFI_LOADING_QUOTES[loadingQuoteIndex % EFI_LOADING_QUOTES.length].text}&rdquo;
                  </div>
                  <div style={{ fontSize: 'clamp(12px, 3.2vw, 19px)', color: '#a8ff3e', fontWeight: 700, marginTop: '22px', letterSpacing: '0.5px', textShadow: '0 0 12px rgba(168,255,62,0.4)' }}>
                    - {EFI_LOADING_QUOTES[loadingQuoteIndex % EFI_LOADING_QUOTES.length].author}
                  </div>
                </div>
              </div>
            </div>
          )}
          <div className="p-0">
            <div
              className={`table-scroll-container custom-scrollbar overflow-y-auto overflow-x-auto${isTabletView ? ' table-tablet' : ''}`}
              style={{
                height: isMobileView ? 'calc(100dvh - 200px)' : windowWidth < 1440 ? 'calc(100vh - 210px)' : 'calc(100vh - 171px)',
                overflowY: 'auto',
                overflowX: 'auto',
                paddingBottom: isMobileView ? '80px' : '0px',
                scrollBehavior: 'smooth',
              }}
            >
              <table className="w-full options-flow-table" style={{ marginBottom: '0px' }}>
                <thead className="col-thead sticky top-0 z-[100]">
                  <tr>
                    {/* TIME */}
                    <th
                      className="col-hdr col-sortable text-left"
                      onClick={() => handleSort('trade_timestamp')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <svg className="hidden md:block animate-pulse" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FF6600" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /><circle cx="12" cy="12" r="2" fill="#FF6600" opacity="0.4" /></svg>
                        <span className="hidden md:inline">TIME</span>
                        <span className="md:hidden" style={{ fontWeight: 900, fontSize: '11px' }}>SYMBOL</span>
                      </div>
                    </th>

                    {/* SYMBOL */}
                    <th
                      className="col-hdr col-sortable hidden md:table-cell text-left"
                      onClick={() => handleSort('underlying_ticker')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" strokeWidth="3" /></svg>
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
                      className="col-hdr col-sortable text-left"
                      onClick={() => handleSort('type')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <svg className="hidden md:block" width="12" height="12" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 16V4m0 0L3 8m4-4l4 4" stroke="#22c55e" /><path d="M17 8v12m0 0l4-4m-4 4l-4-4" stroke="#ef4444" /></svg>
                        <span className="hidden md:inline">C/P</span>
                        <span className="md:hidden" style={{ fontWeight: 900, fontSize: '11px' }}>C/P</span>
                        <span className="hidden md:inline-flex" style={{ alignItems: 'center', marginLeft: 1 }}>
                          {sortField === 'type' && (
                            <svg width="7" height="8" viewBox="0 0 7 8" fill="currentColor" aria-hidden="true">{sortDirection === 'asc' ? <path d="M3.5 1L7 7H0Z" /> : <path d="M3.5 7L0 1H7Z" />}</svg>
                          )}
                        </span>
                      </div>
                    </th>

                    {/* STRIKE */}
                    <th
                      className="col-hdr col-sortable hidden md:table-cell text-left"
                      onClick={() => handleSort('strike')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#eab308" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" /><line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" /><line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" /></svg>
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
                      className="col-hdr col-sortable text-left"
                      onClick={() => handleSort('total_premium')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <svg className="hidden md:block" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></svg>
                        <span style={{ fontWeight: 900, fontSize: '11px' }}>SIZE</span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', marginLeft: 1 }}>
                          {sortField === 'total_premium' && (
                            <svg width="7" height="8" viewBox="0 0 7 8" fill="currentColor" aria-hidden="true">{sortDirection === 'asc' ? <path d="M3.5 1L7 7H0Z" /> : <path d="M3.5 7L0 1H7Z" />}</svg>
                          )}
                        </span>
                      </div>
                    </th>

                    {/* PREMIUM */}
                    <th
                      className="col-hdr col-sortable hidden md:table-cell text-left"
                      onClick={() => handleSort('total_premium')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" /></svg>
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
                      className="col-hdr col-sortable text-left"
                      onClick={() => handleSort('expiry')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <svg className="hidden md:block" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="8" y1="14" x2="8" y2="14" strokeWidth="3" /><line x1="12" y1="14" x2="12" y2="14" strokeWidth="3" /></svg>
                        <span className="hidden md:inline">EXPIRY</span>
                        <span className="md:hidden" style={{ fontWeight: 900, fontSize: '11px' }}>EXPIRY</span>
                        <span className="hidden md:inline-flex" style={{ alignItems: 'center', marginLeft: 1 }}>
                          {sortField === 'expiry' && (
                            <svg width="7" height="8" viewBox="0 0 7 8" fill="currentColor" aria-hidden="true">{sortDirection === 'asc' ? <path d="M3.5 1L7 7H0Z" /> : <path d="M3.5 7L0 1H7Z" />}</svg>
                          )}
                        </span>
                      </div>
                    </th>

                    {/* SPOT ? CURR */}
                    <th
                      className="col-hdr col-sortable text-left"
                      onClick={() => handleSort('spot_price')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <svg className="hidden md:block" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
                        <span className="hidden md:inline">SPOT ? CURR</span>
                        <span className="md:hidden" style={{ fontWeight: 900, fontSize: '11px' }}>SPOT</span>
                        <span className="hidden md:inline-flex" style={{ alignItems: 'center', marginLeft: 1 }}>
                          {sortField === 'spot_price' && (
                            <svg width="7" height="8" viewBox="0 0 7 8" fill="currentColor" aria-hidden="true">{sortDirection === 'asc' ? <path d="M3.5 1L7 7H0Z" /> : <path d="M3.5 7L0 1H7Z" />}</svg>
                          )}
                        </span>
                      </div>
                    </th>

                    {/* VOL/OI - not sortable */}
                    <th className="col-hdr col-vol-oi hidden md:table-cell text-left">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="6" y1="20" x2="6" y2="14" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="18" y1="20" x2="18" y2="10" /></svg>
                        VOL/OI
                      </div>
                    </th>

                    {/* TYPE */}
                    <th
                      className="col-hdr col-type col-sortable hidden md:table-cell text-left"
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#facc15" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
                        TYPE
                        <span style={{ display: 'inline-flex', alignItems: 'center', marginLeft: 1 }}>
                          {sortField === 'trade_type' && (
                            <svg width="7" height="8" viewBox="0 0 7 8" fill="currentColor" aria-hidden="true">{sortDirection === 'asc' ? <path d="M3.5 1L7 7H0Z" /> : <path d="M3.5 7L0 1H7Z" />}</svg>
                          )}
                        </span>
                      </div>
                    </th>

                    {/* Dealer column and Grade (Long First/Short First) columns removed -
                        this info now lives in the SweepSense tab of the Flow Tracking panel. */}
                  </tr>
                </thead>

                <tbody>
                  {/* Lightning winner highlight - uses a real CSS outline around the whole
                      row (not per-cell box-shadow) so there's a single clean border with
                      no seams between columns. Glow kept subtle (~50% of earlier intensity). */}
                  <style>{`
                    @keyframes sweepsense-lightning {
                      0%   { outline-color: #ff4dd2; box-shadow: 0 0 4px 1px #ff4dd2; }
                      20%  { outline-color: #00e5ff; box-shadow: 0 0 6px 1px #00e5ff; }
                      40%  { outline-color: #a855f7; box-shadow: 0 0 4px 1px #a855f7; }
                      60%  { outline-color: #00e5ff; box-shadow: 0 0 7px 2px #0ea5e9; }
                      80%  { outline-color: #ff4dd2; box-shadow: 0 0 4px 1px #ff4dd2; }
                      100% { outline-color: #ff4dd2; box-shadow: 0 0 4px 1px #ff4dd2; }
                    }
                    tr.sweepsense-winner {
                      position: relative;
                      z-index: 3;
                      outline: 2px solid #ff4dd2;
                      outline-offset: -2px;
                      animation: sweepsense-lightning 1.4s ease-in-out infinite;
                    }
                  `}</style>

                  {(() => {
                    // Compute which trade is the SweepSense winner for the selected ticker.
                    // Winner = highest conviction score among all visible trades.
                    if (!selectedTickerFilter || !(shortTermActive || longTermActive)) return null
                    const scoreW = (t: OptionsFlowData): number => {
                      const fq = t.fill_style === 'AA' ? 4 : t.fill_style === 'A' ? 3
                        : t.fill_style === 'BB' ? 2 : t.fill_style === 'B' ? 1 : 0
                      const voi = t.vol_oi_ratio ?? 0
                      return t.total_premium * fq * (voi >= 1.5 ? 1.3 : voi >= 1.0 ? 1.15 : 1.0)
                    }
                      // Store winner key in a ref-like variable accessible to the row map below
                      ; (window as any).__sweepsenseWinnerKey = paginatedData.length > 0
                        ? paginatedData.reduce((best, t) => scoreW(t) > scoreW(best) ? t : best, paginatedData[0])
                        : null
                    return null
                  })()}

                  {paginatedData.map((trade, index) => {
                    const isEfiHighlight = shortTermActive && meetsShortTermCriteria(trade)

                    // Short-term pick: meets criteria + grade A-, A, or A+
                    const isShortTermPick = shortTermActive && meetsShortTermCriteria(trade) && (() => {
                      if (optionPricesFetching || Object.keys(currentOptionPrices).length === 0) return false
                      const g = getCachedGrade(trade)
                      return ['A-', 'A', 'A+'].includes(g.grade)
                    })()

                    // Long-term pick: meets criteria + grade A-, A, or A+
                    const isLongTermPick = longTermActive && meetsLongTermCriteria(trade) && (() => {
                      if (optionPricesFetching || Object.keys(currentOptionPrices).length === 0) return false
                      const g = getCachedGrade(trade)
                      return ['A-', 'A', 'A+'].includes(g.grade)
                    })()

                    const isAnyNotable = isShortTermPick || isLongTermPick

                    // Row color helper
                    const notableColor = (fallback?: string) =>
                      isLongTermPick ? '#00e5ff' : isShortTermPick ? '#FFD700' : (fallback || undefined)

                    // SweepSense filter (mobile "SweepSense" button) - color the ticker cyan
                    // (long-term/LEAP) or yellow (short-term) same as the SweepSense tab, and
                    // surface the Plan Entry text as its own 3rd row below the trade.
                    const sweepSenseEntry = sweepSenseFilterActive && sweepSenseDataStable
                      ? sweepSenseDataStable.trades.find((t) => generateFlowId(t.trade) === generateFlowId(trade))
                      : null
                    const sweepSenseIsLongTerm = sweepSenseEntry ? meetsLongTermCriteria(trade) : false
                    const sweepSenseTickerColor = sweepSenseEntry ? (sweepSenseIsLongTerm ? '#00e5ff' : '#ffd400') : null

                    // Keep legacy alias so downstream row JSX that references isNotablePick still works
                    const isNotablePick = isShortTermPick
                    const isLeapNotable = isLongTermPick

                    // Determine if short-term highlight is bullish or bearish

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
                          className={[
                            'border-b border-slate-700/50 transition-all duration-150',
                            selectedTickerFilter && (shortTermActive || longTermActive) &&
                              (window as any).__sweepsenseWinnerKey === trade
                              ? 'sweepsense-winner'
                              : '',
                          ].join(' ')}
                          onClick={() => {
                            if (isAnyNotable) openNotableAnalysis(trade)
                            if (sweepSenseEntry) {
                              const id = generateFlowId(trade)
                              setExpandedSweepSenseRowId((prev) => (prev === id ? null : id))
                            }
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
                            cursor: (isAnyNotable || sweepSenseEntry) ? 'pointer' : 'default',
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
                                  style={sweepSenseTickerColor ? { color: sweepSenseTickerColor, fontWeight: 'bold' } : undefined}
                                >
                                  {trade.underlying_ticker}
                                </button>

                                <button
                                  onClick={() => {
                                    const tracked = isInFlowTracking(trade)
                                    tracked ? removeFromFlowTracking(trade) : addToFlowTracking(trade)
                                  }}
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
                                  isAnyNotable
                                    ? { color: notableColor(), fontWeight: 'bold' }
                                    : { color: '#d1d5db' }
                                }
                              >
                                {formatTimeWithSeconds(trade.trade_timestamp)}
                              </div>
                            </div>

                            {/* Desktop: Time only */}

                            <div
                              className="hidden md:block"
                              style={isAnyNotable ? { color: notableColor(), fontWeight: 'bold' } : {}}
                            >
                              {formatTimeWithSeconds(trade.trade_timestamp)}
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
                                  sweepSenseTickerColor ? { color: sweepSenseTickerColor, fontWeight: 'bold' } : isAnyNotable ? { color: notableColor(), fontWeight: 'bold' } : {}
                                }
                              >
                                {trade.underlying_ticker}
                              </button>

                              <button
                                onClick={() => {
                                  const tracked = isInFlowTracking(trade)
                                  tracked ? removeFromFlowTracking(trade) : addToFlowTracking(trade)
                                }}
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
                                  isAnyNotable
                                    ? { color: notableColor(), fontWeight: 'bold' }
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
                              isAnyNotable
                                ? { color: notableColor(), fontWeight: 'bold' }
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
                                <div className="flex items-center gap-1" style={{ flexWrap: 'nowrap', whiteSpace: 'nowrap' }}>
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
                                  isAnyNotable
                                    ? { color: notableColor(), fontWeight: 'bold' }
                                    : { color: 'white' }
                                }
                              >
                                {formatDate(trade.expiry)}
                              </div>

                              <span
                                className={`${getTradeTypeColor(trade.classification || trade.trade_type).className} px-3 py-1 text-xs`}
                                style={getTradeTypeColor(trade.classification || trade.trade_type).style}
                              >
                                {(trade.classification || trade.trade_type) === 'MULTI-LEG'
                                  ? 'ML'
                                  : trade.classification || trade.trade_type}
                              </span>
                            </div>

                            {/* Desktop: Expiry only */}

                            <div
                              className="hidden md:block"
                              style={isAnyNotable ? { color: notableColor(), fontWeight: 'bold' } : {}}
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
                                  {(shortTermActive || longTermActive) && isMobileView
                                    ? fmt4sig(typeof trade.spot_price === 'number' ? trade.spot_price : parseFloat(trade.spot_price))
                                    : (typeof trade.spot_price === 'number'
                                      ? trade.spot_price.toFixed(2)
                                      : parseFloat(trade.spot_price).toFixed(2))}
                                </span>
                              </div>

                              <div className="text-xs">
                                <span
                                  className={`font-bold ${((currentPrices[trade.underlying_ticker] || trade.current_price) ?? 0) > trade.spot_price ? 'text-green-400' : 'text-red-400'}`}
                                >
                                  $
                                  {(() => {
                                    const cp = (currentPrices[trade.underlying_ticker] || trade.current_price) ?? 0
                                    return (shortTermActive || longTermActive) && isMobileView
                                      ? fmt4sig(cp)
                                      : cp.toFixed(2)
                                  })()}
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
                                isNotablePick={isAnyNotable}
                              />
                            </div>
                          </td>

                          <td className="col-vol-oi hidden md:table-cell p-2 md:p-6 text-xs md:text-xl text-white border-r border-gray-700/30 vol-oi-display">
                            {(() => {
                              const expiry = trade.expiry.replace(/-/g, '').slice(2)
                              const strikeFormatted = String(Math.round(trade.strike * 1000)).padStart(8, '0')
                              const optionType = trade.type.toLowerCase() === 'call' ? 'C' : 'P'
                              const optionTicker = `O:${normalizeTickerForOptions(trade.underlying_ticker)}${expiry}${optionType}${strikeFormatted}`
                              const live = currentOptionVolOi[optionTicker]
                              const liveVolume = live?.volume ?? trade.volume
                              const liveOi = live?.open_interest ?? trade.open_interest
                              if (typeof liveVolume !== 'number' || typeof liveOi !== 'number') {
                                return (
                                  <span className="text-gray-500" style={{ fontSize: '19.2px' }}>
                                    --
                                  </span>
                                )
                              }
                              return (
                                <div className="flex items-center justify-center gap-1">
                                  <span
                                    className="text-cyan-400 font-bold"
                                    style={{ fontSize: '19.2px' }}
                                  >
                                    {liveVolume.toLocaleString()}
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
                                          liveOi !== trade.base_open_interest
                                          ? '#FFD700'
                                          : '#a855f7',
                                    }}
                                  >
                                    {liveOi.toLocaleString()}
                                  </span>
                                </div>
                              )
                            })()}
                          </td>

                          <td className="col-type hidden md:table-cell p-2 md:p-6 border-r border-gray-700/30 text-center">
                            <span
                              className={`${getTradeTypeColor(trade.classification || trade.trade_type).className} px-4 py-2 text-xs md:text-lg`}
                              style={getTradeTypeColor(trade.classification || trade.trade_type).style}
                            >
                              {(trade.classification || trade.trade_type) === 'MULTI-LEG'
                                ? 'ML'
                                : trade.classification || trade.trade_type}
                            </span>
                          </td>

                          {/* Dealer column and Grade (Long First/Short First) columns removed -
                              this info now lives in the SweepSense tab of the Flow Tracking panel. */}
                        </tr>

                        {/* Mobile: SweepSense breakdown % (Call Buy/Sell, Put Buy/Sell) + Plan Entry -
                            only when the row is clicked open, and only while the SweepSense filter is active */}
                        {isMobileView && sweepSenseEntry && expandedSweepSenseRowId === generateFlowId(trade) && (() => {
                          const segs = [
                            { label: 'CALL BUY', pct: sweepSenseEntry.breakdown.buyCallsPct, color: '#00e676' },
                            { label: 'CALL SELL', pct: sweepSenseEntry.breakdown.bearCallsPct, color: '#ff3d3d' },
                            { label: 'PUT BUY', pct: sweepSenseEntry.breakdown.buyPutsPct, color: '#22c55e' },
                            { label: 'PUT SELL', pct: sweepSenseEntry.breakdown.bearPutsPct, color: '#b91c1c' },
                          ].sort((a, b) => b.pct - a.pct)
                          return (
                            <tr className="md:hidden border-b border-slate-700/50" style={{ background: 'rgba(0,0,0,0.6)' }}>
                              <td colSpan={99} style={{ padding: '6px 10px' }}>
                                <div style={{
                                  display: 'flex', height: '26px', borderRadius: '7px', overflow: 'hidden',
                                  border: '1px solid rgba(255,255,255,0.12)',
                                }}>
                                  {segs.map((s) => (
                                    <div
                                      key={s.label}
                                      style={{
                                        position: 'relative', flex: Math.max(s.pct, 6),
                                        background: `linear-gradient(180deg, ${s.color}ff 0%, ${s.color}cc 45%, ${s.color}ff 100%)`,
                                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5), inset 0 -6px 8px rgba(0,0,0,0.35)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        borderRight: '1px solid rgba(0,0,0,0.5)', overflow: 'hidden',
                                      }}
                                    >
                                      <span style={{ color: '#ffffff', fontSize: '9px', fontWeight: 900, whiteSpace: 'nowrap', textShadow: '0 1px 1px rgba(0,0,0,0.6)' }}>
                                        {s.pct >= 10 ? `${s.label} ${s.pct.toFixed(0)}%` : `${s.pct.toFixed(0)}%`}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )
                        })()}

                        {/* Mobile 3rd row: Plan Entry - only shown while the SweepSense filter is active, the row is
                            clicked open, and a plan was actually detected */}
                        {isMobileView && sweepSenseEntry && expandedSweepSenseRowId === generateFlowId(trade) && sweepSenseEntry.planText !== 'No Plan detected.' && sweepSenseEntry.planText !== 'Waiting on dealer magnet/pivot data to build an entry plan.' && (
                          <tr className="md:hidden border-b border-slate-700/50" style={{ background: 'rgba(0,0,0,0.6)' }}>
                            <td colSpan={99} style={{ padding: '6px 10px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ color: '#ffffff', fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}>Plan Entry:</span>
                                <span style={{ color: sweepSenseEntry.sigColor || '#ffffff', fontSize: '11px', fontWeight: 700 }}>{sweepSenseEntry.planText}</span>
                              </div>
                            </td>
                          </tr>
                        )}

                        {/* Mobile 3rd row: T1 / T2 / Magnet / Pivot - only for notable picks on mobile */}
                        {isMobileView &&
                          isAnyNotable &&
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
                                        {t1m ? `$${t1m.toFixed(2)}` : '-'}
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
                                        {t2m ? `$${t2m.toFixed(2)}` : '-'}
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
                                        {zones2?.golden != null ? `$${zones2.golden}` : '-'}
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
                                        {zones2?.purple != null ? `$${zones2.purple}` : '-'}
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

        {/* Bottom pagination bar - tablet/laptop only (< 1440px) */}
        {windowWidth < 1440 && !isMobileView && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            padding: '8px 12px',
            borderTop: '1px solid rgba(255,133,0,0.35)',
            background: '#050505',
            flexShrink: 0,
            minHeight: '42px',
          }}>
            {/* Trade count + Page X / Y */}
            <span style={{ fontSize: '11px', color: '#ff8500', fontFamily: 'monospace', fontWeight: 700, marginRight: '6px' }}>
              {filteredAndSortedData.length.toLocaleString()} trades
            </span>
            <span style={{ fontSize: '11px', color: '#555', fontFamily: 'monospace', marginRight: '4px' }}>
              pg {currentPage}/{totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ width: '26px', height: '26px', background: 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)', border: '1px solid rgba(255,255,255,0.16)', borderRadius: '4px', color: '#aaa', fontSize: '12px', cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
            >-</button>
            <button
              onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
              disabled={currentPage === 1}
              className="disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ width: '26px', height: '26px', background: 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)', border: '1px solid rgba(255,255,255,0.16)', borderRadius: '4px', color: '#aaa', fontSize: '14px', cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
            >-</button>

            {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
              let pageNum
              if (totalPages <= 7) pageNum = i + 1
              else if (currentPage <= 4) pageNum = i + 1
              else if (currentPage >= totalPages - 3) pageNum = totalPages - 6 + i
              else pageNum = currentPage - 3 + i
              return (
                <button
                  key={pageNum}
                  onClick={() => setCurrentPage(pageNum)}
                  style={{
                    width: '26px', height: '26px',
                    background: currentPage === pageNum ? 'rgba(255,133,0,0.9)' : 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)',
                    border: currentPage === pageNum ? '1px solid #ff8500' : '1px solid rgba(255,255,255,0.16)',
                    borderRadius: '4px',
                    color: currentPage === pageNum ? '#000' : '#aaa',
                    fontSize: '10px', fontWeight: currentPage === pageNum ? '700' : '500',
                    fontFamily: 'monospace', cursor: 'pointer',
                  }}
                >{pageNum}</button>
              )
            })}

            <button
              onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ width: '26px', height: '26px', background: 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)', border: '1px solid rgba(255,255,255,0.16)', borderRadius: '4px', color: '#aaa', fontSize: '14px', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer' }}
            >-</button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ width: '26px', height: '26px', background: 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)', border: '1px solid rgba(255,255,255,0.16)', borderRadius: '4px', color: '#aaa', fontSize: '12px', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer' }}
            >-</button>
          </div>
        )}
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

                        {!hideCharts && flowTrackingFilters.showCharts &&
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

                        {!hideCharts && flowTrackingFilters.showCharts &&
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
      {!isSidebarPanel && showFlowSidebar && (
        <div
          style={{
            width: '38%',
            height: 'calc(100vh - 125px)',
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
            leapRsData={leapRsData}
            leap52wkData={leap52wkData}
            leapSeasonalData={leapSeasonalData}
            parentOptionPrices={currentOptionPrices}
            parentStockPrices={currentPrices}
            sweepSenseData={sweepSenseDataStable}
            sweepSenseScanning={modeLoadingStep !== null || sweepSenseSettling || (sweepSenseBgActive && !sweepSenseDataStable)}
            sweepSenseProgress={gradingProgress}
          />
        </div>
      )}
      {!isSidebarPanel && isMobileView && isFlowTrackingOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9990,
            background: '#000000',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <FlowTrackingPanel
            onClose={() => setIsFlowTrackingOpen(false)}
            initialTab={mobileFlowInitialTab}
            relativeStrengthData={relativeStrengthData}
            historicalStdDevs={historicalStdDevs}
            comboTradeMap={comboTradeMap}
            dealerZoneCache={dealerZoneCache}
            liveFlows={trackedFlows}
            leapRsData={leapRsData}
            leap52wkData={leap52wkData}
            leapSeasonalData={leapSeasonalData}
            parentOptionPrices={currentOptionPrices}
            parentStockPrices={currentPrices}
            sweepSenseData={sweepSenseDataStable}
            sweepSenseScanning={modeLoadingStep !== null || sweepSenseSettling || (sweepSenseBgActive && !sweepSenseDataStable)}
            sweepSenseProgress={gradingProgress}
          />
        </div>
      )}

      {/* Tablet/laptop: slide-in Flow Tracking Panel toggle button + drawer */}
      {!isSidebarPanel && showFlowDrawer && (
        <>
          {/* Tab button - fixed on the right edge */}
          <button
            onClick={() => setTabletPanelOpen((v) => !v)}
            style={{
              position: 'fixed',
              top: '50%',
              right: tabletPanelOpen ? '100vw' : '0px',
              transform: 'translateY(-50%)',
              zIndex: 10010,
              background: 'linear-gradient(180deg, #1a1a1a 0%, #0a0a0a 100%)',
              border: '1px solid #ff8500',
              borderRight: tabletPanelOpen ? '1px solid #ff8500' : 'none',
              borderRadius: tabletPanelOpen ? '8px 0 0 8px' : '8px 0 0 8px',
              color: '#ff8500',
              padding: '10px 6px',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              writingMode: 'vertical-rl',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '1.5px',
              textTransform: 'uppercase',
              fontFamily: 'monospace',
              boxShadow: '-4px 0 16px rgba(0,0,0,0.8)',
              transition: 'right 0.3s ease',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ff8500" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            {tabletPanelOpen ? '?' : 'A+'}
          </button>

          {/* Backdrop */}
          {tabletPanelOpen && (
            <div
              onClick={() => setTabletPanelOpen(false)}
              style={{
                position: 'fixed', inset: 0, zIndex: 10005,
                background: 'rgba(0,0,0,0.45)',
              }}
            />
          )}

          {/* Drawer */}
          <div
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              bottom: 0,
              width: '100vw',
              zIndex: 10008,
              background: '#000000',
              borderLeft: '1px solid #ff8500',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              transform: tabletPanelOpen ? 'translateX(0)' : 'translateX(100%)',
              transition: 'transform 0.3s ease',
              boxShadow: '-8px 0 32px rgba(0,0,0,0.9)',
            }}
          >
            {/* Drawer header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px',
              borderBottom: '1px solid #ff8500',
              background: 'linear-gradient(180deg, #141414 0%, #080808 100%)',
              flexShrink: 0,
            }}>
              <span style={{ color: '#ff8500', fontWeight: 900, fontSize: '14px', fontFamily: 'monospace', letterSpacing: '2px' }}>A+ FLOW TRACKER</span>
              <button
                onClick={() => setTabletPanelOpen(false)}
                style={{ background: 'none', border: 'none', color: '#888', fontSize: '20px', cursor: 'pointer', lineHeight: 1 }}
              >×</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <FlowTrackingPanel
                onClose={() => setTabletPanelOpen(false)}
                relativeStrengthData={relativeStrengthData}
                historicalStdDevs={historicalStdDevs}
                comboTradeMap={comboTradeMap}
                dealerZoneCache={dealerZoneCache}
                liveFlows={trackedFlows}
                leapRsData={leapRsData}
                leap52wkData={leap52wkData}
                leapSeasonalData={leapSeasonalData}
                parentOptionPrices={currentOptionPrices}
                parentStockPrices={currentPrices}
                sweepSenseData={sweepSenseDataStable}
                sweepSenseScanning={modeLoadingStep !== null || sweepSenseSettling || (sweepSenseBgActive && !sweepSenseDataStable)}
                sweepSenseProgress={gradingProgress}
              />
            </div>
          </div>
        </>
      )}

      {/* Mobile Pagination Bar - fixed just above the bottom tab bar */}
      {isMobileView && !isSidebarPanel && !isFlowTrackingOpen && (
        <div
          style={{
            position: 'fixed',
            bottom: 60,
            left: 0,
            right: 0,
            height: '44px',
            zIndex: 998,
            background: 'rgba(0,0,0,0.97)',
            borderTop: '1px solid #1f2937',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingLeft: '12px',
            paddingRight: '12px',
            gap: '8px',
          }}
        >
          {/* Trade counter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
            <span style={{ color: '#ff8500', fontWeight: '700', fontFamily: 'monospace', fontSize: '13px' }}>
              {filteredAndSortedData.length.toLocaleString()}
            </span>
            <span style={{ color: '#555', fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase' }}>trades</span>
          </div>

          {/* Page info */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px', color: '#8a8a8a', fontFamily: 'monospace', fontSize: '12px', flexShrink: 0 }}>
            <span style={{ color: '#ccc' }}>{currentPage}</span>
            <span style={{ color: '#444' }}>/</span>
            <span>{totalPages}</span>
          </div>

          {/* Pagination buttons */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                style={{
                  width: '32px', height: '32px',
                  background: 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)',
                  border: '1px solid rgba(255,255,255,0.16)',
                  borderRadius: '5px',
                  color: currentPage === 1 ? '#333' : '#aaa',
                  fontSize: '16px',
                  cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                -
              </button>

              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum
                if (totalPages <= 5) pageNum = i + 1
                else if (currentPage <= 3) pageNum = i + 1
                else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i
                else pageNum = currentPage - 2 + i
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    style={{
                      width: '32px', height: '32px',
                      background: currentPage === pageNum ? 'rgba(255,133,0,0.9)' : 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)',
                      border: currentPage === pageNum ? '1px solid rgba(255,133,0,0.9)' : '1px solid rgba(255,255,255,0.16)',
                      borderRadius: '5px',
                      color: currentPage === pageNum ? '#000' : '#aaa',
                      fontSize: '11px',
                      fontWeight: currentPage === pageNum ? '700' : '500',
                      fontFamily: 'monospace',
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {pageNum}
                  </button>
                )
              })}

              <button
                onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                style={{
                  width: '32px', height: '32px',
                  background: 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)',
                  border: '1px solid rgba(255,255,255,0.16)',
                  borderRadius: '5px',
                  color: currentPage === totalPages ? '#333' : '#aaa',
                  fontSize: '16px',
                  cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                -
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
