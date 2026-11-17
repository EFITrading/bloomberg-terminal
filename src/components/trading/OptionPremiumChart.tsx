'use client'

import React, { useEffect, useRef, useState } from 'react'

export interface PremiumPoint {
  time: string
  price: number
  volume: number
}

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'

function fmtTime(t: string): string {
  const part = t.includes(' ') ? t.split(' ').pop()! : t
  const clean = part.replace(/AM|PM/gi, '').trim()
  const [h, m = '00'] = clean.split(':')
  let hours = parseInt(h, 10)
  if (Number.isNaN(hours)) return t
  const ampm = hours < 12 ? 'AM' : 'PM'
  if (hours === 0) hours = 12
  else if (hours > 12) hours -= 12
  return `${hours}:${m.padStart(2, '0')} ${ampm}`
}

export default function OptionPremiumChart({ data, type }: { data: PremiumPoint[]; type: 'call' | 'put' }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  const accent = type === 'call' ? '#22c55e' : '#ef4444'
  const accentRgb = type === 'call' ? '34,197,94' : '239,68,68'

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  const pad = { top: 74, right: 84, bottom: 34, left: 14 }
  const volH = 56

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || data.length === 0 || size.w === 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    const W = size.w
    const H = size.h
    canvas.width = W * dpr
    canvas.height = H * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const bg = ctx.createLinearGradient(0, 0, 0, H)
    bg.addColorStop(0, '#0d0f13')
    bg.addColorStop(1, '#050608')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, W, H)

    const cw = W - pad.left - pad.right
    const plotTop = pad.top
    const plotBottom = H - pad.bottom - volH - 8
    const ch = plotBottom - plotTop

    const prices = data.map((d) => d.price)
    const rawMin = Math.min(...prices)
    const rawMax = Math.max(...prices)
    const span = rawMax - rawMin || Math.max(rawMax * 0.05, 0.01)
    const minP = rawMin - span * 0.12
    const maxP = rawMax + span * 0.12
    const rng = maxP - minP

    const n = data.length
    const xAt = (i: number) => pad.left + (n === 1 ? cw / 2 : (cw * i) / (n - 1))
    const yAt = (p: number) => plotBottom - ((p - minP) / rng) * ch

    // Horizontal grid + price axis
    ctx.font = `700 13px ${FONT}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    const ticks = 6
    for (let i = 0; i <= ticks; i++) {
      const p = minP + (rng * i) / ticks
      const y = Math.round(yAt(p)) + 0.5
      ctx.strokeStyle = 'rgba(255,255,255,0.06)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(pad.left, y)
      ctx.lineTo(W - pad.right, y)
      ctx.stroke()
      ctx.fillStyle = '#ffffff'
      ctx.fillText(`$${p.toFixed(2)}`, W - pad.right + 10, y)
    }

    // Time axis
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.font = `700 13px ${FONT}`
    const maxLabels = Math.max(2, Math.floor(cw / 92))
    const step = Math.max(1, Math.ceil(n / maxLabels))
    for (let i = 0; i < n; i += step) {
      const x = Math.round(xAt(i)) + 0.5
      ctx.strokeStyle = 'rgba(255,255,255,0.04)'
      ctx.beginPath()
      ctx.moveTo(x, plotTop)
      ctx.lineTo(x, H - pad.bottom)
      ctx.stroke()
      ctx.fillStyle = '#ffffff'
      ctx.fillText(fmtTime(data[i].time), Math.min(Math.max(x, 36), W - pad.right - 10), H - 12)
    }

    // Volume bars
    const maxVol = Math.max(...data.map((d) => d.volume), 1)
    const barW = Math.max(1.5, Math.min(14, (cw / n) * 0.7))
    const volBase = H - pad.bottom
    data.forEach((d, i) => {
      const h = (d.volume / maxVol) * volH
      const up = i === 0 ? true : d.price >= data[i - 1].price
      ctx.fillStyle = up ? 'rgba(34,197,94,0.45)' : 'rgba(239,68,68,0.45)'
      ctx.fillRect(xAt(i) - barW / 2, volBase - h, barW, h)
    })
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'
    ctx.beginPath()
    ctx.moveTo(pad.left, volBase + 0.5)
    ctx.lineTo(W - pad.right, volBase + 0.5)
    ctx.stroke()

    // Area fill
    const area = ctx.createLinearGradient(0, plotTop, 0, plotBottom)
    area.addColorStop(0, `rgba(${accentRgb},0.32)`)
    area.addColorStop(1, `rgba(${accentRgb},0)`)
    ctx.beginPath()
    data.forEach((d, i) => (i === 0 ? ctx.moveTo(xAt(i), yAt(d.price)) : ctx.lineTo(xAt(i), yAt(d.price))))
    ctx.lineTo(xAt(n - 1), plotBottom)
    ctx.lineTo(xAt(0), plotBottom)
    ctx.closePath()
    ctx.fillStyle = area
    ctx.fill()

    // Open reference line
    const open = data[0].price
    const openY = yAt(open)
    ctx.setLineDash([4, 4])
    ctx.strokeStyle = 'rgba(255,255,255,0.28)'
    ctx.beginPath()
    ctx.moveTo(pad.left, openY)
    ctx.lineTo(W - pad.right, openY)
    ctx.stroke()
    ctx.setLineDash([])

    // Price line with glow
    ctx.save()
    ctx.shadowColor = accent
    ctx.shadowBlur = 10
    ctx.strokeStyle = accent
    ctx.lineWidth = 2.2
    ctx.lineJoin = 'round'
    ctx.beginPath()
    data.forEach((d, i) => (i === 0 ? ctx.moveTo(xAt(i), yAt(d.price)) : ctx.lineTo(xAt(i), yAt(d.price))))
    ctx.stroke()
    ctx.restore()

    // High / low markers
    const hiI = prices.indexOf(rawMax)
    const loI = prices.indexOf(rawMin)
    const mark = (i: number, label: string, above: boolean) => {
      const x = xAt(i)
      const y = yAt(prices[i])
      ctx.fillStyle = '#0b0d11'
      ctx.strokeStyle = accent
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(x, y, 4, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.font = `700 11px ${FONT}`
      ctx.fillStyle = 'rgba(255,255,255,0.85)'
      ctx.textAlign = 'center'
      ctx.fillText(label, Math.min(Math.max(x, 44), W - pad.right - 44), y + (above ? -10 : 18))
    }
    if (n > 1 && rawMax !== rawMin) {
      mark(hiI, `H $${rawMax.toFixed(2)}`, true)
      mark(loI, `L $${rawMin.toFixed(2)}`, false)
    }

    // Last price tag
    const last = data[n - 1].price
    const lastY = yAt(last)
    ctx.fillStyle = accent
    ctx.beginPath()
    ctx.arc(xAt(n - 1), lastY, 5, 0, Math.PI * 2)
    ctx.fill()
    const tag = `$${last.toFixed(2)}`
    ctx.font = `800 13px ${FONT}`
    const tw = ctx.measureText(tag).width + 16
    ctx.fillStyle = accent
    ctx.fillRect(W - pad.right + 4, lastY - 11, tw, 22)
    ctx.fillStyle = '#000'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(tag, W - pad.right + 12, lastY + 0.5)

    // Hover crosshair
    if (hover !== null && hover >= 0 && hover < n) {
      const x = xAt(hover)
      const y = yAt(data[hover].price)
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'
      ctx.setLineDash([3, 3])
      ctx.beginPath()
      ctx.moveTo(x, plotTop)
      ctx.lineTo(x, H - pad.bottom)
      ctx.moveTo(pad.left, y)
      ctx.lineTo(W - pad.right, y)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = '#fff'
      ctx.beginPath()
      ctx.arc(x, y, 5, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = accent
      ctx.lineWidth = 2
      ctx.stroke()
      const ptxt = `$${data[hover].price.toFixed(2)}`
      ctx.font = `800 12px ${FONT}`
      const pw = ctx.measureText(ptxt).width + 14
      ctx.fillStyle = '#e5e7eb'
      ctx.fillRect(W - pad.right + 4, y - 10, pw, 20)
      ctx.fillStyle = '#000'
      ctx.textAlign = 'left'
      ctx.fillText(ptxt, W - pad.right + 11, y + 0.5)
    }
  }, [data, type, size, hover, accent, accentRgb, pad.bottom, pad.left, pad.right, pad.top])

  if (data.length === 0) return null

  const open = data[0].price
  const last = data[data.length - 1].price
  const hi = Math.max(...data.map((d) => d.price))
  const lo = Math.min(...data.map((d) => d.price))
  const chg = last - open
  const chgPct = open ? (chg / open) * 100 : 0
  const totalVol = data.reduce((s, d) => s + d.volume, 0)
  const shown = hover !== null && data[hover] ? data[hover] : data[data.length - 1]
  const up = chg >= 0

  const stat = (label: string, value: string, color = '#fff') => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: '#ffffff' }}>{label}</span>
      <span style={{ fontSize: 15, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  )

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block', cursor: 'crosshair' }}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          const cw = r.width - pad.left - pad.right
          const frac = (e.clientX - r.left - pad.left) / cw
          const i = Math.round(frac * (data.length - 1))
          setHover(Math.max(0, Math.min(data.length - 1, i)))
        }}
        onMouseLeave={() => setHover(null)}
      />
      <div
        style={{
          position: 'absolute', top: 12, left: 16, right: pad.right, display: 'flex', alignItems: 'flex-end',
          gap: 28, pointerEvents: 'none', fontFamily: FONT,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',           color: '#ffffff' }}>
            {hover !== null ? fmtTime(shown.time) : 'LAST'}
          </span>
          <span style={{ fontSize: 28, fontWeight: 800, color: '#fff', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
            ${shown.price.toFixed(2)}
          </span>
        </div>
        <span
          style={{
            fontSize: 14, fontWeight: 800, color: up ? '#22c55e' : '#ef4444', padding: '3px 9px', borderRadius: 6,
            background: up ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
            border: `1px solid ${up ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)'}`,
          }}
        >
          {up ? '+' : ''}{chg.toFixed(2)} ({up ? '+' : ''}{chgPct.toFixed(1)}%)
        </span>
        <div style={{ flex: 1 }} />
        {stat('OPEN', `$${open.toFixed(2)}`)}
        {stat('HIGH', `$${hi.toFixed(2)}`, '#22c55e')}
        {stat('LOW', `$${lo.toFixed(2)}`, '#ef4444')}
        {stat('VOLUME', totalVol.toLocaleString())}
      </div>
    </div>
  )
}
