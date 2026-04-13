'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'

// ─── Constants ────────────────────────────────────────────────────────────────
const CONTRACTION_THRESHOLD = 30 // matches pivot screener exactly (30% compression = qualifies)
const MIN_AVG_HV = 3.0 // minimum 4D avg range % — filters low-beta junk (VZ, T, utilities)
const VISIBLE_DAYS = 252 // ~1 year of trading days shown in chart
const FETCH_CAL_DAYS = 500 // calendar days to fetch (≈340 trading days with buffer)

// ─── Types ────────────────────────────────────────────────────────────────────
interface Bar {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  t: number
}

interface ConsolidationEvent {
  barIndex: number // index in allBars
  date: string
  price: number // close price at detection bar
  period: '4D'
  compressionPct: number
  squeezeOn: boolean // TTM Squeeze status at detection bar
}

// ─── Pure helpers: exact detectPivotSetup logic from contractionScanner.ts ────

function calcEMA(values: number[], period: number): number {
  if (values.length < period) return 0
  const k = 2 / (period + 1)
  let ema = values.slice(0, period).reduce((s, v) => s + v, 0) / period
  for (let i = period; i < values.length; i++) ema = (values[i] - ema) * k + ema
  return ema
}

function calcATR(bars: Bar[], period: number = 14): number {
  if (bars.length < period + 1) return 0
  const trs: number[] = []
  for (let i = 1; i < bars.length; i++) {
    const h = bars[i].high,
      l = bars[i].low,
      pc = bars[i - 1].close
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)))
  }
  return trs.slice(-period).reduce((s, t) => s + t, 0) / period
}

// TTM Squeeze: Bollinger Bands inside Keltner Channels (20-period, ±2σ BB, ±1.5×ATR KC)
function detectTTMSqueeze(bars: Bar[], period: number = 20): boolean {
  if (bars.length < period) return false
  const closes = bars.slice(-period).map((b) => b.close)
  const sma = closes.reduce((s, c) => s + c, 0) / period
  const variance = closes.reduce((s, c) => s + (c - sma) ** 2, 0) / period
  const stdDev = Math.sqrt(variance)
  const bbUpper = sma + 2 * stdDev
  const bbLower = sma - 2 * stdDev
  const ema = calcEMA(closes, period)
  const atr = calcATR(bars, period)
  const kcUpper = ema + 1.5 * atr
  const kcLower = ema - 1.5 * atr
  return bbUpper < kcUpper && bbLower > kcLower
}

function calcHistoricalVolatility(bars: Bar[], moveDays: number, lookbackDays: number): number {
  if (bars.length < lookbackDays) return 0
  const rb = bars.slice(-lookbackDays)
  const moves: number[] = []
  for (let i = moveDays; i < rb.length; i++) {
    const h = Math.max(...rb.slice(i - moveDays, i + 1).map((b) => b.high))
    const l = Math.min(...rb.slice(i - moveDays, i + 1).map((b) => b.low))
    moves.push(((h - l) / l) * 100)
  }
  return moves.length ? moves.reduce((s, m) => s + m, 0) / moves.length : 0
}

function detectConsolidation(
  bars: Bar[],
  days: number
): { qualifies: boolean; compressionPct: number } {
  if (bars.length < 120) return { qualifies: false, compressionPct: 0 }
  const lb = bars.slice(-days)
  if (lb.length < days) return { qualifies: false, compressionPct: 0 }

  const avgHV = calcHistoricalVolatility(bars, days, 120)
  if (!avgHV) return { qualifies: false, compressionPct: 0 }
  // Reject low-beta/utility stocks that are perpetually tight (e.g. VZ, T, WM)
  if (avgHV < MIN_AVG_HV) return { qualifies: false, compressionPct: 0 }

  const high = Math.max(...lb.map((b) => b.high))
  const low = Math.min(...lb.map((b) => b.low))
  const currentRange = high - low
  const rangePercent = (currentRange / low) * 100
  const compressionPct = ((avgHV - rangePercent) / avgHV) * 100

  const start = lb[0].close
  const end = lb[lb.length - 1].close
  const netMove = Math.abs(end - start)
  // notTrending: net close-to-close move must be < 80% of the range
  // (allows coils that drift — catches post-selloff base-building)
  const notTrending = currentRange > 0 ? netMove / currentRange < 0.8 : false

  const curBar = lb[lb.length - 1]
  const curBarRange = curBar.high - curBar.low
  const avgBarRange = lb.reduce((s, b) => s + (b.high - b.low), 0) / lb.length
  const curBarTight = avgBarRange > 0 && curBarRange <= avgBarRange * 2.0

  // Core logic: range is tight vs history + not a straight-line trend + last bar still small
  const qualifies = compressionPct > CONTRACTION_THRESHOLD && notTrending && curBarTight

  return { qualifies, compressionPct }
}

