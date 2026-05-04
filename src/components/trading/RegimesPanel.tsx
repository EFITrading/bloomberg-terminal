'use client'

import { TbStar, TbStarFilled, TbTrendingDown, TbTrendingUp, TbX } from 'react-icons/tb'
import {
  TbArrowBigUp, TbArrowBigDown, TbZoomInArea,
  TbBolt, TbChartLine, TbShieldCheck,
  TbChartArrowsVertical, TbMountain, TbChartPieFilled,
  TbArrowUpRight, TbArrowDownRight, TbArrowsExchange,
} from 'react-icons/tb'

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
      .catch(() => { })
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
  volRatio?: number
  high52w?: number
  low52w?: number
  position52w?: number
  pctFrom52H?: number
  weekHigh?: number
  weekLow?: number
  ma50?: number
  ema21?: number
  ema8?: number
  rsi14?: number
  atr14?: number
  atrPct?: number
  momentumScore?: number
  downtrendScore?: number
  breakoutType?: 'week-high' | 'week-low' | '52w-high' | '52w-low'
  reversalType?: 'bullish' | 'bearish'
  sparkData?: Array<{ price: number; etMinutes: number; time: number }>
}

type ScanFetchGroup = 'snapshot' | 'short' | 'full'

interface ScanPreset {
  id: string
  label: string
  icon: React.ReactNode
  color: string
  group: 'Movers' | 'Trend' | 'Structure'
  fetchGroup: ScanFetchGroup
  description: string
  filter: (rows: ScannerRow[]) => ScannerRow[]
  sort: (a: ScannerRow, b: ScannerRow) => number
  limit: number
}

const SCAN_CACHE: Record<ScanFetchGroup, { rows: ScannerRow[]; ts: number } | null> = {
  snapshot: null,
  short: null,
  full: null,
}

const SCAN_TTL: Record<ScanFetchGroup, number> = {
  snapshot: 5 * 60_000,
  short: 15 * 60_000,
  full: 30 * 60_000,
}

const SCAN_PRESETS: ScanPreset[] = [
  // ── Movers ──────────────────────────────────────────────────────────────────
  {
    id: 'movers',
    label: 'Movers',
    icon: <TbChartArrowsVertical />,
    color: '#FFFFFF',
    group: 'Movers',
    fetchGroup: 'snapshot',
    description: 'Top gainers & losers side by side · Vol > 500K · Price > $5',
    filter: (rows) => {
      const base = rows.filter((r) => r.price >= 5 && r.volume >= 500_000)
      const g = [...base.filter((r) => r.changePct > 0)]
        .sort((a, b) => b.changePct - a.changePct)
        .slice(0, 20)
      const l = [...base.filter((r) => r.changePct < 0)]
        .sort((a, b) => a.changePct - b.changePct)
        .slice(0, 20)
      return [...g, ...l]
    },
    sort: () => 0,
    limit: 40,
  },
  {
    id: 'volume-surge',
    label: 'Vol Surge',
    icon: <TbBolt />,
    color: '#FFCC00',
    group: 'Movers',
    fetchGroup: 'short',
    description: 'Trading at 2× normal volume · Unusual institutional activity',
    filter: (rows) =>
      rows.filter((r) => (r.volRatio ?? 0) >= 2 && r.price >= 5 && r.volume >= 1_000_000),
    sort: (a, b) => (b.volRatio ?? 0) - (a.volRatio ?? 0),
    limit: 30,
  },
  // ── Trend ────────────────────────────────────────────────────────────────────
  {
    id: 'momentum',
    label: 'Momentum',
    icon: <TbChartLine />,
    color: '#FF6B00',
    group: 'Trend',
    fetchGroup: 'short',
    description: 'Strong uptrend · Price action accelerating · Volume confirming',
    filter: (rows) =>
      rows.filter(
        (r) =>
          r.rsi14 != null &&
          r.rsi14 >= 45 &&
          r.rsi14 <= 72 &&
          r.ema8 != null &&
          r.ema21 != null &&
          r.ema8 > r.ema21 &&
          r.price > r.ema8 &&
          r.changePct > 0 &&
          (r.volRatio ?? 0) >= 1.0
      ),
    sort: (a, b) => (b.momentumScore ?? 0) - (a.momentumScore ?? 0),
    limit: 30,
  },
  {
    id: 'aggressive-downtrend',
    label: 'Downtrend',
    icon: <TbTrendingDown />,
    color: '#FF2D55',
    group: 'Trend',
    fetchGroup: 'short',
    description: 'Aggressive selling · Distribution on volume · Avoid or short',
    filter: (rows) =>
      rows.filter(
        (r) =>
          r.rsi14 != null &&
          r.rsi14 < 48 &&
          r.ema8 != null &&
          r.ema21 != null &&
          r.ema8 < r.ema21 &&
          r.price < r.ema21 &&
          r.changePct < 0 &&
          (r.volRatio ?? 0) >= 1.0
      ),
    sort: (a, b) => (b.downtrendScore ?? 0) - (a.downtrendScore ?? 0),
    limit: 30,
  },
  {
    id: 'rs-leaders',
    label: 'RS Leaders',
    icon: <TbShieldCheck />,
    color: '#00D4FF',
    group: 'Trend',
    fetchGroup: 'short',
    description: 'Outperforming the market · Relative strength leaders',
    filter: (rows) =>
      rows.filter(
        (r) =>
          r.ma50 != null &&
          r.price > r.ma50 &&
          (r.momentumScore ?? 0) >= 60 &&
          r.changePct >= 0
      ),
    sort: (a, b) => (b.momentumScore ?? 0) - (a.momentumScore ?? 0),
    limit: 30,
  },
  {
    id: 'trend-riders',
    label: 'Trend Riders',
    icon: <TbTrendingUp />,
    color: '#A78BFA',
    group: 'Trend',
    fetchGroup: 'full',
    description: 'Sustained uptrend · High in yearly range · Momentum intact',
    filter: (rows) =>
      rows.filter(
        (r) =>
          r.ma50 != null &&
          r.price > r.ma50 &&
          r.rsi14 != null &&
          r.rsi14 >= 50 &&
          r.rsi14 <= 75 &&
          r.ema8 != null &&
          r.ema21 != null &&
          r.ema8 > r.ema21 &&
          (r.position52w ?? 0) >= 0.6
      ),
    sort: (a, b) => (b.position52w ?? 0) - (a.position52w ?? 0),
    limit: 30,
  },
  // ── Structure ────────────────────────────────────────────────────────────────
  {
    id: '52w-highs',
    label: '52W Highs',
    icon: <TbMountain />,
    color: '#F59E0B',
    group: 'Structure',
    fetchGroup: 'full',
    description: 'Trading within 2% of 52-week high · Strength at new highs',
    filter: (rows) => rows.filter((r) => r.pctFrom52H !== undefined && r.pctFrom52H <= 2),
    sort: (a, b) => (a.pctFrom52H ?? 99) - (b.pctFrom52H ?? 99),
    limit: 40,
  },
  {
    id: '52w-lows',
    label: '52W Lows',
    icon: <TbChartPieFilled />,
    color: '#A855F7',
    group: 'Structure',
    fetchGroup: 'full',
    description: 'Trading within 2% of 52-week low · Capitulation or bottom',
    filter: (rows) => rows.filter((r) => r.position52w !== undefined && r.position52w <= 0.02),
    sort: (a, b) => (a.position52w ?? 1) - (b.position52w ?? 1),
    limit: 40,
  },
  {
    id: 'breakouts',
    label: 'Breakouts',
    icon: <TbArrowUpRight />,
    color: '#00D4FF',
    group: 'Structure',
    fetchGroup: 'full',
    description: 'Breaking above key resistance · Volume confirming the move',
    filter: (rows) =>
      rows.filter((r) => r.breakoutType === 'week-high' || r.breakoutType === '52w-high'),
    sort: (a, b) => (b.volRatio ?? 0) - (a.volRatio ?? 0),
    limit: 30,
  },
  {
    id: 'breakdowns',
    label: 'Breakdowns',
    icon: <TbArrowDownRight />,
    color: '#FF6B6B',
    group: 'Structure',
    fetchGroup: 'full',
    description: 'Breaking below key support · Heavy selling confirmed',
    filter: (rows) =>
      rows.filter((r) => r.breakoutType === 'week-low' || r.breakoutType === '52w-low'),
    sort: (a, b) => (b.volRatio ?? 0) - (a.volRatio ?? 0),
    limit: 30,
  },
  {
    id: 'reversals',
    label: 'Reversals',
    icon: <TbArrowsExchange />,
    color: '#34D399',
    group: 'Structure',
    fetchGroup: 'short',
    description: 'Trend change forming · Multi-signal confluence · Volume surge',
    filter: (rows) => rows.filter((r) => r.reversalType != null),
    sort: (a, b) => (b.volRatio ?? 0) - (a.volRatio ?? 0),
    limit: 30,
  },
]

