'use client'

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'

interface FlowArenaProps {
  symbols: string[]
  groups?: { sectors: string[]; industries: string[]; special: string[] }
  names: Record<string, string>
  watchlistData: Record<string, any>
  sectorFlowData: Record<string, number>
  onPick: (symbol: string) => void
}

type Scope = 'ALL' | 'SECTORS' | 'INDUSTRIES' | 'SPECIAL' | 'HOLDINGS'

const TFS = [
  { key: '1D', field: 'change1d' },
  { key: 'WK', field: 'change5d' },
  { key: '13D', field: 'change13d' },
  { key: 'MONTH', field: 'change21d' },
  { key: 'QTR', field: 'change50d' },
  { key: 'YTD', field: 'changeYTD' },
] as const

const REGIMES = {
  LEADING: '#34d399',
  WEAKENING: '#fbbf24',
  IMPROVING: '#60a5fa',
  LAGGING: '#f87171',
} as const
type Regime = keyof typeof REGIMES

const PAD = { l: 44, r: 16, t: 12, b: 30 }

const navBtn: React.CSSProperties = { padding: '4px 10px', fontSize: 12, fontWeight: 800, border: '1px solid #333', borderRadius: 6, cursor: 'pointer', background: '#111', color: '#fff' }

const fmtMoney = (v: number) => {
  const a = Math.abs(v)
  const s = a >= 1e9 ? `${(a / 1e9).toFixed(1)}B` : a >= 1e6 ? `${Math.round(a / 1e6)}M` : `${Math.round(a / 1e3)}K`
  return `${v >= 0 ? '+' : '-'}$${s}`
}
const fmtPct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`

const FlowArena = memo(function FlowArena({ symbols: allSyms, groups, names, watchlistData, sectorFlowData, onPick }: FlowArenaProps) {
  const [scope, setScope] = useState<Scope>('ALL')
  const [tickerQ, setTickerQ] = useState('')
  const [holdEtf, setHoldEtf] = useState('XLK')
  const [holdings, setHoldings] = useState<{ syms: string[]; data: Record<string, any> } | null>(null)
  const [holdLoading, setHoldLoading] = useState(false)
  const holdingsMode = scope === 'HOLDINGS'

  useEffect(() => {
    if (!holdingsMode) return
    let cancelled = false
    setHoldLoading(true)
    setHoldings(null)
    ;(async () => {
      try {
        const r = await fetch(`/api/etf-holdings?etf=${holdEtf}&limit=40`)
        const j = await r.json()
        const syms: string[] = (j.symbols || []).filter((s: string) => s && s !== 'SPY')
        const days = Math.ceil((Date.now() - new Date(new Date().getFullYear() - 1, 11, 1).getTime()) / 86400000) + 5
        const br = await fetch('/api/bulk-historical-data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbols: syms, days }),
        })
        const bj = await br.json()
        const data: Record<string, any> = {}
        for (const s of syms) {
          const res = bj?.data?.[s]?.results
          if (Array.isArray(res) && res.length > 55) {
            const asc = [...res].reverse()
            data[s] = { bars: asc.slice(-260).map((b: any) => [b.t, b.c, b.h, b.l, b.v ?? 0]) }
          }
        }
        if (!cancelled) setHoldings({ syms: Object.keys(data), data })
      } catch {
        if (!cancelled) setHoldings({ syms: [], data: {} })
      } finally {
        if (!cancelled) setHoldLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [holdingsMode, holdEtf])

  const symbols = useMemo(() => {
    let list: string[]
    if (holdingsMode) list = holdings?.syms ?? []
    else if (scope === 'SECTORS') list = groups?.sectors ?? allSyms
    else if (scope === 'INDUSTRIES') list = groups?.industries ?? allSyms
    else if (scope === 'SPECIAL') list = groups?.special ?? allSyms
    else list = allSyms
    const q = tickerQ.split(/[,\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean)
    return q.length ? list.filter((s) => q.some((x) => s === x || s.startsWith(x))) : list
  }, [scope, holdingsMode, holdings, groups, allSyms, tickerQ])
  const srcData = holdingsMode ? (holdings?.data ?? {}) : watchlistData

  const [tfIdx, setTfIdx] = useState(1)
  const [hover, setHover] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [back, setBack] = useState(0)
  const [view, setView] = useState({ k: 1, x: 0, y: 0 })
  const [offs, setOffs] = useState<Record<string, { x: number; y: number }>>({})
  const [dragging, setDragging] = useState(false)
  const [size, setSize] = useState({ w: 900, h: 520 })
  const boxRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ kind: 'pan' | 'node'; sym?: string; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null)

  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const measure = () => setSize({ w: Math.max(320, el.clientWidth), h: Math.max(300, el.clientHeight) })
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    measure()
    return () => ro.disconnect()
  }, [])


  useEffect(() => setOffs({}), [tfIdx, back])

  const tf = TFS[tfIdx]
  const spy = watchlistData['SPY']
  const spyBars: number[][] | undefined = spy?.bars
  const maxBack = spyBars ? Math.min(spyBars.length - 60, 200) : 0
  const dateLabel = spyBars && spyBars[spyBars.length - 1 - back]
    ? new Date(spyBars[spyBars.length - 1 - back][0]).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'TODAY'
  const { w: W, h: H } = size
  const iw = W - PAD.l - PAD.r
  const ih = H - PAD.t - PAD.b
  const cx = PAD.l + iw / 2
  const cy = PAD.t + ih / 2
  const rMax = Math.max(16, Math.min(iw, ih) * 0.06)
  const rMin = rMax * 0.42

  const { nodes, winners, losers, info } = useMemo(() => {
    const info: Record<string, { rels: number[]; regime: Regime; flow: number; name: string }> = {}
    const raw: { symbol: string; flow: number; rel: number; move: number; regime: Regime }[] = []
    const seen = new Set<string>()

    // % change over n bars ending `back` bars before the latest bar
    const pctAt = (bars: number[][], n: number | 'ytd'): number | null => {
      const end = bars.length - 1 - back
      if (end < 1) return null
      let start: number
      if (n === 'ytd') {
        const yr = new Date(bars[end][0]).getFullYear()
        start = -1
        for (let i = end; i >= 0; i--) {
          if (new Date(bars[i][0]).getFullYear() < yr) { start = i; break }
        }
        if (start < 0) start = 0
      } else start = Math.max(0, end - n)
      const a = bars[start][1]
      return a ? ((bars[end][1] - a) / a) * 100 : null
    }
    // Estimated flow for past dates: close-location-weighted dollar volume over 5 bars
    const proxyFlow = (bars: number[][]) => {
      const end = bars.length - 1 - back
      let t = 0
      for (let i = Math.max(0, end - 4); i <= end; i++) {
        const [, c, h, l, v] = bars[i]
        const hl = h - l
        if (hl > 0) t += (((c - l) - (h - c)) / hl) * c * v
      }
      return t
    }
    const TF_N: (number | 'ytd')[] = [1, 5, 13, 21, 50, 'ytd']
    const spyRels = spyBars ? TF_N.map((n) => pctAt(spyBars, n)) : []

    for (const s of symbols) {
      if (!s || seen.has(s) || s === 'SPY') continue
      seen.add(s)
      const d = srcData[s]
      const bars: number[][] | undefined = d?.bars
      if (!d || !spy) continue
      let rels: number[]
      let flow: number
      let move: number
      if (!holdingsMode && (back === 0 || !bars || !spyBars)) {
        if (sectorFlowData[s] === undefined) continue
        flow = sectorFlowData[s]
        rels = TFS.map((t) => (d[t.field] == null ? 0 : d[t.field] - (spy[t.field] ?? 0)))
        move = Math.abs(d[tf.field] ?? 0)
      } else {
        if (!bars || !spyBars) continue
        const own = TF_N.map((n) => pctAt(bars, n))
        if (own.some((v) => v === null) || spyRels.some((v) => v === null)) continue
        rels = own.map((v, i) => (v as number) - (spyRels[i] as number))
        flow = proxyFlow(bars)
        move = Math.abs(own[tfIdx] as number)
      }
      const short = (rels[0] + rels[1] + rels[2]) / 3
      const long = (rels[3] + rels[4] + rels[5]) / 3
      const regime: Regime = long >= 0 ? (short >= 0 ? 'LEADING' : 'WEAKENING') : short >= 0 ? 'IMPROVING' : 'LAGGING'
      info[s] = { rels, regime, flow, name: s }
      raw.push({ symbol: s, flow, rel: rels[tfIdx], move, regime })
    }
    const maxFlow = Math.max(1, ...raw.map((p) => Math.abs(p.flow)))
    const maxRel = Math.max(0.5, ...raw.map((p) => Math.abs(p.rel))) * 1.08
    const maxMove = Math.max(0.1, ...raw.map((p) => p.move))
    const k = 0.04
    const norm = Math.log1p(1 / k)
    const xs = (f: number) => Math.sign(f) * (Math.log1p(Math.abs(f) / maxFlow / k) / norm)

    const nodes = raw.map((p) => ({
      ...p,
      r: rMin + Math.sqrt(p.move / maxMove) * (rMax - rMin),
      x: cx + xs(p.flow) * (iw / 2 - rMax),
      y: cy - (p.rel / maxRel) * (ih / 2 - rMax),
    }))
    for (let it = 0; it < 60; it++) {
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i]
          const b = nodes[j]
          let dx = b.x - a.x
          let dy = b.y - a.y
          let dist = Math.hypot(dx, dy)
          const min = a.r + b.r + 2
          if (dist < min) {
            if (dist < 0.01) { dx = 1; dy = 0; dist = 1 }
            const push = (min - dist) / 2
            a.x -= (dx / dist) * push
            a.y -= (dy / dist) * push
            b.x += (dx / dist) * push
            b.y += (dy / dist) * push
          }
        }
      }
      for (const n of nodes) {
        n.x = Math.min(PAD.l + iw - n.r, Math.max(PAD.l + n.r, n.x))
        n.y = Math.min(PAD.t + ih - n.r, Math.max(PAD.t + n.r, n.y))
      }
    }
    return {
      nodes,
      info,
      winners: raw.filter((p) => p.flow >= 0 && p.rel >= 0).length,
      losers: raw.filter((p) => p.flow < 0 && p.rel < 0).length,
    }
  }, [symbols, srcData, holdingsMode, watchlistData, sectorFlowData, tf, tfIdx, spy, spyBars, back, cx, cy, iw, ih, rMax, rMin])

  const toWorld = useCallback((px: number, py: number) => ({ x: (px - view.x) / view.k, y: (py - view.y) / view.k }), [view])

  const onWheel = (e: React.WheelEvent) => {
    const rect = boxRef.current?.getBoundingClientRect()
    if (!rect) return
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    setView((v) => {
      const k = Math.min(4, Math.max(0.6, v.k * (e.deltaY < 0 ? 1.12 : 1 / 1.12)))
      const wx = (mx - v.x) / v.k
      const wy = (my - v.y) / v.k
      return { k, x: mx - wx * k, y: my - wy * k }
    })
  }

  const startPan = (e: React.PointerEvent) => {
    drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y, moved: false }
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    setDragging(true)
  }
  const startNode = (e: React.PointerEvent, sym: string, x: number, y: number) => {
    // Bubbles are data points: pressing one pans the view like the background, a click selects it
    e.stopPropagation()
    drag.current = { kind: 'node', sym, sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y, moved: false }
    ;(e.currentTarget.ownerSVGElement as Element).setPointerCapture(e.pointerId)
    void x
    void y
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.sx
    const dy = e.clientY - d.sy
    if (Math.abs(dx) + Math.abs(dy) > 3) {
      if (!d.moved) setDragging(true)
      d.moved = true
    }
    if (d.moved) setView((v) => ({ ...v, x: d.ox + dx, y: d.oy + dy }))
  }
  const onUp = () => {
    const d = drag.current
    drag.current = null
    setDragging(false)
    if (d?.kind === 'node' && !d.moved && d.sym) setSelected((s) => (s === d.sym ? null : d.sym!))
    if (d?.kind === 'pan' && !d.moved) setSelected(null)
  }

  const fs = Math.max(10, Math.min(13, W / 80))
  const sel = selected ? info[selected] : null
  void toWorld

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: '#000', padding: '10px 14px 8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8, flexShrink: 0 }}>
        {(['ALL', 'SECTORS', 'INDUSTRIES', 'SPECIAL', 'HOLDINGS'] as Scope[]).map((s) => (
          <button
            key={s}
            onClick={() => setScope(s)}
            style={{ padding: '4px 11px', fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', borderRadius: 14, cursor: 'pointer', border: `1px solid ${scope === s ? '#FF6600' : '#333'}`, background: scope === s ? 'rgba(255,102,0,0.18)' : 'transparent', color: scope === s ? '#FF6600' : '#d1d5db' }}
          >
            {s}
          </button>
        ))}
        {holdingsMode && (
          <select
            value={holdEtf}
            onChange={(e) => setHoldEtf(e.target.value)}
            style={{ background: '#111', color: '#fff', border: '1px solid #FF6600', borderRadius: 6, padding: '4px 8px', fontSize: 12, fontWeight: 800 }}
          >
            {Array.from(new Set(allSyms.filter(Boolean))).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        )}
        <input
          value={tickerQ}
          onChange={(e) => setTickerQ(e.target.value.toUpperCase())}
          placeholder="TICKER(S)…"
          style={{ marginLeft: 'auto', width: 140, background: '#0b0b0b', color: '#fff', border: '1px solid #333', borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 700, outline: 'none' }}
        />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 6, flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
          {TFS.map((t, i) => (
            <button
              key={t.key}
              onClick={() => setTfIdx(i)}
              style={{ padding: '5px 12px', fontSize: 12, fontWeight: 800, letterSpacing: '0.1em', border: 'none', borderRadius: 6, cursor: 'pointer', background: i === tfIdx ? '#FF6600' : '#111', color: i === tfIdx ? '#000' : '#fff' }}
            >
              {t.key}
            </button>
          ))}
          <button
            onClick={() => { setView({ k: 1, x: 0, y: 0 }); setOffs({}) }}
            style={{ padding: '5px 10px', fontSize: 12, fontWeight: 800, letterSpacing: '0.1em', border: '1px solid #333', borderRadius: 6, cursor: 'pointer', background: 'transparent', color: '#9ca3af' }}
          >
            RESET
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em' }}>
          {(Object.keys(REGIMES) as Regime[]).map((r) => (
            <span key={r} style={{ color: REGIMES[r], display: 'flex', alignItems: 'center', gap: 4 }}>
              <i style={{ width: 8, height: 8, borderRadius: '50%', background: REGIMES[r], display: 'inline-block' }} />{r}
            </span>
          ))}
          <span style={{ color: '#34d399' }}>{winners} WIN</span>
          <span style={{ color: '#f87171' }}>{losers} LOSE</span>
        </div>
      </div>

      {maxBack > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '2px 0 6px', flexShrink: 0 }}>
          <button onClick={() => setBack((b) => Math.min(maxBack, b + 1))} style={navBtn}>◀</button>
          <input
            type="range"
            min={0}
            max={maxBack}
            step={1}
            value={maxBack - back}
            onChange={(e) => setBack(maxBack - Number(e.target.value))}
            style={{ flex: 1, accentColor: '#FF6600', cursor: 'pointer' }}
          />
          <button onClick={() => setBack((b) => Math.max(0, b - 1))} style={navBtn}>▶</button>
          <span style={{ minWidth: 150, textAlign: 'right', fontFamily: 'monospace', fontSize: 13, fontWeight: 800, color: back === 0 ? '#FF6600' : '#fff' }}>
            {back === 0 ? 'TODAY' : dateLabel}
          </span>
          {back !== 0 && (
            <button onClick={() => setBack(0)} style={{ ...navBtn, color: '#FF6600', borderColor: '#FF6600' }}>TODAY</button>
          )}
        </div>
      )}
      {back !== 0 || holdingsMode ? (
        <div style={{ fontSize: 10, color: '#6b7280', letterSpacing: '0.1em', marginBottom: 4 }}>
          FLOW ESTIMATED FROM PRICE × VOLUME
        </div>
      ) : null}
      {holdingsMode && holdLoading && <div style={{ fontSize: 11, color: '#FF6600', letterSpacing: '0.12em', marginBottom: 4 }}>LOADING {holdEtf} HOLDINGS…</div>}

      <div ref={boxRef} style={{ flex: 1, minHeight: 320, position: 'relative', overflow: 'hidden' }} onWheel={onWheel}>
        <svg
          width={W}
          height={H}
          style={{ position: 'absolute', inset: 0, display: 'block', cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none' }}
          onPointerDown={startPan}
          onPointerMove={onMove}
          onPointerUp={onUp}
        >
          <defs>
            <linearGradient id="faWin" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.2" />
            </linearGradient>
            <linearGradient id="faLose" x1="1" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ef4444" stopOpacity="0" />
              <stop offset="100%" stopColor="#ef4444" stopOpacity="0.2" />
            </linearGradient>
            <radialGradient id="sphGreen" cx="35%" cy="28%" r="80%">
              <stop offset="0%" stopColor="#d1fae5" />
              <stop offset="22%" stopColor="#34d399" />
              <stop offset="70%" stopColor="#047857" />
              <stop offset="100%" stopColor="#022c22" />
            </radialGradient>
            <radialGradient id="sphRed" cx="35%" cy="28%" r="80%">
              <stop offset="0%" stopColor="#fee2e2" />
              <stop offset="22%" stopColor="#f87171" />
              <stop offset="70%" stopColor="#b91c1c" />
              <stop offset="100%" stopColor="#450a0a" />
            </radialGradient>
            <radialGradient id="sphGloss" cx="35%" cy="25%" r="35%">
              <stop offset="0%" stopColor="#fff" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#fff" stopOpacity="0" />
            </radialGradient>
            <filter id="sphShadow" x="-50%" y="-50%" width="200%" height="220%">
              <feDropShadow dx="0" dy="6" stdDeviation="5" floodColor="#000" floodOpacity="0.9" />
            </filter>
          </defs>

          <rect x={cx} y={PAD.t} width={iw / 2} height={ih / 2} fill="url(#faWin)" />
          <rect x={PAD.l} y={cy} width={iw / 2} height={ih / 2} fill="url(#faLose)" />
          <line x1={PAD.l} x2={PAD.l + iw} y1={cy} y2={cy} stroke="#333" strokeDasharray="4 4" />

          <text x={PAD.l + iw - 6} y={PAD.t + fs + 2} textAnchor="end" fill="#34d399" fontSize={fs} fontWeight="800" letterSpacing="2">MONEY IN + BEATING SPY</text>
          <text x={PAD.l + 6} y={PAD.t + fs + 2} fill="#fbbf24" fontSize={fs} fontWeight="800" letterSpacing="2">BEATING SPY, MONEY LEAVING</text>
          <text x={PAD.l + iw - 6} y={PAD.t + ih - 8} textAnchor="end" fill="#60a5fa" fontSize={fs} fontWeight="800" letterSpacing="2">MONEY IN, LAGGING</text>
          <text x={PAD.l + 6} y={PAD.t + ih - 8} fill="#f87171" fontSize={fs} fontWeight="800" letterSpacing="2">MONEY OUT + LOSING TO SPY</text>
          <text x={cx} y={H - 8} textAnchor="middle" fill="#6b7280" fontSize={fs - 1} letterSpacing="2">OUTFLOW  ←  WEEKLY MONEY FLOW  →  INFLOW</text>
          <text transform={`translate(14 ${cy}) rotate(-90)`} textAnchor="middle" fill="#6b7280" fontSize={fs - 1} letterSpacing="2">{`${tf.key} VS SPY`}</text>

          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            {[...nodes]
              .sort((a, b) => (a.symbol === hover || a.symbol === selected ? 1 : 0) - (b.symbol === hover || b.symbol === selected ? 1 : 0))
              .map((p) => {
                const o = offs[p.symbol]
                const x = o ? o.x : p.x
                const y = o ? o.y : p.y
                const up = p.flow >= 0
                const active = hover === p.symbol || selected === p.symbol
                const ring = REGIMES[p.regime]
                const isDrag = dragging && drag.current?.sym === p.symbol
                return (
                  <g
                    key={p.symbol}
                    onPointerDown={(e) => startNode(e, p.symbol, x, y)}
                    onPointerEnter={() => setHover(p.symbol)}
                    onPointerLeave={() => setHover(null)}
                    onDoubleClick={() => onPick(p.symbol)}
                    style={{ cursor: 'pointer', transition: isDrag ? 'none' : 'transform 0.6s ease', transform: `translate(${x}px, ${y}px) scale(${active ? 1.12 : 1})` }}
                  >
                    <circle r={p.r} fill={up ? 'url(#sphGreen)' : 'url(#sphRed)'} filter="url(#sphShadow)" />
                    <circle r={p.r} fill="url(#sphGloss)" />
                    <circle r={p.r + 2.5} fill="none" stroke={ring} strokeWidth={active ? 3.5 : 2.5} strokeOpacity={0.95} />
                    <text textAnchor="middle" y={4} fill="#fff" fontSize={p.r > 18 ? 12 : 9.5} fontWeight="900" fontFamily="monospace" pointerEvents="none" style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.65)', strokeWidth: 2.5 }}>
                      {p.symbol}
                    </text>
                  </g>
                )
              })}
          </g>
        </svg>

        {(selected ? info[selected] : hover ? info[hover] : null) && (() => {
          const sym = (selected ?? hover)!
          const it = info[sym]
          const col = REGIMES[it.regime]
          return (
            <div style={{ position: 'absolute', right: 10, top: 10, width: 300, background: 'rgba(8,8,8,0.94)', border: `1px solid ${col}`, borderRadius: 8, padding: '10px 12px', pointerEvents: selected ? 'auto' : 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.8)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 900, color: '#fff' }}>{sym}</span>
                <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.12em', color: '#000', background: col, borderRadius: 4, padding: '2px 8px' }}>{it.regime}</span>
              </div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 6 }}>{names[sym] || sym}</div>
              <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 15, color: it.flow >= 0 ? '#34d399' : '#f87171', marginBottom: 8 }}>{fmtMoney(it.flow)} weekly flow</div>
              <div style={{ fontSize: 9, letterSpacing: '0.15em', color: '#6b7280', marginBottom: 4 }}>HISTORY · PERFORMANCE VS SPY</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 3 }}>
                {TFS.map((t, i) => {
                  const v = it.rels[i]
                  const mag = Math.min(1, Math.abs(v) / 6)
                  const c = v >= 0 ? '52,211,153' : '248,113,113'
                  return (
                    <div key={t.key} style={{ textAlign: 'center', padding: '5px 0', borderRadius: 4, background: `rgba(${c},${0.1 + mag * 0.5})`, outline: i === tfIdx ? '1px solid #FF6600' : 'none' }}>
                      <div style={{ fontSize: 8, color: '#d1d5db', fontWeight: 800 }}>{t.key}</div>
                      <div style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 800, color: `rgb(${c})` }}>{fmtPct(v)}</div>
                    </div>
                  )
                })}
              </div>
              {selected && (
                <button onClick={() => onPick(sym)} style={{ marginTop: 8, width: '100%', padding: '6px 0', fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', border: 'none', borderRadius: 5, cursor: 'pointer', background: '#FF6600', color: '#000' }}>
                  OPEN {sym} CHART
                </button>
              )}
            </div>
          )
        })()}
      </div>
    </div>
  )
})

export default FlowArena
