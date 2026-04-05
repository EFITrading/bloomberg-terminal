'use client'

import React, { useEffect, useRef, useState } from 'react'

const MONO = '"Roboto Mono", "SF Mono", monospace'
const ALL_SYMBOLS = ['SPX']
// Matches EFI chart timeframes exactly
const ALL_RANGES = ['5m', '1H', '1D', '1W', '1M'] as const
type PCRange = (typeof ALL_RANGES)[number]

/** Client-side auto-refresh interval per range (ms). 0 = never. */
const REFRESH_MS: Record<string, number> = {
  '5m': 5 * 60 * 1000, // refresh every 5 min
  '1H': 15 * 60 * 1000, // refresh every 15 min
  '1D': 0,
  '1W': 0,
  '1M': 0,
}

/** How long module-level cache is considered fresh (ms) -- mirrors server TTL */
const STALE_MS: Record<string, number> = {
  '5m': 5 * 60 * 1000,
  '1H': 15 * 60 * 1000,
  '1D': 12 * 60 * 60 * 1000,
  '1W': 12 * 60 * 60 * 1000,
  '1M': 24 * 60 * 60 * 1000,
}

interface PCChartData {
  dates: string[]
  ratios: number[]
}

/**
 * Module-level cache -- persists across React remounts.
 */
const _mc: {
  range: string
  data: Record<string, PCChartData | null>
  fetchedAt: number
  fetching: boolean
} = { range: '', data: {}, fetchedAt: 0, fetching: false }

/** Module-level subscribers — any mounted instance gets notified when a symbol loads */
type SubFn = (sym: string, data: PCChartData | null) => void
const _subs = new Set<SubFn>()

function pcColor(v: number): string {
  if (v > 0.5) return '#00ff41' // strong call dominance
  if (v > 0.2) return '#84cc16' // mild call dominance
  if (v < -0.5) return '#ef4444' // strong put dominance
  if (v < -0.2) return '#f97316' // mild put dominance
  return '#facc15' // neutral
}

