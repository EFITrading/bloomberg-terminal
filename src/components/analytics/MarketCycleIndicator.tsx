'use client'

import React, { useEffect, useRef, useState } from 'react'

// â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface BearMatch {
  event: string
  drawdown: string
  recovery: string
  similarity: number
  playbook: string[]
}

interface RecessionMatch {
  event: string
  type: string
  duration: string
  similarity: number
  playbook: string[]
}

interface HistoryResponse {
  timeframe: string
  bear: Array<{ date: string; score: number }>
  recession: Array<{ date: string; prob: number }>
  spy: Array<{ date: string; price: number }>
  events: Array<{ date: string; label: string; type: string }>
}

interface CycleResponse {
  phase: number
  phaseIdx: number
  phaseName: string
  confidence: number
  signals: {
    spyPrice: number
    spy1M: number
    spy3M: number
    spy12M: number
    vix: number
    tlt3M: number
  }
  sectorRanking: Array<{
    ticker: string
    relReturn3M: number
    relReturn1M: number
    cycleAffinity: number
  }>
  phaseSectors: string[]
  fetchErrors: string[]
  timestamp: string
  // new regime fields
  bearStage?: number
  bearStageName?: string
  recessionType?: string
  recessionProbability?: number
  bearMatches?: BearMatch[]
  recessionMatches?: RecessionMatch[]
  rotation?: {
    spread3M: number
    spread1M: number
    rotMomentum: number
    iwmDivergence3M: number
    gld3M: number
    xleAbs3M: number
    xlk3M: number
    xlc3M: number
    xlf3M: number
    xly3M: number
    hygSpread: number
    vixTermStructure: number
    rspDivergence: number
    uup3M: number
    bkln3M: number
  }
}

const MONO = '"Roboto Mono", "SF Mono", monospace'

// Cycle color based on pressure / risk value
const cycleColor = (v: number) =>
  v >= 70
    ? '#ef4444' // bear — red
    : v >= 55
      ? '#f97316' // selling — orange
      : v >= 40
        ? '#facc15' // distribution — yellow
        : v >= 22
          ? '#84cc16' // caution — yellow-green
          : '#00ff41' // bull / pre-peak — green

