'use client'

import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Environment, Html, Lightformer, OrbitControls, Sparkles } from '@react-three/drei'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import {
  PIECE_NAMES,
  type LogKind,
  type Move,
  type Piece,
  type Side,
  type Signal,
} from '@/lib/royalExchange/engine'
import { HEIGHT, Shape } from './RoyalExchangePieces'

export const MONO = "'JetBrains Mono','Fira Code',Consolas,monospace"
export const GOLD = '#e6c36a'
export const COLORS = {
  T: { body: '#0b6e52', accent: '#e6c36a', glow: '#2dffa8' },
  D: { body: '#1a1015', accent: '#d94a5f', glow: '#ff5470' },
}

const wx = (x: number) => x - 3.5
const wz = (y: number) => 3.5 - y

export interface MarketRow {
  ticker: string
  isEtf: boolean
  beta: number
  marketCap: number
  rets: number[]
  price: number
  chg: number
  mom: number
  mom5: number
  rs20: number
  rsPct: number
  rsCrit: number
  relVol: number
  traderPrem: number
  dealerPrem: number
  traderDir: number
  dealerDir: number
  recentTrader: number
  recentDealer: number
}
export interface GexRow {
  ticker: string
  netGex: number
  gexImpactScore?: number
  largestWall?: { strike: number; type: 'call' | 'put' }
}
export interface LogEntry {
  n: number
  side: Side
  text: string
  kind: LogKind
}

function PieceMesh({ piece, sig, grave }: { piece: Piece; sig?: Signal; grave?: { x: number; z: number } }) {
  const g = useRef<THREE.Group>(null)
  const a = useRef({ init: false, cx: 0, cz: 0, fx: 0, fz: 0, tx: 0, tz: 0, t: 1, hop: 0.45, spawn: 0, scale: 1 })
  const tx = !piece.alive && grave ? grave.x : wx(piece.x)
  const tz = !piece.alive && grave ? grave.z : wz(piece.y)

  useEffect(() => {
    const s = a.current
    if (!s.init) {
      s.init = true
      s.cx = s.fx = s.tx = tx
      s.cz = s.fz = s.tz = tz
      if (!piece.alive) s.scale = 0.55
      return
    }
    s.fx = s.cx
    s.fz = s.cz
    s.tx = tx
    s.tz = tz
    // a captured piece waits for the capturing piece to land before leaving the board
    s.t = !piece.alive ? -0.9 : 0
    s.hop = piece.type === 'N' || !piece.alive ? 1.1 : 0.45
  }, [tx, tz, piece.type, piece.alive])

  useFrame((state, dt) => {
    const grp = g.current
    if (!grp) return
    const s = a.current
    let y = 0
    if (s.t < 1) {
      s.t = Math.min(1, s.t + dt / 0.95)
      const k = Math.max(0, s.t)
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2
      s.cx = s.fx + (s.tx - s.fx) * e
      s.cz = s.fz + (s.tz - s.fz) * e
      y = Math.sin(Math.PI * e) * s.hop
    }
    s.scale += ((piece.alive ? 1 : 0.55) - s.scale) * Math.min(1, dt * 4)
    let scale = s.scale
    if (s.spawn < 1) {
      s.spawn = Math.min(1, s.spawn + dt / 1.1)
      const e = 1 - Math.pow(1 - s.spawn, 3)
      y += (1 - e) * 5
      scale *= e
    }
    grp.position.set(s.cx, y, s.cz)
    grp.rotation.y = (piece.side === 'T' ? 0 : Math.PI) + Math.sin(state.clock.elapsedTime * 0.8 + piece.x * 1.7 + piece.y) * 0.08
    grp.scale.setScalar(Math.max(scale, 0.0001))
  })

  const ringColor = !sig
    ? COLORS[piece.side].glow
    : piece.side === 'T'
      ? sig.flow >= 0
        ? '#2dffa8'
        : '#ff5470'
      : sig.gex < 0
        ? '#ff9d2e'
        : '#b57cff'
  const intensity = sig ? 0.3 + 0.5 * Math.min(1, Math.abs(piece.side === 'T' ? sig.flow : sig.hasGex ? sig.gex : sig.rsCrit)) : 0.25

  return (
    <group ref={g} position={[tx, 0, tz]}>
      {piece.alive && (
        <mesh position={[0, 0.07, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.45, 0.49, 56]} />
          <meshBasicMaterial color={ringColor} transparent opacity={intensity} toneMapped={false} />
        </mesh>
      )}
      <Shape type={piece.type} side={piece.side} />
      <Html position={[0, HEIGHT[piece.type] + 0.3, 0]} center distanceFactor={piece.alive ? 8 : 10} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
        <div
          style={{
            fontFamily: MONO,
            fontSize: 17,
            fontWeight: 800,
            letterSpacing: 1.5,
            color: piece.alive ? '#fff' : '#9aa5ba',
            background: `linear-gradient(180deg, ${COLORS[piece.side].glow}33, rgba(0,0,0,0.82))`,
            border: `1px solid ${COLORS[piece.side].glow}${piece.alive ? '' : '88'}`,
            borderRadius: 5,
            padding: '2px 9px',
            whiteSpace: 'nowrap',
            boxShadow: piece.alive ? `0 0 12px ${COLORS[piece.side].glow}55` : 'none',
            textDecoration: piece.alive ? 'none' : 'line-through',
          }}
        >
          {piece.ticker}
        </div>
      </Html>
    </group>
  )
}

