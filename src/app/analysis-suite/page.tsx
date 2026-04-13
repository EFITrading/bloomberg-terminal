'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'

import dynamic from 'next/dynamic'

import { useDealerZonesStore } from '@/store/dealerZonesStore'

import '../almanac.css'
import '../seasonal-cards.css'
import '../seasonality.css'
import '../seasonax.css'

const EFIChart = dynamic(() => import('@/components/trading/EFICharting'), { ssr: false })
const DealerOIChart = dynamic(() => import('@/components/analytics/DealerOpenInterestChart'), {
  ssr: false,
})
const DealerGEXChart = dynamic(() => import('@/components/analytics/DealerGEXChart'), {
  ssr: false,
})
const SeasonalityChart = dynamic(() => import('@/components/analytics/SeasonalityChart'), {
  ssr: false,
})
const LiquidPanel = dynamic(() => import('@/components/analytics/LiquidPanel'), { ssr: false })
const ConsolidationHistoryScreener = dynamic(
  () => import('@/components/analytics/ConsolidationHistoryScreener'),
  { ssr: false }
)
const POIScreener = dynamic(() => import('@/components/analytics/POIScreener'), { ssr: false })
const OTMPremiumHistoryChartCompact = dynamic(
  () => import('@/components/analytics/OTMPremiumHistoryChartCompact'),
  { ssr: false }
)
const StraddleTownScreener = dynamic(() => import('@/components/analytics/StraddleTownScreener'), {
  ssr: false,
})

type IVDataPoint = {
  date: string
  callIV: number
  putIV: number
  netIV: number
  ivRank: number
  ivPercentile: number
  price: number
}

type IVChartsPanelProps = {
  data: IVDataPoint[]
  ticker: string
  period: '1Y' | '2Y' | '5Y'
  onPeriodChange: (period: '1Y' | '2Y' | '5Y') => void
  isScanning: boolean
}

