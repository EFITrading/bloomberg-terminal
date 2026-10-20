'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Analog, DBar, Dossier, FWD, HorizonRow, Leg, buildDossier } from './dossierEngine'

const FONT = '"JetBrains Mono", Consolas, "Segoe UI", monospace'
const GREEN = '#00e676'
const RED = '#ff4d4d'
const CYAN = '#00e5ff'
const AMBER = '#ffb74d'
const GOLD = '#ffd54f'
const WHITE = '#ffffff'
const PANEL = 'rgba(255,255,255,0.035)'
const LINE = 'rgba(255,255,255,0.14)'

const pct = (v: number, d = 1) => `${v >= 0 ? '+' : ''}${v.toFixed(d)}%`
const tone = (v: number) => (v >= 0 ? GREEN : RED)
const dateStr = (t: number) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
const shortDate = (t: number) => new Date(t).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
const avg = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0)

const Section: React.FC<{ title: string; accent: string; children: React.ReactNode }> = ({ title, accent, children }) => (
  <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderTop: `3px solid ${accent}`, borderRadius: 8, padding: 16, minWidth: 0 }}>
    <div style={{ fontSize: 17, fontWeight: 900, letterSpacing: 3, color: accent, marginBottom: 14 }}>{title}</div>
    {children}
  </div>
)

const Chip: React.FC<{ label: string; value: string; color?: string; sub?: string }> = ({ label, value, color, sub }) => (
  <div style={{ background: 'rgba(0,0,0,0.45)', border: `1px solid ${LINE}`, borderRadius: 8, padding: '10px 14px', minWidth: 0 }}>
    <div style={{ fontSize: 13, color: WHITE, letterSpacing: 1, fontWeight: 800 }}>{label}</div>
    <div style={{ fontSize: 24, fontWeight: 900, color: color || WHITE, lineHeight: 1.2 }}>{value}</div>
    {sub && <div style={{ fontSize: 13, color: WHITE }}>{sub}</div>}
  </div>
)

