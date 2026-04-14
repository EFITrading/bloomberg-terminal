'use client'

import {
  Area,
  AreaChart,
  CartesianGrid,
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
  type KeyMover,
  MARKET_EVENTS,
  type MarketEvent,
  SEVERITY_COLORS,
} from '../../data/marketEvents'
import SeasonaxLanding from '../seasonax/SeasonaxLanding'

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Types
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Instrument definitions grouped by asset class
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface InstrumentDef {
  ticker: string
  apiTicker: string // what we send to /api/historical-data
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

const INSTRUMENT_GROUPS: Array<
  'Equities' | 'Sectors' | 'Commodities' | 'Fixed Income' | 'FX & Vol'
> = ['Equities', 'Sectors', 'Commodities', 'Fixed Income', 'FX & Vol']

const GROUP_COLORS: Record<string, string> = {
  Equities: '#3b82f6',
  Sectors: '#f97316',
  Commodities: '#eab308',
  'Fixed Income': '#22c55e',
  'FX & Vol': '#ef4444',
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Types
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Fetch historical data from the existing /api/historical-data route
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Chart tooltip
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Stat card
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Main component
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function HistoricalEventsResearch() {
  const [activeTab, setActiveTab] = useState<'events' | 'screener'>('events')
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
  const [activeInstruments, setActiveInstruments] = useState<string[]>([
    'SPY',
    'QQQ',
    'GLD',
    'TLT',
    'USO',
  ])
  const [searchQuery, setSearchQuery] = useState('')
  const [activePeriod, setActivePeriod] = useState<PeriodKey>('during')
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

  // â”€â”€ Filtering â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ Load data when event is selected â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    const results = await Promise.allSettled(
      ALL_INSTRUMENTS.map((ins) => fetchBars(ins.apiTicker, event.startDate, event.endDate))
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

    setStats((s) => ({ ...s, ...update }))
  }, [])

  useEffect(() => {
    if (selectedEvent) {
      setActivePeriod('during')
      loadEventData(selectedEvent)
    }
  }, [selectedEvent, loadEventData])

  // â”€â”€ Build chart dataset â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const buildChartData = () => {
    const active = activeInstruments
      .map((k) => stats[INSTR_KEY_MAP[k]] as InstrumentData | null)
      .filter((d): d is InstrumentData => !!d && (d[activePeriod]?.bars?.length ?? 0) > 0)

    if (!active.length) return []
    const maxLen = Math.max(...active.map((d) => d[activePeriod]?.bars?.length ?? 0))
    return Array.from({ length: maxLen }, (_, i) => {
      const row: Record<string, number | string> = {
        date: active[0]?.[activePeriod]?.bars[i]?.date ?? '',
      }
      active.forEach((d) => {
        const idx = d[activePeriod]?.indexed ?? []
        row[d.label] = idx[i] ?? idx[idx.length - 1] ?? 100
      })
      return row
    })
  }

  // â”€â”€ Build impact leaderboard (all instruments sorted by totalReturn) â”€â”€â”€â”€â”€â”€â”€
  const buildLeaderboard = (): Array<InstrumentData & { group: string; periodReturn: number }> => {
    const results: Array<InstrumentData & { group: string; periodReturn: number }> = []
    ALL_INSTRUMENTS.forEach((ins) => {
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
    ? Math.max(...leaderboard.map((d) => Math.abs(d.periodReturn)), 1)
    : 1

  // â”€â”€ UI â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  return (
    <div
      style={{
        background: '#000000',
        fontFamily: '"Roboto Mono", "SF Mono", "Courier New", monospace',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <style>{`
        @keyframes her-spin { to { transform: rotate(360deg); } }
        .her-tab-btn { transition: all 0.15s ease; background: #000000 !important; }
        .her-tab-btn:hover { filter: brightness(1.2) !important; }
        .her-tab-btn.active { color: #FF6B00 !important; }
        .her-tab-btn.inactive { color: #FFFFFF !important; }
        .her-cat-btn:hover { opacity: 1 !important; }
        .her-event-row:hover { background: #0e0e0e !important; }
        .her-period-btn:hover { opacity: 1 !important; }
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
            label: 'RESEARCH HISTORICAL EVENTS',
            icon: (
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="square"
              >
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            ),
          },
          {
            id: 'screener' as const,
            label: 'SEASONALITY SCANNER',
            icon: (
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="square"
              >
                <rect x="3" y="3" width="18" height="3" rx="1" />
                <rect x="3" y="8" width="14" height="3" rx="1" />
                <rect x="3" y="13" width="10" height="3" rx="1" />
              </svg>
            ),
          },
        ].map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              className={`her-tab-btn ${isActive ? 'active' : 'inactive'}`}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1,
                padding: '26px 24px',
                background: '#000000',
                border: 'none',
                borderTop: isActive ? '2px solid #FF6B00' : '2px solid transparent',
                borderBottom: isActive ? '2px solid #FF6B00' : '2px solid #FFFFFF',
                borderRight: tab.id === 'events' ? '1px solid #1e1e1e' : 'none',
                color: isActive ? '#FF6B00' : '#FFFFFF',
                fontSize: 20,
                fontWeight: 800,
                letterSpacing: '1.5px',
                textTransform: 'uppercase',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                fontFamily: '"Roboto Mono", monospace',
                boxShadow: isActive
                  ? 'inset 0 2px 6px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.07), 0 -2px 8px rgba(255,107,0,0.08)'
                  : 'inset 0 3px 10px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.03)',
                transform: isActive ? 'translateY(0)' : 'translateY(2px)',
                transition: 'all 0.15s ease',
              }}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* TAB CONTENT */}
      {activeTab === 'screener' ? (
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', paddingTop: '60px' }}>
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
          {/* â”€â”€ SUB-HEADER: title + search â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
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
                      color: '#FFFFFF',
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
                      color: '#FFFFFF',
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

          {/* â”€â”€ CATEGORY FILTERS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
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

          {/* â”€â”€ MAIN BODY: event list + detail panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
            {/* â”€â”€ EVENT LIST â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            <div
              style={{
                width: 260,
                minWidth: 220,
                borderRight: '1px solid #111',
                overflowY: 'auto',
                background: '#030303',
              }}
            >
              {filteredEvents.length === 0 && (
                <div
                  style={{
                    padding: '32px 20px',
                    color: '#FFFFFF',
                    fontSize: 13,
                    textAlign: 'center',
                    opacity: 0.5,
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
                      borderBottom: '1px solid #0e0e0e',
                      cursor: 'pointer',
                      background: isSelected
                        ? `linear-gradient(90deg, ${catColor}18 0%, transparent 100%)`
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
                        marginBottom: 6,
                        gap: 6,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 10,
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
                          padding: '1px 7px',
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
                        color: '#FFFFFF',
                        fontSize: 13,
                        fontWeight: 700,
                        lineHeight: 1.35,
                        marginBottom: 6,
                      }}
                    >
                      {event.name}
                    </div>
                    <div
                      style={{
                        color: 'rgba(255,255,255,0.5)',
                        fontSize: 11,
                        display: 'flex',
                        gap: 5,
                      }}
                    >
                      <span>{formatDate(event.startDate)}</span>
                      <span>â†’</span>
                      <span>{formatDate(event.endDate)}</span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* â”€â”€ DETAIL PANEL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
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
                  {/* â”€â”€ EVENT HEADER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
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
                          <span style={{ color: '#2a2a2a' }}>â€¢</span>
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
                          <span style={{ color: '#2a2a2a' }}>â€¢</span>
                          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>
                            {eventDurationDays(selectedEvent).toLocaleString()} days
                          </span>
                        </div>
                        <div
                          style={{
                            color: '#FFFFFF',
                            fontSize: 22,
                            fontWeight: 800,
                            letterSpacing: '-0.5px',
                            marginBottom: 10,
                            lineHeight: 1.2,
                          }}
                        >
                          {selectedEvent.name}
                        </div>
                        <div
                          style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, lineHeight: 1.7 }}
                        >
                          {selectedEvent.description}
                        </div>
                      </div>
                      <div
                        style={{
                          background: '#0a0a0a',
                          border: '1px solid #1a1a1a',
                          padding: '10px 14px',
                          whiteSpace: 'nowrap',
                          textAlign: 'right',
                          flexShrink: 0,
                          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
                        }}
                      >
                        <div
                          style={{
                            color: 'rgba(255,255,255,0.4)',
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
                            color: '#FFFFFF',
                            fontSize: 14,
                            fontWeight: 800,
                            marginBottom: 10,
                          }}
                        >
                          {formatDate(selectedEvent.startDate)}
                        </div>
                        <div
                          style={{
                            color: 'rgba(255,255,255,0.4)',
                            fontSize: 10,
                            letterSpacing: '0.8px',
                            textTransform: 'uppercase',
                            marginBottom: 3,
                          }}
                        >
                          END DATE
                        </div>
                        <div style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 800 }}>
                          {formatDate(selectedEvent.endDate)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* â”€â”€ PERIOD SELECTOR â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
                  <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
                    {[
                      { key: 'pre30' as PeriodKey, label: 'âˆ’30D BEFORE', color: '#a855f7' },
                      { key: 'pre10' as PeriodKey, label: 'âˆ’10D BEFORE', color: '#f472b6' },
                      { key: 'during' as PeriodKey, label: 'DURING EVENT', color: '#ef4444' },
                      { key: 'post30' as PeriodKey, label: '+30D AFTER', color: '#22c55e' },
                      { key: 'full' as PeriodKey, label: 'FULL TIMELINE', color: '#3b82f6' },
                    ].map((p) => {
                      const isActive = activePeriod === p.key
                      return (
                        <button
                          key={p.key}
                          className="her-period-btn"
                          onClick={() => setActivePeriod(p.key)}
                          style={{
                            padding: '8px 14px',
                            background: isActive
                              ? `linear-gradient(135deg, ${p.color}20 0%, ${p.color}0a 100%)`
                              : '#080808',
                            border: `1px solid ${isActive ? p.color : '#1e1e1e'}`,
                            color: isActive ? p.color : 'rgba(255,255,255,0.6)',
                            fontSize: 11,
                            fontWeight: 800,
                            cursor: 'pointer',
                            letterSpacing: '0.8px',
                            textTransform: 'uppercase',
                            fontFamily: '"Roboto Mono", monospace',
                            whiteSpace: 'nowrap',
                            opacity: isActive ? 1 : 0.7,
                            boxShadow: isActive
                              ? `0 0 12px ${p.color}25, inset 0 1px 0 ${p.color}20`
                              : 'inset 0 1px 0 rgba(255,255,255,0.03)',
                            transition: 'all 0.15s',
                          }}
                        >
                          {p.label}
                        </button>
                      )
                    })}
                  </div>

                  {/* â”€â”€ LOADING â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
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

                  {!stats.loading &&
                    !stats.error &&
                    (leaderboard.length > 0 || chartData.length > 0) && (
                      <>
                        {/* â”€â”€ PERFORMANCE MATRIX TABLE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
                        <div
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
                                      color: 'rgba(255,255,255,0.4)',
                                      fontSize: 10,
                                      fontWeight: 700,
                                      letterSpacing: '0.8px',
                                      padding: '10px 18px',
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
                                        pre30: 'âˆ’30D Before',
                                        pre10: 'âˆ’10D Before',
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
                                            color: isA ? colors[pk] : 'rgba(255,255,255,0.35)',
                                            fontSize: 10,
                                            fontWeight: 800,
                                            letterSpacing: '0.7px',
                                            padding: '10px 14px',
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
                                            padding: '10px 18px 5px',
                                            color: GROUP_COLORS[group],
                                            fontSize: 10,
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
                                              style={{ padding: '9px 18px', whiteSpace: 'nowrap' }}
                                            >
                                              <span
                                                style={{
                                                  color: ins.color,
                                                  fontSize: 13,
                                                  fontWeight: 700,
                                                }}
                                              >
                                                {ins.label}
                                              </span>
                                              <span
                                                style={{
                                                  color: 'rgba(255,255,255,0.3)',
                                                  fontSize: 10,
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
                                                    padding: '9px 14px',
                                                    background: isA
                                                      ? 'rgba(59,130,246,0.05)'
                                                      : 'transparent',
                                                  }}
                                                >
                                                  {ret !== undefined && ret !== null ? (
                                                    <span
                                                      style={{
                                                        display: 'inline-block',
                                                        padding: '3px 10px',
                                                        fontSize: 13,
                                                        fontWeight: 800,
                                                        color: ret >= 0 ? '#00e676' : '#ff1744',
                                                        background:
                                                          ret >= 0 ? '#00e67610' : '#ff174410',
                                                        letterSpacing: '-0.2px',
                                                        minWidth: 72,
                                                        textAlign: 'center',
                                                      }}
                                                    >
                                                      {formatPct(ret)}
                                                    </span>
                                                  ) : (
                                                    <span
                                                      style={{
                                                        color: 'rgba(255,255,255,0.15)',
                                                        fontSize: 13,
                                                      }}
                                                    >
                                                      â€”
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
                        </div>

                        {/* â”€â”€ IMPACT LEADERBOARD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
                        <div
                          style={{
                            background: 'linear-gradient(180deg, #080808 0%, #050505 100%)',
                            border: '1px solid #141414',
                            marginBottom: 14,
                            overflow: 'hidden',
                            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
                          }}
                        >
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
                                  background: '#f97316',
                                  boxShadow: '0 0 6px #f9731640',
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
                                Impact Leaderboard
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
                              All instruments â€” ranked by return
                            </span>
                          </div>
                          <div
                            style={{
                              padding: '12px 16px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 5,
                            }}
                          >
                            {leaderboard.map((d) => {
                              const pct = d.periodReturn
                              const isPos = pct >= 0
                              const barW = (Math.abs(pct) / leaderboardMax) * 100
                              const ins = ALL_INSTRUMENTS.find((i) => i.ticker === d.ticker)
                              return (
                                <div
                                  key={d.ticker}
                                  style={{ display: 'flex', alignItems: 'center', gap: 10 }}
                                >
                                  <div
                                    style={{
                                      fontSize: 9,
                                      fontWeight: 800,
                                      color: GROUP_COLORS[d.group],
                                      letterSpacing: '0.4px',
                                      width: 70,
                                      textAlign: 'right',
                                      textTransform: 'uppercase',
                                      flexShrink: 0,
                                    }}
                                  >
                                    {d.group}
                                  </div>
                                  <div
                                    style={{
                                      width: 100,
                                      color: ins?.color ?? '#FFFFFF',
                                      fontSize: 12,
                                      fontWeight: 700,
                                      flexShrink: 0,
                                    }}
                                  >
                                    {d.label}
                                  </div>
                                  <div
                                    style={{
                                      flex: 1,
                                      height: 22,
                                      background: '#0a0a0a',
                                      overflow: 'hidden',
                                      position: 'relative',
                                      border: '1px solid #111',
                                    }}
                                  >
                                    <div
                                      style={{
                                        position: 'absolute',
                                        top: 0,
                                        [isPos ? 'left' : 'right']: '50%',
                                        width: `${barW / 2}%`,
                                        height: '100%',
                                        background: isPos
                                          ? 'linear-gradient(90deg, #00e676 0%, #00b85e 100%)'
                                          : 'linear-gradient(90deg, #ff1744 0%, #cc0033 100%)',
                                        opacity: 0.9,
                                        transition: 'width 0.4s ease',
                                      }}
                                    />
                                    <div
                                      style={{
                                        position: 'absolute',
                                        top: 0,
                                        bottom: 0,
                                        left: '50%',
                                        width: 1,
                                        background: '#1a1a1a',
                                      }}
                                    />
                                  </div>
                                  <div
                                    style={{
                                      width: 68,
                                      textAlign: 'right',
                                      color: isPos ? '#00e676' : '#ff1744',
                                      fontSize: 13,
                                      fontWeight: 800,
                                      letterSpacing: '-0.3px',
                                      flexShrink: 0,
                                    }}
                                  >
                                    {formatPct(pct)}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>

                        {/* â”€â”€ KEY MOVERS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
                        {selectedEvent?.keyMovers && selectedEvent.keyMovers.length > 0 && (
                          <div
                            style={{
                              background: 'linear-gradient(180deg, #080808 0%, #050505 100%)',
                              border: '1px solid #141414',
                              marginBottom: 14,
                              overflow: 'hidden',
                              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
                            }}
                          >
                            <div
                              style={{
                                padding: '12px 18px 10px',
                                borderBottom: '1px solid #111',
                                background: 'linear-gradient(180deg, #0d0d0d 0%, #080808 100%)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                              }}
                            >
                              <div
                                style={{
                                  width: 3,
                                  height: 14,
                                  background: '#eab308',
                                  boxShadow: '0 0 6px #eab30840',
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
                                What Moved & Why
                              </span>
                            </div>
                            <div
                              style={{
                                padding: '12px 16px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 8,
                              }}
                            >
                              {selectedEvent.keyMovers.map((mover: KeyMover, i: number) => {
                                const dirColor =
                                  mover.direction === 'up'
                                    ? '#00e676'
                                    : mover.direction === 'down'
                                      ? '#ff1744'
                                      : '#eab308'
                                const dirArrow =
                                  mover.direction === 'up'
                                    ? 'â–²'
                                    : mover.direction === 'down'
                                      ? 'â–¼'
                                      : 'â—†'
                                const magColors: Record<string, string> = {
                                  '1-5%': '#FFFFFF',
                                  '5-15%': '#eab308',
                                  '15-30%': '#f97316',
                                  '30%+': '#ef4444',
                                }
                                return (
                                  <div
                                    key={i}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'flex-start',
                                      gap: 14,
                                      padding: '12px 14px',
                                      background: '#060606',
                                      border: `1px solid ${dirColor}18`,
                                      borderLeft: `3px solid ${dirColor}`,
                                    }}
                                  >
                                    <div
                                      style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        gap: 3,
                                        minWidth: 40,
                                      }}
                                    >
                                      <span
                                        style={{ color: dirColor, fontSize: 18, lineHeight: 1 }}
                                      >
                                        {dirArrow}
                                      </span>
                                      <span
                                        style={{
                                          fontSize: 9,
                                          fontWeight: 800,
                                          color: magColors[mover.magnitude],
                                          letterSpacing: '0.3px',
                                        }}
                                      >
                                        {mover.magnitude}
                                      </span>
                                    </div>
                                    <div style={{ flex: 1 }}>
                                      <div
                                        style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: 8,
                                          marginBottom: 4,
                                        }}
                                      >
                                        <span
                                          style={{
                                            color: '#FFFFFF',
                                            fontSize: 14,
                                            fontWeight: 700,
                                          }}
                                        >
                                          {mover.asset}
                                        </span>
                                        {mover.ticker && (
                                          <span
                                            style={{
                                              fontSize: 10,
                                              fontWeight: 700,
                                              color: 'rgba(255,255,255,0.5)',
                                              background: '#111',
                                              border: '1px solid #1e1e1e',
                                              padding: '1px 7px',
                                            }}
                                          >
                                            {mover.ticker}
                                          </span>
                                        )}
                                      </div>
                                      <div
                                        style={{
                                          color: 'rgba(255,255,255,0.7)',
                                          fontSize: 12,
                                          lineHeight: 1.65,
                                        }}
                                      >
                                        {mover.note}
                                      </div>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}

                        {/* â”€â”€ CHART INSTRUMENT TOGGLES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
                        <div
                          style={{
                            background: 'linear-gradient(180deg, #080808 0%, #050505 100%)',
                            border: '1px solid #141414',
                            marginBottom: 14,
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              padding: '12px 18px 10px',
                              borderBottom: '1px solid #111',
                              background: 'linear-gradient(180deg, #0d0d0d 0%, #080808 100%)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                            }}
                          >
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
                              Chart Instruments
                            </span>
                          </div>
                          <div
                            style={{
                              padding: '12px 16px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 10,
                            }}
                          >
                            {INSTRUMENT_GROUPS.map((group) => {
                              const groupInstruments = ALL_INSTRUMENTS.filter(
                                (ins) => ins.group === group
                              )
                              return (
                                <div
                                  key={group}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    flexWrap: 'wrap',
                                  }}
                                >
                                  <span
                                    style={{
                                      fontSize: 10,
                                      fontWeight: 800,
                                      color: GROUP_COLORS[group],
                                      letterSpacing: '0.5px',
                                      textTransform: 'uppercase',
                                      minWidth: 90,
                                    }}
                                  >
                                    {group}
                                  </span>
                                  {groupInstruments.map((ins) => {
                                    const on = activeInstruments.includes(ins.ticker)
                                    const hasData = !!(stats[
                                      INSTR_KEY_MAP[ins.ticker]
                                    ] as InstrumentData | null)
                                    return (
                                      <button
                                        key={ins.ticker}
                                        className="her-instr-btn"
                                        onClick={() =>
                                          setActiveInstruments((prev) =>
                                            on
                                              ? prev.filter((k) => k !== ins.ticker)
                                              : [...prev, ins.ticker]
                                          )
                                        }
                                        disabled={!hasData}
                                        style={{
                                          padding: '5px 11px',
                                          background: on && hasData ? `${ins.color}18` : '#0a0a0a',
                                          border: `1px solid ${on && hasData ? ins.color : '#1e1e1e'}`,
                                          color: hasData
                                            ? on
                                              ? ins.color
                                              : 'rgba(255,255,255,0.5)'
                                            : '#222',
                                          fontSize: 11,
                                          fontWeight: 700,
                                          cursor: hasData ? 'pointer' : 'not-allowed',
                                          letterSpacing: '0.3px',
                                          opacity: hasData ? 1 : 0.3,
                                          fontFamily: '"Roboto Mono", monospace',
                                          transition: 'all 0.12s',
                                          boxShadow:
                                            on && hasData ? `0 0 8px ${ins.color}20` : 'none',
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

                        {/* â”€â”€ INDEXED PERFORMANCE CHART â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
                        {chartData.length > 0 && (
                          <div
                            style={{
                              background: 'linear-gradient(180deg, #080808 0%, #030303 100%)',
                              border: '1px solid #141414',
                              marginBottom: 14,
                              overflow: 'hidden',
                              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
                            }}
                          >
                            <div
                              style={{
                                padding: '12px 18px 10px',
                                borderBottom: '1px solid #111',
                                background: 'linear-gradient(180deg, #0d0d0d 0%, #080808 100%)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                              }}
                            >
                              <div
                                style={{
                                  width: 3,
                                  height: 14,
                                  background: '#a855f7',
                                  boxShadow: '0 0 6px #a855f740',
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
                                Indexed Performance â€” Base 100
                              </span>
                              <span
                                style={{
                                  color: 'rgba(255,255,255,0.3)',
                                  fontSize: 10,
                                  marginLeft: 'auto',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.5px',
                                }}
                              >
                                {activePeriod === 'pre30'
                                  ? '30D Pre-Event Start'
                                  : activePeriod === 'pre10'
                                    ? '10D Pre-Event Start'
                                    : activePeriod === 'during'
                                      ? 'Event Start'
                                      : activePeriod === 'post30'
                                        ? 'Event End'
                                        : 'Window Start'}
                              </span>
                            </div>
                            <div style={{ padding: '12px 0 8px' }}>
                              {(() => {
                                const activeLabels = ALL_INSTRUMENTS.filter((ins) =>
                                  activeInstruments.includes(ins.ticker)
                                ).map((ins) => ins.label)
                                const allVals = chartData.flatMap((row) =>
                                  activeLabels
                                    .map((lbl) => row[lbl])
                                    .filter((v): v is number => typeof v === 'number')
                                )
                                const dataMin = allVals.length ? Math.min(...allVals) : 90
                                const dataMax = allVals.length ? Math.max(...allVals) : 110
                                const pad = Math.max((dataMax - dataMin) * 0.1, 1)
                                return (
                                  <ResponsiveContainer width="100%" height={320}>
                                    <AreaChart
                                      data={chartData}
                                      margin={{ top: 8, right: 16, left: 0, bottom: 4 }}
                                    >
                                      <defs>
                                        {ALL_INSTRUMENTS.filter((ins) =>
                                          activeInstruments.includes(ins.ticker)
                                        ).map((ins) => (
                                          <linearGradient
                                            key={ins.ticker}
                                            id={`g-${ins.ticker}`}
                                            x1="0"
                                            y1="0"
                                            x2="0"
                                            y2="1"
                                          >
                                            <stop
                                              offset="5%"
                                              stopColor={ins.color}
                                              stopOpacity={0.2}
                                            />
                                            <stop
                                              offset="95%"
                                              stopColor={ins.color}
                                              stopOpacity={0}
                                            />
                                          </linearGradient>
                                        ))}
                                      </defs>
                                      <CartesianGrid
                                        strokeDasharray="2 4"
                                        stroke="#0e0e0e"
                                        vertical={false}
                                      />
                                      <XAxis
                                        dataKey="date"
                                        tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }}
                                        axisLine={{ stroke: '#1a1a1a' }}
                                        tickLine={false}
                                        interval={Math.max(1, Math.floor(chartData.length / 7))}
                                        tickFormatter={(d) => {
                                          if (!d) return ''
                                          const p = d.split('-')
                                          return p.length === 3 ? `${p[1]}/${p[2].slice(0, 2)}` : d
                                        }}
                                      />
                                      <YAxis
                                        tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }}
                                        axisLine={{ stroke: '#1a1a1a' }}
                                        tickLine={false}
                                        tickFormatter={(v) => `${(v - 100).toFixed(0)}%`}
                                        width={50}
                                        domain={[dataMin - pad, dataMax + pad]}
                                      />
                                      <Tooltip content={<ChartTooltip />} />
                                      <ReferenceLine
                                        y={100}
                                        stroke="#1e1e1e"
                                        strokeDasharray="3 4"
                                        strokeWidth={1}
                                      />
                                      {activePeriod === 'full' && selectedEvent && (
                                        <>
                                          <ReferenceLine
                                            x={selectedEvent.startDate}
                                            stroke="#ff174460"
                                            strokeDasharray="3 3"
                                            strokeWidth={1.5}
                                          />
                                          <ReferenceLine
                                            x={selectedEvent.endDate}
                                            stroke="#00e67660"
                                            strokeDasharray="3 3"
                                            strokeWidth={1.5}
                                          />
                                        </>
                                      )}
                                      {ALL_INSTRUMENTS.filter((ins) =>
                                        activeInstruments.includes(ins.ticker)
                                      ).map((ins) => {
                                        const d = stats[
                                          INSTR_KEY_MAP[ins.ticker]
                                        ] as InstrumentData | null
                                        if (!d) return null
                                        return (
                                          <Area
                                            key={ins.ticker}
                                            type="monotone"
                                            dataKey={ins.label}
                                            stroke={ins.color}
                                            strokeWidth={1.5}
                                            fill={`url(#g-${ins.ticker})`}
                                            dot={false}
                                            activeDot={{
                                              r: 3,
                                              fill: ins.color,
                                              stroke: '#000',
                                              strokeWidth: 2,
                                            }}
                                          />
                                        )
                                      })}
                                    </AreaChart>
                                  </ResponsiveContainer>
                                )
                              })()}
                            </div>
                          </div>
                        )}

                        {/* â”€â”€ GROUPED STATS BREAKDOWN â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
                        {INSTRUMENT_GROUPS.map((group) => {
                          const groupData = ALL_INSTRUMENTS.filter((ins) => ins.group === group)
                            .map((ins) => ({
                              ins,
                              d: stats[INSTR_KEY_MAP[ins.ticker]] as InstrumentData | null,
                            }))
                            .filter(({ d }) => !!d)
                          if (!groupData.length) return null
                          return (
                            <div key={group} style={{ marginBottom: 14 }}>
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 8,
                                  marginBottom: 8,
                                  padding: '8px 18px',
                                  background: `${GROUP_COLORS[group]}08`,
                                  borderLeft: `3px solid ${GROUP_COLORS[group]}`,
                                  border: `1px solid ${GROUP_COLORS[group]}15`,
                                }}
                              >
                                <span
                                  style={{
                                    color: GROUP_COLORS[group],
                                    fontSize: 11,
                                    fontWeight: 800,
                                    letterSpacing: '1px',
                                    textTransform: 'uppercase',
                                  }}
                                >
                                  {group}
                                </span>
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                {groupData.map(({ ins, d }) => {
                                  if (!d) return null
                                  const ps = (d[activePeriod] as PeriodStats | null) ?? d.during
                                  const tr = ps?.totalReturn ?? 0
                                  const md = ps?.maxDrawdown ?? 0
                                  const pg = ps?.peakGain ?? 0
                                  const rd = ps?.recoveryDays ?? null
                                  return (
                                    <div
                                      key={ins.ticker}
                                      style={{
                                        background: '#060606',
                                        border: `1px solid ${ins.color}15`,
                                        borderLeft: `3px solid ${ins.color}`,
                                        padding: '12px 16px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 14,
                                        flexWrap: 'wrap',
                                      }}
                                    >
                                      <div style={{ minWidth: 110 }}>
                                        <div
                                          style={{
                                            color: ins.color,
                                            fontSize: 14,
                                            fontWeight: 800,
                                          }}
                                        >
                                          {ins.label}
                                        </div>
                                        <div
                                          style={{
                                            color: 'rgba(255,255,255,0.35)',
                                            fontSize: 10,
                                            marginTop: 2,
                                          }}
                                        >
                                          {ins.ticker === 'DXY'
                                            ? 'UUP'
                                            : ins.ticker === 'VIX'
                                              ? 'I:VIX'
                                              : ins.ticker}
                                        </div>
                                      </div>
                                      <div
                                        style={{
                                          display: 'flex',
                                          gap: 6,
                                          flex: 1,
                                          flexWrap: 'wrap',
                                        }}
                                      >
                                        {[
                                          {
                                            label: 'Total Return',
                                            value: formatPct(tr),
                                            color: tr >= 0 ? '#00e676' : '#ff1744',
                                          },
                                          {
                                            label: 'Max Drawdown',
                                            value: formatPct(md),
                                            color: '#ff1744',
                                          },
                                          {
                                            label: 'Peak Gain',
                                            value: formatPct(pg),
                                            color: '#00e676',
                                          },
                                          {
                                            label: 'Recovery',
                                            value: rd !== null ? `${rd}d` : 'N/A',
                                            color:
                                              rd === null
                                                ? '#333'
                                                : rd < 30
                                                  ? '#00e676'
                                                  : rd < 90
                                                    ? '#f97316'
                                                    : '#ff1744',
                                          },
                                        ].map((sc) => (
                                          <div
                                            key={sc.label}
                                            style={{
                                              background: '#0a0a0a',
                                              border: '1px solid #141414',
                                              padding: '8px 14px',
                                              minWidth: 100,
                                              flex: '1 1 100px',
                                              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
                                            }}
                                          >
                                            <div
                                              style={{
                                                color: 'rgba(255,255,255,0.4)',
                                                fontSize: 9,
                                                fontWeight: 700,
                                                letterSpacing: '0.8px',
                                                textTransform: 'uppercase',
                                                marginBottom: 4,
                                              }}
                                            >
                                              {sc.label}
                                            </div>
                                            <div
                                              style={{
                                                color: sc.color,
                                                fontSize: 18,
                                                fontWeight: 800,
                                                letterSpacing: '-0.5px',
                                              }}
                                            >
                                              {sc.value}
                                            </div>
                                          </div>
                                        ))}
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
                    <div
                      style={{
                        color: 'rgba(255,255,255,0.4)',
                        fontSize: 14,
                        padding: '48px 0',
                        textAlign: 'center',
                      }}
                    >
                      No price data available for this event period.
                    </div>
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
