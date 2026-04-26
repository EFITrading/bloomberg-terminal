'use client'

import {
  TbActivity,
  TbAlertTriangle,
  TbArrowUpRight,
  TbBolt,
  TbBroadcast,
  TbCalendar,
  TbChartBar,
  TbChevronDown,
  TbChevronLeft,
  TbChevronRight,
  TbChevronUp,
  TbClock,
  TbExternalLink,
  TbFlame,
  TbNews,
  TbRadar,
  TbRefresh,
  TbSearch,
  TbShieldCheck,
  TbStar,
  TbStarFilled,
  TbTarget,
  TbTrendingDown,
  TbTrendingUp,
  TbX,
} from 'react-icons/tb'

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface NewsArticle {
  id: string
  title: string
  description: string
  publisher: {
    name: string
    homepage_url: string
    logo_url?: string
    favicon_url?: string
  }
  published_utc: string
  article_url: string
  tickers: string[]
  image_url?: string
  author?: string
  sentiment: 'positive' | 'negative' | 'neutral'
  sentiment_score: number
  relevance_score: number
  time_ago: string
  category: string
  urgency: number
}

interface NewsResponse {
  success: boolean
  articles: NewsArticle[]
  count: number
  error?: string
  metadata: {
    ticker: string
    limit: number
    total_available: number
    filters_applied: {
      date_range: string
      sort_by: string
      category: string
    }
  }
}

interface MarketSentiment {
  overall_sentiment: 'bullish' | 'bearish' | 'neutral'
  sentiment_score: number
  confidence_level: number
  market_moving_events: MarketEvent[]
  sector_sentiment: { [sector: string]: SectorSentiment }
  trending_topics: TrendingTopic[]
}

interface MarketEvent {
  type: 'earnings' | 'merger' | 'regulatory' | 'analyst_upgrade' | 'analyst_downgrade'
  ticker: string
  title: string
  sentiment_impact: number
  urgency: number
  published_time: string
  estimated_price_impact: number
}

interface SectorSentiment {
  sector: string
  sentiment_score: number
  article_count: number
  key_drivers: string[]
}

interface TrendingTopic {
  keyword: string
  mentions: number
  sentiment_score: number
  related_tickers: string[]
}

interface NewsTabProps {
  symbol?: string
  onClose?: () => void
  onTabChange?: (tab: 'breaking' | 'feed' | 'movers' | 'calendar') => void
}

// ─── Economic Calendar Data ───────────────────────────────────────────────────

interface CalendarEvent {
  date: string
  dayNum: number
  month: number // 0-indexed (3 = April)
  year: number
  time: string
  event: string
  importance: 'critical' | 'high' | 'medium' | 'low'
  country: string
  forecast?: string
  prior?: string
  actual?: string
  beat?: boolean | null
  type: 'economic' | 'earnings' | 'fed' | 'central-bank' | 'holiday'
}

// ─── Company Logo Map ─────────────────────────────────────────────────────────

// ─── Company Logo (Polygon branding API — same as MarketHeatmap) ──────────────

const _logoCache: Record<string, string | null> = {}
const _logoCallbacks: Record<string, Array<(url: string | null) => void>> = {}
let _logoActiveCount = 0
const LOGO_MAX_CONCURRENT = 3

