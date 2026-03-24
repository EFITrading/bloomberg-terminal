'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import {
  MARKET_EVENTS,
  EVENT_CATEGORIES,
  CATEGORY_COLORS,
  SEVERITY_COLORS,
  type MarketEvent,
  type EventCategory,
  type KeyMover,
} from '../../data/marketEvents'

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
  apiTicker: string   // what we send to /api/historical-data
  label: string
  color: string
  group: 'Equities' | 'Sectors' | 'Commodities' | 'Fixed Income' | 'FX & Vol'
}

const ALL_INSTRUMENTS: InstrumentDef[] = [
  // Equities
  { ticker: 'SPY', apiTicker: 'SPY', label: 'S&P 500', color: '#3b82f6', group: 'Equities' },
  { ticker: 'QQQ', apiTicker: 'QQQ', label: 'NASDAQ', color: '#a855f7', group: 'Equities' },
  { ticker: 'IWM', apiTicker: 'IWM', label: 'Small Caps', color: '#06b6d4', group: 'Equities' },
  { ticker: 'EEM', apiTicker: 'EEM', label: 'Emerg. Mkts', color: '#f472b6', group: 'Equities' },
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
  // Commodities
  { ticker: 'GLD', apiTicker: 'GLD', label: 'Gold', color: '#eab308', group: 'Commodities' },
  { ticker: 'USO', apiTicker: 'USO', label: 'Crude Oil', color: '#78350f', group: 'Commodities' },
  // Fixed income
  { ticker: 'TLT', apiTicker: 'TLT', label: 'Long Bonds', color: '#22c55e', group: 'Fixed Income' },
  // FX & Vol
  { ticker: 'DXY', apiTicker: 'UUP', label: 'USD Index', color: '#38bdf8', group: 'FX & Vol' },
  { ticker: 'VIX', apiTicker: 'I:VIX', label: 'VIX', color: '#ef4444', group: 'FX & Vol' },
]

const INSTRUMENT_GROUPS: Array<'Equities' | 'Sectors' | 'Commodities' | 'Fixed Income' | 'FX & Vol'> = [
  'Equities', 'Sectors', 'Commodities', 'Fixed Income', 'FX & Vol',
]

const GROUP_COLORS: Record<string, string> = {
  'Equities': '#3b82f6',
  'Sectors': '#f97316',
  'Commodities': '#eab308',
  'Fixed Income': '#22c55e',
  'FX & Vol': '#ef4444',
}

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────
function calcStats(bars: PriceBar[]): { totalReturn: number; maxDrawdown: number; peakGain: number; recoveryDays: number | null } {
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
  return bars.map(b => (b.close / base) * 100)
}