export default function AnalysisSuitePage() {
  const [tickerInput, setTickerInput] = useState('')
  const [timeframe, setTimeframe] = useState<'1D' | '3D'>('1D')
  const [isScanning, setIsScanning] = useState(false)
  const [ivData, setIvData] = useState<IVDataPoint[]>([])
  const [ivPeriod, setIvPeriod] = useState<'1Y' | '2Y' | '5Y'>('1Y')
  const [currentTicker, setCurrentTicker] = useState('')
  const [ivDataCache, setIvDataCache] = useState<Record<string, Record<string, IVDataPoint[]>>>({})
  const [optionsFlowData, setOptionsFlowData] = useState<any[]>([])
  const [efiNotableFilterActive, setEfiNotableFilterActive] = useState(false)

  // Grading panel state
  const [gaugeMetrics, setGaugeMetrics] = useState<{
    compositeScore: number
    siNorm: number
  } | null>(null)
  const [gradePanelReady, setGradePanelReady] = useState(false)
  const [seasonal30DayData, setSeasonal30DayData] = useState<{
    best30Day?: { period: string; return: number; startDate: string; endDate: string }
    worst30Day?: { period: string; return: number; startDate: string; endDate: string }
  } | null>(null)
  const [electionSeasonal30DayData, setElectionSeasonal30DayData] = useState<{
    best30Day?: { period: string; return: number; startDate: string; endDate: string }
    worst30Day?: { period: string; return: number; startDate: string; endDate: string }
  } | null>(null)
  const dealerZones = useDealerZonesStore((s) => s.zones)

  // OI / GEX chart state
  const [sharedExpiration, setSharedExpiration] = useState<string>('')
  const [expirationDates, setExpirationDates] = useState<string[]>([])
  const [showCalls, setShowCalls] = useState(true)
  const [showPuts, setShowPuts] = useState(true)
  const [showNetOI, setShowNetOI] = useState(false)
  const [showPositiveGamma, setShowPositiveGamma] = useState(true)
  const [showNegativeGamma, setShowNegativeGamma] = useState(true)
  const [showNetGamma, setShowNetGamma] = useState(true)
  const [expectedRange90, setExpectedRange90] = useState<{ call: number; put: number } | null>(null)

  // Panel enable/disable state
  const [panelEnabled, setPanelEnabled] = useState({
    leadership: true,
    rsStatus: true,
    efiFlow: true,
    efiChart: true,
    oiChart: true,
    gexChart: true,
    ivCharts: true,
    seasonality: true,
    liquidPanel: true,
    consolidationPOI: true,
    otmPremiumHistory: true,
    straddleTown: true,
  })
  const togglePanel = (key: keyof typeof panelEnabled) => {
    setPanelEnabled((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  // Layout drag-to-reposition
  const [isEditMode, setIsEditMode] = useState(false)
  const [panelOffsets, setPanelOffsets] = useState<Record<string, { x: number; y: number }>>({})
  const [layoutSaving, setLayoutSaving] = useState(false)
  const [layoutSaved, setLayoutSaved] = useState(false)
  const dragState = useRef<{
    id: string
    startMouseX: number
    startMouseY: number
    startX: number
    startY: number
  } | null>(null)
  const getTransform = (id: string) => {
    const o = panelOffsets[id]
    return o ? `translate(${o.x}px,${o.y}px)` : undefined
  }

  const panelRefs = {
    searchBar: useRef<HTMLDivElement>(null),
    leadership: useRef<HTMLDivElement>(null),
    rsStatus: useRef<HTMLDivElement>(null),
    efiFlow: useRef<HTMLDivElement>(null),
    efiChart: useRef<HTMLDivElement>(null),
    seasonality: useRef<HTMLDivElement>(null),
    oiGex: useRef<HTMLDivElement>(null),
    ivCharts: useRef<HTMLDivElement>(null),
    liquidPanel: useRef<HTMLDivElement>(null),
    consolidationPOI: useRef<HTMLDivElement>(null),
    straddleTown: useRef<HTMLDivElement>(null),
    otmPremiumHistory: useRef<HTMLDivElement>(null),
  }

  // ─── EFI Chart API call debugger ─────────────────────────────────────────
  useEffect(() => {
    const orig = window.fetch
    window.fetch = async (input, init) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : (input as Request).url
      const method = (
        init?.method ||
        (input instanceof Request ? input.method : undefined) ||
        'GET'
      ).toUpperCase()
      // Skip internal Next.js / webpack noise
      const skip =
        url.includes('/_next/') ||
        url.includes('/__next') ||
        url.includes('webpack') ||
        url.includes('hot-update')
      if (skip) return orig(input, init)
      const t0 = performance.now()
      console.log(`[EFI API] ➜ ${method} ${url}`)
      try {
        const res = await orig(input, init)
        console.log(
          `[EFI API] ✓ ${method} ${url}  →  ${res.status} (${(performance.now() - t0).toFixed(0)}ms)`
        )
        return res
      } catch (err) {
        console.error(
          `[EFI API] ✗ ${method} ${url}  →  ${(err as Error).message} (${(performance.now() - t0).toFixed(0)}ms)`
        )
        throw err
      }
    }
    return () => {
      window.fetch = orig
    }
  }, [])
  // ──────────────────────────────────────────────────────────────────────────

  const startDrag = (e: React.MouseEvent, id: string) => {
    e.preventDefault()
    e.stopPropagation()
    const cur = panelOffsets[id] || { x: 0, y: 0 }
    dragState.current = {
      id,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startX: cur.x,
      startY: cur.y,
    }
  }

  // Load saved layout on mount
  useEffect(() => {
    fetch('/api/analysis-suite-layout')
      .then((r) => r.json())
      .then(({ data }) => {
        if (data?.panelOffsets) setPanelOffsets(data.panelOffsets)
        if (data?.panelEnabled) setPanelEnabled(data.panelEnabled)
      })
      .catch(() => {})
  }, [])

  const saveLayout = async () => {
    setLayoutSaving(true)
    try {
      await fetch('/api/analysis-suite-layout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ panelOffsets, panelEnabled }),
      })
      setLayoutSaved(true)
      setTimeout(() => setLayoutSaved(false), 2000)
    } finally {
      setLayoutSaving(false)
    }
  }

  // Build a Trade analysis state
  const [rsSignals, setRsSignals] = useState<{
    breakout: boolean
    rareLow: boolean
    breakdown: boolean
    classification: string | null
    percentile: number
    currentPrice: number
    priceChange: number
    priceChangePercent: number
  }>({
    breakout: false,
    rareLow: false,
    breakdown: false,
    classification: null,
    percentile: 0,
    currentPrice: 0,
    priceChange: 0,
    priceChangePercent: 0,
  })
  const [leadershipSignal, setLeadershipSignal] = useState<{
    isLeader: boolean
    breakoutType: string | null
    classification: string | null
    leadershipScore: number
    currentPrice: number
    priceChange: number
    priceChangePercent: number
    volumeRatio: number
    daysSinceLastHigh: number
    highDistance: number
    trend?: string
    currentVolume?: number
    avgVolume?: number
  } | null>(null)

  const fetchIVData = async (ticker: string, period: '1Y' | '2Y' | '5Y') => {
    const days = period === '1Y' ? 365 : period === '2Y' ? 730 : 1825

    try {
      const response = await fetch(`/api/calculate-historical-iv?ticker=${ticker}&days=${days}`)

      if (!response.ok) {
        return null
      }

      const result = await response.json()

      if (!result.success) {
        return null
      }

      if (!result.data?.history?.length) {
        return null
      }

      const history = result.data.history

      const ivValues = history
        .map((h: any) => (h.callIV && h.putIV ? (h.callIV + h.putIV) / 2 : null))
        .filter((v: any) => v !== null)

      if (ivValues.length === 0) {
        return null
      }

      const minIV = Math.min(...ivValues)
      const maxIV = Math.max(...ivValues)

      const chartData = history.map((h: any) => {
        const netIV = h.callIV && h.putIV ? (h.callIV + h.putIV) / 2 : 0
        const ivRank = netIV && maxIV !== minIV ? ((netIV - minIV) / (maxIV - minIV)) * 100 : 0
        const ivPercentile = netIV
          ? (ivValues.filter((v: number) => v <= netIV).length / ivValues.length) * 100
          : 0

        return {
          date: h.date,
          callIV: h.callIV || 0,
          putIV: h.putIV || 0,
          netIV,
          ivRank,
          ivPercentile,
          price: h.price || 0,
        }
      })

      return chartData
    } catch (error) {
      console.error('Failed to fetch IV data:', error)
    }
    return null
  }

  const handlePeriodChange = async (newPeriod: '1Y' | '2Y' | '5Y') => {
    if (!currentTicker) return

    setIvPeriod(newPeriod)

    // Check if data is cached
    if (ivDataCache[currentTicker]?.[newPeriod]) {
      setIvData(ivDataCache[currentTicker][newPeriod])
      return
    }

    // Fetch new data
    setIsScanning(true)
    const data = await fetchIVData(currentTicker, newPeriod)
    setIsScanning(false)

    if (data) {
      setIvData(data)
      setIvDataCache((prev) => ({
        ...prev,
        [currentTicker]: {
          ...prev[currentTicker],
          [newPeriod]: data,
        },
      }))
    }
  }

  const handleAnalyze = async () => {
    if (!tickerInput.trim()) return

    setIsScanning(true)
    setIvData([])
    setOptionsFlowData([])
    setCurrentTicker(tickerInput)

    // Clear RS and Leadership signals immediately when new ticker is searched
    setRsSignals({
      breakout: false,
      rareLow: false,
      breakdown: false,
      classification: null,
      percentile: 0,
      currentPrice: 0,
      priceChange: 0,
      priceChangePercent: 0,
    })
    setLeadershipSignal(null)

    // Reset OI/GEX expiration when ticker changes
    setSharedExpiration('')
    setExpirationDates([])
    setGaugeMetrics(null)
    setSeasonal30DayData(null)
    setElectionSeasonal30DayData(null)
    setGradePanelReady(false)

    // Always fetch fresh IV data to show loading state, don't use cache during initial scan
    if (panelEnabled.ivCharts) {
      const data = await fetchIVData(tickerInput, ivPeriod)
      if (data) {
        setIvData(data)
        setIvDataCache((prev) => ({
          ...prev,
          [tickerInput]: {
            ...prev[tickerInput],
            [ivPeriod]: data,
          },
        }))
      }
    }

    // Fetch options flow data after IV data
    if (panelEnabled.efiFlow) {
      try {
        const flowResponse = await fetch(`/api/efi-with-positioning?ticker=${tickerInput}`)
        if (flowResponse.ok) {
          const flowResult = await flowResponse.json()
          if (flowResult.trades && flowResult.trades.length > 0) {
            setOptionsFlowData(flowResult.trades)
          }
        }
      } catch (error) {
        console.error('Failed to fetch options flow:', error)
      }
    }

    // Fetch RS and Leadership signals
    if (panelEnabled.rsStatus) checkRSSignals(tickerInput)
    if (panelEnabled.leadership) checkLeadershipSignals(tickerInput)

    setIsScanning(false)
  }

  // Check RS Signals
  const checkRSSignals = async (ticker: string) => {
    try {
      const endDate = new Date().toISOString().split('T')[0]
      const startDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

      const [tickerResp, spyResp] = await Promise.all([
        fetch(
          `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${startDate}/${endDate}?adjusted=true&sort=asc&apiKey=${process.env.NEXT_PUBLIC_POLYGON_API_KEY || ''}`
        ),
        fetch(
          `https://api.polygon.io/v2/aggs/ticker/SPY/range/1/day/${startDate}/${endDate}?adjusted=true&sort=asc&apiKey=${process.env.NEXT_PUBLIC_POLYGON_API_KEY || ''}`
        ),
      ])

      if (!tickerResp.ok || !spyResp.ok) {
        return
      }

      const tickerData = await tickerResp.json()
      const spyData = await spyResp.json()

      if (!tickerData.results || !spyData.results) {
        return
      }

      const rsRatios: number[] = []
      const minLength = Math.min(tickerData.results.length, spyData.results.length)
      for (let i = 0; i < minLength; i++) {
        const tickerPrice = tickerData.results[i].c
        const spyPrice = spyData.results[i].c
        if (tickerPrice && spyPrice && spyPrice !== 0) {
          rsRatios.push(tickerPrice / spyPrice)
        }
      }

      if (rsRatios.length < 50) {
        return
      }

      const currentRS = rsRatios[rsRatios.length - 1]
      const rsHigh = Math.max(...rsRatios)
      const rsLow = Math.min(...rsRatios)
      const rsSMA50 = rsRatios.slice(-50).reduce((a, b) => a + b, 0) / 50
      const percentile = ((currentRS - rsLow) / (rsHigh - rsLow)) * 100

      const latest = tickerData.results[tickerData.results.length - 1]
      const previous = tickerData.results[tickerData.results.length - 2]

      const classification =
        percentile >= 85
          ? 'Leader'
          : percentile >= 50
            ? 'Above Average'
            : percentile >= 25
              ? 'Below Average'
              : 'Laggard'

      const breakout = currentRS >= rsHigh * 0.97 && percentile >= 85
      const rareLow = percentile <= 25 && currentRS >= rsSMA50
      const breakdown = currentRS <= rsLow * 1.03 && percentile <= 15

      setRsSignals({
        breakout,
        rareLow,
        breakdown,
        classification,
        percentile,
        currentPrice: latest.c,
        priceChange: latest.c - previous.c,
        priceChangePercent: ((latest.c - previous.c) / previous.c) * 100,
      })
    } catch (error) {
      console.error('RS check failed:', error)
    }
  }

  // Check Leadership Signals
  const checkLeadershipSignals = async (ticker: string) => {
    try {
      const endDate = new Date().toISOString().split('T')[0]
      const startDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      const response = await fetch(
        `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${startDate}/${endDate}?adjusted=true&sort=asc&apiKey=${process.env.NEXT_PUBLIC_POLYGON_API_KEY || ''}`
      )
      if (!response.ok) {
        setLeadershipSignal(null)
        return
      }
      const data = await response.json()
      if (!data.results) {
        setLeadershipSignal(null)
        return
      }
      if (data.results.length < 50) {
        setLeadershipSignal(null)
        return
      }

      const prices = data.results.map((r: any) => r.c)
      const volumes = data.results.map((r: any) => r.v)
      const highs = data.results.map((r: any) => r.h)

      const currentPrice = prices[prices.length - 1]
      const previousPrice = prices[prices.length - 2]
      const priceChange = currentPrice - previousPrice
      const priceChangePercent = (priceChange / previousPrice) * 100

      // Calculate 52-week high and ALL-TIME high
      const weekHigh52 = Math.max(...highs)
      const allTimeHighInData = Math.max(...highs)
      const highDistance = ((currentPrice - weekHigh52) / weekHigh52) * 100

      // FRESH BREAKOUT DETECTION
      const minDaysBelow = 45
      let isNewBreakout = false
      let breakoutType: 'Fresh 52W High' | 'All-Time High' | 'Near High' = 'Near High'
      let daysSinceLastHigh = 0

      const isReachingATH = currentPrice >= allTimeHighInData * 0.99
      const isReaching52WHigh = currentPrice >= weekHigh52 * 0.99

      if (isReachingATH || isReaching52WHigh) {
        let wasBelow = true

        for (let i = highs.length - 2; i >= Math.max(0, highs.length - 90); i--) {
          const pastHigh = highs[i]
          const daysAgo = highs.length - 1 - i

          if (pastHigh >= weekHigh52 * 0.99) {
            if (daysAgo <= minDaysBelow) {
              wasBelow = false
              break
            } else {
              daysSinceLastHigh = daysAgo
              break
            }
          }
        }

        if (daysSinceLastHigh === 0) {
          daysSinceLastHigh = 90
        }

        if (wasBelow && daysSinceLastHigh >= minDaysBelow) {
          isNewBreakout = true

          if (currentPrice >= allTimeHighInData * 0.99) {
            breakoutType = 'All-Time High'
          } else {
            breakoutType = 'Fresh 52W High'
          }
        }
      }

      // Only process stocks that are fresh breakouts
      if (!isNewBreakout) {
        setLeadershipSignal(null)
        return
      }

      // Volume analysis
      const currentVolume = volumes[volumes.length - 1]
      const avgVolume = volumes.slice(-20).reduce((a: number, b: number) => a + b, 0) / 20
      const volumeRatio = currentVolume / avgVolume

      // Moving averages
      const ma20 = prices.slice(-20).reduce((a: number, b: number) => a + b, 0) / 20
      const ma50 = prices.slice(-50).reduce((a: number, b: number) => a + b, 0) / 50
      const ma200 = prices.slice(-200).reduce((a: number, b: number) => a + b, 0) / 200

      // Trend Analysis
      const shortTermTrend = currentPrice > ma20 && ma20 > ma50
      const longTermTrend = ma50 > ma200
      const priceAboveMA = currentPrice > ma20 && currentPrice > ma50 && currentPrice > ma200

      let trend: string
      let trendStrength = 0

      if (priceAboveMA && shortTermTrend && longTermTrend) {
        trend = 'Strong Uptrend'
        trendStrength = 90
      } else if (priceAboveMA && shortTermTrend) {
        trend = 'Moderate Uptrend'
        trendStrength = 70
      } else if (currentPrice > ma20) {
        trend = 'Consolidating'
        trendStrength = 50
      } else {
        trend = 'Weakening'
        trendStrength = 30
      }

      // Enhanced Leadership Score for Fresh Breakouts
      const breakoutScore = breakoutType === 'All-Time High' ? 40 : 35
      const volumeScore = volumeRatio >= 2.0 ? 30 : volumeRatio >= 1.5 ? 20 : 10
      const maScore = priceAboveMA ? 20 : currentPrice > ma20 ? 10 : 0
      const momentumScore = priceChangePercent >= 3 ? 15 : priceChangePercent >= 1 ? 10 : 5

      const leadershipScore = breakoutScore + volumeScore + maScore + momentumScore

      // Classification for Breakout Stocks
      let classification: string
      if (leadershipScore >= 90 && breakoutType === 'All-Time High') {
        classification = 'Market Leader'
      } else if (leadershipScore >= 80) {
        classification = 'Sector Leader'
      } else if (leadershipScore >= 70) {
        classification = 'Emerging Leader'
      } else {
        classification = 'Momentum Play'
      }

      // Higher threshold for fresh breakouts - we want quality
      if (leadershipScore >= 70 && volumeRatio >= 1.2) {
        setLeadershipSignal({
          isLeader: true,
          breakoutType,
          classification,
          leadershipScore,
          currentPrice,
          priceChange,
          priceChangePercent,
          volumeRatio,
          daysSinceLastHigh,
          highDistance,
          trend,
          currentVolume,
          avgVolume,
        })
      } else {
        setLeadershipSignal(null)
      }
    } catch (error) {
      console.error('Leadership check failed:', error)
      setLeadershipSignal(null)
    }
  }

  // Mouse tracking for drag-to-reposition
  useEffect(() => {
    if (!isEditMode) return
    const onMove = (e: MouseEvent) => {
      if (!dragState.current) return
      const { id, startMouseX, startMouseY, startX, startY } = dragState.current
      setPanelOffsets((prev) => ({
        ...prev,
        [id]: { x: startX + e.clientX - startMouseX, y: startY + e.clientY - startMouseY },
      }))
    }
    const onUp = () => {
      dragState.current = null
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [isEditMode])

  // Stable seasonal callback — must NOT be an inline function, or SeasonalityChart's
  // internal useEffect re-runs every parent render and pumps stale previous-ticker data.
  const handleSeasonalDataLoaded = React.useCallback(
    (_monthly: any, best30Day: any, worst30Day: any, mode?: 'normal' | 'election') => {
      if (mode === 'election') {
        setElectionSeasonal30DayData({ best30Day, worst30Day })
      } else {
        setSeasonal30DayData({ best30Day, worst30Day })
      }
    },
    []
  ) // setters are stable, no deps needed

  // ─── GRADE PANEL READY GATE ────────────────────────────────────────────────
  // Only open the gate when ALL async data sources have reported in.
  // If a panel is disabled, skip its gate (it will never fire a callback).
  useEffect(() => {
    if (isScanning) return
    // All required panels must be enabled AND have loaded data for grading to occur
    if (!panelEnabled.liquidPanel || !panelEnabled.seasonality || !panelEnabled.rsStatus) {
      setGradePanelReady(false)
      return
    }
    const gaugeReady = gaugeMetrics !== null
    const seasonReady = seasonal30DayData !== null
    const priceReady = rsSignals.currentPrice > 0
    if (gaugeReady && seasonReady && priceReady) setGradePanelReady(true)
  }, [
    isScanning,
    gaugeMetrics,
    seasonal30DayData,
    rsSignals.currentPrice,
    panelEnabled.liquidPanel,
    panelEnabled.seasonality,
    panelEnabled.rsStatus,
  ])

  // ─── GRADING ENGINE ─────────────────────────────────────────────────────────
  const gradeData = useMemo(() => {
    if (!currentTicker) return null

    const today = new Date()
    const currentPrice = rsSignals.currentPrice || 0

    // ── SECTION 1: LIQUID PANEL ──────────────────────────────────────────────
    // Magnet (70% of liquid panel)
    const zone = dealerZones[currentTicker.toUpperCase()] || null
    let magnetScore = 0
    let magnetDays: number | null = null
    let magnetAbove: boolean | null = null
    const goldenStrike: number | null = zone?.golden ?? null
    const purpleStrike: number | null = zone?.purple ?? null

    if (zone?.goldenDetail?.expiry && currentPrice > 0) {
      const expDate = new Date(zone.goldenDetail.expiry + 'T00:00:00Z')
      magnetDays = Math.ceil((expDate.getTime() - today.getTime()) / 86400000)
      magnetAbove = zone.golden != null ? zone.golden > currentPrice : null
      if (magnetDays <= 14 && magnetAbove !== null) {
        magnetScore = magnetAbove ? 100 : -100
      }
    }
    const magnetContrib = magnetScore * 0.7

    // Purple zone (modifier: ±10)
    let purpleScore = 0
    if (purpleStrike != null && currentPrice > 0) {
      if (currentPrice > purpleStrike)
        purpleScore = 10 // above purple = support below = bullish
      else purpleScore = -10 // below purple = resistance above = bearish
    }

    // Gauge Trio (30% of liquid panel split equally 3 gauges)
    let gaugeContrib = 0
    if (gaugeMetrics) {
      const flowNorm = Math.max(-100, Math.min(100, (gaugeMetrics.compositeScore / 20) * 100))
      const dealerNorm = flowNorm // dealer signal also uses compositeScore
      const siNorm = Math.max(-100, Math.min(100, gaugeMetrics.siNorm * 50))
      gaugeContrib = ((flowNorm + dealerNorm + siNorm) / 3) * 0.3
    }

    const liquidScore = Math.max(-100, Math.min(100, magnetContrib + gaugeContrib + purpleScore))

    // ── SECTION 2: EFI OPTIONS FLOW ──────────────────────────────────────────
    let flowScore = 0
    if (optionsFlowData.length > 0) {
      let bullPremium = 0
      let bearPremium = 0
      optionsFlowData.forEach((t) => {
        const prem = t.total_premium || 0
        if (t.type === 'call') bullPremium += prem
        else if (t.type === 'put') bearPremium += prem
      })
      const totalFlow = bullPremium + bearPremium
      if (totalFlow > 0) {
        flowScore = Math.max(-100, Math.min(100, ((bullPremium - bearPremium) / totalFlow) * 100))
      }
    }

    // ── SECTION 3: SEASONALITY ───────────────────────────────────────────────
    // SeasonalityChart emits dates as 'Mon D' strings (e.g. 'Jul 2', 'Jan 31').
    // Convert to a numeric month*100+day value for correct month-day comparison.
    const SEASON_MONTHS = [
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
    const parseMonDay = (str: string): number => {
      const space = str.indexOf(' ')
      const mon = SEASON_MONTHS.indexOf(str.slice(0, space))
      return mon * 100 + parseInt(str.slice(space + 1), 10)
    }
    const todayMD = today.getMonth() * 100 + today.getDate()

    // Score helper — works for both normal and election/cycle datasets
    const calcSeasonScore = (data: typeof seasonal30DayData): number => {
      if (!data) return 0
      let s = 0
      if (data.best30Day?.startDate && data.best30Day?.endDate) {
        const sMD = parseMonDay(data.best30Day.startDate)
        const eMD = parseMonDay(data.best30Day.endDate)
        if (sMD <= todayMD && todayMD <= eMD) s += 60
      }
      if (data.worst30Day?.startDate && data.worst30Day?.endDate) {
        const sMD = parseMonDay(data.worst30Day.startDate)
        const eMD = parseMonDay(data.worst30Day.endDate)
        if (sMD <= todayMD && todayMD <= eMD) s -= 60
      }
      return Math.max(-100, Math.min(100, s))
    }

    const normalSeasonScore = calcSeasonScore(seasonal30DayData)
    const elecSeasonScore = calcSeasonScore(electionSeasonal30DayData)
    // Both modes available → 50% normal + 50% election. One mode only → full weight.
    let seasonScore = electionSeasonal30DayData
      ? (normalSeasonScore + elecSeasonScore) / 2
      : normalSeasonScore
    seasonScore = Math.max(-100, Math.min(100, seasonScore))
    const inBullish30 = seasonScore > 0
    const inBearish30 = seasonScore < 0

    // ── SECTION 4: IMPLIED VOLATILITY ────────────────────────────────────────
    let ivScore = 0
    let ivRank: number | null = null
    let ivPercentile: number | null = null
    let ivTrend: 'rising' | 'falling' | 'stable' | null = null
    if (ivData.length >= 5) {
      const latest = ivData[ivData.length - 1]
      ivRank = latest.ivRank
      ivPercentile = latest.ivPercentile
      // Trend: compare last 5
      const recent5 = ivData.slice(-5).map((d) => d.netIV)
      const ivChange = recent5[4] - recent5[0]
      if (ivChange > 1) ivTrend = 'rising'
      else if (ivChange < -1) ivTrend = 'falling'
      else ivTrend = 'stable'

      // Scoring
      if (ivRank < 10)
        ivScore = -30 // very low = spike risk = bearish
      else if (ivRank < 25)
        ivScore = 40 // low = bullish
      else if (ivRank < 50)
        ivScore = 20 // moderate-low = slightly bullish
      else if (ivRank < 75)
        ivScore = -20 // moderate-high = slightly bearish
      else if (ivRank < 90)
        ivScore = -40 // high = bearish
      else ivScore = -60 // very high = very bearish

      // IV reversal bonus
      if (ivTrend === 'falling' && ivRank >= 60) ivScore += 30
      if (ivTrend === 'rising' && ivRank <= 40) ivScore -= 20
    }

    // ── SHORT-TERM COMPOSITE (0-2 days) ──────────────────────────────────────
    // Weights: Liquid 35%, Flow 35%, Seasonality 15%, IV 15%
    const shortScore = liquidScore * 0.35 + flowScore * 0.35 + seasonScore * 0.15 + ivScore * 0.15

    // ── MEDIUM-TERM COMPOSITE (3-15 days) ────────────────────────────────────
    // Weights: Liquid 25%, Flow 20%, Seasonality 30%, IV 25%
    const medScore = liquidScore * 0.25 + flowScore * 0.2 + seasonScore * 0.3 + ivScore * 0.25

    const toGrade = (score: number) => {
      if (score >= 70) return { letter: 'A+', label: 'STRONG BULL', color: '#00CC00' }
      if (score >= 50) return { letter: 'A', label: 'BULLISH', color: '#00CC00' }
      if (score >= 30) return { letter: 'B+', label: 'LEAN BULL', color: '#00CC00' }
      if (score >= 10) return { letter: 'B', label: 'MILD BULL BIAS', color: '#00CC00' }
      if (score >= -10) return { letter: 'C', label: 'NEUTRAL', color: '#FFFF00' }
      if (score >= -30) return { letter: 'D', label: 'MILD BEAR BIAS', color: '#FF2222' }
      if (score >= -50) return { letter: 'D-', label: 'LEAN BEAR', color: '#FF2222' }
      if (score >= -70) return { letter: 'F', label: 'BEARISH', color: '#FF2222' }
      return { letter: 'F-', label: 'STRONG BEAR', color: '#FF2222' }
    }

    return {
      shortGrade: toGrade(shortScore),
      medGrade: toGrade(medScore),
      shortScore: Math.round(shortScore),
      medScore: Math.round(medScore),
      sections: {
        liquid: {
          score: Math.round(liquidScore),
          magnetAbove,
          magnetDays,
          goldenStrike,
          purpleStrike,
          purpleAbove: purpleStrike != null ? currentPrice > purpleStrike : null,
        },
        flow: { score: Math.round(flowScore) },
        season: { score: Math.round(seasonScore), inBullish30, inBearish30 },
        iv: { score: Math.round(ivScore), ivRank, ivPercentile, ivTrend },
      },
    }
  }, [
    currentTicker,
    rsSignals.currentPrice,
    dealerZones,
    gaugeMetrics,
    optionsFlowData,
    seasonal30DayData,
    electionSeasonal30DayData,
    ivData,
  ])

  // ─── EFI NOTABLE CRITERIA (mirrors OptionsFlowTable logic) ──────────────────
  const efiMeetsNotableCriteria = (trade: any): boolean => {
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
    if (!trade.moneyness || trade.moneyness !== 'OTM') return false
    if (trade.total_premium < 120000 || trade.total_premium > 220000) return false
    if (trade.classification !== 'SWEEP' && trade.trade_type !== 'SWEEP') return false
    if (trade.trade_size < 600 || trade.trade_size > 1300) return false
    if (trade.premium_per_contract < 0.7 || trade.premium_per_contract > 2.0) return false
    const fillStyle = trade.fill_style || ''
    if (!['A', 'AA', 'B', 'BB'].includes(fillStyle)) return false
    return true
  }

  const efiDisplayedTrades = efiNotableFilterActive
    ? optionsFlowData.filter(efiMeetsNotableCriteria)
    : optionsFlowData

  return (
    <div
      style={{
        minHeight: '4200px',
        background: 'transparent',
        color: '#FFFFFF',
        padding: '0',
        position: 'relative',
      }}
    >
      {/* Compact Search Bar - Top Left Corner */}
      <div
        ref={panelRefs.searchBar}
        style={{
          position: 'absolute',
          top: '-50px',
          left: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          zIndex: 10,
          transform: getTransform('searchBar'),
          userSelect: isEditMode ? 'none' : undefined,
        }}
      >
        {isEditMode && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 8,
              cursor: 'grab',
              borderRadius: '6px',
              background: 'rgba(255,200,0,0.04)',
              border: '2px dashed rgba(255,200,0,0.45)',
            }}
            onMouseDown={(e) => startDrag(e, 'searchBar')}
          />
        )}
        <div
          style={{
            maxWidth: '320px',
            background: '#000000',
            border: '1px solid rgba(255, 102, 0, 0.3)',
            borderRadius: '6px',
            padding: '8px 10px',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.8)',
          }}
        >
          <div
            style={{
              display: 'flex',
              gap: '10px',
              alignItems: 'center',
            }}
          >
            <input
              type="text"
              value={tickerInput}
              onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isScanning && tickerInput.trim()) {
                  handleAnalyze()
                }
              }}
              placeholder="TICKER"
              style={{
                background: '#000000',
                border: '1px solid rgba(255, 102, 0, 0.4)',
                color: '#FF6600',
                padding: '8px 12px',
                fontSize: '14px',
                fontFamily: 'monospace',
                fontWeight: '700',
                outline: 'none',
                borderRadius: '4px',
                width: '120px',
              }}
            />

            <button
              onClick={handleAnalyze}
              disabled={isScanning || !tickerInput.trim()}
              style={{
                background: isScanning ? '#1a0a00' : '#FF6600',
                color: isScanning ? '#664400' : '#000000',
                border: '1px solid rgba(255, 102, 0, 0.6)',
                padding: '8px 16px',
                fontSize: '12px',
                fontFamily: 'monospace',
                fontWeight: '700',
                cursor: isScanning ? 'not-allowed' : 'pointer',
                letterSpacing: '1px',
                borderRadius: '4px',
                whiteSpace: 'nowrap',
              }}
            >
              {isScanning ? 'SCAN...' : 'Search'}
            </button>
          </div>
        </div>

        {/* Mini Grade Badges */}
        {gradeData && gradePanelReady && (
          <>
            {/* ST */}
            <div
              style={{
                background:
                  'linear-gradient(145deg, #010d1f 0%, #021530 40%, #031e42 70%, #010d1f 100%)',
                border: `1.5px solid ${gradeData.shortGrade.color}`,
                borderRadius: '8px',
                padding: '9px 14px',
                width: '130px',
                minHeight: '90px',
                boxSizing: 'border-box',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: '40%',
                  background:
                    'linear-gradient(180deg, rgba(100,180,255,0.08) 0%, transparent 100%)',
                  borderRadius: '8px 8px 0 0',
                  pointerEvents: 'none',
                }}
              />
              <div
                style={{
                  fontSize: '52px',
                  fontWeight: '900',
                  lineHeight: '1',
                  color: gradeData.shortGrade.color,
                  WebkitTextFillColor: gradeData.shortGrade.color,
                  fontFamily: 'JetBrains Mono, monospace',
                  letterSpacing: '-2px',
                  zIndex: 1,
                  flexShrink: 0,
                }}
              >
                {gradeData.shortGrade.letter}
              </div>
              <div style={{ zIndex: 1 }}>
                <div
                  style={{
                    fontSize: '9px',
                    color: 'rgba(160,210,255,0.9)',
                    WebkitTextFillColor: 'rgba(160,210,255,0.9)',
                    fontWeight: '700',
                    fontFamily: 'JetBrains Mono, monospace',
                    marginBottom: '4px',
                    textTransform: 'uppercase',
                  }}
                >
                  Short-Term
                </div>
                <div
                  style={{
                    fontSize: '11px',
                    color: gradeData.shortGrade.color,
                    WebkitTextFillColor: gradeData.shortGrade.color,
                    fontWeight: '800',
                    fontFamily: 'JetBrains Mono, monospace',
                    lineHeight: '1.3',
                  }}
                >
                  {gradeData.shortGrade.label}
                </div>
              </div>
            </div>
            {/* MT */}
            <div
              style={{
                background:
                  'linear-gradient(145deg, #010d1f 0%, #021530 40%, #031e42 70%, #010d1f 100%)',
                border: `1.5px solid ${gradeData.medGrade.color}`,
                borderRadius: '8px',
                padding: '9px 14px',
                width: '130px',
                minHeight: '90px',
                boxSizing: 'border-box',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: '40%',
                  background:
                    'linear-gradient(180deg, rgba(100,180,255,0.08) 0%, transparent 100%)',
                  borderRadius: '8px 8px 0 0',
                  pointerEvents: 'none',
                }}
              />
              <div
                style={{
                  fontSize: '52px',
                  fontWeight: '900',
                  lineHeight: '1',
                  color: gradeData.medGrade.color,
                  WebkitTextFillColor: gradeData.medGrade.color,
                  fontFamily: 'JetBrains Mono, monospace',
                  letterSpacing: '-2px',
                  zIndex: 1,
                  flexShrink: 0,
                }}
              >
                {gradeData.medGrade.letter}
              </div>
              <div style={{ zIndex: 1 }}>
                <div
                  style={{
                    fontSize: '9px',
                    color: 'rgba(160,210,255,0.9)',
                    WebkitTextFillColor: 'rgba(160,210,255,0.9)',
                    fontWeight: '700',
                    fontFamily: 'JetBrains Mono, monospace',
                    marginBottom: '4px',
                    textTransform: 'uppercase',
                  }}
                >
                  Medium-Term
                </div>
                <div
                  style={{
                    fontSize: '11px',
                    color: gradeData.medGrade.color,
                    WebkitTextFillColor: gradeData.medGrade.color,
                    fontWeight: '800',
                    fontFamily: 'JetBrains Mono, monospace',
                    lineHeight: '1.3',
                  }}
                >
                  {gradeData.medGrade.label}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
      {/* end search bar flex row */}
      {/* Leadership Signal Card */}
      <div
        ref={panelRefs.leadership}
        style={{
          position: 'absolute',
          top: '30px',
          left: '20px',
          width: '368px',
          background: 'linear-gradient(145deg, #020B14, #000508)',
          border: '1px solid rgba(30, 58, 138, 0.2)',
          borderRadius: '8px',
          padding: '12px',
          boxShadow: '0 4px 15px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
          fontFamily: 'JetBrains Mono, monospace',
          minHeight: '90px',
          maxHeight: '90px',
          overflow: 'hidden',
          transform: getTransform('leadership'),
          userSelect: isEditMode ? 'none' : undefined,
        }}
      >
        {isEditMode && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 8,
              cursor: 'grab',
              borderRadius: '8px',
              background: 'rgba(255,200,0,0.04)',
              border: '2px dashed rgba(255,200,0,0.45)',
            }}
            onMouseDown={(e) => startDrag(e, 'leadership')}
          />
        )}
        <button
          onClick={() => togglePanel('leadership')}
          title={panelEnabled.leadership ? 'Disable panel' : 'Enable panel'}
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            padding: '2px 8px',
            borderRadius: '3px',
            border: `1px solid ${panelEnabled.leadership ? 'rgba(0,255,100,0.35)' : 'rgba(255,80,80,0.35)'}`,
            background: panelEnabled.leadership ? 'rgba(0,255,100,0.06)' : 'rgba(255,50,50,0.06)',
            color: panelEnabled.leadership ? '#00ff64' : 'rgba(255,80,80,0.7)',
            cursor: 'pointer',
            fontSize: '9px',
            fontWeight: '700',
            letterSpacing: '1.5px',
            fontFamily: 'monospace',
            zIndex: 10,
            lineHeight: '14px',
          }}
        >
          {panelEnabled.leadership ? 'LIVE' : 'OFF'}
        </button>
        {!panelEnabled.leadership && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0,0,0,0.75)',
              borderRadius: '8px',
              zIndex: 5,
            }}
          >
            <span
              style={{
                color: 'rgba(255,255,255,0.3)',
                fontSize: '11px',
                fontWeight: '700',
                letterSpacing: '3px',
                fontFamily: 'monospace',
              }}
            >
              BYPASSED
            </span>
          </div>
        )}
        {/* Header row: ticker left, title center */}
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            display: 'grid',
            gridTemplateColumns: '1fr auto 1fr',
            alignItems: 'center',
            marginBottom: '8px',
          }}
        >
          <span
            style={{
              color: '#ff8c00',
              WebkitTextFillColor: '#ff8c00',
              fontWeight: '800',
              fontSize: '20px',
              fontFamily: 'monospace',
              letterSpacing: '1.5px',
              textShadow: '0 0 10px rgba(255, 140, 0, 0.5), 0 1px 0 rgba(0, 0, 0, 0.8)',
            }}
          >
            {currentTicker || ''}
          </span>
          <span
            style={{
              fontSize: '19px',
              fontWeight: '800',
              fontFamily: 'monospace',
              letterSpacing: '2px',
              textShadow: '0 2px 4px rgba(0, 0, 0, 0.8)',
              background: 'linear-gradient(90deg, #00d4ff, #0099cc, #00d4ff)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              filter: 'contrast(1.2) brightness(1.1)',
            }}
          >
            LEADERSHIP SIGNAL
          </span>
          <span />
        </div>

        {leadershipSignal ? (
          <>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '8px',
              }}
            >
              <div
                style={{
                  color: '#00ff41',
                  fontSize: '16.8px',
                  fontWeight: '900',
                  letterSpacing: '1px',
                  textShadow: '0 0 10px rgba(0, 255, 65, 0.4)',
                }}
              >
                {leadershipSignal.leadershipScore.toFixed(0)}/105
              </div>
              <div style={{ display: 'flex', gap: '4px' }}>
                {leadershipSignal.breakoutType && (
                  <div
                    style={{
                      background:
                        'linear-gradient(135deg, rgba(255, 255, 0, 0.2), rgba(255, 255, 0, 0.4))',
                      border: '1px solid #ffff00',
                      borderRadius: '4px',
                      padding: '4px 8px',
                      color: '#ffff00',
                      fontSize: '10.8px',
                      fontWeight: '700',
                      textShadow: '0 0 8px rgba(255, 255, 0, 0.4)',
                    }}
                  >
                    {leadershipSignal.breakoutType}
                  </div>
                )}
                {leadershipSignal.classification && (
                  <div
                    style={{
                      background:
                        'linear-gradient(135deg, rgba(0, 255, 65, 0.2), rgba(0, 255, 65, 0.4))',
                      border: '1px solid #00ff41',
                      borderRadius: '4px',
                      padding: '4px 8px',
                      color: '#00ff41',
                      fontSize: '10.8px',
                      fontWeight: '700',
                      textShadow: '0 0 8px rgba(0, 255, 65, 0.4)',
                    }}
                  >
                    {leadershipSignal.classification}
                  </div>
                )}
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr 1fr',
                gap: '12px',
                marginBottom: '12px',
              }}
            >
              <div>
                <div
                  style={{
                    color: '#FFFFFF',
                    marginBottom: '2px',
                    fontSize: '10.8px',
                    fontWeight: '600',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  CURRENT PRICE
                </div>
                <div
                  style={{
                    color: '#ffffff',
                    fontWeight: '800',
                    fontSize: '16.8px',
                  }}
                >
                  ${leadershipSignal.currentPrice.toFixed(2)}
                </div>
              </div>
              <div>
                <div
                  style={{
                    color: '#FFFFFF',
                    marginBottom: '2px',
                    fontSize: '10.8px',
                    fontWeight: '600',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  DAILY CHANGE
                </div>
                <div
                  style={{
                    color: leadershipSignal.priceChangePercent >= 0 ? '#00ff41' : '#ff073a',
                    fontWeight: '800',
                    fontSize: '14.4px',
                  }}
                >
                  {leadershipSignal.priceChangePercent >= 0 ? '+' : ''}
                  {leadershipSignal.priceChangePercent.toFixed(2)}%
                </div>
              </div>
              <div>
                <div
                  style={{
                    color: '#FFFFFF',
                    marginBottom: '2px',
                    fontSize: '10.8px',
                    fontWeight: '600',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  VOL RATIO
                </div>
                <div
                  style={{
                    color: leadershipSignal.volumeRatio >= 1.5 ? '#00ff41' : '#ffffff',
                    fontWeight: '800',
                    fontSize: '14.4px',
                  }}
                >
                  {leadershipSignal.volumeRatio.toFixed(2)}x
                </div>
              </div>
              <div>
                <div
                  style={{
                    color: '#FFFFFF',
                    marginBottom: '2px',
                    fontSize: '10.8px',
                    fontWeight: '600',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  DAYS SINCE HIGH
                </div>
                <div
                  style={{
                    color:
                      leadershipSignal.daysSinceLastHigh >= 60
                        ? '#00ff41'
                        : leadershipSignal.daysSinceLastHigh >= 30
                          ? '#ffff00'
                          : '#ff8c00',
                    fontWeight: '800',
                    fontSize: '14.4px',
                  }}
                >
                  {leadershipSignal.daysSinceLastHigh}+ DAYS
                </div>
              </div>
            </div>
          </>
        ) : (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#666',
              fontSize: '14px',
              fontFamily: 'monospace',
              minHeight: '100px',
              gap: '10px',
            }}
          >
            {isScanning ? (
              <>
                <div
                  style={{
                    width: '16px',
                    height: '16px',
                    border: '2px solid #333',
                    borderTop: '2px solid #00d4ff',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                  }}
                />
                <span>Scanning Leadership</span>
                <style jsx>{`
                  @keyframes spin {
                    0% {
                      transform: rotate(0deg);
                    }
                    100% {
                      transform: rotate(360deg);
                    }
                  }
                `}</style>
              </>
            ) : currentTicker ? (
              'Not a Leader'
            ) : (
              'No Leadership'
            )}
          </div>
        )}
      </div>
      {/* RS Status Card */}
      <div
        ref={panelRefs.rsStatus}
        style={{
          position: 'absolute',
          top: '30px',
          left: '490px',
          width: '368px',
          background: 'linear-gradient(145deg, #020B14, #000508)',
          border: '1px solid rgba(30, 58, 138, 0.2)',
          borderRadius: '8px',
          padding: '12px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
          fontFamily: 'JetBrains Mono, monospace',
          minHeight: '90px',
          maxHeight: '90px',
          overflow: 'hidden',
          backdropFilter: 'blur(10px)',
          transform: getTransform('rsStatus'),
          userSelect: isEditMode ? 'none' : undefined,
        }}
      >
        {isEditMode && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 8,
              cursor: 'grab',
              borderRadius: '8px',
              background: 'rgba(255,200,0,0.04)',
              border: '2px dashed rgba(255,200,0,0.45)',
            }}
            onMouseDown={(e) => startDrag(e, 'rsStatus')}
          />
        )}
        <button
          onClick={() => togglePanel('rsStatus')}
          title={panelEnabled.rsStatus ? 'Disable panel' : 'Enable panel'}
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            padding: '2px 8px',
            borderRadius: '3px',
            border: `1px solid ${panelEnabled.rsStatus ? 'rgba(0,255,100,0.35)' : 'rgba(255,80,80,0.35)'}`,
            background: panelEnabled.rsStatus ? 'rgba(0,255,100,0.06)' : 'rgba(255,50,50,0.06)',
            color: panelEnabled.rsStatus ? '#00ff64' : 'rgba(255,80,80,0.7)',
            cursor: 'pointer',
            fontSize: '9px',
            fontWeight: '700',
            letterSpacing: '1.5px',
            fontFamily: 'monospace',
            zIndex: 10,
            lineHeight: '14px',
          }}
        >
          {panelEnabled.rsStatus ? 'LIVE' : 'OFF'}
        </button>
        {!panelEnabled.rsStatus && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0,0,0,0.75)',
              borderRadius: '8px',
              zIndex: 5,
            }}
          >
            <span
              style={{
                color: 'rgba(255,255,255,0.3)',
                fontSize: '11px',
                fontWeight: '700',
                letterSpacing: '3px',
                fontFamily: 'monospace',
              }}
            >
              BYPASSED
            </span>
          </div>
        )}
        {/* Animated background glow */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background:
              'linear-gradient(45deg, transparent 0%, rgba(255, 140, 0, 0.02) 50%, transparent 100%)',
            borderRadius: '8px',
            pointerEvents: 'none',
            opacity: 0.6,
          }}
        />

        {/* Header row: ticker left, title center */}
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            display: 'grid',
            gridTemplateColumns: '1fr auto 1fr',
            alignItems: 'center',
            marginBottom: '8px',
          }}
        >
          <span
            style={{
              color: '#ff8c00',
              WebkitTextFillColor: '#ff8c00',
              fontWeight: '800',
              fontSize: '20px',
              fontFamily: 'monospace',
              letterSpacing: '1.5px',
              textShadow: '0 0 10px rgba(255, 140, 0, 0.5), 0 1px 0 rgba(0, 0, 0, 0.8)',
            }}
          >
            {currentTicker || ''}
          </span>
          <span
            style={{
              fontSize: '19px',
              fontWeight: '800',
              fontFamily: 'monospace',
              letterSpacing: '2px',
              textShadow: '0 2px 4px rgba(0, 0, 0, 0.8)',
              background: 'linear-gradient(90deg, #00ff41, #00cc33, #00ff41)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              filter: 'contrast(1.2) brightness(1.1)',
            }}
          >
            RS STATUS
          </span>
          <span />
        </div>

        {rsSignals.classification ? (
          <div style={{ position: 'relative', zIndex: 1 }}>
            {/* Row 1: Signal Badge */}
            {(rsSignals.breakout || rsSignals.rareLow || rsSignals.breakdown) && (
              <div
                style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <div
                  style={{
                    color: '#FFFFFF',
                    fontSize: '10.8px',
                    fontWeight: '600',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    textShadow: '0 1px 0 rgba(0, 0, 0, 0.8)',
                  }}
                >
                  SIGNAL
                </div>
                <div
                  style={{
                    background: rsSignals.breakout
                      ? 'linear-gradient(135deg, rgba(0, 255, 65, 0.2), rgba(0, 255, 65, 0.4))'
                      : rsSignals.rareLow
                        ? 'linear-gradient(135deg, rgba(0, 212, 255, 0.2), rgba(0, 212, 255, 0.4))'
                        : 'linear-gradient(135deg, rgba(255, 7, 58, 0.2), rgba(255, 7, 58, 0.4))',
                    border: rsSignals.breakout
                      ? '1px solid #00ff41'
                      : rsSignals.rareLow
                        ? '1px solid #00d4ff'
                        : '1px solid #ff073a',
                    borderRadius: '4px',
                    padding: '4px 8px',
                    color: rsSignals.breakout
                      ? '#00ff41'
                      : rsSignals.rareLow
                        ? '#00d4ff'
                        : '#ff073a',
                    fontSize: '10.8px',
                    fontWeight: '700',
                    textShadow: rsSignals.breakout
                      ? '0 0 8px rgba(0, 255, 65, 0.4)'
                      : rsSignals.rareLow
                        ? '0 0 8px rgba(0, 212, 255, 0.4)'
                        : '0 0 8px rgba(255, 7, 58, 0.4)',
                    textAlign: 'center',
                    display: 'inline-block',
                  }}
                >
                  {rsSignals.breakout
                    ? '52-WEEK RS HIGH'
                    : rsSignals.rareLow
                      ? 'RARE LOW'
                      : 'RS BREAKDOWN'}
                </div>
              </div>
            )}

            {/* Row 2: Price/Change, Percentile, Classification */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1.2fr 0.9fr 1fr',
                gap: '12px',
                fontSize: '11px',
              }}
            >
              <div>
                <div
                  style={{
                    color: '#FFFFFF',
                    marginBottom: '4px',
                    fontSize: '10.8px',
                    fontWeight: '600',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    textShadow: '0 1px 0 rgba(0, 0, 0, 0.8)',
                  }}
                >
                  PRICE / CHANGE
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div
                    style={{
                      color: '#e0e0e0',
                      fontWeight: '800',
                      fontSize: '15.6px',
                      textShadow: '0 1px 0 rgba(0, 0, 0, 0.8), 0 0 8px rgba(224, 224, 224, 0.2)',
                      WebkitFontSmoothing: 'antialiased',
                    }}
                  >
                    ${rsSignals.currentPrice.toFixed(2)}
                  </div>
                  <div
                    style={{
                      color: rsSignals.priceChange >= 0 ? '#00ff41' : '#ff073a',
                      fontSize: '13.2px',
                      fontWeight: '700',
                      textShadow: `0 0 8px ${rsSignals.priceChange >= 0 ? 'rgba(0, 255, 65, 0.4)' : 'rgba(255, 7, 58, 0.4)'}, 0 1px 0 rgba(0, 0, 0, 0.8)`,
                      letterSpacing: '0.5px',
                    }}
                  >
                    {rsSignals.priceChange >= 0 ? '+' : ''}
                    {rsSignals.priceChangePercent.toFixed(2)}%
                  </div>
                </div>
              </div>
              <div>
                <div
                  style={{
                    color: '#FFFFFF',
                    marginBottom: '4px',
                    fontSize: '10.8px',
                    fontWeight: '600',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    textShadow: '0 1px 0 rgba(0, 0, 0, 0.8)',
                  }}
                >
                  RS PERCENTILE
                </div>
                <div
                  style={{
                    color: '#ff8c00',
                    fontWeight: '800',
                    fontSize: '15.6px',
                    textShadow: '0 0 10px rgba(255, 140, 0, 0.4), 0 1px 0 rgba(0, 0, 0, 0.8)',
                    letterSpacing: '0.5px',
                    WebkitFontSmoothing: 'antialiased',
                  }}
                >
                  {rsSignals.percentile.toFixed(1)}%
                </div>
              </div>
              <div>
                <div
                  style={{
                    color: '#FFFFFF',
                    marginBottom: '4px',
                    fontSize: '10.8px',
                    fontWeight: '600',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    textShadow: '0 1px 0 rgba(0, 0, 0, 0.8)',
                  }}
                >
                  CLASSIFICATION
                </div>
                <div
                  style={{
                    color:
                      rsSignals.classification === 'LEADING'
                        ? '#00ff41'
                        : rsSignals.classification === 'IMPROVING'
                          ? '#00d4ff'
                          : rsSignals.classification === 'WEAKENING'
                            ? '#ffff00'
                            : '#ff073a',
                    fontWeight: '800',
                    fontSize: '13.2px',
                    textShadow: `0 0 12px ${
                      rsSignals.classification === 'LEADING'
                        ? '#00ff41'
                        : rsSignals.classification === 'IMPROVING'
                          ? '#00d4ff'
                          : rsSignals.classification === 'WEAKENING'
                            ? '#ffff00'
                            : '#ff073a'
                    }60, 0 1px 0 rgba(0, 0, 0, 0.8)`,
                    letterSpacing: '0.8px',
                    textTransform: 'uppercase',
                    WebkitFontSmoothing: 'antialiased',
                  }}
                >
                  {rsSignals.classification}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#666666',
              fontSize: '12px',
              fontFamily: 'JetBrains Mono, monospace',
              minHeight: '60px',
              position: 'relative',
              zIndex: 1,
              gap: '10px',
            }}
          >
            {isScanning ? (
              <>
                <div
                  style={{
                    width: '14px',
                    height: '14px',
                    border: '2px solid #333',
                    borderTop: '2px solid #00ff41',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                  }}
                />
                <span>Scanning Strength</span>
              </>
            ) : currentTicker ? (
              'No Strength'
            ) : (
              'NO RS DATA'
            )}
          </div>
        )}
      </div>
      {/* Options Flow Panel - Below Search Bar */}
      <div
        ref={panelRefs.efiFlow}
        style={{
          position: 'absolute',
          top: '180px',
          left: '20px',
          width: '930px',
          height: '365px',
          background: 'linear-gradient(145deg, #020B14, #000508)',
          border: '1px solid rgba(30, 58, 138, 0.2)',
          borderRadius: '8px',
          padding: '15px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
          zIndex: 5,
          display: 'flex',
          flexDirection: 'column',
          transform: getTransform('efiFlow'),
          userSelect: isEditMode ? 'none' : undefined,
        }}
      >
        {isEditMode && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 8,
              cursor: 'grab',
              borderRadius: '8px',
              background: 'rgba(255,200,0,0.04)',
              border: '2px dashed rgba(255,200,0,0.45)',
            }}
            onMouseDown={(e) => startDrag(e, 'efiFlow')}
          />
        )}
        <button
          onClick={() => togglePanel('efiFlow')}
          title={panelEnabled.efiFlow ? 'Disable panel' : 'Enable panel'}
          style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            padding: '2px 8px',
            borderRadius: '3px',
            border: `1px solid ${panelEnabled.efiFlow ? 'rgba(0,255,100,0.35)' : 'rgba(255,80,80,0.35)'}`,
            background: panelEnabled.efiFlow ? 'rgba(0,255,100,0.06)' : 'rgba(255,50,50,0.06)',
            color: panelEnabled.efiFlow ? '#00ff64' : 'rgba(255,80,80,0.7)',
            cursor: 'pointer',
            fontSize: '9px',
            fontWeight: '700',
            letterSpacing: '1.5px',
            fontFamily: 'monospace',
            zIndex: 10,
            lineHeight: '14px',
          }}
        >
          {panelEnabled.efiFlow ? 'LIVE' : 'OFF'}
        </button>
        {!panelEnabled.efiFlow && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0,0,0,0.75)',
              borderRadius: '8px',
              zIndex: 5,
            }}
          >
            <span
              style={{
                color: 'rgba(255,255,255,0.3)',
                fontSize: '11px',
                fontWeight: '700',
                letterSpacing: '3px',
                fontFamily: 'monospace',
              }}
            >
              BYPASSED
            </span>
          </div>
        )}
        <div
          style={{
            fontSize: '19px',
            fontWeight: '800',
            fontFamily: 'monospace',
            color: '#FFFFFF',
            marginBottom: '12px',
            letterSpacing: '2px',
            textAlign: 'center',
            textShadow: '0 2px 4px rgba(0, 0, 0, 0.8)',
            background: 'linear-gradient(90deg, #FF8C00, #FFA500, #FF8C00)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            filter: 'contrast(1.2) brightness(1.1)',
          }}
        >
          EFI FLOW HIGHLIGHTS
        </div>

        {/* NOTABLE toggle button removed — star now lives in Grade column header */}

        {optionsFlowData.length > 0 ? (
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              overflowX: 'hidden',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(30, 58, 138, 0.3)' }}>
                  <th
                    style={{
                      padding: '8px',
                      textAlign: 'left',
                      color: '#FF8C00',
                      fontSize: '15px',
                      fontFamily: 'monospace',
                      borderRight: '1px solid rgba(30, 58, 138, 0.2)',
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                    onClick={() => setEfiNotableFilterActive((p) => !p)}
                    title={efiNotableFilterActive ? 'Show all trades' : 'Show notable only'}
                  >
                    <span
                      style={{
                        color: efiNotableFilterActive ? '#FFD700' : 'rgba(255,215,0,0.35)',
                        fontSize: '16px',
                      }}
                    >
                      ★
                    </span>
                  </th>
                  <th
                    style={{
                      padding: '8px',
                      textAlign: 'left',
                      color: '#FF8C00',
                      fontSize: '15px',
                      fontFamily: 'monospace',
                      borderRight: '1px solid rgba(30, 58, 138, 0.2)',
                    }}
                  >
                    TIME
                  </th>
                  <th
                    style={{
                      padding: '8px',
                      textAlign: 'left',
                      color: '#FF8C00',
                      fontSize: '15px',
                      fontFamily: 'monospace',
                      borderRight: '1px solid rgba(30, 58, 138, 0.2)',
                    }}
                  >
                    C/P
                  </th>
                  <th
                    style={{
                      padding: '8px',
                      textAlign: 'left',
                      color: '#FF8C00',
                      fontSize: '15px',
                      fontFamily: 'monospace',
                      borderRight: '1px solid rgba(30, 58, 138, 0.2)',
                    }}
                  >
                    EXPIRATION
                  </th>
                  <th
                    style={{
                      padding: '8px',
                      textAlign: 'left',
                      color: '#FF8C00',
                      fontSize: '15px',
                      fontFamily: 'monospace',
                      borderRight: '1px solid rgba(30, 58, 138, 0.2)',
                    }}
                  >
                    TYPE
                  </th>
                  <th
                    style={{
                      padding: '8px',
                      textAlign: 'right',
                      color: '#FF8C00',
                      fontSize: '15px',
                      fontFamily: 'monospace',
                      borderRight: '1px solid rgba(30, 58, 138, 0.2)',
                    }}
                  >
                    STRIKE
                  </th>
                  <th
                    style={{
                      padding: '8px',
                      textAlign: 'left',
                      color: '#FF8C00',
                      fontSize: '15px',
                      fontFamily: 'monospace',
                      borderRight: '1px solid rgba(30, 58, 138, 0.2)',
                    }}
                  >
                    SIZE & FILL
                  </th>
                  <th
                    style={{
                      padding: '8px',
                      textAlign: 'left',
                      color: '#FF8C00',
                      fontSize: '15px',
                      fontFamily: 'monospace',
                      borderRight: '1px solid rgba(30, 58, 138, 0.2)',
                    }}
                  >
                    SPOT {'>> '} CURRENT
                  </th>
                  <th
                    style={{
                      padding: '8px',
                      textAlign: 'right',
                      color: '#FF8C00',
                      fontSize: '15px',
                      fontFamily: 'monospace',
                    }}
                  >
                    PREMIUM
                  </th>
                </tr>
              </thead>
              <tbody>
                {efiDisplayedTrades.map((trade, index) => {
                  const time = new Date(trade.trade_timestamp).toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true,
                    timeZone: 'America/Los_Angeles',
                  })
                  const grade = trade.positioning?.grade || 'N/A'
                  const color = trade.positioning?.color || '#666'
                  const fillStyle = trade.fill_style || 'N/A'
                  const fillColor =
                    fillStyle === 'A' || fillStyle === 'AA'
                      ? '#22c55e'
                      : fillStyle === 'B' || fillStyle === 'BB'
                        ? '#ef4444'
                        : '#666'

                  // Parse expiry date correctly to avoid timezone shifts
                  let expiryFormatted = 'N/A'
                  if (trade.expiry) {
                    const [year, month, day] = trade.expiry.split('-').map(Number)
                    const expiryDate = new Date(year, month - 1, day)
                    expiryFormatted = expiryDate.toLocaleDateString('en-US', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })
                  }

                  // Calculate P&L percentage
                  const entryPrice = trade.premium_per_contract || 0
                  const currentPrice =
                    trade.current_option_price || trade.current_price || entryPrice
                  const percentChange =
                    entryPrice > 0 ? ((currentPrice - entryPrice) / entryPrice) * 100 : 0
                  const percentChangeColor =
                    percentChange > 0 ? '#22c55e' : percentChange < 0 ? '#ef4444' : '#666'

                  return (
                    <tr key={index} style={{ borderBottom: '1px solid rgba(30, 58, 138, 0.1)' }}>
                      <td
                        style={{ padding: '8px', borderRight: '1px solid rgba(30, 58, 138, 0.2)' }}
                      >
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            background: color,
                            color: '#000',
                            borderRadius: '4px',
                            fontSize: '15px',
                            fontWeight: '700',
                            fontFamily: 'monospace',
                          }}
                        >
                          {grade}
                        </span>
                        <span
                          style={{
                            fontSize: '15px',
                            color: percentChangeColor,
                            fontFamily: 'monospace',
                            fontWeight: '700',
                            marginLeft: '6px',
                          }}
                        >
                          {percentChange >= 0 ? '+' : ''}
                          {percentChange.toFixed(1)}%
                        </span>
                      </td>
                      <td
                        style={{
                          padding: '8px',
                          color: '#FFFFFF',
                          fontSize: '15px',
                          fontFamily: 'monospace',
                          borderRight: '1px solid rgba(30, 58, 138, 0.2)',
                        }}
                      >
                        {time}
                      </td>
                      <td
                        style={{
                          padding: '8px',
                          fontSize: '15px',
                          fontFamily: 'monospace',
                          borderRight: '1px solid rgba(30, 58, 138, 0.2)',
                        }}
                      >
                        <span
                          style={{
                            color: trade.type === 'call' ? '#00FF00' : '#FF0000',
                            fontWeight: '700',
                          }}
                        >
                          {trade.type?.toUpperCase()}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: '8px',
                          color: '#FFFFFF',
                          fontSize: '15px',
                          fontFamily: 'monospace',
                          borderRight: '1px solid rgba(30, 58, 138, 0.2)',
                        }}
                      >
                        {expiryFormatted}
                      </td>
                      <td
                        style={{
                          padding: '8px',
                          fontSize: '15px',
                          fontFamily: 'monospace',
                          borderRight: '1px solid rgba(30, 58, 138, 0.2)',
                        }}
                      >
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '3px 10px',
                            background:
                              trade.trade_type?.toLowerCase() === 'sweep'
                                ? 'linear-gradient(145deg, #FFD700, #FFA500)'
                                : 'linear-gradient(145deg, #1E90FF, #0066CC)',
                            color: '#000',
                            borderRadius: '5px',
                            fontSize: '13px',
                            fontWeight: '700',
                            boxShadow:
                              trade.trade_type?.toLowerCase() === 'sweep'
                                ? '0 2px 4px rgba(255, 215, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.3)'
                                : '0 2px 4px rgba(30, 144, 255, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
                            textShadow: '0 1px 1px rgba(0, 0, 0, 0.2)',
                          }}
                        >
                          {(trade.trade_type || 'N/A').toUpperCase()}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: '8px',
                          color: '#FFFFFF',
                          fontSize: '15px',
                          fontFamily: 'monospace',
                          textAlign: 'right',
                          borderRight: '1px solid rgba(30, 58, 138, 0.2)',
                        }}
                      >
                        ${trade.strike?.toFixed(2)}
                      </td>
                      <td
                        style={{
                          padding: '8px',
                          fontSize: '15px',
                          fontFamily: 'monospace',
                          borderRight: '1px solid rgba(30, 58, 138, 0.2)',
                        }}
                      >
                        <span style={{ color: '#06B6D4' }}>{trade.trade_size}</span> @
                        <span style={{ color: '#EAB308' }}>
                          ${trade.premium_per_contract?.toFixed(2)}
                        </span>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '1px 4px',
                            marginLeft: '4px',
                            background: `${fillColor}22`,
                            color: fillColor,
                            border: `1px solid ${fillColor}`,
                            borderRadius: '3px',
                            fontSize: '13px',
                            fontWeight: '700',
                          }}
                        >
                          {fillStyle}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: '8px',
                          fontSize: '15px',
                          fontFamily: 'monospace',
                          borderRight: '1px solid rgba(30, 58, 138, 0.2)',
                        }}
                      >
                        <span style={{ color: '#FFFFFF' }}>${trade.spot_price?.toFixed(2)}</span>
                        <span style={{ color: '#666' }}> {'>>'} </span>
                        <span style={{ color: '#ef4444' }}>
                          ${(trade.current_stock_price || trade.spot_price)?.toFixed(2)}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: '8px',
                          color: '#00FF00',
                          fontSize: '15px',
                          fontFamily: 'monospace',
                          textAlign: 'right',
                          fontWeight: '700',
                        }}
                      >
                        ${(trade.total_premium / 1000).toFixed(0)}K
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#666',
              fontSize: '14px',
              fontFamily: 'monospace',
              gap: '10px',
            }}
          >
            {isScanning ? (
              <>
                <div
                  style={{
                    width: '16px',
                    height: '16px',
                    border: '2px solid #333',
                    borderTop: '2px solid #FF8C00',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                  }}
                />
                <span>Scanning Flow</span>
              </>
            ) : currentTicker ? (
              'No Notable Flow'
            ) : (
              'No trades'
            )}
          </div>
        )}
      </div>
      {/* EFI Chart - Top Right */}
      <div
        ref={panelRefs.efiChart}
        style={{
          position: 'absolute',
          top: '-50px',
          right: '20px',
          width: '25%',
          height: '762px',
          transform: getTransform('efiChart'),
          userSelect: isEditMode ? 'none' : undefined,
        }}
      >
        {isEditMode && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 8,
              cursor: 'grab',
              borderRadius: '8px',
              background: 'rgba(255,200,0,0.04)',
              border: '2px dashed rgba(255,200,0,0.45)',
            }}
            onMouseDown={(e) => startDrag(e, 'efiChart')}
          />
        )}
        <button
          onClick={() => togglePanel('efiChart')}
          title={panelEnabled.efiChart ? 'Disable panel' : 'Enable panel'}
          style={{
            position: 'absolute',
            top: '60px',
            right: '10px',
            padding: '2px 8px',
            borderRadius: '3px',
            border: `1px solid ${panelEnabled.efiChart ? 'rgba(0,255,100,0.35)' : 'rgba(255,80,80,0.35)'}`,
            background: panelEnabled.efiChart ? 'rgba(0,255,100,0.06)' : 'rgba(255,50,50,0.06)',
            color: panelEnabled.efiChart ? '#00ff64' : 'rgba(255,80,80,0.7)',
            cursor: 'pointer',
            fontSize: '9px',
            fontWeight: '700',
            letterSpacing: '1.5px',
            fontFamily: 'monospace',
            zIndex: 2000,
            lineHeight: '14px',
          }}
        >
          {panelEnabled.efiChart ? 'LIVE' : 'OFF'}
        </button>
        {!panelEnabled.efiChart && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0,0,0,0.75)',
              borderRadius: '8px',
              zIndex: 5,
            }}
          >
            <span
              style={{
                color: 'rgba(255,255,255,0.3)',
                fontSize: '11px',
                fontWeight: '700',
                letterSpacing: '3px',
                fontFamily: 'monospace',
              }}
            >
              BYPASSED
            </span>
          </div>
        )}
        {currentTicker && panelEnabled.efiChart ? (
          <>
            <style jsx global>{`
              /* Hide sidebar completely */
              .sidebar-container {
                display: none !important;
              }
              /* Make chart full width without sidebar */
              .w-full.h-full.flex > div:first-child {
                width: 100% !important;
              }
              /* Hide star and multi chart buttons */
              button[title*='Watchlist'],
              button[title*='watchlist'],
              button[title*='favorite'],
              button[title*='star'],
              button:has(svg > path[d*='M12 2']),
              button[title*='multi chart'],
              button[title*='Multi Chart'],
              button[title*='Chart Layout'] {
                display: none !important;
              }
            `}</style>
            <EFIChart
              symbol={currentTicker}
              initialTimeframe="1d"
              height={762}
              lwToolbarPosition="left"
              disableSidebarAutoScan={true}
            />
          </>
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              background: 'linear-gradient(145deg, #020B14, #000508)',
              border: '1px solid rgba(30, 58, 138, 0.2)',
              borderRadius: '8px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'JetBrains Mono, monospace',
            }}
          >
            <div
              style={{
                color: 'rgba(255,255,255,0.2)',
                fontSize: '13px',
                fontWeight: '600',
                letterSpacing: '2px',
                textTransform: 'uppercase',
              }}
            >
              {!panelEnabled.efiChart ? 'BYPASSED' : 'Search a ticker to load chart'}
            </div>
          </div>
        )}
      </div>
      {/* Seasonality Chart - Below EFI Chart */}
      <div
        ref={panelRefs.seasonality}
        style={{
          position: 'absolute',
          top: '695px',
          right: '20px',
          width: '32%',
          overflow: 'hidden',
          transform: getTransform('seasonality'),
          userSelect: isEditMode ? 'none' : undefined,
          zoom: 0.7,
        }}
      >
        {isEditMode && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 8,
              cursor: 'grab',
              borderRadius: '8px',
              background: 'rgba(255,200,0,0.04)',
              border: '2px dashed rgba(255,200,0,0.45)',
            }}
            onMouseDown={(e) => startDrag(e, 'seasonality')}
          />
        )}
        <button
          onClick={() => togglePanel('seasonality')}
          title={panelEnabled.seasonality ? 'Disable panel' : 'Enable panel'}
          style={{
            position: 'absolute',
            top: '-45px',
            right: '0px',
            padding: '2px 8px',
            borderRadius: '3px',
            border: `1px solid ${panelEnabled.seasonality ? 'rgba(0,255,100,0.35)' : 'rgba(255,80,80,0.35)'}`,
            background: panelEnabled.seasonality ? 'rgba(0,255,100,0.06)' : 'rgba(255,50,50,0.06)',
            color: panelEnabled.seasonality ? '#00ff64' : 'rgba(255,80,80,0.7)',
            cursor: 'pointer',
            fontSize: '9px',
            fontWeight: '700',
            letterSpacing: '1.5px',
            fontFamily: 'monospace',
            zIndex: 2000,
            lineHeight: '14px',
          }}
        >
          {panelEnabled.seasonality ? 'LIVE' : 'OFF'}
        </button>
        <div style={{ position: 'relative' }}>
          {!panelEnabled.seasonality && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(0,0,0,0.75)',
                borderRadius: '8px',
                zIndex: 5,
              }}
            >
              <span
                style={{
                  color: 'rgba(255,255,255,0.3)',
                  fontSize: '11px',
                  fontWeight: '700',
                  letterSpacing: '3px',
                  fontFamily: 'monospace',
                }}
              >
                BYPASSED
              </span>
            </div>
          )}
          {panelEnabled.seasonality && currentTicker ? (
            <div
              style={{
                overflow: 'hidden',
                height: '760px',
                paddingTop: '100px',
                boxSizing: 'border-box',
              }}
            >
              <SeasonalityChart
                autoStart={!!currentTicker}
                hideScreener={true}
                initialSymbol={currentTicker || undefined}
                onMonthlyDataLoaded={handleSeasonalDataLoaded}
              />
            </div>
          ) : (
            <div
              style={{
                background: 'linear-gradient(145deg, #020B14, #000508)',
                border: '1px solid rgba(30, 58, 138, 0.2)',
                borderRadius: '8px',
                height: '760px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span
                style={{
                  color: 'rgba(255,255,255,0.2)',
                  fontSize: '13px',
                  fontWeight: '600',
                  letterSpacing: '3px',
                  fontFamily: 'JetBrains Mono, monospace',
                }}
              >
                {!panelEnabled.seasonality ? 'BYPASSED' : 'SEASONALITY'}
              </span>
            </div>
          )}
        </div>
      </div>
      {/* OI + GEX Charts — third column, beside RS Status and EFI Flow panel */}
      <div
        ref={panelRefs.oiGex}
        style={{
          position: 'absolute',
          top: '30px',
          left: '960px',
          width: 'fit-content',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          transform: getTransform('oiGex'),
          userSelect: isEditMode ? 'none' : undefined,
          zoom: 0.9,
        }}
      >
        {isEditMode && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 8,
              cursor: 'grab',
              background: 'rgba(255,200,0,0.04)',
              border: '2px dashed rgba(255,200,0,0.45)',
            }}
            onMouseDown={(e) => startDrag(e, 'oiGex')}
          />
        )}
        {/* OI Chart wrapper */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => togglePanel('oiChart')}
            title={panelEnabled.oiChart ? 'Disable panel' : 'Enable panel'}
            style={{
              position: 'absolute',
              top: '10px',
              right: '10px',
              padding: '2px 8px',
              borderRadius: '3px',
              border: `1px solid ${panelEnabled.oiChart ? 'rgba(0,255,100,0.35)' : 'rgba(255,80,80,0.35)'}`,
              background: panelEnabled.oiChart ? 'rgba(0,255,100,0.06)' : 'rgba(255,50,50,0.06)',
              color: panelEnabled.oiChart ? '#00ff64' : 'rgba(255,80,80,0.7)',
              cursor: 'pointer',
              fontSize: '9px',
              fontWeight: '700',
              letterSpacing: '1.5px',
              fontFamily: 'monospace',
              zIndex: 20,
              lineHeight: '14px',
            }}
          >
            {panelEnabled.oiChart ? 'LIVE' : 'OFF'}
          </button>
          {!panelEnabled.oiChart && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(0,0,0,0.75)',
                borderRadius: '8px',
                zIndex: 5,
              }}
            >
              <span
                style={{
                  color: 'rgba(255,255,255,0.3)',
                  fontSize: '11px',
                  fontWeight: '700',
                  letterSpacing: '3px',
                  fontFamily: 'monospace',
                }}
              >
                BYPASSED
              </span>
            </div>
          )}
          {currentTicker && panelEnabled.oiChart ? (
            <div style={{ height: '653px' }}>
              <DealerOIChart
                selectedTicker={currentTicker}
                compactMode={true}
                chartWidth={670}
                svgHeight={559}
                analysisSuiteMode={true}
                selectedExpiration={sharedExpiration}
                onExpirationChange={setSharedExpiration}
                hideAllControls={false}
                hideViewModeToggle={true}
                oiViewMode="contracts"
                showCalls={showCalls}
                showPuts={showPuts}
                showNetOI={showNetOI}
                showTowers={false}
                onExpectedRangePCRatioChange={() => {}}
                onCumulativePCRatio45DaysChange={() => {}}
                onExpectedRange90Change={setExpectedRange90}
                style={{
                  background: 'linear-gradient(145deg, #020B14, #000508)',
                  border: '1px solid rgba(30, 58, 138, 0.2)',
                  boxShadow:
                    '0 4px 15px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  padding: '0',
                  width: '670px',
                }}
              />
            </div>
          ) : (
            <div
              style={{
                width: '670px',
                height: '653px',
                background: 'linear-gradient(145deg, #020B14, #000508)',
                border: '1px solid rgba(30, 58, 138, 0.2)',
                borderRadius: '8px',
                boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div
                style={{
                  color: 'rgba(255,255,255,0.2)',
                  fontSize: '12px',
                  fontWeight: '600',
                  letterSpacing: '2px',
                  textTransform: 'uppercase',
                  fontFamily: 'JetBrains Mono, monospace',
                }}
              >
                {!panelEnabled.oiChart ? 'BYPASSED' : 'OPEN INTEREST'}
              </div>
            </div>
          )}
        </div>
        {/* GEX Chart wrapper */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => togglePanel('gexChart')}
            title={panelEnabled.gexChart ? 'Disable panel' : 'Enable panel'}
            style={{
              position: 'absolute',
              top: '10px',
              right: '10px',
              padding: '2px 8px',
              borderRadius: '3px',
              border: `1px solid ${panelEnabled.gexChart ? 'rgba(0,255,100,0.35)' : 'rgba(255,80,80,0.35)'}`,
              background: panelEnabled.gexChart ? 'rgba(0,255,100,0.06)' : 'rgba(255,50,50,0.06)',
              color: panelEnabled.gexChart ? '#00ff64' : 'rgba(255,80,80,0.7)',
              cursor: 'pointer',
              fontSize: '9px',
              fontWeight: '700',
              letterSpacing: '1.5px',
              fontFamily: 'monospace',
              zIndex: 20,
              lineHeight: '14px',
            }}
          >
            {panelEnabled.gexChart ? 'LIVE' : 'OFF'}
          </button>
          {!panelEnabled.gexChart && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(0,0,0,0.75)',
                borderRadius: '8px',
                zIndex: 5,
              }}
            >
              <span
                style={{
                  color: 'rgba(255,255,255,0.3)',
                  fontSize: '11px',
                  fontWeight: '700',
                  letterSpacing: '3px',
                  fontFamily: 'monospace',
                }}
              >
                BYPASSED
              </span>
            </div>
          )}
          {currentTicker && panelEnabled.gexChart ? (
            <div style={{ height: '566px' }}>
              <DealerGEXChart
                selectedTicker={currentTicker}
                compactMode={true}
                chartWidth={670}
                svgHeight={484}
                analysisSuiteMode={true}
                selectedExpiration={sharedExpiration}
                hideAllControls={true}
                gexViewMode="gex"
                showPositiveGamma={showPositiveGamma}
                showNegativeGamma={showNegativeGamma}
                showNetGamma={showNetGamma}
                showAttrax={false}
                expectedRange90={expectedRange90}
                style={{
                  background: 'linear-gradient(145deg, #020B14, #000508)',
                  border: '1px solid rgba(30, 58, 138, 0.2)',
                  boxShadow:
                    '0 4px 15px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  width: '670px',
                }}
              />
            </div>
          ) : (
            <div
              style={{
                width: '670px',
                height: '566px',
                background: 'linear-gradient(145deg, #020B14, #000508)',
                border: '1px solid rgba(30, 58, 138, 0.2)',
                borderRadius: '8px',
                boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div
                style={{
                  color: 'rgba(255,255,255,0.2)',
                  fontSize: '12px',
                  fontWeight: '600',
                  letterSpacing: '2px',
                  textTransform: 'uppercase',
                  fontFamily: 'JetBrains Mono, monospace',
                }}
              >
                {!panelEnabled.gexChart ? 'BYPASSED' : 'GEX'}
              </div>
            </div>
          )}
        </div>
      </div>
      {/* Hide unwanted buttons after render */}
      {currentTicker &&
        typeof window !== 'undefined' &&
        (() => {
          setTimeout(() => {
            const buttons = Array.from(
              document.querySelectorAll('.navigation-bar-premium button span')
            )
            buttons.forEach((span: any) => {
              const text = span.textContent || ''
              if (
                text.includes('TECHNALYSIS') ||
                text.includes('IV & HV') ||
                text.includes('FlowMoves') ||
                text.includes('RRG')
              ) {
                const parent = span.closest('.ml-4') || span.closest('div[class*="relative"]')
                if (parent) parent.style.display = 'none'
              }
            })
            // Hide chart type icons and drawing tools
            document
              .querySelectorAll(
                '.chart-type-dropdown, button[title*="Trend"], button[title*="Line"], button[title*="Channel"], button[title*="Box"]'
              )
              .forEach((el: any) => {
                if (el) el.style.display = 'none'
              })
          }, 200)
          return null
        })()}
      {/* IV Charts Panel - Bottom Left */}
      <div
        ref={panelRefs.ivCharts}
        style={{
          position: 'absolute',
          bottom: '260px',
          left: '20px',
          width: '550px',
          transform: getTransform('ivCharts'),
          userSelect: isEditMode ? 'none' : undefined,
        }}
      >
        {isEditMode && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 8,
              cursor: 'grab',
              background: 'rgba(255,200,0,0.04)',
              border: '2px dashed rgba(255,200,0,0.45)',
            }}
            onMouseDown={(e) => startDrag(e, 'ivCharts')}
          />
        )}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => togglePanel('ivCharts')}
            title={panelEnabled.ivCharts ? 'Disable panel' : 'Enable panel'}
            style={{
              position: 'absolute',
              top: '10px',
              right: '10px',
              padding: '2px 8px',
              borderRadius: '3px',
              border: `1px solid ${panelEnabled.ivCharts ? 'rgba(0,255,100,0.35)' : 'rgba(255,80,80,0.35)'}`,
              background: panelEnabled.ivCharts ? 'rgba(0,255,100,0.06)' : 'rgba(255,50,50,0.06)',
              color: panelEnabled.ivCharts ? '#00ff64' : 'rgba(255,80,80,0.7)',
              cursor: 'pointer',
              fontSize: '9px',
              fontWeight: '700',
              letterSpacing: '1.5px',
              fontFamily: 'monospace',
              zIndex: 20,
              lineHeight: '14px',
            }}
          >
            {panelEnabled.ivCharts ? 'LIVE' : 'OFF'}
          </button>
          {!panelEnabled.ivCharts && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(0,0,0,0.75)',
                borderRadius: '8px',
                zIndex: 5,
              }}
            >
              <span
                style={{
                  color: 'rgba(255,255,255,0.3)',
                  fontSize: '11px',
                  fontWeight: '700',
                  letterSpacing: '3px',
                  fontFamily: 'monospace',
                }}
              >
                BYPASSED
              </span>
            </div>
          )}
          {panelEnabled.ivCharts ? (
            <IVChartsPanel
              data={ivData}
              ticker={currentTicker || tickerInput}
              period={ivPeriod}
              onPeriodChange={handlePeriodChange}
              isScanning={isScanning}
            />
          ) : (
            <div
              style={{
                background: 'linear-gradient(145deg, #020B14, #000508)',
                border: '1px solid rgba(30, 58, 138, 0.2)',
                borderRadius: '8px',
                height: '650px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span
                style={{
                  color: 'rgba(255,255,255,0.3)',
                  fontSize: '11px',
                  fontWeight: '700',
                  letterSpacing: '3px',
                  fontFamily: 'monospace',
                }}
              >
                BYPASSED
              </span>
            </div>
          )}
        </div>
      </div>
      {/* LiquidPanel — GEX/Dealer Tables + GaugeTrio */}
      <div
        ref={panelRefs.liquidPanel}
        style={{
          position: 'absolute',
          top: '570px',
          left: '960px',
          width: 'fit-content',
          background: 'linear-gradient(145deg, #020B14, #000508)',
          border: '1px solid rgba(30, 58, 138, 0.2)',
          borderRadius: '8px',
          overflow: 'visible',
          transform: getTransform('liquidPanel'),
          userSelect: isEditMode ? 'none' : undefined,
        }}
      >
        {isEditMode && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 8,
              cursor: 'grab',
              borderRadius: '8px',
              background: 'rgba(255,200,0,0.04)',
              border: '2px dashed rgba(255,200,0,0.45)',
            }}
            onMouseDown={(e) => startDrag(e, 'liquidPanel')}
          />
        )}
        <button
          onClick={() => togglePanel('liquidPanel')}
          title={panelEnabled.liquidPanel ? 'Disable panel' : 'Enable panel'}
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            padding: '2px 8px',
            borderRadius: '3px',
            border: `1px solid ${panelEnabled.liquidPanel ? 'rgba(0,255,100,0.35)' : 'rgba(255,80,80,0.35)'}`,
            background: panelEnabled.liquidPanel ? 'rgba(0,255,100,0.06)' : 'rgba(255,50,50,0.06)',
            color: panelEnabled.liquidPanel ? '#00ff64' : 'rgba(255,80,80,0.7)',
            cursor: 'pointer',
            fontSize: '9px',
            fontWeight: '700',
            letterSpacing: '1.5px',
            fontFamily: 'monospace',
            zIndex: 10,
            lineHeight: '14px',
          }}
        >
          {panelEnabled.liquidPanel ? 'LIVE' : 'OFF'}
        </button>
        {!panelEnabled.liquidPanel && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0,0,0,0.75)',
              borderRadius: '8px',
              zIndex: 5,
            }}
          >
            <span
              style={{
                color: 'rgba(255,255,255,0.3)',
                fontSize: '11px',
                fontWeight: '700',
                letterSpacing: '3px',
                fontFamily: 'monospace',
              }}
            >
              BYPASSED
            </span>
          </div>
        )}
        {panelEnabled.liquidPanel && currentTicker ? (
          <div
            style={{
              display: 'inline-block',
              transform: 'scaleX(1.009)',
              transformOrigin: 'top left',
            }}
          >
            <div style={{ zoom: 0.61 }}>
              <LiquidPanel
                analysisSuiteMode={true}
                externalTicker={currentTicker || undefined}
                onGaugeMetrics={(data) => {
                  setGaugeMetrics(data)
                }}
              />
            </div>
          </div>
        ) : (
          <div
            style={{
              width: '668px',
              height: '1062px',
              background: 'linear-gradient(145deg, #020B14, #000508)',
              border: '1px solid rgba(30, 58, 138, 0.2)',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span
              style={{
                color: 'rgba(255,255,255,0.2)',
                fontSize: '13px',
                fontWeight: '600',
                letterSpacing: '3px',
                fontFamily: 'JetBrains Mono, monospace',
              }}
            >
              {!panelEnabled.liquidPanel ? 'BYPASSED' : 'GREEK SUITE'}
            </span>
          </div>
        )}
      </div>
      {/* Consolidation History + POI Panel */}
      <div
        ref={panelRefs.consolidationPOI}
        style={{
          position: 'absolute',
          top: '1490px',
          left: '20px',
          width: '1610px',
          background: 'linear-gradient(145deg, #020B14, #000508)',
          border: '1px solid rgba(30, 58, 138, 0.2)',
          borderRadius: '8px',
          overflow: 'hidden',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
          transform: getTransform('consolidationPOI'),
          userSelect: isEditMode ? 'none' : undefined,
          display: panelEnabled.consolidationPOI ? undefined : 'none',
          zoom: 0.7,
        }}
      >
        {isEditMode && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 8,
              cursor: 'grab',
              borderRadius: '8px',
              background: 'rgba(255,200,0,0.04)',
              border: '2px dashed rgba(255,200,0,0.45)',
            }}
            onMouseDown={(e) => startDrag(e, 'consolidationPOI')}
          />
        )}
        <button
          onClick={() => togglePanel('consolidationPOI')}
          title={panelEnabled.consolidationPOI ? 'Disable panel' : 'Enable panel'}
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            padding: '2px 8px',
            borderRadius: '3px',
            border: `1px solid ${panelEnabled.consolidationPOI ? 'rgba(0,255,100,0.35)' : 'rgba(255,80,80,0.35)'}`,
            background: panelEnabled.consolidationPOI
              ? 'rgba(0,255,100,0.06)'
              : 'rgba(255,50,50,0.06)',
            color: panelEnabled.consolidationPOI ? '#00ff64' : 'rgba(255,80,80,0.7)',
            cursor: 'pointer',
            fontSize: '9px',
            fontWeight: '700',
            letterSpacing: '1.5px',
            fontFamily: 'monospace',
            zIndex: 10,
            lineHeight: '14px',
          }}
        >
          {panelEnabled.consolidationPOI ? 'LIVE' : 'OFF'}
        </button>

        {/* Panel Header */}
        <div
          style={{
            padding: '12px 20px',
            borderBottom: '1px solid rgba(30, 58, 138, 0.2)',
            display: 'flex',
            alignItems: 'center',
            gap: '20px',
            background: 'linear-gradient(90deg, rgba(0,212,255,0.04) 0%, transparent 60%)',
          }}
        >
          <div
            style={{
              fontSize: '13px',
              fontWeight: '800',
              color: '#00d4ff',
              letterSpacing: '2px',
              textTransform: 'uppercase',
              fontFamily: 'JetBrains Mono, monospace',
              textShadow: '0 0 12px rgba(0,212,255,0.4)',
            }}
          >
            CONSOLIDATION HISTORY + POINTS OF INTEREST
          </div>
          <div
            style={{
              fontSize: '11px',
              color: 'rgba(255,255,255,0.3)',
              fontFamily: 'JetBrains Mono, monospace',
              letterSpacing: '1px',
            }}
          >
            {currentTicker ? `— ${currentTicker}` : '— search a ticker above'}
          </div>
        </div>

        {!panelEnabled.consolidationPOI && (
          <>
            <div style={{ height: '660px' }} />
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(0,0,0,0.75)',
                borderRadius: '8px',
                zIndex: 5,
              }}
            >
              <span
                style={{
                  color: 'rgba(255,255,255,0.3)',
                  fontSize: '11px',
                  fontWeight: '700',
                  letterSpacing: '3px',
                  fontFamily: 'monospace',
                }}
              >
                BYPASSED
              </span>
            </div>
          </>
        )}

        {panelEnabled.consolidationPOI && !currentTicker && (
          <div
            style={{
              height: '640px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span
              style={{
                color: 'rgba(255,255,255,0.15)',
                fontSize: '13px',
                fontWeight: '600',
                letterSpacing: '3px',
                fontFamily: 'JetBrains Mono, monospace',
              }}
            >
              ENTER A TICKER TO LOAD
            </span>
          </div>
        )}

        {panelEnabled.consolidationPOI && currentTicker && (
          <div
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0', height: '660px' }}
          >
            {/* Left: Consolidation History */}
            <div
              style={{
                borderRight: '1px solid rgba(30, 58, 138, 0.2)',
                height: '660px',
                overflow: 'hidden',
              }}
            >
              <ConsolidationHistoryScreener externalTicker={currentTicker} />
            </div>
            {/* Right: POI (Dark Pool) */}
            <div style={{ height: '660px', overflow: 'hidden' }}>
              <POIScreener externalTicker={currentTicker} />
            </div>
          </div>
        )}
      </div>
      {/* OTM Premium Imbalance History — 1M Compact */}
      <div
        ref={panelRefs.otmPremiumHistory}
        style={{
          position: 'absolute',
          top: '2195px',
          left: '20px',
          width: '800px',
          minHeight: '260px',
          background: 'linear-gradient(145deg, #020B14, #000508)',
          border: '1px solid rgba(30, 58, 138, 0.2)',
          borderRadius: '8px',
          overflow: 'hidden',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
          transform: getTransform('otmPremiumHistory'),
          userSelect: isEditMode ? 'none' : undefined,
        }}
      >
        {isEditMode && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 8,
              cursor: 'grab',
              borderRadius: '8px',
              background: 'rgba(255,200,0,0.04)',
              border: '2px dashed rgba(255,200,0,0.45)',
            }}
            onMouseDown={(e) => startDrag(e, 'otmPremiumHistory')}
          />
        )}
        <button
          onClick={() => togglePanel('otmPremiumHistory')}
          title={panelEnabled.otmPremiumHistory ? 'Disable panel' : 'Enable panel'}
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            padding: '2px 8px',
            borderRadius: '3px',
            border: `1px solid ${panelEnabled.otmPremiumHistory ? 'rgba(0,255,100,0.35)' : 'rgba(255,80,80,0.35)'}`,
            background: panelEnabled.otmPremiumHistory
              ? 'rgba(0,255,100,0.06)'
              : 'rgba(255,50,50,0.06)',
            color: panelEnabled.otmPremiumHistory ? '#00ff64' : 'rgba(255,80,80,0.7)',
            cursor: 'pointer',
            fontSize: '9px',
            fontWeight: '700',
            letterSpacing: '1.5px',
            fontFamily: 'monospace',
            zIndex: 10,
            lineHeight: '14px',
          }}
        >
          {panelEnabled.otmPremiumHistory ? 'LIVE' : 'OFF'}
        </button>

        {!panelEnabled.otmPremiumHistory && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0,0,0,0.75)',
              borderRadius: '8px',
              zIndex: 5,
            }}
          >
            <span
              style={{
                color: 'rgba(255,255,255,0.3)',
                fontSize: '11px',
                fontWeight: '700',
                letterSpacing: '3px',
                fontFamily: 'monospace',
              }}
            >
              BYPASSED
            </span>
          </div>
        )}

        {panelEnabled.otmPremiumHistory && (
          <OTMPremiumHistoryChartCompact externalTicker={currentTicker || undefined} />
        )}
      </div>
      {/* Straddle Town Panel */}
      <div
        ref={panelRefs.straddleTown}
        style={{
          position: 'absolute',
          top: '2520px',
          left: '20px',
          width: '1610px',
          minHeight: '960px',
          background: 'linear-gradient(145deg, #04020a, #010008)',
          border: '1px solid rgba(180,0,255,0.15)',
          borderRadius: '8px',
          overflow: 'hidden',
          boxShadow: '0 4px 30px rgba(180,0,255,0.08), inset 0 1px 0 rgba(255,255,255,0.03)',
          transform: getTransform('straddleTown'),
          userSelect: isEditMode ? 'none' : undefined,
          zoom: 0.7,
        }}
      >
        {isEditMode && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 8,
              cursor: 'grab',
              borderRadius: '8px',
              background: 'rgba(255,200,0,0.04)',
              border: '2px dashed rgba(255,200,0,0.45)',
            }}
            onMouseDown={(e) => startDrag(e, 'straddleTown')}
          />
        )}
        <button
          onClick={() => togglePanel('straddleTown')}
          title={panelEnabled.straddleTown ? 'Disable panel' : 'Enable panel'}
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            padding: '2px 8px',
            borderRadius: '3px',
            border: `1px solid ${panelEnabled.straddleTown ? 'rgba(0,255,100,0.35)' : 'rgba(255,80,80,0.35)'}`,
            background: panelEnabled.straddleTown ? 'rgba(0,255,100,0.06)' : 'rgba(255,50,50,0.06)',
            color: panelEnabled.straddleTown ? '#00ff64' : 'rgba(255,80,80,0.7)',
            cursor: 'pointer',
            fontSize: '9px',
            fontWeight: '700',
            letterSpacing: '1.5px',
            fontFamily: 'monospace',
            zIndex: 10,
            lineHeight: '14px',
          }}
        >
          {panelEnabled.straddleTown ? 'LIVE' : 'OFF'}
        </button>

        {!panelEnabled.straddleTown && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0,0,0,0.75)',
              borderRadius: '8px',
              zIndex: 5,
            }}
          >
            <span
              style={{
                color: 'rgba(255,255,255,0.3)',
                fontSize: '11px',
                fontWeight: '700',
                letterSpacing: '3px',
                fontFamily: 'monospace',
              }}
            >
              BYPASSED
            </span>
          </div>
        )}

        {panelEnabled.straddleTown && <StraddleTownScreener />}
      </div>
      {/* Edit Layout Controls */}{' '}
      <div
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 9999,
          display: 'flex',
          gap: '8px',
        }}
      >
        {isEditMode && (
          <button
            onClick={() => setPanelOffsets({})}
            style={{
              background: 'rgba(0,0,0,0.9)',
              border: '1px solid rgba(255,80,80,0.6)',
              color: '#ff5555',
              padding: '8px 14px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: '700',
              fontFamily: 'monospace',
              letterSpacing: '1px',
            }}
          >
            ↺ RESET
          </button>
        )}
        <button
          onClick={() => {
            const allOn = Object.values(panelEnabled).every(Boolean)
            const next = Object.fromEntries(
              Object.keys(panelEnabled).map((k) => [k, !allOn])
            ) as typeof panelEnabled
            setPanelEnabled(next)
          }}
          style={{
            background: 'rgba(0,0,0,0.9)',
            border: '1px solid rgba(255,165,0,0.5)',
            color: '#ffa500',
            padding: '8px 14px',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: '700',
            fontFamily: 'monospace',
            letterSpacing: '1px',
          }}
        >
          {Object.values(panelEnabled).every(Boolean) ? '⬜ DISABLE ALL' : '▣ ENABLE ALL'}
        </button>
        <button
          onClick={saveLayout}
          disabled={layoutSaving}
          style={{
            background: layoutSaved ? 'rgba(0,255,100,0.15)' : 'rgba(0,0,0,0.9)',
            border: `1px solid ${layoutSaved ? 'rgba(0,255,100,0.7)' : 'rgba(100,200,255,0.4)'}`,
            color: layoutSaved ? '#00ff64' : '#7dd3fc',
            padding: '8px 14px',
            borderRadius: '8px',
            cursor: layoutSaving ? 'default' : 'pointer',
            fontSize: '11px',
            fontWeight: '700',
            fontFamily: 'monospace',
            letterSpacing: '1px',
            opacity: layoutSaving ? 0.6 : 1,
            display: isEditMode ? undefined : 'none',
          }}
        >
          {layoutSaved ? '✓ SAVED' : layoutSaving ? '...' : '💾 SAVE'}
        </button>
        <button
          onClick={() => setIsEditMode((prev) => !prev)}
          style={{
            background: isEditMode ? '#ffd700' : 'rgba(0,0,0,0.9)',
            border: `1px solid ${isEditMode ? '#ffd700' : 'rgba(255,255,255,0.25)'}`,
            color: isEditMode ? '#000' : '#fff',
            padding: '8px 14px',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: '700',
            fontFamily: 'monospace',
            letterSpacing: '1px',
          }}
        >
          {isEditMode ? '✓ DONE' : '⠿ LAYOUT'}
        </button>
      </div>
    </div>
  )
}

