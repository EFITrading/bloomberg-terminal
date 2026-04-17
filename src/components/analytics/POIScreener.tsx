'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'

// ─── Constants ────────────────────────────────────────────────────────────────
const POI_SYMBOLS = ['MAGS'] as readonly string[]
type POISymbol = string

const DARK_POOL_EXCHANGES = new Set([4, 6, 16, 201, 202, 203])
const LIT_BLOCK_MIN_NOTIONAL = 250_000 // $250k notional threshold for lit-exchange blocks
const LOOKBACK_DAYS = 90 // trading days of dark pool data — matches EFICharting exactly

// ─── Types ────────────────────────────────────────────────────────────────────
interface Candle {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

interface DPPrint {
  price: number
  size: number
  ts: number
}

interface DPDay {
  date: string
  top10: DPPrint[]
  totalNotional: number
  topPrint: DPPrint
}

interface POILevel {
  price: number
  totalNotional: number
  printCount: number
  dates: string[]
}

type PhaseKey = 'idle' | 'candles' | 'darkpool' | 'done' | 'error'

interface SymbolState {
  candles: Candle[]
  dpDays: DPDay[]
  poiLevels: POILevel[]
  phase: PhaseKey
  progress: number
  error: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatNotional(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

type RawTrade = { sip_timestamp: number; price: number; size: number; exchange: number }

// Cluster nearby POI price levels (within 0.75%) to aggregate institutional interest
function clusterPOI(dpDays: DPDay[]): POILevel[] {
  const prints: Array<{ price: number; notional: number; date: string }> = []
  for (const day of dpDays) {
    for (const p of day.top10) {
      prints.push({ price: p.price, notional: p.size * p.price, date: day.date })
    }
  }
  if (!prints.length) return []
  prints.sort((a, b) => a.price - b.price)

  const clusters: POILevel[] = []
  let i = 0
  while (i < prints.length) {
    const ref = prints[i].price
    const thr = ref * 0.0075
    const group: typeof prints = []
    while (i < prints.length && Math.abs(prints[i].price - ref) <= thr) {
      group.push(prints[i])
      i++
    }
    clusters.push({
      price: group.reduce((s, p) => s + p.price, 0) / group.length,
      totalNotional: group.reduce((s, p) => s + p.notional, 0),
      printCount: group.length,
      dates: [...new Set(group.map((p) => p.date))].sort().slice(-3),
    })
  }
  return clusters.sort((a, b) => b.totalNotional - a.totalNotional).slice(0, 5)
}

// ─── Canvas Mini Chart ────────────────────────────────────────────────────────
function POIMiniChart({ candles, dpDays }: { candles: Candle[]; dpDays: DPDay[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const crosshairRef = useRef<{ cx: number; cy: number } | null>(null)
  const [width, setWidth] = useState(460)
  const [height, setHeight] = useState(560)

  // View state — mutated directly by event handlers without triggering re-renders
  const viewRef = useRef({ startIdx: 0, visibleCount: Math.max(candles.length, 10) })

  useEffect(() => {
    if (!containerRef.current) return
    console.log('[POI] ResizeObserver init — clientW:', containerRef.current.clientWidth, 'clientH:', containerRef.current.clientHeight)
    const obs = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      console.log('[POI] ResizeObserver fired — w:', rect?.width, 'h:', rect?.height)
      if (rect?.width > 0) setWidth(Math.floor(rect.width))
      if (rect?.height > 0) setHeight(Math.floor(rect.height))
    })
    obs.observe(containerRef.current)
    if (containerRef.current.clientWidth > 0) setWidth(containerRef.current.clientWidth)
    if (containerRef.current.clientHeight > 0) setHeight(containerRef.current.clientHeight)
    return () => obs.disconnect()
  }, [])

  // ── Draw function ─────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    console.log('[POI] draw() called — candles:', candles.length, 'dpDays:', dpDays.length, 'width:', width, 'height:', height, 'canvas:', !!canvasRef.current)
    const canvas = canvasRef.current
    if (!canvas || candles.length === 0) {
      console.log('[POI] draw() early exit — canvas:', !!canvas, 'candles.length:', candles.length)
      return
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      console.log('[POI] draw() early exit — no ctx')
      return
    }

    const PAD = { top: 14, right: 96, bottom: 42, left: 6 }
    const chartW = width - PAD.left - PAD.right
    const chartH = height - PAD.top - PAD.bottom
    console.log('[POI] draw() — chartW:', chartW, 'chartH:', chartH)

    // Clamp view window
    const n = candles.length
    let { startIdx, visibleCount } = viewRef.current
    visibleCount = Math.max(10, Math.min(n, visibleCount))
    startIdx = Math.max(0, Math.min(n - visibleCount, startIdx))
    viewRef.current = { startIdx, visibleCount }
    const vis = candles.slice(startIdx, startIdx + visibleCount)

    // Retina scaling
    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    ctx.scale(dpr, dpr)

    // Background — glossy deep gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 0, height)
    bgGrad.addColorStop(0, '#03080f')
    bgGrad.addColorStop(1, '#000000')
    ctx.fillStyle = bgGrad
    ctx.fillRect(0, 0, width, height)

    // Price range from visible candles
    const allP = vis.flatMap((c) => [c.high, c.low])
    const rawMin = Math.min(...allP)
    const rawMax = Math.max(...allP)
    const padP = (rawMax - rawMin) * 0.06
    const pMin = rawMin - padP
    const pMax = rawMax + padP
    const pRange = pMax - pMin
    const pyFn = (p: number) => PAD.top + ((pMax - p) / pRange) * chartH

    // Candle layout — INNER gutter keeps first/last candle away from borders
    const vc = vis.length
    const INNER = 18 // px gap on each side inside the chart area
    const candleSpacing = (chartW - INNER * 2) / vc
    const bw = Math.max(1.5, candleSpacing * 0.62)
    const cxFn = (i: number) => PAD.left + INNER + i * candleSpacing + candleSpacing / 2

    // Grid — subtle cyan-tinted lines
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

    // Y-axis border — subtle glow line
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
    ctx.globalAlpha = 1

    // Current price — gold dashed with glow (only when newest candle is visible)
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
    const xLabelIdxs = [0, Math.floor(vc * 0.33), Math.floor(vc * 0.67), vc - 1].filter(
      (v, i, a) => a.indexOf(v) === i && v < vc
    )
    ctx.fillStyle = '#FFFFFF'
    ctx.font = `700 18px "JetBrains Mono", monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    for (const i of xLabelIdxs) {
      ctx.fillText(formatDateLabel(vis[i].date), cxFn(i), height - PAD.bottom + 5)
    }

    // ── VolumeLeaders-style bubbles — exact copy of EFICharting ──────────────
    // Rank is computed from ALL fetched days (global), bubbles only drawn if visible
    const candleDurationMs = 86_400_000

    type DayEntry = {
      price: number
      size: number
      ts: number
      notional: number
      globalRank: number
    }
    const daysSorted = dpDays
      .filter((dp) => dp?.totalNotional > 0 && dp?.topPrint)
      .sort((a, b) => b.totalNotional - a.totalNotional)
    const globalTop5: DayEntry[] = daysSorted.slice(0, 5).map((dp, i) => ({
      price: dp.topPrint.price,
      size: dp.topPrint.size,
      ts: dp.topPrint.ts,
      notional: dp.totalNotional,
      globalRank: i,
    }))
    const globalMaxNotional = globalTop5.length > 0 ? globalTop5[0].notional : 1

    ctx.save()
    for (const print of globalTop5) {
      const idx = vis.findIndex((c) => {
        const dayStart = Date.parse(c.date + 'T00:00:00Z')
        return print.ts >= dayStart && print.ts < dayStart + candleDurationMs
      })
      if (idx === -1) continue

      const cx = cxFn(idx)
      const printY = pyFn(print.price)
      if (printY < PAD.top || printY > PAD.top + chartH) continue

      const notional = print.notional
      const r = Math.max(3.75, Math.min(22.5, Math.sqrt(notional / globalMaxNotional) * 22.5))

      // Bubble style per rank: 0=orange, 1=blue, 2=white, 3=gray, 4=faded gray
      type BubbleStyle = {
        base: [string, string, string]
        rim: string
        dot: string
        gloss: [string, string]
        lw: number
      }
      const BUBBLE_STYLES: BubbleStyle[] = [
        // #1 orange
        {
          base: ['rgba(255,160,40,0.75)', 'rgba(220,100,10,0.60)', 'rgba(140,50,0,0.40)'],
          rim: 'rgba(255,180,60,0.80)',
          dot: 'rgba(255,120,0,0.95)',
          gloss: ['rgba(255,255,255,0.72)', 'rgba(255,255,255,0.18)'],
          lw: 1.2,
        },
        // #2 blue
        {
          base: ['rgba(80,180,255,0.70)', 'rgba(20,120,210,0.55)', 'rgba(0,60,140,0.35)'],
          rim: 'rgba(100,200,255,0.75)',
          dot: 'rgba(41,182,246,0.95)',
          gloss: ['rgba(255,255,255,0.65)', 'rgba(255,255,255,0.15)'],
          lw: 1.0,
        },
        // #3 white
        {
          base: ['rgba(245,245,245,0.80)', 'rgba(195,195,195,0.62)', 'rgba(110,110,110,0.35)'],
          rim: 'rgba(255,255,255,0.85)',
          dot: 'rgba(225,225,225,0.95)',
          gloss: ['rgba(255,255,255,0.80)', 'rgba(255,255,255,0.22)'],
          lw: 1.0,
        },
        // #4 gray
        {
          base: ['rgba(160,160,160,0.70)', 'rgba(100,100,100,0.52)', 'rgba(50,50,50,0.30)'],
          rim: 'rgba(185,185,185,0.72)',
          dot: 'rgba(145,145,145,0.92)',
          gloss: ['rgba(255,255,255,0.50)', 'rgba(255,255,255,0.12)'],
          lw: 0.9,
        },
        // #5 faded gray
        {
          base: ['rgba(115,115,115,0.48)', 'rgba(75,75,75,0.32)', 'rgba(35,35,35,0.15)'],
          rim: 'rgba(145,145,145,0.45)',
          dot: 'rgba(100,100,100,0.72)',
          gloss: ['rgba(255,255,255,0.32)', 'rgba(255,255,255,0.06)'],
          lw: 0.8,
        },
      ]
      const s = BUBBLE_STYLES[Math.min(print.globalRank, 4)]
      // Base fill
      const basGrad = ctx.createRadialGradient(cx, printY, r * 0.1, cx, printY, r)
      basGrad.addColorStop(0, s.base[0])
      basGrad.addColorStop(0.5, s.base[1])
      basGrad.addColorStop(1, s.base[2])
      ctx.beginPath()
      ctx.arc(cx, printY, r, 0, Math.PI * 2)
      ctx.fillStyle = basGrad
      ctx.fill()
      // Rim
      ctx.strokeStyle = s.rim
      ctx.lineWidth = s.lw
      ctx.stroke()
      // Gloss highlight
      const glossGrad = ctx.createRadialGradient(
        cx - r * 0.3,
        printY - r * 0.35,
        r * 0.05,
        cx - r * 0.1,
        printY - r * 0.2,
        r * 0.55
      )
      glossGrad.addColorStop(0, s.gloss[0])
      glossGrad.addColorStop(0.5, s.gloss[1])
      glossGrad.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.beginPath()
      ctx.arc(cx, printY, r, 0, Math.PI * 2)
      ctx.fillStyle = glossGrad
      ctx.fill()
      // Center dot
      ctx.beginPath()
      ctx.arc(cx, printY, Math.max(2, r * 0.17), 0, Math.PI * 2)
      ctx.fillStyle = s.dot
      ctx.fill()
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
  }, [candles, dpDays, width, height])

  // Reset view when data/size changes, then draw
  useEffect(() => {
    console.log('[POI] draw useEffect triggered — candles:', candles.length, 'width:', width, 'height:', height)
    viewRef.current = { startIdx: 0, visibleCount: Math.max(candles.length, 10) }
    draw()
  }, [candles, dpDays, width, height, draw])

  // ── Interaction: wheel-zoom + pointer-drag ────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || candles.length === 0) return

    const PAD_LEFT = 6
    const PAD_RIGHT = 96

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      const n = candles.length
      const { startIdx, visibleCount } = viewRef.current
      // Zoom in (scroll up) or out (scroll down)
      const factor = e.deltaY > 0 ? 1.15 : 0.87
      let newVC = Math.round(visibleCount * factor)
      newVC = Math.max(10, Math.min(n, newVC))
      // Anchor zoom around cursor position
      const rect = canvas.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const chartW = width - PAD_LEFT - PAD_RIGHT
      const frac = Math.max(0, Math.min(1, (mouseX - PAD_LEFT) / chartW))
      let newStart = Math.round(startIdx + frac * visibleCount - frac * newVC)
      newStart = Math.max(0, Math.min(n - newVC, newStart))
      viewRef.current = { startIdx: newStart, visibleCount: newVC }
      draw()
    }

    let isDragging = false
    let dragStartX = 0
    let dragStartIdx = 0

    const handlePointerDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId)
      isDragging = true
      dragStartX = e.clientX
      dragStartIdx = viewRef.current.startIdx
      canvas.style.cursor = 'grabbing'
    }

    const handlePointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      crosshairRef.current = { cx: e.clientX - rect.left, cy: e.clientY - rect.top }
      if (!isDragging) {
        draw()
        return
      }
      const { visibleCount } = viewRef.current
      const chartW = width - PAD_LEFT - PAD_RIGHT
      const candlesPerPx = visibleCount / chartW
      const delta = Math.round((dragStartX - e.clientX) * candlesPerPx)
      let newStart = dragStartIdx + delta
      newStart = Math.max(0, Math.min(candles.length - visibleCount, newStart))
      viewRef.current = { ...viewRef.current, startIdx: newStart }
      draw()
    }

    const handlePointerUp = () => {
      isDragging = false
      canvas.style.cursor = 'grab'
    }

    const handlePointerLeave = () => {
      crosshairRef.current = null
      draw()
    }

    canvas.style.cursor = 'grab'
    canvas.addEventListener('wheel', handleWheel, { passive: false })
    canvas.addEventListener('pointerdown', handlePointerDown)
    canvas.addEventListener('pointermove', handlePointerMove)
    canvas.addEventListener('pointerup', handlePointerUp)
    canvas.addEventListener('pointercancel', handlePointerUp)
    canvas.addEventListener('pointerleave', handlePointerLeave)

    return () => {
      canvas.removeEventListener('wheel', handleWheel)
      canvas.removeEventListener('pointerdown', handlePointerDown)
      canvas.removeEventListener('pointermove', handlePointerMove)
      canvas.removeEventListener('pointerup', handlePointerUp)
      canvas.removeEventListener('pointercancel', handlePointerUp)
      canvas.removeEventListener('pointerleave', handlePointerLeave)
    }
  }, [candles, draw, width])

  if (candles.length === 0)
    return (
      <div ref={containerRef} style={{ height, background: '#000' }}>
        <div
          style={{
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#FFFFFF',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '13px',
            fontWeight: '700',
          }}
        >
          NO DATA
        </div>
      </div>
    )

  return (
    <div ref={containerRef} style={{ lineHeight: 0, position: 'relative', height: `${height}px` }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', top: 0, left: 0, display: 'block' }} />
    </div>
  )
}

// ─── POI Level Table ──────────────────────────────────────────────────────────
function POITable({ poiLevels, currentPrice }: { poiLevels: POILevel[]; currentPrice: number }) {
  const maxNot = poiLevels[0]?.totalNotional ?? 1
  return (
    <div style={{ marginTop: '12px' }}>
      {/* Table header */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '28px 1fr 1fr 80px 1fr',
          gap: '0',
          padding: '6px 10px',
          background: '#0A0A0A',
          borderTop: '1px solid #1E1E1E',
          borderBottom: '1px solid #1E1E1E',
        }}
      >
        {['#', 'PRICE', 'NOTIONAL', 'PRINTS', 'LAST SEEN'].map((h) => (
          <div
            key={h}
            style={{
              fontSize: '9px',
              fontWeight: '800',
              color: '#FFFFFF',
              fontFamily: 'JetBrains Mono, monospace',
              letterSpacing: '0.8px',
              textTransform: 'uppercase',
            }}
          >
            {h}
          </div>
        ))}
      </div>

      {poiLevels.length === 0 && (
        <div
          style={{
            padding: '14px 10px',
            fontSize: '11px',
            fontWeight: '700',
            color: '#FFFFFF',
            fontFamily: 'JetBrains Mono, monospace',
          }}
        >
          NO DARK POOL PRINTS DETECTED
        </div>
      )}

      {poiLevels.map((lv, li) => {
        const barW = Math.round((lv.totalNotional / maxNot) * 100)
        const abovePrice = lv.price > currentPrice
        const pctFromCurrent = ((lv.price - currentPrice) / currentPrice) * 100
        const isTop = li === 0
        return (
          <div
            key={li}
            style={{
              position: 'relative',
              display: 'grid',
              gridTemplateColumns: '28px 1fr 1fr 80px 1fr',
              gap: '0',
              padding: '7px 10px',
              borderBottom: '1px solid #0F0F0F',
              background: isTop ? 'rgba(0,229,255,0.04)' : 'transparent',
              alignItems: 'center',
            }}
          >
            {/* Notional bar background */}
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: `${barW}%`,
                background: 'rgba(0,229,255,0.04)',
                pointerEvents: 'none',
              }}
            />

            {/* Rank */}
            <div
              style={{
                fontSize: '10px',
                fontWeight: isTop ? '800' : '600',
                color: isTop ? '#00E5FF' : '#FFFFFF',
                fontFamily: 'JetBrains Mono, monospace',
                position: 'relative',
              }}
            >
              {li + 1}
            </div>

            {/* Price */}
            <div
              style={{
                fontSize: '12px',
                fontWeight: '700',
                color: abovePrice ? '#00FF88' : '#FF073A',
                fontFamily: 'JetBrains Mono, monospace',
                position: 'relative',
              }}
            >
              ${lv.price.toFixed(2)}
              <span
                style={{
                  marginLeft: '6px',
                  fontSize: '9px',
                  fontWeight: '600',
                  color: abovePrice ? '#00FF88' : '#FF073A',
                  opacity: 0.85,
                }}
              >
                {pctFromCurrent >= 0 ? '+' : ''}
                {pctFromCurrent.toFixed(1)}%
              </span>
            </div>

            {/* Notional */}
            <div
              style={{
                fontSize: '12px',
                fontWeight: isTop ? '800' : '700',
                color: isTop ? '#00E5FF' : '#FFFFFF',
                fontFamily: 'JetBrains Mono, monospace',
                position: 'relative',
              }}
            >
              {formatNotional(lv.totalNotional)}
            </div>

            {/* Print count */}
            <div
              style={{
                fontSize: '11px',
                fontWeight: '600',
                color: '#FFFFFF',
                fontFamily: 'JetBrains Mono, monospace',
                position: 'relative',
              }}
            >
              {lv.printCount}x
            </div>

            {/* Last seen */}
            <div
              style={{
                fontSize: '10px',
                fontWeight: '600',
                color: '#FFFFFF',
                fontFamily: 'JetBrains Mono, monospace',
                position: 'relative',
              }}
            >
              {lv.dates.length > 0 ? formatDateLabel(lv.dates[lv.dates.length - 1]) : '—'}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Loading State ────────────────────────────────────────────────────────────
function SymbolCard({ symbol, state }: { symbol: POISymbol; state: SymbolState }) {
  const candles = state.candles ?? []
  const latestClose = candles[candles.length - 1]?.close ?? 0
  const prevClose =
    candles.length > 1 ? candles[candles.length - 2].close : latestClose
  const changePct = prevClose ? ((latestClose - prevClose) / prevClose) * 100 : 0
  const totalDPFlow = (state.dpDays ?? []).reduce((s, d) => s + d.totalNotional, 0)

  const accentColor = '#00E5FF'

  return (
    <div
      style={{
        background: 'linear-gradient(160deg, #020c14 0%, #000000 50%, #010810 100%)',
        border: `1px solid ${state.phase === 'done' ? 'rgba(0,229,255,0.2)' : 'rgba(255,255,255,0.04)'}`,
        borderTop: `2px solid ${state.phase === 'done' ? accentColor : '#222'}`,
        boxShadow:
          state.phase === 'done'
            ? 'inset 0 1px 0 rgba(0,229,255,0.06), 0 0 24px rgba(0,229,255,0.04)'
            : 'none',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative',
        height: '100%',
      }}
    >
      {/* Card header */}
      <div
        style={{
          padding: '12px 14px 10px',
          borderBottom: '1px solid #0F0F0F',
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: '8px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
          <span
            style={{
              fontSize: '20px',
              fontWeight: '800',
              color: '#FFFFFF',
              fontFamily: 'JetBrains Mono, monospace',
              letterSpacing: '2px',
            }}
          >
            {symbol}
          </span>
          {state.phase === 'done' && latestClose > 0 && (
            <>
              <span
                style={{
                  fontSize: '16px',
                  fontWeight: '700',
                  color: '#FFFFFF',
                  fontFamily: 'JetBrains Mono, monospace',
                }}
              >
                ${latestClose.toFixed(2)}
              </span>
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: '700',
                  color: changePct >= 0 ? '#00FF88' : '#FF073A',
                  fontFamily: 'JetBrains Mono, monospace',
                }}
              >
                {changePct >= 0 ? '+' : ''}
                {changePct.toFixed(2)}%
              </span>
            </>
          )}
        </div>

        {/* Status pill */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          {state.phase === 'done' && totalDPFlow > 0 && (
            <span
              style={{
                fontSize: '10px',
                fontWeight: '700',
                fontFamily: 'JetBrains Mono, monospace',
                color: '#00E5FF',
                letterSpacing: '0.5px',
              }}
            >
              {formatNotional(totalDPFlow)} DETECTED
            </span>
          )}
          {(state.phase === 'candles' || state.phase === 'darkpool') && (
            <span
              style={{
                fontSize: '10px',
                fontWeight: '700',
                fontFamily: 'JetBrains Mono, monospace',
                color: '#FFFFFF',
                letterSpacing: '0.5px',
              }}
            >
              {state.phase === 'candles' ? 'LOADING PRICE DATA' : `SCANNING ${state.progress}%`}
            </span>
          )}
        </div>
      </div>

      {/* Progress bar (visible during loading) */}
      {(state.phase === 'candles' || state.phase === 'darkpool') && (
        <div
          style={{
            height: '2px',
            background: '#0A0A0A',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: state.phase === 'candles' ? '15%' : `${15 + state.progress * 0.85}%`,
              background: 'linear-gradient(90deg, #00E5FF, #0099CC)',
              transition: 'width 0.4s ease',
            }}
          />
        </div>
      )}

      {/* Loading skeleton */}
      {(state.phase === 'idle' || state.phase === 'candles' || state.phase === 'darkpool') && (
        <div
          style={{
            height: '620px',
          }}
        >
          {/* Animated scan lines */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '70%' }}>
            {[100, 70, 85, 55, 90].map((w, i) => (
              <div
                key={i}
                style={{
                  height: '8px',
                  background: '#0A0A0A',
                  borderRadius: '2px',
                  overflow: 'hidden',
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    height: '100%',
                    width: `${w}%`,
                    background: 'linear-gradient(90deg, #111 0%, #1E2830 50%, #111 100%)',
                    backgroundSize: '200% 100%',
                    animation: 'shimmer 1.5s infinite',
                  }}
                />
              </div>
            ))}
          </div>
          <div
            style={{
              fontSize: '11px',
              fontWeight: '700',
              color: '#FFFFFF',
              fontFamily: 'JetBrains Mono, monospace',
              letterSpacing: '1px',
            }}
          >
            {state.phase === 'idle'
              ? 'INITIALIZING'
              : state.phase === 'candles'
                ? 'FETCHING OHLCV'
                : `SCANNING FINRA TRF — ${state.progress}%`}
          </div>
        </div>
      )}

      {/* Error state */}
      {state.phase === 'error' && (
        <div
          style={{
            height: '620px',
          }}
        >
          <div
            style={{
              fontSize: '12px',
              fontWeight: '700',
              color: '#FF073A',
              fontFamily: 'JetBrains Mono, monospace',
              textAlign: 'center',
            }}
          >
            {state.error ?? 'FETCH ERROR'}
          </div>
        </div>
      )}

      {/* Chart + table */}
      {state.phase === 'done' && (() => { console.log('[POI] SymbolCard rendering done state — symbol:', symbol, 'candles:', state.candles.length, 'dpDays:', state.dpDays.length); return true; })() && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {/* Legend dots above chart */}
          <div
            style={{
              display: 'flex',
              gap: '16px',
              padding: '8px 14px 4px',
              alignItems: 'center',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <svg width="14" height="14" style={{ flexShrink: 0 }}>
                <circle
                  cx="7"
                  cy="7"
                  r="6"
                  fill="rgba(255,120,0,0.85)"
                  stroke="rgba(255,180,60,0.8)"
                  strokeWidth="1.2"
                />
                <circle cx="7" cy="7" r="1.2" fill="rgba(255,120,0,0.95)" />
              </svg>
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: '700',
                  color: '#FFFFFF',
                  fontFamily: 'JetBrains Mono, monospace',
                  letterSpacing: '0.5px',
                }}
              >
                #1 PRINT
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <svg width="14" height="14" style={{ flexShrink: 0 }}>
                <circle
                  cx="7"
                  cy="7"
                  r="6"
                  fill="rgba(20,120,210,0.75)"
                  stroke="rgba(100,200,255,0.75)"
                  strokeWidth="1"
                />
                <circle cx="7" cy="7" r="1.1" fill="rgba(41,182,246,0.95)" />
              </svg>
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: '700',
                  color: '#FFFFFF',
                  fontFamily: 'JetBrains Mono, monospace',
                  letterSpacing: '0.5px',
                }}
              >
                #2–5 PRINTS
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <svg width="18" height="2">
                <line
                  x1="0"
                  y1="1"
                  x2="18"
                  y2="1"
                  stroke="#FFD700"
                  strokeWidth="1"
                  strokeDasharray="5,3"
                />
              </svg>
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: '700',
                  color: '#FFFFFF',
                  fontFamily: 'JetBrains Mono, monospace',
                  letterSpacing: '0.5px',
                }}
              >
                CURRENT
              </span>
            </div>
            <div
              style={{
                marginLeft: 'auto',
                fontSize: '12px',
                fontWeight: '600',
                color: '#FFFFFF',
                fontFamily: 'JetBrains Mono, monospace',
              }}
            >
              {LOOKBACK_DAYS}D LOOKBACK · {state.dpDays.length} DAYS SCANNED
            </div>
          </div>

          {/* The chart */}
          <div
            style={{
              flex: 1,
              padding: '0 6px',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
            }}
          >
            <POIMiniChart candles={state.candles} dpDays={state.dpDays} />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Screener ────────────────────────────────────────────────────────────
export default function POIScreener({ externalTicker }: { externalTicker?: string } = {}) {
  const API_KEY = process.env.NEXT_PUBLIC_POLYGON_API_KEY ?? ''

  const activeSymbols: POISymbol[] = externalTicker
    ? [externalTicker.toUpperCase()]
    : [...POI_SYMBOLS]

  const initialState = (): SymbolState => ({
    candles: [],
    dpDays: [],
    poiLevels: [],
    phase: 'idle',
    progress: 0,
    error: null,
  })

  const [data, setData] = useState<Record<POISymbol, SymbolState>>(
    () =>
      Object.fromEntries(activeSymbols.map((s) => [s, initialState()])) as Record<
        POISymbol,
        SymbolState
      >
  )

  const abortRef = useRef<Record<POISymbol, AbortController | null>>(
    Object.fromEntries(activeSymbols.map((s) => [s, null])) as Record<
      POISymbol,
      AbortController | null
    >
  )

  const setSymbolState = useCallback((symbol: POISymbol, patch: Partial<SymbolState>) => {
    setData((prev) => ({
      ...prev,
      [symbol]: { ...prev[symbol], ...patch },
    }))
  }, [])

  const fetchSymbol = useCallback(
    async (symbol: POISymbol) => {
      // Abort any previous run for this symbol
      abortRef.current[symbol]?.abort()
      const controller = new AbortController()
      abortRef.current[symbol] = controller
      const { signal } = controller

      setSymbolState(symbol, { phase: 'candles', progress: 0, error: null })

      try {
        // ── 1. Fetch daily OHLCV (not in EFICharting — needed for chart) ──
        const endDate = new Date().toISOString().split('T')[0]
        const startD = new Date()
        startD.setDate(startD.getDate() - Math.ceil(LOOKBACK_DAYS * 1.5))
        const startDate = startD.toISOString().split('T')[0]

        const ohlcvRes = await fetch(
          `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${startDate}/${endDate}?adjusted=true&sort=asc&limit=200&apiKey=${API_KEY}`,
          { signal }
        )
        if (!ohlcvRes.ok) throw new Error(`OHLCV HTTP ${ohlcvRes.status}`)
        const ohlcvJson = await ohlcvRes.json()

        const candles: Candle[] = (ohlcvJson.results ?? [])
          .slice(-LOOKBACK_DAYS - 2)
          .map((r: any) => ({
            date: new Date(r.t).toISOString().split('T')[0],
            open: r.o,
            high: r.h,
            low: r.l,
            close: r.c,
            volume: r.v ?? 0,
          }))

        if (signal.aborted) return
        if (candles.length === 0) throw new Error('NO OHLCV DATA')

        setSymbolState(symbol, { candles, phase: 'darkpool', progress: 0 })

        // ── 2. Dark pool fetch — exact copy of EFICharting useEffect body ──
        // Uses aborted boolean + local closures exactly as EFICharting does.
        const API_KEY_LOCAL = API_KEY
        let aborted = false

        // Cleanup: when AbortController fires, set aborted=true (mirrors EFICharting's cleanup `aborted = true`)
        signal.addEventListener('abort', () => {
          aborted = true
        })

        // Dark pool queue = last 90 confirmed trading days only — same as EFICharting's 90-day window.
        // candles may have up to 365 entries (for the chart), but bubbles/POI always use only the last 90.
        const daysToShow: string[] = candles.slice(-LOOKBACK_DAYS).map((c) => c.date)

        // fetchWindow — exact copy of EFICharting (no try/catch, no signal, reads aborted closure)
        const fetchWindow = async (urlStart: string): Promise<RawTrade[]> => {
          const trades: RawTrade[] = []
          let url: string | null = urlStart
          while (url && !aborted) {
            const res: Response = await fetch(url)
            if (!res.ok) break
            const json: { results?: RawTrade[]; next_url?: string } = await res.json()
            const page: RawTrade[] = json.results || []
            for (const t of page) trades.push(t)
            url = json.next_url ? json.next_url + `&apiKey=${API_KEY_LOCAL}` : null
          }
          return trades
        }

        // fetchDayAll — exact copy of EFICharting, only config.symbol → symbol
        const fetchDayAll = async (dateKey: string) => {
          const dayStartMs = new Date(dateKey).getTime() // midnight UTC

          const d = new Date(dateKey + 'T12:00:00Z')
          const yr = d.getUTCFullYear()
          const marchSecondSun = new Date(Date.UTC(yr, 2, 8))
          while (marchSecondSun.getUTCDay() !== 0)
            marchSecondSun.setUTCDate(marchSecondSun.getUTCDate() + 1)
          const novFirstSun = new Date(Date.UTC(yr, 10, 1))
          while (novFirstSun.getUTCDay() !== 0) novFirstSun.setUTCDate(novFirstSun.getUTCDate() + 1)
          const isEDT = d >= marchSecondSun && d < novFirstSun
          const etOffsetMs = isEDT ? 4 * 3600_000 : 5 * 3600_000
          const rthOpenUtcMs = 9 * 3600_000 + 30 * 60_000 + etOffsetMs
          const rthCloseUtcMs = 16 * 3600_000 + 15 * 60_000 + etOffsetMs // 4:15 PM ET — captures block prints reported to FINRA TRF just after close
          const rthStartNs = (dayStartMs + rthOpenUtcMs) * 1_000_000
          const rthEndNs = (dayStartMs + rthCloseUtcMs) * 1_000_000

          const WIN = 4
          const rthDurationNs = rthEndNs - rthStartNs
          const winNs = rthDurationNs / WIN
          const windowUrls = Array.from({ length: WIN }, (_, i) => {
            const wStartNs = rthStartNs + i * winNs
            const wEndNs = rthStartNs + (i + 1) * winNs
            return `https://api.polygon.io/v3/trades/${symbol}?timestamp.gte=${wStartNs}&timestamp.lte=${wEndNs}&limit=50000&order=asc&apiKey=${API_KEY_LOCAL}`
          })

