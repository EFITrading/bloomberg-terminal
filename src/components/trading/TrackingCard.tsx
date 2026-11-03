'use client'

import { memo, useEffect, useMemo, useRef, useState } from 'react'

export type TrackingTf = '1D' | '5D' | '1M' | '3M' | '6M' | '1Y'
export type TrackingChartType = 'line' | 'candles'

type Bar = { t: number; o: number; h: number; l: number; c: number }
type Prefs = { tf?: TrackingTf; type?: TrackingChartType; period?: StatPeriod }
type StatPeriod = '1W' | '1M' | '3M' | '6M' | '1Y' | 'YTD'

const TFS: TrackingTf[] = ['1D', '5D', '1M', '3M', '6M', '1Y']
const PERIODS: StatPeriod[] = ['1W', '1M', '3M', '6M', '1Y', 'YTD']
const TZ = 'America/Los_Angeles'
const PREFS_KEY = 'efi-tracking-card-prefs'

// ---- shared caches + request throttle (module level, shared by all cards) ----
const barsCache = new Map<string, Promise<Bar[]>>()
const infoCache = new Map<string, Promise<{ name: string; logo?: string }>>()
let active = 0
const waiting: Array<() => void> = []
const MAX_CONCURRENT = 6

async function throttled<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) await new Promise<void>((r) => waiting.push(r))
  active++
  try {
    return await fn()
  } finally {
    active--
    waiting.shift()?.()
  }
}

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const dayKey = (t: number) => new Date(t).toLocaleDateString('en-CA', { timeZone: TZ })

async function getJson(url: string): Promise<any> {
  for (let i = 0; i < 2; i++) {
    try {
      const res = await fetch(url)
      if (res.ok) return await res.json()
    } catch {
      /* retry once */
    }
    await new Promise((r) => setTimeout(r, 600))
  }
  return null
}

function fetchRaw(symbol: string, mult: number, span: string, backDays: number): Promise<Bar[]> {
  const key = `${symbol}|${mult}${span}|${backDays}`
  let p = barsCache.get(key)
  if (!p) {
    const to = new Date()
    const from = new Date()
    from.setDate(from.getDate() - backDays)
    const url = `/api/polygon/v2/aggs/ticker/${symbol}/range/${mult}/${span}/${ymd(from)}/${ymd(to)}?adjusted=true&sort=asc&limit=50000&apiKey=`
    p = throttled(() => getJson(url)).then((d) =>
      Array.isArray(d?.results)
        ? d.results.map((b: any) => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c }))
        : []
    )
    p.then((r) => {
      if (r.length === 0) barsCache.delete(key)
    })
    barsCache.set(key, p)
  }
  return p
}

export const dailyBars = (s: string) => fetchRaw(s, 1, 'day', 372)

async function fetchChartBars(symbol: string, tf: TrackingTf): Promise<Bar[]> {
  const now = Date.now()
  const DAY = 86400000
  if (tf === '1D') {
    const raw = await fetchRaw(symbol, 5, 'minute', 7)
    if (!raw.length) return raw
    const last = dayKey(raw[raw.length - 1].t)
    return raw.filter((b) => dayKey(b.t) === last)
  }
  if (tf === '5D') {
    const raw = await fetchRaw(symbol, 30, 'minute', 9)
    const days = Array.from(new Set(raw.map((b) => dayKey(b.t)))).slice(-5)
    return raw.filter((b) => days.includes(dayKey(b.t)))
  }
  if (tf === '1M') return fetchRaw(symbol, 1, 'hour', 31)
  const daily = await dailyBars(symbol)
  const span = tf === '3M' ? 92 : tf === '6M' ? 185 : 366
  return daily.filter((b) => b.t >= now - span * DAY)
}

function fetchInfo(symbol: string) {
  let p = infoCache.get(symbol)
  if (!p) {
    p = throttled(() => getJson(`/api/polygon/v3/reference/tickers/${symbol}?apiKey=`)).then((d) => {
      const raw = d?.results?.branding?.icon_url || d?.results?.branding?.logo_url
      return {
        name: (d?.results?.name as string) || symbol,
        logo: raw ? (raw as string).replace('https://api.polygon.io/', '/api/polygon/') : undefined,
      }
    })
    infoCache.set(symbol, p)
  }
  return p
}

