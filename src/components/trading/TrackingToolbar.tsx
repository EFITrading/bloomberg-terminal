'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'

import { SCREEN_OPTIONS, runScreen, type ScreenHit } from './RegimesPanel'
import { dailyBars, type TrackingChartType, type TrackingTf } from './TrackingCard'

export type TrackingScan =
  | { kind: 'off' }
  | { kind: 'hi52' }
  | { kind: 'lo52' }
  | { kind: 'perf'; period: 'MTD' | 'QTD' | 'YTD'; dir: 'win' | 'lose' }
  | { kind: 'chop'; period: 'D' | 'W' | 'M' | 'Q' }
  | { kind: 'screen'; id: string }

type Bar = { t: number; o: number; h: number; l: number; c: number }
type Badge = { text: string; color: string }
const UP = '#22c55e'
const DOWN = '#ef4444'
const AMBER = '#facc15'

// Chop windows: sessions looked at and the max range (% of price) that counts as "stuck"
const CHOP: Record<'D' | 'W' | 'M' | 'Q', { bars: number; maxRange: number; label: string }> = {
  D: { bars: 1, maxRange: 1.5, label: '1D' },
  W: { bars: 5, maxRange: 3.5, label: '1W' },
  M: { bars: 21, maxRange: 7, label: '1M' },
  Q: { bars: 63, maxRange: 12, label: '1Q' },
}

function periodStart(period: 'MTD' | 'QTD' | 'YTD'): number {
  const d = new Date()
  const m = period === 'MTD' ? d.getMonth() : period === 'QTD' ? Math.floor(d.getMonth() / 3) * 3 : 0
  return new Date(d.getFullYear(), m, 1).getTime()
}

function evaluate(bars: Bar[], scan: TrackingScan): { badge: Badge; sort: number } | null {
  if (bars.length < 5) return null
  const last = bars[bars.length - 1].c
  if (scan.kind === 'hi52' || scan.kind === 'lo52') {
    const hi = Math.max(...bars.map((b) => b.h))
    const lo = Math.min(...bars.map((b) => b.l))
    if (scan.kind === 'hi52') {
      const off = ((last - hi) / hi) * 100
      return off >= -2 ? { badge: { text: off > -0.05 ? 'AT 52W HIGH' : `${off.toFixed(1)}% FROM 52W HIGH`, color: UP }, sort: -off } : null
    }
    const off = ((last - lo) / lo) * 100
    return off <= 2 ? { badge: { text: off < 0.05 ? 'AT 52W LOW' : `+${off.toFixed(1)}% FROM 52W LOW`, color: DOWN }, sort: off } : null
  }
  if (scan.kind === 'perf') {
    const start = periodStart(scan.period)
    const prior = [...bars].reverse().find((b) => b.t < start)
    const base = prior?.c ?? bars.find((b) => b.t >= start)?.o
    if (!base) return null
    const ret = ((last - base) / base) * 100
    if (scan.dir === 'win' ? ret <= 0 : ret >= 0) return null
    return {
      badge: { text: `${scan.period} ${ret >= 0 ? '+' : ''}${ret.toFixed(1)}%`, color: ret >= 0 ? UP : DOWN },
      sort: scan.dir === 'win' ? -ret : ret,
    }
  }
  if (scan.kind === 'chop') {
    const cfg = CHOP[scan.period]
    const set = bars.slice(-cfg.bars)
    const hi = Math.max(...set.map((b) => b.h))
    const lo = Math.min(...set.map((b) => b.l))
    const rangePct = ((hi - lo) / last) * 100
    if (rangePct > cfg.maxRange) return null
    if (cfg.bars > 1) {
      const net = Math.abs(set[set.length - 1].c - set[0].o)
      if (net / (hi - lo || 1) > 0.5) return null
    }
    return { badge: { text: `${cfg.label} RANGE ${rangePct.toFixed(1)}%`, color: AMBER }, sort: rangePct }
  }
  return null
}