// ───────────────────────── board ─────────────────────────

function Board({ last }: { last: Move | null }) {
  const tiles = useMemo(() => {
    const out: { x: number; y: number; dark: boolean }[] = []
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) out.push({ x, y, dark: (x + y) % 2 === 0 })
    return out
  }, [])
  const hl = useRef<THREE.Group>(null)
  useFrame((s) => {
    hl.current?.children.forEach((c) => {
      ;((c as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.3 + Math.sin(s.clock.elapsedTime * 4) * 0.1
    })
  })
  return (
    <group>
      <mesh position={[0, -0.2, 0]} receiveShadow>
        <boxGeometry args={[9, 0.3, 9]} />
        <meshPhysicalMaterial color="#0a0d13" metalness={0.8} roughness={0.3} clearcoat={1} />
      </mesh>
      <mesh position={[0, -0.04, 0]}>
        <boxGeometry args={[8.1, 0.02, 8.1]} />
        <meshStandardMaterial color={GOLD} metalness={1} roughness={0.25} emissive={GOLD} emissiveIntensity={0.35} />
      </mesh>
      {tiles.map((t) => (
        <mesh key={`${t.x}${t.y}`} position={[wx(t.x), 0, wz(t.y)]} receiveShadow>
          <boxGeometry args={[0.985, 0.08, 0.985]} />
          <meshPhysicalMaterial color={t.dark ? '#141a26' : '#3b4560'} metalness={0.4} roughness={0.22} clearcoat={0.8} />
        </mesh>
      ))}
      {last && (
        <group ref={hl}>
          {[
            { x: last.fx, y: last.fy },
            { x: last.tx, y: last.ty },
          ].map((p, i) => (
            <mesh key={i} position={[wx(p.x), 0.05, wz(p.y)]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[0.95, 0.95]} />
              <meshBasicMaterial color={i ? GOLD : '#5aa9ff'} transparent opacity={0.35} toneMapped={false} />
            </mesh>
          ))}
        </group>
      )}
      {(['T', 'D'] as Side[]).map((side) => (
        <group key={side}>
          <mesh position={[side === 'T' ? -5.7 : 5.7, -0.04, 0]} receiveShadow>
            <boxGeometry args={[1.9, 0.08, 8.2]} />
            <meshPhysicalMaterial color="#0c1018" metalness={0.6} roughness={0.3} clearcoat={0.8} />
          </mesh>
          <mesh position={[side === 'T' ? -5.7 : 5.7, 0.002, 0]}>
            <boxGeometry args={[1.92, 0.01, 8.22]} />
            <meshBasicMaterial color={COLORS[side].glow} transparent opacity={0.18} toneMapped={false} />
          </mesh>
          <Html position={[side === 'T' ? -5.7 : 5.7, 0.05, -4.55]} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
            <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, letterSpacing: 4, color: COLORS[side].glow, whiteSpace: 'nowrap' }}>
              {side === 'T' ? 'TRADERS LOST' : 'MAKER LOST'}
            </div>
          </Html>
        </group>
      ))}
      <Html position={[0, 0.05, 4.9]} center distanceFactor={8} style={{ pointerEvents: 'none' }}>
        <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 800, letterSpacing: 10, color: COLORS.T.glow, whiteSpace: 'nowrap', textShadow: `0 0 14px ${COLORS.T.glow}` }}>TRADERS</div>
      </Html>
      <Html position={[0, 0.05, -4.9]} center distanceFactor={8} style={{ pointerEvents: 'none' }}>
        <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 800, letterSpacing: 10, color: COLORS.D.glow, whiteSpace: 'nowrap', textShadow: `0 0 14px ${COLORS.D.glow}` }}>MARKET MAKER</div>
      </Html>
    </group>
  )
}