// ── History line chart (pure SVG, no deps) ──────────────────────────────────
function HistoryChart({
  points,
  events,
  color,
  yMax = 100,
  chartId,
  loading,
  spyPrices,
}: {
  points: Array<{ date: string; value: number }>
  events: Array<{ date: string; label: string; type: string }>
  color: string
  yMax?: number
  chartId: string
  loading?: boolean
  spyPrices?: Array<{ date: string; price: number }>
}) {
  const W = 1000,
    H = 260
  const PL = 38,
    PR = 48,
    PT = 20,
    PB = 30
  const cW = W - PL - PR
  const cH = H - PT - PB

  if (loading)
    return (
      <div
        style={{
          height: H,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#333333',
          fontSize: 13,
          fontFamily: MONO,
          letterSpacing: '0.12em',
        }}
      >
        LOADING HISTORY...
      </div>
    )
  if (!points.length)
    return (
      <div
        style={{
          height: H,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#2a2a2a',
          fontSize: 13,
          fontFamily: MONO,
        }}
      >
        NO DATA
      </div>
    )

  const timestamps = points.map((p) => new Date(p.date).getTime())
  const minT = timestamps[0]
  const maxT = timestamps[timestamps.length - 1]
  const tRange = maxT - minT || 1
  const xOf = (t: number) => PL + ((t - minT) / tRange) * cW
  const yOf = (v: number) => PT + cH - (Math.max(0, Math.min(yMax, v)) / yMax) * cH

  const pts = points.map((p, i) => ({ x: xOf(timestamps[i]), y: yOf(p.value) }))

  // Area fill path (single subtle glow under line)
  const areaD =
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') +
    ` L${pts[pts.length - 1].x.toFixed(1)},${(PT + cH).toFixed(1)} L${pts[0].x.toFixed(1)},${(PT + cH).toFixed(1)} Z`

  // SPY overlay — normalize price to chart height
  let spyLinePath = ''
  let spyCurY = PT + cH / 2
  let spyCurLabel = ''
  if (spyPrices && spyPrices.length === points.length) {
    const prices = spyPrices.map((p) => p.price)
    const spyMin = Math.min(...prices),
      spyMax = Math.max(...prices)
    const spyRange = spyMax - spyMin || 1
    const spyY = (price: number) => PT + cH * 0.96 - ((price - spyMin) / spyRange) * cH * 0.86
    const spyPts2 = prices.map((p, i) => ({ x: pts[i].x, y: spyY(p) }))
    spyLinePath = spyPts2
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(' ')
    spyCurY = spyPts2[spyPts2.length - 1].y
    spyCurLabel = `$${Math.round(prices[prices.length - 1])}`
  }

  const gridVals = [25, 50, 75, yMax].filter((v) => v <= yMax)

  const xLabels = [0, 1, 2, 3, 4].map((n) => {
    const idx = Math.round((n * (points.length - 1)) / 4)
    const d = new Date(points[idx].date)
    const label =
      d.getFullYear() % 5 === 0 || points.length < 80
        ? d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
        : `${d.getFullYear()}`
    return { x: xOf(timestamps[idx]), label }
  })

  const evtLines = events
    .map((e) => {
      const et = new Date(e.date).getTime()
      if (et < minT || et > maxT) return null
      return { x: xOf(et), label: e.label, type: e.type }
    })
    .filter(Boolean) as Array<{ x: number; label: string; type: string }>

  const gradId = `hg-${chartId}`
  const curPt = pts[pts.length - 1]
  const curVal = points[points.length - 1]?.value ?? 0
  const curColor = cycleColor(curVal)

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height: H, display: 'block' }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.18} />
          <stop offset="100%" stopColor={color} stopOpacity={0.01} />
        </linearGradient>
      </defs>

      {/* Horizontal grid lines + left Y-axis labels */}
      {gridVals.map((g) => (
        <g key={g}>
          <line
            x1={PL}
            y1={yOf(g)}
            x2={W - PR}
            y2={yOf(g)}
            stroke="#151515"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
          <text
            x={PL - 5}
            y={yOf(g) + 4.5}
            fill="#ffffff"
            fontSize="13"
            textAnchor="end"
            fontFamily="monospace"
            fontWeight="700"
            style={{ letterSpacing: '0.04em' }}
          >
            {g}
          </text>
        </g>
      ))}

      {/* Baseline */}
      <line
        x1={PL}
        y1={PT + cH}
        x2={W - PR}
        y2={PT + cH}
        stroke="#222"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />

      {/* Event markers */}
      {evtLines.map((e, i) => (
        <g key={i}>
          <line
            x1={e.x}
            y1={PT}
            x2={e.x}
            y2={PT + cH}
            stroke={e.type === 'recovery' ? '#00ff41' : '#ef4444'}
            strokeWidth="1.5"
            strokeDasharray="3,2"
            vectorEffect="non-scaling-stroke"
          />
          <text
            x={e.x + 3}
            y={PT + 11}
            fill={e.type === 'recovery' ? '#00ff41' : '#ef4444'}
            fontSize="11"
            fontFamily="monospace"
            fontWeight="700"
          >
            {e.label}
          </text>
        </g>
      ))}

      {/* Area fill */}
      <path d={areaD} fill={`url(#${gradId})`} />

      {/* SPY overlay line */}
      {spyLinePath && (
        <>
          <path
            d={spyLinePath}
            fill="none"
            stroke="#ffffff"
            strokeWidth="1.2"
            strokeOpacity="0.28"
            strokeDasharray="5,3"
            vectorEffect="non-scaling-stroke"
          />
          {/* Right Y-axis SPY label */}
          <text
            x={W - PR + 5}
            y={spyCurY + 4}
            fill="#ffffff"
            fontSize="12"
            fontFamily="monospace"
            fontWeight="700"
          >
            {spyCurLabel}
          </text>
          <text
            x={W - PR + 5}
            y={PT + 11}
            fill="#ffffffcc"
            fontSize="11"
            fontFamily="monospace"
            fontWeight="700"
          >
            SPY
          </text>
        </>
      )}

      {/* Colored line segments — one per adjacent pair, color = cycle regime */}
      {pts.map((p, i) => {
        if (i === 0) return null
        return (
          <line
            key={i}
            x1={pts[i - 1].x.toFixed(1)}
            y1={pts[i - 1].y.toFixed(1)}
            x2={p.x.toFixed(1)}
            y2={p.y.toFixed(1)}
            stroke={cycleColor(points[i - 1].value)}
            strokeWidth="2"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        )
      })}

      {/* Current value dot + label */}
      <circle
        cx={curPt.x}
        cy={curPt.y}
        r="4"
        fill={curColor}
        stroke="#000"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
      <text
        x={curPt.x + 7}
        y={curPt.y + 5}
        fill={curColor}
        fontSize="16"
        fontFamily="monospace"
        fontWeight="800"
      >
        {curVal}
      </text>

      {/* X-axis date labels */}
      {xLabels.map((l, i) => (
        <text
          key={i}
          x={l.x}
          y={H - 4}
          fill="#ffffff"
          fontSize="13"
          textAnchor="middle"
          fontFamily="monospace"
          fontWeight="700"
        >
          {l.label}
        </text>
      ))}
    </svg>
  )
}