          try {
            const windowResults = await Promise.all(windowUrls.map(fetchWindow))
            const allTrades: RawTrade[] = ([] as RawTrade[]).concat(...windowResults)

            if (allTrades.length === 0) return null

            const dpTrades: RawTrade[] = []
            for (const t of allTrades) {
              const isDp = DARK_POOL_EXCHANGES.has(t.exchange)
              const isLitBlock = !isDp && t.size * t.price >= LIT_BLOCK_MIN_NOTIONAL
              if (isDp || isLitBlock) dpTrades.push(t)
            }
            if (dpTrades.length === 0) return null

            const totalNotional = dpTrades.reduce((sum, t) => sum + t.size * t.price, 0)

            const sortedByNotional = dpTrades
              .slice()
              .sort((a, b) => b.size * b.price - a.size * a.price)

            const rawTop = sortedByNotional[0]
            const topPrint = {
              price: rawTop.price,
              size: rawTop.size,
              ts: Math.floor(rawTop.sip_timestamp / 1_000_000),
            }

            const top10 = sortedByNotional.slice(0, 10).map((t) => ({
              price: t.price,
              size: t.size,
              ts: Math.floor(t.sip_timestamp / 1_000_000),
            }))

            return { dateKey, result: { top10, totalNotional, topPrint } }
          } catch {
            return null
          }
        }