function Pulse({ x, y, color, onDone }: { x: number; y: number; color: string; onDone: () => void }) {
  const m = useRef<THREE.Mesh>(null)
  const t = useRef(0)
  useFrame((_, dt) => {
    t.current += dt
    const k = Math.max(0, (t.current - 0.7) / 1.0)
    if (m.current) {
      m.current.scale.setScalar(0.3 + k * 4)
      ;(m.current.material as THREE.MeshBasicMaterial).opacity = k > 0 ? Math.max(0, 0.9 - k) : 0
    }
    if (k >= 1) onDone()
  })
  return (
    <mesh ref={m} position={[wx(x), 0.1, wz(y)]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.8, 1, 48]} />
      <meshBasicMaterial color={color} transparent opacity={0} toneMapped={false} />
    </mesh>
  )
}

export function Scene({ pieces, signals, last, pulses, donePulse, gameNo }: {
  pieces: Piece[]
  signals: Record<string, Signal>
  last: Move | null
  pulses: { id: number; x: number; y: number; color: string }[]
  donePulse: (id: number) => void
  gameNo: number
}) {
  // captured pieces rest on a tray beside the board: traders' losses on the left, the market maker's on the right
  const graves = useMemo(() => {
    const m = new Map<string, { x: number; z: number }>()
    for (const side of ['T', 'D'] as Side[]) {
      pieces
        .filter((p) => p.side === side && !p.alive)
        .sort((a, b) => (a.capturedAt ?? 0) - (b.capturedAt ?? 0))
        .forEach((p, i) => {
          const col = i % 2
          const row = Math.floor(i / 2)
          const x = side === 'T' ? -5.35 - col * 0.7 : 5.35 + col * 0.7
          m.set(p.id, { x, z: 3.3 - row * 0.9 })
        })
    }
    return m
  }, [pieces])
  return (
    <>
      <color attach="background" args={['#04060a']} />
      <fog attach="fog" args={['#04060a', 18, 40]} />
      <Environment resolution={256}>
        <Lightformer form="rect" intensity={3} position={[0, 7, 3]} scale={[12, 4, 1]} rotation-x={Math.PI / 2} />
        <Lightformer form="rect" intensity={2} position={[-7, 3, 0]} scale={[8, 3, 1]} rotation-y={Math.PI / 2} color="#ffe2a8" />
        <Lightformer form="rect" intensity={2} position={[7, 3, 0]} scale={[8, 3, 1]} rotation-y={-Math.PI / 2} color="#9ec5ff" />
        <Lightformer form="ring" intensity={2} position={[0, 4, -8]} scale={6} color="#ff6a7f" />
      </Environment>
      <ambientLight intensity={0.25} />
      <directionalLight position={[5, 11, 6]} intensity={1.6} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-7} shadow-camera-right={7} shadow-camera-top={7} shadow-camera-bottom={-7} />
      <pointLight position={[0, 3, 8]} intensity={25} color={COLORS.T.glow} distance={14} />
      <pointLight position={[0, 3, -8]} intensity={25} color={COLORS.D.glow} distance={14} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.4, 0]}>
        <circleGeometry args={[24, 64]} />
        <meshStandardMaterial color="#05070b" metalness={0.8} roughness={0.5} />
      </mesh>
      <Board last={last} />
      {pieces.map((p) => (
        <PieceMesh key={`${gameNo}-${p.id}`} piece={p} sig={signals[p.ticker]} grave={graves.get(p.id)} />
      ))}
      {pulses.map((p) => (
        <Pulse key={p.id} x={p.x} y={p.y} color={p.color} onDone={() => donePulse(p.id)} />
      ))}
      <Sparkles count={70} scale={[18, 7, 18]} size={2} speed={0.2} opacity={0.4} color="#7aa7ff" position={[0, 3, 0]} />
      <OrbitControls enablePan={false} minDistance={7} maxDistance={20} maxPolarAngle={Math.PI / 2.15} autoRotate autoRotateSpeed={0.3} target={[0, 0.5, 0]} />
      <EffectComposer>
        <Bloom intensity={0.6} luminanceThreshold={0.7} luminanceSmoothing={0.3} mipmapBlur />
      </EffectComposer>
    </>
  )
}