// â”€â”€ Stage progress bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function StageBar({
  stages,
  current,
  colors,
}: {
  stages: string[]
  current: number
  colors: string[]
}) {
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'center', margin: '10px 0 14px' }}>
      {stages.map((s, i) => {
        const isActive = i === current
        const isPast = i < current
        const c = colors[i] ?? '#444'
        return (
          <React.Fragment key={i}>
            <div
              style={{
                flex: 1,
                padding: '5px 3px',
                borderRadius: 4,
                textAlign: 'center',
                background: isActive ? `${c}20` : isPast ? `${c}0d` : '#0a0a0a',
                border: isActive
                  ? `1px solid ${c}`
                  : isPast
                    ? `1px solid ${c}44`
                    : '1px solid #1e1e1e',
                fontSize: 16,
                fontWeight: isActive ? 900 : 600,
                color: isActive ? c : isPast ? `${c}99` : '#666666',
                letterSpacing: '0.05em',
                fontFamily: MONO,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
              }}
            >
              {isActive && <span style={{ marginRight: 3 }}>●</span>}
              {s}
            </div>
            {i < stages.length - 1 && (
              <div style={{ color: '#2a2a2a', fontSize: 16, flexShrink: 0 }}>›</div>
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

// â”€â”€ Match card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function MatchCard({
  match,
  isBest,
  color,
}: {
  match: BearMatch | RecessionMatch
  isBest: boolean
  color: string
}) {
  const asBear = match as BearMatch
  const asRec = match as RecessionMatch
  const sub = asBear.drawdown
    ? `${asBear.drawdown}  ·  Recovery: ${asBear.recovery}`
    : `${asRec.type?.toUpperCase()}  ·  ${asRec.duration}`
  return (
    <div
      style={{
        padding: '7px 12px',
        borderRadius: 5,
        background: isBest ? `${color}12` : '#070707',
        border: isBest ? `1px solid ${color}44` : '1px solid #161616',
        marginBottom: 4,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div
          style={{
            color: isBest ? color : '#cccccc',
            fontSize: 22,
            fontWeight: 700,
            fontFamily: MONO,
          }}
        >
          {isBest ? '◉ ' : '○ '}
          {match.event}
        </div>
        <div
          style={{
            background: isBest ? `${color}22` : '#111',
            border: `1px solid ${isBest ? color + '66' : '#2a2a2a'}`,
            borderRadius: 3,
            padding: '2px 8px',
            color: isBest ? color : '#aaaaaa',
            fontSize: 22,
            fontWeight: 800,
            fontFamily: MONO,
          }}
        >
          {match.similarity}%
        </div>
      </div>
      {isBest && (
        <div style={{ color: '#aaaaaa', fontSize: 16, marginTop: 3, fontFamily: MONO }}>{sub}</div>
      )}
    </div>
  )
}

// â”€â”€ Signal row â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// inline clamp helper used at call sites
const gv = (val: number, lo: number, hi: number, invert = false) =>
  Math.max(
    0,
    Math.min(100, invert ? (1 - (val - lo) / (hi - lo)) * 100 : ((val - lo) / (hi - lo)) * 100)
  )

function GaugeCard({
  title,
  value,
  signal,
  gaugeVal = 50,
}: {
  title: string
  value: string
  signal: 'bull' | 'bear' | 'neutral' | 'warn'
  gaugeVal?: number
}) {
  const c =
    signal === 'bull'
      ? '#00ff41'
      : signal === 'bear'
        ? '#ff3333'
        : signal === 'warn'
          ? '#facc15'
          : '#888888'
  const v = Math.max(0, Math.min(1, gaugeVal / 100))
  const cx = 50,
    cy = 66,
    r = 48,
    sw = 9
  const toRad = (d: number) => (d * Math.PI) / 180
  const needleAngle = 180 + v * 180
  const nx = (cx + r * Math.cos(toRad(needleAngle))).toFixed(1)
  const ny = (cy + r * Math.sin(toRad(needleAngle))).toFixed(1)
  const arcD = `M ${cx - r},${cy} A ${r} ${r} 0 0 1 ${nx},${ny}`
  const band = (f: number, t: number) => {
    const a0 = 180 + f * 180,
      a1 = 180 + t * 180
    const x0 = (cx + r * Math.cos(toRad(a0))).toFixed(1)
    const y0 = (cy + r * Math.sin(toRad(a0))).toFixed(1)
    const x1 = (cx + r * Math.cos(toRad(a1))).toFixed(1)
    const y1 = (cy + r * Math.sin(toRad(a1))).toFixed(1)
    return `M ${x0},${y0} A ${r} ${r} 0 ${t - f > 0.5 ? 1 : 0} 1 ${x1},${y1}`
  }
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '8px 6px 6px',
        background: '#080808',
        borderRadius: 6,
        border: `1px solid ${c}22`,
      }}
    >
      <div
        style={{
          color: '#ffffff',
          fontSize: 17,
          fontFamily: MONO,
          letterSpacing: '0.12em',
          fontWeight: 800,
          marginBottom: 2,
          textTransform: 'uppercase',
          textAlign: 'center',
        }}
      >
        {title}
      </div>
      <svg width="100%" viewBox="0 0 100 76" style={{ overflow: 'visible', maxHeight: 76 }}>
        <path
          d={band(0, 0.35)}
          fill="none"
          stroke="#ff333330"
          strokeWidth={sw + 3}
          strokeLinecap="butt"
        />
        <path
          d={band(0.35, 0.65)}
          fill="none"
          stroke="#facc1530"
          strokeWidth={sw + 3}
          strokeLinecap="butt"
        />
        <path
          d={band(0.65, 1)}
          fill="none"
          stroke="#00ff4130"
          strokeWidth={sw + 3}
          strokeLinecap="butt"
        />
        <path
          d={`M ${cx - r},${cy} A ${r} ${r} 0 0 1 ${cx + r},${cy}`}
          fill="none"
          stroke="#1c1c1c"
          strokeWidth={sw}
          strokeLinecap="round"
        />
        {v > 0.01 && (
          <path d={arcD} fill="none" stroke={c} strokeWidth={sw} strokeLinecap="round" />
        )}
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={c} strokeWidth="2.2" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="3.5" fill={c} />
        <text
          x={cx - r}
          y={cy + 13}
          fill="#ff333380"
          fontSize="8"
          textAnchor="middle"
          fontFamily="monospace"
        >
          B
        </text>
        <text
          x={cx + r}
          y={cy + 13}
          fill="#00ff4180"
          fontSize="8"
          textAnchor="middle"
          fontFamily="monospace"
        >
          G
        </text>
      </svg>
      <div
        style={{
          color: c,
          fontSize: 22,
          fontWeight: 800,
          fontFamily: MONO,
          marginTop: 2,
          letterSpacing: '0.04em',
        }}
      >
        {value}
      </div>
    </div>
  )
}

// â”€â”€ Playbook list â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function Playbook({ items, color }: { items: string[]; color: string }) {
  return (
    <div>
      {items.map((p, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            gap: 8,
            padding: '4px 0',
            borderBottom: i < items.length - 1 ? '1px solid #111' : 'none',
          }}
        >
          <div style={{ color, fontSize: 22, flexShrink: 0, lineHeight: '18px' }}>▶</div>
          <div style={{ color: '#ffffff', fontSize: 22, lineHeight: 1.55 }}>{p}</div>
        </div>
      ))}
    </div>
  )
}

