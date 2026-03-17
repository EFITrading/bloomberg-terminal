'use client'

import { memo, useCallback, useEffect, useRef, useState } from 'react'

import { RegimeAnalysis } from '@/contexts/MarketRegimeContext'

// ─────────────────────────────────────────────────────────────────────────────
// Module-level cache for composite history — survives React remounts.
// When EnhancedRegimeDisplay remounts (e.g. during 30s data refresh when
// regimeAnalysis briefly becomes {}) the chart re-initialises from this
// cache immediately, so historyLoading never flips true and there is no
// visible loading flash / flicker.
// ─────────────────────────────────────────────────────────────────────────────
type HistoryPoint = {
  date: string
  compositeScore: number
  regime: string
  label: string
  spyClose?: number | null
}
let _historyModuleCache: HistoryPoint[] = []
let _historyCacheTs = 0
const CLIENT_HISTORY_TTL = 30 * 60 * 1000 // 30 min — matches API cache

// ─────────────────────────────────────────────────────────────────────────────
// Exported prefetch — call this on app mount so the chart data is ready
// before the user opens the watchlist panel for the first time.
// ─────────────────────────────────────────────────────────────────────────────
export function prefetchCompositeHistory() {
  if (Date.now() - _historyCacheTs < CLIENT_HISTORY_TTL && _historyModuleCache.length > 0) return
  fetch('/api/composite-history')
    .then((r) => r.json())
    .then((data) => {
      if (data.history && data.history.length > 0) {
        _historyModuleCache = data.history
        _historyCacheTs = Date.now()
      }
    })
    .catch(() => { })
}