// ───────────────────────── market logic ─────────────────────────

export async function fetchJson<T>(url: string, ms: number): Promise<T | null> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), ms)
  try {
    const r = await fetch(url, { signal: ctl.signal })
    if (!r.ok) return null
    return (await r.json()) as T
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export const fmtClock = (ms: number) =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms))

// percentile (0..1) of |gamma| among scanned tickers: the middle of the pack is "neutral", the tails are dealer-controlled
export function gexExtremes(rows: Map<string, GexRow>) {
  const vals = [...rows.values()].map((r) => ({ t: r.ticker, v: Math.abs(r.gexImpactScore ?? r.netGex) })).sort((a, b) => a.v - b.v)
  const out = new Map<string, number>()
  vals.forEach((x, i) => out.set(x.t, vals.length > 1 ? i / (vals.length - 1) : 0.5))
  return out
}

export function classify(r: MarketRow, ext: number | undefined) {
  const tot = r.traderPrem + r.dealerPrem
  const comps: [number, number, number][] = []
  if (ext !== undefined) comps.push([0.4, ext, 1 - ext]) // 45D gamma: strong either way => dealer, in-between => trader
  if (tot > 0) comps.push([0.35, r.dealerPrem / tot, r.traderPrem / tot]) // B/BB vs A/AA
  comps.push([0.25, r.rsCrit, Math.min(1, Math.abs(r.mom))]) // RS at critical level vs momentum
  const w = comps.reduce((s, c) => s + c[0], 0)
  const mm = comps.reduce((s, c) => s + c[0] * c[1], 0) / w
  const tr = comps.reduce((s, c) => s + c[0] * c[2], 0) / w
  const activity = Math.min(1, Math.log10(1 + tot) / 8)
  const conviction = Math.abs(mm - tr) * 0.5 + activity * 0.3 + Math.min(1, Math.abs(r.chg) / 4) * 0.2
  return { side: (mm > tr ? 'D' : 'T') as Side, conviction }
}

export function buildSignal(r: MarketRow, gex: GexRow | undefined, ext: number | undefined, side: Side): Signal {
  const hasGex = !!gex
  const flow = r.traderPrem > 0 ? 0.6 * r.traderDir + 0.4 * r.mom : r.mom
  return {
    ticker: r.ticker,
    controller: side,
    price: r.price,
    chg: r.chg,
    mom: r.mom,
    mom5: r.mom5,
    rsPct: r.rsPct,
    rsCrit: r.rsCrit,
    rs20: r.rs20,
    relVol: r.relVol,
    traderPrem: r.traderPrem,
    dealerPrem: r.dealerPrem,
    traderDir: r.traderDir,
    dealerDir: r.dealerDir,
    recentTrader: r.recentTrader,
    recentDealer: r.recentDealer,
    gex: hasGex ? Math.sign(gex!.netGex) * (ext ?? 0.5) : 0,
    gexExtreme: ext ?? 0,
    netGex: gex?.netGex ?? 0,
    wallStrike: gex?.largestWall?.strike,
    wallType: gex?.largestWall?.type,
    hasGex,
    isEtf: !!r.isEtf,
    beta: r.beta ?? 1,
    style: (r.beta ?? 1) >= 1.15 ? 'growth' : (r.beta ?? 1) <= 0.85 ? 'defensive' : 'neutral',
    marketCap: r.marketCap ?? 0,
    rets: r.rets ?? [],
    flow,
  }
}

