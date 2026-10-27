'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas } from '@react-three/fiber'
import {
  PIECE_NAMES,
  SIDE_CAPACITY,
  applyMove,
  chooseMove,
  hashString,
  mulberry32,
  narrate,
  outcome,
  pickSide,
  placePiece,
  sq,
  type Move,
  type Outcome,
  type Piece,
  type Side,
  type Signal,
} from '@/lib/royalExchange/engine'
import {
  COLORS,
  GOLD,
  KIND_COLOR,
  MONO,
  Scene,
  SidePanel,
  buildSignal,
  classify,
  fetchJson,
  fmtClock,
  gexExtremes,
  type GexRow,
  type LogEntry,
  type MarketRow,
} from './RoyalExchangeParts'

interface StaticRow {
  ticker: string
  isEtf: boolean
  beta: number
  marketCap: number
  rets: number[]
  mom5: number
  rs20: number
  rsPct: number
  rsCrit: number
  relVol: number
  prevClose: number
  px: number[]
  tc: number[]
  tp: number[]
  dc: number[]
  dp: number[]
}
interface DayPayload {
  mode: 'live' | 'recap'
  tradingDate: string
  startMs: number
  bucketMs: number
  buckets: number
  openBucket: number
  flowTrades: number
  tickers: StaticRow[]
}
interface Snap {
  t: number
  bucket: number
  pieces: Piece[]
  last: Move | null
  turn: Side
  result: Outcome
  gameNo: number
  ply: number
  deployed: number
  entry?: LogEntry
}

const CAP = SIDE_CAPACITY * 2
const PLIES_PER_BUCKET = 2

