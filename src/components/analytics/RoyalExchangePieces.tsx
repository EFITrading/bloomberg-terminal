'use client'

import { useMemo } from 'react'
import * as THREE from 'three'
import type { PieceType, Side } from '@/lib/royalExchange/engine'

const BODY: Record<Side, string> = { T: '#0b6e52', D: '#1a1015' }
const ACCENT: Record<Side, string> = { T: '#e6c36a', D: '#d94a5f' }

export const HEIGHT: Record<PieceType, number> = { P: 0.9, R: 1.3, B: 1.8, N: 1.65, Q: 1.9, K: 2.05 }

const baseGeo = (() => {
  const pts = [[0.001, 0], [0.4, 0], [0.425, 0.03], [0.41, 0.08], [0.35, 0.1], [0.31, 0.13], [0.3, 0.14]].map(([r, y]) => new THREE.Vector2(r, y))
  return new THREE.LatheGeometry(pts, 64)
})()

const pedimentGeo = (() => {
  const s = new THREE.Shape()
  s.moveTo(-0.42, 0)
  s.lineTo(0.42, 0)
  s.lineTo(0, 0.24)
  s.closePath()
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.46, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 2 })
  g.translate(0, 0, -0.23)
  return g
})()

function useMats(side: Side) {
  return useMemo(() => {
    const body = new THREE.MeshPhysicalMaterial({
      color: BODY[side],
      metalness: side === 'T' ? 0.35 : 0.55,
      roughness: 0.2,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      envMapIntensity: 1.3,
    })
    const gold = new THREE.MeshPhysicalMaterial({ color: ACCENT[side], metalness: 1, roughness: 0.2, clearcoat: 0.6, envMapIntensity: 1.6 })
    return { body, gold }
  }, [side])
}