function _processLogoQueue(apiKey: string) {
  const pending = Object.keys(_logoCallbacks).filter((t) => _logoCache[t] === undefined)
  while (_logoActiveCount < LOGO_MAX_CONCURRENT && pending.length > 0) {
    const ticker = pending.shift()!
    if (_logoCache[ticker] !== undefined) {
      // already resolved while waiting
      const cbs = _logoCallbacks[ticker] ?? []
      delete _logoCallbacks[ticker]
      cbs.forEach((cb) => cb(_logoCache[ticker]))
      continue
    }
    _logoActiveCount++
    fetch(`https://api.polygon.io/v3/reference/tickers/${ticker}?apiKey=${apiKey}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const url = data?.results?.branding?.icon_url || data?.results?.branding?.logo_url || null
        _logoCache[ticker] = url
        const cbs = _logoCallbacks[ticker] ?? []
        delete _logoCallbacks[ticker]
        cbs.forEach((cb) => cb(url))
      })
      .catch(() => {
        _logoCache[ticker] = null
        const cbs = _logoCallbacks[ticker] ?? []
        delete _logoCallbacks[ticker]
        cbs.forEach((cb) => cb(null))
      })
      .finally(() => {
        _logoActiveCount--
        _processLogoQueue(apiKey)
      })
  }
}

// ── Black-Scholes helpers (same as EFICharting) ──────────────────────────────
const _erf = (x: number): number => {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911
  const sign = x >= 0 ? 1 : -1
  x = Math.abs(x)
  const t = 1.0 / (1.0 + p * x)
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x)
  return sign * y
}
const _normalCDF = (x: number): number => 0.5 * (1 + _erf(x / Math.sqrt(2)))
const _d2 = (S: number, K: number, r: number, sigma: number, T: number): number => {
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T))
  return d1 - sigma * Math.sqrt(T)
}
const _copCall = (S: number, K: number, r: number, sigma: number, T: number): number =>
  (1 - _normalCDF(_d2(S, K, r, sigma, T))) * 100
const _copPut = (S: number, K: number, r: number, sigma: number, T: number): number =>
  _normalCDF(_d2(S, K, r, sigma, T)) * 100
const _findStrike = (S: number, r: number, sigma: number, T: number, target: number, isCall: boolean): number => {
  if (isCall) {
    let lo = S + 0.01, hi = S * 1.5
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2
      const p = _copCall(S, mid, r, sigma, T)
      if (Math.abs(p - target) < 0.1) return mid
      if (p < target) lo = mid; else hi = mid
    }
    return (lo + hi) / 2
  } else {
    let lo = S * 0.5, hi = S - 0.01
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2
      const p = _copPut(S, mid, r, sigma, T)
      if (Math.abs(p - target) < 0.1) return mid
      if (p < target) hi = mid; else lo = mid
    }
    return (lo + hi) / 2
  }
}
// ─────────────────────────────────────────────────────────────────────────────

const CompanyLogo: React.FC<{ ticker: string; size?: number; className?: string; fluid?: boolean }> = ({
  ticker,
  size = 28,
  className = '',
  fluid = false,
}) => {
  const [logoUrl, setLogoUrl] = React.useState<string | null>(
    _logoCache[ticker] !== undefined ? _logoCache[ticker] : null
  )
  const POLYGON_KEY = process.env.NEXT_PUBLIC_POLYGON_API_KEY || ''

  React.useEffect(() => {
    if (!ticker || !POLYGON_KEY) return
    if (_logoCache[ticker] !== undefined) {
      setLogoUrl(_logoCache[ticker])
      return
    }
    // Enqueue this ticker
    if (!_logoCallbacks[ticker]) {
      _logoCallbacks[ticker] = []
    }
    _logoCallbacks[ticker].push((url) => setLogoUrl(url))
    _processLogoQueue(POLYGON_KEY)
  }, [ticker, POLYGON_KEY])

  const fluidStyle: React.CSSProperties = fluid
    ? { width: '100%', height: '100%', aspectRatio: '1 / 1' }
    : { width: size, height: size }

  if (!logoUrl) {
    const palette = [
      '#f97316',
      '#3b82f6',
      '#10b981',
      '#f59e0b',
      '#8b5cf6',
      '#06b6d4',
      '#ef4444',
      '#84cc16',
      '#ec4899',
      '#14b8a6',
    ]
    const color =
      palette[Array.from(ticker).reduce((a, c) => a + c.charCodeAt(0), 0) % palette.length]
    return (
      <span
        className={`inline-flex items-center justify-center rounded font-black text-white leading-none shrink-0 ${className}`}
        style={{
          ...fluidStyle,
          background: color,
          fontSize: fluid ? '0.7em' : Math.max(7, Math.floor(size * 0.34)),
        }}
      >
        {ticker.slice(0, 4)}
      </span>
    )
  }
  return (
    <img
      src={`${logoUrl}?apiKey=${POLYGON_KEY}`}
      alt={ticker}
      {...(!fluid && { width: size, height: size })}
      className={`rounded object-contain shrink-0 ${className}`}
      style={{ ...fluidStyle, background: 'rgba(255,255,255,0.06)', padding: '2px' }}
      onError={() => {
        _logoCache[ticker] = null
        setLogoUrl(null)
      }}
    />
  )
}

const STATIC_CAL_EVENTS: CalendarEvent[] = [
  // ── US Market Holidays ──────────────────────────────────────────────────────
  {
    date: 'Jan 1',
    dayNum: 1,
    month: 0,
    year: 2026,
    time: 'All Day',
    event: "New Year's Day — Market Closed",
    importance: 'critical',
    country: 'US',
    type: 'holiday',
  },
  {
    date: 'Jan 19',
    dayNum: 19,
    month: 0,
    year: 2026,
    time: 'All Day',
    event: 'MLK Day — Market Closed',
    importance: 'critical',
    country: 'US',
    type: 'holiday',
  },
  {
    date: 'Feb 16',
    dayNum: 16,
    month: 1,
    year: 2026,
    time: 'All Day',
    event: "Presidents' Day — Market Closed",
    importance: 'critical',
    country: 'US',
    type: 'holiday',
  },
  {
    date: 'Apr 3',
    dayNum: 3,
    month: 3,
    year: 2026,
    time: 'All Day',
    event: 'Good Friday — Market Closed',
    importance: 'critical',
    country: 'US',
    type: 'holiday',
  },
  {
    date: 'May 25',
    dayNum: 25,
    month: 4,
    year: 2026,
    time: 'All Day',
    event: 'Memorial Day — Market Closed',
    importance: 'critical',
    country: 'US',
    type: 'holiday',
  },
  {
    date: 'Jun 19',
    dayNum: 19,
    month: 5,
    year: 2026,
    time: 'All Day',
    event: 'Juneteenth — Market Closed',
    importance: 'critical',
    country: 'US',
    type: 'holiday',
  },
  {
    date: 'Jul 4',
    dayNum: 4,
    month: 6,
    year: 2026,
    time: 'All Day',
    event: 'Independence Day — Market Closed',
    importance: 'critical',
    country: 'US',
    type: 'holiday',
  },
  {
    date: 'Sep 7',
    dayNum: 7,
    month: 8,
    year: 2026,
    time: 'All Day',
    event: 'Labor Day — Market Closed',
    importance: 'critical',
    country: 'US',
    type: 'holiday',
  },
  {
    date: 'Nov 26',
    dayNum: 26,
    month: 10,
    year: 2026,
    time: 'All Day',
    event: 'Thanksgiving — Market Closed',
    importance: 'critical',
    country: 'US',
    type: 'holiday',
  },
  {
    date: 'Dec 25',
    dayNum: 25,
    month: 11,
    year: 2026,
    time: 'All Day',
    event: 'Christmas — Market Closed',
    importance: 'critical',
    country: 'US',
    type: 'holiday',
  },
]

// ─── Calendar Helpers ────────────────────────────────────────────────────────

function getMonthStartDay(year: number, month: number): number {
  return new Date(year, month, 1).getDay()
}
function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]
const MONTH_SHORT = [
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function importanceBar(importance: CalendarEvent['importance']) {
  const counts = { critical: 4, high: 3, medium: 2, low: 1 }
  const colors = {
    critical: 'bg-red-500',
    high: 'bg-orange-400',
    medium: 'bg-amber-400',
    low: 'bg-white/30',
  }
  const n = counts[importance]
  return (
    <div className="flex items-end gap-[3px] shrink-0" title={importance}>
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className={`w-[5px] rounded-sm ${i <= n ? colors[importance] : 'bg-white/10'}`}
          style={{ height: `${8 + i * 5}px` }}
        />
      ))}
    </div>
  )
}

function importanceLabelColor(importance: CalendarEvent['importance']) {
  return {
    critical: 'text-red-300 border-red-500/60 bg-red-500/15',
    high: 'text-orange-300 border-orange-500/50 bg-orange-500/10',
    medium: 'text-amber-300 border-amber-500/40 bg-amber-500/10',
    low: 'text-white/50 border-white/20 bg-white/5',
  }[importance]
}

function typeIcon(type: CalendarEvent['type']) {
  if (type === 'fed') return <TbTarget className="w-6 h-6 text-cyan-400    shrink-0" />
  if (type === 'earnings') return <TbChartBar className="w-6 h-6 text-purple-400  shrink-0" />
  if (type === 'holiday') return <TbStar className="w-6 h-6 text-yellow-400  shrink-0" />
  return <TbActivity className="w-6 h-6 text-white/60 shrink-0" />
}

// ─── Main Component ───────────────────────────────────────────────────────────

const NewsPanelV2: React.FC<NewsTabProps> = ({ symbol = '', onClose, onTabChange }) => {
  const [articles, setArticles] = useState<NewsArticle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTicker, setSearchTicker] = useState(symbol)
  const [expandedArticles, setExpandedArticles] = useState<Set<string>>(new Set())
  const [favorites, setFavorites] = useState<Set<string>>(new Set())
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [marketSentiment, setMarketSentiment] = useState<MarketSentiment | null>(null)
  const [activeTab, setActiveTab] = useState<'breaking' | 'feed' | 'movers' | 'calendar'>(
    'breaking'
  )
  const [calView, setCalView] = useState<'events' | 'earnings'>('earnings')
  const [calImportanceFilter, setCalImportanceFilter] = useState<Set<string>>(
    new Set(['critical', 'high'])
  )
  const [calMonth, setCalMonth] = useState<{ year: number; month: number }>(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  const [calViewMode, setCalViewMode] = useState<'monthly' | 'weekly'>('monthly')
  const [showFilterDropdown, setShowFilterDropdown] = useState(false)
  const [liveCalEvents, setLiveCalEvents] = useState<CalendarEvent[]>(STATIC_CAL_EVENTS)
  const [calEventsLoading, setCalEventsLoading] = useState(false)
  const [calWeekOf, setCalWeekOf] = useState<Date>(() => {
    const d = new Date()
    // Convert to PST to decide week
    const pstStr = d.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })
    const pst = new Date(pstStr)
    const day = pst.getDay() // 0=Sun … 6=Sat
    const hour = pst.getHours()
    // Friday (5) after 2AM PST → jump to next week
    const isFridayAfter2AM = day === 5 && hour >= 2
    const isSat = day === 6
    const extraDays = (isFridayAfter2AM || isSat) ? 7 : 0
    const monday = new Date(d)
    monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1) + extraDays)
    monday.setHours(0, 0, 0, 0)
    return monday
  })
  const [selectedCalDate, setSelectedCalDate] = useState<number | null>(null)
  const [weeklySubView, setWeeklySubView] = useState<'logos' | 'implied'>('logos')
  const [impliedMoves, setImpliedMoves] = useState<Record<string, number>>({})
  const [impliedModalDay, setImpliedModalDay] = useState<Date | null>(null)
  const impliedFetchedRef = useRef<Set<string>>(new Set())
  const impliedQueueRef = useRef<Array<{ ticker: string; date: Date }>>([])
  const impliedProcessingRef = useRef(false)
  const impliedScheduleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [clock, setClock] = useState('')
  const [moverCharts, setMoverCharts] = useState<
    Record<string, { price: number; timestamp: number; etMinutes: number }[]>
  >({})
  const [moverPrevClose, setMoverPrevClose] = useState<Record<string, number>>({})
  const moverChartsFetchedRef = useRef<Set<string>>(new Set())
  const [historicalBreaking, setHistoricalBreaking] = useState<NewsArticle[]>([])
  const [historicalLoading, setHistoricalLoading] = useState(false)
  const [historicalExpanded, setHistoricalExpanded] = useState(true)
  const historicalFetchedRef = useRef(false)

  const POLYGON_KEY = process.env.NEXT_PUBLIC_POLYGON_API_KEY || ''

  // ── Implied Move: exact ChainPanel getProbabilityStrikes logic ──────────────
  const fetchImpliedMove = useCallback(async (ticker: string, earningsDate: Date) => {
    const key = `${ticker}-${earningsDate.toISOString().split('T')[0]}`
    if (impliedFetchedRef.current.has(key)) return
    impliedFetchedRef.current.add(key)
    if (!POLYGON_KEY) return
    try {
      // Friday of the earnings week
      const base = new Date(earningsDate)
      const baseDay = base.getDay()
      const fridayOffset = baseDay === 0 ? 5 : 5 - baseDay
      base.setDate(base.getDate() + (fridayOffset < 0 ? fridayOffset + 7 : fridayOffset))
      const fridayStr = base.toISOString().split('T')[0]

      // 1. Get current stock price
      const priceRes = await fetch(
        `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apikey=${POLYGON_KEY}`
      )
      if (!priceRes.ok) { console.warn(`[IV] ${ticker} price HTTP ${priceRes.status}`); return }
      const priceData = await priceRes.json()
      const stockPrice: number =
        priceData?.ticker?.day?.c ||
        priceData?.ticker?.lastTrade?.p ||
        priceData?.ticker?.prevDay?.c
      if (!stockPrice || stockPrice <= 0) { console.warn(`[IV] ${ticker} no valid price`); return }

      // 2. Get contracts for the Friday expiry (with fallback) — same as ChainPanel fetchOptionsChain
      const contractsRes = await fetch(
        `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${ticker}&expiration_date=${fridayStr}&limit=500&apikey=${POLYGON_KEY}`
      )
      if (!contractsRes.ok) { console.warn(`[IV] ${ticker} contracts HTTP ${contractsRes.status}`); return }
      const contractsData = await contractsRes.json()
      const results: any[] = contractsData?.results ?? []

      let usedExpiry = fridayStr
      if (results.length === 0) {
        const refRes = await fetch(
          `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${ticker}&expiration_date.gte=${fridayStr}&limit=50&apikey=${POLYGON_KEY}`
        )
        if (!refRes.ok) { console.warn(`[IV] ${ticker} fallback ref HTTP ${refRes.status}`); return }
        const refData = await refRes.json()
        if (!refData?.results?.length) { console.warn(`[IV] ${ticker} no expirations found`); return }
        usedExpiry = refData.results[0].expiration_date
        const fallbackRes = await fetch(
          `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${ticker}&expiration_date=${usedExpiry}&limit=500&apikey=${POLYGON_KEY}`
        )
        if (!fallbackRes.ok) { console.warn(`[IV] ${ticker} fallback contracts HTTP ${fallbackRes.status}`); return }
        const fallbackData = await fallbackRes.json()
        if (!fallbackData?.results?.length) { console.warn(`[IV] ${ticker} no contracts for fallback expiry ${usedExpiry}`); return }
        results.push(...fallbackData.results)
      }

      // 3. Separate calls and puts, build allStrikes — same as ChainPanel
      const callOptions: any[] = results.filter((c: any) => c.contract_type === 'call')
      const putOptions: any[] = results.filter((c: any) => c.contract_type === 'put')
      const allStrikes: number[] = [...new Set([...callOptions, ...putOptions].map((o: any) => o.strike_price as number))].sort((a, b) => a - b)

      // 4. Filter ATM options within 5% of price — exact ChainPanel condition
      const atmOptions: any[] = [...callOptions, ...putOptions].filter((opt: any) => {
        const pctDiff = Math.abs((opt.strike_price - stockPrice) / stockPrice)
        return pctDiff < 0.05
      })
      if (atmOptions.length === 0) { console.warn(`[IV] ${ticker} no ATM options within 5%`); return }

      // 5. Fetch IV for all ATM options in small batches (ChainPanel fetches each individually)
      const IV_BATCH = 5
      const ivMap: Record<string, number> = {}
      for (let i = 0; i < atmOptions.length; i += IV_BATCH) {
        const batch = atmOptions.slice(i, i + IV_BATCH)
        await Promise.all(batch.map(async (opt: any) => {
          try {
            const snap = await fetch(
              `https://api.polygon.io/v3/snapshot/options/${ticker}/${opt.ticker}?apikey=${POLYGON_KEY}`
            )
            const snapData = await snap.json()
            const iv: number = snapData?.results?.implied_volatility ?? 0
            ivMap[opt.ticker] = iv
          } catch {
            ivMap[opt.ticker] = 0
          }
        }))
        if (i + IV_BATCH < atmOptions.length) await new Promise(r => setTimeout(r, 200))
      }

      // 6. Average IV of options that have valid IV > 0 — exact ChainPanel getProbabilityStrikes
      const validIVs = atmOptions.map((o: any) => ivMap[o.ticker] ?? 0).filter(iv => iv > 0)
      if (validIVs.length === 0) { console.warn(`[IV] ${ticker} no options returned valid IV`); return }
      const avgIV = validIVs.reduce((s: number, v: number) => s + v, 0) / validIVs.length
      if (avgIV < 0.01 || avgIV > 5) { console.warn(`[IV] ${ticker} avgIV out of range: ${avgIV}`); return }

      // 7. DTE from actual used expiry — exact ChainPanel daysToExpiry calc
      const expiryDate = new Date(usedExpiry)
      const now = new Date()
      const daysToExpiry = Math.max(1, Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
      const T = daysToExpiry / 365
      const r = 0.0387

      // 8. Theoretical 80% COP strikes — exact ChainPanel findStrikeForProbability
      const call80Theoretical = _findStrike(stockPrice, r, avgIV, T, 80, true)
      const put80Theoretical = _findStrike(stockPrice, r, avgIV, T, 80, false)

      // 9. Snap to nearest actual strike — exact ChainPanel findClosestStrike
      const findClosestStrike = (theoretical: number) =>
        allStrikes.reduce((prev, curr) =>
          Math.abs(curr - theoretical) < Math.abs(prev - theoretical) ? curr : prev
          , allStrikes[0])

      const call80 = findClosestStrike(call80Theoretical)
      const put80 = findClosestStrike(put80Theoretical)
      // one-sided implied move: how far price moves to each 80% strike (averaged)
      const pct = ((call80 - put80) / stockPrice) * 100 / 2

      console.group(`[IV] ${ticker}`)
      console.log(`  expiry         : ${usedExpiry}${usedExpiry !== fridayStr ? ` (target was ${fridayStr})` : ''}`)
      console.log(`  price          : $${stockPrice}`)
      console.log(`  ATM options    : ${atmOptions.length} within 5%, ${validIVs.length} with valid IV`)
      console.log(`  avgIV          : ${(avgIV * 100).toFixed(1)}%`)
      console.log(`  DTE            : ${daysToExpiry}d  (T = ${T.toFixed(4)})`)
      console.log(`  80% call       : $${call80Theoretical.toFixed(2)} → snapped $${call80}`)
      console.log(`  80% put        : $${put80Theoretical.toFixed(2)} → snapped $${put80}`)
      console.log(`  implied move   : (${call80} - ${put80}) / ${stockPrice} = ${pct.toFixed(2)}%`)
      console.groupEnd()

      setImpliedMoves((prev) => ({ ...prev, [ticker]: pct }))
    } catch (e) {
      console.error(`[IV] ${ticker} error:`, e)
    }
  }, [POLYGON_KEY])

  const BATCH_SIZE = 3
  const BATCH_DELAY_MS = 700

  const processBatchQueue = useCallback(async () => {
    if (impliedProcessingRef.current) return
    impliedProcessingRef.current = true
    while (impliedQueueRef.current.length > 0) {
      const batch: Array<{ ticker: string; date: Date }> = []
      while (batch.length < BATCH_SIZE && impliedQueueRef.current.length > 0) {
        const item = impliedQueueRef.current.shift()!
        const key = `${item.ticker}-${item.date.toISOString().split('T')[0]}`
        if (!impliedFetchedRef.current.has(key)) batch.push(item)
      }
      if (batch.length === 0) break
      await Promise.all(batch.map(({ ticker, date }) => fetchImpliedMove(ticker, date)))
      if (impliedQueueRef.current.length > 0) {
        await new Promise<void>((r) => setTimeout(r, BATCH_DELAY_MS))
      }
    }
    impliedProcessingRef.current = false
  }, [fetchImpliedMove])

  const scheduleImpliedProcessing = useCallback(() => {
    if (impliedScheduleTimerRef.current) clearTimeout(impliedScheduleTimerRef.current)
    impliedScheduleTimerRef.current = setTimeout(() => {
      void processBatchQueue()
    }, 50)
  }, [processBatchQueue])

  const fetchMoverChart = useCallback(
    async (ticker: string) => {
      if (moverChartsFetchedRef.current.has(ticker)) return
      if (!ticker || !POLYGON_KEY) return

      moverChartsFetchedRef.current.add(ticker)
      try {
        // Step 1: daily aggs — find last trading day + previous close (matches EFICharting tracking tab)
        const now = new Date()
        const pstStr = now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })
        const pstNow = new Date(pstStr)
        const year = pstNow.getFullYear()
        const month = pstNow.getMonth() + 1
        const day = pstNow.getDate()
        const todayStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        const startDate = new Date(pstNow)
        startDate.setDate(startDate.getDate() - 10)
        const startDateStr = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`

        const dailyUrl = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${startDateStr}/${todayStr}?adjusted=true&sort=desc&limit=3&apiKey=${POLYGON_KEY}`
        const dailyRes = await fetch(dailyUrl)
        if (!dailyRes.ok) {
          setMoverCharts((prev) => ({ ...prev, [ticker]: [] }))
          return
        }
        const dailyData = await dailyRes.json()

        if (!dailyData.results || dailyData.results.length < 2) {
          setMoverCharts((prev) => ({ ...prev, [ticker]: [] }))
          return
        }

        const prevClose: number = dailyData.results[1].c
        const lastTradingDayTs: number = dailyData.results[0].t
        const lastDay = new Date(lastTradingDayTs)
        const lastDayStr = `${lastDay.getUTCFullYear()}-${String(lastDay.getUTCMonth() + 1).padStart(2, '0')}-${String(lastDay.getUTCDate()).padStart(2, '0')}`

        // Step 2: 1-minute intraday bars for last trading day
        const intradayUrl = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/minute/${lastDayStr}/${lastDayStr}?adjusted=true&sort=asc&limit=50000&apiKey=${POLYGON_KEY}`
        const intradayRes = await fetch(intradayUrl)
        if (!intradayRes.ok) {
          setMoverCharts((prev) => ({ ...prev, [ticker]: [] }))
          return
        }
        const intradayData = await intradayRes.json()

        if (!intradayData.results || intradayData.results.length === 0) {
          setMoverCharts((prev) => ({ ...prev, [ticker]: [] }))
          return
        }

        const bars = intradayData.results.map((b: { c: number; t: number }) => {
          const ps = new Date(b.t).toLocaleString('en-US', {
            timeZone: 'America/Los_Angeles',
            hour12: false,
          })
          const pd = new Date(ps)
          return { price: b.c, timestamp: b.t, etMinutes: pd.getHours() * 60 + pd.getMinutes() }
        })

        setMoverPrevClose((prev) => ({ ...prev, [ticker]: prevClose }))
        setMoverCharts((prev) => ({ ...prev, [ticker]: bars }))
      } catch (err) {
        setMoverCharts((prev) => ({ ...prev, [ticker]: [] }))
      }
    },
    [POLYGON_KEY]
  )

  const scrollRef = useRef<HTMLDivElement>(null)
  const savedScrollPos = useRef<number>(0)

  useEffect(() => {
    const tick = () =>
      setClock(
        new Date().toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          timeZone: 'America/Los_Angeles',
          hour12: true,
        }) + ' PST'
      )
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  useLayoutEffect(() => {
    if (scrollRef.current && savedScrollPos.current > 0)
      scrollRef.current.scrollTop = savedScrollPos.current
  })

  const handleScroll = useCallback(() => {
    if (scrollRef.current) savedScrollPos.current = scrollRef.current.scrollTop
  }, [])

  const fetchNews = useCallback(async (ticker?: string) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        limit: '50',
        ...(ticker && ticker.trim() && { ticker: ticker.trim().toUpperCase() }),
        _t: Date.now().toString(),
      })
      const res = await fetch(`/api/news?${params}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      })
      const data: NewsResponse = await res.json()
      if (!data.success) throw new Error(data.error || 'Failed to fetch news')
      setArticles(data.articles)
      setLastRefresh(new Date())
      fetchMarketSentiment()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load news')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchMarketSentiment = useCallback(async () => {
    try {
      const res = await fetch('/api/market-sentiment')
      const data = await res.json()
      if (data.success) setMarketSentiment(data.sentiment_analysis)
    } catch {
      /* silent */
    }
  }, [])

  const fetchHistoricalBreaking = useCallback(async () => {
    if (historicalFetchedRef.current) return
    historicalFetchedRef.current = true
    setHistoricalLoading(true)
    try {
      const params = new URLSearchParams({
        limit: '500',
        historical: 'true',
        _t: Date.now().toString(),
      })
      const res = await fetch(`/api/news?${params}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      })
      const data: NewsResponse = await res.json()
      if (!data.success) throw new Error(data.error || 'Failed')
      // Show all articles from the past 72h window, any urgency
      const hist = data.articles.filter(
        (a) => (a.urgency ?? 0) >= 0.15 || a.category === 'breaking'
      )
      setHistoricalBreaking(hist)
    } catch {
      // silent — historical is optional
    } finally {
      setHistoricalLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchNews(searchTicker)
  }, [fetchNews, searchTicker])
  useEffect(() => {
    const id = setInterval(() => fetchNews(searchTicker), 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [fetchNews, searchTicker])

  // ── Auto-scan historical breaking news on mount ─────────────────────────
  useEffect(() => {
    fetchHistoricalBreaking()
  }, [fetchHistoricalBreaking])

  // ── Auto-scan mover charts whenever articles load ─────────────────────────
  useEffect(() => {
    if (articles.length === 0) return
    const byTicker: Record<string, NewsArticle> = {}
    articles
      .filter((a) => a.tickers.length > 0)
      .sort((a, b) => b.urgency - a.urgency)
      .forEach((a) => {
        a.tickers.forEach((t) => {
          if (!byTicker[t]) byTicker[t] = a
        })
      })
    const tickers = Object.keys(byTicker).slice(0, 20)
    tickers.forEach((t) => fetchMoverChart(t))
  }, [articles, fetchMoverChart])

  // ── Live calendar data — earnings from Nasdaq API, economic from FRED ────────
  // Auto-scans on mount and whenever calMonth changes (no tab-guard needed)
  const fetchCalendarData = useCallback(async (year: number, month: number) => {
    setCalEventsLoading(true)
    const FRED_MAP: Record<
      string,
      { event: string; importance: CalendarEvent['importance']; time: string }
    > = {
      CPI: { event: 'CPI Report', importance: 'critical', time: '8:30 AM' },
      PPI: { event: 'PPI Report', importance: 'high', time: '8:30 AM' },
      'Jobs Report': { event: 'Non-Farm Payrolls', importance: 'critical', time: '8:30 AM' },
      'Retail Sales': { event: 'Retail Sales', importance: 'high', time: '8:30 AM' },
      GDP: { event: 'GDP Report', importance: 'critical', time: '8:30 AM' },
    }
    try {
      const [earningsData, fredData] = await Promise.all([
        fetch(`/api/earnings-calendar?year=${year}&month=${month}`, { cache: 'no-store' })
          .then((r) => r.json())
          .catch(() => ({ success: false, events: [] })),
        fetch(`/api/fred-calendar?year=${year}&month=${month}`)
          .then((r) => r.json())
          .catch(() => ({ success: false, events: {} })),
      ])
      console.log('[CAL DEBUG] raw earningsData:', earningsData)
      console.log('[CAL DEBUG] total events from API:', earningsData?.events?.length)
      const postEvents = earningsData?.events?.filter((e: CalendarEvent) => e.time === 'Post-Market')
      const preEvents = earningsData?.events?.filter((e: CalendarEvent) => e.time === 'Pre-Market')
      console.log('[CAL DEBUG] Pre-Market count:', preEvents?.length, '| Post-Market count:', postEvents?.length)
      console.log('[CAL DEBUG] sample Post-Market events:', postEvents?.slice(0, 3))
      console.log('[CAL DEBUG] unique time values:', [...new Set(earningsData?.events?.map((e: CalendarEvent) => e.time))])
      const incoming: CalendarEvent[] = []
      if (earningsData.success && Array.isArray(earningsData.events)) {
        incoming.push(...earningsData.events)
      }
      if (fredData.success && fredData.events) {
        Object.entries(fredData.events as Record<string, string[]>).forEach(
          ([dateStr, names]) => {
            const [yyyy, mm, dd] = dateStr.split('-').map(Number)
              ; (names as string[]).forEach((name) => {
                const mapped = FRED_MAP[name]
                if (!mapped) return
                incoming.push({
                  date: `${MONTH_SHORT[mm - 1]} ${dd}`,
                  dayNum: dd,
                  month: mm - 1,
                  year: yyyy,
                  time: mapped.time,
                  event: mapped.event,
                  importance: mapped.importance,
                  country: 'US',
                  type: 'economic',
                })
              })
          }
        )
      }
      if (incoming.length > 0) {
        setLiveCalEvents((prev) => [
          ...prev.filter(
            (ev) =>
              !(
                ev.year === year &&
                ev.month === month &&
                (ev.type === 'earnings' || ev.type === 'economic')
              )
          ),
          ...incoming,
        ])
      }
    } catch {
      // silent
    } finally {
      setCalEventsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCalendarData(calMonth.year, calMonth.month)
  }, [fetchCalendarData, calMonth])

  // Auto-refresh calendar every 30 minutes
  useEffect(() => {
    const id = setInterval(() => fetchCalendarData(calMonth.year, calMonth.month), 30 * 60 * 1000)
    return () => clearInterval(id)
  }, [fetchCalendarData, calMonth])

  // ── Auto-queue implied vol for the current week's earnings on mount / data change ──
  useEffect(() => {
    if (liveCalEvents.length === 0) return
    const extractT = (event: string): string => event.match(/\(([A-Z]{1,5})\)/)?.[1] ?? ''
    const weekDays: Date[] = Array.from({ length: 5 }, (_, i) => {
      const d = new Date(calWeekOf)
      d.setDate(calWeekOf.getDate() + i)
      return d
    })
    const MCAP_RANK: Record<string, number> = {
      MSFT: 1, AAPL: 2, NVDA: 3, GOOGL: 4, GOOG: 5, AMZN: 6, META: 7, TSLA: 8, AVGO: 9,
      LLY: 10, JPM: 11, V: 12, UNH: 13, XOM: 14, MA: 15, COST: 16, HD: 17, PG: 18, JNJ: 19,
      NFLX: 20, AMD: 21, CRM: 22, BAC: 23, WMT: 24, ORCL: 25, ABBV: 26, MRK: 27, ADBE: 28,
      NOW: 29, QCOM: 30, MU: 31, AMAT: 32, TXN: 33, GS: 34, MS: 35, PYPL: 36, PANW: 37,
      SNOW: 38, PLTR: 39, UBER: 40, SHOP: 41, ABNB: 42, COIN: 43,
    }
    const mcapSort = (a: string, b: string) => (MCAP_RANK[a] ?? 999) - (MCAP_RANK[b] ?? 999)
    weekDays.forEach((day) => {
      const dayEvs = liveCalEvents.filter(
        (ev) =>
          ev.type === 'earnings' &&
          ev.year === day.getFullYear() &&
          ev.month === day.getMonth() &&
          ev.dayNum === day.getDate()
      )
      const tickers = dayEvs
        .map((ev) => extractT(ev.event))
        .filter(Boolean)
      tickers.sort(mcapSort)
      tickers.slice(0, 6).forEach((t) => {
        impliedQueueRef.current.push({ ticker: t, date: day })
      })
    })
    scheduleImpliedProcessing()
  }, [liveCalEvents, calWeekOf, scheduleImpliedProcessing])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    fetchNews(searchTicker)
  }
  const toggleExpanded = (id: string) => {
    const s = new Set(expandedArticles)
    s.has(id) ? s.delete(id) : s.add(id)
    setExpandedArticles(s)
  }
  const toggleFavorite = (id: string) => {
    const s = new Set(favorites)
    s.has(id) ? s.delete(id) : s.add(id)
    setFavorites(s)
  }
  const toggleCalImp = (level: string) => {
    const s = new Set(calImportanceFilter)
    s.has(level) ? s.delete(level) : s.add(level)
    setCalImportanceFilter(s)
  }

  // ── Derived ─────────────────────────────────────────────────────────────
  const breakingArticles = articles.filter((a) => a.urgency >= 0.65 || a.category === 'breaking')
  const leadStory = breakingArticles[0] ?? articles[0]
  const otherBreaking = breakingArticles.slice(1, 7)
  const moversEvents = (marketSentiment?.market_moving_events ?? [])
    .filter((e) => Math.abs(e.estimated_price_impact) >= 0.5)
    .slice(0, 12)
  const tickerText = articles
    .slice(0, 15)
    .map((a) => a.title)
    .join('  ●  ')

  const sentStyle = (s: string) =>
    s === 'positive'
      ? {
        cls: 'text-emerald-400',
        border: 'border-l-emerald-500',
        bg: 'bg-emerald-500/10 border border-emerald-500/40 text-emerald-400',
        label: '▲ BULL',
      }
      : s === 'negative'
        ? {
          cls: 'text-red-400',
          border: 'border-l-red-500',
          bg: 'bg-red-500/10 border border-red-500/40 text-red-400',
          label: '▼ BEAR',
        }
        : {
          cls: 'text-amber-300',
          border: 'border-l-amber-500',
          bg: 'bg-amber-500/10 border border-amber-500/40 text-amber-300',
          label: '◆ NEUTRAL',
        }

  // ══════════════════════════════════════════════════════════════════════════
  // LOADING / ERROR
  // ══════════════════════════════════════════════════════════════════════════
  const renderLoader = () => (
    <div className="flex-1 flex items-center justify-center min-h-[300px]">
      <div className="text-center">
        <div className="w-20 h-20 border-[3px] border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-6" />
        <p className="text-white font-black text-2xl uppercase tracking-widest mb-2">
          Loading Intelligence
        </p>
        <p className="text-orange-400 font-bold text-lg uppercase tracking-wide">
          Fetching real-time market data
        </p>
      </div>
    </div>
  )

  const renderError = () => (
    <div className="flex-1 flex items-center justify-center min-h-[300px]">
      <div className="text-center max-w-sm">
        <div className="w-20 h-20 bg-red-500/20 border-2 border-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
          <TbAlertTriangle className="w-10 h-10 text-red-400" />
        </div>
        <h3 className="text-white font-black text-3xl uppercase mb-3">Feed Offline</h3>
        <p className="text-red-400 font-black text-lg mb-2">Connection to news API failed</p>
        <p className="text-orange-300 font-bold text-base mb-8">{error}</p>
        <button
          onClick={() => fetchNews(searchTicker)}
          className="px-8 py-4 bg-orange-500 hover:bg-orange-400 text-black font-black rounded-xl transition-all tracking-widest uppercase text-lg shadow-lg shadow-orange-500/30"
        >
          Reconnect
        </button>
      </div>
    </div>
  )

  // ══════════════════════════════════════════════════════════════════════════
  // TAB: BREAKING
  // ══════════════════════════════════════════════════════════════════════════
  const renderBreaking = () => {
    const { border } = leadStory ? sentStyle(leadStory.sentiment) : { border: '' }
    return (
      <div className="px-5 pb-6 space-y-6">
        {!leadStory && (
          <div className="flex items-center justify-center p-12">
            <p className="text-orange-300 font-black text-2xl uppercase">
              No breaking news at this time.
            </p>
          </div>
        )}
        {leadStory && (
          <>
            <div style={{ height: '20px' }} />

            {/* LEAD STORY — 30%+ taller, no overflow-hidden, wide padding */}
            <a
              href={leadStory.article_url}
              target="_blank"
              rel="noopener noreferrer"
              className="block group"
            >
              <div
                className="relative rounded-2xl border border-red-500/35 hover:border-red-400/50 transition-all duration-200"
                style={{
                  background: 'linear-gradient(135deg, #1a0505 0%, #0e0202 50%, #080808 100%)',
                }}
              >
                <div className="absolute top-0 left-0 right-0 h-[2px] rounded-t-2xl bg-gradient-to-r from-transparent via-red-500/60 to-transparent" />
                <div className="absolute inset-y-0 left-0 w-[3px] rounded-l-2xl bg-gradient-to-b from-red-400/70 via-red-600/70 to-red-900/70" />
                <div className="pl-9 pr-8 pt-9 pb-9">
                  <div className="flex items-center gap-3 mb-7 flex-wrap">
                    <span className="flex items-center gap-2 px-4 py-2.5 bg-red-600 text-white text-sm font-black tracking-widest rounded-lg uppercase animate-pulse shadow-lg shadow-red-900/60">
                      <TbFlame className="w-5 h-5" /> BREAKING NEWS
                    </span>
                    <span className="flex items-center gap-2 px-3 py-2 bg-orange-500/20 border border-orange-400/50 text-orange-300 text-sm font-black rounded-lg uppercase tracking-widest">
                      <TbBroadcast className="w-4 h-4" /> LIVE
                    </span>
                    {leadStory.tickers.slice(0, 3).map((t) => (
                      <span
                        key={t}
                        className="px-3 py-2 bg-orange-500/20 border border-orange-500/50 text-orange-200 text-base font-black rounded-lg tracking-widest"
                      >
                        {t}
                      </span>
                    ))}
                    <span className="ml-auto text-base font-black text-orange-300">
                      {leadStory.time_ago}
                    </span>
                  </div>
                  <h2 className="text-white font-black text-3xl leading-tight mb-5 group-hover:text-orange-50 transition-colors">
                    {leadStory.title}
                  </h2>
                  {leadStory.description && (
                    <p className="text-white/85 text-xl leading-relaxed line-clamp-3 mb-7 font-medium">
                      {leadStory.description}
                    </p>
                  )}
                  <div className="flex items-center justify-between pt-5 border-t border-white/10">
                    <div className="flex items-center gap-4">
                      <span className="text-white/60 text-base font-bold">
                        {leadStory.publisher?.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-orange-400 font-black text-base uppercase tracking-wider group-hover:text-orange-300">
                      Full Story <TbArrowUpRight className="w-6 h-6" />
                    </div>
                  </div>
                </div>
              </div>
            </a>

            {/* MORE BREAKING — 4D glossy rows */}
            {otherBreaking.length > 0 && (
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-[2px] flex-1 bg-gradient-to-r from-white/10 to-transparent" />
                  <span className="flex items-center gap-2 text-sm font-black tracking-widest text-red-400 uppercase">
                    <TbFlame className="w-4 h-4" /> More Breaking
                  </span>
                  <div className="h-[2px] flex-1 bg-gradient-to-l from-white/10 to-transparent" />
                </div>
                <div className="space-y-4">
                  {otherBreaking.map((a) => {
                    const st = sentStyle(a.sentiment)
                    const isPos = a.sentiment === 'positive'
                    const isNeg = a.sentiment === 'negative'
                    return (
                      <a
                        key={a.id}
                        href={a.article_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group block"
                      >
                        <div
                          className={`relative flex items-start gap-4 px-6 py-8 rounded-xl border-l-[5px] ${st.border} overflow-hidden transition-all hover:scale-[1.003]`}
                          style={{
                            background: isPos
                              ? 'linear-gradient(135deg, rgba(16,185,129,0.09) 0%, rgba(8,8,8,0.97) 55%)'
                              : isNeg
                                ? 'linear-gradient(135deg, rgba(239,68,68,0.09) 0%, rgba(8,8,8,0.97) 55%)'
                                : 'linear-gradient(135deg, rgba(245,158,11,0.07) 0%, rgba(8,8,8,0.97) 55%)',
                            border: '1px solid rgba(255,255,255,0.06)',
                            borderLeft: undefined,
                            boxShadow:
                              'inset 0 1px 0 rgba(255,255,255,0.07), 0 2px 8px rgba(0,0,0,0.5)',
                          }}
                        >
                          {/* Gloss highlight */}
                          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />
                          <TbFlame className="w-6 h-6 text-orange-500 shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2.5 mb-4 flex-wrap">
                              {a.tickers.slice(0, 3).map((t) => (
                                <span
                                  key={t}
                                  className="px-3 py-1.5 bg-orange-500/20 border border-orange-500/50 text-orange-200 text-base font-black rounded-lg tracking-widest"
                                >
                                  {t}
                                </span>
                              ))}
                              <span className="ml-auto text-orange-400/80 text-sm font-bold">
                                {a.time_ago}
                              </span>
                            </div>
                            <p className="text-white font-bold text-xl leading-snug line-clamp-2 group-hover:text-orange-50 transition-colors">
                              {a.title}
                            </p>
                          </div>
                          <TbExternalLink className="w-5 h-5 text-white/25 group-hover:text-orange-400 shrink-0 mt-1 transition-colors" />
                        </div>
                      </a>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── HISTORICAL BREAKING HEADLINES ── */}
        <div>
          <button
            onClick={() => {
              setHistoricalExpanded((v) => !v)
              if (!historicalExpanded) fetchHistoricalBreaking()
            }}
            className="w-full flex items-center gap-3 py-4 group"
          >
            <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent via-orange-500/30 to-orange-500/60" />
            <span className="flex items-center gap-2 text-sm font-black tracking-widest uppercase text-orange-500">
              <TbClock className="w-4 h-4" />
              Past 3 Days — Breaking Headlines
              <span
                className={`transition-transform duration-200 ${historicalExpanded ? 'rotate-180' : ''}`}
              >
                <TbChevronDown className="w-4 h-4" />
              </span>
            </span>
            <div className="h-[1px] flex-1 bg-gradient-to-l from-transparent via-orange-500/30 to-orange-500/60" />
          </button>

          {historicalExpanded && (
            <div className="space-y-0 mt-1">
              {historicalLoading ? (
                <div className="flex items-center justify-center py-10 gap-3">
                  <div className="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-white/40 font-bold text-sm uppercase tracking-widest">
                    Loading archive…
                  </span>
                </div>
              ) : historicalBreaking.length === 0 ? (
                <p className="text-center text-white/30 font-bold py-8 uppercase tracking-widest text-sm">
                  No archived breaking news found.
                </p>
              ) : (
                (() => {
                  // Group by day label
                  const now = new Date()
                  const dayLabel = (dateStr: string) => {
                    const d = new Date(dateStr)
                    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)
                    if (diffDays === 0) return 'Today'
                    if (diffDays === 1) return 'Yesterday'
                    return d.toLocaleDateString('en-US', {
                      weekday: 'long',
                      month: 'short',
                      day: 'numeric',
                    })
                  }
                  const grouped: Record<string, NewsArticle[]> = {}
                  historicalBreaking.forEach((a) => {
                    const label = dayLabel(a.published_utc)
                    if (!grouped[label]) grouped[label] = []
                    grouped[label].push(a)
                  })
                  return Object.entries(grouped).map(([day, items]) => (
                    <div key={day} className="mb-5">
                      <div className="flex items-center gap-3 mb-3 sticky top-0 bg-[#050505] py-2 z-10">
                        <TbCalendar className="w-4 h-4 text-orange-400/60 shrink-0" />
                        <span className="text-xs font-black tracking-[0.2em] text-orange-400/60 uppercase">
                          {day}
                        </span>
                        <div className="h-px flex-1 bg-white/5" />
                        <span className="text-xs text-white/20 font-bold">
                          {items.length} stories
                        </span>
                      </div>
                      <div className="space-y-px">
                        {items.map((a) => {
                          const st = sentStyle(a.sentiment)
                          return (
                            <a
                              key={a.id}
                              href={a.article_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="group flex items-start gap-3 px-3 py-3 rounded-lg hover:bg-white/[0.03] transition-colors border border-transparent hover:border-white/[0.06]"
                            >
                              <span className="text-xs font-black shrink-0 mt-0.5 w-24 text-right text-white leading-tight">
                                {new Date(a.published_utc).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  timeZone: 'America/Los_Angeles',
                                })}
                                <br />
                                {new Date(a.published_utc).toLocaleTimeString('en-US', {
                                  hour: 'numeric',
                                  minute: '2-digit',
                                  hour12: true,
                                  timeZone: 'America/Los_Angeles',
                                })}{' '}
                                PST
                              </span>
                              <div className="w-[3px] self-stretch rounded-full shrink-0 bg-orange-500/40" />
                              <div className="flex-1 min-w-0">
                                <p className="text-white font-bold text-base leading-snug line-clamp-2 transition-colors">
                                  {a.title}
                                </p>
                                {a.tickers && a.tickers.length > 0 && (
                                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                    {a.tickers.slice(0, 3).map((t: string) => (
                                      <span
                                        key={t}
                                        className="text-xs font-black text-orange-500 bg-orange-500/10 px-1.5 py-0.5 rounded"
                                      >
                                        {t}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <TbExternalLink className="w-3.5 h-3.5 text-white/15 group-hover:text-orange-400 shrink-0 mt-0.5 transition-colors" />
                            </a>
                          )
                        })}
                      </div>
                    </div>
                  ))
                })()
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TAB: LIVE FEED
  // ══════════════════════════════════════════════════════════════════════════
  const renderFeed = () => {
    if (articles.length === 0)
      return (
        <div className="flex-1 flex items-center justify-center p-12">
          <p className="text-orange-300 font-black text-2xl uppercase">
            No articles found. Try a different search.
          </p>
        </div>
      )
    return (
      <div>
        <div style={{ height: '20px' }} />
        {articles.map((article, idx) => {
          const { border, bg } = sentStyle(article.sentiment)
          const isExpanded = expandedArticles.has(article.id)
          const isFav = favorites.has(article.id)
          const isPos = article.sentiment === 'positive'
          const isNeg = article.sentiment === 'negative'

          // Exact time from published_utc
          const pubTime = article.published_utc
            ? new Date(article.published_utc).toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
              timeZone: 'America/Los_Angeles',
            })
            : article.time_ago

          return (
            <div
              key={article.id}
              className={`relative border-l-[5px] ${border} group transition-all`}
              style={{
                background: idx % 2 === 0 ? '#080808' : '#060606',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.035)',
              }}
            >
              {/* Gloss line */}
              <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/[0.07] to-transparent pointer-events-none" />
              <div className="px-6 pt-7 pb-6">
                {/* Tickers — plain colored text, no background/border */}
                {article.tickers.length > 0 && (
                  <div className="flex items-center gap-3 mb-4 flex-wrap">
                    {article.tickers.slice(0, 4).map((t) => (
                      <span
                        key={t}
                        className={`text-lg font-black tracking-widest ${isPos ? 'text-emerald-400' : isNeg ? 'text-red-400' : 'text-orange-400'
                          }`}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
                {/* Headline */}
                <p className="text-white font-black text-xl leading-snug mb-4 group-hover:text-orange-50 transition-colors">
                  {article.title}
                </p>
                {isExpanded && article.description && (
                  <p className="text-white/80 text-base leading-relaxed mt-3 mb-4 font-medium pl-3 border-l-2 border-orange-500/40">
                    {article.description}
                  </p>
                )}
                {/* Footer — time left, sentiment + actions right */}
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-2 text-white/30 text-sm font-bold">
                    <TbClock className="w-4 h-4 text-white/20 shrink-0" />
                    <span>{pubTime}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {article.description && (
                      <button
                        onClick={() => toggleExpanded(article.id)}
                        className="text-white/30 hover:text-white transition-colors p-1.5"
                      >
                        {isExpanded ? (
                          <TbChevronUp className="w-5 h-5" />
                        ) : (
                          <TbChevronDown className="w-5 h-5" />
                        )}
                      </button>
                    )}
                    <button
                      onClick={() => toggleFavorite(article.id)}
                      className="text-white/30 hover:text-orange-400 transition-colors p-1.5"
                    >
                      {isFav ? (
                        <TbStarFilled className="w-5 h-5 text-orange-400" />
                      ) : (
                        <TbStar className="w-5 h-5" />
                      )}
                    </button>
                    <a
                      href={article.article_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-white/30 hover:text-orange-400 transition-colors p-1.5"
                    >
                      <TbExternalLink className="w-5 h-5" />
                    </a>
                  </div>
                </div>
              </div>
              {/* Bottom separator */}
              <div className="h-[1px] bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
            </div>
          )
        })}
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TAB: MOVERS
  // ══════════════════════════════════════════════════════════════════════════
  const renderMovers = () => {
    // Deduplicate: one row per ticker, keep highest urgency article
    const byTicker: Record<string, NewsArticle> = {}
    articles
      .filter((a) => a.tickers.length > 0)
      .sort((a, b) => b.urgency - a.urgency)
      .forEach((a) => {
        a.tickers.forEach((t) => {
          if (!byTicker[t]) byTicker[t] = a
        })
      })
    const rows = Object.entries(byTicker).slice(0, 20)

    if (rows.length === 0)
      return (
        <div className="p-14 text-center">
          <TbActivity className="w-16 h-16 text-orange-400/30 mx-auto mb-5" />
          <p className="text-white font-black text-2xl uppercase mb-3">No Movers Detected</p>
          <p className="text-orange-300 font-bold text-lg">
            No market-moving articles in the current feed.
          </p>
        </div>
      )

    return (
      <div>
        <div style={{ height: '20px' }} />

        {/* TABLE HEADER */}
        <div className="grid grid-cols-[110px_1fr_350px] gap-4 px-6 py-3 border-b border-orange-500/20 bg-[#0a0a0a] sticky top-0 z-10">
          <span className="text-xs font-black text-orange-400 uppercase tracking-widest">
            TICKER
          </span>
          <span className="text-xs font-black text-orange-400 uppercase tracking-widest">
            TOP HEADLINE
          </span>
          <span className="text-xs font-black text-orange-400 uppercase tracking-widest">
            CHART
          </span>
        </div>

        {rows.map(([ticker, article]) => {
          const isPos = article.sentiment === 'positive'
          const isNeg = article.sentiment === 'negative'
          const isNeut = !isPos && !isNeg
          const bdrCol = isPos
            ? 'border-l-emerald-500'
            : isNeg
              ? 'border-l-red-500'
              : 'border-l-amber-400/60'
          const tickerColor = isPos
            ? 'text-emerald-400'
            : isNeg
              ? 'text-red-400'
              : 'text-orange-400'
          // undefined = not yet fetched (show spinner), [] = fetched but no data (show dash), array = has data
          const chartData = moverCharts[ticker]
          const isFetching = chartData === undefined

          const rowBg = isPos
            ? 'rgba(16,185,129,0.07)'
            : isNeg
              ? 'rgba(239,68,68,0.07)'
              : 'rgba(251,191,36,0.05)'
          const rowGlow = isPos
            ? 'inset 0 1px 0 rgba(16,185,129,0.12), inset 0 -1px 0 rgba(16,185,129,0.06)'
            : isNeg
              ? 'inset 0 1px 0 rgba(239,68,68,0.12), inset 0 -1px 0 rgba(239,68,68,0.06)'
              : 'inset 0 1px 0 rgba(251,191,36,0.10), inset 0 -1px 0 rgba(251,191,36,0.04)'

          const timeStr = article.published_utc
            ? new Date(article.published_utc).toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
              timeZone: 'America/Los_Angeles',
            })
            : article.time_ago

          // ── Tracking-tab-style sparkline chart (matches EFICharting exactly) ──
          let chartNode: React.ReactNode

          if (isFetching) {
            chartNode = (
              <div className="flex items-center justify-center w-full" style={{ height: 80 }}>
                <div className="w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
              </div>
            )
          } else if (!chartData || chartData.length < 2) {
            chartNode = (
              <div
                className="flex items-center justify-center text-white/20 font-black text-2xl w-full"
                style={{ height: 80 }}
              >
                —
              </div>
            )
          } else {
            const prices = chartData.map((d) => d.price)
            const minPrice = Math.min(...prices)
            const maxPrice = Math.max(...prices)
            const priceRange = maxPrice - minPrice || 1
            const svgPad = 8
            const svgH = 50 - svgPad * 2
            const prevClose = moverPrevClose[ticker]

            const points = chartData
              .map((point, i) => {
                const x = (i / (chartData.length - 1)) * 200
                const y = svgPad + ((maxPrice - point.price) / priceRange) * svgH
                return `${x.toFixed(1)},${y.toFixed(1)}`
              })
              .join(' ')

            const prevDayY =
              prevClose != null ? svgPad + ((maxPrice - prevClose) / priceRange) * svgH : null

            // Shading zones algorithm — identical to EFICharting tracking tab
            const shadingZones: Array<{ x: number; width: number; color: string }> = []
            let curZone: { start: number; color: string } | null = null
            chartData.forEach((point, i) => {
              const m = point.etMinutes || 0
              let fill: string | null = null
              if (m >= 60 && m < 390)
                fill = 'rgba(255,165,0,0.12)' // pre-market: orange
              else if (m >= 780 && m < 1020) fill = 'rgba(0,174,239,0.12)' // after-hours: cyan
              if (fill) {
                if (!curZone || curZone.color !== fill) {
                  if (curZone !== null) {
                    const x = (curZone.start / (chartData.length - 1)) * 200
                    shadingZones.push({
                      x,
                      width: (i / (chartData.length - 1)) * 200 - x,
                      color: curZone.color,
                    })
                  }
                  curZone = { start: i, color: fill }
                }
              } else if (curZone !== null) {
                const x = (curZone.start / (chartData.length - 1)) * 200
                shadingZones.push({
                  x,
                  width: (i / (chartData.length - 1)) * 200 - x,
                  color: curZone.color,
                })
                curZone = null
              }
            })
            if (curZone !== null) {
              const zone = curZone as { start: number; color: string }
              shadingZones.push({
                x: (zone.start / (chartData.length - 1)) * 200,
                width: 200 - (zone.start / (chartData.length - 1)) * 200,
                color: zone.color,
              })
            }

            // Market open/close label positions
            let marketOpenIndex = -1,
              marketCloseIndex = -1
            chartData.forEach((point, i) => {
              const m = point.etMinutes || 0
              if (marketOpenIndex === -1 && m >= 390) marketOpenIndex = i
              if (marketCloseIndex === -1 && m >= 780) marketCloseIndex = i
            })

            const curP = prices[prices.length - 1]
            const changePct =
              prevClose != null
                ? ((curP - prevClose) / prevClose) * 100
                : ((curP - prices[0]) / prices[0]) * 100
            const priceLineColor = changePct >= 0 ? '#00ff00' : '#ff0000'
            const pctClass = changePct >= 0 ? 'text-green-400' : 'text-red-400'
            const openPct =
              marketOpenIndex >= 0 ? (marketOpenIndex / (chartData.length - 1)) * 100 : -1
            const closePct =
              marketCloseIndex >= 0 ? (marketCloseIndex / (chartData.length - 1)) * 100 : -1

            chartNode = (
              <div className="flex items-center gap-3 w-full min-w-0">
                <div className="flex-1 min-w-0 flex flex-col">
                  <svg viewBox="0 0 200 50" preserveAspectRatio="none" className="w-full h-16">
                    {shadingZones.map((zone, idx) => (
                      <rect
                        key={`shade-${idx}`}
                        x={zone.x}
                        y="0"
                        width={zone.width}
                        height="50"
                        fill={zone.color}
                      />
                    ))}
                    {prevDayY !== null && (
                      <line
                        x1="0"
                        y1={prevDayY.toFixed(1)}
                        x2="200"
                        y2={prevDayY.toFixed(1)}
                        stroke="#444444"
                        strokeWidth="1"
                        strokeDasharray="3,2"
                        opacity="0.4"
                        vectorEffect="non-scaling-stroke"
                      />
                    )}
                    <polyline
                      fill="none"
                      stroke={priceLineColor}
                      strokeWidth="1.5"
                      points={points}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  </svg>
                  <div className="relative mt-1" style={{ height: '14px' }}>
                    {openPct >= 0 && (
                      <span
                        className="absolute text-[9px] text-yellow-400 font-mono font-semibold"
                        style={{ left: `${openPct}%`, transform: 'translateX(-50%)' }}
                      >
                        6:30 AM
                      </span>
                    )}
                    {closePct >= 0 && (
                      <span
                        className="absolute text-[9px] text-yellow-400 font-mono font-semibold"
                        style={{ left: `${closePct}%`, transform: 'translateX(-50%)' }}
                      >
                        1:00 PM
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex-shrink-0 text-right w-20">
                  <div className="font-bold text-white text-sm">${curP.toFixed(2)}</div>
                  <div className={`text-xs font-bold ${pctClass}`}>
                    {changePct >= 0 ? '+' : ''}
                    {changePct.toFixed(2)}%
                  </div>
                </div>
              </div>
            )
          }

          return (
            <a
              key={ticker}
              href={article.article_url}
              target="_blank"
              rel="noopener noreferrer"
              className={`grid grid-cols-[110px_1fr_350px] gap-4 items-center px-6 py-4 border-l-[5px] ${bdrCol} group transition-all hover:brightness-125`}
              style={{
                background: rowBg,
                boxShadow: rowGlow,
                borderBottom: '2px solid #d4af37',
              }}
            >
              {/* Ticker + time */}
              <div>
                <span className={`text-xl font-black tracking-wider ${tickerColor}`}>{ticker}</span>
                <span className="text-xs font-black text-white block mt-0.5">{timeStr}</span>
              </div>

              {/* Headline */}
              <p className="text-white font-bold text-base leading-snug line-clamp-2 group-hover:text-orange-50 transition-colors">
                {article.title}
              </p>

              {/* Chart — EFICharting tracking tab style */}
              <div className="w-full min-w-0">{chartNode}</div>
            </a>
          )
        })}
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TAB: CALENDAR — Earnings Whispers-style monthly grid
  // ══════════════════════════════════════════════════════════════════════════
  const renderCalendar = () => {
    const { year, month } = calMonth
    const startDay = getMonthStartDay(year, month)
    const daysInMonth = getDaysInMonth(year, month)
    const today = new Date()
    const isThisMonth = today.getFullYear() === year && today.getMonth() === month
    const todayNum = isThisMonth ? today.getDate() : -1

    const extractTicker = (event: string): string => event.match(/\(([A-Z]{1,5})\)/)?.[1] ?? ''

    // ── Build monthly event map ───────────────────────────────────────────────
    const monthEventMap: Record<number, CalendarEvent[]> = {}
    liveCalEvents.forEach((ev) => {
      if (ev.year !== year || ev.month !== month) return
      if (calView === 'earnings' && ev.type !== 'earnings' && ev.type !== 'holiday') return
      if (calView === 'events' && ev.type === 'earnings') return
      if (ev.type !== 'holiday' && !calImportanceFilter.has(ev.importance)) return
      if (!monthEventMap[ev.dayNum]) monthEventMap[ev.dayNum] = []
      monthEventMap[ev.dayNum].push(ev)
    })

    // ── Build weeks grid ───────────────────────────────────────────────────────
    const weeks: (number | null)[][] = []
    let week: (number | null)[] = Array(startDay).fill(null)
    for (let d = 1; d <= daysInMonth; d++) {
      week.push(d)
      if (week.length === 7) {
        weeks.push(week)
        week = []
      }
    }
    if (week.length > 0) {
      while (week.length < 7) week.push(null)
      weeks.push(week)
    }

    const selectedDayEvents = selectedCalDate ? (monthEventMap[selectedCalDate] ?? []) : []

    // ── Week navigation ────────────────────────────────────────────────────────
    const shiftWeek = (delta: number) => {
      const d = new Date(calWeekOf)
      d.setDate(d.getDate() + delta * 7)
      setCalWeekOf(d)
      setCalMonth({ year: d.getFullYear(), month: d.getMonth() })
      // Reset implied move cache so new week is re-scanned
      impliedFetchedRef.current = new Set()
      impliedQueueRef.current = []
      impliedProcessingRef.current = false
      setImpliedMoves({})
    }

    const weekDays: Date[] = Array.from({ length: 5 }, (_, i) => {
      const d = new Date(calWeekOf)
      d.setDate(calWeekOf.getDate() + i)
      return d
    })

    const getWeekEarnings = (d: Date, timing: string) =>
      liveCalEvents.filter(
        (ev) =>
          ev.type === 'earnings' &&
          ev.year === d.getFullYear() &&
          ev.month === d.getMonth() &&
          ev.dayNum === d.getDate() &&
          ev.time === timing
      )

    // ── WEEKLY VIEW ────────────────────────────────────────────────────────────
    const renderWeekly = () => {
      const DAY_FULL = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY']

      // Market-cap priority order — highest first; unknown tickers rank last
      const MCAP_RANK: Record<string, number> = {
        MSFT: 1, AAPL: 2, NVDA: 3, GOOGL: 4, GOOG: 5, AMZN: 6, META: 7, TSLA: 8, AVGO: 9, BRK: 10,
        LLY: 11, JPM: 12, V: 13, UNH: 14, XOM: 15, MA: 16, COST: 17, HD: 18, PG: 19, JNJ: 20,
        NFLX: 21, AMD: 22, CRM: 23, BAC: 24, WMT: 25, ORCL: 26, CVX: 27, ABBV: 28, KO: 29, MRK: 30,
        ADBE: 31, NOW: 32, ACN: 33, INTC: 34, IBM: 35, QCOM: 36, MU: 37, AMAT: 38, TXN: 39, LRCX: 40,
        GE: 41, CAT: 42, GS: 43, MS: 44, BLK: 45, PYPL: 46, PANW: 47, SNOW: 48, PLTR: 49, UBER: 50,
        SHOP: 51, ABNB: 52, COIN: 53, HOOD: 54, RIVN: 55, LCID: 56, NIO: 57, BABA: 58, JD: 59, PDD: 60,
      }
      const mcapSort = (a: string, b: string) =>
        (MCAP_RANK[a] ?? 999) - (MCAP_RANK[b] ?? 999)
      const MAX_VISIBLE = 6

      // Queue only the top MAX_VISIBLE tickers per day (by market cap) on initial load
      if (weeklySubView === 'implied') {
        weekDays.forEach((day) => {
          const allEvs = [
            ...getWeekEarnings(day, 'Pre-Market'),
            ...getWeekEarnings(day, 'Post-Market'),
          ]
          const tickers = allEvs
            .map((ev) => extractTicker(ev.event))
            .filter(Boolean)
          tickers.sort(mcapSort)
          tickers.slice(0, MAX_VISIBLE).forEach((t) => {
            impliedQueueRef.current.push({ ticker: t, date: day })
          })
        })
        scheduleImpliedProcessing()
      }

      // ── IMPLIED MOVE chart view ──────────────────────────────────────────────
      if (weeklySubView === 'implied') {
        const LOGO_PX = 82

        // Build per-day data sorted by market cap, capped at MAX_VISIBLE rows
        const dayData = weekDays.map((day, dayIdx) => {
          const preEvs = getWeekEarnings(day, 'Pre-Market')
          const postEvs = getWeekEarnings(day, 'Post-Market')
          const allEvs = [...preEvs, ...postEvs]
          const allTickers = allEvs.map(ev => extractTicker(ev.event)).filter(Boolean)
          allTickers.sort(mcapSort)
          const topTickers = allTickers.slice(0, MAX_VISIBLE)
          const hiddenTotal = Math.max(0, allTickers.length - MAX_VISIBLE)
          const isToday = day.toDateString() === today.toDateString()
          const pendingCount = topTickers.filter(t => impliedMoves[t] === undefined).length
          const rows = topTickers
            .filter(t => impliedMoves[t] !== undefined && impliedMoves[t] > 0)
            .map(t => ({
              ticker: t,
              pct: impliedMoves[t],
              isPre: preEvs.some(ev => extractTicker(ev.event) === t),
            }))
          return { day, dayIdx, allEvs, allTickers, topTickers, hiddenTotal, isToday, pendingCount, rows }
        })

        // Y-axis scale: floor to just below lowest loaded %, ceiling = highest + 10% of highest
        const allLoadedPcts = dayData.flatMap(d => d.rows.map(r => r.pct))
        const Y_MIN = allLoadedPcts.length > 0 ? Math.max(0, Math.floor(Math.min(...allLoadedPcts) - 2)) : 0
        const _yRaw = allLoadedPcts.length > 0 ? Math.max(...allLoadedPcts) : 30
        const Y_MAX = allLoadedPcts.length > 0 ? _yRaw * 1.1 : 30
        const toFrac = (pct: number) => (Math.max(Y_MIN, Math.min(Y_MAX, pct)) - Y_MIN) / (Y_MAX - Y_MIN)
        const tickStep = Math.max(1, Math.ceil((Y_MAX - Y_MIN) / 8))
        const yLabels: number[] = []
        for (let v = Y_MIN; v <= Y_MAX; v += tickStep) yLabels.push(v)

        // ── Full-day modal ───────────────────────────────────────────────────
        const modalDayIndex = impliedModalDay ? weekDays.findIndex(d => d.toDateString() === impliedModalDay.toDateString()) : -1
        const modalOverlay = impliedModalDay && modalDayIndex >= 0 ? (() => {
          const mDay = impliedModalDay
          const mIdx = modalDayIndex
          const mPre = getWeekEarnings(mDay, 'Pre-Market')
          const mPost = getWeekEarnings(mDay, 'Post-Market')
          const mAll = [...mPre, ...mPost]
          const mItems: { ticker: string; pct: number; isPre: boolean }[] = []
          mAll.forEach((ev) => {
            const t = extractTicker(ev.event)
            if (!t) return
            const pct = impliedMoves[t]
            if (pct !== undefined && pct > 0) mItems.push({ ticker: t, pct, isPre: mPre.includes(ev) })
          })
          mItems.sort((a, b) => mcapSort(a.ticker, b.ticker))

          const mAllLoaded = mItems.map(x => x.pct)
          const mMin = mAllLoaded.length > 0 ? Math.max(0, Math.floor(Math.min(...mAllLoaded) - 2)) : 0
          const _mRaw = mAllLoaded.length > 0 ? Math.max(...mAllLoaded) : 30
          const mMax = mAllLoaded.length > 0 ? _mRaw * 1.1 : 30
          const mToFrac = (p: number) => (Math.max(mMin, Math.min(mMax, p)) - mMin) / (mMax - mMin)
          const mTickStep = Math.max(1, Math.ceil((mMax - mMin) / 8))
          const mLabels: number[] = []
          for (let v = mMin; v <= mMax; v += mTickStep) mLabels.push(v)

          const MODAL_LOGO = 98
          const M_BUCKET_STEP = 2.0
          const M_LOGO_CELL = MODAL_LOGO + 8
          const buckets2: Record<number, number> = {}
          const mSpread: { ticker: string; pct: number; isPre: boolean; xOffset: number; labelSide: 'above' | 'below' | 'left' | 'right' }[] = mItems.map(({ ticker, pct, isPre }) => {
            const bucket = Math.round(pct / M_BUCKET_STEP)
            const slot = buckets2[bucket] ?? 0
            buckets2[bucket] = slot + 1
            const xOffset = (slot % 2 === 0 ? -1 : 1) * Math.ceil(slot / 2) * (M_LOGO_CELL + 16)
            return { ticker, pct, isPre, xOffset, labelSide: 'below' as 'above' | 'below' | 'left' | 'right' }
          })
          mSpread.forEach((item) => {
            if (item.xOffset < 0) {
              item.labelSide = 'left'
            } else if (item.xOffset > 0) {
              item.labelSide = 'right'
            } else {
              const hasBelowNeighbor = mSpread.some(o => o !== item && o.pct < item.pct && (item.pct - o.pct) < M_BUCKET_STEP * 2)
              item.labelSide = hasBelowNeighbor ? 'above' : 'below'
            }
          })

          const mIsToday = mDay.toDateString() === today.toDateString()
          return (
            <div
              style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onClick={() => setImpliedModalDay(null)}
            >
              <div
                style={{ width: '90vw', height: '85vh', background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Modal header */}
                <div style={{ padding: '14px 20px', borderBottom: '2px solid #d4af37', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: mIsToday ? 'rgba(249,115,22,0.1)' : '#111' }}>
                  <div>
                    <span style={{ fontSize: 18, fontWeight: 900, letterSpacing: '0.1em', color: mIsToday ? '#fb923c' : '#fff' }}>
                      {DAY_FULL[mIdx]} {MONTH_SHORT[mDay.getMonth()]} {mDay.getDate()} — ALL IMPLIED MOVES
                    </span>
                    <span style={{ marginLeft: 12, fontSize: 12, color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>{mItems.length} tickers loaded</span>
                  </div>
                  <button
                    onClick={() => setImpliedModalDay(null)}
                    style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 6, color: '#fff', width: 28, height: 28, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >✕</button>
                </div>
                {/* Modal chart */}
                <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
                  {/* Y-axis */}
                  <div style={{ width: 48, flexShrink: 0, position: 'relative', borderRight: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                    {mLabels.map((v) => (
                      <div key={v} style={{ position: 'absolute', bottom: `calc(${mToFrac(v) * 100}% - 8px)`, right: 4 }}>
                        <span style={{ fontSize: 15, color: '#fff', fontWeight: 900, fontFamily: 'var(--font-geist-mono, monospace)' }}>{v}%</span>
                      </div>
                    ))}
                  </div>
                  {/* Chart area — paddingBottom reserves room near bottom axis label */}
                  <div style={{ flex: 1, position: 'relative', paddingBottom: 24, paddingTop: 40, overflow: 'hidden' }}>
                    {mLabels.map((v) => (
                      <div key={v} style={{ position: 'absolute', left: 0, right: 0, bottom: `${mToFrac(v) * 100}%`, borderTop: '1px solid rgba(212,175,55,0.35)' }} />
                    ))}
                    {mSpread.map(({ ticker, pct, isPre, xOffset, labelSide }) => {
                      const isHoriz = labelSide === 'left' || labelSide === 'right'
                      const logoEl = (
                        <div style={{ borderRadius: 6, padding: 2, border: `2px solid ${isPre ? 'rgba(251,191,36,0.7)' : 'rgba(0,174,239,0.7)'}` }}>
                          <CompanyLogo ticker={ticker} size={MODAL_LOGO} />
                        </div>
                      )
                      const labelEl = (
                        <span style={{ fontSize: 18, fontWeight: 900, color: '#fff', fontFamily: 'var(--font-geist-mono, monospace)', background: 'rgba(0,0,0,0.75)', padding: '1px 3px', borderRadius: 2, whiteSpace: 'nowrap' }}>{ticker}</span>
                      )
                      return (
                        <div
                          key={ticker}
                          style={{ position: 'absolute', bottom: `${mToFrac(pct) * 100}%`, left: '50%', transform: `translateX(calc(-50% + ${xOffset}px))`, display: 'flex', flexDirection: labelSide === 'above' ? 'column-reverse' : labelSide === 'left' ? 'row-reverse' : labelSide === 'right' ? 'row' : 'column', alignItems: 'center', gap: isHoriz ? 4 : 2 }}
                        >
                          {logoEl}
                          {labelEl}
                        </div>
                      )
                    })}
                    {mItems.length === 0 && (
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 14 }}>No data loaded yet</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })() : null

        return (
          <>
            {modalOverlay}
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              {/* Day headers row — fixed, never scrolls */}
              <div style={{ display: 'grid', gridTemplateColumns: '44px repeat(5, 1fr)', flexShrink: 0, background: '#080808', borderBottom: '2px solid #d4af37' }}>
                <div /> {/* Y-axis spacer */}
                {dayData.map(({ day, dayIdx, isToday, allTickers, hiddenTotal, pendingCount }) => (
                  <div
                    key={dayIdx}
                    style={{ padding: '10px 8px', textAlign: 'center', borderRight: dayIdx < 4 ? '2px solid #d4af37' : 'none', background: isToday ? 'rgba(249,115,22,0.1)' : 'transparent' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <span style={{ fontSize: 14, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', color: isToday ? '#fb923c' : '#ffffff' }}>
                        {DAY_FULL[dayIdx]} {MONTH_SHORT[day.getMonth()]} {day.getDate()}
                      </span>
                      {allTickers.length > MAX_VISIBLE && (
                        <button
                          onClick={() => {
                            setImpliedModalDay(day)
                            allTickers.slice(MAX_VISIBLE).forEach((t) => {
                              impliedQueueRef.current.push({ ticker: t, date: day })
                            })
                            scheduleImpliedProcessing()
                          }}
                          style={{ background: 'rgba(139,92,246,0.25)', border: '1px solid rgba(139,92,246,0.6)', borderRadius: 5, color: '#a78bfa', fontSize: 10, fontWeight: 900, padding: '1px 6px', cursor: 'pointer', lineHeight: '16px', whiteSpace: 'nowrap' }}
                        >
                          +{hiddenTotal}
                        </button>
                      )}
                    </div>
                    {pendingCount > 0 && (
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 700, marginTop: 2 }}>loading {pendingCount}…</div>
                    )}
                  </div>
                ))}
              </div>
              {/* Y-axis + 5-day scatter chart */}
              <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
                {/* Y-axis */}
                <div style={{ width: 44, flexShrink: 0, position: 'relative', borderRight: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                  {yLabels.map((v) => (
                    <div key={v} style={{ position: 'absolute', bottom: `${toFrac(v) * 100}%`, right: 4, transform: 'translateY(50%)' }}>
                      <span style={{ fontSize: 15, color: '#ffffff', fontWeight: 900, fontFamily: 'var(--font-geist-mono, monospace)' }}>{v}%</span>
                    </div>
                  ))}
                </div>
                {/* 5 day columns */}
                <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)' }}>
                  {dayData.map(({ day, dayIdx, rows, isToday, allEvs }) => {
                    // spread logos - wider bucket prevents vertical overlap
                    const LOGO_CELL = LOGO_PX + 8
                    const BUCKET_STEP = 2.0
                    const spread: { ticker: string; pct: number; isPre: boolean; xOffset: number; labelSide: 'above' | 'below' | 'left' | 'right' }[] = []
                    const buckets: Record<number, number> = {}
                    rows.forEach(({ ticker, pct, isPre }) => {
                      const bucket = Math.round(pct / BUCKET_STEP)
                      const slot = buckets[bucket] ?? 0
                      buckets[bucket] = slot + 1
                      spread.push({ ticker, pct, isPre, xOffset: (slot % 2 === 0 ? -1 : 1) * Math.ceil(slot / 2) * (LOGO_CELL + 16), labelSide: 'below' })
                    })
                    spread.forEach((item) => {
                      if (item.xOffset < 0) {
                        item.labelSide = 'left'
                      } else if (item.xOffset > 0) {
                        item.labelSide = 'right'
                      } else {
                        const hasBelowNeighbor = spread.some(o => o !== item && o.pct < item.pct && (item.pct - o.pct) < BUCKET_STEP * 2)
                        item.labelSide = hasBelowNeighbor ? 'above' : 'below'
                      }
                    })
                    return (
                      <div
                        key={dayIdx}
                        style={{ position: 'relative', borderRight: dayIdx < 4 ? '2px solid #d4af37' : 'none', background: isToday ? 'rgba(249,115,22,0.03)' : 'transparent' }}
                      >
                        {/* grid lines */}
                        {yLabels.map((v) => (
                          <div key={v} style={{ position: 'absolute', left: 0, right: 0, bottom: `${toFrac(v) * 100}%`, borderTop: '1px solid rgba(212,175,55,0.35)' }} />
                        ))}
                        {/* logos at Y position */}
                        {spread.map(({ ticker, pct, isPre, xOffset, labelSide }) => {
                          const isHoriz = labelSide === 'left' || labelSide === 'right'
                          const logoEl = (
                            <div style={{ borderRadius: 6, padding: 2, border: `2px solid ${isPre ? 'rgba(251,191,36,0.7)' : 'rgba(0,174,239,0.7)'}` }}>
                              <CompanyLogo ticker={ticker} size={LOGO_PX} />
                            </div>
                          )
                          const labelEl = (
                            <span style={{ fontSize: 16, fontWeight: 900, color: '#ffffff', fontFamily: 'var(--font-geist-mono, monospace)', background: 'rgba(0,0,0,0.75)', padding: '1px 3px', borderRadius: 2, whiteSpace: 'nowrap', lineHeight: 1.3 }}>
                              {ticker}
                            </span>
                          )
                          return (
                            <div
                              key={ticker}
                              style={{ position: 'absolute', bottom: `${toFrac(pct) * 100}%`, left: '50%', transform: `translateX(calc(-50% + ${xOffset}px)) translateY(50%)`, display: 'flex', flexDirection: labelSide === 'above' ? 'column-reverse' : labelSide === 'left' ? 'row-reverse' : labelSide === 'right' ? 'row' : 'column', alignItems: 'center', gap: isHoriz ? 3 : 2 }}
                            >
                              {logoEl}
                              {labelEl}
                            </div>
                          )
                        })}
                        {allEvs.length === 0 && (
                          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ color: 'rgba(255,255,255,0.1)', fontSize: 12, fontWeight: 700 }}>—</span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </>
        )
      }

      // ── LOGOS view (original, unchanged) ────────────────────────────────────
      return (
        <div className="flex flex-col flex-1">
          <div style={{ height: '20px' }} />
          <div
            className="flex-1 grid grid-cols-5"
            style={{ minHeight: '580px', borderLeft: '2px solid #d4af37' }}
          >
            {weekDays.map((day, i) => {
              const preEvs = getWeekEarnings(day, 'Pre-Market')
              const postEvs = getWeekEarnings(day, 'Post-Market')
              const isToday = day.toDateString() === today.toDateString()
              return (
                <div key={i} className={`flex flex-col overflow-hidden ${isToday ? 'bg-orange-500/[0.04]' : ''}`} style={{ borderRight: '2px solid #d4af37' }}>
                  {/* Day header */}
                  <div
                    className={`px-2 py-3 text-center shrink-0 ${isToday ? 'bg-orange-500/10' : 'bg-[#080808]'}`}
                    style={{ borderBottom: '2px solid #d4af37' }}
                  >
                    <div className={`text-[19px] font-black tracking-widest uppercase ${isToday ? 'text-orange-400' : 'text-white'}`}>
                      {DAY_FULL[i]} {MONTH_SHORT[day.getMonth()]} {day.getDate()}
                    </div>
                  </div>

                  {/* Pre-Market | After-Hours side-by-side: 1 col pre + 2 col after */}
                  <div className="flex flex-col flex-1">
                    {/* Section headers */}
                    <div className="grid shrink-0" style={{ gridTemplateColumns: '2fr 3fr', borderBottom: '2px solid #d4af37' }}>
                      <div
                        className="px-2 py-1.5 flex items-center gap-1"
                        style={{ background: 'linear-gradient(90deg,rgba(251,191,36,0.10) 0%,transparent 100%)', borderRight: '2px solid #d4af37' }}
                      >
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                        <span className="text-[15px] font-black uppercase text-amber-300" style={{ letterSpacing: '0.10em', fontFamily: 'var(--font-geist-mono, monospace)' }}>Pre-Market</span>
                      </div>
                      <div
                        className="px-2 py-1.5 flex items-center gap-1"
                        style={{ background: 'linear-gradient(90deg,rgba(0,174,239,0.10) 0%,transparent 100%)' }}
                      >
                        <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />
                        <span className="text-[15px] font-black uppercase text-cyan-300" style={{ letterSpacing: '0.10em', fontFamily: 'var(--font-geist-mono, monospace)' }}>After-Hours</span>
                      </div>
                    </div>
                    {/* Logo grid: pre + after side by side */}
                    <div className="flex-1 grid" style={{ gridTemplateColumns: '2fr 4fr', minHeight: '120px' }}>
                      {/* Pre-Market logos — 2 columns */}
                      <div className="grid grid-cols-2 gap-1.5 p-2 content-start" style={{ borderRight: '2px solid #d4af37' }}>
                        {preEvs.length === 0 ? (
                          <span className="text-xs text-white/15 font-bold italic mt-1 col-span-2">—</span>
                        ) : (
                          preEvs.map((ev, ei) => {
                            const ticker = extractTicker(ev.event)
                            if (!ticker) return null
                            return (
                              <div key={ei} className="flex flex-col items-center gap-0.5 group cursor-default">
                                <CompanyLogo ticker={ticker} size={72} />
                                <span className="text-[11px] font-black text-white">{ticker}</span>
                              </div>
                            )
                          })
                        )}
                      </div>
                      {/* After-Hours logos — 4 columns */}
                      <div className="grid grid-cols-4 gap-1.5 p-2 content-start">
                        {postEvs.length === 0 ? (
                          <span className="text-xs text-white/15 font-bold italic mt-1 col-span-4">—</span>
                        ) : (
                          postEvs.map((ev, ei) => {
                            const ticker = extractTicker(ev.event)
                            if (!ticker) return null
                            return (
                              <div key={ei} className="flex flex-col items-center gap-0.5 group cursor-default">
                                <CompanyLogo ticker={ticker} size={72} />
                                <span className="text-[11px] font-black text-white">{ticker}</span>
                              </div>
                            )
                          })
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )
    }

    // ── MONTHLY VIEW ───────────────────────────────────────────────────────────
    const renderMonthly = () => (
      <div className="flex-1">
        <div className="grid grid-cols-5" style={{ borderBottom: '2px solid #d4af37' }}>
          {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map((d) => (
            <div
              key={d}
              className="py-3 text-center text-xs font-black text-white uppercase tracking-widest bg-[#060606]"
            >
              {d}
            </div>
          ))}
        </div>

        {weeks.map((wk, wi) => (
          <div key={wi} className="grid grid-cols-5" style={{ borderBottom: '2px solid #d4af37' }}>
            {wk.slice(1, 6).map((day, di) => {
              if (!day)
                return (
                  <div
                    key={di}
                    className="bg-[#030303] min-h-[200px]"
                    style={{ borderRight: '2px solid #d4af37' }}
                  />
                )
              const dayEvs = monthEventMap[day] ?? []
              const isToday = day === todayNum
              const isSelected = day === selectedCalDate
              const earningEvs = dayEvs.filter((e) => e.type === 'earnings')
              const holidayEvs = dayEvs.filter((e) => e.type === 'holiday')
              const otherEvs = dayEvs.filter((e) => e.type !== 'earnings' && e.type !== 'holiday')
              return (
                <div
                  key={di}
                  onClick={() => setSelectedCalDate(isSelected ? null : day)}
                  style={{ borderRight: '2px solid #d4af37' }}
                  className={`relative min-h-[200px] p-1.5 cursor-pointer transition-all flex flex-col ${isSelected
                    ? 'bg-orange-500/10 ring-1 ring-inset ring-orange-500/50'
                    : isToday
                      ? 'bg-orange-500/5'
                      : dayEvs.length > 0
                        ? 'hover:bg-white/[0.02]'
                        : 'hover:bg-white/[0.01]'
                    }`}
                >
                  {/* Day number */}
                  <div className="mb-2">
                    {isToday ? (
                      <span className="inline-flex items-center justify-center w-7 h-7 bg-orange-500 text-black rounded-full font-black text-sm">
                        {day}
                      </span>
                    ) : (
                      <span
                        className={`text-sm font-black ${isSelected ? 'text-orange-400' : dayEvs.length > 0 ? 'text-white' : 'text-white/25'}`}
                      >
                        {day}
                      </span>
                    )}
                  </div>

                  {/* Holiday badge */}
                  {holidayEvs.map((ev, ei) => (
                    <div
                      key={`h${ei}`}
                      className="text-[10px] font-black px-1 py-0.5 rounded mb-1 truncate bg-yellow-500/20 text-yellow-300 border border-yellow-500/30"
                    >
                      🚫 CLOSED
                    </div>
                  ))}

                  {/* Earnings logos — split by Pre/Post Market, sorted by importance */}
                  {calView === 'earnings' && earningEvs.length > 0 && (() => {
                    const importanceOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
                    const sortByImportance = (evs: typeof earningEvs) =>
                      [...evs].sort((a, b) => (importanceOrder[a.importance] ?? 9) - (importanceOrder[b.importance] ?? 9))
                    const preEvs = sortByImportance(earningEvs.filter((e) => e.time === 'Pre-Market'))
                    const postEvs = sortByImportance(earningEvs.filter((e) => e.time === 'Post-Market'))
                    console.log(`[CAL DEBUG] day=${day} earningEvs=${earningEvs.length} preEvs=${preEvs.length} postEvs=${postEvs.length}`, earningEvs.map(e => e.time))

                    // Layout: 6-col grid per row — col 1-2 = pre-market, col 3-6 = post-market
                    const PRE_COLS = 2
                    const POST_COLS = 4
                    const FIXED_ROWS = 2

                    const renderCell = (ev: typeof earningEvs[0] | undefined, key: string, accent?: string) => {
                      if (!ev) return <div key={key} style={{ aspectRatio: '1 / 1' }} />
                      const ticker = extractTicker(ev.event)
                      if (!ticker) return <div key={key} style={{ aspectRatio: '1 / 1' }} />
                      return (
                        <div key={key} className="relative" style={{ aspectRatio: '1 / 1' }}>
                          <CompanyLogo ticker={ticker} fluid />
                          {accent && (
                            <div className="absolute top-0 left-0 w-1 h-full" style={{ background: accent, opacity: 0.7 }} />
                          )}
                          <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.65)', padding: '1px 0' }}>
                            <span className="text-white font-black leading-none truncate px-0.5" style={{ fontSize: '12px' }}>{ticker}</span>
                          </div>
                        </div>
                      )
                    }

                    const preOverflow = preEvs.length - FIXED_ROWS * PRE_COLS
                    const postOverflow = postEvs.length - FIXED_ROWS * POST_COLS

                    return (
                      <div className="flex-1 flex flex-col" style={{ minHeight: 0 }}>
                        {/* Column headers */}
                        <div style={{ display: 'grid', gridTemplateColumns: `repeat(6, 1fr)`, gap: '2px', marginBottom: '2px' }}>
                          <div className="col-span-2 flex items-center gap-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                            <span className="font-black uppercase" style={{ fontSize: '13px', letterSpacing: '0.10em', fontFamily: 'var(--font-geist-mono, monospace)', color: '#fbbf24' }}>Pre-Market</span>
                          </div>
                          <div className="col-span-4 flex items-center gap-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />
                            <span className="font-black uppercase" style={{ fontSize: '13px', letterSpacing: '0.10em', fontFamily: 'var(--font-geist-mono, monospace)', color: '#22d3ee' }}>After-Hours</span>
                          </div>
                        </div>
                        {/* Unified grid */}
                        <div className="flex-1" style={{
                          display: 'grid',
                          gridTemplateColumns: `repeat(6, 1fr)`,
                          gridTemplateRows: `repeat(${FIXED_ROWS}, 1fr)`,
                          gap: '2px',
                        }}>
                          {Array.from({ length: FIXED_ROWS }, (_, r) => (
                            <>
                              {/* Pre cols 1-2 */}
                              {Array.from({ length: PRE_COLS }, (_, c) =>
                                renderCell(preEvs[r * PRE_COLS + c], `pre-${r}-${c}`, '#f59e0b')
                              )}
                              {/* Post cols 3-6 */}
                              {Array.from({ length: POST_COLS }, (_, c) =>
                                renderCell(postEvs[r * POST_COLS + c], `post-${r}-${c}`, '#6366f1')
                              )}
                            </>
                          ))}
                        </div>
                        {(preOverflow > 0 || postOverflow > 0) && (
                          <div className="flex gap-2 text-[9px] font-black pl-0.5 pt-0.5">
                            {preOverflow > 0 && <span className="text-amber-400/60">+{preOverflow} pre</span>}
                            {postOverflow > 0 && <span className="text-indigo-400/60">+{postOverflow} post</span>}
                          </div>
                        )}
                      </div>
                    )
                  })()}

                  {/* Non-earnings economic/fed events */}
                  {calView !== 'earnings' &&
                    otherEvs.slice(0, 3).map((ev, ei) => {
                      const isHol = ev.type === 'holiday'
                      return (
                        <div
                          key={ei}
                          className={`text-[10px] font-black px-1 py-0.5 rounded mb-0.5 truncate border ${isHol
                            ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'
                            : ev.importance === 'critical'
                              ? 'bg-red-500/20 text-red-300 border-red-500/30'
                              : ev.importance === 'high'
                                ? 'bg-orange-500/15 text-orange-300 border-orange-500/25'
                                : ev.type === 'fed'
                                  ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/25'
                                  : 'bg-white/5 text-white/50 border-white/10'
                            }`}
                        >
                          {ev.event.split(' ').slice(0, 2).join(' ')}
                        </div>
                      )
                    })}
                  {calView !== 'earnings' && otherEvs.length > 3 && (
                    <div className="text-[10px] font-black text-white/30 pl-0.5">
                      +{otherEvs.length - 3}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    )

    return (
      <div className="flex flex-col" style={{ minHeight: '100%' }}>

        {/* ── HEADER ── */}
        <div className="px-5 pt-5 pb-4 border-b border-white/[0.06] bg-[#080808] sticky top-0 z-10">
          {/* Row 1: view toggles + nav */}
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            {/* Left toggles */}
            <div className="flex items-center gap-3 flex-wrap">
              {/* Importance filter dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowFilterDropdown((v) => !v)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black uppercase tracking-widest border border-white/10 text-white/60 hover:text-white hover:border-white/30 transition-all"
                  style={{ background: 'linear-gradient(180deg, #1a1a1a 0%, #0d0d0d 100%)' }}
                >
                  <span>SHOW</span>
                  <div className="flex items-center gap-1">
                    {(['critical', 'high', 'medium', 'low'] as const).filter(id => calImportanceFilter.has(id)).map(id => (
                      <div key={id} className={`w-2 h-2 rounded-full ${{ critical: 'bg-red-500', high: 'bg-orange-400', medium: 'bg-amber-400', low: 'bg-white/30' }[id]}`} />
                    ))}
                  </div>
                  <svg className={`w-3.5 h-3.5 transition-transform ${showFilterDropdown ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 12 12"><path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
                {showFilterDropdown && (
                  <div
                    className="absolute left-0 top-full mt-2 z-50 rounded-xl border border-white/10 p-2 flex flex-col gap-1 min-w-[160px]"
                    style={{ background: 'linear-gradient(180deg, #1a1a1a 0%, #0d0d0d 100%)', boxShadow: '0 8px 24px rgba(0,0,0,0.6)' }}
                  >
                    {[
                      { id: 'critical', label: 'Critical', color: 'text-red-400', dot: 'bg-red-500' },
                      { id: 'high', label: 'High', color: 'text-orange-300', dot: 'bg-orange-400' },
                      { id: 'medium', label: 'Medium', color: 'text-amber-300', dot: 'bg-amber-400' },
                      { id: 'low', label: 'Low', color: 'text-white/40', dot: 'bg-white/30' },
                    ].map(({ id, label, color, dot }) => (
                      <button
                        key={id}
                        onClick={() => toggleCalImp(id)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-white/5 transition-all w-full"
                      >
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all shrink-0 ${calImportanceFilter.has(id) ? 'border-orange-500 bg-orange-500' : 'border-white/20'
                          }`}>
                          {calImportanceFilter.has(id) && (
                            <svg className="w-2.5 h-2.5 text-black" fill="none" viewBox="0 0 12 12">
                              <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </div>
                        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${dot}`} />
                        <span className={`text-sm font-black ${color}`}>{label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Monthly / Weekly */}
              <div
                className="flex items-center bg-[#0a0a0a] rounded-2xl p-1.5 border border-white/10 gap-1.5"
                style={{
                  boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.04)',
                }}
              >
                {[
                  { id: 'monthly' as const, label: 'MONTHLY', icon: TbCalendar },
                  { id: 'weekly' as const, label: 'WEEKLY', icon: TbChartBar },
                ].map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setCalViewMode(id)}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black uppercase tracking-widest transition-all ${calViewMode === id
                      ? 'text-orange-400 border border-orange-500/60'
                      : 'text-white border border-transparent hover:text-orange-300'
                      }`}
                    style={
                      calViewMode === id
                        ? {
                          background: 'linear-gradient(180deg, #1a1a1a 0%, #0d0d0d 100%)',
                          boxShadow:
                            '0 2px 8px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08), 0 0 12px rgba(249,115,22,0.15)',
                        }
                        : {
                          background: 'transparent',
                        }
                    }
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {label}
                  </button>
                ))}
              </div>

              {/* LOGOS / IMPLIED MOVE sub-view toggle — only in weekly mode */}
              {calViewMode === 'weekly' && (
                <div className="flex items-center gap-2">
                  <div
                    className="flex items-center bg-[#0a0a0a] rounded-2xl p-1.5 border border-white/10 gap-1.5"
                    style={{ boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.04)' }}
                  >
                    {([
                      { id: 'logos' as const, label: 'LOGOS' },
                      { id: 'implied' as const, label: 'IMPLIED MOVE' },
                    ] as const).map(({ id, label }) => (
                      <button
                        key={id}
                        onClick={() => setWeeklySubView(id)}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black uppercase tracking-widest transition-all ${weeklySubView === id
                          ? 'text-purple-400 border border-purple-500/60'
                          : 'text-white border border-transparent hover:text-purple-300'
                          }`}
                        style={weeklySubView === id
                          ? {
                            background: 'linear-gradient(180deg, #1a1a1a 0%, #0d0d0d 100%)',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08), 0 0 12px rgba(168,85,247,0.15)',
                          }
                          : { background: 'transparent' }
                        }
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {/* Week prev/next navigation — only shown in implied sub-view */}
                  {weeklySubView === 'implied' && (
                    <div
                      className="flex items-center bg-[#0a0a0a] rounded-2xl p-1.5 border border-white/10 gap-1"
                      style={{ boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.04)' }}
                    >
                      <button
                        onClick={() => shiftWeek(-1)}
                        className="w-8 h-8 flex items-center justify-center rounded-xl text-white hover:text-purple-300 transition-all border border-transparent hover:border-purple-500/40"
                        title="Previous week"
                      >
                        <TbChevronLeft className="w-4 h-4" />
                      </button>
                      <span className="text-purple-300 font-black text-xs tracking-widest px-2 whitespace-nowrap">
                        {MONTH_SHORT[calWeekOf.getMonth()]} {calWeekOf.getDate()} – {MONTH_SHORT[new Date(calWeekOf.getTime() + 4 * 86400000).getMonth()]} {new Date(calWeekOf.getTime() + 4 * 86400000).getDate()}
                      </span>
                      <button
                        onClick={() => shiftWeek(1)}
                        className="w-8 h-8 flex items-center justify-center rounded-xl text-white hover:text-purple-300 transition-all border border-transparent hover:border-purple-500/40"
                        title="Next week"
                      >
                        <TbChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Earnings / Economic */}
              <div
                className="flex items-center bg-[#0a0a0a] rounded-2xl p-1.5 border border-white/10 gap-1.5"
                style={{
                  boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.04)',
                }}
              >
                {[
                  { id: 'earnings' as const, label: 'EARNINGS', icon: TbChartBar },
                  { id: 'events' as const, label: 'ECONOMIC', icon: TbActivity },
                ].map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setCalView(id)}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black uppercase tracking-widest transition-all ${calView === id
                      ? 'text-orange-400 border border-orange-500/60'
                      : 'text-white border border-transparent hover:text-orange-300'
                      }`}
                    style={
                      calView === id
                        ? {
                          background: 'linear-gradient(180deg, #1a1a1a 0%, #0d0d0d 100%)',
                          boxShadow:
                            '0 2px 8px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08), 0 0 12px rgba(249,115,22,0.15)',
                        }
                        : {
                          background: 'transparent',
                        }
                    }
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Navigation */}
            <div className="flex items-center gap-3">
              {calViewMode === 'monthly' ? (
                <>
                  <button
                    onClick={() =>
                      setCalMonth((m) => {
                        const d = new Date(m.year, m.month - 1, 1)
                        return { year: d.getFullYear(), month: d.getMonth() }
                      })
                    }
                    className="w-12 h-12 flex items-center justify-center rounded-2xl text-white hover:text-orange-400 transition-all border border-white/10 hover:border-orange-500/50"
                    style={{
                      background: 'linear-gradient(180deg, #1e1e1e 0%, #111 100%)',
                      boxShadow:
                        '0 4px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(0,0,0,0.4)',
                    }}
                  >
                    <TbChevronLeft className="w-6 h-6" />
                  </button>
                  <span className="text-white font-black text-3xl tracking-wide px-3 min-w-[220px] text-center">
                    {MONTH_NAMES[month]} {year}
                  </span>
                  <button
                    onClick={() =>
                      setCalMonth((m) => {
                        const d = new Date(m.year, m.month + 1, 1)
                        return { year: d.getFullYear(), month: d.getMonth() }
                      })
                    }
                    className="w-12 h-12 flex items-center justify-center rounded-2xl text-white hover:text-orange-400 transition-all border border-white/10 hover:border-orange-500/50"
                    style={{
                      background: 'linear-gradient(180deg, #1e1e1e 0%, #111 100%)',
                      boxShadow:
                        '0 4px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(0,0,0,0.4)',
                    }}
                  >
                    <TbChevronRight className="w-6 h-6" />
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => shiftWeek(-1)}
                    className="w-12 h-12 flex items-center justify-center rounded-2xl text-white hover:text-orange-400 transition-all border border-white/10 hover:border-orange-500/50"
                    style={{
                      background: 'linear-gradient(180deg, #1e1e1e 0%, #111 100%)',
                      boxShadow:
                        '0 4px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(0,0,0,0.4)',
                    }}
                  >
                    <TbChevronLeft className="w-6 h-6" />
                  </button>
                  <span className="text-white font-black text-2xl tracking-wide px-3 min-w-[260px] text-center">
                    Week of {MONTH_SHORT[calWeekOf.getMonth()]} {calWeekOf.getDate()},{' '}
                    {calWeekOf.getFullYear()}
                  </span>
                  <button
                    onClick={() => shiftWeek(1)}
                    className="w-12 h-12 flex items-center justify-center rounded-2xl text-white hover:text-orange-400 transition-all border border-white/10 hover:border-orange-500/50"
                    style={{
                      background: 'linear-gradient(180deg, #1e1e1e 0%, #111 100%)',
                      boxShadow:
                        '0 4px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(0,0,0,0.4)',
                    }}
                  >
                    <TbChevronRight className="w-6 h-6" />
                  </button>
                </>
              )}
            </div>
          </div>

        </div>

        {/* ── CONTENT ── */}
        {calViewMode === 'weekly' ? renderWeekly() : renderMonthly()}

        {/* ── SELECTED DAY DETAIL (monthly only) ── */}
        {calViewMode === 'monthly' && selectedCalDate !== null && (
          <div className="border-t-2 border-orange-500/40 bg-[#080808] shrink-0">
            <div className="px-6 pt-5 pb-2 flex items-center justify-between">
              <span className="text-white font-black text-xl">
                {MONTH_SHORT[month]} {selectedCalDate}, {year}
                {selectedDayEvents.length === 0 && (
                  <span className="text-white/30 text-base font-bold ml-3">No events</span>
                )}
              </span>
              <button
                onClick={() => setSelectedCalDate(null)}
                className="text-white/30 hover:text-white transition-colors p-1"
              >
                <TbX className="w-5 h-5" />
              </button>
            </div>
            {selectedDayEvents.length > 0 && (
              <div className="divide-y divide-white/[0.05] max-h-64 overflow-y-auto">
                {selectedDayEvents.map((ev, idx) => (
                  <div
                    key={idx}
                    className={`flex items-start gap-4 px-6 py-4 ${ev.type === 'holiday'
                      ? 'border-l-4 border-l-yellow-400 bg-yellow-950/20'
                      : ev.importance === 'critical'
                        ? 'border-l-4 border-l-red-500'
                        : ev.importance === 'high'
                          ? 'border-l-4 border-l-orange-400'
                          : ''
                      }`}
                  >
                    {typeIcon(ev.type)}
                    <div className="flex-1 min-w-0">
                      <p
                        className={`font-black text-lg leading-tight ${ev.type === 'holiday'
                          ? 'text-yellow-300'
                          : ev.importance === 'critical'
                            ? 'text-white'
                            : 'text-white/90'
                          }`}
                      >
                        {ev.event}
                      </p>
                      <div className="flex items-center gap-4 mt-2 flex-wrap">
                        <span
                          className={`text-sm font-black ${ev.importance === 'critical'
                            ? 'text-red-300'
                            : ev.importance === 'high'
                              ? 'text-orange-300'
                              : 'text-white/50'
                            }`}
                        >
                          {ev.time}
                        </span>
                        {ev.forecast && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-white/30 uppercase font-black">Est</span>
                            <span className="text-base font-black text-cyan-300">
                              {ev.forecast}
                            </span>
                          </div>
                        )}
                        {ev.prior && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-white/30 uppercase font-black">
                              Prior
                            </span>
                            <span className="text-base font-black text-white/60">{ev.prior}</span>
                          </div>
                        )}
                        {ev.actual && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-white/30 uppercase font-black">
                              Actual
                            </span>
                            <span
                              className={`text-base font-black ${ev.beat === true ? 'text-emerald-400' : ev.beat === false ? 'text-red-400' : 'text-white'}`}
                            >
                              {ev.actual}
                            </span>
                            {ev.beat === true && (
                              <span className="px-2 py-0.5 bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-xs font-black rounded">
                                BEAT
                              </span>
                            )}
                            {ev.beat === false && (
                              <span className="px-2 py-0.5 bg-red-500/20 border border-red-500/40 text-red-400 text-xs font-black rounded">
                                MISS
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }
  // ══════════════════════════════════════════════════════════════════════════
  // MAIN RENDER
  // ══════════════════════════════════════════════════════════════════════════
  const tabs = [
    { id: 'breaking' as const, label: 'BREAKING', icon: TbFlame },
    { id: 'feed' as const, label: 'LIVE FEED', icon: TbNews },
    { id: 'movers' as const, label: 'MOVERS', icon: TbActivity },
    { id: 'calendar' as const, label: 'CALENDAR', icon: TbCalendar },
  ]

  return (
    <div className="h-full flex flex-col bg-[#050505]">
      {/* SCROLLING TICKER */}
      <div
        className="relative overflow-hidden h-10 shrink-0 flex items-center select-none"
        style={{ background: 'linear-gradient(90deg, #7f1d1d 0%, #991b1b 40%, #7f1d1d 100%)' }}
      >
        <div
          className="absolute left-0 top-0 bottom-0 z-10 flex items-center gap-2 px-4"
          style={{
            background: 'linear-gradient(90deg, #b91c1c 0%, #991b1b 100%)',
            borderRight: '1px solid #ef4444',
          }}
        >
          <TbFlame className="w-5 h-5 text-white animate-pulse shrink-0" />
          <span className="text-white text-sm font-black tracking-[0.2em] uppercase whitespace-nowrap">
            BREAKING
          </span>
        </div>
        <div
          className="absolute right-0 top-0 bottom-0 z-10 flex items-center px-4 gap-2"
          style={{
            background: 'linear-gradient(90deg, transparent, #7f1d1d 30%, #991b1b 100%)',
            borderLeft: '1px solid #ef444440',
          }}
        >
          <TbClock className="w-4 h-4 text-red-200 shrink-0" />
          <span className="text-red-100 text-sm font-black tracking-wider whitespace-nowrap">
            {clock}
          </span>
        </div>
        <div className="overflow-hidden pl-44 pr-44 w-full">
          {tickerText ? (
            <div className="whitespace-nowrap text-red-50 text-sm font-bold news-ticker-scroll">
              {tickerText}&nbsp;&nbsp;&nbsp;●&nbsp;&nbsp;&nbsp;{tickerText}
            </div>
          ) : (
            <div className="text-red-100 text-sm font-bold animate-pulse pl-4">Loading…</div>
          )}
        </div>
      </div>

      {/* SEARCH BAR — hidden on calendar tab */}
      {activeTab !== 'calendar' && (
        <div className="px-5 py-4 border-b border-white/[0.07] bg-[#090909] shrink-0">
          <form onSubmit={handleSearch} className="flex items-center gap-3">
            <div className="flex-1 flex items-center bg-[#0e0e0e] border-2 border-white/10 rounded-xl focus-within:border-orange-500 transition-all overflow-hidden">
              <TbSearch className="w-5 h-5 text-orange-400 ml-4 shrink-0" />
              <input
                type="text"
                value={searchTicker}
                onChange={(e) => setSearchTicker(e.target.value)}
                placeholder="Search ticker, keyword, sector… e.g. AAPL, tariffs, Energy"
                className="flex-1 px-3 py-4 bg-transparent text-white placeholder-white/25 focus:outline-none font-mono text-base tracking-wider"
              />
              {searchTicker && (
                <button
                  type="button"
                  onClick={() => setSearchTicker('')}
                  className="mr-2 text-white/30 hover:text-white transition-colors p-1.5"
                >
                  <TbX className="w-4 h-4" />
                </button>
              )}
              <button
                type="submit"
                className="mr-2 px-5 py-2.5 bg-orange-500 hover:bg-orange-400 text-black font-black text-sm rounded-lg transition-all uppercase tracking-widest shrink-0"
              >
                GO
              </button>
            </div>

            {articles.length > 0 && (
              <span className="text-xs text-white/25 font-bold shrink-0 whitespace-nowrap">
                {lastRefresh.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}

            {marketSentiment && (
              <div
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-black uppercase tracking-widest shrink-0 ${marketSentiment.overall_sentiment === 'bullish'
                  ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                  : marketSentiment.overall_sentiment === 'bearish'
                    ? 'bg-red-500/10 border-red-500/40 text-red-400'
                    : 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                  }`}
              >
                {marketSentiment.overall_sentiment === 'bullish' ? (
                  <TbTrendingUp className="w-4 h-4" />
                ) : marketSentiment.overall_sentiment === 'bearish' ? (
                  <TbTrendingDown className="w-4 h-4" />
                ) : (
                  <TbTarget className="w-4 h-4" />
                )}
                {marketSentiment.overall_sentiment.toUpperCase()}
              </div>
            )}

            <button
              type="button"
              onClick={() => fetchNews(searchTicker)}
              className="flex items-center justify-center w-11 h-11 bg-[#111] hover:bg-[#1a1a1a] rounded-xl border border-white/10 hover:border-orange-500/50 transition-all group shrink-0"
              title="Refresh feed"
            >
              <TbRefresh
                className={`w-5 h-5 text-white/50 group-hover:text-orange-400 transition-colors ${loading ? 'animate-spin' : ''}`}
              />
            </button>

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close panel"
                className="flex items-center justify-center w-11 h-11 rounded-xl border border-red-700/60 text-red-400 hover:text-white hover:border-red-500 transition-all shrink-0 active:scale-95"
                style={{ background: 'linear-gradient(145deg,#7f1d1d,#450a0a)' }}
              >
                <TbX className="w-5 h-5" />
              </button>
            )}
          </form>
        </div>
      )}      {/* TAB BAR */}
      <div className="flex border-b border-white/[0.07] bg-[#0a0a0a] shrink-0">
        {tabs.map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id
          return (
            <button
              key={id}
              onClick={() => {
                setActiveTab(id)
                onTabChange?.(id)
                savedScrollPos.current = 0
              }}
              className={`flex-1 flex items-center justify-center gap-3 py-4 text-xl font-black tracking-widest uppercase transition-all relative ${isActive
                ? 'bg-black text-orange-500'
                : 'text-white hover:text-orange-300 hover:bg-[#111]'
                }`}
            >
              <Icon
                className={`w-6 h-6 shrink-0 ${isActive
                  ? id === 'breaking'
                    ? 'text-orange-500'
                    : 'text-orange-500'
                  : id === 'breaking'
                    ? 'text-red-400'
                    : 'text-white'
                  }`}
              />
              <span className="hidden sm:inline">{label}</span>
              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-orange-500" />
              )}
            </button>
          )
        })}
      </div>

      {/* CONTENT */}
      <div className="flex-1 overflow-hidden bg-[#050505]">
        {loading && articles.length === 0 ? (
          renderLoader()
        ) : error ? (
          renderError()
        ) : (
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="h-full overflow-y-auto"
            style={{ scrollbarWidth: 'thin', scrollbarColor: '#f97316 #0a0a0a' }}
          >
            {activeTab === 'breaking' && renderBreaking()}
            {activeTab === 'feed' && renderFeed()}
            {activeTab === 'movers' && renderMovers()}
            {activeTab === 'calendar' && renderCalendar()}
          </div>
        )}
      </div>

      {/* FOOTER */}
      <div className="border-t border-white/[0.07] px-5 py-3 bg-[#080808] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-sm font-black text-emerald-400 uppercase tracking-widest">
            Markets Open
          </span>
        </div>
        <span className="text-sm text-white/50 font-bold">
          Updated {lastRefresh.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
        </span>
        <span className="text-sm text-orange-400/70 font-black uppercase tracking-widest">
          EFI Terminal
        </span>
      </div>

      <style jsx>{`
        .news-ticker-scroll {
          animation: newsTicker 75s linear infinite;
        }
        @keyframes newsTicker {
          0% {
            transform: translateX(0%);
          }
          100% {
            transform: translateX(-50%);
          }
        }
      `}</style>
    </div>
  )
}

export default NewsPanelV2