// ─────────────────────────────────────────────────────────────────────────────
// Composite History Chart — all hover interaction is 100% imperative DOM
// mutation (no useState for hover). Mouse move never triggers ANY React render.
// ─────────────────────────────────────────────────────────────────────────────
const CompositeHistoryChart = memo(function CompositeHistoryChart({
  historyData,
  compositeRegime,
  compositeStrength,
  compositeConfidence,
  compositeColor,
  historyLoading,
  historyError,
  tfRange,
  setTfRange,
}: {
  historyData: { date: string; compositeScore: number; regime: string; label: string }[]
  compositeRegime: string
  compositeStrength: string
  compositeConfidence: number
  compositeColor: string
  historyLoading: boolean
  historyError: string | null
  tfRange: '1Y' | '3Y' | '5Y'
  setTfRange: (v: '1Y' | '3Y' | '5Y') => void
}) {
  const overlayRef = useRef<SVGGElement>(null)
  // Keep a stable ref to the latest sliced data so the callback never needs to change
  const dataRef = useRef(historyData)

  // Slice historyData to the selected timeframe
  const viewData = (() => {
    if (!historyData.length) return historyData
    const cutoff = new Date()
    if (tfRange === '1Y') cutoff.setFullYear(cutoff.getFullYear() - 1)
    else if (tfRange === '3Y') cutoff.setFullYear(cutoff.getFullYear() - 3)
    else return historyData // 5Y = all
    const cutStr = cutoff.toISOString().split('T')[0]
    const idx = historyData.findIndex((d) => d.date >= cutStr)
    return idx >= 0 ? historyData.slice(idx) : historyData
  })()
  // Always keep dataRef in sync with the current view (ref mutation in render is safe)
  dataRef.current = viewData

  useEffect(() => {
    dataRef.current = viewData
  }, [viewData])

  const W = 1000,
    H = 240
  const pL = 40,
    pR = 12,
    pT = 10,
    pB = 30
  const plotW = W - pL - pR
  const plotH = H - pT - pB

  const scores = viewData.map((d) => d.compositeScore)
  const rawMax =
    viewData.length > 0 ? Math.max(Math.abs(Math.min(...scores)), Math.abs(Math.max(...scores))) : 2
  const maxAbs = Math.max(rawMax, 2)

  // Dynamic y-axis ticks: adapt to actual data range
  const tickHalf = parseFloat((maxAbs / 2).toFixed(1))
  const yTicks = [-maxAbs, -tickHalf, 0, tickHalf, maxAbs]

  const toX = (i: number) => pL + (i / Math.max(viewData.length - 1, 1)) * plotW
  const toY = (score: number) => pT + plotH / 2 - (score / maxAbs) * (plotH / 2)
  const zeroY = toY(0)

  // Month labels — cap to ~12 visible to prevent overlap
  const monthLabels: { x: number; label: string }[] = []
  let lastMo = -1
  viewData.forEach((d, i) => {
    const mo = new Date(d.date + 'T00:00:00').getMonth()
    if (mo !== lastMo) {
      lastMo = mo
      const dt = new Date(d.date + 'T00:00:00')
      monthLabels.push({
        x: toX(i),
        label: dt.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      })
    }
  })
  const labelStep = Math.max(1, Math.ceil(monthLabels.length / 12))
  const visibleLabels = monthLabels.filter((_, i) => i % labelStep === 0)

  const lastPt = viewData.length > 0 ? viewData[viewData.length - 1] : null
  const lastDotColor = lastPt
    ? lastPt.compositeScore > 0
      ? '#ef4444'
      : lastPt.compositeScore < 0
        ? '#10b981'
        : '#fbbf24'
    : '#fbbf24'

  const abovePoints = viewData
    .map((d, i) => `${toX(i)},${toY(Math.max(d.compositeScore, 0))}`)
    .join(' ')
  const belowPoints = viewData
    .map((d, i) => `${toX(i)},${toY(Math.min(d.compositeScore, 0))}`)
    .join(' ')

  // SPY normalized line — scaled to fill the same plot height as the composite
  const spyPrices = viewData.map((d) => d.spyClose ?? null).filter((v): v is number => v !== null)
  const spyMin = spyPrices.length > 0 ? Math.min(...spyPrices) : 0
  const spyMax = spyPrices.length > 0 ? Math.max(...spyPrices) : 1
  const spyRange = spyMax - spyMin || 1
  const toSpyY = (price: number) => pT + plotH - ((price - spyMin) / spyRange) * plotH
  const spyLinePoints = viewData
    .map((d, i) => (d.spyClose != null ? `${toX(i)},${toSpyY(d.spyClose)}` : null))
    .filter(Boolean)
    .join(' ')

  // Colored line segments: red when above zero, green when below zero
  type Seg = { pts: string; color: string }
  const coloredSegments: Seg[] = []
  if (viewData.length > 1) {
    let segPts: string[] = [`${toX(0)},${toY(viewData[0].compositeScore)}`]
    let segColor = viewData[0].compositeScore >= 0 ? '#ef4444' : '#10b981'
    for (let i = 1; i < viewData.length; i++) {
      const prev = viewData[i - 1].compositeScore
      const curr = viewData[i].compositeScore
      if ((prev >= 0 && curr < 0) || (prev < 0 && curr >= 0)) {
        const t = prev / (prev - curr)
        const crossX = toX(i - 1) + t * (toX(i) - toX(i - 1))
        segPts.push(`${crossX},${zeroY}`)
        coloredSegments.push({ pts: segPts.join(' '), color: segColor })
        segColor = curr >= 0 ? '#ef4444' : '#10b981'
        segPts = [`${crossX},${zeroY}`]
      }
      segPts.push(`${toX(i)},${toY(curr)}`)
    }
    if (segPts.length > 1) coloredSegments.push({ pts: segPts.join(' '), color: segColor })
  }

  // ── Imperative hover handlers — ZERO React state, ZERO re-renders ──────────
  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const g = overlayRef.current
    if (!g) return
    const data = dataRef.current
    if (!data.length) return

    const rect = e.currentTarget.getBoundingClientRect()
    const scaleX = W / rect.width
    const relX = (e.clientX - rect.left) * scaleX - pL
    const idx = Math.max(
      0,
      Math.min(data.length - 1, Math.round((relX / plotW) * (data.length - 1)))
    )
    const pt = data[idx]
    if (!pt) return

    // Precompute using the same maxAbs that was used to render the static chart
    const s = data.map((d) => d.compositeScore)
    const rm = Math.max(Math.abs(Math.min(...s)), Math.abs(Math.max(...s)))
    const ma = Math.max(rm, 2)
    const tx = (i: number) => pL + (i / Math.max(data.length - 1, 1)) * plotW
    const ty = (score: number) => pT + plotH / 2 - (score / ma) * (plotH / 2)

    const cx = tx(idx)
    const cy = ty(pt.compositeScore)
    const dotColor =
      pt.compositeScore > 0 ? '#ef4444' : pt.compositeScore < 0 ? '#10b981' : '#fbbf24'
    const ttX = cx > W - 174 ? cx - 178 : cx + 8
    const ttY = Math.max(pT, Math.min(cy - 22, H - pB - 64))
    const val = (pt.compositeScore >= 0 ? '+' : '') + pt.compositeScore.toFixed(3)
    const spyStr = pt.spyClose != null ? `$${pt.spyClose.toFixed(2)}` : ''

    g.style.display = 'block'
    // Use innerHTML — fastest way to update multiple SVG nodes without React
    g.innerHTML = `
      <line x1="${cx}" y1="${pT}" x2="${cx}" y2="${H - pB}" stroke="#ffffff30" stroke-width="1" stroke-dasharray="3,2"/>
      <circle cx="${cx}" cy="${cy}" r="5" fill="${dotColor}" stroke="#000" stroke-width="1.5"/>
      <rect x="${ttX}" y="${ttY}" width="170" height="${spyStr ? 64 : 52}" rx="2" fill="#0a0a0a" stroke="${dotColor}" stroke-width="1.5"/>
      <text x="${ttX + 6}" y="${ttY + 14}" font-size="9" fill="#ff8800" font-family="monospace" font-weight="bold">${pt.date}</text>
      <text x="${ttX + 6}" y="${ttY + 28}" font-size="10" fill="${dotColor}" font-family="monospace" font-weight="bold">${val}</text>
      <text x="${ttX + 6}" y="${ttY + 42}" font-size="8" fill="#999" font-family="monospace">${pt.regime}</text>
      ${spyStr ? `<text x="${ttX + 6}" y="${ttY + 56}" font-size="9" fill="#ffffffaa" font-family="monospace" font-weight="bold">SPY ${spyStr}</text>` : ''}
    `
  }, []) // stable — reads data via ref, reads chart constants from closure (never change)

  const handleMouseLeave = useCallback(() => {
    if (overlayRef.current) overlayRef.current.style.display = 'none'
  }, [])

  return (
    <div
      style={{
        width: '100%',
        background: '#050505',
        border: `1px solid ${compositeColor}40`,
        borderRadius: '2px',
        padding: '8px 0 4px',
      }}
    >
      {/* Current regime label + timeframe buttons */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          marginBottom: '6px',
          padding: '0 8px',
        }}
      >
        <div style={{ flex: 1, textAlign: 'center' }}>
          <span
            style={{
              fontSize: '14px',
              fontFamily: 'monospace',
              fontWeight: '900',
              color: compositeColor,
              letterSpacing: '0.1em',
              opacity: 1,
            }}
          >
            {compositeRegime}
          </span>
          <span
            style={{
              fontSize: '13px',
              fontFamily: 'monospace',
              color: '#ff6600',
              marginLeft: '6px',
              opacity: 1,
            }}
          >
            {compositeStrength} • {Math.round(compositeConfidence)}%
          </span>
        </div>
        <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
          {(['1Y', '3Y', '5Y'] as const).map((tf) => (
            <button
              key={tf}
              onClick={() => setTfRange(tf)}
              style={{
                padding: '2px 7px',
                fontFamily: 'monospace',
                fontSize: '10px',
                fontWeight: '700',
                letterSpacing: '0.05em',
                background: tfRange === tf ? '#ff6600' : 'transparent',
                color: tfRange === tf ? '#000' : '#666',
                border: `1px solid ${tfRange === tf ? '#ff6600' : '#333'}`,
                borderRadius: '2px',
                cursor: 'pointer',
                lineHeight: '1.4',
              }}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {historyLoading && (
        <div
          style={{
            height: '180px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: '11px',
              color: '#ff6600',
              letterSpacing: '0.2em',
            }}
          >
            LOADING...
          </span>
        </div>
      )}
      {historyError && !historyLoading && (
        <div
          style={{
            height: '180px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span style={{ fontFamily: 'monospace', fontSize: '10px', color: '#ef4444' }}>
            {historyError}
          </span>
        </div>
      )}
      {!historyLoading && !historyError && viewData.length > 0 && (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height={H}
          preserveAspectRatio="none"
          style={{ display: 'block', cursor: 'crosshair', overflow: 'visible' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {/* Y-axis grid lines — dynamic ticks adapted to actual data range */}
          {yTicks.map((v) => {
            const y = toY(v)
            const label = Number.isInteger(v) ? String(v) : v.toFixed(1)
            return (
              <g key={v}>
                <line
                  x1={pL}
                  y1={y}
                  x2={W - pR}
                  y2={y}
                  stroke={v === 0 ? '#444' : '#1a1a1a'}
                  strokeWidth={v === 0 ? 1.5 : 1}
                  strokeDasharray={v === 0 ? '4,3' : '2,4'}
                />
                <text
                  x={pL - 3}
                  y={y + 3.5}
                  textAnchor="end"
                  fontSize="16"
                  fill={v > 0 ? '#ef4444' : v < 0 ? '#10b981' : '#888'}
                  fontFamily="monospace"
                  fontWeight="700"
                >
                  {label}
                </text>
              </g>
            )
          })}

          {/* DEF / GRTH axis labels — right side, inside plot */}
          <text
            x={W - pR - 2}
            y={pT + 10}
            textAnchor="end"
            fontSize="13"
            fill="#ef4444"
            fontFamily="monospace"
            fontWeight="700"
          >
            DEF
          </text>
          <text
            x={W - pR - 2}
            y={H - pB}
            textAnchor="end"
            fontSize="13"
            fill="#10b981"
            fontFamily="monospace"
            fontWeight="700"
          >
            GRTH
          </text>

          {/* SPY price line — normalized, rendered behind composite */}
          {spyLinePoints && (
            <polyline
              points={spyLinePoints}
              fill="none"
              stroke="#ffffff"
              strokeWidth={1}
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity={0.25}
            />
          )}

          {/* Defensive area fill */}
          <polygon
            points={`${toX(0)},${zeroY} ${abovePoints} ${toX(viewData.length - 1)},${zeroY}`}
            fill="#ef444418"
          />
          {/* Growth area fill */}
          <polygon
            points={`${toX(0)},${zeroY} ${belowPoints} ${toX(viewData.length - 1)},${zeroY}`}
            fill="#10b98118"
          />

          {/* Main line — red above zero, green below zero */}
          {coloredSegments.map((seg, i) => (
            <polyline
              key={i}
              points={seg.pts}
              fill="none"
              stroke={seg.color}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity={1}
              shapeRendering="crispEdges"
            />
          ))}

          {/* Current value dot */}
          {lastPt && (
            <circle
              cx={toX(viewData.length - 1)}
              cy={toY(lastPt.compositeScore)}
              r={4}
              fill={lastDotColor}
              stroke="#000"
              strokeWidth={1.5}
            />
          )}

          {/* X-axis month labels */}
          {visibleLabels.map((lbl, i) => (
            <text
              key={i}
              x={lbl.x}
              y={H - 6}
              textAnchor="middle"
              fontSize="11"
              fill="#ffffff"
              fontFamily="monospace"
              fontWeight="700"
              letterSpacing="0.5"
            >
              {lbl.label}
            </text>
          ))}

          {/* Hover overlay — imperatively mutated, never causes React re-renders */}
          <g ref={overlayRef} style={{ display: 'none' }} />
        </svg>
      )}
    </div>
  )
})

// Top holdings per sector ETF (same list used by ETFHoldingsModal)
const SECTOR_HOLDINGS: Record<string, string[]> = {
  XLK: [
    'AAPL',
    'MSFT',
    'NVDA',
    'AVGO',
    'CRM',
    'ORCL',
    'ADBE',
    'ACN',
    'CSCO',
    'AMD',
    'IBM',
    'INTC',
    'QCOM',
    'TXN',
    'NOW',
  ],
  XLF: [
    'BRK.B',
    'JPM',
    'V',
    'MA',
    'BAC',
    'WFC',
    'GS',
    'MS',
    'SPGI',
    'AXP',
    'BLK',
    'C',
    'SCHW',
    'CME',
    'USB',
  ],
  XLV: [
    'UNH',
    'JNJ',
    'PFE',
    'ABBV',
    'MRK',
    'TMO',
    'ABT',
    'DHR',
    'BMY',
    'ELV',
    'LLY',
    'AMGN',
    'GILD',
    'ISRG',
    'CVS',
  ],
  XLI: [
    'CAT',
    'RTX',
    'HON',
    'UPS',
    'LMT',
    'BA',
    'UNP',
    'ADP',
    'DE',
    'MMM',
    'GE',
    'EMR',
    'ETN',
    'ITW',
    'CSX',
  ],
  XLY: [
    'AMZN',
    'TSLA',
    'HD',
    'MCD',
    'BKNG',
    'NKE',
    'LOW',
    'SBUX',
    'TJX',
    'ORLY',
    'CMG',
    'MAR',
    'GM',
    'F',
    'ROST',
  ],
  XLP: [
    'PG',
    'KO',
    'PEP',
    'WMT',
    'COST',
    'MDLZ',
    'CL',
    'KMB',
    'GIS',
    'MO',
    'PM',
    'EL',
    'STZ',
    'HSY',
  ],
  XLE: [
    'XOM',
    'CVX',
    'COP',
    'EOG',
    'SLB',
    'PSX',
    'VLO',
    'MPC',
    'OXY',
    'BKR',
    'HAL',
    'DVN',
    'HES',
    'KMI',
    'WMB',
  ],
  XLU: [
    'NEE',
    'SO',
    'DUK',
    'CEG',
    'SRE',
    'AEP',
    'VST',
    'D',
    'PCG',
    'PEG',
    'EXC',
    'XEL',
    'ED',
    'WEC',
    'ES',
  ],
  XLB: [
    'LIN',
    'APD',
    'SHW',
    'ECL',
    'FCX',
    'NEM',
    'CTVA',
    'DD',
    'NUE',
    'PPG',
    'DOW',
    'ALB',
    'VMC',
    'MLM',
    'AMCR',
  ],
  XLRE: [
    'PLD',
    'AMT',
    'CCI',
    'EQIX',
    'PSA',
    'WY',
    'DLR',
    'O',
    'SBAC',
    'EXR',
    'WELL',
    'AVB',
    'VTR',
    'ARE',
    'SPG',
  ],
  XLC: [
    'GOOGL',
    'GOOG',
    'META',
    'NFLX',
    'DIS',
    'CMCSA',
    'VZ',
    'T',
    'TMUS',
    'CHTR',
    'EA',
    'TTWO',
    'FOXA',
    'OMC',
  ],
}

interface EnhancedRegimeDisplayProps {
  regimeAnalysis: Record<string, RegimeAnalysis>
  selectedPeriod?: string
  watchlistData?: Record<string, any>
}

function EnhancedRegimeDisplay({
  regimeAnalysis,
  selectedPeriod = '1d',
  watchlistData = {},
}: EnhancedRegimeDisplayProps) {
  const [showSummary, setShowSummary] = useState(() => {
    try {
      return localStorage.getItem('enhancedRegime_showSummary') === 'true'
    } catch {
      return false
    }
  })
  const toggleSummary = () =>
    setShowSummary((prev) => {
      const next = !prev
      try {
        localStorage.setItem('enhancedRegime_showSummary', String(next))
      } catch { }
      return next
    })
  const [selectedTimeframe, setSelectedTimeframe] = useState(selectedPeriod)
  const [expandedSectors, setExpandedSectors] = useState<string[]>([])

  // Live picks fetched from holdings data
  const [livePicks, setLivePicks] = useState<{ long: string[]; short: string[] }>({
    long: [],
    short: [],
  })
  const [picksLoading, setPicksLoading] = useState(false)
  const lastPicksKey = useRef('')

  // VIX price state — fetched once on mount, used to adjust composite only
  const [vixPrice, setVixPrice] = useState<number | null>(null)

  const [tfRange, setTfRange] = useState<'1Y' | '3Y' | '5Y'>(() => {
    try {
      const s = localStorage.getItem('compositeTfRange')
      if (s === '1Y' || s === '3Y' || s === '5Y') return s
    } catch { }
    return '1Y'
  })
  const handleSetTfRange = useCallback((v: '1Y' | '3Y' | '5Y') => {
    try {
      localStorage.setItem('compositeTfRange', v)
    } catch { }
    setTfRange(v)
  }, [])

  // Composite history chart state — persisted to localStorage so it survives parent re-renders / remounts
  const [compositeView, setCompositeView] = useState<'gauge' | 'chart'>(() => {
    try {
      const saved = localStorage.getItem('compositeView')
      console.debug('[EnhancedRegimeDisplay] mount — compositeView from storage:', saved)
      return (saved === 'chart' ? 'chart' : 'gauge') as 'gauge' | 'chart'
    } catch {
      return 'gauge'
    }
  })
  const [historyData, setHistoryData] = useState<HistoryPoint[]>(
    // Initialise from module-level cache → zero loading flash on remount
    () => _historyModuleCache
  )
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [chartHover, setChartHover] = useState<number | null>(null) // kept for TS — unused after memo extraction

  // Persist view choice
  const handleSetCompositeView = (v: 'gauge' | 'chart') => {
    try {
      localStorage.setItem('compositeView', v)
    } catch { }
    setCompositeView(v)
  }

  // Fetch history — pre-fetches on mount (regardless of active tab) so switching
  // to CHART is instant. Silent background refresh if data already exists.
  const fetchHistory = useCallback((force = false) => {
    if (
      !force &&
      Date.now() - _historyCacheTs < CLIENT_HISTORY_TTL &&
      _historyModuleCache.length > 0
    )
      return
    // Only show loading spinner on the very first fetch (no existing data)
    if (_historyModuleCache.length === 0) setHistoryLoading(true)
    setHistoryError(null)
    fetch('/api/composite-history')
      .then((r) => r.json())
      .then((data) => {
        if (data.history && data.history.length > 0) {
          _historyModuleCache = data.history
          _historyCacheTs = Date.now()
          setHistoryData(data.history)
        } else if (_historyModuleCache.length === 0) {
          setHistoryError(data.error || 'No history data')
        }
      })
      .catch(() => {
        if (_historyModuleCache.length === 0) setHistoryError('Failed to load history')
      })
      .finally(() => setHistoryLoading(false))
  }, [])

  // Mount: immediate fetch + 30-min auto-refresh interval
  useEffect(() => {
    fetchHistory()
    const id = setInterval(() => fetchHistory(true), CLIENT_HISTORY_TTL)
    return () => clearInterval(id)
  }, [fetchHistory])

  useEffect(() => {
    const fetchVix = async () => {
      try {
        const res = await fetch(
          'https://api.polygon.io/v3/snapshot/options/I:VIX?limit=1&apikey=kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf'
        )
        const data = await res.json()
        if (data.status === 'OK' && data.results?.[0]?.underlying_asset?.value) {
          const price = data.results[0].underlying_asset.value
          setVixPrice(price)
        }
      } catch (_) { }
    }
    fetchVix()
    // Refresh VIX every 5 minutes
    const interval = setInterval(fetchVix, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!showSummary) return
    const a = regimeAnalysis[selectedTimeframe]
    if (!a) return

    const allSec = [...a.defensiveSectors, ...a.growthSectors, ...a.valueSectors]
    const sortedSec = [...allSec].sort((x, y) => y.change - x.change)
    const topETF = sortedSec[0]?.sector || ''
    const bottomETF = sortedSec[sortedSec.length - 1]?.sector || ''
    if (!topETF || !bottomETF) return

    const key = `${topETF}|${bottomETF}`
    if (lastPicksKey.current === key) return
    lastPicksKey.current = key

    setPicksLoading(true)
    const topHoldings = SECTOR_HOLDINGS[topETF] || []
    const bottomHoldings = topETF !== bottomETF ? SECTOR_HOLDINGS[bottomETF] || [] : []
    const allSyms = [...new Set([...topHoldings, ...bottomHoldings])]

    const prevYear = new Date().getFullYear() - 1
    const endDate = new Date().toISOString().split('T')[0]
    const startDate = `${prevYear}-12-01`

    Promise.all(
      allSyms.slice(0, 30).map(async (sym) => {
        try {
          const res = await fetch(
            `/api/historical-data?symbol=${encodeURIComponent(sym)}&startDate=${startDate}&endDate=${endDate}`
          )
          if (!res.ok) return null
          const data = await res.json()
          const bars: { c: number; t: number }[] = data.results || []
          if (bars.length < 6) return null
          const latest = bars[bars.length - 1].c
          const p1 = bars[bars.length - 2]?.c
          const p5 = bars[bars.length - 6]?.c
          const p13 = bars.length >= 14 ? bars[bars.length - 14]?.c : null
          const p21 = bars.length >= 22 ? bars[bars.length - 22]?.c : null
          const curYear = new Date().getFullYear()
          const ytdBar = [...bars].reverse().find((d) => new Date(d.t).getFullYear() < curYear)
          const ytdBase = ytdBar?.c || bars[0].c
          const c1d = p1 ? ((latest - p1) / p1) * 100 : 0
          const c5d = p5 ? ((latest - p5) / p5) * 100 : 0
          const c13d = p13 ? ((latest - p13) / p13) * 100 : 0
          const c21d = p21 ? ((latest - p21) / p21) * 100 : 0
          const cYTD = ytdBase ? ((latest - ytdBase) / ytdBase) * 100 : 0
          return { symbol: sym, c1d, c5d, c13d, c21d, cYTD }
        } catch {
          return null
        }
      })
    )
      .then((results) => {
        const valid = results.filter(Boolean) as {
          symbol: string
          c1d: number
          c5d: number
          c13d: number
          c21d: number
          cYTD: number
        }[]
        // LONG: 1D UP and 5D UP and at least one of (13D/21D/YTD) UP
        const longCandidates = valid
          .filter(
            (d) =>
              topHoldings.includes(d.symbol) &&
              d.c1d > 0 &&
              d.c5d > 0 &&
              (d.c13d > 0 || d.c21d > 0 || d.cYTD > 0)
          )
          .sort((a, b) => b.c1d + b.c5d - (a.c1d + a.c5d))
        // SHORT: 1D DOWN and 5D DOWN and at least one of (13D/21D/YTD) DOWN
        const shortCandidates = valid
          .filter(
            (d) =>
              bottomHoldings.includes(d.symbol) &&
              d.c1d < 0 &&
              d.c5d < 0 &&
              (d.c13d < 0 || d.c21d < 0 || d.cYTD < 0)
          )
          .sort((a, b) => a.c1d + a.c5d - (b.c1d + b.c5d))
        setLivePicks({
          long: longCandidates.slice(0, 3).map((d) => d.symbol),
          short: shortCandidates.slice(0, 3).map((d) => d.symbol),
        })
        setPicksLoading(false)
      })
      .catch(() => setPicksLoading(false))
  }, [showSummary, selectedTimeframe, regimeAnalysis])

  const analysis = regimeAnalysis[selectedTimeframe]

  if (!analysis || Object.keys(regimeAnalysis).length === 0) {
    return null
  }

  // Calculate weighted composite regime across all timeframes
  const timeframes = ['1d', '5d', '13d', '21d', '50d', 'ytd']
  // Timeframes sum to 0.95 — the remaining 0.05 is reserved for the VIX slot
  const weights = { '1d': 0.2, '5d': 0.2, '13d': 0.2, '21d': 0.15, '50d': 0.15, ytd: 0.05 } // Total = 0.95 (VIX gets 0.05)

  let compositeSpread = 0
  let compositeDefensiveAvg = 0
  let compositeGrowthAvg = 0
  let compositeConfidence = 0
  let totalWeight = 0

  timeframes.forEach((tf) => {
    const tfAnalysis = regimeAnalysis[tf]
    if (tfAnalysis) {
      const weight = weights[tf as keyof typeof weights]
      compositeSpread += tfAnalysis.defensiveGrowthSpread * weight
      compositeDefensiveAvg += tfAnalysis.defensiveAvg * weight
      compositeGrowthAvg += tfAnalysis.growthAvg * weight
      compositeConfidence += tfAnalysis.confidence * weight
      totalWeight += weight
    }
  })

  // Normalize by actual total weight (in case some timeframes are missing)
  if (totalWeight > 0) {
    compositeSpread /= totalWeight
    compositeDefensiveAvg /= totalWeight
    compositeGrowthAvg /= totalWeight
    compositeConfidence /= totalWeight
  }

  // === VIX ADJUSTMENT — composite gauge only, NOT the 6 individual timeframe gauges ===
  // Budget: sectors = 0.95, VIX slot = 0.05. Total always = 1.0.
  // After /= totalWeight above, compositeSpread is normalized to "per 1.0 equivalent".
  // Scale it back to its 95% share, then add VIX contribution for its 5% share.
  const VIX_SIGNAL_STRENGTH = 4.0 // same scale as spread (threshold for STRONG = 2.0)
  let vixActiveWeight = 0
  let vixSignal = 0
  let vixLabel = 'NEUTRAL (no VIX data)'

  if (vixPrice !== null) {
    if (vixPrice > 25) {
      vixActiveWeight = 0.05 // full 5% slot → defensive
      vixSignal = VIX_SIGNAL_STRENGTH
      vixLabel = `DEFENSIVE +5% (VIX ${vixPrice.toFixed(2)} > 25)`
    } else if (vixPrice > 21) {
      vixActiveWeight = 0.03 // 3% of the 5% slot → defensive
      vixSignal = VIX_SIGNAL_STRENGTH
      vixLabel = `DEFENSIVE +3% (VIX ${vixPrice.toFixed(2)} 21–25)`
    } else if (vixPrice < 14) {
      vixActiveWeight = 0.05 // full 5% slot → growth
      vixSignal = -VIX_SIGNAL_STRENGTH
      vixLabel = `GROWTH +5% (VIX ${vixPrice.toFixed(2)} < 14)`
    } else {
      // 14 <= VIX <= 21
      vixActiveWeight = 0.03 // 3% of the 5% slot → growth
      vixSignal = -VIX_SIGNAL_STRENGTH
      vixLabel = `GROWTH +3% (VIX ${vixPrice.toFixed(2)} 14–21)`
    }
  }

  const compositeSpreadBeforeVix = compositeSpread
  // Fixed budget blend: sectors occupy 0.95, VIX occupies up to 0.05, total = 1.0
  compositeSpread = compositeSpread * 0.95 + vixSignal * vixActiveWeight

  // Determine composite regime
  const getCompositeRegime = () => {
    if (Math.abs(compositeSpread) < 0.5) return 'NEUTRAL'
    if (compositeSpread > 2) return 'DEFENSIVE STRONG'
    if (compositeSpread > 0) return 'DEFENSIVE'
    if (compositeSpread < -2) return 'RISK ON STRONG'
    return 'RISK ON'
  }

  const compositeRegime = getCompositeRegime()
  const compositeColor =
    compositeSpread > 0 ? '#ef4444' : compositeSpread < 0 ? '#10b981' : '#fbbf24'
  const compositeStrength =
    Math.abs(compositeSpread) > 2
      ? 'EXTREME'
      : Math.abs(compositeSpread) > 1
        ? 'STRONG'
        : Math.abs(compositeSpread) > 0.5
          ? 'MODERATE'
          : 'WEAK'

  const {
    defensiveGrowthSpread,
    regime,
    confidence,
    spreadStrength,
    defensiveAvg,
    growthAvg,
    valueAvg,
  } = analysis

  // Determine color based on regime
  const getRegimeColor = () => {
    if (regime.includes('DEFENSIVE')) return '#ef4444'
    if (regime.includes('RISK ON')) return '#10b981'
    if (regime === 'VALUE') return '#fbbf24'
    if (regime === 'RISK OFF') return '#dc2626'
    return '#64748b'
  }

  const color = getRegimeColor()

  // Calculate normalized spread for visual bar width (0-50% range)
  const normalizedSpread = Math.min(Math.abs(compositeSpread) * 5, 50)

  // Calculate multi-timeframe alignment
  const alignmentScore = timeframes.reduce((score, tf) => {
    const tfAnalysis = regimeAnalysis[tf]
    if (!tfAnalysis) return score

    // Check if regime direction matches composite
    const compositeIsDefensive = compositeSpread > 0
    const tfIsDefensive = tfAnalysis.defensiveGrowthSpread > 0

    return score + (compositeIsDefensive === tfIsDefensive ? 1 : 0)
  }, 0)

  const alignmentPercentage = (alignmentScore / timeframes.length) * 100

  // Calculate velocity (rate of change between timeframes)
  const get5dAnalysis = regimeAnalysis['5d']
  const velocity = get5dAnalysis
    ? ((analysis.defensiveGrowthSpread - get5dAnalysis.defensiveGrowthSpread) / 5).toFixed(3)
    : '0.000'

  // Calculate sector breadth (how many sectors are positive)
  const allSectors = [
    ...analysis.defensiveSectors,
    ...analysis.growthSectors,
    ...analysis.valueSectors,
  ]
  const positiveSectors = allSectors.filter((s) => s.change > 0).length
  const breadthPercentage = (positiveSectors / allSectors.length) * 100

  // Gauge component for circular visualization
  const RegimeGauge = ({
    value,
    label,
    size = 120,
    thickness = 12,
    showValue = true,
    regime = '',
    labelOffset = -5,
  }: {
    value: number
    label: string
    size?: number
    thickness?: number
    showValue?: boolean
    regime?: string
    labelOffset?: number
  }) => {
    // Normalize value to -10 to +10 range, map to 0-100 for gauge
    // INVERTED: Positive spread = defensive (left), Negative spread = growth (right)
    const normalizedValue = Math.max(-10, Math.min(10, -value)) // Inverted with negative
    const gaugePercentage = ((normalizedValue + 10) / 20) * 100
    const rotation = (gaugePercentage / 100) * 180 - 90

    // Color based on ORIGINAL value (positive = defensive/red, negative = growth/green)
    const getColor = () => {
      if (value > 2) return '#ef4444' // Strong defensive
      if (value > 0.5) return '#ff6600' // Moderate defensive
      if (value > -0.5) return '#fbbf24' // Neutral
      if (value > -2) return '#10b981' // Moderate growth
      return '#10b981' // Strong growth
    }

    // Determine outline color based on regime
    const getOutlineColor = () => {
      return null // No outline
    }

    const color = getColor()
    const outlineColor = getOutlineColor()
    const radius = (size - thickness) / 2
    const circumference = Math.PI * radius
    const strokeDashoffset = circumference - (gaugePercentage / 100) * circumference

    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
        <div style={{ position: 'relative', width: size, height: size / 2 + 20 }}>
          {/* Background arc */}
          <svg width={size} height={size / 2 + 20} style={{ transform: 'rotate(0deg)' }}>
            {/* Outline ring for combined regimes */}
            {outlineColor && (
              <path
                d={`M ${thickness / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - thickness / 2} ${size / 2}`}
                fill="none"
                stroke={outlineColor}
                strokeWidth={thickness + 6}
                strokeLinecap="round"
                opacity={0.6}
              />
            )}
            <path
              d={`M ${thickness / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - thickness / 2} ${size / 2}`}
              fill="none"
              stroke="#1a1a1a"
              strokeWidth={thickness}
              strokeLinecap="round"
            />
            {/* Colored arc */}
            <path
              d={`M ${thickness / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - thickness / 2} ${size / 2}`}
              fill="none"
              stroke={color}
              strokeWidth={thickness}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              style={{ transition: 'stroke-dashoffset 0.5s ease' }}
            />
          </svg>

          {/* Center labels */}
          <div
            style={{
              position: 'absolute',
              top: '45%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontSize: size > 100 ? '11px' : '9px',
                color: '#ffffff',
                fontWeight: '700',
                fontFamily: 'monospace',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                marginTop: '2px',
              }}
            >
              {label}
            </div>
          </div>

          {/* Needle indicator */}
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: '50%',
              width: '2px',
              height: radius - 10,
              background: '#ff6600',
              transformOrigin: 'bottom center',
              transform: `translateX(-50%) rotate(${rotation}deg)`,
              transition: 'transform 0.5s ease',
              boxShadow: `0 0 8px ${color}80`,
            }}
          />

          {/* Labels */}
          <div
            style={{
              position: 'absolute',
              bottom: labelOffset,
              left: -10,
              fontSize: '14px',
              color: '#ef4444',
              fontWeight: '900',
              fontFamily: 'monospace',
            }}
          >
            DEFENSIVE
          </div>
          <div
            style={{
              position: 'absolute',
              bottom: labelOffset,
              right: -10,
              fontSize: '14px',
              color: '#22c55e',
              fontWeight: '900',
              fontFamily: 'monospace',
            }}
          >
            GROWTH
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="enhanced-regime-display"
      style={{
        position: 'relative',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: '#000000',
        borderRadius: '2px',
        border: '2px solid #333333',
        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 2px 4px rgba(0, 0, 0, 0.8)',
      }}
    >
      {/* Toggle Summary Button */}
      <button
        onClick={() => toggleSummary()}
        style={{
          position: 'absolute',
          top: '8px',
          right: '8px',
          padding: '8px 16px',
          background: '#000000',
          border: '2px solid #ff6600',
          borderRadius: '2px',
          color: '#ff6600',
          fontSize: '12px',
          fontWeight: '900',
          fontFamily: 'monospace',
          cursor: 'pointer',
          boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 2px 4px rgba(0, 0, 0, 0.8)',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          zIndex: 10,
        }}
      >
        {showSummary ? 'HIDE SUMMARY' : 'SHOW SUMMARY'}
      </button>

      {/* MAIN COMPOSITE GAUGE - Large Central Display */}
      <div
        style={{
          overflow: window.innerWidth < 768 ? 'hidden' : 'visible',
          height: window.innerWidth < 768 ? '200px' : 'auto',
        }}
      >
        <div
          className="md:scale-100 scale-[0.41]"
          style={{
            display: 'grid',
            gridTemplateColumns: compositeView === 'chart' ? '1fr' : '300px 1fr',
            gap: '20px',
            padding: '20px',
            background: '#000000',
            border: `3px solid #ffffff`,
            borderRadius: '2px',
            boxShadow: `inset 0 2px 0 rgba(255, 255, 255, 0.15), 0 4px 8px rgba(0, 0, 0, 0.9), 0 0 30px ${compositeColor}30`,
            alignItems: 'center',
            transformOrigin: 'top left',
          }}
        >
          {/* Left: Large Gauge / History Chart */}
          <div
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}
          >
            {/* Header row: COMPOSITE label + GAUGE|CHART toggle */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                width: '100%',
                justifyContent: 'center',
              }}
            >
              <div
                style={{
                  fontSize: '16px',
                  color: '#ff6600',
                  fontWeight: '900',
                  fontFamily: 'monospace',
                  letterSpacing: '0.3em',
                  textTransform: 'uppercase',
                }}
              >
                COMPOSITE
              </div>
              {/* View toggle */}
              <div
                style={{
                  display: 'flex',
                  border: '1px solid #ff660060',
                  borderRadius: '2px',
                  overflow: 'hidden',
                }}
              >
                {(['gauge', 'chart'] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => handleSetCompositeView(v)}
                    style={{
                      padding: '3px 10px',
                      fontSize: '10px',
                      fontFamily: 'monospace',
                      fontWeight: '900',
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                      cursor: 'pointer',
                      border: 'none',
                      background: compositeView === v ? '#ff6600' : '#000',
                      color: compositeView === v ? '#000' : '#ff6600',
                      transition: 'all 0.2s',
                    }}
                  >
                    {v === 'gauge' ? 'GAUGE' : 'CHART'}
                  </button>
                ))}
              </div>
            </div>

            {compositeView === 'gauge' ? (
              <>
                <RegimeGauge
                  value={compositeSpread}
                  label=""
                  size={276}
                  thickness={26}
                  regime={compositeRegime}
                  showValue={false}
                  labelOffset={-15}
                />

                <div
                  style={{
                    padding: '10px 20px',
                    background: '#000000',
                    border: `2px solid ${compositeColor}`,
                    borderRadius: '2px',
                    boxShadow: `inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 0 15px ${compositeColor}50`,
                    textAlign: 'center',
                    marginTop: '20px',
                  }}
                >
                  <div
                    style={{
                      fontSize: '19px',
                      fontWeight: '900',
                      color: compositeColor,
                      fontFamily: 'monospace',
                      letterSpacing: '0.05em',
                      textShadow: `0 0 10px ${compositeColor}70`,
                    }}
                  >
                    {compositeRegime}
                  </div>
                  <div
                    style={{
                      fontSize: '13px',
                      color: '#ff6600',
                      fontWeight: '800',
                      fontFamily: 'monospace',
                      marginTop: '4px',
                      letterSpacing: '0.15em',
                    }}
                  >
                    {compositeStrength} • {Math.round(compositeConfidence)}%
                  </div>
                </div>
              </>
            ) : (
              /* ── History Chart ─── — isolated memo component, hover state can't bleed up */
              <CompositeHistoryChart
                historyData={historyData}
                compositeRegime={compositeRegime}
                compositeStrength={compositeStrength}
                compositeConfidence={compositeConfidence}
                compositeColor={compositeColor}
                historyLoading={historyLoading}
                historyError={historyError}
                tfRange={tfRange}
                setTfRange={handleSetTfRange}
              />
            )}
          </div>

          {/* Right: Timeframe Gauges — hidden in chart mode */}
          {compositeView === 'gauge' && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '12px',
              }}
            >
              {timeframes.map((tf) => {
                const tfAnalysis = regimeAnalysis[tf]
                if (!tfAnalysis) return null

                const isSelected = tf === selectedTimeframe
                const tfSpread = tfAnalysis.defensiveGrowthSpread

                return (
                  <div
                    key={tf}
                    onClick={() => setSelectedTimeframe(tf)}
                    style={{
                      padding: '12px 8px',
                      background: '#000000',
                      border: isSelected ? `2px solid #ff6600` : '2px solid #333333',
                      borderRadius: '2px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      boxShadow: isSelected ? `0 0 15px #ff660040` : 'none',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '14px',
                        color: '#ff6600',
                        fontWeight: '900',
                        fontFamily: 'monospace',
                        textAlign: 'center',
                        marginBottom: '8px',
                        letterSpacing: '0.1em',
                      }}
                    >
                      {tf === '1d'
                        ? 'TODAY'
                        : tf === '5d'
                          ? 'WEEK'
                          : tf === '21d'
                            ? 'MONTH'
                            : tf === '50d'
                              ? 'QUARTER'
                              : tf.toUpperCase()}
                    </div>
                    <RegimeGauge
                      value={tfSpread}
                      label=""
                      size={168}
                      thickness={16}
                      showValue={true}
                      regime={tfAnalysis.regime}
                    />
                    <div
                      style={{
                        fontSize: '12px',
                        color: '#ffffff',
                        fontFamily: 'monospace',
                        textAlign: 'center',
                        marginTop: '6px',
                        marginBottom: '10px',
                      }}
                    >
                      {tfAnalysis.regime}
                    </div>

                    {/* VALUE vs RISK ON Rectangle Gauge */}
                    {(() => {
                      const xleData = watchlistData?.['XLE']
                      const xlbData = watchlistData?.['XLB']
                      const xliData = watchlistData?.['XLI']
                      const xlfData = watchlistData?.['XLF']

                      const periodKey =
                        tf === '1d'
                          ? 'change1d'
                          : tf === '5d'
                            ? 'change5d'
                            : tf === '13d'
                              ? 'change13d'
                              : tf === '21d'
                                ? 'change21d'
                                : tf === '50d'
                                  ? 'change50d'
                                  : 'changeYTD'

                      const valueScore =
                        ((xleData?.[periodKey] || 0) + (xlbData?.[periodKey] || 0)) / 2
                      const riskOnScore =
                        ((xliData?.[periodKey] || 0) + (xlfData?.[periodKey] || 0)) / 2
                      const netScore = riskOnScore - valueScore
                      const fillPercent = Math.min(Math.abs(netScore) * 10, 50)

                      return (
                        <div style={{ width: '100%', padding: '0 8px' }}>
                          <div
                            style={{
                              position: 'relative',
                              height: '12px',
                              background: '#1a1a1a',
                              borderRadius: '3px',
                              overflow: 'hidden',
                            }}
                          >
                            <div
                              style={{
                                position: 'absolute',
                                left: '50%',
                                top: 0,
                                bottom: 0,
                                width: '1px',
                                background: '#555',
                                zIndex: 10,
                              }}
                            ></div>
                            {netScore < 0 && (
                              <div
                                style={{
                                  position: 'absolute',
                                  top: 0,
                                  bottom: 0,
                                  right: '50%',
                                  width: `${fillPercent}%`,
                                  background: '#3b82f6',
                                  transition: 'width 0.3s',
                                }}
                              ></div>
                            )}
                            {netScore > 0 && (
                              <div
                                style={{
                                  position: 'absolute',
                                  top: 0,
                                  bottom: 0,
                                  left: '50%',
                                  width: `${fillPercent}%`,
                                  background: '#10b981',
                                  transition: 'width 0.3s',
                                }}
                              ></div>
                            )}
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* SUMMARY PANEL - Dynamically generated */}
      {showSummary &&
        (() => {
          // Sector display names
          const sectorNames: Record<string, string> = {
            XLP: 'consumer staples',
            XLU: 'utilities',
            XLRE: 'real estate',
            XLV: 'healthcare',
            XLK: 'technology',
            XLC: 'communications',
            XLY: 'consumer discretionary',
            XLF: 'financials',
            XLE: 'energy',
            XLI: 'industrials',
            XLB: 'materials',
          }
          const allSectorData = [
            ...analysis.defensiveSectors,
            ...analysis.growthSectors,
            ...analysis.valueSectors,
          ]
          const sorted = [...allSectorData].sort((a, b) => b.change - a.change)
          const topSector = sorted[0]
          const topSector2 = sorted[1]
          const bottomSector = sorted[sorted.length - 1]
          const bottomSector2 = sorted[sorted.length - 2]

          const topName = sectorNames[topSector?.sector] || topSector?.sector || ''
          const topName2 = sectorNames[topSector2?.sector] || topSector2?.sector || ''
          const bottomName = sectorNames[bottomSector?.sector] || bottomSector?.sector || ''
          const bottomName2 = sectorNames[bottomSector2?.sector] || bottomSector2?.sector || ''

          const topETF = topSector?.sector || ''
          const bottomETF = bottomSector?.sector || ''
          // Use live picks filtered by 1D+5D direction + at least one of 13D/21D/YTD
          const topPicks = picksLoading ? [] : livePicks.long
          const shortPickList = picksLoading ? [] : livePicks.short

          const isDefensive = compositeSpread > 0
          const isNeutral = Math.abs(compositeSpread) < 0.5

          const regimeText = isNeutral
            ? 'neutral'
            : compositeRegime === 'DEFENSIVE STRONG'
              ? 'strongly defensive'
              : compositeRegime === 'DEFENSIVE'
                ? 'leaning defensive'
                : compositeRegime === 'RISK ON STRONG'
                  ? 'strong risk-on'
                  : compositeRegime === 'RISK ON'
                    ? 'risk-on'
                    : compositeRegime.toLowerCase()

          const confidenceText =
            compositeConfidence > 80
              ? 'high conviction'
              : compositeConfidence > 60
                ? 'moderate conviction'
                : 'low conviction — expect chop'

          const alignText =
            alignmentPercentage >= 80
              ? 'strongly aligned across all timeframes'
              : alignmentPercentage >= 60
                ? 'showing moderate consistency across timeframes'
                : 'mixed signals across timeframes — stay disciplined'

          const breadthText =
            breadthPercentage >= 70
              ? 'broad market participation'
              : breadthPercentage >= 50
                ? 'mixed breadth'
                : breadthPercentage >= 30
                  ? 'narrow leadership — most sectors under pressure'
                  : 'extremely narrow — very few sectors holding up'

          let observation = `The composite is ${regimeText} at ${compositeStrength.toLowerCase()} strength, ${Math.round(compositeConfidence)}% confidence — ${confidenceText}. `

          if (topSector && topSector2) {
            observation += `${topName.charAt(0).toUpperCase() + topName.slice(1)} and ${topName2} are the standouts, outperforming the tape${topSector.change > 1.5 ? ' with real momentum behind them' : ''}. `
          }
          if (bottomSector && bottomSector2) {
            observation += `${bottomName.charAt(0).toUpperCase() + bottomName.slice(1)} and ${bottomName2} are dragging${bottomSector.change < -1.5 ? ' — notable selling pressure on both' : ''}. `
          }
          observation += `Timeframe alignment is ${alignText}, with ${breadthText}.`

          const longLabel = picksLoading
            ? 'scanning holdings...'
            : topPicks.length > 0
              ? topPicks.join(', ')
              : 'no names meeting criteria yet'
          const shortLabel = picksLoading
            ? 'scanning holdings...'
            : shortPickList.length > 0
              ? shortPickList.join(', ')
              : 'no names meeting criteria yet'

          let forecast = ''
          if (!isNeutral) {
            if (isDefensive) {
              forecast = `Defensive positioning ${compositeStrength === 'EXTREME' ? 'is at extreme levels — this rarely reverses quickly' : 'is holding firm and the odds favour continuation'}. `
              if (topETF) {
                forecast += `The cleanest bullish setup is ${topName} (${topETF}) — ${longLabel} are the names to buy dips on and ride for continuation. `
              }
              if (bottomETF) {
                forecast += `Short side: ${bottomName} (${bottomETF}) remains the weakest link — ${shortLabel} for puts or short exposure.`
              }
            } else {
              forecast = `Risk-on conditions are ${compositeStrength === 'EXTREME' ? 'ripping — chase momentum but watch for exhaustion' : 'building — the trend is your friend here'}. `
              if (topETF) {
                forecast += `${topName.charAt(0).toUpperCase() + topName.slice(1)} (${topETF}) is leading the move — own ${longLabel} for upside. `
              }
              if (bottomETF) {
                forecast += `Fade the defensive laggards: ${bottomETF} is the cleanest short — ${shortLabel} if you want the other side.`
              }
            }
          } else {
            forecast = `No clean directional edge right now — composite is neutral and breadth is mixed. Wait for the next rotation signal before committing size. `
            if (topETF) {
              forecast += `If you must trade, ${topName} (${topETF}) has the best relative strength right now — ${longLabel} for controlled, smaller plays.`
            }
          }

          return (
            <div
              style={{
                background: 'linear-gradient(135deg, #000000 0%, #0a0a0a 100%)',
                border: `2px solid ${compositeColor}50`,
                borderRadius: '2px',
                padding: '20px',
                boxShadow: `0 8px 32px ${compositeColor}20, inset 0 1px 0 rgba(255,255,255,0.05)`,
              }}
            >
              <div
                style={{
                  fontSize: '14px',
                  color: '#ff6600',
                  fontWeight: '900',
                  fontFamily: 'monospace',
                  letterSpacing: '0.2em',
                  textTransform: 'uppercase',
                  marginBottom: '14px',
                  textAlign: 'center',
                  borderBottom: '1px solid #ff660040',
                  paddingBottom: '10px',
                }}
              >
                MARKET SUMMARY
              </div>

              {/* Observation */}
              <div
                style={{
                  marginBottom: '16px',
                  padding: '14px',
                  background: '#050505',
                  border: '1px solid #222',
                  borderRadius: '2px',
                }}
              >
                <div
                  style={{
                    fontSize: '13px',
                    color: '#ff6600',
                    fontWeight: '900',
                    fontFamily: 'monospace',
                    letterSpacing: '0.15em',
                    marginBottom: '8px',
                  }}
                >
                  CURRENT READ
                </div>
                <div
                  style={{
                    fontSize: '16px',
                    color: '#ffffff',
                    fontFamily: 'monospace',
                    lineHeight: '1.75',
                    fontWeight: '600',
                  }}
                >
                  {observation}
                </div>
              </div>

              {/* Forecast */}
              <div
                style={{
                  padding: '14px',
                  background: '#050505',
                  border: `1px solid ${compositeColor}40`,
                  borderRadius: '2px',
                }}
              >
                <div
                  style={{
                    fontSize: '13px',
                    color: compositeColor,
                    fontWeight: '900',
                    fontFamily: 'monospace',
                    letterSpacing: '0.15em',
                    marginBottom: '8px',
                  }}
                >
                  FORECAST & TRADES
                </div>
                <div
                  style={{
                    fontSize: '16px',
                    color: '#ffffff',
                    fontFamily: 'monospace',
                    lineHeight: '1.75',
                    fontWeight: '600',
                  }}
                >
                  {forecast}
                </div>
              </div>

              {/* Quick stats row */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '8px',
                  marginTop: '14px',
                }}
              >
                {[
                  {
                    label: 'BREADTH',
                    value: `${Math.round(breadthPercentage)}%`,
                    color: breadthPercentage >= 50 ? '#10b981' : '#ef4444',
                  },
                  {
                    label: 'TF SYNC',
                    value: `${Math.round(alignmentPercentage)}%`,
                    color: alignmentPercentage >= 70 ? '#10b981' : '#fbbf24',
                  },
                  {
                    label: 'CONFIDENCE',
                    value: `${Math.round(compositeConfidence)}%`,
                    color: compositeColor,
                  },
                  {
                    label: 'VELOCITY',
                    value: `${parseFloat(velocity) >= 0 ? '+' : ''}${velocity}%`,
                    color: parseFloat(velocity) > 0 ? '#ef4444' : '#10b981',
                  },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    style={{
                      padding: '8px',
                      background: '#000',
                      border: '1px solid #222',
                      borderRadius: '2px',
                      textAlign: 'center',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '12px',
                        color: '#ffffff',
                        fontFamily: 'monospace',
                        fontWeight: '700',
                        marginBottom: '6px',
                        letterSpacing: '0.1em',
                      }}
                    >
                      {stat.label}
                    </div>
                    <div
                      style={{
                        fontSize: '18px',
                        fontWeight: '900',
                        color: stat.color,
                        fontFamily: 'monospace',
                      }}
                    >
                      {stat.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })()}
      {false && (
        <div>
          {/* Sector Breakdown with Holdings */}
          <div>
            <div
              style={{
                fontSize: '13px',
                fontWeight: '900',
                color: '#ff6600',
                marginBottom: '16px',
                textTransform: 'uppercase',
                letterSpacing: '0.2em',
                fontFamily: 'monospace',
                textAlign: 'center',
              }}
            >
              SECTOR PERFORMANCE & HOLDINGS
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
              {/* Defensive Sectors */}
              <div>
                <div
                  style={{
                    fontSize: '9px',
                    color: '#ef4444',
                    fontWeight: '900',
                    marginBottom: '10px',
                    fontFamily: 'monospace',
                    letterSpacing: '0.15em',
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '8px 10px',
                    background: '#000000',
                    border: '2px solid #ef4444',
                    borderRadius: '2px',
                    boxShadow:
                      'inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 2px 4px rgba(0, 0, 0, 0.8)',
                  }}
                >
                  <span>DEFENSIVE</span>
                  <span>{defensiveAvg.toFixed(2)}%</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {analysis.defensiveSectors.map((s) => {
                    // Mock top holdings data - in production, this would come from API
                    const mockHoldings = {
                      XLP: [
                        { symbol: 'PG', name: 'Procter & Gamble', weight: 8.5, change: 1.2 },
                        { symbol: 'KO', name: 'Coca-Cola', weight: 7.2, change: -0.8 },
                        { symbol: 'WMT', name: 'Walmart', weight: 6.8, change: 0.5 },
                      ],
                      XLU: [
                        { symbol: 'NEE', name: 'NextEra Energy', weight: 10.2, change: -1.1 },
                        { symbol: 'DUK', name: 'Duke Energy', weight: 6.5, change: 0.3 },
                        { symbol: 'SO', name: 'Southern Co', weight: 5.9, change: -0.5 },
                      ],
                      XLRE: [
                        { symbol: 'PLD', name: 'Prologis', weight: 9.8, change: -2.1 },
                        { symbol: 'AMT', name: 'American Tower', weight: 8.1, change: -1.5 },
                        { symbol: 'EQIX', name: 'Equinix', weight: 6.7, change: -0.9 },
                      ],
                      XLV: [
                        { symbol: 'UNH', name: 'UnitedHealth', weight: 11.2, change: 0.8 },
                        { symbol: 'JNJ', name: 'Johnson & Johnson', weight: 8.9, change: -0.2 },
                        { symbol: 'LLY', name: 'Eli Lilly', weight: 7.5, change: 1.5 },
                      ],
                    }

                    const holdings = mockHoldings[s.sector as keyof typeof mockHoldings] || []
                    const isExpanded = expandedSectors.includes(s.sector)

                    return (
                      <div key={s.sector}>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontSize: '12px',
                            fontFamily: 'monospace',
                            padding: '8px 10px',
                            background: '#000000',
                            border: `2px solid ${s.change > 0 ? '#10b981' : '#ef4444'}`,
                            borderRadius: '2px',
                            boxShadow:
                              'inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 2px 4px rgba(0, 0, 0, 0.8)',
                            cursor: 'pointer',
                          }}
                          onClick={() =>
                            setExpandedSectors((prev) =>
                              prev.includes(s.sector)
                                ? prev.filter((x) => x !== s.sector)
                                : [...prev, s.sector]
                            )
                          }
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ color: '#ff6600', fontSize: '10px' }}>
                              {isExpanded ? '▼' : '►'}
                            </span>
                            <span style={{ color: '#ffffff', fontWeight: '800', opacity: 1.0 }}>
                              {s.sector}
                            </span>
                          </div>
                          <div
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'flex-end',
                              gap: '3px',
                            }}
                          >
                            <span
                              style={{
                                color: s.change >= 0 ? '#10b981' : '#ef4444',
                                fontWeight: '900',
                                fontSize: '9px',
                                opacity: 1.0,
                              }}
                            >
                              {s.change >= 0 ? '+' : ''}
                              {s.change.toFixed(2)}%
                            </span>
                            <span
                              style={{
                                fontSize: '9px',
                                color: '#ff6600',
                                opacity: 1.0,
                                fontWeight: '700',
                              }}
                            >
                              vs SPY: {s.relativeToSPY >= 0 ? '+' : ''}
                              {s.relativeToSPY.toFixed(2)}%
                            </span>
                          </div>
                        </div>

                        {/* Holdings Breakdown */}
                        {isExpanded && holdings.length > 0 && (
                          <div
                            style={{
                              marginTop: '4px',
                              marginLeft: '10px',
                              padding: '8px',
                              background: '#0a0a0a',
                              border: '1px solid #333333',
                              borderRadius: '2px',
                            }}
                          >
                            <div
                              style={{
                                fontSize: '10px',
                                color: '#ff6600',
                                fontWeight: '800',
                                marginBottom: '6px',
                                fontFamily: 'monospace',
                              }}
                            >
                              TOP HOLDINGS
                            </div>
                            {holdings.map((h) => (
                              <div
                                key={h.symbol}
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  padding: '4px 6px',
                                  marginBottom: '2px',
                                  background: '#000000',
                                  border: `1px solid ${h.change >= 0 ? '#10b981' : '#ef4444'}`,
                                  borderRadius: '2px',
                                }}
                              >
                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                  <span
                                    style={{ fontSize: '9px', color: '#ffffff', fontWeight: '800' }}
                                  >
                                    {h.symbol}
                                  </span>
                                  <span style={{ fontSize: '9px', color: '#ffffff' }}>
                                    ({h.weight.toFixed(1)}%)
                                  </span>
                                </div>
                                <span
                                  style={{
                                    fontSize: '9px',
                                    color: h.change >= 0 ? '#10b981' : '#ef4444',
                                    fontWeight: '800',
                                  }}
                                >
                                  {h.change >= 0 ? '+' : ''}
                                  {h.change.toFixed(2)}%
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Growth Sectors */}
              <div>
                <div
                  style={{
                    fontSize: '9px',
                    color: '#10b981',
                    fontWeight: '900',
                    marginBottom: '10px',
                    fontFamily: 'monospace',
                    letterSpacing: '0.15em',
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '8px 10px',
                    background: '#000000',
                    border: '2px solid #10b981',
                    borderRadius: '2px',
                    boxShadow:
                      'inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 2px 4px rgba(0, 0, 0, 0.8)',
                  }}
                >
                  <span>GROWTH</span>
                  <span>{growthAvg.toFixed(2)}%</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {analysis.growthSectors.map((s) => {
                    // Mock top holdings data - in production, this would come from API
                    const mockHoldings = {
                      XLY: [
                        { symbol: 'AMZN', name: 'Amazon', weight: 22.5, change: 2.3 },
                        { symbol: 'TSLA', name: 'Tesla', weight: 15.1, change: -1.8 },
                        { symbol: 'HD', name: 'Home Depot', weight: 9.7, change: 0.6 },
                      ],
                      XLK: [
                        { symbol: 'AAPL', name: 'Apple', weight: 21.8, change: 1.5 },
                        { symbol: 'MSFT', name: 'Microsoft', weight: 20.5, change: 0.9 },
                        { symbol: 'NVDA', name: 'Nvidia', weight: 8.2, change: 3.2 },
                      ],
                      XLC: [
                        { symbol: 'META', name: 'Meta', weight: 22.1, change: 2.1 },
                        { symbol: 'GOOGL', name: 'Alphabet A', weight: 13.4, change: 1.2 },
                        { symbol: 'GOOG', name: 'Alphabet C', weight: 11.8, change: 1.1 },
                      ],
                    }

                    const holdings = mockHoldings[s.sector as keyof typeof mockHoldings] || []
                    const isExpanded = expandedSectors.includes(s.sector)

                    return (
                      <div key={s.sector}>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontSize: '12px',
                            fontFamily: 'monospace',
                            padding: '8px 10px',
                            background: '#000000',
                            border: `2px solid ${s.change > 0 ? '#10b981' : '#ef4444'}`,
                            borderRadius: '2px',
                            boxShadow:
                              'inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 2px 4px rgba(0, 0, 0, 0.8)',
                            cursor: 'pointer',
                          }}
                          onClick={() =>
                            setExpandedSectors((prev) =>
                              prev.includes(s.sector)
                                ? prev.filter((x) => x !== s.sector)
                                : [...prev, s.sector]
                            )
                          }
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ color: '#ff6600', fontSize: '10px' }}>
                              {isExpanded ? '▼' : '►'}
                            </span>
                            <span style={{ color: '#ffffff', fontWeight: '800', opacity: 1.0 }}>
                              {s.sector}
                            </span>
                          </div>
                          <div
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'flex-end',
                              gap: '3px',
                            }}
                          >
                            <span
                              style={{
                                color: s.change >= 0 ? '#10b981' : '#ef4444',
                                fontWeight: '900',
                                fontSize: '9px',
                                opacity: 1.0,
                              }}
                            >
                              {s.change >= 0 ? '+' : ''}
                              {s.change.toFixed(2)}%
                            </span>
                            <span
                              style={{
                                fontSize: '9px',
                                color: '#ff6600',
                                opacity: 1.0,
                                fontWeight: '700',
                              }}
                            >
                              vs SPY: {s.relativeToSPY >= 0 ? '+' : ''}
                              {s.relativeToSPY.toFixed(2)}%
                            </span>
                          </div>
                        </div>

                        {/* Holdings Breakdown */}
                        {isExpanded && holdings.length > 0 && (
                          <div
                            style={{
                              marginTop: '4px',
                              marginLeft: '10px',
                              padding: '8px',
                              background: '#0a0a0a',
                              border: '1px solid #333333',
                              borderRadius: '2px',
                            }}
                          >
                            <div
                              style={{
                                fontSize: '10px',
                                color: '#ff6600',
                                fontWeight: '800',
                                marginBottom: '6px',
                                fontFamily: 'monospace',
                              }}
                            >
                              TOP HOLDINGS
                            </div>
                            {holdings.map((h) => (
                              <div
                                key={h.symbol}
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  padding: '4px 6px',
                                  marginBottom: '2px',
                                  background: '#000000',
                                  border: `1px solid ${h.change >= 0 ? '#10b981' : '#ef4444'}`,
                                  borderRadius: '2px',
                                }}
                              >
                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                  <span
                                    style={{ fontSize: '9px', color: '#ffffff', fontWeight: '800' }}
                                  >
                                    {h.symbol}
                                  </span>
                                  <span style={{ fontSize: '9px', color: '#ffffff' }}>
                                    ({h.weight.toFixed(1)}%)
                                  </span>
                                </div>
                                <span
                                  style={{
                                    fontSize: '9px',
                                    color: h.change >= 0 ? '#10b981' : '#ef4444',
                                    fontWeight: '800',
                                  }}
                                >
                                  {h.change >= 0 ? '+' : ''}
                                  {h.change.toFixed(2)}%
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Value Sectors */}
              <div>
                <div
                  style={{
                    fontSize: '9px',
                    color: '#ff6600',
                    fontWeight: '900',
                    marginBottom: '10px',
                    fontFamily: 'monospace',
                    letterSpacing: '0.15em',
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '8px 10px',
                    background: '#000000',
                    border: '2px solid #ff6600',
                    borderRadius: '2px',
                    boxShadow:
                      'inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 2px 4px rgba(0, 0, 0, 0.8)',
                  }}
                >
                  <span>VALUE</span>
                  <span>{valueAvg.toFixed(2)}%</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {analysis.valueSectors.map((s) => {
                    // Mock top holdings data - in production, this would come from API
                    const mockHoldings = {
                      XLB: [
                        { symbol: 'LIN', name: 'Linde', weight: 16.8, change: 0.7 },
                        { symbol: 'APD', name: 'Air Products', weight: 7.2, change: -0.3 },
                        { symbol: 'SHW', name: 'Sherwin-Williams', weight: 6.9, change: 1.1 },
                      ],
                      XLI: [
                        { symbol: 'UPS', name: 'UPS', weight: 5.8, change: -1.2 },
                        { symbol: 'BA', name: 'Boeing', weight: 5.5, change: 2.8 },
                        { symbol: 'HON', name: 'Honeywell', weight: 5.2, change: 0.4 },
                      ],
                      XLF: [
                        { symbol: 'BRK.B', name: 'Berkshire Hathaway', weight: 13.2, change: 0.9 },
                        { symbol: 'JPM', name: 'JP Morgan', weight: 10.8, change: 1.3 },
                        { symbol: 'V', name: 'Visa', weight: 7.5, change: 0.5 },
                      ],
                      XLE: [
                        { symbol: 'XOM', name: 'Exxon Mobil', weight: 22.1, change: -2.5 },
                        { symbol: 'CVX', name: 'Chevron', weight: 14.5, change: -1.8 },
                        { symbol: 'COP', name: 'ConocoPhillips', weight: 6.8, change: -3.1 },
                      ],
                    }

                    const holdings = mockHoldings[s.sector as keyof typeof mockHoldings] || []
                    const isExpanded = expandedSectors.includes(s.sector)

                    return (
                      <div key={s.sector}>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontSize: '12px',
                            fontFamily: 'monospace',
                            padding: '8px 10px',
                            background: '#000000',
                            border: `2px solid ${s.change > 0 ? '#10b981' : '#ef4444'}`,
                            borderRadius: '2px',
                            boxShadow:
                              'inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 2px 4px rgba(0, 0, 0, 0.8)',
                            cursor: 'pointer',
                          }}
                          onClick={() =>
                            setExpandedSectors((prev) =>
                              prev.includes(s.sector)
                                ? prev.filter((x) => x !== s.sector)
                                : [...prev, s.sector]
                            )
                          }
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ color: '#ff6600', fontSize: '10px' }}>
                              {isExpanded ? '▼' : '►'}
                            </span>
                            <span style={{ color: '#ffffff', fontWeight: '800', opacity: 1.0 }}>
                              {s.sector}
                            </span>
                          </div>
                          <div
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'flex-end',
                              gap: '3px',
                            }}
                          >
                            <span
                              style={{
                                color: s.change >= 0 ? '#10b981' : '#ef4444',
                                fontWeight: '900',
                                fontSize: '9px',
                                opacity: 1.0,
                              }}
                            >
                              {s.change >= 0 ? '+' : ''}
                              {s.change.toFixed(2)}%
                            </span>
                            <span
                              style={{
                                fontSize: '9px',
                                color: '#ff6600',
                                opacity: 1.0,
                                fontWeight: '700',
                              }}
                            >
                              vs SPY: {s.relativeToSPY >= 0 ? '+' : ''}
                              {s.relativeToSPY.toFixed(2)}%
                            </span>
                          </div>
                        </div>

                        {/* Holdings Breakdown */}
                        {isExpanded && holdings.length > 0 && (
                          <div
                            style={{
                              marginTop: '4px',
                              marginLeft: '10px',
                              padding: '8px',
                              background: '#0a0a0a',
                              border: '1px solid #333333',
                              borderRadius: '2px',
                            }}
                          >
                            <div
                              style={{
                                fontSize: '10px',
                                color: '#ff6600',
                                fontWeight: '800',
                                marginBottom: '6px',
                                fontFamily: 'monospace',
                              }}
                            >
                              TOP HOLDINGS
                            </div>
                            {holdings.map((h) => (
                              <div
                                key={h.symbol}
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  padding: '4px 6px',
                                  marginBottom: '2px',
                                  background: '#000000',
                                  border: `1px solid ${h.change >= 0 ? '#10b981' : '#ef4444'}`,
                                  borderRadius: '2px',
                                }}
                              >
                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                  <span
                                    style={{ fontSize: '9px', color: '#ffffff', fontWeight: '800' }}
                                  >
                                    {h.symbol}
                                  </span>
                                  <span style={{ fontSize: '9px', color: '#ffffff' }}>
                                    ({h.weight.toFixed(1)}%)
                                  </span>
                                </div>
                                <span
                                  style={{
                                    fontSize: '9px',
                                    color: h.change >= 0 ? '#10b981' : '#ef4444',
                                    fontWeight: '800',
                                  }}
                                >
                                  {h.change >= 0 ? '+' : ''}
                                  {h.change.toFixed(2)}%
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Advanced Metrics */}
          <div
            style={{
              borderTop: '1px solid rgba(255, 255, 255, 0.1)',
              paddingTop: '16px',
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '12px',
            }}
          >
            <div
              style={{
                padding: '12px',
                background: 'rgba(255, 255, 255, 0.03)',
                borderRadius: '6px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
              }}
            >
              <div
                style={{
                  fontSize: '9px',
                  color: '#ffffff',
                  fontWeight: '700',
                  marginBottom: '6px',
                  fontFamily: 'monospace',
                }}
              >
                SPREAD VELOCITY
              </div>
              <div
                style={{
                  fontSize: '16px',
                  fontWeight: '900',
                  color: parseFloat(velocity) > 0 ? '#10b981' : '#ef4444',
                  fontFamily: 'monospace',
                }}
              >
                {parseFloat(velocity) >= 0 ? '+' : ''}
                {velocity}%/day
              </div>
              <div
                style={{
                  fontSize: '9px',
                  color: '#ffffff',
                  opacity: 0.6,
                  marginTop: '4px',
                  fontFamily: 'monospace',
                }}
              >
                {parseFloat(velocity) > 0
                  ? 'Strengthening'
                  : parseFloat(velocity) < 0
                    ? 'Weakening'
                    : 'Stable'}
              </div>
            </div>

            <div
              style={{
                padding: '12px',
                background: 'rgba(255, 255, 255, 0.03)',
                borderRadius: '6px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
              }}
            >
              <div
                style={{
                  fontSize: '9px',
                  color: '#ffffff',
                  fontWeight: '700',
                  marginBottom: '6px',
                  fontFamily: 'monospace',
                }}
              >
                TIMEFRAME SYNC
              </div>
              <div
                style={{
                  fontSize: '16px',
                  fontWeight: '900',
                  color:
                    alignmentPercentage >= 80
                      ? '#10b981'
                      : alignmentPercentage >= 60
                        ? '#fbbf24'
                        : '#ef4444',
                  fontFamily: 'monospace',
                }}
              >
                {Math.round(alignmentPercentage)}%
              </div>
              <div
                style={{
                  fontSize: '9px',
                  color: '#ffffff',
                  opacity: 0.6,
                  marginTop: '4px',
                  fontFamily: 'monospace',
                }}
              >
                {alignmentScore}/{timeframes.length} Aligned
              </div>
            </div>

            <div
              style={{
                padding: '12px',
                background: 'rgba(255, 255, 255, 0.03)',
                borderRadius: '6px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
              }}
            >
              <div
                style={{
                  fontSize: '9px',
                  color: '#ffffff',
                  fontWeight: '700',
                  marginBottom: '6px',
                  fontFamily: 'monospace',
                }}
              >
                MARKET BREADTH
              </div>
              <div
                style={{
                  fontSize: '16px',
                  fontWeight: '900',
                  color: breadthPercentage >= 50 ? '#10b981' : '#ef4444',
                  fontFamily: 'monospace',
                }}
              >
                {Math.round(breadthPercentage)}%
              </div>
              <div
                style={{
                  fontSize: '9px',
                  color: '#ffffff',
                  opacity: 0.6,
                  marginTop: '4px',
                  fontFamily: 'monospace',
                }}
              >
                {positiveSectors} of {allSectors.length} Up
              </div>
            </div>

            <div
              style={{
                padding: '12px',
                background: 'rgba(255, 255, 255, 0.03)',
                borderRadius: '6px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
              }}
            >
              <div
                style={{
                  fontSize: '9px',
                  color: '#ffffff',
                  fontWeight: '700',
                  marginBottom: '6px',
                  fontFamily: 'monospace',
                }}
              >
                REGIME STRENGTH
              </div>
              <div
                style={{
                  fontSize: '16px',
                  fontWeight: '900',
                  color: color,
                  fontFamily: 'monospace',
                }}
              >
                {spreadStrength}
              </div>
              <div
                style={{
                  fontSize: '9px',
                  color: '#ffffff',
                  opacity: 0.6,
                  marginTop: '4px',
                  fontFamily: 'monospace',
                }}
              >
                {confidence.toFixed(0)}% Confidence
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes pulse {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }
      `}</style>
    </div>
  )
}

export default memo(EnhancedRegimeDisplay)