// ─── Indicator helpers ────────────────────────────────────────────────────────
function calcEMAArr(closes: number[], period: number): number[] {
  const k = 2 / (period + 1)
  return closes.reduce((acc: number[], c, i) => {
    acc.push(i === 0 ? c : c * k + acc[i - 1] * (1 - k))
    return acc
  }, [])
}

function calcLastRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50
  let avgGain = 0,
    avgLoss = 0
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1]
    if (diff > 0) avgGain += diff
    else avgLoss += Math.abs(diff)
  }
  avgGain /= period
  avgLoss /= period
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1]
    avgGain = (avgGain * (period - 1) + Math.max(0, diff)) / period
    avgLoss = (avgLoss * (period - 1) + Math.max(0, -diff)) / period
  }
  return avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
}

// ─── MarketScannerPanel ───────────────────────────────────────────────────────
export const MarketScannerPanel = React.memo(function MarketScannerPanel() {
  const [activePreset, setActivePreset] = useState<string>('gainers')
  const [rows, setRows] = useState<ScannerRow[]>([])
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [lastFetch, setLastFetch] = useState<Date | null>(null)
  const [sparklines, setSparklines] = useState<
    Record<string, Array<{ price: number; etMinutes: number; time: number }>>
  >({})
  const sparkFetchedRef = useRef<string>('')
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768)
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const preset = SCAN_PRESETS.find((p) => p.id === activePreset) ?? SCAN_PRESETS[0]

  // ── Fetch helpers ───────────────────────────────────────────────────────────
  const fetchSnapshotRows = async (): Promise<ScannerRow[]> => {
    const tickers = SCANNER_UNIVERSE.join(',')
    const resp = await fetch(
      `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${tickers}&apikey=${POLYGON_API_KEY}`
    )
    const data = await resp.json()
    const snaps: any[] = data.tickers || []
    return snaps
      .filter((s: any) => {
        const price = s.day?.c || s.lastTrade?.p || 0
        return price >= 1 && s.prevDay?.c > 0
      })
      .map((s: any) => {
        const price = s.day?.c || s.lastTrade?.p || 0
        const prevClose = s.prevDay?.c
        const change = price - prevClose
        const changePct = (change / prevClose) * 100
        return { symbol: s.ticker, price, change, changePct, volume: s.day?.v || 0 } as ScannerRow
      })
  }

  const fetchBarsRows = async (
    days: number,
    onProgress: (pct: number) => void
  ): Promise<ScannerRow[]> => {
    const snapRows = await fetchSnapshotRows()
    const snapMap: Record<string, ScannerRow> = {}
    snapRows.forEach((r) => { snapMap[r.symbol] = r })

    const today = new Date().toISOString().split('T')[0]
    const from = new Date(Date.now() - days * 86400_000).toISOString().split('T')[0]
    const batchSize = 10
    const result: ScannerRow[] = []

    for (let i = 0; i < SCANNER_UNIVERSE.length; i += batchSize) {
      const batch = SCANNER_UNIVERSE.slice(i, i + batchSize)
      const batchRes = await Promise.all(
        batch.map(async (sym) => {
          try {
            const r = await fetch(
              `https://api.polygon.io/v2/aggs/ticker/${sym}/range/1/day/${from}/${today}?adjusted=true&sort=asc&limit=300&apikey=${POLYGON_API_KEY}`
            )
            const d = await r.json()
            const bars: any[] = d.results || []
            if (bars.length < 15) return null

            const n = bars.length
            const closes = bars.map((b: any) => b.c)
            const highs = bars.map((b: any) => b.h)
            const lows = bars.map((b: any) => b.l)
            const vols = bars.map((b: any) => b.v)
            const opens = bars.map((b: any) => b.o)

            const snap = snapMap[sym]
            const price = snap?.price || closes[n - 1]
            const prevClose = closes[n - 2] || closes[n - 1]
            const change = price - prevClose
            const changePct = (change / prevClose) * 100
            const volume = snap?.volume || vols[n - 1]

            const volBars = vols.slice(Math.max(0, n - 21), n - 1)
            const avgVolume =
              volBars.length > 0
                ? volBars.reduce((s: number, v: number) => s + v, 0) / volBars.length
                : 0
            const volRatio = avgVolume > 0 ? volume / avgVolume : 1

            const ema8arr = calcEMAArr(closes, 8)
            const ema21arr = calcEMAArr(closes, 21)
            const ema8 = ema8arr[n - 1]
            const ema21 = ema21arr[n - 1]
            const rsi14 = calcLastRSI(closes, 14)

            const atrLen = Math.min(14, n - 1)
            let atrSum = 0
            for (let j = n - atrLen; j < n; j++) {
              const tr = Math.max(
                highs[j] - lows[j],
                Math.abs(highs[j] - closes[j - 1]),
                Math.abs(lows[j] - closes[j - 1])
              )
              atrSum += tr
            }
            const atr14 = atrSum / atrLen
            const atrPct = (atr14 / price) * 100

            let high52w: number | undefined,
              low52w: number | undefined,
              position52w: number | undefined,
              pctFrom52H: number | undefined
            if (days >= 250) {
              high52w = Math.max(...highs)
              low52w = Math.min(...lows)
              const r52 = high52w - low52w
              position52w = r52 > 0 ? (price - low52w) / r52 : 0.5
              pctFrom52H = ((high52w - price) / high52w) * 100
            }

            const wk = bars.slice(Math.max(0, n - 5))
            const weekHigh = Math.max(...wk.map((b: any) => b.h))
            const weekLow = Math.min(...wk.map((b: any) => b.l))

            let ma50: number | undefined
            if (n >= 50) {
              const m = closes.slice(Math.max(0, n - 50))
              ma50 = m.reduce((s: number, c: number) => s + c, 0) / m.length
            }

            // Composite Momentum Score (0–100)
            const momentumScore = Math.round(
              Math.min(100, Math.max(0,
                (rsi14 - 30) * 0.9 +
                (price > ema8 ? 8 : 0) +
                (ema8 > ema21 ? 8 : 0) +
                (ma50 && price > ma50 ? 6 : 0) +
                (volRatio >= 2 ? 10 : volRatio >= 1.5 ? 7 : volRatio >= 1.2 ? 4 : 0) +
                (changePct > 3 ? 6 : changePct > 1 ? 4 : changePct > 0 ? 2 : -2)
              ))
            )

            // Composite Downtrend Score (0–100)
            const downtrendScore = Math.round(
              Math.min(100, Math.max(0,
                (70 - rsi14) * 0.9 +
                (price < ema8 ? 8 : 0) +
                (ema8 < ema21 ? 8 : 0) +
                (ma50 && price < ma50 ? 6 : 0) +
                (volRatio >= 2 ? 10 : volRatio >= 1.5 ? 7 : volRatio >= 1.2 ? 4 : 0) +
                (changePct < -3 ? 6 : changePct < -1 ? 4 : changePct < 0 ? 2 : -2)
              ))
            )

            let breakoutType: ScannerRow['breakoutType']
            if (high52w && low52w && ma50 && atr14 > 0) {
              const d52H = (high52w - price) / atr14
              const dWkH = (weekHigh - price) / atr14
              const d52L = (price - low52w) / atr14
              const dWkL = (price - weekLow) / atr14
              if (price > ma50 && d52H <= 0.6 && volRatio >= 1.3) breakoutType = '52w-high'
              else if (price > ma50 && dWkH <= 0.35 && volRatio >= 1.2) breakoutType = 'week-high'
              else if (price < ma50 && d52L <= 0.6 && volRatio >= 1.3) breakoutType = '52w-low'
              else if (price < ma50 && dWkL <= 0.35 && volRatio >= 1.2) breakoutType = 'week-low'
            }

            let reversalType: ScannerRow['reversalType']
            if (n >= 3) {
              const prevRSI = calcLastRSI(closes.slice(0, n - 1), 14)
              const prevE21 = ema21arr[n - 2]
              const prevE8 = ema8arr[n - 2]
              const bullBody = closes[n - 1] > opens[n - 1]
              const bearBody = closes[n - 1] < opens[n - 1]
              const rsiRec = prevRSI < 40 && rsi14 >= 40
              const e21Rec = closes[n - 2] < prevE21 && price >= ema21
              const e8Rec = closes[n - 2] < prevE8 && price >= ema8
              const rsiRoll = prevRSI > 60 && rsi14 <= 60
              const e21Br = closes[n - 2] > prevE21 && price <= ema21
              const e8Br = closes[n - 2] > prevE8 && price <= ema8
              const bSigs = (rsiRec ? 1 : 0) + (e21Rec ? 1 : 0) + (e8Rec ? 1 : 0)
              const rSigs = (rsiRoll ? 1 : 0) + (e21Br ? 1 : 0) + (e8Br ? 1 : 0)
              if (bSigs >= 2 && volRatio >= 1.1 && bullBody && rsi14 < 65) reversalType = 'bullish'
              else if (rSigs >= 2 && volRatio >= 1.1 && bearBody && rsi14 > 35) reversalType = 'bearish'
            }

            return {
              symbol: sym, price, change, changePct, volume,
              avgVolume: avgVolume || undefined, volRatio, high52w, low52w,
              position52w, pctFrom52H, weekHigh, weekLow, ma50, ema8, ema21,
              rsi14, atr14, atrPct, momentumScore, downtrendScore, breakoutType, reversalType,
            } as ScannerRow
          } catch {
            return null
          }
        })
      )
      batchRes.forEach((r) => { if (r) result.push(r) })
      onProgress(Math.min(99, Math.round(((i + batchSize) / SCANNER_UNIVERSE.length) * 100)))
    }
    return result
  }

  const runScan = useCallback(async (p: ScanPreset, forceRefresh = false) => {
    const cached = SCAN_CACHE[p.fetchGroup]
    const ttl = SCAN_TTL[p.fetchGroup]
    if (!forceRefresh && cached && Date.now() - cached.ts < ttl) {
      setRows(p.filter(cached.rows).sort(p.sort).slice(0, p.limit))
      return
    }
    if (!cached?.rows?.length) setLoading(true)
    setProgress(0)
    try {
      let allRows: ScannerRow[] = []
      if (p.fetchGroup === 'snapshot') {
        allRows = await fetchSnapshotRows()
      } else if (p.fetchGroup === 'short') {
        allRows = await fetchBarsRows(60, (pct) => setProgress(pct))
      } else {
        allRows = await fetchBarsRows(260, (pct) => setProgress(pct))
      }
      const seen = new Set<string>()
      allRows = allRows.filter((r) => {
        if (seen.has(r.symbol)) return false
        seen.add(r.symbol)
        return true
      })
      SCAN_CACHE[p.fetchGroup] = { rows: allRows, ts: Date.now() }
      setLastFetch(new Date())
      setRows(p.filter(allRows).sort(p.sort).slice(0, p.limit))
    } catch (e) {
      console.error('[Scanner] Fetch failed:', e)
    } finally {
      setLoading(false)
      setProgress(0)
    }
  }, [])

  useEffect(() => {
    const p = SCAN_PRESETS.find((x) => x.id === activePreset) ?? SCAN_PRESETS[0]
    runScan(p)
  }, [activePreset, runScan])

  useEffect(() => {
    if (rows.length === 0) return
    const key = rows.map((r) => r.symbol).join(',')
    if (sparkFetchedRef.current === key) return
    sparkFetchedRef.current = key
    setSparklines({})

    const todayStr = new Date().toISOString().split('T')[0]
    const tenDaysAgo = new Date(Date.now() - 10 * 86400_000).toISOString().split('T')[0]
    const BATCH = 5

    const fetchBatches = async () => {
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
      } catch { }

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
                  const pstStr = date.toLocaleString('en-US', { timeZone: 'America/Los_Angeles', hour12: false })
                  const pst = new Date(pstStr)
                  const etMinutes = pst.getHours() * 60 + pst.getMinutes()
                  return { price: b.c, etMinutes, time: b.t }
                })
                return [row.symbol, bars] as [string, Array<{ price: number; etMinutes: number; time: number }>]
              }
            } catch { }
            return null
          })
        )
        const updates: Record<string, Array<{ price: number; etMinutes: number; time: number }>> = {}
        results.forEach((r) => { if (r) updates[r[0]] = r[1] })
        setSparklines((prev) => ({ ...prev, ...updates }))
        if (i + BATCH < rows.length) await new Promise((res) => setTimeout(res, 300))
      }
    }
    fetchBatches()
  }, [rows])

  // ── Formatters ──────────────────────────────────────────────────────────────
  const fmtVol = (v: number) =>
    v >= 1_000_000_000 ? `${(v / 1_000_000_000).toFixed(1)}B`
      : v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M`
        : v >= 1_000 ? `${(v / 1_000).toFixed(0)}K`
          : String(v)

  const fmtPrice = (p: number) =>
    p >= 1000 ? p.toFixed(0) : p >= 100 ? p.toFixed(1) : p.toFixed(2)

  const rsiColor = (v: number) =>
    v >= 70 ? '#FF2D55' : v <= 30 ? '#FF2D55' : v >= 55 ? '#FF6B00' : '#FFFFFF'

  const presetGroups: Array<ScanPreset['group']> = ['Movers', 'Trend', 'Structure']

  const renderSparkline = (spark: Array<{ price: number; etMinutes: number; time: number }>, compact = false) => {
    const prices = spark.map((p) => p.price)
    const sMin = Math.min(...prices)
    const sMax = Math.max(...prices)
    const sRange = sMax - sMin || 1
    const n = spark.length
    // Viewbox: left padding for y-axis labels, right border, top/bottom padding
    const VW = 200, VH = 60
    const padL = 0, padR = 2, padT = 4, padB = 4
    const chartW = VW - padL - padR
    const chartH = VH - padT - padB

    const xFn = (i: number) => padL + (i / (n - 1)) * chartW
    const yFn = (p: number) => padT + ((sMax - p) / sRange) * chartH

    // Pre/after-hours shading zones
    const zones: { x1: number; x2: number; fill: string }[] = []
    let cz: { start: number; fill: string } | null = null
    spark.forEach((pt, i) => {
      const m = pt.etMinutes
      const fill = m >= 60 && m < 390 ? 'rgba(255,165,0,0.14)' : m >= 780 && m < 1020 ? 'rgba(0,174,239,0.14)' : null
      if (fill) {
        if (!cz || cz.fill !== fill) {
          if (cz) zones.push({ x1: xFn(cz.start), x2: xFn(i), fill: cz.fill })
          cz = { start: i, fill }
        }
      } else if (cz) {
        zones.push({ x1: xFn(cz.start), x2: xFn(i), fill: cz.fill })
        cz = null
      }
    })
    if (cz) { const z = cz as { start: number; fill: string }; zones.push({ x1: xFn(z.start), x2: VW - padR, fill: z.fill }) }

    const pts = spark.map((p, i) => `${xFn(i).toFixed(1)},${yFn(p.price).toFixed(1)}`)
    const isUp = prices[n - 1] >= prices[0]
    const lineColor = isUp ? '#00E87B' : '#FF2D55'
    const lastPt = pts[n - 1]
    const lastX = parseFloat(lastPt.split(',')[0])
    const lastY = parseFloat(lastPt.split(',')[1])
    const openY = yFn(prices[0])
    const areaPath = `M ${pts[0]} ${pts.slice(1).map((p) => `L ${p}`).join(' ')} L ${lastX},${VH - padB} L ${xFn(0)},${VH - padB} Z`

    // Y-axis: 3 price labels (max, current, min)
    const fmtP = (p: number) => p >= 1000 ? p.toFixed(0) : p.toFixed(2)
    const curP = prices[n - 1]

    // X-axis markers
    let openI = -1, closeI = -1
    spark.forEach((pt, i) => {
      if (openI < 0 && pt.etMinutes >= 390) openI = i
      if (closeI < 0 && pt.etMinutes >= 780) closeI = i
    })
    const openXPct = openI >= 0 ? (openI / (n - 1)) * 100 : -1
    const closeXPct = closeI >= 0 ? (closeI / (n - 1)) * 100 : -1

    const svgHeight = compact ? (isMobile ? 85 : 52) : (isMobile ? 118 : 72)

    return (
      <div style={{ width: '100%', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 3 }}>
          {/* Chart */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <svg viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none"
              style={{ width: '100%', height: svgHeight, display: 'block' }}>
              <defs>
                <linearGradient id={`sg-${spark[0].time}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={lineColor} stopOpacity="0.2" />
                  <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
                </linearGradient>
              </defs>
              {/* Shading zones */}
              {zones.map((z, idx) => (
                <rect key={idx} x={z.x1} y={padT} width={Math.max(0, z.x2 - z.x1)} height={chartH}
                  fill={z.fill} vectorEffect="non-scaling-stroke" />
              ))}
              {/* Y-axis border */}
              <line x1={VW - padR - 0.5} y1={padT} x2={VW - padR - 0.5} y2={VH - padB}
                stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
              {/* X-axis border */}
              <line x1={padL} y1={VH - padB - 0.5} x2={VW - padR} y2={VH - padB - 0.5}
                stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
              {/* Prev-close dashed */}
              <line x1={padL} y1={openY.toFixed(1)} x2={VW - padR} y2={openY.toFixed(1)}
                stroke="rgba(255,255,255,0.18)" strokeWidth="0.75" strokeDasharray="2,2"
                vectorEffect="non-scaling-stroke" />
              {/* Area fill */}
              <path d={areaPath} fill={`url(#sg-${spark[0].time})`} vectorEffect="non-scaling-stroke" />
              {/* Price line */}
              <polyline fill="none" stroke={lineColor} strokeWidth="1.5"
                points={pts.join(' ')} strokeLinecap="round" strokeLinejoin="round"
                vectorEffect="non-scaling-stroke" />
              {/* Last price dot */}
              <circle cx={lastX} cy={lastY} r="2.5" fill={lineColor} />
            </svg>
            {/* X-axis time labels */}
            {!compact && (
              <div style={{ position: 'relative', height: 13 }}>
                {openXPct >= 0 && (
                  <span style={{
                    position: 'absolute', fontSize: isMobile ? 10 : 8, color: '#FFAA00', fontWeight: 700,
                    fontFamily: '"Courier New",monospace', left: `${openXPct}%`, transform: 'translateX(-50%)'
                  }}>
                    6:30
                  </span>
                )}
                {closeXPct >= 0 && (
                  <span style={{
                    position: 'absolute', fontSize: isMobile ? 10 : 8, color: '#00AAEE', fontWeight: 700,
                    fontFamily: '"Courier New",monospace', left: `${closeXPct}%`, transform: 'translateX(-50%)'
                  }}>
                    1 PM
                  </span>
                )}
              </div>
            )}
          </div>
          {/* Y-axis labels */}
          {!compact && (
            <div style={{
              width: 38, display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
              paddingBottom: 13, fontSize: isMobile ? 13 : 8, textAlign: 'right',
              fontFamily: '"Courier New",monospace', gap: 0
            }}>
              <span style={{ color: '#ffffff' }}>{fmtP(sMax)}</span>
              <span style={{ color: lineColor, fontWeight: 900 }}>{fmtP(curP)}</span>
              <span style={{ color: '#ffffff' }}>{fmtP(sMin)}</span>
            </div>
          )}
        </div>
      </div>
    )
  }

  const renderSignal = (row: ScannerRow): React.ReactNode => {
    const btColors: Record<string, string> = {
      '52w-high': '#F59E0B', 'week-high': '#00D4FF', '52w-low': '#A855F7', 'week-low': '#FF6B6B',
    }
    const btLabels: Record<string, string> = {
      '52w-high': '52H↑', 'week-high': 'WK↑', '52w-low': '52L↓', 'week-low': 'WK↓',
    }
    if (row.breakoutType) {
      const c = btColors[row.breakoutType]
      return (
        <span style={{
          fontSize: '9px', fontWeight: 800, fontFamily: '"Courier New",monospace',
          color: c, border: `1px solid ${c}`,
          padding: '1px 4px', borderRadius: '2px', whiteSpace: 'nowrap',
        }}>{btLabels[row.breakoutType]}</span>
      )
    }
    if (row.reversalType) {
      const c = row.reversalType === 'bullish' ? '#00E87B' : '#FF2D55'
      return (
        <span style={{
          fontSize: '9px', fontWeight: 800, fontFamily: '"Courier New",monospace',
          color: c, border: `1px solid ${c}`,
          padding: '1px 4px', borderRadius: '2px', whiteSpace: 'nowrap',
        }}>{row.reversalType === 'bullish' ? 'REV↑' : 'REV↓'}</span>
      )
    }
    return null
  }

  return (
    <div style={{ background: '#050505', minHeight: '100%', display: 'flex', flexDirection: 'column', fontFamily: '"Courier New",monospace' }}>

      {/* ── Preset Grid — 2 rows of 6, full width ───────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(6, 1fr)',
        gap: '1px',
        borderBottom: '2px solid #FF6B00',
        flexShrink: 0,
        background: '#111',  /* gap color between cells */
      }}>
        {SCAN_PRESETS.map((p) => {
          const isActive = activePreset === p.id
          return (
            <button
              key={p.id}
              onClick={() => setActivePreset(p.id)}
              title={p.description}
              style={{
                padding: '10px 4px',
                cursor: 'pointer',
                fontSize: '10px',
                fontFamily: '"Courier New",monospace',
                fontWeight: 700,
                letterSpacing: '0.04em',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                textAlign: 'center',
                background: '#000000',
                border: 'none',
                borderBottom: isActive ? '2px solid #FF6B00' : '2px solid transparent',
                color: isActive ? '#FF6B00' : '#FFFFFF',
                transition: 'all 0.1s',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = '#111'
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = '#000000'
                }
              }}
            >
              <div style={{ fontSize: '22px', lineHeight: 1, marginBottom: '4px', display: 'flex', justifyContent: 'center' }}>{p.icon}</div>
              <div style={{ fontSize: '11px' }}>{p.label}</div>
            </button>
          )
        })}
        {/* ── Refresh cell ── */}
        <button
          onClick={() => runScan(preset, true)}
          style={{
            padding: '10px 4px',
            cursor: 'pointer',
            fontFamily: '"Courier New",monospace',
            textAlign: 'center',
            background: '#000000',
            border: 'none',
            borderBottom: '2px solid transparent',
            color: '#FF6B00',
            transition: 'all 0.1s',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#111' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#000000' }}
          title="Refresh scan"
        >
          <div style={{ fontSize: '22px', lineHeight: 1 }}>↺</div>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em' }}>
            REFRESH
          </div>
        </button>
      </div>

      {/* ── Progress bar ─────────────────────────────────────────────────────── */}
      {loading && (
        <div style={{ height: '2px', background: '#111', flexShrink: 0 }}>
          <div style={{
            height: '100%', background: '#FF6B00',
            width: progress > 0 ? `${progress}%` : '15%',
            transition: progress > 0 ? 'width 0.3s ease' : 'none',
          }} />
        </div>
      )}

      {/* ── Table ────────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', width: '100%' }}>

        {/* ── MOVERS split view ── */}
        {activePreset === 'movers' && !loading && rows.length > 0 && (() => {
          const gainers = rows.filter((r) => r.changePct >= 0)
          const losers = rows.filter((r) => r.changePct < 0)
          const renderSide = (list: ScannerRow[], side: 'gainers' | 'losers') => {
            const isGainers = side === 'gainers'
            const accentClr = isGainers ? '#00E87B' : '#FF2D55'
            return (
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                {/* side header */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '22px 1fr 92px',
                  gap: '0 6px', padding: '7px 10px',
                  borderBottom: `2px solid ${accentClr}`,
                  position: 'sticky', top: 0, background: '#050505', zIndex: 10,
                }}>
                  {[{ l: '#', a: 'right' as const }, { l: 'SYMBOL', a: 'left' as const }, { l: 'CHANGE', a: 'center' as const }].map(({ l, a }) => (
                    <div key={l} style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.12em', color: accentClr, opacity: 0.7, textAlign: a }}>{l}</div>
                  ))}
                </div>
                {list.map((row, i) => {
                  const spark = sparklines[row.symbol]
                  const changeClr = row.changePct >= 0 ? '#00E87B' : '#FF2D55'
                  return (
                    <div key={row.symbol} style={{
                      display: 'flex', flexDirection: 'column',
                      padding: '6px 10px 2px',
                      borderBottom: '1px solid #111',
                      background: i % 2 === 0 ? 'transparent' : '#080808',
                      transition: 'background 0.08s',
                    }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#161616' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : '#080808' }}
                    >
                      {/* Top row: rank | symbol | change */}
                      <div style={{ display: 'grid', gridTemplateColumns: '22px 1fr 92px', gap: '0 6px', alignItems: 'center', marginBottom: 4 }}>
                        <div style={{ fontSize: '10px', color: isMobile ? '#FFFFFF' : '#444', textAlign: 'right', fontWeight: 600 }}>{i + 1}</div>
                        <div style={{ fontSize: '14px', fontWeight: 900, color: '#FFFFFF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.symbol}</div>
                        <div style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px',
                          padding: '3px 6px', borderRadius: '3px',
                          background: row.changePct >= 0 ? 'rgba(0,232,123,0.1)' : 'rgba(255,45,85,0.1)',
                          border: `1px solid ${changeClr}`,
                          fontSize: '12px', fontWeight: 800, color: changeClr,
                        }}>
                          {row.changePct >= 0 ? '▲' : '▼'} {Math.abs(row.changePct).toFixed(2)}%
                        </div>
                      </div>
                      {/* Full-width sparkline */}
                      <div style={{ width: '100%' }}>
                        {spark && spark.length > 1 ? renderSparkline(spark) : <div style={{ height: isMobile ? 134 : 85 }} />}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          }
          return (
            <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>
              {renderSide(gainers, 'gainers')}
              <div style={{ width: '1px', background: '#1e1e1e', flexShrink: 0 }} />
              {renderSide(losers, 'losers')}
            </div>
          )
        })()}

        {/* ── Standard table (all non-movers presets) ── */}
        {activePreset !== 'movers' && (
          <>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '26px 76px 90px 106px 80px 62px',
              gap: '0 8px',
              padding: '9px 16px',
              borderBottom: '2px solid #FF6B00',
              position: 'sticky', top: 0,
              background: '#050505',
              zIndex: 10,
              boxSizing: 'border-box',
            }}>
              {[
                { l: '#', align: 'right' as const },
                { l: 'SYMBOL', align: 'left' as const },
                { l: 'PRICE', align: 'right' as const },
                { l: 'CHANGE', align: 'center' as const },
                { l: 'VOLUME', align: 'left' as const },
                { l: 'V/AVG', align: 'center' as const },
              ].map(({ l, align }) => (
                <div key={l} style={{
                  fontSize: isMobile ? '13px' : '10px', fontWeight: 700, letterSpacing: '0.12em',
                  color: isMobile ? '#FF6B00' : '#FFFFFF', opacity: isMobile ? 1 : 0.4, textAlign: align,
                }}>
                  {l}
                </div>
              ))}
            </div>

            {/* Loading */}
            {loading && rows.length === 0 && (
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', gap: '14px', padding: '80px 20px',
              }}>
                <div style={{
                  width: '32px', height: '32px', borderRadius: '50%',
                  border: '2px solid #222',
                  borderTop: '2px solid #FF6B00',
                  animation: 'bblspin 0.7s linear infinite',
                }} />
                <div style={{ fontSize: '11px', color: '#FF6B00', letterSpacing: '0.2em' }}>
                  SCANNING{progress > 0 ? ` ${progress}%` : '...'}
                </div>
              </div>
            )}

            {/* Empty */}
            {!loading && rows.length === 0 && (
              <div style={{
                padding: '80px 20px', textAlign: 'center',
                fontSize: '12px', color: isMobile ? '#FFFFFF' : '#444', letterSpacing: '0.14em',
              }}>
                NO SIGNALS DETECTED
              </div>
            )}

            {/* Rows */}
            {rows.map((row, i) => {
              const isUp = row.changePct >= 0
              const changeClr = isUp ? '#00E87B' : '#FF2D55'
              const spark = sparklines[row.symbol]
              const signal = renderSignal(row)
              const vr = row.volRatio ?? 0
              const vrLabel = row.volRatio != null ? `${row.volRatio.toFixed(1)}×` : '—'
              const vrClr = vr >= 3 ? '#FF6B00' : vr >= 2 ? '#FFCC00' : vr >= 1.3 ? '#00E87B' : (isMobile ? '#FFFFFF' : '#555')

              return (
                <div
                  key={row.symbol}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '8px 16px 2px',
                    borderBottom: '1px solid #111',
                    background: i % 2 === 0 ? 'transparent' : '#080808',
                    cursor: 'default',
                    boxSizing: 'border-box',
                    transition: 'background 0.08s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#161616' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : '#080808' }}
                >
                  {/* Top row: rank | symbol | price | change | volume | v/avg | signal */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '26px 76px 90px 106px 80px 62px',
                    gap: '0 8px',
                    alignItems: 'center',
                    marginBottom: 4,
                  }}>
                    {/* Rank */}
                    <div style={{ fontSize: '11px', color: isMobile ? '#FFFFFF' : '#444', textAlign: 'right', fontWeight: 600 }}>
                      {i + 1}
                    </div>

                    {/* Symbol + signal badge */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden' }}>
                      <span style={{
                        fontSize: '15px', fontWeight: 900, letterSpacing: '0.03em',
                        color: '#FFFFFF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {row.symbol}
                      </span>
                      {signal && <div style={{ flexShrink: 0 }}>{signal}</div>}
                    </div>

                    {/* Price */}
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#FFFFFF', textAlign: 'right' }}>
                      ${fmtPrice(row.price)}
                    </div>

                    {/* Change % badge */}
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px',
                      padding: '4px 8px', borderRadius: '3px',
                      background: isUp ? 'rgba(0,232,123,0.1)' : 'rgba(255,45,85,0.1)',
                      border: `1px solid ${changeClr}`,
                      fontSize: '13px', fontWeight: 800, color: changeClr,
                      letterSpacing: '0.01em',
                    }}>
                      {isUp ? '▲' : '▼'} {Math.abs(row.changePct).toFixed(2)}%
                    </div>

                    {/* Volume */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ fontSize: '13px', color: '#FFFFFF', fontWeight: 700 }}>
                        {fmtVol(row.volume)}
                      </div>
                      <div style={{ height: '3px', background: '#1a1a1a', borderRadius: '2px' }}>
                        <div style={{
                          height: '100%', borderRadius: '2px',
                          width: `${Math.min(100, (Math.log10(Math.max(row.volume, 1)) / Math.log10(100_000_000)) * 100)}%`,
                          background: '#FF6B00',
                          opacity: 0.7,
                        }} />
                      </div>
                    </div>

                    {/* V/Avg */}
                    <div style={{
                      fontSize: '13px', textAlign: 'center', fontWeight: 800,
                      color: vrClr,
                    }}>
                      {vrLabel}
                    </div>
                  </div>

                  {/* Full-width sparkline below */}
                  <div style={{ width: '100%' }}>
                    {spark && spark.length > 1
                      ? renderSparkline(spark)
                      : <div style={{ height: isMobile ? 134 : 85 }} />}
                  </div>
                </div>
              )
            })}

            {rows.length > 0 && <div style={{ height: '40px' }} />}
          </>
        )}

        {/* movers loading / empty */}
        {activePreset === 'movers' && loading && rows.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '14px', padding: '80px 20px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '50%', border: '2px solid #222', borderTop: '2px solid #FF6B00', animation: 'bblspin 0.7s linear infinite' }} />
            <div style={{ fontSize: '11px', color: '#FF6B00', letterSpacing: '0.2em' }}>SCANNING{progress > 0 ? ` ${progress}%` : '...'}</div>
          </div>
        )}
      </div>

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <div style={{
        borderTop: '1px solid #1a1a1a', padding: '7px 16px', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {([['#FF6B00', '3×+'], ['#FFCC00', '2×+'], ['#00E87B', '1.3×+']] as [string, string][]).map(([c, l]) => (
            <div key={l} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <div style={{ width: '8px', height: '2px', background: c, borderRadius: '1px' }} />
              <span style={{ fontSize: '9px', color: '#FFFFFF', opacity: isMobile ? 1 : 0.35, letterSpacing: '0.1em' }}>
                VOL {l}
              </span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: '10px', color: '#FFFFFF', opacity: isMobile ? 1 : 0.2, letterSpacing: '0.08em' }}>
          {lastFetch ? lastFetch.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''}
        </div>
      </div>

      <style>{`@keyframes bblspin { to { transform: rotate(360deg); } }`}</style>
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
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768)
  const scrollRef = useRef<HTMLDivElement>(null)
  const savedScroll = useRef<number>(0)

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

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
      } catch { }
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

        {isMobile ? (
          /* ── MOBILE: 3-row compact layout ── */
          <div style={{ padding: '7px 7px 6px' }}>
            {/* Header: ticker + score + star */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px' }}>
              <span style={{ fontFamily: '"Courier New",monospace', fontWeight: 900, fontSize: '14px', color: '#f59e0b', letterSpacing: '-0.01em' }}>{symbol}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '3px', flexShrink: 0 }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: '"Courier New",monospace', fontSize: '7px', color: '#ffffff', letterSpacing: '0.12em', textTransform: 'uppercase' }}>SCORE</div>
                  <div style={{ fontFamily: '"Courier New",monospace', fontWeight: 900, fontSize: '14px', color: accentClr, lineHeight: 1 }}>{Math.round(trade.score)}</div>
                </div>
                <button onClick={handleStar} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: inWatchlist ? '#FFD700' : '#ffffff', fontSize: '14px' }} title={inWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}>
                  {inWatchlist ? <TbStarFilled /> : <TbStar />}
                </button>
              </div>
            </div>
            {/* Row 1: contract — $strike Calls/Puts Date */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '5px', overflow: 'hidden' }}>
              <span style={{ fontFamily: '"Courier New",monospace', fontWeight: 800, fontSize: '12px', color: '#fff', flexShrink: 0 }}>${trade.strike?.toFixed(0)}</span>
              <span style={{ fontFamily: '"Courier New",monospace', fontWeight: 800, fontSize: '12px', color: accentClr, flexShrink: 0 }}>{isBullish ? 'Calls' : 'Puts'}</span>
              <span style={{ fontFamily: '"Courier New",monospace', fontSize: '11px', fontWeight: 600, color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {trade.expiration ? new Date(trade.expiration + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : ''}
              </span>
            </div>
            {/* Row 2: Premium / IV / Decay */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', overflow: 'hidden', marginBottom: '1px' }}>
              {[
                { l: 'Premium', v: typeof trade.contractPrice === 'number' ? `$${trade.contractPrice.toFixed(2)}` : '—', c: '#fff' },
                { l: 'IV', v: `${trade.impliedVolatility || '—'}%`, c: '#00d4ff' },
                { l: 'Θ Decay', v: typeof trade.thetaDecay === 'number' ? `-$${Math.abs(trade.thetaDecay).toFixed(2)}` : '—', c: '#ff8c42' },
              ].map((m) => (
                <div key={m.l} style={{ background: 'rgba(0,0,0,0.5)', padding: '4px 2px', textAlign: 'center' }}>
                  <div style={{ fontFamily: 'system-ui,sans-serif', fontSize: '8px', fontWeight: 700, color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '2px' }}>{m.l}</div>
                  <div style={{ fontFamily: '"Courier New",monospace', fontWeight: 800, fontSize: '11px', color: m.c }}>{m.v}</div>
                </div>
              ))}
            </div>
            {/* Row 3: Target 1 / Target 2 / Stop Loss */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', overflow: 'hidden' }}>
              {[
                { l: 'Target 1', v: typeof trade.stockTarget80 === 'number' ? `$${trade.stockTarget80.toFixed(2)}` : '—', c: accentClr, bg: isBullish ? 'rgba(0,255,136,0.06)' : 'rgba(255,51,68,0.06)' },
                { l: 'Target 2', v: typeof trade.stockTarget90 === 'number' ? `$${trade.stockTarget90.toFixed(2)}` : '—', c: accentClr, bg: isBullish ? 'rgba(0,255,136,0.04)' : 'rgba(255,51,68,0.04)' },
                { l: 'Stop Loss', v: typeof trade.stopLoss === 'number' ? `$${trade.stopLoss.toFixed(2)}` : '—', c: '#ff3344', bg: 'rgba(255,51,68,0.06)' },
              ].map((m) => (
                <div key={m.l} style={{ background: m.bg, padding: '4px 2px', textAlign: 'center' }}>
                  <div style={{ fontFamily: 'system-ui,sans-serif', fontSize: '8px', fontWeight: 700, color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '2px' }}>{m.l}</div>
                  <div style={{ fontFamily: '"Courier New",monospace', fontWeight: 800, fontSize: '11px', color: m.c }}>{m.v}</div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* ── DESKTOP: original full layout ── */
          <div style={{ padding: '20px 20px 18px' }}>
            {/* Row 1: ticker + direction + score + star all in one row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <span style={{ fontFamily: '"Courier New",monospace', fontWeight: 900, fontSize: '2rem', color: '#f59e0b', letterSpacing: '-0.02em', lineHeight: 1 }}>{symbol}</span>
              <span style={{ fontFamily: '"Courier New",monospace', fontSize: '22px', fontWeight: 800, color: '#fff' }}>${trade.strike?.toFixed(0)}</span>
              <span style={{ fontFamily: '"Courier New",monospace', fontSize: '22px', fontWeight: 800, color: accentClr }}>{isBullish ? 'Calls' : 'Puts'}</span>
              <span style={{ fontFamily: '"Courier New",monospace', fontSize: '22px', fontWeight: 700, color: '#ffffff' }}>
                {trade.expiration ? new Date(trade.expiration + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : ''}
              </span>
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: '"Courier New",monospace', fontSize: '13px', color: 'rgba(255,255,255,0.85)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '1px' }}>Score</div>
                  <div style={{ fontFamily: '"Courier New",monospace', fontWeight: 900, fontSize: '24px', color: accentClr, lineHeight: 1, textShadow: `0 0 12px ${accentClr}66` }}>{Math.round(trade.score)}</div>
                </div>
                <button onClick={handleStar} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: inWatchlist ? '#FFD700' : 'rgba(255,255,255,0.6)', fontSize: '18px' }} title={inWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}>
                  {inWatchlist ? <TbStarFilled /> : <TbStar />}
                </button>
              </div>
            </div>
            {/* Industry */}
            <div style={{ fontFamily: 'system-ui,sans-serif', fontSize: '15px', color: '#f59e0b', fontWeight: 600, letterSpacing: '0.04em', marginBottom: '12px' }}>{trade.industry}</div>
            {/* Stats grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1px', background: 'rgba(255,255,255,0.06)', borderRadius: '5px', overflow: 'hidden', marginBottom: '1px' }}>
              {[
                { l: 'Premium', v: typeof trade.contractPrice === 'number' ? `$${trade.contractPrice.toFixed(2)}` : '—', c: '#fff' },
                { l: 'IV', v: `${trade.impliedVolatility || '—'}%`, c: '#00d4ff' },
                { l: 'Θ Decay', v: typeof trade.thetaDecay === 'number' ? `-$${Math.abs(trade.thetaDecay).toFixed(2)}` : '—', c: '#ff8c42' },
              ].map((m) => (
                <div key={m.l} style={{ background: 'rgba(0,0,0,0.5)', padding: '10px 8px', textAlign: 'center' }}>
                  <div style={{ fontFamily: 'system-ui,sans-serif', fontSize: '13px', fontWeight: 700, color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '5px' }}>{m.l}</div>
                  <div style={{ fontFamily: '"Courier New",monospace', fontWeight: 800, fontSize: '18px', color: m.c }}>{m.v}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1px', background: 'rgba(255,255,255,0.06)', borderRadius: '5px', overflow: 'hidden' }}>
              {[
                { l: 'Target 1', v: typeof trade.stockTarget80 === 'number' ? `$${trade.stockTarget80.toFixed(2)}` : '—', c: accentClr, bg: isBullish ? 'rgba(0,255,136,0.06)' : 'rgba(255,51,68,0.06)' },
                { l: 'Target 2', v: typeof trade.stockTarget90 === 'number' ? `$${trade.stockTarget90.toFixed(2)}` : '—', c: accentClr, bg: isBullish ? 'rgba(0,255,136,0.04)' : 'rgba(255,51,68,0.04)' },
                { l: 'Stop Loss', v: typeof trade.stopLoss === 'number' ? `$${trade.stopLoss.toFixed(2)}` : '—', c: '#ff3344', bg: 'rgba(255,51,68,0.06)' },
              ].map((m) => (
                <div key={m.l} style={{ background: m.bg, padding: '10px 8px', textAlign: 'center' }}>
                  <div style={{ fontFamily: 'system-ui,sans-serif', fontSize: '13px', fontWeight: 700, color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '5px' }}>{m.l}</div>
                  <div style={{ fontFamily: '"Courier New",monospace', fontWeight: 800, fontSize: '18px', color: m.c }}>{m.v}</div>
                </div>
              ))}
            </div>
          </div>
        )}
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
          {/* Top row — desktop: title + close. Mobile: tabs + close in one row */}
          {isMobile ? (
            <div style={{ display: 'flex', alignItems: 'stretch', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              {(['regimes', 'REGIMES'], ['scanner', 'SCANNER']).length > 0 && (
                [['regimes', 'REGIMES'], ['scanner', 'SCANNER']] as const
              ).map(([t, label]) => (
                <button
                  key={t}
                  onClick={() => setMainTab(t)}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '12px 0',
                    fontSize: '13px',
                    fontWeight: mainTab === t ? 900 : 600,
                    fontFamily: '"Courier New",monospace',
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
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
              <button
                onClick={() => setActiveSidebarPanel(null)}
                style={{
                  width: '48px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(220,50,50,0.15)',
                  border: 'none',
                  borderLeft: '1px solid rgba(255,255,255,0.07)',
                  borderBottom: '3px solid transparent',
                  color: '#ff7070',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
                aria-label="Close"
              >
                <TbX size={18} />
              </button>
            </div>
          ) : (
            <>
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
                    flexShrink: 0,
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
              <div
                style={{
                  display: 'flex',
                  marginTop: '32px',
                  borderBottom: '1px solid rgba(255,255,255,0.1)',
                }}
              >
                {(
                  [
                    ['regimes', 'REGIMES'],
                    ['scanner', 'SCANNER'],
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
            </>
          )}
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
              <div style={{ padding: isMobile ? '8px 8px 24px' : '16px 16px 32px' }}>
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

                <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '16px' : '32px' }}>
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
                          marginBottom: isMobile ? '8px' : '16px',
                          padding: isMobile ? '6px 0' : '10px 0',
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

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: isMobile ? '6px' : '20px' }}>
                        {/* Bullish section */}
                        <div>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: isMobile ? '4px' : '10px',
                              padding: isMobile ? '6px 8px' : '10px 14px',
                              background: 'rgba(0,255,136,0.06)',
                              border: '1px solid rgba(0,255,136,0.15)',
                              borderLeft: '3px solid #00ff88',
                              borderRadius: '5px',
                              marginBottom: isMobile ? '6px' : '12px',
                            }}
                          >
                            <TbTrendingUp size={isMobile ? 12 : 18} color="#00ff88" />
                            <span
                              style={{
                                fontFamily: '"Courier New",monospace',
                                fontWeight: 900,
                                fontSize: isMobile ? '13px' : '22px',
                                color: '#00ff88',
                                letterSpacing: isMobile ? '0.06em' : '0.2em',
                                textTransform: 'uppercase',
                              }}
                            >
                              Bullish
                            </span>
                            <span
                              style={{
                                marginLeft: 'auto',
                                fontFamily: '"Courier New",monospace',
                                fontSize: isMobile ? '11px' : '14px',
                                fontWeight: 700,
                                color: '#00ff88',
                                background: 'rgba(0,255,136,0.14)',
                                padding: isMobile ? '1px 5px' : '2px 10px',
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
                              gap: isMobile ? '4px' : '10px',
                              padding: isMobile ? '6px 8px' : '10px 14px',
                              background: 'rgba(255,51,68,0.06)',
                              border: '1px solid rgba(255,51,68,0.15)',
                              borderLeft: '3px solid #ff3344',
                              borderRadius: '5px',
                              marginBottom: isMobile ? '6px' : '12px',
                            }}
                          >
                            <TbTrendingDown size={isMobile ? 12 : 18} color="#ff3344" />
                            <span
                              style={{
                                fontFamily: '"Courier New",monospace',
                                fontWeight: 900,
                                fontSize: isMobile ? '13px' : '22px',
                                color: '#ff3344',
                                letterSpacing: isMobile ? '0.06em' : '0.2em',
                                textTransform: 'uppercase',
                              }}
                            >
                              Bearish
                            </span>
                            <span
                              style={{
                                marginLeft: 'auto',
                                fontFamily: '"Courier New",monospace',
                                fontSize: isMobile ? '11px' : '14px',
                                fontWeight: 700,
                                color: '#ff3344',
                                background: 'rgba(255,51,68,0.14)',
                                padding: isMobile ? '1px 5px' : '2px 10px',
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