// Replays the whole session from the saved flow DB and intraday prices: pieces deploy as tickers qualify,
// then the game is played bucket by bucket using only what was known at that time.
export function simulate(day: DayPayload, gex: Map<string, GexRow>) {
  const rows = day.tickers
  const nb = day.buckets
  const ext = gexExtremes(gex)
  const prefix = rows.map((r) => {
    const f = (a: number[]) => {
      const o = [0]
      for (let i = 0; i < nb; i++) o.push(o[i] + (a[i] ?? 0))
      return o
    }
    return { tc: f(r.tc), tp: f(r.tp), dc: f(r.dc), dp: f(r.dp) }
  })
  const share = (c: number, p: number) => (c + p > 0 ? (c - p) / (c + p) : 0)
  const rowAt = (i: number, b: number): MarketRow => {
    const r = rows[i]
    const p = prefix[i]
    const lo = Math.max(0, b - 3)
    const chg = r.prevClose ? ((r.px[b] ?? r.prevClose) / r.prevClose - 1) * 100 : 0
    return {
      ticker: r.ticker,
      isEtf: r.isEtf,
      beta: r.beta,
      marketCap: r.marketCap,
      rets: r.rets,
      price: r.px[b] ?? r.prevClose,
      chg,
      mom: 0.5 * Math.tanh(chg / 2) + 0.5 * Math.tanh(r.mom5 / 5),
      mom5: r.mom5,
      rs20: r.rs20,
      rsPct: r.rsPct,
      rsCrit: r.rsCrit,
      relVol: r.relVol,
      traderPrem: p.tc[b + 1] + p.tp[b + 1],
      dealerPrem: p.dc[b + 1] + p.dp[b + 1],
      traderDir: share(p.tc[b + 1], p.tp[b + 1]),
      dealerDir: share(p.dc[b + 1], p.dp[b + 1]),
      recentTrader: p.tc[b + 1] - p.tc[lo] + (p.tp[b + 1] - p.tp[lo]),
      recentDealer: p.dc[b + 1] - p.dc[lo] + (p.dp[b + 1] - p.dp[lo]),
    }
  }

  const rng = mulberry32(hashString(day.tradingDate))
  const dep = { T: [] as string[], D: [] as string[] }
  const sideOf = new Map<string, Side>()
  const snaps: Snap[] = []
  const sigs: Record<string, Signal>[] = []
  let pieces: Piece[] = []
  let game = 1
  let ply = 0
  let turn: Side = 'T'
  let streak = 0
  let result: Outcome = 'ongoing'
  const rebuild = () => [...dep.T.map((t, i) => placePiece('T', i, t)), ...dep.D.map((t, i) => placePiece('D', i, t))]

  for (let b = 0; b < nb; b++) {
    const tb = day.startMs + b * day.bucketMs
    const atRows = rows.map((_, i) => rowAt(i, b))
    const sg: Record<string, Signal> = {}
    atRows.forEach((ra) => {
      const e = ext.get(ra.ticker)
      sg[ra.ticker] = buildSignal(ra, gex.get(ra.ticker), e, sideOf.get(ra.ticker) ?? classify(ra, e).side)
    })
    sigs.push(sg)
    const push = (t: number, entry?: LogEntry, last: Move | null = null) =>
      snaps.push({ t, bucket: b, pieces, last, turn, result, gameNo: game, ply, deployed: dep.T.length + dep.D.length, entry })

    // deployment: full board by the open
    const target = b < day.openBucket ? Math.ceil((CAP * (b + 1)) / day.openBucket) : CAP
    let k = 0
    while (dep.T.length + dep.D.length < target && k < 14) {
      const pool = atRows
        .filter((r) => !sideOf.has(r.ticker))
        .map((r) => ({ r, ...classify(r, ext.get(r.ticker)) }))
        .sort((a, c) => c.conviction - a.conviction)
      if (!pool.length) break
      const first = pool.find((x) => dep[x.side].length < SIDE_CAPACITY)
      const choice = first ?? { r: pool[0].r, side: (pool[0].side === 'T' ? 'D' : 'T') as Side }
      if (dep[choice.side].length >= SIDE_CAPACITY) break
      const idx = dep[choice.side].length
      dep[choice.side].push(choice.r.ticker)
      sideOf.set(choice.r.ticker, choice.side)
      pieces = [...pieces, placePiece(choice.side, idx, choice.r.ticker)]
      k++
      push(tb + k * 20000)
    }

    if (b >= day.openBucket && dep.T.length > 0 && dep.D.length > 0) {
      if (result !== 'ongoing') {
        game++
        ply = 0
        turn = 'T'
        streak = 0
        result = 'ongoing'
        pieces = rebuild()
        push(tb)
      }
      for (let i = 0; i < PLIES_PER_BUCKET; i++) {
        const d = chooseMove(pieces, turn, sg, rng)
        if (!d) break
        const note = narrate(d, sg)
        const next = applyMove(pieces, d.move)
        ply++
        const mover = turn
        const res = outcome(next, mover === 'T' ? 'D' : 'T')
        pieces = next
        result = res === 'ongoing' && ply >= 160 ? 'draw' : res
        const ns = pickSide(next, sg, mover, streak, rng)
        streak = ns === mover ? streak + 1 : 1
        turn = ns
        push(tb + ((i + 1) * day.bucketMs) / (PLIES_PER_BUCKET + 1), { n: ply, side: mover, text: note.text, kind: note.kind }, d.move)
        if (result !== 'ongoing') break
      }
    }
  }
  return { snaps, sigs }
}

