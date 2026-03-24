'use client'

import React, { useEffect, useState } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────
interface CycleResponse {
    phase: number
    phaseIdx: number
    phaseName: string
    confidence: number
    signals: {
        spyPrice: number
        spyVs200MA: number
        goldenCross: boolean
        spy1M: number
        spy3M: number
        spy12M: number
        vix: number
        tlt3M: number
    }
    macro: {
        yieldCurve: number
        yieldCurveTrend: number
        daysInverted: number
        fedFunds: number
        fedCutting: boolean
        hySpread: number
        hySpreadTrend: number
        sentiment: number
        sentimentTrend: number
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
}

// ── Constants ─────────────────────────────────────────────────────────────────
const PHASE_NAMES = [
    'Market Bottom',
    'Early Recovery',
    'Early Bull',
    'Middle Bull',
    'Late Bull / Peak',
    'Early Bear',
    'Bear Market',
    'Late Bear',
]

const PHASE_COLORS = [
    '#ef4444', // 0 Bottom        — red
    '#f97316', // 1 Early Recovery — orange
    '#f59e0b', // 2 Early Bull    — amber
    '#84cc16', // 3 Middle Bull   — lime
    '#00ff41', // 4 Late Bull     — bright green
    '#facc15', // 5 Early Bear    — yellow
    '#f97316', // 6 Bear Market   — orange
    '#ef4444', // 7 Late Bear     — red
]

const SECTOR_LABELS: Record<string, string> = {
    XLE: 'Energy', XLF: 'Financials', XLK: 'Technology', XLV: 'Health Care',
    XLP: 'Cons. Staples', XLY: 'Cons. Discret', XLI: 'Industrials',
    XLU: 'Utilities', XLB: 'Materials', XLRE: 'Real Estate', XLC: 'Comm. Svcs',
}

// ── Sine wave SVG helpers ─────────────────────────────────────────────────────
// Phase i maps to x-position on sin wave: x = π/2 + (i - 4) * π/4
// sin values: [−1, −0.707, 0, 0.707, 1, 0.707, 0, −0.707]
function phaseToWaveCoords(phase: number, svgW: number, svgH: number) {
    const margin = { l: 60, r: 60, t: 40, b: 40 }
    const W = svgW - margin.l - margin.r
    const H = svgH - margin.t - margin.b
    const cx = svgH / 2 + margin.t  // vertical center

    // x-position: phase 0-7 maps across full width
    const xFrac = phase / 7
    const x = margin.l + xFrac * W

    // y-position: sin(π/2 + (phase-4)*π/4) ... but we need fraction 0-7
    // Approximate via: each integer phase sits at its sin-wave y
    const angleStep = Math.PI / 4
    const angle = Math.PI / 2 + (phase - 4) * angleStep
    const sinVal = Math.sin(angle)
    const amplitude = H * 0.38
    const y = cx - sinVal * amplitude

    return { x, y }
}

function buildWavePath(svgW: number, svgH: number): string {
    const margin = { l: 60, r: 60, t: 40, b: 40 }
    const W = svgW - margin.l - margin.r
    const H = svgH - margin.t - margin.b
    const cx = H / 2 + margin.t
    const amplitude = H * 0.38
    const points: string[] = []

    for (let i = 0; i <= 200; i++) {
        const frac = i / 200
        const phase = frac * 7
        const angleStep = Math.PI / 4
        const angle = Math.PI / 2 + (phase - 4) * angleStep
        const sinVal = Math.sin(angle)
        const x = margin.l + frac * W
        const y = cx - sinVal * amplitude
        points.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
    }
    return points.join(' ')
}

// ── Signal Tile ───────────────────────────────────────────────────────────────
function SignalTile({ label, value, signal, sub }: {
    label: string
    value: string
    signal: 'bull' | 'bear' | 'neutral'
    sub?: string
}) {
    const color = signal === 'bull' ? '#00ff41' : signal === 'bear' ? '#ff3333' : '#f59e0b'
    const bg = signal === 'bull' ? '#00ff4112' : signal === 'bear' ? '#ff333312' : '#f59e0b12'
    return (
        <div style={{
            background: bg,
            border: `1px solid ${color}33`,
            borderRadius: 8,
            padding: '10px 14px',
            flex: '1 1 120px',
            minWidth: 110,
        }}>
            <div style={{ color: '#ffffff', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4, fontFamily: '"Roboto Mono", monospace' }}>{label}</div>
            <div style={{ color, fontSize: 17, fontWeight: 800, letterSpacing: '-0.3px', fontFamily: '"Roboto Mono", monospace' }}>{value}</div>
            {sub && <div style={{ color: '#ffffff', fontSize: 10, marginTop: 2, fontFamily: '"Roboto Mono", monospace' }}>{sub}</div>}
        </div>
    )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function MarketCycleIndicator() {
    const [data, setData] = useState<CycleResponse | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [pulse, setPulse] = useState(true)
    const svgW = 860
    const svgH = 200

    useEffect(() => {
        fetch('/api/market-cycle')
            .then(r => r.json())
            .then(d => { setData(d); setLoading(false) })
            .catch(() => { setError('Failed to load cycle data'); setLoading(false) })
    }, [])

    // Pulse animation
    useEffect(() => {
        const id = setInterval(() => setPulse(p => !p), 900)
        return () => clearInterval(id)
    }, [])

    const wavePath = buildWavePath(svgW, svgH)

    if (loading) {
        return (
            <div style={{ background: '#000', border: '1px solid #111', borderRadius: 12, padding: '32px', textAlign: 'center', fontFamily: '"Roboto Mono", monospace', color: '#ffffff' }}>
                ANALYZING MARKET CYCLE...
            </div>
        )
    }

    if (error || !data) {
        return (
            <div style={{ background: '#000', border: '1px solid #111', borderRadius: 12, padding: '32px', textAlign: 'center', fontFamily: '"Roboto Mono", monospace', color: '#ff3333' }}>
                {error ?? 'No data'}
            </div>
        )
    }

    const phaseColor = PHASE_COLORS[data.phaseIdx] ?? '#ffffff'
    const { x: dotX, y: dotY } = phaseToWaveCoords(data.phase, svgW, svgH)
    const sig = data.signals

    // Build gradient path segments (color-coded by phase region)
    const phaseCoords = PHASE_NAMES.map((_, i) => phaseToWaveCoords(i, svgW, svgH))

    // Active segment from phase 0 to current position (drawn on top)
    const activeWavePts: string[] = []
    for (let i = 0; i <= 100; i++) {
        const frac = (i / 100) * (data.phase / 7)
        const phase = frac * 7
        const x = 60 + frac * (svgW - 120)
        const angle = Math.PI / 2 + (phase - 4) * (Math.PI / 4)
        const y = svgH / 2 - Math.sin(angle) * (svgH - 80) * 0.38
        activeWavePts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
    }
    const activeWavePath = activeWavePts.join(' ')

    // Signal helpers
    const vixSignal = sig.vix < 18 ? 'bull' : sig.vix < 26 ? 'neutral' : 'bear'
    const vixLabel = sig.vix < 14 ? 'COMPLACENT' : sig.vix < 20 ? 'LOW' : sig.vix < 28 ? 'ELEVATED' : 'FEAR'
    const trendSignal = sig.spyVs200MA > 0 ? 'bull' : 'bear'
    const momSignal = sig.spy3M > 0 ? 'bull' : 'bear'
    const bondSignal = sig.tlt3M > 5 ? 'bear' : sig.tlt3M < -3 ? 'bull' : 'neutral'
    const bondLabel = sig.tlt3M > 5 ? 'FLIGHT SAFETY' : sig.tlt3M < -3 ? 'RATES RISING' : 'NEUTRAL'

    // Macro signal helpers
    const mac = data.macro
    const ycSignal: 'bull' | 'bear' | 'neutral' = mac.yieldCurve > 0.5 ? 'bull' : mac.yieldCurve < 0 ? 'bear' : 'neutral'
    const ycLabel = mac.yieldCurve < -0.5 ? 'DEEPLY INVERTED' : mac.yieldCurve < 0 ? 'INVERTED' : mac.yieldCurve < 0.5 ? 'FLAT' : mac.yieldCurve < 1.5 ? 'NORMAL' : 'STEEP'
    const ycTrendIcon = mac.yieldCurveTrend > 0.2 ? '▲ STEEPENING' : mac.yieldCurveTrend < -0.2 ? '▼ INVERTING' : '→ FLAT'
    const hySignal: 'bull' | 'bear' | 'neutral' = mac.hySpread < 3.5 ? 'bull' : mac.hySpread > 5 ? 'bear' : 'neutral'
    const hyLabel = mac.hySpread < 2.5 ? 'TIGHT / RISK-ON' : mac.hySpread < 3.5 ? 'LOW' : mac.hySpread < 5 ? 'ELEVATED' : 'STRESS'
    const fedSignal: 'bull' | 'bear' | 'neutral' = mac.fedCutting ? 'bull' : mac.fedFunds > 4.5 ? 'bear' : 'neutral'
    const fedLabel = mac.fedCutting ? 'CUTTING ↓' : mac.fedFunds > 5 ? 'VERY TIGHT' : mac.fedFunds > 4 ? 'RESTRICTIVE' : 'NEUTRAL'
    const sentSignal: 'bull' | 'bear' | 'neutral' = mac.sentiment > 80 ? 'neutral' : mac.sentiment > 65 ? 'bull' : mac.sentiment < 55 ? 'bear' : 'neutral'
    const sentLabel = mac.sentiment > 85 ? 'EUPHORIA' : mac.sentiment > 70 ? 'STRONG' : mac.sentiment > 60 ? 'CAUTIOUS' : mac.sentiment > 50 ? 'WEAK' : 'RECESSION'

    return (
        <div style={{
            background: '#000000',
            border: '1px solid #111',
            borderRadius: 12,
            fontFamily: '"Roboto Mono", monospace',
            overflow: 'hidden',
        }}>
            {/* ── Header ──────────────────────────────────────────────────────────── */}
            <div style={{
                padding: '18px 28px',
                borderBottom: '1px solid #111',
                background: 'linear-gradient(180deg, #0c0c0c 0%, #060606 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {/* Icon tile */}
                    <div style={{
                        width: 44, height: 44, borderRadius: 6,
                        background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 2px 12px #3b82f640',
                    }}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="square">
                            <path d="M2 12 Q5 4 8 12 Q11 20 14 12 Q17 4 20 12 Q22 16 24 12" />
                        </svg>
                    </div>
                    <div>
                        <div style={{ color: '#ffffff', fontSize: 13, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Market Cycle Positioning</div>
                        <div style={{ color: '#aaaaaa', fontSize: 10, letterSpacing: '0.1em', marginTop: 3, textTransform: 'uppercase' }}>Sector Rotation · Technical Signals · Real Data</div>
                    </div>
                </div>

                {/* Current phase badge */}
                <div style={{
                    background: `${phaseColor}18`,
                    border: `1px solid ${phaseColor}44`,
                    borderRadius: 8,
                    padding: '8px 20px',
                    textAlign: 'center',
                }}>
                    <div style={{ color: phaseColor, fontSize: 18, fontWeight: 900, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                        {data.phaseName}
                    </div>
                    <div style={{ color: '#aaaaaa', fontSize: 10, marginTop: 3, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                        {data.confidence}% Confidence · SPY ${sig.spyPrice.toFixed(0)}
                    </div>
                </div>
            </div>

            {/* ── Fetch error warning ──────────────────────────────────────────────── */}
            {data.fetchErrors?.length > 0 && (
                <div style={{ padding: '6px 28px', background: '#ff333310', borderBottom: '1px solid #ff333330', fontSize: 10, color: '#ff3333', letterSpacing: '0.08em', fontFamily: '"Roboto Mono", monospace' }}>
                    ⚠ DATA MISSING FOR: {data.fetchErrors.join(' · ')} — results may be partial
                </div>
            )}

            {/* ── Sine Wave ───────────────────────────────────────────────────────── */}
            <div style={{ padding: '24px 28px 8px' }}>
                <svg width="100%" viewBox={`0 0 ${svgW} ${svgH}`} style={{ overflow: 'visible' }}>
                    <defs>
                        <filter id="glow">
                            <feGaussianBlur stdDeviation="4" result="coloredBlur" />
                            <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
                        </filter>
                        <linearGradient id="waveGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#ef4444" stopOpacity="1" />
                            <stop offset="30%" stopColor="#f97316" stopOpacity="1" />
                            <stop offset="57%" stopColor="#00ff41" stopOpacity="1" />
                            <stop offset="75%" stopColor="#f97316" stopOpacity="1" />
                            <stop offset="100%" stopColor="#ef4444" stopOpacity="1" />
                        </linearGradient>
                    </defs>

                    {/* Zero line */}
                    <line x1="60" y1={svgH / 2} x2={svgW - 60} y2={svgH / 2} stroke="#111" strokeWidth="1" strokeDasharray="4 4" />

                    {/* Background wave (dim) */}
                    <path d={wavePath} stroke="#1a1a1a" strokeWidth="2" fill="none" />

                    {/* Colored wave using gradient */}
                    <path d={wavePath} stroke="url(#waveGrad)" strokeWidth="2.5" fill="none" />

                    {/* Active portion (from start to current phase) */}
                    <path d={activeWavePath} stroke={phaseColor} strokeWidth="3" fill="none" filter="url(#glow)" />

                    {/* Phase dot markers */}
                    {phaseCoords.map((coord, i) => {
                        const isCurrent = i === data.phaseIdx
                        const c = PHASE_COLORS[i]
                        const isTop = Math.sin(Math.PI / 2 + (i - 4) * Math.PI / 4) > 0
                        return (
                            <g key={i}>
                                <circle cx={coord.x} cy={coord.y} r={isCurrent ? 0 : 4} fill={c} opacity={1} />
                                {/* Phase label */}
                                <text
                                    x={coord.x}
                                    y={isTop ? coord.y - 16 : coord.y + 22}
                                    textAnchor="middle"
                                    fill={isCurrent ? phaseColor : '#666666'}
                                    fontSize={isCurrent ? 11 : 9}
                                    fontWeight={isCurrent ? 800 : 500}
                                    fontFamily='"Roboto Mono", monospace'
                                    letterSpacing="0.04em"
                                    style={{ textTransform: 'uppercase' }}
                                >
                                    {PHASE_NAMES[i].split(' / ')[0]}
                                </text>
                            </g>
                        )
                    })}

                    {/* Current position — glowing dot */}
                    <circle cx={dotX} cy={dotY} r="22" fill={phaseColor} opacity={pulse ? 0.08 : 0.04} />
                    <circle cx={dotX} cy={dotY} r="14" fill={phaseColor} opacity={pulse ? 0.15 : 0.08} />
                    <circle cx={dotX} cy={dotY} r="8" fill={phaseColor} filter="url(#glow)" />
                    <circle cx={dotX} cy={dotY} r="5" fill="#000" />
                    <circle cx={dotX} cy={dotY} r="3" fill={phaseColor} />

                    {/* YOU ARE HERE label */}
                    <text
                        x={dotX}
                        y={dotY + 36}
                        textAnchor="middle"
                        fill={phaseColor}
                        fontSize={9}
                        fontWeight={700}
                        fontFamily='"Roboto Mono", monospace'
                        letterSpacing="0.1em"
                    >
                        ▲ YOU ARE HERE
                    </text>
                </svg>
            </div>

            {/* ── Signal Tiles ────────────────────────────────────────────────────── */}
            <div style={{ padding: '12px 28px 16px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <SignalTile
                    label="SPY vs 200MA"
                    value={`${sig.spyVs200MA > 0 ? '+' : ''}${sig.spyVs200MA}%`}
                    signal={trendSignal}
                    sub={sig.goldenCross ? 'GOLDEN CROSS' : 'DEATH CROSS'}
                />
                <SignalTile
                    label="Momentum 3M"
                    value={`${sig.spy3M > 0 ? '+' : ''}${sig.spy3M}%`}
                    signal={momSignal}
                    sub={`12M: ${sig.spy12M > 0 ? '+' : ''}${sig.spy12M}%`}
                />
                <SignalTile
                    label="VIX"
                    value={sig.vix.toFixed(1)}
                    signal={vixSignal}
                    sub={vixLabel}
                />
                <SignalTile
                    label="Bonds (TLT 3M)"
                    value={`${sig.tlt3M > 0 ? '+' : ''}${sig.tlt3M}%`}
                    signal={bondSignal}
                    sub={bondLabel}
                />
                <SignalTile
                    label="Confidence"
                    value={`${data.confidence}%`}
                    signal={data.confidence > 65 ? 'bull' : data.confidence > 45 ? 'neutral' : 'bear'}
                    sub="SIGNAL AGREEMENT"
                />
            </div>

            {/* ── Macro Signal Tiles ───────────────────────────────────────────────── */}
            <div style={{ padding: '0 28px 8px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <SignalTile
                    label="Yield Curve T10Y-3M"
                    value={`${mac.yieldCurve > 0 ? '+' : ''}${mac.yieldCurve.toFixed(2)}%`}
                    signal={ycSignal}
                    sub={`${ycLabel} · ${ycTrendIcon}`}
                />
                <SignalTile
                    label="HY Credit Spread"
                    value={`${mac.hySpread.toFixed(2)}%`}
                    signal={hySignal}
                    sub={`${hyLabel}${mac.hySpreadTrend > 0.3 ? ' · WIDENING' : mac.hySpreadTrend < -0.3 ? ' · TIGHTENING' : ''}`}
                />
                <SignalTile
                    label="Fed Funds Rate"
                    value={`${mac.fedFunds.toFixed(2)}%`}
                    signal={fedSignal}
                    sub={fedLabel}
                />
                <SignalTile
                    label="Consumer Sentiment"
                    value={mac.sentiment.toFixed(1)}
                    signal={sentSignal}
                    sub={`${sentLabel}${mac.sentimentTrend > 2 ? ' · IMPROVING' : mac.sentimentTrend < -2 ? ' · DECLINING' : ''}`}
                />
            </div>

            {/* ── Sector Rotation Table ────────────────────────────────────────────── */}
            <div style={{ padding: '0 28px 28px' }}>
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginBottom: 10,
                }}>
                    <div style={{ color: '#aaaaaa', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                        Sector Rotation — 3M Relative to SPY
                    </div>
                    <div style={{ color: '#aaaaaa', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                        Expected Leaders: <span style={{ color: phaseColor }}>
                            {data.phaseSectors.join(' · ')}
                        </span>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 6 }}>
                    {data.sectorRanking.map((s, rank) => {
                        const isLeader = rank < 3
                        const isExpected = data.phaseSectors.includes(s.ticker)
                        const barPct = Math.max(0, Math.min(100, (s.relReturn3M + 10) / 20 * 100))
                        const color = s.relReturn3M > 0 ? '#00ff41' : '#ff3333'
                        return (
                            <div key={s.ticker} style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '7px 10px',
                                background: isLeader ? '#0a0a0a' : 'transparent',
                                border: isExpected ? `1px solid ${phaseColor}30` : '1px solid #0a0a0a',
                                borderRadius: 6,
                            }}>
                                {/* Rank */}
                                <div style={{ color: '#aaaaaa', fontSize: 10, width: 14, textAlign: 'right', flexShrink: 0 }}>{rank + 1}</div>

                                {/* Ticker */}
                                <div style={{ fontSize: 11, fontWeight: 800, color: isExpected ? phaseColor : '#ffffff', width: 38, flexShrink: 0 }}>
                                    {s.ticker}
                                </div>

                                {/* Bar */}
                                <div style={{ flex: 1, height: 4, background: '#111', borderRadius: 2, overflow: 'hidden' }}>
                                    <div style={{ width: `${barPct}%`, height: '100%', background: color, borderRadius: 2 }} />
                                </div>

                                {/* Value */}
                                <div style={{ color, fontSize: 11, fontWeight: 700, width: 48, textAlign: 'right', flexShrink: 0 }}>
                                    {s.relReturn3M > 0 ? '+' : ''}{s.relReturn3M}%
                                </div>
                            </div>
                        )
                    })}
                </div>

                {/* Phase context note */}
                <div style={{
                    marginTop: 14,
                    padding: '10px 14px',
                    background: `${phaseColor}08`,
                    border: `1px solid ${phaseColor}20`,
                    borderRadius: 6,
                    fontSize: 11,
                    color: '#aaaaaa',
                    lineHeight: 1.6,
                }}>
                    <span style={{ color: phaseColor, fontWeight: 700 }}>{data.phaseName.toUpperCase()}</span>
                    {' — '}
                    {data.phaseIdx === 0 && 'Capitulation phase. Utilities & gold traditionally hold. Watch for VIX reversal + XLF bottoming as recovery signal.'}
                    {data.phaseIdx === 1 && 'Recovery underway. Financials & Consumer Discretionary typically lead out of the trough. Breadth is improving.'}
                    {data.phaseIdx === 2 && 'Bullish trend establishing. Industrials & Financials outperforming. 200MA critical support.'}
                    {data.phaseIdx === 3 && 'Mid-cycle expansion. Technology & Industrials in focus. Healthy breadth, 50MA > 200MA (golden cross territory).'}
                    {data.phaseIdx === 4 && 'Late-cycle / peak. Energy & Materials typically leading. VIX near lows. Watch for exhaustion signs.'}
                    {data.phaseIdx === 5 && 'Early distribution. Staples & Health Care outperforming as defensives rotate in. VIX rising from lows.'}
                    {data.phaseIdx === 6 && 'Confirmed bear phase. Broad losses, defensive sectors only safe harbor. Avoid risk assets.'}
                    {data.phaseIdx === 7 && 'Late bear / capitulation approaching. VIX elevated. Monitor Utilities & XLF for first signs of bottom.'}
                </div>
            </div>
        </div>
    )
}
