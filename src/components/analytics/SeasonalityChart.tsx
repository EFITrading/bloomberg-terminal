'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'

import dynamic from 'next/dynamic'

import GlobalDataCache from '../../lib/GlobalDataCache'
import ElectionCycleService, { ElectionCycleData } from '../../lib/electionCycleService'
import PolygonService from '../../lib/polygonService'
import SeasonaxLanding from '../seasonax/SeasonaxLanding'
import { useSeasonalityChartMobile } from './useSeasonalityChartMobile'
import AlmanacDailyChart from './AlmanacDailyChart'
import HorizontalMonthlyReturns from './HorizontalMonthlyReturns'
import SeasonaxMainChart from './SeasonaxMainChart'
import SeasonaxStatistics from './SeasonaxStatistics'
import SeasonaxSymbolSearch from './SeasonaxSymbolSearch'

const EFIChart = dynamic(() => import('../trading/EFICharting'), { ssr: false })

// Types for Polygon API data
interface PolygonDataPoint {
  v: number // volume
  vw: number // volume weighted average price
  o: number // open
  c: number // close
  h: number // high
  l: number // low
  t: number // timestamp
  n: number // number of transactions
}

// Create polygon service instance
const polygonService = new PolygonService()
const electionCycleService = new ElectionCycleService()

interface DailySeasonalData {
  dayOfYear: number
  month: number
  day: number
  monthName: string
  avgReturn: number
  cumulativeReturn: number
  occurrences: number
  positiveYears: number
  winningTrades: number
  pattern: number
  yearlyReturns: { [year: number]: number }
}

interface SeasonalAnalysis {
  symbol: string
  companyName: string
  currency: string
  period: string
  dailyData: DailySeasonalData[]
  statistics: {
    annualizedReturn: number
    averageReturn: number
    medianReturn: number
    totalReturn: number
    winningTrades: number
    totalTrades: number
    winRate: number
    profit: number
    averageProfit: number
    maxProfit: number
    gains: number
    losses: number
    profitPercentage: number
    lossPercentage: number
    yearsOfData: number
    bestYear: { year: number; return: number }
    worstYear: { year: number; return: number }
  }
  patternReturns: { [year: number]: number }
  spyComparison?: {
    bestMonths: Array<{ month: string; outperformance: number }>
    worstMonths: Array<{ month: string; outperformance: number }>
    bestQuarters: Array<{ quarter: string; outperformance: number }>
    worstQuarters: Array<{ quarter: string; outperformance: number }>
    monthlyData: Array<{ month: string; outperformance: number }>
    best30DayPeriod?: {
      period: string
      return: number
      startDate: string
      endDate: string
    }
    worst30DayPeriod?: {
      period: string
      return: number
      startDate: string
      endDate: string
    }
  }
}

interface ChartSettings {
  startDate: string
  endDate: string
  yearsOfData: number
  showCumulative: boolean
  showPatternReturns: boolean
  selectedYears: number[]
  smoothing: boolean
  detrend: boolean
  showCurrentDate: boolean
  comparisonSymbols: string[]
}

interface SeasonalityChartProps {
  autoStart?: boolean
  initialSymbol?: string
  onClose?: () => void
  hideControls?: boolean
  hideScreener?: boolean
  hideMonthlyReturns?: boolean
  onSymbolChange?: (symbol: string) => void
  externalElectionMode?: string
  externalYears?: number
  onSweetSpotClick?: () => void
  onPainPointClick?: () => void
  externalSweetSpot?: boolean
  externalPainPoint?: boolean
  onMonthlyDataLoaded?: (
    monthlyData: Array<{ month: string; outperformance: number }>,
    best30Day?: any,
    worst30Day?: any,
    mode?: 'normal' | 'election'
  ) => void
  chartHeight?: number
  externalSelectedEvent?: string | null
  externalSelectedPatterns?: string[]
}

