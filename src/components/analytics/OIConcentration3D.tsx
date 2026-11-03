'use client'

import { Html, OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import React, { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'

interface Cell {
  callOI: number
  putOI: number
  gex: number
  callPrem: number
  putPrem: number
  gexPrem: number
}

interface Grid {
  strikes: number[]
  exps: string[]
  cells: Cell[][] // [expIdx][strikeIdx]
  spot: number
}

type Mode = 'oi' | 'gex'

const MAX_EXPS = 40
const RANGE_PCT = 0.15
const SX = 0.55

const HMAX = 9

function useGrid(ticker: string, expiration: string) {
  const [grid, setGrid] = useState<Grid | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!ticker) return
    let cancelled = false
    setLoading(true)
    setError('')
    fetch(`/api/dealer-options-premium?ticker=${ticker}`)
      .then(async (r) => {
        const text = await r.text()
        try {
          return JSON.parse(text)
        } catch {
          throw new Error('Options API returned a non-JSON response (HTTP ' + r.status + ')')
        }
      })
      .then((res) => {
        if (cancelled) return
        if (!res.success || !res.data) {
          setError('No options data')
          return
        }
        const spot: number = res.currentPrice || 0
        const today = new Date()
        const isDate = /^\d{4}-\d{2}-\d{2}$/.test(expiration)
        const allFuture = Object.keys(res.data)
          .filter((e) => new Date(e + 'T23:59:59') >= today)
          .sort()
        let exps = allFuture
        if (isDate) {
          exps = allFuture.filter((e) => e === expiration)
        } else if (expiration === '45-days') {
          const limit = new Date(today.getTime() + 45 * 86400000)
          exps = allFuture.filter((e) => new Date(e + 'T00:00:00') <= limit)
        }
        exps = exps.slice(0, MAX_EXPS)
        if (exps.length === 0) {
          setError('No expirations available')
          return
        }

        const lo = spot * (1 - RANGE_PCT)
        const hi = spot * (1 + RANGE_PCT)
        const strikeSet = new Set<number>()
        exps.forEach((e) => {
          ;['calls', 'puts'].forEach((side) => {
            Object.keys(res.data[e][side] || {}).forEach((k) => {
              const s = parseFloat(k)
              if (!spot || (s >= lo && s <= hi)) strikeSet.add(s)
            })
          })
        })
        const strikes = Array.from(strikeSet).sort((a, b) => a - b)

        const cells = exps.map((e) =>
          strikes.map((s) => {
            const key = String(s)
            const c = res.data[e].calls?.[key] ?? res.data[e].calls?.[s.toFixed(1)]
            const p = res.data[e].puts?.[key] ?? res.data[e].puts?.[s.toFixed(1)]
            const callOI = c?.open_interest || 0
            const putOI = p?.open_interest || 0
            const cg = (c?.greeks?.gamma || 0) * callOI * 100 * spot * spot * 0.01
            const pg = (p?.greeks?.gamma || 0) * putOI * 100 * spot * spot * 0.01
            const mid = (q: any) => ((q?.bid || 0) + (q?.ask || 0) > 0 ? ((q.bid || 0) + (q.ask || 0)) / 2 : q?.mid_price || q?.last || 0)
            const callPrem = callOI * mid(c) * 100
            const putPrem = putOI * mid(p) * 100
            const gexPrem = (c?.greeks?.gamma || 0) * callOI * 100 * spot - (p?.greeks?.gamma || 0) * putOI * 100 * spot
            return { callOI, putOI, gex: cg - pg, callPrem, putPrem, gexPrem }
          })
        )
        // A single expiry is mirrored into two rows so it still renders as a ridge
        if (cells.length === 1) setGrid({ strikes, exps: [exps[0], exps[0]], cells: [cells[0], cells[0]], spot })
        else setGrid({ strikes, exps, cells, spot })
      })
      .catch((e) => !cancelled && setError(e?.message || 'Failed to load options data'))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [ticker, expiration])

  return { grid, loading, error }
}

