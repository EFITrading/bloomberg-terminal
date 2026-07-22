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
import { useRegimesPanelMobile } from './useRegimesPanelMobile'

// ─── Constants ────────────────────────────────────────────────────────────────
const POLYGON_API_KEY = '' || ''

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

// ─── TradeCardChart ─────────────────────────────────────────────────────────
export const CARD_TIMEFRAMES = [
  { label: '5M', value: '5m', days: 10, defaultBars: 78 },
  { label: '1H', value: '1h', days: 365, defaultBars: 120 },
  { label: '1D', value: '1d', days: 365, defaultBars: 60 },
  { label: '1W', value: '1w', days: 2555, defaultBars: 104 },
]

export function TradeCardChart({
  symbol, industrySymbol, target1Price, target2Price, stopPrice,
  gammaLevel, structuralLevel, structuralIsResistance, spamLevel,
}: {
  symbol: string
  industrySymbol?: string
  target1Price?: number | null
  target2Price?: number | null
  stopPrice?: number | null
  gammaLevel?: number | null
  structuralLevel?: number | null
  structuralIsResistance?: boolean
  spamLevel?: number | null
}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const [timeframe, setTimeframe] = React.useState('1D')
  const [candles, setCandles] = React.useState<any[]>([])
  const [spyCandles, setSpyCandles] = React.useState<any[]>([])
  const [industryCandles, setIndustryCandles] = React.useState<any[]>([])
  const [loading, setLoading] = React.useState(true)
  const [fetching, setFetching] = React.useState(false)

  const stateRef = React.useRef({ offset: 0, barsVisible: 21 })
  const dragRef = React.useRef({
    active: false, mode: 'pan' as 'pan' | 'yscale',
    startX: 0, startY: 0, startOffset: 0, startMultiplier: 1,
    startCenterPrice: 0, startPriceRange: 0,
    velocity: 0, lastX: 0, lastTime: 0,
  })
  const inertiaRef = React.useRef<number | null>(null)
  const yScaleRef = React.useRef({ multiplier: 1, centerPrice: null as number | null })
  const drawRef = React.useRef<() => void>(() => { })

  React.useEffect(() => {
    const tf = CARD_TIMEFRAMES.find((t) => t.label === timeframe) ?? CARD_TIMEFRAMES[2]
    const from = new Date(Date.now() - tf.days * 86400000).toISOString().split('T')[0]
    const to = new Date().toISOString().split('T')[0]
    if (timeframe === '1D') setLoading(true)
    else setFetching(true)
    const syms = industrySymbol ? [symbol, 'SPY', industrySymbol] : [symbol, 'SPY']
    fetch('/api/bulk-chart-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbols: syms, timeframe: tf.value, startDate: from, endDate: to }),
    })
      .then((r) => r.json())
      .then((data) => {
        const sc = data.data?.[symbol] || []
        const spy = data.data?.['SPY'] || []
        const ind = industrySymbol ? (data.data?.[industrySymbol] || []) : []
        setCandles(sc)
        setSpyCandles(spy)
        setIndustryCandles(ind)
        stateRef.current = { offset: 0, barsVisible: Math.min(tf.defaultBars, sc.length) }
        yScaleRef.current = { multiplier: 1, centerPrice: null }
      })
      .catch(() => { })
      .finally(() => { setLoading(false); setFetching(false) })
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

    ctx.setLineDash([])
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, W, H)

    if (loading || candles.length === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.25)'
      ctx.font = 'bold 11px "Courier New",monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(loading ? 'LOADING…' : 'NO DATA', W / 2, H / 2)
      return
    }

    const isDaily = timeframe === '1D' || timeframe === '1W'
    const { offset, barsVisible } = stateRef.current
    const total = candles.length
    const start = Math.max(0, total - barsVisible - offset)
    const end = Math.min(total, start + barsVisible)
    const visible = candles.slice(start, end)
    if (visible.length === 0) return

    // Build SPY map
    const spyMap = new Map<string, number>()
    spyCandles.forEach((c: any) => {
      const ts = c.timestamp ?? c.t
      let key: string
      if (isDaily) {
        const d = ts ? new Date(ts) : new Date((c.date || '') + 'T00:00:00')
        key = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`
      } else {
        key = ts ? String(Math.round(ts / 60000)) : ''
      }
      if (key) spyMap.set(key, c.close)
    })

    // Build industry map
    const industryMap = new Map<string, number>()
    industryCandles.forEach((c: any) => {
      const ts = c.timestamp ?? c.t
      let key: string
      if (isDaily) {
        const d = ts ? new Date(ts) : new Date((c.date || '') + 'T00:00:00')
        key = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`
      } else {
        key = ts ? String(Math.round(ts / 60000)) : ''
      }
      if (key) industryMap.set(key, c.close)
    })

    const PAD_L = 56, PAD_R = 64, PAD_T = 18, PAD_B = 28
    const chartW = W - PAD_L - PAD_R
    const availH = H - PAD_T - PAD_B
    const CANDLE_H = availH
    const lblSize = Math.min(15, Math.max(11, Math.floor(W * 0.0325)))
    const fmtP = (v: number) => v >= 1000 ? v.toFixed(0) : v.toFixed(1)

    // ── Candle panel ──
    const highs = visible.map((c: any) => c.high ?? c.close)
    const lows = visible.map((c: any) => c.low ?? c.close)
    const naturalHi = Math.max(...highs)
    const naturalLo = Math.min(...lows)
    const naturalRange = naturalHi - naturalLo || naturalHi * 0.02 || 1
    const ys = yScaleRef.current
    let hi: number, lo: number, priceRange: number
    if (ys.centerPrice !== null) {
      priceRange = naturalRange / ys.multiplier
      lo = ys.centerPrice - priceRange / 2
      hi = ys.centerPrice + priceRange / 2
    } else {
      hi = naturalHi
      lo = naturalLo
      priceRange = naturalRange
    }
    const toY = (v: number) => PAD_T + CANDLE_H - ((v - lo) / priceRange) * CANDLE_H
    const barW = chartW / visible.length

    visible.forEach((c: any, i: number) => {
      const o = c.open ?? c.close
      const cl = c.close
      const h = c.high ?? c.close
      const l = c.low ?? c.close
      const color = cl >= o ? '#00ff00' : '#ff0000'
      // Integer-snapped coordinates for crispy rendering
      const x0 = Math.round(PAD_L + i * barW)
      const x1 = Math.round(PAD_L + (i + 1) * barW)
      const bw = Math.max(1, x1 - x0)
      const midX = x0 + Math.floor(bw / 2)
      const wickW = Math.max(1, Math.round(bw * 0.1))
      // Wick
      ctx.strokeStyle = color
      ctx.lineWidth = wickW
      ctx.beginPath()
      ctx.moveTo(midX + 0.5, Math.round(toY(h)) + 0.5)
      ctx.lineTo(midX + 0.5, Math.round(toY(l)) + 0.5)
      ctx.stroke()
      // Body
      const bodyTop = Math.round(toY(Math.max(o, cl)))
      const bodyBot = Math.round(toY(Math.min(o, cl)))
      const bodyH = Math.max(1, bodyBot - bodyTop)
      ctx.fillStyle = color
      ctx.fillRect(x0 + wickW, bodyTop, Math.max(1, bw - wickW * 2), bodyH)
    })

    // Right Y-axis vertical border line — candle panel
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'
    ctx.lineWidth = 1
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.moveTo(W - PAD_R, PAD_T)
    ctx.lineTo(W - PAD_R, PAD_T + CANDLE_H)
    ctx.stroke()

    // Y-axis: last-close orange label first (highest priority), then static levels that don't overlap it
    ctx.font = `bold ${lblSize}px "Courier New",monospace`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    const lastClose = visible[visible.length - 1]?.close
    const lcY = lastClose !== undefined ? Math.round(toY(lastClose)) : -9999
    const yGap = Math.ceil(lblSize * 1.5)
    for (let i = 0; i <= 4; i++) {
      const val = lo + (priceRange / 4) * i
      const y = Math.round(toY(val))
      if (Math.abs(y - lcY) < yGap) continue  // skip: would overlap orange label
      if (y > PAD_T + CANDLE_H - Math.ceil(lblSize * 0.7)) continue  // skip: too close to ratio panel border
      const lbl = fmtP(val)
      const lw = ctx.measureText(lbl).width
      ctx.fillStyle = '#000000'
      ctx.fillRect(W - PAD_R + 2, y - Math.ceil(lblSize * 0.65), lw + 6, Math.ceil(lblSize * 1.3))
      ctx.fillStyle = '#ffffff'
      ctx.fillText(lbl, W - PAD_R + 4, y)
    }
    if (lastClose !== undefined) {
      const lcText = fmtP(lastClose)
      const lcTW = ctx.measureText(lcText).width
      ctx.fillStyle = '#000000'
      ctx.fillRect(W - PAD_R + 2, lcY - Math.ceil(lblSize * 0.65), lcTW + 6, Math.ceil(lblSize * 1.3))
      ctx.fillStyle = '#FF6600'
      ctx.fillText(lcText, W - PAD_R + 4, lcY)
    }

    // ── Trade-management overlay: target1/target2/stop as dashed horizontal lines ──
    const drawHLine = (price: number, color: string, label: string) => {
      const y = Math.round(toY(price))
      if (y < PAD_T - 4 || y > PAD_T + CANDLE_H + 4) return
      ctx.save()
      ctx.strokeStyle = color
      ctx.lineWidth = 1.25
      ctx.setLineDash([5, 3])
      ctx.beginPath()
      ctx.moveTo(PAD_L, y + 0.5)
      ctx.lineTo(W - PAD_R, y + 0.5)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.restore()
      const lbl = `${label} ${fmtP(price)}`
      ctx.font = `bold ${Math.max(9, lblSize - 2)}px "Courier New",monospace`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      const lw = ctx.measureText(lbl).width
      ctx.fillStyle = color
      ctx.fillRect(W - PAD_R + 2, y - Math.ceil(lblSize * 0.65), lw + 6, Math.ceil(lblSize * 1.3))
      ctx.fillStyle = '#000000'
      ctx.fillText(lbl, W - PAD_R + 4, y)
    }
    if (typeof target1Price === 'number' && target1Price > 0) drawHLine(target1Price, '#22c55e', 'T1')
    if (typeof target2Price === 'number' && target2Price > 0) drawHLine(target2Price, '#16a34a', 'T2')
    if (typeof stopPrice === 'number' && stopPrice > 0) drawHLine(stopPrice, '#ef4444', 'SL')

    // ── Signal overlay: glowing zone lines for active Gamma Attack / Structural / Spammer
    // detections (from FlowTrackingPanel's FlowBias rows), so the chart shows exactly which
    // levels are driving those labels instead of a bare target/stop chart. ──
    const drawGlowLine = (price: number, color: string, label: string) => {
      const y = Math.round(toY(price))
      if (y < PAD_T - 4 || y > PAD_T + CANDLE_H + 4) return
      ctx.save()
      ctx.shadowColor = color
      ctx.shadowBlur = 8
      ctx.strokeStyle = color
      ctx.lineWidth = 1.75
      ctx.setLineDash([2, 3])
      ctx.beginPath()
      ctx.moveTo(PAD_L, y + 0.5)
      ctx.lineTo(W - PAD_R, y + 0.5)
      ctx.stroke()
      ctx.shadowBlur = 0
      ctx.setLineDash([])
      ctx.restore()
      ctx.font = `bold ${Math.max(9, lblSize - 3)}px "Courier New",monospace`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      const lw = ctx.measureText(label).width
      ctx.fillStyle = color
      ctx.fillRect(PAD_L + 4, y - Math.ceil(lblSize * 0.6), lw + 8, Math.ceil(lblSize * 1.2))
      ctx.fillStyle = '#000000'
      ctx.fillText(label, PAD_L + 8, y)
    }
    if (typeof gammaLevel === 'number' && gammaLevel > 0 && timeframe === '5M') drawGlowLine(gammaLevel, '#ff8c00', '⚡ GAMMA ATTACK')
    if (typeof structuralLevel === 'number' && structuralLevel > 0 && timeframe === '5M') {
      drawGlowLine(structuralLevel, structuralIsResistance ? '#a855f7' : '#38bdf8', structuralIsResistance ? '▲ STRUCTURAL RES' : '▼ STRUCTURAL SUP')
    }
    if (typeof spamLevel === 'number' && spamLevel > 0 && timeframe === '5M') drawGlowLine(spamLevel, '#facc15', '● SPAMMER')

    // X-axis: up to 5 evenly-spaced date labels (solid white)
    const xLblFont = Math.min(19, Math.max(16, Math.floor(W * 0.0413)))
    ctx.font = `bold ${xLblFont}px "Courier New",monospace`
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    const xSteps = Math.min(5, visible.length)
    for (let s = 0; s < xSteps; s++) {
      const i = xSteps === 1 ? 0 : Math.round(s * (visible.length - 1) / (xSteps - 1))
      const c = visible[i]
      const ts = c.timestamp ?? c.t
      let label: string
      if (timeframe === '5M' || timeframe === '1H') {
        const date = ts ? new Date(ts) : new Date()
        label = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`
      } else {
        const d = ts ? new Date(ts) : new Date((c.date || '') + 'T00:00:00')
        label = `${d.getUTCMonth() + 1}/${d.getUTCDate()}`
      }
      ctx.fillText(label, PAD_L + i * barW + barW * 0.5, H - PAD_B + 3)
    }
  }, [candles, spyCandles, industryCandles, loading, timeframe, industrySymbol, target1Price, target2Price, stopPrice, gammaLevel, structuralLevel, structuralIsResistance, spamLevel])

  drawRef.current = draw

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const ro = new ResizeObserver(() => {
      canvas.width = canvas.offsetWidth * dpr
      canvas.height = canvas.offsetHeight * dpr
      drawRef.current()
    })
    ro.observe(canvas)
    canvas.width = (canvas.offsetWidth || 300) * dpr
    canvas.height = (canvas.offsetHeight || 160) * dpr
    draw()
    return () => ro.disconnect()
  }, [draw])

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const clamp = (o: number, bars: number, total: number) =>
      Math.max(0, Math.min(Math.max(0, total - bars), o))
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const total = candles.length
      if (total === 0) return
      if (inertiaRef.current !== null) { cancelAnimationFrame(inertiaRef.current); inertiaRef.current = null }
      const chartW = canvas.offsetWidth - 56 - 64
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        const barPx = chartW / stateRef.current.barsVisible
        stateRef.current.offset = clamp(stateRef.current.offset - (e.deltaX / barPx) * 1.5, stateRef.current.barsVisible, total)
      } else {
        const factor = e.deltaY > 0 ? 1.1 : 0.91
        const newBars = Math.max(5, Math.min(total, stateRef.current.barsVisible * factor))
        stateRef.current.barsVisible = newBars
        stateRef.current.offset = clamp(stateRef.current.offset, newBars, total)
      }
      drawRef.current()
    }
    canvas.addEventListener('wheel', handler, { passive: false })
    return () => canvas.removeEventListener('wheel', handler)
  }, [candles])

  React.useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current.active) return
      if (dragRef.current.mode === 'yscale') {
        const dy = dragRef.current.startY - e.clientY
        yScaleRef.current.multiplier = Math.max(0.1, Math.min(50, dragRef.current.startMultiplier * Math.pow(1.006, dy)))
        drawRef.current()
        return
      }
      const canvas = canvasRef.current
      const W = canvas?.offsetWidth ?? 300
      const H = canvas?.offsetHeight ?? 160
      const barPx = (W - 56 - 64) / stateRef.current.barsVisible
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
      stateRef.current.offset = Math.max(0, Math.min(Math.max(0, total - stateRef.current.barsVisible), dragRef.current.startOffset + dragBars))

      // Vertical drag pans the visible price range up/down (Y-axis panning)
      const candleH = H - 18 - 28
      if (candleH > 0 && dragRef.current.startPriceRange > 0) {
        const dyPx = e.clientY - dragRef.current.startY
        const priceDelta = (dyPx / candleH) * dragRef.current.startPriceRange
        yScaleRef.current.centerPrice = dragRef.current.startCenterPrice + priceDelta
      }
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
        if (Math.abs(vel) < 0.0008) { inertiaRef.current = null; return }
        stateRef.current.offset = Math.max(0, Math.min(Math.max(0, total - stateRef.current.barsVisible), stateRef.current.offset + vel * 16))
        drawRef.current()
        inertiaRef.current = requestAnimationFrame(animate)
      }
      inertiaRef.current = requestAnimationFrame(animate)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [candles])

  const onMouseDown = (e: React.MouseEvent) => {
    if (inertiaRef.current !== null) { cancelAnimationFrame(inertiaRef.current); inertiaRef.current = null }
    const canvas = canvasRef.current
    const W = canvas?.offsetWidth ?? 300
    const isYAxis = e.nativeEvent.offsetX > W - 64
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
        active: true, mode: 'yscale',
        startX: e.clientX, startY: e.clientY,
        startOffset: stateRef.current.offset, startMultiplier: yScaleRef.current.multiplier,
        startCenterPrice: 0, startPriceRange: 0,
        velocity: 0, lastX: e.clientX, lastTime: performance.now(),
      }
    } else {
      // Seed the vertical-pan baseline from the currently visible candles (or the existing
      // manual Y-scale, if one is already active) so dragging feels continuous.
      const total = candles.length
      const { offset, barsVisible } = stateRef.current
      const start = Math.max(0, total - barsVisible - offset)
      const vis = candles.slice(start, start + barsVisible)
      let startCenterPrice = yScaleRef.current.centerPrice ?? 0
      let startPriceRange = 0
      if (vis.length > 0) {
        const vhi = Math.max(...vis.map((c: any) => c.high ?? c.close))
        const vlo = Math.min(...vis.map((c: any) => c.low ?? c.close))
        const naturalRange = (vhi - vlo) || vhi * 0.02 || 1
        startPriceRange = naturalRange / yScaleRef.current.multiplier
        if (yScaleRef.current.centerPrice === null) startCenterPrice = (vhi + vlo) / 2
      }
      dragRef.current = {
        active: true, mode: 'pan',
        startX: e.clientX, startY: e.clientY,
        startOffset: stateRef.current.offset, startMultiplier: 1,
        startCenterPrice, startPriceRange,
        velocity: 0, lastX: e.clientX, lastTime: performance.now(),
      }
    }
  }

  const onDoubleClick = (e: React.MouseEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (e.nativeEvent.offsetX > canvas.offsetWidth - 64) {
      yScaleRef.current = { multiplier: 1, centerPrice: null }
      drawRef.current()
    }
  }

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '390px',
        marginTop: '10px',
        borderRadius: '6px',
        overflow: 'hidden',
        background: '#000',
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.07)',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block', cursor: 'grab' }}
        onMouseDown={onMouseDown}
        onDoubleClick={onDoubleClick}
        onMouseMove={(e) => {
          if (dragRef.current.active) return
          const canvas = canvasRef.current
          if (!canvas) return
          canvas.style.cursor = e.nativeEvent.offsetX > canvas.offsetWidth - 64 ? 'ns-resize' : 'grab'
        }}
      />
      {/* Timeframe buttons */}
      <div style={{ position: 'absolute', top: '6px', left: '6px', display: 'flex', gap: '3px', zIndex: 20, pointerEvents: 'auto' }}>
        {CARD_TIMEFRAMES.map((tf) => (
          <button
            key={tf.label}
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              dragRef.current.active = false
              setTimeframe(tf.label)
            }}
            style={{
              padding: '2px 8px',
              fontFamily: '"Courier New",monospace',
              fontSize: '11px',
              fontWeight: 800,
              letterSpacing: '0.05em',
              background: '#000',
              color: timeframe === tf.label ? '#FF6600' : '#ffffff',
              border: `1px solid ${timeframe === tf.label ? '#FF6600' : 'rgba(255,255,255,0.12)'}`,
              borderRadius: '3px',
              cursor: 'pointer',
            }}
          >
            {tf.label}
          </button>
        ))}
        {fetching && (
          <span style={{ fontFamily: '"Courier New",monospace', fontSize: '10px', color: '#ff6600', lineHeight: '20px', letterSpacing: '0.1em' }}>
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
  rsRating?: number
  adScore?: number
  volAccel?: number     // avg vol last 5 bars / avg vol last 20 bars (volume trend)
  tightness?: number    // stdev of last 10 closes / price × 100 (base tightness)
  upDays10?: number     // count of up-closes in last 10 bars (trend persistence)
  vol5avg?: number      // avg vol last 5 trading days (excl. today)
  vol13avg?: number     // avg vol last 13 trading days
  vol252avg?: number    // avg vol last 252 trading days (1 year)
  volPattern?: 'push-pull' | 'hv-bounce' | 'qf-bounce' | 'hv-fall-lv-bounce'
  breakoutType?: 'week-high' | 'week-low' | '52w-high' | '52w-low'
  reversalType?: 'bullish' | 'bearish'
  monthHigh?: number
  quarterHigh?: number
  is52wBreak?: boolean
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
  hidden?: boolean
  tabLabel?: string   // override for tab button text only
}

const SCAN_CACHE: Record<ScanFetchGroup, { rows: ScannerRow[]; ts: number } | null> = {
  snapshot: null,
  short: null,
  full: null,
}

const PRESET_PAIRS: Record<string, string> = {
  'rs-scan': 'rs-weak',
  'rs-weak': 'rs-scan',
  '52w-highs': '52w-lows',
  '52w-lows': '52w-highs',
  'breakouts': 'breakdowns',
  'breakdowns': 'breakouts',
  'reversals-bull': 'reversals-bear',
  'reversals-bear': 'reversals-bull',
}

const SCAN_TTL: Record<ScanFetchGroup, number> = {
  snapshot: 5 * 60_000,
  short: 15 * 60_000,
  full: 30 * 60_000,
}

// SPY sparkline cache keyed by timeframe ('1D'|'5M'|'1H'|'1W')
const SPY_SPARK_CACHE: Record<string, number[]> = {}
// Module-level sparkline cache: key = `${symbol}_${tf}` → bars array. Persists across tab switches.
type SparkBar = { price: number; etMinutes: number; time: number; volume?: number }
const SPARKLINE_CACHE: Record<string, SparkBar[]> = {}
const SCAN_INFLIGHT: Partial<Record<string, boolean>> = {}
const TICKER_BLACKLIST = new Set(['CMA', 'K', 'CYBR'])

const SCAN_QUOTES: { body: string; author: string }[] = [
  { body: "The trend is your friend — until it bends.", author: '— Wall Street Proverb' },
  { body: "Volume is the weapon of the informed trader.", author: '— EFI Research' },
  { body: "Block trades don't lie. Institutions leave footprints.", author: '— EFI Research' },
  { body: "Flow precedes price. Always follow the paper.", author: '— EFI Research' },
  { body: "The best trades come from where conviction meets volume.", author: '— EFI Research' },
  { body: "In the short run the market is a voting machine. In the long run, a weighing machine.", author: '— Benjamin Graham' },
  { body: "Cut your losses short and let your winners run.", author: '— Wall Street axiom' },
  { body: "Risk comes from not knowing what you're doing.", author: '— Warren Buffett' },
  { body: "Volatility is not risk. The permanent loss of capital is risk.", author: '— Howard Marks' },
  { body: "Markets can remain irrational longer than you can remain solvent.", author: '— John Maynard Keynes' },
  { body: "Unusual activity today is tomorrow's headline.", author: '— EFI Research' },
  { body: "When the smart money speaks, it speaks in size.", author: '— EFI Research' },
  { body: "The market moves toward max pain like a river to the sea.", author: '— EFI Research' },
  { body: "Be fearful when others are greedy, and greedy when others are fearful.", author: '— Warren Buffett' },
  { body: "It's not about being right. It's about being right on size.", author: '— EFI Research' },
]

const SCAN_PRESETS: ScanPreset[] = [
  // ── RS Composite Scanner ─────────────────────────────────────────────────────
  {
    id: 'rs-scan',
    label: 'Standouts',
    icon: <TbShieldCheck />,
    color: '#FF6B00',
    group: 'Trend',
    fetchGroup: 'full',
    description: 'RS Leaders · Multi-period relative strength + institutional accumulation',
    filter: (rows) =>
      rows.filter(
        (r) =>
          r.price >= 5 &&
          r.volume >= 200_000 &&
          // RS strong but not already parabolic
          (r.rsRating ?? 0) >= 45 && (r.rsRating ?? 0) <= 82 &&
          // Volume building (5d avg > 20d avg × 1.1) — building interest, not a single spike
          (r.volAccel ?? 0) >= 1.1 &&
          // Not a spike day — something happening but not already exploding
          Math.abs(r.changePct) <= 5 && Math.abs(r.changePct) >= 0.2 &&
          // Healthy RSI — trending up, not overbought
          (r.rsi14 ?? 50) >= 45 && (r.rsi14 ?? 50) <= 74 &&
          // Near MA50: not extended above it, not deep below it
          r.ma50 != null && r.price >= r.ma50 * 0.88 && r.price <= r.ma50 * 1.12 &&
          // Not at lows
          (r.position52w ?? 0) >= 0.2 &&
          // Body-weighted volume confirms buying pressure
          (r.adScore ?? 0) >= 50
      ),
    sort: (a, b) => {
      // Score = volume acceleration (most weight) + RS + AD quality
      const sA = (a.volAccel ?? 1) * 40 + (a.rsRating ?? 0) * 0.4 + (a.adScore ?? 0) * 0.2
      const sB = (b.volAccel ?? 1) * 40 + (b.rsRating ?? 0) * 0.4 + (b.adScore ?? 0) * 0.2
      return sB - sA
    },
    limit: 30,
  },
  {
    id: 'rs-weak',
    label: 'RS Laggards',
    hidden: true,
    icon: <TbTrendingDown />,
    color: '#FF2D55',
    group: 'Trend',
    fetchGroup: 'full',
    description: 'RS Laggards · Weakest relative strength + distribution · Short/avoid candidates',
    filter: (rows) =>
      rows.filter(
        (r) =>
          r.price >= 5 &&
          r.volume >= 300_000 &&
          (r.rsRating ?? 0) <= 40 &&
          (r.adScore ?? 0) <= 48
      ),
    sort: (a, b) => (a.rsRating ?? 99) - (b.rsRating ?? 99),
    limit: 30,
  },
  {
    id: 'volume-surge',
    label: 'Volume',
    icon: <TbBolt />,
    color: '#FFCC00',
    group: 'Movers',
    fetchGroup: 'full',
    description: 'Volume surge vs multi-period baseline · Unusual institutional activity',
    filter: (rows) => rows.filter((r) => r.price >= 5 && r.volume >= 300_000),
    sort: (a, b) => (b.volRatio ?? 0) - (a.volRatio ?? 0),
    limit: 60,
  },
  // ── Structure ────────────────────────────────────────────────────────────────
  {
    id: '52w-highs',
    label: '52 Week',
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
    hidden: true,
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
    label: 'Breakout',
    tabLabel: 'Breaking',
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
    hidden: true,
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
    id: 'reversals-bull',
    label: 'Bullish Reversal',
    icon: <TbArrowsExchange />,
    color: '#34D399',
    group: 'Structure',
    fetchGroup: 'short',
    description: 'Bullish reversals · Volume surge · Multi-signal confluence',
    filter: (rows) => rows.filter((r) => r.reversalType === 'bullish'),
    sort: (a, b) => (b.volRatio ?? 0) - (a.volRatio ?? 0),
    limit: 30,
  },
  {
    id: 'reversals-bear',
    label: 'Bearish Reversal',
    hidden: true,
    icon: <TbArrowsExchange />,
    color: '#FF6B6B',
    group: 'Structure',
    fetchGroup: 'short',
    description: 'Bearish reversals · Distribution on volume · Fade/short candidates',
    filter: (rows) => rows.filter((r) => r.reversalType === 'bearish'),
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
  const [activePreset, setActivePreset] = useState<string>('rs-scan')
  const [rows, setRows] = useState<ScannerRow[]>([])
  const [loading, setLoading] = useState(false)
  const [scanQuoteIdx, setScanQuoteIdx] = useState(() => Math.floor(Math.random() * SCAN_QUOTES.length))
  const [chartTf, setChartTf] = useState<'1D' | '5M' | '1H' | '1W'>('1D')
  const [symbolTf, setSymbolTf] = useState<Record<string, '1D' | '5M' | '1H' | '1W'>>({})
  const [breakoutTfFilter, setBreakoutTfFilter] = useState<'week' | 'month' | 'quarter' | 'year'>('year')
  const [reversalFilter, setReversalFilter] = useState<'all' | 'vol2x' | 'vol3x'>('all')
  const [filter52w, setFilter52w] = useState<'all' | 'first-break'>('all')
  const [volScanMode, setVolScanMode] = useState<'hitters' | 'push-pull' | 'hv-bounce' | 'qf-bounce' | '5D' | '13D' | '21D' | '1Y'>('hitters')
  const [spySpark, setSpySpark] = useState<number[]>([])
  const [progress, setProgress] = useState(0)
  const [lastFetch, setLastFetch] = useState<Date | null>(null)
  const [sparklines, setSparklines] = useState<Record<string, SparkBar[]>>({})
  const sparkFetchedRef = useRef<string>('')
  const [pairedRows, setPairedRows] = useState<ScannerRow[]>([])
  const pairedSparkFetchedRef = useRef<string>('')
  const { isMobile } = useRegimesPanelMobile()

  useEffect(() => {
    if (!loading) return
    const iv = setInterval(() => setScanQuoteIdx(i => (i + 1) % SCAN_QUOTES.length), 5000)
    return () => clearInterval(iv)
  }, [loading])

  const preset = SCAN_PRESETS.find((p) => p.id === activePreset) ?? SCAN_PRESETS[0]

  // ── Fetch helpers ───────────────────────────────────────────────────────────
  const fetchSnapshotRows = async (): Promise<ScannerRow[]> => {
    const tickers = SCANNER_UNIVERSE.join(',')
    const url = `/api/polygon/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${tickers}&apikey=${POLYGON_API_KEY}`
    const resp = await fetch(url)
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
              `/api/polygon/v2/aggs/ticker/${sym}/range/1/day/${from}/${today}?adjusted=true&sort=asc&limit=300&apikey=${POLYGON_API_KEY}`
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

            // Multi-period volume averages (trading days only, excl. today)
            const vol5avg = n >= 6 ? vols.slice(n - 6, n - 1).reduce((a: number, b: number) => a + b, 0) / 5 : avgVolume
            const vol13avg = n >= 14 ? vols.slice(n - 14, n - 1).reduce((a: number, b: number) => a + b, 0) / 13 : avgVolume
            const vol252avg = n >= 13 ? vols.slice(Math.max(0, n - 253), n - 1).reduce((a: number, b: number) => a + b, 0) / Math.min(252, n - 1) : avgVolume

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

            // ── RS Rating raw score (percentile-ranked below after batch) ──────
            const ret5d = n >= 6 ? (closes[n - 1] / closes[n - 6] - 1) * 100 : changePct
            const ret21d = n >= 22 ? (closes[n - 1] / closes[n - 22] - 1) * 100 : changePct
            const ret63d = n >= 64 ? (closes[n - 1] / closes[n - 64] - 1) * 100 : changePct
            const ret126d = n >= 127 ? (closes[n - 1] / closes[n - 127] - 1) * 100 : ret63d
            const rsRaw = ret63d * 0.4 + ret21d * 0.3 + ret126d * 0.2 + ret5d * 0.1

            // ── Volume patterns ───────────────────────────────────────────────
            let volPattern: ScannerRow['volPattern']
            if (n >= 5 && avgVolume > 0) {
              // Push + low-vol pullback: big up move 1-4 days ago on high vol, today low vol pullback
              const prevHighVolUp = (() => {
                for (let j = Math.max(1, n - 4); j < n - 1; j++) {
                  const dc = (closes[j] - closes[j - 1]) / closes[j - 1] * 100
                  if (dc > 1.5 && vols[j] > avgVolume * 1.4) return true
                }
                return false
              })()
              if (prevHighVolUp && changePct < 0 && changePct > -4 && volume < avgVolume * 0.85) volPattern = 'push-pull'

              // High-vol bounce: was trending down, today bouncing on above-avg vol
              if (!volPattern) {
                const wasDown = closes[n - 2] < closes[Math.max(0, n - 6)]
                if (wasDown && changePct > 0.5 && volume > avgVolume * 1.4) volPattern = 'hv-bounce'
              }

              // Quiet fall + vol bounce: fell on low vol past 3 days, now bouncing on higher vol
              if (!volPattern) {
                let lowVolDays = 0, downDays = 0
                for (let j = Math.max(1, n - 4); j < n - 1; j++) {
                  if (closes[j] < closes[j - 1]) downDays++
                  if (vols[j] < avgVolume * 0.85) lowVolDays++
                }
                if (downDays >= 2 && lowVolDays >= 2 && changePct > 0 && volume > avgVolume * 1.2) volPattern = 'qf-bounce'
              }

              // High-vol fall + low-vol bounce (dead cat watch)
              if (!volPattern) {
                const prevHighVolDown = (() => {
                  for (let j = Math.max(1, n - 4); j < n - 1; j++) {
                    const dc = (closes[j] - closes[j - 1]) / closes[j - 1] * 100
                    if (dc < -1.5 && vols[j] > avgVolume * 1.3) return true
                  }
                  return false
                })()
                if (prevHighVolDown && changePct > 0 && volume < avgVolume * 0.8) volPattern = 'hv-fall-lv-bounce'
              }
            }

            // ── Accumulation/Distribution Score: body-weighted volume on up/down candles ─
            const adLen = Math.min(21, n)
            let upWtVol = 0, downWtVol = 0
            for (let j = n - adLen; j < n; j++) {
              const bodyPct = Math.abs(closes[j] - opens[j]) / (closes[j] || 1)
              const weighted = vols[j] * (bodyPct + 0.001) // small floor so flat days still count
              if (closes[j] > opens[j]) upWtVol += weighted
              else if (closes[j] < opens[j]) downWtVol += weighted
            }
            const adScore = (upWtVol + downWtVol) > 0 ? Math.round(upWtVol / (upWtVol + downWtVol) * 100) : 50

            // ── Volume acceleration: 5-day avg / 20-day avg (rising = building interest) ─
            const vol5avgAccel = n >= 5 ? vols.slice(n - 5).reduce((a, b) => a + b, 0) / 5 : volume
            const vol20avg = n >= 20 ? vols.slice(n - 20).reduce((a, b) => a + b, 0) / 20 : (avgVolume || volume)
            const volAccel = vol20avg > 0 ? Math.round((vol5avgAccel / vol20avg) * 100) / 100 : 1

            // ── Base tightness: stdev of last 10 closes / price (low = coiling) ──
            const t10 = closes.slice(Math.max(0, n - 10))
            const tMean = t10.reduce((a: number, b: number) => a + b, 0) / t10.length
            const tightness = Math.round(
              (Math.sqrt(t10.reduce((s: number, c: number) => s + (c - tMean) ** 2, 0) / t10.length) / price) * 10000
            ) / 100

            // ── Trend persistence: up-closes in last 10 bars ──
            let upDays10 = 0
            for (let j = Math.max(1, n - 10); j < n; j++) {
              if (closes[j] > closes[j - 1]) upDays10++
            }

            // ── Month / Quarter highs for breakout filters ───────────────────
            const monthHigh = n >= 5 ? Math.max(...highs.slice(Math.max(0, n - 21))) : undefined
            const quarterHigh = n >= 5 ? Math.max(...highs.slice(Math.max(0, n - 63))) : undefined

            // ── First 52w break: price at/near 52w high but wasn’t there 3 weeks ago ─
            const prev3wHigh = n >= 20 ? Math.max(...highs.slice(Math.max(0, n - 20), n - 1)) : 0
            const is52wBreak = high52w !== undefined && pctFrom52H !== undefined &&
              pctFrom52H <= 1.5 && prev3wHigh < high52w * 0.985

            return {
              symbol: sym, price, change, changePct, volume,
              avgVolume: avgVolume || undefined, volRatio, high52w, low52w,
              position52w, pctFrom52H, weekHigh, weekLow, ma50, ema8, ema21,
              rsi14, atr14, atrPct, momentumScore, downtrendScore,
              rsRating: rsRaw, adScore, volAccel, tightness, upDays10,
              vol5avg, vol13avg, vol252avg, volPattern,
              breakoutType, reversalType,
              monthHigh, quarterHigh, is52wBreak,
            } as ScannerRow
          } catch {
            return null
          }
        })
      )
      batchRes.forEach((r) => { if (r) result.push(r) })
      onProgress(Math.min(99, Math.round(((i + batchSize) / SCANNER_UNIVERSE.length) * 100)))
    }

    // Normalize rsRating: raw weighted return → 1-99 percentile rank
    if (result.length > 1) {
      const withIdx = result.map((r, i) => ({ i, raw: r.rsRating ?? 0 }))
      withIdx.sort((a, b) => a.raw - b.raw)
      const nR = withIdx.length
      withIdx.forEach((item, rank) => {
        result[item.i].rsRating = Math.max(1, Math.min(99, Math.round(rank / (nR - 1) * 99)))
      })
    }

    return result
  }

  const fetchSingleSparkline = useCallback(async (symbol: string, tf: '1D' | '5M' | '1H' | '1W') => {
    const todayStr = new Date().toISOString().split('T')[0]
    let url: string
    if (tf === '5M') {
      const from = new Date(Date.now() - 6 * 86400_000).toISOString().split('T')[0]
      url = `/api/polygon/v2/aggs/ticker/${symbol}/range/5/minute/${from}/${todayStr}?adjusted=true&sort=asc&limit=1000&apikey=${POLYGON_API_KEY}`
    } else if (tf === '1H') {
      const from = new Date(Date.now() - 32 * 86400_000).toISOString().split('T')[0]
      url = `/api/polygon/v2/aggs/ticker/${symbol}/range/1/hour/${from}/${todayStr}?adjusted=true&sort=asc&limit=750&apikey=${POLYGON_API_KEY}`
    } else if (tf === '1W') {
      const from = new Date(Date.now() - 95 * 86400_000).toISOString().split('T')[0]
      url = `/api/polygon/v2/aggs/ticker/${symbol}/range/1/day/${from}/${todayStr}?adjusted=true&sort=asc&limit=130&apikey=${POLYGON_API_KEY}`
    } else {
      const tenDaysAgo = new Date(Date.now() - 10 * 86400_000).toISOString().split('T')[0]
      let lastDay = todayStr
      try {
        const r = await fetch(`/api/polygon/v2/aggs/ticker/${symbol}/range/1/day/${tenDaysAgo}/${todayStr}?adjusted=true&sort=desc&limit=3&apikey=${POLYGON_API_KEY}`)
        const d = await r.json()
        if (d.results?.length > 0) {
          const ts = d.results[0].t; const dt = new Date(ts)
          lastDay = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
        }
      } catch { }
      url = `/api/polygon/v2/aggs/ticker/${symbol}/range/1/minute/${lastDay}/${lastDay}?adjusted=true&sort=asc&limit=1000&apikey=${POLYGON_API_KEY}`
    }
    try {
      const r = await fetch(url)
      const d = await r.json()
      if (d.results?.length > 1) {
        const bars = d.results.map((b: any) => {
          let etMinutes = 0
          if (tf === '1D' || tf === '5M') {
            const date = new Date(b.t)
            const pstStr = date.toLocaleString('en-US', { timeZone: 'America/Los_Angeles', hour12: false })
            const pst = new Date(pstStr)
            etMinutes = pst.getHours() * 60 + pst.getMinutes()
          }
          return { price: b.c, etMinutes, time: b.t, volume: b.v }
        })
        setSparklines(prev => ({ ...prev, [symbol]: bars }))
      }
    } catch { }
  }, [])

  const runScan = useCallback(async (p: ScanPreset, forceRefresh = false) => {
    const cached = SCAN_CACHE[p.fetchGroup]
    const ttl = SCAN_TTL[p.fetchGroup]
    if (!forceRefresh && cached && Date.now() - cached.ts < ttl) {
      setRows(p.filter(cached.rows).sort(p.sort).slice(0, p.limit))
      const partner1 = PRESET_PAIRS[p.id] ? SCAN_PRESETS.find((x) => x.id === PRESET_PAIRS[p.id]) ?? null : null
      if (partner1) setPairedRows(partner1.filter(cached.rows).sort(partner1.sort).slice(0, partner1.limit))
      else setPairedRows([])
      return
    }
    if (!cached?.rows?.length) setLoading(true)
    if (SCAN_INFLIGHT[p.fetchGroup]) {
      while (SCAN_INFLIGHT[p.fetchGroup]) await new Promise(res => setTimeout(res, 80))
      const ready = SCAN_CACHE[p.fetchGroup]
      if (ready) {
        setRows(p.filter(ready.rows).sort(p.sort).slice(0, p.limit))
        const pw = PRESET_PAIRS[p.id] ? SCAN_PRESETS.find((x) => x.id === PRESET_PAIRS[p.id]) ?? null : null
        if (pw) setPairedRows(pw.filter(ready.rows).sort(pw.sort).slice(0, pw.limit))
        else setPairedRows([])
      }
      setLoading(false)
      return
    }
    SCAN_INFLIGHT[p.fetchGroup] = true
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
        if (seen.has(r.symbol) || TICKER_BLACKLIST.has(r.symbol)) return false
        seen.add(r.symbol)
        return true
      })
      SCAN_CACHE[p.fetchGroup] = { rows: allRows, ts: Date.now() }
      setLastFetch(new Date())
      setRows(p.filter(allRows).sort(p.sort).slice(0, p.limit))
      const partner2 = PRESET_PAIRS[p.id] ? SCAN_PRESETS.find((x) => x.id === PRESET_PAIRS[p.id]) ?? null : null
      if (partner2) setPairedRows(partner2.filter(allRows).sort(partner2.sort).slice(0, partner2.limit))
      else setPairedRows([])
    } catch (e) {
      console.error('[Scanner] Fetch failed:', e)
    } finally {
      SCAN_INFLIGHT[p.fetchGroup] = false
      setLoading(false)
      setProgress(0)
    }
  }, [])

  useEffect(() => {
    const p = SCAN_PRESETS.find((x) => x.id === activePreset) ?? SCAN_PRESETS[0]
    runScan(p)
  }, [activePreset, runScan])

  const fetchSparklines = useCallback(async (symbols: ScannerRow[], tf: '1D' | '5M' | '1H' | '1W') => {
    // Serve cache hits instantly
    const fromCache: Record<string, SparkBar[]> = {}
    symbols.forEach(r => { const hit = SPARKLINE_CACHE[`${r.symbol}_${tf}`]; if (hit) fromCache[r.symbol] = hit })
    if (Object.keys(fromCache).length > 0) setSparklines(prev => ({ ...prev, ...fromCache }))

    const missing = symbols.filter(r => !SPARKLINE_CACHE[`${r.symbol}_${tf}`])
    if (missing.length === 0) return

    const todayStr = new Date().toISOString().split('T')[0]
    let mkUrl: (sym: string) => string
    if (tf === '5M') {
      const from = new Date(Date.now() - 6 * 86400_000).toISOString().split('T')[0]
      mkUrl = sym => `/api/polygon/v2/aggs/ticker/${sym}/range/5/minute/${from}/${todayStr}?adjusted=true&sort=asc&limit=1000&apikey=${POLYGON_API_KEY}`
    } else if (tf === '1H') {
      const from = new Date(Date.now() - 32 * 86400_000).toISOString().split('T')[0]
      mkUrl = sym => `/api/polygon/v2/aggs/ticker/${sym}/range/1/hour/${from}/${todayStr}?adjusted=true&sort=asc&limit=750&apikey=${POLYGON_API_KEY}`
    } else if (tf === '1W') {
      const from = new Date(Date.now() - 95 * 86400_000).toISOString().split('T')[0]
      mkUrl = sym => `/api/polygon/v2/aggs/ticker/${sym}/range/1/day/${from}/${todayStr}?adjusted=true&sort=asc&limit=130&apikey=${POLYGON_API_KEY}`
    } else {
      const nowUtc = new Date(); const dow = nowUtc.getUTCDay()
      const daysBack = dow === 0 ? 2 : dow === 6 ? 1 : 0
      const lastMarketDay = new Date(Date.now() - daysBack * 86400_000).toISOString().split('T')[0]
      const tenDaysAgo = new Date(Date.now() - 10 * 86400_000).toISOString().split('T')[0]
      let lastDay = lastMarketDay
      try {
        const r = await fetch(`/api/polygon/v2/aggs/ticker/${missing[0].symbol}/range/1/day/${tenDaysAgo}/${lastMarketDay}?adjusted=true&sort=desc&limit=3&apikey=${POLYGON_API_KEY}`)
        const d = await r.json()
        if (d.results?.length > 0) { const ts = d.results[0].t; const dt = new Date(ts); lastDay = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}` }
      } catch { }
      mkUrl = sym => `/api/polygon/v2/aggs/ticker/${sym}/range/1/minute/${lastDay}/${lastDay}?adjusted=true&sort=asc&limit=1000&apikey=${POLYGON_API_KEY}`
    }

    if (!SPY_SPARK_CACHE[tf]) {
      try {
        const r = await fetch(mkUrl('SPY')); const d = await r.json()
        if (d.results?.length > 1) SPY_SPARK_CACHE[tf] = d.results.map((b: any) => b.c)
      } catch { }
    }
    if (SPY_SPARK_CACHE[tf]) setSpySpark(SPY_SPARK_CACHE[tf])

    const parseBars = (results: any[]): SparkBar[] => results.map((b: any) => {
      let etMinutes = 0
      if (tf === '1D' || tf === '5M') {
        const date = new Date(b.t)
        const pst = new Date(date.toLocaleString('en-US', { timeZone: 'America/Los_Angeles', hour12: false }))
        etMinutes = pst.getHours() * 60 + pst.getMinutes()
      }
      return { price: b.c, etMinutes, time: b.t, volume: b.v }
    })

    const fetchOne = async (sym: string): Promise<[string, SparkBar[]] | null> => {
      try {
        const r = await fetch(mkUrl(sym)); const d = await r.json()
        const barCount = d.results?.length ?? 0
        if (barCount > 1) {
          const bars = parseBars(d.results)
          SPARKLINE_CACHE[`${sym}_${tf}`] = bars
          return [sym, bars]
        }
      } catch { }
      return null
    }

    // 10 concurrent workers — no batch delays
    const queue = missing.map(r => r.symbol)
    let buf: Record<string, SparkBar[]> = {}; let bufN = 0
    const flush = () => { if (!Object.keys(buf).length) return; const snap = buf; buf = {}; bufN = 0; setSparklines(prev => ({ ...prev, ...snap })) }
    const worker = async () => {
      while (queue.length > 0) {
        const sym = queue.shift(); if (!sym) break
        const res = await fetchOne(sym)
        if (res) { buf[res[0]] = res[1]; bufN++; if (bufN >= 8) flush() }
      }
    }
    await Promise.all(Array.from({ length: Math.min(10, missing.length) }, () => worker()))
    flush()

    // Retry anything that still failed (rate-limited)
    const failed = missing.filter(r => !SPARKLINE_CACHE[`${r.symbol}_${tf}`])
    if (failed.length > 0) {
      await new Promise(res => setTimeout(res, 1500))
      const retries = await Promise.all(failed.map(r => fetchOne(r.symbol)))
      const retryMap: Record<string, SparkBar[]> = {}
      retries.forEach(r => { if (r) retryMap[r[0]] = r[1] })
      if (Object.keys(retryMap).length > 0) setSparklines(prev => ({ ...prev, ...retryMap }))
    }
  }, [])

  // ── Sparklines for pairedRows ───────────────────────────────────────────────
  useEffect(() => {
    if (pairedRows.length === 0) return
    const key = `${pairedRows.map((r) => r.symbol).join(',')}_${chartTf}`
    if (pairedSparkFetchedRef.current === key) return
    pairedSparkFetchedRef.current = key
    fetchSparklines(pairedRows, chartTf)
  }, [pairedRows, chartTf, fetchSparklines])

  useEffect(() => {
    if (rows.length === 0) return
    const key = `${rows.map((r) => r.symbol).join(',')}_${chartTf}`
    if (sparkFetchedRef.current === key) return
    sparkFetchedRef.current = key
    fetchSparklines(rows, chartTf)
  }, [rows, chartTf, fetchSparklines])

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

  const renderSparkline = (
    spark: Array<{ price: number; etMinutes: number; time: number; volume?: number }>,
    compact = false,
    heightScale = 1,
    opts?: { showVolBars?: boolean; showRS?: boolean; tf?: '1D' | '5M' | '1H' | '1W' }
  ) => {
    const showVolBars = !compact
    const showRS = !compact && (opts?.showRS ?? false) && spySpark.length > 0
    const tf = opts?.tf ?? chartTf

    const prices = spark.map((p) => p.price)
    const sMin = Math.min(...prices)
    const sMax = Math.max(...prices)
    const sRange = sMax - sMin || 1
    const n = spark.length
    const VW = 200, VH = 60
    const padL = 0, padR = 2, padT = 4
    const volH = 7
    const rsH = showRS ? 13 : 0
    const chartBottom = VH - 2 - rsH - volH
    const chartH = chartBottom - padT

    const xFn = (i: number) => padL + (i / Math.max(n - 1, 1)) * (VW - padL - padR)
    const yFn = (p: number) => padT + ((sMax - p) / sRange) * chartH

    // Pre/after-hours shading (1D only)
    const zones: { x1: number; x2: number; fill: string }[] = []
    if (tf === '1D') {
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
    }

    const pts = spark.map((p, i) => `${xFn(i).toFixed(1)},${yFn(p.price).toFixed(1)}`)
    const isUp = prices[n - 1] >= prices[0]
    const lineColor = isUp ? '#00E87B' : '#FF2D55'
    const lastPt = pts[n - 1]
    const lastX = parseFloat(lastPt.split(',')[0])
    const lastY = parseFloat(lastPt.split(',')[1])
    const openY = yFn(prices[0])
    const areaPath = `M ${pts[0]} ${pts.slice(1).map((p) => `L ${p}`).join(' ')} L ${lastX},${chartBottom} L ${xFn(0)},${chartBottom} Z`

    const fmtP = (p: number) => p >= 1000 ? p.toFixed(0) : p.toFixed(2)
    const curP = prices[n - 1]

    // X-axis labels (TF-aware)
    const xLabels: Array<{ label: string; x: number; color: string }> = []
    if (!compact) {
      if (tf === '1D') {
        let openI = -1, nineI = -1, elevenI = -1, closeI = -1
        spark.forEach((pt, i) => {
          if (openI < 0 && pt.etMinutes >= 390) openI = i
          if (nineI < 0 && pt.etMinutes >= 540) nineI = i
          if (elevenI < 0 && pt.etMinutes >= 660) elevenI = i
          if (closeI < 0 && pt.etMinutes >= 780) closeI = i
        })
        if (openI >= 0) xLabels.push({ label: '6:30', x: (openI / (n - 1)) * 100, color: '#FFAA00' })
        if (nineI >= 0) xLabels.push({ label: '9 AM', x: (nineI / (n - 1)) * 100, color: '#FFFFFF' })
        if (elevenI >= 0) xLabels.push({ label: '11 AM', x: (elevenI / (n - 1)) * 100, color: '#FFFFFF' })
        if (closeI >= 0) xLabels.push({ label: '1 PM', x: (closeI / (n - 1)) * 100, color: '#00AAEE' })
      } else if (tf === '5M' || tf === '1H') {
        let prevDay = -1
        spark.forEach((pt, i) => {
          const day = new Date(pt.time).getUTCDay()
          if (day !== prevDay && day >= 1 && day <= 5) {
            xLabels.push({ label: ['', 'Mo', 'Tu', 'We', 'Th', 'Fr'][day], x: (i / (n - 1)) * 100, color: '#777777' })
            prevDay = day
          }
        })
      } else {
        let prevMonth = -1
        spark.forEach((pt, i) => {
          const month = new Date(pt.time).getUTCMonth()
          if (month !== prevMonth) {
            xLabels.push({ label: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month], x: (i / (n - 1)) * 100, color: '#777777' })
            prevMonth = month
          }
        })
      }
    }

    // RS ratio vs SPY
    let rsRatios: number[] | null = null
    if (showRS && spySpark.length > 0) {
      const len = Math.min(n, spySpark.length)
      const stockBase = prices[0] || 1
      const spyBase = spySpark[0] || 1
      rsRatios = spark.slice(0, len).map((pt, i) => (pt.price / stockBase) / (spySpark[i] / spyBase))
    }

    const volBars = spark.map(p => p.volume ?? 0)
    const maxVol = Math.max(...volBars, 1)

    const svgHeight = compact ? (isMobile ? 85 : 52) : (isMobile ? Math.round(118 * heightScale) : Math.round(72 * heightScale))

    return (
      <div style={{ width: '100%', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 3 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <svg viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none"
              style={{ width: '100%', height: svgHeight, display: 'block' }}>
              <defs>
                <linearGradient id={`sg-${spark[0].time}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={lineColor} stopOpacity="0.2" />
                  <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
                </linearGradient>
              </defs>
              {zones.map((z, idx) => (
                <rect key={idx} x={z.x1} y={padT} width={Math.max(0, z.x2 - z.x1)} height={chartH}
                  fill={z.fill} vectorEffect="non-scaling-stroke" />
              ))}
              <line x1={VW - padR - 0.5} y1={padT} x2={VW - padR - 0.5} y2={chartBottom}
                stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
              <line x1={padL} y1={chartBottom - 0.5} x2={VW - padR} y2={chartBottom - 0.5}
                stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
              <line x1={padL} y1={openY.toFixed(1)} x2={VW - padR} y2={openY.toFixed(1)}
                stroke="rgba(255,255,255,0.18)" strokeWidth="0.75" strokeDasharray="2,2"
                vectorEffect="non-scaling-stroke" />
              <path d={areaPath} fill={`url(#sg-${spark[0].time})`} vectorEffect="non-scaling-stroke" />
              <polyline fill="none" stroke={lineColor} strokeWidth="1.5"
                points={pts.join(' ')} strokeLinecap="round" strokeLinejoin="round"
                vectorEffect="non-scaling-stroke" />
              <circle cx={lastX} cy={lastY} r="2.5" fill={lineColor} />
              {/* Volume bars — green/red solid */}
              {volBars.map((v, i) => {
                const bH = Math.max(0.5, (v / maxVol) * (volH - 1))
                const bW = Math.max(0.4, (VW - padL - padR) / n - 0.3)
                const barUp = i === 0 ? prices[0] >= prices[0] : prices[i] >= prices[i - 1]
                return <rect key={i} x={xFn(i) - bW / 2} y={chartBottom + volH - bH}
                  width={bW} height={bH} fill={barUp ? '#00E87B' : '#FF2D55'} />
              })}
              {/* RS line vs SPY */}
              {rsRatios && (() => {
                const rsLen = rsRatios!.length
                const rsMin = Math.min(...rsRatios!)
                const rsMax = Math.max(...rsRatios!)
                const rsRange = rsMax - rsMin || 0.001
                const rsTop = VH - rsH - 2
                const rsBot = VH - 2
                const rsY = (v: number) => rsTop + ((rsMax - v) / rsRange) * (rsBot - rsTop)
                const rsPts = rsRatios!.map((v, i) => `${xFn(Math.round(i * (n - 1) / (rsLen - 1))).toFixed(1)},${rsY(v).toFixed(1)}`).join(' ')
                const rsColor = rsRatios![rsLen - 1] >= rsRatios![0] ? '#00D4FF' : '#FF6B6B'
                const ref1Y = rsY(1)
                return (
                  <>
                    <line x1={padL} y1={rsTop} x2={VW - padR} y2={rsTop}
                      stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
                    {ref1Y >= rsTop && ref1Y <= rsBot && (
                      <line x1={padL} y1={ref1Y} x2={VW - padR} y2={ref1Y}
                        stroke="rgba(255,255,255,0.2)" strokeWidth="0.4" strokeDasharray="2,2"
                        vectorEffect="non-scaling-stroke" />
                    )}
                    <polyline fill="none" stroke={rsColor} strokeWidth="1"
                      points={rsPts} strokeLinecap="round" strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke" />
                    <text x={1.5} y={rsTop + 5} fontSize="3.5" fill="rgba(0,212,255,0.7)">RS</text>
                  </>
                )
              })()}
            </svg>
            {!compact && (
              <div style={{ position: 'relative', height: 26, overflow: 'visible' }}>
                {xLabels.map((lbl, idx) => (
                  <span key={idx} style={{
                    position: 'absolute', fontSize: isMobile ? 20 : 16, color: lbl.color, fontWeight: 700,
                    fontFamily: '"Courier New",monospace', left: `${Math.max(5, Math.min(93, lbl.x))}%`,
                    transform: 'translateX(-50%)', whiteSpace: 'nowrap'
                  }}>{lbl.label}</span>
                ))}
              </div>
            )}
          </div>
          {!compact && (
            <div style={{
              width: 60, display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
              paddingBottom: 26, fontSize: isMobile ? 26 : 16, textAlign: 'right',
              fontFamily: '"Courier New",monospace', gap: 0
            }}>
              <span style={{ color: '#FFFFFF', fontWeight: 700 }}>{fmtP(sMax)}</span>
              <span style={{ color: lineColor, fontWeight: 900 }}>{fmtP(curP)}</span>
              <span style={{ color: '#FFFFFF', fontWeight: 700 }}>{fmtP(sMin)}</span>
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
    <div style={{ background: '#050505', height: '100%', display: 'flex', flexDirection: 'column', fontFamily: '"Courier New",monospace', overflow: 'hidden' }}>

      {/* ── Scan Tab Bar ──────────────────────────────────────────────────── */}
      <style>{`
        @keyframes tabSpin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        .stab{ cursor:pointer; transition: all 0.2s ease !important; }
        .stab:hover{ transform: translateY(-2px) !important; filter: brightness(1.2) !important; }
        .stab:active{ transform: scale(0.97) !important; }
        .stab-spin{ animation: tabSpin 0.8s linear infinite; }
      `}</style>

      <div style={{ flexShrink: 0, background: 'linear-gradient(180deg, #0a0a0a 0%, #000 100%)', borderBottom: '2px solid #FF6B00', padding: '8px 6px 0', display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'flex-end' }}>
        {SCAN_PRESETS.filter((p) => !p.hidden).map((p) => {
          const isActive = activePreset === p.id || PRESET_PAIRS[activePreset] === p.id
          return (
            <button
              key={p.id}
              onClick={() => setActivePreset(p.id)}
              title={p.description}
              className="stab"
              style={{
                flex: '1 1 0', minWidth: 0,
                padding: '13px 6px',
                borderRadius: '8px 8px 0 0',
                borderTop: isActive ? '1px solid rgba(255,107,0,0.8)' : '1px solid rgba(255,255,255,0.1)',
                borderLeft: isActive ? '1px solid rgba(255,107,0,0.8)' : '1px solid rgba(255,255,255,0.1)',
                borderRight: isActive ? '1px solid rgba(255,107,0,0.8)' : '1px solid rgba(255,255,255,0.1)',
                borderBottom: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                position: 'relative', overflow: 'hidden',
                backdropFilter: 'blur(20px) saturate(180%)',
                WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                background: isActive
                  ? 'linear-gradient(135deg, rgba(255,107,0,0.25) 0%, rgba(255,107,0,0.08) 50%, rgba(0,0,0,0.6) 100%)'
                  : 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 50%, rgba(0,0,0,0.4) 100%)',
                boxShadow: isActive
                  ? 'inset 0 1px 0 rgba(255,107,0,0.5), inset 0 -1px 0 rgba(0,0,0,0.8), 0 -4px 24px rgba(255,107,0,0.2)'
                  : 'inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.6)',
              }}
              onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255,107,0,0.12) 0%, rgba(255,255,255,0.04) 50%, rgba(0,0,0,0.5) 100%)'; e.currentTarget.style.borderTopColor = 'rgba(255,107,0,0.4)'; e.currentTarget.style.borderLeftColor = 'rgba(255,107,0,0.4)'; e.currentTarget.style.borderRightColor = 'rgba(255,107,0,0.4)' } }}
              onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 50%, rgba(0,0,0,0.4) 100%)'; e.currentTarget.style.borderTopColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.borderLeftColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.borderRightColor = 'rgba(255,255,255,0.1)' } }}
            >
              {/* Top glass sheen */}
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '40%', background: 'linear-gradient(180deg, rgba(255,255,255,0.1) 0%, transparent 100%)', pointerEvents: 'none' }} />
              {/* Active bottom glow line */}
              {isActive && <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg, transparent, #FF6B00, transparent)', boxShadow: '0 0 10px #FF6B00' }} />}
              <span style={{ fontSize: '16px', fontWeight: 900, letterSpacing: '0.1em', color: isActive ? '#FF6B00' : '#FFFFFF', whiteSpace: 'nowrap', fontFamily: 'system-ui,sans-serif', textTransform: 'uppercase', position: 'relative', textShadow: 'none' }}>
                {p.tabLabel ?? p.label}
              </span>
            </button>
          )
        })}
        {/* ── Refresh ── */}
        <button
          onClick={() => runScan(preset, true)}
          title="Refresh scan"
          className="stab"
          style={{
            flex: '0 0 auto', width: '58px',
            padding: '13px 6px',
            borderRadius: '8px 8px 0 0',
            borderTop: '1px solid rgba(255,107,0,0.35)', borderLeft: '1px solid rgba(255,107,0,0.35)', borderRight: '1px solid rgba(255,107,0,0.35)', borderBottom: 'none',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '3px',
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            background: 'linear-gradient(135deg, rgba(255,107,0,0.1) 0%, rgba(255,107,0,0.03) 50%, rgba(0,0,0,0.5) 100%)',
            boxShadow: 'inset 0 1px 0 rgba(255,107,0,0.3), inset 0 -1px 0 rgba(0,0,0,0.8)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255,107,0,0.22) 0%, rgba(255,107,0,0.08) 50%, rgba(0,0,0,0.5) 100%)'; e.currentTarget.style.borderTopColor = 'rgba(255,107,0,0.7)'; e.currentTarget.style.borderLeftColor = 'rgba(255,107,0,0.7)'; e.currentTarget.style.borderRightColor = 'rgba(255,107,0,0.7)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255,107,0,0.1) 0%, rgba(255,107,0,0.03) 50%, rgba(0,0,0,0.5) 100%)'; e.currentTarget.style.borderTopColor = 'rgba(255,107,0,0.35)'; e.currentTarget.style.borderLeftColor = 'rgba(255,107,0,0.35)'; e.currentTarget.style.borderRightColor = 'rgba(255,107,0,0.35)' }}
        >
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '40%', background: 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, transparent 100%)', pointerEvents: 'none' }} />
          <div className={loading ? 'stab-spin' : ''} style={{ fontSize: '18px', color: '#FF6B00', lineHeight: 1, textShadow: '0 0 12px rgba(255,107,0,0.9)', position: 'relative' }}>↺</div>
          <div style={{ fontSize: '10px', fontWeight: 900, letterSpacing: '0.08em', color: '#FF6B00', fontFamily: 'system-ui,sans-serif', position: 'relative', textShadow: '0 0 10px rgba(255,107,0,0.7)' }}>SCAN</div>
        </button>
      </div>

      {/* ── Vol Surge filter bar ─────────────────────────────────────────── */}
      {activePreset === 'volume-surge' && (
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', background: '#000', borderBottom: '1px solid #1a1a1a', flexWrap: 'wrap' }}>
          {/* VOL HITTERS — its own mode */}
          {([
            { v: 'hitters' as const, label: 'VOL HITTERS', icon: '◆', color: '#FF6B00', anim: 'iconSpin 1s linear infinite' },
          ]).map(({ v, label, icon, color, anim }) => {
            const active = volScanMode === v
            return (
              <button key={v} onClick={() => setVolScanMode(v)} style={{
                padding: '5px 17px', borderRadius: 20, cursor: 'pointer', fontSize: 14, fontWeight: 800, letterSpacing: '0.06em',
                display: 'flex', alignItems: 'center', gap: 5,
                color: active ? color : '#FFFFFF',
                background: '#000',
                border: active ? `1px solid ${color}` : '1px solid #333',
              }}>
                <span style={{ fontSize: 14, color: active ? color : color + '66', display: 'inline-block', animation: active ? anim : 'none', lineHeight: 1 }}>{icon}</span>
                {label}
              </button>
            )
          })}
          <span style={{ fontSize: 11, color: '#444', fontWeight: 700, letterSpacing: '0.1em', margin: '0 4px 0 8px' }}>|</span>
          {/* SEQUENCE — independent pattern modes */}
          <span style={{ fontSize: 11, color: '#fff', fontWeight: 700, letterSpacing: '0.12em', marginRight: 2 }}>SEQUENCE</span>
          {([
            { v: 'push-pull' as const, label: 'PUSH+PULL', icon: '↑↓', color: '#00D4FF', anim: 'iconBounce 0.7s ease-in-out infinite' },
            { v: 'hv-bounce' as const, label: 'HV BOUNCE', icon: '↩', color: '#00E87B', anim: 'iconShake 0.6s ease-in-out infinite' },
            { v: 'qf-bounce' as const, label: 'QUIET FALL', icon: '↘', color: '#F59E0B', anim: 'iconPulse 1.5s ease-in-out infinite' },
          ]).map(({ v, label, icon, color, anim }) => {
            const active = volScanMode === v
            return (
              <button key={v} onClick={() => setVolScanMode(v)} style={{
                padding: '5px 17px', borderRadius: 20, cursor: 'pointer', fontSize: 14, fontWeight: 800, letterSpacing: '0.06em',
                display: 'flex', alignItems: 'center', gap: 5,
                color: active ? color : '#FFFFFF',
                background: '#000',
                border: active ? `1px solid ${color}` : '1px solid #333',
              }}>
                <span style={{ fontSize: 14, color: active ? color : color + '66', display: 'inline-block', animation: active ? anim : 'none', lineHeight: 1 }}>{icon}</span>
                {label}
              </button>
            )
          })}
          <span style={{ fontSize: 11, color: '#444', fontWeight: 700, letterSpacing: '0.1em', margin: '0 4px 0 8px' }}>|</span>
          {/* TIME PERIOD — independent baseline modes */}
          <span style={{ fontSize: 11, color: '#fff', fontWeight: 700, letterSpacing: '0.12em', marginRight: 2 }}>TIME PERIOD</span>
          {(['5D', '13D', '21D', '1Y'] as const).map(v => {
            const active = volScanMode === v
            return (
              <button key={v} onClick={() => setVolScanMode(v)} style={{
                padding: '5px 17px', borderRadius: 20, cursor: 'pointer', fontSize: 14, fontWeight: 800, letterSpacing: '0.06em',
                color: active ? '#FF6B00' : '#FFFFFF',
                background: '#000',
                border: active ? '1px solid #FF6B00' : '1px solid #333',
              }}>{v}</button>
            )
          })}
        </div>
      )}
      {/* ── Per-preset filter bar ───────────────────────────────────────────── */}
      {(activePreset === 'breakouts' || activePreset === 'breakdowns') && (
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', background: '#000', borderBottom: '1px solid #1a1a1a', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: '#fff', fontWeight: 700, letterSpacing: '0.12em', marginRight: 2 }}>RANGE</span>
          {(['week', 'month', 'quarter', 'year'] as const).map(v => (
            <button key={v} onClick={() => setBreakoutTfFilter(v)} style={{
              padding: '5px 17px', borderRadius: 20, cursor: 'pointer', fontSize: 14, fontWeight: 800, letterSpacing: '0.06em',
              color: breakoutTfFilter === v ? '#00D4FF' : '#FFFFFF',
              background: '#000',
              border: breakoutTfFilter === v ? '1px solid #00D4FF' : '1px solid #333',
            }}>{v.toUpperCase()}</button>
          ))}
        </div>
      )}
      {(activePreset === '52w-highs' || activePreset === '52w-lows') && (
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', background: '#000', borderBottom: '1px solid #1a1a1a', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: '#fff', fontWeight: 700, letterSpacing: '0.12em', marginRight: 2 }}>FILTER</span>
          {(['all', 'first-break'] as const).map(v => (
            <button key={v} onClick={() => setFilter52w(v)} style={{
              padding: '5px 17px', borderRadius: 20, cursor: 'pointer', fontSize: 14, fontWeight: 800, letterSpacing: '0.06em',
              color: filter52w === v ? '#F59E0B' : '#FFFFFF',
              background: '#000',
              border: filter52w === v ? '1px solid #F59E0B' : '1px solid #333',
            }}>{v === 'all' ? 'ALL' : 'FIRST BREAK'}</button>
          ))}
        </div>
      )}
      {(activePreset === 'reversals-bull' || activePreset === 'reversals-bear') && (
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', background: '#000', borderBottom: '1px solid #1a1a1a', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: '#fff', fontWeight: 700, letterSpacing: '0.12em', marginRight: 2 }}>VOLUME</span>
          {(['all', 'vol2x', 'vol3x'] as const).map(v => (
            <button key={v} onClick={() => setReversalFilter(v)} style={{
              padding: '5px 17px', borderRadius: 20, cursor: 'pointer', fontSize: 14, fontWeight: 800, letterSpacing: '0.06em',
              color: reversalFilter === v ? '#34D399' : '#FFFFFF',
              background: '#000',
              border: reversalFilter === v ? '1px solid #34D399' : '1px solid #333',
            }}>{v === 'all' ? 'ALL' : v === 'vol2x' ? 'VOL 2×+' : 'VOL 3×+'}</button>
          ))}
        </div>
      )}

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
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', width: '100%', paddingBottom: 64 }}>

        {/* ── 2-column layout ── */}
        <>
          {/* Loading */}
          {loading && rows.length === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '18px', padding: '60px 24px' }}>
              <div style={{ width: '84px', height: '84px', borderRadius: '50%', border: '4px solid #222', borderTop: '4px solid #FF6B00', animation: 'bblspin 0.7s linear infinite' }} />
              <div style={{ fontSize: '33px', color: '#FF6B00', letterSpacing: '0.22em', fontWeight: 900 }}>SCANNING{progress > 0 ? ` ${progress}%` : '...'}</div>
              <div style={{ width: 420, height: 3, background: '#111', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: '#FF6B00', width: `${progress}%`, transition: 'width 0.25s ease' }} />
              </div>
              <div style={{ maxWidth: 520, textAlign: 'center', marginTop: 12 }}>
                <div style={{ fontSize: 27, color: '#fff', fontWeight: 600, lineHeight: 1.65, fontStyle: 'italic' }}>
                  &ldquo;{SCAN_QUOTES[scanQuoteIdx % SCAN_QUOTES.length].body}&rdquo;
                </div>
                {SCAN_QUOTES[scanQuoteIdx % SCAN_QUOTES.length].author && (
                  <div style={{ fontSize: 21, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace', marginTop: 10 }}>
                    {SCAN_QUOTES[scanQuoteIdx % SCAN_QUOTES.length].author}
                  </div>
                )}
              </div>
            </div>
          )}
          {/* Empty */}
          {!loading && rows.length === 0 && (
            <div style={{ padding: '80px 20px', textAlign: 'center', fontSize: '12px', color: isMobile ? '#FFFFFF' : '#444', letterSpacing: '0.14em' }}>
              NO SIGNALS DETECTED
            </div>
          )}
          {/* 2-column split */}
          {rows.length > 0 && (() => {
            const isPaired = !!PRESET_PAIRS[activePreset] && pairedRows.length > 0
            const primaryPreset = SCAN_PRESETS.find((x) => x.id === activePreset)!
            const partnerPreset = PRESET_PAIRS[activePreset] ? SCAN_PRESETS.find((x) => x.id === PRESET_PAIRS[activePreset]) ?? null : null

            // Client-side sub-filters
            const applySubFilter = (list: ScannerRow[]) => {
              if (activePreset === 'volume-surge') {
                // SEQUENCE modes: filter by pattern, no time-period baseline
                if (volScanMode === 'push-pull') return list.filter(r => r.volPattern === 'push-pull')
                if (volScanMode === 'hv-bounce') return list.filter(r => r.volPattern === 'hv-bounce')
                if (volScanMode === 'qf-bounce') return list.filter(r => r.volPattern === 'qf-bounce')
                // TIME PERIOD modes: filter by volume surging vs that period's baseline
                if (volScanMode === '5D') return list.filter(r => r.volume >= (r.vol5avg ?? r.avgVolume ?? 0) * 1.5)
                if (volScanMode === '13D') return list.filter(r => r.volume >= (r.vol13avg ?? r.avgVolume ?? 0) * 1.5)
                if (volScanMode === '21D') return list.filter(r => r.volume >= (r.avgVolume ?? 0) * 1.5)
                if (volScanMode === '1Y') return list.filter(r => r.volume >= (r.vol252avg ?? r.avgVolume ?? 0) * 1.5)
                // VOL HITTERS: best 1 from each pattern + top by volRatio
                const allSurging = list.filter(r => r.volume >= (r.avgVolume ?? 0) * 1.5)
                const picked = new Set<string>()
                const result: ScannerRow[] = []
                  ; (['push-pull', 'hv-bounce', 'qf-bounce', 'hv-fall-lv-bounce'] as const).forEach(pt => {
                    const match = allSurging.find(r => r.volPattern === pt && !picked.has(r.symbol))
                    if (match) { result.push(match); picked.add(match.symbol) }
                  })
                allSurging.filter(r => !picked.has(r.symbol)).slice(0, 6).forEach(r => result.push(r))
                return result
              }
              if (activePreset === 'breakouts' || activePreset === 'breakdowns') {
                if (breakoutTfFilter === 'week') return list.filter(r => r.breakoutType === 'week-high' || r.breakoutType === 'week-low')
                if (breakoutTfFilter === 'month') return list.filter(r => r.monthHigh != null && r.price >= r.monthHigh * 0.985)
                if (breakoutTfFilter === 'quarter') return list.filter(r => r.quarterHigh != null && r.price >= r.quarterHigh * 0.985)
                return list.filter(r => r.breakoutType === '52w-high' || r.breakoutType === '52w-low') // year
              }
              if (activePreset === '52w-highs' || activePreset === '52w-lows') {
                if (filter52w === 'first-break') return list.filter(r => r.is52wBreak)
                return list
              }
              if (activePreset === 'reversals-bull' || activePreset === 'reversals-bear') {
                if (reversalFilter === 'vol2x') return list.filter(r => (r.volRatio ?? 0) >= 2)
                if (reversalFilter === 'vol3x') return list.filter(r => (r.volRatio ?? 0) >= 3)
                return list
              }
              return list
            }
            const filteredRows = applySubFilter(rows)
            const filteredPairedRows = applySubFilter(pairedRows)

            const renderCol = (list: ScannerRow[], accentColor: string, label?: string, startIdx = 0) => (
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                <div style={{
                  display: 'grid', gridTemplateColumns: '22px 1fr 110px',
                  gap: '0 6px', padding: '7px 10px',
                  borderBottom: `2px solid ${accentColor}`,
                  position: 'sticky', top: 0, background: '#050505', zIndex: 10,
                }}>
                  {label
                    ? <div style={{ gridColumn: '1 / -1', fontSize: '13.5px', fontWeight: 700, letterSpacing: '0.15em', color: accentColor, textAlign: 'center' }}>{label}</div>
                    : [{ l: '#', a: 'right' as const }, { l: 'SYMBOL', a: 'left' as const }, { l: 'CHANGE', a: 'center' as const }].map(({ l, a }) => (
                      <div key={l} style={{ fontSize: '13.5px', fontWeight: 700, letterSpacing: '0.12em', color: accentColor, textAlign: a }}>{l}</div>
                    ))
                  }
                </div>
                {list.map((row, i) => {
                  const spark = sparklines[row.symbol]
                  const changeClr = row.changePct >= 0 ? '#00E87B' : '#FF2D55'

                  // Standout reason note
                  const standoutNote = activePreset === 'rs-scan' ? (() => {
                    if (row.is52wBreak) return { text: '52W breakout · fresh institutional buy zone', color: '#F59E0B' }
                    if ((row.volAccel ?? 0) >= 2.0) return { text: `Vol ${Math.round(((row.volAccel ?? 1) - 1) * 100)}% above avg · strong accumulation`, color: '#00E87B' }
                    if ((row.tightness ?? 10) <= 1.2 && (row.volAccel ?? 0) >= 1.2) return { text: 'Tight base + expanding vol · coiling for move', color: '#00D4FF' }
                    if ((row.adScore ?? 0) >= 68) return { text: 'Heavy body-weighted accumulation · dip buyers active', color: '#00E87B' }
                    if ((row.tightness ?? 10) <= 2.0) return { text: 'Base tightening · range contraction · low-risk setup', color: '#00D4FF' }
                    if ((row.position52w ?? 0) >= 0.88) return { text: 'Holding near 52W high · relative strength leader', color: '#F59E0B' }
                    if ((row.rsRating ?? 0) >= 72) return { text: `RS ${row.rsRating} · outperforming peers · vol confirming`, color: '#FF6B00' }
                    if ((row.upDays10 ?? 0) >= 8) return { text: `${row.upDays10}/10 days up · consistent quiet grind`, color: '#00E87B' }
                    if ((row.volAccel ?? 0) >= 1.3) return { text: `Vol trend +${Math.round(((row.volAccel ?? 1) - 1) * 100)}% · quiet accumulation underway`, color: '#FFCC00' }
                    return { text: `RS ${row.rsRating} · building strength vs market`, color: '#888' }
                  })() : activePreset === 'volume-surge' ? (() => {
                    const baseline = volScanMode === '5D' ? row.vol5avg : volScanMode === '13D' ? row.vol13avg : volScanMode === '1Y' ? row.vol252avg : row.avgVolume
                    const surgeX = baseline && baseline > 0 ? (row.volume / baseline).toFixed(1) : null
                    const periodLabel = (volScanMode === '5D' || volScanMode === '13D' || volScanMode === '21D' || volScanMode === '1Y') ? volScanMode : null
                    if (row.volPattern === 'push-pull') return { text: `Push + low-vol pullback · healthy base${surgeX && periodLabel ? ` · ${surgeX}× ${periodLabel} avg` : ''}`, color: '#00E87B' }
                    if (row.volPattern === 'hv-bounce') return { text: `Selling climax bounce${surgeX && periodLabel ? ` · ${surgeX}× ${periodLabel} avg` : ''} · reversal signal`, color: '#00D4FF' }
                    if (row.volPattern === 'qf-bounce') return { text: `Quiet fall + vol expansion${surgeX && periodLabel ? ` · ${surgeX}× ${periodLabel} avg` : ''} · buyers in`, color: '#FFCC00' }
                    if (row.volPattern === 'hv-fall-lv-bounce') return { text: `High-vol drop + quiet bounce · watch for re-test`, color: '#FF6B6B' }
                    return null
                  })() : null
                  return (
                    <div key={row.symbol} style={{
                      display: 'flex', flexDirection: 'column', flexShrink: 0,
                      padding: '6px 10px 2px',
                      borderBottom: '1px solid #111',
                      background: i % 2 === 0 ? 'transparent' : '#080808',
                      transition: 'background 0.08s',
                    }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#161616' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : '#080808' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: standoutNote ? 2 : 4 }}>
                        <div style={{ fontSize: '28px', fontWeight: 900, color: '#FFFFFF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '0 0 auto' }}>{row.symbol}</div>
                        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: 3 }}>
                          {(['1D', '5M', '1H', '1W'] as const).map(tf => {
                            const symTf = symbolTf[row.symbol] ?? '1D'
                            return (
                              <button key={tf}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setSymbolTf(prev => ({ ...prev, [row.symbol]: tf }))
                                  fetchSingleSparkline(row.symbol, tf)
                                }}
                                style={{
                                  padding: '3px 10px', borderRadius: 10, cursor: 'pointer',
                                  background: '#000',
                                  border: symTf === tf ? '1px solid #FF6B00' : '1px solid #222',
                                  color: symTf === tf ? '#FF6B00' : '#FFFFFF',
                                  fontSize: 12, fontWeight: 800, letterSpacing: '0.06em',
                                }}
                              >{tf}</button>
                            )
                          })}
                        </div>
                        <div style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px',
                          padding: '3px 6px', borderRadius: '3px',
                          background: row.changePct >= 0 ? 'rgba(0,232,123,0.1)' : 'rgba(255,45,85,0.1)',
                          border: `1px solid ${changeClr}`,
                          fontSize: '18px', fontWeight: 800, color: changeClr, flex: '0 0 auto',
                        }}>
                          {row.changePct >= 0 ? '▲' : '▼'} {Math.abs(row.changePct).toFixed(2)}%
                        </div>
                      </div>
                      {standoutNote && (
                        <div style={{ fontSize: 14, color: '#FFFFFF', fontWeight: 600, letterSpacing: '0.03em', marginBottom: 4, paddingLeft: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {standoutNote.text.replace(/RS \d+ · /g, '')}
                        </div>
                      )}
                      <div style={{ width: '100%' }}>
                        {/* Per-chart TF selector */}
                        {(() => {
                          const symTf = symbolTf[row.symbol] ?? '1D'
                          return (
                            <>
                              {spark && spark.length > 1 ? renderSparkline(spark, false, 4.5, {
                                showRS: activePreset === '52w-highs' || activePreset === '52w-lows' || activePreset === 'breakouts' || activePreset === 'breakdowns',
                                tf: symTf,
                              }) : <div style={{ height: isMobile ? 531 : 324 }} />}
                            </>
                          )
                        })()}
                      </div>
                    </div>
                  )
                })}
              </div>
            )

            if (isPaired && partnerPreset) {
              return (
                <div style={{ display: 'flex', minHeight: 0 }}>
                  {renderCol(filteredRows, primaryPreset.color, primaryPreset.label.toUpperCase(), 0)}
                  <div style={{ width: '1px', background: '#1e1e1e', flexShrink: 0 }} />
                  {renderCol(filteredPairedRows, partnerPreset.color, partnerPreset.label.toUpperCase(), 0)}
                </div>
              )
            }

            const half = Math.ceil(filteredRows.length / 2)
            return (
              <div style={{ display: 'flex', minHeight: 0 }}>
                {renderCol(filteredRows.slice(0, half), '#FF6B00', undefined, 0)}
                <div style={{ width: '1px', background: '#1e1e1e', flexShrink: 0 }} />
                {renderCol(filteredRows.slice(half), '#FF6B00', undefined, half)}
              </div>
            )
          })()}
        </>

        {/* movers loading / empty */}
        {activePreset === 'movers' && loading && rows.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '18px', padding: '60px 24px' }}>
            <div style={{ width: '84px', height: '84px', borderRadius: '50%', border: '4px solid #222', borderTop: '4px solid #FF6B00', animation: 'bblspin 0.7s linear infinite' }} />
            <div style={{ fontSize: '33px', color: '#FF6B00', letterSpacing: '0.22em', fontWeight: 900 }}>SCANNING{progress > 0 ? ` ${progress}%` : '...'}</div>
            <div style={{ width: 420, height: 3, background: '#111', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: '#FF6B00', width: `${progress}%`, transition: 'width 0.25s ease' }} />
            </div>
            <div style={{ maxWidth: 520, textAlign: 'center', marginTop: 12 }}>
              <div style={{ fontSize: 27, color: '#fff', fontWeight: 600, lineHeight: 1.65, fontStyle: 'italic' }}>
                &ldquo;{SCAN_QUOTES[scanQuoteIdx % SCAN_QUOTES.length].body}&rdquo;
              </div>
              {SCAN_QUOTES[scanQuoteIdx % SCAN_QUOTES.length].author && (
                <div style={{ fontSize: 21, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace', marginTop: 10 }}>
                  {SCAN_QUOTES[scanQuoteIdx % SCAN_QUOTES.length].author}
                </div>
              )}
            </div>
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

      <style>{`@keyframes bblspin { to { transform: rotate(360deg); } } @keyframes iconPulse { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.35);opacity:0.7} } @keyframes iconSpin { to { transform: rotate(360deg); } } @keyframes iconBounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-3px)} } @keyframes iconShake { 0%,100%{transform:rotate(0)} 25%{transform:rotate(-15deg)} 75%{transform:rotate(15deg)} }`}</style>
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
  const [expandedColumn, setExpandedColumn] = useState<'bullish' | 'bearish' | null>(null)
  const { isMobile } = useRegimesPanelMobile()
  const scrollRef = useRef<HTMLDivElement>(null)
  const savedScroll = useRef<number>(0)

  const getCurrentTimeframeData = useCallback(() => {
    if (!marketRegimeData) return null
    return marketRegimeData.momentum ?? null
  }, [marketRegimeData])

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
            <TradeCardChart symbol={symbol} industrySymbol={trade.industrySymbol} />
          </div>
        ) : (
          /* ── DESKTOP: original full layout ── */
          <div style={{ padding: '20px 20px 18px' }}>
            {/* Row 1: ticker + direction + score + star all in one row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <span style={{ fontFamily: '"Courier New",monospace', fontWeight: 900, fontSize: '2rem', color: isBullish ? '#FF6600' : '#FFD700', letterSpacing: '-0.02em', lineHeight: 1 }}>{symbol}</span>
              <span style={{ fontFamily: '"Courier New",monospace', fontSize: '22px', fontWeight: 800, color: '#fff' }}>${trade.strike?.toFixed(0)}</span>
              <span style={{ fontFamily: '"Courier New",monospace', fontSize: '22px', fontWeight: 800, color: accentClr }}>{isBullish ? 'Calls' : 'Puts'}</span>
              <span style={{ fontFamily: '"Courier New",monospace', fontSize: '22px', fontWeight: 700, color: '#ffffff' }}>
                {trade.expiration ? new Date(trade.expiration + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : ''}
              </span>
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: '"Courier New",monospace', fontSize: '13px', color: '#ffffff', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '1px' }}>Score</div>
                  <div style={{ fontFamily: '"Courier New",monospace', fontWeight: 900, fontSize: '24px', color: accentClr, lineHeight: 1, textShadow: `0 0 12px ${accentClr}66` }}>{Math.round(trade.score)}</div>
                </div>
                <button onClick={handleStar} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: inWatchlist ? '#FFD700' : 'rgba(255,255,255,0.6)', fontSize: '18px' }} title={inWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}>
                  {inWatchlist ? <TbStarFilled /> : <TbStar />}
                </button>
              </div>
            </div>
            {/* Stats grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1px', background: 'rgba(255,255,255,0.06)', borderRadius: '5px', overflow: 'hidden', marginBottom: '1px', marginTop: '10px' }}>
              {[
                { l: 'Premium', v: typeof trade.contractPrice === 'number' ? `$${trade.contractPrice.toFixed(2)}` : '—', c: '#fff' },
                { l: 'IV', v: `${trade.impliedVolatility || '—'}%`, c: '#00d4ff' },
                { l: 'Θ Decay', v: typeof trade.thetaDecay === 'number' ? `-$${Math.abs(trade.thetaDecay).toFixed(2)}` : '—', c: '#ff8c42' },
              ].map((m) => (
                <div key={m.l} style={{ background: 'rgba(0,0,0,0.5)', padding: '10px 8px', textAlign: 'center' }}>
                  <div style={{ fontFamily: 'system-ui,sans-serif', fontSize: '13px', fontWeight: 700, color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '5px' }}>{m.l}</div>
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
                  <div style={{ fontFamily: 'system-ui,sans-serif', fontSize: '13px', fontWeight: 700, color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '5px' }}>{m.l}</div>
                  <div style={{ fontFamily: '"Courier New",monospace', fontWeight: 800, fontSize: '18px', color: m.c }}>{m.v}</div>
                </div>
              ))}
            </div>
            <TradeCardChart symbol={symbol} industrySymbol={trade.industrySymbol} />
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
          height: '100%',
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
            <div style={{ display: 'flex', alignItems: 'stretch' }}>
              {(
                [['regimes', 'REGIMES']] as const
              ).map(([t, label]) => (
                <button
                  key={t}
                  onClick={() => setMainTab(t)}
                  className="flex-1 font-black uppercase tracking-[0.15em] transition-all relative"
                  style={{
                    padding: '14px 8px',
                    fontSize: '13px',
                    color: mainTab === t ? '#FF6600' : '#ffffff',
                    border: mainTab === t ? '2px solid #FF6600' : '2px solid rgba(255,255,255,0.15)',
                    background: mainTab === t
                      ? 'linear-gradient(180deg,#1a1a1a 0%,#060606 100%)'
                      : 'linear-gradient(180deg,#111111 0%,#040404 100%)',
                    boxShadow: mainTab === t
                      ? '0 0 18px rgba(255,102,0,0.35), inset 0 1px 0 rgba(255,255,255,0.1)'
                      : 'inset 0 1px 0 rgba(255,255,255,0.04)',
                    cursor: 'pointer',
                  }}
                >
                  {mainTab === t && <div className="absolute inset-0 bg-gradient-to-b from-orange-500/15 to-transparent pointer-events-none" />}
                  <span className="relative" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.9)' }}>{label}</span>
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
            <div style={{ display: 'flex', alignItems: 'stretch' }}>
              {(
                [
                  ['regimes', 'REGIMES'],
                ] as const
              ).map(([t, label]) => (
                <button
                  key={t}
                  onClick={() => setMainTab(t)}
                  className="flex-1 font-black uppercase tracking-[0.15em] transition-all relative"
                  style={{
                    padding: '14px 16px',
                    fontSize: '14px',
                    color: mainTab === t ? '#FF6600' : '#ffffff',
                    border: mainTab === t ? '2px solid #FF6600' : '2px solid rgba(255,255,255,0.15)',
                    background: mainTab === t
                      ? 'linear-gradient(180deg,#1a1a1a 0%,#060606 100%)'
                      : 'linear-gradient(180deg,#111111 0%,#040404 100%)',
                    boxShadow: mainTab === t
                      ? '0 0 18px rgba(255,102,0,0.35), inset 0 1px 0 rgba(255,255,255,0.1)'
                      : 'inset 0 1px 0 rgba(255,255,255,0.04)',
                    cursor: 'pointer',
                  }}
                >
                  {mainTab === t && <div className="absolute inset-0 bg-gradient-to-b from-orange-500/15 to-transparent pointer-events-none" />}
                  <span className="relative" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.9)' }}>{label}</span>
                </button>
              ))}
              <button
                onClick={() => setActiveSidebarPanel(null)}
                className="flex items-center justify-center font-bold transition-all"
                style={{
                  width: '44px',
                  flexShrink: 0,
                  alignSelf: 'stretch',
                  fontSize: '16px',
                  color: '#FF6600',
                  border: '2px solid rgba(255,102,0,0.5)',
                  background: 'linear-gradient(180deg,#111111 0%,#040404 100%)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#FF6600'
                  e.currentTarget.style.color = '#000'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(180deg,#111111 0%,#040404 100%)'
                  e.currentTarget.style.color = '#FF6600'
                }}
                aria-label="Close"
              >
                &#x2715;
              </button>
            </div>
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

                <div style={{ display: 'grid', gridTemplateColumns: expandedColumn ? '1fr' : '1fr 1fr', gap: isMobile ? '6px' : '20px' }}>
                  {/* Bullish column */}
                  <div style={{ display: expandedColumn === 'bearish' ? 'none' : 'block' }}>
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
                        {filteredBullishTrades.length}
                      </span>
                      <button
                        onClick={() => setExpandedColumn(expandedColumn === 'bullish' ? null : 'bullish')}
                        style={{ marginLeft: '8px', background: 'none', border: '1px solid rgba(0,255,136,0.5)', color: '#00ff88', borderRadius: '3px', width: '22px', height: '22px', fontFamily: 'monospace', fontSize: '16px', fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, lineHeight: 1, flexShrink: 0 }}
                      >
                        {expandedColumn === 'bullish' ? '−' : '+'}
                      </button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {filteredBullishTrades.map((item: any, idx: number) => (
                        <TradeCard key={`b-${idx}`} item={item} isBullish={true} />
                      ))}
                      {filteredBullishTrades.length === 0 && (
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
                  {/* Bearish column */}
                  <div style={{ display: expandedColumn === 'bullish' ? 'none' : 'block' }}>
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
                        {filteredBearishTrades.length}
                      </span>
                      <button
                        onClick={() => setExpandedColumn(expandedColumn === 'bearish' ? null : 'bearish')}
                        style={{ marginLeft: '8px', background: 'none', border: '1px solid rgba(255,51,68,0.5)', color: '#ff3344', borderRadius: '3px', width: '22px', height: '22px', fontFamily: 'monospace', fontSize: '16px', fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, lineHeight: 1, flexShrink: 0 }}
                      >
                        {expandedColumn === 'bearish' ? '−' : '+'}
                      </button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {filteredBearishTrades.map((item: any, idx: number) => (
                        <TradeCard key={`r-${idx}`} item={item} isBullish={false} />
                      ))}
                      {filteredBearishTrades.length === 0 && (
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
            )}
          </div>
        )}

        {/* ── SCANNER tab removed — now lives in its own SCREEN sidebar button ── */}
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
