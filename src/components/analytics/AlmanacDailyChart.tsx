'use client'

import React, { useEffect, useRef, useState } from 'react'

import '../../app/almanac.css'
import { AlmanacService, IndexSeasonalData } from '../../lib/almanacService'
import AlmanacCalendar from './AlmanacCalendar'
import AlmanacMobileControls from './AlmanacMobileControls'
import WeeklyScanTable from './WeeklyScanTable'
import { getAlmanacDailyChartMobile, getAlmanacDailyChartPadding } from './AlmanacDailyChartMobile'

interface AlmanacDailyChartProps {
  month?: number
  showPostElection?: boolean
  onMonthChange?: (month: number) => void
  symbol?: string
  symbols?: string[] // multi-ticker mode: show average of these tickers
  externalSelectedEvent?: string | null
  externalSelectedPatterns?: string[]
  isFullscreen?: boolean
}

interface PriceData {
  date: Date
  close: number
  high: number
  low: number
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

const AlmanacDailyChart: React.FC<AlmanacDailyChartProps> = ({
  month = new Date().getMonth(),
  showPostElection = true,
  onMonthChange,
  symbol = 'SPY',
  symbols,
  externalSelectedEvent,
  externalSelectedPatterns = [],
  isFullscreen = false,
}) => {
  const isMultiSymbol = symbols && symbols.length > 1
  const isIndex = !isMultiSymbol && ['SPY', 'QQQ', 'DIA', 'IWM'].includes(symbol)
  const [seasonalData, setSeasonalData] = useState<IndexSeasonalData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedMonth, setSelectedMonth] = useState(month)
  const [showMaxYears, setShowMaxYears] = useState(true)
  const [show15Y, setShow15Y] = useState(true)
  const [show10Y, setShow10Y] = useState(true)
  const [showElection, setShowElection] = useState(true)
  const [activeView, setActiveView] = useState<'chart' | 'calendar' | 'table'>('chart')
  const [isMobileView, setIsMobileView] = useState(false)
  const isMobileViewRef = useRef(false)
  useEffect(() => {
    const check = () => {
      const m = window.innerWidth <= 768
      setIsMobileView(m)
      isMobileViewRef.current = m
    }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null)
  const [zoomRange, setZoomRange] = useState({ start: 0, end: 1 })
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, rangeStart: 0, rangeEnd: 1 })
  const [showEventPerformance, setShowEventPerformance] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null)
  const [eventPerformanceData, setEventPerformanceData] = useState<
    { date: Date; avgReturn: number; tradingDay: number }[]
  >([])

  // Pattern Analysis states
  const [showPatternPerformance, setShowPatternPerformance] = useState(false)
  const [selectedPattern, setSelectedPattern] = useState<string | null>(null)
  const [patternPerformanceData, setPatternPerformanceData] = useState<
    {
      patternName: string
      data: { date: Date; avgReturn: number; tradingDay: number }[]
      occurrences: number
      color: string
      occurrenceDetails: { date: Date; priceAtEvent: number; changePercent?: number }[]
    }[]
  >([])
  const [showPatternDetails, setShowPatternDetails] = useState(false)

  // Sweet Spot / Pain Point / Candlenality
  const [showSweetSpot, setShowSweetSpot] = useState(false)
  const [showPainPoint, setShowPainPoint] = useState(false)
  const [candlenalityMode, setCandlenalityMode] = useState(false)
  const [sweetSpotRange, setSweetSpotRange] = useState<{ start: number; end: number; label: string } | null>(null)
  const [painPointRange, setPainPointRange] = useState<{ start: number; end: number; label: string } | null>(null)

  const almanacService = new AlmanacService()

  useEffect(() => {
    setSelectedMonth(month)
  }, [month])

  useEffect(() => {
    loadData()
  }, [selectedMonth, symbol, isIndex, symbols?.join(',')])

  // Handle external event selection from Row 1
  useEffect(() => {
    if (externalSelectedEvent) {
      setSelectedEvent(externalSelectedEvent)
      setShowEventPerformance(true)
      calculateEventPerformance(externalSelectedEvent)
    } else {
      setSelectedEvent(null)
      setShowEventPerformance(false)
      setEventPerformanceData([])
    }
  }, [externalSelectedEvent])

  // Handle external pattern selections from Row 1
  useEffect(() => {
    if (externalSelectedPatterns && externalSelectedPatterns.length > 0) {
      const firstPattern = externalSelectedPatterns[0]
      setSelectedPattern(firstPattern)
      setShowPatternPerformance(true)
      setShowEventPerformance(false)

      // Clear existing pattern data and recalculate
      setPatternPerformanceData([])

      // Calculate for the selected pattern
      const patternMap: { [key: string]: string } = {
        '52W High (90d Cooldown)': '52week-high-cooldown',
        '52W High (Annual)': '52week-high-annual',
        '52W Low (90d Cooldown)': '52week-low-cooldown',
        '52W Low (Annual)': '52week-low-annual',
        '8-11% UP (90d Cooldown)': 'move-8-11-up-cooldown',
        '8-11% UP (Annual)': 'move-8-11-up-annual',
        '8-11% DOWN (90d Cooldown)': 'move-8-11-down-cooldown',
        '8-11% DOWN (Annual)': 'move-8-11-down-annual',
        '18-22% UP (90d Cooldown)': 'move-18-22-up-cooldown',
        '18-22% UP (Annual)': 'move-18-22-up-annual',
        '18-22% DOWN (90d Cooldown)': 'move-18-22-down-cooldown',
        '18-22% DOWN (Annual)': 'move-18-22-down-annual',
      }

      const patternId = patternMap[firstPattern]
      if (patternId) {
        calculatePatternPerformance(patternId, firstPattern, symbol)
      }
    } else {
      setSelectedPattern(null)
      setShowPatternPerformance(false)
      setPatternPerformanceData(prev => prev.length === 0 ? prev : [])
    }
    // Use .join(',') so a new [] reference doesn't re-trigger this effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalSelectedPatterns?.join(','), symbol])

  // Compute sweet spot / pain point windows from seasonal data
  useEffect(() => {
    if (seasonalData.length === 0) { setSweetSpotRange(null); setPainPointRange(null); return }
    const data = seasonalData[0].dailyData
    if (data.length < 5) return
    let bestBullish = { start: data[0].tradingDay, end: data[4].tradingDay, gain: -Infinity }
    let bestBearish = { start: data[0].tradingDay, end: data[4].tradingDay, gain: Infinity }
    for (let w = 5; w <= 7; w++) {
      for (let i = 0; i <= data.length - w; i++) {
        // Sum the average daily return for each day in the window — positive = bullish, negative = bearish
        const windowReturn = data.slice(i, i + w).reduce((sum, p) => sum + p.avgReturn, 0)
        if (windowReturn > bestBullish.gain) bestBullish = { start: data[i].tradingDay, end: data[i + w - 1].tradingDay, gain: windowReturn }
        if (windowReturn < bestBearish.gain) bestBearish = { start: data[i].tradingDay, end: data[i + w - 1].tradingDay, gain: windowReturn }
      }
    }
    setSweetSpotRange({ start: bestBullish.start, end: bestBullish.end, label: `+${bestBullish.gain.toFixed(2)}%` })
    setPainPointRange({ start: bestBearish.start, end: bestBearish.end, label: `${bestBearish.gain.toFixed(2)}%` })
  }, [seasonalData])

  useEffect(() => {
    if (seasonalData.length > 0 && canvasRef.current && activeView === 'chart') {
      requestAnimationFrame(() => drawChart())
    }
  }, [seasonalData, showMaxYears, show15Y, show10Y, showElection, activeView])

  useEffect(() => {
    const handleResize = () => {
      if (seasonalData.length > 0) {
        drawChart()
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [seasonalData])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top

      if (isPanning) {
        const paddingLeft = isMobileViewRef.current ? 45 : 60
        const paddingRight = isMobileViewRef.current ? 58 : 72
        const chartAreaWidth = canvas.clientWidth - paddingLeft - paddingRight
        if (chartAreaWidth <= 0) return
        const dx = (x - panStart.x) / chartAreaWidth
        const rangeSize = panStart.rangeEnd - panStart.rangeStart
        let newStart = panStart.rangeStart - dx
        let newEnd = panStart.rangeEnd - dx
        if (newStart < 0) { newStart = 0; newEnd = rangeSize }
        if (newEnd > 1) { newEnd = 1; newStart = 1 - rangeSize }
        setZoomRange({ start: newStart, end: newEnd })
        return
      }
      setMousePos({ x, y })
    }

    const handleMouseDown = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      // Ticker label click/tap — toggle individual lines (mobile and desktop)
      {
        const zones = (canvas as any).labelTapZones as Array<{ x1: number, x2: number, y1: number, y2: number, key: string }> | undefined
        if (zones) {
          for (const zone of zones) {
            if (x >= zone.x1 && x <= zone.x2 && y >= zone.y1 && y <= zone.y2) {
              switch (zone.key) {
                case '25Y': case 'DIA': case 'DIA_E': setShowMaxYears(v => !v); return
                case '15Y': case 'SPY': case 'SPY_E': setShow15Y(v => !v); return
                case '10Y': case 'QQQ': case 'QQQ_E': setShow10Y(v => !v); return
                case 'E': case 'IWM': case 'IWM_E': setShowElection(v => !v); return
              }
            }
          }
        }
      }
      setIsPanning(true)
      setPanStart({ x, rangeStart: zoomRange.start, rangeEnd: zoomRange.end })
      canvas.style.cursor = 'grabbing'
    }

    const handleMouseUp = () => {
      setIsPanning(false)
      canvas.style.cursor = 'grab'
    }

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      e.stopPropagation()

      const rect = canvas.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const paddingLeft = isMobileViewRef.current ? 45 : 60
      const paddingRight = isMobileViewRef.current ? 58 : 72
      const chartAreaWidth = canvas.clientWidth - paddingLeft - paddingRight

      if (mouseX < paddingLeft || mouseX > paddingLeft + chartAreaWidth) return

      const mousePos = (mouseX - paddingLeft) / chartAreaWidth
      const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9
      const currentRange = zoomRange.end - zoomRange.start
      const newRange = Math.min(1, Math.max(0.02, currentRange * zoomFactor))

      const pivot = zoomRange.start + currentRange * mousePos
      let newStart = pivot - newRange * mousePos
      let newEnd = newStart + newRange

      if (newStart < 0) { newStart = 0; newEnd = newRange }
      if (newEnd > 1) { newEnd = 1; newStart = 1 - newRange }

      setZoomRange({ start: newStart, end: newEnd })
    }

    const handleMouseLeave = () => {
      setMousePos(null)
      if (isPanning) {
        setIsPanning(false)
        canvas.style.cursor = 'grab'
      }
    }

    const handleDoubleClick = (e: MouseEvent) => {
      if (showPatternPerformance && (canvas as any).patternDetailsButton) {
        const rect = canvas.getBoundingClientRect()
        const x = e.clientX - rect.left
        const y = e.clientY - rect.top
        const btn = (canvas as any).patternDetailsButton
        if (x >= btn.x && x <= btn.x + btn.width && y >= btn.y && y <= btn.y + btn.height) {
          setShowPatternDetails(true)
          return
        }
      }
      // Double-click resets zoom
      setZoomRange({ start: 0, end: 1 })
    }

    canvas.addEventListener('mousemove', handleMouseMove)
    canvas.addEventListener('mousedown', handleMouseDown)
    canvas.addEventListener('mouseup', handleMouseUp)
    canvas.addEventListener('mouseleave', handleMouseLeave)
    canvas.addEventListener('wheel', handleWheel, { passive: false })
    canvas.addEventListener('dblclick', handleDoubleClick)
    canvas.style.cursor = 'grab'

    return () => {
      canvas.removeEventListener('mousemove', handleMouseMove)
      canvas.removeEventListener('mousedown', handleMouseDown)
      canvas.removeEventListener('mouseup', handleMouseUp)
      canvas.removeEventListener('mouseleave', handleMouseLeave)
      canvas.removeEventListener('wheel', handleWheel)
      canvas.removeEventListener('dblclick', handleDoubleClick)
    }
  }, [isPanning, zoomRange, panStart])

  useEffect(() => {
    if (seasonalData.length > 0 && activeView === 'chart') {
      requestAnimationFrame(() => drawChart())
    }
  }, [
    mousePos,
    zoomRange,
    seasonalData,
    activeView,
    showMaxYears,
    show15Y,
    show10Y,
    showElection,
    showEventPerformance,
    eventPerformanceData,
    showSweetSpot,
    showPainPoint,
    sweetSpotRange,
    painPointRange,
    candlenalityMode,
  ])

  const loadData = async () => {
    setLoading(true)
    setError(null)

    try {
      if (isMultiSymbol && symbols) {
        // Multi-ticker: load each symbol and average their dailyData
        const allResults = await Promise.all(
          symbols.map((s) => almanacService.getSingleStockMonthlyData(s, selectedMonth, 25).catch(() => [] as IndexSeasonalData[]))
        )
        const valid = allResults.map((r) => r[0]).filter(Boolean) as IndexSeasonalData[]
        if (valid.length === 0) {
          setSeasonalData([])
        } else {
          // Average dailyData across all valid results by tradingDay
          const maxDays = Math.max(...valid.map((v) => v.dailyData.length))
          const avgDailyData: IndexSeasonalData['dailyData'][number][] = []
          for (let i = 0; i < maxDays; i++) {
            const pts = valid.map((v) => v.dailyData[i]).filter(Boolean)
            if (pts.length === 0) continue
            avgDailyData.push({
              tradingDay: pts[0].tradingDay,
              date: pts[0].date,
              avgReturn: pts.reduce((s, p) => s + p.avgReturn, 0) / pts.length,
              cumulativeReturn: pts.reduce((s, p) => s + p.cumulativeReturn, 0) / pts.length,
              postElectionReturn: pts.reduce((s, p) => s + p.postElectionReturn, 0) / pts.length,
              postElectionCumulative: pts.reduce((s, p) => s + p.postElectionCumulative, 0) / pts.length,
              cumulativeReturn10Y: pts.reduce((s, p) => s + p.cumulativeReturn10Y, 0) / pts.length,
              cumulativeReturn15Y: pts.reduce((s, p) => s + p.cumulativeReturn15Y, 0) / pts.length,
              postElectionCumulative10Y: pts.reduce((s, p) => s + p.postElectionCumulative10Y, 0) / pts.length,
              postElectionCumulative15Y: pts.reduce((s, p) => s + p.postElectionCumulative15Y, 0) / pts.length,
            })
          }
          setSeasonalData([{ symbol: 'AVG', name: 'Average', color: '#00C853', dashColor: '#00C853', dailyData: avgDailyData }])
        }
      } else if (isIndex) {
        // Load all 4 indices - use 25 years to capture all available data
        const data = await almanacService.getMonthlySeasonalData(selectedMonth, 25)
        setSeasonalData(data)
      } else {
        // Load single stock data - use 25 years to capture all available data
        const data = await almanacService.getSingleStockMonthlyData(symbol, selectedMonth, 25)
        setSeasonalData(data)
      }
    } catch (err) {
      setError('Failed to load seasonal data')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const calculateEventPerformance = async (eventType: string) => {
    const currentYear = new Date().getFullYear()

    const getEventDates = (event: string): Date[] => {
      const dates: Date[] = []
      for (let year = currentYear - 5; year <= currentYear + 1; year++) {
        switch (event) {
          case 'thanksgiving':
            const nov1 = new Date(year, 10, 1)
            const firstThursday = ((4 - nov1.getDay() + 7) % 7) + 1
            dates.push(new Date(year, 10, firstThursday + 21))
            break
          case 'christmas':
            dates.push(new Date(year, 11, 25))
            break
          case 'newyear':
            dates.push(new Date(year, 0, 1))
            break
          case 'presidentsday':
            const feb1 = new Date(year, 1, 1)
            const firstMonday = ((1 - feb1.getDay() + 7) % 7) + 1
            dates.push(new Date(year, 1, firstMonday + 14))
            break
          case 'mlkday':
            const jan1 = new Date(year, 0, 1)
            const firstMondayJan = ((1 - jan1.getDay() + 7) % 7) + 1
            dates.push(new Date(year, 0, firstMondayJan + 14))
            break
          case 'memorialday':
            const may31 = new Date(year, 4, 31)
            const lastMonday = 31 - ((may31.getDay() + 6) % 7)
            dates.push(new Date(year, 4, lastMonday))
            break
          case 'july4th':
            dates.push(new Date(year, 6, 4))
            break
          case 'laborday':
            const sep1 = new Date(year, 8, 1)
            const firstMondaySep = ((1 - sep1.getDay() + 7) % 7) + 1
            dates.push(new Date(year, 8, firstMondaySep))
            break
          case 'fomc-march':
            dates.push(new Date(year, 2, 20))
            break
          case 'fomc-june':
            dates.push(new Date(year, 5, 15))
            break
          case 'fomc-september':
            dates.push(new Date(year, 8, 20))
            break
          case 'fomc-december':
            dates.push(new Date(year, 11, 15))
            break
          case 'quad-witching-mar':
            const mar1 = new Date(year, 2, 1)
            const firstFridayMar = ((5 - mar1.getDay() + 7) % 7) + 1
            dates.push(new Date(year, 2, firstFridayMar + 14))
            break
          case 'quad-witching-jun':
            const jun1 = new Date(year, 5, 1)
            const firstFridayJun = ((5 - jun1.getDay() + 7) % 7) + 1
            dates.push(new Date(year, 5, firstFridayJun + 14))
            break
          case 'quad-witching-sep':
            const sep1qw = new Date(year, 8, 1)
            const firstFridaySep = ((5 - sep1qw.getDay() + 7) % 7) + 1
            dates.push(new Date(year, 8, firstFridaySep + 14))
            break
          case 'quad-witching-dec':
            const dec1 = new Date(year, 11, 1)
            const firstFridayDec = ((5 - dec1.getDay() + 7) % 7) + 1
            dates.push(new Date(year, 11, firstFridayDec + 14))
            break
          case 'monthlyopex':
            const today = new Date()
            const month1 = new Date(year, today.getMonth(), 1)
            const firstFridayMonth = ((5 - month1.getDay() + 7) % 7) + 1
            dates.push(new Date(year, today.getMonth(), firstFridayMonth + 14))
            break
          case 'yearendrally':
            dates.push(new Date(year, 11, 31))
            break
          case 'halloweenrally':
            dates.push(new Date(year, 9, 31))
            break
          case 'santarally':
            dates.push(new Date(year, 11, 20))
            break
          case 'q1-earnings':
            dates.push(new Date(year, 3, 15))
            break
          case 'q2-earnings':
            dates.push(new Date(year, 6, 15))
            break
          case 'q3-earnings':
            dates.push(new Date(year, 9, 15))
            break
          case 'q4-earnings':
            dates.push(new Date(year, 0, 15))
            break
        }
      }
      return dates
    }

    const isWeekend = (date: Date) => date.getDay() === 0 || date.getDay() === 6
    const isHoliday = (date: Date) => {
      const month = date.getMonth(),
        day = date.getDate(),
        dayOfWeek = date.getDay()
      if (month === 0 && day === 1) return true
      if (month === 6 && day === 4) return true
      if (month === 11 && day === 25) return true
      if (month === 0 && dayOfWeek === 1 && day >= 15 && day <= 21) return true
      if (month === 1 && dayOfWeek === 1 && day >= 15 && day <= 21) return true
      if (month === 4 && dayOfWeek === 1 && day >= 25) return true
      if (month === 8 && dayOfWeek === 1 && day <= 7) return true
      if (month === 10 && dayOfWeek === 4 && day >= 22 && day <= 28) return true
      return false
    }

    const getTradingDays = (startDate: Date, count: number, forward: boolean): Date[] => {
      const days: Date[] = []
      const current = new Date(startDate)
      let found = 0
      while (found < count) {
        current.setDate(current.getDate() + (forward ? 1 : -1))
        if (!isWeekend(current) && !isHoliday(current)) {
          days.push(new Date(current))
          found++
        }
      }
      return forward ? days : days.reverse()
    }

    try {
      const eventDates = getEventDates(eventType)

      // Find the event date for the current month being viewed
      const currentMonth = selectedMonth
      const currentYear = new Date().getFullYear()
      let targetEventDate = eventDates.find(
        (d) => d.getMonth() === currentMonth && d.getFullYear() === currentYear
      )

      // If no event this month this year, try next year or last year
      if (!targetEventDate) {
        targetEventDate = eventDates.find(
          (d) => d.getMonth() === currentMonth && d.getFullYear() === currentYear + 1
        )
      }
      if (!targetEventDate) {
        targetEventDate = eventDates.find(
          (d) => d.getMonth() === currentMonth && d.getFullYear() === currentYear - 1
        )
      }
      if (!targetEventDate) {
        console.error('No event date found for month', currentMonth)
        return
      }

      console.log('Target event date for display:', targetEventDate)

      const allReturns: number[][] = Array(11)
        .fill(0)
        .map(() => []) // 5 before + event + 5 after = 11

      let successfulFetches = 0

      for (const eventDate of eventDates) {
        // Only use events from past years for average calculation
        if (eventDate.getFullYear() > currentYear) continue

        const before = getTradingDays(eventDate, 5, false)
        const after = getTradingDays(eventDate, 5, true)
        const allDays = [...before, eventDate, ...after]

        const from = allDays[0].toISOString().split('T')[0]
        const to = allDays[allDays.length - 1].toISOString().split('T')[0]

        console.log(`Fetching ${eventType} data for ${eventDate.getFullYear()}: ${from} to ${to}`)

        const response = await fetch(
          `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${from}/${to}?adjusted=true&sort=asc&apiKey=${process.env.NEXT_PUBLIC_POLYGON_API_KEY || ''}`
        )

        if (!response.ok) {
          console.warn(`API error for ${eventDate.getFullYear()}:`, response.status)
          continue
        }

        const data = await response.json()
        if (!data.results || data.results.length === 0) {
          console.warn(`No data results for ${eventDate.getFullYear()}`)
          continue
        }

        const prices = data.results.map((r: any) => r.c)
        console.log(`Got ${prices.length} prices for ${eventDate.getFullYear()}:`, prices)

        // Accept any result with at least 7 data points (flexible for holidays)
        if (prices.length < 7) {
          console.warn(`Not enough prices (${prices.length} < 7) for ${eventDate.getFullYear()}`)
          continue
        }

        successfulFetches++

        // Use middle point as event reference (since event might be a holiday and excluded)
        const eventIndex = Math.floor(prices.length / 2)
        const eventPrice = prices[eventIndex]

        console.log(`Using index ${eventIndex} as event price:`, eventPrice)

        if (!eventPrice || eventPrice === 0) {
          console.warn(`Invalid event price for ${eventDate.getFullYear()}`)
          continue
        }

        // Map to our 11-point array, centering around the event
        const offset = 5 - eventIndex // How many slots to shift

        for (let i = 0; i < prices.length; i++) {
          const targetIndex = i + offset
          if (targetIndex >= 0 && targetIndex < 11) {
            const returnPct = ((prices[i] - eventPrice) / eventPrice) * 100
            allReturns[targetIndex].push(returnPct)
            if (i === 0 || i === eventIndex || i === prices.length - 1) {
              console.log(
                `Day ${i} -> slot ${targetIndex}: price=${prices[i]}, return=${returnPct.toFixed(2)}%`
              )
            }
          }
        }
      }

      console.log(`Successfully fetched ${successfulFetches} event occurrences`)

      if (successfulFetches === 0) {
        console.error('No successful data fetches - cannot calculate average')
        return
      }

      const avgReturns = allReturns.map((returns) =>
        returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0
      )

      console.log('Average returns calculated:', avgReturns)

      // For holidays that don't have trading, find the closest trading day before the event
      const actualEventTradingDate = new Date(targetEventDate)
      while (isWeekend(actualEventTradingDate) || isHoliday(actualEventTradingDate)) {
        actualEventTradingDate.setDate(actualEventTradingDate.getDate() - 1)
      }

      console.log('Actual event trading date (adjusted for holiday):', actualEventTradingDate)

      // Get the trading day numbers - extend beyond month boundaries to handle events that span months
      const monthStart = new Date(currentYear, currentMonth, 1)
      const monthEnd = new Date(currentYear, currentMonth + 1, 0)

      // Extend range to include 10 trading days before and after the month
      const extendedStart = new Date(monthStart)
      extendedStart.setDate(extendedStart.getDate() - 15) // Go back 15 calendar days
      const extendedEnd = new Date(monthEnd)
      extendedEnd.setDate(extendedEnd.getDate() + 15) // Go forward 15 calendar days

      // Build list of all trading days in the extended range
      const allMonthTradingDays: Date[] = []
      const current = new Date(extendedStart)
      while (current <= extendedEnd) {
        if (!isWeekend(current) && !isHoliday(current)) {
          allMonthTradingDays.push(new Date(current))
        }
        current.setDate(current.getDate() + 1)
      }

      // Find the event trading day number
      const eventTradingDayNum =
        allMonthTradingDays.findIndex(
          (d) =>
            d.getDate() === actualEventTradingDate.getDate() &&
            d.getMonth() === actualEventTradingDate.getMonth() &&
            d.getFullYear() === actualEventTradingDate.getFullYear()
        ) + 1

      console.log(`Event at trading day ${eventTradingDayNum} of ${allMonthTradingDays.length}`)
      console.log('Event date:', actualEventTradingDate.toLocaleDateString())

      // Create simple sequential data centered around the event
      // Use indices 0-10 where 5 is the event
      const perfData = avgReturns
        .map((avgReturn, index) => {
          const dayOffset = index - 5 // -5 to +5
          const tradingDayNum = eventTradingDayNum + dayOffset

          // Only include if within the extended trading days range
          if (tradingDayNum < 1 || tradingDayNum > allMonthTradingDays.length) {
            console.log(`Skipping index ${index} (day ${tradingDayNum}) - out of range`)
            return null
          }

          const displayDate = allMonthTradingDays[tradingDayNum - 1]
          console.log(
            `Index ${index}: Day ${tradingDayNum} = ${displayDate.toLocaleDateString()}, Return: ${avgReturn.toFixed(2)}%`
          )

          return {
            date: displayDate,
            avgReturn,
            tradingDay: tradingDayNum,
          }
        })
        .filter((d) => d !== null) as { date: Date; avgReturn: number; tradingDay: number }[]

      console.log(
        'Performance data:',
        perfData.map(
          (d) => `Day ${d.tradingDay} (${d.date.toLocaleDateString()}): ${d.avgReturn.toFixed(2)}%`
        )
      )

      setEventPerformanceData(perfData)
    } catch (error) {
      console.error('Event performance calculation failed:', error)
    }
  }

  // Calculate pattern-based performance (52-week highs/lows, % moves)
  const calculatePatternPerformance = async (
    patternType: string,
    patternLabel: string,
    ticker: string
  ) => {
    console.log(`Calculating pattern performance for ${patternType} on ${ticker}`)

    // Assign color based on pattern type
    const getPatternColor = (label: string) => {
      if (label.includes('90d Cooldown')) return '#00CED1' // Cyan for cooldown
      if (label.includes('Annual')) return '#FFD700' // Gold for annual
      return '#00BFFF' // Default blue
    }

    try {
      // Determine lookback period and forward period
      const yearsBack = 19
      const forwardDays = patternType.includes('52week') ? 20 : 29

      // Fetch historical data for pattern scanning
      const endDate = new Date()
      const startDate = new Date()
      startDate.setFullYear(startDate.getFullYear() - yearsBack)

      const startStr = startDate.toISOString().split('T')[0]
      const endStr = endDate.toISOString().split('T')[0]

      console.log(`Fetching ${yearsBack} years of data from ${startStr} to ${endStr}`)

      const apiKey = process.env.NEXT_PUBLIC_POLYGON_API_KEY || ''
      const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${startStr}/${endStr}?adjusted=true&sort=asc&apiKey=${apiKey}`

      const response = await fetch(url)
      const data = await response.json()

      if (!data.results || data.results.length < 252) {
        console.error('Insufficient historical data')
        return
      }

      const prices: PriceData[] = data.results.map((r: any) => ({
        date: new Date(r.t),
        close: r.c,
        high: r.h,
        low: r.l,
      }))

      console.log(`Loaded ${prices.length} days of historical data`)

      // Find pattern occurrences based on type
      const occurrences: Date[] = []
      const occurrenceDetails: { date: Date; priceAtEvent: number; changePercent?: number }[] = []

      if (patternType === '52week-high-cooldown' || patternType === '52week-high-annual') {
        // 52-week high breakouts
        for (let i = 252; i < prices.length; i++) {
          const last252 = prices.slice(i - 252, i)
          const high52Week = Math.max(...last252.map((p) => p.high))

          if (prices[i].close > high52Week) {
            const occDate = prices[i].date

            if (patternType === '52week-high-cooldown') {
              // Check 90-day cooldown
              const lastOcc = occurrences[occurrences.length - 1]
              if (
                !lastOcc ||
                (occDate.getTime() - lastOcc.getTime()) / (1000 * 60 * 60 * 24) >= 90
              ) {
                occurrences.push(occDate)
                occurrenceDetails.push({
                  date: occDate,
                  priceAtEvent: prices[i].close,
                  changePercent: ((prices[i].close - high52Week) / high52Week) * 100,
                })
              }
            } else {
              // Annual: first occurrence per year
              const year = occDate.getFullYear()
              if (!occurrences.find((d) => d.getFullYear() === year)) {
                occurrences.push(occDate)
                occurrenceDetails.push({
                  date: occDate,
                  priceAtEvent: prices[i].close,
                  changePercent: ((prices[i].close - high52Week) / high52Week) * 100,
                })
              }
            }
          }
        }
      } else if (patternType === '52week-low-cooldown' || patternType === '52week-low-annual') {
        // 52-week low breakdowns
        for (let i = 252; i < prices.length; i++) {
          const last252 = prices.slice(i - 252, i)
          const low52Week = Math.min(...last252.map((p) => p.low))

          if (prices[i].close < low52Week) {
            const occDate = prices[i].date

            if (patternType === '52week-low-cooldown') {
              const lastOcc = occurrences[occurrences.length - 1]
              if (
                !lastOcc ||
                (occDate.getTime() - lastOcc.getTime()) / (1000 * 60 * 60 * 24) >= 90
              ) {
                occurrences.push(occDate)
                occurrenceDetails.push({
                  date: occDate,
                  priceAtEvent: prices[i].close,
                  changePercent: ((prices[i].close - low52Week) / low52Week) * 100,
                })
              }
            } else {
              const year = occDate.getFullYear()
              if (!occurrences.find((d) => d.getFullYear() === year)) {
                occurrences.push(occDate)
                occurrenceDetails.push({
                  date: occDate,
                  priceAtEvent: prices[i].close,
                  changePercent: ((prices[i].close - low52Week) / low52Week) * 100,
                })
              }
            }
          }
        }
      } else if (patternType.startsWith('move-8-11') || patternType.startsWith('move-18-22')) {
        // Percentage move detection
        const [_, minPct, maxPct, direction, method] = patternType.split('-')
        const minMove = parseFloat(minPct)
        const maxMove = parseFloat(maxPct)

        for (let i = 1; i < prices.length; i++) {
          const pctChange = ((prices[i].close - prices[i - 1].close) / prices[i - 1].close) * 100
          const absChange = Math.abs(pctChange)

          if (absChange >= minMove && absChange <= maxMove) {
            if ((direction === 'up' && pctChange > 0) || (direction === 'down' && pctChange < 0)) {
              const occDate = prices[i].date

              if (method === 'cooldown') {
                const lastOcc = occurrences[occurrences.length - 1]
                if (
                  !lastOcc ||
                  (occDate.getTime() - lastOcc.getTime()) / (1000 * 60 * 60 * 24) >= 90
                ) {
                  occurrences.push(occDate)
                  occurrenceDetails.push({
                    date: occDate,
                    priceAtEvent: prices[i].close,
                    changePercent: pctChange,
                  })
                }
              } else if (method === 'annual') {
                const year = occDate.getFullYear()
                if (!occurrences.find((d) => d.getFullYear() === year)) {
                  occurrences.push(occDate)
                  occurrenceDetails.push({
                    date: occDate,
                    priceAtEvent: prices[i].close,
                    changePercent: pctChange,
                  })
                }
              }
            }
          }
        }
      }

      console.log(`Found ${occurrences.length} pattern occurrences`)

      if (occurrences.length === 0) {
        console.error('No pattern occurrences found')
        return
      }

      // Calculate average performance after each occurrence
      const allReturns: number[][] = Array.from({ length: forwardDays + 1 }, () => [])

      for (const occDate of occurrences) {
        const occIndex = prices.findIndex((p) => p.date.getTime() === occDate.getTime())
        if (occIndex === -1 || occIndex + forwardDays >= prices.length) continue

        const basePrice = prices[occIndex].close

        for (let day = 0; day <= forwardDays; day++) {
          if (occIndex + day < prices.length) {
            const returnPct = ((prices[occIndex + day].close - basePrice) / basePrice) * 100
            allReturns[day].push(returnPct)
          }
        }
      }

      // Calculate averages
      const avgReturns = allReturns.map((returns) =>
        returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0
      )

      console.log(
        'Average returns calculated:',
        avgReturns.slice(0, 5).map((r) => r.toFixed(2))
      )
      console.log(`Pattern analysis complete: ${occurrences.length} occurrences found`)

      // Create simple sequential data for display
      const perfData = avgReturns.map((avgReturn, index) => ({
        date: new Date(), // Placeholder - not used for pattern display
        avgReturn,
        tradingDay: index + 1,
      }))

      // Add to or update pattern performance data
      setPatternPerformanceData((prev) => {
        const filtered = prev.filter((p) => p.patternName !== patternLabel)
        return [
          ...filtered,
          {
            patternName: patternLabel,
            data: perfData,
            occurrences: occurrences.length,
            color: getPatternColor(patternLabel),
            occurrenceDetails: occurrenceDetails,
          },
        ]
      })
    } catch (error) {
      console.error('Pattern performance calculation failed:', error)
    }
  }

  const drawChart = () => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container || seasonalData.length === 0) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rect = container.getBoundingClientRect()
    const width = Math.max(rect.width, 300)
    const height = Math.max(rect.height, 300)

    if (width < 50 || height < 50) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    ctx.scale(dpr, dpr)

    // CRITICAL: 70px bottom padding ensures x-axis labels never get cropped
    const isMobileView = width < 768
    // Right padding: 80px for index mode (DIA/SPY/QQQ/IWM + "SPY E" labels), 50px for year labels (25Y/15Y/E)
    const desktopRightPad = isIndex ? 80 : 50
    const PADDING = isMobileView
      ? { top: 5, right: 72, bottom: 28, left: 45 }
      : { top: 5, right: desktopRightPad, bottom: 70, left: 60 }
    const chartWidth = width - PADDING.left - PADDING.right
    const chartHeight = height - PADDING.top - PADDING.bottom

    // Clear canvas with black background
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, width, height)

    // Calculate value range based on visible data when zoomed
    let minValue = Infinity
    let maxValue = -Infinity

    const maxTradingDays = Math.max(...seasonalData.map((d) => d.dailyData.length))

    // If showing event or pattern performance, use that data for Y-axis scale
    if (
      (showEventPerformance && eventPerformanceData.length > 0) ||
      (showPatternPerformance && patternPerformanceData.length > 0)
    ) {
      if (showPatternPerformance) {
        // For multiple patterns, find min/max across all datasets
        patternPerformanceData.forEach((patternSet) => {
          patternSet.data.forEach((point) => {
            minValue = Math.min(minValue, point.avgReturn)
            maxValue = Math.max(maxValue, point.avgReturn)
          })
        })
      } else {
        eventPerformanceData.forEach((point) => {
          minValue = Math.min(minValue, point.avgReturn)
          maxValue = Math.max(maxValue, point.avgReturn)
        })
      }

      // Ensure 0% is always visible and centered
      const absMax = Math.max(Math.abs(minValue), Math.abs(maxValue))
      minValue = -absMax
      maxValue = absMax

      // Add padding
      const range = maxValue - minValue
      minValue -= range * 0.15
      maxValue += range * 0.15
    } else {
      // Determine visible trading day range based on zoom and pan for seasonal data
      const getVisibleRange = () => {
        return {
          start: Math.max(1, Math.floor(zoomRange.start * (maxTradingDays - 1)) + 1),
          end: Math.min(maxTradingDays, Math.ceil(zoomRange.end * (maxTradingDays - 1)) + 1),
        }
      }

      const visibleRange = getVisibleRange()

      seasonalData.forEach((index) => {
        index.dailyData.forEach((point) => {
          if (point.tradingDay >= visibleRange.start && point.tradingDay <= visibleRange.end) {
            minValue = Math.min(minValue, point.cumulativeReturn)
            maxValue = Math.max(maxValue, point.cumulativeReturn)
            if (show10Y || show15Y || showMaxYears) {
              minValue = Math.min(minValue, point.cumulativeReturn10Y, point.cumulativeReturn15Y)
              maxValue = Math.max(maxValue, point.cumulativeReturn10Y, point.cumulativeReturn15Y)
            }
            if (showElection) {
              minValue = Math.min(minValue, point.postElectionCumulative)
              maxValue = Math.max(maxValue, point.postElectionCumulative)
            }
          }
        })
      })

      // Fallback if no visible data
      if (minValue === Infinity || maxValue === -Infinity) {
        seasonalData.forEach((index) => {
          index.dailyData.forEach((point) => {
            minValue = Math.min(minValue, point.cumulativeReturn)
            maxValue = Math.max(maxValue, point.cumulativeReturn)
            if (show10Y || show15Y || showMaxYears) {
              minValue = Math.min(minValue, point.cumulativeReturn10Y, point.cumulativeReturn15Y)
              maxValue = Math.max(maxValue, point.cumulativeReturn10Y, point.cumulativeReturn15Y)
            }
            if (showElection) {
              minValue = Math.min(minValue, point.postElectionCumulative)
              maxValue = Math.max(maxValue, point.postElectionCumulative)
            }
          })
        })
      }

      const range = maxValue - minValue
      minValue -= range * 0.1
      maxValue += range * 0.1
    }

    // Helper functions for positioning with zoom and pan
    const rangeSize = zoomRange.end - zoomRange.start
    const getX = (tradingDay: number) => {
      const baseX = (tradingDay - 1) / (maxTradingDays - 1)
      return PADDING.left + ((baseX - zoomRange.start) / rangeSize) * chartWidth
    }

    // Simpler X calculation for event data - just spread points evenly
    const getEventX = (index: number, totalPoints: number) => {
      const baseX = index / (totalPoints - 1)
      return PADDING.left + ((baseX - zoomRange.start) / rangeSize) * chartWidth
    }

    const getY = (value: number) => {
      return PADDING.top + chartHeight * ((maxValue - value) / (maxValue - minValue))
    }

    // Draw horizontal grid lines and Y-axis labels
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'
    ctx.lineWidth = 1
    ctx.fillStyle = '#FFFFFF'
    ctx.font = `bold ${isFullscreen ? '20' : '16'}px "JetBrains Mono", monospace`
    ctx.textAlign = 'right'

    const numHLines = 8
    for (let i = 0; i <= numHLines; i++) {
      const y = PADDING.top + (chartHeight / numHLines) * i
      ctx.beginPath()
      ctx.moveTo(PADDING.left, y)
      ctx.lineTo(width - PADDING.right, y)
      ctx.stroke()

      const value = maxValue - ((maxValue - minValue) / numHLines) * i
      ctx.fillText(`${value.toFixed(1)}%`, PADDING.left - 6, y + 5)
    }

    // Draw zero line
    if (minValue < 0 && maxValue > 0) {
      const zeroY = getY(0)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
      ctx.setLineDash([5, 5])
      ctx.beginPath()
      ctx.moveTo(PADDING.left, zeroY)
      ctx.lineTo(width - PADDING.right, zeroY)
      ctx.stroke()
      ctx.setLineDash([])
    }

    // Index colors
    const colors: Record<string, string> = {
      DJIA: '#FFFFFF',
      'S&P 500': '#00C853',
      NASDAQ: '#2196F3',
      'Russell 2000': '#FF5722',
    }

    // End-of-line ticker labels — populated during line drawing, rendered after ctx.restore()
    const endLabels: Array<{ label: string, color: string, key: string, active: boolean, endY: number }> = []

    // Save context and create clipping region for chart area (prevents lines from drawing over y-axis)
    ctx.save()
    ctx.beginPath()
    ctx.rect(PADDING.left, PADDING.top, chartWidth, chartHeight)
    ctx.clip()

    // ── Sweet Spot / Pain Point overlays (drawn before lines so lines appear on top) ──
    if (!showEventPerformance && !showPatternPerformance) {
      if (showSweetSpot && sweetSpotRange) {
        const x1 = getX(sweetSpotRange.start)
        const x2 = getX(sweetSpotRange.end)
        ctx.fillStyle = 'rgba(0, 255, 65, 0.13)'
        ctx.fillRect(x1, PADDING.top, x2 - x1, chartHeight)
        ctx.strokeStyle = '#00ff41'
        ctx.lineWidth = 1.5
        ctx.setLineDash([4, 3])
        ctx.beginPath()
        ctx.moveTo(x1, PADDING.top); ctx.lineTo(x1, PADDING.top + chartHeight)
        ctx.moveTo(x2, PADDING.top); ctx.lineTo(x2, PADDING.top + chartHeight)
        ctx.stroke()
        ctx.setLineDash([])
        // Label
        ctx.fillStyle = '#00ff41'
        ctx.font = 'bold 11px "JetBrains Mono", monospace'
        ctx.textAlign = 'center'
        ctx.fillText(`★ ${sweetSpotRange.label}`, (x1 + x2) / 2, PADDING.top + 14)
      }
      if (showPainPoint && painPointRange) {
        const x1 = getX(painPointRange.start)
        const x2 = getX(painPointRange.end)
        ctx.fillStyle = 'rgba(255, 50, 50, 0.13)'
        ctx.fillRect(x1, PADDING.top, x2 - x1, chartHeight)
        ctx.strokeStyle = '#ff3232'
        ctx.lineWidth = 1.5
        ctx.setLineDash([4, 3])
        ctx.beginPath()
        ctx.moveTo(x1, PADDING.top); ctx.lineTo(x1, PADDING.top + chartHeight)
        ctx.moveTo(x2, PADDING.top); ctx.lineTo(x2, PADDING.top + chartHeight)
        ctx.stroke()
        ctx.setLineDash([])
        // Label
        ctx.fillStyle = '#ff3232'
        ctx.font = 'bold 11px "JetBrains Mono", monospace'
        ctx.textAlign = 'center'
        ctx.fillText(`▼ ${painPointRange.label}`, (x1 + x2) / 2, PADDING.top + 14)
      }
    }

    // Draw data lines (only if event or pattern performance is not active)
    if (!showEventPerformance && !showPatternPerformance) {
      // In isIndex mode, reuse showMaxYears/show15Y/show10Y/showElection as per-symbol toggles
      const indexVisibility: Record<string, boolean> = {
        'DJIA': showMaxYears, 'S&P 500': show15Y, 'NASDAQ': show10Y, 'Russell 2000': showElection,
      }

      // ── Candlenality mode: average all visible series → draw one set of OHLC candles ──
      if (candlenalityMode) {
        const refData = seasonalData[0]?.dailyData || []
        if (refData.length > 0) {
          // Collect cumulative return arrays for every active series/timeframe
          const activeCumulatives: number[][] = []
          if (isIndex) {
            seasonalData.forEach((index) => {
              if (indexVisibility[index.name] === false) return
              activeCumulatives.push(index.dailyData.map((p) => p.cumulativeReturn))
            })
          } else {
            const d = seasonalData[0]
            if (d) {
              if (showMaxYears) activeCumulatives.push(d.dailyData.map((p) => p.cumulativeReturn))
              if (show15Y) activeCumulatives.push(d.dailyData.map((p) => p.cumulativeReturn15Y))
              if (show10Y) activeCumulatives.push(d.dailyData.map((p) => p.cumulativeReturn10Y))
              if (showElection) activeCumulatives.push(d.dailyData.map((p) => p.postElectionCumulative))
            }
          }
          if (activeCumulatives.length === 0) {
            // Fallback: show primary series
            activeCumulatives.push(seasonalData[0].dailyData.map((p) => p.cumulativeReturn))
          }

          // Average across all active series per trading day
          const avgCumulative: number[] = refData.map((_, i) => {
            const vals = activeCumulatives.map((s) => s[i]).filter((v) => v !== undefined && !isNaN(v))
            return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
          })

          const candleWidth = Math.max(3, Math.min(14, chartWidth / refData.length * 0.65))

          refData.forEach((point, i) => {
            const prevCum = i === 0 ? 0 : avgCumulative[i - 1]
            const currCum = avgCumulative[i]
            const isUp = currCum >= prevCum
            // Wick size: half the absolute daily avg return, min 0.05% for visibility
            const wickExt = Math.max(0.05, Math.abs(point.avgReturn) * 0.4)
            const high = Math.max(prevCum, currCum) + wickExt
            const low = Math.min(prevCum, currCum) - wickExt
            const x = getX(point.tradingDay)
            const color = isUp ? '#00ff41' : '#ff3232'
            // Wick line
            ctx.strokeStyle = color
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(x, getY(high))
            ctx.lineTo(x, getY(low))
            ctx.stroke()
            // Body
            const bodyTop = getY(Math.max(prevCum, currCum))
            const bodyBot = getY(Math.min(prevCum, currCum))
            const bodyH = Math.max(1.5, bodyBot - bodyTop)
            ctx.fillStyle = color
            ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyH)
          })
        }
      } else {
        // ── Normal line drawing ──
        seasonalData.forEach((index) => {
          if (isIndex && indexVisibility[index.name] === false) return
          // For individual stocks, use white for max, orange for 10Y, pink for 15Y
          const whiteColor = isIndex ? colors[index.name] || '#FFFFFF' : '#FFFFFF'
          const orangeColor = '#FF6600'
          const pinkColor = '#00BCD4'
          const electionColor = isIndex ? colors[index.name] || '#FFFFFF' : '#FFD700'

          if (isIndex || showMaxYears) {
            const hasDistinct10Y = index.dailyData.some(
              (p) => Math.abs(p.cumulativeReturn - p.cumulativeReturn10Y) > 0.01
            )
            const hasDistinct15Y = index.dailyData.some(
              (p) => Math.abs(p.cumulativeReturn - p.cumulativeReturn15Y) > 0.01
            )
            const showWhiteLine = hasDistinct10Y || hasDistinct15Y

            if (showWhiteLine) {
              ctx.strokeStyle = whiteColor
              ctx.lineWidth = 2
              ctx.beginPath()
              index.dailyData.forEach((point, i) => {
                const x = getX(point.tradingDay)
                const y = getY(point.cumulativeReturn)
                if (i === 0) ctx.moveTo(x, y)
                else ctx.lineTo(x, y)
              })
              ctx.stroke()
            }
          }

          if (!isIndex && show15Y) {
            ctx.strokeStyle = pinkColor
            ctx.lineWidth = 2
            ctx.beginPath()
            index.dailyData.forEach((point, i) => {
              const x = getX(point.tradingDay)
              const y = getY(point.cumulativeReturn15Y)
              if (i === 0) ctx.moveTo(x, y)
              else ctx.lineTo(x, y)
            })
            ctx.stroke()
          }

          if (!isIndex && show10Y) {
            ctx.strokeStyle = orangeColor
            ctx.lineWidth = 2
            ctx.beginPath()
            index.dailyData.forEach((point, i) => {
              const x = getX(point.tradingDay)
              const y = getY(point.cumulativeReturn10Y)
              if (i === 0) ctx.moveTo(x, y)
              else ctx.lineTo(x, y)
            })
            ctx.stroke()
          }

          if (showElection) {
            ctx.strokeStyle = electionColor
            ctx.lineWidth = 2
            ctx.setLineDash([8, 4])
            ctx.beginPath()
            index.dailyData.forEach((point, i) => {
              const x = getX(point.tradingDay)
              const y = getY(point.postElectionCumulative)
              if (i === 0) ctx.moveTo(x, y)
              else ctx.lineTo(x, y)
            })
            ctx.stroke()
            ctx.setLineDash([])
          }
        })
      }

      // Collect end-of-line label positions for right-side ticker labels
      {
        const shortNames: Record<string, string> = { 'DJIA': 'DIA', 'S&P 500': 'SPY', 'NASDAQ': 'QQQ', 'Russell 2000': 'IWM' }
        const clampY = (v: number) => Math.max(PADDING.top + 6, Math.min(height - PADDING.bottom - 6, v))
        if (isIndex) {
          seasonalData.forEach((index) => {
            const short = shortNames[index.name] || index.name
            const col = colors[index.name] || '#FFFFFF'
            const vis = indexVisibility[index.name] !== false
            const lp = index.dailyData[index.dailyData.length - 1]
            if (!lp) return
            endLabels.push({ label: short, color: col, key: short, active: vis, endY: clampY(getY(lp.cumulativeReturn)) })
            endLabels.push({ label: short + ' E', color: col, key: short + '_E', active: vis, endY: clampY(getY(lp.postElectionCumulative)) })
          })
        } else {
          const d = seasonalData[0]?.dailyData
          if (d && d.length > 0) {
            const lp = d[d.length - 1]
            const clamp = clampY
            endLabels.push({ label: '25Y', color: '#FFFFFF', key: '25Y', active: showMaxYears ?? true, endY: clamp(getY(lp.cumulativeReturn)) })
            endLabels.push({ label: '15Y', color: '#00BCD4', key: '15Y', active: show15Y, endY: clamp(getY(lp.cumulativeReturn15Y)) })
            endLabels.push({ label: '10Y', color: '#FF6600', key: '10Y', active: show10Y, endY: clamp(getY(lp.cumulativeReturn10Y)) })
            endLabels.push({ label: 'E', color: '#FFD700', key: 'E', active: showElection, endY: clamp(getY(lp.postElectionCumulative)) })
          }
        }
      }
    }

    // Draw event performance overlay if active
    if (showEventPerformance && eventPerformanceData.length > 0) {
      // Find the event point (middle of the data)
      const eventIndex = Math.floor(eventPerformanceData.length / 2)
      const eventX = getEventX(eventIndex, eventPerformanceData.length)

      // Draw vertical dashed line at event date
      ctx.strokeStyle = '#FF6600'
      ctx.lineWidth = 2
      ctx.setLineDash([8, 4])
      ctx.beginPath()
      ctx.moveTo(eventX, PADDING.top)
      ctx.lineTo(eventX, height - PADDING.bottom)
      ctx.stroke()
      ctx.setLineDash([])

      // Draw event label at top
      ctx.fillStyle = '#FF6600'
      ctx.font = 'bold 12px "JetBrains Mono", monospace'
      ctx.textAlign = 'center'
      ctx.fillText('EVENT', eventX, PADDING.top - 5)

      // Draw event performance line
      ctx.strokeStyle = '#00FFFF' // Cyan for event performance line
      ctx.lineWidth = 3
      ctx.beginPath()

      eventPerformanceData.forEach((point, i) => {
        const x = getEventX(i, eventPerformanceData.length)
        const y = getY(point.avgReturn)

        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.stroke()

      // Add label
      const lastPoint = eventPerformanceData[eventPerformanceData.length - 1]
      const lastX = getEventX(eventPerformanceData.length - 1, eventPerformanceData.length)
      const lastY = getY(lastPoint.avgReturn)

      ctx.fillStyle = '#00FFFF'
      ctx.font = 'bold 11px "JetBrains Mono", monospace'
      ctx.textAlign = 'left'
      ctx.fillText(`${lastPoint.avgReturn.toFixed(2)}%`, lastX + 5, lastY)
    }

    // Draw pattern performance overlay if active
    if (showPatternPerformance && patternPerformanceData.length > 0) {
      // Draw each pattern line with its own color
      patternPerformanceData.forEach((patternSet, setIndex) => {
        ctx.strokeStyle = patternSet.color
        ctx.lineWidth = 3
        ctx.beginPath()

        patternSet.data.forEach((point, i) => {
          const x = getEventX(i, patternSet.data.length)
          const y = getY(point.avgReturn)

          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        })
        ctx.stroke()

        // Add label for this pattern
        const lastPoint = patternSet.data[patternSet.data.length - 1]
        const lastX = getEventX(patternSet.data.length - 1, patternSet.data.length)
        const lastY = getY(lastPoint.avgReturn)

        ctx.fillStyle = patternSet.color
        ctx.font = 'bold 11px "JetBrains Mono", monospace'
        ctx.textAlign = 'left'
        ctx.fillText(`${lastPoint.avgReturn.toFixed(2)}%`, lastX + 5, lastY + setIndex * 15)
      })

      // Add "DETAILS" button at the right side
      const detailsX = width - PADDING.right - 80
      const detailsY = PADDING.top + 30
      const detailsWidth = 70
      const detailsHeight = 20

      // Draw button background
      ctx.fillStyle = '#00CED1'
      ctx.fillRect(detailsX, detailsY - detailsHeight / 2, detailsWidth, detailsHeight)

      // Draw button text
      ctx.fillStyle = '#000'
      ctx.font = 'bold 10px "JetBrains Mono", monospace'
      ctx.textAlign = 'center'
      ctx.fillText('DETAILS', detailsX + detailsWidth / 2, detailsY + 4)

        // Store button position for click detection
        ; (canvas as any).patternDetailsButton = {
          x: detailsX,
          y: detailsY - detailsHeight / 2,
          width: detailsWidth,
          height: detailsHeight,
        }

      // Add "Day 0" label at start
      ctx.fillStyle = '#00CED1'
      ctx.textAlign = 'left'
      ctx.fillText('Day 0', getEventX(0, patternPerformanceData[0].data.length), PADDING.top - 5)
    }

    // Restore context to draw outside clipping region (for axis labels)
    ctx.restore()

    // ── Glossy white axis divider lines ──────────────────────────────────────
    // Vertical line: right edge of Y-axis labels (left border of chart)
    const axisGrad = ctx.createLinearGradient(PADDING.left - 1, PADDING.top, PADDING.left - 1, height - PADDING.bottom)
    axisGrad.addColorStop(0, 'rgba(255,255,255,0)')
    axisGrad.addColorStop(0.15, 'rgba(255,255,255,0.85)')
    axisGrad.addColorStop(0.5, 'rgba(255,255,255,1)')
    axisGrad.addColorStop(0.85, 'rgba(255,255,255,0.85)')
    axisGrad.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.save()
    ctx.strokeStyle = axisGrad
    ctx.lineWidth = 1.5
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.moveTo(PADDING.left, PADDING.top)
    ctx.lineTo(PADDING.left, height - PADDING.bottom)
    ctx.stroke()
    // Horizontal line: top edge of X-axis labels (bottom border of chart)
    const hGrad = ctx.createLinearGradient(PADDING.left, height - PADDING.bottom, width - PADDING.right, height - PADDING.bottom)
    hGrad.addColorStop(0, 'rgba(255,255,255,0)')
    hGrad.addColorStop(0.1, 'rgba(255,255,255,0.85)')
    hGrad.addColorStop(0.5, 'rgba(255,255,255,1)')
    hGrad.addColorStop(0.9, 'rgba(255,255,255,0.85)')
    hGrad.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.strokeStyle = hGrad
    ctx.beginPath()
    ctx.moveTo(PADDING.left, height - PADDING.bottom)
    ctx.lineTo(width - PADDING.right, height - PADDING.bottom)
    ctx.stroke()
    ctx.restore()
    // ─────────────────────────────────────────────────────────────────────────

    // ── End-of-line ticker labels (right padding, tap/click to toggle) ────────
    if (endLabels.length > 0) {
      const labelFontSize = isMobileView ? 14 : 18
      const rightEdge = width - PADDING.right
      ctx.save()
      ctx.font = `bold ${labelFontSize}px "JetBrains Mono", monospace`
      ctx.textBaseline = 'middle'
      // Sort by Y and push apart overlapping labels
      endLabels.sort((a, b) => a.endY - b.endY)
      const minSp = labelFontSize + 4
      for (let i = 1; i < endLabels.length; i++) {
        if (endLabels[i].endY - endLabels[i - 1].endY < minSp)
          endLabels[i].endY = endLabels[i - 1].endY + minSp
      }
      const labelTapZones: Array<{ x1: number, x2: number, y1: number, y2: number, key: string }> = []
      endLabels.forEach((item) => {
        const alpha = item.active ? 1 : 0.35
        ctx.globalAlpha = alpha
        // Connector tick
        ctx.strokeStyle = item.color
        ctx.lineWidth = 1
        ctx.setLineDash([])
        ctx.beginPath()
        ctx.moveTo(rightEdge, item.endY)
        ctx.lineTo(rightEdge + 4, item.endY)
        ctx.stroke()
        // Label
        ctx.fillStyle = item.color
        ctx.textAlign = 'left'
        ctx.fillText(item.label, rightEdge + 5, item.endY)
        const tw = ctx.measureText(item.label).width
        labelTapZones.push({ x1: rightEdge - 4, x2: rightEdge + 6 + tw, y1: item.endY - 10, y2: item.endY + 10, key: item.key })
      })
      ctx.globalAlpha = 1
        ; (canvas as any).labelTapZones = labelTapZones
      ctx.restore()
    } else {
      ; (canvas as any).labelTapZones = []
    }
    // ──────────────────────────────────────────────────────────────────────────

    // Draw X-axis labels in the bottom padding area
    ctx.fillStyle = '#FFFFFF'
    ctx.font = `bold ${isFullscreen ? '19' : '15'}px "JetBrains Mono", monospace`
    ctx.textAlign = 'center'

    const { isMobile } = getAlmanacDailyChartMobile()
    const xAxisY = isMobile
      ? height - PADDING.bottom + 16  // 28px bottom: center label at +16 from chart base
      : height - PADDING.bottom + 35  // 70px bottom: original position

    if (showEventPerformance && eventPerformanceData.length > 0) {
      // For event performance
      if (isMobile) {
        // Mobile: Show only 3 dates (start, middle, end)
        const indices = [
          0,
          Math.floor(eventPerformanceData.length / 2),
          eventPerformanceData.length - 1,
        ]
        indices.forEach((i) => {
          const point = eventPerformanceData[i]
          const x = getEventX(i, eventPerformanceData.length)
          if (x >= PADDING.left && x <= width - PADDING.right) {
            const dateStr = `${point.date.getMonth() + 1}/${point.date.getDate()}`
            ctx.fillText(dateStr, x, xAxisY)
          }
        })
      } else {
        // Desktop: Show every other date
        eventPerformanceData.forEach((point, i) => {
          if (i % 2 === 0 || i === eventPerformanceData.length - 1) {
            const x = getEventX(i, eventPerformanceData.length)
            if (x >= PADDING.left && x <= width - PADDING.right) {
              const dateStr = `${point.date.getMonth() + 1}/${point.date.getDate()}`
              ctx.fillText(dateStr, x, xAxisY)
            }
          }
        })
      }
    } else if (showPatternPerformance && patternPerformanceData.length > 0) {
      // For pattern performance
      const firstPattern = patternPerformanceData[0]
      if (isMobile) {
        // Mobile: Show only 3 days (start, middle, end)
        const indices = [0, Math.floor(firstPattern.data.length / 2), firstPattern.data.length - 1]
        indices.forEach((i) => {
          const x = getEventX(i, firstPattern.data.length)
          if (x >= PADDING.left && x <= width - PADDING.right) {
            ctx.fillText(`Day ${i}`, x, xAxisY)
          }
        })
      } else {
        // Desktop: Show every 5th day
        firstPattern.data.forEach((point, i) => {
          if (i % 5 === 0 || i === firstPattern.data.length - 1) {
            const x = getEventX(i, firstPattern.data.length)
            if (x >= PADDING.left && x <= width - PADDING.right) {
              ctx.fillText(`Day ${i}`, x, xAxisY)
            }
          }
        })
      }
    } else {
      // For seasonal data
      if (isMobile) {
        // Mobile: dynamic density — more labels when zoomed in
        const dailyData = seasonalData[0]?.dailyData || []
        const visibleFraction = zoomRange.end - zoomRange.start
        const step = visibleFraction >= 0.8 ? Math.ceil(dailyData.length / 3)
          : visibleFraction >= 0.4 ? Math.ceil(dailyData.length / 6)
            : Math.ceil(dailyData.length / 12)
        let lastDrawnX = -Infinity
        dailyData.forEach((point, i) => {
          if (i % step !== 0 && i !== dailyData.length - 1) return
          const x = getX(point.tradingDay)
          if (x < PADDING.left - 5 || x > width - PADDING.right + 5) return
          if (x - lastDrawnX < 32) return // skip if too close to previous label
          ctx.textAlign = 'center'
          ctx.fillText(point.date, x, xAxisY)
          lastDrawnX = x
        })
      } else {
        // Desktop: Show dates at regular intervals
        const step = maxTradingDays > 15 ? 2 : 1
        seasonalData[0]?.dailyData.forEach((point, i) => {
          if (i % step === 0 || i === seasonalData[0].dailyData.length - 1) {
            const x = getX(point.tradingDay)
            ctx.fillText(point.date, x, xAxisY)
          }
        })
      }
    }



    // Draw crosshair
    if (mousePos) {
      const { x: mouseX, y: mouseY } = mousePos

      // Check if mouse is within chart area
      if (
        mouseX >= PADDING.left &&
        mouseX <= width - PADDING.right &&
        mouseY >= PADDING.top &&
        mouseY <= height - PADDING.bottom
      ) {
        // Draw vertical line
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'
        ctx.lineWidth = 1
        ctx.setLineDash([5, 5])
        ctx.beginPath()
        ctx.moveTo(mouseX, PADDING.top)
        ctx.lineTo(mouseX, height - PADDING.bottom)
        ctx.stroke()

        // Draw horizontal line
        ctx.beginPath()
        ctx.moveTo(PADDING.left, mouseY)
        ctx.lineTo(width - PADDING.right, mouseY)
        ctx.stroke()
        ctx.setLineDash([])

        // Calculate trading day from mouse position accounting for zoom
        const normalizedX = (mouseX - PADDING.left) / chartWidth
        const baseX = zoomRange.start + normalizedX * (zoomRange.end - zoomRange.start)
        const tradingDay = Math.round(baseX * (maxTradingDays - 1)) + 1
        const dataPoint = seasonalData[0]?.dailyData.find((d) => d.tradingDay === tradingDay)

        // Calculate percentage from mouse position
        const percentage = maxValue - ((mouseY - PADDING.top) / chartHeight) * (maxValue - minValue)

        // Draw X-axis tooltip (date)
        if (dataPoint) {
          const dateText = dataPoint.date
          ctx.font = '900 22px "JetBrains Mono", monospace'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          const textWidth = ctx.measureText(dateText).width
          const labelY = isMobileView ? height - PADDING.bottom + 14 : height - PADDING.bottom + 22

          ctx.fillStyle = '#000000'
          ctx.fillRect(mouseX - textWidth / 2 - 8, labelY - 13, textWidth + 16, 26)

          ctx.fillStyle = '#ff6600'
          ctx.fillText(dateText, mouseX, labelY)
        }

        // Draw Y-axis tooltip (percentage)
        const percentText = `${percentage.toFixed(2)}%`
        ctx.font = '900 17px "JetBrains Mono", monospace'
        ctx.textAlign = 'right'
        ctx.textBaseline = 'middle'
        const percentWidth = ctx.measureText(percentText).width

        ctx.fillStyle = '#000000'
        ctx.fillRect(PADDING.left - percentWidth - 24, mouseY - 11, percentWidth + 18, 22)

        ctx.fillStyle = '#ff6600'
        ctx.fillText(percentText, PADDING.left - 6, mouseY)
      }
    }
  }

  return (
    <div
      className="almanac-daily-chart"
      style={isMobileView
        ? { display: 'flex', flexDirection: 'column', height: 'calc(100dvh - 136px)', overflow: 'hidden', padding: 0, minHeight: 0 }
        : { position: 'relative', overflow: 'visible' }
      }
    >
      <div
        className="chart-header-row"
        style={{ position: 'relative', zIndex: 5000, overflow: 'visible', flexShrink: 0 }}
      >
        {/* Mobile Controls — rendered only when isMobileView to bypass almanac.css display:none */}
        {isMobileView && (
          <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
            <AlmanacMobileControls
              selectedMonth={selectedMonth}
              setSelectedMonth={setSelectedMonth}
              onMonthChange={onMonthChange}
              activeView={activeView}
              setActiveView={setActiveView}
              showMaxYears={showMaxYears}
              show15Y={show15Y}
              show10Y={show10Y}
              showElection={showElection}
              setShowMaxYears={setShowMaxYears}
              setShow15Y={setShow15Y}
              setShow10Y={setShow10Y}
              setShowElection={setShowElection}
              selectedEvent={selectedEvent}
              setSelectedEvent={setSelectedEvent}
              setShowEventPerformance={setShowEventPerformance}
              setEventPerformanceData={setEventPerformanceData}
              calculateEventPerformance={calculateEventPerformance}
              selectedPattern={selectedPattern}
              setSelectedPattern={setSelectedPattern}
              setShowPatternPerformance={setShowPatternPerformance}
              setShowEventPerformanceForPattern={setShowEventPerformance}
              setPatternPerformanceData={setPatternPerformanceData}
              calculatePatternPerformance={calculatePatternPerformance}
              symbol={symbol}
            />
          </div>
        )}

        {/* Desktop: Tabs + Controls */}
        {!isMobileView && activeView === 'chart' && <div
          className="chart-controls-row chart-controls-desktop desktop-only-btn"
          data-active-view={activeView}
          style={{ display: 'flex', flexDirection: 'column', background: '#000000', borderBottom: '1px solid #1a1a1a' }}
        >
          <style>{`
            @keyframes alm-spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
            @keyframes alm-pulse { 0%,100% { opacity:1; transform:scale(1) } 50% { opacity:0.6; transform:scale(0.85) } }
            @keyframes alm-orbit { 0% { transform: rotate(0deg) translateX(4px) rotate(0deg) } 100% { transform: rotate(360deg) translateX(4px) rotate(-360deg) } }
            .alm-icon-spin { display:inline-block; animation: alm-spin 3s linear infinite; line-height:1; }
            .alm-icon-pulse { display:inline-block; animation: alm-pulse 1.8s ease-in-out infinite; line-height:1; }
            .alm-versatility-label {
              display:inline-flex; align-items:center; gap:5px;
              font-size:9px; font-family:'JetBrains Mono',monospace; font-weight:900;
              letter-spacing:1.2px; color:#b8860b; white-space:nowrap; flex-shrink:0;
            }
            .alm-golden-sep {
              width:1px; height:28px; flex-shrink:0;
              background: linear-gradient(180deg, transparent 0%, #b8860b 25%, #ffd700 50%, #b8860b 75%, transparent 100%);
              box-shadow: 0 0 4px rgba(184,134,11,0.5);
            }
            .almanac-ctrl-select {
              box-sizing: border-box; padding: 0 28px 0 13px;
              height: 47px; min-height: 47px; max-height: 47px;
              min-width: 0; width: fit-content; max-width: none;
              background:
                url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23888'/%3E%3C/svg%3E") no-repeat right 10px center,
                linear-gradient(180deg,#181818 0%,#060606 50%,#020202 100%);
              color: #ffffff; border: 1px solid rgba(255,255,255,0.18); border-radius: 6px;
              font-size: 13px; font-family: 'JetBrains Mono','Roboto Mono',monospace;
              font-weight: 800; letter-spacing: 0.5px; cursor: pointer; outline: none;
              appearance: none; -webkit-appearance: none; white-space: nowrap; line-height: 1;
              overflow: hidden; text-overflow: ellipsis;
              box-shadow: 0 1px 0 rgba(255,255,255,0.10) inset, 0 -1px 0 rgba(0,0,0,0.7) inset, 0 3px 8px rgba(0,0,0,0.9);
            }
            .almanac-ctrl-select:hover { border-color: rgba(255,255,255,0.32); }
            .almanac-ctrl-select.has-value {
              border-color: rgba(255,102,0,0.7); color: #ff6600;
              background:
                url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23ff6600'/%3E%3C/svg%3E") no-repeat right 10px center,
                linear-gradient(180deg,#1e1000 0%,#0f0800 50%,#0a0500 100%);
            }
            .almanac-ctrl-divider { width:1px; height:20px; background:rgba(255,255,255,0.12); flex-shrink:0; }
            .almanac-ctrl-select option { background:#111; color:#fff; font-family:'JetBrains Mono',monospace; font-weight:700; font-size:10px; }
            .almanac-ctrl-select optgroup { background:#0a0a0a; color:#666; font-family:'JetBrains Mono',monospace; font-weight:700; font-size:9px; }
          `}</style>

          {/* Single controls row — only when chart view */}
          {activeView === 'chart' && (() => {
            const base: React.CSSProperties = {
              boxSizing: 'border-box',
              height: '47px', minHeight: '47px', maxHeight: '47px', padding: '0 16px',
              background: 'linear-gradient(180deg,#2a2a2a 0%,#141414 40%,#060606 70%,#020202 100%)',
              border: '1px solid rgba(255,255,255,0.22)', borderRadius: '8px',
              fontSize: '19px', fontFamily: '"JetBrains Mono","Roboto Mono",monospace',
              fontWeight: 800, letterSpacing: '0.5px', cursor: 'pointer', lineHeight: '1',
              whiteSpace: 'nowrap', outline: 'none', display: 'inline-flex',
              alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              boxShadow: '0 2px 0 rgba(255,255,255,0.14) inset,0 -2px 0 rgba(0,0,0,0.8) inset,0 1px 0 rgba(255,255,255,0.08) inset,0 6px 16px rgba(0,0,0,0.9),0 2px 4px rgba(0,0,0,0.7)',
              transition: 'all 0.12s ease',
            }
            const sweetInactive: React.CSSProperties = { ...base, color: '#00e535', WebkitTextFillColor: '#00e535' }
            const sweetActive: React.CSSProperties = { ...base, color: '#00ff41', WebkitTextFillColor: '#00ff41', border: '1px solid rgba(0,255,65,0.75)', background: 'linear-gradient(180deg,#001a08 0%,#000f04 50%,#000802 100%)', boxShadow: '0 2px 0 rgba(255,255,255,0.08) inset,0 -2px 0 rgba(0,0,0,0.8) inset,0 0 14px rgba(0,255,65,0.35),0 6px 16px rgba(0,0,0,0.9)' }
            const painInactive: React.CSSProperties = { ...base, color: '#ff3232', WebkitTextFillColor: '#ff3232' }
            const painActive: React.CSSProperties = { ...base, color: '#ff2222', WebkitTextFillColor: '#ff2222', border: '1px solid rgba(255,50,50,0.75)', background: 'linear-gradient(180deg,#1a0000 0%,#0f0000 50%,#080000 100%)', boxShadow: '0 2px 0 rgba(255,255,255,0.08) inset,0 -2px 0 rgba(0,0,0,0.8) inset,0 0 14px rgba(255,50,50,0.35),0 6px 16px rgba(0,0,0,0.9)' }
            const inactiveWhite: React.CSSProperties = { ...base, color: '#ffffff', WebkitTextFillColor: '#ffffff' }
            const cyanActive: React.CSSProperties = { ...base, color: '#00CED1', WebkitTextFillColor: '#00CED1', border: '1px solid rgba(0,206,209,0.75)', background: 'linear-gradient(180deg,#001a1a 0%,#000f0f 50%,#000808 100%)', boxShadow: '0 2px 0 rgba(255,255,255,0.08) inset,0 -2px 0 rgba(0,0,0,0.8) inset,0 0 14px rgba(0,206,209,0.3),0 6px 16px rgba(0,0,0,0.9)' }
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px', flexWrap: 'nowrap', overflowX: 'auto', minHeight: '44px' }}>

                {/* VERSATILITY label + dropdown — always visible */}
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                  <span className="alm-versatility-label">
                    <svg className="alm-icon-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ffd700" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="3" /><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
                    </svg>
                    VERSATILITY
                  </span>
                  <select value={activeView} onChange={(e) => setActiveView(e.target.value as 'chart' | 'calendar' | 'table')} className={`almanac-ctrl-select${activeView !== 'chart' ? ' has-value' : ''}`} style={{ maxWidth: '185px', border: '1px solid #ff6600', borderBottom: '3px solid #cc4400', background: 'linear-gradient(180deg,#1e0e00 0%,#120800 40%,#090400 70%,#040200 100%)', color: '#ff6600', WebkitTextFillColor: '#ff6600', boxShadow: '0 2px 0 rgba(255,120,0,0.18) inset,0 -3px 0 rgba(0,0,0,0.9) inset,0 0 12px rgba(255,102,0,0.25),0 6px 18px rgba(0,0,0,0.95),2px 0 0 rgba(255,80,0,0.15),-2px 0 0 rgba(255,80,0,0.15)' }}>
                    <option value="chart">CHART VIEW</option>
                    <option value="calendar">SEASONAL CALENDAR</option>
                    <option value="table">SEASONAL TABLE</option>
                  </select>
                </div>

                {/* Golden separator */}
                <div className="alm-golden-sep" />

                {/* Chart-view-only controls */}
                {activeView === 'chart' && (<>
                  <select value={selectedMonth} onChange={(e) => { const m = parseInt(e.target.value); setSelectedMonth(m); onMonthChange?.(m) }} className="almanac-ctrl-select" style={{ maxWidth: '105px' }}>
                    {MONTH_NAMES.map((name, i) => <option key={i} value={i}>{name}</option>)}
                  </select>
                  <div className="almanac-ctrl-divider" />
                  {/* Candlenality / Sweet Spot / Pain Point */}
                  <button onClick={() => setCandlenalityMode((v) => !v)} style={candlenalityMode ? cyanActive : inactiveWhite}>
                    <svg style={{ marginRight: '5px', flexShrink: 0 }} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <line x1="4" y1="3" x2="4" y2="5" /><rect x="2" y="5" width="4" height="9" rx="0.5" /><line x1="4" y1="14" x2="4" y2="17" />
                      <line x1="12" y1="2" x2="12" y2="4" /><rect x="10" y="4" width="4" height="11" rx="0.5" fill="currentColor" fillOpacity="0.3" /><line x1="12" y1="15" x2="12" y2="18" />
                      <line x1="20" y1="5" x2="20" y2="7" /><rect x="18" y="7" width="4" height="8" rx="0.5" /><line x1="20" y1="15" x2="20" y2="19" />
                    </svg>
                    CANDLENALITY
                  </button>
                  <button onClick={() => setShowSweetSpot((v) => !v)} style={showSweetSpot ? sweetActive : sweetInactive}>
                    <svg className="alm-icon-pulse" style={{ marginRight: '5px' }} width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" /></svg>
                    SWEET SPOT
                  </button>
                  <button onClick={() => setShowPainPoint((v) => !v)} style={showPainPoint ? painActive : painInactive}>
                    <svg className="alm-icon-pulse" style={{ marginRight: '5px' }} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" /></svg>
                    PAIN POINT
                  </button>
                  <div className="almanac-ctrl-divider" />
                  {/* Market Events */}
                  <select value={selectedEvent || ''} onChange={(e) => { const v = e.target.value; if (v) { setSelectedEvent(v); setShowEventPerformance(true); calculateEventPerformance(v) } else { setSelectedEvent(null); setShowEventPerformance(false); setEventPerformanceData([]) } }} className={`almanac-ctrl-select${selectedEvent ? ' has-value' : ''}`} style={{ maxWidth: '135px' }}>
                    <option value="">MKT EVENTS</option>
                    <optgroup label="HOLIDAYS">
                      <option value="thanksgiving">THANKSGIVING</option>
                      <option value="christmas">CHRISTMAS</option>
                      <option value="newyear">NEW YEAR</option>
                      <option value="presidentsday">PRESIDENTS DAY</option>
                      <option value="mlkday">MLK DAY</option>
                      <option value="memorialday">MEMORIAL DAY</option>
                      <option value="july4th">JULY 4TH</option>
                      <option value="laborday">LABOR DAY</option>
                    </optgroup>
                    <optgroup label="FOMC MEETINGS">
                      <option value="fomc-march">FOMC MARCH</option>
                      <option value="fomc-june">FOMC JUNE</option>
                      <option value="fomc-september">FOMC SEPT</option>
                      <option value="fomc-december">FOMC DEC</option>
                    </optgroup>
                    <optgroup label="QUAD WITCHING">
                      <option value="quad-witching-mar">QW MAR</option>
                      <option value="quad-witching-jun">QW JUN</option>
                      <option value="quad-witching-sep">QW SEP</option>
                      <option value="quad-witching-dec">QW DEC</option>
                    </optgroup>
                    <optgroup label="EARNINGS & RALLIES">
                      <option value="q1-earnings">Q1 EARNINGS</option>
                      <option value="q2-earnings">Q2 EARNINGS</option>
                      <option value="q3-earnings">Q3 EARNINGS</option>
                      <option value="q4-earnings">Q4 EARNINGS</option>
                      <option value="yearendrally">YEAR END RALLY</option>
                      <option value="halloweenrally">HALLOWEEN RALLY</option>
                      <option value="santarally">SANTA RALLY</option>
                      <option value="monthlyopex">MONTHLY OPEX</option>
                    </optgroup>
                  </select>
                  {/* Market Patterns */}
                  <select value={selectedPattern || ''} onChange={(e) => { const pv = e.target.value; if (pv) { const pl = e.target.selectedOptions[0].text; setSelectedPattern(pl); setShowPatternPerformance(true); setShowEventPerformance(false); setPatternPerformanceData([]); const bothMap: Record<string, [string, string, string, string]> = { '52week-high-both': ['52week-high-cooldown', '52W High (90d Cooldown)', '52week-high-annual', '52W High (Annual)'], '52week-low-both': ['52week-low-cooldown', '52W Low (90d Cooldown)', '52week-low-annual', '52W Low (Annual)'], 'move-8-11-up-both': ['move-8-11-up-cooldown', '8-11% UP (90d Cooldown)', 'move-8-11-up-annual', '8-11% UP (Annual)'], 'move-8-11-down-both': ['move-8-11-down-cooldown', '8-11% DOWN (90d Cooldown)', 'move-8-11-down-annual', '8-11% DOWN (Annual)'], 'move-18-22-up-both': ['move-18-22-up-cooldown', '18-22% UP (90d Cooldown)', 'move-18-22-up-annual', '18-22% UP (Annual)'], 'move-18-22-down-both': ['move-18-22-down-cooldown', '18-22% DOWN (90d Cooldown)', 'move-18-22-down-annual', '18-22% DOWN (Annual)'] }; if (bothMap[pv]) { const [i1, l1, i2, l2] = bothMap[pv]; calculatePatternPerformance(i1, l1, symbol); calculatePatternPerformance(i2, l2, symbol) } else { calculatePatternPerformance(pv, pl, symbol) } } else { setSelectedPattern(null); setShowPatternPerformance(false); setPatternPerformanceData([]) } }} className={`almanac-ctrl-select${selectedPattern ? ' has-value' : ''}`} style={{ maxWidth: '195px' }}>
                    <option value="">MARKET PATTERNS</option>
                    <optgroup label="52-WEEK BREAKOUTS">
                      <option value="52week-high-both">52W High (BOTH)</option>
                      <option value="52week-high-cooldown">52W High (90d Cooldown)</option>
                      <option value="52week-high-annual">52W High (Annual)</option>
                      <option value="52week-low-both">52W Low (BOTH)</option>
                      <option value="52week-low-cooldown">52W Low (90d Cooldown)</option>
                      <option value="52week-low-annual">52W Low (Annual)</option>
                    </optgroup>
                    <optgroup label="8-11% MOVES">
                      <option value="move-8-11-up-both">8-11% UP (BOTH)</option>
                      <option value="move-8-11-up-cooldown">8-11% UP (90d Cooldown)</option>
                      <option value="move-8-11-up-annual">8-11% UP (Annual)</option>
                      <option value="move-8-11-down-both">8-11% DOWN (BOTH)</option>
                      <option value="move-8-11-down-cooldown">8-11% DOWN (90d Cooldown)</option>
                      <option value="move-8-11-down-annual">8-11% DOWN (Annual)</option>
                    </optgroup>
                    <optgroup label="18-22% MOVES">
                      <option value="move-18-22-up-both">18-22% UP (BOTH)</option>
                      <option value="move-18-22-up-cooldown">18-22% UP (90d Cooldown)</option>
                      <option value="move-18-22-up-annual">18-22% UP (Annual)</option>
                      <option value="move-18-22-down-both">18-22% DOWN (BOTH)</option>
                      <option value="move-18-22-down-cooldown">18-22% DOWN (90d Cooldown)</option>
                      <option value="move-18-22-down-annual">18-22% DOWN (Annual)</option>
                    </optgroup>
                  </select>
                </>)}
              </div>
            )
          })()}
        </div>}
      </div>

      <div className="chart-container" ref={containerRef}
        style={isMobileView ? { flex: 1, minHeight: 0, height: undefined, position: 'relative' } : { position: 'relative' }}>

        {/* Legend — top-center overlay */}
        {activeView === 'chart' && !isMobileView && (
          <div style={{
            position: 'absolute',
            top: '10px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '11px',
            fontFamily: '"JetBrains Mono", monospace',
            fontWeight: 700,
            pointerEvents: 'auto',
          }}>
            {isIndex ? (
              [
                { label: 'DIA', color: '#FFFFFF' },
                { label: 'SPY', color: '#00C853' },
                { label: 'QQQ', color: '#2196F3' },
                { label: 'IWM', color: '#FF5722' },
              ].map(({ label, color }) => (
                <div key={label} style={{
                  display: 'flex', alignItems: 'center', gap: '5px',
                  background: 'rgba(8,8,8,0.75)', backdropFilter: 'blur(10px)',
                  border: `1px solid ${color}44`, borderRadius: '6px', padding: '3px 8px'
                }}>
                  <div style={{ width: '16px', height: '2px', backgroundColor: color, borderRadius: '1px' }} />
                  <span style={{ color }}>{label}</span>
                </div>
              ))
            ) : (
              [{ key: 'max', label: '25Y', color: '#FFFFFF', active: showMaxYears, toggle: () => setShowMaxYears((v) => !v) },
              { key: '15y', label: '15Y', color: '#00BCD4', active: show15Y, toggle: () => setShow15Y((v) => !v) },
              { key: '10y', label: '10Y', color: '#FF6600', active: show10Y, toggle: () => setShow10Y((v) => !v) },
              { key: 'elec', label: 'Election', color: '#FFD700', active: showElection, toggle: () => setShowElection((v) => !v) },
              ].map(({ key, label, color, active, toggle }) => (
                <button key={key} onClick={toggle} style={{
                  display: 'flex', alignItems: 'center', gap: '5px',
                  background: active ? 'rgba(8,8,8,0.80)' : 'rgba(8,8,8,0.50)',
                  backdropFilter: 'blur(10px)',
                  border: `1px solid ${active ? color + '88' : 'rgba(255,255,255,0.10)'}`,
                  borderRadius: '6px', padding: '3px 8px',
                  cursor: 'pointer', opacity: active ? 1 : 0.35, transition: 'all 0.15s',
                  fontFamily: '"JetBrains Mono", monospace', fontSize: '11px', fontWeight: 700,
                }}>
                  {key === 'elec'
                    ? <div style={{ width: '18px', height: '2px', background: `repeating-linear-gradient(90deg,${color} 0px,${color} 5px,transparent 5px,transparent 9px)`, borderRadius: '1px' }} />
                    : <div style={{ width: '16px', height: '2px', backgroundColor: color, borderRadius: '1px' }} />
                  }
                  <span style={{ color }}>{label}</span>
                </button>
              ))
            )}
          </div>
        )}

        {loading && (
          <div className="chart-loading">
            <div className="loading-spinner"></div>
            <p>Loading {MONTH_NAMES[selectedMonth]} seasonal data...</p>
          </div>
        )}

        {error && (
          <div className="chart-error">
            <p>{error}</p>
            <button onClick={loadData}>Retry</button>
          </div>
        )}

        {activeView === 'chart' && <canvas ref={canvasRef} />}
        {activeView === 'calendar' && (
          <div
            style={{
              width: '100%',
              overflow: 'auto',
              padding: '0',
            }}
          >
            <style>{`
              .almanac-daily-chart .calendar-grid {
                display: block !important;
                border: 2px solid #ffffff !important;
                background: #000000 !important;
              }
              .almanac-daily-chart .calendar-header-row {
                display: grid !important;
                grid-template-columns: repeat(5, 1fr) !important;
                background: #000000 !important;
                border-bottom: 2px solid #ffffff !important;
              }
              .almanac-daily-chart .calendar-days {
                display: grid !important;
                grid-template-columns: repeat(5, 1fr) !important;
              }
              .almanac-daily-chart .day-header {
                padding: 12px 8px !important;
                text-align: center !important;
                font-weight: 700 !important;
                font-size: 20px !important;
                color: #ffffff !important;
                background: linear-gradient(180deg, #1a1a1a 0%, #000000 50%, #0a0a0a 100%) !important;
                border-right: 1px solid #333333 !important;
                text-transform: uppercase !important;
                letter-spacing: 1px !important;
                box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1), inset 0 -1px 0 rgba(0, 0, 0, 0.5), 0 2px 4px rgba(0, 0, 0, 0.3) !important;
                text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8), 0 -1px 0 rgba(255, 255, 255, 0.1) !important;
              }
              .almanac-daily-chart .day-header:last-child {
                border-right: none !important;
              }
              .almanac-daily-chart .calendar-day {
                min-height: 120px !important;
                border-right: 1px solid #333333 !important;
                border-bottom: 1px solid #333333 !important;
                padding: 8px !important;
                background: #000000 !important;
                position: relative !important;
                display: flex !important;
                flex-direction: column !important;
                gap: 4px !important;
              }
              .almanac-daily-chart .calendar-day:nth-child(5n) {
                border-right: none !important;
              }
              .almanac-daily-chart .calendar-day.other-month {
                background: #050505 !important;
                opacity: 0.3 !important;
              }
              .almanac-daily-chart .calendar-day.holiday {
                background: #0f0a0a !important;
              }
              .almanac-daily-chart .calendar-day.bullish-day {
                background: linear-gradient(135deg, rgba(0, 255, 0, 0.03) 0%, #000000 100%) !important;
                border-left: 2px solid rgba(0, 255, 0, 0.4) !important;
              }
              .almanac-daily-chart .calendar-day.bearish-day {
                background: linear-gradient(135deg, rgba(255, 0, 0, 0.03) 0%, #000000 100%) !important;
                border-left: 2px solid rgba(255, 0, 0, 0.4) !important;
              }
            `}</style>
            <AlmanacCalendar
              month={selectedMonth}
              year={new Date().getFullYear()}
              symbol={symbol}
              onBack={() => setActiveView('chart')}
            />
          </div>
        )}
        {activeView === 'table' && (
          <div style={{ padding: '0', margin: '0' }}>
            <WeeklyScanTable onBack={() => setActiveView('chart')} />
          </div>
        )}
      </div>

      {/* Pattern Details Popup */}
      {showPatternDetails && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
          }}
          onClick={() => setShowPatternDetails(false)}
        >
          <div
            style={{
              background: 'linear-gradient(180deg, #000000 0%, #0a1520 100%)',
              border: '2px solid #1a2332',
              borderRadius: '0',
              padding: '0',
              minWidth: '500px',
              maxWidth: '650px',
              maxHeight: '85vh',
              overflowY: 'auto',
              boxShadow: '0 0 40px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Bar */}
            <div
              style={{
                background: 'linear-gradient(180deg, #0f1922 0%, #060a0f 100%)',
                padding: '16px 24px',
                borderBottom: '1px solid #1a2332',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                boxShadow: '0 2px 10px rgba(0, 0, 0, 0.5)',
              }}
            >
              <h3
                style={{
                  color: '#FF6600',
                  margin: 0,
                  fontSize: '16px',
                  fontFamily: '"JetBrains Mono", monospace',
                  fontWeight: 'bold',
                  letterSpacing: '1px',
                  textTransform: 'uppercase',
                  textShadow: '0 0 10px rgba(255, 102, 0, 0.3)',
                }}
              >
                ◢ Pattern Analysis Details
              </h3>
              <button
                onClick={() => setShowPatternDetails(false)}
                style={{
                  background: 'transparent',
                  border: '1px solid #3a4a5a',
                  color: '#88a8c8',
                  padding: '4px 12px',
                  cursor: 'pointer',
                  fontFamily: '"JetBrains Mono", monospace',
                  fontSize: '12px',
                  fontWeight: 'bold',
                }}
              >
                ✕
              </button>
            </div>

            {/* Content */}
            <div style={{ padding: '24px' }}>
              <div
                style={{
                  color: '#FFFFFF',
                  fontSize: '13px',
                  fontFamily: '"JetBrains Mono", monospace',
                  lineHeight: '1.8',
                }}
              >
                {patternPerformanceData.map((patternSet, idx) => (
                  <div key={idx} style={{ marginBottom: '24px' }}>
                    {/* Pattern Header - Single Row */}
                    <div
                      style={{
                        background: 'linear-gradient(135deg, #0a1520 0%, #0f1f30 100%)',
                        border: '1px solid #1a2f42',
                        borderLeft: `4px solid ${patternSet.color}`,
                        padding: '14px 20px',
                        marginBottom: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.5)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          flexWrap: 'wrap',
                        }}
                      >
                        <span
                          style={{
                            color: '#FF6600',
                            fontWeight: 'bold',
                            fontSize: '13px',
                            opacity: 1,
                          }}
                        >
                          Symbol:
                        </span>
                        <span
                          style={{
                            color: '#FF6600',
                            fontWeight: 'bold',
                            fontSize: '14px',
                            opacity: 1,
                          }}
                        >
                          {symbol}
                        </span>
                        <span
                          style={{
                            color: '#FFFFFF',
                            fontSize: '13px',
                            opacity: 1,
                            marginLeft: '8px',
                          }}
                        >
                          <span style={{ color: patternSet.color }}>●</span>{' '}
                          {patternSet.patternName}
                        </span>
                        <span
                          style={{
                            background: 'rgba(10, 31, 48, 0.8)',
                            border: '1px solid #2a4a6a',
                            padding: '3px 10px',
                            fontSize: '11px',
                            color: '#88a8c8',
                            fontWeight: 'bold',
                            letterSpacing: '0.5px',
                            opacity: 1,
                            marginLeft: '8px',
                          }}
                        >
                          {patternSet.occurrences} OCCURRENCES
                        </span>
                      </div>
                    </div>

                    {/* Occurrence Details Table */}
                    {(patternSet.occurrenceDetails || []).length > 0 && (
                      <div
                        style={{
                          background: '#000000',
                          border: '1px solid #1a2f42',
                          borderRadius: '0',
                          overflow: 'hidden',
                          boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.6)',
                        }}
                      >
                        <table
                          style={{
                            width: '100%',
                            borderCollapse: 'collapse',
                            fontSize: '12px',
                            tableLayout: 'fixed',
                          }}
                        >
                          <thead
                            style={{
                              background: 'linear-gradient(180deg, #0a1520 0%, #060d15 100%)',
                              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.5)',
                              display: 'table',
                              width: '100%',
                              tableLayout: 'fixed',
                            }}
                          >
                            <tr>
                              <th
                                style={{
                                  padding: '12px 16px',
                                  textAlign: 'left',
                                  color: '#FF6600',
                                  fontWeight: 'bold',
                                  fontSize: '11px',
                                  letterSpacing: '1.2px',
                                  borderBottom: '1px solid #2a4a6a',
                                  textTransform: 'uppercase',
                                  opacity: 1,
                                  width: '40%',
                                }}
                              >
                                Date
                              </th>
                              <th
                                style={{
                                  padding: '12px 16px',
                                  textAlign: 'right',
                                  color: '#FF6600',
                                  fontWeight: 'bold',
                                  fontSize: '11px',
                                  letterSpacing: '1.2px',
                                  borderBottom: '1px solid #2a4a6a',
                                  textTransform: 'uppercase',
                                  opacity: 1,
                                  width: '30%',
                                }}
                              >
                                Price
                              </th>
                              <th
                                style={{
                                  padding: '12px 16px',
                                  textAlign: 'right',
                                  color: '#FF6600',
                                  fontWeight: 'bold',
                                  fontSize: '11px',
                                  letterSpacing: '1.2px',
                                  borderBottom: '1px solid #2a4a6a',
                                  textTransform: 'uppercase',
                                  opacity: 1,
                                  width: '30%',
                                }}
                              >
                                Change %
                              </th>
                            </tr>
                          </thead>
                          <tbody
                            style={{
                              maxHeight: '300px',
                              overflowY: 'auto',
                              display: 'block',
                            }}
                          >
                            {(patternSet.occurrenceDetails || []).map((occ, i) => (
                              <tr
                                key={i}
                                style={{
                                  borderBottom: '1px solid #0a1520',
                                  display: 'table',
                                  width: '100%',
                                  tableLayout: 'fixed',
                                  transition: 'background 0.2s',
                                  background: i % 2 === 0 ? '#050a10' : 'transparent',
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = 'rgba(10, 31, 48, 0.4)'
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background =
                                    i % 2 === 0 ? '#050a10' : 'transparent'
                                }}
                              >
                                <td
                                  style={{
                                    padding: '10px 16px',
                                    color: '#FFFFFF',
                                    opacity: 1,
                                    fontFamily: '"JetBrains Mono", monospace',
                                    fontSize: '12px',
                                    width: '40%',
                                    textAlign: 'left',
                                  }}
                                >
                                  {occ.date.toLocaleDateString('en-US', {
                                    year: 'numeric',
                                    month: 'short',
                                    day: '2-digit',
                                  })}
                                </td>
                                <td
                                  style={{
                                    padding: '10px 16px',
                                    textAlign: 'right',
                                    color: '#FFFFFF',
                                    opacity: 1,
                                    fontFamily: '"JetBrains Mono", monospace',
                                    fontSize: '12px',
                                    fontWeight: 'bold',
                                    width: '30%',
                                  }}
                                >
                                  ${occ.priceAtEvent.toFixed(2)}
                                </td>
                                <td
                                  style={{
                                    padding: '10px 16px',
                                    textAlign: 'right',
                                    color:
                                      occ.changePercent && occ.changePercent > 0
                                        ? '#00FF41'
                                        : '#FF4444',
                                    opacity: 1,
                                    fontFamily: '"JetBrains Mono", monospace',
                                    fontSize: '12px',
                                    fontWeight: 'bold',
                                    textShadow:
                                      occ.changePercent && occ.changePercent > 0
                                        ? '0 0 8px rgba(0, 255, 65, 0.5)'
                                        : '0 0 8px rgba(255, 68, 68, 0.5)',
                                    width: '30%',
                                  }}
                                >
                                  {occ.changePercent
                                    ? `${occ.changePercent > 0 ? '+' : ''}${occ.changePercent.toFixed(2)}%`
                                    : 'N/A'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Footer Close Button */}
            <div
              style={{
                padding: '16px 24px',
                borderTop: '1px solid #1a2f42',
                background: 'linear-gradient(180deg, #060d15 0%, #000000 100%)',
              }}
            >
              <button
                onClick={() => setShowPatternDetails(false)}
                style={{
                  padding: '12px 24px',
                  background: 'linear-gradient(180deg, #0f1f30 0%, #0a1520 100%)',
                  color: '#88a8c8',
                  border: '1px solid #2a4a6a',
                  borderRadius: '0',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontFamily: '"JetBrains Mono", monospace',
                  fontSize: '12px',
                  width: '100%',
                  letterSpacing: '1px',
                  textTransform: 'uppercase',
                  opacity: 1,
                  transition: 'all 0.2s',
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.5)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background =
                    'linear-gradient(180deg, #1a3a5a 0%, #0f2540 100%)'
                  e.currentTarget.style.borderColor = '#4a6a8a'
                  e.currentTarget.style.color = '#a8c8e8'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background =
                    'linear-gradient(180deg, #0f1f30 0%, #0a1520 100%)'
                  e.currentTarget.style.borderColor = '#2a4a6a'
                  e.currentTarget.style.color = '#88a8c8'
                }}
              >
                ◢ Close Terminal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AlmanacDailyChart