// Price history + projection cone built from the analog outcomes
const ConeChart: React.FC<{ bars: DBar[]; d: Dossier; selected: Analog | null }> = ({ bars, d, selected }) => {
  const HIST = 180
  const hist = bars.slice(-HIST)
  const W = 1000
  const H = 380
  const padL = 12
  const padR = 84
  const padT = 14
  const padB = 30
  const total = hist.length + FWD
  const price = d.lastClose
  const toPrice = (p: number) => price * (1 + p / 100)

  const vals: number[] = [...hist.map((b) => b.c), toPrice(d.cone.p5[FWD]), toPrice(d.cone.p95[FWD]), d.levels.high52, d.levels.low52]
  if (selected) vals.push(toPrice(selected.path[FWD]), toPrice(selected.best), toPrice(selected.worst))
  const lo0 = Math.min(...vals.filter((v) => v >= d.levels.low52 * 0.9))
  const hi0 = Math.max(...vals)
  const pad = (hi0 - lo0) * 0.06
  const lo = lo0 - pad
  const hi = hi0 + pad
  const x = (i: number) => padL + (i / (total - 1)) * (W - padL - padR)
  const y = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB)
  const nowI = hist.length - 1

  const line = hist.map((b, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(b.c).toFixed(1)}`).join(' ')
  const band = (upper: number[], lower: number[]) => {
    const top = upper.map((p, j) => `${j === 0 ? 'M' : 'L'}${x(nowI + j).toFixed(1)},${y(toPrice(p)).toFixed(1)}`).join(' ')
    const bot = lower.map((_, j) => `L${x(nowI + FWD - j).toFixed(1)},${y(toPrice(lower[FWD - j])).toFixed(1)}`).join(' ')
    return `${top} ${bot} Z`
  }
  const med = d.cone.p50.map((p, j) => `${j === 0 ? 'M' : 'L'}${x(nowI + j).toFixed(1)},${y(toPrice(p)).toFixed(1)}`).join(' ')
  const sel = selected
    ? selected.path.map((p, j) => `${j === 0 ? 'M' : 'L'}${x(nowI + j).toFixed(1)},${y(toPrice(p)).toFixed(1)}`).join(' ')
    : ''

  const ticks = 5
  const yTicks = Array.from({ length: ticks }, (_, k) => lo + ((hi - lo) * k) / (ticks - 1))
  const xTicks = [0, Math.floor(hist.length / 3), Math.floor((2 * hist.length) / 3), nowI]

  const levels: { v: number; label: string; color: string }[] = [
    { v: d.levels.high52, label: '52w high', color: GREEN },
    { v: d.levels.low52, label: '52w low', color: RED },
  ]
  if (d.levels.resistance) levels.push({ v: d.levels.resistance, label: 'resistance', color: AMBER })
  if (d.levels.support) levels.push({ v: d.levels.support, label: 'support', color: CYAN })

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block', background: '#000', borderRadius: 6 }}>
      {yTicks.map((v, k) => (
        <g key={k}>
          <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="rgba(255,255,255,0.08)" />
          <text x={W - padR + 6} y={y(v) + 5} fill={WHITE} fontSize="15" fontFamily={FONT}>{v.toFixed(v > 100 ? 0 : 2)}</text>
        </g>
      ))}
      {levels.map((l) => {
        if (l.v < lo || l.v > hi) return null
        return (
          <g key={l.label}>
            <line x1={padL} x2={W - padR} y1={y(l.v)} y2={y(l.v)} stroke={l.color} strokeOpacity="0.6" strokeDasharray="4 4" />
            <text x={padL + 4} y={y(l.v) - 5} fill={l.color} fontSize="14" fontWeight="700" fontFamily={FONT}>{l.label} {l.v.toFixed(2)}</text>
          </g>
        )
      })}
      <rect x={x(nowI)} y={padT} width={x(nowI + FWD) - x(nowI)} height={H - padT - padB} fill="rgba(0,229,255,0.04)" />
      <path d={band(d.cone.p95, d.cone.p5)} fill="rgba(0,229,255,0.12)" />
      <path d={band(d.cone.p75, d.cone.p25)} fill="rgba(0,229,255,0.26)" />
      <path d={line} fill="none" stroke="#ffffff" strokeWidth="2" />
      <line x1={x(nowI)} x2={x(nowI)} y1={padT} y2={H - padB} stroke="rgba(255,255,255,0.45)" strokeDasharray="3 3" />
      <path d={med} fill="none" stroke={CYAN} strokeWidth="2.4" strokeDasharray="6 4" />
      {selected && <path d={sel} fill="none" stroke={GOLD} strokeWidth="2.2" />}
      <circle cx={x(nowI)} cy={y(price)} r="4.5" fill="#fff" />
      {(['p95', 'p50', 'p5'] as const).map((k) => (
        <text key={k} x={x(nowI + FWD) + 6} y={y(toPrice(d.cone[k][FWD])) + 5} fill={CYAN} fontSize="15" fontWeight="800" fontFamily={FONT}>
          {pct(d.cone[k][FWD])}
        </text>
      ))}
      {xTicks.map((i) => (
        <text key={i} x={x(i)} y={H - 8} fill={WHITE} fontSize="15" fontFamily={FONT} textAnchor="middle">{shortDate(hist[i].t)}</text>
      ))}
      <text x={x(nowI + FWD / 2)} y={H - 8} fill={CYAN} fontSize="15" fontWeight="800" fontFamily={FONT} textAnchor="middle">next {FWD}</text>
    </svg>
  )
}

// A 0-100 meter split into thirds (low / normal / high) with a marker at the stock's percentile
const Meter: React.FC<{ p: number; color: string }> = ({ p, color }) => (
  <div style={{ position: 'relative', height: 10, display: 'flex', gap: 3, marginTop: 8 }}>
    {[0, 1, 2].map((k) => (
      <div key={k} style={{ flex: 1, background: 'rgba(255,255,255,0.12)', borderRadius: 3 }} />
    ))}
    <div style={{ position: 'absolute', left: `calc(${Math.max(1, Math.min(99, p))}% - 7px)`, top: -3, width: 14, height: 16, borderRadius: 4, background: color, boxShadow: `0 0 8px ${color}` }} />
  </div>
)

const zoneOf = (p: number) => (p >= 67 ? 'HIGH' : p <= 33 ? 'LOW' : 'MID')

const GaugeCard: React.FC<{ label: string; display: string; pct: number }> = ({ label, display, pct: p }) => {
  const extreme = p >= 85 || p <= 15
  const color = extreme ? AMBER : CYAN
  return (
    <div style={{ background: 'rgba(0,0,0,0.45)', border: `1px solid ${extreme ? AMBER + '88' : LINE}`, borderRadius: 8, padding: '10px 12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 13, color: WHITE, fontWeight: 800, letterSpacing: 0.5 }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 900, color }}>{zoneOf(p)}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 900, color: WHITE, lineHeight: 1.25 }}>{display}</div>
      <Meter p={p} color={color} />
    </div>
  )
}

// Price ladder: every key level in order with the current price slotted in
const Ladder: React.FC<{ d: Dossier }> = ({ d }) => {
  const price = d.lastClose
  const rungs: { label: string; v: number; color: string; now?: boolean }[] = [
    { label: '52w high', v: d.levels.high52, color: GREEN },
    { label: 'Most traded price', v: d.levels.poc, color: GOLD },
    { label: 'Now', v: price, color: WHITE, now: true },
    { label: 'Low', v: d.levels.low52, color: RED },
  ]
  if (d.levels.resistance) rungs.push({ label: 'Resistance', v: d.levels.resistance, color: AMBER })
  if (d.levels.support) rungs.push({ label: 'Support', v: d.levels.support, color: CYAN })
  rungs.sort((a, b) => b.v - a.v)
  return (
    <div style={{ marginTop: 14 }}>
      {rungs.map((r) => {
        const dist = (r.v / price - 1) * 100
        return (
          <div
            key={r.label}
            style={{
              display: 'grid',
              gridTemplateColumns: '10px 1fr auto 76px',
              gap: 10,
              alignItems: 'center',
              padding: r.now ? '9px 8px' : '7px 8px',
              borderRadius: 6,
              background: r.now ? 'rgba(255,255,255,0.12)' : 'transparent',
              borderBottom: r.now ? 'none' : `1px solid ${LINE}`,
            }}
          >
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: r.color }} />
            <span style={{ fontSize: 15, fontWeight: r.now ? 900 : 700, color: WHITE }}>{r.label}</span>
            <span style={{ fontSize: 16, fontWeight: 900, color: r.color }}>{r.v.toFixed(2)}</span>
            <span style={{ fontSize: 14, fontWeight: 800, color: r.now ? WHITE : tone(dist), textAlign: 'right' }}>{r.now ? '' : pct(dist)}</span>
          </div>
        )
      })}
    </div>
  )
}

// One swing per row, bar length = size of the move
const SwingRow: React.FC<{ leg: Leg; max: number }> = ({ leg, max }) => {
  const w = Math.max(3, (Math.abs(leg.ret) / max) * 100)
  const c = leg.dir === 'up' ? GREEN : RED
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '92px 1fr 78px 44px', gap: 10, alignItems: 'center', padding: '6px 0', borderBottom: `1px solid ${LINE}` }}>
      <span style={{ fontSize: 14, color: WHITE, fontWeight: 700 }}>
        {shortDate(leg.startT)}
        {leg.ongoing ? ' · now' : ''}
      </span>
      <div style={{ height: 16, background: 'rgba(255,255,255,0.06)', borderRadius: 3 }}>
        <div style={{ width: `${w}%`, height: '100%', background: c, borderRadius: 3, opacity: leg.ongoing ? 1 : 0.8 }} />
      </div>
      <span style={{ fontSize: 15, color: c, fontWeight: 900, textAlign: 'right' }}>{pct(leg.ret)}</span>
      <span style={{ fontSize: 14, color: WHITE, textAlign: 'right' }}>{leg.bars}b</span>
    </div>
  )
}

const RankBar: React.FC<{ label: string; p: number; color: string }> = ({ label, p, color }) => (
  <div style={{ flex: 1, minWidth: 130 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: WHITE, fontWeight: 700 }}>
      <span>{label}</span>
      <span style={{ color, fontWeight: 900 }}>{p.toFixed(0)}%</span>
    </div>
    <div style={{ height: 8, background: 'rgba(255,255,255,0.12)', borderRadius: 4, marginTop: 5 }}>
      <div style={{ width: `${p}%`, height: '100%', background: color, borderRadius: 4 }} />
    </div>
  </div>
)

const Spark: React.FC<{ path: number[] }> = ({ path }) => {
  const W = 150
  const H = 34
  const lo = Math.min(...path, 0)
  const hi = Math.max(...path, 0.01)
  const x = (i: number) => (i / (path.length - 1)) * W
  const y = (v: number) => H - 3 - ((v - lo) / (hi - lo || 1)) * (H - 6)
  const end = path[path.length - 1]
  const c = end >= 0 ? GREEN : RED
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      <line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke="rgba(255,255,255,0.3)" strokeDasharray="3 3" />
      <polyline points={path.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')} fill="none" stroke={c} strokeWidth="2" />
    </svg>
  )
}

// One card per horizon: the middle-50% range on a scale shared by all cards, and the up-chance against normal
const HorizonCard: React.FC<{ r: HorizonRow; lo: number; hi: number }> = ({ r, lo, hi }) => {
  const span = hi - lo || 1
  const at = (v: number) => ((v - lo) / span) * 100
  const upColor = r.pUp >= r.basePUp ? GREEN : RED
  return (
    <div style={{ background: 'rgba(0,0,0,0.45)', border: `1px solid ${LINE}`, borderRadius: 10, padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 15, fontWeight: 900, letterSpacing: 1 }}>{r.h} BARS</span>
        <span style={{ fontSize: 26, fontWeight: 900, color: tone(r.median) }}>{pct(r.median)}</span>
      </div>

      <div style={{ position: 'relative', height: 14, marginTop: 14, background: 'rgba(255,255,255,0.08)', borderRadius: 7 }}>
        <div style={{ position: 'absolute', left: `${at(0)}%`, top: -3, bottom: -3, width: 2, background: WHITE, opacity: 0.6 }} />
        <div style={{ position: 'absolute', left: `${at(r.p25)}%`, width: `${Math.max(1, at(r.p75) - at(r.p25))}%`, top: 0, bottom: 0, background: CYAN, opacity: 0.55, borderRadius: 7 }} />
        <div style={{ position: 'absolute', left: `calc(${at(r.median)}% - 2px)`, top: -4, bottom: -4, width: 4, background: tone(r.median), borderRadius: 2 }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 800, marginTop: 6 }}>
        <span style={{ color: tone(r.p25) }}>{pct(r.p25)}</span>
        <span style={{ color: tone(r.p75) }}>{pct(r.p75)}</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 800 }}>CHANCE UP</span>
        <span style={{ fontSize: 20, fontWeight: 900, color: upColor }}>{(r.pUp * 100).toFixed(0)}%</span>
      </div>
      <div style={{ position: 'relative', height: 8, background: 'rgba(255,255,255,0.12)', borderRadius: 4, marginTop: 6 }}>
        <div style={{ width: `${r.pUp * 100}%`, height: '100%', background: upColor, borderRadius: 4 }} />
        <div style={{ position: 'absolute', left: `${r.basePUp * 100}%`, top: -4, bottom: -4, width: 2, background: WHITE }} />
      </div>
      <div style={{ fontSize: 13, marginTop: 5 }}>normal {(r.basePUp * 100).toFixed(0)}%</div>
    </div>
  )
}
function DossierBody({ ticker, bars, belowChart }: { ticker: string; bars: DBar[]; belowChart?: React.ReactNode }) {
  const d = useMemo(() => buildDossier(bars), [bars])
  const [selIdx, setSelIdx] = useState<number | null>(null)
  const [showAll, setShowAll] = useState(false)

  if (!d) {
    return <div style={{ color: WHITE, fontFamily: FONT, fontSize: 16, padding: 16 }}>Not enough history for {ticker} to build a dossier.</div>
  }

  const sorted = bars.filter((b) => b.c > 0 && b.t > 0).sort((a, b) => a.t - b.t)
  const selected = selIdx === null ? null : d.analogs.find((a) => a.idx === selIdx) || null
  const tiltColor = d.tilt === 'BULLISH' ? GREEN : d.tilt === 'BEARISH' ? RED : GOLD
  const confColor = d.confidence === 'HIGH' ? GREEN : d.confidence === 'MODERATE' ? GOLD : AMBER
  const h20 = d.horizons.find((r) => r.h === 20)!
  const cl = d.currentLeg
  const rows = showAll ? d.analogs : d.analogs.slice(0, 8)
  const maxRet = Math.max(...d.analogs.flatMap((a) => [5, 10, 20, 30].map((h) => Math.abs(a.ret[h]))), 1) * 1.6

  const done = d.legs.filter((l) => !l.ongoing)
  const ups = done.filter((l) => l.dir === 'up')
  const downs = done.filter((l) => l.dir === 'down')
  const recent = d.legs.slice(-9).reverse()
  const maxMove = Math.max(...recent.map((l) => Math.abs(l.ret)), 1)

  return (
    <div style={{ fontFamily: FONT, color: WHITE, display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
      {/* Verdict */}
      <div style={{ background: `linear-gradient(135deg, ${tiltColor}22, rgba(255,255,255,0.02) 60%)`, border: `1px solid ${tiltColor}66`, borderRadius: 10, padding: 16 }}>
        <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 6 }}>
          {ticker} <span style={{ fontWeight: 600 }}>·</span> {d.stateLabel}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
          <Chip label="LEAN" value={d.tilt} color={tiltColor} />
          <Chip label="CONFIDENCE" value={d.confidence} color={confColor} />
          <Chip label="MATCH" value={`${d.matchQuality}`} />
          <Chip label="MEDIAN 20 BARS" value={pct(h20.median)} color={tone(h20.median)} />
          <Chip label="NEW 52W HIGH" value={`${(d.pNewHigh * 100).toFixed(0)}%`} />
        </div>
      </div>

      {/* Projection */}
      <Section title="NEXT" accent={CYAN}>
        <ConeChart bars={sorted} d={d} selected={selected} />
        {belowChart && <div style={{ marginTop: 14 }}>{belowChart}</div>}
      </Section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 14 }}>
        {/* Past */}
        <Section title="PAST" accent={AMBER}>
          {cl && (
            <div style={{ background: 'rgba(0,0,0,0.45)', border: `1px solid ${LINE}`, borderRadius: 8, padding: 14, marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                <span style={{ fontSize: 14, fontWeight: 900, letterSpacing: 1, color: cl.dir === 'up' ? GREEN : RED }}>{cl.dir === 'up' ? 'RALLY' : 'DROP'}</span>
                <span style={{ fontSize: 30, fontWeight: 900, color: tone(cl.ret), lineHeight: 1 }}>{pct(cl.ret)}</span>
                <span style={{ fontSize: 16, color: WHITE }}>{cl.bars} bars</span>
              </div>
              {d.legRetPct !== null && d.legBarsPct !== null && (
                <div style={{ display: 'flex', gap: 14, marginTop: 12, flexWrap: 'wrap' }}>
                  <RankBar label="Size rank" p={d.legRetPct} color={cl.dir === 'up' ? GREEN : RED} />
                  <RankBar label="Length rank" p={d.legBarsPct} color={CYAN} />
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            <div style={{ background: 'rgba(0,230,118,0.08)', border: `1px solid ${GREEN}55`, borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: GREEN }}>AVG RALLY</div>
              <div style={{ fontSize: 20, fontWeight: 900 }}>{pct(avg(ups.map((l) => l.ret)))}</div>
              <div style={{ fontSize: 14 }}>{avg(ups.map((l) => l.bars)).toFixed(0)} bars · {ups.length} total</div>
            </div>
            <div style={{ background: 'rgba(255,77,77,0.08)', border: `1px solid ${RED}55`, borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: RED }}>AVG DROP</div>
              <div style={{ fontSize: 20, fontWeight: 900 }}>{pct(avg(downs.map((l) => l.ret)))}</div>
              <div style={{ fontSize: 14 }}>{avg(downs.map((l) => l.bars)).toFixed(0)} bars · {downs.length} total</div>
            </div>
          </div>

          {recent.map((l, i) => (
            <SwingRow key={i} leg={l} max={maxMove} />
          ))}
        </Section>

        {/* Now */}
        <Section title="NOW" accent={GREEN}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {d.gauges.map((g) => (
              <GaugeCard key={g.label} label={g.label} display={g.display} pct={g.pct} />
            ))}
          </div>
          <Ladder d={d} />
        </Section>
      </div>

      {/* Analogs */}
      <Section title="THE MATCHES" accent={GOLD}>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 700 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '130px 90px 150px repeat(4, 1fr) 90px', gap: 8, fontSize: 13, color: WHITE, fontWeight: 800, letterSpacing: 1, padding: '0 8px 8px' }}>
              <span>DATE</span><span>MATCH</span><span>PATH</span><span style={{ textAlign: 'center' }}>5</span><span style={{ textAlign: 'center' }}>10</span><span style={{ textAlign: 'center' }}>20</span><span style={{ textAlign: 'center' }}>30</span><span style={{ textAlign: 'right' }}>DIP</span>
            </div>
            {rows.map((a) => {
              const on = a.idx === selIdx
              const score = Math.round(100 * Math.exp(-a.distance))
              return (
                <div
                  key={a.idx}
                  onClick={() => setSelIdx(on ? null : a.idx)}
                  style={{ display: 'grid', gridTemplateColumns: '130px 90px 150px repeat(4, 1fr) 90px', gap: 8, alignItems: 'center', padding: '8px', marginBottom: 6, borderRadius: 8, cursor: 'pointer', background: on ? 'rgba(255,213,79,0.16)' : 'rgba(255,255,255,0.04)', border: `1px solid ${on ? GOLD : LINE}` }}
                >
                  <span style={{ fontSize: 16, color: WHITE, fontWeight: 900 }}>{dateStr(a.t)}</span>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 900, color: WHITE }}>{score}</div>
                    <div style={{ height: 5, background: 'rgba(255,255,255,0.14)', borderRadius: 3, marginTop: 3 }}>
                      <div style={{ width: `${score}%`, height: '100%', background: GOLD, borderRadius: 3 }} />
                    </div>
                  </div>
                  <Spark path={a.path} />
                  {[5, 10, 20, 30].map((h) => (
                    <span
                      key={h}
                      style={{ fontSize: 16, fontWeight: 900, color: WHITE, textAlign: 'center', padding: '7px 0', borderRadius: 6, background: a.ret[h] >= 0 ? `rgba(0,230,118,${Math.min(0.55, 0.12 + Math.abs(a.ret[h]) / maxRet)})` : `rgba(255,77,77,${Math.min(0.55, 0.12 + Math.abs(a.ret[h]) / maxRet)})` }}
                    >
                      {pct(a.ret[h])}
                    </span>
                  ))}
                  <span style={{ fontSize: 15, fontWeight: 900, color: AMBER, textAlign: 'right' }}>{pct(a.worst)}</span>
                </div>
              )
            })}
          </div>
        </div>
        {d.analogs.length > 8 && (
          <button
            onClick={() => setShowAll((v) => !v)}
            style={{ marginTop: 6, width: '100%', background: 'rgba(255,255,255,0.06)', border: `1px solid ${LINE}`, borderRadius: 6, color: WHITE, padding: 9, fontFamily: FONT, fontSize: 15, fontWeight: 800, cursor: 'pointer' }}
          >
            {showAll ? 'Show fewer' : `Show all ${d.analogs.length}`}
          </button>
        )}
      </Section>
    </div>
  )
}

// Rendered inside a shadow root so the app's global CSS cannot restyle it
const StockDossier: React.FC<{ ticker: string; bars: DBar[]; belowChart?: React.ReactNode }> = ({ ticker, bars, belowChart }) => {
  const hostRef = useRef<HTMLDivElement>(null)
  const [root, setRoot] = useState<ShadowRoot | null>(null)
  useEffect(() => {
    const host = hostRef.current
    if (host) setRoot(host.shadowRoot || host.attachShadow({ mode: 'open' }))
  }, [])
  return (
    <div ref={hostRef} style={{ width: '100%' }}>
      {root && createPortal(<DossierBody ticker={ticker} bars={bars} belowChart={belowChart} />, root as unknown as Element)}
    </div>
  )
}

export default StockDossier