// Loads daily history for every tracked symbol and applies the active scan
export function useTrackingScan<T extends { title: string; symbols: string[]; color: string }>(
  categories: T[],
  scan: TrackingScan
) {
  const [daily, setDaily] = useState<Record<string, Bar[]>>({})
  const [screenRes, setScreenRes] = useState<{
    id: string
    hits: ScreenHit[]
    color: string
    label: string
  } | null>(null)
  const [screenPct, setScreenPct] = useState(0)
  const screenId = scan.kind === 'screen' ? scan.id : null
  const active = scan.kind !== 'off' && scan.kind !== 'screen'
  const all = useMemo(() => Array.from(new Set(categories.flatMap((c) => c.symbols))), [categories])

  useEffect(() => {
    if (!screenId) return
    let dead = false
    setScreenPct(0)
    runScreen(screenId, (p) => !dead && setScreenPct(p))
      .then((r) => !dead && setScreenRes({ id: screenId, ...r }))
      .catch(() => !dead && setScreenRes({ id: screenId, hits: [], color: '#1a4d8f', label: 'SCREEN FAILED' }))
    return () => {
      dead = true
    }
  }, [screenId])

  useEffect(() => {
    if (!active) return
    let dead = false
    all.forEach((s) => {
      if (daily[s]) return
      dailyBars(s).then((b) => {
        if (!dead) setDaily((prev) => (prev[s] ? prev : { ...prev, [s]: b }))
      })
    })
    return () => {
      dead = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, all])

  const loaded = all.filter((s) => daily[s]).length

  const result = useMemo(() => {
    const badges: Record<string, Badge> = {}
    if (!active) return { categories, badges, matches: 0 }
    let matches = 0
    const out = categories
      .map((c) => {
        const hits = c.symbols
          .map((s) => ({ s, r: daily[s] ? evaluate(daily[s], scan) : null }))
          .filter((x) => x.r)
          .sort((a, b) => a.r!.sort - b.r!.sort)
        hits.forEach((h) => (badges[h.s] = h.r!.badge))
        matches += hits.length
        return { ...c, symbols: hits.map((h) => h.s) }
      })
      .filter((c) => c.symbols.length > 0)
    return { categories: out as T[], badges, matches }
  }, [categories, daily, scan, active])

  if (screenId) {
    const ready = screenRes && screenRes.id === screenId ? screenRes : null
    const badges: Record<string, Badge> = {}
    ready?.hits.forEach((h) => (badges[h.symbol] = { text: h.badge, color: ready.color }))
    const cats = ready && ready.hits.length
      ? [{ title: `SCREEN · ${ready.label.toUpperCase()}`, symbols: ready.hits.map((h) => h.symbol), color: ready.color }]
      : []
    return {
      categories: cats as unknown as T[],
      badges,
      matches: ready?.hits.length ?? 0,
      loading: !ready,
      loaded: screenPct,
      total: 100,
    }
  }

  return { ...result, loading: active && loaded < all.length, loaded, total: all.length }
}

interface ToolbarProps {
  tf: TrackingTf
  onTf: (t: TrackingTf) => void
  type: TrackingChartType
  onType: (t: TrackingChartType) => void
  scan: TrackingScan
  onScan: (s: TrackingScan) => void
  status?: { loading: boolean; loaded: number; total: number; matches: number }
}

const seg = (on: boolean, tone = '#ffffff'): React.CSSProperties => ({
  padding: '6px 12px',
  fontSize: 12,
  fontWeight: 800,
  fontFamily: 'monospace',
  letterSpacing: '0.5px',
  border: 'none',
  cursor: 'pointer',
  borderRadius: 5,
  whiteSpace: 'nowrap',
  background: 'transparent',
  color: on ? tone : '#ffffff',
  boxShadow: 'none',
})

const group: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  flexShrink: 0,
  background: '#0b0b0e',
  border: '1px solid #26262b',
  borderRadius: 7,
  padding: 3,
}

const label: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '0.5px',
  color: '#ffffff',
  fontFamily: 'monospace',
  padding: '0 5px 0 4px',
  whiteSpace: 'nowrap',
}

const sel = (on: boolean, tone = '#ffffff'): React.CSSProperties => ({
  padding: '5px 4px',
  fontSize: 11,
  fontWeight: 800,
  fontFamily: 'monospace',
  background: '#15151a',
  color: on ? tone : '#ffffff',
  border: '1px solid #33333a',
  borderRadius: 5,
  cursor: 'pointer',
  outline: 'none',
})