        // run — exact copy of EFICharting worker-pool pattern
        // Optimisations (result-neutral):
        //   • CONCURRENCY raised 10→20 — safe because symbols run sequentially (1×20×4=80 connections max)
        //   • Progress state only committed when percentage moves ≥5% — cuts React re-renders from ~90→~20
        //   • sessionStorage cache per day: historical days are immutable, so serve from cache on repeat scans.
        //     Today's partial day is never cached so live data always comes through.
        const SESSION_PREFIX = `poi_dp_${symbol}_`
        const todayKey = new Date().toISOString().split('T')[0]

        const readCache = (dk: string): DPDay | null => {
          if (dk === todayKey) return null // never cache today
          try {
            const raw = sessionStorage.getItem(SESSION_PREFIX + dk)
            return raw ? (JSON.parse(raw) as DPDay) : null
          } catch { return null }
        }
        const writeCache = (dk: string, day: DPDay) => {
          if (dk === todayKey) return
          try { sessionStorage.setItem(SESSION_PREFIX + dk, JSON.stringify(day)) } catch { /* quota */ }
        }

        const dpCache: Record<string, DPDay> = {}
        const run = async () => {
          const CONCURRENCY = 35

          // Serve cached days instantly — only queue days that need a real fetch
          const uncachedDays: string[] = []
          for (const dk of daysToShow) {
            const cached = readCache(dk)
            if (cached) {
              dpCache[dk] = cached
            } else {
              uncachedDays.push(dk)
            }
          }

          const queue = [...uncachedDays]
          const total = daysToShow.length
          let done = total - uncachedDays.length // cached days count as already done
          let lastReportedPct = -1

          const maybeReportProgress = () => {
            const pct = Math.round((done / total) * 100)
            if (pct - lastReportedPct >= 5) {
              lastReportedPct = pct
              setSymbolState(symbol, { progress: pct })
            }
          }

          // Immediately report progress for the cached days
          maybeReportProgress()

          const worker = async () => {
            while (queue.length > 0 && !aborted) {
              const dk = queue.shift()!
              const r = await fetchDayAll(dk)
              if (r && !aborted) {
                const day: DPDay = {
                  date: r.dateKey,
                  top10: r.result.top10,
                  totalNotional: r.result.totalNotional,
                  topPrint: r.result.topPrint,
                }
                dpCache[r.dateKey] = day
                writeCache(r.dateKey, day)
              }
              done++
              maybeReportProgress()
            }
          }

          await Promise.all(Array.from({ length: Math.min(CONCURRENCY, Math.max(1, uncachedDays.length)) }, worker))

          if (!aborted) {
            const dpDays = Object.values(dpCache).sort((a, b) => a.date.localeCompare(b.date))
            const poiLevels = clusterPOI(dpDays)
            console.log('[POI] fetch done — symbol:', symbol, 'candles:', candles.length, 'dpDays:', dpDays.length, 'poiLevels:', poiLevels.length)
            setSymbolState(symbol, { dpDays, poiLevels, phase: 'done', progress: 100 })
          }
        }

