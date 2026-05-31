'use client'

import { RefreshCw } from 'lucide-react'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import ClusterCardMobileTimeframe from './ClusterCardMobileTimeframe'
import DealerClusterMobileTowerToggle from './DealerClusterMobileTowerToggle'
import { useClusterCardMobile } from './useClusterCardMobile'
import { useDealerClusterScreenerMobile } from './useDealerClusterScreenerMobile'

const GEX_SCAN_QUOTES = [
  { body: "Gamma is the accelerator. Delta is just where you are.", author: '' },
  { body: "The dealer\u2019s hedge today is tomorrow\u2019s price magnet.", author: '' },
  { body: "Options flow is the shadow of informed money moving through walls.", author: '' },
  { body: "The open interest never forgets. It remembers every position ever taken.", author: '' },
  { body: "When the smart money speaks, it speaks in size.", author: '' },
  { body: "Flow precedes price. Always follow the paper.", author: '' },
  { body: "Unusual options activity isn\u2019t always smart money \u2014 but it\u2019s always worth watching.", author: '' },
  { body: "The market moves toward max pain like a river to the sea.", author: '' },
  { body: "Be fearful when others are greedy, and greedy when others are fearful.", author: '\u2014 Warren Buffett' },
  { body: "Markets can remain irrational longer than you can remain solvent.", author: '\u2014 John Maynard Keynes' },
  { body: "In the short run, the market is a voting machine. In the long run, it is a weighing machine.", author: '\u2014 Benjamin Graham' },
  { body: "The trend is your friend until the end.", author: '\u2014 Ed Seykota' },
  { body: "Cut your losses short and let your winners run.", author: '\u2014 Wall Street axiom' },
  { body: "Risk comes from not knowing what you\u2019re doing.", author: '\u2014 Warren Buffett' },
  { body: "Volatility is not risk. The permanent loss of capital is risk.", author: '\u2014 Howard Marks' },
]

import DealerGEXChart from './DealerGEXChart'
import DealerOpenInterestChart from './DealerOpenInterestChart'

const MIN_CLUSTER_PREMIUM = 1_000_000 // $1M filter

interface StrikePremium {
  strike: number
  premium: number
  mid: number
  oi: number
}

interface ClusterItem {
  ticker: string
  currentPrice: number
  strength: number
  cluster: {
    strikes: number[]
    centralStrike: number
    totalGEX: number
    contributions: number[]
    oi: number[]
    type: 'call' | 'put'
  }
  pressure: number
  strikePremiums?: StrikePremium[]
  totalPremium?: number
}

async function fetchClusterPremium(
  ticker: string,
  strikes: number[],
  clusterType: 'call' | 'put'
): Promise<{ strikePremiums: StrikePremium[]; totalPremium: number }> {
  try {
    const res = await fetch(`/api/dealer-options-premium?ticker=${ticker}`)
    if (!res.ok) return { strikePremiums: [], totalPremium: 0 }
    const json = await res.json()
    if (!json.success) return { strikePremiums: [], totalPremium: 0 }

    const expirations = Object.keys(json.data)
    let totalPremium = 0
    const strikeMap: Record<number, { premium: number; mid: number; oi: number }> = {}

    for (const exp of expirations) {
      const side = clusterType === 'call' ? json.data[exp].calls : json.data[exp].puts
      if (!side) continue
      for (const strike of strikes) {
        const contract = side[strike.toString()]
        if (!contract) continue
        const premium = contract.premium || 0
        const mid = contract.mid_price || 0
        const oi = contract.open_interest || 0
        if (!strikeMap[strike]) strikeMap[strike] = { premium: 0, mid, oi: 0 }
        strikeMap[strike].premium += premium
        strikeMap[strike].oi += oi
        totalPremium += premium
      }
    }

    const strikePremiums = strikes.map((s) => ({
      strike: s,
      premium: strikeMap[s]?.premium || 0,
      mid: strikeMap[s]?.mid || 0,
      oi: strikeMap[s]?.oi || 0,
    }))

    return { strikePremiums, totalPremium }
  } catch {
    return { strikePremiums: [], totalPremium: 0 }
  }
}