export default function TrackingToolbar({ tf, onTf, type, onType, scan, onScan, status }: ToolbarProps) {
  const perf = scan.kind === 'perf' ? scan : null
  const chop = scan.kind === 'chop' ? scan : null
  const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'nowrap', overflowX: 'auto' }

  return (
    <div
      style={{
        padding: '10px 14px',
        borderBottom: '1px solid #1f1f24',
        background: 'linear-gradient(180deg,#0e0e12,#08080a)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {/* View controls */}
      <div style={row}>
        <div style={group}>
          <span style={label}>TIMEFRAME</span>
          <select style={sel(true)} value={tf} onChange={(e) => onTf(e.target.value as TrackingTf)}>
            {(['1D', '5D', '1M', '3M', '6M', '1Y'] as const).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div style={group}>
          <span style={label}>CHART</span>
          <select style={sel(true)} value={type} onChange={(e) => onType(e.target.value as TrackingChartType)}>
            <option value="line">LINE</option>
            <option value="candles">CANDLES</option>
          </select>
        </div>

        <div style={group}>
          <span style={label}>52 WEEK</span>
          <select
            style={sel(scan.kind === 'hi52' || scan.kind === 'lo52')}
            value={scan.kind === 'hi52' || scan.kind === 'lo52' ? scan.kind : ''}
            onChange={(e) =>
              e.target.value ? onScan({ kind: e.target.value as 'hi52' | 'lo52' }) : onScan({ kind: 'off' })
            }
          >
            <option value="">SELECT...</option>
            <option value="hi52">HIGHS</option>
            <option value="lo52">LOWS</option>
          </select>
        </div>

        <div style={group}>
          <span style={label}>PERFORMANCE</span>
          <select
            style={sel(!!perf)}
            value={perf ? `${perf.period}|${perf.dir}` : ''}
            onChange={(e) => {
              if (!e.target.value) return onScan({ kind: 'off' })
              const [period, dir] = e.target.value.split('|')
              onScan({ kind: 'perf', period: period as 'MTD' | 'QTD' | 'YTD', dir: dir as 'win' | 'lose' })
            }}
          >
            <option value="">SELECT...</option>
            {(['MTD', 'QTD', 'YTD'] as const).map((p) => (
              <Fragment key={p}>
                <option value={`${p}|win`}>{p} WINNERS</option>
                <option value={`${p}|lose`}>{p} LOSERS</option>
              </Fragment>
            ))}
          </select>
        </div>

        <div style={group}>
          <span style={label}>RANGE-BOUND</span>
          <select
            style={sel(!!chop)}
            value={chop?.period ?? ''}
            onChange={(e) =>
              e.target.value
                ? onScan({ kind: 'chop', period: e.target.value as 'D' | 'W' | 'M' | 'Q' })
                : onScan({ kind: 'off' })
            }
          >
            <option value="">SELECT...</option>
            <option value="D">DAILY</option>
            <option value="W">WEEKLY</option>
            <option value="M">MONTHLY</option>
            <option value="Q">QUARTERLY</option>
          </select>
        </div>

        <div style={group}>
          <span style={label}>SCREENING</span>
          <select
            style={sel(scan.kind === 'screen')}
            value={scan.kind === 'screen' ? scan.id : ''}
            onChange={(e) =>
              e.target.value ? onScan({ kind: 'screen', id: e.target.value }) : onScan({ kind: 'off' })
            }
          >
            <option value="">SELECT...</option>
            {SCREEN_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label.toUpperCase()}
              </option>
            ))}
          </select>
        </div>

        {scan.kind !== 'off' && (
          <button
            onClick={() => onScan({ kind: 'off' })}
            style={{ ...seg(false), border: '1px solid #444', color: '#fff' }}
          >
            ✕ CLEAR
          </button>
        )}
        {scan.kind !== 'off' && status && status.loading && (
          <span style={{ fontSize: 12, fontWeight: 800, fontFamily: 'monospace', color: '#fff' }}>
            {scan.kind === 'screen' ? `SCREENING ${status.loaded}%...` : `SCANNING ${status.loaded}/${status.total}...`}
          </span>
        )}
      </div>
    </div>
  )
}