// Stock-market themed pieces:
//   P coin stack (Retail / Delta Hedge)   R vault with bar chart (Block Desk / Wall)
//   B candlestick (Momentum / Hedger)     N bull / bear (Bull / Bear)
//   Q whale tail / gamma obelisk          K exchange building (Index Fund / Market Maker)
export function Shape({ type, side }: { type: PieceType; side: Side }) {
  const { body, gold } = useMats(side)
  const base = (
    <>
      <mesh geometry={baseGeo} material={body} castShadow />
      <mesh position={[0, 0.095, 0]} rotation={[Math.PI / 2, 0, 0]} material={gold}>
        <torusGeometry args={[0.385, 0.014, 12, 64]} />
      </mesh>
    </>
  )

  if (type === 'P') {
    return (
      <group>
        {base}
        {[0, 1, 2, 3].map((i) => (
          <group key={i} position={[(i % 2 ? 0.012 : -0.012), 0.2 + i * 0.115, 0]} rotation={[0, i * 0.7, 0]}>
            <mesh material={i % 2 ? gold : body} castShadow>
              <cylinderGeometry args={[0.26, 0.26, 0.1, 48]} />
            </mesh>
            <mesh position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]} material={i % 2 ? body : gold}>
              <torusGeometry args={[0.26, 0.017, 10, 56]} />
            </mesh>
          </group>
        ))}
        <mesh position={[0, 0.664, 0]} rotation={[-Math.PI / 2, 0, 0]} material={gold}>
          <ringGeometry args={[0.13, 0.19, 40]} />
        </mesh>
      </group>
    )
  }

  if (type === 'R') {
    return (
      <group>
        {base}
        <mesh position={[0, 0.5, 0]} material={body} castShadow>
          <cylinderGeometry args={[0.3, 0.33, 0.72, 48]} />
        </mesh>
        {[0.28, 0.72].map((y) => (
          <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} material={gold}>
            <torusGeometry args={[0.315, 0.02, 10, 56]} />
          </mesh>
        ))}
        <group position={[0, 0.5, -0.3]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} material={gold}>
            <cylinderGeometry args={[0.19, 0.19, 0.04, 40]} />
          </mesh>
          <mesh position={[0, 0, -0.025]} rotation={[Math.PI / 2, 0, 0]} material={body}>
            <cylinderGeometry args={[0.15, 0.15, 0.03, 40]} />
          </mesh>
          {[0, Math.PI / 2].map((r) => (
            <mesh key={r} position={[0, 0, -0.045]} rotation={[0, 0, r]} material={gold}>
              <boxGeometry args={[0.3, 0.03, 0.02]} />
            </mesh>
          ))}
          <mesh position={[0, 0, -0.05]} rotation={[Math.PI / 2, 0, 0]} material={gold}>
            <cylinderGeometry args={[0.04, 0.04, 0.04, 20]} />
          </mesh>
        </group>
        {[-0.15, 0, 0.15].map((x, i) => {
          const h = [0.2, 0.38, 0.29][i]
          return (
            <mesh key={x} position={[x, 0.86 + h / 2, 0]} material={i === 1 ? gold : body} castShadow>
              <boxGeometry args={[0.11, h, 0.2]} />
            </mesh>
          )
        })}
        <mesh position={[0, 0.865, 0]} material={gold}>
          <boxGeometry args={[0.5, 0.03, 0.26]} />
        </mesh>
      </group>
    )
  }

  if (type === 'B') {
    return (
      <group>
        {base}
        <mesh position={[0, 1.0, 0]} material={gold}>
          <cylinderGeometry args={[0.02, 0.02, 1.4, 12]} />
        </mesh>
        <mesh position={[0, 0.98, 0]} material={body} castShadow>
          <capsuleGeometry args={[0.18, 0.5, 12, 32]} />
        </mesh>
        {[0.62, 1.34].map((y) => (
          <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} material={gold}>
            <torusGeometry args={[0.18, 0.016, 10, 40]} />
          </mesh>
        ))}
        <mesh position={[0, 1.72, 0]} material={gold}>
          <octahedronGeometry args={[0.06]} />
        </mesh>
      </group>
    )
  }

  if (type === 'N') {
    const bull = side === 'T'
    return (
      <group>
        {base}
        <mesh position={[0, 0.46, 0]} material={body} castShadow>
          <cylinderGeometry args={[0.2, 0.3, 0.6, 40]} />
        </mesh>
        <mesh position={[0, 0.8, -0.05]} rotation={[-0.5, 0, 0]} material={body} castShadow>
          <cylinderGeometry args={[0.16, 0.2, 0.42, 32]} />
        </mesh>
        <mesh position={[0, 1.08, -0.2]} scale={[1, 0.92, 1.15]} material={body} castShadow>
          <sphereGeometry args={[0.27, 40, 40]} />
        </mesh>
        <mesh position={[0, 1.0, -0.52]} scale={[0.62, 0.5, 0.9]} material={bull ? body : gold} castShadow>
          <sphereGeometry args={[0.2, 32, 32]} />
        </mesh>
        <mesh position={[0, 1.0, -0.66]} material={gold}>
          <torusGeometry args={[0.07, 0.014, 10, 24]} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.11, 1.15, -0.44]}>
            <sphereGeometry args={[0.03, 12, 12]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
        ))}
        {bull
          ? [-1, 1].map((s) => (
              <group key={s} scale={[s, 1, 1]}>
                <mesh position={[0.12, 1.37, -0.18]} rotation={[0, 0, -Math.PI / 2]} material={gold} castShadow>
                  <torusGeometry args={[0.22, 0.036, 14, 32, 2.05]} />
                </mesh>
                <mesh position={[0.27, 1.12, -0.12]} rotation={[0, 0, -0.9]} material={body}>
                  <coneGeometry args={[0.06, 0.16, 16]} />
                </mesh>
              </group>
            ))
          : [-1, 1].map((s) => (
              <group key={s}>
                <mesh position={[s * 0.19, 1.32, -0.1]} material={body} castShadow>
                  <sphereGeometry args={[0.1, 20, 20]} />
                </mesh>
                <mesh position={[s * 0.19, 1.32, -0.17]} material={gold}>
                  <sphereGeometry args={[0.055, 16, 16]} />
                </mesh>
              </group>
            ))}
      </group>
    )
  }

  if (type === 'Q') {
    if (side === 'T') {
      // whale tail rising out of a wave
      return (
        <group>
          {base}
          <mesh position={[0, 0.36, 0]} material={body} castShadow>
            <cylinderGeometry args={[0.14, 0.28, 0.46, 40]} />
          </mesh>
          <mesh position={[0, 0.78, 0.02]} rotation={[0.18, 0, 0]} material={body} castShadow>
            <cylinderGeometry args={[0.06, 0.15, 0.66, 32]} />
          </mesh>
          <mesh position={[0, 1.12, 0.06]} rotation={[0.18, 0, 0]} material={gold}>
            <torusGeometry args={[0.07, 0.016, 10, 28]} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.24, 1.32, 0.1]} rotation={[0.1, 0, s * 0.55]} scale={[1, 0.18, 0.55]} material={body} castShadow>
              <sphereGeometry args={[0.28, 36, 24]} />
            </mesh>
          ))}
          <mesh position={[0, 1.22, 0.08]} material={gold}>
            <sphereGeometry args={[0.07, 20, 20]} />
          </mesh>
          {[0, 1, 2].map((i) => (
            <mesh key={i} position={[Math.cos(i * 2.1) * 0.3, 0.52 + i * 0.12, Math.sin(i * 2.1) * 0.3]} material={gold}>
              <sphereGeometry args={[0.035, 14, 14]} />
            </mesh>
          ))}
        </group>
      )
    }
    // gamma titan: obelisk with orbiting rings
    return (
      <group>
        {base}
        <mesh position={[0, 0.78, 0]} material={body} castShadow>
          <cylinderGeometry args={[0.12, 0.23, 1.2, 6]} />
        </mesh>
        <mesh position={[0, 1.56, 0]} material={gold} castShadow>
          <coneGeometry args={[0.12, 0.26, 6]} />
        </mesh>
        <mesh position={[0, 1.05, 0]} rotation={[0.95, 0, 0]} material={gold}>
          <torusGeometry args={[0.36, 0.014, 10, 64]} />
        </mesh>
        <mesh position={[0, 1.05, 0]} rotation={[-0.95, 0.6, 0]} material={gold}>
          <torusGeometry args={[0.3, 0.014, 10, 64]} />
        </mesh>
        <mesh position={[0.3, 1.2, 0.18]} material={gold}>
          <sphereGeometry args={[0.05, 16, 16]} />
        </mesh>
        <mesh position={[-0.27, 0.92, -0.1]} material={gold}>
          <sphereGeometry args={[0.04, 16, 16]} />
        </mesh>
      </group>
    )
  }

  // king: the exchange building
  return (
    <group>
      {base}
      <mesh position={[0, 0.2, 0]} material={gold} castShadow>
        <boxGeometry args={[0.74, 0.07, 0.58]} />
      </mesh>
      <mesh position={[0, 0.26, 0]} material={body} castShadow>
        <boxGeometry args={[0.68, 0.06, 0.52]} />
      </mesh>
      <mesh position={[0, 0.62, 0.12]} material={body} castShadow>
        <boxGeometry args={[0.6, 0.66, 0.14]} />
      </mesh>
      {[-0.24, -0.08, 0.08, 0.24].map((x) => (
        <mesh key={x} position={[x, 0.62, -0.1]} material={gold} castShadow>
          <cylinderGeometry args={[0.045, 0.05, 0.66, 20]} />
        </mesh>
      ))}
      <mesh position={[0, 1.0, 0]} material={gold} castShadow>
        <boxGeometry args={[0.76, 0.08, 0.5]} />
      </mesh>
      <mesh geometry={pedimentGeo} position={[0, 1.04, 0]} material={body} castShadow />
      <mesh position={[0, 1.55, 0.02]} material={gold}>
        <cylinderGeometry args={[0.018, 0.018, 0.5, 10]} />
      </mesh>
      <mesh position={[0, 1.83, 0.02]} material={gold}>
        <octahedronGeometry args={[0.08]} />
      </mesh>
    </group>
  )
}
