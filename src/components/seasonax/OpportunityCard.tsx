import React, { useCallback, useEffect, useRef, useState } from 'react'

import { SeasonalPattern } from '@/lib/polygonService'

import SeasonalLineChartModal from './SeasonalLineChartModal'

// ── Types for premium 70%+ win rate add-ons ───────────────────────────────────
interface AttractionInfo {
  currentPrice: number
  attractionLevel: number
  callWall: number | null
  putWall: number | null
  dealerBias: 'bull' | 'bear' | null
}

interface MiniChartState {
  yearLines: Array<{
    color: string
    points: Array<{ x: number; pct: number }>
    year: number
    totalPct: number
  }>
  avgLine: Array<{ x: number; pct: number }>
  minPct: number
  maxPct: number
  maxDays: number
}

// ── Canvas-based mini seasonal chart (almanac-style, crispy, zoom+drag) ──────
const MiniSeasonalChart: React.FC<{ data: MiniChartState; isPositive: boolean }> = ({
  data,
  isPositive,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [zoomLevel, setZoomLevel] = useState(1)
  const [panOffset, setPanOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState<{ x: number; offset: number } | null>(null)
  const avgColor = isPositive ? '#00FF88' : '#FF4444'

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container || data.avgLine.length === 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rect = container.getBoundingClientRect()
    const width = Math.max(rect.width, 200)
    const height = Math.max(rect.height, 100)
    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    ctx.scale(dpr, dpr)

    const PAD = { top: 22, right: 12, bottom: 36, left: 56 }
    const cw = width - PAD.left - PAD.right
    const ch = height - PAD.top - PAD.bottom

    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, width, height)

    const { avgLine, maxDays } = data
    const chartCenter = 0.5

    // Visible index range based on zoom/pan
    const visStart =
      zoomLevel === 1
        ? 0
        : Math.max(
          0,
          Math.floor(((0 - panOffset - chartCenter) / zoomLevel + chartCenter) * (maxDays - 1))
        )
    const visEnd =
      zoomLevel === 1
        ? maxDays - 1
        : Math.min(
          maxDays - 1,
          Math.ceil(((1 - panOffset - chartCenter) / zoomLevel + chartCenter) * (maxDays - 1))
        )
    const visPts = avgLine.filter((p) => p.x >= visStart && p.x <= visEnd)
    const rawMin = visPts.length > 0 ? Math.min(...visPts.map((p) => p.pct)) : data.minPct
    const rawMax = visPts.length > 0 ? Math.max(...visPts.map((p) => p.pct)) : data.maxPct
    const rng = rawMax - rawMin || 1
    const padV = rng * 0.1
    const yMin = rawMin - padV
    const yMax = rawMax + padV
    const yRng = yMax - yMin

    const getX = (dayIdx: number) => {
      const baseX = dayIdx / Math.max(maxDays - 1, 1)
      const zoomedX = chartCenter + (baseX - chartCenter) * zoomLevel + panOffset
      return PAD.left + zoomedX * cw
    }
    const getY = (pct: number) => PAD.top + ch * ((yMax - pct) / yRng)
    const zeroY = getY(0)

    // ── Y-axis grid + labels (bold white, JetBrains Mono)
    ctx.font = 'bold 13px "JetBrains Mono", "Courier New", monospace'
    ctx.textAlign = 'right'
    const numH = 6
    for (let i = 0; i <= numH; i++) {
      const val = yMax - (yRng / numH) * i
      const y = getY(val)
      ctx.fillStyle = '#FFFFFF'
      ctx.fillText(`${val >= 0 ? '+' : ''}${val.toFixed(1)}%`, PAD.left - 6, y + 4)
    }

    // ── Clip to chart area
    ctx.save()
    ctx.beginPath()
    ctx.rect(PAD.left, PAD.top, cw, ch)
    ctx.clip()

    const clampZeroY = Math.min(PAD.top + ch, Math.max(PAD.top, zeroY))

    // Green fill (above zero)
    if (avgLine.length > 0) {
      ctx.beginPath()
      ctx.moveTo(getX(avgLine[0].x), clampZeroY)
      avgLine.forEach((p) => ctx.lineTo(getX(p.x), getY(Math.max(p.pct, 0))))
      ctx.lineTo(getX(avgLine[avgLine.length - 1].x), clampZeroY)
      ctx.closePath()
      ctx.fillStyle = 'rgba(0, 180, 70, 0.38)'
      ctx.fill()
    }

    // Red fill (below zero)
    if (yMin < 0 && avgLine.length > 0) {
      ctx.beginPath()
      ctx.moveTo(getX(avgLine[0].x), clampZeroY)
      avgLine.forEach((p) => ctx.lineTo(getX(p.x), getY(Math.min(p.pct, 0))))
      ctx.lineTo(getX(avgLine[avgLine.length - 1].x), clampZeroY)
      ctx.closePath()
      ctx.fillStyle = 'rgba(180, 0, 0, 0.42)'
      ctx.fill()
    }

    // Avg line
    ctx.strokeStyle = avgColor
    ctx.lineWidth = 2.5
    ctx.shadowColor = avgColor
    ctx.shadowBlur = 6
    ctx.beginPath()
    avgLine.forEach((p, i) => {
      const x = getX(p.x)
      const y = getY(p.pct)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.stroke()
    ctx.shadowBlur = 0

    ctx.restore()

    // ── X-axis day labels
    ctx.fillStyle = '#FFFFFF'
    ctx.font = 'bold 12px "JetBrains Mono", "Courier New", monospace'
    ctx.textAlign = 'center'
    const xTicks: number[] = [0]
    for (let d = 4; d < maxDays - 1; d += 5) xTicks.push(d)
    if (maxDays - 1 - xTicks[xTicks.length - 1] > 2) xTicks.push(maxDays - 1)
    xTicks.forEach((d) => {
      const x = getX(d)
      if (x >= PAD.left && x <= width - PAD.right)
        ctx.fillText(`${d + 1}`, x, height - PAD.bottom + 16)
    })

    // Border frame
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'
    ctx.lineWidth = 0.5
    ctx.strokeRect(PAD.left, PAD.top, cw, ch)
  }, [data, isPositive, zoomLevel, panOffset, avgColor])

  useEffect(() => {
    requestAnimationFrame(draw)
  }, [draw])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const ro = new ResizeObserver(() => requestAnimationFrame(draw))
    ro.observe(container)
    return () => ro.disconnect()
  }, [draw])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const newZoom = Math.max(1, Math.min(10, zoomLevel + -e.deltaY * 0.001))
      if (newZoom === 1) setPanOffset(0)
      setZoomLevel(newZoom)
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [zoomLevel])

  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    setIsDragging(true)
    setDragStart({ x: e.clientX - rect.left, offset: panOffset })
  }
  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging || !dragStart || !canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const maxPan = (zoomLevel - 1) * 0.5 + 0.1
    setPanOffset(
      Math.max(
        -maxPan,
        Math.min(maxPan, dragStart.offset + (e.clientX - rect.left - dragStart.x) / rect.width)
      )
    )
  }
  const onMouseUp = () => {
    setIsDragging(false)
    setDragStart(null)
  }
  const onMouseLeave = () => {
    setIsDragging(false)
    setDragStart(null)
  }

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
      <canvas
        ref={canvasRef}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
        style={{ display: 'block', cursor: isDragging ? 'grabbing' : 'grab' }}
      />
    </div>
  )
}

