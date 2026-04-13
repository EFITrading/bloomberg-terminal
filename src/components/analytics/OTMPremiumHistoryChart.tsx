'use client'

import { BarChart2, Search } from 'lucide-react'

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

function ImbalanceChart({ data }: { data: HistoryDataPoint[]; timeframe: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [dims, setDims] = useState({ w: 900, h: 510 })
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

    const PAD = { top: 24, right: 68, bottom: 54, left: 80 }
    const dpr = window.devicePixelRatio || 1
    const { w, h } = dims

    canvas.width = w * dpr
    canvas.height = h * dpr
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    ctx.scale(dpr, dpr)

    ctx.fillStyle = '#000000'
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

    // Overbought / oversold lines (avg of top-quartile and bottom-quartile values)
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
      ctx.fillText(`+${avgHigh.toFixed(1)}%`, w - PAD.right + 4, hy + 1)
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
      ctx.fillText(`${avgLow.toFixed(1)}%`, w - PAD.right + 4, ly - 1)
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
    ctx.fillText(`${lastVal > 0 ? '+' : ''}${lastVal.toFixed(1)}%`, w - PAD.right + 4, lastY)
    // tick mark
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

    // Y axis labels
    ctx.font = '700 17px monospace'
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    for (let i = 0; i <= 7; i++) {
      const v = yMin + (i / 7) * (yMax - yMin)
      const y = yFn(v)
      if (y < PAD.top - 2 || y > PAD.top + chartH + 2) continue
      ctx.fillText(`${v > 0 ? '+' : ''}${v.toFixed(0)}%`, PAD.left - 8, y)
    }

    // X axis labels
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillStyle = '#ffffff'
    ctx.font = '700 17px monospace'
    const maxLabels = Math.max(2, Math.floor(chartW / 100))
    const step = Math.max(1, Math.ceil(slice.length / maxLabels))
    for (let i = 0; i < slice.length; i += step) {
      const ds = slice[i].date.split(' ')[0]
      const d = new Date(ds + 'T00:00:00')
      ctx.fillText(
        d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        xFn(i),
        h - PAD.bottom + 8
      )
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

      // X axis crosshair label
      const xLabel = new Date(d.date.split(' ')[0] + 'T00:00:00').toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      })
      ctx.font = '700 13px monospace'
      const xLW = ctx.measureText(xLabel).width + 16
      const xLX = Math.max(PAD.left, Math.min(w - PAD.right - xLW, sx - xLW / 2))
      ctx.fillStyle = '#f97316'
      ctx.beginPath()
      if ((ctx as any).roundRect) (ctx as any).roundRect(xLX, h - PAD.bottom + 4, xLW, 22, 4)
      else ctx.rect(xLX, h - PAD.bottom + 4, xLW, 22)
      ctx.fill()
      ctx.fillStyle = '#000'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(xLabel, xLX + xLW / 2, h - PAD.bottom + 15)

      // Y axis crosshair label
      const yLabel = `${d.imbalancePercent > 0 ? '+' : ''}${d.imbalancePercent.toFixed(1)}%`
      const yLW = ctx.measureText(yLabel).width + 16
      const yLY = Math.max(PAD.top, Math.min(h - PAD.bottom - 22, sy - 11))
      ctx.fillStyle = '#f97316'
      ctx.beginPath()
      if ((ctx as any).roundRect) (ctx as any).roundRect(2, yLY, yLW, 22, 4)
      else ctx.rect(2, yLY, yLW, 22)
      ctx.fill()
      ctx.fillStyle = '#000'
      ctx.textAlign = 'center'
      ctx.fillText(yLabel, 2 + yLW / 2, yLY + 11)

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

      // 4D glossy black background
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
      // Gloss highlight strip
      const gloss = ctx.createLinearGradient(ttX, ttY, ttX, ttY + ttH * 0.45)
      gloss.addColorStop(0, 'rgba(255,255,255,0.10)')
      gloss.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = gloss
      ctx.beginPath()
      if ((ctx as any).roundRect) (ctx as any).roundRect(ttX + 1, ttY + 1, ttW - 2, ttH * 0.45, 5)
      else ctx.rect(ttX + 1, ttY + 1, ttW - 2, ttH * 0.45)
      ctx.fill()
      // Border
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

  // Non-passive wheel listener so we can preventDefault (stops page scroll)
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
      const PAD = { left: 80, right: 20 }
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
        const PAD = { left: 80, right: 68 }
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
    <div ref={containerRef} style={{ width: '100%', height: '510px' }}>
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

export default function OTMPremiumHistoryChart() {
  const [ticker, setTicker] = useState('')
  const [timeframe, setTimeframe] = useState<'1m' | '1y'>('1y')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<HistoryResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchHistory = async (sym?: string, tf?: '1m' | '1y') => {
    const symbol = (sym ?? ticker).trim().toUpperCase()
    const selectedTf = tf ?? timeframe
    if (!symbol) return

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const response = await fetch(
        `/api/otm-premium-history?symbol=${encodeURIComponent(symbol)}&timeframe=${selectedTf}`
      )
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Request failed')
      if (!data.data || data.data.length === 0) {
        setError(
          `No historical options data found for ${symbol}. The ticker may not have liquid options.`
        )
      } else {
        setResult(data)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred')
    } finally {
      setLoading(false)
    }
  }

  const stats = result?.data.length
    ? (() => {
        const d = result.data
        const callDays = d.filter((x) => x.expensiveSide === 'CALLS').length
        const putDays = d.filter((x) => x.expensiveSide === 'PUTS').length
        const avg = d.reduce((s, x) => s + x.imbalancePercent, 0) / d.length
        const max = Math.max(...d.map((x) => Math.abs(x.imbalancePercent)))
        const latest = d[d.length - 1]
        return { callDays, putDays, avg, max, latest, total: d.length }
      })()
    : null

  return (
    <div
      style={{
        background: '#06060a',
        border: '1px solid rgba(255,120,0,0.18)',
        boxShadow: '0 8px 40px rgba(0,0,0,0.8)',
        color: '#fff',
        minHeight: 500,
        overflow: 'hidden',
      }}
    >
      {/* ── Title bar ── */}
      <div
        style={{
          background: 'linear-gradient(180deg, #101016 0%, #08080d 100%)',
          borderBottom: '1px solid rgba(255,120,0,0.22)',
          padding: '16px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <BarChart2 style={{ width: 26, height: 26, color: '#f97316', flexShrink: 0 }} />
        <div
          style={{
            fontWeight: 900,
            letterSpacing: '0.18em',
            fontSize: '1.2rem',
          }}
        >
          PREMIUM IMBALANCE HISTORY
        </div>
        {result && (
          <div
            style={{
              marginLeft: 'auto',
              background: 'rgba(249,115,22,0.15)',
              border: '1px solid rgba(249,115,22,0.3)',
              borderRadius: 999,
              padding: '3px 14px',
              fontSize: 11,
              fontWeight: 700,
              color: '#f97316',
              letterSpacing: '0.1em',
            }}
          >
            {result.symbol} · {result.dataPoints}{' '}
            {result.timeframe === '1m' ? 'INTRADAY SNAPS' : 'DAILY BARS'} ·{' '}
            {result.timeframe?.toUpperCase()}
          </div>
        )}
      </div>

      {/* ── Search bar ── */}
      <div
        style={{
          background: '#0a0a0f',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <input
          type="text"
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            if (e.key === 'Enter') fetchHistory()
          }}
          placeholder="ENTER TICKER (e.g. AAPL)"
          disabled={loading}
          style={{
            background: '#0d0d12',
            border: '1px solid rgba(255,255,255,0.18)',
            color: '#fff',
            padding: '9px 14px',
            borderRadius: 8,
            fontWeight: 700,
            fontSize: 14,
            letterSpacing: '0.12em',
            outline: 'none',
            width: 200,
            fontFamily: 'monospace',
            opacity: loading ? 0.5 : 1,
          }}
        />

        {/* Timeframe selector */}
        <div style={{ display: 'flex', gap: 4 }}>
          {(['1m', '1y'] as const).map((tf) => (
            <button
              key={tf}
              onClick={() => {
                setTimeframe(tf)
                if (result) fetchHistory(result.symbol, tf)
              }}
              disabled={loading}
              style={{
                background:
                  timeframe === tf
                    ? 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)'
                    : '#0d0d12',
                border:
                  timeframe === tf
                    ? '1px solid rgba(249,115,22,0.6)'
                    : '1px solid rgba(255,255,255,0.12)',
                color: timeframe === tf ? '#fff' : '#888',
                padding: '9px 14px',
                borderRadius: 8,
                fontWeight: 800,
                fontSize: 12,
                letterSpacing: '0.1em',
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s',
                textTransform: 'uppercase',
              }}
            >
              {tf}
            </button>
          ))}
        </div>
        <button
          onClick={() => fetchHistory()}
          disabled={!ticker.trim() || loading}
          style={{
            background:
              ticker.trim() && !loading
                ? 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)'
                : '#14141a',
            border:
              ticker.trim() && !loading
                ? '1px solid rgba(249,115,22,0.5)'
                : '1px solid rgba(255,255,255,0.07)',
            color: ticker.trim() && !loading ? '#fff' : '#444',
            padding: '9px 22px',
            borderRadius: 8,
            fontWeight: 800,
            fontSize: 12,
            letterSpacing: '0.1em',
            cursor: ticker.trim() && !loading ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            transition: 'all 0.15s',
            boxShadow: ticker.trim() && !loading ? '0 2px 12px rgba(249,115,22,0.3)' : 'none',
          }}
        >
          <Search style={{ width: 13, height: 13 }} />
          {loading ? 'LOADING...' : 'SEARCH'}
        </button>

        <div style={{ flex: 1 }} />
        <div
          style={{
            fontSize: 10,
            color: '#444',
            letterSpacing: '0.08em',
            textAlign: 'right',
            lineHeight: 1.6,
          }}
        >
          1-YEAR HISTORY · MONTHLY EXPIRY
          <br />
          SAME LOGIC AS SCANNER
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ padding: '24px' }}>
        {/* Empty state */}
        {!loading && !result && !error && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#444' }}>
            <BarChart2 style={{ width: 52, height: 52, margin: '0 auto 16px', opacity: 0.25 }} />
            <div
              style={{
                fontSize: 16,
                fontWeight: 600,
                marginBottom: 8,
                color: '#555',
              }}
            >
              Enter a ticker to view 1-year premium imbalance history
            </div>
            <div style={{ fontSize: 12, color: '#333' }}>
              Uses the exact same OTM call vs put imbalance formula as the scanner
            </div>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div
              style={{
                width: 44,
                height: 44,
                border: '3px solid rgba(249,115,22,0.25)',
                borderTopColor: '#f97316',
                borderRadius: '50%',
                margin: '0 auto 20px',
                animation: 'otm-spin 1s linear infinite',
              }}
            />
            <div
              style={{
                fontSize: 16,
                fontWeight: 700,
                letterSpacing: '0.1em',
                color: '#f97316',
              }}
            >
              FETCHING HISTORICAL OPTIONS DATA...
            </div>
            <div style={{ fontSize: 12, color: '#555', marginTop: 10 }}>
              Fetching ~250 daily data points · may take 30-60 seconds
            </div>
            <style>{`@keyframes otm-spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div
            style={{
              textAlign: 'center',
              padding: '40px 0',
              color: '#ff4444',
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{error}</div>
            <div style={{ fontSize: 12, color: '#555' }}>
              Try a different ticker or check that it has actively traded options.
            </div>
          </div>
        )}

        {/* ── Results ── */}
        {stats && result && (
          <div>
            {/* Stats row */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(5, 1fr)',
                gap: 12,
                marginBottom: 24,
              }}
            >
              {/* Current */}
              <div
                style={{
                  background: 'linear-gradient(180deg, #1c1c1c 0%, #000000 100%)',
                  border: `2px solid ${stats.latest.imbalancePercent > 0 ? '#00ff88' : '#ff4444'}`,
                  borderRadius: 10,
                  padding: '14px 16px',
                  boxShadow: '0 6px 0 #000, inset 0 1px 0 rgba(255,255,255,0.12)',
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    color: '#ffffff',
                    letterSpacing: '0.08em',
                    marginBottom: 6,
                    fontWeight: 700,
                  }}
                >
                  CURRENT
                </div>
                <div
                  style={{
                    fontSize: 29,
                    fontWeight: 900,
                    color: stats.latest.imbalancePercent > 0 ? '#00ff88' : '#ff4444',
                    lineHeight: 1,
                  }}
                >
                  {stats.latest.imbalancePercent > 0 ? '+' : ''}
                  {stats.latest.imbalancePercent.toFixed(1)}%
                </div>
                <div style={{ fontSize: 12, color: '#ffffff', marginTop: 5, fontWeight: 600 }}>
                  {stats.latest.expensiveSide} EXPENSIVE
                </div>
              </div>

              {/* Average */}
              <div
                style={{
                  background: 'linear-gradient(180deg, #1c1c1c 0%, #000000 100%)',
                  border: `2px solid ${stats.avg > 0 ? '#00ff88' : '#ff4444'}`,
                  borderRadius: 10,
                  padding: '14px 16px',
                  boxShadow: '0 6px 0 #000, inset 0 1px 0 rgba(255,255,255,0.12)',
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    color: '#ffffff',
                    letterSpacing: '0.08em',
                    marginBottom: 6,
                    fontWeight: 700,
                  }}
                >
                  AVG IMBALANCE
                </div>
                <div
                  style={{
                    fontSize: 29,
                    fontWeight: 900,
                    color: stats.avg > 0 ? '#00ff88' : '#ff4444',
                    lineHeight: 1,
                  }}
                >
                  {stats.avg > 0 ? '+' : ''}
                  {stats.avg.toFixed(1)}%
                </div>
                <div style={{ fontSize: 12, color: '#ffffff', marginTop: 5, fontWeight: 600 }}>
                  {stats.avg > 0 ? 'CALLS' : 'PUTS'} BIAS
                </div>
              </div>

              {/* Max Imbalance */}
              <div
                style={{
                  background: 'linear-gradient(180deg, #1c1c1c 0%, #000000 100%)',
                  border: '2px solid #f97316',
                  borderRadius: 10,
                  padding: '14px 16px',
                  boxShadow: '0 6px 0 #000, inset 0 1px 0 rgba(255,255,255,0.12)',
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    color: '#ffffff',
                    letterSpacing: '0.08em',
                    marginBottom: 6,
                    fontWeight: 700,
                  }}
                >
                  MAX IMBALANCE
                </div>
                <div style={{ fontSize: 29, fontWeight: 900, color: '#f97316', lineHeight: 1 }}>
                  {stats.max.toFixed(1)}%
                </div>
                <div style={{ fontSize: 12, color: '#ffffff', marginTop: 5, fontWeight: 600 }}>
                  PERIOD HIGH
                </div>
              </div>

              {/* Calls Expensive */}
              <div
                style={{
                  background: 'linear-gradient(180deg, #1c1c1c 0%, #000000 100%)',
                  border: '2px solid #00ff88',
                  borderRadius: 10,
                  padding: '14px 16px',
                  boxShadow: '0 6px 0 #000, inset 0 1px 0 rgba(255,255,255,0.12)',
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    color: '#ffffff',
                    letterSpacing: '0.08em',
                    marginBottom: 6,
                    fontWeight: 700,
                  }}
                >
                  CALLS EXPENSIVE
                </div>
                <div style={{ fontSize: 29, fontWeight: 900, color: '#00ff88', lineHeight: 1 }}>
                  {stats.callDays}
                </div>
                <div style={{ fontSize: 12, color: '#ffffff', marginTop: 5, fontWeight: 600 }}>
                  {Math.round((stats.callDays / stats.total) * 100)}% OF DAYS
                </div>
              </div>

              {/* Puts Expensive */}
              <div
                style={{
                  background: 'linear-gradient(180deg, #1c1c1c 0%, #000000 100%)',
                  border: '2px solid #ff4444',
                  borderRadius: 10,
                  padding: '14px 16px',
                  boxShadow: '0 6px 0 #000, inset 0 1px 0 rgba(255,255,255,0.12)',
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    color: '#ffffff',
                    letterSpacing: '0.08em',
                    marginBottom: 6,
                    fontWeight: 700,
                  }}
                >
                  PUTS EXPENSIVE
                </div>
                <div style={{ fontSize: 29, fontWeight: 900, color: '#ff4444', lineHeight: 1 }}>
                  {stats.putDays}
                </div>
                <div style={{ fontSize: 12, color: '#ffffff', marginTop: 5, fontWeight: 600 }}>
                  {Math.round((stats.putDays / stats.total) * 100)}% OF DAYS
                </div>
              </div>
            </div>

            {/* Main chart */}
            <div
              style={{
                background: '#08080d',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 10,
                padding: '20px 10px 10px',
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: '#555',
                  letterSpacing: '0.1em',
                  padding: '0 14px 14px',
                  fontWeight: 700,
                }}
              >
                OTM PREMIUM IMBALANCE % — {result.symbol} —{' '}
                {result.timeframe === '1m'
                  ? '1 MONTH (3x DAILY INTRADAY)'
                  : result.timeframe === '3m'
                    ? '3 MONTHS (DAILY)'
                    : '1 YEAR (DAILY)'}
              </div>
              <ImbalanceChart data={result.data} timeframe={result.timeframe} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
