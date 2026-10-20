'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { DiveDay, DiveOptions, WindowStats, computeWindowStats } from './seasonalDive'

interface WindowRef {
  startDay: number
  endDay: number
  period: string
}

interface SeasonalDivePanelProps {
  symbol: string
  daily: DiveDay[]
  sweetSpot: WindowRef | null
  painPoint: WindowRef | null
  trendSync: { score: number; label: string; color: string } | null
  options: DiveOptions
  onOptionsChange: (next: DiveOptions) => void
  onClose: () => void
}

const mono = '"Inter", "Segoe UI", Roboto, Arial, sans-serif'
const GREEN = '#00e676'
const RED = '#ff4d4d'
const CYAN = '#00e5ff'
const AMBER = '#ffb74d'
const MUTED = '#d0d7de'
const fmt = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
const tone = (n: number) => (n >= 0 ? GREEN : RED)

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontSize: 11, color: MUTED, letterSpacing: 0.8, fontWeight: 700, whiteSpace: 'nowrap' }}>{children}</div>
)

const Chip: React.FC<{ label: string; on: boolean; color: string; onClick: () => void }> = ({ label, on, color, onClick }) => (
  <button
    onClick={onClick}
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '6px 8px',
      borderRadius: 5,
      cursor: 'pointer',
      fontFamily: mono,
      fontSize: 13,
      fontWeight: 700,
      color: on ? '#fff' : MUTED,
      background: on ? `${color}22` : 'rgba(255,255,255,0.04)',
      border: `1px solid ${on ? color : 'rgba(255,255,255,0.1)'}`,
      textAlign: 'left',
      whiteSpace: 'nowrap',
    }}
  >
    <span style={{ width: 8, height: 8, borderRadius: '50%', background: on ? color : 'transparent', border: `1px solid ${color}`, flexShrink: 0 }} />
    {label}
  </button>
)

// Donut showing the share of past years that ended in the trade's favour
const Ring: React.FC<{ pct: number; color: string; big: string; small: string }> = ({ pct, color, big, small }) => {
  const r = 30
  const c = 2 * Math.PI * r
  return (
    <div title={small} style={{ position: 'relative', width: 76, height: 76, flexShrink: 0 }}>
      <svg width="76" height="76" viewBox="0 0 76 76">
        <circle cx="38" cy="38" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="7" />
        <circle
          cx="38" cy="38" r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * c} ${c}`} transform="rotate(-90 38 38)"
          style={{ filter: `drop-shadow(0 0 4px ${color}88)` }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 19, fontWeight: 900, color, lineHeight: 1 }}>{big}</div>
      </div>
    </div>
  )
}

// Every past year as a bar around a zero line, with the average as a dashed line
const YearBars: React.FC<{ stats: WindowStats; bearish: boolean }> = ({ stats, bearish }) => {
  const maxAbs = Math.max(...stats.years.map((y) => Math.abs(y.ret)), 0.01)
  const H = 56
  const mid = H / 2
  const meanY = mid - (stats.mean / maxAbs) * (mid - 2)
  return (
    <div>
      <div style={{ position: 'relative', height: H }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: mid, height: 1, background: 'rgba(255,255,255,0.2)' }} />
        <div style={{ position: 'absolute', left: 0, right: 0, top: meanY, borderTop: `1px dashed ${CYAN}` }} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', gap: 2 }}>
          {stats.years.map((y) => {
            const h = Math.max(2, (Math.abs(y.ret) / maxAbs) * (mid - 2))
            const up = y.ret >= 0
            const good = bearish ? !up : up
            return (
              <div key={y.year} title={`${y.year}: ${fmt(y.ret)}   dip ${fmt(y.dip)}`} style={{ flex: 1, position: 'relative' }}>
                <div style={{ position: 'absolute', left: 0, right: 0, [up ? 'bottom' : 'top']: mid, height: h, background: good ? GREEN : RED, opacity: 0.9, borderRadius: 1 }} />
              </div>
            )
          })}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#b4bec9', marginTop: 2 }}>
        <span>{stats.years[0]?.year}</span>
        <span style={{ color: CYAN }}>- - avg {fmt(stats.mean)}</span>
        <span>{stats.years[stats.years.length - 1]?.year}</span>
      </div>
    </div>
  )
}

// Cumulative result of taking this exact trade every year
const EquityCurve: React.FC<{ stats: WindowStats; bearish: boolean }> = ({ stats, bearish }) => {
  const pts = useMemo(() => {
    let c = 0
    return [0, ...stats.years.map((y) => (c += bearish ? -y.ret : y.ret))]
  }, [stats, bearish])
  const W = 260
  const H = 46
  const lo = Math.min(...pts, 0)
  const hi = Math.max(...pts, 0.01)
  const x = (i: number) => (i / (pts.length - 1)) * W
  const y = (v: number) => H - 3 - ((v - lo) / (hi - lo || 1)) * (H - 6)
  const line = pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const end = pts[pts.length - 1]
  const col = end >= 0 ? GREEN : RED
  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block' }}>
        <defs>
          <linearGradient id={`eq-${bearish ? 'b' : 's'}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={col} stopOpacity="0.35" />
            <stop offset="100%" stopColor={col} stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke="rgba(255,255,255,0.18)" strokeDasharray="3 3" />
        <path d={`${line} L${W},${H} L0,${H} Z`} fill={`url(#eq-${bearish ? 'b' : 's'})`} />
        <path d={line} fill="none" stroke={col} strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: MUTED, marginTop: 2 }}>
        <span>TAKING THIS TRADE EVERY YEAR</span>
        <span style={{ color: col, fontWeight: 800 }}>{fmt(end)} total</span>
      </div>
    </div>
  )
}