// â”€â”€ Main Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function MarketCycleIndicator() {
  const [data, setData] = useState<CycleResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pulse, setPulse] = useState(true)

  // ── History charts ──────────────────────────────────────────────────────
  const [bearTf, setBearTf] = useState<'1Y' | '5Y' | '20Y'>('1Y')
  const [recTf, setRecTf] = useState<'1Y' | '5Y' | '20Y'>('1Y')
  const [histCache, setHistCache] = useState<Partial<Record<string, HistoryResponse>>>({})
  const [histLoading, setHistLoading] = useState<Partial<Record<string, boolean>>>({})
  const histFetching = useRef<Set<string>>(new Set())

  const loadHistTf = async (tf: string) => {
    if (histFetching.current.has(tf)) return
    histFetching.current.add(tf)
    setHistLoading((prev) => ({ ...prev, [tf]: true }))
    try {
      const res = await fetch(`/api/market-cycle-history?timeframe=${tf}`)
      const d = await res.json()
      setHistCache((prev) => ({ ...prev, [tf]: d }))
    } catch {
      /* ignore */
    }
    setHistLoading((prev) => ({ ...prev, [tf]: false }))
  }

  useEffect(() => {
    fetch('/api/market-cycle')
      .then((r) => r.json())
      .then((d) => {
        setData(d)
        setLoading(false)
      })
      .catch(() => {
        setError('Failed to load cycle data')
        setLoading(false)
      })
  }, [])

  // Preload 1Y history on mount

  useEffect(() => {
    loadHistTf('1Y')
  }, [])

  useEffect(() => {
    loadHistTf(bearTf)
  }, [bearTf])

  useEffect(() => {
    loadHistTf(recTf)
  }, [recTf])

  useEffect(() => {
    const id = setInterval(() => setPulse((p) => !p), 900)
    return () => clearInterval(id)
  }, [])

  if (loading) {
    return (
      <div
        style={{
          background: '#000',
          border: '1px solid #1a1a1a',
          borderRadius: 12,
          padding: 32,
          textAlign: 'center',
          fontFamily: MONO,
          color: '#ffffff',
          fontSize: 16,
          letterSpacing: '0.12em',
        }}
      >
        LOADING MARKET REGIME...
      </div>
    )
  }

  if (error || !data) {
    return (
      <div
        style={{
          background: '#000',
          border: '1px solid #1a1a1a',
          borderRadius: 12,
          padding: 32,
          textAlign: 'center',
          fontFamily: MONO,
          color: '#ff3333',
          fontSize: 16,
        }}
      >
        {error ?? 'No data'}
      </div>
    )
  }

  const sig = data.signals
  const rot = data.rotation

  // bear state
  const bearStage = data.bearStage ?? 0
  const bearStageName = data.bearStageName ?? 'NO SIGNAL'
  const recProb = data.recessionProbability ?? 0
  const recType = data.recessionType ?? 'none'
  const bearMatches = data.bearMatches ?? []
  const recMatches = data.recessionMatches ?? []

  // color coding
  const bearStageColors = ['#00ff41', '#facc15', '#f97316', '#ef4444', '#00ff41']
  const recColors = ['#00ff41', '#facc15', '#f97316', '#ef4444']

  const bearColor = bearStageColors[bearStage] ?? '#00ff41'
  const recStage = recProb < 20 ? 0 : recProb < 45 ? 1 : recProb < 70 ? 2 : 3
  const recColor = recColors[recStage]

  // regime title
  const regimeColor =
    bearStage === 3
      ? '#ef4444'
      : bearStage === 2
        ? '#f97316'
        : bearStage === 1
          ? '#facc15'
          : bearStage === 4
            ? '#00ff41'
            : recProb > 65
              ? '#f97316'
              : recProb > 40
                ? '#facc15'
                : '#00ff41'

  const regimeName =
    bearStage === 4
      ? 'RECOVERY PHASE'
      : bearStage === 3
        ? 'CAPITULATION'
        : bearStage === 2
          ? 'BEAR SELLING'
          : bearStage === 1
            ? 'DISTRIBUTION'
            : recProb > 60
              ? 'RECESSION RISK'
              : recProb > 35
                ? 'ELEVATED RISK'
                : 'BULL PHASE'

  const recTypeLabel =
    recType === 'inflation'
      ? 'INFLATION REGIME'
      : recType === 'demand'
        ? 'DEMAND SHOCK'
        : recType === 'earnings'
          ? 'EARNINGS RECESSION'
          : ''

  const bestBearPlaybook = bearMatches[0]?.playbook ?? [
    'No bear signal active — market in normal phase',
    'Cyclicals outperforming defensives on 3M',
    'Monitor spread divergence for early distribution signs',
  ]
  const bestRecPlaybook = recMatches[0]?.playbook ?? [
    'Recession probability low — sector rotation normal',
    'TLT and XLE showing no regime stress',
    'Continue cyclical allocation',
  ]

  const bearStages = ['PRE-PEAK', 'DIST.', 'SELLING', 'CAPIT.', 'RECOVERY']
  const recStages = ['LOW RISK', 'ELEVATED', 'HIGH RISK', 'RECESSION']

  return (
    <div
      style={{
        background: '#000000',
        border: '1px solid #1a1a1a',
        borderRadius: 12,
        fontFamily: MONO,
        overflow: 'hidden',
      }}
    >
      {/* â”€â”€ Header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div
        style={{
          padding: '16px 24px',
          background: '#050505',
          borderBottom: '1px solid #1a1a1a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 6,
              background: `${regimeColor}18`,
              border: `1px solid ${regimeColor}44`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: regimeColor,
                boxShadow: `0 0 10px ${regimeColor}`,
                opacity: pulse ? 1 : 0.4,
                transition: 'opacity 0.4s',
              }}
            />
          </div>
          <div>
            <div
              style={{
                color: '#ffffff',
                fontSize: 22,
                fontWeight: 800,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
              }}
            >
              Market Regime Engine
            </div>
            <div
              style={{
                color: '#aaaaaa',
                fontSize: 16,
                marginTop: 2,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              Bear Cycle Tracker · Recession Monitor · Sector Rotation
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: '#ffffff', fontSize: 22, fontWeight: 800 }}>
              SPY ${sig.spyPrice.toFixed(0)}
            </div>
            <div
              style={{
                color: sig.vix > 32 ? '#ef4444' : sig.vix > 22 ? '#facc15' : '#00ff41',
                fontSize: 22,
                marginTop: 2,
                fontWeight: 700,
              }}
            >
              VIX {sig.vix.toFixed(1)} · SPY {sig.spy3M > 0 ? '+' : ''}
              {sig.spy3M}% 3M
            </div>
          </div>
          <div
            style={{
              background: `${regimeColor}15`,
              border: `1px solid ${regimeColor}55`,
              borderRadius: 8,
              padding: '10px 18px',
              textAlign: 'center',
            }}
          >
            <div
              style={{ color: regimeColor, fontSize: 19, fontWeight: 900, letterSpacing: '0.1em' }}
            >
              {regimeName}
            </div>
            <div style={{ color: '#cccccc', fontSize: 16, marginTop: 3, letterSpacing: '0.06em' }}>
              {data.confidence}% SIGNAL AGREEMENT
            </div>
          </div>
        </div>
      </div>

      {/* â”€â”€ Fetch warning â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {data.fetchErrors?.length > 0 && (
        <div
          style={{
            padding: '5px 24px',
            background: '#ff333310',
            borderBottom: '1px solid #ff333330',
            fontSize: 16,
            color: '#ff3333',
            letterSpacing: '0.07em',
            fontFamily: MONO,
          }}
        >
          ⚠ DATA MISSING: {data.fetchErrors.join(' · ')}
        </div>
      )}

      {/* â”€â”€ Two panels â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
        {/* â”€â”€ LEFT: Bear Market Tracker â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div style={{ padding: '20px 22px', borderRight: '1px solid #1a1a1a' }}>
          {/* panel header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 4,
            }}
          >
            <div
              style={{ color: '#ffffff', fontSize: 16, fontWeight: 800, letterSpacing: '0.1em' }}
            >
              BEAR MARKET TRACKER
            </div>
            <div
              style={{
                background: `${bearColor}18`,
                border: `1px solid ${bearColor}55`,
                borderRadius: 4,
                padding: '3px 10px',
                color: bearColor,
                fontSize: 22,
                fontWeight: 800,
                letterSpacing: '0.08em',
              }}
            >
              {bearStageName}
            </div>
          </div>
          <div style={{ color: '#aaaaaa', fontSize: 16, marginBottom: 4, letterSpacing: '0.05em' }}>
            Stage progression — calibrated from 7 historical events (2007–2025)
          </div>

          {/* stage bar */}
          <StageBar stages={bearStages} current={bearStage} colors={bearStageColors} />

          {/* signal gauges — 4 cols row 1, 3 cols row 2 centered */}
          <div style={{ marginBottom: 14 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 6,
                marginBottom: 6,
              }}
            >
              {rot ? (
                <GaugeCard
                  title="SPREAD"
                  value={`${rot.spread3M > 0 ? '+' : ''}${rot.spread3M}%`}
                  signal={rot.spread3M > 0 ? 'bull' : rot.spread3M > -3 ? 'warn' : 'bear'}
                  gaugeVal={gv(rot.spread3M, -15, 15)}
                />
              ) : (
                <div />
              )}
              {rot ? (
                <GaugeCard
                  title="BREADTH"
                  value={`${rot.rspDivergence > 0 ? '+' : ''}${rot.rspDivergence}%`}
                  signal={
                    rot.rspDivergence > -1.5 ? 'bull' : rot.rspDivergence > -3 ? 'warn' : 'bear'
                  }
                  gaugeVal={gv(rot.rspDivergence, -8, 8)}
                />
              ) : (
                <div />
              )}
              {rot ? (
                <GaugeCard
                  title="DIVERGENCE"
                  value={`${rot.iwmDivergence3M > 0 ? '+' : ''}${rot.iwmDivergence3M}%`}
                  signal={
                    rot.iwmDivergence3M > -2 ? 'bull' : rot.iwmDivergence3M > -5 ? 'warn' : 'bear'
                  }
                  gaugeVal={gv(rot.iwmDivergence3M, -10, 10)}
                />
              ) : (
                <div />
              )}
              {rot ? (
                <GaugeCard
                  title="MONEY"
                  value={`${rot.uup3M > 0 ? '+' : ''}${rot.uup3M}%`}
                  signal={rot.uup3M > 5 ? 'bear' : rot.uup3M > 2 ? 'warn' : 'bull'}
                  gaugeVal={gv(rot.uup3M, -5, 10, true)}
                />
              ) : (
                <div />
              )}
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 6,
                width: '75%',
                margin: '0 auto',
              }}
            >
              {rot ? (
                <GaugeCard
                  title="METALS"
                  value={`${rot.gld3M > 0 ? '+' : ''}${rot.gld3M}%`}
                  signal={rot.gld3M > 8 ? 'warn' : rot.gld3M > 3 ? 'neutral' : 'bull'}
                  gaugeVal={gv(rot.gld3M, -5, 20, true)}
                />
              ) : (
                <div />
              )}
              <GaugeCard
                title="VOLATILITY"
                value={sig.vix.toFixed(1)}
                signal={sig.vix < 18 ? 'bull' : sig.vix < 28 ? 'warn' : 'bear'}
                gaugeVal={gv(sig.vix, 10, 80, true)}
              />
              <GaugeCard
                title="MOMENTUM"
                value={`${sig.spy3M > 0 ? '+' : ''}${sig.spy3M}%`}
                signal={sig.spy3M > 2 ? 'bull' : sig.spy3M > -5 ? 'warn' : 'bear'}
                gaugeVal={gv(sig.spy3M, -25, 25)}
              />
            </div>
          </div>

          {/* historical matches */}
          <div
            style={{
              color: '#cccccc',
              fontSize: 16,
              fontWeight: 700,
              letterSpacing: '0.08em',
              marginBottom: 6,
              textTransform: 'uppercase',
            }}
          >
            Historical Pattern Match
          </div>
          {bearMatches.slice(0, 3).map((m, i) => (
            <MatchCard key={m.event} match={m} isBest={i === 0} color={bearColor} />
          ))}

          {/* playbook */}
          <div style={{ marginTop: 14 }}>
            <div
              style={{
                color: '#cccccc',
                fontSize: 16,
                fontWeight: 700,
                letterSpacing: '0.08em',
                marginBottom: 7,
                textTransform: 'uppercase',
              }}
            >
              {bearMatches[0] ? `${bearMatches[0].event} Playbook` : 'Current Playbook'}
            </div>
            <Playbook items={bestBearPlaybook} color={bearColor} />
          </div>
        </div>

        {/* â”€â”€ RIGHT: Recession Monitor â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div style={{ padding: '20px 22px' }}>
          {/* panel header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 4,
            }}
          >
            <div
              style={{ color: '#ffffff', fontSize: 16, fontWeight: 800, letterSpacing: '0.1em' }}
            >
              RECESSION MONITOR
            </div>
            <div
              style={{
                background: `${recColor}18`,
                border: `1px solid ${recColor}55`,
                borderRadius: 4,
                padding: '3px 10px',
                color: recColor,
                fontSize: 22,
                fontWeight: 800,
                letterSpacing: '0.08em',
              }}
            >
              {recProb}% PROBABILITY
            </div>
          </div>
          <div style={{ color: '#aaaaaa', fontSize: 16, marginBottom: 4, letterSpacing: '0.05em' }}>
            Types: inflation · demand shock · earnings — backed by 3 recession events
          </div>

          {/* recession stage bar */}
          <StageBar stages={recStages} current={recStage} colors={recColors} />

          {/* type tag */}
          {recType !== 'none' && recTypeLabel && (
            <div
              style={{
                display: 'inline-block',
                marginBottom: 10,
                background: '#f9731618',
                border: '1px solid #f9731644',
                borderRadius: 4,
                padding: '3px 12px',
                color: '#f97316',
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: '0.06em',
              }}
            >
              TYPE DETECTED: {recTypeLabel}
            </div>
          )}

          {/* signal gauges — 4 cols row 1, 3 cols row 2 centered */}
          <div style={{ marginBottom: 14 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 6,
                marginBottom: 6,
              }}
            >
              {rot ? (
                <GaugeCard
                  title="CREDIT"
                  value={`${rot.hygSpread > 0 ? '+' : ''}${rot.hygSpread}%`}
                  signal={rot.hygSpread > -2 ? 'bull' : rot.hygSpread > -5 ? 'warn' : 'bear'}
                  gaugeVal={gv(rot.hygSpread, -15, 5)}
                />
              ) : (
                <div />
              )}
              {rot ? (
                <GaugeCard
                  title="TERM STRUC"
                  value={`${rot.vixTermStructure > 0 ? '+' : ''}${rot.vixTermStructure}%`}
                  signal={
                    rot.vixTermStructure < 10 ? 'bull' : rot.vixTermStructure < 30 ? 'warn' : 'bear'
                  }
                  gaugeVal={gv(rot.vixTermStructure, -5, 40, true)}
                />
              ) : (
                <div />
              )}
              <GaugeCard
                title="BONDS"
                value={`${sig.tlt3M > 0 ? '+' : ''}${sig.tlt3M}%`}
                signal={sig.tlt3M > 5 ? 'warn' : sig.tlt3M < -5 ? 'bear' : 'bull'}
                gaugeVal={sig.tlt3M < -5 ? 15 : sig.tlt3M > 5 ? 38 : 78}
              />
              {rot ? (
                <GaugeCard
                  title="ENERGY"
                  value={`${rot.xleAbs3M > 0 ? '+' : ''}${rot.xleAbs3M}%`}
                  signal={rot.xleAbs3M > 10 ? 'warn' : rot.xleAbs3M < -15 ? 'bear' : 'bull'}
                  gaugeVal={
                    rot.xleAbs3M > 10 ? 35 : rot.xleAbs3M < -15 ? 15 : gv(rot.xleAbs3M + 15, 0, 30)
                  }
                />
              ) : (
                <div />
              )}
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 6,
                width: '75%',
                margin: '0 auto',
              }}
            >
              {rot ? (
                <GaugeCard
                  title="DIVERGENCE"
                  value={`${rot.iwmDivergence3M > 0 ? '+' : ''}${rot.iwmDivergence3M}%`}
                  signal={
                    rot.iwmDivergence3M > -2 ? 'bull' : rot.iwmDivergence3M > -5 ? 'warn' : 'bear'
                  }
                  gaugeVal={gv(rot.iwmDivergence3M, -10, 10)}
                />
              ) : (
                <div />
              )}
              {rot ? (
                <GaugeCard
                  title="LOANS"
                  value={`${rot.bkln3M > 0 ? '+' : ''}${rot.bkln3M}%`}
                  signal={rot.bkln3M > -2 ? 'bull' : rot.bkln3M > -5 ? 'warn' : 'bear'}
                  gaugeVal={gv(rot.bkln3M, -8, 5)}
                />
              ) : (
                <div />
              )}
              <GaugeCard
                title="VOLATILITY"
                value={sig.vix.toFixed(1)}
                signal={sig.vix < 18 ? 'bull' : sig.vix < 32 ? 'warn' : 'bear'}
                gaugeVal={gv(sig.vix, 10, 80, true)}
              />
            </div>
          </div>

          {/* historical matches */}
          <div
            style={{
              color: '#cccccc',
              fontSize: 16,
              fontWeight: 700,
              letterSpacing: '0.08em',
              marginBottom: 6,
              textTransform: 'uppercase',
            }}
          >
            Historical Recession Match
          </div>
          {recMatches.slice(0, 3).map((m, i) => (
            <MatchCard key={m.event} match={m} isBest={i === 0} color={recColor} />
          ))}

          {/* playbook */}
          <div style={{ marginTop: 14 }}>
            <div
              style={{
                color: '#cccccc',
                fontSize: 16,
                fontWeight: 700,
                letterSpacing: '0.08em',
                marginBottom: 7,
                textTransform: 'uppercase',
              }}
            >
              {recMatches[0] ? `${recMatches[0].event} Playbook` : 'Current Playbook'}
            </div>
            <Playbook items={bestRecPlaybook} color={recColor} />
          </div>
        </div>
      </div>

      {/* â”€â”€ Sector Rotation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {/* ── History Charts ──────────────────────────────────────────────── */}
      <div
        style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '1px solid #1a1a1a' }}
      >
        {/* Bear History — left */}
        <div
          style={{
            padding: '14px 8px 18px',
            borderRight: '1px solid #1a1a1a',
            background: '#020202',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 10,
            }}
          >
            <div
              style={{
                color: '#ffffff',
                fontSize: 13,
                fontWeight: 800,
                letterSpacing: '0.1em',
                fontFamily: MONO,
              }}
            >
              BEAR PRESSURE — HISTORICAL
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['1Y', '5Y', '20Y'] as const).map((tf) => (
                <button
                  key={tf}
                  onClick={() => setBearTf(tf)}
                  style={{
                    background: bearTf === tf ? `${bearColor}20` : 'transparent',
                    border: `1px solid ${bearTf === tf ? bearColor + '66' : '#2a2a2a'}`,
                    color: bearTf === tf ? bearColor : '#444444',
                    fontSize: 11,
                    fontFamily: MONO,
                    fontWeight: 700,
                    padding: '3px 9px',
                    borderRadius: 3,
                    cursor: 'pointer',
                    letterSpacing: '0.06em',
                  }}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>
          <HistoryChart
            points={(histCache[bearTf]?.bear ?? []).map((p) => ({ date: p.date, value: p.score }))}
            events={histCache[bearTf]?.events ?? []}
            spyPrices={histCache[bearTf]?.spy}
            color={bearColor}
            yMax={100}
            chartId={`bear-${bearTf}`}
            loading={Boolean(histLoading[bearTf])}
          />
        </div>

        {/* Recession History — right */}
        <div style={{ padding: '14px 8px 18px', background: '#020202' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 10,
            }}
          >
            <div
              style={{
                color: '#ffffff',
                fontSize: 13,
                fontWeight: 800,
                letterSpacing: '0.1em',
                fontFamily: MONO,
              }}
            >
              RECESSION RISK — HISTORICAL
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['1Y', '5Y', '20Y'] as const).map((tf) => (
                <button
                  key={tf}
                  onClick={() => setRecTf(tf)}
                  style={{
                    background: recTf === tf ? `${recColor}20` : 'transparent',
                    border: `1px solid ${recTf === tf ? recColor + '66' : '#2a2a2a'}`,
                    color: recTf === tf ? recColor : '#444444',
                    fontSize: 11,
                    fontFamily: MONO,
                    fontWeight: 700,
                    padding: '3px 9px',
                    borderRadius: 3,
                    cursor: 'pointer',
                    letterSpacing: '0.06em',
                  }}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>
          <HistoryChart
            points={(histCache[recTf]?.recession ?? []).map((p) => ({
              date: p.date,
              value: p.prob,
            }))}
            events={histCache[recTf]?.events ?? []}
            spyPrices={histCache[recTf]?.spy}
            color={recColor}
            yMax={100}
            chartId={`rec-${recTf}`}
            loading={Boolean(histLoading[recTf])}
          />
        </div>
      </div>

      {/* ── Sector Rotation */}
      <div
        style={{ padding: '16px 24px 20px', borderTop: '1px solid #1a1a1a', background: '#040404' }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 10,
          }}
        >
          <div style={{ color: '#ffffff', fontSize: 22, fontWeight: 800, letterSpacing: '0.1em' }}>
            SECTOR ROTATION — 3M RELATIVE TO SPY
          </div>
          <div style={{ color: '#cccccc', fontSize: 16, letterSpacing: '0.06em' }}>
            PHASE LEADERS:&nbsp;
            <span style={{ color: regimeColor, fontWeight: 700 }}>
              {data.phaseSectors.join(' · ')}
            </span>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
            gap: 5,
          }}
        >
          {data.sectorRanking.map((s, rank) => {
            const isTop3 = rank < 3
            const isExpected = data.phaseSectors.includes(s.ticker)
            const color = s.relReturn3M > 0 ? '#00ff41' : '#ff3333'
            const barPct = Math.max(0, Math.min(100, ((s.relReturn3M + 12) / 24) * 100))
            return (
              <div
                key={s.ticker}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 10px',
                  background: isTop3 ? '#0c0c0c' : 'transparent',
                  border: isExpected ? `1px solid ${regimeColor}33` : '1px solid #111',
                  borderRadius: 5,
                }}
              >
                <div
                  style={{
                    color: '#aaaaaa',
                    fontSize: 16,
                    width: 14,
                    textAlign: 'right',
                    flexShrink: 0,
                  }}
                >
                  {rank + 1}
                </div>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 800,
                    color: isExpected ? regimeColor : '#ffffff',
                    width: 36,
                    flexShrink: 0,
                  }}
                >
                  {s.ticker}
                </div>
                <div style={{ flex: 1, height: 3, background: '#1a1a1a', borderRadius: 2 }}>
                  <div
                    style={{
                      width: `${barPct}%`,
                      height: '100%',
                      background: color,
                      borderRadius: 2,
                    }}
                  />
                </div>
                <div
                  style={{
                    color,
                    fontSize: 22,
                    fontWeight: 700,
                    width: 48,
                    textAlign: 'right',
                    flexShrink: 0,
                  }}
                >
                  {s.relReturn3M > 0 ? '+' : ''}
                  {s.relReturn3M}%
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