function fmtPremium(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`
  return `$${v.toFixed(0)}`
}

// ─────────────────────────────────────────────────────────────
// ClusterCard — dual-panel: candlesticks (top) + GEX bars (bottom)
// 30-min bars, market hours only (9:30–16:00 ET), zoom + drag
// ─────────────────────────────────────────────────────────────
function ClusterCard({
  item,
  side,
  expandedCards,
  toggleExpandedCard,
  expirationFilter,
}: {
  item: ClusterItem
  side: 'positive' | 'negative'
  expandedCards: Set<string>
  toggleExpandedCard: (k: string) => void
  expirationFilter: string
}) {
  const isPos = side === 'positive'
  const accentColor = isPos ? '#ff4444' : '#00d264'
  const cardKey = `${side}-${item.ticker}`
  const isExpanded = expandedCards.has(cardKey)
  const expiryParam = expirationFilter === 'Week' ? '7-days' : expirationFilter === 'Month' ? '30-days' : '45-days'

  type TF = '1d' | '1h' | '5m'
  const [timeframe, setTimeframe] = useState<TF>('1h')
  const { isMobileCard } = useClusterCardMobile()

  // ── Fetch ──────────────────────────────────────────────────────
  type Bar = { t: number; o: number; h: number; l: number; c: number; v: number }
  const [bars5m, setBars5m] = useState<Bar[]>([])
  const [bars1h, setBars1h] = useState<Bar[]>([])
  const [bars1d, setBars1d] = useState<Bar[]>([])

  useEffect(() => {
    const to = new Date()
    const fmt = (d: Date) => d.toISOString().split('T')[0]
    const toBars = (results: any[]): Bar[] =>
      results.map((b: any) => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v ?? 0 }))

    // 5m — last 7 trading days, all hours (pre/regular/after)
    const from5m = new Date(to.getTime() - 7 * 86_400_000)
    fetch(`/api/historical-data?symbol=${item.ticker}&startDate=${fmt(from5m)}&endDate=${fmt(to)}&timeframe=5m&ultrafast=true&forceRefresh=true&_t=${Date.now()}`)
      .then(r => r.json()).then(d => { if (d.results?.length) setBars5m(toBars(d.results)) }).catch(() => { })

    // 1h — last 30 trading days, all hours
    const from1h = new Date(to.getTime() - 30 * 86_400_000)
    fetch(`/api/historical-data?symbol=${item.ticker}&startDate=${fmt(from1h)}&endDate=${fmt(to)}&timeframe=1h&ultrafast=true&_t=${Date.now()}`)
      .then(r => r.json()).then(d => { if (d.results?.length) setBars1h(toBars(d.results)) }).catch(() => { })

    // 1d — last 365 days
    const from1d = new Date(to.getTime() - 365 * 86_400_000)
    fetch(`/api/historical-data?symbol=${item.ticker}&startDate=${fmt(from1d)}&endDate=${fmt(to)}&timeframe=1d&ultrafast=true&_t=${Date.now()}`)
      .then(r => r.json()).then(d => {
        if (!d.results?.length) return
        const wd = d.results
          .map((b: any) => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v ?? 0 } as Bar))
          .filter((b: Bar) => { const dow = new Date(b.t).getUTCDay(); return dow !== 0 && dow !== 6 })
        setBars1d(wd)
      }).catch(() => { })
  }, [item.ticker])

  // ── Active bars based on selected timeframe ───────────────────
  const allBars = timeframe === '5m' ? bars5m : timeframe === '1h' ? bars1h : bars1d

  // ── Zoom / drag state ─────────────────────────────────────────
  const [viewRange, setViewRange] = useState<{ s: number; e: number } | null>(null)
  const dragRef = useRef<{ startX: number; startS: number; startE: number } | null>(null)
  const chartDivRef = useRef<HTMLDivElement>(null)

  const nb = allBars.length
  // Default visible bars per timeframe — snap to last N on new data/timeframe
  const DEFAULT_VISIBLE: Record<string, number> = { '5m': 150, '1h': 120, '1d': 200 }
  useEffect(() => {
    if (nb === 0) return
    const def = DEFAULT_VISIBLE[timeframe] ?? 150
    if (nb <= def) { setViewRange(null); return }
    setViewRange({ s: nb - def, e: nb - 1 })
  }, [nb, timeframe])

  const vs = viewRange ? Math.max(0, viewRange.s) : 0
  const ve = viewRange ? Math.min(nb - 1, viewRange.e) : nb - 1
  const intraBars = allBars.slice(vs, ve + 1)
  const ni = intraBars.length

  // ── Layout ────────────────────────────────────────────────────
  const VW = 700
  const PL = 6    // minimal left margin (labels go inside panels)
  const PR = 46   // right price labels
  const plotW = VW - PL - PR  // 648

  const priceH = isMobileCard ? 140 : 190  // price panel height
  const xAxisH = 22   // single-row x-axis
  const PT = 10   // top padding
  const VH = PT + priceH + xAxisH

  const priceY0 = PT

  const uid = `${item.ticker}-${side}`

  // ── Price axis ────────────────────────────────────────────────
  const minP = ni > 0 ? Math.min(...intraBars.map(b => b.l)) : item.currentPrice * 0.97
  const maxP = ni > 0 ? Math.max(...intraBars.map(b => b.h)) : item.currentPrice * 1.03
  const pPad = Math.max((maxP - minP) * 0.08, 0.05)
  const pMin = minP - pPad
  const pMax = maxP + pPad
  const yP = (p: number) => priceY0 + priceH - ((p - pMin) / (pMax - pMin)) * priceH

  // ── Candle x positioning ──────────────────────────────────────
  const slotW = ni > 1 ? plotW / ni : plotW
  const bodyW = Math.max(2, slotW * 0.7)
  const xC = (i: number) => PL + (i + 0.5) * slotW

  // ── X-axis labels — EFI collision-detection approach ──────────
  const xAxisLabels = useMemo(() => {
    if (ni === 0) return [] as { i: number; lbl: string; isDay: boolean }[]
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const DNAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

    // Separate placed pools: day labels need much more room than time ticks
    // A trading day is ~6.5 bars on 1h, ~78 bars on 5m — ensure at least 1.5 day-widths between day labels
    const BARS_PER_DAY = timeframe === '5m' ? 78 : timeframe === '1h' ? 6.5 : 1
    const dayMinGap = Math.max(100, slotW * BARS_PER_DAY * 1.5)
    const timeMinGap = Math.max(55, slotW * 4)

    const dayPlaced: number[] = []
    const timePlaced: number[] = []

    const canPlaceDay = (x: number) => dayPlaced.every(px => Math.abs(px - x) >= dayMinGap)
    // time labels must also stay clear of day labels
    const canPlaceTime = (x: number) =>
      timePlaced.every(px => Math.abs(px - x) >= timeMinGap) &&
      dayPlaced.every(px => Math.abs(px - x) >= timeMinGap)

    const result: { i: number; lbl: string; isDay: boolean }[] = []

    const tryPlaceDay = (idx: number, lbl: string) => {
      const x = PL + (idx + 0.5) * slotW
      if (x < PL || x > PL + plotW) return
      if (!canPlaceDay(x)) return
      dayPlaced.push(x)
      result.push({ i: idx, lbl, isDay: true })
    }
    const tryPlaceTime = (idx: number, lbl: string) => {
      const x = PL + (idx + 0.5) * slotW
      if (x < PL || x > PL + plotW) return
      if (!canPlaceTime(x)) return
      timePlaced.push(x)
      result.push({ i: idx, lbl, isDay: false })
    }

    const pstMinsOf = (ts: number) => {
      const p = new Date(new Date(ts).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', hour12: false }))
      return p.getHours() * 60 + p.getMinutes()
    }
    const pstDayOf = (ts: number) =>
      new Date(ts).toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' })
    const pstDateObj = (ts: number) =>
      new Date(new Date(ts).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', hour12: false }))

    if (timeframe === '5m') {
      // Day labels first (higher priority / larger gap)
      let lastDay = ''
      intraBars.forEach((b, idx) => {
        const dayKey = pstDayOf(b.t)
        if (dayKey === lastDay) return
        lastDay = dayKey
        const p = pstDateObj(b.t)
        tryPlaceDay(idx, `${DNAMES[p.getDay()]} ${MONTHS[p.getMonth()]} ${p.getDate()}`)
      })
      // Time ticks — granularity scales with zoom
      const tickMins = slotW >= 20 ? 15 : slotW >= 8 ? 30 : 60
      intraBars.forEach((b, idx) => {
        const pstM = pstMinsOf(b.t)
        if (pstM % tickMins !== 0) return
        const hh = Math.floor(pstM / 60)
        const mm = pstM % 60
        const h12 = hh > 12 ? hh - 12 : hh === 0 ? 12 : hh
        const ampm = hh >= 12 ? 'PM' : 'AM'
        tryPlaceTime(idx, mm === 0 ? `${h12}${ampm}` : `${h12}:${String(mm).padStart(2, '0')}${ampm}`)
      })
    } else if (timeframe === '1h') {
      // Day labels first
      let lastDay = ''
      intraBars.forEach((b, idx) => {
        const dayKey = pstDayOf(b.t)
        if (dayKey === lastDay) return
        lastDay = dayKey
        const p = pstDateObj(b.t)
        tryPlaceDay(idx, `${DNAMES[p.getDay()]} ${p.getMonth() + 1}/${p.getDate()}`)
      })
      // Hour ticks only when zoomed in enough (slotW ≥ 14px = lots of space per bar)
      if (slotW >= 14) {
        const hStep = slotW >= 22 ? 1 : 2
        intraBars.forEach((b, idx) => {
          const pstM = pstMinsOf(b.t)
          const hh = Math.floor(pstM / 60)
          if (hh % hStep !== 0) return
          const h12 = hh > 12 ? hh - 12 : hh === 0 ? 12 : hh
          const ampm = hh >= 12 ? 'PM' : 'AM'
          tryPlaceTime(idx, `${h12}${ampm}`)
        })
      }
    } else {
      // 1d — month boundaries first, then weekly Mondays
      let lastMonth = -1
      intraBars.forEach((b, idx) => {
        const d = new Date(b.t)
        const month = d.getUTCMonth()
        if (month !== lastMonth) {
          lastMonth = month
          tryPlaceDay(idx, MONTHS[month])
        }
      })
      intraBars.forEach((b, idx) => {
        const d = new Date(b.t)
        if (d.getUTCDay() === 1) {
          tryPlaceTime(idx, `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`)
        }
      })
    }

    return result.sort((a, b) => a.i - b.i)
  }, [intraBars, timeframe, slotW, ni, PL, plotW])

  // ── Price ticks ───────────────────────────────────────────────
  const priceTicks = useMemo(() => {
    const range = pMax - pMin
    if (range <= 0) return [item.currentPrice]
    const mag = Math.pow(10, Math.floor(Math.log10(range)) - 1)
    const step = Math.ceil((range / 5) / mag) * mag
    const out: number[] = []
    for (let v = Math.ceil(pMin / step) * step; v <= pMax; v += step) out.push(v)
    return out.slice(0, 6)
  }, [pMin, pMax, item.currentPrice])

  // Use refs so the wheel handler never needs to be re-registered
  const nbRef = useRef(0)
  const viewRangeRef = useRef<{ s: number; e: number } | null>(null)
  nbRef.current = nb
  viewRangeRef.current = viewRange

  // ── Wheel zoom — native listener registered ONCE (passive:false) ──
  useEffect(() => {
    const el = chartDivRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const total = nbRef.current
      if (total < 2) return
      const cur = viewRangeRef.current
      const curS = cur ? cur.s : 0
      const curE = cur ? cur.e : total - 1
      const span = Math.max(1, curE - curS)
      const dir = e.deltaY > 0 ? 1 : -1  // scroll down = zoom out (more bars)
      // Fixed step based on TOTAL bars — symmetric zoom in / zoom out
      const step = Math.max(2, Math.round(total * 0.12))
      const newSpan = Math.max(8, Math.min(total, span + dir * step))
      const center = Math.round((curS + curE) / 2)
      const newS = Math.max(0, center - Math.floor(newSpan / 2))
      const newE = Math.min(total - 1, newS + newSpan - 1)
      // If zoomed to full view, clear viewRange so chart auto-fits new data
      if (newE - newS >= total - 1) { setViewRange(null); return }
      setViewRange({ s: newS, e: newE })
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])  // empty deps — register once, refs handle current values

  // ── Drag pan ──────────────────────────────────────────────────
  const onMouseDown = (e: React.MouseEvent) => {
    dragRef.current = {
      startX: e.clientX,
      startS: viewRange?.s ?? 0,
      startE: viewRange?.e ?? (nb - 1),
    }
  }
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragRef.current) return
    const { startX, startS, startE } = dragRef.current
    const span = startE - startS
    const shift = Math.round(-(e.clientX - startX) / plotW * span)
    const newS = Math.max(0, Math.min(nb - 1 - span, startS + shift))
    setViewRange({ s: newS, e: newS + span })
  }
  const onMouseUp = () => { dragRef.current = null }

  return (
    <div
      onClick={() => toggleExpandedCard(cardKey)}
      style={{
        background: '#000',
        border: `1px solid ${isExpanded ? accentColor : `${accentColor}33`}`,
        borderLeft: `3px solid ${isExpanded ? accentColor : `${accentColor}55`}`,
        borderRadius: 0,
        marginBottom: 4,
        cursor: 'pointer',
        overflow: 'hidden',
      }}
    >
      {/* ── Header row ── */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '5px 8px',
          background: 'linear-gradient(180deg,#1c1c1c 0%,#080808 100%)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          userSelect: 'none',
        }}
      >
        {/* Ticker */}
        <span style={{ fontSize: 18, fontWeight: 900, fontFamily: 'monospace', letterSpacing: '0.12em', color: '#FF6600', flexShrink: 0 }}>
          {item.ticker}
        </span>

        {/* Price */}
        <span style={{ fontSize: 15, fontWeight: 700, fontFamily: 'monospace', color: '#ffffff', flexShrink: 0 }}>
          ${item.currentPrice.toFixed(2)}
        </span>

        {/* % change from daily bars */}
        {(() => {
          const prev = bars1d[bars1d.length - 2]?.c
          const curr = bars1d[bars1d.length - 1]?.c ?? item.currentPrice
          if (!prev) return null
          const pct = ((curr - prev) / prev) * 100
          const pos = pct >= 0
          return (
            <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'monospace', color: pos ? '#00e676' : '#ff1744', flexShrink: 0 }}>
              {pos ? '+' : ''}{pct.toFixed(2)}%
            </span>
          )
        })()}

        {/* Cluster value */}
        {item.totalPremium != null && item.totalPremium > 0 && (() => {
          const p = item.totalPremium
          const fmt = p >= 1e9 ? `$${(p / 1e9).toFixed(2)}B` : p >= 1e6 ? `$${(p / 1e6).toFixed(1)}M` : `$${(p / 1e3).toFixed(0)}K`
          const clusterColor = item.cluster.type === 'call' ? '#00e676' : '#ff1744'
          return (
            <span style={{ fontSize: 14, fontFamily: 'monospace', color: '#ffffff', flexShrink: 0 }}>
              Cluster:&nbsp;<span style={{ fontWeight: 700, color: clusterColor }}>{fmt}</span>
            </span>
          )
        })()}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Timeframe buttons / dropdown */}
        {isMobileCard ? (
          <ClusterCardMobileTimeframe
            isExpanded={isExpanded}
            onClose={() => toggleExpandedCard(cardKey)}
            timeframe={timeframe}
            setTimeframe={setTimeframe}
            accentColor={accentColor}
          />
        ) : (
          (['1d', '1h', '5m'] as const).map(tf => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              style={{
                fontSize: 14,
                fontFamily: 'monospace',
                fontWeight: 800,
                letterSpacing: '0.1em',
                padding: '2px 8px',
                border: `1px solid ${timeframe === tf ? '#ffffff' : 'rgba(255,255,255,0.2)'}`,
                borderRadius: 2,
                background: timeframe === tf
                  ? 'linear-gradient(180deg,#2a2a2a 0%,#0a0a0a 100%)'
                  : 'linear-gradient(180deg,#141414 0%,#030303 100%)',
                color: '#ffffff',
                cursor: 'pointer',
                lineHeight: 1.4,
                flexShrink: 0,
                boxShadow: timeframe === tf ? `0 0 5px ${accentColor}55` : 'none',
              }}
            >{tf.toUpperCase()}</button>
          ))
        )}
      </div>

      <div
        ref={chartDivRef}
        style={{ background: '#000', userSelect: 'none', cursor: dragRef.current ? 'grabbing' : 'grab', display: isExpanded ? 'none' : 'block' }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        <svg viewBox={`0 0 ${VW} ${VH}`} style={{ width: '100%', display: 'block' }}>
          <defs>
            <clipPath id={`cp-${uid}`}><rect x={PL} y={priceY0} width={plotW} height={priceH} /></clipPath>
          </defs>

          {/* ── PRICE PANEL background ── */}
          <rect x={PL} y={priceY0} width={plotW} height={priceH} fill="#000" />

          {/* ── Extended hours shading — merged regions, no hairline gaps ── */}
          {/* Pre-market (1AM–6:30AM PST) = orange, After-hours (1PM–5PM PST) = blue */}
          {(timeframe === '5m' || timeframe === '1h') && (() => {
            const regions: { x: number; w: number; fill: string }[] = []
            intraBars.forEach((b, ci) => {
              const pstStr = new Date(b.t).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', hour12: false })
              const pstDate = new Date(pstStr)
              const m = pstDate.getHours() * 60 + pstDate.getMinutes()
              const isPreMkt = m >= 60 && m < 390  // 1AM–6:30AM PST
              const isAfterMkt = m >= 780 && m < 1020 // 1PM–5PM PST
              if (!isPreMkt && !isAfterMkt) return
              const fill = isPreMkt ? 'rgba(255,140,60,0.08)' : 'rgba(100,150,200,0.08)'
              const x0 = xC(ci) - slotW / 2
              const last = regions[regions.length - 1]
              if (last && last.fill === fill && Math.abs((last.x + last.w) - x0) < 1) {
                last.w += slotW  // extend existing region
              } else {
                regions.push({ x: x0, w: slotW, fill })
              }
            })
            return regions.map((r, i) => (
              <rect
                key={`ext-${i}`}
                x={Math.floor(r.x)} y={priceY0}
                width={Math.ceil(r.w)} height={priceH}
                fill={r.fill}
                clipPath={`url(#cp-${uid})`}
              />
            ))
          })()}

          {/* ── Candlesticks ── */}
          {intraBars.map((b, ci) => {
            const cx = xC(ci)
            const hiY = yP(b.h)
            const loY = yP(b.l)
            const opY = yP(b.o)
            const clY = yP(b.c)
            const top = Math.min(opY, clY)
            const bh = Math.max(2, Math.abs(clY - opY))
            const isUp = b.c >= b.o
            // Explicit solid colors — no inheritance, no opacity, no gradient
            const bodyColor = isUp ? '#00e676' : '#ff1744'
            const wickColor = isUp ? '#00e676' : '#ff1744'
            const bx = cx - bodyW / 2
            const bw = bodyW
            const wx = cx
            return (
              <g key={ci} clipPath={`url(#cp-${uid})`}>
                <line x1={wx} y1={hiY} x2={wx} y2={loY}
                  stroke={wickColor} strokeWidth={1}
                  style={{ stroke: wickColor, strokeOpacity: 1 }}
                />
                <rect
                  x={bx} y={top}
                  width={bw} height={Math.max(1, bh)}
                  style={{ fill: bodyColor, fillOpacity: 1 }}
                  stroke="none"
                />
              </g>
            )
          })}

          {/* loading state */}
          {ni === 0 && (
            <text x={PL + plotW / 2} y={priceY0 + priceH / 2}
              textAnchor="middle" fill="#fff" opacity={0.25} fontSize={11} fontFamily="monospace"
            >LOADING…</text>
          )}

          {/* ── RIGHT Y: Price labels ── */}
          {priceTicks.map(p => {
            const py = yP(p)
            if (py < priceY0 || py > priceY0 + priceH) return null
            return (
              <text key={p} x={PL + plotW + 3} y={py + 3.5}
                textAnchor="start" fill="#ffffff" fontSize={16} fontFamily="monospace" fontWeight="700"
              >${p < 10 ? p.toFixed(2) : p.toFixed(p % 1 === 0 ? 0 : 2)}</text>
            )
          })}

          {/* price panel border — solid white bottom x-axis, no sides */}
          <line x1={PL} y1={priceY0 + priceH} x2={PL + plotW} y2={priceY0 + priceH} stroke="#ffffff" strokeWidth={1} />

          {/* ── X AXIS: EFI adaptive single-row labels ── */}
          {xAxisLabels.map(({ i, lbl, isDay }) => {
            const rawX = xC(i)
            const approxHalfW = lbl.length * (isDay ? 4.8 : 4.2)
            const x = Math.max(PL + approxHalfW, Math.min(PL + plotW - approxHalfW, rawX))
            return (
              <g key={`${i}-${lbl}`}>
                <line
                  x1={rawX} y1={priceY0 + priceH}
                  x2={rawX} y2={priceY0 + priceH + 4}
                  stroke="#ffffff"
                  strokeWidth={1}
                />
                <text x={x} y={priceY0 + priceH + 15}
                  textAnchor="middle"
                  fill="#ffffff"
                  fontSize={isDay ? 16 : 13}
                  fontWeight={isDay ? '700' : '400'}
                  fontFamily="monospace"
                >{lbl}</text>
              </g>
            )
          })}
        </svg>
      </div>

      {/* ── Expanded charts ── */}
      {isExpanded && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ borderTop: `1px solid ${accentColor}22`, padding: '14px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
            {!isMobileCard && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: accentColor }} />
                <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', color: accentColor }}>
                  CLUSTER ANALYSIS — {item.ticker} · {item.cluster.type.toUpperCase()} · ${item.cluster.centralStrike.toFixed(2)}
                </span>
              </div>
            )}
            {!isMobileCard && (
              <button
                onClick={(e) => { e.stopPropagation(); toggleExpandedCard(cardKey) }}
                style={{
                  background: 'transparent',
                  border: `1px solid ${accentColor}55`,
                  color: accentColor,
                  fontSize: 11,
                  fontWeight: 800,
                  fontFamily: 'monospace',
                  letterSpacing: '0.12em',
                  padding: '3px 10px',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                ✕ CLOSE
              </button>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: isMobileCard ? 'column' : 'row', gap: 10, alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <DealerOpenInterestChart
                selectedTicker={item.ticker} selectedExpiration={expiryParam}
                hideAllControls={true} hideExpirationSelector={true}
                compactMode={true} chartWidth={650}
                svgHeight={isMobileCard ? 502 : 605}
                showCalls={true} showPuts={true} showNetOI={false} showTowers={true}
              />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <DealerGEXChart
                selectedTicker={item.ticker} selectedExpiration={expiryParam}
                hideAllControls={true} hideExpirationSelector={true}
                compactMode={true} chartWidth={650}
                svgHeight={isMobileCard ? 502 : 605}
                showPositiveGamma={true} showNegativeGamma={true} showNetGamma={true}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function DealerClusterScreener() {
  const [loading, setLoading] = useState(false)
  const [premiumLoading, setPremiumLoading] = useState(false)
  const [error, setError] = useState('')
  const allEnrichedRef = useRef<ClusterItem[]>([])
  const [enrichedVersion, setEnrichedVersion] = useState(0) // bump to trigger re-derive
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 0 })
  const [premiumProgress, setPremiumProgress] = useState({ current: 0, total: 0 })
  const [lastUpdate, setLastUpdate] = useState('')
  const [expirationFilter, setExpirationFilter] = useState('Default')
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set())
  const [minPremium, setMinPremium] = useState(1_000_000)
  const toggleExpandedCard = (k: string) => setExpandedCards(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n })
  const { isMobile, mobileTower, setMobileTower } = useDealerClusterScreenerMobile()
  const loadingQuoteRef = useRef(GEX_SCAN_QUOTES[Math.floor(Math.random() * GEX_SCAN_QUOTES.length)])
  // callback ref: observer attaches the moment the grid div mounts (after loading)
  const gridCallbackRef = useRef((node: HTMLDivElement | null) => {
    if (!node) return
    const obs = new IntersectionObserver(([entry]) => setGridVisible(entry.isIntersecting), { threshold: 0.05 })
    obs.observe(node)
  }).current
  const [gridVisible, setGridVisible] = useState(false)

  // Compute expiry date labels based on today
  const getExpiryOptions = () => {
    const today = new Date()
    const fmt = (d: Date) => {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      const day = d.getDate()
      const sfx = [11, 12, 13].includes(day) ? 'th' : day % 10 === 1 ? 'st' : day % 10 === 2 ? 'nd' : day % 10 === 3 ? 'rd' : 'th'
      return `${months[d.getMonth()]} ${day}${sfx} ${d.getFullYear()}`
    }
    const addDays = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r }

    // Next Friday (week expiry) — skip today if it's already Friday
    const nextFri = new Date(today)
    const dayOfWeek = today.getDay()
    const daysToFri = dayOfWeek === 5 ? 7 : (5 - dayOfWeek + 7) % 7 || 7
    nextFri.setDate(today.getDate() + daysToFri)

    // ~45 days default
    const defaultExp = addDays(today, 45)

    // Monthly OPEX: actual 3rd Friday of the next upcoming month
    // (if current month's 3rd Friday has already passed, use next month)
    const computeMonthlyOPEX = (): Date => {
      let yr = today.getFullYear()
      let mm = today.getMonth()
      for (let attempt = 0; attempt < 3; attempt++) {
        const dow = new Date(yr, mm, 1).getDay()                // local day of 1st
        const firstFriday = 1 + (5 - dow + 7) % 7              // day-of-month of 1st Friday
        const opex = new Date(yr, mm, firstFriday + 14)         // 3rd Friday
        if (opex > today) return opex
        mm++; if (mm > 11) { mm = 0; yr++ }
      }
      return addDays(today, 30) // fallback
    }
    const monthExp = computeMonthlyOPEX()

    // Quarterly OPEX: 3rd Friday of next Mar/Jun/Sep/Dec
    const qMonths = [2, 5, 8, 11] // 0-indexed
    let qDate = new Date(today)
    for (let m = today.getMonth(); m <= today.getMonth() + 9; m++) {
      const mm = m % 12
      if (qMonths.includes(mm)) {
        const yr = today.getFullYear() + Math.floor((today.getMonth() + (m - today.getMonth())) / 12)
        const dow = new Date(yr, mm, 1).getDay()
        const firstFriday = 1 + (5 - dow + 7) % 7
        qDate = new Date(yr, mm, firstFriday + 14)
        if (qDate > today) break
      }
    }

    return [
      { value: 'Default', label: '45D', sub: fmt(defaultExp) },
      { value: 'Week', label: 'WEEK', sub: fmt(nextFri) },
      { value: 'Month', label: 'MONTH', sub: fmt(monthExp) },
      { value: 'Quad', label: 'QUARTERLY', sub: fmt(qDate) },
    ]
  }
  const expiryOptions = getExpiryOptions()
  const selectedExpLabel = expiryOptions.find(o => o.value === expirationFilter)

  const selectStyle: React.CSSProperties = {
    appearance: 'none' as const,
    background: '#000000',
    border: '1px solid rgba(255,255,255,0.12)',
    color: '#ffffff',
    padding: '8px 36px 8px 14px',
    borderRadius: 6,
    fontSize: 17,
    fontWeight: 700,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    outline: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'%3E%3Cpath fill='%23666' d='M5 7L1 3h8z'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 10px center',
    backgroundSize: '8px',
    minWidth: 0,
  }

  const handleScan = async () => {
    setLoading(true)
    setError('')
    setScanProgress({ current: 0, total: 0 })
    setPremiumProgress({ current: 0, total: 0 })
    allEnrichedRef.current = []
    setEnrichedVersion(v => v + 1)

    try {
      const response = await fetch(
        `/api/gex-screener?limit=1000&stream=true&expirationFilter=${expirationFilter}`
      )
      if (!response.ok) throw new Error(`Failed to fetch: ${response.statusText}`)

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      if (!reader) throw new Error('No reader')

      let buffer = ''
      const rawPos: ClusterItem[] = []
      const rawNeg: ClusterItem[] = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const msg = JSON.parse(line.substring(6))
            if (msg.type === 'start') {
              setScanProgress({ current: 0, total: msg.total })
            } else if (msg.type === 'result') {
              setScanProgress({ current: msg.progress, total: msg.total })
              const d = msg.data
              const strength = d.gexImpactScore || 0
              if (strength <= 75) continue
              const wall = d.largestWall
              if (!wall?.cluster || wall.cluster.strikes.length < 3) continue
              const minStrike = Math.min(...wall.cluster.strikes)
              const maxStrike = Math.max(...wall.cluster.strikes)
              if (d.currentPrice < minStrike || d.currentPrice > maxStrike) continue
              const netGex = d.netGex || 0
              if (wall.cluster.type === 'call' && netGex < 0) continue
              if (wall.cluster.type === 'put' && netGex > 0) continue

              const item: ClusterItem = {
                ticker: d.ticker,
                currentPrice: d.currentPrice,
                strength,
                cluster: wall.cluster,
                pressure: wall.pressure,
              }
              if (wall.cluster.type === 'call') rawPos.push(item)
              else rawNeg.push(item)
            } else if (msg.type === 'complete') {
              setScanProgress({ current: msg.count, total: msg.count })
            } else if (msg.type === 'error') {
              throw new Error(msg.error)
            }
          } catch { /* skip */ }
        }
      }

      setLoading(false)

      // --- Premium validation pass ---
      const allRaw = [...rawPos, ...rawNeg]
      setPremiumLoading(true)
      setPremiumProgress({ current: 0, total: allRaw.length })

      const enriched: ClusterItem[] = []
      for (let i = 0; i < allRaw.length; i++) {
        const item = allRaw[i]
        const { strikePremiums, totalPremium } = await fetchClusterPremium(
          item.ticker,
          item.cluster.strikes,
          item.cluster.type
        )
        setPremiumProgress({ current: i + 1, total: allRaw.length })
        if (totalPremium < 1_000_000) continue
        enriched.push({ ...item, strikePremiums, totalPremium })
      }

      allEnrichedRef.current = enriched
      setEnrichedVersion(v => v + 1)
      setLastUpdate(new Date().toLocaleTimeString())
      setPremiumLoading(false)
    } catch (err: any) {
      setError(err.message || 'Scan failed')
      setLoading(false)
      setPremiumLoading(false)
    }
  }

  const positiveItems = useMemo(() =>
    allEnrichedRef.current
      .filter(x => x.cluster.type === 'call' && (x.totalPremium || 0) >= minPremium)
      .sort((a, b) => (b.totalPremium || 0) - (a.totalPremium || 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enrichedVersion, minPremium]
  )
  const negativeItems = useMemo(() =>
    allEnrichedRef.current
      .filter(x => x.cluster.type === 'put' && (x.totalPremium || 0) >= minPremium)
      .sort((a, b) => (b.totalPremium || 0) - (a.totalPremium || 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enrichedVersion, minPremium]
  )
  const isAnyLoading = loading || premiumLoading
  const hasData = positiveItems.length > 0 || negativeItems.length > 0

  return (
    <div style={{ background: '#000000', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 0, overflow: 'hidden', fontFamily: '"Bloomberg", "Roboto Mono", "IBM Plex Mono", monospace' }}>

      {/* ════════════════════════════════════════════════════════
           HEADER — solid black, subtle glass shine strip
          ════════════════════════════════════════════════════════ */}
      <div
        style={{
          display: isMobile ? 'none' : undefined,
          background: 'linear-gradient(180deg, #1a1a1a 0%, #000000 60%)',
          borderBottom: '1px solid rgba(255,255,255,0.09)',
          padding: '0 24px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* gloss shine strip */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.18) 40%, rgba(255,255,255,0.18) 60%, transparent 100%)' }} />

        {/* main title row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, paddingTop: isMobile ? 8 : 12, paddingBottom: isMobile ? 8 : 14 }}>
          <div style={{ flex: 1 }} />

          {/* Stat pills when data loaded */}
          {hasData && !isAnyLoading && !isMobile && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 4 : 8, background: 'rgba(255,68,68,0.06)', border: '1px solid rgba(255,68,68,0.14)', borderRadius: 4, padding: isMobile ? '4px 8px' : '5px 12px' }}>
                <span style={{ fontSize: isMobile ? 8 : 10, color: 'rgba(255,68,68,0.6)', letterSpacing: '0.14em', fontWeight: 700 }}>CALL TOWERS</span>
                <span style={{ fontSize: isMobile ? 12 : 15, fontWeight: 900, color: '#ff4444' }}>{positiveItems.length}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 4 : 8, background: 'rgba(0,210,100,0.06)', border: '1px solid rgba(0,210,100,0.14)', borderRadius: 4, padding: isMobile ? '4px 8px' : '5px 12px' }}>
                <span style={{ fontSize: isMobile ? 8 : 10, color: 'rgba(0,210,100,0.6)', letterSpacing: '0.14em', fontWeight: 700 }}>PUT TOWERS</span>
                <span style={{ fontSize: isMobile ? 12 : 15, fontWeight: 900, color: '#00d264' }}>{negativeItems.length}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════
           TOOLBAR
          ════════════════════════════════════════════════════════ */}
      <div style={{ background: '#050505', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: isMobile ? '8px 10px' : '10px 24px', display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 12 }}>
        <button
          onClick={handleScan}
          disabled={isAnyLoading}
          style={{
            background: isAnyLoading ? '#111' : '#000',
            border: isAnyLoading ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(255,255,255,0.22)',
            color: isAnyLoading ? '#444' : '#fff',
            padding: isMobile ? '6px 10px' : '8px 20px',
            borderRadius: 4,
            fontWeight: 800,
            fontSize: isMobile ? 12 : 17,
            letterSpacing: '0.14em',
            cursor: isAnyLoading ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            textTransform: 'uppercase',
            boxShadow: isAnyLoading ? 'none' : 'inset 0 1px 0 rgba(255,255,255,0.08)',
            flexShrink: 0,
          }}
        >
          <RefreshCw style={{ width: 12, height: 12 }} className={isAnyLoading ? 'animate-spin' : ''} />
          {isMobile ? (loading ? 'SCANNING...' : 'SCAN') : (loading ? 'SCANNING GEX...' : premiumLoading ? 'VALIDATING PREMIUM...' : 'RUN SCAN')}
        </button>

        {/* Divider */}
        {!isMobile && <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.07)' }} />}

        {/* Expiry selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 4 : 0, position: 'relative' }}>
          {isMobile && (
            <span style={{ fontSize: 11, fontWeight: 800, color: '#FF6600', letterSpacing: '0.1em', whiteSpace: 'nowrap', flexShrink: 0 }}>Expiry</span>
          )}
          {!isMobile && (
            <span style={{ fontSize: 13, fontWeight: 800, color: 'rgba(255,165,0,0.85)', letterSpacing: '0.12em', whiteSpace: 'nowrap', flexShrink: 0 }}>Expiration Range :</span>
          )}
          <select
            value={expirationFilter}
            onChange={(e) => setExpirationFilter(e.target.value)}
            style={{ ...selectStyle, paddingLeft: isMobile ? 8 : 12, paddingRight: isMobile ? 20 : 28, minWidth: isMobile ? 0 : 0, maxWidth: isMobile ? 160 : undefined, fontSize: isMobile ? 11 : 17, width: 'auto' }}
          >
            {expiryOptions.map(o => (
              <option key={o.value} value={o.value}>{o.label}  {o.sub}</option>
            ))}
          </select>
        </div>

        {selectedExpLabel && !isMobile && (
          <span style={{ fontSize: 15, color: '#fff', letterSpacing: '0.1em', fontWeight: 600 }}>
            SCANNING THRU {selectedExpLabel.sub}
          </span>
        )}

        {/* Mobile: single tower toggle */}
        {isMobile && hasData && (
          <DealerClusterMobileTowerToggle
            mobileTower={mobileTower}
            setMobileTower={setMobileTower}
            positiveCount={positiveItems.length}
            negativeCount={negativeItems.length}
          />
        )}

        <div style={{ flex: 1 }} />

        {!isMobile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: 'rgba(255,165,0,0.85)', letterSpacing: '0.12em', whiteSpace: 'nowrap' }}>Floor Filter :</span>
            <select
              value={minPremium}
              onChange={(e) => setMinPremium(Number(e.target.value))}
              style={{ ...selectStyle, paddingLeft: 10, paddingRight: 24, fontSize: 14, width: 'auto' }}
            >
              <option value={1_000_000}>$1M</option>
              <option value={10_000_000}>$10M</option>
              <option value={100_000_000}>$100M</option>
            </select>
          </div>
        )}
      </div>

      {error && (
        <div style={{ padding: '12px 24px', color: '#ff4444', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', background: 'rgba(255,0,0,0.05)', borderBottom: '1px solid rgba(255,0,0,0.1)' }}>
          ⚠ {error}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
           LOADING SCREEN
          ════════════════════════════════════════════════════════ */}
      {isAnyLoading && (
        <div style={{ background: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 24px', minHeight: isMobile ? 'calc(100vh - 160px)' : 400 }}>
          <RefreshCw style={{ width: isMobile ? 35 : 45, height: isMobile ? 35 : 45, color: '#ff6600', marginBottom: 24 }} className="animate-spin" />
          <p style={{ color: '#ff6600', fontFamily: 'monospace', fontSize: isMobile ? 16 : 23, fontWeight: 900, letterSpacing: '0.25em', textTransform: 'uppercase', marginBottom: 24, textAlign: 'center' }}>
            {premiumLoading ? 'Validating Premium Flow' : 'Scanning GEX Clusters'}
          </p>
          {/* Progress bar */}
          <div style={{ width: isMobile ? '90%' : 288, marginBottom: 8 }}>
            <div style={{ width: '100%', height: 2, background: '#111', overflow: 'hidden', borderRadius: 1 }}>
              <div style={{
                height: '100%',
                background: premiumLoading ? '#ffb400' : '#ff6600',
                width: premiumLoading
                  ? `${premiumProgress.total > 0 ? Math.round((premiumProgress.current / premiumProgress.total) * 100) : 0}%`
                  : `${scanProgress.total > 0 ? Math.round((scanProgress.current / scanProgress.total) * 100) : 0}%`,
                transition: 'width 0.25s ease',
              }} />
            </div>
            <p style={{ color: premiumLoading ? '#ffb400' : '#ff6600', fontFamily: 'monospace', fontSize: 16, fontWeight: 700, textAlign: 'right', marginTop: 6 }}>
              {premiumLoading
                ? `${premiumProgress.current} / ${premiumProgress.total}`
                : `${scanProgress.current} / ${scanProgress.total}`}
            </p>
          </div>
          {/* Quote */}
          <div style={{ maxWidth: isMobile ? '100%' : 480, textAlign: 'center', marginTop: 24, padding: '0 8px' }}>
            <p style={{ color: '#fff', fontSize: isMobile ? 16 : 20, fontWeight: 600, lineHeight: 1.6, textShadow: '0 0 20px rgba(255,255,255,0.12)' }}>
              &ldquo;{loadingQuoteRef.current.body}&rdquo;
            </p>
            {loadingQuoteRef.current.author && (
              <p style={{ color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace', fontSize: isMobile ? 14 : 16, marginTop: 10 }}>
                {loadingQuoteRef.current.author}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
           TWO-COLUMN GRID
          ════════════════════════════════════════════════════════ */}
      {!isAnyLoading && <div ref={gridCallbackRef} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 0 }}>

        {/* ── POSITIVE / CALL TOWER column ── */}
        <div style={{ borderRight: '1px solid rgba(255,255,255,0.05)', display: isMobile && mobileTower !== 'call' ? 'none' : undefined }}>
          {/* Column header — desktop only */}
          {!isMobile && (
            <div style={{
              background: 'linear-gradient(180deg, #0f0000 0%, #000 100%)',
              borderBottom: '2px solid rgba(255,55,55,0.35)',
              padding: '12px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#ff4444', letterSpacing: '0.22em', textTransform: 'uppercase' }}>▲ CALL TOWER</span>
              <div style={{ width: 1, height: 14, background: 'rgba(255,68,68,0.2)' }} />
              <span style={{ fontSize: 13, color: '#fff', letterSpacing: '0.14em', fontWeight: 600 }}>DEALERS LONG GAMMA · POSITIVE GEX</span>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 18, fontWeight: 900, color: '#ff4444', background: 'rgba(255,68,68,0.08)', border: '1px solid rgba(255,68,68,0.2)', borderRadius: 3, padding: '2px 10px', letterSpacing: '0.04em' }}>
                {positiveItems.length}
              </span>
            </div>
          )}

          {/* Column body */}
          <div style={{ padding: isMobile ? '8px 0 24px' : '12px 16px 24px' }}>
            {!hasData && !isAnyLoading && (
              <div style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(255,255,255,0.12)', fontSize: 11, fontWeight: 700, letterSpacing: '0.18em' }}>
                RUN SCAN TO POPULATE
              </div>
            )}
            {positiveItems.map((item) => (
              <ClusterCard key={item.ticker} item={item} side="positive" expandedCards={expandedCards} toggleExpandedCard={toggleExpandedCard} expirationFilter={expirationFilter} />
            ))}
          </div>
        </div>

        {/* ── NEGATIVE / PUT TOWER column ── */}
        <div style={{ display: isMobile && mobileTower !== 'put' ? 'none' : undefined }}>
          {/* Column header — desktop only */}
          {!isMobile && (
            <div style={{
              background: 'linear-gradient(180deg, #001208 0%, #000 100%)',
              borderBottom: '2px solid rgba(0,210,100,0.3)',
              padding: '12px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#00d264', letterSpacing: '0.22em', textTransform: 'uppercase' }}>▼ PUT TOWER</span>
              <div style={{ width: 1, height: 14, background: 'rgba(0,210,100,0.2)' }} />
              <span style={{ fontSize: 13, color: '#fff', letterSpacing: '0.14em', fontWeight: 600 }}>DEALERS SHORT GAMMA · NEGATIVE GEX</span>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 18, fontWeight: 900, color: '#00d264', background: 'rgba(0,210,100,0.08)', border: '1px solid rgba(0,210,100,0.2)', borderRadius: 3, padding: '2px 10px', letterSpacing: '0.04em' }}>
                {negativeItems.length}
              </span>
            </div>
          )}

          {/* Column body */}
          <div style={{ padding: isMobile ? '8px 0 24px' : '12px 16px 24px' }}>
            {!hasData && !isAnyLoading && (
              <div style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(255,255,255,0.12)', fontSize: 11, fontWeight: 700, letterSpacing: '0.18em' }}>
                RUN SCAN TO POPULATE
              </div>
            )}
            {negativeItems.map((item) => (
              <ClusterCard key={item.ticker} item={item} side="negative" expandedCards={expandedCards} toggleExpandedCard={toggleExpandedCard} expirationFilter={expirationFilter} />
            ))}
          </div>
        </div>

      </div>}
    </div>
  )
}