function pcLabel(v: number): string {
  if (v > 0.5) return 'BULLISH'
  if (v > 0.2) return 'MILD BULL'
  if (v < -0.5) return 'BEARISH'
  if (v < -0.2) return 'MILD BEAR'
  return 'NEUTRAL'
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Single chart card
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function PCMiniChart({
  sym,
  data,
  loading,
  large,
  height: heightOverride,
  embedded,
  range,
  setRange,
}: {
  sym: string
  data: PCChartData | null
  loading: boolean
  large?: boolean
  height?: number
  embedded?: boolean
  range?: PCRange
  setRange?: (r: PCRange) => void
}) {
  const W = 800
  const H = heightOverride ?? (large ? 504 : 324)
  const PL = 58,
    PR = 48,
    PT = 14,
    PB = 34
  const cW = W - PL - PR
  const cH = H - PT - PB

  const totalPts = data?.ratios.length ?? 0
  const [zoomStart, setZoomStart] = useState(0)
  const [zoomEnd, setZoomEnd] = useState(totalPts - 1)
  const svgRef = useRef<SVGSVGElement>(null)
  const [crosshair, setCrosshair] = useState<{ x: number; y: number; idx: number } | null>(null)
  // All mutable interaction state lives in refs — no stale closures
  const stateRef = useRef({
    zoomStart: 0,
    zoomEnd: 0,
    totalPts: 0,
    drag: null as { startX: number; startVS: number; startVE: number } | null,
  })
  stateRef.current.zoomStart = zoomStart
  stateRef.current.zoomEnd = zoomEnd
  stateRef.current.totalPts = totalPts

  useEffect(() => {
    const len = data?.ratios.length ?? 0
    setZoomStart(0)
    setZoomEnd(Math.max(0, len - 1))
  }, [data?.ratios.length, sym])

  // Attach native events once on mount so wheel can be { passive: false }
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const { zoomStart: s, zoomEnd: e2, totalPts: tot } = stateRef.current
      const visS = Math.max(0, Math.min(s, tot - 2))
      const visE = Math.max(visS + 1, Math.min(e2, tot - 1))
      const span = visE - visS
      if (tot < 3 || span < 1) return
      const delta = Math.sign(e.deltaY)
      const step = Math.max(1, Math.round(span * 0.1))
      if (delta > 0) {
        // zoom out
        setZoomStart(Math.max(0, visS - step))
        setZoomEnd(Math.min(tot - 1, visE + step))
      } else {
        // zoom in
        if (span <= 4) return
        setZoomStart(Math.min(visS + step, visE - 2))
        setZoomEnd(Math.max(visE - step, visS + 2))
      }
    }
    const onMouseDown = (e: MouseEvent) => {
      const { zoomStart: s, zoomEnd: e2, totalPts: tot } = stateRef.current
      const visS = Math.max(0, Math.min(s, tot - 2))
      const visE = Math.max(visS + 1, Math.min(e2, tot - 1))
      stateRef.current.drag = { startX: e.clientX, startVS: visS, startVE: visE }
      setCrosshair(null)
    }
    const onMouseMove = (e: MouseEvent) => {
      const rect = svg.getBoundingClientRect()
      const { zoomStart: s, zoomEnd: e2, totalPts: tot, drag } = stateRef.current
      if (drag) {
        const span = drag.startVE - drag.startVS
        const pxPerBar = (rect.width * (cW / W)) / Math.max(span, 1)
        const shift = Math.round(-(e.clientX - drag.startX) / pxPerBar)
        const newStart = Math.max(0, Math.min(drag.startVS + shift, tot - 1 - span))
        setZoomStart(newStart)
        setZoomEnd(Math.min(newStart + span, tot - 1))
        return
      }
      const px = ((e.clientX - rect.left) / rect.width) * W
      const py = ((e.clientY - rect.top) / rect.height) * H
      const visS = Math.max(0, Math.min(s, tot - 2))
      const visE = Math.max(visS + 1, Math.min(e2, tot - 1))
      const visLen = visE - visS + 1
      if (visLen < 2 || px < PL || px > W - PR || py < PT || py > PT + cH) {
        setCrosshair(null)
        return
      }
      const idx = Math.max(0, Math.min(Math.round(((px - PL) / cW) * (visLen - 1)), visLen - 1))
      const cx = PL + (idx / (visLen - 1)) * cW
      // Read ratio directly from data
      const ratio = data?.ratios[visS + idx]
      if (ratio === undefined) {
        setCrosshair(null)
        return
      }
      const absMax2 = Math.max(
        Math.max(...(data?.ratios.slice(visS, visE + 1) ?? [0]).map(Math.abs)) * 1.2,
        0.1
      )
      const cy = PT + cH - ((ratio - -absMax2) / (2 * absMax2)) * cH
      setCrosshair({ x: cx, y: cy, idx })
    }
    const onMouseUp = () => {
      stateRef.current.drag = null
    }
    const onMouseLeave = () => {
      stateRef.current.drag = null
      setCrosshair(null)
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    svg.addEventListener('mousedown', onMouseDown)
    svg.addEventListener('mousemove', onMouseMove)
    svg.addEventListener('mouseup', onMouseUp)
    svg.addEventListener('mouseleave', onMouseLeave)
    return () => {
      svg.removeEventListener('wheel', onWheel)
      svg.removeEventListener('mousedown', onMouseDown)
      svg.removeEventListener('mousemove', onMouseMove)
      svg.removeEventListener('mouseup', onMouseUp)
      svg.removeEventListener('mouseleave', onMouseLeave)
    }
    // Only re-attach if svg mounts/unmounts or data changes (for closure over data)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!svgRef.current, data])

  const visStart = Math.max(0, Math.min(zoomStart, totalPts - 2))
  const visEnd = Math.max(visStart + 1, Math.min(zoomEnd, totalPts - 1))
  const visRatios = data?.ratios.slice(visStart, visEnd + 1) ?? []
  const visDates = data?.dates.slice(visStart, visEnd + 1) ?? []

  // Always symmetric around 0
  const rawAbsMax = visRatios.length ? Math.max(...visRatios.map(Math.abs)) : 0.5
  const absMax = Math.max(rawAbsMax * 1.2, 0.1)
  const yMin = -absMax
  const yMax = absMax

  function xOf(i: number, total: number) {
    if (total <= 1) return PL + cW / 2
    return PL + (i / (total - 1)) * cW
  }
  function yOf(v: number) {
    return PT + cH - ((v - yMin) / (yMax - yMin || 1)) * cH
  }
  const zeroY = yOf(0)

  // 5 y-axis labels: -absMax, -absMax/2, 0, +absMax/2, +absMax
  const yLabels = [-absMax, -absMax / 2, 0, absMax / 2, absMax].map((v) => ({ v, y: yOf(v) }))

  const isIntraday = !!data?.dates[0]?.includes('T')

  const xLabels =
    visDates.length > 1
      ? [0, 1, 2, 3, 4].map((n) => {
          const idx = Math.round((n / 4) * (visDates.length - 1))
          const d = new Date(visDates[idx])
          const label = isIntraday
            ? d.toLocaleDateString('en-US', { weekday: 'short' }) +
              ' ' +
              d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
            : d.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: visDates.length > 50 ? '2-digit' : undefined,
              })
          return { x: xOf(idx, visDates.length), label }
        })
      : []

  const curRatio = data?.ratios[data.ratios.length - 1]
  const curColor = curRatio !== undefined ? pcColor(curRatio) : '#333'

  // Two area paths: above zero (bullish) and below zero (bearish)
  const abovePath =
    visRatios.length > 1
      ? (() => {
          const pts = visRatios.map(
            (v, i) => `${xOf(i, visRatios.length).toFixed(1)},${Math.min(yOf(v), zeroY).toFixed(1)}`
          )
          return `M${xOf(0, visRatios.length).toFixed(1)},${zeroY.toFixed(1)} L${pts.join(' L')} L${xOf(visRatios.length - 1, visRatios.length).toFixed(1)},${zeroY.toFixed(1)} Z`
        })()
      : ''
  const belowPath =
    visRatios.length > 1
      ? (() => {
          const pts = visRatios.map(
            (v, i) => `${xOf(i, visRatios.length).toFixed(1)},${Math.max(yOf(v), zeroY).toFixed(1)}`
          )
          return `M${xOf(0, visRatios.length).toFixed(1)},${zeroY.toFixed(1)} L${pts.join(' L')} L${xOf(visRatios.length - 1, visRatios.length).toFixed(1)},${zeroY.toFixed(1)} Z`
        })()
      : ''

  const crosshairDate =
    crosshair && visDates[crosshair.idx]
      ? (() => {
          const d = new Date(visDates[crosshair.idx])
          return isIntraday
            ? d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) +
                ' ' +
                d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
            : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
        })()
      : null

  const spinId = `pcs-${sym}`

  if (embedded) {
    // Flat embedded mode — same header layout as CompositeHistoryChart
    return (
      <div style={{ width: '100%', background: '#050505' }}>
        {/* Header: label left (flex:1), range buttons right — matches CompositeHistoryChart */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 6,
            padding: '0 8px',
          }}
        >
          <div style={{ flex: 1, textAlign: 'center' }}>
            <span
              style={{
                fontFamily: MONO,
                color: curColor,
                fontSize: '14px',
                fontWeight: 900,
                letterSpacing: '0.1em',
              }}
            >
              {sym}
            </span>
            {curRatio !== undefined && (
              <span style={{ fontFamily: MONO, color: '#ff6600', fontSize: '13px', marginLeft: 6 }}>
                {pcLabel(curRatio)} • {curRatio >= 0 ? '+' : ''}
                {curRatio.toFixed(3)}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            {ALL_RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setRange?.(r)}
                style={{
                  padding: '2px 7px',
                  fontFamily: MONO,
                  fontSize: '10px',
                  fontWeight: 700,
                  letterSpacing: '0.05em',
                  background: range === r ? '#ff6600' : 'transparent',
                  color: range === r ? '#000' : '#666',
                  border: `1px solid ${range === r ? '#ff6600' : '#333'}`,
                  borderRadius: '2px',
                  cursor: 'pointer',
                  lineHeight: '1.4',
                }}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          <div
            style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <style>{`@keyframes ${spinId}{to{transform:rotate(360deg)}}`}</style>
            <div
              style={{
                width: 22,
                height: 22,
                border: '2px solid #111',
                borderTopColor: '#ff8500',
                borderRadius: '50%',
                animation: `${spinId} 0.75s linear infinite`,
              }}
            />
          </div>
        ) : !data || data.dates.length === 0 ? (
          <div
            style={{
              height: H,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: MONO,
              fontSize: 10,
              color: '#1c1c1c',
              letterSpacing: '0.14em',
            }}
          >
            NO DATA
          </div>
        ) : (
          <div
            style={{
              position: 'relative',
              cursor: stateRef.current.drag ? 'grabbing' : 'crosshair',
            }}
          >
            <svg
              ref={svgRef}
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="none"
              style={{ width: '100%', height: H, display: 'block' }}
            >
              <defs>
                <linearGradient id={`pcup-${sym}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00ff41" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#00ff41" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id={`pcdn-${sym}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity={0.0} />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity={0.25} />
                </linearGradient>
                <clipPath id={`clip-${sym}`}>
                  <rect x={PL} y={PT} width={cW} height={cH} />
                </clipPath>
              </defs>
              <rect x={0} y={0} width={W} height={H} fill="#050505" />
              <rect x={PL} y={PT} width={cW} height={cH} fill="#050505" />
              {yLabels.map(({ y }, i) => (
                <line
                  key={i}
                  x1={PL}
                  y1={y}
                  x2={W - PR}
                  y2={y}
                  stroke="#0d0d18"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {yLabels.map(({ v, y }) => (
                <text
                  key={v}
                  x={PL - 6}
                  y={y + 4}
                  fill={v > 0 ? '#00ff41' : v < 0 ? '#ff3333' : '#ffffff'}
                  fontSize={16}
                  textAnchor="end"
                  fontFamily="'Roboto Mono',monospace"
                  fontWeight="700"
                >
                  {v === 0 ? '0' : (v > 0 ? '+' : '') + v.toFixed(2)}
                </text>
              ))}
              <line
                x1={PL}
                y1={zeroY}
                x2={W - PR}
                y2={zeroY}
                stroke="#444466"
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
              />
              <line
                x1={PL}
                y1={PT + cH}
                x2={W - PR}
                y2={PT + cH}
                stroke="#1e1e30"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
              <line
                x1={PL}
                y1={PT}
                x2={PL}
                y2={PT + cH}
                stroke="#1e1e30"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
              {abovePath && (
                <path d={abovePath} fill={`url(#pcup-${sym})`} clipPath={`url(#clip-${sym})`} />
              )}
              {belowPath && (
                <path d={belowPath} fill={`url(#pcdn-${sym})`} clipPath={`url(#clip-${sym})`} />
              )}
              <g clipPath={`url(#clip-${sym})`}>
                {visRatios.map((v, i) => {
                  if (i === 0) return null
                  return (
                    <line
                      key={i}
                      x1={xOf(i - 1, visRatios.length).toFixed(1)}
                      y1={yOf(visRatios[i - 1]).toFixed(1)}
                      x2={xOf(i, visRatios.length).toFixed(1)}
                      y2={yOf(v).toFixed(1)}
                      stroke={pcColor(visRatios[i - 1])}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  )
                })}
              </g>
              {visRatios.length > 0 &&
                (() => {
                  const li = visRatios.length - 1
                  const cx = xOf(li, visRatios.length),
                    cy = yOf(visRatios[li])
                  return (
                    <>
                      <circle
                        cx={cx}
                        cy={cy}
                        r={8}
                        fill={curColor}
                        fillOpacity={0.15}
                        vectorEffect="non-scaling-stroke"
                      />
                      <circle
                        cx={cx}
                        cy={cy}
                        r={3.5}
                        fill={curColor}
                        stroke="#050505"
                        strokeWidth="1.5"
                        vectorEffect="non-scaling-stroke"
                      />
                    </>
                  )
                })()}
              {xLabels.map((l, i) => (
                <text
                  key={i}
                  x={l.x}
                  y={H - 10}
                  fill="#ffffff"
                  fontSize={14}
                  textAnchor="middle"
                  fontFamily="'Roboto Mono',monospace"
                  fontWeight="700"
                >
                  {l.label}
                </text>
              ))}
              {crosshair && (
                <>
                  <line
                    x1={crosshair.x}
                    y1={PT}
                    x2={crosshair.x}
                    y2={PT + cH}
                    stroke="#ffffff"
                    strokeWidth="0.6"
                    strokeOpacity={0.45}
                    strokeDasharray="4,3"
                    vectorEffect="non-scaling-stroke"
                  />
                  <line
                    x1={PL}
                    y1={crosshair.y}
                    x2={W - PR}
                    y2={crosshair.y}
                    stroke="#ffffff"
                    strokeWidth="0.6"
                    strokeOpacity={0.45}
                    strokeDasharray="4,3"
                    vectorEffect="non-scaling-stroke"
                  />
                  <rect
                    x={0}
                    y={crosshair.y - 2}
                    width={PL - 2}
                    height={20}
                    rx={2}
                    fill="#050505"
                  />
                  <text
                    x={PL - 4}
                    y={crosshair.y + 14}
                    fill="#FF6600"
                    fontSize={14}
                    textAnchor="end"
                    fontFamily="'Roboto Mono',monospace"
                    fontWeight="700"
                  >
                    {visRatios[crosshair.idx]?.toFixed(3)}
                  </text>
                  {crosshairDate && (
                    <>
                      <rect
                        x={crosshair.x - 75}
                        y={PT + cH + 6}
                        width={150}
                        height={22}
                        rx={2}
                        fill="#050505"
                      />
                      <text
                        x={crosshair.x}
                        y={PT + cH + 21}
                        fill="#FF6600"
                        fontSize={13}
                        textAnchor="middle"
                        fontFamily="'Roboto Mono',monospace"
                        fontWeight="700"
                      >
                        {crosshairDate}
                      </text>
                    </>
                  )}
                  <circle
                    cx={crosshair.x}
                    cy={crosshair.y}
                    r={4}
                    fill="#FF6600"
                    stroke="#050505"
                    strokeWidth="1.5"
                    vectorEffect="non-scaling-stroke"
                  />
                </>
              )}
            </svg>
          </div>
        )}
      </div>
    )
  }

  const spinId2 = spinId
  void spinId2

  return (
    <div
      style={{
        background: '#000000',
        border: '1px solid #1a1a2e',
        borderRadius: '4px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 4px 24px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '9px 14px 7px 14px',
          borderBottom: '1px solid #0d0d1a',
          background: '#000000',
        }}
      >
        <span
          style={{
            fontFamily: MONO,
            color: '#ffffff',
            fontSize: '14px',
            letterSpacing: '0.2em',
            fontWeight: 800,
          }}
        >
          {sym}
        </span>
        {curRatio !== undefined && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
            <span
              style={{
                fontFamily: MONO,
                color: '#3a3a3a',
                fontSize: '9px',
                letterSpacing: '0.08em',
              }}
            >
              {pcLabel(curRatio)}
            </span>
            <span
              style={{
                fontFamily: MONO,
                color: curColor,
                fontSize: '20px',
                fontWeight: 800,
                lineHeight: 1,
              }}
            >
              {curRatio >= 0 ? '+' : ''}
              {curRatio.toFixed(3)}
            </span>
          </div>
        )}
      </div>

      {/* Body */}
      {loading ? (
        <div
          style={{
            height: H,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
          }}
        >
          <style>{`@keyframes ${spinId}{to{transform:rotate(360deg)}}`}</style>
          <div
            style={{
              width: 26,
              height: 26,
              border: '2px solid #111',
              borderTopColor: '#ff8500',
              borderRadius: '50%',
              animation: `${spinId} 0.75s linear infinite`,
            }}
          />
          <span style={{ fontFamily: MONO, fontSize: 10, color: '#222', letterSpacing: '0.12em' }}>
            {sym}
          </span>
        </div>
      ) : !data || data.dates.length === 0 ? (
        <div
          style={{
            height: H,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: MONO,
            fontSize: 10,
            color: '#1c1c1c',
            letterSpacing: '0.14em',
          }}
        >
          NO DATA
        </div>
      ) : (
        <div
          style={{ position: 'relative', cursor: stateRef.current.drag ? 'grabbing' : 'crosshair' }}
        >
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            style={{ width: '100%', height: H, display: 'block' }}
          >
            <defs>
              <linearGradient id={`pcup-${sym}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#00ff41" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#00ff41" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id={`pcdn-${sym}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ef4444" stopOpacity={0.0} />
                <stop offset="100%" stopColor="#ef4444" stopOpacity={0.25} />
              </linearGradient>
              <clipPath id={`clip-${sym}`}>
                <rect x={PL} y={PT} width={cW} height={cH} />
              </clipPath>
            </defs>

            {/* Solid black chart bg */}
            <rect x={0} y={0} width={W} height={H} fill="#000000" />
            <rect x={PL} y={PT} width={cW} height={cH} fill="#000000" />

            {/* Subtle grid */}
            {yLabels.map(({ y }, i) => (
              <line
                key={i}
                x1={PL}
                y1={y}
                x2={W - PR}
                y2={y}
                stroke="#0d0d18"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ))}

            {/* Y labels with +/- */}
            {yLabels.map(({ v, y }) => (
              <text
                key={v}
                x={PL - 6}
                y={y + 4}
                fill={v > 0 ? '#00ff41' : v < 0 ? '#ff3333' : '#ffffff'}
                fontSize={16}
                textAnchor="end"
                fontFamily="'Roboto Mono',monospace"
                fontWeight="700"
              >
                {v === 0 ? '0' : (v > 0 ? '+' : '') + v.toFixed(2)}
              </text>
            ))}

            {/* Zero line — prominent */}
            <line
              x1={PL}
              y1={zeroY}
              x2={W - PR}
              y2={zeroY}
              stroke="#444466"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />

            {/* Axes */}
            <line
              x1={PL}
              y1={PT + cH}
              x2={W - PR}
              y2={PT + cH}
              stroke="#1e1e30"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <line
              x1={PL}
              y1={PT}
              x2={PL}
              y2={PT + cH}
              stroke="#1e1e30"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />

            {/* Dual-color area fill */}
            {abovePath && (
              <path d={abovePath} fill={`url(#pcup-${sym})`} clipPath={`url(#clip-${sym})`} />
            )}
            {belowPath && (
              <path d={belowPath} fill={`url(#pcdn-${sym})`} clipPath={`url(#clip-${sym})`} />
            )}

            {/* Line */}
            <g clipPath={`url(#clip-${sym})`}>
              {visRatios.map((v, i) => {
                if (i === 0) return null
                return (
                  <line
                    key={i}
                    x1={xOf(i - 1, visRatios.length).toFixed(1)}
                    y1={yOf(visRatios[i - 1]).toFixed(1)}
                    x2={xOf(i, visRatios.length).toFixed(1)}
                    y2={yOf(v).toFixed(1)}
                    stroke={pcColor(visRatios[i - 1])}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                )
              })}
            </g>

            {/* Terminal dot */}
            {visRatios.length > 0 &&
              (() => {
                const li = visRatios.length - 1
                const cx = xOf(li, visRatios.length),
                  cy = yOf(visRatios[li])
                return (
                  <>
                    <circle
                      cx={cx}
                      cy={cy}
                      r={8}
                      fill={curColor}
                      fillOpacity={0.15}
                      vectorEffect="non-scaling-stroke"
                    />
                    <circle
                      cx={cx}
                      cy={cy}
                      r={3.5}
                      fill={curColor}
                      stroke="#000000"
                      strokeWidth="1.5"
                      vectorEffect="non-scaling-stroke"
                    />
                  </>
                )
              })()}

            {/* X labels */}
            {xLabels.map((l, i) => (
              <text
                key={i}
                x={l.x}
                y={H - 10}
                fill="#ffffff"
                fontSize={14}
                textAnchor="middle"
                fontFamily="'Roboto Mono',monospace"
                fontWeight="700"
              >
                {l.label}
              </text>
            ))}

            {/* Crosshair */}
            {crosshair && (
              <>
                <line
                  x1={crosshair.x}
                  y1={PT}
                  x2={crosshair.x}
                  y2={PT + cH}
                  stroke="#ffffff"
                  strokeWidth="0.6"
                  strokeOpacity={0.45}
                  strokeDasharray="4,3"
                  vectorEffect="non-scaling-stroke"
                />
                <line
                  x1={PL}
                  y1={crosshair.y}
                  x2={W - PR}
                  y2={crosshair.y}
                  stroke="#ffffff"
                  strokeWidth="0.6"
                  strokeOpacity={0.45}
                  strokeDasharray="4,3"
                  vectorEffect="non-scaling-stroke"
                />
                <rect x={0} y={crosshair.y - 2} width={PL - 2} height={20} rx={2} fill="#000000" />
                <text
                  x={PL - 4}
                  y={crosshair.y + 14}
                  fill="#FF6600"
                  fontSize={14}
                  textAnchor="end"
                  fontFamily="'Roboto Mono',monospace"
                  fontWeight="700"
                >
                  {visRatios[crosshair.idx]?.toFixed(3)}
                </text>
                {crosshairDate && (
                  <>
                    <rect
                      x={crosshair.x - 75}
                      y={PT + cH + 6}
                      width={150}
                      height={22}
                      rx={2}
                      fill="#000000"
                    />
                    <text
                      x={crosshair.x}
                      y={PT + cH + 21}
                      fill="#FF6600"
                      fontSize={13}
                      textAnchor="middle"
                      fontFamily="'Roboto Mono',monospace"
                      fontWeight="700"
                    >
                      {crosshairDate}
                    </text>
                  </>
                )}
                <circle
                  cx={crosshair.x}
                  cy={crosshair.y}
                  r={4}
                  fill="#FF6600"
                  stroke="#000000"
                  strokeWidth="1.5"
                  vectorEffect="non-scaling-stroke"
                />
              </>
            )}
          </svg>
          <div
            style={{
              position: 'absolute',
              bottom: 40,
              right: 18,
              fontFamily: MONO,
              fontSize: 8,
              color: '#222',
              pointerEvents: 'none',
            }}
          >
            SCROLL TO ZOOM
          </div>
        </div>
      )}
    </div>
  )
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Main component â€” module-level cache prevents re-fetch on remount
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function PutCallRatioChart({
  chartHeight,
  embedded,
}: { chartHeight?: number; embedded?: boolean } = {}) {
  const [range, setRange] = useState<PCRange>(() => (_mc.range as PCRange) || '1D')
  const [chartData, setChartData] = useState<Record<string, PCChartData | null>>(() => {
    // On mount, immediately populate from module cache if it's warm
    if (_mc.range && Object.keys(_mc.data).length === ALL_SYMBOLS.length) {
      return { ..._mc.data }
    }
    return {}
  })
  const [loading, setLoading] = useState<Record<string, boolean>>(() => {
    const warm = _mc.range && Object.keys(_mc.data).length === ALL_SYMBOLS.length
    return Object.fromEntries(ALL_SYMBOLS.map((s) => [s, !warm]))
  })

  const activeRangeRef = useRef<PCRange>(range)

  function fetchAll(r: PCRange, force = false) {
    const staleMs = STALE_MS[r] ?? STALE_MS['3Y']
    const cacheFresh =
      !force &&
      _mc.range === r &&
      Date.now() - _mc.fetchedAt < staleMs &&
      ALL_SYMBOLS.every((s) => s in _mc.data)

    if (cacheFresh) {
      setChartData({ ..._mc.data })
      setLoading(Object.fromEntries(ALL_SYMBOLS.map((s) => [s, false])))
      return
    }

    // If a fetch is already in-flight for this exact range, don't start another —
    // the subscriber added in useEffect will deliver data when it arrives.
    if (!force && _mc.fetching && _mc.range === r) {
      return
    }

    // Invalidate module cache for this range
    _mc.range = r
    _mc.data = {}
    _mc.fetchedAt = Date.now()
    _mc.fetching = true

    setChartData({})
    setLoading(Object.fromEntries(ALL_SYMBOLS.map((s) => [s, true])))

    ALL_SYMBOLS.forEach((sym) => {
      fetch(`/api/historical-pc-ratio?symbol=${sym}&range=${r}`)
        .then((res) => res.json())
        .then((json) => {
          const val: PCChartData | null =
            json.success && json.ratios?.length ? { dates: json.dates, ratios: json.ratios } : null
          _mc.data[sym] = val
          // Notify all currently-mounted instances
          _subs.forEach((cb) => cb(sym, val))
        })
        .catch((err) => {
          console.error(`[PC] ${sym} fetch threw:`, err)
          _mc.data[sym] = null
          _subs.forEach((cb) => cb(sym, null))
        })
        .finally(() => {
          if (ALL_SYMBOLS.every((s) => s in _mc.data)) _mc.fetching = false
        })
    })
  }

  useEffect(() => {
    activeRangeRef.current = range

    // Subscribe to receive data from any in-flight or future fetches
    const sub: SubFn = (sym, data) => {
      setChartData((prev) => ({ ...prev, [sym]: data }))
      setLoading((prev) => ({ ...prev, [sym]: false }))
    }
    _subs.add(sub)

    fetchAll(range)

    const refreshMs = REFRESH_MS[range]
    const timer = refreshMs
      ? setInterval(() => {
          if (activeRangeRef.current === range) fetchAll(range, true)
        }, refreshMs)
      : null

    return () => {
      _subs.delete(sub)
      if (timer) clearInterval(timer)
    }
  }, [range])

  if (embedded) {
    return (
      <PCMiniChart
        sym="SPX"
        data={chartData['SPX'] ?? null}
        loading={loading['SPX'] ?? true}
        height={chartHeight}
        embedded
        range={range}
        setRange={setRange}
      />
    )
  }

  return (
    <div style={{ padding: '10px 8px 8px', background: '#000', minHeight: '100%' }}>
      {/* â”€â”€ Range selector â”€â”€ */}
      <div style={{ display: 'flex', gap: 3, justifyContent: 'center', marginBottom: 12 }}>
        {ALL_RANGES.map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            style={{
              padding: '4px 14px',
              fontSize: '11px',
              fontWeight: 700,
              fontFamily: MONO,
              letterSpacing: '0.12em',
              borderRadius: '2px',
              border: range === r ? '1px solid #FF6600' : '1px solid #1a1a1a',
              background: '#000',
              color: range === r ? '#FF6600' : '#ffffff',
              cursor: 'pointer',
              transition: 'all 0.12s',
            }}
          >
            {r}
          </button>
        ))}
        {/* auto-refresh indicator for short ranges */}
        {(range === '5m' || range === '1H') && (
          <span
            style={{
              fontFamily: MONO,
              fontSize: 9,
              color: '#2a4a2a',
              alignSelf: 'center',
              marginLeft: 4,
              letterSpacing: '0.06em',
            }}
          >
            LIVE {range === '5m' ? '5M' : '15M'}
          </span>
        )}
      </div>

      {/* â”€â”€ SPY â€” full-width large â”€â”€ */}
      <div style={{ marginBottom: 7 }}>
        <PCMiniChart
          sym="SPX"
          data={chartData['SPX'] ?? null}
          loading={loading['SPX'] ?? true}
          large={!chartHeight}
          height={chartHeight}
        />
      </div>
    </div>
  )
}