// AttractionLevelMap removed — replaced with plain number stats inline

interface SeasonalChartProps {
  data: Array<{ period: string; return: number }>
  height?: number
}

const SeasonalChart: React.FC<SeasonalChartProps> = ({ data, height = 40 }) => {
  // Add null/undefined check for data
  if (!data || !Array.isArray(data) || data.length === 0) {
    return null // Don't render anything if no data
  }

  const maxReturn = Math.max(...data.map((d) => Math.abs(d.return)))
  const barWidth = 100 / data.length

  return (
    <div className="seasonal-chart" style={{ height: `${height}px` }}>
      {data.map((item, index) => {
        const barHeight = Math.abs(item.return / maxReturn) * height * 0.8
        const isPositive = item.return >= 0

        return (
          <div
            key={index}
            className={`chart-bar ${isPositive ? 'positive' : 'negative'}`}
            style={{
              width: `${barWidth}%`,
              height: `${barHeight}px`,
              backgroundColor: isPositive ? '#00FF00' : '#FF0000',
              marginTop: isPositive ? `${height - barHeight}px` : `${height * 0.5}px`,
            }}
          />
        )
      })}
    </div>
  )
}

interface OpportunityCardProps {
  pattern: SeasonalPattern
  rank?: number
  isTopBullish?: boolean
  isTopBearish?: boolean
  years?: number
  sidebarMode?: boolean // Add flag for sidebar rendering
  seasonedQualifying?: number // Number of timeframes with 60%+ win rate (2, 3, or 4)
  hideBestBadge?: boolean // Hide the BEST badge (used in BEST mode where all cards are best)
}