const SeasonalityChart: React.FC<SeasonalityChartProps> = ({
  autoStart = false,
  initialSymbol,
  onClose,
  hideControls = false,
  hideScreener = false,
  hideMonthlyReturns = false,
  onSymbolChange,
  externalElectionMode,
  externalYears,
  onSweetSpotClick: externalSweetSpotClick,
  onPainPointClick: externalPainPointClick,
  externalSweetSpot = false,
  externalPainPoint = false,
  onMonthlyDataLoaded,
  chartHeight = 650,
  externalSelectedEvent,
  externalSelectedPatterns = [],
}) => {
  const [selectedSymbol, setSelectedSymbol] = useState<string>(initialSymbol || '')
  const [seasonalData, setSeasonalData] = useState<SeasonalAnalysis | null>(null)
  const [electionData, setElectionData] = useState<ElectionCycleData | null>(null)
  const [isElectionMode, setIsElectionMode] = useState<boolean>(false)
  const [selectedElectionPeriod, setSelectedElectionPeriod] = useState<string>('Election Year')
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [sweetSpotPeriod, setSweetSpotPeriod] = useState<{
    startDay: number
    endDay: number
    period: string
  } | null>(null)
  const [painPointPeriod, setPainPointPeriod] = useState<{
    startDay: number
    endDay: number
    period: string
  } | null>(null)
  // Pre-search toggle state — applied automatically after data loads
  const [sweetSpotActive, setSweetSpotActive] = useState<boolean>(externalSweetSpot)
  const [painPointActive, setPainPointActive] = useState<boolean>(externalPainPoint)
  const [notepadText, setNotepadText] = useState<string>('')
  const [savedNote, setSavedNote] = useState<string>('')
  const [isEditingNote, setIsEditingNote] = useState<boolean>(false)
  const [isElectionDropdownOpen, setIsElectionDropdownOpen] = useState<boolean>(false)
  const [displayElectionPeriod, setDisplayElectionPeriod] = useState<string>('Normal Mode')
  const [monthlyViewActive, setMonthlyViewActive] = useState<boolean>(false)
  const [selectedMonthIndex, setSelectedMonthIndex] = useState<number | null>(null)
  const [selectedMonthName, setSelectedMonthName] = useState<string>('')
  const { isMobileView } = useSeasonalityChartMobile()
  const [availableYears, setAvailableYears] = useState<number[]>([1, 3, 5, 10, 15, 20]) // Dynamic based on actual data
  const [showCurrentYearLine, setShowCurrentYearLine] = useState<boolean>(false)
  const [currentYearMode, setCurrentYearMode] = useState<'off' | 'raw' | 'benchmarked'>('off')
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false)

  // Escape key exits fullscreen
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsFullscreen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // When entering fullscreen, let layout settle then trigger a resize so the almanac canvas redraws
  useEffect(() => {
    if (!isFullscreen) return
    const id = setTimeout(() => window.dispatchEvent(new Event('resize')), 100)
    return () => clearTimeout(id)
  }, [isFullscreen])

  // Compare functionality state
  const [isCompareMode, setIsCompareMode] = useState<boolean>(false)
  const [compareSymbol, setCompareSymbol] = useState<string>('')
  const [compareSeasonalData, setCompareSeasonalData] = useState<SeasonalAnalysis | null>(null)
  const [compareElectionData, setCompareElectionData] = useState<ElectionCycleData | null>(null)

  // Multi-scan state
  const [multiScanData, setMultiScanData] = useState<SeasonalAnalysis[]>([])
  // Prevents selectedSymbol useEffect from re-fetching after a quick scan sets state directly
  const isQuickScanRef = useRef(false)
  // Remembers the active quick-scan tickers so election-cycle mode can average them too
  const quickScanTickersRef = useRef<string[]>([])
  // Stable ref for the onMonthlyDataLoaded callback — avoids infinite loop when parent passes inline fn
  const onMonthlyDataLoadedRef = useRef(onMonthlyDataLoaded)
  // ── DEBUG refs for almanac column height chain ──
  const dbgOuterRef = useRef<HTMLDivElement>(null)
  const dbgFlexSlotRef = useRef<HTMLDivElement>(null)
  const dbgAbsWrapRef = useRef<HTMLDivElement>(null)
  const dbgAlmanacRootRef = useRef<HTMLDivElement>(null)
  useEffect(() => { onMonthlyDataLoadedRef.current = onMonthlyDataLoaded }, [onMonthlyDataLoaded])

  // ── Trend sync: how well does the seasonal avg match current-year price action ──
  const trendSync = useMemo(() => {
    const data = isElectionMode ? electionData : seasonalData
    if (!data?.dailyData?.length) return null

    const currentYear = new Date().getFullYear()
    const today = new Date()
    const startOfYear = new Date(currentYear, 0, 1)
    const currentDayOfYear =
      Math.floor((today.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24)) + 1

    const pairs: Array<{ avg: number; actual: number }> = []
    for (const dayData of data.dailyData) {
      if (dayData.dayOfYear > currentDayOfYear) break
      const actualReturn = dayData.yearlyReturns[currentYear]
      if (actualReturn !== undefined) {
        pairs.push({ avg: dayData.avgReturn, actual: actualReturn })
      }
    }
    if (pairs.length < 10) return null

    // Sliding 10-day window directional agreement
    const windowSize = 10
    let agreements = 0
    let total = 0
    for (let i = windowSize; i <= pairs.length; i++) {
      const slice = pairs.slice(i - windowSize, i)
      const avgDir = slice.reduce((s, p) => s + p.avg, 0) >= 0
      const actualDir = slice.reduce((s, p) => s + p.actual, 0) >= 0
      if (avgDir === actualDir) agreements++
      total++
    }

    const score = total > 0 ? Math.round((agreements / total) * 100) : 0
    if (score >= 65) return { score, label: 'FOLLOWING', color: '#00FF88' }
    if (score >= 45) return { score, label: 'MIXED', color: '#FFD700' }
    return { score, label: 'DIVERGING', color: '#FF4444' }
  }, [seasonalData, electionData, isElectionMode])

  // ── Contextual insight derived from price action + correlation ──
  const trendInsight = useMemo(() => {
    if (!trendSync) return null
    const data = isElectionMode ? electionData : seasonalData
    if (!data?.dailyData?.length) return null

    const currentYear = new Date().getFullYear()
    const today = new Date()
    const startOfYear = new Date(currentYear, 0, 1)
    const currentDayOfYear =
      Math.floor((today.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24)) + 1

    // Build current year daily cumulative from yearlyReturns
    const sorted = [...data.dailyData].sort((a, b) => a.dayOfYear - b.dayOfYear)
    let cumulative = 0
    const cyPoints: number[] = []
    for (const d of sorted) {
      if (d.dayOfYear > currentDayOfYear) break
      const r = d.yearlyReturns[currentYear]
      if (r !== undefined) {
        cumulative += r
        cyPoints.push(cumulative)
      }
    }
    if (cyPoints.length < 10) return null

    const lastVal = cyPoints[cyPoints.length - 1]
    // All historical year-end cumulative values
    const allYears = Object.keys(data.patternReturns).map(Number)
    const allFinals: number[] = []
    for (const yr of allYears) {
      let cum = 0
      for (const d of sorted) {
        const r = d.yearlyReturns[yr]
        if (r !== undefined) cum += r
      }
      if (cum !== 0) allFinals.push(cum)
    }
    const yearMax = allFinals.length ? Math.max(...allFinals) : null
    const yearMin = allFinals.length ? Math.min(...allFinals) : null

    // 1-month accumulation: check if last 20 data points are net positive (building up)
    const last20 = cyPoints.slice(-20)
    const isAccumulating = last20.length >= 10 && last20[last20.length - 1] > last20[0]

    // 52-week proxy: is current trajectory near multi-year highs or lows?
    const nearHigh = yearMax !== null && lastVal >= yearMax * 0.85
    const nearLow = yearMin !== null && lastVal <= yearMin * 0.85

    if (trendSync.score >= 80) return 'Legacy Seasonal Trend'
    if (trendSync.score <= 40) return 'Beats a Coin Toss'
    if (nearHigh) return 'Bearish Trends Less Aggressive'
    if (nearLow) return 'Bullish Trends Less Strong'
    if (isAccumulating) return 'Trend Expected Strong'
    return null
  }, [trendSync, seasonalData, electionData, isElectionMode])

  // ── Current-year cumulative series (SPY-relative, from seasonal data) ──
  const currentYearBenchmarkedSeries = useMemo(() => {
    const data = isElectionMode ? electionData : seasonalData
    if (!data?.dailyData?.length) return null

    const currentYear = new Date().getFullYear()
    const today = new Date()
    const startOfYear = new Date(currentYear, 0, 1)
    const currentDayOfYear =
      Math.floor((today.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24)) + 1

    const result: Array<{ dayOfYear: number; cumulativeReturn: number }> = []
    let cumulative = 0
    const sorted = [...data.dailyData].sort((a, b) => a.dayOfYear - b.dayOfYear)
    for (const dayData of sorted) {
      if (dayData.dayOfYear > currentDayOfYear) break
      const actualReturn = dayData.yearlyReturns[currentYear]
      if (actualReturn !== undefined) {
        cumulative += actualReturn
        result.push({ dayOfYear: dayData.dayOfYear, cumulativeReturn: cumulative })
      }
    }
    return result.length >= 5 ? result : null
  }, [seasonalData, electionData, isElectionMode])

  // ── Raw current-year series (absolute price performance, fetched fresh) ──
  const [currentYearRawSeries, setCurrentYearRawSeries] = useState<Array<{
    dayOfYear: number
    cumulativeReturn: number
  }> | null>(null)

  useEffect(() => {
    if (currentYearMode !== 'raw' || !selectedSymbol) {
      setCurrentYearRawSeries(null)
      return
    }
    const currentYear = new Date().getFullYear()
    const today = new Date().toISOString().split('T')[0]
    polygonService
      .getHistoricalData(selectedSymbol, `${currentYear}-01-01`, today, 'day', 1)
      .then((resp) => {
        if (!resp?.results?.length) {
          setCurrentYearRawSeries(null)
          return
        }
        const results = resp.results
        const startOfYear = new Date(currentYear, 0, 1)
        const series: Array<{ dayOfYear: number; cumulativeReturn: number }> = []
        let cumulative = 0
        for (let i = 1; i < results.length; i++) {
          const date = new Date(results[i].t)
          const dayOfYear =
            Math.floor((date.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24)) + 1
          const dailyReturn = ((results[i].c - results[i - 1].c) / results[i - 1].c) * 100
          cumulative += dailyReturn
          series.push({ dayOfYear, cumulativeReturn: cumulative })
        }
        setCurrentYearRawSeries(series.length >= 5 ? series : null)
      })
      .catch(() => setCurrentYearRawSeries(null))
  }, [currentYearMode, selectedSymbol])

  const currentYearDisplaySeries =
    currentYearMode === 'benchmarked'
      ? currentYearBenchmarkedSeries
      : currentYearMode === 'raw'
        ? currentYearRawSeries
        : null

  // keep legacy alias so trendSync badge area compiles
  const currentYearSeries = currentYearBenchmarkedSeries

  const [chartSettings, setChartSettings] = useState<ChartSettings>({
    startDate: '11 Oct',
    endDate: '6 Nov',
    yearsOfData: externalYears || 20,
    showCumulative: true,
    showPatternReturns: true,
    selectedYears: [],
    smoothing: true,
    detrend: true,
    showCurrentDate: true,
    comparisonSymbols: [],
  })

  // isInitialMount ref: on first render we only scan if autoStart=true.
  // On subsequent selectedSymbol changes (user input or prop update) we always scan.
  const isInitialMount = useRef(true)

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      // Only auto-scan on mount when autoStart=true AND we have a symbol
      if (autoStart && selectedSymbol) {
        loadSeasonalAnalysis(selectedSymbol)
      }
      return
    }
    // Subsequent symbol changes: always scan if symbol is set
    if (selectedSymbol) {
      if (isQuickScanRef.current) {
        isQuickScanRef.current = false
        return
      }
      loadSeasonalAnalysis(selectedSymbol)
    }
  }, [selectedSymbol])

  // Update selected symbol when initialSymbol prop changes
  useEffect(() => {
    if (initialSymbol && initialSymbol !== selectedSymbol) {
      setSelectedSymbol(initialSymbol)
    }
  }, [initialSymbol])

  // Sync external years changes
  useEffect(() => {
    if (externalYears && externalYears !== chartSettings.yearsOfData) {
      setChartSettings((prev) => ({ ...prev, yearsOfData: externalYears }))
      // Reload data with new years
      if (selectedSymbol) {
        if (isElectionMode) {
          loadElectionCycleAnalysis(selectedSymbol, selectedElectionPeriod as any, externalYears)
        } else {
          loadSeasonalAnalysis(selectedSymbol, externalYears)
        }
      }
    }
  }, [externalYears])

  // Sync external election mode changes
  useEffect(() => {
    if (externalElectionMode && externalElectionMode !== displayElectionPeriod) {
      setDisplayElectionPeriod(externalElectionMode)
      if (externalElectionMode === 'Normal Mode') {
        handleElectionModeToggle(false)
      } else {
        handleElectionPeriodSelect(externalElectionMode)
      }
    }
  }, [externalElectionMode])

  // Notify parent when normal seasonal data loads/changes
  useEffect(() => {
    if (seasonalData?.spyComparison?.monthlyData && onMonthlyDataLoadedRef.current) {
      onMonthlyDataLoadedRef.current(
        seasonalData.spyComparison.monthlyData,
        seasonalData.spyComparison.best30DayPeriod,
        seasonalData.spyComparison.worst30DayPeriod,
        'normal'
      )
    }
  }, [seasonalData])

  // Notify parent when election/cycle seasonal data loads/changes
  useEffect(() => {
    if (!isFullscreen) return
    const report = () => {
      const outer = dbgOuterRef.current
      const flexSlot = dbgFlexSlotRef.current

      const logEl = (label: string, el: Element | null) => {
        if (!el) { console.warn(`[ALMANAC-DBG] ${label} — NOT FOUND`); return }
        const cs = getComputedStyle(el)
        const rect = el.getBoundingClientRect()
        console.log(
          `[ALMANAC-DBG] ${label}\n` +
          `  rect: ${rect.width.toFixed(0)}×${rect.height.toFixed(0)} (top:${rect.top.toFixed(0)})\n` +
          `  display:${cs.display}  flex:${cs.flex}  flexGrow:${cs.flexGrow}  flexBasis:${cs.flexBasis}\n` +
          `  height:${cs.height}  minHeight:${cs.minHeight}  maxHeight:${cs.maxHeight}\n` +
          `  overflow:${cs.overflow}  overflowY:${cs.overflowY}\n` +
          `  flexDirection:${cs.flexDirection}  alignItems:${cs.alignItems}`
        )
      }

      // Walk every element in the chain
      logEl('1. outer (.seasonax-fullscreen-almanac)', outer)
      logEl('2. flex-slot (flex:1 wrapper)', flexSlot)

      // Walk into the almanac wrap and its children
      const wrap = flexSlot?.querySelector('.seasonax-fs-almanac-wrap') ?? null
      logEl('3. .seasonax-fs-almanac-wrap', wrap)

      const almanacRoot = wrap?.querySelector('.almanac-daily-chart') ?? null
      logEl('4. .almanac-daily-chart (root div)', almanacRoot)

      const headerRow = almanacRoot?.querySelector('.chart-header-row') ?? null
      logEl('5. .chart-header-row', headerRow)

      const chartContainer = almanacRoot?.querySelector('.chart-container') ?? null
      logEl('6. .chart-container', chartContainer)

      const canvas = chartContainer?.querySelector('canvas') ?? null
      if (canvas) {
        const cs = getComputedStyle(canvas)
        const rect = canvas.getBoundingClientRect()
        console.log(
          `[ALMANAC-DBG] 7. canvas\n` +
          `  rect: ${rect.width.toFixed(0)}×${rect.height.toFixed(0)}\n` +
          `  style.width:${(canvas as HTMLCanvasElement).style.width}  style.height:${(canvas as HTMLCanvasElement).style.height}\n` +
          `  computed width:${cs.width}  computed height:${cs.height}\n` +
          `  canvas.width attr:${(canvas as HTMLCanvasElement).width}  canvas.height attr:${(canvas as HTMLCanvasElement).height}`
        )
      } else {
        console.warn('[ALMANAC-DBG] 7. canvas — NOT FOUND in .chart-container')
      }

      // Also check the grid parent to see what height it resolves to
      const grid = outer?.parentElement ?? null
      logEl('0. GRID PARENT (outer.parentElement)', grid)
    }
    // 300ms + 1s snapshots to see if layout changes after initial render
    const id1 = setTimeout(report, 300)
    const id2 = setTimeout(report, 1200)
    return () => { clearTimeout(id1); clearTimeout(id2) }
  }, [isFullscreen])

  useEffect(() => {
    if (electionData?.spyComparison?.monthlyData && onMonthlyDataLoadedRef.current) {
      onMonthlyDataLoadedRef.current(
        electionData.spyComparison.monthlyData,
        electionData.spyComparison.best30DayPeriod,
        electionData.spyComparison.worst30DayPeriod,
        'election'
      )
    }
  }, [electionData])

  const handleElectionModeToggle = async (isEnabled: boolean) => {
    if (!isEnabled) {
      // Switch back to normal seasonal mode
      setIsElectionMode(false)
      setElectionData(null)
      // Reload regular seasonal data if we don't have it or need to refresh
      if (!seasonalData) {
        await loadSeasonalAnalysis(selectedSymbol)
      }
    } else {
      setIsElectionMode(true)
    }
  }

  const handleElectionPeriodSelect = async (period: string) => {
    setSelectedElectionPeriod(period)
    setIsElectionMode(true)
    await loadElectionCycleAnalysis(
      selectedSymbol,
      period as 'Election Year' | 'Post-Election' | 'Mid-Term' | 'Pre-Election'
    )
  }

  const loadElectionCycleAnalysis = async (
    symbol: string,
    electionType: 'Election Year' | 'Post-Election' | 'Mid-Term' | 'Pre-Election',
    yearsOverride?: number
  ) => {
    setLoading(true)
    setError(null)

    try {
      const yearsToUse = Math.min(yearsOverride ?? chartSettings.yearsOfData, 20)
      const scanTickers = quickScanTickersRef.current

      if (scanTickers.length > 0) {
        // ── Multi-ticker: fetch election data for each ticker and average ──
        const results = await Promise.all(
          scanTickers.map((t) =>
            electionCycleService.analyzeElectionCycleSeasonality(t, electionType, yearsToUse).catch(() => null)
          )
        )
        const valid = results.filter(Boolean) as ElectionCycleData[]
        if (valid.length === 0) {
          setError('No election cycle data for this group')
          return
        }

        // Average dailyData
        const dayMap: Record<number, { returns: number[]; yearlyReturnsArr: { [year: number]: number }[]; ref: ElectionCycleData['dailyData'][0] }> = {}
        valid.forEach((a) => {
          a.dailyData.forEach((pt) => {
            if (!dayMap[pt.dayOfYear]) dayMap[pt.dayOfYear] = { returns: [], yearlyReturnsArr: [], ref: pt }
            dayMap[pt.dayOfYear].returns.push(pt.cumulativeReturn)
            dayMap[pt.dayOfYear].yearlyReturnsArr.push(pt.yearlyReturns)
          })
        })
        const avgDailyData = Object.entries(dayMap)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([, { returns, yearlyReturnsArr, ref }]) => {
            const allYears = new Set<number>()
            yearlyReturnsArr.forEach((yr) => Object.keys(yr).forEach((y) => allYears.add(Number(y))))
            const avgYearlyReturns: { [year: number]: number } = {}
            allYears.forEach((year) => {
              const vals = yearlyReturnsArr.map((yr) => yr[year]).filter((v) => v !== undefined) as number[]
              if (vals.length > 0) avgYearlyReturns[year] = vals.reduce((s, v) => s + v, 0) / vals.length
            })
            return { ...ref, cumulativeReturn: returns.reduce((s, v) => s + v, 0) / returns.length, yearlyReturns: avgYearlyReturns }
          })

        // Monthly returns from avgDailyData
        const monthBuckets: Record<number, { name: string; sum: number }> = {}
        avgDailyData.forEach((d) => {
          if (!monthBuckets[d.month]) monthBuckets[d.month] = { name: d.monthName, sum: 0 }
          monthBuckets[d.month].sum += d.avgReturn
        })
        const avgMonthlyData = Object.entries(monthBuckets)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([, { name, sum }]) => ({ month: name, outperformance: sum }))

        // 30-day windows from avgDailyData
        const windowSize = 30
        let avgBest = { startDay: 1, endDay: 30, avgReturn: -999, period: '', startDate: '', endDate: '' }
        let avgWorst = { startDay: 1, endDay: 30, avgReturn: 999, period: '', startDate: '', endDate: '' }
        for (let startDay = 1; startDay <= 365 - windowSize; startDay++) {
          const endDay = startDay + windowSize - 1
          const win = avgDailyData.filter((d) => d.dayOfYear >= startDay && d.dayOfYear <= endDay)
          if (win.length >= 25) {
            const avg = win.reduce((s, d) => s + d.avgReturn, 0) / win.length
            const sp = avgDailyData.find((d) => d.dayOfYear === startDay)
            const ep = avgDailyData.find((d) => d.dayOfYear === endDay)
            if (sp && ep) {
              if (avg > avgBest.avgReturn) avgBest = { startDay, endDay, avgReturn: avg, period: `${sp.monthName} ${sp.day} - ${ep.monthName} ${ep.day}`, startDate: `${sp.monthName} ${sp.day}`, endDate: `${ep.monthName} ${ep.day}` }
              if (avg < avgWorst.avgReturn) avgWorst = { startDay, endDay, avgReturn: avg, period: `${sp.monthName} ${sp.day} - ${ep.monthName} ${ep.day}`, startDate: `${sp.monthName} ${sp.day}`, endDate: `${ep.monthName} ${ep.day}` }
            }
          }
        }

        const avgElectionData: ElectionCycleData = {
          ...valid[0],
          symbol: 'AVG',
          companyName: 'Average',
          dailyData: avgDailyData,
          spyComparison: {
            ...(valid[0].spyComparison ?? {}),
            monthlyData: avgMonthlyData,
            best30DayPeriod: { period: avgBest.period, return: avgBest.avgReturn * 30, startDate: avgBest.startDate, endDate: avgBest.endDate },
            worst30DayPeriod: { period: avgWorst.period, return: avgWorst.avgReturn * 30, startDate: avgWorst.startDate, endDate: avgWorst.endDate },
          } as ElectionCycleData['spyComparison'],
        }

        // Sweet spot / pain point for the averaged election data
        const { bestSweetSpot, worstPainPoint } = analyzeLongTermPatterns(avgDailyData)
        setSweetSpotPeriod({ startDay: bestSweetSpot.startDay, endDay: bestSweetSpot.endDay, period: bestSweetSpot.period })
        setPainPointPeriod({ startDay: worstPainPoint.startDay, endDay: worstPainPoint.endDay, period: worstPainPoint.period })
        setSweetSpotActive(false)
        setPainPointActive(false)

        // Also update multiScanData to election-mode versions for individual lines
        const multiElection = valid.map((a) => ({
          ...a,
          dailyData: a.dailyData,
        })) as unknown as SeasonalAnalysis[]
        setMultiScanData(multiElection)

        setElectionData(avgElectionData)
      } else {
        // ── Single ticker: original behaviour ──
        const electionResult = await electionCycleService.analyzeElectionCycleSeasonality(
          symbol,
          electionType,
          yearsToUse
        )
        if (electionResult) {
          setElectionData(electionResult)
        } else {
          setError('Failed to load election cycle data')
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load election cycle data'
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const loadSeasonalAnalysis = async (symbol: string, yearsOverride?: number) => {
    setLoading(true)
    setError(null)

    // Always reset sweet/pain on new ticker load — user must click to activate
    setSweetSpotPeriod(null)
    setSweetSpotActive(false)
    setPainPointPeriod(null)
    setPainPointActive(false)

    try {
      const cache = GlobalDataCache.getInstance()

      // Get ticker details first to determine actual listing date
      const cachedTicker = cache.get(GlobalDataCache.keys.TICKER_DETAILS(symbol))
      let tickerDetails

      if (cachedTicker) {
        tickerDetails = cachedTicker
      } else {
        tickerDetails = await polygonService.getTickerDetails(symbol)
        if (tickerDetails) {
          cache.set(GlobalDataCache.keys.TICKER_DETAILS(symbol), tickerDetails)
        }
      }

      // Determine actual start date - query maximum available data (30 years)
      const endDate = new Date()
      const startDate = new Date()

      // Query for maximum 30 years of data (ignore unreliable listing dates)
      // The API will return what's actually available, and we'll calculate years from that
      startDate.setFullYear(endDate.getFullYear() - 30)

      const startDateStr = startDate.toISOString().split('T')[0]
      const endDateStr = endDate.toISOString().split('T')[0]

      // Check cache first for faster loading
      let historicalResponse, spyResponse

      const cachedHistorical = cache.get(
        GlobalDataCache.keys.HISTORICAL_DATA(symbol, startDateStr, endDateStr)
      )

      if (cachedHistorical) {
        historicalResponse = cachedHistorical

        // For SPY comparison
        if (symbol.toUpperCase() !== 'SPY') {
          const cachedSPY = cache.get(
            GlobalDataCache.keys.HISTORICAL_DATA('SPY', startDateStr, endDateStr)
          )
          if (cachedSPY) {
            spyResponse = cachedSPY
          } else {
            spyResponse = await polygonService.getHistoricalData('SPY', startDateStr, endDateStr)
            if (spyResponse) {
              cache.set(
                GlobalDataCache.keys.HISTORICAL_DATA('SPY', startDateStr, endDateStr),
                spyResponse
              )
            }
          }
        } else {
          // For SPY itself, use the cached SPY data as both ticker and comparison
          spyResponse = cachedHistorical
        }
      } else {
        // Fetch historical data - if symbol is SPY, only fetch SPY data once
        if (symbol.toUpperCase() === 'SPY') {
          // For SPY, fetch once and use it as both the ticker and comparison
          historicalResponse = await polygonService.getHistoricalData(
            symbol,
            startDateStr,
            endDateStr
          )
          spyResponse = historicalResponse // Use same data for SPY comparison calculations
        } else {
          // For other symbols, fetch both symbol and SPY for comparison
          ;[historicalResponse, spyResponse] = await Promise.all([
            polygonService.getHistoricalData(symbol, startDateStr, endDateStr),
            polygonService.getHistoricalData('SPY', startDateStr, endDateStr),
          ])
        }

        // Cache the results for next time
        if (historicalResponse) {
          cache.set(
            GlobalDataCache.keys.HISTORICAL_DATA(symbol, startDateStr, endDateStr),
            historicalResponse
          )
        }
        if (spyResponse) {
          cache.set(
            GlobalDataCache.keys.HISTORICAL_DATA('SPY', startDateStr, endDateStr),
            spyResponse
          )
        }
      }

      if (!historicalResponse) {
        throw new Error(
          'API returned no response for ' + symbol + ' \u2014 check Polygon API key or network'
        )
      }
      if (historicalResponse.results && historicalResponse.results.length > 0) {
        const firstDate = new Date(historicalResponse.results[0].t)
        const lastDate = new Date(
          historicalResponse.results[historicalResponse.results.length - 1].t
        )
        const actualYearsSpan =
          (lastDate.getTime() - firstDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
        const maxYears = Math.floor(actualYearsSpan)

        // Generate available year options based on actual data span
        let yearOptions: number[] = []

        if (maxYears >= 10) {
          // For 10+ years: show 1, 3, 5, 10, 15 (if available), and actual max
          yearOptions = [1, 3, 5, 10]
          if (maxYears >= 15) yearOptions.push(15)
          if (maxYears !== 15) yearOptions.push(maxYears) // Only add max if different from 15
        } else if (maxYears >= 4) {
          // For 4-9 years: show 1, 3, 5 (if available), and actual max
          yearOptions = [1, 3]
          if (maxYears >= 5) yearOptions.push(5)
          if (maxYears !== 5 && maxYears !== 3) yearOptions.push(maxYears) // Only if different
        } else if (maxYears >= 3) {
          // For 3 years: show only 3
          yearOptions = [3]
        } else if (maxYears >= 2) {
          // For 2 years: show only 2
          yearOptions = [2]
        } else {
          // For 1 year or less: show only 1
          yearOptions = [1]
        }

        // Remove any duplicates just in case
        yearOptions = [...new Set(yearOptions)]

        setAvailableYears(yearOptions)

        // Set default to maximum available years
        if (chartSettings.yearsOfData !== maxYears) {
          setChartSettings((prev) => ({ ...prev, yearsOfData: maxYears }))
        }
      }

      // Filter data based on selected years
      let filteredData = historicalResponse.results
      let filteredSpyData = spyResponse?.results || null

      if (yearsOverride && historicalResponse.results && historicalResponse.results.length > 0) {
        const endDate = new Date(
          historicalResponse.results[historicalResponse.results.length - 1].t
        )
        const cutoffDate = new Date(endDate)
        cutoffDate.setFullYear(endDate.getFullYear() - yearsOverride)

        filteredData = historicalResponse.results.filter((point) => new Date(point.t) >= cutoffDate)

        if (filteredSpyData) {
          filteredSpyData = filteredSpyData.filter((point) => new Date(point.t) >= cutoffDate)
        }
      }

      // Calculate years actually used for processing
      const actualYearsUsed =
        filteredData && filteredData.length > 0
          ? Math.ceil(
            (new Date(filteredData[filteredData.length - 1].t).getTime() -
              new Date(filteredData[0].t).getTime()) /
            (365.25 * 24 * 60 * 60 * 1000)
          )
          : yearsOverride || 20

      // Process data into daily seasonal format with or without SPY comparison
      const processedData = processDailySeasonalData(
        filteredData,
        filteredSpyData,
        symbol,
        tickerDetails?.name || symbol,
        actualYearsUsed
      )

      setSeasonalData(processedData)

      // Auto-apply pre-selected sweet spot / pain point
      if (sweetSpotActive && processedData.dailyData?.length) {
        const { bestSweetSpot } = analyzeLongTermPatterns(processedData.dailyData)
        setSweetSpotPeriod({
          startDay: bestSweetSpot.startDay,
          endDay: bestSweetSpot.endDay,
          period: bestSweetSpot.period,
        })
      }
      if (painPointActive && processedData.dailyData?.length) {
        const { worstPainPoint } = analyzeLongTermPatterns(processedData.dailyData)
        setPainPointPeriod({
          startDay: worstPainPoint.startDay,
          endDay: worstPainPoint.endDay,
          period: worstPainPoint.period,
        })
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load seasonal data'
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const processDailySeasonalData = (
    data: PolygonDataPoint[],
    spyData: PolygonDataPoint[] | null,
    symbol: string,
    companyName: string,
    years: number
  ): SeasonalAnalysis => {
    // Group data by day of year
    const dailyGroups: { [dayOfYear: number]: { date: Date; return: number; year: number }[] } = {}
    const yearlyReturns: { [year: number]: number } = {}

    // Create SPY lookup map for faster access (only if spyData is provided)
    const spyLookup: { [timestamp: number]: PolygonDataPoint } = {}
    if (spyData) {
      spyData.forEach((item) => {
        spyLookup[item.t] = item
      })
    }

    // Process historical data into daily returns
    for (let i = 1; i < data.length; i++) {
      const currentItem = data[i]
      const previousItem = data[i - 1]
      const date = new Date(currentItem.t)
      const year = date.getFullYear()
      const dayOfYear = getDayOfYear(date)

      // Calculate stock return
      const stockReturn = ((currentItem.c - previousItem.c) / previousItem.c) * 100

      let finalReturn = stockReturn

      // If we have SPY data and we're NOT analyzing SPY itself, calculate relative performance vs SPY
      if (spyData && spyData.length > 0 && symbol.toUpperCase() !== 'SPY') {
        const currentSpy = spyLookup[currentItem.t]
        const previousSpy = spyLookup[previousItem.t]

        if (currentSpy && previousSpy) {
          const spyReturn = ((currentSpy.c - previousSpy.c) / previousSpy.c) * 100
          finalReturn = stockReturn - spyReturn // Relative to SPY
        } else {
          // Skip this data point if we don't have corresponding SPY data
          continue
        }
      }
      // If no SPY data OR analyzing SPY itself, use absolute returns

      if (!dailyGroups[dayOfYear]) {
        dailyGroups[dayOfYear] = []
      }

      dailyGroups[dayOfYear].push({
        date,
        return: finalReturn,
        year,
      })

      if (!yearlyReturns[year]) {
        yearlyReturns[year] = 0
      }
      yearlyReturns[year] += finalReturn
    }

    // Calculate daily seasonal data
    const dailyData: DailySeasonalData[] = []
    let cumulativeReturn = 0

    // Process each day of year (1-365)
    for (let dayOfYear = 1; dayOfYear <= 365; dayOfYear++) {
      const dayData = dailyGroups[dayOfYear] || []

      if (dayData.length === 0) continue

      const returns = dayData.map((d) => d.return)
      const avgReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length
      const positiveReturns = returns.filter((ret) => ret > 0).length

      cumulativeReturn += avgReturn

      // Get representative date for this day of year
      const representativeDate = new Date(2024, 0, dayOfYear) // Use 2024 as base year

      const yearlyReturnsByDay: { [year: number]: number } = {}
      dayData.forEach((d) => {
        yearlyReturnsByDay[d.year] = d.return
      })

      dailyData.push({
        dayOfYear,
        month: representativeDate.getMonth() + 1,
        day: representativeDate.getDate(),
        monthName: representativeDate.toLocaleDateString('en-US', { month: 'short' }),
        avgReturn,
        cumulativeReturn,
        occurrences: dayData.length,
        positiveYears: positiveReturns,
        winningTrades: positiveReturns,
        pattern: (positiveReturns / dayData.length) * 100,
        yearlyReturns: yearlyReturnsByDay,
      })
    }

    // Calculate overall statistics
    const allReturns = Object.values(yearlyReturns)
    const totalReturn = cumulativeReturn
    const annualizedReturn = totalReturn / years
    const averageReturn = allReturns.reduce((sum, ret) => sum + ret, 0) / allReturns.length
    const winningYears = allReturns.filter((ret) => ret > 0).length
    const totalTrades = allReturns.length
    const winRate = (winningYears / totalTrades) * 100

    const positiveReturns = allReturns.filter((ret) => ret > 0)
    const negativeReturns = allReturns.filter((ret) => ret < 0)

    const bestYear = {
      year: parseInt(
        Object.keys(yearlyReturns).find(
          (year) => yearlyReturns[parseInt(year)] === Math.max(...allReturns)
        ) || '0'
      ),
      return: Math.max(...allReturns),
    }

    const worstYear = {
      year: parseInt(
        Object.keys(yearlyReturns).find(
          (year) => yearlyReturns[parseInt(year)] === Math.min(...allReturns)
        ) || '0'
      ),
      return: Math.min(...allReturns),
    }

    // Calculate monthly aggregates for best/worst months analysis using proper methodology
    // Group data by month and year for proper monthly return calculation
    const monthlyReturns: { [monthYear: string]: { ticker: number[]; spy: number[] } } = {}

    // First, collect all daily returns by month-year for both ticker and SPY
    for (let i = 1; i < data.length; i++) {
      const currentItem = data[i]
      const previousItem = data[i - 1]
      const date = new Date(currentItem.t)
      const year = date.getFullYear()
      const month = date.getMonth() + 1 // 1-12
      const monthYear = `${year}-${month}`

      const currentSpy = spyLookup[currentItem.t]
      const previousSpy = spyLookup[previousItem.t]

      if (currentSpy && previousSpy) {
        if (!monthlyReturns[monthYear]) {
          monthlyReturns[monthYear] = { ticker: [], spy: [] }
        }

        // Calculate daily returns
        const tickerReturn = ((currentItem.c - previousItem.c) / previousItem.c) * 100
        const spyReturn = ((currentSpy.c - previousSpy.c) / previousSpy.c) * 100

        monthlyReturns[monthYear].ticker.push(tickerReturn)
        monthlyReturns[monthYear].spy.push(spyReturn)
      }
    }

    // Calculate monthly return for each month across all years
    const monthlyData: { [month: number]: { tickerReturns: number[]; spyReturns: number[] } } = {}

    Object.keys(monthlyReturns).forEach((monthYear) => {
      const parts = monthYear.split('-')
      const [year, month] = [Number(parts[0]) || 0, Number(parts[1]) || 0]
      const monthNum = month

      if (!monthlyData[monthNum]) {
        monthlyData[monthNum] = { tickerReturns: [], spyReturns: [] }
      }

      // Calculate monthly return as cumulative of daily returns for that month
      const tickerMonthlyReturn = monthlyReturns[monthYear].ticker.reduce(
        (sum, ret) => sum + ret,
        0
      )
      const spyMonthlyReturn = monthlyReturns[monthYear].spy.reduce((sum, ret) => sum + ret, 0)

      monthlyData[monthNum].tickerReturns.push(tickerMonthlyReturn)
      monthlyData[monthNum].spyReturns.push(spyMonthlyReturn)
    })

    const monthlyAverages = Object.keys(monthlyData).map((month) => {
      const monthNum = parseInt(month)
      const data = monthlyData[monthNum]

      // Calculate average monthly return over 15 years for both ticker and SPY
      const avgTickerReturn =
        data.tickerReturns.length > 0
          ? data.tickerReturns.reduce((sum, ret) => sum + ret, 0) / data.tickerReturns.length
          : 0
      const avgSpyReturn =
        data.spyReturns.length > 0
          ? data.spyReturns.reduce((sum, ret) => sum + ret, 0) / data.spyReturns.length
          : 0

      // Calculate outperformance as ticker average minus SPY average
      // For SPY itself, just show the actual returns instead of comparing to itself
      const outperformance =
        symbol.toUpperCase() === 'SPY' ? avgTickerReturn : avgTickerReturn - avgSpyReturn

      const monthNames = [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
      ]
      return {
        month: monthNames[monthNum - 1],
        avgReturn: avgTickerReturn,
        outperformance: outperformance,
      }
    })

    const sortedMonthsByPerformance = [...monthlyAverages].sort(
      (a, b) => b.outperformance - a.outperformance
    )
    const bestMonths = sortedMonthsByPerformance.slice(0, 3)
    const worstMonths = sortedMonthsByPerformance.slice(-3).reverse()

    // Calculate REAL quarterly data from actual monthly averages
    const quarterlyData = [
      {
        quarter: 'Q1',
        return: monthlyAverages.slice(0, 3).reduce((sum, month) => sum + month.avgReturn, 0) / 3,
      },
      {
        quarter: 'Q2',
        return: monthlyAverages.slice(3, 6).reduce((sum, month) => sum + month.avgReturn, 0) / 3,
      },
      {
        quarter: 'Q3',
        return: monthlyAverages.slice(6, 9).reduce((sum, month) => sum + month.avgReturn, 0) / 3,
      },
      {
        quarter: 'Q4',
        return: monthlyAverages.slice(9, 12).reduce((sum, month) => sum + month.avgReturn, 0) / 3,
      },
    ]

    const sortedQuarters = [...quarterlyData].sort((a, b) => b.return - a.return)

    // Use real quarterly returns (already relative to SPY)
    const bestQuarters = [
      {
        quarter: sortedQuarters[0].quarter,
        outperformance: sortedQuarters[0].return,
      },
    ]
    const worstQuarters = [
      {
        quarter: sortedQuarters[sortedQuarters.length - 1].quarter,
        outperformance: sortedQuarters[sortedQuarters.length - 1].return,
      },
    ]

    // Analyze 30+ day seasonal patterns from actual daily data
    const analyze30DayPatterns = (dailyData: DailySeasonalData[]) => {
      const windowSize = 30
      let bestPeriod = {
        startDay: 1,
        endDay: 30,
        avgReturn: -999,
        period: '',
        startDate: '',
        endDate: '',
      }
      let worstPeriod = {
        startDay: 1,
        endDay: 30,
        avgReturn: 999,
        period: '',
        startDate: '',
        endDate: '',
      }

      // Slide through the year to find 30-day windows
      for (let startDay = 1; startDay <= 365 - windowSize; startDay++) {
        const endDay = startDay + windowSize - 1
        const windowData = dailyData.filter((d) => d.dayOfYear >= startDay && d.dayOfYear <= endDay)

        if (windowData.length >= 25) {
          // Ensure we have enough data points
          const windowReturn = windowData.reduce((sum, d) => sum + d.avgReturn, 0)
          const avgWindowReturn = windowReturn / windowData.length

          // Check for best period
          if (avgWindowReturn > bestPeriod.avgReturn) {
            const startDataPoint = dailyData.find((d) => d.dayOfYear === startDay)
            const endDataPoint = dailyData.find((d) => d.dayOfYear === endDay)

            if (startDataPoint && endDataPoint) {
              bestPeriod = {
                startDay,
                endDay,
                avgReturn: avgWindowReturn,
                period: `${startDataPoint.monthName} ${startDataPoint.day} - ${endDataPoint.monthName} ${endDataPoint.day}`,
                startDate: `${startDataPoint.monthName} ${startDataPoint.day}`,
                endDate: `${endDataPoint.monthName} ${endDataPoint.day}`,
              }
            }
          }

          // Check for worst period
          if (avgWindowReturn < worstPeriod.avgReturn) {
            const startDataPoint = dailyData.find((d) => d.dayOfYear === startDay)
            const endDataPoint = dailyData.find((d) => d.dayOfYear === endDay)

            if (startDataPoint && endDataPoint) {
              worstPeriod = {
                startDay,
                endDay,
                avgReturn: avgWindowReturn,
                period: `${startDataPoint.monthName} ${startDataPoint.day} - ${endDataPoint.monthName} ${endDataPoint.day}`,
                startDate: `${startDataPoint.monthName} ${startDataPoint.day}`,
                endDate: `${endDataPoint.monthName} ${endDataPoint.day}`,
              }
            }
          }
        }
      }

      return { bestPeriod, worstPeriod }
    }

    const { bestPeriod, worstPeriod } = analyze30DayPatterns(dailyData)

    return {
      symbol,
      companyName,
      currency: 'USD',
      period: `${chartSettings.startDate} - ${chartSettings.endDate}`,
      dailyData,
      statistics: {
        annualizedReturn,
        averageReturn,
        medianReturn: allReturns.sort((a, b) => a - b)[Math.floor(allReturns.length / 2)],
        totalReturn,
        winningTrades: winningYears,
        totalTrades,
        winRate,
        profit: positiveReturns.reduce((sum, ret) => sum + ret, 0),
        averageProfit:
          positiveReturns.length > 0
            ? positiveReturns.reduce((sum, ret) => sum + ret, 0) / positiveReturns.length
            : 0,
        maxProfit: Math.max(...positiveReturns, 0),
        gains: positiveReturns.length,
        losses: negativeReturns.length,
        profitPercentage: (positiveReturns.length / totalTrades) * 100,
        lossPercentage: (negativeReturns.length / totalTrades) * 100,
        yearsOfData: years,
        bestYear,
        worstYear,
      },
      patternReturns: yearlyReturns,
      spyComparison: {
        bestMonths,
        worstMonths,
        bestQuarters,
        worstQuarters,
        monthlyData: monthlyAverages,
        best30DayPeriod: {
          period: bestPeriod.period,
          return: bestPeriod.avgReturn * 30, // Convert daily average to 30-day period return
          startDate: bestPeriod.startDate,
          endDate: bestPeriod.endDate,
        },
        worst30DayPeriod: {
          period: worstPeriod.period,
          return: worstPeriod.avgReturn * 30, // Convert daily average to 30-day period return
          startDate: worstPeriod.startDate,
          endDate: worstPeriod.endDate,
        },
      },
    }
  }

  const getDayOfYear = (date: Date): number => {
    const start = new Date(date.getFullYear(), 0, 0)
    const diff = date.getTime() - start.getTime()
    return Math.floor(diff / (1000 * 60 * 60 * 24))
  }

  const handleQuickScan = async (name: string, tickers: string[], benchmarkSymbol?: string) => {
    setLoading(true)
    setError(null)
    setMultiScanData([])
    quickScanTickersRef.current = tickers  // remember for election-cycle mode
    try {
      const cache = GlobalDataCache.getInstance()
      const endDate = new Date()
      const startDate = new Date()
      startDate.setFullYear(endDate.getFullYear() - 15)   // max 15 years
      const startDateStr = startDate.toISOString().split('T')[0]
      const endDateStr = endDate.toISOString().split('T')[0]

      const MIN_YEARS = 8

      // Fetch benchmark ETF data if provided (for sector ETF-relative seasonality)
      let benchmarkData: PolygonDataPoint[] | null = null
      if (benchmarkSymbol) {
        try {
          let benchResp = cache.get(GlobalDataCache.keys.HISTORICAL_DATA(benchmarkSymbol, startDateStr, endDateStr))
          if (!benchResp) {
            benchResp = await polygonService.getHistoricalData(benchmarkSymbol, startDateStr, endDateStr)
            if (benchResp) cache.set(GlobalDataCache.keys.HISTORICAL_DATA(benchmarkSymbol, startDateStr, endDateStr), benchResp)
          }
          benchmarkData = benchResp?.results ?? null
        } catch {
          benchmarkData = null
        }
      }

      const fetchOne = async (symbol: string): Promise<SeasonalAnalysis | null> => {
        try {
          let historicalResponse = cache.get(
            GlobalDataCache.keys.HISTORICAL_DATA(symbol, startDateStr, endDateStr)
          )
          if (!historicalResponse) {
            historicalResponse = await polygonService.getHistoricalData(symbol, startDateStr, endDateStr)
            if (historicalResponse)
              cache.set(GlobalDataCache.keys.HISTORICAL_DATA(symbol, startDateStr, endDateStr), historicalResponse)
          }
          if (!historicalResponse?.results?.length) {
            return null
          }
          let results = historicalResponse.results

          // Detect and truncate at ticker-rename / data discontinuities (e.g. FB→META)
          let truncateAfter = -1
          for (let i = 1; i < results.length; i++) {
            const dayReturn = Math.abs((results[i].c - results[i - 1].c) / results[i - 1].c * 100)
            if (dayReturn > 100) {
              truncateAfter = i
            }
          }
          if (truncateAfter >= 0) {
            results = results.slice(truncateAfter)
          }

          // Check minimum years requirement
          const yearsAvailable =
            (new Date(results[results.length - 1].t).getTime() - new Date(results[0].t).getTime()) /
            (365.25 * 24 * 60 * 60 * 1000)
          if (yearsAvailable < MIN_YEARS) {
            return null
          }

          const years = Math.ceil(yearsAvailable)
          // Pass benchmark ETF data as spyData so returns are computed relative to the ETF
          const analysis = processDailySeasonalData(results, benchmarkData, symbol, symbol, years)
          return analysis
        } catch {
          return null
        }
      }

      const results = await Promise.all(tickers.map(fetchOne))
      const valid = results.filter(Boolean) as SeasonalAnalysis[]
      setMultiScanData(valid)

      // Compute average dailyData across all valid analyses and set as main line
      if (valid.length > 0) {
        const dayMap: Record<number, { returns: number[]; yearlyReturnsArr: { [year: number]: number }[]; ref: DailySeasonalData }> = {}
        valid.forEach((analysis) => {
          analysis.dailyData.forEach((pt) => {
            if (!dayMap[pt.dayOfYear]) dayMap[pt.dayOfYear] = { returns: [], yearlyReturnsArr: [], ref: pt }
            dayMap[pt.dayOfYear].returns.push(pt.cumulativeReturn)
            dayMap[pt.dayOfYear].yearlyReturnsArr.push(pt.yearlyReturns)
          })
        })
        const avgDailyData = Object.entries(dayMap)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([, { returns, yearlyReturnsArr, ref }]) => {
            // Average yearlyReturns across all tickers for each year
            const allYears = new Set<number>()
            yearlyReturnsArr.forEach((yr) => Object.keys(yr).forEach((y) => allYears.add(Number(y))))
            const avgYearlyReturns: { [year: number]: number } = {}
            allYears.forEach((year) => {
              const vals = yearlyReturnsArr.map((yr) => yr[year]).filter((v) => v !== undefined) as number[]
              if (vals.length > 0) avgYearlyReturns[year] = vals.reduce((s, v) => s + v, 0) / vals.length
            })
            return {
              ...ref,
              cumulativeReturn: returns.reduce((s, v) => s + v, 0) / returns.length,
              yearlyReturns: avgYearlyReturns,
            }
          })
        // ── Build monthly returns directly from avgDailyData (grouped by month) ──
        const monthBuckets: Record<number, { name: string; sum: number }> = {}
        avgDailyData.forEach((d) => {
          if (!monthBuckets[d.month]) monthBuckets[d.month] = { name: d.monthName, sum: 0 }
          monthBuckets[d.month].sum += d.avgReturn
        })
        const avgMonthlyData = Object.entries(monthBuckets)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([, { name, sum }]) => ({ month: name, outperformance: sum }))

        // ── Compute best/worst 30-day window from avgDailyData ──
        const windowSize = 30
        let avgBestPeriod = { startDay: 1, endDay: 30, avgReturn: -999, period: '', startDate: '', endDate: '' }
        let avgWorstPeriod = { startDay: 1, endDay: 30, avgReturn: 999, period: '', startDate: '', endDate: '' }
        for (let startDay = 1; startDay <= 365 - windowSize; startDay++) {
          const endDay = startDay + windowSize - 1
          const windowData = avgDailyData.filter((d) => d.dayOfYear >= startDay && d.dayOfYear <= endDay)
          if (windowData.length >= 25) {
            const avgWindowReturn = windowData.reduce((s, d) => s + d.avgReturn, 0) / windowData.length
            const startPt = avgDailyData.find((d) => d.dayOfYear === startDay)
            const endPt = avgDailyData.find((d) => d.dayOfYear === endDay)
            if (startPt && endPt) {
              if (avgWindowReturn > avgBestPeriod.avgReturn) {
                avgBestPeriod = { startDay, endDay, avgReturn: avgWindowReturn, period: `${startPt.monthName} ${startPt.day} - ${endPt.monthName} ${endPt.day}`, startDate: `${startPt.monthName} ${startPt.day}`, endDate: `${endPt.monthName} ${endPt.day}` }
              }
              if (avgWindowReturn < avgWorstPeriod.avgReturn) {
                avgWorstPeriod = { startDay, endDay, avgReturn: avgWindowReturn, period: `${startPt.monthName} ${startPt.day} - ${endPt.monthName} ${endPt.day}`, startDate: `${startPt.monthName} ${startPt.day}`, endDate: `${endPt.monthName} ${endPt.day}` }
              }
            }
          }
        }

        const avgAnalysis: SeasonalAnalysis = {
          ...valid[0],
          symbol: 'AVG',
          companyName: 'Average',
          dailyData: avgDailyData,
          spyComparison: {
            ...valid[0].spyComparison,
            monthlyData: avgMonthlyData,
            best30DayPeriod: {
              period: avgBestPeriod.period,
              return: avgBestPeriod.avgReturn * 30,
              startDate: avgBestPeriod.startDate,
              endDate: avgBestPeriod.endDate,
            },
            worst30DayPeriod: {
              period: avgWorstPeriod.period,
              return: avgWorstPeriod.avgReturn * 30,
              startDate: avgWorstPeriod.startDate,
              endDate: avgWorstPeriod.endDate,
            },
          },
        }
        setSeasonalData(avgAnalysis)

        // ── Compute sweet spot / pain point from averaged data ──
        const { bestSweetSpot, worstPainPoint } = analyzeLongTermPatterns(avgDailyData)
        setSweetSpotPeriod({
          startDay: bestSweetSpot.startDay,
          endDay: bestSweetSpot.endDay,
          period: bestSweetSpot.period,
        })
        setPainPointPeriod({
          startDay: worstPainPoint.startDay,
          endDay: worstPainPoint.endDay,
          period: worstPainPoint.period,
        })
        setSweetSpotActive(false)
        setPainPointActive(false)

        isQuickScanRef.current = true
        setSelectedSymbol('AVG')
      }
    } catch (err) {
      setError('Multi-scan failed')
    } finally {
      setLoading(false)
    }
  }

  const handleSymbolChange = (symbol: string) => {
    setSelectedSymbol(symbol)
    setIsElectionMode(false)
    setElectionData(null)
    setMultiScanData([])
    quickScanTickersRef.current = []
    if (onSymbolChange) {
      onSymbolChange(symbol)
    }
  }

  const analyzeLongTermPatterns = (dailyData: DailySeasonalData[]) => {
    let bestSweetSpot = { startDay: 1, endDay: 50, avgReturn: -999, period: '', totalReturn: 0 }
    let worstPainPoint = { startDay: 1, endDay: 50, avgReturn: 999, period: '', totalReturn: 0 }

    // Test different window sizes from 50 to 90 days
    for (let windowSize = 50; windowSize <= 90; windowSize++) {
      // Slide through the year
      for (let startDay = 1; startDay <= 365 - windowSize; startDay++) {
        const endDay = startDay + windowSize - 1
        const windowData = dailyData.filter(
          (d: DailySeasonalData) => d.dayOfYear >= startDay && d.dayOfYear <= endDay
        )

        if (windowData.length >= Math.floor(windowSize * 0.8)) {
          // Ensure we have at least 80% of data points
          // Calculate cumulative return for the period
          const sortedWindowData = windowData.sort(
            (a: DailySeasonalData, b: DailySeasonalData) => a.dayOfYear - b.dayOfYear
          )
          let cumulativeReturn = 0
          let avgReturn = 0

          sortedWindowData.forEach((d: DailySeasonalData) => {
            cumulativeReturn += d.avgReturn
            avgReturn += d.avgReturn
          })

          avgReturn = avgReturn / sortedWindowData.length

          // Check for best sweet spot
          if (cumulativeReturn > bestSweetSpot.totalReturn) {
            const startDataPoint = dailyData.find(
              (d: DailySeasonalData) => d.dayOfYear === startDay
            )
            const endDataPoint = dailyData.find((d: DailySeasonalData) => d.dayOfYear === endDay)

            if (startDataPoint && endDataPoint) {
              bestSweetSpot = {
                startDay,
                endDay,
                avgReturn,
                totalReturn: cumulativeReturn,
                period: `${startDataPoint.monthName} ${startDataPoint.day} - ${endDataPoint.monthName} ${endDataPoint.day} (${windowSize} days)`,
              }
            }
          }

          // Check for worst pain point
          if (cumulativeReturn < worstPainPoint.totalReturn) {
            const startDataPoint = dailyData.find(
              (d: DailySeasonalData) => d.dayOfYear === startDay
            )
            const endDataPoint = dailyData.find((d: DailySeasonalData) => d.dayOfYear === endDay)

            if (startDataPoint && endDataPoint) {
              worstPainPoint = {
                startDay,
                endDay,
                avgReturn,
                totalReturn: cumulativeReturn,
                period: `${startDataPoint.monthName} ${startDataPoint.day} - ${endDataPoint.monthName} ${endDataPoint.day} (${windowSize} days)`,
              }
            }
          }
        }
      }
    }

    return { bestSweetSpot, worstPainPoint }
  }

  const handleSweetSpotClick = () => {
    if (!seasonalData?.dailyData) {
      // Toggle pre-selection if no data loaded yet
      setSweetSpotActive((prev) => !prev)
      if (painPointActive) setPainPointActive(false)
      return
    }

    // Toggle: if already showing sweet spot, clear it
    if (sweetSpotPeriod) {
      setSweetSpotPeriod(null)
      setSweetSpotActive(false)
      return
    }

    const { bestSweetSpot } = analyzeLongTermPatterns(seasonalData.dailyData)
    setSweetSpotPeriod({
      startDay: bestSweetSpot.startDay,
      endDay: bestSweetSpot.endDay,
      period: bestSweetSpot.period,
    })
    setSweetSpotActive(true)
  }

  const handlePainPointClick = () => {
    if (!seasonalData?.dailyData) {
      setPainPointActive((prev) => !prev)
      if (sweetSpotActive) setSweetSpotActive(false)
      return
    }

    if (painPointPeriod) {
      setPainPointPeriod(null)
      setPainPointActive(false)
      return
    }

    const { worstPainPoint } = analyzeLongTermPatterns(seasonalData.dailyData)
    setPainPointPeriod({
      startDay: worstPainPoint.startDay,
      endDay: worstPainPoint.endDay,
      period: worstPainPoint.period,
    })
    setPainPointActive(true)
  }

  const handleSettingsChange = (newSettings: Partial<ChartSettings>) => {
    const updatedSettings = { ...chartSettings, ...newSettings }
    setChartSettings(updatedSettings)

    // Reload data if years changed
    if (newSettings.yearsOfData && newSettings.yearsOfData !== chartSettings.yearsOfData) {
      if (selectedSymbol) {
        if (isElectionMode) {
          loadElectionCycleAnalysis(
            selectedSymbol,
            selectedElectionPeriod as
            | 'Election Year'
            | 'Post-Election'
            | 'Mid-Term'
            | 'Pre-Election',
            newSettings.yearsOfData
          )
        } else {
          loadSeasonalAnalysis(selectedSymbol, newSettings.yearsOfData)
        }
      }
    }
  }

  const handleRefresh = () => {
    if (selectedSymbol) {
      if (isElectionMode) {
        loadElectionCycleAnalysis(
          selectedSymbol,
          selectedElectionPeriod as 'Election Year' | 'Post-Election' | 'Mid-Term' | 'Pre-Election'
        )
      } else {
        loadSeasonalAnalysis(selectedSymbol)
      }
    }
  }

  const handleMonthClick = (monthIndex: number, monthName: string) => {
    setSelectedMonthIndex(monthIndex)
    setSelectedMonthName(monthName)
    setMonthlyViewActive(true)
  }

  const handleNoteKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && notepadText.trim()) {
      setSavedNote(notepadText.trim())
      setNotepadText('')
      setIsEditingNote(false)
    }
  }

  const handleNoteClick = () => {
    setIsEditingNote(true)
    setNotepadText(savedNote)
  }

  const handleNoteBlur = () => {
    if (notepadText.trim()) {
      setSavedNote(notepadText.trim())
      setNotepadText('')
    }
    setIsEditingNote(false)
  }

  const calculateCorrelation = async (symbol: string, seasonalData: SeasonalAnalysis) => {
    try {
      // Get current year data (2025)
      const currentYear = new Date().getFullYear() // 2025
      const currentDate = new Date()
      const startOfYear = new Date(currentYear, 0, 1)
      const daysSinceYearStart = Math.floor(
        (currentDate.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24)
      )

      // Fetch current year price data
      const currentYearData = await polygonService.getHistoricalData(
        symbol,
        `${currentYear}-01-01`,
        currentDate.toISOString().split('T')[0],
        'day',
        1
      )

      if (!currentYearData || !currentYearData.results || currentYearData.results.length < 2) {
        return null
      }

      // Calculate weekly returns for current year (smoother, less noise)
      const currentYearReturns: number[] = []
      const results = currentYearData.results

      // Group into 5-day (weekly) periods
      for (let i = 5; i < results.length; i += 5) {
        const weekStart = results[i - 5].c
        const weekEnd = results[i].c
        const weeklyReturn = ((weekEnd - weekStart) / weekStart) * 100
        currentYearReturns.push(weeklyReturn)
      }

      // Get corresponding seasonal weekly returns for the same period
      const seasonalReturns: number[] = []
      const startDayOfYear = 1 // January 1st

      // Group seasonal data into 5-day periods and sum them
      for (let i = 0; i < currentYearReturns.length; i++) {
        let weeklySeasonalReturn = 0
        for (let j = 0; j < 5; j++) {
          const dayIndex = startDayOfYear + i * 5 + j
          if (dayIndex < seasonalData.dailyData.length) {
            const seasonalDataPoint = seasonalData.dailyData[dayIndex]
            if (seasonalDataPoint) {
              weeklySeasonalReturn += seasonalDataPoint.avgReturn
            }
          }
        }
        seasonalReturns.push(weeklySeasonalReturn)
      }

      // Ensure we have matching data points
      const minLength = Math.min(currentYearReturns.length, seasonalReturns.length)
      const currentReturns = currentYearReturns.slice(0, minLength)
      const seasonalAvgReturns = seasonalReturns.slice(0, minLength)

      if (minLength < 5) {
        return null
      }

      // Calculate Pearson correlation coefficient
      const rawCorrelation = calculatePearsonCorrelation(currentReturns, seasonalAvgReturns)

      // Apply more forgiving correlation scaling for real-world data
      const adjustedCorrelation = adjustCorrelationForReality(rawCorrelation)

      // Calculate cumulative returns for display
      const currentYearCumulativeReturn = currentReturns.reduce((acc, ret) => acc + ret, 0)
      const seasonalCumulativeReturn = seasonalAvgReturns.reduce((acc, ret) => acc + ret, 0)

      return {
        correlation: Math.round(adjustedCorrelation * 100), // Convert to percentage
        currentYearReturn: currentYearCumulativeReturn,
        seasonalReturn: seasonalCumulativeReturn,
      }
    } catch {
      return null
    }
  }

  const calculatePearsonCorrelation = (x: number[], y: number[]): number => {
    const n = x.length
    if (n !== y.length || n === 0) return 0

    const sumX = x.reduce((a, b) => a + b, 0)
    const sumY = y.reduce((a, b) => a + b, 0)
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0)
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0)
    const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0)

    const numerator = n * sumXY - sumX * sumY
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY))

    return denominator === 0 ? 0 : numerator / denominator
  }

  const adjustCorrelationForReality = (rawCorrelation: number): number => {
    // Real-world correlations are much lower due to market noise
    // Apply a curve that makes realistic correlations more visible
    const abs = Math.abs(rawCorrelation)

    // Boost small correlations to make them more meaningful
    let adjusted
    if (abs < 0.1) {
      // Very small correlations get a small boost
      adjusted = abs * 2.5
    } else if (abs < 0.3) {
      // Medium correlations get a bigger boost
      adjusted = 0.25 + (abs - 0.1) * 3
    } else if (abs < 0.5) {
      // Higher correlations get less boost
      adjusted = 0.85 + (abs - 0.3) * 1.5
    } else {
      // Very high correlations (rare) get minimal boost
      adjusted = 1.15 + (abs - 0.5) * 0.5
    }

    // Cap at 1.0 and preserve sign
    adjusted = Math.min(adjusted, 1.0)
    return rawCorrelation >= 0 ? adjusted : -adjusted
  }

  // Pass selected symbol to monthly chart so it updates when ticker changes
  const memoizedMonthlyChart = useMemo(
    () => (
      <div
        style={{
          width: '100%',
          position: 'relative',
          top: '-8px',
          paddingRight: 0,
          overflow: 'visible',
        }}
      >
        <div style={{ paddingRight: 0, overflow: 'visible' }}>
          <AlmanacDailyChart
            month={new Date().getMonth()}
            showPostElection={true}
            symbol={selectedSymbol}
            symbols={multiScanData.length > 1 ? multiScanData.map((d) => d.symbol) : undefined}
            externalSelectedEvent={externalSelectedEvent}
            externalSelectedPatterns={externalSelectedPatterns}
          />
        </div>
      </div>
    ),
    [selectedSymbol, multiScanData, externalSelectedEvent, externalSelectedPatterns]
  ) // Re-render when symbol or selections change

  // Memoized screener component with React.memo wrapper to prevent resets
  const MemoizedScreenerWrapper = React.memo(() => (
    <div style={{ minWidth: 0 }}>
      <SeasonaxLanding key="persistent-screener" />
    </div>
  ))
  MemoizedScreenerWrapper.displayName = 'MemoizedScreenerWrapper'

  const memoizedScreener = useMemo(() => <MemoizedScreenerWrapper />, []) // Empty dependency array - only mount once

  // Symbol set but still loading — show spinner
  if (selectedSymbol && !seasonalData && loading) {
    return (
      <div className="seasonality-chart-container">
        <div
          className="seasonality-chart-content"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '400px',
          }}
        >
          <div
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}
          >
            <div
              style={{
                width: '48px',
                height: '48px',
                border: '4px solid rgba(255, 107, 0, 0.2)',
                borderTop: '4px solid #ff6b00',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }}
            ></div>
            <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
            <p style={{ color: '#888', fontSize: '14px', fontWeight: '500' }}>
              Loading seasonal data...
            </p>
          </div>
        </div>
      </div>
    )
  }

  const handleDateRangeChange = (direction: 'prev' | 'next') => {
    // Calculate new date range based on direction
    const currentStart = new Date(chartSettings.startDate + ', 2024')
    const currentEnd = new Date(chartSettings.endDate + ', 2024')

    // Move date range by 30 days
    const daysToMove = direction === 'next' ? 30 : -30

    const newStart = new Date(currentStart)
    const newEnd = new Date(currentEnd)
    newStart.setDate(newStart.getDate() + daysToMove)
    newEnd.setDate(newEnd.getDate() + daysToMove)

    const newStartStr = newStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    const newEndStr = newEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

    setChartSettings({
      ...chartSettings,
      startDate: newStartStr,
      endDate: newEndStr,
    })
  }

  // Compare functionality handlers
  const handleCompareClick = () => {
    setIsCompareMode(!isCompareMode)
    if (isCompareMode) {
      // Clear compare data when exiting compare mode
      setCompareSymbol('')
      setCompareSeasonalData(null)
      setCompareElectionData(null)
    }
  }

  const handleCompareSymbolChange = (symbol: string) => {
    setCompareSymbol(symbol.toUpperCase())
  }

  const handleCompareSubmit = async () => {
    const symbol = compareSymbol.trim()
    if (symbol) {
      // Load comparison data based on current mode
      if (isElectionMode) {
        await loadCompareElectionData(symbol, selectedElectionPeriod as any)
      } else {
        await loadCompareSeasonalData(symbol)
      }
    } else {
      setCompareSeasonalData(null)
      setCompareElectionData(null)
    }
  }

  const loadCompareSeasonalData = async (symbol: string) => {
    try {
      const cache = GlobalDataCache.getInstance()
      const cachedTicker = cache.get(GlobalDataCache.keys.TICKER_DETAILS(symbol))
      let tickerDetails

      if (cachedTicker) {
        tickerDetails = cachedTicker
      } else {
        tickerDetails = await polygonService.getTickerDetails(symbol)
        if (tickerDetails) {
          cache.set(GlobalDataCache.keys.TICKER_DETAILS(symbol), tickerDetails)
        }
      }

      const endDate = new Date()
      const startDate = new Date()
      startDate.setFullYear(endDate.getFullYear() - 30)

      const startDateStr = startDate.toISOString().split('T')[0]
      const endDateStr = endDate.toISOString().split('T')[0]

      const cacheKey = `seasonal_compare_${symbol}_${chartSettings.yearsOfData}`
      const cachedData = cache.get(cacheKey)

      if (cachedData) {
        setCompareSeasonalData(cachedData)
        return
      }

      const data = await polygonService.getHistoricalData(
        symbol,
        startDateStr,
        endDateStr,
        'day',
        1
      )

      if (data && data.results && data.results.length > 0) {
        const analysis = processDailySeasonalData(
          data.results,
          null, // No SPY comparison for compare ticker
          symbol,
          tickerDetails?.name || symbol,
          chartSettings.yearsOfData
        )
        cache.set(cacheKey, analysis)
        setCompareSeasonalData(analysis)
      }
    } catch (err) {

    }
  }

  const loadCompareElectionData = async (
    symbol: string,
    electionType: 'Election Year' | 'Post-Election' | 'Mid-Term' | 'Pre-Election'
  ) => {
    try {
      const electionResult = await electionCycleService.analyzeElectionCycleSeasonality(
        symbol,
        electionType,
        Math.min(chartSettings.yearsOfData, 20)
      )

      if (electionResult) {
        setCompareElectionData(electionResult)
      }
    } catch (err) {

    }
  }

  return (
    <div
      className="seasonax-container"
      style={isFullscreen ? {
        position: 'fixed',
        top: '122px',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        background: '#000',
        overflow: 'auto',
        padding: '20px 16px 16px 16px',
        margin: 0,
      } : undefined}
    >
      {/* Header with all elements in one row */}
      {!hideControls && (
        <div
          className="seasonax-header"
          style={{
            position: 'relative',
            zIndex: 1000,
            left: hideScreener ? '20px' : '20px',
            marginTop: isFullscreen ? '20px' : undefined,
          }}
        >
          {/* Group 1: Search + all inline controls */}
          <div className="header-group search-compare-group">
            <SeasonaxSymbolSearch
              onSymbolSelect={handleSymbolChange}
              initialSymbol={selectedSymbol}
              onElectionPeriodSelect={handleElectionPeriodSelect}
              onElectionModeToggle={handleElectionModeToggle}
              selectedElectionPeriod={displayElectionPeriod}
              availableYears={availableYears}
              currentYears={chartSettings.yearsOfData}
              onYearsChange={(years) => handleSettingsChange({ yearsOfData: years })}
              sweetSpotActive={sweetSpotActive}
              painPointActive={painPointActive}
              onSweetSpotToggle={handleSweetSpotClick}
              onPainPointToggle={handlePainPointClick}
              currentYearMode={currentYearMode}
              onCurrentYearModeChange={setCurrentYearMode}
              isCompareMode={isCompareMode}
              compareSymbol={compareSymbol}
              onCompareClick={handleCompareClick}
              onCompareSymbolChange={handleCompareSymbolChange}
              onCompareSubmit={handleCompareSubmit}
              onQuickScan={handleQuickScan}
              isFullscreen={isFullscreen}
            />
          </div>

          {!hideMonthlyReturns &&
            (isElectionMode
              ? electionData?.spyComparison?.monthlyData
              : seasonalData?.spyComparison?.monthlyData) && (
              <div className={isFullscreen ? 'monthly-returns-fullscreen-wrapper' : undefined}>
                <HorizontalMonthlyReturns
                  monthlyData={
                    isElectionMode
                      ? electionData!.spyComparison!.monthlyData
                      : seasonalData!.spyComparison!.monthlyData
                  }
                  best30DayPeriod={seasonalData?.spyComparison?.best30DayPeriod}
                  worst30DayPeriod={seasonalData?.spyComparison?.worst30DayPeriod}
                  onMonthClick={handleMonthClick}
                  isFullscreen={isFullscreen}
                />
              </div>
            )}
        </div>
      )}

      {/* Show only monthly returns when hideControls is true */}
      {hideControls &&
        !hideMonthlyReturns &&
        (isElectionMode
          ? electionData?.spyComparison?.monthlyData
          : seasonalData?.spyComparison?.monthlyData) && (
          <HorizontalMonthlyReturns
            monthlyData={
              isElectionMode
                ? electionData!.spyComparison!.monthlyData
                : seasonalData!.spyComparison!.monthlyData
            }
            best30DayPeriod={seasonalData?.spyComparison?.best30DayPeriod}
            worst30DayPeriod={seasonalData?.spyComparison?.worst30DayPeriod}
            yearsOfData={chartSettings.yearsOfData}
            onYearsChange={(years) => handleSettingsChange({ yearsOfData: years })}
            selectedElectionPeriod={displayElectionPeriod}
            onElectionPeriodChange={handleElectionPeriodSelect}
            onSweetSpotClick={handleSweetSpotClick}
            onPainPointClick={handlePainPointClick}
            onMonthClick={handleMonthClick}
          />
        )}

      {error && (
        <div style={{ display: 'grid', gridTemplateColumns: '51% 48%', gap: '1%', width: '100%' }}>
          <div className="seasonax-error">
            <div className="error-content">
              <h3>Error Loading Data</h3>
              <p>{error}</p>
              <button
                onClick={() => {
                  if (isElectionMode) {
                    loadElectionCycleAnalysis(
                      selectedSymbol,
                      selectedElectionPeriod as
                      | 'Election Year'
                      | 'Post-Election'
                      | 'Mid-Term'
                      | 'Pre-Election'
                    )
                  } else {
                    loadSeasonalAnalysis(selectedSymbol)
                  }
                }}
                className="retry-button"
              >
                Retry
              </button>
            </div>
          </div>
          <div style={{ minWidth: 0 }}></div>
        </div>
      )}

      {loading && (
        <div style={{ display: 'grid', gridTemplateColumns: '51% 48%', gap: '1%', width: '100%' }}>
          <div className="seasonax-loading">
            <div className="loading-spinner"></div>
            <p>
              Loading {isElectionMode ? 'election cycle' : 'seasonal'} analysis for {selectedSymbol}
              ...
            </p>
          </div>
          <div style={{ minWidth: 0 }}></div>
        </div>
      )}

      {/* Show data based on current mode */}
      {((isElectionMode && electionData) || (!isElectionMode && seasonalData)) && !loading && (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isFullscreen ? '50% 50%' : (hideScreener ? '100%' : '45% 54%'),
              gap: '1%',
              width: '100%',
              marginTop: isFullscreen ? '4px' : '12px',
              overflow: 'visible',
              ...(isFullscreen ? { height: '100%', alignItems: 'stretch' } : {}),
            }}
          >
            {/* Left column: Charts (non-fullscreen) / Scrubber + Almanac + EFI (fullscreen) */}
            <div style={{ minWidth: 0, width: '100%', overflow: isFullscreen ? 'hidden' : 'visible', display: isFullscreen ? 'flex' : 'block', flexDirection: 'column', height: isFullscreen ? '100%' : undefined }}>
              {isFullscreen ? (
                /* ── FULLSCREEN LEFT: horizontal scrubber → monthly almanac (30% shorter) → EFI chart (50% taller) ── */
                <>
                  {/* CSS override: force almanac chart-container to fill available flex space */}
                  <style>{`
                    .seasonax-fs-almanac-wrap { flex: 1; min-height: 0; display: flex; flex-direction: column; }
                    .seasonax-fs-almanac-wrap .almanac-daily-chart { flex: 1 !important; min-height: 0 !important; height: 0 !important; overflow: hidden !important; }
                    .seasonax-fs-almanac-wrap .almanac-daily-chart .chart-header-row { flex-shrink: 0; }
                    .seasonax-fs-almanac-wrap .almanac-daily-chart .chart-container { flex: 1 !important; height: 0 !important; min-height: 0 !important; }
                  `}</style>

                  {/* Monthly almanac — fullscreen only, 20% shorter than previous height: 70vh→56vh */}
                  <div ref={dbgFlexSlotRef} className="seasonax-fullscreen-almanac" style={{ flex: '0 0 auto', height: 'calc(56vh - 269px)', minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', width: '100%' }}>
                    <div ref={dbgOuterRef} className="seasonax-fs-almanac-wrap">
                      <AlmanacDailyChart
                        month={new Date().getMonth()}
                        showPostElection={true}
                        symbol={selectedSymbol}
                        symbols={multiScanData.length > 1 ? multiScanData.map((d) => d.symbol) : undefined}
                        externalSelectedEvent={externalSelectedEvent}
                        externalSelectedPatterns={externalSelectedPatterns}
                        isFullscreen={true}
                      />
                    </div>
                  </div>

                  {/* EFI candlestick chart — fullscreen only, 5% taller than previous 655px = 688px */}
                  <div style={{ width: '100%', height: '688px', flexShrink: 0, marginTop: '4px', position: 'relative', overflow: 'hidden', borderTop: '2px solid #374151' }}>
                    <div style={{ width: '100%', height: '100%' }}>
                      <style>{`
                        .seasonax-efi-wrap .sidebar-container { display: none !important; }
                        .seasonax-efi-wrap .w-full.h-full.flex > div:first-child { width: 100% !important; }
                        .seasonax-efi-wrap button[title*='Watchlist'], .seasonax-efi-wrap button[title*='watchlist'],
                        .seasonax-efi-wrap button[title*='favorite'], .seasonax-efi-wrap button[title*='star'],
                        .seasonax-efi-wrap button[title*='multi chart'], .seasonax-efi-wrap button[title*='Multi Chart'],
                        .seasonax-efi-wrap button[title*='Chart Layout'] { display: none !important; }
                      `}</style>
                      <div className="seasonax-efi-wrap" style={{ width: '100%', height: '100%' }}>
                        <EFIChart
                          symbol={selectedSymbol || 'SPY'}
                          initialTimeframe="1d"
                          height={688}
                          lwToolbarPosition="left"
                          disableSidebarAutoScan={true}
                        />
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                /* ── NON-FULLSCREEN LEFT: original seasonal chart layout ── */
                <>
                  <div style={{ width: '100%' }}>
                    <div
                      style={{
                        width: '100%',
                        maxHeight: `${chartHeight}px`,
                        height: `${chartHeight}px`,
                        position: 'relative',
                        marginTop: '0px',
                      }}
                    >
                      {/* EXPAND button — normal mode, desktop only */}
                      {!isMobileView && <button
                        onClick={() => setIsFullscreen((f) => !f)}
                        title="Fullscreen"
                        style={{
                          position: 'absolute',
                          bottom: '8px',
                          right: '8px',
                          zIndex: 10001,
                          background: 'rgba(0,0,0,0.75)',
                          border: '1px solid rgba(255,255,255,0.18)',
                          borderRadius: '5px',
                          color: '#fff',
                          cursor: 'pointer',
                          padding: '5px 8px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px',
                          fontSize: '11px',
                          fontFamily: '"Roboto Mono", monospace',
                          fontWeight: 700,
                          letterSpacing: '0.06em',
                          lineHeight: 1,
                          backdropFilter: 'blur(6px)',
                          transition: 'border-color 0.15s, background 0.15s',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.45)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)' }}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square">
                          <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
                          <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
                        </svg>
                        EXPAND
                      </button>}

                      {/* Canvas chart */}
                      <div style={{ height: '100%', width: '100%', position: 'relative' }}>
                        <SeasonaxMainChart
                          data={
                            (isElectionMode ? electionData : seasonalData) as unknown as Parameters<
                              typeof SeasonaxMainChart
                            >[0]['data']
                          }
                          settings={chartSettings}
                          sweetSpotPeriod={sweetSpotPeriod}
                          painPointPeriod={painPointPeriod}
                          selectedMonth={monthlyViewActive ? selectedMonthIndex : null}
                          compareData={
                            isCompareMode
                              ? isElectionMode
                                ? compareElectionData
                                : compareSeasonalData
                              : null
                          }
                          compareSymbol={isCompareMode ? compareSymbol : null}
                          currentYearSeries={currentYearDisplaySeries}
                          multiScanData={multiScanData.length > 0 ? multiScanData : undefined}
                          isFullscreen={false}
                        />
                        {/* Trend Sync badge */}
                        {trendSync && (
                          <div
                            style={{
                              position: 'absolute',
                              top: '8px',
                              left: '50%',
                              transform: 'translateX(-50%)',
                              zIndex: 10,
                              userSelect: 'none',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0',
                              background: 'linear-gradient(180deg, rgba(255,255,255,0.09) 0%, rgba(0,0,0,0.88) 60%)',
                              border: `1px solid ${trendSync.color + '66'}`,
                              borderRadius: '6px',
                              boxShadow: `0 2px 8px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08)`,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              fontFamily: "'Courier New', monospace",
                            }}
                          >
                            <div
                              style={{
                                padding: '4px 12px',
                                fontSize: '12px',
                                fontWeight: '900',
                                color: trendSync.color,
                                letterSpacing: '1px',
                                textShadow: `0 0 10px ${trendSync.color}88`,
                                borderRight: `1px solid ${trendSync.color}44`,
                              }}
                            >
                              {trendSync.score}% Correlation
                            </div>
                            <div
                              style={{
                                padding: '4px 12px',
                                fontSize: '9px',
                                fontWeight: '700',
                                color: 'rgba(255,255,255,0.75)',
                                letterSpacing: '0.8px',
                                textTransform: 'uppercase',
                              }}
                            >
                              {trendInsight}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Monthly Analysis Chart below seasonal chart — only in normal mode */}
                  {!hideMonthlyReturns && !isMobileView && memoizedMonthlyChart}
                </>
              )}
            </div>

            {/* Column 2: SeasonaxMainChart in fullscreen, Screener in normal mode */}
            {isFullscreen ? (
              <div style={{ minWidth: 0, width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
                <SeasonaxMainChart
                  data={
                    (isElectionMode ? electionData : seasonalData) as unknown as Parameters<
                      typeof SeasonaxMainChart
                    >[0]['data']
                  }
                  settings={chartSettings}
                  sweetSpotPeriod={sweetSpotPeriod}
                  painPointPeriod={painPointPeriod}
                  selectedMonth={monthlyViewActive ? selectedMonthIndex : null}
                  compareData={
                    isCompareMode
                      ? isElectionMode
                        ? compareElectionData
                        : compareSeasonalData
                      : null
                  }
                  compareSymbol={isCompareMode ? compareSymbol : null}
                  currentYearSeries={currentYearDisplaySeries}
                  multiScanData={multiScanData.length > 0 ? multiScanData : undefined}
                  isFullscreen={isFullscreen}
                />
                {/* Trend Sync badge */}
                {/* EXIT button — bottom-right of chart */}
                <button
                  onClick={() => setIsFullscreen((f) => !f)}
                  title="Exit fullscreen"
                  style={{
                    position: 'absolute',
                    bottom: '8px',
                    right: '8px',
                    zIndex: 10001,
                    background: 'rgba(180,0,0,0.92)',
                    border: '1px solid #ff0000',
                    borderRadius: '5px',
                    color: '#ff0000',
                    cursor: 'pointer',
                    padding: '5px 8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    fontSize: '11px',
                    fontFamily: '"Roboto Mono", monospace',
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    lineHeight: 1,
                    backdropFilter: 'blur(6px)',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(220,0,0,0.98)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(180,0,0,0.92)' }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square">
                    <polyline points="8 3 3 3 3 8" /><polyline points="21 8 21 3 16 3" />
                    <polyline points="3 16 3 21 8 21" /><polyline points="16 21 21 21 21 16" />
                  </svg>
                  EXIT
                </button>
                {trendSync && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '8px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      zIndex: 10,
                      userSelect: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0',
                      background: 'linear-gradient(180deg, rgba(255,255,255,0.09) 0%, rgba(0,0,0,0.88) 60%)',
                      border: `1px solid ${trendSync.color + '66'}`,
                      borderRadius: '6px',
                      boxShadow: `0 2px 8px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08)`,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      fontFamily: "'Courier New', monospace",
                    }}
                  >
                    <div
                      style={{
                        padding: '4px 12px',
                        fontSize: '12px',
                        fontWeight: '900',
                        color: trendSync.color,
                        letterSpacing: '1px',
                        textShadow: `0 0 10px ${trendSync.color}88`,
                        borderRight: `1px solid ${trendSync.color}44`,
                      }}
                    >
                      {trendSync.score}% Correlation
                    </div>
                    <div
                      style={{
                        padding: '4px 12px',
                        fontSize: '9px',
                        fontWeight: '700',
                        color: 'rgba(255,255,255,0.75)',
                        letterSpacing: '0.8px',
                        textTransform: 'uppercase',
                      }}
                    >
                      {trendInsight}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              !hideScreener && memoizedScreener
            )}
          </div>
        </>
      )}

      {/* Monthly View Modal */}
      {monthlyViewActive && selectedMonthIndex !== null && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            backdropFilter: 'blur(8px)',
          }}
          onClick={() => setMonthlyViewActive(false)}
        >
          <div
            style={{
              background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)',
              borderRadius: '20px',
              padding: '25px',
              width: '85vw',
              height: '75vh',
              overflow: 'auto',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
              display: 'flex',
              flexDirection: 'column',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px',
              }}
            >
              <h2 style={{ color: '#fff', fontSize: '24px', fontWeight: '700' }}>
                {selectedMonthName} Seasonality - {selectedSymbol}
              </h2>
              <button
                onClick={() => setMonthlyViewActive(false)}
                style={{
                  background: 'rgba(255, 0, 0, 0.1)',
                  border: '1px solid #ff0000',
                  borderRadius: '8px',
                  color: '#ff0000',
                  padding: '8px 16px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '600',
                }}
              >
                ✕ Close
              </button>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <SeasonaxMainChart
                data={
                  (isElectionMode ? electionData : seasonalData) as unknown as Parameters<
                    typeof SeasonaxMainChart
                  >[0]['data']
                }
                settings={chartSettings}
                sweetSpotPeriod={null}
                painPointPeriod={null}
                selectedMonth={selectedMonthIndex}
                compareData={
                  isCompareMode
                    ? isElectionMode
                      ? compareElectionData
                      : compareSeasonalData
                    : null
                }
                compareSymbol={isCompareMode ? compareSymbol : null}
                multiScanData={multiScanData.length > 0 ? multiScanData : undefined}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default SeasonalityChart