// ───────────────────────── HUD ─────────────────────────

export const KIND_COLOR: Record<LogKind, string> = {
  flow: '#2dffa8',
  gamma: '#c9a2ff',
  capture: '#ffa94d',
  check: '#ffe066',
  mate: '#ff5470',
  info: '#9aa5ba',
}

export function SidePanel({ side, captured, alive, signals }: { side: Side; captured: Piece[]; alive: Piece[]; signals: Record<string, Signal> }) {
  const c = COLORS[side].glow
  const rank = (p: Piece) => {
    const s = signals[p.ticker]
    if (!s) return 0
    return side === 'T' ? Math.abs(s.flow) : Math.max(s.gexExtreme, s.rsCrit)
  }
  const lead = [...alive].sort((a, b) => rank(b) - rank(a)).slice(0, 5)
  const SERIF = "'Palatino Linotype','Book Antiqua',Palatino,Georgia,serif"
  return (
    <div
      style={{
        width: 310,
        borderRadius: 14,
        overflow: 'hidden',
        background: `linear-gradient(180deg, ${c}14 0%, rgba(6,9,15,0.9) 38%)`,
        border: `1px solid ${c}55`,
        boxShadow: `0 10px 40px rgba(0,0,0,0.55), 0 0 30px ${c}1f`,
        backdropFilter: 'blur(10px)',
      }}
    >
      <div style={{ height: 4, background: `linear-gradient(90deg, transparent, ${c}, transparent)` }} />
      <div style={{ padding: '18px 20px 16px' }}>
        <div style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 700, letterSpacing: 6, color: '#fff', textAlign: 'center', textShadow: `0 0 18px ${c}88` }}>
          {side === 'T' ? 'TRADERS' : 'MARKET MAKER'}
        </div>
        <div style={{ height: 1, margin: '12px 0 14px', background: `linear-gradient(90deg, transparent, ${c}88, transparent)` }} />
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          {[
            { label: 'ALIVE', value: alive.length },
            { label: 'LOST', value: captured.length },
          ].map((s) => (
            <div key={s.label} style={{ flex: 1, textAlign: 'center', background: 'rgba(255,255,255,0.04)', border: '1px solid #ffffff12', borderRadius: 10, padding: '8px 0 6px' }}>
              <div style={{ fontFamily: SERIF, fontSize: 34, fontWeight: 700, color: c, lineHeight: 1.1 }}>{s.value}</div>
              <div style={{ fontSize: 11, letterSpacing: 3, color: '#8a94a8' }}>{s.label}</div>
            </div>
          ))}
        </div>
        {lead.map((p) => {
          const s = signals[p.ticker]
          if (!s) return null
          const up = s.chg >= 0
          return (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid #ffffff10' }}>
              <div>
                <div style={{ color: '#fff', fontSize: 19, fontWeight: 800, letterSpacing: 1 }}>{p.ticker}</div>
                <div style={{ color: '#7f8aa0', fontSize: 11, letterSpacing: 2 }}>{PIECE_NAMES[p.side][p.type].toUpperCase()}</div>
              </div>
              <div style={{ color: up ? '#2dffa8' : '#ff5470', background: up ? '#2dffa81a' : '#ff54701a', border: `1px solid ${up ? '#2dffa855' : '#ff547055'}`, borderRadius: 8, padding: '4px 10px', fontSize: 16, fontWeight: 700 }}>
                {up ? '+' : ''}
                {s.chg.toFixed(1)}%
              </div>
            </div>
          )
        })}
        {captured.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
            {captured.map((p) => (
              <span key={p.id} style={{ fontSize: 13, color: '#aab3c5', background: '#1a2030', borderRadius: 6, padding: '3px 8px', textDecoration: 'line-through' }}>
                {p.ticker}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