function IVChartsPanel({ data, ticker, period, onPeriodChange, isScanning }: IVChartsPanelProps) {
  const callPutIVCanvasRef = useRef<HTMLCanvasElement>(null)
  const ivRankCanvasRef = useRef<HTMLCanvasElement>(null)

  const [showNet, setShowNet] = useState(true)
  const [showCall, setShowCall] = useState(false)
  const [showPut, setShowPut] = useState(false)
  const [showRank, setShowRank] = useState(true)
  const [showPercentile, setShowPercentile] = useState(true)

  const drawCallPutIVChart = (
    canvas: HTMLCanvasElement | null,
    data: any[],
    showNet: boolean,
    showCall: boolean,
    showPut: boolean,
    mousePos: { x: number; y: number } | null = null
  ) => {
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const width = 520
    const height = 270
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    ctx.scale(dpr, dpr)

    const padding = { top: 10, right: 40, bottom: 40, left: 60 }
    const chartWidth = width - padding.left - padding.right
    const chartHeight = height - padding.top - padding.bottom

    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, width, height)

    // Navy blue border
    ctx.strokeStyle = 'rgba(30, 58, 138, 0.2)'
    ctx.lineWidth = 2
    ctx.strokeRect(1, 1, width - 2, height - 2)

    const callValues = data.map((d) => d.callIV)
    const putValues = data.map((d) => d.putIV)
    const netValues = data.map((d) => d.netIV)

    const allValues = []
    if (showNet) allValues.push(...netValues)
    if (showCall) allValues.push(...callValues)
    if (showPut) allValues.push(...putValues)

    const maxValue = Math.max(...allValues)
    const minValue = Math.min(...allValues)
    const range = maxValue - minValue || 1

    ctx.strokeStyle = '#1A1A1A'
    ctx.lineWidth = 1
    ctx.fillStyle = '#FFFFFF'
    ctx.font = 'bold 13px monospace'
    ctx.textAlign = 'right'

    for (let i = 0; i <= 5; i++) {
      const y = padding.top + (chartHeight * i) / 5
      const value = maxValue - (range * i) / 5
      ctx.beginPath()
      ctx.moveTo(padding.left, y)
      ctx.lineTo(padding.left + chartWidth, y)
      ctx.stroke()
      ctx.fillText(value.toFixed(1), padding.left - 8, y + 4)
    }

    // X-axis labels with year
    ctx.textAlign = 'center'
    ctx.font = 'bold 13px monospace'
    const months = [
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

    for (let i = 0; i <= 6; i++) {
      const index = Math.min(Math.floor((i * data.length) / 6), data.length - 1)
      const x = padding.left + (chartWidth * index) / (data.length - 1)
      const date = new Date(data[index].date)
      const monthLabel = months[date.getMonth()]
      const yearLabel = date.getFullYear().toString().slice(-2)
      ctx.fillText(`${monthLabel} '${yearLabel}`, x, height - 25)
    }

    // Draw Net IV line (orange)
    if (showNet) {
      ctx.strokeStyle = '#FF8C00'
      ctx.lineWidth = 2.5
      ctx.beginPath()
      data.forEach((point, i) => {
        const x = padding.left + (chartWidth * i) / (data.length - 1)
        const y = padding.top + chartHeight - ((point.netIV - minValue) / range) * chartHeight
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.stroke()
    }

    // Draw Call IV line (green)
    if (showCall) {
      ctx.strokeStyle = '#00FF00'
      ctx.lineWidth = 2.5
      ctx.beginPath()
      data.forEach((point, i) => {
        const x = padding.left + (chartWidth * i) / (data.length - 1)
        const y = padding.top + chartHeight - ((point.callIV - minValue) / range) * chartHeight
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.stroke()
    }

    // Draw Put IV line (red)
    if (showPut) {
      ctx.strokeStyle = '#FF0000'
      ctx.lineWidth = 2.5
      ctx.beginPath()
      data.forEach((point, i) => {
        const x = padding.left + (chartWidth * i) / (data.length - 1)
        const y = padding.top + chartHeight - ((point.putIV - minValue) / range) * chartHeight
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.stroke()
    }

    // Draw end labels with stacking to prevent overlap
    ctx.font = 'bold 11px monospace'
    ctx.textAlign = 'left'
    const activeCount = [showNet, showCall, showPut].filter(Boolean).length
    let labelOffset = 0

    if (showNet) {
      const lastNetY =
        padding.top +
        chartHeight -
        ((netValues[netValues.length - 1] - minValue) / range) * chartHeight
      const adjustedY = activeCount > 1 ? lastNetY + labelOffset : lastNetY
      ctx.fillStyle = '#FF8C00'
      ctx.fillText(
        netValues[netValues.length - 1].toFixed(1) + '%',
        padding.left + chartWidth + 5,
        adjustedY + 4
      )
      labelOffset += 15
    }

    if (showCall) {
      const lastCallY =
        padding.top +
        chartHeight -
        ((callValues[callValues.length - 1] - minValue) / range) * chartHeight
      const adjustedY = activeCount > 1 ? lastCallY + labelOffset : lastCallY
      ctx.fillStyle = '#00FF00'
      ctx.fillText(
        callValues[callValues.length - 1].toFixed(1) + '%',
        padding.left + chartWidth + 5,
        adjustedY + 4
      )
      labelOffset += 15
    }

    if (showPut) {
      const lastPutY =
        padding.top +
        chartHeight -
        ((putValues[putValues.length - 1] - minValue) / range) * chartHeight
      const adjustedY = activeCount > 1 ? lastPutY + labelOffset : lastPutY
      ctx.fillStyle = '#FF0000'
      ctx.fillText(
        putValues[putValues.length - 1].toFixed(1) + '%',
        padding.left + chartWidth + 5,
        adjustedY + 4
      )
    }

    // Draw crosshair if mouse is hovering
    if (
      mousePos &&
      mousePos.x >= padding.left &&
      mousePos.x <= padding.left + chartWidth &&
      mousePos.y >= padding.top &&
      mousePos.y <= padding.top + chartHeight
    ) {
      // Find closest data point
      const dataIndex = Math.round(((mousePos.x - padding.left) / chartWidth) * (data.length - 1))
      const point = data[Math.max(0, Math.min(dataIndex, data.length - 1))]

      // Draw vertical line
      ctx.strokeStyle = 'rgba(255, 140, 0, 0.5)'
      ctx.lineWidth = 1
      ctx.setLineDash([5, 5])
      ctx.beginPath()
      ctx.moveTo(mousePos.x, padding.top)
      ctx.lineTo(mousePos.x, padding.top + chartHeight)
      ctx.stroke()

      // Draw horizontal line
      ctx.beginPath()
      ctx.moveTo(padding.left, mousePos.y)
      ctx.lineTo(padding.left + chartWidth, mousePos.y)
      ctx.stroke()
      ctx.setLineDash([])

      // Calculate value at mouse Y position
      const valueAtY = maxValue - ((mousePos.y - padding.top) / chartHeight) * range

      // Display date on X-axis
      const date = new Date(point.date)
      const months = [
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
      const dateStr = `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`

      ctx.font = 'bold 11px monospace'
      ctx.fillStyle = '#000000'
      ctx.fillRect(mousePos.x - 50, height - 20, 100, 16)
      ctx.fillStyle = '#FF8C00'
      ctx.textAlign = 'center'
      ctx.fillText(dateStr, mousePos.x, height - 8)

      // Display values on right Y-axis
      ctx.textAlign = 'left'
      let yOffset = 0

      if (showNet) {
        ctx.fillStyle = '#000000'
        ctx.fillRect(padding.left + chartWidth + 5, mousePos.y + yOffset - 10, 60, 14)
        ctx.fillStyle = '#FF8C00'
        ctx.fillText(
          `${point.netIV.toFixed(2)}%`,
          padding.left + chartWidth + 8,
          mousePos.y + yOffset + 2
        )
        yOffset += 16
      }

      if (showCall) {
        ctx.fillStyle = '#000000'
        ctx.fillRect(padding.left + chartWidth + 5, mousePos.y + yOffset - 10, 80, 14)
        ctx.fillStyle = '#FF8C00'
        ctx.fillText(
          `CALL: ${point.callIV.toFixed(2)}%`,
          padding.left + chartWidth + 8,
          mousePos.y + yOffset + 2
        )
        yOffset += 16
      }

      if (showPut) {
        ctx.fillStyle = '#000000'
        ctx.fillRect(padding.left + chartWidth + 5, mousePos.y + yOffset - 10, 80, 14)
        ctx.fillStyle = '#FF8C00'
        ctx.fillText(
          `PUT: ${point.putIV.toFixed(2)}%`,
          padding.left + chartWidth + 8,
          mousePos.y + yOffset + 2
        )
      }
    }
  }

  const drawRankPercentileChart = (
    canvas: HTMLCanvasElement | null,
    data: IVDataPoint[],
    showRank: boolean,
    showPercentile: boolean,
    mousePos: { x: number; y: number } | null = null
  ) => {
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const width = 520
    const height = 250
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    ctx.scale(dpr, dpr)

    const padding = { top: 10, right: 60, bottom: 50, left: 60 }
    const chartWidth = width - padding.left - padding.right
    const chartHeight = height - padding.top - padding.bottom

    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, width, height)

    ctx.strokeStyle = 'rgba(30, 58, 138, 0.2)'
    ctx.lineWidth = 2
    ctx.strokeRect(1, 1, width - 2, height - 2)

    // Fixed 0-100 scale
    const maxValue = 100
    const minValue = 0
    const range = 100

    ctx.strokeStyle = '#1A1A1A'
    ctx.lineWidth = 1
    ctx.fillStyle = '#FFFFFF'
    ctx.font = 'bold 13px monospace'
    ctx.textAlign = 'right'

    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (chartHeight * i) / 4
      const value = maxValue - (range * i) / 4
      ctx.beginPath()
      ctx.moveTo(padding.left, y)
      ctx.lineTo(padding.left + chartWidth, y)
      ctx.stroke()
      ctx.fillText(value.toFixed(0), padding.left - 6, y + 4)
    }

    const months = [
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
    ctx.textAlign = 'center'
    ctx.font = 'bold 13px monospace'
    ctx.fillStyle = '#FFFFFF'
    for (let i = 0; i <= 6; i++) {
      const index = Math.min(Math.floor((i * data.length) / 6), data.length - 1)
      const x = padding.left + (chartWidth * index) / (data.length - 1)
      const date = new Date(data[index].date)
      ctx.fillText(
        `${months[date.getMonth()]} '${date.getFullYear().toString().slice(-2)}`,
        x,
        height - 28
      )
    }

    // Draw IV RANK line (yellow)
    if (showRank) {
      const rankValues = data.map((d) => d.ivRank)
      ctx.strokeStyle = '#FFD700'
      ctx.lineWidth = 2.5
      ctx.beginPath()
      data.forEach((point, i) => {
        const x = padding.left + (chartWidth * i) / (data.length - 1)
        const y = padding.top + chartHeight - ((point.ivRank - minValue) / range) * chartHeight
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.stroke()
      const lastRankX = padding.left + chartWidth
      const lastRankY =
        padding.top +
        chartHeight -
        ((rankValues[rankValues.length - 1] - minValue) / range) * chartHeight
      ctx.fillStyle = '#FFD700'
      ctx.beginPath()
      ctx.arc(lastRankX, lastRankY, 4, 0, Math.PI * 2)
      ctx.fill()
      ctx.font = 'bold 10px monospace'
      ctx.textAlign = 'left'
      ctx.fillText(rankValues[rankValues.length - 1].toFixed(1) + '%', lastRankX + 6, lastRankY + 4)
    }

    // Draw IV PERCENTILE line (purple)
    if (showPercentile) {
      const pctValues = data.map((d) => d.ivPercentile)
      ctx.strokeStyle = '#9D4EDD'
      ctx.lineWidth = 2.5
      ctx.beginPath()
      data.forEach((point, i) => {
        const x = padding.left + (chartWidth * i) / (data.length - 1)
        const y =
          padding.top + chartHeight - ((point.ivPercentile - minValue) / range) * chartHeight
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.stroke()
      const lastPctX = padding.left + chartWidth
      const lastPctY =
        padding.top +
        chartHeight -
        ((pctValues[pctValues.length - 1] - minValue) / range) * chartHeight
      ctx.fillStyle = '#9D4EDD'
      ctx.beginPath()
      ctx.arc(lastPctX, lastPctY, 4, 0, Math.PI * 2)
      ctx.fill()
      ctx.font = 'bold 10px monospace'
      ctx.textAlign = 'left'
      ctx.fillText(pctValues[pctValues.length - 1].toFixed(1) + '%', lastPctX + 6, lastPctY + 14)
    }

    // Crosshair
    if (
      mousePos &&
      mousePos.x >= padding.left &&
      mousePos.x <= padding.left + chartWidth &&
      mousePos.y >= padding.top &&
      mousePos.y <= padding.top + chartHeight
    ) {
      const dataIndex = Math.round(((mousePos.x - padding.left) / chartWidth) * (data.length - 1))
      const point = data[Math.max(0, Math.min(dataIndex, data.length - 1))]
      ctx.strokeStyle = 'rgba(255, 140, 0, 0.5)'
      ctx.lineWidth = 1
      ctx.setLineDash([5, 5])
      ctx.beginPath()
      ctx.moveTo(mousePos.x, padding.top)
      ctx.lineTo(mousePos.x, padding.top + chartHeight)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(padding.left, mousePos.y)
      ctx.lineTo(padding.left + chartWidth, mousePos.y)
      ctx.stroke()
      ctx.setLineDash([])
      const date = new Date(point.date)
      const dateStr = `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`
      ctx.font = 'bold 11px monospace'
      ctx.fillStyle = '#000000'
      ctx.fillRect(mousePos.x - 50, height - 20, 100, 16)
      ctx.fillStyle = '#FF8C00'
      ctx.textAlign = 'center'
      ctx.fillText(dateStr, mousePos.x, height - 7)
      ctx.textAlign = 'left'
      ctx.fillStyle = '#000000'
      ctx.fillRect(padding.left + chartWidth + 5, mousePos.y - 12, 68, 28)
      ctx.fillStyle = '#FFD700'
      ctx.fillText(`R: ${point.ivRank.toFixed(1)}%`, padding.left + chartWidth + 8, mousePos.y + 2)
      ctx.fillStyle = '#9D4EDD'
      ctx.fillText(
        `P: ${point.ivPercentile.toFixed(1)}%`,
        padding.left + chartWidth + 8,
        mousePos.y + 16
      )
    }
  }

  useEffect(() => {
    if (data.length === 0) return

    drawCallPutIVChart(callPutIVCanvasRef.current, data, showNet, showCall, showPut)
    drawRankPercentileChart(ivRankCanvasRef.current, data, showRank, showPercentile)
  }, [data, showNet, showCall, showPut, showRank, showPercentile])

  useEffect(() => {
    if (data.length === 0) return
    if (!callPutIVCanvasRef.current || !ivRankCanvasRef.current) return

    const handleCallPutMouseMove = (e: MouseEvent) => {
      if (!callPutIVCanvasRef.current) return
      const rect = callPutIVCanvasRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      drawCallPutIVChart(callPutIVCanvasRef.current, data, showNet, showCall, showPut, { x, y })
    }

    const handleCallPutMouseLeave = () => {
      drawCallPutIVChart(callPutIVCanvasRef.current, data, showNet, showCall, showPut, null)
    }

    const handleRankMouseMove = (e: MouseEvent) => {
      if (!ivRankCanvasRef.current) return
      const rect = ivRankCanvasRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      drawRankPercentileChart(ivRankCanvasRef.current, data, showRank, showPercentile, { x, y })
    }

    const handleRankMouseLeave = () => {
      drawRankPercentileChart(ivRankCanvasRef.current, data, showRank, showPercentile, null)
    }

    callPutIVCanvasRef.current.addEventListener('mousemove', handleCallPutMouseMove)
    callPutIVCanvasRef.current.addEventListener('mouseleave', handleCallPutMouseLeave)
    ivRankCanvasRef.current.addEventListener('mousemove', handleRankMouseMove)
    ivRankCanvasRef.current.addEventListener('mouseleave', handleRankMouseLeave)

    return () => {
      if (callPutIVCanvasRef.current) {
        callPutIVCanvasRef.current.removeEventListener('mousemove', handleCallPutMouseMove)
        callPutIVCanvasRef.current.removeEventListener('mouseleave', handleCallPutMouseLeave)
      }
      if (ivRankCanvasRef.current) {
        ivRankCanvasRef.current.removeEventListener('mousemove', handleRankMouseMove)
        ivRankCanvasRef.current.removeEventListener('mouseleave', handleRankMouseLeave)
      }
    }
  }, [data, showNet, showCall, showPut, showRank, showPercentile])

  const currentData = data.length > 0 ? data[data.length - 1] : null

  return (
    <div
      style={{
        background: 'linear-gradient(145deg, #020B14, #000508)',
        border: '1px solid rgba(30, 58, 138, 0.2)',
        borderRadius: '8px',
        padding: '15px',
        boxShadow:
          '0 8px 32px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.1), inset 0 -1px 0 rgba(255, 255, 255, 0.05)',
        height: '650px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Panel Title */}
      <div
        style={{
          fontSize: '19px',
          fontWeight: '800',
          fontFamily: 'monospace',
          color: '#FFFFFF',
          marginBottom: '10px',
          letterSpacing: '2px',
          textAlign: 'center',
          background: 'linear-gradient(90deg, #9333EA, #C084FC, #9333EA)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}
      >
        IMPLIED VOLATILITY STATS
      </div>

      {data.length === 0 ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#666',
            fontSize: '14px',
            fontFamily: 'monospace',
            gap: '10px',
          }}
        >
          {isScanning ? (
            <>
              <div
                style={{
                  width: '16px',
                  height: '16px',
                  border: '2px solid #333',
                  borderTop: '2px solid #9333EA',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                }}
              />
              <span>Scanning IV</span>
            </>
          ) : ticker ? (
            'No IV Found'
          ) : (
            'No IV Data'
          )}
        </div>
      ) : (
        <>
          {/* Charts Stacked Vertically */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                background: 'linear-gradient(145deg, #0A0A0A, #000000)',
                borderRadius: '4px',
                padding: '2px',
                boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.8)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
              {/* Legend row + period selector */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '1px 6px',
                }}
              >
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  {(
                    [
                      {
                        key: 'net',
                        label: 'NET',
                        color: '#FF8C00',
                        active: showNet,
                        toggle: () => setShowNet((p) => !p),
                      },
                      {
                        key: 'call',
                        label: 'CALL',
                        color: '#00FF00',
                        active: showCall,
                        toggle: () => setShowCall((p) => !p),
                      },
                      {
                        key: 'put',
                        label: 'PUT',
                        color: '#FF4444',
                        active: showPut,
                        toggle: () => setShowPut((p) => !p),
                      },
                    ] as const
                  ).map(({ key, label, color, active, toggle }) => (
                    <button
                      key={key}
                      onClick={toggle}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: active ? color : color + '55',
                        padding: '0',
                        fontSize: '11px',
                        fontFamily: 'monospace',
                        fontWeight: '800',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        letterSpacing: '0.5px',
                      }}
                    >
                      <span
                        style={{
                          display: 'inline-block',
                          width: 16,
                          height: 2.5,
                          background: active ? color : color + '44',
                          borderRadius: 1,
                        }}
                      />
                      {label}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '3px' }}>
                  {(['1Y', '2Y', '5Y'] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => onPeriodChange(p)}
                      style={{
                        background: period === p ? 'rgba(255,255,255,0.18)' : 'transparent',
                        border: `1px solid ${period === p ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.2)'}`,
                        color: period === p ? '#FFFFFF' : 'rgba(255,255,255,0.4)',
                        padding: '2px 7px',
                        fontSize: '9px',
                        fontFamily: 'monospace',
                        fontWeight: '700',
                        cursor: 'pointer',
                        borderRadius: '3px',
                        letterSpacing: '0.5px',
                      }}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <canvas
                ref={callPutIVCanvasRef}
                style={{ display: 'block', border: '1px solid rgba(30, 58, 138, 0.2)' }}
              />
            </div>

            <div
              style={{
                background: 'linear-gradient(145deg, #0A0A0A, #000000)',
                borderRadius: '4px',
                padding: '2px',
                boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.8)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
              {/* IV Rank/Percentile legend row */}
              <div
                style={{
                  display: 'flex',
                  gap: '12px',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '1px 6px',
                }}
              >
                {(
                  [
                    {
                      key: 'rank',
                      label: 'IV RANK',
                      color: '#FFD700',
                      active: showRank,
                      toggle: () => setShowRank((p) => !p),
                    },
                    {
                      key: 'pct',
                      label: 'IV PERCENTILE',
                      color: '#9D4EDD',
                      active: showPercentile,
                      toggle: () => setShowPercentile((p) => !p),
                    },
                  ] as const
                ).map(({ key, label, color, active, toggle }) => (
                  <button
                    key={key}
                    onClick={toggle}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: active ? color : color + '55',
                      padding: '0',
                      fontSize: '11px',
                      fontFamily: 'monospace',
                      fontWeight: '800',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      letterSpacing: '0.5px',
                    }}
                  >
                    <span
                      style={{
                        display: 'inline-block',
                        width: 16,
                        height: 2.5,
                        background: active ? color : color + '44',
                        borderRadius: 1,
                      }}
                    />
                    {label}
                  </button>
                ))}
              </div>
              <canvas
                ref={ivRankCanvasRef}
                style={{ display: 'block', border: '1px solid rgba(30, 58, 138, 0.2)' }}
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