const fmtPx = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtDate = (t: number, withYear = false) =>
  new Date(t).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(withYear ? { year: '2-digit' } : {}),
    timeZone: TZ,
  })
const fmtTime = (t: number) =>
  new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ })

function loadPrefs(symbol: string): Prefs {
  try {
    const all = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}')
    return all[symbol] || {}
  } catch {
    return {}
  }
}
function savePrefs(symbol: string, prefs: Prefs | null) {
  try {
    const all = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}')
    if (prefs && Object.keys(prefs).length) all[symbol] = prefs
    else delete all[symbol]
    localStorage.setItem(PREFS_KEY, JSON.stringify(all))
  } catch {
    /* storage unavailable */
  }
}

interface Props {
  symbol: string
  accent: string
  globalTf: TrackingTf
  globalType: TrackingChartType
  resetKey: number
  livePrice?: number
  badge?: { text: string; color: string }
  onOpen: () => void
}

const UP = '#22c55e'
const DOWN = '#ef4444'
const W = 400
const H = 170
const PAD_T = 8
const PAD_B = 8

function TrackingCard({ symbol, accent, globalTf, globalType, resetKey, livePrice, badge, onOpen }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [prefs, setPrefs] = useState<Prefs>(() => (typeof window === 'undefined' ? {} : loadPrefs(symbol)))
  const [bars, setBars] = useState<Bar[]>([])
  const [daily, setDaily] = useState<Bar[]>([])
  const [loading, setLoading] = useState(true)
  const [info, setInfo] = useState<{ name: string; logo?: string } | null>(null)
  const [hover, setHover] = useState<number | null>(null)
  const firstReset = useRef(true)

  const tf = prefs.tf ?? globalTf
  const type = prefs.type ?? globalType
  const period = prefs.period ?? '1M'

  useEffect(() => {
    if (firstReset.current) {
      firstReset.current = false
      return
    }
    setPrefs({})
    savePrefs(symbol, null)
  }, [resetKey, symbol])

  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (e) => {
        if (e[0].isIntersecting) {
          setVisible(true)
          io.disconnect()
        }
      },
      { rootMargin: '300px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (!visible) return
    let dead = false
    fetchInfo(symbol).then((i) => !dead && setInfo(i))
    dailyBars(symbol).then((d) => !dead && setDaily(d))
    return () => {
      dead = true
    }
  }, [visible, symbol])

  useEffect(() => {
    if (!visible) return
    let dead = false
    setLoading(true)
    fetchChartBars(symbol, tf).then((b) => {
      if (dead) return
      setBars(b)
      setLoading(false)
    })
    return () => {
      dead = true
    }
  }, [visible, symbol, tf])

  const update = (p: Prefs) => {
    const next = { ...prefs, ...p }
    setPrefs(next)
    savePrefs(symbol, next)
  }

  const last = bars[bars.length - 1]
  // Ignore a stale live price that is far from the latest bar
  const price =
    livePrice && last && Math.abs(livePrice - last.c) / last.c < 0.03
      ? livePrice
      : (last?.c ?? daily[daily.length - 1]?.c)
  const base = bars[0]?.o
  const change = price && base ? ((price - base) / base) * 100 : 0
  const color = change >= 0 ? UP : DOWN

  const geo = useMemo(() => {
    if (bars.length < 2) return null
    let min = Infinity
    let max = -Infinity
    for (const b of bars) {
      const lo = type === 'candles' ? b.l : b.c
      const hi = type === 'candles' ? b.h : b.c
      if (lo < min) min = lo
      if (hi > max) max = hi
    }
    const range = max - min || 1
    const y = (p: number) => PAD_T + ((max - p) / range) * (H - PAD_T - PAD_B)
    const x = (i: number) => ((i + 0.5) / bars.length) * W
    return { min, max, y, x }
  }, [bars, type])

  const stats = useMemo(() => {
    if (!daily.length || !price) return null
    const now = Date.now()
    const DAY = 86400000
    const yearStart = new Date(new Date().getFullYear(), 0, 1).getTime()
    const cutoff =
      period === 'YTD'
        ? yearStart
        : now - { '1W': 7, '1M': 31, '3M': 92, '6M': 185, '1Y': 366 }[period] * DAY
    const set = daily.filter((b) => b.t >= cutoff)
    if (!set.length) return null
    let lo = set[0]
    let hi = set[0]
    for (const b of set) {
      if (b.l < lo.l) lo = b
      if (b.h > hi.h) hi = b
    }
    return {
      low: lo.l,
      lowT: lo.t,
      fromLow: ((price - lo.l) / lo.l) * 100,
      high: hi.h,
      highT: hi.t,
      fromHigh: ((price - hi.h) / hi.h) * 100,
    }
  }, [daily, period, price])

  const intraday = tf === '1D' || tf === '5D' || tf === '1M'
  const xLabels = useMemo(() => {
    if (bars.length < 2) return []
    return [0, 1, 2, 3, 4].map((k) => {
      const i = Math.round((k * (bars.length - 1)) / 4)
      const t = bars[i].t
      return { pct: (i / (bars.length - 1)) * 100, text: tf === '1D' ? fmtTime(t) : fmtDate(t) }
    })
  }, [bars, tf])

  const sessionBands = useMemo(() => {
    if (tf === '3M' || tf === '6M' || tf === '1Y' || bars.length < 2) return []
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
    })
    const kindOf = (t: number): 'pre' | 'reg' | 'post' => {
      const parts = fmt.formatToParts(new Date(t))
      const mins = Number(parts.find((p) => p.type === 'hour')?.value) * 60 + Number(parts.find((p) => p.type === 'minute')?.value)
      return mins < 9 * 60 + 30 ? 'pre' : mins >= 16 * 60 ? 'post' : 'reg'
    }
    const out: { kind: 'pre' | 'post'; from: number; to: number }[] = []
    let cur: { kind: 'pre' | 'post'; from: number; to: number } | null = null
    bars.forEach((b, i) => {
      const k = kindOf(b.t)
      if (k === 'reg') {
        cur = null
      } else if (cur && cur.kind === k) {
        cur.to = i + 1
      } else {
        cur = { kind: k, from: i, to: i + 1 }
        out.push(cur)
      }
    })
    return out
  }, [bars, tf])

  const hb = hover != null ? bars[hover] : null

  const btn = (on: boolean): React.CSSProperties => ({
    padding: '2px 7px',
    fontSize: 10,
    fontWeight: 800,
    fontFamily: 'monospace',
    letterSpacing: '0.4px',
    borderRadius: 4,
    border: 'none',
    cursor: 'pointer',
    background: on ? 'rgba(255,102,0,0.16)' : 'transparent',
    color: on ? '#FF6600' : '#ffffff',
  })

  return (
    <div
      ref={rootRef}
      className="rounded-lg"
      style={{
        background: 'linear-gradient(160deg,#0c0c0e 0%,#141417 100%)',
        border: `1px solid ${accent}40`,
        boxShadow: '0 4px 14px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)',
        padding: 10,
      }}
    >
      {/* Header: logo, ticker, name, price */}
      <div className="flex items-center gap-2" style={{ cursor: 'pointer' }} onClick={onOpen}>
        <span
          style={{
            background: 'rgba(255,255,255,0.08)',
            borderRadius: 4,
            padding: '2px 7px',
            fontWeight: 900,
            fontSize: 12,
            color: '#fff',
          }}
        >
          {symbol}
        </span>
        {badge && (
          <span
            style={{
              color: badge.color,
              border: `1px solid ${badge.color}66`,
              background: `${badge.color}1a`,
              borderRadius: 4,
              padding: '2px 6px',
              fontSize: 11,
              fontWeight: 800,
              fontFamily: 'monospace',
              whiteSpace: 'nowrap',
            }}
          >
            {badge.text}
          </span>
        )}
        <span
          className="truncate"
          style={{ color: '#ffffff', fontSize: 11, minWidth: 0, flex: 1 }}
          title={info?.name}
        >
          {info?.name ?? ''}
        </span>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ color: '#fff', fontWeight: 800, fontSize: 14, lineHeight: 1.1 }}>
            {price ? `$${fmtPx(price)}` : '--'}
          </div>
          <div style={{ color, fontWeight: 800, fontSize: 11 }}>
            {change >= 0 ? '+' : ''}
            {change.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* Per-card controls */}
      <div className="flex items-center justify-between gap-1" style={{ margin: '8px 0 4px' }}>
        <div className="flex items-center" style={{ gap: 1 }}>
          {TFS.map((t) => (
            <button key={t} style={btn(tf === t)} onClick={() => update({ tf: t })}>
              {t}
            </button>
          ))}
        </div>
        <div
          className="flex items-center"
          style={{ border: '1px solid #26262b', borderRadius: 5, padding: 1 }}
        >
          <button style={btn(type === 'line')} onClick={() => update({ type: 'line' })} title="Line">
            LINE
          </button>
          <button
            style={btn(type === 'candles')}
            onClick={() => update({ type: 'candles' })}
            title="Candles"
          >
            CANDLES
          </button>
        </div>
      </div>

      {/* Chart */}
      <div style={{ position: 'relative', height: H, marginRight: 62 }}>
        {geo ? (
          <>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="none"
              style={{ width: '100%', height: '100%', display: 'block' }}
              onMouseMove={(e) => {
                const r = e.currentTarget.getBoundingClientRect()
                const i = Math.floor(((e.clientX - r.left) / r.width) * bars.length)
                setHover(Math.max(0, Math.min(bars.length - 1, i)))
              }}
              onMouseLeave={() => setHover(null)}
            >
              <defs>
                <linearGradient id={`tc-${symbol}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity="0.28" />
                  <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
              </defs>
              {sessionBands.map((s, i) => (
                <rect
                  key={i}
                  x={(s.from / bars.length) * W}
                  y={0}
                  width={((s.to - s.from) / bars.length) * W}
                  height={H}
                  fill={s.kind === 'pre' ? 'rgba(255,152,0,0.10)' : 'rgba(59,130,246,0.12)'}
                />
              ))}
              {[0.25, 0.5, 0.75].map((g) => (
                <line
                  key={g}
                  x1="0"
                  x2={W}
                  y1={H * g}
                  y2={H * g}
                  stroke="rgba(255,255,255,0.05)"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {base && (
                <line
                  x1="0"
                  x2={W}
                  y1={geo.y(base)}
                  y2={geo.y(base)}
                  stroke="#555"
                  strokeDasharray="3 3"
                  opacity="0.6"
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {type === 'line' ? (
                <>
                  <polygon
                    fill={`url(#tc-${symbol})`}
                    points={`0,${H} ${bars.map((b, i) => `${geo.x(i).toFixed(1)},${geo.y(b.c).toFixed(1)}`).join(' ')} ${W},${H}`}
                  />
                  <polyline
                    fill="none"
                    stroke={color}
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                    points={bars.map((b, i) => `${geo.x(i).toFixed(1)},${geo.y(b.c).toFixed(1)}`).join(' ')}
                  />
                </>
              ) : (
                bars.map((b, i) => {
                  const c = b.c >= b.o ? UP : DOWN
                  const bw = Math.max(0.8, (W / bars.length) * 0.7)
                  const top = geo.y(Math.max(b.o, b.c))
                  const hgt = Math.max(0.8, Math.abs(geo.y(b.o) - geo.y(b.c)))
                  return (
                    <g key={b.t}>
                      <line
                        x1={geo.x(i)}
                        x2={geo.x(i)}
                        y1={geo.y(b.h)}
                        y2={geo.y(b.l)}
                        stroke={c}
                        strokeWidth="1"
                        vectorEffect="non-scaling-stroke"
                      />
                      <rect x={geo.x(i) - bw / 2} y={top} width={bw} height={hgt} fill={c} />
                    </g>
                  )
                })
              )}
              {price && (
                <line
                  x1="0"
                  x2={W}
                  y1={Math.min(H - 2, Math.max(2, geo.y(price)))}
                  y2={Math.min(H - 2, Math.max(2, geo.y(price)))}
                  stroke={color}
                  strokeDasharray="1 3"
                  opacity="0.7"
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {hover != null && (
                <line
                  x1={geo.x(hover)}
                  x2={geo.x(hover)}
                  y1="0"
                  y2={H}
                  stroke="rgba(255,255,255,0.4)"
                  strokeDasharray="2 2"
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </svg>

            {/* Y axis labels */}
            {[0, 0.33, 0.66, 1].map((g) => (
              <span
                key={g}
                style={{
                  position: 'absolute',
                  left: '100%',
                  paddingLeft: 6,
                  top: `${((PAD_T + g * (H - PAD_T - PAD_B)) / H) * 100}%`,
                  transform: 'translateY(-50%)',
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#ffffff',
                  fontFamily: 'monospace',
                }}
              >
                {fmtPx(geo.max - g * (geo.max - geo.min))}
              </span>
            ))}
            {price && (
              <span
                style={{
                  position: 'absolute',
                  left: '100%',
                  marginLeft: 2,
                  top: `${(Math.min(H - 2, Math.max(2, geo.y(price))) / H) * 100}%`,
                  transform: 'translateY(-50%)',
                  background: color,
                  color: '#000',
                  fontSize: 12,
                  fontWeight: 800,
                  fontFamily: 'monospace',
                  padding: '1px 4px',
                  borderRadius: 2,
                }}
              >
                {fmtPx(price)}
              </span>
            )}

            {/* Hover readout */}
            {hb && (
              <div
                style={{
                  position: 'absolute',
                  top: 2,
                  left: 4,
                  fontSize: 10,
                  fontFamily: 'monospace',
                  color: '#e5e7eb',
                  background: 'rgba(0,0,0,0.7)',
                  padding: '2px 6px',
                  borderRadius: 3,
                  pointerEvents: 'none',
                }}
              >
                {fmtDate(hb.t, true)}
                {intraday ? ` ${fmtTime(hb.t)}` : ''}{' '}
                {type === 'candles'
                  ? `O ${fmtPx(hb.o)} H ${fmtPx(hb.h)} L ${fmtPx(hb.l)} C ${fmtPx(hb.c)}`
                  : fmtPx(hb.c)}
              </div>
            )}
          </>
        ) : (
          <div
            className="flex items-center justify-center"
            style={{ height: '100%', color: '#e5e7eb', fontSize: 11 }}
          >
            {loading ? 'Loading...' : 'No data'}
          </div>
        )}
      </div>

      {/* X axis labels */}
      <div style={{ position: 'relative', height: 18, marginRight: 62, marginTop: 3 }}>
        {xLabels.map((l, k) => (
          <span
            key={k}
            style={{
              position: 'absolute',
              left: `${l.pct}%`,
              transform: k === 0 ? 'none' : k === 4 ? 'translateX(-100%)' : 'translateX(-50%)',
              fontSize: 12,
              fontWeight: 700,
              color: '#ffffff',
              fontFamily: 'monospace',
            }}
          >
            {l.text}
          </span>
        ))}
      </div>

      {/* Low / High vs now */}
      <div style={{ marginTop: 8, borderTop: '1px solid #1f1f24', paddingTop: 6 }}>
        <div className="flex items-center" style={{ gap: 1, marginBottom: 5 }}>
          <span style={{ fontSize: 11, color: '#FF8A33', fontWeight: 900, letterSpacing: '1px', marginRight: 6 }}>RANGE</span>
          {PERIODS.map((p) => (
            <button key={p} style={btn(period === p)} onClick={() => update({ period: p })}>
              {p}
            </button>
          ))}
        </div>
        {stats ? (
          <div className="grid grid-cols-2 gap-2" style={{ fontFamily: 'monospace' }}>
            <div style={{ background: 'rgba(239,68,68,0.07)', borderRadius: 5, padding: '4px 8px' }}>
              <div style={{ fontSize: 9, color: '#ffffff', fontWeight: 800 }}>
                LOW · {fmtDate(stats.lowT, true)}
              </div>
              <div style={{ fontSize: 12, color: '#fff', fontWeight: 800 }}>
                ${fmtPx(stats.low)}{' '}
                <span style={{ color: UP, fontSize: 11 }}>
                  {stats.fromLow >= 0 ? '+' : ''}
                  {stats.fromLow.toFixed(1)}%
                </span>
              </div>
            </div>
            <div style={{ background: 'rgba(34,197,94,0.07)', borderRadius: 5, padding: '4px 8px' }}>
              <div style={{ fontSize: 9, color: '#ffffff', fontWeight: 800 }}>
                HIGH · {fmtDate(stats.highT, true)}
              </div>
              <div style={{ fontSize: 12, color: '#fff', fontWeight: 800 }}>
                ${fmtPx(stats.high)}{' '}
                <span style={{ color: stats.fromHigh >= 0 ? UP : DOWN, fontSize: 11 }}>
                  {stats.fromHigh >= 0 ? '+' : ''}
                  {stats.fromHigh.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 10, color: '#e5e7eb' }}>Loading range stats...</div>
        )}
      </div>
    </div>
  )
}

export default memo(TrackingCard)