function scanHistory(allBars: Bar[]): { events4D: ConsolidationEvent[] } {
  const events4D: ConsolidationEvent[] = []

  let inConsolidation = false
  let peakCompression = 0
  let lastQualifyingBarIndex = -1 // last bar that qualified (where we place the diamond)

  const emitPeak = () => {
    if (!inConsolidation || lastQualifyingBarIndex < 0) return
    events4D.push({
      barIndex: lastQualifyingBarIndex,
      date: allBars[lastQualifyingBarIndex].date,
      price: allBars[lastQualifyingBarIndex].close,
      period: '4D',
      compressionPct: peakCompression,
      squeezeOn: detectTTMSqueeze(allBars.slice(0, lastQualifyingBarIndex + 1)),
    })
    inConsolidation = false
    peakCompression = 0
    lastQualifyingBarIndex = -1
  }

  for (let i = 120; i < allBars.length; i++) {
    const slicedBars = allBars.slice(0, i + 1)
    const r = detectConsolidation(slicedBars, 4)

    if (r.qualifies) {
      if (!inConsolidation) {
        inConsolidation = true
        peakCompression = r.compressionPct
      } else if (r.compressionPct > peakCompression) {
        peakCompression = r.compressionPct
      }
      lastQualifyingBarIndex = i // always advance to the last qualifying bar
    } else {
      if (inConsolidation) emitPeak()
    }
  }

  // still in active consolidation at end of data — emit peak (live/current signal)
  if (inConsolidation) emitPeak()

  return { events4D }
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

// ─── Canvas Chart ─────────────────────────────────────────────────────────────
function ConsolidationChart({
  candles,
  events4D,
  ticker,
}: {
  candles: Bar[]
  events4D: ConsolidationEvent[]
  ticker: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [width, setWidth] = useState(800)
  const [height, setHeight] = useState(560)

  const viewRef = useRef({ startIdx: 0, visibleCount: Math.max(candles.length, 10) })

  useEffect(() => {
    if (!containerRef.current) return
    const obs = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (rect?.width > 0) setWidth(Math.floor(rect.width))
      if (rect?.height > 0) setHeight(Math.floor(rect.height))
    })
    obs.observe(containerRef.current)
    if (containerRef.current.clientWidth > 0) setWidth(containerRef.current.clientWidth)
    if (containerRef.current.clientHeight > 0) setHeight(containerRef.current.clientHeight)
    return () => obs.disconnect()
  }, [])

  // Reset view when candles change
  useEffect(() => {
    viewRef.current = { startIdx: 0, visibleCount: candles.length }
  }, [candles])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || candles.length === 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const PAD = { top: 14, right: 100, bottom: 46, left: 6 }
    const chartW = width - PAD.left - PAD.right
    const chartH = height - PAD.top - PAD.bottom

    const n = candles.length
    let { startIdx, visibleCount } = viewRef.current
    visibleCount = Math.max(10, Math.min(n, visibleCount))
    startIdx = Math.max(0, Math.min(n - visibleCount, startIdx))
    viewRef.current = { startIdx, visibleCount }
    const vis = candles.slice(startIdx, startIdx + visibleCount)

    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    ctx.scale(dpr, dpr)

    // Background
    const bgGrad = ctx.createLinearGradient(0, 0, 0, height)
    bgGrad.addColorStop(0, '#03080f')
    bgGrad.addColorStop(1, '#000000')
    ctx.fillStyle = bgGrad
    ctx.fillRect(0, 0, width, height)

    // Price range
    const allP = vis.flatMap((c) => [c.high, c.low])
    const rawMin = Math.min(...allP)
    const rawMax = Math.max(...allP)
    const padP = (rawMax - rawMin) * 0.08
    const pMin = rawMin - padP
    const pMax = rawMax + padP
    const pRange = pMax - pMin
    const pyFn = (p: number) => PAD.top + ((pMax - p) / pRange) * chartH

    // Candle layout
    const vc = vis.length
    const INNER = 18
    const candleSpacing = (chartW - INNER * 2) / vc
    const bw = Math.max(1.5, candleSpacing * 0.62)
    const cxFn = (i: number) => PAD.left + INNER + i * candleSpacing + candleSpacing / 2

    // Grid lines
    ctx.lineWidth = 1
    for (let gi = 0; gi <= 4; gi++) {
      const gp = pMin + (gi / 4) * pRange
      const gy = Math.round(pyFn(gp)) + 0.5
      ctx.strokeStyle = gi === 2 ? 'rgba(0,229,255,0.07)' : 'rgba(255,255,255,0.04)'
      ctx.beginPath()
      ctx.moveTo(PAD.left, gy)
      ctx.lineTo(width - PAD.right, gy)
      ctx.stroke()
      const label = gp >= 1000 ? gp.toFixed(0) : gp >= 100 ? gp.toFixed(1) : gp.toFixed(2)
      ctx.fillStyle = '#FFFFFF'
      ctx.font = `700 21px "JetBrains Mono", monospace`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(label, width - PAD.right + 6, gy)
    }

    // Y-axis border
    ctx.strokeStyle = 'rgba(0,229,255,0.15)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(width - PAD.right + 0.5, PAD.top)
    ctx.lineTo(width - PAD.right + 0.5, height - PAD.bottom)
    ctx.stroke()

    // Candles — glossy 4D
    for (let i = 0; i < vis.length; i++) {
      const c = vis[i]
      const x = Math.round(cxFn(i))
      const isUp = c.close >= c.open
      const baseColor = isUp ? '#00C853' : '#FF1744'
      const topColor = isUp ? '#69F0AE' : '#FF6D6D'
      const darkColor = isUp ? '#005C24' : '#8B0000'
      const bodyTop = Math.round(pyFn(Math.max(c.open, c.close)))
      const bodyBot = Math.round(pyFn(Math.min(c.open, c.close)))
      const bodyH = Math.max(1, bodyBot - bodyTop)
      const bodyX = x - Math.floor(bw / 2)
      const bodyW = Math.ceil(bw)
      // Wick
      ctx.strokeStyle = baseColor
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x + 0.5, Math.round(pyFn(c.high)))
      ctx.lineTo(x + 0.5, Math.round(pyFn(c.low)))
      ctx.stroke()
      // Glossy 4D body
      if (bodyH > 1 && bodyW >= 2) {
        const bodyGrad = ctx.createLinearGradient(bodyX, bodyTop, bodyX + bodyW, bodyBot)
        bodyGrad.addColorStop(0, topColor)
        bodyGrad.addColorStop(0.4, baseColor)
        bodyGrad.addColorStop(1, darkColor)
        ctx.fillStyle = bodyGrad
        ctx.fillRect(bodyX, bodyTop, bodyW, bodyH)
        // Gloss highlight strip
        const glossW = Math.max(1, Math.floor(bodyW * 0.35))
        const glossH = Math.max(1, Math.floor(bodyH * 0.45))
        const gloss = ctx.createLinearGradient(bodyX, bodyTop, bodyX, bodyTop + glossH)
        gloss.addColorStop(0, 'rgba(255,255,255,0.38)')
        gloss.addColorStop(1, 'rgba(255,255,255,0)')
        ctx.fillStyle = gloss
        ctx.fillRect(bodyX + 1, bodyTop + 1, glossW, glossH)
      } else {
        ctx.fillStyle = baseColor
        ctx.fillRect(bodyX, bodyTop, bodyW, bodyH)
      }
    }

    // Current price dashed line
    if (startIdx + visibleCount >= n) {
      const latestClose = candles[n - 1].close
      const py = Math.round(pyFn(latestClose)) + 0.5
      ctx.save()
      ctx.shadowColor = 'rgba(255,215,0,0.4)'
      ctx.shadowBlur = 6
      ctx.setLineDash([5, 3])
      ctx.strokeStyle = '#FFD700'
      ctx.globalAlpha = 0.9
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(PAD.left, py)
      ctx.lineTo(width - PAD.right, py)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.globalAlpha = 1
      ctx.shadowBlur = 0
      ctx.restore()
      ctx.fillStyle = '#FFFFFF'
      ctx.font = `800 21px "JetBrains Mono", monospace`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(latestClose.toFixed(2), width - PAD.right + 6, py)
    }
    ctx.setLineDash([])
    ctx.globalAlpha = 1

    // X-axis labels
    const xLabelIdxs = [
      0,
      Math.floor(vc * 0.25),
      Math.floor(vc * 0.5),
      Math.floor(vc * 0.75),
      vc - 1,
    ].filter((v, i, a) => a.indexOf(v) === i && v < vc)
    ctx.fillStyle = '#FFFFFF'
    ctx.font = `700 18px "JetBrains Mono", monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    for (const i of xLabelIdxs) {
      ctx.fillText(formatDateLabel(vis[i].date), cxFn(i), height - PAD.bottom + 5)
    }

    // ── Consolidation bubbles ─────────────────────────────────────────────
    // Map events to visible frame indices
    const visStartDate = vis[0]?.date
    const visEndDate = vis[vis.length - 1]?.date

    // Build a date → vis-index map for fast lookup
    const dateToVisIdx = new Map<string, number>()
    for (let i = 0; i < vis.length; i++) {
      dateToVisIdx.set(vis[i].date, i)
    }

    const maxCompression =
      events4D.length > 0 ? Math.max(...events4D.map((e) => e.compressionPct)) : 100

    ctx.save()

    for (const event of events4D) {
      const visIdx = dateToVisIdx.get(event.date)
      if (visIdx === undefined) continue

      const cx = cxFn(visIdx)
      const cy = pyFn(event.price)
      if (cy < PAD.top || cy > PAD.top + chartH) continue

      const norm = Math.sqrt(event.compressionPct / maxCompression)
      const r = Math.max(5, Math.min(28, norm * 28))

      // Orange-gold diamond for 4D CONSOLIDATION
      const baseGrad = ctx.createLinearGradient(cx, cy - r, cx, cy + r)
      baseGrad.addColorStop(0, 'rgba(255, 200, 60, 0.95)')
      baseGrad.addColorStop(0.5, 'rgba(255, 120, 0, 0.80)')
      baseGrad.addColorStop(1, 'rgba(180, 50, 0, 0.60)')
      ctx.beginPath()
      ctx.moveTo(cx, cy - r)
      ctx.lineTo(cx + r, cy)
      ctx.lineTo(cx, cy + r)
      ctx.lineTo(cx - r, cy)
      ctx.closePath()
      ctx.fillStyle = baseGrad
      ctx.fill()
      ctx.strokeStyle = 'rgba(255, 220, 80, 0.95)'
      ctx.lineWidth = 1.5
      ctx.stroke()
      // Gloss
      const glossGrad = ctx.createRadialGradient(
        cx - r * 0.25,
        cy - r * 0.3,
        r * 0.05,
        cx,
        cy - r * 0.1,
        r * 0.6
      )
      glossGrad.addColorStop(0, 'rgba(255, 255, 255, 0.65)')
      glossGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.15)')
      glossGrad.addColorStop(1, 'rgba(255, 255, 255, 0)')
      ctx.beginPath()
      ctx.moveTo(cx, cy - r)
      ctx.lineTo(cx + r, cy)
      ctx.lineTo(cx, cy + r)
      ctx.lineTo(cx - r, cy)
      ctx.closePath()
      ctx.fillStyle = glossGrad
      ctx.fill()

      // Label: compression % (top) + SQZ ON/OFF (below)
      const fontSize = Math.max(10, Math.min(14, r * 0.65))
      ctx.fillStyle = '#FFFFFF'
      ctx.font = `700 ${fontSize}px "JetBrains Mono", monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(`${event.compressionPct.toFixed(0)}%`, cx, cy)

      // Squeeze badge below bubble — only shown when ON
      if (event.squeezeOn) {
        const badgeFontSize = Math.max(8, Math.min(11, r * 0.5))
        ctx.font = `800 ${badgeFontSize}px "JetBrains Mono", monospace`
        ctx.fillStyle = '#00FF88'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillText('ON', cx, cy + r + 3)
      }
    }
    ctx.restore()

    // ── Crosshair ────────────────────────────────────────────────────────────────────
    const ch = crosshairRef.current
    if (
      ch &&
      ch.cx >= PAD.left &&
      ch.cx <= width - PAD.right &&
      ch.cy >= PAD.top &&
      ch.cy <= PAD.top + chartH
    ) {
      ctx.save()
      ctx.setLineDash([4, 4])
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'
      ctx.lineWidth = 1
      // Vertical line
      ctx.beginPath()
      ctx.moveTo(Math.round(ch.cx) + 0.5, PAD.top)
      ctx.lineTo(Math.round(ch.cx) + 0.5, PAD.top + chartH)
      ctx.stroke()
      // Horizontal line
      ctx.beginPath()
      ctx.moveTo(PAD.left, Math.round(ch.cy) + 0.5)
      ctx.lineTo(width - PAD.right, Math.round(ch.cy) + 0.5)
      ctx.stroke()
      ctx.setLineDash([])
      // Price label on Y axis
      const priceAtCursor = pMax - ((ch.cy - PAD.top) / chartH) * pRange
      const priceLabel =
        priceAtCursor >= 1000
          ? priceAtCursor.toFixed(0)
          : priceAtCursor >= 100
            ? priceAtCursor.toFixed(1)
            : priceAtCursor.toFixed(2)
      ctx.fillStyle = 'rgba(10,10,20,0.92)'
      ctx.fillRect(width - PAD.right + 1, Math.round(ch.cy) - 13, PAD.right - 2, 26)
      ctx.fillStyle = '#00E5FF'
      ctx.font = '700 13px "JetBrains Mono", monospace'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(priceLabel, width - PAD.right + 5, Math.round(ch.cy))
      // Date label on X axis
      const hoverIdx = Math.round((ch.cx - PAD.left - INNER - candleSpacing / 2) / candleSpacing)
      const clampedIdx = Math.max(0, Math.min(vis.length - 1, hoverIdx))
      if (vis[clampedIdx]) {
        const dateStr = formatDateLabel(vis[clampedIdx].date)
        const dtW = dateStr.length * 7.5 + 14
        ctx.fillStyle = 'rgba(10,10,20,0.92)'
        ctx.fillRect(Math.round(ch.cx) - dtW / 2, height - PAD.bottom + 2, dtW, 20)
        ctx.fillStyle = '#00E5FF'
        ctx.font = '700 12px "JetBrains Mono", monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillText(dateStr, Math.round(ch.cx), height - PAD.bottom + 4)
      }
      ctx.restore()
    }
  }, [width, height, candles, events4D])

  useEffect(() => {
    draw()
  }, [draw])

  // Zoom — must use a non-passive DOM listener so preventDefault blocks page scroll
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      const n = candles.length
      let { startIdx, visibleCount } = viewRef.current
      const delta = e.deltaY > 0 ? 1 : -1
      const step = Math.max(1, Math.floor(visibleCount * 0.1))
      visibleCount = Math.max(10, Math.min(n, visibleCount + delta * step))
      startIdx = Math.max(0, Math.min(n - visibleCount, startIdx))
      viewRef.current = { startIdx, visibleCount }
      draw()
    }
    canvas.addEventListener('wheel', handleWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', handleWheel)
  }, [candles.length, draw])

  // Drag + crosshair
  const dragRef = useRef<{ x: number; startIdx: number } | null>(null)
  const crosshairRef = useRef<{ cx: number; cy: number } | null>(null)

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragRef.current = { x: e.clientX, startIdx: viewRef.current.startIdx }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }, [])

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect()
      if (rect) crosshairRef.current = { cx: e.clientX - rect.left, cy: e.clientY - rect.top }
      if (!dragRef.current) {
        draw()
        return
      }
      const n = candles.length
      const { visibleCount } = viewRef.current
      const PAD = { left: 6, right: 100 }
      const chartW = width - PAD.left - PAD.right
      const INNER = 18
      const candleSpacing = (chartW - INNER * 2) / Math.max(1, visibleCount)
      const dx = dragRef.current.x - e.clientX
      const candlesDelta = Math.round(dx / candleSpacing)
      const newStart = Math.max(
        0,
        Math.min(n - visibleCount, dragRef.current.startIdx + candlesDelta)
      )
      viewRef.current.startIdx = newStart
      draw()
    },
    [candles.length, width, draw]
  )

  const onPointerUp = useCallback(() => {
    dragRef.current = null
    crosshairRef.current = null
    draw()
  }, [draw])

  return (
    <div ref={containerRef} style={{ flex: 1, width: '100%', position: 'relative', minHeight: 0 }}>
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          display: 'block',
          cursor: 'crosshair',
          userSelect: 'none',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      />
      {/* Legend */}
      <div
        style={{
          position: 'absolute',
          top: '18px',
          left: '18px',
          display: 'flex',
          gap: '16px',
          alignItems: 'center',
          pointerEvents: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div
            style={{
              width: 12,
              height: 12,
              background: 'linear-gradient(135deg, rgba(255,200,60,0.95), rgba(255,120,0,0.8))',
              border: '1px solid rgba(255,220,80,0.95)',
              transform: 'rotate(45deg)',
            }}
          />
          <span
            style={{
              color: '#ffffff',
              fontSize: '12px',
              fontFamily: 'JetBrains Mono, monospace',
              fontWeight: 700,
            }}
          >
            4D CONSOLIDATION ({events4D.length} signals)
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ConsolidationHistoryScreener({
  externalTicker,
}: { externalTicker?: string } = {}) {
  const [tickerInput, setTickerInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ticker, setTicker] = useState<string | null>(null)
  const [candles, setCandles] = useState<Bar[]>([])
  const [events4D, setevents4D] = useState<ConsolidationEvent[]>([])

  const API_KEY = process.env.NEXT_PUBLIC_POLYGON_API_KEY || ''

  const runScan = async (sym: string) => {
    if (!sym.trim()) return
    const symbol = sym.trim().toUpperCase()
    setLoading(true)
    setError(null)
    setTicker(symbol)
    setCandles([])
    setevents4D([])

    try {
      const toDate = new Date()
      const fromDate = new Date()
      fromDate.setDate(fromDate.getDate() - FETCH_CAL_DAYS)

      const from = fromDate.toISOString().split('T')[0]
      const to = toDate.toISOString().split('T')[0]

      const url =
        `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${from}/${to}` +
        `?adjusted=true&sort=asc&limit=1000&apiKey=${API_KEY}`

      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()

      if (!json.results || json.results.length === 0) {
        throw new Error(`No data found for ${symbol}`)
      }

      const allBars: Bar[] = json.results.map(
        (r: { t: number; o: number; h: number; l: number; c: number; v: number }) => ({
          date: new Date(r.t).toISOString().split('T')[0],
          open: r.o,
          high: r.h,
          low: r.l,
          close: r.c,
          volume: r.v,
          t: r.t,
        })
      )

      // Show last VISIBLE_DAYS candles in chart, but scan all bars
      const visibleBars = allBars.slice(-VISIBLE_DAYS)

      // Scan entire history for consolidation events
      const { events4D: e10 } = scanHistory(allBars)

      // Filter events to those within visible window
      const visibleDates = new Set(visibleBars.map((b) => b.date))
      const vis4D = e10.filter((e) => visibleDates.has(e.date))

      setCandles(visibleBars)
      setevents4D(vis4D)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fetch failed')
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') runScan(tickerInput)
  }

  // Auto-scan when driven externally from trading lens
  useEffect(() => {
    if (externalTicker && externalTicker.trim()) {
      runScan(externalTicker.trim())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalTicker])

  return (
    <div
      style={{
        background: '#06060a',
        border: '1px solid rgba(255,120,0,0.18)',
        boxShadow: '0 8px 40px rgba(0,0,0,0.8)',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      {!externalTicker && (
        <div
          style={{
            background: 'linear-gradient(180deg, #101016 0%, #08080d 100%)',
            borderBottom: '1px solid rgba(255,120,0,0.22)',
            padding: '20px 28px',
            display: 'flex',
            alignItems: 'center',
            gap: '20px',
          }}
        >
          <div>
            <div
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontWeight: 800,
                fontSize: '20px',
                color: '#FF8C00',
                letterSpacing: '2px',
                textShadow: '0 0 12px rgba(255,140,0,0.4)',
              }}
            >
              CONSOLIDATION HISTORY
            </div>
            <div
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '11px',
                color: 'rgba(255,255,255,0.35)',
                letterSpacing: '1.5px',
                marginTop: '3px',
              }}
            ></div>
          </div>

          {/* Search input */}
          <div style={{ display: 'flex', gap: '10px', marginLeft: 'auto', alignItems: 'center' }}>
            <input
              type="text"
              value={tickerInput}
              onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
              onKeyDown={handleKeyDown}
              placeholder="TICKER"
              style={{
                background: '#0a0a10',
                border: '1px solid rgba(255,120,0,0.35)',
                borderRadius: '4px',
                color: '#FFFFFF',
                padding: '10px 16px',
                fontSize: '15px',
                fontWeight: 700,
                fontFamily: 'JetBrains Mono, monospace',
                outline: 'none',
                textTransform: 'uppercase',
                letterSpacing: '2px',
                width: '130px',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255,140,0,0.8)'
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255,120,0,0.35)'
              }}
            />
            <button
              onClick={() => runScan(tickerInput)}
              disabled={loading || !tickerInput.trim()}
              style={{
                background: loading
                  ? 'rgba(100,100,100,0.3)'
                  : 'linear-gradient(135deg, rgba(255,140,0,0.85), rgba(200,80,0,0.85))',
                border: 'none',
                borderRadius: '4px',
                color: '#000000',
                padding: '10px 22px',
                fontSize: '13px',
                fontWeight: 800,
                fontFamily: 'JetBrains Mono, monospace',
                cursor: loading || !tickerInput.trim() ? 'not-allowed' : 'pointer',
                letterSpacing: '1px',
                opacity: loading || !tickerInput.trim() ? 0.5 : 1,
                transition: 'all 0.2s',
              }}
            >
              {loading ? 'SCANNING...' : 'SCAN'}
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      <div
        style={{ padding: '0', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
      >
        {/* Idle state */}
        {!ticker && !loading && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '100px 40px',
              color: 'rgba(255,255,255,0.25)',
              gap: '16px',
            }}
          >
            <div style={{ fontSize: '48px' }}>📊</div>
            <div
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '16px',
                fontWeight: 700,
                letterSpacing: '1px',
              }}
            >
              ENTER A TICKER TO VIEW HISTORICAL CONSOLIDATION POINTS
            </div>
            <div
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '12px',
                color: 'rgba(255,255,255,0.15)',
                textAlign: 'center',
                maxWidth: '500px',
              }}
            >
              Gold diamonds = 10-day coil (≥{CONTRACTION_THRESHOLD}% tighter than 6-month avg)
              <br />
              Requires: volume dry-up · 3+ direction flips · net move &lt;20%
              <br />
              Size = compression intensity · Green = TTM Squeeze ON
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '100px 40px',
              color: '#FF8C00',
              gap: '12px',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '16px',
              fontWeight: 700,
            }}
          >
            <div
              style={{
                width: 20,
                height: 20,
                border: '2px solid rgba(255,140,0,0.3)',
                borderTopColor: '#FF8C00',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }}
            />
            SCANNING {ticker} · RUNNING CONSOLIDATION DETECTION...
          </div>
        )}

        {/* Error */}
        {error && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '60px 40px',
              color: '#FF073A',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '14px',
              fontWeight: 700,
            }}
          >
            ERROR: {error}
          </div>
        )}

        {/* Chart */}
        {!loading && !error && candles.length > 0 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {/* Ticker subtitle */}
            <div
              style={{
                padding: '14px 28px 0',
                display: 'flex',
                alignItems: 'baseline',
                gap: '16px',
              }}
            >
              <span
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '22px',
                  fontWeight: 800,
                  color: '#FF8C00',
                  letterSpacing: '2px',
                }}
              >
                {ticker}
              </span>
            </div>

            <ConsolidationChart candles={candles} events4D={events4D} ticker={ticker ?? ''} />
          </div>
        )}

        {!loading && !error && ticker && candles.length === 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '80px 40px',
              color: 'rgba(255,255,255,0.3)',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '15px',
            }}
          >
            NO DATA RETURNED FOR {ticker}
          </div>
        )}
      </div>

      <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
            `}</style>
    </div>
  )
}
