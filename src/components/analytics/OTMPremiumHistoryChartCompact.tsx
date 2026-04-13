'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'

interface HistoryDataPoint {
  date: string
  snapLabel?: string
  stockPrice: number
  open: number
  high: number
  low: number
  callStrike: number
  putStrike: number
  callMid: number
  putMid: number
  callBid?: number
  callAsk?: number
  putBid?: number
  putAsk?: number
  imbalancePercent: number
  expensiveSide: 'CALLS' | 'PUTS'
  expiry?: string
}

interface HistoryResult {
  symbol: string
  timeframe: string
  dataPoints: number
  data: HistoryDataPoint[]
}

// ──────────────────────────────────────────────────────────────────────────────
// ImbalanceChart (compact — 260px height, identical draw logic)
// ──────────────────────────────────────────────────────────────────────────────
function ImbalanceChart({ data }: { data: HistoryDataPoint[]; timeframe: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [dims, setDims] = useState({ w: 900, h: 260 })
  const [viewStart, setViewStart] = useState(0)
  const [viewEnd, setViewEnd] = useState(Math.max(0, data.length - 1))
  const [crosshair, setCrosshair] = useState<{ x: number; y: number } | null>(null)
  const dragRef = useRef<{
    down: boolean
    startX: number
    startVS: number
    startVE: number
  } | null>(null)
  const viewRef = useRef({ viewStart: 0, viewEnd: Math.max(0, data.length - 1) })

  useEffect(() => {
    setViewStart(0)
    setViewEnd(Math.max(0, data.length - 1))
  }, [data])

  useEffect(() => {
    viewRef.current = { viewStart, viewEnd }
  }, [viewStart, viewEnd])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      if (el.clientWidth > 0) setDims({ w: el.clientWidth, h: el.clientHeight })
    })
    ro.observe(el)
    if (el.clientWidth > 0) setDims({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || data.length === 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const PAD = { top: 24, right: 52, bottom: 44, left: 46 }
    const dpr = window.devicePixelRatio || 1
    const { w, h } = dims

    canvas.width = w * dpr
    canvas.height = h * dpr
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    ctx.scale(dpr, dpr)

    ctx.fillStyle = '#020B14'
    ctx.fillRect(0, 0, w, h)

    const vs = Math.max(0, Math.min(viewStart, data.length - 2))
    const ve = Math.max(vs + 1, Math.min(viewEnd, data.length - 1))
    const slice = data.slice(vs, ve + 1)
    if (slice.length < 2) return

    const vals = slice.map((d) => d.imbalancePercent)
    const minVal = Math.min(...vals)
    const maxVal = Math.max(...vals)
    const pad = Math.max(Math.abs(maxVal - minVal) * 0.12, 2)
    const yMin = minVal - pad
    const yMax = maxVal + pad
    const chartW = w - PAD.left - PAD.right
    const chartH = h - PAD.top - PAD.bottom

    const xFn = (i: number) => PAD.left + (i / Math.max(1, slice.length - 1)) * chartW
    const yFn = (v: number) => PAD.top + ((yMax - v) / (yMax - yMin)) * chartH
    const zeroY = Math.max(PAD.top, Math.min(PAD.top + chartH, yFn(0)))

    // Positive green fill (above zero)
    ctx.save()
    ctx.beginPath()
    ctx.rect(PAD.left, PAD.top, chartW, zeroY - PAD.top)
    ctx.clip()
    ctx.beginPath()
    ctx.moveTo(xFn(0), zeroY)
    for (let i = 0; i < slice.length; i++) ctx.lineTo(xFn(i), yFn(slice[i].imbalancePercent))
    ctx.lineTo(xFn(slice.length - 1), zeroY)
    ctx.closePath()
    const gUp = ctx.createLinearGradient(0, PAD.top, 0, zeroY)
    gUp.addColorStop(0, 'rgba(0,255,136,0.40)')
    gUp.addColorStop(1, 'rgba(0,255,136,0.03)')
    ctx.fillStyle = gUp
    ctx.fill()
    ctx.restore()

    // Negative red fill (below zero)
    ctx.save()
    ctx.beginPath()
    ctx.rect(PAD.left, zeroY, chartW, PAD.top + chartH - zeroY)
    ctx.clip()
    ctx.beginPath()
    ctx.moveTo(xFn(0), zeroY)
    for (let i = 0; i < slice.length; i++) ctx.lineTo(xFn(i), yFn(slice[i].imbalancePercent))
    ctx.lineTo(xFn(slice.length - 1), zeroY)
    ctx.closePath()
    const gDown = ctx.createLinearGradient(0, zeroY, 0, PAD.top + chartH)
    gDown.addColorStop(0, 'rgba(255,68,68,0.03)')
    gDown.addColorStop(1, 'rgba(255,68,68,0.40)')
    ctx.fillStyle = gDown
    ctx.fill()
    ctx.restore()

    // Zero dashed reference
    ctx.setLineDash([6, 4])
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PAD.left, zeroY)
    ctx.lineTo(w - PAD.right, zeroY)
    ctx.stroke()
    ctx.setLineDash([])

    // Overbought / oversold lines
    const posVals = vals.filter((v) => v > 0)
    const negVals = vals.filter((v) => v < 0)
    const avgHigh = posVals.length > 0 ? posVals.reduce((a, b) => a + b, 0) / posVals.length : null
    const avgLow = negVals.length > 0 ? negVals.reduce((a, b) => a + b, 0) / negVals.length : null
    if (avgHigh !== null) {
      const hy = yFn(avgHigh)
      ctx.setLineDash([5, 5])
      ctx.strokeStyle = 'rgba(0,255,136,0.55)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(PAD.left, hy)
      ctx.lineTo(w - PAD.right, hy)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.font = '600 11px monospace'
      ctx.fillStyle = '#00ff88'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'bottom'
      ctx.fillText(`+${avgHigh.toFixed(1)}%`, w - PAD.right + 3, hy + 1)
    }
    if (avgLow !== null) {
      const ly = yFn(avgLow)
      ctx.setLineDash([5, 5])
      ctx.strokeStyle = 'rgba(255,68,68,0.55)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(PAD.left, ly)
      ctx.lineTo(w - PAD.right, ly)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.font = '600 11px monospace'
      ctx.fillStyle = '#ff4444'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText(`${avgLow.toFixed(1)}%`, w - PAD.right + 3, ly - 1)
    }

    // Orange line
    ctx.beginPath()
    ctx.strokeStyle = '#f97316'
    ctx.lineWidth = 2
    for (let i = 0; i < slice.length; i++) {
      const x = xFn(i),
        y = yFn(slice[i].imbalancePercent)
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    }
    ctx.stroke()

    // Colored dots
    for (let i = 0; i < slice.length; i++) {
      ctx.beginPath()
      ctx.arc(xFn(i), yFn(slice[i].imbalancePercent), 3, 0, Math.PI * 2)
      ctx.fillStyle = slice[i].imbalancePercent > 0 ? '#00ff88' : '#ff4444'
      ctx.fill()
    }

    // Right Y axis — last visible value
    const lastVal = slice[slice.length - 1].imbalancePercent
    const lastY = yFn(lastVal)
    ctx.font = '700 12px monospace'
    ctx.fillStyle = lastVal > 0 ? '#00ff88' : '#ff4444'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(`${lastVal > 0 ? '+' : ''}${lastVal.toFixed(1)}%`, w - PAD.right + 3, lastY)
    ctx.strokeStyle = lastVal > 0 ? '#00ff88' : '#ff4444'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(w - PAD.right, lastY)
    ctx.lineTo(w - PAD.right + 3, lastY)
    ctx.stroke()

    // Axis lines
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(PAD.left - 0.5, PAD.top)
    ctx.lineTo(PAD.left - 0.5, h - PAD.bottom)
    ctx.lineTo(w - PAD.right, h - PAD.bottom)
    ctx.stroke()

    // Y axis labels — smaller font to match tighter pad
    ctx.font = '700 13px monospace'
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    for (let i = 0; i <= 5; i++) {
      const v = yMin + (i / 5) * (yMax - yMin)
      const y = yFn(v)
      if (y < PAD.top - 2 || y > PAD.top + chartH + 2) continue
      ctx.fillText(`${v > 0 ? '+' : ''}${v.toFixed(0)}%`, PAD.left - 4, y)
    }

    // X axis labels
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillStyle = '#ffffff'
    ctx.font = '700 13px monospace'
    const maxLabels = Math.max(2, Math.floor(chartW / 100))
    const step = Math.max(1, Math.ceil(slice.length / maxLabels))
    for (let i = 0; i < slice.length; i += step) {
      const ds = slice[i].date.split(' ')[0]
      const d = new Date(ds + 'T00:00:00')
      ctx.fillText(
        d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        xFn(i),
        h - PAD.bottom + 6
      )
    }

    // Legend (top-left inside chart area)
    const legendItems = [
      { color: '#00ff88', label: 'CALLS PRICIER' },
      { color: '#ff4444', label: 'PUTS PRICIER' },
    ]
    ctx.font = '700 12px monospace'
    ctx.textBaseline = 'middle'
    let lx = PAD.left + 8
    const ly = PAD.top + 8
    for (const item of legendItems) {
      ctx.beginPath()
      ctx.arc(lx + 5, ly, 5, 0, Math.PI * 2)
      ctx.fillStyle = item.color
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.textAlign = 'left'
      ctx.fillText(item.label, lx + 14, ly)
      lx += ctx.measureText(item.label).width + 32
    }

    // Crosshair
    if (crosshair && crosshair.x >= PAD.left && crosshair.x <= w - PAD.right) {
      const idx = Math.max(
        0,
        Math.min(
          slice.length - 1,
          Math.round(((crosshair.x - PAD.left) / chartW) * (slice.length - 1))
        )
      )
      const d = slice[idx]
      const sx = xFn(idx)
      const sy = yFn(d.imbalancePercent)

      ctx.setLineDash([4, 4])
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(sx, PAD.top)
      ctx.lineTo(sx, h - PAD.bottom)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(PAD.left, sy)
      ctx.lineTo(w - PAD.right, sy)
      ctx.stroke()
      ctx.setLineDash([])

      const xLabel = new Date(d.date.split(' ')[0] + 'T00:00:00').toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      })
      ctx.font = '700 8px monospace'
      const xLW = ctx.measureText(xLabel).width + 10
      const xLX = Math.max(PAD.left, Math.min(w - PAD.right - xLW, sx - xLW / 2))
      ctx.fillStyle = '#f97316'
      ctx.beginPath()
      if ((ctx as any).roundRect) (ctx as any).roundRect(xLX, h - PAD.bottom + 4, xLW, 14, 3)
      else ctx.rect(xLX, h - PAD.bottom + 4, xLW, 14)
      ctx.fill()
      ctx.fillStyle = '#000'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(xLabel, xLX + xLW / 2, h - PAD.bottom + 11)

      const yLabel = `${d.imbalancePercent > 0 ? '+' : ''}${d.imbalancePercent.toFixed(1)}%`
      const yLW = ctx.measureText(yLabel).width + 10
      const yLY = Math.max(PAD.top, Math.min(h - PAD.bottom - 14, sy - 7))
      ctx.fillStyle = '#f97316'
      ctx.beginPath()
      if ((ctx as any).roundRect) (ctx as any).roundRect(2, yLY, yLW, 14, 3)
      else ctx.rect(2, yLY, yLW, 14)
      ctx.fill()
      ctx.fillStyle = '#000'
      ctx.textAlign = 'center'
      ctx.fillText(yLabel, 2 + yLW / 2, yLY + 7)

      // Floating info tooltip
      const imbalColor = d.imbalancePercent > 0 ? '#00ff88' : '#ff4444'
      const expiryLabel = d.expiry
        ? new Date(d.expiry + 'T00:00:00').toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })
        : ''
      const lines = [
        { label: 'DATE', value: d.date, color: '#ffffff' },
        { label: 'EXPIRY', value: expiryLabel, color: '#f97316' },
        { label: 'STOCK', value: `$${d.stockPrice.toFixed(2)}`, color: '#ffffff' },
        {
          label: 'IMBAL',
          value: `${d.imbalancePercent > 0 ? '+' : ''}${d.imbalancePercent.toFixed(1)}%`,
          color: imbalColor,
        },
        {
          label: `C $${d.callStrike} BID`,
          value: `$${(d.callBid ?? 0).toFixed(2)}`,
          color: '#00ff88',
        },
        {
          label: `C $${d.callStrike} ASK`,
          value: `$${(d.callAsk ?? d.callMid).toFixed(2)}`,
          color: '#00ff88',
        },
        {
          label: `P $${d.putStrike} BID`,
          value: `$${(d.putBid ?? 0).toFixed(2)}`,
          color: '#ff4444',
        },
        {
          label: `P $${d.putStrike} ASK`,
          value: `$${(d.putAsk ?? d.putMid).toFixed(2)}`,
          color: '#ff4444',
        },
      ]
      const ttW = 162
      const ttLineH = 17
      const ttPad = 8
      const ttH = lines.length * ttLineH + ttPad * 2
      let ttX = sx + 14
      if (ttX + ttW > w - PAD.right) ttX = sx - ttW - 14
      const ttY = Math.max(PAD.top, Math.min(h - PAD.bottom - ttH, sy - ttH / 2))

      ctx.save()
      ctx.shadowColor = imbalColor
      ctx.shadowBlur = 8
      ctx.fillStyle = '#000000'
      ctx.beginPath()
      if ((ctx as any).roundRect) (ctx as any).roundRect(ttX, ttY, ttW, ttH, 6)
      else ctx.rect(ttX, ttY, ttW, ttH)
      ctx.fill()
      ctx.shadowBlur = 0
      ctx.restore()
      const gloss = ctx.createLinearGradient(ttX, ttY, ttX, ttY + ttH * 0.45)
      gloss.addColorStop(0, 'rgba(255,255,255,0.10)')
      gloss.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = gloss
      ctx.beginPath()
      if ((ctx as any).roundRect) (ctx as any).roundRect(ttX + 1, ttY + 1, ttW - 2, ttH * 0.45, 5)
      else ctx.rect(ttX + 1, ttY + 1, ttW - 2, ttH * 0.45)
      ctx.fill()
      ctx.strokeStyle = imbalColor
      ctx.lineWidth = 1
      ctx.beginPath()
      if ((ctx as any).roundRect) (ctx as any).roundRect(ttX, ttY, ttW, ttH, 6)
      else ctx.rect(ttX, ttY, ttW, ttH)
      ctx.stroke()

      ctx.font = '700 10px monospace'
      ctx.textBaseline = 'middle'
      for (let li = 0; li < lines.length; li++) {
        const ly = ttY + ttPad + li * ttLineH + ttLineH / 2
        ctx.fillStyle = '#ffffff'
        ctx.textAlign = 'left'
        ctx.fillText(lines[li].label, ttX + 7, ly)
        ctx.fillStyle = lines[li].color
        ctx.textAlign = 'right'
        ctx.fillText(lines[li].value, ttX + ttW - 7, ly)
      }
    }
  }, [data, dims, viewStart, viewEnd, crosshair])

  // Non-passive wheel listener
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const total = data.length
      if (total < 3) return
      const { viewStart: vs, viewEnd: ve } = viewRef.current
      const range = ve - vs
      const factor = e.deltaY > 0 ? 1.15 : 0.87
      const newRange = Math.max(4, Math.min(total - 1, Math.round(range * factor)))
      const PAD = { left: 46, right: 52 }
      const cw = canvas.clientWidth - PAD.left - PAD.right
      const ratio = Math.max(0, Math.min(1, (e.offsetX - PAD.left) / cw))
      const anchor = vs + ratio * range
      let ns = Math.round(anchor - ratio * newRange)
      let ne = ns + newRange
      if (ns < 0) {
        ns = 0
        ne = newRange
      }
      if (ne >= total) {
        ne = total - 1
        ns = Math.max(0, ne - newRange)
      }
      setViewStart(ns)
      setViewEnd(ne)
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [data.length])

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      dragRef.current = { down: true, startX: e.clientX, startVS: viewStart, startVE: viewEnd }
    },
    [viewStart, viewEnd]
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      setCrosshair({ x: e.clientX - rect.left, y: e.clientY - rect.top })
      const dr = dragRef.current
      if (dr?.down) {
        const PAD = { left: 46, right: 52 }
        const chartW = canvas.clientWidth - PAD.left - PAD.right
        const range = dr.startVE - dr.startVS
        if (range < 1) return
        const delta = Math.round(-(e.clientX - dr.startX) / (chartW / range))
        let ns = dr.startVS + delta
        let ne = dr.startVE + delta
        if (ns < 0) {
          ns = 0
          ne = range
        }
        if (ne >= data.length) {
          ne = data.length - 1
          ns = Math.max(0, ne - range)
        }
        setViewStart(ns)
        setViewEnd(ne)
      }
    },
    [data.length]
  )

  const handleMouseLeave = useCallback(() => {
    setCrosshair(null)
    if (dragRef.current) dragRef.current.down = false
  }, [])

  const handleMouseUp = useCallback(() => {
    if (dragRef.current) dragRef.current.down = false
  }, [])

  return (
    <div ref={containerRef} style={{ width: '100%', height: '260px' }}>
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onMouseUp={handleMouseUp}
        style={{ display: 'block', cursor: 'crosshair' }}
      />
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// OTMPremiumHistoryChartCompact
// Hardcoded 1m · no timeframe buttons · accepts externalTicker prop
// ──────────────────────────────────────────────────────────────────────────────
export default function OTMPremiumHistoryChartCompact({
  externalTicker,
}: {
  externalTicker?: string
}) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<HistoryResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Auto-fetch whenever the external ticker changes
  useEffect(() => {
    if (!externalTicker) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setResult(null)
    fetch(
      `/api/otm-premium-history?symbol=${encodeURIComponent(externalTicker.trim().toUpperCase())}&timeframe=1m`
    )
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (cancelled) return
        if (!ok) throw new Error(data.error || 'Request failed')
        if (!data.data || data.data.length === 0) {
          setError(`No historical options data found for ${externalTicker}.`)
        } else {
          setResult(data)
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unknown error')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [externalTicker])

  const stats = result?.data.length
    ? (() => {
        const d = result.data
        const callDays = d.filter((x) => x.expensiveSide === 'CALLS').length
        const putDays = d.filter((x) => x.expensiveSide === 'PUTS').length
        return { callDays, putDays, total: d.length }
      })()
    : null

  // Bare render — the analysis-suite panel wrapper is the container
  if (!externalTicker) return null

  if (loading)
    return (
      <div style={{ textAlign: 'center', padding: '48px 0' }}>
        <div
          style={{
            width: 32,
            height: 32,
            border: '3px solid rgba(0,212,255,0.15)',
            borderTopColor: '#00d4ff',
            borderRadius: '50%',
            margin: '0 auto 14px',
            animation: 'otm-spin-c 1s linear infinite',
          }}
        />
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '2px',
            color: '#00d4ff',
            fontFamily: 'JetBrains Mono, monospace',
          }}
        >
          SCANNING OPTIONS DATA...
        </div>
        <style>{`@keyframes otm-spin-c { to { transform: rotate(360deg); } }`}</style>
      </div>
    )

  if (error)
    return (
      <div style={{ textAlign: 'center', padding: '40px 0' }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: '#ff4444',
            fontFamily: 'JetBrains Mono, monospace',
            letterSpacing: '1px',
          }}
        >
          {error}
        </div>
      </div>
    )

  if (!result) return null

  return (
    <div style={{ padding: '0' }}>
      <ImbalanceChart data={result.data} timeframe="1m" />
    </div>
  )
}