const fmtBase = (n: number) => {
  const a = Math.abs(n)
  if (a >= 1e9) return (n / 1e9).toFixed(2) + 'B'
  if (a >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (a >= 1e3) return (n / 1e3).toFixed(1) + 'k'
  return n.toFixed(0)
}

function smooth(values: number[][]): number[][] {
  const ne = values.length
  const ns = values[0]?.length ?? 0
  return values.map((row, j) =>
    row.map((_, i) => {
      let sum = 0
      let w = 0
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const jj = j + dj
          const ii = i + di
          if (jj < 0 || jj >= ne || ii < 0 || ii >= ns) continue
          const wt = dj === 0 && di === 0 ? 4 : dj === 0 || di === 0 ? 2 : 1
          sum += values[jj][ii] * wt
          w += wt
        }
      }
      return sum / w
    })
  )
}

const Terrain: React.FC<{ grid: Grid; mode: Mode; premium: boolean }> = ({ grid, mode, premium }) => {
  const fmt = (n: number) => (premium ? '$' : '') + fmtBase(n)
  const { strikes, exps, cells, spot } = grid
  const ns = strikes.length
  const ne = exps.length
  const single = ne === 2 && exps[0] === exps[1]
  const sz = single ? 2.6 : Math.min(1.3, 14 / Math.max(1, ne - 1))

  const model = useMemo(() => {
    const U = 4 // upsample factor so the surface reads as continuous terrain
    const raw = cells.map((row) =>
      row.map((c) => (mode === 'oi' ? c.callOI + c.putOI : Math.abs(c.gex)))
    )
    const max = Math.max(1, ...raw.flat())
    const norm = raw.map((r) => r.map((v) => Math.pow(v / max, 0.6)))

    const cPos = new THREE.Color('#00ff5a')
    const cNeg = new THREE.Color('#ff2a2a')
    const gPos = new THREE.Color('#a855f7')
    const gNeg = new THREE.Color('#ff7a00')
    const base = new THREE.Color('#0a0a12')
    const tmp = new THREE.Color()

    const FI = (ns - 1) * U + 1
    const FJ = (ne - 1) * U + 1
    const sample = (g: number[][], fi: number, fj: number) => {
      const x = fi / U
      const y = fj / U
      const i0 = Math.min(ns - 1, Math.floor(x))
      const j0 = Math.min(ne - 1, Math.floor(y))
      const i1 = Math.min(ns - 1, i0 + 1)
      const j1 = Math.min(ne - 1, j0 + 1)
      const tx = x - i0
      const ty = y - j0
      return (
        g[j0][i0] * (1 - tx) * (1 - ty) + g[j0][i1] * tx * (1 - ty) + g[j1][i0] * (1 - tx) * ty + g[j1][i1] * tx * ty
      )
    }
    let fine: number[][] = []
    for (let fj = 0; fj < FJ; fj++) {
      const r: number[] = []
      for (let fi = 0; fi < FI; fi++) r.push(sample(norm, fi, fj))
      fine.push(r)
    }
    fine = smooth(smooth(fine))
    const ground = 0.35
    const heightsFine = fine.map((r) => r.map((v) => ground + v * HMAX))
    const ratio = cells.map((row) =>
      row.map((c) => (mode === 'oi' ? c.callOI / (c.callOI + c.putOI || 1) : c.gex >= 0 ? 1 : 0))
    )
    const ratioFine = (fi: number, fj: number) => sample(ratio, fi, fj)

    const positions: number[] = []
    const colors: number[] = []
    const indices: number[] = []
    const colorAt = (fi: number, fj: number, h: number) => {
      const r = ratioFine(fi, fj)
      if (mode === 'oi') tmp.copy(cNeg).lerp(cPos, r)
      else tmp.copy(gNeg).lerp(gPos, r)
      const k = Math.min(1, (h - ground) / HMAX)
      tmp.lerp(base, 1 - (0.2 + 0.8 * Math.pow(k, 0.55)))
      return tmp
    }
    for (let fj = 0; fj < FJ; fj++) {
      for (let fi = 0; fi < FI; fi++) {
        const h = heightsFine[fj][fi]
        positions.push((fi / U - (ns - 1) / 2) * SX, h, (fj / U - (ne - 1) / 2) * sz)
        const c = colorAt(fi, fj, h)
        colors.push(c.r, c.g, c.b)
      }
    }
    for (let fj = 0; fj < FJ - 1; fj++) {
      for (let fi = 0; fi < FI - 1; fi++) {
        const a = fj * FI + fi
        indices.push(a, a + FI, a + 1, a + 1, a + FI, a + FI + 1)
      }
    }

    // Solid skirt: walls from the surface edge down to the floor so nothing floats
    const dark = new THREE.Color('#0b0b10')
    const addWall = (pts: { fi: number; fj: number }[]) => {
      const start = positions.length / 3
      pts.forEach(({ fi, fj }) => {
        const h = heightsFine[fj][fi]
        const x = (fi / U - (ns - 1) / 2) * SX
        const z = (fj / U - (ne - 1) / 2) * sz
        const c = colorAt(fi, fj, h)
        positions.push(x, h, z, x, 0, z)
        colors.push(c.r * 0.7, c.g * 0.7, c.b * 0.7, dark.r, dark.g, dark.b)
      })
      for (let n = 0; n < pts.length - 1; n++) {
        const a = start + n * 2
        indices.push(a, a + 1, a + 2, a + 2, a + 1, a + 3)
      }
    }
    addWall(Array.from({ length: FI }, (_, fi) => ({ fi, fj: 0 })))
    addWall(Array.from({ length: FI }, (_, fi) => ({ fi, fj: FJ - 1 })))
    addWall(Array.from({ length: FJ }, (_, fj) => ({ fi: 0, fj })))
    addWall(Array.from({ length: FJ }, (_, fj) => ({ fi: FI - 1, fj })))

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geo.setIndex(indices)
    geo.computeVertexNormals()

    const heights = raw.map((_, j) => raw[j].map((__, i) => heightsFine[j * U][i * U]))

    // Strongest raw cells become labelled "walls"
    const peaks: { i: number; j: number; v: number }[] = []
    raw.forEach((r, j) => r.forEach((v, i) => peaks.push({ i, j, v })))
    peaks.sort((a, b) => b.v - a.v)
    const picked: typeof peaks = []
    for (const p of peaks) {
      if (picked.length >= 5) break
      if (picked.every((q) => Math.abs(q.i - p.i) > 2 || Math.abs(q.j - p.j) > 1)) picked.push(p)
    }
    return { geo, heights, picked, max }
  }, [cells, mode, ns, ne, sz])

  // Spot position along the strike axis (interpolated between strikes)
  const spotX = useMemo(() => {
    if (!ns) return 0
    let k = strikes.findIndex((s) => s >= spot)
    if (k <= 0) k = k === 0 ? 0 : ns - 1
    const f = k > 0 ? (spot - strikes[k - 1]) / (strikes[k] - strikes[k - 1] || 1) : 0
    return (k - 1 + f - (ns - 1) / 2) * SX + (k === 0 ? SX : 0)
  }, [strikes, spot, ns])

  const width = (ns - 1) * SX
  const depth = (ne - 1) * sz
  const labelEvery = Math.max(1, Math.round(ns / 9))
  const [hover, setHover] = useState<{ i: number; j: number; x: number; y: number; z: number } | null>(null)

  // Aggregates across expirations: levels that matter for dealer positioning
  const levels = useMemo(() => {
    const agg = strikes.map((s, i) => {
      let callOI = 0
      let putOI = 0
      let gex = 0
      cells.forEach((row) => {
        callOI += row[i].callOI
        putOI += row[i].putOI
        gex += row[i].gex
      })
      return { s, callOI, putOI, gex }
    })
    let maxPain = strikes[0]
    let best = Infinity
    strikes.forEach((K) => {
      const pain = agg.reduce((a, r) => a + r.callOI * Math.max(0, K - r.s) + r.putOI * Math.max(0, r.s - K), 0)
      if (pain < best) { best = pain; maxPain = K }
    })
    let cum = 0
    let flip: number | null = null
    for (let i = 0; i < agg.length; i++) {
      const prev = cum
      cum += agg[i].gex
      if (i > 0 && prev < 0 && cum >= 0) { flip = agg[i].s; break }
    }
    const above = agg.filter((r) => r.s >= spot)
    const below = agg.filter((r) => r.s <= spot)
    const callWall = above.length ? above.reduce((a, b) => (b.callOI > a.callOI ? b : a)).s : null
    const putWall = below.length ? below.reduce((a, b) => (b.putOI > a.putOI ? b : a)).s : null
    const maxTot = Math.max(1, ...agg.map((r) => r.callOI + r.putOI))
    return { agg, maxPain, flip, callWall, putWall, maxTot }
  }, [cells, strikes, spot])
  const xOf = (s: number) => {
    const i = strikes.indexOf(s)
    return (i - (ns - 1) / 2) * SX
  }
  const lines: { s: number | null; label: string; color: string }[] = [
    { s: levels.callWall, label: 'CALL WALL', color: '#00ff5a' },
    { s: levels.putWall, label: 'PUT WALL', color: '#ff3b3b' },
    { s: levels.maxPain, label: 'MAX PAIN', color: '#22d3ee' },
    { s: levels.flip, label: 'GAMMA FLIP', color: '#c084fc' },
  ]

  return (
    <group position={[0, -2.5, 0]}>
      <mesh geometry={model.geo} onPointerMove={(e) => { e.stopPropagation(); const i = Math.round(e.point.x / SX + (ns - 1) / 2); const j = Math.round(e.point.z / sz + (ne - 1) / 2); setHover(i >= 0 && i < ns && j >= 0 && j < ne ? { i, j, x: e.point.x, y: e.point.y + 2.5, z: e.point.z } : null) }} onPointerOut={() => setHover(null)}>
        <meshStandardMaterial vertexColors roughness={0.55} metalness={0.15} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={model.geo} position={[0, 0.02, 0]}>
        <meshBasicMaterial color="#ffffff" wireframe transparent opacity={0.06} />
      </mesh>

      {/* floor grid */}
      <gridHelper args={[Math.max(width, depth) + 4, 30, '#2a2a2a', '#161616']} position={[0, -0.01, 0]} />

      {/* spot plane */}
      <mesh position={[spotX, HMAX / 2, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[depth + sz, HMAX + 1]} />
        <meshBasicMaterial color="#ff6600" transparent opacity={0.1} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <Html position={[spotX, HMAX + 1.2, -depth / 2]} center style={{ pointerEvents: 'none' }}>
        <div style={{ color: '#ff8a33', fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap', textShadow: '0 0 6px #000' }}>
          SPOT ${spot.toFixed(2)}
        </div>
      </Html>

      {/* strike axis */}
      {strikes.map((s, i) =>
        i % labelEvery === 0 ? (
          <Html key={s} position={[(i - (ns - 1) / 2) * SX, 0, depth / 2 + 0.9]} center style={{ pointerEvents: 'none' }}>
            <div style={{ color: '#ffffff', fontSize: 13, fontWeight: 800, textShadow: '0 0 4px #000' }}>{s}</div>
          </Html>
        ) : null
      )}
      {/* expiration axis */}
      {exps.map((e, j) => (single && j === 1 ? null : (
        <Html key={e} position={[-width / 2 - 1.2, 0, single ? 0 : (j - (ne - 1) / 2) * sz]} center style={{ pointerEvents: 'none' }}>
          <div style={{ color: '#ffffff', fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap', textShadow: '0 0 4px #000' }}>
            {new Date(e + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </div>
        </Html>
      )))}

      {/* back-wall shadow: total OI per strike across all expirations */}
      {levels.agg.map((r, i) => {
        const h = ((r.callOI + r.putOI) / levels.maxTot) * HMAX * 0.7
        const hc = (r.callOI / levels.maxTot) * HMAX * 0.7
        return (
          <group key={r.s} position={[(i - (ns - 1) / 2) * SX, 0, -depth / 2 - 1.4]}>
            <mesh position={[0, hc / 2, 0]}><boxGeometry args={[SX * 0.7, Math.max(hc, 0.01), 0.3]} /><meshBasicMaterial color="#00c24a" transparent opacity={0.55} /></mesh>
            <mesh position={[0, hc + (h - hc) / 2, 0]}><boxGeometry args={[SX * 0.7, Math.max(h - hc, 0.01), 0.3]} /><meshBasicMaterial color="#d62b2b" transparent opacity={0.55} /></mesh>
          </group>
        )
      })}
      {/* key level markers */}
      {lines.map((l) => l.s != null && strikes.includes(l.s) ? (
        <group key={l.label} position={[xOf(l.s), 0, 0]}>
          <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[0.07, depth + sz]} /><meshBasicMaterial color={l.color} /></mesh>
          <Html position={[0, 0.2, depth / 2 + 2.2]} center style={{ pointerEvents: 'none' }}>
            <div style={{ color: l.color, border: `1px solid ${l.color}`, background: 'rgba(0,0,0,.85)', borderRadius: 5, padding: '2px 7px', fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap' }}>{l.label} ${l.s}</div>
          </Html>
        </group>
      ) : null)}
      {hover && (
        <Html position={[hover.x, hover.y + 0.6, hover.z]} center style={{ pointerEvents: 'none' }}>
          <div style={{ background: 'rgba(0,0,0,.92)', border: '1px solid #555', borderRadius: 7, padding: '6px 10px', color: '#fff', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', lineHeight: 1.5 }}>
            <div>${strikes[hover.i]} · {new Date(exps[hover.j] + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
            <div style={{ color: '#00ff5a' }}>Calls {fmt(cells[hover.j][hover.i].callOI)}</div>
            <div style={{ color: '#ff3b3b' }}>Puts {fmt(cells[hover.j][hover.i].putOI)}</div>
            <div style={{ color: '#c084fc' }}>Net GEX {fmt(cells[hover.j][hover.i].gex)}</div>
          </div>
        </Html>
      )}

      {/* concentration walls */}
      {model.picked.map((p, n) => {
        const x = (p.i - (ns - 1) / 2) * SX
        const z = (p.j - (ne - 1) / 2) * sz
        const y = model.heights[p.j][p.i]
        const c = cells[p.j][p.i]
        const col = mode === 'oi' ? (c.callOI >= c.putOI ? '#00ff5a' : '#ff3b3b') : c.gex >= 0 ? '#c084fc' : '#ff9a2e'
        return (
          <group key={n} position={[x, 0, z]}>
            <mesh position={[0, (y + 2) / 2, 0]}>
              <cylinderGeometry args={[0.025, 0.025, y + 2, 8]} />
              <meshBasicMaterial color={col} />
            </mesh>
            <mesh position={[0, y + 2, 0]}>
              <sphereGeometry args={[0.16, 16, 16]} />
              <meshBasicMaterial color={col} />
            </mesh>
            <Html position={[0, y + 2.6, 0]} center style={{ pointerEvents: 'none' }}>
              <div
                style={{
                  background: 'rgba(0,0,0,.85)',
                  border: `1px solid ${col}`,
                  borderRadius: 6,
                  padding: '3px 8px',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 800,
                  whiteSpace: 'nowrap',
                }}
              >
                <span style={{ color: col }}>${strikes[p.i]}</span> ·{' '}
                {mode === 'oi' ? fmt(c.callOI + c.putOI) : fmt(c.gex)} ·{' '}
                {new Date(exps[p.j] + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </div>
            </Html>
          </group>
        )
      })}
    </group>
  )
}

const OIConcentration3D: React.FC<{ selectedTicker: string; selectedExpiration?: string; premium?: boolean }> = ({
  selectedTicker,
  selectedExpiration = '',
  premium = false,
}) => {
  const { grid, loading, error } = useGrid(selectedTicker, selectedExpiration)
  const shown = useMemo(() => grid && premium ? { ...grid, cells: grid.cells.map((row) => row.map((c) => ({ ...c, callOI: c.callPrem, putOI: c.putPrem, gex: c.gexPrem }))) } : grid, [grid, premium])
  const [mode, setMode] = useState<Mode>('oi')
  const [autoRotate, setAutoRotate] = useState(false)
  const controlsRef = React.useRef<any>(null)

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: 'max(760px, calc(100vh - 230px))',
        background: 'radial-gradient(ellipse at 50% 30%, #12121c 0%, #050508 70%)',
        border: '1px solid #1f1f1f',
        borderRadius: 10,
        overflow: 'hidden',
      }}
    >
      <div style={{ position: 'absolute', top: 12, left: 14, zIndex: 5, pointerEvents: 'none' }}>
        <div style={{ color: '#fff', fontSize: 16, fontWeight: 800, letterSpacing: 1 }}>
          {selectedTicker} · POSITIONING TERRAIN
        </div>
      </div>
      <div style={{ position: 'absolute', top: 12, right: 150, zIndex: 5, display: 'flex', gap: 8 }}>
        <button onClick={() => setAutoRotate(!autoRotate)} style={{ padding: '8px 14px', background: autoRotate ? '#2a2a2a' : '#0b0b0b', color: autoRotate ? '#fff' : '#8a8a8a', border: '1px solid #262626', borderRadius: 8, fontWeight: 800, fontSize: 12, letterSpacing: 1, cursor: 'pointer' }}>AUTO-ROTATE</button>
        <button onClick={() => controlsRef.current?.reset()} style={{ padding: '8px 14px', background: '#0b0b0b', color: '#8a8a8a', border: '1px solid #262626', borderRadius: 8, fontWeight: 800, fontSize: 12, letterSpacing: 1, cursor: 'pointer' }}>RESET VIEW</button>
      </div>
      <div
        style={{ position: 'absolute', top: 12, right: 14, zIndex: 5, display: 'flex', border: '1px solid #262626', borderRadius: 8, overflow: 'hidden' }}
      >
        {(['oi', 'gex'] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            style={{
              padding: '8px 16px',
              background: mode === m ? '#2a2a2a' : '#0b0b0b',
              color: mode === m ? '#fff' : '#8a8a8a',
              border: 'none',
              fontWeight: 800,
              fontSize: 13,
              letterSpacing: 1,
              cursor: 'pointer',
              boxShadow: mode === m ? `inset 0 -2px 0 ${m === 'oi' ? '#00ff5a' : '#a855f7'}` : 'none',
            }}
          >
            {m.toUpperCase()}
          </button>
        ))}
      </div>
      <div style={{ position: 'absolute', bottom: 12, left: 14, zIndex: 5, display: 'flex', gap: 14, fontSize: 12, fontWeight: 700, pointerEvents: 'none' }}>
        {mode === 'oi' ? (
          <>
            <span style={{ color: '#00ff5a' }}>■ Call-heavy</span>
            <span style={{ color: '#ff3b3b' }}>■ Put-heavy</span>
          </>
        ) : (
          <>
            <span style={{ color: '#c084fc' }}>■ Positive gamma</span>
            <span style={{ color: '#ff9a2e' }}>■ Negative gamma</span>
          </>
        )}
        <span style={{ color: '#ff8a33' }}>▍ Spot price</span>
      </div>

      {loading && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: 15 }}>
          Building terrain…
        </div>
      )}
      {error && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ff5555', fontSize: 15 }}>
          {error}
        </div>
      )}
      {shown && shown.strikes.length > 1 && shown.exps.length > 1 && (
        <Canvas camera={{ position: [0, 9, 15], fov: 45 }} dpr={[1, 2]}>
          <ambientLight intensity={0.7} />
          <directionalLight position={[8, 14, 6]} intensity={1.4} />
          <directionalLight position={[-8, 6, -6]} intensity={0.5} color="#8899ff" />
          <Terrain grid={shown} mode={mode} premium={premium} />
          <OrbitControls ref={controlsRef} autoRotate={autoRotate} autoRotateSpeed={0.6} enablePan={false} minDistance={8} maxDistance={40} maxPolarAngle={Math.PI / 2.05} target={[0, 1.5, 0]} />
        </Canvas>
      )}
    </div>
  )
}

export default OIConcentration3D