        await run()
      } catch (err: any) {
        if (signal.aborted) return
        setSymbolState(symbol, { phase: 'error', error: err?.message ?? 'UNKNOWN ERROR' })
      }
    },
    [API_KEY, setSymbolState]
  )

  // Auto-fetch all symbols on mount — sequential so each gets the full 10-worker pool
  // without sharing Polygon quota with sibling fetches (running 3×10 concurrently causes silent rate-limit failures)
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      for (const sym of activeSymbols) {
        if (cancelled) break
        await fetchSymbol(sym)
      }
    }
    run()
    return () => {
      cancelled = true
      activeSymbols.forEach((sym) => abortRef.current[sym]?.abort())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchSymbol, externalTicker])

  const handleRefresh = () => {
    const run = async () => {
      for (const sym of activeSymbols) {
        await fetchSymbol(sym)
      }
    }
    run()
  }

  const allDone = activeSymbols.every(
    (s) => data[s]?.phase === 'done' || data[s]?.phase === 'error'
  )

  return (
    <div
      style={{
        background: 'linear-gradient(160deg, #02060e 0%, #000000 60%, #000d18 100%)',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'JetBrains Mono, monospace',
      }}
    >
      {/* CSS for shimmer + glow */}
      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>

      {/* ── Header bar ── */}
      {!externalTicker && (
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(0,229,255,0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(90deg, rgba(0,229,255,0.04) 0%, transparent 60%)',
            boxShadow: '0 1px 0 rgba(0,229,255,0.06)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {/* Title block */}
            <div>
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: '700',
                  color: '#00E5FF',
                  letterSpacing: '3px',
                  textTransform: 'uppercase',
                  marginBottom: '3px',
                  textShadow: '0 0 12px rgba(0,229,255,0.5)',
                }}
              >
                FINRA POI DATA
              </div>
              <div
                style={{
                  fontSize: '22px',
                  fontWeight: '800',
                  color: '#FFFFFF',
                  letterSpacing: '3px',
                  textShadow: '0 0 20px rgba(255,255,255,0.12)',
                }}
              >
                POINTS OF INTEREST
              </div>
            </div>
          </div>

          {/* Refresh button */}
          <button
            onClick={handleRefresh}
            disabled={!allDone}
            style={{
              background: allDone ? '#000000' : '#0A0A0A',
              border: `1px solid ${allDone ? '#00E5FF' : '#333'}`,
              color: allDone ? '#00E5FF' : '#FFFFFF',
              padding: '8px 18px',
              fontSize: '11px',
              fontWeight: '800',
              fontFamily: 'JetBrains Mono, monospace',
              cursor: allDone ? 'pointer' : 'not-allowed',
              letterSpacing: '1px',
              opacity: allDone ? 1 : 0.4,
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              if (allDone) {
                e.currentTarget.style.background = 'rgba(0,229,255,0.08)'
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#000000'
            }}
          >
            {allDone ? '↻ REFRESH' : 'SCANNING...'}
          </button>
        </div>
      )}

      {/* ── 2-column card grid ── */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minHeight: 0,
          gap: '2px',
          background: 'rgba(0,229,255,0.06)',
          padding: '2px',
        }}
      >
        {activeSymbols.map((sym) => (
          <SymbolCard
            key={sym}
            symbol={sym}
            state={
              data[sym] ?? {
                candles: [],
                dpDays: [],
                poiLevels: [],
                phase: 'idle',
                progress: 0,
                error: null,
              }
            }
          />
        ))}
      </div>
    </div>
  )
}