const OpportunityCard: React.FC<OpportunityCardProps> = ({
  pattern,
  rank,
  isTopBullish,
  isTopBearish,
  years = 15,
  sidebarMode = false,
  seasonedQualifying,
  hideBestBadge = false,
}) => {
  const [showModal, setShowModal] = useState(false)
  const isPositive = (pattern.averageReturn || pattern.avgReturn || 0) >= 0
  const expectedReturn = pattern.averageReturn || pattern.avgReturn || 0
  const daysUntilStart = (pattern as any).daysUntilStart

  // ── Premium add-ons for 70%+ win rate ─────────────────────────────────────
  const isHighWinRate = pattern.winRate >= 70
  const [attractionInfo, setAttractionInfo] = useState<AttractionInfo | null>(null)
  const [attractionLoading, setAttractionLoading] = useState(false)
  const [miniChart, setMiniChart] = useState<MiniChartState | null>(null)
  const [miniChartLoading, setMiniChartLoading] = useState(false)
  const [perfData, setPerfData] = useState<{
    change13d: number
    change21d: number
    perf13d: { status: string; color: string }
    perf21d: { status: string; color: string }
  } | null>(null)

  // ── Trend sync: directional agreement between seasonal avg and most-recent year ──
  const trendSync = React.useMemo(() => {
    if (!miniChart || miniChart.yearLines.length === 0 || miniChart.avgLine.length < 5) return null
    const recent = miniChart.yearLines[0]
    if (!recent || recent.points.length < 4) return null
    const minLen = Math.min(recent.points.length, miniChart.avgLine.length)
    // Build per-step delta arrays
    const avgDeltas: number[] = []
    const actualDeltas: number[] = []
    for (let i = 1; i < minLen; i++) {
      avgDeltas.push(miniChart.avgLine[i].pct - miniChart.avgLine[i - 1].pct)
      actualDeltas.push(recent.points[i].pct - recent.points[i - 1].pct)
    }
    if (avgDeltas.length < 3) return null
    const wSize = Math.min(5, Math.max(2, Math.floor(avgDeltas.length / 3)))
    let agreements = 0, total = 0
    for (let i = wSize; i <= avgDeltas.length; i++) {
      const avgDir = avgDeltas.slice(i - wSize, i).reduce((a, b) => a + b, 0) >= 0
      const actDir = actualDeltas.slice(i - wSize, i).reduce((a, b) => a + b, 0) >= 0
      if (avgDir === actDir) agreements++
      total++
    }
    if (total === 0) return null
    const score = Math.round((agreements / total) * 100)
    const yr = `'${String(recent.year).slice(2)}`
    if (score >= 65) return { score, label: 'SYNCED', color: '#00FF88', yr }
    if (score >= 45) return { score, label: 'MIXED', color: '#FFD700', yr }
    return { score, label: 'DRIFT', color: '#FF4444', yr }
  }, [miniChart])
  const [optionsSetup, setOptionsSetup] = useState<{
    direction: string
    currentPrice: number
    expiryDate: string
    dte: number
    contractTicker: string
    strike: number
    iv: number
    bid: number
    ask: number
    mid: number
    target1Stock: number
    target2Stock: number
    stopLossStock: number
    target1Premium: number
    target2Premium: number
    stopLossPremium: number
  } | null>(null)
  const premiumFetchedRef = useRef(false)

  useEffect(() => {
    if (!isHighWinRate || premiumFetchedRef.current) return
    premiumFetchedRef.current = true

    // ── Fetch 45d GEX attraction zone ──────────────────────────────────────
    const fetchAttraction = async () => {
      setAttractionLoading(true)
      try {
        const resp = await fetch(
          `/api/gex-screener?symbols=${encodeURIComponent(pattern.symbol)}&expirationFilter=Default`
        )
        if (!resp.ok) throw new Error('fetch failed')
        const data = await resp.json()
        if (data.success && Array.isArray(data.data) && data.data.length > 0) {
          const item = data.data[0]
          const wall = item.largestWall
          setAttractionInfo({
            currentPrice: item.currentPrice,
            attractionLevel: item.attractionLevel,
            callWall: wall?.type === 'call' ? wall.strike : null,
            putWall: wall?.type === 'put' ? wall.strike : null,
            dealerBias: item.dealerSweat > 0 ? 'bull' : item.dealerSweat < 0 ? 'bear' : null,
          })
        }
      } catch {
        /* silent — premium panel just won't show */
      } finally {
        setAttractionLoading(false)
      }
    }

    // ── Fetch mini seasonal chart (30-day period, last 10 years) ──────────
    const fetchMiniChart = async () => {
      if (!pattern.period) return
      const parts = pattern.period.split(' - ')
      if (parts.length !== 2) return
      setMiniChartLoading(true)
      try {
        const parseMonthDay = (s: string) => {
          const months: Record<string, number> = {
            Jan: 0,
            Feb: 1,
            Mar: 2,
            Apr: 3,
            May: 4,
            Jun: 5,
            Jul: 6,
            Aug: 7,
            Sep: 8,
            Oct: 9,
            Nov: 10,
            Dec: 11,
          }
          const [mo, da] = s.trim().split(' ')
          return { month: months[mo] ?? 0, day: parseInt(da) || 1 }
        }
        const startD = parseMonthDay(parts[0])
        const endD = parseMonthDay(parts[1])
        const { polygonService } = await import('@/lib/polygonService')
        const currentYear = new Date().getFullYear()
        const NUM_YEARS = 10
        const COLORS = [
          '#FF6600',
          '#00FF88',
          '#2196F3',
          '#FFD700',
          '#FF69B4',
          '#9370DB',
          '#00FA9A',
          '#FF8C00',
          '#1E90FF',
          '#FF1493',
        ]

        const allYearData: Array<Array<{ x: number; pct: number }>> = []

        for (let i = 0; i < NUM_YEARS; i++) {
          const year = currentYear - 1 - i
          const periodStart = new Date(year, startD.month, startD.day)
          const periodEnd = new Date(
            endD.month < startD.month ? year + 1 : year,
            endD.month,
            endD.day
          )
          const fetchS = new Date(periodStart)
          fetchS.setDate(fetchS.getDate() - 5)
          const fetchE = new Date(periodEnd)
          fetchE.setDate(fetchE.getDate() + 1)

          try {
            const raw = await polygonService.getHistoricalData(
              pattern.symbol,
              fetchS.toISOString().split('T')[0],
              fetchE.toISOString().split('T')[0]
            )
            if (raw?.results?.length) {
              const startPrice =
                raw.results.find((d: any) => new Date(d.t) >= periodStart)?.c || raw.results[0].c
              const pts = raw.results
                .filter((d: any) => {
                  const dd = new Date(d.t)
                  return dd >= periodStart && dd <= periodEnd
                })
                .map((d: any, idx: number) => ({
                  x: idx,
                  pct: ((d.c - startPrice) / startPrice) * 100,
                }))
              if (pts.length > 0) allYearData.push(pts)
            }
          } catch {
            /* skip bad year */
          }
        }

        if (allYearData.length === 0) return

        const maxDays = Math.max(...allYearData.map((y) => y.length))

        // Build average line
        const avgLine: Array<{ x: number; pct: number }> = []
        for (let d = 0; d < maxDays; d++) {
          const vals = allYearData.map((y) => y[d]?.pct).filter((v): v is number => v !== undefined)
          if (vals.length > 0) {
            avgLine.push({ x: d, pct: vals.reduce((a, b) => a + b, 0) / vals.length })
          }
        }

        const allPcts = [...allYearData.flat().map((p) => p.pct), 0]
        const rawMin = Math.min(...allPcts)
        const rawMax = Math.max(...allPcts)
        const pad = (rawMax - rawMin) * 0.1 || 0.5

        setMiniChart({
          yearLines: allYearData.slice(0, 8).map((pts, i) => ({
            color: COLORS[i % COLORS.length],
            year: currentYear - 1 - i,
            totalPct: pts[pts.length - 1].pct,
            points: pts,
          })),
          avgLine,
          minPct: rawMin - pad,
          maxPct: rawMax + pad,
          maxDays,
        })
      } catch {
        /* silent */
      } finally {
        setMiniChartLoading(false)
      }
    }

    // ── Fetch 13D / 21D performance vs SPY (same logic as ETFHoldingsModal) ──
    const fetchPerformance = async () => {
      try {
        const d30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        const today = new Date().toISOString().split('T')[0]
        const [spyResp, stockResp] = await Promise.all([
          fetch(`/api/historical-data?symbol=SPY&startDate=${d30}&endDate=${today}`),
          fetch(
            `/api/historical-data?symbol=${encodeURIComponent(pattern.symbol)}&startDate=${d30}&endDate=${today}`
          ),
        ])
        if (!spyResp.ok || !stockResp.ok) return
        const [spyData, stockData] = await Promise.all([spyResp.json(), stockResp.json()])
        const spy = spyData.results || []
        const stock = stockData.results || []
        if (!spy.length || !stock.length) return

        const spyLatest = spy[spy.length - 1]?.c
        const spy13d =
          spyLatest && spy[spy.length - 14]?.c
            ? ((spyLatest - spy[spy.length - 14].c) / spy[spy.length - 14].c) * 100
            : 0
        const spy21d =
          spyLatest && spy[spy.length - 22]?.c
            ? ((spyLatest - spy[spy.length - 22].c) / spy[spy.length - 22].c) * 100
            : 0

        const latestPrice = stock[stock.length - 1]?.c
        if (!latestPrice) return
        const calc = (daysAgo: number) => {
          const idx = Math.max(0, stock.length - 1 - daysAgo)
          const old = stock[idx]?.c
          return old ? ((latestPrice - old) / old) * 100 : 0
        }
        const change13d = calc(13)
        const change21d = calc(21)

        const getStatus = (stockChg: number, spyChg: number, period: string) => {
          const rel = stockChg - spyChg
          if (period === '13d')
            return rel > 0
              ? { status: 'LEADER', color: '#00ff00' }
              : { status: 'LAGGARD', color: '#ff4444' }
          return rel > 0
            ? { status: 'KING', color: '#FFD700' }
            : { status: 'FALLEN', color: '#ff4444' }
        }

        setPerfData({
          change13d,
          change21d,
          perf13d: getStatus(change13d, spy13d, '13d'),
          perf21d: getStatus(change21d, spy21d, '21d'),
        })
      } catch {
        /* silent */
      }
    }

    fetchAttraction()
    fetchMiniChart()
    fetchPerformance()

    // ── Fetch monthly options contract setup ────────────────────────────
    const fetchOptionsSetup = async () => {
      const dir = isPositive ? 'call' : 'put'
      try {
        const periodEnd = pattern.period ? (pattern.period.split(' - ')[1]?.trim() ?? '') : ''
        const resp = await fetch(
          `/api/seasonal-options-setup?symbol=${pattern.symbol}&direction=${dir}&periodEnd=${encodeURIComponent(periodEnd)}`
        )
        if (!resp.ok) return
        const data = await resp.json()
        if (data.success) setOptionsSetup(data)
      } catch {
        /* non-critical */
      }
    }
    fetchOptionsSetup()
  }, []) // fire once on mount

  const getTimingMessage = () => {
    if (daysUntilStart === undefined || daysUntilStart === null) return null
    if (daysUntilStart === 0) return 'STARTS TODAY'
    if (daysUntilStart === 1) return 'IN 1D'
    if (daysUntilStart > 1) return `IN ${daysUntilStart}D`
    if (daysUntilStart === -1) return '1D AGO'
    if (daysUntilStart < -1) return `${Math.abs(daysUntilStart)}D AGO`
    return null
  }

  const timingMessage = getTimingMessage()

  // Calculate win rate color with opacity - higher opacity for good win rates, lower for bad
  const getWinRateColor = () => {
    if (pattern.winRate >= 50) {
      // Green with higher opacity for higher win rates (50% = 0.5, 100% = 1.0)
      const opacity = Math.min(0.5 + (pattern.winRate - 50) / 100, 1)
      return `rgba(0, 255, 136, ${opacity})`
    } else {
      // Red with lower opacity for lower win rates (50% = 0.5, 0% = 0.3)
      const opacity = Math.max(0.3 + pattern.winRate / 100, 0.5)
      return `rgba(255, 68, 68, ${opacity})`
    }
  }

  const winRateColor = getWinRateColor()
  const winRateGlowColor =
    pattern.winRate >= 50 ? 'rgba(0, 255, 136, 0.5)' : 'rgba(255, 68, 68, 0.5)'

  // Generate unique class name for this card instance
  const cardId = `opp-card-${pattern.symbol}-${Date.now()}`

  // Get ticker color based on seasoned qualifying
  const getTickerColor = () => {
    if (seasonedQualifying) {
      if (seasonedQualifying >= 4) return '#FFD700' // Golden yellow for all 4 timeframes
      if (seasonedQualifying === 3) return '#00FF88' // Crispy lime green for 3 timeframes
      if (seasonedQualifying === 2) return '#00d4ff' // Crispy cyan blue for 2 timeframes
    }
    return '#FF6600' // Default orange
  }

  const tickerColor = getTickerColor()

  // Best/Worst highlighting logic
  const isBest = isTopBullish || isTopBearish
  const isWorst = rank !== undefined && rank > 3

  // Border color based on highlighting
  let borderColor = '#333333'
  let boxShadow = '0 4px 8px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)'

  if (isTopBullish) {
    borderColor = '#00FF88'
    boxShadow =
      '0 0 0 1px #FFD70066, 0 0 12px 2px #FFD70055, 0 4px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.15)'
  } else if (isTopBearish) {
    borderColor = '#FF4444'
    boxShadow =
      '0 0 0 1px #FFD70066, 0 0 12px 2px #FFD70055, 0 4px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.15)'
  }

  return (
    <>
      {/* Inline style override to defeat global CSS */}
      <style>
        {`
 .${cardId} .opp-symbol {
 color: ${tickerColor} !important;
 }
 .${cardId} .opp-expected-positive {
 color: #00FF88 !important;
 }
 .${cardId} .opp-expected-negative {
 color: #FF4444 !important;
 }
 .${cardId} .opp-winrate {
 color: ${winRateColor} !important;
 }
 .${cardId} .opp-stat-winrate {
 color: #00FF88 !important;
 text-shadow: none !important;
 }
 .${cardId} .opp-stat-price {
 color: #00FF88 !important;
 text-shadow: none !important;
 }
 .${cardId} .opp-stat-attract {
 color: #c84fff !important;
 text-shadow: none !important;
 }
 .${cardId} .opp-stat-13d {
 color: ${perfData ? perfData.perf13d.color : '#ffffff'} !important;
 text-shadow: none !important;
 }
 .${cardId} .opp-stat-21d {
 color: ${perfData ? perfData.perf21d.color : '#ffffff'} !important;
 text-shadow: none !important;
 }
 .${cardId} .opp-stat-sync {
 color: ${trendSync ? trendSync.color : '#888888'} !important;
 text-shadow: none !important;
 }
 .${cardId} .opp-stat-label { color: #ffffff !important; }
 .${cardId} .opp-opt-badge-call { color: #00FF88 !important; }
 .${cardId} .opp-opt-badge-put  { color: #FF4444 !important; }
 .${cardId} .opp-opt-meta  { color: #ffffff !important; }
 .${cardId} .opp-opt-value { color: #ffffff !important; }
 .${cardId} .opp-opt-t1   { color: #00FF88 !important; }
 .${cardId} .opp-opt-t2   { color: #00BFFF !important; }
 .${cardId} .opp-opt-stop { color: #FF4444 !important; }
 .${cardId} .opp-opt-prem { color: #ffffff !important; }
 .${cardId} .opp-row-winrate { color: ${pattern.winRate >= 85 ? '#00FF88' : pattern.winRate >= 75 ? '#00BFFF' : '#FF9500'} !important; text-shadow: 0 0 14px ${pattern.winRate >= 85 ? 'rgba(0,255,136,0.85)' : pattern.winRate >= 75 ? 'rgba(0,191,255,0.85)' : 'rgba(255,149,0,0.85)'} !important; }
 .${cardId} .opp-row-avg { color: ${isPositive ? '#00FF88' : '#FF4444'} !important; text-shadow: 0 0 14px ${isPositive ? 'rgba(0,255,136,0.85)' : 'rgba(255,68,68,0.85)'} !important; }
 .${cardId} .opp-row-corr { color: ${trendSync ? trendSync.color : '#ffffff'} !important; text-shadow: 0 0 14px ${trendSync ? trendSync.color + 'AA' : 'transparent'} !important; }
 .${cardId} .opp-seasoned-count { color: ${seasonedQualifying && seasonedQualifying >= 4 ? '#FFD700' : seasonedQualifying === 3 ? '#00FF88' : '#00d4ff'} !important; text-shadow: 0 0 12px ${seasonedQualifying && seasonedQualifying >= 4 ? 'rgba(255,215,0,0.85)' : seasonedQualifying === 3 ? 'rgba(0,255,136,0.85)' : 'rgba(0,212,255,0.85)'} !important; }
 ${isHighWinRate
            ? `
 .${cardId}::before {
   content: '';
   position: absolute;
   top: 0; left: 0; right: 0;
   height: 44%;
   background: linear-gradient(180deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.022) 55%, transparent 100%);
   pointer-events: none;
   z-index: 10;
   border-radius: 10px 10px 0 0;
 }
 .${cardId}:hover {
   border-color: ${isPositive ? 'rgba(0,255,136,0.72)' : 'rgba(255,68,68,0.72)'} !important;
   box-shadow: inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.6),
     0 0 0 1px ${isPositive ? 'rgba(0,255,136,0.22)' : 'rgba(255,68,68,0.22)'},
     0 4px 14px rgba(0,0,0,0.55), 0 14px 48px rgba(0,0,0,0.8), 0 28px 90px rgba(0,0,0,0.97),
     0 0 70px ${isPositive ? 'rgba(0,255,136,0.18)' : 'rgba(255,68,68,0.18)'} !important;
   transform: translateY(-3px) scale(1.007) translateZ(0) !important;
   transition: all 0.22s cubic-bezier(0.23,1,0.32,1) !important;
 }`
            : ''
          }
 `}
      </style>
      <div
        className={cardId}
        onDoubleClick={() => setShowModal(true)}
        style={{
          background: isHighWinRate ? '#000000' : '#000000',
          border: isHighWinRate
            ? `1px solid ${isBest ? 'rgba(255,215,0,0.55)' : isPositive ? 'rgba(0,255,136,0.35)' : 'rgba(255,68,68,0.35)'}`
            : `2px solid ${isBest ? (isTopBullish ? '#00FF88' : '#FF4444') : borderColor}`,
          outline: isBest ? '1px solid #FFD700' : 'none',
          outlineOffset: '2px',
          padding: isHighWinRate ? '0' : '12px',
          borderRadius: '10px',
          overflow: isHighWinRate ? 'hidden' : 'visible',
          position: 'relative',
          transition: 'all 0.35s cubic-bezier(0.23,1,0.32,1)',
          boxShadow: isHighWinRate
            ? [
              `inset 0 1px 0 rgba(255,255,255,0.08)`,
              `inset 0 -1px 0 rgba(0,0,0,0.55)`,
              `0 0 0 1px ${isPositive ? 'rgba(0,255,136,0.07)' : 'rgba(255,68,68,0.07)'}`,
              `0 4px 14px rgba(0,0,0,0.55)`,
              `0 14px 48px rgba(0,0,0,0.8)`,
              `0 28px 88px rgba(0,0,0,0.95)`,
              `0 0 50px ${isPositive ? 'rgba(0,255,136,0.06)' : 'rgba(255,68,68,0.06)'}`,
            ].join(',')
            : `${boxShadow}, inset 0 2px 20px rgba(255, 255, 255, 0.03)`,
          backdropFilter: 'blur(12px)',
          transform: 'translateZ(0)',
          willChange: 'transform',
          cursor: 'pointer',
          gridColumn: undefined,
        }}
      >
        {/* ── Main body: always block (premium section goes below) ── */}
        <div>
          {/* ── CARD CONTENT ─────────────────────────────────────── */}
          <div>
            {/* Top Bar */}
            {isHighWinRate ? (
              /* Elite: Bloomberg×GS premium header */
              <div>
                {/* 4px neon accent bar with bloom glow */}
                <div
                  style={{
                    height: '4px',
                    background: `linear-gradient(90deg, transparent 0%, ${isPositive ? '#00FF88' : '#FF4444'}aa 15%, ${isPositive ? '#00FF88' : '#FF4444'} 38%, ${isPositive ? '#00FF88' : '#FF4444'} 62%, ${isPositive ? '#00FF88' : '#FF4444'}aa 85%, transparent 100%)`,
                    boxShadow: `0 0 14px ${isPositive ? '#00FF88' : '#FF4444'}, 0 0 4px ${isPositive ? '#00FF88' : '#FF4444'}`,
                  }}
                />
                {/* bloom diffusion below accent bar */}
                <div
                  style={{
                    height: '1px',
                    background: `linear-gradient(90deg, transparent 10%, ${isPositive ? 'rgba(0,255,136,0.22)' : 'rgba(255,68,68,0.22)'} 50%, transparent 90%)`,
                  }}
                />
                {/* Header row */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '11px 14px 10px',
                    background: '#000000',
                  }}
                >
                  {/* LEFT: Ticker + badges */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexShrink: 0 }}>
                    <div
                      className="opp-symbol"
                      style={{
                        fontSize: '28px',
                        fontWeight: '900',
                        letterSpacing: '2px',
                        fontFamily: "'Courier New',monospace",
                        color: tickerColor,
                        textShadow: `0 0 20px ${tickerColor}88, 0 0 40px ${tickerColor}33`,
                        filter: 'brightness(1.06)',
                      }}
                    >
                      {pattern.symbol}
                    </div>
                    {(pattern as any).timeframeLabel && (
                      <div
                        style={{
                          fontSize: '9px',
                          fontWeight: 'bold',
                          fontFamily: "'Courier New',monospace",
                          padding: '2px 5px',
                          borderRadius: '3px',
                          backgroundColor: 'rgba(255,102,0,0.2)',
                          color: '#FF6600',
                          border: '1px solid rgba(255,102,0,0.6)',
                          boxShadow: '0 0 8px rgba(255,102,0,0.3)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {(pattern as any).timeframeLabel}
                      </div>
                    )}
                  </div>
                  {/* CENTER: Date period */}
                  <div
                    style={{
                      flex: 1,
                      textAlign: 'center',
                      fontFamily: "'Courier New',monospace",
                      fontSize: '14px',
                      fontWeight: 'bold',
                      color: '#ffffff',
                      letterSpacing: '1px',
                      padding: '0 14px',
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                    }}
                  >
                    {pattern.period}
                    {seasonedQualifying && (
                      <span
                        className="opp-seasoned-count"
                        style={{
                          fontSize: '14px',
                          fontWeight: '900',
                          fontFamily: "'Courier New',monospace",
                        }}
                      >
                        {seasonedQualifying}
                      </span>
                    )}
                  </div>
                  {/* RIGHT: timing only */}
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}
                  >
                    {timingMessage && (
                      <div
                        style={{
                          fontSize: '10px',
                          color: '#FF6600',
                          fontWeight: '700',
                          letterSpacing: '0.5px',
                          fontFamily: "'Courier New',monospace",
                          background: 'rgba(255,102,0,0.12)',
                          padding: '5px 8px',
                          borderRadius: '4px',
                          border: '1px solid rgba(255,102,0,0.5)',
                          boxShadow: '0 0 10px rgba(255,102,0,0.22)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {timingMessage}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              /* Normal cards: Ticker + Timing on top, Period below */
              <>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '10px',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                    paddingBottom: '10px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div
                      className="opp-symbol"
                      style={{
                        fontSize: '26px',
                        fontWeight: 'bold',
                        letterSpacing: '1px',
                        fontFamily: 'monospace',
                        color: tickerColor,
                        textShadow: `0 0 15px ${tickerColor === '#FFD700' ? 'rgba(255, 215, 0, 0.6)' : tickerColor === '#00FF88' ? 'rgba(0, 255, 136, 0.6)' : tickerColor === '#00d4ff' ? 'rgba(0, 212, 255, 0.6)' : 'rgba(255, 102, 0, 0.6)'}`,
                        filter: 'brightness(1.1)',
                      }}
                    >
                      {pattern.symbol}
                    </div>
                    {(pattern as any).timeframeLabel && (
                      <div
                        style={{
                          fontSize: '10px',
                          fontWeight: 'bold',
                          fontFamily: 'monospace',
                          padding: '2px 6px',
                          borderRadius: '3px',
                          backgroundColor: 'rgba(255, 102, 0, 0.2)',
                          color: '#FF6600',
                          border: '1px solid #FF6600',
                          textShadow: '0 0 10px rgba(255, 102, 0, 0.5)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {(pattern as any).timeframeLabel}
                      </div>
                    )}
                    {(pattern as any).fiftyTwoWeekStatus && (
                      <div
                        style={{
                          fontSize: '4px',
                          fontWeight: 'bold',
                          fontFamily: 'monospace',
                          padding: '2px 4px',
                          borderRadius: '2px',
                          backgroundColor:
                            (pattern as any).fiftyTwoWeekStatus === '52 High'
                              ? 'rgba(0, 255, 136, 0.2)'
                              : 'rgba(255, 68, 68, 0.2)',
                          color:
                            (pattern as any).fiftyTwoWeekStatus === '52 High'
                              ? '#00FF88'
                              : '#FF4444',
                          border: `1px solid ${(pattern as any).fiftyTwoWeekStatus === '52 High' ? '#00FF88' : '#FF4444'}`,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {(pattern as any).fiftyTwoWeekStatus === '52 High' ? '52 High' : '52 Low'}
                      </div>
                    )}
                  </div>
                  {timingMessage && (
                    <div
                      style={{
                        fontSize: '5.5px',
                        color: '#FF6600',
                        fontWeight: '700',
                        letterSpacing: '0.4px',
                        textTransform: 'uppercase',
                        fontFamily: 'monospace',
                        background: 'rgba(255, 102, 0, 0.1)',
                        padding: '2px 4px',
                        borderRadius: '2px',
                        border: '1px solid rgba(255, 102, 0, 0.3)',
                        textShadow: '0 0 10px rgba(255, 102, 0, 0.5)',
                      }}
                    >
                      {timingMessage}
                    </div>
                  )}
                </div>
                <div
                  style={{
                    fontSize: sidebarMode ? '22px' : '11px',
                    color: sidebarMode ? '#ffffff' : '#999999',
                    marginBottom: '14px',
                    fontFamily: 'monospace',
                    letterSpacing: '0.5px',
                    textAlign: 'center',
                  }}
                >
                  {pattern.period}
                </div>
              </>
            )}

            {/* Metrics Grid — only for non-elite cards */}
            {!isHighWinRate && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '4px',
                  marginBottom: '10px',
                  overflow: 'hidden',
                  position: 'relative',
                }}
              >
                {/* Expected Return */}
                <div
                  style={{
                    background:
                      'linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(0, 0, 0, 0.3) 100%)',
                    padding: '6px 4px',
                    borderRadius: '6px',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    boxShadow:
                      'inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 2px 4px rgba(0, 0, 0, 0.3)',
                    textAlign: 'center',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      fontSize: sidebarMode ? '13.5px' : '9px',
                      color: sidebarMode ? '#ffffff' : '#888888',
                      marginBottom: '4px',
                      fontFamily: 'monospace',
                      letterSpacing: '0.8px',
                      textTransform: 'uppercase',
                    }}
                  >
                    EXPECTED
                  </div>
                  <div
                    className={isPositive ? 'opp-expected-positive' : 'opp-expected-negative'}
                    style={{
                      fontSize: sidebarMode ? '21px' : '14px',
                      fontWeight: 'bold',
                      fontFamily: 'monospace',
                      letterSpacing: '-0.5px',
                      textShadow: `0 0 10px ${isPositive ? 'rgba(0, 255, 136, 0.5)' : 'rgba(255, 68, 68, 0.5)'}`,
                    }}
                  >
                    {expectedReturn >= 0 ? '+' : ''}
                    {expectedReturn.toFixed(1)}%
                  </div>
                </div>

                {/* Seasoned Multi-Timeframe Badge - Overlaid between boxes */}
                {seasonedQualifying && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '58%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      background:
                        seasonedQualifying >= 4
                          ? 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)'
                          : seasonedQualifying === 3
                            ? 'linear-gradient(135deg, #00FF88 0%, #00CC66 100%)'
                            : 'linear-gradient(135deg, #00d4ff 0%, #0088cc 100%)',
                      color: '#000000',
                      padding: '4px 8px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      fontFamily: 'monospace',
                      boxShadow: `0 2px 10px ${seasonedQualifying >= 4
                        ? 'rgba(255, 215, 0, 0.6)'
                        : seasonedQualifying === 3
                          ? 'rgba(0, 255, 136, 0.6)'
                          : 'rgba(0, 212, 255, 0.6)'
                        }`,
                      textAlign: 'center',
                      minWidth: '24px',
                      border: '2px solid #000000',
                      zIndex: 10,
                    }}
                  >
                    {seasonedQualifying}
                  </div>
                )}

                {/* Win Rate */}
                <div
                  style={{
                    background:
                      'linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(0, 0, 0, 0.3) 100%)',
                    padding: '6px 4px',
                    borderRadius: '6px',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    boxShadow:
                      'inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 2px 4px rgba(0, 0, 0, 0.3)',
                    textAlign: 'center',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      fontSize: sidebarMode ? '13.5px' : '9px',
                      color: sidebarMode ? '#ffffff' : '#888888',
                      marginBottom: '4px',
                      fontFamily: 'monospace',
                      letterSpacing: '0.8px',
                      textTransform: 'uppercase',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    WIN RATE
                  </div>
                  <div
                    className="opp-winrate"
                    style={{
                      fontSize: sidebarMode ? '21px' : '14px',
                      fontWeight: 'bold',
                      fontFamily: 'monospace',
                      letterSpacing: '-0.5px',
                      textShadow: `0 0 10px ${winRateGlowColor}`,
                    }}
                  >
                    {pattern.winRate.toFixed(0)}%
                  </div>
                </div>
              </div>
            )}

            {/* Bottom indicator line — only for non-elite cards */}
            {!isHighWinRate && (
              <div
                style={{
                  height: '3px',
                  background: isPositive
                    ? 'linear-gradient(90deg, rgba(0, 255, 136, 0.6) 0%, rgba(0, 255, 136, 0.9) 50%, rgba(0, 255, 136, 0.6) 100%)'
                    : 'linear-gradient(90deg, rgba(255, 68, 68, 0.6) 0%, rgba(255, 68, 68, 0.9) 50%, rgba(255, 68, 68, 0.6) 100%)',
                  marginTop: '10px',
                  borderRadius: '2px',
                  boxShadow: `0 0 8px ${isPositive ? 'rgba(0, 255, 136, 0.4)' : 'rgba(255, 68, 68, 0.4)'}`,
                  opacity: 0.8,
                }}
              />
            )}
          </div>
          {/* ── end CARD CONTENT ── */}

          {/* ── BOTTOM PANEL: premium add-ons for 70%+ win rate ── */}
          {isHighWinRate && (
            <div>
              {/* ── WIN RATE | AVG row (row 2) ── */}
              {(() => {
                const wr = pattern.winRate
                const wrColor = wr >= 85 ? '#00FF88' : wr >= 75 ? '#00BFFF' : '#FF9500'
                const wrGlow =
                  wr >= 85
                    ? 'rgba(0,255,136,0.85)'
                    : wr >= 75
                      ? 'rgba(0,191,255,0.85)'
                      : 'rgba(255,149,0,0.85)'
                const avgColor = isPositive ? '#00FF88' : '#FF4444'
                const avgGlow = isPositive ? 'rgba(0,255,136,0.85)' : 'rgba(255,68,68,0.85)'
                return (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'stretch',
                      borderTop: `1px solid ${isPositive ? 'rgba(0,255,136,0.18)' : 'rgba(255,68,68,0.18)'}`,
                      borderBottom: `1px solid ${isPositive ? 'rgba(0,255,136,0.12)' : 'rgba(255,68,68,0.12)'}`,
                      background: '#000000',
                    }}
                  >
                    <div
                      style={{
                        flex: 1,
                        textAlign: 'center',
                        padding: '9px 8px',
                        borderRight: `1px solid ${isPositive ? 'rgba(0,255,136,0.12)' : 'rgba(255,68,68,0.12)'}`,
                      }}
                    >
                      <div
                        style={{
                          fontSize: '7px',
                          color: '#ffffff',
                          fontFamily: "'Courier New',monospace",
                          letterSpacing: '1.5px',
                          marginBottom: '3px',
                        }}
                      >
                        WIN RATE
                      </div>
                      <div
                        className="opp-row-winrate"
                        style={{
                          fontSize: '18px',
                          fontWeight: '900',
                          fontFamily: "'Courier New',monospace",
                          lineHeight: 1,
                        }}
                      >
                        {wr.toFixed(0)}%
                      </div>
                    </div>
                    {(pattern as any).fiftyTwoWeekStatus && (
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: '9px 8px',
                          borderRight: `1px solid ${isPositive ? 'rgba(0,255,136,0.12)' : 'rgba(255,68,68,0.12)'}`,
                        }}
                      >
                        <div
                          style={{
                            fontSize: '8px',
                            fontWeight: 'bold',
                            fontFamily: "'Courier New',monospace",
                            padding: '3px 6px',
                            borderRadius: '3px',
                            backgroundColor:
                              (pattern as any).fiftyTwoWeekStatus === '52 High'
                                ? 'rgba(0,255,136,0.15)'
                                : 'rgba(255,68,68,0.15)',
                            color:
                              (pattern as any).fiftyTwoWeekStatus === '52 High'
                                ? '#00FF88'
                                : '#FF4444',
                            border: `1px solid ${(pattern as any).fiftyTwoWeekStatus === '52 High' ? 'rgba(0,255,136,0.6)' : 'rgba(255,68,68,0.6)'}`,
                            boxShadow: `0 0 8px ${(pattern as any).fiftyTwoWeekStatus === '52 High' ? 'rgba(0,255,136,0.28)' : 'rgba(255,68,68,0.28)'}`,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {(pattern as any).fiftyTwoWeekStatus}
                        </div>
                      </div>
                    )}
                    {trendSync && (
                      <div style={{ flex: 1, textAlign: 'center', padding: '9px 8px' }}>
                        <div
                          style={{
                            fontSize: '7px',
                            color: '#ffffff',
                            fontFamily: "'Courier New',monospace",
                            letterSpacing: '1.5px',
                            marginBottom: '3px',
                          }}
                        >
                          CORRELATION
                        </div>
                        <div
                          className="opp-row-corr"
                          style={{
                            fontSize: '18px',
                            fontWeight: '900',
                            fontFamily: "'Courier New',monospace",
                            lineHeight: 1,
                          }}
                        >
                          {trendSync.score}%
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* ── Chart: full-bleed terminal display ── */}
              <div style={{ height: '215px', position: 'relative', background: '#000000' }}>
                {miniChartLoading ? (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#ffffff',
                      fontSize: '11px',
                      fontFamily: "'Courier New',monospace",
                    }}
                  >
                    Loading chart…
                  </div>
                ) : miniChart ? (
                  <MiniSeasonalChart data={miniChart} isPositive={isPositive} />
                ) : (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#ffffff',
                      fontSize: '11px',
                      fontFamily: "'Courier New',monospace",
                    }}
                  >
                    No chart data
                  </div>
                )}
                {/* CRT scanline overlay */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background:
                      'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.07) 2px, rgba(0,0,0,0.07) 3px)',
                    pointerEvents: 'none',
                    zIndex: 2,
                  }}
                />
                {/* Inner rim shadow for 3D depth */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    boxShadow: 'inset 0 0 28px rgba(0,0,0,0.75)',
                    pointerEvents: 'none',
                    zIndex: 2,
                  }}
                />
              </div>

              {/* ── Metrics strip: PRICE | ATTRACT | 13D | 1M ── */}
              {(() => {
                const fmt = (n: number) =>
                  n >= 1000
                    ? `$${(n / 1000).toFixed(1)}k`
                    : n >= 100
                      ? `$${n.toFixed(0)}`
                      : `$${n.toFixed(2)}`
                const accentLine = isPositive ? 'rgba(0,255,136,0.3)' : 'rgba(255,68,68,0.3)'
                type Cell = { label: string; value: string; cls: string }
                const cells: Cell[] = [
                  ...(attractionInfo
                    ? [
                      {
                        label: 'PRICE',
                        value: fmt(attractionInfo.currentPrice),
                        cls: 'opp-stat-price',
                      },
                      {
                        label: 'ATTRACT',
                        value: fmt(attractionInfo.attractionLevel),
                        cls: 'opp-stat-attract',
                      },
                    ]
                    : []),
                  ...(perfData
                    ? [
                      { label: '13D', value: perfData.perf13d.status, cls: 'opp-stat-13d' },
                      { label: '1M', value: perfData.perf21d.status, cls: 'opp-stat-21d' },
                    ]
                    : []),

                ]
                if (cells.length === 0) return null
                return (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: `repeat(${cells.length}, 1fr)`,
                      borderTop: `1px solid ${accentLine}`,
                      background: '#000000',
                    }}
                  >
                    {cells.map(({ label, value, cls }, i) => (
                      <div
                        key={label}
                        style={{
                          padding: '10px 4px',
                          textAlign: 'center',
                          borderRight:
                            i < cells.length - 1 ? '1px solid rgba(255,255,255,0.07)' : 'none',
                          background: '#000000',
                        }}
                      >
                        <div
                          style={{
                            fontSize: '7px',
                            color: '#ffffff',
                            fontFamily: "'Courier New',monospace",
                            letterSpacing: '1.5px',
                            marginBottom: '5px',
                            textTransform: 'uppercase',
                          }}
                        >
                          {label}
                        </div>
                        <div
                          className={cls}
                          style={{
                            fontSize: '14px',
                            fontFamily: "'Courier New',monospace",
                            fontWeight: 'bold',
                          }}
                        >
                          {value}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })()}

              {/* ── Options Contract ── */}
              {optionsSetup &&
                (() => {
                  const o = optionsSetup
                  const isCall = o.direction === 'call'
                  const accent = isCall ? '#00FF88' : '#FF4444'
                  const fmtS = (n: number) => (n >= 1000 ? `$${n.toFixed(0)}` : `$${n.toFixed(2)}`)
                  const fmtP = (n: number) => `$${n.toFixed(2)}`
                  const expLabel = new Date(o.expiryDate + 'T00:00:00Z').toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    timeZone: 'UTC',
                  })
                  return (
                    <div style={{ borderTop: `1px solid ${accent}44` }}>
                      {/* Contract header bar */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          flexWrap: 'nowrap',
                          gap: '8px',
                          padding: '9px 14px',
                          background: `linear-gradient(90deg, ${isCall ? 'rgba(0,255,136,0.06)' : 'rgba(255,68,68,0.06)'} 0%, #000000 100%)`,
                          borderBottom: '1px solid rgba(255,255,255,0.05)',
                        }}
                      >
                        <span
                          style={{
                            flexShrink: 0,
                            fontSize: '9px',
                            fontWeight: 'bold',
                            fontFamily: "'Courier New',monospace",
                            letterSpacing: '1.5px',
                            color: accent,
                            border: `1px solid ${accent}`,
                            borderRadius: '3px',
                            padding: '3px 7px',
                            background: `${accent}18`,
                            boxShadow: `0 0 12px ${accent}44, inset 0 1px 0 rgba(255,255,255,0.15)`,
                          }}
                        >
                          {isCall ? '▲ CALL' : '▼ PUT'}
                        </span>
                        <span
                          style={{
                            flexShrink: 0,
                            fontSize: '13px',
                            color: '#ffffff',
                            fontFamily: "'Courier New',monospace",
                            fontWeight: 'bold',
                          }}
                        >
                          ${o.strike}
                        </span>
                        <span
                          style={{
                            flexShrink: 0,
                            fontSize: '11px',
                            color: '#ffffff',
                            fontFamily: "'Courier New',monospace",
                          }}
                        >
                          {expLabel}
                        </span>
                        <span
                          style={{
                            marginLeft: 'auto',
                            flexShrink: 0,
                            fontSize: '10px',
                            color: '#ffffff',
                            fontFamily: "'Courier New',monospace",
                          }}
                        >
                          Entry:
                        </span>
                        <span
                          style={{
                            flexShrink: 0,
                            fontSize: '13px',
                            color: '#ffffff',
                            fontFamily: "'Courier New',monospace",
                            fontWeight: 'bold',
                          }}
                        >
                          {fmtP(o.mid)}
                        </span>
                      </div>
                      {/* Targets grid — color-coded top borders */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>
                        {[
                          {
                            label: 'TARGET 1',
                            stockCls: 'opp-opt-t1',
                            stockVal: fmtS(o.target1Stock),
                            optVal: fmtP(o.target1Premium),
                            topClr: 'rgba(0,255,136,0.6)',
                          },
                          {
                            label: 'TARGET 2',
                            stockCls: 'opp-opt-t2',
                            stockVal: fmtS(o.target2Stock),
                            optVal: fmtP(o.target2Premium),
                            topClr: 'rgba(0,191,255,0.6)',
                          },
                          {
                            label: 'STOP LOSS',
                            stockCls: 'opp-opt-stop',
                            stockVal: fmtS(o.stopLossStock),
                            optVal: fmtP(o.stopLossPremium),
                            topClr: 'rgba(255,68,68,0.6)',
                          },
                        ].map(({ label, stockCls, stockVal, optVal, topClr }, i, arr) => (
                          <div
                            key={label}
                            style={{
                              padding: '10px 6px 12px',
                              textAlign: 'center',
                              borderRight:
                                i < arr.length - 1 ? '1px solid rgba(255,255,255,0.07)' : 'none',
                              borderTop: `2px solid ${topClr}`,
                              background: '#000000',
                            }}
                          >
                            <div
                              style={{
                                fontSize: '7px',
                                color: '#ffffff',
                                fontFamily: "'Courier New',monospace",
                                letterSpacing: '1.5px',
                                marginBottom: '5px',
                              }}
                            >
                              {label}
                            </div>
                            <div
                              className={stockCls}
                              style={{
                                fontSize: '15px',
                                fontFamily: "'Courier New',monospace",
                                fontWeight: 'bold',
                              }}
                            >
                              {stockVal}
                            </div>
                            <div
                              style={{
                                fontSize: '10px',
                                color: '#ffffff',
                                fontFamily: "'Courier New',monospace",
                                marginTop: '3px',
                              }}
                            >
                              {optVal}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })()}
            </div>
          )}
          {/* ── end BOTTOM PANEL ── */}
        </div>
        {/* ── end body ── */}
      </div>
      {/* ── end card ── */}

      {/* Seasonal Line Chart Modal */}
      <SeasonalLineChartModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        pattern={pattern}
        years={years}
      />
    </>
  )
}

export default OpportunityCard
export { SeasonalChart }
