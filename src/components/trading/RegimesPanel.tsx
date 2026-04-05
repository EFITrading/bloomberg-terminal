'use client'

import { TbStar, TbStarFilled, TbTrendingDown, TbTrendingUp, TbX } from 'react-icons/tb'

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { TOP_1000_SYMBOLS } from '../../lib/Top1000Symbols'
import { MarketRegimeData } from '../../lib/industryAnalysisService'

// ─── Constants ────────────────────────────────────────────────────────────────
const POLYGON_API_KEY = process.env.NEXT_PUBLIC_POLYGON_API_KEY || ''

const SCANNER_UNIVERSE = [...new Set(TOP_1000_SYMBOLS)]

// ─── TradePopupChart ─────────────────────────────────────────────────────────
export function TradePopupChart({
  symbol,
  fallbackCandles,
}: {
  symbol: string
  fallbackCandles: any[]
}) {
  const POPUP_TIMEFRAMES = [
    { label: '5M', value: '5m', days: 10, defaultBars: 78 },
    { label: '1H', value: '1h', days: 365, defaultBars: 120 },
    { label: '1D', value: '1d', days: 730, defaultBars: 252 },
    { label: '1W', value: '1w', days: 2555, defaultBars: 104 },
  ]
  const [timeframe, setTimeframe] = React.useState('1D')
  const [candles, setCandles] = React.useState<any[]>(fallbackCandles)
  const [fetching, setFetching] = React.useState(false)
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const stateRef = React.useRef({
    offset: 0,
    barsVisible: Math.min(252, fallbackCandles.length || 252),
  })
  const dragRef = React.useRef({
    active: false,
    mode: 'pan' as 'pan' | 'yscale',
    startX: 0,
    startY: 0,
    startOffset: 0,
    startMultiplier: 1,
    lastX: 0,
    lastTime: 0,
    velocity: 0,
  })
  const inertiaRef = React.useRef<number | null>(null)
  const yScaleRef = React.useRef({ multiplier: 1, centerPrice: null as number | null })
  const crosshairRef = React.useRef({ x: -1, y: -1, visible: false })

  React.useEffect(() => {
    if (timeframe === '1D') {
      if (fallbackCandles.length > 0) {
        setCandles(fallbackCandles)
        stateRef.current = { offset: 0, barsVisible: Math.min(252, fallbackCandles.length) }
      }
    }
  }, [fallbackCandles]) // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (timeframe === '1D' && fallbackCandles.length > 0) {
      setCandles(fallbackCandles)
      stateRef.current = { offset: 0, barsVisible: Math.min(252, fallbackCandles.length) }
      return
    }
    setFetching(true)
    const tf = POPUP_TIMEFRAMES.find((t) => t.label === timeframe)
    const days = tf?.days ?? 90
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const endDate = new Date().toISOString().split('T')[0]
    fetch('/api/bulk-chart-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbols: [symbol], timeframe: tf?.value || '1d', startDate, endDate }),
    })
      .then((r) => r.json())
      .then((data) => {
        const prices = data.data?.[symbol] || []
        if (prices.length > 0) {
          setCandles(prices)
          const defaultBars = tf?.defaultBars ?? 120
          stateRef.current = { offset: 0, barsVisible: Math.min(defaultBars, prices.length) }
        }
      })
      .catch(() => {})
      .finally(() => setFetching(false))
  }, [symbol, timeframe]) // eslint-disable-line react-hooks/exhaustive-deps

  const draw = React.useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const W = canvas.offsetWidth
    const H = canvas.offsetHeight
    if (W === 0 || H === 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const fmtPrice = (v: number) => {
      const a = Math.abs(v)
      const s = a >= 1000 ? a.toFixed(0) : a >= 100 ? a.toFixed(1) : a.toFixed(2)
      return s.replace(/^-/, '')
    }
    ctx.setLineDash([])
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, W, H)
    if (candles.length === 0) {
      ctx.fillStyle = '#ffffff'
      ctx.font = '11px "Courier New", monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(fetching ? 'LOADING…' : 'NO DATA', W / 2, H / 2)
      return
    }
    const { offset, barsVisible } = stateRef.current
    const total = candles.length
    const start = Math.max(0, total - barsVisible - offset)
    const end = Math.min(total, start + barsVisible)
    const visible = candles.slice(start, end)
    if (visible.length === 0) return
    const PAD_L = 8,
      PAD_R = 62,
      PAD_T = 14,
      PAD_B = 44
    const chartW = W - PAD_L - PAD_R
    const chartH = H - PAD_T - PAD_B
    const VOLUME_H = Math.floor(chartH * 0.18)
    const CANDLE_H = chartH - VOLUME_H - 6
    const highs = visible.map((c: any) => c.high ?? c.close)
    const lows = visible.map((c: any) => c.low ?? c.close)
    const naturalHi = Math.max(...highs)
    const naturalLo = Math.min(...lows)
    const naturalRange = naturalHi - naturalLo || Math.abs(naturalHi) * 0.01 || 1
    const ys = yScaleRef.current
    let hi: number, lo: number, range: number
    if (ys.centerPrice !== null && ys.multiplier !== 1) {
      range = naturalRange / ys.multiplier
      lo = ys.centerPrice - range / 2
      hi = ys.centerPrice + range / 2
    } else {
      hi = naturalHi
      lo = naturalLo
      range = naturalRange
    }
    const toY = (v: number) => PAD_T + CANDLE_H - ((v - lo) / range) * CANDLE_H
    const barW = chartW / visible.length
    const isIntraday = timeframe === '5M' || timeframe === '1H'
    if (isIntraday) {
      visible.forEach((c: any, i: number) => {
        const ts = c.timestamp ?? c.t
        if (!ts) return
        const d = new Date(ts)
        const mo = d.getUTCMonth() + 1
        const etOff = mo > 3 && mo < 11 ? -4 : -5
        const etMins = ((d.getUTCHours() + etOff + 24) % 24) * 60 + d.getUTCMinutes()
        const isExtended = etMins < 570 || etMins >= 960
        if (!isExtended) return
        ctx.fillStyle = 'rgba(255,255,255,0.05)'
        ctx.fillRect(PAD_L + i * barW, PAD_T, barW, chartH)
      })
    }
    visible.forEach((c: any, i: number) => {
      const x = PAD_L + i * barW
      const o = c.open ?? c.close
      const cl = c.close
      const h = c.high ?? c.close
      const l = c.low ?? c.close
      const color = cl >= o ? '#00ff00' : '#ff0000'
      const midX = x + barW * 0.5
      ctx.strokeStyle = color
      ctx.lineWidth = Math.max(1, barW * 0.12)
      ctx.beginPath()
      ctx.moveTo(midX, toY(h))
      ctx.lineTo(midX, toY(l))
      ctx.stroke()
      const bodyTop = toY(Math.max(o, cl))
      const bodyH = Math.max(1, toY(Math.min(o, cl)) - bodyTop)
      ctx.fillStyle = color
      ctx.fillRect(x + barW * 0.1, bodyTop, barW * 0.8, bodyH)
    })
    const volumes = visible.map((c: any) => c.volume ?? c.v ?? 0)
    const maxVol = Math.max(...volumes, 1)
    const volY0 = PAD_T + CANDLE_H + 6
    visible.forEach((c: any, i: number) => {
      const x = PAD_L + i * barW
      const vol = c.volume ?? c.v ?? 0
      const volH = Math.max(1, (vol / maxVol) * VOLUME_H)
      ctx.fillStyle = c.close >= (c.open ?? c.close) ? '#00BFFF' : '#ff0000'
      ctx.fillRect(x + barW * 0.1, volY0 + VOLUME_H - volH, barW * 0.8, volH)
    })
    ctx.font = 'bold 17px "Courier New", monospace'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    for (let i = 0; i <= 4; i++) {
      const val = lo + (range / 4) * (4 - i)
      const y = PAD_T + (CANDLE_H / 4) * i
      ctx.fillStyle = '#ffffff'
      ctx.fillText(fmtPrice(val), W - PAD_R + 5, y)
    }
    const lastClose = visible[visible.length - 1]?.close
    if (lastClose !== undefined) {
      ctx.font = 'bold 17px "Courier New", monospace'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = '#FF6600'
      ctx.fillText(fmtPrice(lastClose), W - PAD_R + 5, toY(lastClose))
    }
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 16px "Courier New", monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const step = Math.max(1, Math.floor(visible.length / 5))
    for (let i = 0; i < visible.length; i++) {
      if (i % step !== 0) continue
      const c = visible[i]
      const x = PAD_L + i * barW + barW * 0.5
      const ts = c.timestamp ?? c.t
      const d = ts ? new Date(ts) : new Date((c.date || '') + 'T00:00:00')
      const label =
        timeframe === '5M' || timeframe === '1H'
          ? `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
          : `${d.getMonth() + 1}/${d.getDate()}`
      ctx.fillText(label, x, H - PAD_B + 20)
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PAD_L, PAD_T)
    ctx.lineTo(PAD_L, H - PAD_B)
    ctx.lineTo(W - PAD_R, H - PAD_B)
    ctx.stroke()
    ctx.save()
    ctx.font = `bold ${Math.floor(H * 0.084)}px "Courier New", monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = 'rgba(255,255,255,0.04)'
    ctx.fillText(symbol, PAD_L + chartW / 2, PAD_T + CANDLE_H / 2)
    ctx.restore()
    const ch = crosshairRef.current
    if (
      ch.visible &&
      ch.x >= PAD_L &&
      ch.x <= W - PAD_R &&
      ch.y >= PAD_T &&
      ch.y <= PAD_T + CANDLE_H
    ) {
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(ch.x, PAD_T)
      ctx.lineTo(ch.x, H - PAD_B)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(PAD_L, ch.y)
      ctx.lineTo(W - PAD_R, ch.y)
      ctx.stroke()
      ctx.setLineDash([])
      const chPrice = hi - ((ch.y - PAD_T) / CANDLE_H) * range
      ctx.fillStyle = '#ff6600'
      ctx.fillRect(W - PAD_R + 1, ch.y - 9, PAD_R - 2, 18)
      ctx.fillStyle = '#000000'
      ctx.font = 'bold 11px "Courier New", monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(fmtPrice(chPrice), W - PAD_R + PAD_R / 2, ch.y)
    }
  }, [candles, fetching, timeframe, symbol])

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const ro = new ResizeObserver(() => {
      canvas.width = canvas.offsetWidth * dpr
      canvas.height = canvas.offsetHeight * dpr
      draw()
    })
    ro.observe(canvas)
    canvas.width = (canvas.offsetWidth || 500) * dpr
    canvas.height = (canvas.offsetHeight || 220) * dpr
    draw()
    return () => ro.disconnect()
  }, [draw])

  const drawRef = React.useRef(draw)
  drawRef.current = draw

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const PAD_L = 8,
      PAD_R = 62
    const clampOffset = (o: number, bars: number, total: number) =>
      Math.max(0, Math.min(Math.max(0, total - bars), o))
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const total = candles.length
      if (total === 0) return
      if (inertiaRef.current !== null) {
        cancelAnimationFrame(inertiaRef.current)
        inertiaRef.current = null
      }
      const rect = canvas.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const chartW = canvas.offsetWidth - PAD_L - PAD_R
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        const barPx = chartW / stateRef.current.barsVisible
        stateRef.current.offset = clampOffset(
          stateRef.current.offset - (e.deltaX / barPx) * 1.5,
          stateRef.current.barsVisible,
          total
        )
      } else {
        const factor = e.deltaY > 0 ? 1.1 : 0.91
        const newBars = Math.max(8, Math.min(total, stateRef.current.barsVisible * factor))
        const cursorT = Math.max(0, Math.min(1, (mouseX - PAD_L) / chartW))
        const cursorBarF =
          total -
          stateRef.current.barsVisible -
          stateRef.current.offset +
          cursorT * stateRef.current.barsVisible
        stateRef.current.barsVisible = newBars
        const newStart = cursorBarF - cursorT * newBars
        stateRef.current.offset = clampOffset(total - newStart - newBars, newBars, total)
      }
      drawRef.current()
    }
    canvas.addEventListener('wheel', handler, { passive: false })
    return () => canvas.removeEventListener('wheel', handler)
  }, [candles])

  const onMouseDown = (e: React.MouseEvent) => {
    if (inertiaRef.current !== null) {
      cancelAnimationFrame(inertiaRef.current)
      inertiaRef.current = null
    }
    const canvas = canvasRef.current
    const offsetX = e.nativeEvent.offsetX
    const W = canvas?.offsetWidth ?? 500
    const isYAxis = offsetX > W - 62
    if (isYAxis) {
      if (yScaleRef.current.centerPrice === null) {
        const total = candles.length
        const { offset, barsVisible } = stateRef.current
        const start = Math.max(0, total - barsVisible - offset)
        const vis = candles.slice(start, start + barsVisible)
        if (vis.length > 0) {
          const vhi = Math.max(...vis.map((c: any) => c.high ?? c.close))
          const vlo = Math.min(...vis.map((c: any) => c.low ?? c.close))
          yScaleRef.current.centerPrice = (vhi + vlo) / 2
        }
      }
      dragRef.current = {
        active: true,
        mode: 'yscale',
        startX: e.clientX,
        startY: e.clientY,
        startOffset: stateRef.current.offset,
        startMultiplier: yScaleRef.current.multiplier,
        lastX: e.clientX,
        lastTime: performance.now(),
        velocity: 0,
      }
    } else {
      dragRef.current = {
        active: true,
        mode: 'pan',
        startX: e.clientX,
        startY: e.clientY,
        startOffset: stateRef.current.offset,
        startMultiplier: 1,
        lastX: e.clientX,
        lastTime: performance.now(),
        velocity: 0,
      }
    }
  }

  React.useEffect(() => {
    const canvas = canvasRef.current
    const onMove = (e: MouseEvent) => {
      if (canvas) {
        const rect = canvas.getBoundingClientRect()
        const offsetX = e.clientX - rect.left
        const offsetY = e.clientY - rect.top
        if (!dragRef.current.active) {
          canvas.style.cursor = offsetX > canvas.offsetWidth - 62 ? 'ns-resize' : 'crosshair'
          const inCanvas =
            offsetX >= 0 &&
            offsetX <= canvas.offsetWidth &&
            offsetY >= 0 &&
            offsetY <= canvas.offsetHeight
          crosshairRef.current = { x: offsetX, y: offsetY, visible: inCanvas }
          drawRef.current()
        }
      }
      if (!dragRef.current.active) return
      if (dragRef.current.mode === 'yscale') {
        const dy = dragRef.current.startY - e.clientY
        yScaleRef.current.multiplier = Math.max(
          0.1,
          Math.min(50, dragRef.current.startMultiplier * Math.pow(1.006, dy))
        )
        drawRef.current()
        return
      }
      const W = canvas?.offsetWidth ?? 500
      const chartW = W - 8 - 58
      const barPx = chartW / stateRef.current.barsVisible
      const total = candles.length
      const now = performance.now()
      const dt = now - dragRef.current.lastTime
      if (dt > 0) {
        const rawVel = (e.clientX - dragRef.current.lastX) / barPx / dt
        dragRef.current.velocity = dragRef.current.velocity * 0.6 + rawVel * 0.4
      }
      dragRef.current.lastX = e.clientX
      dragRef.current.lastTime = now
      const dragBars = (e.clientX - dragRef.current.startX) / barPx
      stateRef.current.offset = Math.max(
        0,
        Math.min(
          Math.max(0, total - stateRef.current.barsVisible),
          dragRef.current.startOffset + dragBars
        )
      )
      drawRef.current()
    }
    const onUp = () => {
      if (!dragRef.current.active) return
      if (dragRef.current.mode === 'yscale') {
        dragRef.current.active = false
        return
      }
      dragRef.current.active = false
      let vel = dragRef.current.velocity
      const total = candles.length
      if (Math.abs(vel) < 0.004) return
      const animate = () => {
        vel *= 0.88
        if (Math.abs(vel) < 0.0008) {
          inertiaRef.current = null
          return
        }
        stateRef.current.offset = Math.max(
          0,
          Math.min(
            Math.max(0, total - stateRef.current.barsVisible),
            stateRef.current.offset + vel * 16
          )
        )
        drawRef.current()
        inertiaRef.current = requestAnimationFrame(animate)
      }
      inertiaRef.current = requestAnimationFrame(animate)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [candles])

  const onDoubleClick = (e: React.MouseEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (e.nativeEvent.offsetX > canvas.offsetWidth - 62) {
      yScaleRef.current = { multiplier: 1, centerPrice: null }
      drawRef.current()
    }
  }

  return (
    <div
      style={{
        position: 'relative',
        width: '50%',
        height: '476px',
        borderRadius: '8px',
        overflow: 'hidden',
        boxShadow:
          '0 0 0 1px rgba(255,255,255,0.09), 0 8px 32px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.05)',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block', cursor: 'crosshair' }}
        onMouseDown={onMouseDown}
        onDoubleClick={onDoubleClick}
        onMouseLeave={() => {
          crosshairRef.current.visible = false
          drawRef.current()
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: '8px',
          left: '8px',
          display: 'flex',
          gap: '3px',
          zIndex: 10,
        }}
      >
        {POPUP_TIMEFRAMES.map((tf) => (
          <button
            key={tf.label}
            onClick={() => setTimeframe(tf.label)}
            style={{
              padding: '2px 9px',
              fontFamily: '"Courier New", monospace',
              fontSize: '12px',
              fontWeight: 800,
              letterSpacing: '0.05em',
              background:
                timeframe === tf.label
                  ? 'linear-gradient(135deg,#ff6600,#ff8c00)'
                  : 'rgba(0,0,0,0.7)',
              color: timeframe === tf.label ? '#000' : '#fff',
              border: `1px solid ${timeframe === tf.label ? '#ff6600' : 'rgba(255,255,255,0.25)'}`,
              borderRadius: '3px',
              cursor: 'pointer',
              backdropFilter: 'blur(8px)',
            }}
          >
            {tf.label}
          </button>
        ))}
        {fetching && (
          <span
            style={{
              fontFamily: '"Courier New", monospace',
              fontSize: '11px',
              color: '#ff6600',
              lineHeight: '20px',
              letterSpacing: '0.1em',
            }}
          >
            LIVE…
          </span>
        )}
      </div>
    </div>
  )
}

// ─── TradeDetailPopup ────────────────────────────────────────────────────────
export function TradeDetailPopup({
  trade,
  symbol,
  onClose,
  scanPricesCache,
  scanAllScored,
}: {
  trade: any
  symbol: string
  onClose: () => void
  scanPricesCache: Map<string, any[]>
  scanAllScored: any[]
}) {
  const [activeSymbol, setActiveSymbol] = React.useState(symbol)
  const activeCandles = scanPricesCache.get(activeSymbol) || []
  const industrySymbol = trade.industrySymbol || ''
  const industryPeers = React.useMemo(() => {
    const seen = new Set<string>()
    return scanAllScored
      .filter((s: any) => s.industrySymbol === industrySymbol)
      .filter((s: any) => {
        if (seen.has(s.symbol)) return false
        seen.add(s.symbol)
        return true
      })
  }, [scanAllScored, industrySymbol])
  const totalPeers = industryPeers.length
  const upCount = industryPeers.filter((s: any) => s.trend === 'bullish').length
  const downCount = totalPeers - upCount
  const outperforming = industryPeers.filter((s: any) => (s.relativePerformance || 0) > 0).length
  const underperforming = totalPeers - outperforming
  const avgScore =
    totalPeers > 0
      ? Math.round(industryPeers.reduce((a: number, b: any) => a + (b.score || 0), 0) / totalPeers)
      : 0
  const topPeers = [...industryPeers]
    .sort((a: any, b: any) => (b.score || 0) - (a.score || 0))
    .slice(0, 8)
  let above52wkHigh = 0,
    below52wkLow = 0
  industryPeers.forEach((peer: any) => {
    const pc = scanPricesCache.get(peer.symbol) || []
    if (pc.length === 0) return
    const highs = pc.map((c: any) => c.high ?? c.close)
    const lows = pc.map((c: any) => c.low ?? c.close)
    const rangeHigh = Math.max(...highs)
    const rangeLow = Math.min(...lows)
    const last = pc[pc.length - 1]?.close || 0
    if (last >= rangeHigh * 0.98) above52wkHigh++
    if (last <= rangeLow * 1.02) below52wkLow++
  })
  const sentimentPct = totalPeers > 0 ? Math.round((upCount / totalPeers) * 100) : 0
  const outperformingPct = totalPeers > 0 ? Math.round((outperforming / totalPeers) * 100) : 0
  const lastPrice = activeCandles.length > 0 ? activeCandles[activeCandles.length - 1]?.close : null
  const prevPrice = activeCandles.length > 1 ? activeCandles[activeCandles.length - 2]?.close : null
  const pctChange = lastPrice && prevPrice ? ((lastPrice - prevPrice) / prevPrice) * 100 : null

  const accentColor = trade.trend === 'bullish' ? '#00ff88' : '#ff3344'
  const accentGlow = trade.trend === 'bullish' ? 'rgba(0,255,136,0.15)' : 'rgba(255,51,68,0.15)'
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.96)', backdropFilter: 'blur(20px)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full mx-4"
        style={{
          maxWidth: '1100px',
          background: 'linear-gradient(160deg,#0a0a0a 0%,#050505 100%)',
          border: `1px solid rgba(255,255,255,0.1)`,
          borderLeft: `3px solid ${accentColor}`,
          borderRadius: '2px',
          maxHeight: '92vh',
          overflowY: 'auto',
          boxShadow: `0 0 0 1px rgba(255,255,255,0.04), 0 40px 80px rgba(0,0,0,0.9), 0 0 60px ${accentGlow}`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '22px 32px 18px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            background: 'linear-gradient(90deg,rgba(255,255,255,0.02) 0%,transparent 100%)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span
                style={{
                  fontFamily: '"Courier New", monospace',
                  fontWeight: 900,
                  fontSize: '2.2rem',
                  color: '#fff',
                  letterSpacing: '-0.02em',
                  lineHeight: 1,
                }}
              >
                {activeSymbol}
              </span>
              {lastPrice !== null && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      fontFamily: '"Courier New", monospace',
                      fontWeight: 700,
                      fontSize: '1.2rem',
                      color: 'rgba(255,255,255,0.9)',
                    }}
                  >
                    $
                    {lastPrice >= 1000
                      ? lastPrice.toFixed(0)
                      : lastPrice >= 100
                        ? lastPrice.toFixed(1)
                        : lastPrice.toFixed(2)}
                  </span>
                  {pctChange !== null && (
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: '3px',
                        fontFamily: '"Courier New", monospace',
                        fontSize: '12px',
                        fontWeight: 800,
                        background:
                          pctChange >= 0 ? 'rgba(0,255,136,0.15)' : 'rgba(255,51,68,0.15)',
                        color: pctChange >= 0 ? '#00ff88' : '#ff3344',
                        border: `1px solid ${pctChange >= 0 ? 'rgba(0,255,136,0.3)' : 'rgba(255,51,68,0.3)'}`,
                      }}
                    >
                      {pctChange >= 0 ? '▲ +' : '▼ '}
                      {pctChange.toFixed(2)}%
                    </span>
                  )}
                </div>
              )}
            </div>
            <div style={{ width: '1px', height: '40px', background: 'rgba(255,255,255,0.1)' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <span
                style={{
                  fontFamily: 'system-ui,sans-serif',
                  fontSize: '13px',
                  fontWeight: 700,
                  color: 'rgba(255,255,255,0.85)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                }}
              >
                Industry
              </span>
              <span
                style={{
                  fontFamily: 'system-ui,sans-serif',
                  fontSize: '15px',
                  fontWeight: 700,
                  color: '#fff',
                  textTransform: 'uppercase',
                }}
              >
                {trade.industry}
              </span>
              <span
                style={{
                  fontFamily: '"Courier New",monospace',
                  fontSize: '14px',
                  color: 'rgba(255,255,255,0.85)',
                }}
              >
                {industrySymbol} ETF
              </span>
            </div>
            <div
              style={{
                padding: '5px 16px',
                fontFamily: '"Courier New", monospace',
                fontSize: '13px',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: accentColor,
                border: `1px solid ${accentColor}`,
                borderRadius: '3px',
                background: accentGlow,
                boxShadow: `0 0 12px ${accentGlow}`,
              }}
            >
              {trade.trend === 'bullish' ? '▲ LONG' : '▼ SHORT'}
            </div>
            {activeSymbol !== symbol && (
              <button
                onClick={() => setActiveSymbol(symbol)}
                style={{
                  fontFamily: '"Courier New", monospace',
                  fontSize: '14px',
                  fontWeight: 700,
                  color: '#fff',
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.25)',
                  padding: '4px 12px',
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                  borderRadius: '3px',
                }}
              >
                ← {symbol}
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'rgba(255,255,255,0.85)',
              fontSize: '18px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '50%',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0' }}>
          <div
            style={{
              padding: '20px 24px 20px 28px',
              borderRight: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div
              style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}
            >
              <div
                style={{
                  width: '3px',
                  height: '14px',
                  borderRadius: '2px',
                  background: accentColor,
                  boxShadow: `0 0 8px ${accentColor}`,
                }}
              />
              <span
                style={{
                  fontFamily: '"Courier New", monospace',
                  fontSize: '13px',
                  fontWeight: 700,
                  color: '#fff',
                  textTransform: 'uppercase',
                  letterSpacing: '0.18em',
                }}
              >
                {activeSymbol} · Price Action
              </span>
            </div>
            <TradePopupChart symbol={activeSymbol} fallbackCandles={activeCandles} />
            {industrySymbol && (
              <div style={{ marginTop: '20px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '12px',
                  }}
                >
                  <div
                    style={{
                      width: '3px',
                      height: '14px',
                      borderRadius: '2px',
                      background: 'rgba(245,158,11,0.9)',
                      boxShadow: '0 0 8px rgba(245,158,11,0.4)',
                    }}
                  />
                  <span
                    style={{
                      fontFamily: '"Courier New", monospace',
                      fontSize: '13px',
                      fontWeight: 700,
                      color: '#fff',
                      textTransform: 'uppercase',
                      letterSpacing: '0.18em',
                    }}
                  >
                    {industrySymbol} · Industry ETF
                  </span>
                </div>
                <TradePopupChart
                  symbol={industrySymbol}
                  fallbackCandles={scanPricesCache.get(industrySymbol) || []}
                />
              </div>
            )}
          </div>
          <div style={{ padding: '20px 28px 20px 24px', display: 'flex', flexDirection: 'column' }}>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}
            >
              <div
                style={{
                  width: '3px',
                  height: '14px',
                  borderRadius: '2px',
                  background: '#f59e0b',
                  boxShadow: '0 0 8px rgba(245,158,11,0.5)',
                }}
              />
              <span
                style={{
                  fontFamily: 'system-ui,sans-serif',
                  fontSize: '14px',
                  fontWeight: 700,
                  color: '#fff',
                  textTransform: 'uppercase',
                  letterSpacing: '0.18em',
                }}
              >
                Sector Overview
              </span>
              <span
                style={{
                  marginLeft: 'auto',
                  fontFamily: '"Courier New",monospace',
                  fontSize: '13px',
                  color: 'rgba(255,255,255,0.85)',
                  background: 'rgba(255,255,255,0.08)',
                  padding: '2px 8px',
                  borderRadius: '3px',
                }}
              >
                {totalPeers} stocks
              </span>
            </div>
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', marginBottom: '16px' }}>
              {[
                {
                  label: 'Bullish',
                  value: upCount,
                  pct: sentimentPct,
                  color: '#00ff88',
                  bgColor: 'rgba(0,255,136,0.08)',
                },
                {
                  label: 'Bearish',
                  value: downCount,
                  pct: 100 - sentimentPct,
                  color: '#ff3344',
                  bgColor: 'rgba(255,51,68,0.08)',
                },
                {
                  label: 'Outperforming SPY',
                  value: outperforming,
                  pct: outperformingPct,
                  color: outperformingPct >= 50 ? '#00ff88' : 'rgba(255,255,255,0.5)',
                  bgColor: outperformingPct >= 50 ? 'rgba(0,255,136,0.05)' : 'transparent',
                },
                {
                  label: 'Underperforming',
                  value: underperforming,
                  pct: 100 - outperformingPct,
                  color: outperformingPct < 50 ? '#ff3344' : 'rgba(255,255,255,0.5)',
                  bgColor: outperformingPct < 50 ? 'rgba(255,51,68,0.05)' : 'transparent',
                },
                {
                  label: 'Near 52w High',
                  value: above52wkHigh,
                  pct: null,
                  color: '#f59e0b',
                  bgColor: 'rgba(245,158,11,0.05)',
                },
                {
                  label: 'Near 52w Low',
                  value: below52wkLow,
                  pct: null,
                  color: 'rgba(255,255,255,0.5)',
                  bgColor: 'transparent',
                },
              ].map((row, i) => (
                <div
                  key={row.label}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '9px 10px',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    background: row.bgColor,
                    borderRadius: '4px',
                    margin: '2px 0',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'system-ui,sans-serif',
                      fontSize: '14px',
                      color: '#fff',
                      fontWeight: 600,
                    }}
                  >
                    {row.label}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {row.pct !== null && (
                      <div
                        style={{
                          width: '60px',
                          height: '3px',
                          background: 'rgba(255,255,255,0.1)',
                          borderRadius: '2px',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            height: '100%',
                            width: `${row.pct}%`,
                            background: row.color,
                            borderRadius: '2px',
                          }}
                        />
                      </div>
                    )}
                    <span
                      style={{
                        fontFamily: '"Courier New",monospace',
                        fontWeight: 800,
                        fontSize: '16px',
                        color: row.color,
                        minWidth: '28px',
                        textAlign: 'right',
                      }}
                    >
                      {row.value}
                    </span>
                    {row.pct !== null && (
                      <span
                        style={{
                          fontFamily: '"Courier New",monospace',
                          fontSize: '13px',
                          color: 'rgba(255,255,255,0.85)',
                          minWidth: '36px',
                        }}
                      >
                        {row.pct}%
                      </span>
                    )}
                  </div>
                </div>
              ))}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '9px 10px',
                  margin: '2px 0',
                  background: 'rgba(255,255,255,0.02)',
                  borderRadius: '4px',
                }}
              >
                <span
                  style={{
                    fontFamily: 'system-ui,sans-serif',
                    fontSize: '14px',
                    color: '#fff',
                    fontWeight: 600,
                  }}
                >
                  Avg Score
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      width: '60px',
                      height: '3px',
                      background: 'rgba(255,255,255,0.1)',
                      borderRadius: '2px',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${avgScore}%`,
                        background:
                          avgScore >= 75 ? '#00ff88' : avgScore >= 55 ? '#f59e0b' : '#ff3344',
                        borderRadius: '2px',
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontFamily: '"Courier New",monospace',
                      fontWeight: 800,
                      fontSize: '16px',
                      color: avgScore >= 75 ? '#00ff88' : avgScore >= 55 ? '#f59e0b' : '#ff3344',
                      minWidth: '28px',
                      textAlign: 'right',
                    }}
                  >
                    {avgScore}
                  </span>
                </div>
              </div>
            </div>
            {topPeers.length > 0 && (
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '10px',
                  }}
                >
                  <div
                    style={{
                      width: '3px',
                      height: '12px',
                      borderRadius: '2px',
                      background: '#f59e0b',
                    }}
                  />
                  <span
                    style={{
                      fontFamily: 'system-ui,sans-serif',
                      fontSize: '13px',
                      fontWeight: 700,
                      color: '#fff',
                      textTransform: 'uppercase',
                      letterSpacing: '0.18em',
                    }}
                  >
                    Sector Peers
                  </span>
                  <span
                    style={{
                      fontSize: '12px',
                      color: 'rgba(255,255,255,0.75)',
                      fontFamily: 'system-ui,sans-serif',
                    }}
                  >
                    click to chart
                  </span>
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 26px 80px 44px',
                    padding: '6px 8px',
                    borderBottom: '1px solid rgba(255,255,255,0.07)',
                    marginBottom: '2px',
                  }}
                >
                  {[
                    ['Ticker', 'left'],
                    ['', 'left'],
                    ['Rel Perf', 'right'],
                    ['Score', 'right'],
                  ].map(([h, align]) => (
                    <span
                      key={h}
                      style={{
                        fontFamily: 'system-ui,sans-serif',
                        fontSize: '13px',
                        fontWeight: 700,
                        color: 'rgba(255,255,255,0.75)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.1em',
                        textAlign: align as any,
                      }}
                    >
                      {h}
                    </span>
                  ))}
                </div>
                {topPeers.map((peer: any, idx: number) => (
                  <div
                    key={`${peer.symbol}-${idx}`}
                    onClick={() => setActiveSymbol(peer.symbol)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 26px 80px 44px',
                      padding: '8px 8px',
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      cursor: 'pointer',
                      background:
                        activeSymbol === peer.symbol ? 'rgba(255,255,255,0.06)' : 'transparent',
                      borderRadius: '3px',
                      transition: 'background 0.15s',
                    }}
                  >
                    <span
                      style={{
                        fontFamily: '"Courier New",monospace',
                        fontWeight: 800,
                        fontSize: '14px',
                        color: activeSymbol === peer.symbol ? '#fff' : 'rgba(255,255,255,0.8)',
                      }}
                    >
                      {peer.symbol}
                    </span>
                    <span
                      style={{
                        fontFamily: '"Courier New",monospace',
                        fontSize: '13px',
                        color: peer.trend === 'bullish' ? '#00ff88' : '#ff3344',
                      }}
                    >
                      {peer.trend === 'bullish' ? '▲' : '▼'}
                    </span>
                    <span
                      style={{
                        fontFamily: '"Courier New",monospace',
                        fontSize: '13px',
                        fontWeight: 700,
                        color: (peer.relativePerformance || 0) >= 0 ? '#00ff88' : '#ff3344',
                        textAlign: 'right',
                      }}
                    >
                      {(peer.relativePerformance || 0) >= 0 ? '+' : ''}
                      {(peer.relativePerformance || 0).toFixed(2)}%
                    </span>
                    <span
                      style={{
                        fontFamily: '"Courier New",monospace',
                        fontWeight: 800,
                        fontSize: '14px',
                        color: '#fff',
                        textAlign: 'right',
                      }}
                    >
                      {Math.round(peer.score || 0)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div
          style={{
            borderTop: '1px solid rgba(255,255,255,0.07)',
            padding: '16px 28px',
            background: 'rgba(255,255,255,0.01)',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(6, 1fr)',
              gap: '1px',
              background: 'rgba(255,255,255,0.06)',
              borderRadius: '6px',
              overflow: 'hidden',
              border: '1px solid rgba(255,255,255,0.07)',
            }}
          >
            {[
              {
                label: 'Strike',
                value: `$${trade.strike?.toFixed(0) || 'N/A'} ${(trade.optionType || '').toUpperCase()}`,
                color: '#fff',
                bg: 'rgba(0,0,0,0.6)',
              },
              {
                label: 'Expiry',
                value: trade.expiration
                  ? new Date(trade.expiration + 'T12:00:00').toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      timeZone: 'UTC',
                    })
                  : 'N/A',
                color: '#f59e0b',
                bg: 'rgba(0,0,0,0.6)',
              },
              {
                label: 'Premium',
                value: `$${typeof trade.contractPrice === 'number' ? trade.contractPrice.toFixed(2) : 'N/A'}`,
                color: '#fff',
                bg: 'rgba(0,0,0,0.6)',
              },
              {
                label: 'IV',
                value: `${trade.impliedVolatility || 'N/A'}%`,
                color: '#00d4ff',
                bg: 'rgba(0,0,0,0.6)',
              },
              {
                label: 'Target',
                value: `$${typeof trade.stockTarget80 === 'number' ? trade.stockTarget80.toFixed(2) : 'N/A'}`,
                color: '#00ff88',
                bg: 'rgba(0,255,136,0.04)',
              },
              {
                label: 'Stop',
                value: `$${typeof trade.stopLoss === 'number' ? trade.stopLoss.toFixed(2) : 'N/A'}`,
                color: '#ff3344',
                bg: 'rgba(255,51,68,0.04)',
              },
            ].map((item, i) => (
              <div
                key={item.label}
                style={{ textAlign: 'center', padding: '12px 8px', background: item.bg }}
              >
                <div
                  style={{
                    fontFamily: 'system-ui,sans-serif',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: 'rgba(255,255,255,0.85)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.14em',
                    marginBottom: '6px',
                  }}
                >
                  {item.label}
                </div>
                <div
                  style={{
                    fontFamily: '"Courier New",monospace',
                    fontWeight: 800,
                    fontSize: '15px',
                    color: item.color,
                  }}
                >
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Scanner types ────────────────────────────────────────────────────────────
interface ScannerRow {
  symbol: string
  price: number
  change: number
  changePct: number
  volume: number
  avgVolume?: number
  weekHigh?: number
  weekLow?: number
  high52w?: number
  low52w?: number
  ma21?: number
  ma50?: number
  prevTrend?: 'up' | 'down' | null
  sparkData?: Array<{ price: number; etMinutes: number; time: number }>
}

// Module-level cache shared across all MarketScannerPanel instances
const SHARED_SCANNER_CACHE: { [key: string]: { rows: ScannerRow[]; ts: number } } = {}

// ─── MarketScannerPanel (Movers / Breakouts / Reversals) ─────────────────────
export const MarketScannerPanel = React.memo(function MarketScannerPanel() {
  const [scanTab, setScanTab] = useState<'movers' | 'breakouts' | 'reversals'>('movers')
  const [rows, setRows] = useState<ScannerRow[]>(() => SHARED_SCANNER_CACHE['movers']?.rows ?? [])
  const [loading, setLoading] = useState(false)
  const [lastFetch, setLastFetch] = useState<Date | null>(null)
  const [sparklines, setSparklines] = useState<
    Record<string, Array<{ price: number; etMinutes: number; time: number }>>
  >({})
  const sparkFetchedRef = useRef<string>('')
  const fetchScanner = useCallback(async (tab: typeof scanTab, source = 'unknown') => {
    const cached = SHARED_SCANNER_CACHE[tab]
    const ttl = tab === 'movers' ? 5 * 60_000 : 15 * 60_000
    // Stale-while-revalidate: always show whatever was last cached immediately
    if (cached?.rows?.length) {
      setRows(cached.rows)
      if (Date.now() - cached.ts < ttl) return // still fresh — done
      // Stale — fall through to silent background refresh
    }
    // Only show loading spinner on very first scan (no data at all yet)
    if (!cached?.rows?.length) setLoading(true)
    try {
      // Batch fetch snapshot for universe
      const tickers = SCANNER_UNIVERSE.join(',')
      const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${tickers}&apikey=${POLYGON_API_KEY}`
      const resp = await fetch(url)
      const data = await resp.json()
      const snaps: any[] = data.tickers || []

      let result: ScannerRow[] = []

      if (tab === 'movers') {
        // Use snapshot data directly — snapshot already has day + prevDay for each symbol
        result = snaps
          .filter((s: any) => {
            const price = s.day?.c || s.lastTrade?.p || 0
            const prevClose = s.prevDay?.c || 0
            const vol = s.day?.v || 0
            return price > 5 && vol > 500_000 && prevClose > 0
          })
          .map((s: any) => {
            const price = s.day?.c || s.lastTrade?.p || 0
            const prevClose = s.prevDay?.c
            const change = price - prevClose
            const changePct = (change / prevClose) * 100
            return {
              symbol: s.ticker,
              price,
              change,
              changePct,
              volume: s.day?.v || 0,
            } as ScannerRow
          })
          .sort((a: ScannerRow, b: ScannerRow) => Math.abs(b.changePct) - Math.abs(a.changePct))
          .slice(0, 40)
      }

      if (tab === 'breakouts') {
        // Need weekly high/low and 52w hi/lo — fetch aggs for each symbol
        // Use Polygon's grouped daily endpoint for today + previous 52 weeks
        const today = new Date().toISOString().split('T')[0]
        const yr = new Date(Date.now() - 252 * 86400_000).toISOString().split('T')[0]
        const week = new Date(Date.now() - 5 * 86400_000).toISOString().split('T')[0]

        // Fetch in parallel batches of 10
        const batchSize = 10
        const symbols = SCANNER_UNIVERSE
        const snapMap: Record<string, any> = {}
        snaps.forEach((s: any) => {
          snapMap[s.ticker] = s
        })

        const fetchAggs = async (sym: string) => {
          try {
            const r = await fetch(
              `https://api.polygon.io/v2/aggs/ticker/${sym}/range/1/day/${yr}/${today}?adjusted=true&sort=asc&limit=300&apikey=${POLYGON_API_KEY}`
            )
            const d = await r.json()
            return { sym, bars: d.results || [] }
          } catch {
            return { sym, bars: [] }
          }
        }

        const batches: Array<typeof symbols> = []
        for (let i = 0; i < symbols.length; i += batchSize)
          batches.push(symbols.slice(i, i + batchSize))

        const allAggs: { sym: string; bars: any[] }[] = []
        for (const batch of batches) {
          const res = await Promise.all(batch.map(fetchAggs))
          allAggs.push(...res)
        }

        result = allAggs
          .filter(({ bars }) => bars.length >= 5)
          .map(({ sym, bars }) => {
            const price = bars[bars.length - 1].c
            const prevClose = bars.length >= 2 ? bars[bars.length - 2].c : price
            const change = price - prevClose
            const changePct = (change / prevClose) * 100
            const weekBars = bars.slice(-5)
            const weekHigh = Math.max(...weekBars.map((b: any) => b.h))
            const weekLow = Math.min(...weekBars.map((b: any) => b.l))
            const high52w = Math.max(...bars.map((b: any) => b.h))
            const low52w = Math.min(...bars.map((b: any) => b.l))
            const isBreakoutUp = price >= weekHigh * 0.999 || price >= high52w * 0.99
            const isBreakdownDown = price <= weekLow * 1.001 || price <= low52w * 1.01
            if (!isBreakoutUp && !isBreakdownDown) return null
            return {
              symbol: sym,
              price,
              change,
              changePct,
              volume: snapMap[sym]?.day?.v || 0,
              weekHigh,
              weekLow,
              high52w,
              low52w,
              sparkData: bars.slice(-20).map((b: any) => b.c),
            } as ScannerRow
          })
          .filter(Boolean) as ScannerRow[]
      }

      if (tab === 'reversals') {
        // Stocks crossing above/below 8, 13, and 21 EMA simultaneously
        const today = new Date().toISOString().split('T')[0]
        const from = new Date(Date.now() - 90 * 86400_000).toISOString().split('T')[0]
        const snapMap: Record<string, any> = {}
        snaps.forEach((s: any) => {
          snapMap[s.ticker] = s
        })

        const batchSize = 10
        const symbols = SCANNER_UNIVERSE
        const fetchAggs = async (sym: string) => {
          try {
            const r = await fetch(
              `https://api.polygon.io/v2/aggs/ticker/${sym}/range/1/day/${from}/${today}?adjusted=true&sort=asc&limit=120&apikey=${POLYGON_API_KEY}`
            )
            const d = await r.json()
            return { sym, bars: d.results || [] }
          } catch {
            return { sym, bars: [] }
          }
        }
        const batches: Array<typeof symbols> = []
        for (let i = 0; i < symbols.length; i += batchSize)
          batches.push(symbols.slice(i, i + batchSize))
        const allAggs: { sym: string; bars: any[] }[] = []
        for (const batch of batches) {
          const res = await Promise.all(batch.map(fetchAggs))
          allAggs.push(...res)
        }

        // EMA helper
        const calcEMA = (closes: number[], period: number): number[] => {
          const k = 2 / (period + 1)
          const emas: number[] = []
          closes.forEach((c, i) => {
            if (i === 0) {
              emas.push(c)
              return
            }
            emas.push(c * k + emas[i - 1] * (1 - k))
          })
          return emas
        }

        result = allAggs
          .filter(({ bars }) => bars.length >= 30)
          .map(({ sym, bars }) => {
            const closes = bars.map((b: any) => b.c)

            const ema8 = calcEMA(closes, 8)
            const ema13 = calcEMA(closes, 13)
            const ema21 = calcEMA(closes, 21)

            const n = closes.length
            const price = closes[n - 1]
            const prevPrice = closes[n - 2]

            const curE8 = ema8[n - 1],
              prevE8 = ema8[n - 2]
            const curE13 = ema13[n - 1],
              prevE13 = ema13[n - 2]
            const curE21 = ema21[n - 1],
              prevE21 = ema21[n - 2]

            // Crossed above ALL three EMAs
            const crossedAbove =
              prevPrice < prevE8 &&
              prevPrice < prevE13 &&
              prevPrice < prevE21 &&
              price >= curE8 &&
              price >= curE13 &&
              price >= curE21
            // Crossed below ALL three EMAs
            const crossedBelow =
              prevPrice > prevE8 &&
              prevPrice > prevE13 &&
              prevPrice > prevE21 &&
              price <= curE8 &&
              price <= curE13 &&
              price <= curE21

            if (!crossedAbove && !crossedBelow) return null

            const change = price - prevPrice
            const changePct = (change / prevPrice) * 100

            return {
              symbol: sym,
              price,
              change,
              changePct,
              volume: snapMap[sym]?.day?.v || 0,
              prevTrend: crossedAbove ? 'up' : 'down',
              sparkData: closes.slice(-20),
            } as ScannerRow
          })
          .filter(Boolean) as ScannerRow[]
      }

      // Deduplicate by symbol BEFORE caching
      const seen = new Set<string>()
      result = result.filter((r) => {
        if (seen.has(r.symbol)) return false
        seen.add(r.symbol)
        return true
      })
      SHARED_SCANNER_CACHE[tab] = { rows: result, ts: Date.now() }
      setRows(result)
      setLastFetch(new Date())
    } catch (e) {
      console.error('Scanner fetch error:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  // When user switches tab, show cached data immediately
  useEffect(() => {
    fetchScanner(scanTab, 'tab-switch')
  }, [scanTab, fetchScanner])

  // Fetch intraday sparklines after rows load — same pattern as tracking tab
  useEffect(() => {
    if (rows.length === 0) return
    const key = rows.map((r) => r.symbol).join(',')
    if (sparkFetchedRef.current === key) return
    sparkFetchedRef.current = key
    setSparklines({})

    // Find last trading day first (same as tracking tab — handles weekends/holidays)
    const todayStr = new Date().toISOString().split('T')[0]
    const tenDaysAgo = new Date(Date.now() - 10 * 86400_000).toISOString().split('T')[0]
    const BATCH = 5

    const fetchBatches = async () => {
      // Step 1: get last trading day using first row (all same market, so one call is enough)
      let lastTradingDayStr = todayStr
      try {
        const r = await fetch(
          `https://api.polygon.io/v2/aggs/ticker/${rows[0].symbol}/range/1/day/${tenDaysAgo}/${todayStr}?adjusted=true&sort=desc&limit=3&apikey=${POLYGON_API_KEY}`
        )
        const d = await r.json()
        if (d.results?.length > 0) {
          const ts = d.results[0].t
          const dt = new Date(ts)
          lastTradingDayStr = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
        }
      } catch {}

      // Step 2: fetch intraday 1-min bars for each row on that last trading day
      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH)
        const results = await Promise.all(
          batch.map(async (row) => {
            try {
              const r = await fetch(
                `https://api.polygon.io/v2/aggs/ticker/${row.symbol}/range/1/minute/${lastTradingDayStr}/${lastTradingDayStr}?adjusted=true&sort=asc&limit=1000&apikey=${POLYGON_API_KEY}`
              )
              const d = await r.json()
              if (d.results?.length > 1) {
                const bars = d.results.map((b: any) => {
                  const date = new Date(b.t)
                  const pstStr = date.toLocaleString('en-US', {
                    timeZone: 'America/Los_Angeles',
                    hour12: false,
                  })
                  const pst = new Date(pstStr)
                  const etMinutes = pst.getHours() * 60 + pst.getMinutes()
                  return { price: b.c, etMinutes, time: b.t }
                })
                return [row.symbol, bars] as [
                  string,
                  Array<{ price: number; etMinutes: number; time: number }>,
                ]
              }
            } catch {}
            return null
          })
        )
        const updates: Record<
          string,
          Array<{ price: number; etMinutes: number; time: number }>
        > = {}
        results.forEach((r) => {
          if (r) updates[r[0]] = r[1]
        })
        setSparklines((prev) => ({ ...prev, ...updates }))
        if (i + BATCH < rows.length) await new Promise((res) => setTimeout(res, 300))
      }
    }
    fetchBatches()
  }, [rows])

  const gainers =
    scanTab === 'movers'
      ? rows.filter((r) => r.changePct > 0).sort((a, b) => b.changePct - a.changePct)
      : []
  const losers =
    scanTab === 'movers'
      ? rows.filter((r) => r.changePct < 0).sort((a, b) => a.changePct - b.changePct)
      : []
  const weekBreakouts =
    scanTab === 'breakouts' ? rows.filter((r) => r.weekHigh && r.price >= r.weekHigh * 0.999) : []
  const weekBreakdowns =
    scanTab === 'breakouts' ? rows.filter((r) => r.weekLow && r.price <= r.weekLow * 1.001) : []
  const highs52 =
    scanTab === 'breakouts' ? rows.filter((r) => r.high52w && r.price >= r.high52w * 0.99) : []
  const lows52 =
    scanTab === 'breakouts' ? rows.filter((r) => r.low52w && r.price <= r.low52w * 1.01) : []
  const reversalUp = scanTab === 'reversals' ? rows.filter((r) => r.prevTrend === 'up') : []
  const reversalDown = scanTab === 'reversals' ? rows.filter((r) => r.prevTrend === 'down') : []

  // ── Glossy scanner row ──────────────────────────────────────────────────────
  const ScanRow = ({
    row,
    accent,
    rank,
    intradaySpark,
  }: {
    row: ScannerRow
    accent: string
    rank: number
    intradaySpark?: Array<{ price: number; etMinutes: number; time: number }>
  }) => {
    const isUp = row.changePct >= 0
    const changeBg = isUp ? 'rgba(0,255,136,0.12)' : 'rgba(255,51,68,0.12)'
    const changeBorder = isUp ? 'rgba(0,255,136,0.3)' : 'rgba(255,51,68,0.3)'
    const changeClr = isUp ? '#00ff88' : '#ff3344'

    // Sparkline — exact tracking tab logic from EFICharting.tsx
    const sparkData = intradaySpark && intradaySpark.length > 1 ? intradaySpark : null
    const spark = sparkData ? (
      (() => {
        const prices = sparkData.map((p) => p.price)
        const minPrice = Math.min(...prices),
          maxPrice = Math.max(...prices)
        const priceRange = maxPrice - minPrice || 1
        const padding = 8
        const chartHeight = 50 - padding * 2

        const points = sparkData
          .map((p, i) => {
            const x = (i / (sparkData.length - 1)) * 200
            const y = padding + ((maxPrice - p.price) / priceRange) * chartHeight
            return `${x.toFixed(1)},${y.toFixed(1)}`
          })
          .join(' ')

        const prevDayY = padding + ((maxPrice - prices[0]) / priceRange) * chartHeight
        const lineUp = prices[prices.length - 1] >= prices[0]

        // Market hours shading zones — identical to tracking tab
        const shadingZones: Array<{ x: number; width: number; color: string }> = []
        let currentZone: { start: number; color: string } | null = null
        sparkData.forEach((point, i) => {
          const m = point.etMinutes
          const preStart = 60,
            marketStart = 390,
            marketEnd = 780,
            ahEnd = 1020
          let fill: string | null = null
          if (m >= preStart && m < marketStart) fill = 'rgba(255,165,0,0.12)'
          else if (m >= marketEnd && m < ahEnd) fill = 'rgba(0,174,239,0.12)'
          if (fill) {
            if (!currentZone || currentZone.color !== fill) {
              if (currentZone) {
                const x = (currentZone.start / (sparkData.length - 1)) * 200
                shadingZones.push({
                  x,
                  width: (i / (sparkData.length - 1)) * 200 - x,
                  color: currentZone.color,
                })
              }
              currentZone = { start: i, color: fill }
            }
          } else if (currentZone) {
            const x = (currentZone.start / (sparkData.length - 1)) * 200
            shadingZones.push({
              x,
              width: (i / (sparkData.length - 1)) * 200 - x,
              color: currentZone.color,
            })
            currentZone = null
          }
        })
        if (currentZone) {
          const z = currentZone as { start: number; color: string }
          shadingZones.push({
            x: (z.start / (sparkData.length - 1)) * 200,
            width: 200 - (z.start / (sparkData.length - 1)) * 200,
            color: z.color,
          })
        }

        // Time label positions (6:30 AM = 390min, 1:00 PM = 780min)
        let openIdx = -1,
          closeIdx = -1
        sparkData.forEach((p, i) => {
          if (openIdx === -1 && p.etMinutes >= 390) openIdx = i
          if (closeIdx === -1 && p.etMinutes >= 780) closeIdx = i
        })
        const openPct = openIdx >= 0 ? (openIdx / (sparkData.length - 1)) * 100 : -1
        const closePct = closeIdx >= 0 ? (closeIdx / (sparkData.length - 1)) * 100 : -1

        return (
          <div style={{ flex: 1, minWidth: 80, display: 'flex', flexDirection: 'column' }}>
            <svg
              viewBox="0 0 200 50"
              preserveAspectRatio="none"
              style={{ width: '100%', height: 64, display: 'block' }}
            >
              {shadingZones.map((z, idx) => (
                <rect key={idx} x={z.x} y="0" width={z.width} height="50" fill={z.color} />
              ))}
              <line
                x1="0"
                y1={prevDayY.toFixed(1)}
                x2="200"
                y2={prevDayY.toFixed(1)}
                stroke="#444444"
                strokeWidth="1"
                strokeDasharray="3,2"
                opacity="0.4"
                vectorEffect="non-scaling-stroke"
              />
              <polyline
                fill="none"
                stroke={lineUp ? '#00ff00' : '#ff0000'}
                strokeWidth="1.5"
                points={points}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            <div style={{ position: 'relative', height: 14, marginTop: 2 }}>
              {openPct >= 0 && (
                <span
                  style={{
                    position: 'absolute',
                    left: `${openPct}%`,
                    transform: 'translateX(-50%)',
                    fontSize: 10,
                    color: '#facc15',
                    fontFamily: 'monospace',
                    fontWeight: 600,
                  }}
                >
                  6:30 AM
                </span>
              )}
              {closePct >= 0 && (
                <span
                  style={{
                    position: 'absolute',
                    left: `${closePct}%`,
                    transform: 'translateX(-50%)',
                    fontSize: 10,
                    color: '#facc15',
                    fontFamily: 'monospace',
                    fontWeight: 600,
                  }}
                >
                  1:00 PM
                </span>
              )}
            </div>
          </div>
        )
      })()
    ) : (
      <div style={{ flex: 1, minWidth: 80, height: 78 }} />
    )

    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '12px 14px',
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.05)',
          borderLeft: `3px solid ${accent}`,
          borderRadius: '5px',
          marginBottom: '4px',
          transition: 'background 0.15s',
          cursor: 'default',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.045)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
      >
        <span
          style={{
            fontFamily: '"Courier New",monospace',
            fontSize: '16px',
            color: 'rgba(255,255,255,0.5)',
            minWidth: '22px',
            textAlign: 'right',
          }}
        >
          {rank}
        </span>
        <span
          style={{
            fontFamily: '"Courier New",monospace',
            fontWeight: 900,
            fontSize: '20px',
            color: accent,
            minWidth: '64px',
            letterSpacing: '-0.01em',
          }}
        >
          {row.symbol}
        </span>
        <span
          style={{
            fontFamily: '"Courier New",monospace',
            fontSize: '20px',
            color: '#fff',
            minWidth: '80px',
            textAlign: 'right',
          }}
        >
          $
          {row.price >= 1000
            ? row.price.toFixed(0)
            : row.price >= 100
              ? row.price.toFixed(1)
              : row.price.toFixed(2)}
        </span>
        <span
          style={{
            fontFamily: '"Courier New",monospace',
            fontSize: '18px',
            fontWeight: 800,
            padding: '3px 10px',
            borderRadius: '4px',
            background: changeBg,
            color: changeClr,
            border: `1px solid ${changeBorder}`,
            minWidth: '90px',
            textAlign: 'center',
            letterSpacing: '0.02em',
          }}
        >
          {isUp ? '+' : ''}
          {row.changePct.toFixed(2)}%
        </span>
        {spark}
        {row.high52w && row.price >= row.high52w * 0.99 && (
          <span
            style={{
              fontSize: '14px',
              fontWeight: 700,
              color: '#f59e0b',
              background: 'rgba(245,158,11,0.12)',
              border: '1px solid rgba(245,158,11,0.3)',
              padding: '2px 8px',
              borderRadius: '3px',
              letterSpacing: '0.06em',
            }}
          >
            52W↑
          </span>
        )}
        {row.low52w && row.price <= row.low52w * 1.01 && (
          <span
            style={{
              fontSize: '14px',
              fontWeight: 700,
              color: '#a855f7',
              background: 'rgba(168,85,247,0.12)',
              border: '1px solid rgba(168,85,247,0.3)',
              padding: '2px 8px',
              borderRadius: '3px',
              letterSpacing: '0.06em',
            }}
          >
            52W↓
          </span>
        )}
      </div>
    )
  }

  const ScanSection = ({
    title,
    items,
    accent,
    extra,
  }: {
    title: string
    items: ScannerRow[]
    accent: string
    extra?: string
  }) => (
    <div style={{ marginBottom: '0' }}>
      <div
        style={{
          marginBottom: '14px',
          padding: '12px 14px',
          background: `${accent}0f`,
          borderLeft: `3px solid ${accent}`,
          borderRadius: '0 4px 4px 0',
        }}
      >
        <div
          style={{
            fontFamily: '"Courier New",monospace',
            fontSize: '20px',
            fontWeight: 900,
            color: accent,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
          }}
        >
          {title}
        </div>
        {extra && (
          <div
            style={{
              fontFamily: 'system-ui,sans-serif',
              fontSize: '15px',
              color: 'rgba(255,255,255,0.85)',
              marginTop: '2px',
            }}
          >
            {extra}
          </div>
        )}
      </div>
      {loading && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '16px 14px',
            color: 'rgba(255,255,255,0.85)',
            fontFamily: '"Courier New",monospace',
            fontSize: '13px',
            letterSpacing: '0.1em',
          }}
        >
          <div
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: accent,
              animation: 'pulse 1s infinite',
            }}
          />
          SCANNING MARKET\u2026
        </div>
      )}
      {!loading && items.length === 0 && (
        <div
          style={{
            padding: '20px 14px',
            textAlign: 'center',
            fontFamily: '"Courier New",monospace',
            fontSize: '16px',
            color: 'rgba(255,255,255,0.7)',
            letterSpacing: '0.1em',
          }}
        >
          NO SIGNALS DETECTED
        </div>
      )}
      {items.map((row, i) => (
        <ScanRow
          key={row.symbol}
          row={row}
          accent={accent}
          rank={i + 1}
          intradaySpark={sparklines[row.symbol]}
        />
      ))}
    </div>
  )

  return (
    <div style={{ background: '#030303', minHeight: '100%' }}>
      {/* Scanner sub-tab bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'stretch',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        {(
          [
            { key: 'movers', label: 'Movers', color: '#FFD700' },
            { key: 'breakouts', label: 'Breakouts', color: '#CD7F32' },
            { key: 'reversals', label: 'Reversals', color: '#C0C0C0' },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setScanTab(t.key)}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '18px 0',
              fontSize: '20px',
              fontWeight: scanTab === t.key ? 900 : 600,
              fontFamily: '"Courier New",monospace',
              textTransform: 'uppercase',
              letterSpacing: '0.15em',
              background: scanTab === t.key ? '#000' : 'transparent',
              border: 'none',
              borderBottom: scanTab === t.key ? `3px solid ${t.color}` : '3px solid transparent',
              color: scanTab === t.key ? t.color : '#ffffff',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {t.label}
          </button>
        ))}
        <button
          onClick={() => fetchScanner(scanTab)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            padding: '0 18px',
            fontSize: '14px',
            background: 'rgba(255,255,255,0.04)',
            borderLeft: '1px solid rgba(255,255,255,0.1)',
            color: '#fff',
            cursor: 'pointer',
            fontFamily: '"Courier New",monospace',
            letterSpacing: '0.06em',
            flexShrink: 0,
          }}
        >
          ↺{' '}
          {lastFetch
            ? lastFetch.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : 'REFRESH'}
        </button>
      </div>

      {/* Loading shimmer */}
      {loading && (
        <div
          style={{
            height: '2px',
            background: 'linear-gradient(90deg,transparent,#f59e0b,transparent)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.5s infinite',
          }}
        />
      )}

      <div style={{ padding: '16px 16px 40px' }}>
        {scanTab === 'movers' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <ScanSection
              title="Top Gainers"
              items={gainers.slice(0, 20)}
              accent="#00ff88"
              extra="By today's % change"
            />
            <ScanSection
              title="Top Losers"
              items={losers.slice(0, 20)}
              accent="#ff3344"
              extra="By today's % change"
            />
          </div>
        )}
        {scanTab === 'breakouts' && (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '20px',
                marginBottom: '24px',
              }}
            >
              <ScanSection
                title="Weekly Breakout"
                items={weekBreakouts.slice(0, 15)}
                accent="#00ff88"
                extra="Price above 5-day high"
              />
              <ScanSection
                title="Weekly Breakdown"
                items={weekBreakdowns.slice(0, 15)}
                accent="#ff3344"
                extra="Price below 5-day low"
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <ScanSection
                title="52-Week Highs"
                items={highs52.slice(0, 15)}
                accent="#f59e0b"
                extra="Within 1% of 52-week high"
              />
              <ScanSection
                title="52-Week Lows"
                items={lows52.slice(0, 15)}
                accent="#a855f7"
                extra="Within 1% of 52-week low"
              />
            </div>
          </>
        )}
        {scanTab === 'reversals' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <ScanSection
              title="Reversing Up"
              items={reversalUp.slice(0, 20)}
              accent="#00ff88"
              extra="Price crossed above 21-day MA"
            />
            <ScanSection
              title="Reversing Down"
              items={reversalDown.slice(0, 20)}
              accent="#ff3344"
              extra="Price crossed below 21-day MA"
            />
          </div>
        )}
        \n{' '}
      </div>
    </div>
  )
})