export default function RoyalExchange() {
  const [day, setDay] = useState<DayPayload | null>(null)
  const [error, setError] = useState(false)
  const [gexVersion, setGexVersion] = useState(0)
  const [viewT, setViewT] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const [pulses, setPulses] = useState<{ id: number; x: number; y: number; color: string }[]>([])

  const dayKey = useRef('')
  const gexRows = useRef<Map<string, GexRow>>(new Map())
  const gexInflight = useRef(false)
  const pulseId = useRef(0)
  const prevIdx = useRef(-1)

  const loadGex = useCallback(async (d: DayPayload) => {
    if (gexInflight.current) return
    gexInflight.current = true
    const total = (r: StaticRow) => [r.tc, r.tp, r.dc, r.dp].reduce((s, a) => s + a.reduce((x, y) => x + y, 0), 0)
    const ranked = [...d.tickers]
      .sort((a, b) => total(b) - total(a))
      .map((r) => r.ticker)
      .filter((t) => !gexRows.current.has(t))
      .slice(0, 60)
    for (let i = 0; i < ranked.length; i += 20) {
      const chunk = ranked.slice(i, i + 20)
      // 45-day net gamma, the same calculation the GEX screener / sidebar chart uses
      const g = await fetchJson<{ data?: GexRow[] }>(`/api/gex-screener?symbols=${chunk.join(',')}&limit=${chunk.length}&expirationFilter=Default`, 240000)
      g?.data?.forEach((row) => gexRows.current.set(row.ticker, row))
      setGexVersion((v) => v + 1)
    }
    gexInflight.current = false
  }, [])

  const loadDay = useCallback(async () => {
    const d = await fetchJson<DayPayload>('/api/royal-exchange', 270000)
    if (!d || !d.tickers?.length || !d.buckets) {
      setError(true)
      return
    }
    setError(false)
    const key = `${d.tradingDate}|${d.buckets}|${d.flowTrades}`
    if (key !== dayKey.current) {
      dayKey.current = key
      setDay(d)
    }
    loadGex(d)
  }, [loadGex])

  useEffect(() => {
    loadDay()
    const t = setInterval(loadDay, 45000)
    const g = setInterval(() => {
      gexRows.current.clear()
    }, 15 * 60 * 1000)
    return () => {
      clearInterval(t)
      clearInterval(g)
    }
  }, [loadDay])

  const sim = useMemo(() => (day ? simulate(day, gexRows.current) : null), [day, gexVersion]) // eslint-disable-line react-hooks/exhaustive-deps
  const snaps = useMemo(() => sim?.snaps ?? [], [sim])
  const lastIdx = snaps.length - 1
  const latestT = lastIdx >= 0 ? snaps[lastIdx].t : (day?.startMs ?? 0)
  const idx = useMemo(() => {
    if (lastIdx < 0) return -1
    if (viewT === null) return lastIdx
    let lo = 0
    let hi = lastIdx
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (snaps[mid].t <= viewT) lo = mid
      else hi = mid - 1
    }
    return lo
  }, [snaps, lastIdx, viewT])
  const snap = idx >= 0 ? snaps[idx] : null

  // playback through the day
  useEffect(() => {
    if (!playing || !day) return
    const t = setInterval(() => {
      setViewT((v) => {
        const next = (v ?? day.startMs) + day.bucketMs
        if (next >= latestT) {
          setPlaying(false)
          return null
        }
        return next
      })
    }, 1100)
    return () => clearInterval(t)
  }, [playing, day, latestT])

  // ring on the square where a capture just happened
  useEffect(() => {
    const prev = prevIdx.current
    prevIdx.current = idx
    if (!snap?.last?.captureId || idx <= prev || idx - prev > 3) return
    const id = ++pulseId.current
    const mover = snap.pieces.find((p) => p.id === snap.last!.pieceId)
    setPulses((p) => [...p, { id, x: snap.last!.tx, y: snap.last!.ty, color: mover?.side === 'T' ? '#2dffa8' : '#ff5470' }])
  }, [idx, snap])
  const donePulse = useCallback((id: number) => setPulses((p) => p.filter((x) => x.id !== id)), [])

  const signals = (snap && sim?.sigs[snap.bucket]) || {}
  const shownPieces = snap?.pieces ?? []
  const capT = shownPieces.filter((p) => p.side === 'T' && !p.alive)
  const capD = shownPieces.filter((p) => p.side === 'D' && !p.alive)
  const aliveT = shownPieces.filter((p) => p.side === 'T' && p.alive)
  const aliveD = shownPieces.filter((p) => p.side === 'D' && p.alive)

  const recent: (LogEntry & { t: number })[] = []
  for (let i = idx; i >= 0 && recent.length < 5 && snaps[i].gameNo === snap?.gameNo; i--) {
    const e = snaps[i].entry
    if (e) recent.push({ ...e, t: snaps[i].t })
  }
  const lastPiece = snap?.last ? shownPieces.find((p) => p.id === snap.last!.pieceId) : null
  const banner = snap?.result === 'T-wins' ? 'SQUEEZE — TRADERS WIN' : snap?.result === 'D-wins' ? 'MARGIN CALL — MARKET MAKER WINS' : snap?.result === 'draw' ? 'RANGE-BOUND — DRAW' : ''

  const startT = day?.startMs ?? 0
  const clock = snap ? `${fmtClock(viewT ?? snap.t)} PT` : ''
  const following = viewT === null
  let statusText: string
  let statusColor = '#9aa5ba'
  if (!day) {
    statusText = error ? 'NO DATA — FLOW DB / POLYGON UNAVAILABLE' : 'SCANNING THE MARKET…'
    statusColor = error ? '#ff5470' : '#ffe066'
  } else if (snap && snap.bucket < day.openBucket) {
    statusText = `PRE-MARKET · ${clock} · DEPLOYED ${snap.deployed}/${CAP}`
    statusColor = '#ffe066'
  } else if (day.mode === 'live' && following) {
    statusText = `LIVE · ${clock}`
    statusColor = '#2dffa8'
  } else {
    statusText = `${day.mode === 'live' ? 'REPLAY' : `RECAP OF ${day.tradingDate}`} · ${clock}`
    statusColor = '#ffa94d'
  }

  const step = (dir: 1 | -1) => {
    if (!day) return
    setPlaying(false)
    const base = viewT ?? latestT
    const next = base + dir * day.bucketMs
    if (next >= latestT) setViewT(null)
    else setViewT(Math.max(startT, next))
  }
  const hourTicks = day ? Array.from({ length: 8 }, (_, h) => startT + h * 3600000).filter((t) => t <= latestT) : []
  const span = Math.max(1, latestT - startT)

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: 560, background: '#04060a', fontFamily: MONO, overflow: 'hidden' }}>
      <Canvas shadows camera={{ position: [0, 11, 13.5], fov: 38 }} dpr={[1, 1.75]} gl={{ toneMapping: THREE.ACESFilmicToneMapping }}>
        <Scene pieces={shownPieces} signals={signals} last={snap?.last ?? null} pulses={pulses} donePulse={donePulse} gameNo={snap?.gameNo ?? 1} />
      </Canvas>

      <div style={{ position: 'absolute', top: 18, left: 0, right: 0, textAlign: 'center', pointerEvents: 'none' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 22 }}>
          <span style={{ width: 90, height: 2, background: `linear-gradient(90deg, transparent, ${GOLD})` }} />
          <span style={{ color: GOLD, fontSize: 16 }}>◆</span>
          <div
            style={{
              fontFamily: "'Palatino Linotype','Book Antiqua',Palatino,Georgia,serif",
              fontSize: 58,
              fontWeight: 700,
              letterSpacing: 14,
              paddingLeft: 14,
              lineHeight: 1,
              background: 'linear-gradient(180deg,#fff6d6 0%,#f0cf7a 45%,#a8801f 100%)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
              filter: 'drop-shadow(0 4px 18px rgba(230,195,106,0.4))',
            }}
          >
            ROYAL EXCHANGE
          </div>
          <span style={{ color: GOLD, fontSize: 16 }}>◆</span>
          <span style={{ width: 90, height: 2, background: `linear-gradient(270deg, transparent, ${GOLD})` }} />
        </div>
        <div style={{ marginTop: 12 }}>
          <span style={{ display: 'inline-block', color: statusColor, fontSize: 14, fontWeight: 700, letterSpacing: 3, padding: '6px 18px', borderRadius: 999, background: 'rgba(5,8,14,0.7)', border: `1px solid ${statusColor}66` }}>
            ● {statusText}
          </span>
        </div>
      </div>

      <div style={{ position: 'absolute', top: 140, left: 18, pointerEvents: 'none' }}>
        <SidePanel side="T" captured={capT} alive={aliveT} signals={signals} />
      </div>
      <div style={{ position: 'absolute', top: 140, right: 18, pointerEvents: 'none' }}>
        <SidePanel side="D" captured={capD} alive={aliveD} signals={signals} />
      </div>

      {banner && (
        <div style={{ position: 'absolute', top: '40%', left: 0, right: 0, textAlign: 'center', pointerEvents: 'none' }}>
          <span style={{ color: '#fff', fontSize: 32, fontWeight: 800, letterSpacing: 8, background: 'rgba(0,0,0,0.78)', border: `1px solid ${GOLD}`, padding: '14px 34px', borderRadius: 8 }}>{banner}</span>
        </div>
      )}

      {day && snaps.length > 0 && (
        <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: 196, width: 'min(900px, 92%)', background: 'rgba(5,8,14,0.88)', border: `1px solid ${GOLD}55`, borderRadius: 10, padding: '10px 16px 6px', backdropFilter: 'blur(8px)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {[
              { label: '⏮', title: 'Session start', go: () => { setPlaying(false); setViewT(startT) } },
              { label: '◀', title: 'Back 5 minutes', go: () => step(-1) },
              { label: playing ? '⏸' : '▶', title: playing ? 'Pause' : 'Play the day', go: () => { if (playing) setPlaying(false); else { if (viewT === null) setViewT(startT); setPlaying(true) } } },
              { label: '▶|', title: 'Forward 5 minutes', go: () => step(1) },
            ].map((b) => (
              <button key={b.title} title={b.title} onClick={b.go} style={{ background: '#141a26', color: GOLD, border: `1px solid ${GOLD}55`, borderRadius: 6, fontSize: 15, minWidth: 40, height: 32, cursor: 'pointer' }}>
                {b.label}
              </button>
            ))}
            <input
              type="range"
              min={startT}
              max={Math.max(latestT, startT + 1)}
              step={60000}
              value={viewT ?? latestT}
              onChange={(e) => {
                const v = parseInt(e.target.value)
                setPlaying(false)
                setViewT(v >= latestT - 30000 ? null : v)
              }}
              style={{ flex: 1, accentColor: GOLD, cursor: 'pointer' }}
            />
            <span style={{ color: '#fff', fontSize: 16, fontWeight: 700, minWidth: 96, textAlign: 'right' }}>{clock}</span>
            <button
              onClick={() => { setPlaying(false); setViewT(null) }}
              style={{ background: following ? '#0b6e52' : '#141a26', color: '#fff', border: `1px solid ${following ? COLORS.T.glow : GOLD}`, borderRadius: 6, fontSize: 13, fontWeight: 800, letterSpacing: 2, height: 32, padding: '0 12px', cursor: 'pointer' }}
            >
              {day.mode === 'live' ? 'LIVE' : 'END'}
            </button>
          </div>
          <div style={{ position: 'relative', height: 18, marginLeft: 190, marginRight: 150 }}>
            {hourTicks.map((t) => (
              <span key={t} style={{ position: 'absolute', left: `${((t - startT) / span) * 100}%`, transform: 'translateX(-50%)', fontSize: 11, color: '#7f8aa0' }}>
                {fmtClock(t)}
              </span>
            ))}
          </div>
        </div>
      )}

      <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: 16, width: 'min(1040px, 94%)', background: 'rgba(5,8,14,0.86)', border: `1px solid ${GOLD}55`, borderRadius: 10, padding: '12px 18px', pointerEvents: 'none', backdropFilter: 'blur(8px)' }}>
        {lastPiece && snap?.last && (
          <div style={{ color: GOLD, fontSize: 15, marginBottom: 8, letterSpacing: 2, fontWeight: 700 }}>
            LAST MOVE · {lastPiece.ticker} {PIECE_NAMES[lastPiece.side][lastPiece.type].toUpperCase()} {sq(snap.last.fx, snap.last.fy)} → {sq(snap.last.tx, snap.last.ty)}
          </div>
        )}
        {recent.map((e, i) => (
          <div key={e.n} style={{ fontSize: 16, lineHeight: 1.5, color: KIND_COLOR[e.kind], opacity: 1 - i * 0.16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <span style={{ color: '#7f8aa0' }}>{fmtClock(e.t)}</span>{' '}
            <span style={{ color: e.side === 'T' ? COLORS.T.glow : COLORS.D.glow, fontWeight: 800 }}>{e.side === 'T' ? 'TRADER' : 'MAKER '}</span> {e.text}
          </div>
        ))}
        {recent.length === 0 && (
          <div style={{ color: '#6b7589', fontSize: 15 }}>
            {snap && snap.bucket >= (day?.openBucket ?? 0) ? 'Waiting for the opening move…' : 'The board fills as tickers qualify: stocks moving, who controls them, and from what flow.'}
          </div>
        )}
      </div>
    </div>
  )
}
