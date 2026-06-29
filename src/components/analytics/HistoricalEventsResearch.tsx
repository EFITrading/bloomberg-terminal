'use client'

import {
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import React, { useCallback, useEffect, useRef, useState } from 'react'

import {
  CATEGORY_COLORS,
  EVENT_CATEGORIES,
  type EventCategory,
  type KeyDate,
  type KeyMover,
  MARKET_EVENTS,
  type MarketEvent,
  SEVERITY_COLORS,
} from '../../data/marketEvents'
import SeasonaxLanding from '../seasonax/SeasonaxLanding'
import ResearchPanelV2 from './ResearchPanelV2'

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────
interface PriceBar {
  date: string
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

type PeriodKey = 'pre30' | 'pre10' | 'during' | 'post30' | 'full'

interface PeriodStats {
  bars: PriceBar[]
  indexed: number[]
  totalReturn: number
  maxDrawdown: number
  peakGain: number
  recoveryDays: number | null
}

interface InstrumentData {
  ticker: string
  label: string
  color: string
  allBars: PriceBar[]
  pre30: PeriodStats | null
  pre10: PeriodStats | null
  during: PeriodStats | null
  post30: PeriodStats | null
  full: PeriodStats | null
  // backward-compat fields derived from 'during'
  bars: PriceBar[]
  pctChange: number[]
  totalReturn: number
  maxDrawdown: number
  peakGain: number
  recoveryDays: number | null
}

interface EventStats {
  spy: InstrumentData | null
  qqq: InstrumentData | null
  iwm: InstrumentData | null
  eem: InstrumentData | null
  xle: InstrumentData | null
  xlf: InstrumentData | null
  xli: InstrumentData | null
  xlk: InstrumentData | null
  xlv: InstrumentData | null
  xlp: InstrumentData | null
  xly: InstrumentData | null
  xlb: InstrumentData | null
  xlu: InstrumentData | null
  xlre: InstrumentData | null
  xlc: InstrumentData | null
  gold: InstrumentData | null
  uso: InstrumentData | null
  tlt: InstrumentData | null
  dxy: InstrumentData | null
  vix: InstrumentData | null
  loading: boolean
  error: string | null
}

// ────────────────────────────────────────────────────────────────────────────
// Instrument definitions grouped by asset class
// ────────────────────────────────────────────────────────────────────────────
interface InstrumentDef {
  ticker: string
  apiTicker: string // what we send to /api/historical-data
  label: string
  color: string
  group: 'Equities' | 'Sectors' | 'FX & Vol'
}

const ALL_INSTRUMENTS: InstrumentDef[] = [
  // Equities
  { ticker: 'SPY', apiTicker: 'SPY', label: 'S&P 500', color: '#3b82f6', group: 'Equities' },
  { ticker: 'QQQ', apiTicker: 'QQQ', label: 'NASDAQ', color: '#a855f7', group: 'Equities' },
  { ticker: 'IWM', apiTicker: 'IWM', label: 'Small Caps', color: '#06b6d4', group: 'Equities' },
  { ticker: 'EEM', apiTicker: 'EEM', label: 'Emerg. Mkts', color: '#f472b6', group: 'Equities' },
  { ticker: 'TLT', apiTicker: 'TLT', label: 'Long Bonds', color: '#22c55e', group: 'Equities' },
  // Sectors (all 11 GICS)
  { ticker: 'XLE', apiTicker: 'XLE', label: 'Energy', color: '#f97316', group: 'Sectors' },
  { ticker: 'XLF', apiTicker: 'XLF', label: 'Financials', color: '#84cc16', group: 'Sectors' },
  { ticker: 'XLI', apiTicker: 'XLI', label: 'Industrials', color: '#fb923c', group: 'Sectors' },
  { ticker: 'XLK', apiTicker: 'XLK', label: 'Technology', color: '#3b82f6', group: 'Sectors' },
  { ticker: 'XLV', apiTicker: 'XLV', label: 'Health Care', color: '#ec4899', group: 'Sectors' },
  { ticker: 'XLP', apiTicker: 'XLP', label: 'Cons. Staples', color: '#a78bfa', group: 'Sectors' },
  { ticker: 'XLY', apiTicker: 'XLY', label: 'Cons. Discret', color: '#f43f5e', group: 'Sectors' },
  { ticker: 'XLB', apiTicker: 'XLB', label: 'Materials', color: '#6ee7b7', group: 'Sectors' },
  { ticker: 'XLU', apiTicker: 'XLU', label: 'Utilities', color: '#fcd34d', group: 'Sectors' },
  { ticker: 'XLRE', apiTicker: 'XLRE', label: 'Real Estate', color: '#67e8f9', group: 'Sectors' },
  { ticker: 'XLC', apiTicker: 'XLC', label: 'Comm. Services', color: '#c084fc', group: 'Sectors' },
  { ticker: 'GLD', apiTicker: 'GLD', label: 'Gold', color: '#eab308', group: 'Sectors' },
  // FX & Vol
  { ticker: 'DXY', apiTicker: 'UUP', label: 'USD Index', color: '#38bdf8', group: 'FX & Vol' },
  { ticker: 'VIX', apiTicker: 'VIXY', label: 'VIX (VIXY)', color: '#ef4444', group: 'FX & Vol' },
]

const INSTRUMENT_GROUPS: Array<
  'Equities' | 'Sectors' | 'FX & Vol'
> = ['Equities', 'Sectors', 'FX & Vol']

const GROUP_COLORS: Record<string, string> = {
  Equities: '#FF6B00',
  Sectors: '#22d3ee',
  'FX & Vol': '#ef4444',
}

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────
function calcStats(bars: PriceBar[]): {
  totalReturn: number
  maxDrawdown: number
  peakGain: number
  recoveryDays: number | null
} {
  if (bars.length < 2) return { totalReturn: 0, maxDrawdown: 0, peakGain: 0, recoveryDays: null }
  const base = bars[0].close
  let peak = base
  let maxDD = 0
  let maxGain = 0
  let peakPrice = base
  let drawdownTrough = base
  let afterTrough = false
  let recoveryDays: number | null = null

  for (let i = 1; i < bars.length; i++) {
    const p = bars[i].close
    if (p > peak) peak = p
    const dd = (peak - p) / peak
    if (dd > maxDD) {
      maxDD = dd
      drawdownTrough = p
      peakPrice = peak
      afterTrough = true
    }
    if (afterTrough && p >= peakPrice && recoveryDays === null) {
      recoveryDays = i
    }
    const gain = (p - base) / base
    if (gain > maxGain) maxGain = gain
  }

  return {
    totalReturn: ((bars[bars.length - 1].close - base) / base) * 100,
    maxDrawdown: -maxDD * 100,
    peakGain: maxGain * 100,
    recoveryDays,
  }
}

function normaliseToBased100(bars: PriceBar[]): number[] {
  if (!bars.length) return []
  const base = bars[0].close
  return bars.map((b) => (b.close / base) * 100)
}

function offsetDate(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function sliceBars(bars: PriceBar[], from: string, to: string): PriceBar[] {
  return bars.filter((b) => b.date >= from && b.date <= to)
}

function buildPeriodStats(bars: PriceBar[]): PeriodStats | null {
  if (bars.length < 2) return null
  const s = calcStats(bars)
  return { bars, indexed: normaliseToBased100(bars), ...s }
}

function formatPct(val: number): string {
  const sign = val >= 0 ? '+' : ''
  return `${sign}${val.toFixed(2)}%`
}

function formatDate(dateStr: string): string {
  // dateStr can be YYYY-MM-DD
  const [y, m, d] = dateStr.split('-')
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ]
  return `${months[parseInt(m, 10) - 1]} ${parseInt(d, 10)}, ${y}`
}

function eventDurationDays(event: MarketEvent): number {
  const a = new Date(event.startDate).getTime()
  const b = new Date(event.endDate).getTime()
  return Math.round((b - a) / 86400000) + 1
}

// ────────────────────────────────────────────────────────────────────────────
// Fetch historical data from the existing /api/historical-data route
// ────────────────────────────────────────────────────────────────────────────
async function fetchBars(ticker: string, startDate: string, endDate: string): Promise<PriceBar[]> {
  // Wide window: 35 cal days before/after to support pre-30d and post-30d periods
  const start = new Date(startDate)
  start.setDate(start.getDate() - 35)
  const end = new Date(endDate)
  end.setDate(end.getDate() + 35)

  const s = start.toISOString().split('T')[0]
  const e = end.toISOString().split('T')[0]

  const url = `/api/historical-data?symbol=${ticker}&startDate=${s}&endDate=${e}&timeframe=1d`
  console.log(`[HER] fetchBars → ${ticker} | url: ${url}`)

  let res: Response
  try {
    res = await fetch(url)
  } catch (err) {
    console.error(`[HER] fetchBars NETWORK ERROR for ${ticker}:`, err)
    throw err
  }

  console.log(`[HER] fetchBars response ${ticker}: status=${res.status} ok=${res.ok}`)
  if (!res.ok) {
    const text = await res.text().catch(() => '(no body)')
    console.error(`[HER] fetchBars HTTP error for ${ticker}: ${res.status} — ${text}`)
    throw new Error(`Failed to fetch ${ticker}: ${res.status}`)
  }

  const json = await res.json()
  console.log(`[HER] fetchBars ${ticker}: json keys=${Object.keys(json).join(',')}, results=${Array.isArray(json.results) ? json.results.length : 'N/A'}`)

  if (!json.results || !Array.isArray(json.results)) {
    console.warn(`[HER] fetchBars ${ticker}: no results array — full response:`, json)
    return []
  }

  const bars: PriceBar[] = json.results
    .map((r: { t: number; o: number; h: number; l: number; c: number; v: number }) => ({
      date: new Date(r.t).toISOString().split('T')[0],
      timestamp: r.t,
      open: r.o,
      high: r.h,
      low: r.l,
      close: r.c,
      volume: r.v,
    }))
    .sort((a: PriceBar, b: PriceBar) => a.timestamp - b.timestamp)

  console.log(`[HER] fetchBars ${ticker}: parsed ${bars.length} bars (${bars[0]?.date} → ${bars[bars.length - 1]?.date})`)
  return bars
}

// ────────────────────────────────────────────────────────────────────────────
// Chart tooltip
// ────────────────────────────────────────────────────────────────────────────
const ChartTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?: string
}) => {
  if (!active || !payload || !payload.length) return null
  return (
    <div
      style={{
        background: '#0a0a0a',
        border: '1px solid #2a2a2a',
        borderRadius: 8,
        padding: '12px 16px',
        fontSize: 14,
        boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
      }}
    >
      <div style={{ color: '#ffffff', fontWeight: 700, marginBottom: 8, fontSize: 14 }}>
        {label}
      </div>
      {payload.map((p) => {
        const delta = p.value - 100
        const sign = delta >= 0 ? '+' : ''
        return (
          <div
            key={p.name}
            style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 3 }}
          >
            <span style={{ color: p.color, fontWeight: 600 }}>{p.name}</span>
            <span style={{ color: delta >= 0 ? '#00ff41' : '#ff3333', fontWeight: 700 }}>
              {sign}
              {delta.toFixed(2)}%
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Stat card
// ────────────────────────────────────────────────────────────────────────────
const StatCard = ({ label, value, color }: { label: string; value: string; color: string }) => (
  <div
    style={{
      background: '#0a0a0a',
      border: '1px solid #222',
      borderRadius: 8,
      padding: '14px 18px',
      minWidth: 130,
      flex: '1 1 130px',
    }}
  >
    <div
      style={{
        color: '#ffffff',
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: '0.6px',
        textTransform: 'uppercase',
        marginBottom: 6,
      }}
    >
      {label}
    </div>
    <div style={{ color, fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px' }}>{value}</div>
  </div>
)

// ────────────────────────────────────────────────────────────────────────────
// Main component
// ────────────────────────────────────────────────────────────────────────────
export default function HistoricalEventsResearch() {
  const [activeTab, setActiveTab] = useState<'events' | 'screener' | 'research'>('events')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isMobileView, setIsMobileView] = useState(false)
  useEffect(() => {
    const check = () => setIsMobileView(window.innerWidth <= 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  const [selectedCategory, setSelectedCategory] = useState<EventCategory | 'All'>('All')
  const [selectedEvent, setSelectedEvent] = useState<MarketEvent | null>(null)
  const [stats, setStats] = useState<EventStats>({
    spy: null,
    qqq: null,
    iwm: null,
    eem: null,
    xle: null,
    xlf: null,
    xli: null,
    xlk: null,
    xlv: null,
    xlp: null,
    xly: null,
    xlb: null,
    xlu: null,
    xlre: null,
    xlc: null,
    gold: null,
    uso: null,
    tlt: null,
    dxy: null,
    vix: null,
    loading: false,
    error: null,
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [activePeriod, setActivePeriod] = useState<PeriodKey>('during')
  const [activeInstruments, setActiveInstruments] = useState<string[]>(
    ALL_INSTRUMENTS.map((i) => i.ticker)
  )
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const INSTR_KEY_MAP: Record<string, keyof Omit<EventStats, 'loading' | 'error'>> = {
    SPY: 'spy',
    QQQ: 'qqq',
    IWM: 'iwm',
    EEM: 'eem',
    XLE: 'xle',
    XLF: 'xlf',
    XLI: 'xli',
    XLK: 'xlk',
    XLV: 'xlv',
    XLP: 'xlp',
    XLY: 'xly',
    XLB: 'xlb',
    XLU: 'xlu',
    XLRE: 'xlre',
    XLC: 'xlc',
    GLD: 'gold',
    USO: 'uso',
    TLT: 'tlt',
    DXY: 'dxy',
    VIX: 'vix',
  }

  // ── Filtering ─────────────────────────────────────────────────────────────
  const filteredEvents = MARKET_EVENTS.filter((e) => {
    const matchCat = selectedCategory === 'All' || e.category === selectedCategory
    const q = searchQuery.toLowerCase()
    const matchSearch =
      !q ||
      e.name.toLowerCase().includes(q) ||
      e.category.toLowerCase().includes(q) ||
      e.description.toLowerCase().includes(q)
    return matchCat && matchSearch
  }).sort((a, b) => a.startDate.localeCompare(b.startDate))

  // ── Load data when event is selected ─────────────────────────────────────
  const loadEventData = useCallback(async (event: MarketEvent) => {
    setStats({
      spy: null,
      qqq: null,
      iwm: null,
      eem: null,
      xle: null,
      xlf: null,
      xli: null,
      xlk: null,
      xlv: null,
      xlp: null,
      xly: null,
      xlb: null,
      xlu: null,
      xlre: null,
      xlc: null,
      gold: null,
      uso: null,
      tlt: null,
      dxy: null,
      vix: null,
      loading: true,
      error: null,
    })

    console.log(`[HER] loadEventData: event="${event.name}" start=${event.startDate} end=${event.endDate}`)
    console.log(`[HER] fetching ${ALL_INSTRUMENTS.length} instruments:`, ALL_INSTRUMENTS.map(i => i.apiTicker))

    const results = await Promise.allSettled(
      ALL_INSTRUMENTS.map((ins) => fetchBars(ins.apiTicker, event.startDate, event.endDate))
    )

    console.log('[HER] allSettled results:')
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        console.log(`  [HER] ${ALL_INSTRUMENTS[i].ticker}: ✓ ${r.value.length} bars`)
      } else {
        console.error(`  [HER] ${ALL_INSTRUMENTS[i].ticker}: ✗ rejected —`, r.reason)
      }
    })

    const update: Partial<EventStats> = { loading: false, error: null }

    const pre30Start = offsetDate(event.startDate, -30)
    const pre10Start = offsetDate(event.startDate, -10)
    const post30End = offsetDate(event.endDate, +30)

    ALL_INSTRUMENTS.forEach((ins, i) => {
      const key = INSTR_KEY_MAP[ins.ticker]
      const result = results[i]
      if (result.status === 'fulfilled' && result.value.length >= 2) {
        console.log(`[HER] building stats for ${ins.ticker}: duringStart=${offsetDate(event.startDate, -10)} duringEnd=${offsetDate(event.startDate, 10)}`)
        const allBars = result.value

        // 'During' window: ±10 calendar days around the event START DATE
        const duringStart = offsetDate(event.startDate, -10)
        const duringEnd = offsetDate(event.startDate, 10)

        const duringBars = sliceBars(allBars, duringStart, duringEnd)
        const d = buildPeriodStats(duringBars.length >= 2 ? duringBars : sliceBars(allBars, duringStart, offsetDate(duringEnd, 5)))
        if (!d) {
          console.warn(`[HER] ${ins.ticker}: buildPeriodStats returned null for during window — skipping`)
          update[key] = null
          return
        }
        update[key] = {
          ticker: ins.ticker,
          label: ins.label,
          color: ins.color,
          allBars,
          pre30: buildPeriodStats(sliceBars(allBars, pre30Start, event.startDate)),
          pre10: buildPeriodStats(sliceBars(allBars, pre10Start, event.startDate)),
          during: d,
          post30: buildPeriodStats(sliceBars(allBars, event.endDate, post30End)),
          full: buildPeriodStats(sliceBars(allBars, pre30Start, post30End)),
          // backward-compat fields
          bars: d.bars,
          pctChange: d.indexed,
          totalReturn: d.totalReturn,
          maxDrawdown: d.maxDrawdown,
          peakGain: d.peakGain,
          recoveryDays: d.recoveryDays,
        }
      } else {
        if (result.status === 'fulfilled') {
          console.warn(`[HER] ${ins.ticker}: only ${result.value.length} bars — need ≥2, setting null`)
        }
        update[key] = null
      }
    })

    setStats((s) => ({ ...s, ...update }))
  }, [])

  useEffect(() => {
    if (selectedEvent) {
      setActivePeriod('during')
      loadEventData(selectedEvent)
    }
  }, [selectedEvent, loadEventData])

  // ── UI ────────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        background: '#000000',
        fontFamily: '"Roboto Mono", "SF Mono", "Courier New", monospace',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        ...(isFullscreen
          ? {
            position: 'fixed',
            top: 90,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9999,
            height: 'calc(100dvh - 90px)',
            width: '100vw',
          }
          : {}),
      }}
    >
      <style>{`
        @keyframes her-spin { to { transform: rotate(360deg); } }
        @keyframes her-waveform { 0% { stroke-dashoffset: 60 } 100% { stroke-dashoffset: 0 } }
        @keyframes her-radar-spin { 0% { transform: rotate(0deg) } 100% { transform: rotate(360deg) } }
        @keyframes her-scan-sweep { 0%,100% { transform: translateY(-2.5px) } 50% { transform: translateY(2.5px) } }
        @keyframes her-pulse-ring { 0%,100% { transform: scale(1) } 50% { transform: scale(1.12) } }
        .her-tab-btn { transition: all 0.2s ease; }
        .her-tab-btn:hover { filter: brightness(1.15); }
        .her-wave-anim { stroke-dasharray: 60; animation: her-waveform 2s linear infinite; }
        .her-radar-sweep { transform-origin: 12px 12px; animation: her-radar-spin 2.5s linear infinite; }
        .her-scan-line { transform-origin: 11px 11px; animation: her-scan-sweep 1.5s ease-in-out infinite; }
        .her-pulse-ring { transform-origin: 11px 11px; animation: her-pulse-ring 2s ease-in-out infinite; }
        .her-cat-btn:hover { opacity: 1 !important; }
        .her-event-row:hover { background: #0e0e0e !important; }
        .her-period-btn:hover { color: #ffffff !important; background: rgba(255,255,255,0.04) !important; }
        .her-instr-btn:hover { opacity: 1 !important; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: #070707; }
        ::-webkit-scrollbar-thumb { background: #2a2a2a; border-radius: 2px; }
        ::-webkit-scrollbar-thumb:hover { background: #3a3a3a; }
      `}</style>

      {/* TOP TABS */}
      <div
        style={{
          display: 'flex',
          flexShrink: 0,
          background: '#000000',
          border: '1px solid #FF6B00',
          borderBottom: '1px solid #FF6B00',
          outline: '1px solid rgba(255,107,0,0.3)',
        }}
      >
        {[
          {
            id: 'events' as const,
            label: isMobileView ? 'EVENTS' : 'RESEARCH HISTORICAL EVENTS',
            icon: (
              <svg width={isMobileView ? 16 : 22} height={isMobileView ? 16 : 22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="2" y1="12" x2="5" y2="12" />
                <polyline className="her-wave-anim" points="5 12 8 5 11 19 14 8 17 12 20 12 22 12" />
              </svg>
            ),
          },
          ...(!isMobileView ? [{
            id: 'screener' as const,
            label: 'SEASONALITY SCANNER',
            icon: (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="9" />
                <circle cx="12" cy="12" r="5" strokeDasharray="3 3" />
                <line className="her-radar-sweep" x1="12" y1="12" x2="21" y2="12" strokeWidth="1.5" />
                <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
              </svg>
            ),
          }] : []),
          {
            id: 'research' as const,
            label: isMobileView ? 'PATTERNS' : 'PATTERN RESEARCH',
            icon: (
              <svg width={isMobileView ? 16 : 22} height={isMobileView ? 16 : 22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="7" className="her-pulse-ring" />
                <line className="her-scan-line" x1="7" y1="11" x2="15" y2="11" strokeWidth="1.5" />
                <path d="m19 19-3.5-3.5" strokeWidth="2.5" />
              </svg>
            ),
          },
        ].map((tab, index) => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              className="her-tab-btn"
              onClick={() => {
                if (tab.id === 'screener') setIsFullscreen(false)
                setActiveTab(tab.id)
              }}
              style={{
                flex: 1,
                padding: isMobileView ? '10px 8px' : isFullscreen ? '28px 16px 16px' : '20px 16px',
                background: isActive
                  ? 'linear-gradient(180deg,#1a1a1a 0%,#060606 100%)'
                  : 'linear-gradient(180deg,#111111 0%,#040404 100%)',
                border: isActive ? '2px solid #FF6B00' : '2px solid rgba(255,255,255,0.15)',
                borderRight: index < (isMobileView ? 1 : 2) ? (isActive ? '2px solid #FF6B00' : '1px solid rgba(255,255,255,0.08)') : undefined,
                color: isActive ? '#FF6B00' : '#FFFFFF',
                fontSize: isMobileView ? 11 : 16,
                fontWeight: 900,
                letterSpacing: isMobileView ? '0.05em' : '0.15em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'row',
                alignItems: isFullscreen ? 'flex-end' : 'center',
                justifyContent: 'center',
                gap: isMobileView ? 4 : 12,
                fontFamily: '"Roboto Mono", monospace',
                position: 'relative',
                overflow: 'hidden',
                transition: 'all 0.2s ease',
              }}
            >
              {isActive && (
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'linear-gradient(180deg, rgba(255,107,0,0.15) 0%, transparent 100%)',
                  pointerEvents: 'none',
                }} />
              )}
              <span style={{ position: 'relative', flexShrink: 0 }}>{tab.icon}</span>
              <span style={{ position: 'relative', textShadow: '0 2px 4px rgba(0,0,0,0.9)' }}>{tab.label}</span>
            </button>
          )
        })}
        {/* FULLSCREEN TOGGLE — hidden on screener tab and on mobile */}
        {!isMobileView && activeTab !== 'screener' && <button
          onClick={() => setIsFullscreen((f) => !f)}
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          style={{
            flexShrink: 0,
            padding: '0 18px',
            background: '#000',
            border: 'none',
            borderLeft: '1px solid #1e1e1e',
            color: isFullscreen ? '#FF6B00' : 'rgba(255,255,255,0.45)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'color 0.15s',
          }}
        >
          {isFullscreen ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square">
              <polyline points="8 3 3 3 3 8" /><polyline points="21 8 21 3 16 3" />
              <polyline points="3 16 3 21 8 21" /><polyline points="16 21 21 21 21 16" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square">
              <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
              <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          )}
        </button>}
      </div>

      {/* TAB CONTENT */}
      {activeTab === 'research' ? (
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <ResearchPanelV2 />
        </div>
      ) : activeTab === 'screener' ? (
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', paddingTop: '0px' }}>
          <SeasonaxLanding />
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          {/* ── SUB-HEADER: title + search ─────────────────────────────── */}
          {/* ROW 1: Title + Stats + Search */}
          <div
            style={{
              padding: '16px 24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 20,
              background: '#000000',
              borderBottom: '1px solid #1a1a1a',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div
                style={{
                  width: 42,
                  height: 42,
                  background: 'linear-gradient(135deg, #1d4ed8 0%, #7c3aed 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  boxShadow: '0 0 0 1px rgba(124,58,237,0.4), inset 0 1px 0 rgba(255,255,255,0.2)',
                }}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#fff"
                  strokeWidth="2.5"
                  strokeLinecap="square"
                >
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
              </div>
              <div>
                <div
                  style={{
                    color: '#FFFFFF',
                    fontSize: 18,
                    fontWeight: 800,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    lineHeight: 1,
                    fontFamily: '"Roboto Mono", monospace',
                  }}
                >
                  Historical Market Events
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6 }}>
                  <span
                    style={{
                      color: '#FF6B00',
                      fontSize: 13,
                      fontWeight: 700,
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                      fontFamily: '"Roboto Mono", monospace',
                    }}
                  >
                    {filteredEvents.length} Events
                  </span>
                  <span style={{ color: '#444', fontSize: 13 }}>|</span>
                  <span
                    style={{
                      color: '#888',
                      fontSize: 12,
                      fontWeight: 600,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      fontFamily: '"Roboto Mono", monospace',
                    }}
                  >
                    2004 – Present
                  </span>
                  <span style={{ color: '#444', fontSize: 13 }}>|</span>
                  <span
                    style={{
                      color: '#888',
                      fontSize: 12,
                      fontWeight: 600,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      fontFamily: '"Roboto Mono", monospace',
                    }}
                  >
                    Multi-Asset Analysis
                  </span>
                </div>
              </div>
            </div>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#888"
                strokeWidth="2"
                strokeLinecap="square"
                style={{
                  position: 'absolute',
                  left: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  pointerEvents: 'none',
                }}
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search events..."
                style={{
                  background: '#0a0a0a',
                  border: '1px solid #2a2a2a',
                  color: '#FFFFFF',
                  padding: '10px 14px 10px 36px',
                  fontSize: 13,
                  outline: 'none',
                  width: 240,
                  fontFamily: '"Roboto Mono", monospace',
                  letterSpacing: '0.05em',
                  boxShadow: 'inset 0 1px 4px rgba(0,0,0,0.6)',
                }}
              />
            </div>
          </div>

          {/* ── CATEGORY FILTERS ───────────────────────────────────────── */}
          {/* ROW 2: CATEGORY FILTERS */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: 0,
              background: '#000000',
              borderBottom: '1px solid #1a1a1a',
              flexShrink: 0,
            }}
          >
            {(['All', ...EVENT_CATEGORIES] as Array<EventCategory | 'All'>).map((cat) => {
              const isActive = selectedCategory === cat
              const color = cat === 'All' ? '#FF6B00' : CATEGORY_COLORS[cat]
              return (
                <button
                  key={cat}
                  className="her-cat-btn"
                  onClick={() => setSelectedCategory(cat)}
                  style={{
                    padding: '12px 16px',
                    background: isActive ? `${color}18` : 'transparent',
                    border: 'none',
                    borderBottom: isActive ? `3px solid ${color}` : '3px solid transparent',
                    color: isActive ? color : '#FFFFFF',
                    fontSize: 18,
                    fontWeight: isActive ? 800 : 600,
                    cursor: 'pointer',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    fontFamily: '"Roboto Mono", monospace',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.12s',
                  }}
                >
                  {cat}
                </button>
              )
            })}
          </div>

          {/* ── MAIN BODY: event list + detail panel ───────────────────── */}
          <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
            {/* ── EVENT LIST ─────────────────────────────────────────── */}
            <div
              style={{
                width: 300,
                minWidth: 260,
                borderRight: '1px solid #1a1a1a',
                overflowY: 'auto',
                background: '#030303',
              }}
            >
              {filteredEvents.length === 0 && (
                <div
                  style={{
                    padding: '32px 20px',
                    color: '#888',
                    fontSize: 13,
                    textAlign: 'center',
                  }}
                >
                  No events match your filter.
                </div>
              )}
              {filteredEvents.map((event) => {
                const isSelected = selectedEvent?.id === event.id
                const catColor = CATEGORY_COLORS[event.category]
                const sevColor = SEVERITY_COLORS[event.severity]
                return (
                  <div
                    key={event.id}
                    className="her-event-row"
                    onClick={() => setSelectedEvent(event)}
                    style={{
                      padding: '14px 16px',
                      borderBottom: '1px solid #111',
                      cursor: 'pointer',
                      background: isSelected
                        ? `linear-gradient(90deg, ${catColor}22 0%, transparent 100%)`
                        : 'transparent',
                      borderLeft: isSelected ? `3px solid ${catColor}` : '3px solid transparent',
                      transition: 'background 0.1s',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 5,
                        gap: 6,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 800,
                          color: catColor,
                          letterSpacing: '0.5px',
                          textTransform: 'uppercase',
                        }}
                      >
                        {event.category}
                      </span>
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 800,
                          color: '#000',
                          background: sevColor,
                          padding: '2px 7px',
                          letterSpacing: '0.4px',
                          textTransform: 'uppercase',
                          flexShrink: 0,
                        }}
                      >
                        {event.severity}
                      </span>
                    </div>
                    <div
                      style={{
                        color: isSelected ? '#fff' : 'rgba(255,255,255,0.85)',
                        fontSize: 14,
                        fontWeight: 700,
                        lineHeight: 1.35,
                        marginBottom: 5,
                      }}
                    >
                      {event.name}
                    </div>
                    <div
                      style={{
                        color: 'rgba(255,255,255,0.4)',
                        fontSize: 12,
                        display: 'flex',
                        gap: 5,
                      }}
                    >
                      <span>{formatDate(event.startDate)}</span>
                      <span style={{ color: '#333' }}>→</span>
                      <span>{formatDate(event.endDate)}</span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* ── DETAIL PANEL ─────────────────────────────────────────── */}
            <div style={{ flex: 1, overflowY: 'auto', background: '#000', padding: '20px 22px' }}>
              {!selectedEvent ? (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    minHeight: 360,
                    gap: 14,
                  }}
                >
                  <div
                    style={{
                      width: 52,
                      height: 52,
                      background: 'linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)',
                      border: '1px solid #1e1e1e',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
                    }}
                  >
                    <svg
                      width="22"
                      height="22"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#444"
                      strokeWidth="1.5"
                      strokeLinecap="square"
                    >
                      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                    </svg>
                  </div>
                  <div
                    style={{
                      color: '#FFFFFF',
                      fontSize: 16,
                      fontWeight: 800,
                      letterSpacing: '2px',
                      textTransform: 'uppercase',
                    }}
                  >
                    SELECT AN EVENT
                  </div>
                  <div
                    style={{
                      color: 'rgba(255,255,255,0.4)',
                      fontSize: 13,
                      textAlign: 'center',
                      maxWidth: 320,
                      lineHeight: 1.7,
                    }}
                  >
                    Choose a historical event from the list to analyze market performance across key
                    instruments.
                  </div>
                </div>
              ) : (
                <div>
                  {/* ── EVENT HEADER ──────────────────────────────────── */}
                  <div
                    style={{
                      background: 'linear-gradient(135deg, #0a0a0a 0%, #080808 100%)',
                      border: `1px solid ${CATEGORY_COLORS[selectedEvent.category]}25`,
                      borderLeft: `4px solid ${CATEGORY_COLORS[selectedEvent.category]}`,
                      padding: '16px 18px',
                      marginBottom: 16,
                      boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04), 0 4px 20px rgba(0,0,0,0.6)`,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: 12,
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            marginBottom: 8,
                            flexWrap: 'wrap',
                          }}
                        >
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 800,
                              color: CATEGORY_COLORS[selectedEvent.category],
                              letterSpacing: '0.8px',
                              textTransform: 'uppercase',
                            }}
                          >
                            {selectedEvent.category}
                          </span>
                          <span style={{ color: '#2a2a2a' }}>|</span>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 800,
                              color: SEVERITY_COLORS[selectedEvent.severity],
                              letterSpacing: '0.8px',
                              textTransform: 'uppercase',
                            }}
                          >
                            {selectedEvent.severity} severity
                          </span>
                          <span style={{ color: '#2a2a2a' }}>|</span>
                          <span style={{ color: '#666', fontSize: 11 }}>
                            {eventDurationDays(selectedEvent).toLocaleString()} days
                          </span>
                        </div>
                        <div
                          style={{
                            color: CATEGORY_COLORS[selectedEvent.category],
                            fontSize: 20,
                            fontWeight: 800,
                            letterSpacing: '-0.3px',
                            marginBottom: 10,
                            lineHeight: 1.2,
                          }}
                        >
                          {selectedEvent.name}
                        </div>
                        <div
                          style={{ color: '#aaa', fontSize: 13, lineHeight: 1.7 }}
                        >
                          {selectedEvent.description}
                        </div>
                        {selectedEvent.keyDates && selectedEvent.keyDates.length > 0 && (
                          <div style={{ marginTop: 14 }}>
                            <div
                              style={{
                                color: 'rgba(255,255,255,0.35)',
                                fontSize: 10,
                                fontWeight: 800,
                                letterSpacing: '1.2px',
                                textTransform: 'uppercase',
                                marginBottom: 8,
                              }}
                            >
                              Key Event Dates
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                              {selectedEvent.keyDates.map((kd: KeyDate, i: number) => (
                                <div
                                  key={i}
                                  style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 3,
                                    padding: '6px 10px',
                                    background: '#0a0a0a',
                                    border: '1px solid #161616',
                                    borderLeft: `3px solid ${CATEGORY_COLORS[selectedEvent.category]}`,
                                  }}
                                >
                                  <span
                                    style={{
                                      color: CATEGORY_COLORS[selectedEvent.category],
                                      fontSize: 13,
                                      fontWeight: 800,
                                      fontFamily: '"Roboto Mono", monospace',
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    {formatDate(kd.date)}
                                  </span>
                                  <span
                                    style={{
                                      color: 'rgba(255,255,255,0.7)',
                                      fontSize: 12,
                                      fontWeight: 700,
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    {kd.label.split(' — ')[0]}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      <div
                        style={{
                          background: '#0a0a0a',
                          border: `1px solid ${CATEGORY_COLORS[selectedEvent.category]}30`,
                          padding: '10px 14px',
                          whiteSpace: 'nowrap',
                          textAlign: 'right',
                          flexShrink: 0,
                          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
                        }}
                      >
                        <div
                          style={{
                            color: '#555',
                            fontSize: 10,
                            letterSpacing: '0.8px',
                            textTransform: 'uppercase',
                            marginBottom: 3,
                          }}
                        >
                          START DATE
                        </div>
                        <div
                          style={{
                            color: CATEGORY_COLORS[selectedEvent.category],
                            fontSize: 14,
                            fontWeight: 800,
                            marginBottom: 10,
                          }}
                        >
                          {formatDate(selectedEvent.startDate)}
                        </div>
                        <div
                          style={{
                            color: '#555',
                            fontSize: 10,
                            letterSpacing: '0.8px',
                            textTransform: 'uppercase',
                            marginBottom: 3,
                          }}
                        >
                          END DATE
                        </div>
                        <div style={{ color: CATEGORY_COLORS[selectedEvent.category], fontSize: 14, fontWeight: 800 }}>
                          {formatDate(selectedEvent.endDate)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ── PERIOD SELECTOR ───────────────────────────────── */}
                  <div style={{
                    display: 'flex',
                    gap: 0,
                    marginBottom: 20,
                    background: 'linear-gradient(180deg, #141414 0%, #0a0a0a 100%)',
                    border: '1px solid #222',
                    borderRadius: 2,
                    overflow: 'hidden',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)',
                  }}>
                    {[
                      { key: 'pre30' as PeriodKey, label: '-30D BEFORE', color: '#a855f7' },
                      { key: 'pre10' as PeriodKey, label: '-10D BEFORE', color: '#f472b6' },
                      { key: 'during' as PeriodKey, label: 'DURING EVENT', color: '#ef4444' },
                      { key: 'post30' as PeriodKey, label: '+30D AFTER', color: '#22c55e' },
                      { key: 'full' as PeriodKey, label: 'FULL TIMELINE', color: '#3b82f6' },
                    ].map((p, idx, arr) => {
                      const isActive = activePeriod === p.key
                      return (
                        <button
                          key={p.key}
                          className="her-period-btn"
                          onClick={() => setActivePeriod(p.key)}
                          style={{
                            flex: 1,
                            padding: '16px 8px',
                            background: 'transparent',
                            borderTop: 'none',
                            borderBottom: isActive ? `2px solid #FF6B00` : '2px solid transparent',
                            borderLeft: idx === 0 ? 'none' : '1px solid #1a1a1a',
                            borderRight: 'none',
                            color: isActive ? '#FF6B00' : 'rgba(255,255,255,0.45)',
                            fontSize: 19,
                            fontWeight: 800,
                            cursor: 'pointer',
                            letterSpacing: '1px',
                            textTransform: 'uppercase',
                            fontFamily: '"Roboto Mono", monospace',
                            whiteSpace: 'nowrap',
                            transition: 'all 0.15s',
                            boxShadow: 'none',
                          }}
                        >
                          {p.label}
                        </button>
                      )
                    })}
                  </div>



                  {/* ── LOADING ───────────────────────────────────────── */}
                  {stats.loading && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '48px 0',
                        justifyContent: 'center',
                      }}
                    >
                      <div
                        style={{
                          width: 18,
                          height: 18,
                          border: '2px solid #1a1a1a',
                          borderTop: '2px solid #3b82f6',
                          borderRadius: '50%',
                          animation: 'her-spin 0.7s linear infinite',
                        }}
                      />
                      <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14 }}>
                        Fetching market data...
                      </span>
                    </div>
                  )}

                  {stats.error && !stats.loading && (
                    <div
                      style={{
                        background: '#0e0303',
                        border: '1px solid #ef444430',
                        borderLeft: '4px solid #ef4444',
                        padding: '14px 18px',
                        color: '#ef4444',
                        fontSize: 13,
                        marginBottom: 16,
                      }}
                    >
                      {stats.error}
                    </div>
                  )}

                  {!stats.loading && !stats.error && (
                    <>
                      {/* ── PERFORMANCE CHART ─────────────────────────── */}
                      {(() => {
                        const allWithData = ALL_INSTRUMENTS
                          .map((ins) => ({
                            ins,
                            d: stats[INSTR_KEY_MAP[ins.ticker]] as InstrumentData | null,
                          }))
                          .filter(({ d }) => !!d && (d[activePeriod]?.indexed?.length ?? 0) > 0)

                        const active = allWithData.filter(({ ins }) =>
                          activeInstruments.includes(ins.ticker)
                        )

                        const maxLen = active.length
                          ? Math.max(...active.map(({ d }) => d![activePeriod]!.indexed.length))
                          : 0

                        const chartData = Array.from({ length: maxLen }, (_, i) => {
                          const raw = active[0]?.d![activePeriod]!.bars[i]?.date ?? ''
                          // Compute calendar day offset from event start date
                          let dayOffset = i
                          if (selectedEvent && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
                            const barMs = new Date(raw + 'T00:00:00').getTime()
                            const anchorMs = new Date(selectedEvent.startDate + 'T00:00:00').getTime()
                            dayOffset = Math.round((barMs - anchorMs) / 86400000)
                          }
                          const label = dayOffset === 0 ? 'D0' : dayOffset > 0 ? `+${dayOffset}` : `${dayOffset}`
                          const row: Record<string, number | string> = { date: label, _dayOffset: dayOffset }
                          active.forEach(({ ins, d }) => {
                            const idx = d![activePeriod]!.indexed
                            row[ins.label] = idx[i] ?? idx[idx.length - 1]
                          })
                          return row
                        })

                        return (
                          <div style={{ marginBottom: 14 }}>
                            {/* ── GROUP DROPDOWN LEGEND ── */}
                            <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                              {INSTRUMENT_GROUPS.map((group) => {
                                const groupInstruments = allWithData.filter(({ ins }) => ins.group === group)
                                if (!groupInstruments.length) return null
                                const enabledCount = groupInstruments.filter(({ ins }) => activeInstruments.includes(ins.ticker)).length
                                const isOpen = openGroup === group
                                return (
                                  <div key={group} style={{ position: 'relative' }}>
                                    <button
                                      onClick={() => setOpenGroup(isOpen ? null : group)}
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8,
                                        padding: '9px 16px',
                                        background: isOpen
                                          ? `linear-gradient(180deg, ${GROUP_COLORS[group]}22 0%, ${GROUP_COLORS[group]}0d 100%)`
                                          : 'linear-gradient(180deg, #1a1a1a 0%, #111 100%)',
                                        border: `1px solid ${isOpen ? GROUP_COLORS[group] : '#252525'}`,
                                        color: '#fff',
                                        fontSize: 15,
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        letterSpacing: '0.6px',
                                        textTransform: 'uppercase',
                                        fontFamily: '"Roboto Mono", monospace',
                                        boxShadow: isOpen
                                          ? `0 0 10px ${GROUP_COLORS[group]}20`
                                          : '0 2px 6px rgba(0,0,0,0.4)',
                                        transition: 'all 0.15s',
                                      }}
                                    >
                                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: GROUP_COLORS[group], flexShrink: 0 }} />
                                      {group}
                                      <span style={{
                                        background: enabledCount > 0 ? GROUP_COLORS[group] : '#333',
                                        color: enabledCount > 0 ? '#000' : '#666',
                                        fontSize: 12,
                                        fontWeight: 900,
                                        padding: '2px 6px',
                                        borderRadius: 2,
                                        minWidth: 20,
                                        textAlign: 'center',
                                      }}>
                                        {enabledCount}/{groupInstruments.length}
                                      </span>
                                      <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>{isOpen ? '▲' : '▼'}</span>
                                    </button>

                                    {isOpen && (
                                      <div style={{
                                        position: 'absolute',
                                        top: '100%',
                                        left: 0,
                                        zIndex: 50,
                                        marginTop: 4,
                                        background: 'linear-gradient(180deg, #181818 0%, #111 100%)',
                                        border: `1px solid ${GROUP_COLORS[group]}40`,
                                        boxShadow: `0 8px 24px rgba(0,0,0,0.7), 0 0 0 1px ${GROUP_COLORS[group]}15`,
                                        minWidth: 200,
                                        overflow: 'hidden',
                                      }}>
                                        {/* Select all / none */}
                                        <div style={{
                                          display: 'flex',
                                          borderBottom: '1px solid #1e1e1e',
                                          padding: '6px 10px',
                                          gap: 8,
                                        }}>
                                          <button
                                            onClick={() => setActiveInstruments((prev) => {
                                              const tickers = groupInstruments.map(({ ins }) => ins.ticker)
                                              const others = prev.filter((t) => !tickers.includes(t))
                                              return [...others, ...tickers]
                                            })}
                                            style={{ flex: 1, background: '#111', border: '1px solid #222', color: '#fff', fontSize: 13, fontWeight: 700, padding: '6px 0', cursor: 'pointer', letterSpacing: '0.5px', fontFamily: '"Roboto Mono", monospace' }}
                                          >ALL</button>
                                          <button
                                            onClick={() => setActiveInstruments((prev) => {
                                              const tickers = groupInstruments.map(({ ins }) => ins.ticker)
                                              return prev.filter((t) => !tickers.includes(t))
                                            })}
                                            style={{ flex: 1, background: '#111', border: '1px solid #222', color: '#666', fontSize: 13, fontWeight: 700, padding: '6px 0', cursor: 'pointer', letterSpacing: '0.5px', fontFamily: '"Roboto Mono", monospace' }}
                                          >NONE</button>
                                        </div>
                                        {groupInstruments.map(({ ins, d }) => {
                                          const on = activeInstruments.includes(ins.ticker)
                                          const ret = d![activePeriod]?.totalReturn ?? 0
                                          return (
                                            <div
                                              key={ins.ticker}
                                              onClick={() => setActiveInstruments((prev) =>
                                                on ? prev.filter((t) => t !== ins.ticker) : [...prev, ins.ticker]
                                              )}
                                              style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 9,
                                                padding: '8px 12px',
                                                cursor: 'pointer',
                                                background: on ? `${ins.color}0a` : 'transparent',
                                                borderBottom: '1px solid #141414',
                                                transition: 'background 0.1s',
                                              }}
                                            >
                                              {/* Checkbox */}
                                              <div style={{
                                                width: 14,
                                                height: 14,
                                                border: `1.5px solid ${on ? ins.color : '#333'}`,
                                                background: on ? ins.color : 'transparent',
                                                flexShrink: 0,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                              }}>
                                                {on && <span style={{ color: '#000', fontSize: 9, fontWeight: 900, lineHeight: 1 }}>✓</span>}
                                              </div>
                                              <div style={{ width: 14, height: 2, background: ins.color, borderRadius: 1, flexShrink: 0 }} />
                                              <span style={{ color: on ? '#fff' : '#555', fontSize: 15, fontWeight: 700, flex: 1 }}>
                                                {ins.label}
                                              </span>
                                              <span style={{ color: ret >= 0 ? '#00e676' : '#ff1744', fontSize: 15, fontWeight: 800 }}>
                                                {ret >= 0 ? '+' : ''}{ret.toFixed(2)}%
                                              </span>
                                            </div>
                                          )
                                        })}
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                              {/* Close dropdown on outside area click */}
                              {openGroup && (
                                <div
                                  style={{ position: 'fixed', inset: 0, zIndex: 49 }}
                                  onClick={() => setOpenGroup(null)}
                                />
                              )}
                            </div>

                            {active.length > 0 ? (
                              <ResponsiveContainer width="100%" height={675}>
                                <LineChart
                                  data={chartData}
                                  margin={{ top: 12, right: 110, bottom: 8, left: 8 }}
                                >
                                  <XAxis
                                    dataKey="date"
                                    tick={{ fill: '#ffffff', fontSize: 22, fontFamily: '"Roboto Mono", monospace' }}
                                    tickLine={{ stroke: '#333' }}
                                    axisLine={{ stroke: '#333' }}
                                    interval="preserveStartEnd"
                                    minTickGap={40}
                                  />
                                  <YAxis
                                    orientation="left"
                                    domain={['auto', 'auto']}
                                    tickFormatter={(v: number) =>
                                      `${v >= 100 ? '+' : ''}${(v - 100).toFixed(0)}%`
                                    }
                                    tick={{ fill: '#ffffff', fontSize: 22, fontFamily: '"Roboto Mono", monospace' }}
                                    tickLine={{ stroke: '#333' }}
                                    axisLine={{ stroke: '#333' }}
                                    width={72}
                                  />
                                  <Tooltip
                                    contentStyle={{
                                      background: '#0d0d0d',
                                      border: '1px solid #2a2a2a',
                                      fontSize: 12,
                                      fontFamily: '"Roboto Mono", monospace',
                                      padding: '8px 12px',
                                    }}
                                    formatter={((val: unknown, name: string) => {
                                      const v = val as number
                                      return [`${v >= 100 ? '+' : ''}${(v - 100).toFixed(2)}%`, name]
                                    }) as never}
                                    labelStyle={{ color: '#aaa', fontSize: 11, marginBottom: 4 }}
                                    itemStyle={{ padding: '2px 0', fontSize: 12 }}
                                  />
                                  <ReferenceLine y={100} stroke="#2a2a2a" strokeDasharray="4 4" strokeWidth={1} />
                                  <ReferenceLine x="D0" stroke="#FF6B00" strokeWidth={1.5} label={{ value: 'EVENT', position: 'top', fill: '#FF6B00', fontSize: 10, fontWeight: 700, fontFamily: '"Roboto Mono", monospace' }} />
                                  {(() => {
                                    const endPos: Record<string, { x: number; y: number; color: string }> = {}
                                    return active.map(({ ins }, lineIndex) => (
                                      <Line
                                        key={ins.ticker}
                                        type="monotone"
                                        dataKey={ins.label}
                                        stroke={ins.color}
                                        strokeWidth={2}
                                        dot={false}
                                        activeDot={{ r: 4, fill: ins.color, stroke: '#000', strokeWidth: 1 }}
                                        label={((props: { index: number; x: number; y: number }) => {
                                          if (props.index !== maxLen - 1) return <g />
                                          endPos[ins.ticker] = { x: props.x, y: props.y, color: ins.color }
                                          if (lineIndex !== active.length - 1) return <g />
                                          // all lines have written — run collision avoidance
                                          const items = Object.entries(endPos).map(([ticker, p]) => ({ ticker, x: p.x, y: p.y, color: p.color }))
                                          items.sort((a, b) => a.y - b.y)
                                          const minGap = 26
                                          for (let pass = 0; pass < 300; pass++) {
                                            let moved = false
                                            for (let i = 1; i < items.length; i++) {
                                              const gap = items[i].y - items[i - 1].y
                                              if (gap < minGap) {
                                                const shift = (minGap - gap) / 2
                                                items[i - 1].y -= shift
                                                items[i].y += shift
                                                moved = true
                                              }
                                            }
                                            if (!moved) break
                                          }
                                          return (
                                            <g>
                                              {items.map(item => (
                                                <text
                                                  key={item.ticker}
                                                  x={item.x + 10}
                                                  y={item.y}
                                                  fill={item.color}
                                                  fontSize={20}
                                                  fontFamily='"Roboto Mono", monospace'
                                                  fontWeight={700}
                                                  dominantBaseline="middle"
                                                >
                                                  {item.ticker}
                                                </text>
                                              ))}
                                            </g>
                                          )
                                        }) as never}
                                      />
                                    ))
                                  })()}
                                </LineChart>
                              </ResponsiveContainer>
                            ) : (
                              <div style={{ height: 450, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.2)', fontSize: 13, fontWeight: 700, letterSpacing: '1px' }}>
                                NO INSTRUMENTS SELECTED
                              </div>
                            )}
                          </div>
                        )
                      })()}
                      {false && <div
                        style={{
                          background: 'linear-gradient(180deg, #080808 0%, #050505 100%)',
                          border: '1px solid #141414',
                          marginBottom: 14,
                          overflow: 'hidden',
                          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
                        }}
                      >
                        {/* Table header bar */}
                        <div
                          style={{
                            padding: '12px 18px 10px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            borderBottom: '1px solid #111',
                            background: 'linear-gradient(180deg, #0d0d0d 0%, #080808 100%)',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div
                              style={{
                                width: 3,
                                height: 14,
                                background: '#3b82f6',
                                boxShadow: '0 0 6px #3b82f640',
                              }}
                            />
                            <span
                              style={{
                                color: '#FFFFFF',
                                fontSize: 12,
                                fontWeight: 800,
                                letterSpacing: '1.2px',
                                textTransform: 'uppercase',
                              }}
                            >
                              Period Performance Matrix
                            </span>
                          </div>
                          <span
                            style={{
                              color: 'rgba(255,255,255,0.3)',
                              fontSize: 10,
                              letterSpacing: '0.5px',
                              textTransform: 'uppercase',
                            }}
                          >
                            Click column to switch active period
                          </span>
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                          <table
                            style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}
                          >
                            <thead>
                              <tr style={{ background: '#040404' }}>
                                <th
                                  style={{
                                    textAlign: 'left',
                                    color: '#666',
                                    fontSize: 13,
                                    fontWeight: 700,
                                    letterSpacing: '0.8px',
                                    padding: '8px 14px',
                                    textTransform: 'uppercase',
                                    whiteSpace: 'nowrap',
                                    borderBottom: '1px solid #111',
                                  }}
                                >
                                  Instrument
                                </th>
                                {(['pre30', 'pre10', 'during', 'post30'] as PeriodKey[]).map(
                                  (pk) => {
                                    const labels: Record<string, string> = {
                                      pre30: '-30D Before',
                                      pre10: '-10D Before',
                                      during: 'During Event',
                                      post30: '+30D After',
                                    }
                                    const colors: Record<string, string> = {
                                      pre30: '#a855f7',
                                      pre10: '#f472b6',
                                      during: '#ef4444',
                                      post30: '#22c55e',
                                    }
                                    const isA = activePeriod === pk
                                    return (
                                      <th
                                        key={pk}
                                        onClick={() => setActivePeriod(pk)}
                                        style={{
                                          textAlign: 'center',
                                          cursor: 'pointer',
                                          color: isA ? colors[pk] : '#444',
                                          fontSize: 13,
                                          fontWeight: 800,
                                          letterSpacing: '0.7px',
                                          padding: '8px 12px',
                                          whiteSpace: 'nowrap',
                                          textTransform: 'uppercase',
                                          borderBottom: isA
                                            ? `2px solid ${colors[pk]}`
                                            : '2px solid transparent',
                                          background: isA ? `${colors[pk]}08` : 'transparent',
                                          transition: 'all 0.15s',
                                        }}
                                      >
                                        {labels[pk]}
                                      </th>
                                    )
                                  }
                                )}
                              </tr>
                            </thead>
                            <tbody>
                              {INSTRUMENT_GROUPS.map((group) => {
                                const groupInstruments = ALL_INSTRUMENTS.filter(
                                  (ins) => ins.group === group
                                )
                                const anyData = groupInstruments.some(
                                  (ins) =>
                                    !!(stats[INSTR_KEY_MAP[ins.ticker]] as InstrumentData | null)
                                )
                                if (!anyData) return null
                                return (
                                  <React.Fragment key={group}>
                                    <tr>
                                      <td
                                        colSpan={5}
                                        style={{
                                          padding: '7px 14px 4px',
                                          color: GROUP_COLORS[group],
                                          fontSize: 11,
                                          fontWeight: 800,
                                          letterSpacing: '1.2px',
                                          textTransform: 'uppercase',
                                          background: `${GROUP_COLORS[group]}06`,
                                          borderTop: `1px solid ${GROUP_COLORS[group]}15`,
                                          borderBottom: `1px solid ${GROUP_COLORS[group]}10`,
                                        }}
                                      >
                                        {group}
                                      </td>
                                    </tr>
                                    {groupInstruments.map((ins, idx) => {
                                      const d = stats[
                                        INSTR_KEY_MAP[ins.ticker]
                                      ] as InstrumentData | null
                                      if (!d) return null
                                      return (
                                        <tr
                                          key={ins.ticker}
                                          style={{
                                            background: idx % 2 === 0 ? '#030303' : '#050505',
                                            borderBottom: '1px solid #0a0a0a',
                                          }}
                                        >
                                          <td
                                            style={{ padding: '7px 14px', whiteSpace: 'nowrap' }}
                                          >
                                            <span
                                              style={{
                                                color: ins.color,
                                                fontSize: 15,
                                                fontWeight: 700,
                                              }}
                                            >
                                              {ins.label}
                                            </span>
                                            <span
                                              style={{
                                                color: '#444',
                                                fontSize: 12,
                                                marginLeft: 7,
                                              }}
                                            >
                                              {ins.ticker === 'DXY'
                                                ? 'UUP'
                                                : ins.ticker === 'VIX'
                                                  ? 'I:VIX'
                                                  : ins.ticker}
                                            </span>
                                          </td>
                                          {(
                                            ['pre30', 'pre10', 'during', 'post30'] as PeriodKey[]
                                          ).map((pk) => {
                                            const ps = d[pk] as PeriodStats | null
                                            const ret = ps?.totalReturn
                                            const isA = activePeriod === pk
                                            return (
                                              <td
                                                key={pk}
                                                style={{
                                                  textAlign: 'center',
                                                  padding: '7px 10px',
                                                  background: isA
                                                    ? 'rgba(255,255,255,0.02)'
                                                    : 'transparent',
                                                }}
                                              >
                                                {ret !== undefined && ret !== null ? (
                                                  <span
                                                    style={{
                                                      display: 'inline-block',
                                                      padding: '3px 10px',
                                                      fontSize: 15,
                                                      fontWeight: 800,
                                                      color: ret >= 0 ? '#00e676' : '#ff4d6d',
                                                      background:
                                                        ret >= 0 ? '#00e67612' : '#ff4d6d12',
                                                      letterSpacing: '-0.2px',
                                                      minWidth: 68,
                                                      textAlign: 'center',
                                                    }}
                                                  >
                                                    {formatPct(ret)}
                                                  </span>
                                                ) : (
                                                  <span
                                                    style={{
                                                      color: '#2a2a2a',
                                                      fontSize: 15,
                                                    }}
                                                  >
                                                    —
                                                  </span>
                                                )}
                                              </td>
                                            )
                                          })}
                                        </tr>
                                      )
                                    })}
                                  </React.Fragment>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>}

                      {/* ── KEY MOVERS ────────────────────────────────── */}
                      {selectedEvent?.keyMovers && selectedEvent.keyMovers.length > 0 && (
                        <div style={{ padding: '8px 0 16px' }}>
                          <div
                            style={{
                              color: 'rgba(255,255,255,0.35)',
                              fontSize: 11,
                              fontWeight: 700,
                              letterSpacing: '1px',
                              textTransform: 'uppercase',
                              padding: '0 4px 10px',
                            }}
                          >
                            What Moved &amp; Why
                          </div>
                          {selectedEvent.keyMovers.map((mover: KeyMover, i: number) => {
                            const dirColor =
                              mover.direction === 'up'
                                ? '#00e676'
                                : mover.direction === 'down'
                                  ? '#ff1744'
                                  : '#eab308'
                            const dirArrow =
                              mover.direction === 'up' ? '▲' : mover.direction === 'down' ? '▼' : '—'
                            return (
                              <div
                                key={i}
                                style={{
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: 5,
                                  padding: '12px 8px',
                                  borderBottom: '1px solid #181818',
                                  borderLeft: `3px solid ${dirColor}`,
                                  paddingLeft: 14,
                                  marginBottom: 4,
                                  background: 'rgba(255,255,255,0.015)',
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <span style={{ color: dirColor, fontSize: 20, fontWeight: 900, lineHeight: 1 }}>
                                    {dirArrow}
                                  </span>
                                  <span
                                    style={{
                                      color: '#FF6B00',
                                      fontSize: 20,
                                      fontWeight: 900,
                                      letterSpacing: '0.5px',
                                      fontFamily: '"Roboto Mono", monospace',
                                    }}
                                  >
                                    {mover.ticker ?? mover.asset}
                                  </span>
                                  <span
                                    style={{
                                      color: dirColor,
                                      fontSize: 12,
                                      fontWeight: 700,
                                      textTransform: 'uppercase',
                                      letterSpacing: '1px',
                                      opacity: 0.8,
                                    }}
                                  >
                                    {mover.direction}
                                  </span>
                                </div>
                                <span style={{ color: dirColor, fontSize: 15, lineHeight: 1.6 }}>
                                  {mover.note}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </>
                  )}

                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