// ─── RegimesPanel (main export) ───────────────────────────────────────────────
export interface RegimesPanelProps {
  activeTab: string
  setActiveTab: (tab: string) => void
  marketRegimeData: MarketRegimeData | null
  isLoadingRegimes: boolean
  regimeUpdateProgress: number
  regimeLoadingStage: string
  scanGroupMode: 'sectors' | 'industries'
  setScanGroupMode: (mode: 'sectors' | 'industries') => void
  highlightedTradesCache: Record<string, any>
  tradeDetailPopup: any | null
  setTradeDetailPopup: (v: any | null) => void
  setActiveSidebarPanel: (v: string | null) => void
  scanPricesCacheRef: React.MutableRefObject<Map<string, any[]>>
  scanAllScoredRef: React.MutableRefObject<any[]>
}

export default function RegimesPanel({
  activeTab,
  setActiveTab,
  marketRegimeData,
  isLoadingRegimes,
  regimeUpdateProgress,
  regimeLoadingStage,
  scanGroupMode,
  setScanGroupMode,
  highlightedTradesCache,
  tradeDetailPopup,
  setTradeDetailPopup,
  setActiveSidebarPanel,
  scanPricesCacheRef,
  scanAllScoredRef,
}: RegimesPanelProps) {
  const [mainTab, setMainTab] = useState<'regimes' | 'scanner'>('regimes')
  const scrollRef = useRef<HTMLDivElement>(null)
  const savedScroll = useRef<number>(0)

  const getCurrentTimeframeData = useCallback(() => {
    if (!marketRegimeData) return null
    switch (activeTab.toLowerCase()) {
      case 'momentum':
        return marketRegimeData.momentum
      default:
        return marketRegimeData.life
    }
  }, [marketRegimeData, activeTab])

  const timeframeData = getCurrentTimeframeData()

  const { filteredBullishTrades, filteredBearishTrades } = useMemo(() => {
    const bestBySymbolType = new Map<string, [string, any]>()
    Object.keys(highlightedTradesCache)
      .filter((k) => k.startsWith('sectors-') || k.startsWith('industries-'))
      .forEach((tab) => {
        Object.entries(highlightedTradesCache[tab] || {}).forEach(([symbol, trade]) => {
          const dedupKey = `${symbol}::${(trade as any).optionType}`
          const existing = bestBySymbolType.get(dedupKey)
          if (!existing || ((trade as any).score || 0) > ((existing[1] as any).score || 0)) {
            bestBySymbolType.set(dedupKey, [symbol, trade])
          }
        })
      })
    const allTabsHighlights = Array.from(bestBySymbolType.values())
    const bullish = allTabsHighlights
      .filter(([, t]: [string, any]) => t.optionType?.toLowerCase() === 'call')
      .sort((a, b) => (b[1].score || 0) - (a[1].score || 0))
    const bearish = allTabsHighlights
      .filter(([, t]: [string, any]) => t.optionType?.toLowerCase() === 'put')
      .sort((a, b) => (b[1].score || 0) - (a[1].score || 0))
    return { filteredBullishTrades: bullish, filteredBearishTrades: bearish }
  }, [highlightedTradesCache])

  const shortTermBullish = filteredBullishTrades.filter(
    ([, t]: [string, any]) => t.sourceTab === 'life'
  )
  const longTermBullish = filteredBullishTrades.filter(
    ([, t]: [string, any]) => t.sourceTab !== 'life'
  )
  const shortTermBearish = filteredBearishTrades.filter(
    ([, t]: [string, any]) => t.sourceTab === 'life'
  )
  const longTermBearish = filteredBearishTrades.filter(
    ([, t]: [string, any]) => t.sourceTab !== 'life'
  )

  useLayoutEffect(() => {
    if (scrollRef.current && savedScroll.current > 0)
      scrollRef.current.scrollTop = savedScroll.current
  })

  const handleScroll = useCallback(() => {
    if (scrollRef.current) savedScroll.current = scrollRef.current.scrollTop
  }, [])

  const TradeCard = ({ item, isBullish }: { item: [string, any]; isBullish: boolean }) => {
    const [symbol, trade] = item
    const grade = trade.grade || ''
    const gradeColor =
      grade === 'SS+' || grade === 'SS'
        ? '#FFD700'
        : grade === 'S'
          ? '#00d4ff'
          : grade === 'A'
            ? '#84cc16'
            : grade === 'B'
              ? '#c0c0c0'
              : 'rgba(255,255,255,0.3)'
    const gradeBg =
      grade === 'SS+' || grade === 'SS'
        ? 'rgba(255,215,0,0.1)'
        : grade === 'S'
          ? 'rgba(0,212,255,0.1)'
          : grade === 'A'
            ? 'rgba(132,204,22,0.1)'
            : 'transparent'
    const tradeTab = trade.sourceTab
    const isShortTerm = tradeTab === 'life'
    const accentClr = isBullish ? '#00ff88' : '#ff3344'
    const accentGlow = isBullish ? 'rgba(0,255,136,0.08)' : 'rgba(255,51,68,0.08)'
    const accentBorder = isBullish ? 'rgba(0,255,136,0.2)' : 'rgba(255,51,68,0.2)'

    const [inWatchlist, setInWatchlist] = useState(() => {
      try {
        const saved = localStorage.getItem('optionsWatchlist')
        const existing = saved ? JSON.parse(saved) : []
        return existing.some(
          (i: any) =>
            i.symbol === symbol && i.strike === trade.strike && i.expiration === trade.expiration
        )
      } catch {
        return false
      }
    })

    const handleStar = (e: React.MouseEvent) => {
      e.stopPropagation()
      if (!trade?.strike || !trade?.expiration || !trade?.contractPrice) return
      try {
        const saved = localStorage.getItem('optionsWatchlist')
        const existing = saved ? JSON.parse(saved) : []
        if (inWatchlist) {
          localStorage.setItem(
            'optionsWatchlist',
            JSON.stringify(
              existing.filter(
                (i: any) =>
                  !(
                    i.symbol === symbol &&
                    i.strike === trade.strike &&
                    i.expiration === trade.expiration
                  )
              )
            )
          )
          setInWatchlist(false)
        } else {
          localStorage.setItem(
            'optionsWatchlist',
            JSON.stringify([
              ...existing,
              {
                id: `${symbol}-${trade.strike}-${trade.expiration}-${Date.now()}`,
                ticker:
                  trade.optionTicker ||
                  `${symbol}${trade.strike}${trade.optionType === 'call' ? 'C' : 'P'}`,
                symbol,
                strike: trade.strike,
                type: trade.optionType?.toLowerCase() || 'call',
                contract_type: trade.optionType?.toLowerCase() || 'call',
                expiration: trade.expiration,
                bid: trade.contractPrice * 0.98,
                ask: trade.contractPrice * 1.02,
                lastPrice: trade.contractPrice,
                last_price: trade.contractPrice,
                delta: trade.delta || 0,
                theta: trade.thetaDecay ? -Math.abs(trade.thetaDecay) : 0,
                implied_volatility: trade.impliedVolatility || 0,
                strike_price: trade.strike,
                expiration_date: trade.expiration,
                addedAt: new Date(),
                entryPrice: trade.contractPrice,
                stockPrice: trade.stockPrice || trade.strike,
                stopLoss: trade.contractPrice * 0.75,
              },
            ])
          )
          setInWatchlist(true)
        }
      } catch {}
    }

    return (
      <div
        onDoubleClick={() => setTradeDetailPopup({ trade, symbol })}
        style={{
          position: 'relative',
          background: `linear-gradient(160deg,rgba(18,18,18,0.95) 0%,rgba(10,10,10,0.98) 100%)`,
          border: `1px solid ${accentBorder}`,
          borderLeft: `3px solid ${accentClr}`,
          borderRadius: '6px',
          boxShadow: `0 0 0 0 transparent, inset 0 1px 0 rgba(255,255,255,0.04), 0 4px 20px rgba(0,0,0,0.6), 0 0 20px ${accentGlow}`,
          cursor: 'pointer',
          overflow: 'hidden',
          transition: 'transform 0.15s, box-shadow 0.15s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-1px)'
          e.currentTarget.style.boxShadow = `0 8px 32px rgba(0,0,0,0.7), 0 0 30px ${accentGlow}`
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'none'
          e.currentTarget.style.boxShadow = `inset 0 1px 0 rgba(255,255,255,0.04), 0 4px 20px rgba(0,0,0,0.6), 0 0 20px ${accentGlow}`
        }}
      >
        {/* Top glow sheen */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '1px',
            background: `linear-gradient(90deg,transparent,${accentClr}66,transparent)`,
          }}
        />

        <div style={{ padding: '20px 20px 18px' }}>
          {/* Row 1: ticker + direction + score + star all in one row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span
              style={{
                fontFamily: '"Courier New",monospace',
                fontWeight: 900,
                fontSize: '2rem',
                color: '#f59e0b',
                letterSpacing: '-0.02em',
                lineHeight: 1,
              }}
            >
              {symbol}
            </span>
            <span
              style={{
                fontFamily: '"Courier New",monospace',
                fontSize: '22px',
                fontWeight: 800,
                color: '#fff',
              }}
            >
              ${trade.strike?.toFixed(0)}
            </span>
            <span
              style={{
                fontFamily: '"Courier New",monospace',
                fontSize: '22px',
                fontWeight: 800,
                color: accentClr,
              }}
            >
              {isBullish ? 'Calls' : 'Puts'}
            </span>
            <span
              style={{
                fontFamily: '"Courier New",monospace',
                fontSize: '22px',
                fontWeight: 700,
                color: '#ffffff',
              }}
            >
              {trade.expiration
                ? new Date(trade.expiration + 'T12:00:00').toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                    timeZone: 'UTC',
                  })
                : ''}
            </span>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ textAlign: 'right' }}>
                <div
                  style={{
                    fontFamily: '"Courier New",monospace',
                    fontSize: '13px',
                    color: 'rgba(255,255,255,0.85)',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    marginBottom: '1px',
                  }}
                >
                  Score
                </div>
                <div
                  style={{
                    fontFamily: '"Courier New",monospace',
                    fontWeight: 900,
                    fontSize: '24px',
                    color: accentClr,
                    lineHeight: 1,
                    textShadow: `0 0 12px ${accentClr}66`,
                  }}
                >
                  {Math.round(trade.score)}
                </div>
              </div>
              <button
                onClick={handleStar}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                  color: inWatchlist ? '#FFD700' : 'rgba(255,255,255,0.6)',
                  fontSize: '18px',
                }}
                title={inWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}
              >
                {inWatchlist ? <TbStarFilled /> : <TbStar />}
              </button>
            </div>
          </div>

          {/* Industry */}
          <div
            style={{
              fontFamily: 'system-ui,sans-serif',
              fontSize: '15px',
              color: '#f59e0b',
              fontWeight: 600,
              letterSpacing: '0.04em',
              marginBottom: '12px',
            }}
          >
            {trade.industry}
          </div>

          {/* Stats grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: '1px',
              background: 'rgba(255,255,255,0.06)',
              borderRadius: '5px',
              overflow: 'hidden',
              marginBottom: '1px',
            }}
          >
            {[
              {
                l: 'Premium',
                v:
                  typeof trade.contractPrice === 'number'
                    ? `$${trade.contractPrice.toFixed(2)}`
                    : '—',
                c: '#fff',
              },
              { l: 'IV', v: `${trade.impliedVolatility || '—'}%`, c: '#00d4ff' },
              {
                l: 'Θ Decay',
                v:
                  typeof trade.thetaDecay === 'number'
                    ? `-$${Math.abs(trade.thetaDecay).toFixed(2)}`
                    : '—',
                c: '#ff8c42',
              },
            ].map((m) => (
              <div
                key={m.l}
                style={{ background: 'rgba(0,0,0,0.5)', padding: '10px 8px', textAlign: 'center' }}
              >
                <div
                  style={{
                    fontFamily: 'system-ui,sans-serif',
                    fontSize: '13px',
                    fontWeight: 700,
                    color: 'rgba(255,255,255,0.85)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.12em',
                    marginBottom: '5px',
                  }}
                >
                  {m.l}
                </div>
                <div
                  style={{
                    fontFamily: '"Courier New",monospace',
                    fontWeight: 800,
                    fontSize: '18px',
                    color: m.c,
                  }}
                >
                  {m.v}
                </div>
              </div>
            ))}
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: '1px',
              background: 'rgba(255,255,255,0.06)',
              borderRadius: '5px',
              overflow: 'hidden',
            }}
          >
            {[
              {
                l: 'Target 1',
                v:
                  typeof trade.stockTarget80 === 'number'
                    ? `$${trade.stockTarget80.toFixed(2)}`
                    : '—',
                c: accentClr,
                bg: isBullish ? 'rgba(0,255,136,0.06)' : 'rgba(255,51,68,0.06)',
              },
              {
                l: 'Target 2',
                v:
                  typeof trade.stockTarget90 === 'number'
                    ? `$${trade.stockTarget90.toFixed(2)}`
                    : '—',
                c: accentClr,
                bg: isBullish ? 'rgba(0,255,136,0.04)' : 'rgba(255,51,68,0.04)',
              },
              {
                l: 'Stop Loss',
                v: typeof trade.stopLoss === 'number' ? `$${trade.stopLoss.toFixed(2)}` : '—',
                c: '#ff3344',
                bg: 'rgba(255,51,68,0.06)',
              },
            ].map((m) => (
              <div key={m.l} style={{ background: m.bg, padding: '10px 8px', textAlign: 'center' }}>
                <div
                  style={{
                    fontFamily: 'system-ui,sans-serif',
                    fontSize: '13px',
                    fontWeight: 700,
                    color: 'rgba(255,255,255,0.85)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.12em',
                    marginBottom: '5px',
                  }}
                >
                  {m.l}
                </div>
                <div
                  style={{
                    fontFamily: '"Courier New",monospace',
                    fontWeight: 800,
                    fontSize: '18px',
                    color: m.c,
                  }}
                >
                  {m.v}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{
          height: '100vh',
          overflowY: 'auto',
          overflowX: 'hidden',
          background: '#030303',
          overscrollBehavior: 'contain',
        }}
      >
        {/* ── Header ── */}
        <div
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 20,
            background: 'rgba(3,3,3,0.97)',
            borderBottom: '1px solid rgba(255,255,255,0.07)',
            backdropFilter: 'blur(16px)',
            flexShrink: 0,
          }}
        >
          {/* Top row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 20px 0',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                <h1
                  style={{
                    fontFamily: "'Inter', system-ui, sans-serif",
                    fontWeight: 900,
                    letterSpacing: '-0.01em',
                    lineHeight: '1.75rem',
                    margin: 0,
                    color: '#fff',
                  }}
                >
                  Market <span style={{ color: '#f59e0b' }}>Intelligence</span>
                </h1>
              </div>
            </div>
            <button
              onClick={() => setActiveSidebarPanel(null)}
              style={{
                width: '28px',
                height: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '50%',
                color: 'rgba(255,255,255,0.85)',
                cursor: 'pointer',
                fontSize: '14px',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
                e.currentTarget.style.color = '#fff'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                e.currentTarget.style.color = 'rgba(255,255,255,0.85)'
              }}
              aria-label="Close"
            >
              <TbX size={14} />
            </button>
          </div>

          {/* Tab bar */}
          <div
            style={{
              display: 'flex',
              marginTop: '32px',
              borderBottom: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            {(
              [
                ['regimes', 'Regimes'],
                ['scanner', 'Scanner'],
              ] as const
            ).map(([t, label]) => (
              <button
                key={t}
                onClick={() => setMainTab(t)}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '18px 0',
                  fontSize: '20px',
                  fontWeight: mainTab === t ? 900 : 600,
                  fontFamily: '"Courier New",monospace',
                  textTransform: 'uppercase',
                  letterSpacing: '0.15em',
                  background: mainTab === t ? '#000' : 'transparent',
                  border: 'none',
                  borderBottom: mainTab === t ? '3px solid #f59e0b' : '3px solid transparent',
                  color: mainTab === t ? '#f59e0b' : '#ffffff',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Progress bar */}
        {isLoadingRegimes && (
          <div style={{ height: '2px', background: 'rgba(255,102,0,0.1)', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${regimeUpdateProgress}%`,
                background: 'linear-gradient(90deg,#ff6600,#ffaa00,#ff6600)',
                backgroundSize: '200% 100%',
                transition: 'width 0.4s ease',
                boxShadow: '0 0 8px rgba(255,102,0,0.6)',
              }}
            />
          </div>
        )}

        {/* ── REGIMES tab ── */}
        {mainTab === 'regimes' && (
          <div style={{ background: '#030303' }}>
            {isLoadingRegimes && !marketRegimeData ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '280px',
                  gap: '16px',
                  padding: '32px',
                }}
              >
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    border: '2px solid rgba(255,102,0,0.2)',
                    borderTop: '2px solid #ff6600',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                  }}
                />
                <div
                  style={{
                    fontFamily: '"Courier New",monospace',
                    fontSize: '13px',
                    color: '#fff',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                  }}
                >
                  {regimeLoadingStage || 'Initializing…'}
                </div>
                <div
                  style={{
                    fontFamily: '"Courier New",monospace',
                    fontSize: '13px',
                    color: '#ff6600',
                    letterSpacing: '0.06em',
                  }}
                >
                  {regimeUpdateProgress}%
                </div>
              </div>
            ) : !marketRegimeData ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '240px',
                  gap: '12px',
                }}
              >
                <div
                  style={{
                    fontFamily: '"Courier New",monospace',
                    fontSize: '14px',
                    color: '#fff',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                  }}
                >
                  Awaiting Market Data
                </div>
              </div>
            ) : (
              <div style={{ padding: '16px 16px 32px' }}>
                {/* Streaming indicator */}
                {isLoadingRegimes && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '10px 14px',
                      background: 'rgba(255,102,0,0.06)',
                      border: '1px solid rgba(255,102,0,0.2)',
                      borderRadius: '5px',
                      marginBottom: '16px',
                    }}
                  >
                    <div
                      style={{
                        width: '7px',
                        height: '7px',
                        borderRadius: '50%',
                        background: '#ff6600',
                        boxShadow: '0 0 8px #ff6600',
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontFamily: '"Courier New",monospace',
                        fontSize: '13px',
                        color: '#ff9600',
                        letterSpacing: '0.08em',
                      }}
                    >
                      {regimeLoadingStage} · {regimeUpdateProgress}%
                    </span>
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                  {/* Short Term section */}
                  {[
                    { label: 'SHORT TERM', bull: shortTermBullish, bear: shortTermBearish },
                    { label: 'LONG TERM', bull: longTermBullish, bear: longTermBearish },
                  ].map(({ label, bull, bear }) => (
                    <div key={label}>
                      {/* Section header */}
                      <div
                        style={{
                          position: 'relative',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginBottom: '16px',
                          padding: '10px 0',
                        }}
                      >
                        <div
                          style={{
                            position: 'absolute',
                            inset: 0,
                            display: 'flex',
                            alignItems: 'center',
                          }}
                        >
                          <div
                            style={{
                              flex: 1,
                              height: '1px',
                              background: 'linear-gradient(90deg,transparent,rgba(255,102,0,0.4))',
                            }}
                          />
                          <div
                            style={{
                              flex: 1,
                              height: '1px',
                              background: 'linear-gradient(90deg,rgba(255,102,0,0.4),transparent)',
                            }}
                          />
                        </div>
                        <div
                          style={{
                            position: 'relative',
                            padding: '4px 20px',
                            background: '#030303',
                            border: '1px solid rgba(255,102,0,0.3)',
                            borderRadius: '20px',
                          }}
                        >
                          <span
                            style={{
                              fontFamily: '"Courier New",monospace',
                              fontWeight: 900,
                              fontSize: '14px',
                              color: '#ff6600',
                              letterSpacing: '0.3em',
                              textTransform: 'uppercase',
                            }}
                          >
                            {label}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                        {/* Bullish section */}
                        <div>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              padding: '10px 14px',
                              background: 'rgba(0,255,136,0.06)',
                              border: '1px solid rgba(0,255,136,0.15)',
                              borderLeft: '3px solid #00ff88',
                              borderRadius: '5px',
                              marginBottom: '12px',
                            }}
                          >
                            <TbTrendingUp size={18} color="#00ff88" />
                            <span
                              style={{
                                fontFamily: '"Courier New",monospace',
                                fontWeight: 900,
                                fontSize: '22px',
                                color: '#00ff88',
                                letterSpacing: '0.2em',
                                textTransform: 'uppercase',
                              }}
                            >
                              Bullish
                            </span>
                            <span
                              style={{
                                marginLeft: 'auto',
                                fontFamily: '"Courier New",monospace',
                                fontSize: '14px',
                                fontWeight: 700,
                                color: '#00ff88',
                                background: 'rgba(0,255,136,0.14)',
                                padding: '2px 10px',
                                borderRadius: '10px',
                              }}
                            >
                              {bull.length}
                            </span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {bull.map((item: any, idx: number) => (
                              <TradeCard key={`b-${label}-${idx}`} item={item} isBullish={true} />
                            ))}
                            {bull.length === 0 && (
                              <div
                                style={{
                                  textAlign: 'center',
                                  padding: '32px 0',
                                  fontFamily: '"Courier New",monospace',
                                  fontSize: '13px',
                                  color: 'rgba(255,255,255,0.7)',
                                  letterSpacing: '0.12em',
                                  textTransform: 'uppercase',
                                }}
                              >
                                No Bullish Signals
                              </div>
                            )}
                          </div>
                        </div>
                        {/* Bearish section */}
                        <div>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              padding: '10px 14px',
                              background: 'rgba(255,51,68,0.06)',
                              border: '1px solid rgba(255,51,68,0.15)',
                              borderLeft: '3px solid #ff3344',
                              borderRadius: '5px',
                              marginBottom: '12px',
                            }}
                          >
                            <TbTrendingDown size={18} color="#ff3344" />
                            <span
                              style={{
                                fontFamily: '"Courier New",monospace',
                                fontWeight: 900,
                                fontSize: '22px',
                                color: '#ff3344',
                                letterSpacing: '0.2em',
                                textTransform: 'uppercase',
                              }}
                            >
                              Bearish
                            </span>
                            <span
                              style={{
                                marginLeft: 'auto',
                                fontFamily: '"Courier New",monospace',
                                fontSize: '14px',
                                fontWeight: 700,
                                color: '#ff3344',
                                background: 'rgba(255,51,68,0.14)',
                                padding: '2px 10px',
                                borderRadius: '10px',
                              }}
                            >
                              {bear.length}
                            </span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {bear.map((item: any, idx: number) => (
                              <TradeCard key={`r-${label}-${idx}`} item={item} isBullish={false} />
                            ))}
                            {bear.length === 0 && (
                              <div
                                style={{
                                  textAlign: 'center',
                                  padding: '32px 0',
                                  fontFamily: '"Courier New",monospace',
                                  fontSize: '13px',
                                  color: 'rgba(255,255,255,0.7)',
                                  letterSpacing: '0.12em',
                                  textTransform: 'uppercase',
                                }}
                              >
                                No Bearish Signals
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── SCANNER tab ── always mounted so it scans in background like regimes */}
        <div style={{ display: mainTab === 'scanner' ? 'block' : 'none' }}>
          <MarketScannerPanel />
        </div>
      </div>

      {tradeDetailPopup && (
        <TradeDetailPopup
          trade={tradeDetailPopup.trade}
          symbol={tradeDetailPopup.symbol}
          onClose={() => setTradeDetailPopup(null)}
          scanPricesCache={scanPricesCacheRef.current}
          scanAllScored={scanAllScoredRef.current}
        />
      )}
    </>
  )
}