// Grade from the three things that matter: how often it works, whether it is more than noise, and payoff shape
const gradeOf = (hit: number, t: number, pf: number): { letter: string; color: string } => {
  let pts = 0
  pts += hit >= 80 ? 3 : hit >= 70 ? 2 : hit >= 60 ? 1 : 0
  pts += Math.abs(t) >= 3 ? 3 : Math.abs(t) >= 2 ? 2 : Math.abs(t) >= 1.3 ? 1 : 0
  pts += pf >= 4 ? 2 : pf >= 2 ? 1 : 0
  if (pts >= 7) return { letter: 'A', color: GREEN }
  if (pts >= 5) return { letter: 'B', color: '#9be564' }
  if (pts >= 3) return { letter: 'C', color: '#ffd54f' }
  return { letter: 'D', color: RED }
}

const WindowCard: React.FC<{ bearish: boolean; win: WindowRef; daily: DiveDay[] }> = ({ bearish, win, daily }) => {
  const stats = useMemo(() => computeWindowStats(daily, win.startDay, win.endDay), [daily, win.startDay, win.endDay])
  const accent = bearish ? RED : GREEN
  const [dates, len] = win.period.split(' (')

  if (stats.n === 0) {
    return (
      <div style={{ fontSize: 13, color: MUTED, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 10 }}>
        No yearly data for {bearish ? 'Pain Point' : 'Sweet Spot'}.
      </div>
    )
  }

  const inFavour = stats.years.filter((y) => (bearish ? y.ret < 0 : y.ret > 0))
  const hit = (inFavour.length / stats.n) * 100
  const wins = stats.years.map((y) => (bearish ? -y.ret : y.ret))
  const gain = wins.filter((v) => v > 0).reduce((s, v) => s + v, 0)
  const loss = Math.abs(wins.filter((v) => v < 0).reduce((s, v) => s + v, 0))
  const pf = loss > 0 ? gain / loss : 99
  const edge = bearish ? -stats.mean : stats.mean
  const risk = bearish
    ? Math.max(0, ...stats.years.map((y) => y.ret))
    : Math.abs(stats.avgDip)
  const grade = gradeOf(hit, stats.tStat, pf)

  return (
    <div
      style={{
        background: `linear-gradient(135deg, ${accent}14, rgba(255,255,255,0.02) 55%)`,
        border: `1px solid ${accent}55`,
        borderRadius: 10,
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.4, color: accent }}>
            {bearish ? 'PAIN POINT · FADE' : 'SWEET SPOT · LONG'}
          </div>
          <div style={{ fontSize: 15, fontWeight: 800, marginTop: 3, whiteSpace: 'nowrap' }}>{dates}</div>
          <div style={{ fontSize: 12, color: MUTED }}>{len ? len.replace(')', '') : ''}</div>
        </div>
        <div
          title="Grade from hit rate, t-stat and profit factor"
          style={{ width: 38, height: 38, borderRadius: 8, border: `1.5px solid ${grade.color}`, color: grade.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 900, boxShadow: `0 0 10px ${grade.color}44`, background: 'rgba(0,0,0,0.4)' }}
        >
          {grade.letter}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
          <Ring pct={hit} color={accent} big={`${hit.toFixed(0)}%`} small={`${inFavour.length} of ${stats.n} years`} />
          <div style={{ fontSize: 12, color: MUTED, whiteSpace: 'nowrap' }}>{inFavour.length} of {stats.n} yrs</div>
        </div>
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 10px' }}>
          <div><Label>AVG</Label><div style={{ fontSize: 17, fontWeight: 900, color: tone(stats.mean) }}>{fmt(stats.mean)}</div></div>
          <div><Label>MEDIAN</Label><div style={{ fontSize: 17, fontWeight: 900, color: tone(stats.median) }}>{fmt(stats.median)}</div></div>
          <div><Label>PROFIT F.</Label><div style={{ fontSize: 15, fontWeight: 800, color: pf >= 2 ? GREEN : '#ffd54f' }}>{pf >= 99 ? '∞' : pf.toFixed(1)}</div></div>
          <div><Label>T-STAT</Label><div style={{ fontSize: 15, fontWeight: 800, color: Math.abs(stats.tStat) >= 2 ? GREEN : '#ffd54f' }}>{stats.tStat.toFixed(1)}</div></div>
        </div>
      </div>

      <YearBars stats={stats} bearish={bearish} />

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
          <Label>REWARD VS PAIN</Label>
          <span style={{ fontSize: 12, color: MUTED }}>
            {risk > 0 ? `${(Math.abs(edge) / risk).toFixed(1)}x` : ''}
          </span>
        </div>
        <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: 'rgba(255,255,255,0.06)' }}>
          <div style={{ width: `${(Math.abs(edge) / (Math.abs(edge) + risk || 1)) * 100}%`, background: GREEN }} />
          <div style={{ flex: 1, background: AMBER, opacity: 0.8 }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 3 }}>
          <span style={{ color: GREEN }}>avg gain {fmt(Math.abs(edge))}</span>
          <span style={{ color: AMBER }}>{bearish ? 'avg worst bounce' : 'avg dip'} {fmt(risk)}</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5 }}>
        {[
          { l: 'BEST YEAR', v: stats.best ? fmt(stats.best.ret) : '-', s: stats.best?.year, c: GREEN },
          { l: 'WORST YEAR', v: stats.worst ? fmt(stats.worst.ret) : '-', s: stats.worst?.year, c: RED },
          { l: 'DEEPEST DIP', v: fmt(stats.worstDip), s: 'while holding', c: AMBER },
        ].map((s) => (
          <div key={s.l} style={{ background: 'rgba(0,0,0,0.35)', borderRadius: 5, padding: '5px 7px' }}>
            <Label>{s.l}</Label>
            <div style={{ fontSize: 14, fontWeight: 800, color: s.c }}>{s.v}</div>
            <div style={{ fontSize: 11, color: '#b4bec9' }}>{s.s}</div>
          </div>
        ))}
      </div>

      <EquityCurve stats={stats} bearish={bearish} />
    </div>
  )
}