function offsetDate(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function sliceBars(bars: PriceBar[], from: string, to: string): PriceBar[] {
  return bars.filter(b => b.date >= from && b.date <= to)
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
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
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

  const res = await fetch(
    `/api/historical-data?symbol=${ticker}&startDate=${s}&endDate=${e}&timeframe=1d`
  )
  if (!res.ok) throw new Error(`Failed to fetch ${ticker}`)
  const json = await res.json()

  if (!json.results || !Array.isArray(json.results)) return []

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

  return bars
}

// ────────────────────────────────────────────────────────────────────────────
// Chart tooltip
// ────────────────────────────────────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?: string
}) => {
  if (!active || !payload || !payload.length) return null
  return (
    <div style={{
      background: '#0a0a0a',
      border: '1px solid #2a2a2a',
      borderRadius: 8,
      padding: '12px 16px',
      fontSize: 14,
      boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
    }}>
      <div style={{ color: '#ffffff', fontWeight: 700, marginBottom: 8, fontSize: 14 }}>{label}</div>
      {payload.map(p => {
        const delta = p.value - 100
        const sign = delta >= 0 ? '+' : ''
        return (
          <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 3 }}>
            <span style={{ color: p.color, fontWeight: 600 }}>{p.name}</span>
            <span style={{ color: delta >= 0 ? '#00ff41' : '#ff3333', fontWeight: 700 }}>
              {sign}{delta.toFixed(2)}%
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
  <div style={{
    background: '#0a0a0a',
    border: '1px solid #222',
    borderRadius: 8,
    padding: '14px 18px',
    minWidth: 130,
    flex: '1 1 130px',
  }}>
    <div style={{ color: '#ffffff', fontSize: 12, fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: 6, opacity: 0.5 }}>
      {label}
    </div>
    <div style={{ color, fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px' }}>
      {value}
    </div>
  </div>
)

// ────────────────────────────────────────────────────────────────────────────
// Main component
// ────────────────────────────────────────────────────────────────────────────
export default function HistoricalEventsResearch() {
  const [selectedCategory, setSelectedCategory] = useState<EventCategory | 'All'>('All')
  const [selectedEvent, setSelectedEvent] = useState<MarketEvent | null>(null)
  const [stats, setStats] = useState<EventStats>({
    spy: null, qqq: null, iwm: null, eem: null,
    xle: null, xlf: null, xli: null, xlk: null, xlv: null, xlp: null, xly: null, xlb: null, xlu: null, xlre: null, xlc: null,
    gold: null, uso: null, tlt: null, dxy: null, vix: null,
    loading: false, error: null,
  })
  const [activeInstruments, setActiveInstruments] = useState<string[]>(['SPY', 'QQQ', 'GLD', 'TLT', 'USO'])
  const [searchQuery, setSearchQuery] = useState('')
  const [activePeriod, setActivePeriod] = useState<PeriodKey>('during')
  const abortRef = useRef<AbortController | null>(null)

  const INSTR_KEY_MAP: Record<string, keyof Omit<EventStats, 'loading' | 'error'>> = {
    SPY: 'spy', QQQ: 'qqq', IWM: 'iwm', EEM: 'eem',
    XLE: 'xle', XLF: 'xlf', XLI: 'xli', XLK: 'xlk', XLV: 'xlv', XLP: 'xlp', XLY: 'xly', XLB: 'xlb', XLU: 'xlu', XLRE: 'xlre', XLC: 'xlc',
    GLD: 'gold', USO: 'uso', TLT: 'tlt', DXY: 'dxy', VIX: 'vix',
  }

  // ── Filtering ─────────────────────────────────────────────────────────────
  const filteredEvents = MARKET_EVENTS.filter(e => {
    const matchCat = selectedCategory === 'All' || e.category === selectedCategory
    const q = searchQuery.toLowerCase()
    const matchSearch = !q || e.name.toLowerCase().includes(q) || e.category.toLowerCase().includes(q) || e.description.toLowerCase().includes(q)
    return matchCat && matchSearch
  }).sort((a, b) => a.startDate.localeCompare(b.startDate))

  // ── Load data when event is selected ─────────────────────────────────────
  const loadEventData = useCallback(async (event: MarketEvent) => {
    setStats({
      spy: null, qqq: null, iwm: null, eem: null,
      xle: null, xlf: null, xli: null, xlk: null, xlv: null, xlp: null, xly: null, xlb: null, xlu: null, xlre: null, xlc: null,
      gold: null, uso: null, tlt: null, dxy: null, vix: null,
      loading: true, error: null,
    })

    const results = await Promise.allSettled(
      ALL_INSTRUMENTS.map(ins => fetchBars(ins.apiTicker, event.startDate, event.endDate))
    )

    const update: Partial<EventStats> = { loading: false, error: null }

    const pre30Start = offsetDate(event.startDate, -30)
    const pre10Start = offsetDate(event.startDate, -10)
    const post30End = offsetDate(event.endDate, +30)

    ALL_INSTRUMENTS.forEach((ins, i) => {
      const key = INSTR_KEY_MAP[ins.ticker]
      const result = results[i]
      if (result.status === 'fulfilled' && result.value.length >= 2) {
        const allBars = result.value
        const duringBars = sliceBars(allBars, event.startDate, event.endDate)
        const d = buildPeriodStats(duringBars.length >= 2 ? duringBars : allBars)!
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
        update[key] = null
      }
    })

    setStats(s => ({ ...s, ...update }))
  }, [])

  useEffect(() => {
    if (selectedEvent) {
      setActivePeriod('during')
      loadEventData(selectedEvent)
    }
  }, [selectedEvent, loadEventData])

  // ── Build chart dataset ───────────────────────────────────────────────────
  const buildChartData = () => {
    const active = activeInstruments
      .map(k => stats[INSTR_KEY_MAP[k]] as InstrumentData | null)
      .filter((d): d is InstrumentData => !!d && (d[activePeriod]?.bars?.length ?? 0) > 0)

    if (!active.length) return []
    const maxLen = Math.max(...active.map(d => d[activePeriod]?.bars?.length ?? 0))
    return Array.from({ length: maxLen }, (_, i) => {
      const row: Record<string, number | string> = { date: active[0]?.[activePeriod]?.bars[i]?.date ?? '' }
      active.forEach(d => {
        const idx = d[activePeriod]?.indexed ?? []
        row[d.label] = idx[i] ?? idx[idx.length - 1] ?? 100
      })
      return row
    })
  }

  // ── Build impact leaderboard (all instruments sorted by totalReturn) ───────
  const buildLeaderboard = (): Array<InstrumentData & { group: string; periodReturn: number }> => {
    const results: Array<InstrumentData & { group: string; periodReturn: number }> = []
    ALL_INSTRUMENTS.forEach(ins => {
      const d = stats[INSTR_KEY_MAP[ins.ticker]] as InstrumentData | null
      if (d) {
        const periodReturn = d[activePeriod]?.totalReturn ?? d.totalReturn
        results.push({ ...d, group: ins.group as string, periodReturn })
      }
    })
    return results.sort((a, b) => b.periodReturn - a.periodReturn)
  }

  const chartData = buildChartData()
  const leaderboard = buildLeaderboard()
  const leaderboardMax = leaderboard.length
    ? Math.max(...leaderboard.map(d => Math.abs(d.periodReturn)), 1)
    : 1

  // ── UI ────────────────────────────────────────────────────────────────────
  return (
    <div style={{
      background: '#000000',
      border: '1px solid #1a1a1a',
      fontFamily: '"Roboto Mono", "SF Mono", monospace',
      overflow: 'hidden',
    }}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{
        padding: '0',
        borderBottom: '1px solid #1e1e1e',
        background: 'linear-gradient(180deg, #0c0c0c 0%, #080808 100%)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 1px 0 #000',
      }}>
        {/* Top bar */}
        <div style={{
          padding: '18px 28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {/* Icon */}
            <div style={{
              width: 38,
              height: 38,
              background: 'linear-gradient(135deg, #1d4ed8 0%, #7c3aed 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 2px 12px rgba(99,102,241,0.4), inset 0 1px 0 rgba(255,255,255,0.15)',
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="square">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </div>
            <div>
              <div style={{
                color: '#ffffff',
                fontSize: 16,
                fontWeight: 800,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                lineHeight: 1,
              }}>
                Historical Event Research
              </div>
              <div style={{
                color: '#555',
                fontSize: 11,
                letterSpacing: '0.15em',
                marginTop: 5,
                textTransform: 'uppercase',
                fontWeight: 600,
              }}>
                Market Performance &nbsp;·&nbsp; {filteredEvents.length} Events
              </div>
            </div>
          </div>

          {/* Search */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="#555" strokeWidth="2" strokeLinecap="square"
              style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
            >
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search events..."
              style={{
                background: '#0a0a0a',
                border: '1px solid #242424',
                borderRadius: 0,
                color: '#ffffff',
                padding: '9px 14px 9px 34px',
                fontSize: 13,
                outline: 'none',
                width: 240,
                fontFamily: '"Roboto Mono", monospace',
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)',
              }}
            />
          </div>
        </div>

        {/* ── Category Filter strip ──────────────────────────────────── */}
        <div style={{
          padding: '0 28px',
          paddingBottom: '2px',
          display: 'flex',
          gap: 0,
          flexWrap: 'wrap',
          justifyContent: 'center',
          borderTop: '1px solid #141414',
          background: '#060606',
        }}>
          {(['All', ...EVENT_CATEGORIES] as Array<EventCategory | 'All'>).map((cat, idx) => {
            const active = selectedCategory === cat
            const color = cat === 'All' ? '#ffffff' : CATEGORY_COLORS[cat]
            const CATEGORY_ICONS: Record<string, React.ReactElement> = {
              'All': <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>,
              'War & Conflict': <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg>,
              'Oil & Energy Crisis': <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>,
              'Recession': <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6" /><polyline points="17 18 23 18 23 12" /></svg>,
              'Financial Crisis': <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" /></svg>,
              'Election': <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>,
              'Pandemic & Health': <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>,
              'Monetary Policy': <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>,
              'Geopolitical Shock': <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" /></svg>,
              'Terror & Disaster': <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>,
              'Trade War': <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square"><rect x="1" y="3" width="15" height="13" /><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></svg>,
              'Debt Crisis': <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square"><rect x="2" y="7" width="20" height="14" rx="0" /><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" /></svg>,
              'Market Crash': <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6" /><polyline points="17 18 23 18 23 12" /></svg>,
              'Market Pattern': <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>,
            }
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '10px 16px',
                  background: active
                    ? `linear-gradient(180deg, ${color}18 0%, ${color}08 100%)`
                    : 'transparent',
                  border: 'none',
                  borderBottom: active ? `2px solid ${color}` : '2px solid transparent',
                  borderRight: idx < EVENT_CATEGORIES.length ? '1px solid #111' : 'none',
                  color: color,
                  fontSize: 14,
                  fontWeight: active ? 800 : 600,
                  cursor: 'pointer',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  transition: 'all 0.12s',
                  whiteSpace: 'nowrap',
                  fontFamily: '"Roboto Mono", monospace',
                  flexShrink: 0,
                  boxShadow: active ? `inset 0 1px 0 ${color}20` : 'none',
                }}
                onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLButtonElement).style.background = '#0e0e0e' } }}
                onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' } }}
              >
                <span>{CATEGORY_ICONS[cat] || null}</span>
                {cat}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Main layout ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', minHeight: 600 }}>

        {/* ── Event list ───────────────────────────────────────────────── */}
        <div style={{
          width: 400,
          minWidth: 360,
          borderRight: '1px solid #111',
          overflowY: 'auto',
          maxHeight: 800,
        }}>
          {filteredEvents.length === 0 && (
            <div style={{ padding: 32, color: '#ffffff', fontSize: 14, textAlign: 'center' }}>
              No events match your filter.
            </div>
          )}
          {filteredEvents.map(event => {
            const isSelected = selectedEvent?.id === event.id
            const catColor = CATEGORY_COLORS[event.category]
            const sevColor = SEVERITY_COLORS[event.severity]
            return (
              <div
                key={event.id}
                onClick={() => setSelectedEvent(event)}
                style={{
                  padding: '18px 20px',
                  borderBottom: `1px solid ${isSelected ? `${catColor}40` : '#141414'}`,
                  cursor: 'pointer',
                  background: isSelected ? `${catColor}22` : 'transparent',
                  borderLeft: isSelected ? `5px solid ${catColor}` : '5px solid transparent',
                  transition: 'background 0.12s',
                }}
                onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = '#0e0e0e' }}
                onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
              >
                {/* Category + Severity badge */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{
                    fontSize: 12,
                    fontWeight: 800,
                    color: catColor,
                    letterSpacing: '0.5px',
                    textTransform: 'uppercase',
                  }}>
                    {event.category}
                  </span>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 800,
                    color: '#000000',
                    letterSpacing: '0.6px',
                    textTransform: 'uppercase',
                    background: sevColor,
                    borderRadius: 4,
                    padding: '2px 9px',
                  }}>
                    {event.severity}
                  </span>
                </div>

                {/* Event name */}
                <div style={{
                  color: '#ffffff',
                  fontSize: 17,
                  fontWeight: 700,
                  lineHeight: 1.35,
                  marginBottom: 8,
                  letterSpacing: '-0.3px',
                }}>
                  {event.name}
                </div>

                {/* Dates */}
                <div style={{ color: '#ffffff', fontSize: 13, display: 'flex', gap: 6, fontWeight: 500, opacity: 0.7 }}>
                  <span>{formatDate(event.startDate)}</span>
                  <span>→</span>
                  <span>{formatDate(event.endDate)}</span>
                </div>
              </div>
            )
          })}
        </div>

        {/* ── Research panel ───────────────────────────────────────────── */}
        <div style={{ flex: 1, padding: '24px 28px', overflowY: 'auto' }}>
          {!selectedEvent ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              minHeight: 400,
              gap: 12,
            }}>
              <div style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: '#0d0d0d',
                border: '1px solid #1a1a1a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 24,
              }}>
                📊
              </div>
              <div style={{ color: '#ffffff', fontSize: 20, fontWeight: 700 }}>SELECT AN EVENT</div>
              <div style={{ color: '#ffffff', fontSize: 15, textAlign: 'center', maxWidth: 380, lineHeight: 1.6, opacity: 0.6 }}>
                Choose any historical event from the list to analyze market performance across key instruments.
              </div>
            </div>
          ) : (
            <div>
              {/* Event header */}
              <div style={{
                background: '#080808',
                border: `1px solid ${CATEGORY_COLORS[selectedEvent.category]}30`,
                borderRadius: 10,
                padding: '16px 20px',
                marginBottom: 20,
                borderLeft: `4px solid ${CATEGORY_COLORS[selectedEvent.category]}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: 13,
                        fontWeight: 800,
                        color: CATEGORY_COLORS[selectedEvent.category],
                        letterSpacing: '0.8px',
                        textTransform: 'uppercase',
                      }}>
                        {selectedEvent.category}
                      </span>
                      <span style={{ color: '#444' }}>•</span>
                      <span style={{
                        fontSize: 13,
                        fontWeight: 800,
                        color: SEVERITY_COLORS[selectedEvent.severity],
                        letterSpacing: '0.8px',
                        textTransform: 'uppercase',
                      }}>
                        {selectedEvent.severity} severity
                      </span>
                      <span style={{ color: '#444' }}>•</span>
                      <span style={{ color: '#ffffff', fontSize: 13, opacity: 0.7 }}>
                        {eventDurationDays(selectedEvent).toLocaleString()} days
                      </span>
                    </div>
                    <div style={{
                      color: '#ffffff',
                      fontSize: 26,
                      fontWeight: 800,
                      letterSpacing: '-0.5px',
                      marginBottom: 12,
                      lineHeight: 1.2,
                    }}>
                      {selectedEvent.name}
                    </div>
                    <div style={{ color: '#ffffff', fontSize: 15, lineHeight: 1.75, opacity: 0.75 }}>
                      {selectedEvent.description}
                    </div>
                  </div>

                  <div style={{
                    background: '#0d0d0d',
                    border: '1px solid #1a1a1a',
                    borderRadius: 8,
                    padding: '10px 14px',
                    whiteSpace: 'nowrap',
                    textAlign: 'right',
                  }}>
                    <div style={{ color: '#ffffff', fontSize: 12, letterSpacing: '0.5px', marginBottom: 4, opacity: 0.5 }}>START DATE</div>
                    <div style={{ color: '#ffffff', fontSize: 16, fontWeight: 700, marginBottom: 12 }}>{formatDate(selectedEvent.startDate)}</div>
                    <div style={{ color: '#ffffff', fontSize: 12, letterSpacing: '0.5px', marginBottom: 4, opacity: 0.5 }}>END DATE</div>
                    <div style={{ color: '#ffffff', fontSize: 16, fontWeight: 700 }}>{formatDate(selectedEvent.endDate)}</div>
                  </div>
                </div>
              </div>

              {/* ── Period selector tabs ─────────────────────────────── */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                {([
                  { key: 'pre30' as PeriodKey, label: '−30D BEFORE', icon: '◀', color: '#a855f7' },
                  { key: 'pre10' as PeriodKey, label: '−10D BEFORE', icon: '◁', color: '#f472b6' },
                  { key: 'during' as PeriodKey, label: 'DURING EVENT', icon: '●', color: '#ef4444' },
                  { key: 'post30' as PeriodKey, label: '+30D AFTER', icon: '▷', color: '#22c55e' },
                  { key: 'full' as PeriodKey, label: 'FULL TIMELINE', icon: '⟷', color: '#3b82f6' },
                ]).map(p => {
                  const isActive = activePeriod === p.key
                  return (
                    <button
                      key={p.key}
                      onClick={() => setActivePeriod(p.key)}
                      style={{
                        padding: '10px 18px',
                        background: isActive ? `${p.color}20` : '#080808',
                        border: `1px solid ${isActive ? p.color : '#2a2a2a'}`,
                        borderRadius: 7,
                        color: isActive ? p.color : '#ffffff',
                        fontSize: 13,
                        fontWeight: 800,
                        cursor: 'pointer',
                        letterSpacing: '0.5px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        fontFamily: '"Roboto Mono", monospace',
                        transition: 'all 0.15s',
                        whiteSpace: 'nowrap',
                        opacity: isActive ? 1 : 0.6,
                      }}
                    >
                      <span style={{ fontSize: 14 }}>{p.icon}</span>
                      <span>{p.label}</span>
                    </button>
                  )
                })}
              </div>

              {/* Loading / error */}
              {stats.loading && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '40px 0',
                  justifyContent: 'center',
                }}>
                  <div style={{
                    width: 18,
                    height: 18,
                    border: '2px solid #222',
                    borderTop: '2px solid #3b82f6',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                  }} />
                  <span style={{ color: '#ffffff', fontSize: 16, opacity: 0.7 }}>Fetching market data...</span>
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
              )}

              {stats.error && !stats.loading && (
                <div style={{
                  background: '#1a0508',
                  border: '1px solid #ef444440',
                  borderRadius: 8,
                  padding: '16px 20px',
                  color: '#ef4444',
                  fontSize: 15,
                  marginBottom: 20,
                }}>
                  {stats.error}
                </div>
              )}

              {!stats.loading && !stats.error && (leaderboard.length > 0 || chartData.length > 0) && (
                <>
                  {/* ── PERIOD COMPARISON TABLE ────────────────────────── */}
                  <div style={{
                    background: '#030303',
                    border: '1px solid #111',
                    borderRadius: 10,
                    padding: '16px 20px',
                    marginBottom: 20,
                    overflowX: 'auto',
                  }}>
                    <div style={{
                      color: '#ffffff',
                      fontSize: 16,
                      fontWeight: 800,
                      letterSpacing: '1px',
                      textTransform: 'uppercase',
                      marginBottom: 18,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                    }}>
                      <span style={{ color: '#3b82f6', fontSize: 18 }}>▦</span> PERIOD PERFORMANCE MATRIX
                      <span style={{ color: '#ffffff', fontSize: 12, fontWeight: 500, marginLeft: 'auto', opacity: 0.5 }}>
                        CLICK COLUMN HEADER TO SWITCH PERIOD
                      </span>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'left', color: '#ffffff', fontSize: 13, fontWeight: 700, letterSpacing: '0.5px', paddingBottom: 12, paddingRight: 20, whiteSpace: 'nowrap', opacity: 0.6 }}>
                            INSTRUMENT
                          </th>
                          {([
                            { key: 'pre30' as PeriodKey, label: '−30D BEFORE' },
                            { key: 'pre10' as PeriodKey, label: '−10D BEFORE' },
                            { key: 'during' as PeriodKey, label: 'DURING EVENT' },
                            { key: 'post30' as PeriodKey, label: '+30D AFTER' },
                          ]).map(p => (
                            <th
                              key={p.key}
                              onClick={() => setActivePeriod(p.key)}
                              style={{
                                textAlign: 'center',
                                cursor: 'pointer',
                                color: activePeriod === p.key ? '#ffffff' : '#ffffff',
                                fontSize: 13,
                                fontWeight: 800,
                                letterSpacing: '0.5px',
                                paddingBottom: 12,
                                paddingLeft: 16,
                                paddingRight: 16,
                                whiteSpace: 'nowrap',
                                borderBottom: activePeriod === p.key ? '2px solid #3b82f6' : '1px solid #1a1a1a',
                                opacity: activePeriod === p.key ? 1 : 0.45,
                                transition: 'all 0.15s',
                              }}
                            >
                              {p.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {INSTRUMENT_GROUPS.map(group => {
                          const groupInstruments = ALL_INSTRUMENTS.filter(ins => ins.group === group)
                          const anyData = groupInstruments.some(ins => !!(stats[INSTR_KEY_MAP[ins.ticker]] as InstrumentData | null))
                          if (!anyData) return null
                          return (
                            <React.Fragment key={group}>
                              <tr>
                                <td colSpan={5} style={{
                                  paddingTop: 16,
                                  paddingBottom: 6,
                                  color: GROUP_COLORS[group],
                                  fontSize: 12,
                                  fontWeight: 800,
                                  letterSpacing: '1px',
                                  textTransform: 'uppercase',
                                }}>
                                  {group}
                                </td>
                              </tr>
                              {groupInstruments.map(ins => {
                                const d = stats[INSTR_KEY_MAP[ins.ticker]] as InstrumentData | null
                                if (!d) return null
                                return (
                                  <tr key={ins.ticker} style={{ borderBottom: '1px solid #0d0d0d' }}>
                                    <td style={{ padding: '10px 20px 10px 0', whiteSpace: 'nowrap' }}>
                                      <span style={{ color: ins.color, fontSize: 15, fontWeight: 700 }}>{ins.label}</span>
                                      <span style={{ color: '#ffffff', fontSize: 12, marginLeft: 8, opacity: 0.4 }}>
                                        {ins.ticker === 'DXY' ? 'UUP' : ins.ticker === 'VIX' ? 'I:VIX' : ins.ticker}
                                      </span>
                                    </td>
                                    {(['pre30', 'pre10', 'during', 'post30'] as PeriodKey[]).map(pk => {
                                      const ps = d[pk] as PeriodStats | null
                                      const ret = ps?.totalReturn
                                      const isActive = activePeriod === pk
                                      return (
                                        <td key={pk} style={{
                                          textAlign: 'center',
                                          padding: '10px 16px',
                                          background: isActive ? 'rgba(59,130,246,0.08)' : 'transparent',
                                        }}>
                                          {ret !== undefined && ret !== null ? (
                                            <span style={{
                                              display: 'inline-block',
                                              padding: '4px 12px',
                                              borderRadius: 5,
                                              fontSize: 15,
                                              fontWeight: 800,
                                              color: ret >= 0 ? '#00ff41' : '#ff3333',
                                              background: ret >= 0 ? '#00ff4115' : '#ff333315',
                                              letterSpacing: '-0.2px',
                                            }}>
                                              {formatPct(ret)}
                                            </span>
                                          ) : (
                                            <span style={{ color: '#ffffff', fontSize: 14, opacity: 0.2 }}>—</span>
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

                  {/* ── IMPACT LEADERBOARD ─────────────────────────────── */}
                  <div style={{
                    background: '#030303',
                    border: '1px solid #111',
                    borderRadius: 10,
                    padding: '16px 20px',
                    marginBottom: 20,
                  }}>
                    <div style={{
                      color: '#ffffff',
                      fontSize: 16,
                      fontWeight: 800,
                      letterSpacing: '1px',
                      textTransform: 'uppercase',
                      marginBottom: 18,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                    }}>
                      <span style={{ color: '#f97316', fontSize: 18 }}>▲▼</span> IMPACT LEADERBOARD
                      <span style={{ color: '#ffffff', fontSize: 12, fontWeight: 500, marginLeft: 'auto', opacity: 0.45 }}>
                        ALL INSTRUMENTS — RANKED BY TOTAL RETURN
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {leaderboard.map(d => {
                        const pct = d.periodReturn
                        const isPos = pct >= 0
                        const barW = Math.abs(pct) / leaderboardMax * 100
                        const ins = ALL_INSTRUMENTS.find(i => i.ticker === d.ticker)
                        return (
                          <div key={d.ticker} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            {/* Group tag */}
                            <div style={{
                              fontSize: 11,
                              fontWeight: 800,
                              color: GROUP_COLORS[d.group],
                              letterSpacing: '0.5px',
                              width: 90,
                              textAlign: 'right',
                              textTransform: 'uppercase',
                            }}>
                              {d.group}
                            </div>
                            {/* Label */}
                            <div style={{ width: 110, color: ins?.color ?? '#ffffff', fontSize: 15, fontWeight: 700 }}>
                              {d.label}
                            </div>
                            {/* Bar */}
                            <div style={{ flex: 1, height: 26, background: '#0a0a0a', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
                              <div style={{
                                position: 'absolute',
                                top: 0,
                                [isPos ? 'left' : 'right']: '50%',
                                width: `${barW / 2}%`,
                                height: '100%',
                                background: isPos ? '#00ff41' : '#ff3333',
                                opacity: 0.85,
                                borderRadius: isPos ? '0 3px 3px 0' : '3px 0 0 3px',
                                transition: 'width 0.4s ease',
                              }} />
                              {/* Center line */}
                              <div style={{
                                position: 'absolute',
                                top: 0, bottom: 0,
                                left: '50%',
                                width: 1,
                                background: '#222',
                              }} />
                            </div>
                            {/* Value */}
                            <div style={{
                              width: 72,
                              textAlign: 'right',
                              color: isPos ? '#00ff41' : '#ff3333',
                              fontSize: 16,
                              fontWeight: 800,
                              letterSpacing: '-0.3px',
                            }}>
                              {formatPct(pct)}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* ── KEY MOVERS (curated narrative) ─────────────────── */}
                  {selectedEvent?.keyMovers && selectedEvent.keyMovers.length > 0 && (
                    <div style={{
                      background: '#030303',
                      border: '1px solid #111',
                      borderRadius: 10,
                      padding: '16px 20px',
                      marginBottom: 20,
                    }}>
                      <div style={{
                        color: '#ffffff',
                        fontSize: 16,
                        fontWeight: 800,
                        letterSpacing: '1px',
                        textTransform: 'uppercase',
                        marginBottom: 18,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                      }}>
                        <span style={{ color: '#eab308', fontSize: 18 }}>★</span> WHAT MOVED & WHY
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {selectedEvent.keyMovers.map((mover: KeyMover, i: number) => {
                          const dirColor = mover.direction === 'up' ? '#00ff41' : mover.direction === 'down' ? '#ff3333' : '#eab308'
                          const dirArrow = mover.direction === 'up' ? '▲' : mover.direction === 'down' ? '▼' : '◆'
                          const magColors: Record<string, string> = {
                            '1-5%': '#ffffff', '5-15%': '#eab308', '15-30%': '#f97316', '30%+': '#ef4444',
                          }
                          return (
                            <div key={i} style={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: 16,
                              padding: '14px 16px',
                              background: '#080808',
                              borderRadius: 8,
                              border: `1px solid ${dirColor}25`,
                              borderLeft: `4px solid ${dirColor}`,
                            }}>
                              {/* Direction + magnitude */}
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 48 }}>
                                <span style={{ color: dirColor, fontSize: 22, lineHeight: 1 }}>{dirArrow}</span>
                                <span style={{
                                  fontSize: 11,
                                  fontWeight: 800,
                                  color: magColors[mover.magnitude],
                                  letterSpacing: '0.3px',
                                }}>
                                  {mover.magnitude}
                                </span>
                              </div>

                              {/* Asset info */}
                              <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 5 }}>
                                  <span style={{ color: '#ffffff', fontSize: 16, fontWeight: 700 }}>{mover.asset}</span>
                                  {mover.ticker && (
                                    <span style={{
                                      fontSize: 12,
                                      fontWeight: 700,
                                      color: '#ffffff',
                                      background: '#1a1a1a',
                                      border: '1px solid #2a2a2a',
                                      borderRadius: 4,
                                      padding: '2px 8px',
                                      opacity: 0.7,
                                    }}>
                                      {mover.ticker}
                                    </span>
                                  )}
                                </div>
                                <div style={{ color: '#ffffff', fontSize: 14, lineHeight: 1.6, opacity: 0.75 }}>{mover.note}</div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* ── Instrument toggles ─────────────────────────────── */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ color: '#ffffff', fontSize: 13, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 10, opacity: 0.5 }}>
                      CHART INSTRUMENTS
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {INSTRUMENT_GROUPS.map(group => {
                        const groupInstruments = ALL_INSTRUMENTS.filter(ins => ins.group === group)
                        return (
                          <div key={group} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{
                              fontSize: 12,
                              fontWeight: 800,
                              color: GROUP_COLORS[group],
                              letterSpacing: '0.5px',
                              textTransform: 'uppercase',
                              minWidth: 100,
                            }}>{group}</span>
                            {groupInstruments.map(ins => {
                              const on = activeInstruments.includes(ins.ticker)
                              const hasData = !!(stats[INSTR_KEY_MAP[ins.ticker]] as InstrumentData | null)
                              return (
                                <button
                                  key={ins.ticker}
                                  onClick={() => setActiveInstruments(prev =>
                                    on ? prev.filter(k => k !== ins.ticker) : [...prev, ins.ticker]
                                  )}
                                  disabled={!hasData}
                                  style={{
                                    padding: '6px 14px',
                                    background: on && hasData ? `${ins.color}22` : '#0a0a0a',
                                    border: `1px solid ${on && hasData ? ins.color : '#2a2a2a'}`,
                                    borderRadius: 6,
                                    color: hasData ? (on ? ins.color : '#ffffff') : '#333',
                                    fontSize: 13,
                                    fontWeight: 700,
                                    cursor: hasData ? 'pointer' : 'not-allowed',
                                    letterSpacing: '0.3px',
                                    opacity: hasData ? 1 : 0.3,
                                    fontFamily: '"Roboto Mono", monospace',
                                  }}
                                >
                                  {ins.label}
                                </button>
                              )
                            })}
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* ── Chart ──────────────────────────────────────────── */}
                  {chartData.length > 0 && (
                    <div style={{
                      background: '#000000',
                      border: '1px solid #111',
                      borderRadius: 10,
                      padding: '16px 8px 12px 0',
                      marginBottom: 20,
                    }}>
                      <div style={{ padding: '0 20px 14px', color: '#ffffff', fontSize: 12, letterSpacing: '1px', textTransform: 'uppercase', opacity: 0.5 }}>
                        {`INDEXED PERFORMANCE — BASE 100 AT ${activePeriod === 'pre30' ? '30D PRE-EVENT START' :
                            activePeriod === 'pre10' ? '10D PRE-EVENT START' :
                              activePeriod === 'during' ? 'EVENT START' :
                                activePeriod === 'post30' ? 'EVENT END (POST-PERIOD START)' : 'WINDOW START'
                          }`}
                      </div>
                      {(() => {
                        const activeLabels = ALL_INSTRUMENTS.filter(ins => activeInstruments.includes(ins.ticker)).map(ins => ins.label)
                        const allVals = chartData.flatMap(row => activeLabels.map(lbl => row[lbl]).filter((v): v is number => typeof v === 'number'))
                        const dataMin = allVals.length ? Math.min(...allVals) : 90
                        const dataMax = allVals.length ? Math.max(...allVals) : 110
                        const pad = Math.max((dataMax - dataMin) * 0.1, 1)
                        const yMin = dataMin - pad
                        const yMax = dataMax + pad
                        return (
                          <ResponsiveContainer width="100%" height={380}>
                            <AreaChart data={chartData} margin={{ top: 8, right: 20, left: 0, bottom: 4 }}>
                              <defs>
                                {ALL_INSTRUMENTS.filter(ins => activeInstruments.includes(ins.ticker)).map(ins => (
                                  <linearGradient key={ins.ticker} id={`grad-${ins.ticker}`} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={ins.color} stopOpacity={0.18} />
                                    <stop offset="95%" stopColor={ins.color} stopOpacity={0} />
                                  </linearGradient>
                                ))}
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" stroke="#111111" vertical={false} />
                              <XAxis
                                dataKey="date"
                                tick={{ fill: '#ffffff', fontSize: 16 }}
                                axisLine={{ stroke: '#ffffff' }}
                                tickLine={{ stroke: '#ffffff' }}
                                interval={Math.max(1, Math.floor(chartData.length / 8))}
                                tickFormatter={d => {
                                  if (!d) return ''
                                  const parts = d.split('-')
                                  return parts.length === 3 ? `${parts[1]}/${parts[2].slice(0, 2)}` : d
                                }}
                              />
                              <YAxis
                                tick={{ fill: '#ffffff', fontSize: 16 }}
                                axisLine={{ stroke: '#ffffff' }}
                                tickLine={{ stroke: '#ffffff' }}
                                tickFormatter={v => `${(v - 100).toFixed(0)}%`}
                                width={56}
                                domain={[yMin, yMax]}
                              />
                              <Tooltip content={<ChartTooltip />} />
                              <ReferenceLine y={100} stroke="#333333" strokeDasharray="4 4" strokeWidth={1} />
                              {activePeriod === 'full' && selectedEvent && (
                                <>
                                  <ReferenceLine x={selectedEvent.startDate} stroke="#ff333388" strokeDasharray="4 3" strokeWidth={1.5} label={{ value: 'EVENT START', fill: '#ff3333', fontSize: 8, position: 'insideTopRight' }} />
                                  <ReferenceLine x={selectedEvent.endDate} stroke="#00ff4188" strokeDasharray="4 3" strokeWidth={1.5} label={{ value: 'EVENT END', fill: '#00ff41', fontSize: 8, position: 'insideTopRight' }} />
                                </>
                              )}
                              {ALL_INSTRUMENTS
                                .filter(ins => activeInstruments.includes(ins.ticker))
                                .map(ins => {
                                  const d = stats[INSTR_KEY_MAP[ins.ticker]] as InstrumentData | null
                                  if (!d) return null
                                  return (
                                    <Area
                                      key={ins.ticker}
                                      type="monotone"
                                      dataKey={ins.label}
                                      stroke={ins.color}
                                      strokeWidth={2}
                                      fill={`url(#grad-${ins.ticker})`}
                                      dot={false}
                                      activeDot={{ r: 4, fill: ins.color, stroke: '#000', strokeWidth: 2 }}
                                    />
                                  )
                                })}
                            </AreaChart>
                          </ResponsiveContainer>
                        )
                      })()}
                    </div>
                  )}

                  {/* ── Grouped stats breakdown ─────────────────────────── */}
                  {INSTRUMENT_GROUPS.map(group => {
                    const groupInstruments = ALL_INSTRUMENTS.filter(ins => ins.group === group)
                    const groupData = groupInstruments
                      .map(ins => ({ ins, d: stats[INSTR_KEY_MAP[ins.ticker]] as InstrumentData | null }))
                      .filter(({ d }) => !!d)
                    if (!groupData.length) return null

                    return (
                      <div key={group} style={{ marginBottom: 16 }}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          marginBottom: 12,
                          paddingBottom: 8,
                          borderBottom: `1px solid ${GROUP_COLORS[group]}30`,
                        }}>
                          <div style={{
                            width: 11,
                            height: 11,
                            borderRadius: '50%',
                            background: GROUP_COLORS[group],
                          }} />
                          <span style={{
                            color: GROUP_COLORS[group],
                            fontSize: 15,
                            fontWeight: 800,
                            letterSpacing: '1px',
                            textTransform: 'uppercase',
                          }}>
                            {group}
                          </span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {groupData.map(({ ins, d }) => {
                            if (!d) return null
                            return (
                              <div key={ins.ticker} style={{
                                background: '#050505',
                                border: `1px solid ${ins.color}20`,
                                borderLeft: `4px solid ${ins.color}`,
                                borderRadius: 8,
                                padding: '14px 18px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 16,
                                flexWrap: 'wrap',
                              }}>
                                <div style={{ minWidth: 120 }}>
                                  <div style={{ color: ins.color, fontSize: 16, fontWeight: 800 }}>{ins.label}</div>
                                  <div style={{ color: '#ffffff', fontSize: 12, marginTop: 3, opacity: 0.35 }}>{ins.ticker === 'DXY' ? 'UUP' : ins.ticker === 'VIX' ? 'I:VIX' : ins.ticker}</div>
                                </div>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
                                  {(() => {
                                    const ps = (d[activePeriod] as PeriodStats | null) ?? d.during
                                    const tr = ps?.totalReturn ?? 0
                                    const md = ps?.maxDrawdown ?? 0
                                    const pg = ps?.peakGain ?? 0
                                    const rd = ps?.recoveryDays ?? null
                                    return (
                                      <>
                                        <StatCard label="Total Return" value={formatPct(tr)} color={tr >= 0 ? '#00ff41' : '#ff3333'} />
                                        <StatCard label="Max Drawdown" value={formatPct(md)} color="#ff3333" />
                                        <StatCard label="Peak Gain" value={formatPct(pg)} color="#00ff41" />
                                        <StatCard label="Recovery" value={rd !== null ? `${rd}d` : 'N/A'} color={rd === null ? '#555' : rd < 30 ? '#00ff41' : rd < 90 ? '#f97316' : '#ff3333'} />
                                      </>
                                    )
                                  })()}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </>
              )}

              {!stats.loading && !stats.error && leaderboard.length === 0 && (
                <div style={{ color: '#ffffff', fontSize: 16, padding: '40px 0', opacity: 0.5 }}>
                  No price data available for this event period.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