const DivePanelBody: React.FC<SeasonalDivePanelProps> = ({
  symbol,
  daily,
  sweetSpot,
  painPoint,
  trendSync,
  options,
  onOptionsChange,
  onClose,
}) => {
  const set = (patch: Partial<DiveOptions>) => onOptionsChange({ ...options, ...patch })

  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      style={{
        all: 'initial',
        display: 'flex',
        boxSizing: 'border-box',
        width: 360,
        maxHeight: 'calc(100vh - 170px)',
        overflowY: 'auto',
        overflowX: 'hidden',
        background: 'linear-gradient(180deg, rgba(14,18,24,0.97), rgba(5,7,10,0.97))',
        border: '1px solid rgba(0,229,255,0.35)',
        boxShadow: '0 10px 32px rgba(0,0,0,0.75), 0 0 16px rgba(0,229,255,0.12)',
        borderRadius: 10,
        padding: 12,
        fontFamily: mono,
        fontVariantNumeric: 'tabular-nums',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        scrollbarWidth: 'thin',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 900, letterSpacing: 1.6, color: CYAN }}>DIVE IN</span>
          <span style={{ fontSize: 14, fontWeight: 800 }}>{symbol}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {trendSync && (
            <span
              title="Share of rolling 10-day stretches this year that moved the same direction as the seasonal average"
              style={{ fontSize: 13, fontWeight: 900, color: trendSync.color, border: `1px solid ${trendSync.color}`, borderRadius: 10, padding: '2px 8px' }}
            >
              {trendSync.score}% {trendSync.label}
            </span>
          )}
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: '#e6edf3', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 0 }}>
            ×
          </button>
        </div>
      </div>

      <div>
        <Label>CHART LAYERS</Label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginTop: 5 }}>
          <Chip label="All years" on={options.yearLines} color="#ffffff" onClick={() => set({ yearLines: !options.yearLines })} />
          <Chip label="Middle 50%" on={options.band} color="#5aa0ff" onClick={() => set({ band: !options.band })} />
          <Chip label="Exclude recessions" on={options.exCrisis} color="#ffd700" onClick={() => set({ exCrisis: !options.exCrisis })} />
          <Chip label="Old vs recent" on={options.halves} color="#ff66cc" onClick={() => set({ halves: !options.halves })} />
        </div>
      </div>

      {sweetSpot && <WindowCard bearish={false} win={sweetSpot} daily={daily} />}
      {painPoint && <WindowCard bearish win={painPoint} daily={daily} />}
    </div>
  )
}

// Rendered inside a shadow root so the app's global CSS (forced font sizes etc.) cannot restyle it
const SeasonalDivePanel: React.FC<SeasonalDivePanelProps> = (props) => {
  const hostRef = useRef<HTMLDivElement>(null)
  const [root, setRoot] = useState<ShadowRoot | null>(null)
  useEffect(() => {
    const host = hostRef.current
    if (host) setRoot(host.shadowRoot || host.attachShadow({ mode: 'open' }))
  }, [])
  return (
    <div
      ref={hostRef}
      onMouseDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      style={{ position: 'absolute', top: 48, right: 8, zIndex: 10002, maxHeight: 'calc(100% - 110px)', display: 'flex' }}
    >
      {root && createPortal(<DivePanelBody {...props} />, root as unknown as Element)}
    </div>
  )
}

export default SeasonalDivePanel
