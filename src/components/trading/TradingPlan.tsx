'use client'

import { createPortal } from 'react-dom'
import {
  TbActivity,
  TbAlertTriangle,
  TbAnalyze,
  TbArrowDown,
  TbArrowUp,
  TbCalendar,
  TbCamera,
  TbChartLine,
  TbCheck,
  TbClipboard,
  TbClock,
  TbCurrencyDollar,
  TbDatabase,
  TbDownload,
  TbEdit,
  TbEye,
  TbFileText,
  TbFilter,
  TbPercentage,
  TbPlus,
  TbRefresh,
  TbSettings,
  TbTag,
  TbTarget,
  TbTrash,
  TbTrendingDown,
  TbTrendingUp,
  TbX,
} from 'react-icons/tb'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import OptionsChain from './OptionsChain'

interface Trade {
  id: string
  symbol: string
  type: 'long' | 'short' | 'call' | 'put' | 'spread'
  strategy: string
  setup: string
  entryPrice: number
  exitPrice?: number
  quantity: number
  entryDate: string
  entryTime?: string
  exitDate?: string
  exitTime?: string
  pnl?: number
  pnlPercent?: number
  status: 'open' | 'closed' | 'partial'
  stopLoss?: number
  takeProfit?: number
  target2?: number
  fees?: number
  maxRisk: number
  notes: string
  tags: string[]
  currentPrice?: number
  currentOptionPrice?: number
  unrealizedPnL?: number
  realizedPnL?: number
  commission?: number
  slippage?: number
  timeInTrade?: number
  sector?: string
  sentiment?: 'bullish' | 'bearish' | 'neutral'
  confidence: number // 1-5 scale
  // Options-specific fields
  isOptions?: boolean
  strike?: number
  expiry?: string
  optionType?: 'call' | 'put'
  contractSize?: number
  premium?: number
  impliedVolatility?: number
  delta?: number
  gamma?: number
  theta?: number
  vega?: number
  underlyingPrice?: number
  daysToExpiry?: number
  intrinsicValue?: number
  timeValue?: number
}

interface TradingGoal {
  id: string
  title: string
  description: string
  category: 'performance' | 'risk' | 'skill'
  target: number
  targetValue: number
  current: number
  currentValue: number
  progress: number
  unit: string
  deadline: string
  period: 'daily' | 'weekly' | 'monthly' | 'yearly'
  type: 'profit' | 'winRate' | 'trades' | 'maxDrawdown' | 'sharpeRatio'
  createdDate: string
  targetDate: string
  isActive: boolean
}

interface MarketData {
  symbol: string
  price: number
  change: number
  changePercent: number
  timestamp: number
}

interface PerformanceMetrics {
  totalTrades: number
  winningTrades: number
  losingTrades: number
  winRate: number
  totalPnL: number
  totalFees: number
  netPnL: number
  avgWin: number
  avgLoss: number
  profitFactor: number
  maxDrawdown: number
  maxDrawdownPercent: number
  sharpeRatio: number
  calmarRatio: number
  largestWin: number
  largestLoss: number
  avgHoldTime: number
  totalRisk: number
  riskAdjustedReturn: number
}

interface TradingPlanProps {
  optionsContent?: React.ReactNode
  flowContent?: React.ReactNode
}

const TradingPlan: React.FC<TradingPlanProps> = ({ optionsContent, flowContent }) => {
  const [activeTab, setActiveTab] = useState<
    'journal' | 'analytics' | 'options' | 'flow' | 'settings'
  >('journal')
  const [trades, setTrades] = useState<Trade[]>(() => {
    try {
      const saved = localStorage.getItem('tradingPlanTrades')
      if (!saved) return []
      const parsed: Trade[] = JSON.parse(saved)
      // Sanitize on load: wipe any stale currentOptionPrice/unrealizedPnL that are stock prices
      return parsed.map((trade) => {
        if (trade.isOptions) {
          const maxOptionPrice = (trade.strike || 9999) * 0.5
          const badOptionPrice =
            trade.currentOptionPrice != null && trade.currentOptionPrice >= maxOptionPrice
          if (badOptionPrice) {
            return { ...trade, currentOptionPrice: undefined, unrealizedPnL: undefined }
          }
        }
        return trade
      })
    } catch {
      return []
    }
  })
  const [goals, setGoals] = useState<TradingGoal[]>(() => {
    try {
      const saved = localStorage.getItem('tradingPlanGoals')
      if (saved) return JSON.parse(saved)
    } catch {
      /* fall through to defaults */
    }
    return []
  })
  const [showAddTrade, setShowAddTrade] = useState(false)
  const [showAddGoal, setShowAddGoal] = useState(false)
  const [showTradeDetails, setShowTradeDetails] = useState(false)
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null)
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null)
  const [editingGoal, setEditingGoal] = useState<TradingGoal | null>(null)
  const [marketData, setMarketData] = useState<{ [symbol: string]: MarketData }>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [accountSize, setAccountSize] = useState(100000)
  const [maxRiskPerTrade, setMaxRiskPerTrade] = useState(2)
  const [filters, setFilters] = useState({
    strategy: '',
    status: '',
    symbol: '',
    type: '',
    dateFrom: '',
    dateTo: '',
    minPnL: '',
    maxPnL: '',
  })
  const [showFilterPanel, setShowFilterPanel] = useState(false)
  // Broker import state
  const [importBroker, setImportBroker] = useState<'tos' | 'robinhood' | 'webull'>('tos')
  const [importDragging, setImportDragging] = useState(false)
  const [importStatus, setImportStatus] = useState<
    'idle' | 'parsing' | 'preview' | 'done' | 'error'
  >('idle')
  const [importError, setImportError] = useState<string>('')
  const [importPreview, setImportPreview] = useState<Trade[]>([])
  const [importFileName, setImportFileName] = useState<string>('')

  // ── AddTradeModal state lifted here so component remounts don't reset it ──
  const [tradeFormData, setTradeFormData] = useState({
    symbol: '',
    type: 'long',
    entryPrice: 0,
    quantity: 0,
    stopLoss: 0,
    takeProfit: 0,
    target1: 0,
    target2: 0,
    maxRisk: 0,
    notes: '',
    tags: '',
    confidence: 3,
    sentiment: 'neutral',
    isOptions: false,
    strike: 0,
    expiry: '',
    optionType: 'call',
    contractSize: 100,
    premium: 0,
    impliedVolatility: 0,
  })
  const [fetchingPrice, setFetchingPrice] = useState(false)

  // Reset form whenever the modal opens
  useEffect(() => {
    if (showAddTrade) {
      setTradeFormData({
        symbol: editingTrade?.symbol || '',
        type: editingTrade?.type || 'long',
        entryPrice: editingTrade?.entryPrice || 0,
        quantity: editingTrade?.quantity || 0,
        stopLoss: editingTrade?.stopLoss || 0,
        takeProfit: editingTrade?.takeProfit || 0,
        target1: editingTrade?.takeProfit || 0,
        target2: 0,
        maxRisk: editingTrade?.maxRisk || (accountSize * maxRiskPerTrade) / 100,
        notes: editingTrade?.notes || '',
        tags: editingTrade?.tags?.join(', ') || '',
        confidence: editingTrade?.confidence || 3,
        sentiment: editingTrade?.sentiment || 'neutral',
        isOptions: editingTrade?.isOptions || false,
        strike: editingTrade?.strike || 0,
        expiry: editingTrade?.expiry || '',
        optionType: editingTrade?.optionType || 'call',
        contractSize: editingTrade?.contractSize || 100,
        premium: editingTrade?.premium || 0,
        impliedVolatility: editingTrade?.impliedVolatility || 0,
      })
      setFetchingPrice(false)
    }
  }, [showAddTrade]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchCurrentPrice = useCallback(async () => {
    if (!tradeFormData.symbol) return
    setFetchingPrice(true)
    try {
      const response = await fetch(
        `https://api.polygon.io/v2/last/trade/${tradeFormData.symbol.toUpperCase()}?apikey=${POLYGON_API_KEY}`
      )
      const data = await response.json()
      if (data.status === 'OK' && data.results) {
        setTradeFormData((prev) => ({ ...prev, entryPrice: data.results.p }))
      }
    } catch (e) {
      console.error('Failed to fetch price:', e)
    } finally {
      setFetchingPrice(false)
    }
  }, [tradeFormData.symbol])

  const calculatePositionSize = useCallback(() => {
    setTradeFormData((prev) => {
      if (prev.entryPrice && prev.stopLoss && prev.maxRisk) {
        const riskPerShare = Math.abs(prev.entryPrice - prev.stopLoss)
        return { ...prev, quantity: Math.floor(prev.maxRisk / riskPerShare) }
      }
      return prev
    })
  }, [])

  // Fetch current option premium prices for open options trades and update unrealizedPnL
  useEffect(() => {
    const POLY_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf'
    const openOptionTrades = trades.filter(
      (t) => t.isOptions && t.status === 'open' && t.strike && t.expiry
    )
    if (openOptionTrades.length === 0) return

    const fmtDate = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const lastTradingDay = (d: Date, extraDays = 0): Date => {
      const r = new Date(d)
      r.setDate(r.getDate() - extraDays)
      while (r.getDay() === 0 || r.getDay() === 6) r.setDate(r.getDate() - 1)
      return r
    }
    const toDate = lastTradingDay(new Date(), 1)
    const fromDate = lastTradingDay(toDate, 1)
    const toStr = fmtDate(toDate)
    const fromStr = fmtDate(fromDate)

    const fetchPrices = async () => {
      const updates: { id: string; price: number }[] = []
      await Promise.all(
        openOptionTrades.map(async (trade) => {
          try {
            const expRaw = trade.expiry!.replace(/-/g, '').slice(2) // YYMMDD
            const optType = (trade.optionType || trade.type) === 'put' ? 'P' : 'C'
            const strikeFormatted = String(Math.round(trade.strike! * 1000)).padStart(8, '0')
            const optionTicker = `O:${trade.symbol}${expRaw}${optType}${strikeFormatted}`
            // try snapshot first (live bid/ask mid)
            const snapUrl = `https://api.polygon.io/v3/snapshot/options/${trade.symbol}/${optionTicker}?apikey=${POLY_KEY}`
            const snapRes = await fetch(snapUrl, { signal: AbortSignal.timeout(5000) })
            const snapData = await snapRes.json()
            const bid = snapData?.results?.day?.close ?? snapData?.results?.last_quote?.bid
            const ask = snapData?.results?.day?.close ?? snapData?.results?.last_quote?.ask
            let currentOptionPrice: number | null = null
            if (bid != null && ask != null && (bid > 0 || ask > 0)) {
              currentOptionPrice = +((bid + ask) / 2).toFixed(4)
            } else if (snapData?.results?.day?.close > 0) {
              currentOptionPrice = snapData.results.day.close
            }
            // fallback: prev-close bars from Polygon
            if (!currentOptionPrice) {
              const barUrl = `https://api.polygon.io/v2/aggs/ticker/${optionTicker}/range/5/minute/${fromStr}/${toStr}?adjusted=true&sort=desc&limit=1&apiKey=${POLY_KEY}`
              const barRes = await fetch(barUrl, { signal: AbortSignal.timeout(5000) })
              const barData = await barRes.json()
              if (barData?.results?.length > 0) {
                currentOptionPrice = barData.results[0].c
              }
            }
            if (currentOptionPrice && currentOptionPrice > 0) {
              updates.push({ id: trade.id, price: currentOptionPrice })
            }
          } catch (e) {
            console.warn(`[OptionPriceFetch] failed for ${trade.symbol}:`, e)
          }
        })
      )
      if (updates.length > 0) {
        setTrades((prev) =>
          prev.map((t) => {
            const u = updates.find((x) => x.id === t.id)
            if (!u) return t
            const unrealizedPnL =
              (u.price - t.entryPrice) * (t.quantity || 1) * (t.contractSize || 100)
            return { ...t, unrealizedPnL }
          })
        )
      }
    }

    fetchPrices()
    const interval = setInterval(fetchPrices, 60000) // refresh every 60s
    return () => clearInterval(interval)
  }, [trades.length]) // re-run when trades count changes (new trade added)

  const handleContractSelect = useCallback((contract: any, spotPrice: number) => {
    const midPrice =
      contract.bid && contract.ask
        ? +((contract.bid + contract.ask) / 2).toFixed(2)
        : contract.last_price || 0
    const rootSymbol = contract.ticker
      ? contract.ticker.startsWith('O:')
        ? contract.ticker.slice(2).replace(/\d.*/, '')
        : contract.ticker.split(':').pop()?.replace(/\d.*/, '') || ''
      : ''

    // same logic as EFICharting options trades section
    const expiryDate = contract.expiration_date ? new Date(contract.expiration_date) : null
    const daysToExpiry = expiryDate
      ? Math.max(1, Math.ceil((expiryDate.getTime() - Date.now()) / 86400000))
      : 30
    const T = daysToExpiry / 365
    const sigma = contract.implied_volatility || 0.5 // decimal from Polygon
    const isCall = contract.contract_type === 'call'
    const expectedMove1SD = spotPrice > 0 ? spotPrice * sigma * Math.sqrt(T) : 0
    const target1 =
      spotPrice > 0
        ? +(
            isCall ? spotPrice + expectedMove1SD * 0.84 : spotPrice - expectedMove1SD * 0.84
          ).toFixed(2)
        : 0
    const target2 =
      spotPrice > 0
        ? +(
            isCall ? spotPrice + expectedMove1SD * 1.28 : spotPrice - expectedMove1SD * 1.28
          ).toFixed(2)
        : 0
    const stopLoss = midPrice > 0 ? +(midPrice * 0.75).toFixed(2) : 0

    setTradeFormData((prev) => ({
      ...prev,
      symbol: rootSymbol || prev.symbol,
      type: contract.contract_type,
      isOptions: true,
      strike: contract.strike_price || 0,
      expiry: contract.expiration_date || '',
      premium: midPrice,
      entryPrice: midPrice,
      impliedVolatility: contract.implied_volatility
        ? +(contract.implied_volatility * 100).toFixed(1)
        : 0,
      optionType: contract.contract_type,
      stopLoss,
      target1,
      target2,
      takeProfit: target1,
    }))
  }, [])

  const handleTradeSubmit = useCallback(() => {
    const tradeData = {
      ...tradeFormData,
      takeProfit: tradeFormData.target1,
      tags: tradeFormData.tags
        .split(',')
        .map((tag: string) => tag?.trim?.() || '')
        .filter(Boolean),
      ...(tradeFormData.isOptions && {
        daysToExpiry: tradeFormData.expiry
          ? Math.max(
              0,
              Math.ceil((new Date(tradeFormData.expiry).getTime() - Date.now()) / 86400000)
            )
          : 0,
      }),
    }
    if (editingTrade) {
      updateTrade(editingTrade.id, tradeData)
    } else {
      addTrade(tradeData)
    }
    setShowAddTrade(false)
    setEditingTrade(null)
  }, [tradeFormData, editingTrade]) // eslint-disable-line react-hooks/exhaustive-deps

  const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf'

  // Real-time market data fetching
  const fetchMarketData = useCallback(
    async (symbols: string[]) => {
      if (symbols.length === 0) return

      setLoading(true)
      try {
        const promises = symbols.map(async (symbol) => {
          const response = await fetch(
            `https://api.polygon.io/v2/last/trade/${symbol}?apikey=${POLYGON_API_KEY}`
          )
          const data = await response.json()

          if (data.status === 'OK' && data.results) {
            const prevCloseResponse = await fetch(
              `https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?adjusted=true&apikey=${POLYGON_API_KEY}`
            )
            const prevCloseData = await prevCloseResponse.json()

            const currentPrice = data.results.p
            const prevClose = prevCloseData.results?.[0]?.c || currentPrice
            const change = currentPrice - prevClose
            const changePercent = (change / prevClose) * 100

            return {
              symbol,
              price: currentPrice,
              change,
              changePercent,
              timestamp: data.results.t,
            }
          }
          return null
        })

        const results = await Promise.all(promises)
        const marketDataMap: { [symbol: string]: MarketData } = {}

        results.forEach((result) => {
          if (result) {
            marketDataMap[result.symbol] = result
          }
        })

        setMarketData(marketDataMap)
      } catch (error) {
        console.error('Failed to fetch market data:', error)
        setError('Failed to fetch real-time market data')
      } finally {
        setLoading(false)
      }
    },
    [POLYGON_API_KEY]
  )

  // Load account settings and kick off market data fetch on mount
  useEffect(() => {
    const savedAccountSize = localStorage.getItem('tradingPlanAccountSize')
    const savedMaxRisk = localStorage.getItem('tradingPlanMaxRisk')

    if (savedAccountSize) setAccountSize(Number(savedAccountSize))
    if (savedMaxRisk) setMaxRiskPerTrade(Number(savedMaxRisk))

    // Fetch market data for any open positions already loaded via lazy state init
    setTrades((current) => {
      const openSymbols = current
        .filter((trade: Trade) => trade.status === 'open')
        .map((trade: Trade) => trade.symbol)
      if (openSymbols.length > 0) {
        fetchMarketData([...new Set(openSymbols)] as string[])
      }
      return current
    })

    // Set default goals only if nothing saved
    const savedGoals = localStorage.getItem('tradingPlanGoals')
    if (!savedGoals) {
      setGoals([
        {
          id: '1',
          title: 'Monthly Profit Target',
          description: 'Achieve $5,000 monthly profit',
          category: 'performance',
          target: 5000,
          targetValue: 5000,
          current: 1250,
          currentValue: 1250,
          progress: 25,
          unit: '$',
          deadline: new Date(2024, 11, 31).toISOString(),
          period: 'monthly',
          type: 'profit',
          createdDate: new Date().toISOString(),
          targetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          isActive: true,
        },
        {
          id: '2',
          title: 'Win Rate Improvement',
          description: 'Maintain 65% win rate or higher',
          category: 'performance',
          target: 65,
          targetValue: 65,
          current: 58,
          currentValue: 58,
          progress: 89,
          unit: '%',
          deadline: new Date(2024, 11, 31).toISOString(),
          period: 'monthly',
          type: 'winRate',
          createdDate: new Date().toISOString(),
          targetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          isActive: true,
        },
        {
          id: '3',
          title: 'Risk Management',
          description: 'Never risk more than 2% per trade',
          category: 'risk',
          target: 100,
          targetValue: 100,
          current: 95,
          currentValue: 95,
          progress: 95,
          unit: '%',
          deadline: new Date(2024, 11, 31).toISOString(),
          period: 'daily',
          type: 'trades',
          createdDate: new Date().toISOString(),
          targetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          isActive: true,
        },
      ])
    }
  }, []) // Empty dependency array - only run on mount

  // Listen for Enter Trade events fired from WatchPicks tab
  useEffect(() => {
    const handler = (e: Event) => {
      const data = (e as CustomEvent).detail
      if (!data) return
      const newTrade: Trade = {
        id: Date.now().toString(),
        symbol: data.symbol || '',
        type: data.type || 'call',
        strategy: data.strategy || 'Options',
        setup: data.setup || 'WatchPicks Entry',
        entryPrice: data.entryPrice || 0,
        quantity: data.quantity || 1,
        entryDate: data.entryDate || new Date().toISOString().split('T')[0],
        status: 'open',
        maxRisk: 0,
        notes: data.notes || '',
        tags: data.tags || ['WatchPicks'],
        confidence: data.confidence || 3,
        isOptions: true,
        strike: data.strike,
        expiry: data.expiry,
        optionType: data.optionType,
        premium: data.entryPrice,
        stopLoss: data.stopLoss,
        takeProfit: data.takeProfit,
        target2: data.target90,
        delta: data.delta,
        gamma: data.gamma,
        theta: data.theta,
        vega: data.vega,
        impliedVolatility: data.impliedVolatility,
        daysToExpiry: data.daysToExpiry,
      }
      setTrades((prev) => [...prev, newTrade])
      setActiveTab('journal')
    }
    window.addEventListener('watchpicksEnterTrade', handler)
    return () => window.removeEventListener('watchpicksEnterTrade', handler)
  }, [])

  // One-time migration: recompute pnl for closed options trades saved with wrong formula
  // Also wipe any stale currentOptionPrice that is a stock price (>= strike)
  useEffect(() => {
    setTrades((prev) =>
      prev.map((trade) => {
        let updated = { ...trade }
        // Fix closed options pnl sign
        if (trade.status === 'closed' && trade.isOptions && trade.exitPrice != null) {
          const isLongSide = trade.type === 'long' || trade.type === 'call'
          const contractMultiplier = trade.contractSize || 100
          const pnl = isLongSide
            ? (trade.exitPrice - trade.entryPrice) * trade.quantity * contractMultiplier -
              (trade.fees || 0)
            : (trade.entryPrice - trade.exitPrice) * trade.quantity * contractMultiplier -
              (trade.fees || 0)
          const costBasis = trade.entryPrice * trade.quantity * contractMultiplier
          const pnlPercent = costBasis > 0 ? (pnl / costBasis) * 100 : 0
          updated = { ...updated, pnl, pnlPercent, unrealizedPnL: undefined }
        }
        // Wipe stale currentOptionPrice if it looks like a stock price
        if (trade.isOptions && trade.currentOptionPrice != null) {
          const maxOptionPrice = (trade.strike || 9999) * 0.5
          if (trade.currentOptionPrice >= maxOptionPrice) {
            updated = { ...updated, currentOptionPrice: undefined, unrealizedPnL: undefined }
          }
        }
        return updated
      })
    )
  }, [])

  // Save data to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('tradingPlanTrades', JSON.stringify(trades))
  }, [trades])

  useEffect(() => {
    localStorage.setItem('tradingPlanGoals', JSON.stringify(goals))
  }, [goals])

  useEffect(() => {
    localStorage.setItem('tradingPlanAccountSize', accountSize.toString())
  }, [accountSize])

  useEffect(() => {
    localStorage.setItem('tradingPlanMaxRisk', maxRiskPerTrade.toString())
  }, [maxRiskPerTrade])

  // Compute trades with market data - no state updates, pure computation
  const tradesWithMarketData = useMemo(() => {
    return trades.map((trade) => {
      // Always sanitize options currentOptionPrice — must be < strike * 0.5
      // This kills any stale stock price saved in localStorage before real fetch runs
      if (trade.isOptions) {
        const maxOptionPrice = (trade.strike || 9999) * 0.5
        const sanitizedOptionPrice =
          trade.currentOptionPrice != null &&
          trade.currentOptionPrice > 0 &&
          trade.currentOptionPrice < maxOptionPrice
            ? trade.currentOptionPrice
            : undefined
        const currentPrice = marketData[trade.symbol]?.price
        return {
          ...trade,
          currentPrice,
          currentOptionPrice: sanitizedOptionPrice,
          unrealizedPnL:
            sanitizedOptionPrice != null
              ? (sanitizedOptionPrice - trade.entryPrice) *
                trade.quantity *
                (trade.contractSize || 100)
              : undefined,
          marketValue: currentPrice ? currentPrice * (trade.quantity || 1) : undefined,
        }
      }

      if (trade.status === 'open' && marketData[trade.symbol]) {
        const currentPrice = marketData[trade.symbol].price
        const unrealizedPnL =
          trade.type === 'long'
            ? (currentPrice - trade.entryPrice) * trade.quantity - (trade.fees || 0)
            : (trade.entryPrice - currentPrice) * trade.quantity - (trade.fees || 0)
        return {
          ...trade,
          currentPrice,
          unrealizedPnL,
          marketValue: currentPrice * trade.quantity,
        }
      }
      return trade
    })
  }, [trades, marketData])

  // Memoize open symbols to prevent unnecessary re-renders
  const openSymbols = useMemo(() => {
    return trades.filter((trade) => trade.status === 'open').map((trade) => trade.symbol)
  }, [trades])

  // Apply filters to the trades list
  const filteredTrades = useMemo(() => {
    return tradesWithMarketData.filter((trade) => {
      if (filters.symbol && !trade.symbol.toUpperCase().includes(filters.symbol.toUpperCase()))
        return false
      if (filters.status && trade.status !== filters.status) return false
      if (filters.type && trade.type !== filters.type) return false
      if (
        filters.strategy &&
        !trade.strategy.toLowerCase().includes(filters.strategy.toLowerCase())
      )
        return false
      if (filters.dateFrom && trade.entryDate < filters.dateFrom) return false
      if (filters.dateTo && trade.entryDate > filters.dateTo) return false
      const pnl = trade.status === 'open' ? trade.unrealizedPnL || 0 : trade.pnl || 0
      if (filters.minPnL !== '' && pnl < parseFloat(filters.minPnL)) return false
      if (filters.maxPnL !== '' && pnl > parseFloat(filters.maxPnL)) return false
      return true
    })
  }, [tradesWithMarketData, filters])

  const exportTradesToCSV = useCallback(() => {
    const headers = [
      'Symbol',
      'Side',
      'Qty',
      'Entry',
      'Exit',
      'P&L',
      'P&L%',
      'Status',
      'Strategy',
      'Entry Date',
      'Exit Date',
      'Stop Loss',
      'Take Profit',
      'Fees',
      'Notes',
    ]
    const rows = filteredTrades.map((t) => [
      t.symbol,
      t.type,
      t.quantity,
      t.entryPrice,
      t.exitPrice ?? '',
      t.pnl?.toFixed(2) ?? '',
      t.pnlPercent?.toFixed(2) ?? '',
      t.status,
      t.strategy,
      t.entryDate,
      t.exitDate ?? '',
      t.stopLoss ?? '',
      t.takeProfit ?? '',
      t.fees ?? '',
      t.notes,
    ])
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${v}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `trades_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [filteredTrades])

  // Auto-refresh market data every 30 seconds for open positions
  useEffect(() => {
    if (openSymbols.length === 0) return

    const refreshMarketData = () => {
      fetchMarketData([...new Set(openSymbols)])
    }

    // Initial fetch
    refreshMarketData()

    // Set up interval
    const interval = setInterval(refreshMarketData, 30000)

    return () => clearInterval(interval)
  }, [openSymbols, fetchMarketData]) // Use memoized openSymbols

  // Fetch current option premium for open options trades to compute unrealized P&L
  useEffect(() => {
    const openOptionTrades = trades.filter(
      (t) => t.status === 'open' && t.isOptions && t.strike && t.expiry
    )
    if (openOptionTrades.length === 0) return

    const POLYGON_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf'

    const buildOptionTicker = (trade: Trade): string => {
      const sym = trade.symbol.toUpperCase()
      const d = new Date(trade.expiry! + 'T00:00:00Z')
      const yy = String(d.getUTCFullYear()).slice(2)
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
      const dd = String(d.getUTCDate()).padStart(2, '0')
      const cp = (trade.optionType || trade.type) === 'put' ? 'P' : 'C'
      const strikePadded = String(Math.round(trade.strike! * 1000)).padStart(8, '0')
      return `O:${sym}${yy}${mm}${dd}${cp}${strikePadded}`
    }

    const fetchOptionPrice = async (trade: Trade): Promise<number | null> => {
      const ticker = buildOptionTicker(trade)
      try {
        // Try snapshot first
        const snapRes = await fetch(
          `https://api.polygon.io/v3/snapshot/options/${trade.symbol.toUpperCase()}/${ticker}?apiKey=${POLYGON_KEY}`
        )
        if (snapRes.ok) {
          const snapData = await snapRes.json()
          const r = snapData?.results
          if (r) {
            // Prefer live midpoint, then last trade, then day close
            const price = r.last_quote?.midpoint || r.last_trade?.price || r.day?.close || null
            if (price && price > 0 && price < trade.strike! * 0.5) return price
          }
        }
      } catch {
        /* fall through */
      }
      try {
        // Fallback: previous day close via aggs
        const ticker2 = buildOptionTicker(trade)
        const today = new Date()
        const from = new Date(today)
        from.setDate(from.getDate() - 5)
        const fromStr = from.toISOString().split('T')[0]
        const toStr = today.toISOString().split('T')[0]
        const aggRes = await fetch(
          `https://api.polygon.io/v2/aggs/ticker/${ticker2}/range/1/day/${fromStr}/${toStr}?adjusted=true&sort=desc&limit=1&apiKey=${POLYGON_KEY}`
        )
        if (aggRes.ok) {
          const aggData = await aggRes.json()
          const price = aggData?.results?.[0]?.c
          if (price && price > 0 && price < trade.strike! * 0.5) return price
        }
      } catch {
        /* ignore */
      }
      return null
    }

    const run = async () => {
      const updates: { id: string; unrealizedPnL: number; currentOptionPrice: number }[] = []
      await Promise.all(
        openOptionTrades.map(async (trade) => {
          const price = await fetchOptionPrice(trade)
          if (price !== null) {
            const contractMultiplier = trade.contractSize || 100
            const unrealizedPnL = (price - trade.entryPrice) * trade.quantity * contractMultiplier
            updates.push({ id: trade.id, unrealizedPnL, currentOptionPrice: price })
          }
        })
      )
      if (updates.length > 0) {
        setTrades((prev) =>
          prev.map((t) => {
            const u = updates.find((x) => x.id === t.id)
            return u
              ? { ...t, unrealizedPnL: u.unrealizedPnL, currentOptionPrice: u.currentOptionPrice }
              : t
          })
        )
      }
    }

    run()
    const interval = setInterval(run, 60000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    trades
      .filter((t) => t.status === 'open' && t.isOptions)
      .map((t) => t.id)
      .join(','),
  ])

  const calculatePerformanceMetrics = useCallback((): PerformanceMetrics => {
    const closedTrades = tradesWithMarketData.filter((t: Trade) => t.status === 'closed')
    const openTrades = tradesWithMarketData.filter((t: Trade) => t.status === 'open')

    // Basic P&L calculations
    const totalPnL = closedTrades.reduce((sum, trade) => sum + (trade.pnl || 0), 0)
    const totalFees = tradesWithMarketData.reduce((sum, trade) => sum + (trade.fees || 0), 0)
    const netPnL = totalPnL - totalFees

    // Unrealized P&L from open positions (with real-time market data)
    const unrealizedPnL = openTrades.reduce((sum, trade) => sum + (trade.unrealizedPnL || 0), 0)

    // Win/Loss analysis
    const winningTrades = closedTrades.filter((t) => (t.pnl || 0) > 0)
    const losingTrades = closedTrades.filter((t) => (t.pnl || 0) < 0)
    const winRate = closedTrades.length > 0 ? (winningTrades.length / closedTrades.length) * 100 : 0

    // Average win/loss
    const totalWins = winningTrades.reduce((sum, t) => sum + (t.pnl || 0), 0)
    const totalLosses = Math.abs(losingTrades.reduce((sum, t) => sum + (t.pnl || 0), 0))
    const avgWin = winningTrades.length > 0 ? totalWins / winningTrades.length : 0
    const avgLoss = losingTrades.length > 0 ? totalLosses / losingTrades.length : 0

    // Profit factor
    const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? 999 : 0

    // Risk metrics
    const totalRisk = trades.reduce((sum, trade) => sum + trade.maxRisk, 0)
    const riskAdjustedReturn = totalRisk > 0 ? (netPnL / totalRisk) * 100 : 0

    // Drawdown calculation
    let runningPnL = 0
    let peakPnL = 0
    let maxDrawdown = 0
    let maxDrawdownPercent = 0

    closedTrades.forEach((trade) => {
      runningPnL += trade.pnl || 0
      if (runningPnL > peakPnL) {
        peakPnL = runningPnL
      }
      const drawdown = peakPnL - runningPnL
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown
        maxDrawdownPercent = peakPnL > 0 ? (drawdown / peakPnL) * 100 : 0
      }
    })

    // Largest win/loss
    const largestWin =
      winningTrades.length > 0 ? Math.max(...winningTrades.map((t) => t.pnl || 0)) : 0
    const largestLoss =
      losingTrades.length > 0 ? Math.min(...losingTrades.map((t) => t.pnl || 0)) : 0

    // Average hold time
    const tradesWithDuration = closedTrades.filter((t) => t.exitDate && t.entryDate)
    const avgHoldTime =
      tradesWithDuration.length > 0
        ? tradesWithDuration.reduce((sum, trade) => {
            const entryTime = new Date(
              `${trade.entryDate}T${trade.entryTime || '09:30:00'}`
            ).getTime()
            const exitTime = new Date(`${trade.exitDate}T${trade.exitTime || '16:00:00'}`).getTime()
            return sum + (exitTime - entryTime)
          }, 0) /
          tradesWithDuration.length /
          (1000 * 60 * 60) // in hours
        : 0

    // Sharpe ratio (simplified - using daily returns)
    const dailyReturns = closedTrades.map((trade) => (trade.pnl || 0) / accountSize)
    const avgDailyReturn =
      dailyReturns.length > 0
        ? dailyReturns.reduce((sum, ret) => sum + ret, 0) / dailyReturns.length
        : 0
    const returnVariance =
      dailyReturns.length > 0
        ? dailyReturns.reduce((sum, ret) => sum + Math.pow(ret - avgDailyReturn, 2), 0) /
          dailyReturns.length
        : 0
    const returnStdDev = Math.sqrt(returnVariance)
    const sharpeRatio = returnStdDev > 0 ? (avgDailyReturn / returnStdDev) * Math.sqrt(252) : 0

    // Calmar ratio
    const calmarRatio =
      maxDrawdownPercent > 0 ? ((netPnL / accountSize) * 100) / maxDrawdownPercent : 0

    return {
      totalTrades: closedTrades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate,
      totalPnL: totalPnL + unrealizedPnL,
      totalFees,
      netPnL: netPnL + unrealizedPnL,
      avgWin,
      avgLoss,
      profitFactor,
      maxDrawdown,
      maxDrawdownPercent,
      sharpeRatio,
      calmarRatio,
      largestWin,
      largestLoss,
      avgHoldTime,
      totalRisk,
      riskAdjustedReturn,
    }
  }, [tradesWithMarketData, accountSize])

  const performanceMetrics = calculatePerformanceMetrics()

  // Trade management functions
  const addTrade = useCallback(
    (tradeData: Partial<Trade>) => {
      const newTrade: Trade = {
        id: Date.now().toString(),
        symbol: tradeData.symbol || '',
        type: tradeData.type || 'long',
        strategy: tradeData.strategy || '',
        setup: tradeData.setup || '',
        entryPrice: tradeData.entryPrice || 0,
        quantity: tradeData.quantity || 0,
        entryDate: tradeData.entryDate || new Date().toISOString().split('T')[0],
        entryTime: tradeData.entryTime || new Date().toTimeString().split(' ')[0],
        maxRisk: tradeData.maxRisk || (accountSize * maxRiskPerTrade) / 100,
        notes: tradeData.notes || '',
        tags: tradeData.tags || [],
        status: 'open',
        fees: tradeData.fees || 2.5,
        stopLoss: tradeData.stopLoss || 0,
        takeProfit: tradeData.takeProfit || 0,
        confidence: tradeData.confidence || 3,
        sentiment: tradeData.sentiment || 'neutral',
        ...tradeData,
      }

      setTrades((prev) => [...prev, newTrade])

      // Fetch market data for the new symbol
      if (newTrade.status === 'open') {
        fetchMarketData([newTrade.symbol])
      }
    },
    [accountSize, maxRiskPerTrade, fetchMarketData]
  )

  const updateTrade = useCallback((tradeId: string, updates: Partial<Trade>) => {
    setTrades((prev) =>
      prev.map((trade) => (trade.id === tradeId ? { ...trade, ...updates } : trade))
    )
  }, [])

  const closeTrade = useCallback(
    async (tradeId: string, exitPrice: number, exitDate?: string, exitTime?: string) => {
      const trade = trades.find((t) => t.id === tradeId)
      if (!trade) return

      const isLongSide = trade.type === 'long' || trade.type === 'call'
      const contractMultiplier = trade.isOptions ? trade.contractSize || 100 : 1
      const pnl = isLongSide
        ? (exitPrice - trade.entryPrice) * trade.quantity * contractMultiplier - (trade.fees || 0)
        : (trade.entryPrice - exitPrice) * trade.quantity * contractMultiplier - (trade.fees || 0)

      const costBasis = trade.entryPrice * trade.quantity * contractMultiplier
      const pnlPercent = costBasis > 0 ? (pnl / costBasis) * 100 : 0

      updateTrade(tradeId, {
        exitPrice,
        exitDate: exitDate || new Date().toISOString().split('T')[0],
        exitTime: exitTime || new Date().toTimeString().split(' ')[0],
        pnl,
        pnlPercent,
        unrealizedPnL: undefined,
        status: 'closed',
      })

      // Goals will be updated automatically by the useEffect that watches trades
    },
    [trades, updateTrade]
  )

  const deleteTrade = useCallback((tradeId: string) => {
    setTrades((prev) => prev.filter((trade) => trade.id !== tradeId))
  }, [])

  // Broker CSV import
  const handleBrokerImport = useCallback(
    (file: File) => {
      setImportFileName(file.name)
      setImportStatus('parsing')
      setImportError('')
      setImportPreview([])
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string
          const lines = text.split(/\r?\n/).filter((l) => l.trim())
          const parsed: Trade[] = []

          if (importBroker === 'tos') {
            // TOS Account Trade History CSV
            // Headers: Exec Time, Spread, Side, Qty, Pos Effect, Symbol, Exp, Strike, Type, Price, Net Liq, P/L Open, P/L Day, Share, Commission
            const headerIdx = lines.findIndex((l) => /Exec.?Time|exec.?time/i.test(l))
            if (headerIdx === -1)
              throw new Error(
                'Could not find TOS header row. Export Account Trade History from Monitor tab.'
              )
            const headers = lines[headerIdx]
              .split(',')
              .map((h) => h.trim().replace(/^"|"$/g, '').toLowerCase())
            const col = (name: string) => headers.findIndex((h) => h.includes(name.toLowerCase()))
            const iExecTime = col('exec time'),
              iSide = col('side'),
              iQty = col('qty'),
              iSymbol = col('symbol'),
              iExp = col('exp'),
              iStrike = col('strike'),
              iType = col('type'),
              iPrice = col('price'),
              iCommission = col('commission'),
              iPnLOpen = col('p/l open'),
              iPnLDay = col('p/l day')

            for (let i = headerIdx + 1; i < lines.length; i++) {
              const row = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''))
              if (!row[iSymbol] || !row[iPrice]) continue
              const side = row[iSide]?.toUpperCase()
              const qty = Math.abs(parseFloat(row[iQty]) || 0)
              const price = parseFloat(row[iPrice]) || 0
              const commission = parseFloat(row[iCommission]) || 0
              const pnlRaw = parseFloat(row[iPnLOpen] || row[iPnLDay] || '0') || 0
              const rawSym = row[iSymbol]
              const exp = row[iExp] || ''
              const strike = parseFloat(row[iStrike]) || 0
              const optType = (row[iType] || '').toUpperCase()
              const isOpt = !!(exp && strike)
              const dateRaw = row[iExecTime] || ''
              const dateParts = dateRaw.match(/(\d+)\/(\d+)\/(\d{4})/)
              const entryDate = dateParts
                ? `${dateParts[3]}-${dateParts[1].padStart(2, '0')}-${dateParts[2].padStart(2, '0')}`
                : new Date().toISOString().split('T')[0]
              if (!qty || !price || !rawSym) continue
              parsed.push({
                id: `tos-${Date.now()}-${i}`,
                symbol: rawSym,
                type: isOpt
                  ? optType === 'P'
                    ? 'put'
                    : 'call'
                  : side === 'SELL'
                    ? 'short'
                    : 'long',
                strategy: isOpt ? 'Options' : 'Equity',
                setup: 'Imported from TOS',
                entryPrice: price,
                exitPrice: side === 'SELL' || side === 'SELL_TO_CLOSE' ? price : undefined,
                quantity: qty,
                entryDate,
                status: side?.includes('CLOSE') || side === 'SELL' ? 'closed' : 'open',
                pnl: pnlRaw || undefined,
                maxRisk: 0,
                notes: `Imported TOS | ${row[iExecTime] || ''}`,
                tags: ['TOS', 'imported'],
                confidence: 3,
                fees: commission,
                isOptions: isOpt,
                ...(isOpt && {
                  strike,
                  expiry: exp,
                  optionType: (optType === 'P' ? 'put' : 'call') as 'call' | 'put',
                  premium: price,
                }),
              })
            }
          } else if (importBroker === 'robinhood') {
            // Robinhood CSV: Activity Date,Process Date,Settle Date,Instrument,Description,Trans Code,Quantity,Price,Amount
            const headerIdx = lines.findIndex((l) => /activity.?date|instrument/i.test(l))
            if (headerIdx === -1)
              throw new Error(
                'Could not find Robinhood header. Download CSV from Account → Statements & History.'
              )
            const headers = lines[headerIdx]
              .split(',')
              .map((h) => h.trim().replace(/^"|"$/g, '').toLowerCase())
            const col = (name: string) => headers.findIndex((h) => h.includes(name.toLowerCase()))
            const iDate = col('activity date'),
              iInstrument = col('instrument'),
              iDesc = col('description'),
              iCode = col('trans code'),
              iQty = col('quantity'),
              iPrice = col('price'),
              iAmount = col('amount')

            for (let i = headerIdx + 1; i < lines.length; i++) {
              const row = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''))
              const code = (row[iCode] || '').toUpperCase()
              if (!['BUY', 'SELL', 'STO', 'BTC', 'STC', 'BTO'].includes(code)) continue
              const sym = row[iInstrument] || ''
              const qty = Math.abs(parseFloat(row[iQty]) || 0)
              const price = Math.abs(parseFloat(row[iPrice]) || 0)
              const amount = parseFloat((row[iAmount] || '0').replace(/[$,]/g, '')) || 0
              if (!sym || !qty || !price) continue
              const dateRaw = row[iDate] || ''
              const dp = dateRaw.match(/(\w{3})\s+(\d+),?\s+(\d{4})/i)
              const months: Record<string, string> = {
                Jan: '01',
                Feb: '02',
                Mar: '03',
                Apr: '04',
                May: '05',
                Jun: '06',
                Jul: '07',
                Aug: '08',
                Sep: '09',
                Oct: '10',
                Nov: '11',
                Dec: '12',
              }
              const entryDate = dp
                ? `${dp[3]}-${months[dp[1]] || '01'}-${dp[2].padStart(2, '0')}`
                : dateRaw || new Date().toISOString().split('T')[0]
              const desc = (row[iDesc] || '').toLowerCase()
              const isOpt = /call|put/i.test(desc) || /STO|BTC|STC|BTO/.test(code)
              const optMatch = desc.match(/(\d+\.?\d*)\s+(call|put)/i)
              const isSell = code === 'SELL' || code === 'STO' || code === 'STC'
              parsed.push({
                id: `rh-${Date.now()}-${i}`,
                symbol: sym,
                type: isOpt
                  ? optMatch?.[2]?.toLowerCase() === 'put'
                    ? 'put'
                    : 'call'
                  : isSell
                    ? 'short'
                    : 'long',
                strategy: isOpt ? 'Options' : 'Equity',
                setup: 'Imported from Robinhood',
                entryPrice: price,
                exitPrice: isSell ? price : undefined,
                quantity: qty,
                entryDate,
                status: isSell ? 'closed' : 'open',
                pnl: isSell ? amount : undefined,
                maxRisk: 0,
                notes: `Imported Robinhood | ${row[iDesc] || ''}`,
                tags: ['Robinhood', 'imported'],
                confidence: 3,
                isOptions: isOpt,
                ...(isOpt &&
                  optMatch && {
                    strike: parseFloat(optMatch[1]),
                    optionType: optMatch[2].toLowerCase() as 'call' | 'put',
                    premium: price,
                  }),
              })
            }
          } else if (importBroker === 'webull') {
            // Webull: Date,Account Type,Transaction Type,Qty,Price,Symbol,Side,Amount,Commission,Status,Details
            const headerIdx = lines.findIndex((l) =>
              /date.*symbol|symbol.*date|order.*date/i.test(l)
            )
            const fallbackIdx = lines.findIndex((l) => /symbol/i.test(l) && /price/i.test(l))
            const hIdx = headerIdx >= 0 ? headerIdx : fallbackIdx
            if (hIdx === -1)
              throw new Error(
                'Could not find Webull header. Export Orders from My Account → History.'
              )
            const headers = lines[hIdx]
              .split(',')
              .map((h) => h.trim().replace(/^"|"$/g, '').toLowerCase())
            const col = (name: string) => headers.findIndex((h) => h.includes(name.toLowerCase()))
            const iDate = col('date'),
              iSymbol = col('symbol'),
              iQty = col('qty'),
              iPrice = col('price'),
              iSide = col('side'),
              iAmount = col('amount'),
              iComm = col('commission')

            for (let i = hIdx + 1; i < lines.length; i++) {
              const row = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''))
              const sym = row[iSymbol] || ''
              const qty = Math.abs(parseFloat(row[iQty]) || 0)
              const price = Math.abs(parseFloat(row[iPrice]) || 0)
              const side = (row[iSide] || '').toUpperCase()
              const commission = parseFloat(row[iComm] || '0') || 0
              if (!sym || !qty || !price) continue
              const dateRaw = row[iDate] || ''
              const entryDate = dateRaw.slice(0, 10) || new Date().toISOString().split('T')[0]
              const isSell = side === 'SELL' || side === 'S'
              const isOpt = sym.length > 6 && /[CP]\d/.test(sym)
              parsed.push({
                id: `wb-${Date.now()}-${i}`,
                symbol: isOpt ? sym.replace(/\d{6}[CP]\d+$/, '') || sym : sym,
                type: isOpt ? (/C\d/.test(sym) ? 'call' : 'put') : isSell ? 'short' : 'long',
                strategy: isOpt ? 'Options' : 'Equity',
                setup: 'Imported from Webull',
                entryPrice: price,
                exitPrice: isSell ? price : undefined,
                quantity: qty,
                entryDate,
                status: isSell ? 'closed' : 'open',
                maxRisk: 0,
                notes: `Imported Webull | ${dateRaw}`,
                tags: ['Webull', 'imported'],
                confidence: 3,
                fees: commission,
                isOptions: isOpt,
              })
            }
          }

          if (parsed.length === 0)
            throw new Error(
              'No valid trades found in this file. Check the export format matches the selected broker.'
            )
          setImportPreview(parsed)
          setImportStatus('preview')
        } catch (err: any) {
          setImportStatus('error')
          setImportError(err.message || 'Failed to parse file.')
        }
      }
      reader.readAsText(file)
    },
    [importBroker]
  )

  // Goal management functions
  const addGoal = useCallback((goalData: Partial<TradingGoal>) => {
    const newGoal: TradingGoal = {
      id: Date.now().toString(),
      title: goalData.title || '',
      description: goalData.description || '',
      category: goalData.category || 'performance',
      target: goalData.target || 0,
      targetValue: goalData.targetValue || goalData.target || 0,
      current: 0,
      currentValue: 0,
      progress: 0,
      unit: goalData.unit || '$',
      deadline: goalData.deadline || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      period: goalData.period || 'monthly',
      type: goalData.type || 'profit',
      createdDate: new Date().toISOString(),
      targetDate:
        goalData.targetDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      isActive: true,
      ...goalData,
    }

    setGoals((prev) => [...prev, newGoal])
  }, [])

  // Update goal progress whenever trades change
  useEffect(() => {
    const now = new Date()
    const performanceMetrics = calculatePerformanceMetrics()

    setGoals((prevGoals) =>
      prevGoals.map((goal) => {
        let current = 0

        // Filter trades based on goal period
        const relevantTrades = trades.filter((trade) => {
          const tradeDate = new Date(trade.entryDate)

          switch (goal.period) {
            case 'daily':
              return tradeDate.toDateString() === now.toDateString()
            case 'weekly':
              const weekStart = new Date(now)
              weekStart.setDate(now.getDate() - now.getDay())
              return tradeDate >= weekStart
            case 'monthly':
              return (
                tradeDate.getMonth() === now.getMonth() &&
                tradeDate.getFullYear() === now.getFullYear()
              )
            case 'yearly':
              return tradeDate.getFullYear() === now.getFullYear()
            default:
              return false
          }
        })

        // Calculate current progress based on goal type
        switch (goal.type) {
          case 'profit':
            current = relevantTrades
              .filter((t) => t.status === 'closed')
              .reduce((sum, trade) => sum + (trade.pnl || 0), 0)
            break
          case 'winRate':
            const closedTrades = relevantTrades.filter((t) => t.status === 'closed')
            const winningTrades = closedTrades.filter((t) => (t.pnl || 0) > 0)
            current =
              closedTrades.length > 0 ? (winningTrades.length / closedTrades.length) * 100 : 0
            break
          case 'trades':
            current = relevantTrades.length
            break
          case 'maxDrawdown':
            current = performanceMetrics.maxDrawdownPercent
            break
          case 'sharpeRatio':
            current = performanceMetrics.sharpeRatio
            break
        }

        return { ...goal, current }
      })
    )
  }, [trades, tradesWithMarketData]) // Depend on actual data, not callbacks

  const AddTradeModal = () => {
    const formData = tradeFormData
    const setFormData = setTradeFormData

    const isOptionsType =
      formData.type === 'call' || formData.type === 'put' || formData.type === 'spread'

    const riskPerShare = Math.abs((formData.entryPrice || 0) - (formData.stopLoss || 0))
    const positionValue = (formData.entryPrice || 0) * (formData.quantity || 0)
    const rrRaw =
      formData.entryPrice && formData.stopLoss && formData.target1
        ? Math.abs(formData.target1 - formData.entryPrice) /
          Math.abs(formData.entryPrice - formData.stopLoss)
        : null
    const rrRatio = rrRaw !== null ? rrRaw.toFixed(2) : '—'

    return createPortal(
      <div
        className="font-mono"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          zIndex: 99999,
          background: 'rgba(0,0,0,0.97)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
        }}
      >
        {/* ── LEFT PANEL ── form */}
        <div
          className="flex flex-col overflow-y-auto"
          style={{
            width: isOptionsType ? '715px' : '980px',
            minWidth: isOptionsType ? '715px' : '980px',
            maxHeight: '100vh',
            marginLeft: isOptionsType ? '0' : 'auto',
            marginRight: isOptionsType ? '0' : 'auto',
            background: '#050505',
            borderRight: isOptionsType ? '1px solid #1a1a1a' : 'none',
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-9 py-6"
            style={{ borderBottom: '2px solid #fb923c', background: '#080808' }}
          >
            <div className="flex items-center gap-4">
              <div className="w-4 h-4 rounded-full bg-orange-500 animate-pulse" />
              <span className="text-2xl font-black uppercase tracking-[0.15em] text-orange-400">
                {editingTrade ? 'MODIFY POSITION' : 'NEW POSITION ENTRY'}
              </span>
            </div>
            <button
              onClick={() => {
                setShowAddTrade(false)
                setEditingTrade(null)
              }}
              className="w-11 h-11 flex items-center justify-center transition-all"
              style={{ color: '#ef4444', border: '1px solid #ef4444' }}
              onMouseEnter={(e) => {
                ;(e.currentTarget as HTMLButtonElement).style.background = '#1a0000'
              }}
              onMouseLeave={(e) => {
                ;(e.currentTarget as HTMLButtonElement).style.background = 'transparent'
              }}
            >
              <TbX size={22} />
            </button>
          </div>

          <div className="p-9 space-y-8">
            {/* ── INSTRUMENT ── */}
            <section>
              <div
                className="text-base font-black tracking-[0.2em] mb-5"
                style={{ color: '#3b82f6' }}
              >
                — INSTRUMENT
              </div>
              <div className="space-y-3">
                {/* Symbol */}
                <div>
                  <label
                    className="block text-base font-black tracking-widest mb-3"
                    style={{ color: '#fb923c' }}
                  >
                    SYMBOL
                  </label>
                  <div className="flex">
                    <input
                      type="text"
                      value={formData.symbol}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, symbol: e.target.value.toUpperCase() }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') fetchCurrentPrice()
                      }}
                      className="flex-1 bg-[#0d0d0d] px-6 py-5 text-white text-lg font-mono uppercase focus:outline-none"
                      style={{
                        border: '1px solid #333',
                        borderRight: fetchingPrice ? '1px solid #333' : undefined,
                      }}
                      placeholder="AAPL — press Enter for price"
                      autoFocus
                    />
                    {fetchingPrice && (
                      <div
                        className="px-5 flex items-center"
                        style={{
                          background: '#0d0d0d',
                          border: '1px solid #333',
                          borderLeft: 'none',
                        }}
                      >
                        <TbRefresh size={22} className="animate-spin text-blue-400" />
                      </div>
                    )}
                    {!fetchingPrice && formData.entryPrice > 0 && (
                      <div
                        className="px-5 flex items-center font-mono font-black text-lg"
                        style={{
                          background: '#0d0d0d',
                          border: '1px solid #333',
                          borderLeft: 'none',
                          color: '#22c55e',
                        }}
                      >
                        ${formData.entryPrice.toFixed(2)}
                      </div>
                    )}
                  </div>
                </div>

                {/* Trade Type */}
                <div>
                  <label
                    className="block text-base font-black tracking-widest mb-3"
                    style={{ color: '#fb923c' }}
                  >
                    TRADE TYPE
                  </label>
                  <div className="grid grid-cols-5 gap-3">
                    {[
                      { v: 'long', label: 'LONG', color: '#22c55e' },
                      { v: 'short', label: 'SHORT', color: '#ef4444' },
                      { v: 'call', label: 'CALL', color: '#3b82f6' },
                      { v: 'put', label: 'PUT', color: '#a855f7' },
                      { v: 'spread', label: 'SPRD', color: '#f59e0b' },
                    ].map((opt) => (
                      <button
                        key={opt.v}
                        onClick={() =>
                          setFormData((prev) => ({
                            ...prev,
                            type: opt.v as any,
                            isOptions: opt.v === 'call' || opt.v === 'put' || opt.v === 'spread',
                          }))
                        }
                        className="py-5 text-base font-black tracking-widest transition-all"
                        style={{
                          background: formData.type === opt.v ? opt.color : '#111',
                          color: formData.type === opt.v ? '#000' : opt.color,
                          border: `1px solid ${formData.type === opt.v ? opt.color : '#2a2a2a'}`,
                          boxShadow: formData.type === opt.v ? `0 0 14px ${opt.color}55` : 'none',
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {isOptionsType && (
                    <div
                      className="mt-3 px-5 py-3 text-base font-black tracking-wide"
                      style={{
                        background: '#060e1f',
                        border: '1px solid #1d4ed8',
                        color: '#60a5fa',
                      }}
                    >
                      DOUBLE-CLICK <span style={{ color: '#22c55e' }}>$</span> ON ANY CONTRACT TO
                      AUTOFILL
                    </div>
                  )}
                </div>

                {/* Options contract summary (filled by chain) */}
                {isOptionsType && formData.strike > 0 && (
                  <div
                    className="grid grid-cols-2 gap-2 p-3"
                    style={{ background: '#060606', border: '1px solid #1d4ed8' }}
                  >
                    <div>
                      <div
                        className="text-xs font-black tracking-widest mb-0.5"
                        style={{ color: '#60a5fa' }}
                      >
                        STRIKE
                      </div>
                      <div className="text-white font-mono font-bold">${formData.strike}</div>
                    </div>
                    <div>
                      <div
                        className="text-xs font-black tracking-widest mb-0.5"
                        style={{ color: '#60a5fa' }}
                      >
                        EXPIRY
                      </div>
                      <div className="text-white font-mono font-bold">{formData.expiry}</div>
                    </div>
                    <div>
                      <div
                        className="text-xs font-black tracking-widest mb-0.5"
                        style={{ color: '#60a5fa' }}
                      >
                        PREMIUM
                      </div>
                      <div className="font-mono font-bold" style={{ color: '#f59e0b' }}>
                        ${formData.premium}
                      </div>
                    </div>
                    <div>
                      <div
                        className="text-xs font-black tracking-widest mb-0.5"
                        style={{ color: '#a78bfa' }}
                      >
                        IV
                      </div>
                      <div className="text-white font-mono font-bold">
                        {formData.impliedVolatility}%
                      </div>
                    </div>
                    <div>
                      <div
                        className="text-xs font-black tracking-widest mb-0.5"
                        style={{ color: '#60a5fa' }}
                      >
                        BREAKEVEN
                      </div>
                      <div className="text-white font-mono font-bold">
                        $
                        {formData.type === 'call'
                          ? ((formData.strike || 0) + (formData.premium || 0)).toFixed(2)
                          : ((formData.strike || 0) - (formData.premium || 0)).toFixed(2)}
                      </div>
                    </div>
                    <div>
                      <div
                        className="text-xs font-black tracking-widest mb-0.5"
                        style={{ color: '#60a5fa' }}
                      >
                        TOTAL COST
                      </div>
                      <div className="font-mono font-bold" style={{ color: '#fb923c' }}>
                        $
                        {(
                          (formData.premium || 0) *
                          Math.max(formData.quantity || 1, 1) *
                          100
                        ).toFixed(2)}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* ── EXECUTION ── */}
            <section>
              <div
                className="text-base font-black tracking-[0.2em] mb-5"
                style={{ color: '#22c55e' }}
              >
                — EXECUTION
              </div>
              <div className="grid grid-cols-2 gap-3">
                {isOptionsType ? (
                  <>
                    <div>
                      <label
                        className="block text-base font-black tracking-widest mb-3"
                        style={{ color: '#fb923c' }}
                      >
                        PREMIUM (ENTRY)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={formData.premium || ''}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            premium: +e.target.value,
                            entryPrice: +e.target.value,
                          }))
                        }
                        className="w-full bg-[#0d0d0d] border border-[#333] px-6 py-5 text-white text-lg font-mono focus:outline-none focus:border-orange-500"
                      />
                    </div>
                    <div>
                      <label
                        className="block text-base font-black tracking-widest mb-3"
                        style={{ color: '#fb923c' }}
                      >
                        CONTRACTS
                      </label>
                      <input
                        type="number"
                        value={formData.quantity || ''}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, quantity: +e.target.value }))
                        }
                        className="w-full bg-[#0d0d0d] border border-[#333] px-6 py-5 text-white text-lg font-mono focus:outline-none focus:border-orange-500"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label
                        className="block text-base font-black tracking-widest mb-3"
                        style={{ color: '#fb923c' }}
                      >
                        ENTRY PRICE
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={formData.entryPrice || ''}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, entryPrice: +e.target.value }))
                        }
                        className="w-full bg-[#0d0d0d] border border-[#333] px-6 py-5 text-white text-lg font-mono focus:outline-none focus:border-orange-500"
                      />
                    </div>
                    <div>
                      <label
                        className="block text-base font-black tracking-widest mb-3"
                        style={{ color: '#fb923c' }}
                      >
                        QUANTITY (SHARES)
                      </label>
                      <input
                        type="number"
                        value={formData.quantity || ''}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, quantity: +e.target.value }))
                        }
                        className="w-full bg-[#0d0d0d] border border-[#333] px-6 py-5 text-white text-lg font-mono focus:outline-none focus:border-orange-500"
                      />
                    </div>
                  </>
                )}
              </div>
            </section>

            {/* ── RISK MANAGEMENT ── */}
            <section>
              <div
                className="text-base font-black tracking-[0.2em] mb-5"
                style={{ color: '#ef4444' }}
              >
                — RISK MANAGEMENT
              </div>
              <div className="space-y-3">
                {/* Row 1: Stop Loss */}
                <div>
                  <label
                    className="block text-base font-black tracking-widest mb-3"
                    style={{ color: '#f87171' }}
                  >
                    STOP LOSS
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.stopLoss || ''}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, stopLoss: +e.target.value }))
                    }
                    className="w-full font-mono px-6 py-5 text-lg font-bold focus:outline-none"
                    style={{ background: '#130303', border: '1px solid #7f1d1d', color: '#f87171' }}
                    placeholder="0.00"
                  />
                </div>
                {/* Row 2: Target #1 + Target #2 */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      className="block text-base font-black tracking-widest mb-3"
                      style={{ color: '#34d399' }}
                    >
                      TARGET #1
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.target1 || ''}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          target1: +e.target.value,
                          takeProfit: +e.target.value,
                        }))
                      }
                      className="w-full font-mono px-6 py-5 text-lg font-bold focus:outline-none"
                      style={{
                        background: '#030f07',
                        border: '1px solid #064e3b',
                        color: '#22c55e',
                      }}
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label
                      className="block text-base font-black tracking-widest mb-3"
                      style={{ color: '#4ade80' }}
                    >
                      TARGET #2
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.target2 || ''}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, target2: +e.target.value }))
                      }
                      className="w-full font-mono px-6 py-5 text-lg font-bold focus:outline-none"
                      style={{
                        background: '#030f07',
                        border: '1px solid #052e16',
                        color: '#4ade80',
                      }}
                      placeholder="0.00"
                    />
                  </div>
                </div>
                {/* Row 3: R:R metrics */}
                <div className="grid grid-cols-3 gap-3">
                  <div
                    className="text-center p-3"
                    style={{ background: '#0a0505', border: '1px solid #3d1515' }}
                  >
                    <div
                      className="text-xs font-black tracking-widest mb-1"
                      style={{ color: '#f87171' }}
                    >
                      RISK
                    </div>
                    <div className="font-mono font-bold text-white text-sm">
                      ${riskPerShare.toFixed(2)}
                    </div>
                  </div>
                  <div
                    className="text-center p-3"
                    style={{ background: '#050810', border: '1px solid #1d4ed8' }}
                  >
                    <div
                      className="text-xs font-black tracking-widest mb-1"
                      style={{ color: '#60a5fa' }}
                    >
                      R:R
                    </div>
                    <div
                      className="font-mono font-bold text-sm"
                      style={{ color: rrRaw !== null && rrRaw >= 2 ? '#22c55e' : '#f59e0b' }}
                    >
                      {rrRatio}:1
                    </div>
                  </div>
                  <div
                    className="text-center p-3"
                    style={{ background: '#0a0602', border: '1px solid #7c3012' }}
                  >
                    <div
                      className="text-xs font-black tracking-widest mb-1"
                      style={{ color: '#fb923c' }}
                    >
                      VAL
                    </div>
                    <div className="font-mono font-bold text-white text-sm">
                      ${positionValue.toFixed(0)}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* ── CONVICTION ── */}
            <section>
              <div
                className="text-base font-black tracking-[0.2em] mb-5"
                style={{ color: '#a855f7' }}
              >
                — CONVICTION
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex justify-between mb-3">
                    <label
                      className="text-base font-black tracking-widest"
                      style={{ color: '#fb923c' }}
                    >
                      CONFIDENCE
                    </label>
                    <span className="text-base font-black" style={{ color: '#c084fc' }}>
                      {formData.confidence}/5
                    </span>
                  </div>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        onClick={() => setFormData((prev) => ({ ...prev, confidence: n }))}
                        className="flex-1 py-4 text-base font-black transition-all"
                        style={{
                          background: formData.confidence >= n ? '#1a0a3a' : '#111',
                          color: formData.confidence >= n ? '#c084fc' : '#666',
                          border: `1px solid ${formData.confidence >= n ? '#7c3aed' : '#2a2a2a'}`,
                        }}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label
                    className="block text-base font-black tracking-widest mb-3"
                    style={{ color: '#fb923c' }}
                  >
                    SENTIMENT
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { v: 'bullish', label: 'BULL', color: '#22c55e', activeBg: '#061a0c' },
                      { v: 'neutral', label: 'NEUT', color: '#60a5fa', activeBg: '#060d1a' },
                      { v: 'bearish', label: 'BEAR', color: '#ef4444', activeBg: '#1a0606' },
                    ].map((opt) => (
                      <button
                        key={opt.v}
                        onClick={() =>
                          setFormData((prev) => ({ ...prev, sentiment: opt.v as any }))
                        }
                        className="py-4 text-base font-black tracking-widest transition-all"
                        style={{
                          background: formData.sentiment === opt.v ? opt.activeBg : '#111',
                          color: opt.color,
                          border: `1px solid ${formData.sentiment === opt.v ? opt.color : '#2a2a2a'}`,
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* ── NOTES ── */}
            <section>
              <div
                className="text-base font-black tracking-[0.2em] mb-5"
                style={{ color: '#9ca3af' }}
              >
                — NOTES
              </div>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                className="w-full bg-[#0d0d0d] border border-[#333] px-6 py-5 text-white font-mono text-lg focus:outline-none focus:border-orange-500 resize-none"
                rows={3}
                placeholder="Thesis, market context, entry rationale..."
              />
            </section>
          </div>

          {/* Footer buttons */}
          <div
            className="flex gap-4 px-9 py-6"
            style={{ borderTop: '2px solid #1a1a1a', background: '#080808' }}
          >
            <button
              onClick={() => {
                setShowAddTrade(false)
                setEditingTrade(null)
              }}
              className="flex-1 py-6 text-base font-black uppercase tracking-widest transition-all"
              style={{ background: '#111', color: '#aaa', border: '1px solid #333' }}
            >
              CANCEL
            </button>
            <button
              onClick={handleTradeSubmit}
              disabled={!formData.symbol || !formData.quantity}
              className="py-6 text-lg font-black uppercase tracking-widest transition-all disabled:opacity-40"
              style={{
                flex: 2,
                background: '#7a1e00',
                color: '#fff',
                border: '2px solid #fb923c',
              }}
            >
              {editingTrade ? 'UPDATE POSITION' : 'ENTER POSITION'}
            </button>
          </div>
        </div>

        {/* ── RIGHT PANEL — Options Chain ── */}
        {isOptionsType && (
          <div
            className="flex-1 overflow-hidden"
            style={{ background: '#030303', height: '100vh' }}
          >
            <OptionsChain
              symbol={formData.symbol || 'SPY'}
              currentPrice={formData.entryPrice || 0}
              onContractSelect={handleContractSelect}
            />
          </div>
        )}
      </div>,
      document.body
    )
  }

  const AddGoalModal = () => {
    const [formData, setFormData] = useState({
      title: editingGoal?.title || '',
      type: editingGoal?.type || 'profit',
      target: editingGoal?.target || 0,
      period: editingGoal?.period || 'monthly',
      description: editingGoal?.description || '',
      category: editingGoal?.category || 'performance',
      unit: editingGoal?.unit || '$',
      deadline:
        editingGoal?.deadline ||
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    })

    const handleSubmit = () => {
      if (editingGoal) {
        const updatedGoal = {
          ...editingGoal,
          ...formData,
          targetValue: formData.target,
          currentValue: editingGoal.currentValue,
        }
        setGoals((prev) => prev.map((goal) => (goal.id === editingGoal.id ? updatedGoal : goal)))
      } else {
        const newGoal: TradingGoal = {
          id: Date.now().toString(),
          title: formData.title,
          description: formData.description,
          category: formData.category as 'performance' | 'risk' | 'skill',
          target: formData.target,
          targetValue: formData.target,
          current: 0,
          currentValue: 0,
          progress: 0,
          unit: formData.unit,
          deadline: formData.deadline,
          period: formData.period as 'daily' | 'weekly' | 'monthly' | 'yearly',
          type: formData.type as 'profit' | 'winRate' | 'trades' | 'maxDrawdown' | 'sharpeRatio',
          createdDate: new Date().toISOString().split('T')[0],
          targetDate: formData.deadline,
          isActive: true,
        }
        setGoals((prev) => [...prev, newGoal])
      }
      setShowAddGoal(false)
      setEditingGoal(null)
    }

    return (
      <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-gradient-to-br from-gray-900 via-black to-gray-900 border-2 border-orange-500/30 w-full max-w-4xl max-h-[95vh] overflow-y-auto font-mono">
          <div className="bg-gradient-to-r from-orange-900/30 to-black border-b border-orange-500/30 p-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-3">
                <div className="w-3 h-3 bg-orange-500 rounded-full animate-pulse"></div>
                <h3 className="text-2xl font-bold text-orange-400 uppercase tracking-wider">
                  {editingGoal ? 'MODIFY GOAL' : 'NEW TRADING GOAL'}
                </h3>
              </div>
              <button
                onClick={() => {
                  setShowAddGoal(false)
                  setEditingGoal(null)
                }}
                className="text-gray-400 hover:text-white p-2 border border-gray-600 hover:border-red-500"
              >
                <TbX size={20} />
              </button>
            </div>
          </div>

          <div className="p-6">
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-base font-bold text-gray-400 uppercase mb-2">
                    Goal Title
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-600 px-4 py-3 text-white text-lg focus:border-orange-500 focus:outline-none"
                    placeholder="Achieve 15% Monthly Return"
                  />
                </div>

                <div>
                  <label className="block text-base font-bold text-gray-400 uppercase mb-2">
                    Category
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, category: e.target.value as any }))
                    }
                    className="w-full bg-gray-800 border border-gray-600 px-4 py-3 text-white text-lg focus:border-orange-500 focus:outline-none"
                  >
                    <option value="performance">Performance</option>
                    <option value="risk">Risk Management</option>
                    <option value="skill">Skill Development</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-base font-bold text-gray-400 uppercase mb-2">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, description: e.target.value }))
                  }
                  className="w-full bg-gray-800 border border-gray-600 px-4 py-3 text-white text-lg h-28 focus:border-orange-500 focus:outline-none"
                  placeholder="Detailed description of the goal and success criteria..."
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-base font-bold text-gray-400 uppercase mb-2">
                    Goal Type
                  </label>
                  <select
                    value={formData.type}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, type: e.target.value as any }))
                    }
                    className="w-full bg-gray-800 border border-gray-600 px-4 py-3 text-white text-lg focus:border-orange-500 focus:outline-none"
                  >
                    <option value="profit">Profit Target</option>
                    <option value="winRate">Win Rate</option>
                    <option value="trades">Number of Trades</option>
                    <option value="maxDrawdown">Max Drawdown</option>
                    <option value="sharpeRatio">Sharpe Ratio</option>
                  </select>
                </div>

                <div>
                  <label className="block text-base font-bold text-gray-400 uppercase mb-2">
                    Time Period
                  </label>
                  <select
                    value={formData.period}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, period: e.target.value as any }))
                    }
                    className="w-full bg-gray-800 border border-gray-600 px-4 py-3 text-white text-lg focus:border-orange-500 focus:outline-none"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-base font-bold text-gray-400 uppercase mb-2">
                    Target Value
                  </label>
                  <input
                    type="number"
                    value={formData.target}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, target: Number(e.target.value) }))
                    }
                    className="w-full bg-gray-800 border border-gray-600 px-4 py-3 text-white text-lg focus:border-orange-500 focus:outline-none"
                    placeholder="100"
                  />
                </div>

                <div>
                  <label className="block text-base font-bold text-gray-400 uppercase mb-2">
                    Unit
                  </label>
                  <input
                    type="text"
                    value={formData.unit}
                    onChange={(e) => setFormData((prev) => ({ ...prev, unit: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-600 px-4 py-3 text-white text-lg focus:border-orange-500 focus:outline-none"
                    placeholder="%, $, trades"
                  />
                </div>

                <div>
                  <label className="block text-base font-bold text-gray-400 uppercase mb-2">
                    Deadline
                  </label>
                  <input
                    type="date"
                    value={formData.deadline}
                    onChange={(e) => setFormData((prev) => ({ ...prev, deadline: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-600 px-4 py-3 text-white text-lg focus:border-orange-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-8 pt-6 border-t border-gray-700/50">
              <button
                onClick={() => {
                  setShowAddGoal(false)
                  setEditingGoal(null)
                }}
                className="px-8 py-4 bg-gray-700 hover:bg-gray-600 text-white text-base font-bold uppercase tracking-wider border border-gray-500/50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!formData.title || !formData.target}
                className="px-8 py-4 bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-500 hover:to-orange-600 disabled:from-gray-600 disabled:to-gray-700 text-white text-base font-bold uppercase tracking-wider border border-orange-500/50 disabled:border-gray-500/50"
              >
                {editingGoal ? 'UPDATE GOAL' : 'CREATE GOAL'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const TAB_META: Record<
    string,
    { rgb: string; hexBorder: string; hexText: string; hexBg: string; hexInactive: string }
  > = {
    orange: {
      rgb: '251,146,60',
      hexBorder: '#fb923c',
      hexText: '#fb923c',
      hexBg: 'rgba(251,146,60,0.08)',
      hexInactive: '#e07830',
    },
    blue: {
      rgb: '59,130,246',
      hexBorder: '#3b82f6',
      hexText: '#3b82f6',
      hexBg: 'rgba(59,130,246,0.08)',
      hexInactive: '#4a90e8',
    },
    green: {
      rgb: '34,197,94',
      hexBorder: '#22c55e',
      hexText: '#22c55e',
      hexBg: 'rgba(34,197,94,0.08)',
      hexInactive: '#20b356',
    },
    cyan: {
      rgb: '6,182,212',
      hexBorder: '#06b6d4',
      hexText: '#06b6d4',
      hexBg: 'rgba(6,182,212,0.08)',
      hexInactive: '#0891b2',
    },
    purple: {
      rgb: '168,85,247',
      hexBorder: '#a855f7',
      hexText: '#a855f7',
      hexBg: 'rgba(168,85,247,0.08)',
      hexInactive: '#9b4de0',
    },
  }

  return (
    <div className="h-full bg-black text-white font-mono flex flex-col">
      {/* Tab Navigation - Full Width Goldman Sachs Style */}
      <div
        className="flex w-full border-b-2 border-[#1a1a1a] bg-[#050505]"
        style={{ minHeight: '60px' }}
      >
        {[
          { id: 'journal', label: 'POSITIONS', icon: TbActivity, color: 'orange' },
          { id: 'options', label: 'WATCHPICKS', icon: TbAnalyze, color: 'green' },
          { id: 'flow', label: 'WATCH FLOW', icon: TbTrendingUp, color: 'cyan' },
          { id: 'analytics', label: 'ANALYTICS', icon: TbChartLine, color: 'blue' },
          { id: 'settings', label: 'CONFIG', icon: TbSettings, color: 'purple' },
        ].map((tab, index, arr) => {
          const IconComponent = tab.icon
          const isActive = activeTab === tab.id
          const meta = TAB_META[tab.color]
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className="relative flex flex-1 items-center justify-center gap-2 py-4 text-sm font-black uppercase tracking-[0.18em] transition-all duration-150 select-none outline-none"
              style={{
                background: isActive
                  ? `linear-gradient(180deg, ${meta.hexBg} 0%, rgba(0,0,0,0.6) 100%)`
                  : 'transparent',
                color: isActive ? meta.hexText : meta.hexInactive,
                borderRight: index < arr.length - 1 ? '1px solid #1a1a1a' : 'none',
                borderBottom: isActive ? `3px solid ${meta.hexBorder}` : '3px solid transparent',
                boxShadow: isActive
                  ? `0 -1px 0 0 ${meta.hexBorder} inset, 0 8px 24px -8px rgba(${meta.rgb},0.25)`
                  : 'none',
                letterSpacing: '0.18em',
              }}
              onMouseEnter={(e) => {
                if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = '#ffffff'
              }}
              onMouseLeave={(e) => {
                if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = meta.hexInactive
              }}
            >
              {isActive && (
                <span
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: `radial-gradient(ellipse 80% 60% at 50% 100%, rgba(${meta.rgb},0.12), transparent)`,
                  }}
                />
              )}
              <IconComponent size={15} strokeWidth={2.5} />
              <span style={{ fontSize: '1.25rem', fontWeight: 900 }}>{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-black">
        {activeTab === 'journal' && (
          <div className="p-4">
            {/* Action Bar */}
            <div
              className="mb-0 border border-[#1e1e1e] bg-[#080808]"
              style={{ borderBottom: 'none' }}
            >
              <div
                className="flex items-center justify-between px-4 py-3"
                style={{ borderBottom: '1px solid #1a1a1a' }}
              >
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setEditingTrade(null)
                      setShowAddTrade(true)
                    }}
                    className="flex items-center gap-2 px-5 py-2.5 font-black uppercase tracking-widest text-black text-sm"
                    style={{
                      background: 'linear-gradient(135deg, #fb923c 0%, #ea5e0b 100%)',
                      boxShadow: '0 0 18px rgba(251,146,60,0.35)',
                    }}
                  >
                    <TbPlus size={16} strokeWidth={3} />
                    <span>NEW POSITION</span>
                  </button>
                  <button
                    onClick={() =>
                      fetchMarketData(
                        trades.filter((t) => t.status === 'open').map((t) => t.symbol)
                      )
                    }
                    className="flex items-center gap-2 px-4 py-2.5 font-black uppercase tracking-widest text-sm transition-all"
                    style={{
                      background: 'linear-gradient(135deg, #1d4ed8 0%, #1e3a8a 100%)',
                      color: '#60a5fa',
                      border: '1px solid #2563eb',
                      boxShadow: loading ? '0 0 14px rgba(59,130,246,0.4)' : 'none',
                    }}
                  >
                    <TbRefresh
                      size={15}
                      strokeWidth={2.5}
                      className={loading ? 'animate-spin' : ''}
                    />
                    <span>REFRESH</span>
                  </button>
                  <button
                    onClick={() => setShowFilterPanel((v) => !v)}
                    className="flex items-center gap-2 px-4 py-2.5 font-black uppercase tracking-widest text-sm transition-all"
                    style={{
                      background: showFilterPanel
                        ? 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)'
                        : 'linear-gradient(135deg, #111 0%, #0a0a0a 100%)',
                      color: showFilterPanel ? '#facc15' : '#a16207',
                      border: showFilterPanel ? '1px solid #facc15' : '1px solid #444',
                      boxShadow: showFilterPanel ? '0 0 14px rgba(250,204,21,0.3)' : 'none',
                    }}
                  >
                    <TbFilter size={15} strokeWidth={2.5} />
                    <span>FILTER</span>
                    {Object.values(filters).some((v) => v !== '') && (
                      <span className="ml-1 px-1.5 py-0.5 text-xs font-black bg-yellow-400 text-black rounded-full">
                        {Object.values(filters).filter((v) => v !== '').length}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={exportTradesToCSV}
                    className="flex items-center gap-2 px-4 py-2.5 font-black uppercase tracking-widest text-sm transition-all"
                    style={{
                      background: 'linear-gradient(135deg, #14532d 0%, #052e16 100%)',
                      color: '#4ade80',
                      border: '1px solid #16a34a',
                    }}
                  >
                    <TbDownload size={15} strokeWidth={2.5} />
                    <span>EXPORT</span>
                  </button>
                </div>
                <div className="flex items-center gap-3 text-sm font-black tracking-widest">
                  <span className="text-[#fb923c]">ACCOUNT:</span>
                  <span className="text-[#fb923c]">${accountSize.toLocaleString()}</span>
                  <span className="text-[#333]">|</span>
                  <span className="text-[#f87171]">RISK: {maxRiskPerTrade}%</span>
                </div>
              </div>

              {/* Filter Panel */}
              {showFilterPanel && (
                <div
                  className="px-4 py-3 grid grid-cols-2 md:grid-cols-4 gap-3"
                  style={{ background: '#060606', borderBottom: '1px solid #1a1a1a' }}
                >
                  <div>
                    <label className="block text-xs font-black text-[#facc15] uppercase tracking-widest mb-1">
                      SYMBOL
                    </label>
                    <input
                      type="text"
                      value={filters.symbol}
                      onChange={(e) => setFilters((f) => ({ ...f, symbol: e.target.value }))}
                      placeholder="e.g. AAPL"
                      className="w-full bg-[#111] border border-[#2a2a2a] text-white font-mono text-sm px-3 py-2 outline-none focus:border-yellow-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-[#facc15] uppercase tracking-widest mb-1">
                      STATUS
                    </label>
                    <select
                      value={filters.status}
                      onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
                      className="w-full bg-[#111] border border-[#2a2a2a] text-white font-mono text-sm px-3 py-2 outline-none focus:border-yellow-500"
                    >
                      <option value="">ALL</option>
                      <option value="open">OPEN</option>
                      <option value="closed">CLOSED</option>
                      <option value="partial">PARTIAL</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-black text-[#facc15] uppercase tracking-widest mb-1">
                      SIDE
                    </label>
                    <select
                      value={filters.type}
                      onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))}
                      className="w-full bg-[#111] border border-[#2a2a2a] text-white font-mono text-sm px-3 py-2 outline-none focus:border-yellow-500"
                    >
                      <option value="">ALL</option>
                      <option value="long">LONG</option>
                      <option value="short">SHORT</option>
                      <option value="call">CALL</option>
                      <option value="put">PUT</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-black text-[#facc15] uppercase tracking-widest mb-1">
                      STRATEGY
                    </label>
                    <input
                      type="text"
                      value={filters.strategy}
                      onChange={(e) => setFilters((f) => ({ ...f, strategy: e.target.value }))}
                      placeholder="e.g. Breakout"
                      className="w-full bg-[#111] border border-[#2a2a2a] text-white font-mono text-sm px-3 py-2 outline-none focus:border-yellow-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-[#facc15] uppercase tracking-widest mb-1">
                      FROM DATE
                    </label>
                    <input
                      type="date"
                      value={filters.dateFrom}
                      onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
                      className="w-full bg-[#111] border border-[#2a2a2a] text-white font-mono text-sm px-3 py-2 outline-none focus:border-yellow-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-[#facc15] uppercase tracking-widest mb-1">
                      TO DATE
                    </label>
                    <input
                      type="date"
                      value={filters.dateTo}
                      onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
                      className="w-full bg-[#111] border border-[#2a2a2a] text-white font-mono text-sm px-3 py-2 outline-none focus:border-yellow-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-[#facc15] uppercase tracking-widest mb-1">
                      MIN P&L ($)
                    </label>
                    <input
                      type="number"
                      value={filters.minPnL}
                      onChange={(e) => setFilters((f) => ({ ...f, minPnL: e.target.value }))}
                      placeholder="-1000"
                      className="w-full bg-[#111] border border-[#2a2a2a] text-white font-mono text-sm px-3 py-2 outline-none focus:border-yellow-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-[#facc15] uppercase tracking-widest mb-1">
                      MAX P&L ($)
                    </label>
                    <input
                      type="number"
                      value={filters.maxPnL}
                      onChange={(e) => setFilters((f) => ({ ...f, maxPnL: e.target.value }))}
                      placeholder="5000"
                      className="w-full bg-[#111] border border-[#2a2a2a] text-white font-mono text-sm px-3 py-2 outline-none focus:border-yellow-500"
                    />
                  </div>
                  <div className="col-span-2 md:col-span-4 flex justify-end">
                    <button
                      onClick={() =>
                        setFilters({
                          strategy: '',
                          status: '',
                          symbol: '',
                          type: '',
                          dateFrom: '',
                          dateTo: '',
                          minPnL: '',
                          maxPnL: '',
                        })
                      }
                      className="px-5 py-2 text-xs font-black uppercase tracking-widest text-[#f87171] border border-[#f87171]/40 hover:border-[#f87171] transition-all"
                    >
                      CLEAR ALL FILTERS
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Bloomberg Terminal Performance Dashboard */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
              <div className="bg-gradient-to-br from-gray-900 via-black to-gray-900 border border-orange-500/30 p-4 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-orange-500/10 to-transparent rounded-full -mr-8 -mt-8"></div>
                <div className="text-base text-orange-400 font-bold uppercase tracking-wider mb-2">
                  NET P&L
                </div>
                <div
                  className={`text-4xl font-bold font-mono ${performanceMetrics.netPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}
                >
                  {performanceMetrics.netPnL >= 0 ? '+' : ''}${performanceMetrics.netPnL.toFixed(2)}
                </div>
                <div className="text-base text-gray-500 mt-2">
                  {((performanceMetrics.netPnL / accountSize) * 100).toFixed(2)}% Account
                </div>
              </div>

              <div className="bg-gradient-to-br from-gray-900 via-black to-gray-900 border border-blue-500/30 p-4 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-blue-500/10 to-transparent rounded-full -mr-8 -mt-8"></div>
                <div className="text-base text-blue-400 font-bold uppercase tracking-wider mb-2">
                  WIN RATE
                </div>
                <div className="text-4xl font-bold font-mono text-blue-400">
                  {performanceMetrics.winRate.toFixed(1)}%
                </div>
                <div className="text-base text-gray-500 mt-2">
                  {performanceMetrics.winningTrades}W / {performanceMetrics.losingTrades}L
                </div>
              </div>

              <div className="bg-gradient-to-br from-gray-900 via-black to-gray-900 border border-purple-500/30 p-4 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-purple-500/10 to-transparent rounded-full -mr-8 -mt-8"></div>
                <div className="text-base text-purple-400 font-bold uppercase tracking-wider mb-2">
                  PROFIT FACTOR
                </div>
                <div className="text-4xl font-bold font-mono text-purple-400">
                  {performanceMetrics.profitFactor.toFixed(2)}
                </div>
                <div className="text-base text-gray-500 mt-2">Risk Adjusted</div>
              </div>

              <div className="bg-gradient-to-br from-gray-900 via-black to-gray-900 border border-green-500/30 p-4 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-green-500/10 to-transparent rounded-full -mr-8 -mt-8"></div>
                <div className="text-base text-green-400 font-bold uppercase tracking-wider mb-2">
                  SHARPE RATIO
                </div>
                <div className="text-4xl font-bold font-mono text-green-400">
                  {performanceMetrics.sharpeRatio.toFixed(2)}
                </div>
                <div className="text-xs text-gray-500 mt-1">Risk Return</div>
              </div>

              <div className="bg-gradient-to-br from-gray-900 via-black to-gray-900 border border-red-500/30 p-4 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-red-500/10 to-transparent rounded-full -mr-8 -mt-8"></div>
                <div className="text-base text-red-400 font-bold uppercase tracking-wider mb-2">
                  MAX DD
                </div>
                <div className="text-4xl font-bold font-mono text-red-400">
                  -{performanceMetrics.maxDrawdownPercent.toFixed(1)}%
                </div>
                <div className="text-base text-gray-500 mt-2">
                  ${performanceMetrics.maxDrawdown.toFixed(0)}
                </div>
              </div>

              <div className="bg-gradient-to-br from-gray-900 via-black to-gray-900 border border-yellow-500/30 p-4 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-yellow-500/10 to-transparent rounded-full -mr-8 -mt-8"></div>
                <div className="text-base text-yellow-400 font-bold uppercase tracking-wider mb-2">
                  TOTAL TRADES
                </div>
                <div className="text-4xl font-bold font-mono text-yellow-400">
                  {performanceMetrics.totalTrades}
                </div>
                <div className="text-base text-gray-500 mt-2">
                  {trades.filter((t) => t.status === 'open').length} Open
                </div>
              </div>
            </div>

            {/* Bloomberg Terminal Trades Table */}
            <div className="bg-black border border-orange-500/20 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xl font-mono">
                  <thead className="bg-gradient-to-r from-gray-800 via-black to-gray-800 border-b border-orange-500/30">
                    <tr>
                      <th className="px-4 py-4 text-left text-xl font-bold text-orange-400 uppercase tracking-wider">
                        TICKER
                      </th>
                      <th className="px-4 py-4 text-left text-xl font-bold text-orange-400 uppercase tracking-wider">
                        OPTION
                      </th>
                      <th className="px-4 py-4 text-left text-xl font-bold text-orange-400 uppercase tracking-wider">
                        QTY
                      </th>
                      <th className="px-4 py-4 text-left text-xl font-bold text-orange-400 uppercase tracking-wider">
                        ENTRY
                      </th>
                      <th className="px-4 py-4 text-left text-xl font-bold text-orange-400 uppercase tracking-wider">
                        CURRENT
                      </th>
                      <th className="px-4 py-4 text-left text-xl font-bold text-orange-400 uppercase tracking-wider">
                        P&amp;L
                      </th>
                      <th className="px-4 py-4 text-left text-xl font-bold text-orange-400 uppercase tracking-wider">
                        STOP
                      </th>
                      <th className="px-4 py-4 text-left text-xl font-bold text-orange-400 uppercase tracking-wider">
                        TARGETS
                      </th>
                      <th className="px-4 py-4 text-left text-xl font-bold text-orange-400 uppercase tracking-wider">
                        ACTIONS
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/50">
                    {filteredTrades.map((trade, index) => {
                      const isOpen = trade.status === 'open'
                      const currentPrice = trade.currentPrice || marketData[trade.symbol]?.price
                      // tradesWithMarketData already sanitizes currentOptionPrice and computes unrealizedPnL correctly
                      const hasRealOptionPnL = trade.isOptions
                        ? trade.currentOptionPrice != null && trade.currentOptionPrice > 0
                        : false
                      const unrealizedPnL = isOpen ? trade.unrealizedPnL || 0 : 0
                      const realizedPnL = trade.pnl || 0
                      const totalPnL = isOpen ? unrealizedPnL : realizedPnL
                      const pnlPercent = isOpen
                        ? trade.isOptions
                          ? hasRealOptionPnL && trade.entryPrice > 0
                            ? ((trade.currentOptionPrice! - trade.entryPrice) / trade.entryPrice) *
                              100
                            : null
                          : currentPrice
                            ? ((currentPrice - trade.entryPrice) / trade.entryPrice) *
                              100 *
                              (trade.type === 'long' ? 1 : -1)
                            : null
                        : (trade.pnlPercent ?? null)

                      return (
                        <tr
                          key={trade.id}
                          className={`hover:bg-gray-900/50 transition-colors ${
                            isOpen
                              ? 'bg-gradient-to-r from-blue-900/10 to-transparent border-l-2 border-blue-500'
                              : ''
                          }`}
                        >
                          <td className="px-3 py-3">
                            <div className="flex items-center space-x-2">
                              <div className="font-bold text-white text-2xl">{trade.symbol}</div>
                              {marketData[trade.symbol] && (
                                <div
                                  className={`w-2 h-2 rounded-full ${marketData[trade.symbol].changePercent >= 0 ? 'bg-green-500' : 'bg-red-500'} animate-pulse`}
                                ></div>
                              )}
                            </div>
                            {trade.strategy && (
                              <div className="text-gray-500 text-base">{trade.strategy}</div>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            {trade.isOptions && trade.strike && trade.expiry ? (
                              <>
                                <div
                                  className={`font-bold text-xl ${trade.optionType === 'call' ? 'text-green-400' : 'text-red-400'}`}
                                >
                                  ${trade.strike}{' '}
                                  {trade.optionType
                                    ? trade.optionType.charAt(0).toUpperCase() +
                                      trade.optionType.slice(1)
                                    : ''}
                                </div>
                                <div className="text-white text-base font-semibold">
                                  {(() => {
                                    const d = new Date(trade.expiry!)
                                    return d
                                      .toLocaleDateString('en-US', {
                                        month: 'long',
                                        day: 'numeric',
                                        year: 'numeric',
                                        timeZone: 'UTC',
                                      })
                                      .replace(',', '')
                                  })()}
                                </div>
                                {trade.delta && (
                                  <div className="text-white text-base">
                                    Δ {trade.delta.toFixed(2)}
                                  </div>
                                )}
                              </>
                            ) : (
                              <span
                                className={`text-xl font-bold ${
                                  trade.type === 'long'
                                    ? 'text-green-400'
                                    : trade.type === 'short'
                                      ? 'text-red-400'
                                      : 'text-blue-400'
                                }`}
                              >
                                {trade.type.toUpperCase()}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <div className="text-white font-bold text-2xl">
                              {trade.quantity.toLocaleString()}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-white font-mono text-2xl font-bold">
                            ${trade.entryPrice.toFixed(2)}
                          </td>
                          <td className="px-3 py-3">
                            {isOpen ? (
                              <div className="font-mono text-base space-y-0.5">
                                {currentPrice && (
                                  <div className="text-gray-300 text-base font-semibold">
                                    Stock:{' '}
                                    <span className="font-bold text-white">
                                      ${currentPrice.toFixed(2)}
                                    </span>
                                  </div>
                                )}
                                {trade.isOptions && trade.currentOptionPrice != null ? (
                                  <div className="text-yellow-300 text-base font-semibold">
                                    Premium:{' '}
                                    <span className="font-bold">
                                      ${trade.currentOptionPrice.toFixed(2)}
                                    </span>
                                  </div>
                                ) : trade.isOptions ? (
                                  <div className="text-gray-500 text-base">Premium: --</div>
                                ) : null}
                              </div>
                            ) : (
                              <div className="text-gray-500 font-mono text-base">
                                {trade.exitPrice ? `$${trade.exitPrice.toFixed(2)}` : '--'}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            {isOpen && trade.isOptions && !trade.currentOptionPrice ? (
                              <span className="text-gray-500 font-mono text-xl">--</span>
                            ) : (
                              <>
                                <div
                                  className={`font-bold font-mono text-2xl ${totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}
                                >
                                  {totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)}
                                </div>
                                {pnlPercent !== null && (
                                  <div
                                    className={`text-base font-mono ${pnlPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}
                                  >
                                    {pnlPercent >= 0 ? '+' : ''}
                                    {pnlPercent.toFixed(1)}%
                                  </div>
                                )}
                              </>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            {trade.stopLoss ? (
                              <div className="text-red-400 font-mono text-xl font-bold">
                                ${trade.stopLoss.toFixed(2)}
                              </div>
                            ) : (
                              <span className="text-gray-600">—</span>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            {trade.takeProfit ? (
                              <div className="text-green-400 font-mono text-xl font-bold">
                                <span className="text-gray-400 font-bold">T1 </span>$
                                {trade.takeProfit.toFixed(2)}
                              </div>
                            ) : null}
                            {(trade as any).target2 || (trade as any).target90 ? (
                              <div className="text-emerald-400 font-mono text-xl font-bold">
                                <span className="text-gray-400 font-bold">T2 </span>$
                                {((trade as any).target2 || (trade as any).target90).toFixed(2)}
                              </div>
                            ) : null}
                            {!trade.takeProfit &&
                            !(trade as any).target2 &&
                            !(trade as any).target90 ? (
                              <span className="text-gray-600">—</span>
                            ) : null}
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex space-x-1">
                              <button
                                onClick={() => {
                                  setSelectedTrade(trade)
                                  setShowTradeDetails(true)
                                }}
                                className="p-2 text-blue-400 hover:text-blue-300 hover:bg-blue-900/20 border border-blue-500/30 transition-colors"
                                title="View Details"
                              >
                                <TbEye size={20} />
                              </button>
                              <button
                                onClick={() => {
                                  setEditingTrade(trade)
                                  setShowAddTrade(true)
                                }}
                                className="p-2 text-orange-400 hover:text-orange-300 hover:bg-orange-900/20 border border-orange-500/30 transition-colors"
                                title="Edit Trade"
                              >
                                <TbEdit size={20} />
                              </button>
                              {trade.status === 'open' && (
                                <button
                                  onClick={() => {
                                    const exitPrice = trade.isOptions
                                      ? trade.currentOptionPrice || trade.entryPrice
                                      : currentPrice || trade.entryPrice
                                    closeTrade(trade.id, exitPrice)
                                  }}
                                  className="p-2 text-green-400 hover:text-green-300 hover:bg-green-900/20 border border-green-500/30 transition-colors"
                                  title="Close Position"
                                >
                                  <TbCheck size={20} />
                                </button>
                              )}
                              <button
                                onClick={() => deleteTrade(trade.id)}
                                className="p-2 text-red-400 hover:text-red-300 hover:bg-red-900/20 border border-red-500/30 transition-colors"
                                title="Delete Trade"
                              >
                                <TbTrash size={20} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>

                {filteredTrades.length === 0 && (
                  <div className="text-center py-12">
                    <TbActivity
                      size={80}
                      className="mx-auto mb-6"
                      style={{ color: '#fb923c', opacity: 0.4 }}
                    />
                    <p
                      className="text-4xl font-black uppercase tracking-widest"
                      style={{ color: '#fb923c' }}
                    >
                      {trades.length === 0 ? 'NO POSITIONS' : 'NO MATCHES'}
                    </p>
                    <p className="text-lg mt-4 font-bold" style={{ color: '#e07830' }}>
                      {trades.length === 0
                        ? 'Add your first trade to start tracking performance'
                        : 'Adjust your filters to see results'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="p-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Equity Curve — full width */}
              <div className="lg:col-span-3 bg-black border border-orange-500/30 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold text-orange-400 uppercase tracking-widest">
                    EQUITY CURVE
                  </h3>
                  <div
                    className={`text-2xl font-black font-mono ${performanceMetrics.netPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}
                  >
                    {performanceMetrics.netPnL >= 0 ? '+' : ''}$
                    {performanceMetrics.netPnL.toFixed(2)}
                  </div>
                </div>
                <div className="h-72 bg-black border border-gray-800 relative overflow-hidden">
                  {(() => {
                    const closedTrades = [...trades]
                      .filter((t) => t.status === 'closed' && t.entryDate)
                      .sort(
                        (a, b) => new Date(a.entryDate).getTime() - new Date(b.entryDate).getTime()
                      )

                    if (closedTrades.length === 0) {
                      return (
                        <div className="absolute inset-0 flex items-center justify-center text-gray-600 font-bold uppercase tracking-widest">
                          No closed trades yet
                        </div>
                      )
                    }

                    // Build cumulative P&L points
                    const points: { x: number; y: number; pnl: number }[] = []
                    let cumPnL = 0
                    const allPoints = [
                      { pnl: 0, label: 'START' },
                      ...closedTrades.map((t) => ({ pnl: t.pnl || 0, label: t.symbol })),
                    ]
                    allPoints.forEach((t, i) => {
                      cumPnL += t.pnl
                      points.push({ x: i, y: cumPnL, pnl: cumPnL })
                    })

                    const minY = Math.min(...points.map((p) => p.y))
                    const maxY = Math.max(...points.map((p) => p.y))
                    const rangeY = maxY - minY || 1
                    const W = 1000
                    const H = 240
                    const pad = { top: 20, bottom: 30, left: 60, right: 20 }
                    const iW = W - pad.left - pad.right
                    const iH = H - pad.top - pad.bottom

                    const toSvgX = (i: number) => pad.left + (i / (points.length - 1)) * iW
                    const toSvgY = (v: number) => pad.top + (1 - (v - minY) / rangeY) * iH

                    const linePath = points
                      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${toSvgX(i)} ${toSvgY(p.y)}`)
                      .join(' ')
                    const areaPath =
                      linePath +
                      ` L ${toSvgX(points.length - 1)} ${toSvgY(minY)} L ${toSvgX(0)} ${toSvgY(minY)} Z`
                    const isPositive = points[points.length - 1].y >= 0
                    const color = isPositive ? '#4ade80' : '#f87171'
                    const zeroY = toSvgY(0)

                    return (
                      <svg
                        viewBox={`0 0 ${W} ${H}`}
                        className="w-full h-full"
                        preserveAspectRatio="none"
                      >
                        <defs>
                          <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
                            <stop offset="100%" stopColor={color} stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        {/* Zero line */}
                        <line
                          x1={pad.left}
                          y1={zeroY}
                          x2={W - pad.right}
                          y2={zeroY}
                          stroke="#374151"
                          strokeWidth="1"
                          strokeDasharray="4 4"
                        />
                        <text
                          x={pad.left - 4}
                          y={zeroY + 4}
                          fill="#6b7280"
                          fontSize="14"
                          textAnchor="end"
                        >
                          $0
                        </text>
                        {/* Area fill */}
                        <path d={areaPath} fill="url(#eqGrad)" />
                        {/* Line */}
                        <path d={linePath} fill="none" stroke={color} strokeWidth="2.5" />
                        {/* Start dot + label */}
                        <circle cx={toSvgX(0)} cy={toSvgY(0)} r="5" fill="#9ca3af" />
                        <text
                          x={toSvgX(0) + 8}
                          y={toSvgY(0) - 8}
                          fill="#9ca3af"
                          fontSize="13"
                          fontWeight="bold"
                        >
                          START
                        </text>
                        {/* End dot + P&L label */}
                        <circle
                          cx={toSvgX(points.length - 1)}
                          cy={toSvgY(points[points.length - 1].y)}
                          r="6"
                          fill={color}
                        />
                        <text
                          x={toSvgX(points.length - 1) - 8}
                          y={toSvgY(points[points.length - 1].y) - 10}
                          fill={color}
                          fontSize="15"
                          fontWeight="bold"
                          textAnchor="end"
                        >
                          {points[points.length - 1].y >= 0 ? '+' : ''}$
                          {points[points.length - 1].y.toFixed(2)}
                        </text>
                        {/* Y axis min/max */}
                        <text
                          x={pad.left - 4}
                          y={pad.top + 10}
                          fill="#6b7280"
                          fontSize="13"
                          textAnchor="end"
                        >
                          ${maxY.toFixed(0)}
                        </text>
                        <text
                          x={pad.left - 4}
                          y={H - pad.bottom}
                          fill="#6b7280"
                          fontSize="13"
                          textAnchor="end"
                        >
                          ${minY.toFixed(0)}
                        </text>
                      </svg>
                    )
                  })()}
                </div>
              </div>

              {/* Risk Analytics */}
              <div className="bg-black border border-blue-500/30 p-6">
                <h3 className="text-base font-bold text-blue-400 uppercase tracking-widest mb-5">
                  RISK ANALYTICS
                </h3>
                <div className="space-y-0">
                  {[
                    {
                      label: 'Max Drawdown',
                      value: `-${performanceMetrics.maxDrawdownPercent.toFixed(1)}%`,
                      color: 'text-red-400',
                    },
                    {
                      label: 'Sharpe Ratio',
                      value: performanceMetrics.sharpeRatio.toFixed(2),
                      color: 'text-green-400',
                    },
                    {
                      label: 'Calmar Ratio',
                      value: performanceMetrics.calmarRatio.toFixed(2),
                      color: 'text-blue-400',
                    },
                    {
                      label: 'Avg Win',
                      value: `+$${performanceMetrics.avgWin.toFixed(2)}`,
                      color: 'text-green-400',
                    },
                    {
                      label: 'Avg Loss',
                      value: `-$${performanceMetrics.avgLoss.toFixed(2)}`,
                      color: 'text-red-400',
                    },
                    {
                      label: 'Best Trade',
                      value: `+$${performanceMetrics.largestWin.toFixed(2)}`,
                      color: 'text-green-400',
                    },
                    {
                      label: 'Worst Trade',
                      value: `$${performanceMetrics.largestLoss.toFixed(2)}`,
                      color: 'text-red-400',
                    },
                  ].map(({ label, value, color }) => (
                    <div
                      key={label}
                      className="flex justify-between items-center py-3 border-b border-gray-800 last:border-0"
                    >
                      <span className="text-sm font-semibold text-gray-300 uppercase tracking-wide">
                        {label}
                      </span>
                      <span className={`text-base font-black font-mono ${color}`}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Strategy Breakdown */}
              <div className="bg-black border border-purple-500/30 p-6">
                <h3 className="text-base font-bold text-purple-400 uppercase tracking-widest mb-5">
                  STRATEGY BREAKDOWN
                </h3>
                <div className="space-y-3">
                  {(() => {
                    const strategies = [...new Set(trades.map((t) => t.strategy))]
                    return strategies.map((strategy) => {
                      const strategyTrades = trades.filter(
                        (t) => t.strategy === strategy && t.status === 'closed'
                      )
                      const strategyPnL = strategyTrades.reduce((sum, t) => sum + (t.pnl || 0), 0)
                      const strategyWins = strategyTrades.filter((t) => (t.pnl || 0) > 0).length
                      const strategyWinRate =
                        strategyTrades.length > 0 ? (strategyWins / strategyTrades.length) * 100 : 0
                      return (
                        <div
                          key={strategy}
                          className="bg-gray-900/60 border border-gray-700/50 p-3"
                        >
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-white font-bold text-sm uppercase tracking-wide">
                              {strategy}
                            </span>
                            <span
                              className={`text-sm font-black font-mono ${strategyPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}
                            >
                              {strategyPnL >= 0 ? '+' : ''}${strategyPnL.toFixed(0)}
                            </span>
                          </div>
                          <div className="flex justify-between text-xs text-gray-400">
                            <span>{strategyTrades.length} trades</span>
                            <span>{strategyWinRate.toFixed(0)}% win rate</span>
                          </div>
                        </div>
                      )
                    })
                  })()}
                </div>
              </div>

              {/* Time Analysis */}
              <div className="bg-black border border-yellow-500/30 p-6">
                <h3 className="text-base font-bold text-yellow-400 uppercase tracking-widest mb-5">
                  TIME ANALYSIS
                </h3>
                <div className="space-y-0">
                  {[
                    {
                      label: 'Avg Hold Time',
                      value: `${performanceMetrics.avgHoldTime.toFixed(1)}h`,
                      color: 'text-white',
                    },
                    {
                      label: 'Total Fees',
                      value: `$${performanceMetrics.totalFees.toFixed(2)}`,
                      color: 'text-red-400',
                    },
                    {
                      label: 'Risk Adjusted',
                      value: `${performanceMetrics.riskAdjustedReturn.toFixed(1)}%`,
                      color: 'text-blue-400',
                    },
                    {
                      label: 'Open Positions',
                      value: `${trades.filter((t) => t.status === 'open').length}`,
                      color: 'text-orange-400',
                    },
                  ].map(({ label, value, color }) => (
                    <div
                      key={label}
                      className="flex justify-between items-center py-3 border-b border-gray-800 last:border-0"
                    >
                      <span className="text-sm font-semibold text-gray-300 uppercase tracking-wide">
                        {label}
                      </span>
                      <span className={`text-base font-black font-mono ${color}`}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Monthly Performance Heatmap — full width */}
              <div className="lg:col-span-3 bg-black border border-green-500/30 p-6">
                <h3 className="text-xl font-black text-green-400 uppercase tracking-widest mb-5">
                  MONTHLY PERFORMANCE
                </h3>
                <div className="grid grid-cols-6 gap-3">
                  {Array.from({ length: 12 }, (_, i) => {
                    const monthTrades = trades.filter((trade) => {
                      const tradeDate = new Date(trade.entryDate)
                      return tradeDate.getMonth() === i && trade.status === 'closed'
                    })
                    const monthPnL = monthTrades.reduce((sum, t) => sum + (t.pnl || 0), 0)
                    const pnlColor =
                      monthPnL > 0 ? 'text-green-400' : monthPnL < 0 ? 'text-red-400' : 'text-white'
                    const bgBorder =
                      monthPnL > 1000
                        ? 'bg-green-900/60 border-green-500/50'
                        : monthPnL > 0
                          ? 'bg-green-900/30 border-green-500/30'
                          : monthPnL < -1000
                            ? 'bg-red-900/60 border-red-500/50'
                            : monthPnL < 0
                              ? 'bg-red-900/30 border-red-500/30'
                              : 'bg-gray-900 border-gray-700/40'
                    return (
                      <div key={i} className={`p-4 text-center border ${bgBorder}`}>
                        <div className="text-base font-black text-white uppercase tracking-widest mb-1">
                          {new Date(2024, i).toLocaleDateString('en', { month: 'short' })}
                        </div>
                        <div className={`text-lg font-black font-mono ${pnlColor}`}>
                          {monthPnL >= 0 ? '+' : ''}${monthPnL.toFixed(0)}
                        </div>
                        <div className="text-sm font-semibold text-white mt-1">
                          {monthTrades.length} trades
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* P/L Tier Breakdown — full width */}
              <div className="lg:col-span-3 bg-black border border-orange-500/30 p-6">
                <h3 className="text-xl font-black text-orange-400 uppercase tracking-widest mb-6">
                  TRADE PERFORMANCE BREAKDOWN
                </h3>
                {(() => {
                  const closed = trades.filter((t) => t.status === 'closed')
                  if (closed.length === 0)
                    return (
                      <div className="text-gray-500 text-center py-8 font-bold uppercase">
                        No closed trades yet
                      </div>
                    )

                  // Compute pnlPercent for each trade
                  const withPct = closed.map((t) => {
                    let pct = 0
                    if (t.isOptions) {
                      // options % = pnl / (premium * qty * 100) * 100
                      const cost = t.entryPrice * (t.quantity || 1) * 100
                      pct = cost > 0 ? ((t.pnl || 0) / cost) * 100 : 0
                    } else if (t.entryPrice > 0 && t.exitPrice) {
                      const dir = t.type === 'short' ? -1 : 1
                      pct = ((t.exitPrice - t.entryPrice) / t.entryPrice) * 100 * dir
                    }
                    return { ...t, _pct: pct }
                  })

                  const losers = withPct.filter((t) => t._pct < 0)
                  const winners = withPct.filter((t) => t._pct > 0)
                  const totalLoss = losers.reduce((s, t) => s + Math.abs(t.pnl || 0), 0)
                  const totalWin = winners.reduce((s, t) => s + (t.pnl || 0), 0)

                  const lossTiers = [
                    {
                      label: 'Total Wipeout',
                      desc: '-75% or worse',
                      trades: losers.filter((t) => t._pct <= -75),
                    },
                    {
                      label: 'Heavy Loss',
                      desc: '-25% to -75%',
                      trades: losers.filter((t) => t._pct > -75 && t._pct <= -25),
                    },
                    {
                      label: 'Small Loss',
                      desc: '-10% to -25%',
                      trades: losers.filter((t) => t._pct > -25 && t._pct <= -10),
                    },
                    {
                      label: 'Minor Loss',
                      desc: '0% to -10%',
                      trades: losers.filter((t) => t._pct > -10),
                    },
                  ]
                  const winTiers = [
                    {
                      label: 'Big Winner',
                      desc: '+75% or more',
                      trades: winners.filter((t) => t._pct >= 75),
                    },
                    {
                      label: 'Strong Win',
                      desc: '+25% to +75%',
                      trades: winners.filter((t) => t._pct < 75 && t._pct >= 25),
                    },
                    {
                      label: 'Solid Win',
                      desc: '+10% to +25%',
                      trades: winners.filter((t) => t._pct < 25 && t._pct >= 10),
                    },
                    {
                      label: 'Small Win',
                      desc: '0% to +10%',
                      trades: winners.filter((t) => t._pct < 10),
                    },
                  ]

                  const renderTier = (
                    tier: { label: string; desc: string; trades: typeof withPct },
                    totalAbs: number,
                    isLoss: boolean
                  ) => {
                    const count = tier.trades.length
                    const dollarAmt = tier.trades.reduce((s, t) => s + Math.abs(t.pnl || 0), 0)
                    const pct = totalAbs > 0 ? (dollarAmt / totalAbs) * 100 : 0
                    const avgPct =
                      count > 0 ? tier.trades.reduce((s, t) => s + t._pct, 0) / count : 0
                    const color = isLoss ? 'text-red-400' : 'text-green-400'
                    const barColor = isLoss ? 'bg-red-500' : 'bg-green-500'
                    if (count === 0) return null
                    return (
                      <div
                        key={tier.label}
                        className="bg-gray-900/60 border border-gray-700/40 p-4"
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <div className="text-white font-black text-base uppercase tracking-wide">
                              {tier.label}
                            </div>
                            <div className="text-gray-400 text-xs mt-0.5">{tier.desc}</div>
                          </div>
                          <div className="text-right">
                            <div className={`text-xl font-black font-mono ${color}`}>
                              {pct.toFixed(1)}%
                            </div>
                            <div className="text-gray-300 text-xs font-mono">
                              of total {isLoss ? 'losses' : 'gains'}
                            </div>
                          </div>
                        </div>
                        <div className="w-full bg-gray-800 h-2 mb-3">
                          <div
                            className={`h-2 ${barColor}`}
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div>
                            <div className="text-white font-black text-base font-mono">{count}</div>
                            <div className="text-gray-400 text-xs uppercase">Trades</div>
                          </div>
                          <div>
                            <div className={`font-black text-base font-mono ${color}`}>
                              {avgPct.toFixed(1)}%
                            </div>
                            <div className="text-gray-400 text-xs uppercase">Avg %</div>
                          </div>
                          <div>
                            <div className={`font-black text-base font-mono ${color}`}>
                              {isLoss ? '-' : '+'}${dollarAmt.toFixed(0)}
                            </div>
                            <div className="text-gray-400 text-xs uppercase">$ Impact</div>
                          </div>
                        </div>
                      </div>
                    )
                  }

                  return (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Loss side */}
                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="text-lg font-black text-red-400 uppercase tracking-widest">
                            LOSS BREAKDOWN
                          </h4>
                          <div className="text-right">
                            <div className="text-red-400 font-black text-xl font-mono">
                              -${totalLoss.toFixed(0)}
                            </div>
                            <div className="text-gray-400 text-xs">
                              {losers.length} losing trades
                            </div>
                          </div>
                        </div>
                        <div className="space-y-3">
                          {lossTiers.map((tier) => renderTier(tier, totalLoss, true))}
                          {losers.length === 0 && (
                            <div className="text-gray-500 text-center py-4 font-bold uppercase text-sm">
                              No losing trades
                            </div>
                          )}
                        </div>
                      </div>
                      {/* Win side */}
                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="text-lg font-black text-green-400 uppercase tracking-widest">
                            WIN BREAKDOWN
                          </h4>
                          <div className="text-right">
                            <div className="text-green-400 font-black text-xl font-mono">
                              +${totalWin.toFixed(0)}
                            </div>
                            <div className="text-gray-400 text-xs">
                              {winners.length} winning trades
                            </div>
                          </div>
                        </div>
                        <div className="space-y-3">
                          {winTiers.map((tier) => renderTier(tier, totalWin, false))}
                          {winners.length === 0 && (
                            <div className="text-gray-500 text-center py-4 font-bold uppercase text-sm">
                              No winning trades
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })()}
              </div>

              {/* Trading Behavior Analysis — full width */}
              <div className="lg:col-span-3 bg-black border border-cyan-500/30 p-6">
                <h3 className="text-xl font-black text-cyan-400 uppercase tracking-widest mb-6">
                  TRADING BEHAVIOR ANALYSIS
                </h3>
                {(() => {
                  const closed = trades.filter((t) => t.status === 'closed' && t.entryDate)
                  if (closed.length === 0)
                    return (
                      <div className="text-gray-500 text-center py-8 font-bold uppercase">
                        No closed trades yet
                      </div>
                    )

                  const dayNames = [
                    'Sunday',
                    'Monday',
                    'Tuesday',
                    'Wednesday',
                    'Thursday',
                    'Friday',
                    'Saturday',
                  ]
                  const hourLabels = [
                    '12am',
                    '1a',
                    '2a',
                    '3a',
                    '4a',
                    '5a',
                    '6a',
                    '7a',
                    '8a',
                    '9a',
                    '10a',
                    '11a',
                    '12pm',
                    '1p',
                    '2p',
                    '3p',
                    '4p',
                    '5p',
                    '6p',
                    '7p',
                    '8p',
                    '9p',
                    '10p',
                    '11p',
                  ]

                  // Day of week stats
                  const dowStats = Array.from({ length: 7 }, (_, d) => {
                    const ts = closed.filter((t) => new Date(t.entryDate).getDay() === d)
                    const pnl = ts.reduce((s, t) => s + (t.pnl || 0), 0)
                    const wins = ts.filter((t) => (t.pnl || 0) > 0).length
                    return {
                      day: dayNames[d],
                      count: ts.length,
                      pnl,
                      winRate: ts.length > 0 ? (wins / ts.length) * 100 : 0,
                    }
                  }).filter((d) => d.count > 0)

                  // Hour of day stats (from entryTime or parse entryDate)
                  const hourStats: Record<number, { count: number; pnl: number; wins: number }> = {}
                  closed.forEach((t) => {
                    let h = -1
                    if (t.entryTime) {
                      const m = t.entryTime.match(/(\d+):(\d+)/)
                      if (m) h = parseInt(m[1])
                    } else {
                      const d = new Date(t.entryDate)
                      h = d.getHours()
                      if (h === 0 && t.entryDate.endsWith('T00:00:00.000Z')) h = -1 // midnight fallback = unknown
                    }
                    if (h >= 0) {
                      if (!hourStats[h]) hourStats[h] = { count: 0, pnl: 0, wins: 0 }
                      hourStats[h].count++
                      hourStats[h].pnl += t.pnl || 0
                      if ((t.pnl || 0) > 0) hourStats[h].wins++
                    }
                  })
                  const hourRows = Object.entries(hourStats)
                    .map(([h, v]) => ({
                      hour: parseInt(h),
                      label: hourLabels[parseInt(h)] || `${h}:00`,
                      ...v,
                      winRate: v.count > 0 ? (v.wins / v.count) * 100 : 0,
                    }))
                    .sort((a, b) => a.hour - b.hour)

                  // Month period stats (1-10 = early, 11-20 = mid, 21+ = late)
                  const periodStats = [
                    {
                      label: 'Early Month',
                      desc: 'Days 1–10',
                      trades: closed.filter((t) => new Date(t.entryDate).getDate() <= 10),
                    },
                    {
                      label: 'Mid Month',
                      desc: 'Days 11–20',
                      trades: closed.filter((t) => {
                        const d = new Date(t.entryDate).getDate()
                        return d >= 11 && d <= 20
                      }),
                    },
                    {
                      label: 'Late Month',
                      desc: 'Days 21+',
                      trades: closed.filter((t) => new Date(t.entryDate).getDate() >= 21),
                    },
                  ].map((p) => {
                    const pnl = p.trades.reduce((s, t) => s + (t.pnl || 0), 0)
                    const wins = p.trades.filter((t) => (t.pnl || 0) > 0).length
                    return {
                      ...p,
                      pnl,
                      count: p.trades.length,
                      winRate: p.trades.length > 0 ? (wins / p.trades.length) * 100 : 0,
                    }
                  })

                  const maxDowPnl = Math.max(...dowStats.map((d) => Math.abs(d.pnl)), 1)

                  return (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      {/* Day of Week */}
                      <div className="bg-gray-900/50 border border-gray-700/40 p-5">
                        <h4 className="text-base font-black text-white uppercase tracking-widest mb-4">
                          DAY OF WEEK
                        </h4>
                        <div className="space-y-3">
                          {dowStats.length === 0 && (
                            <div className="text-gray-500 text-sm">No data</div>
                          )}
                          {dowStats.map((d) => (
                            <div key={d.day}>
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-white font-black text-sm uppercase tracking-wide w-28">
                                  {d.day}
                                </span>
                                <span className="text-white text-xs font-semibold">
                                  {d.count} trades
                                </span>
                                <span
                                  className={`font-black text-sm font-mono w-20 text-right ${d.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}
                                >
                                  {d.pnl >= 0 ? '+' : ''} ${d.pnl.toFixed(0)}
                                </span>
                                <span
                                  className={`text-xs font-bold w-14 text-right ${d.winRate >= 50 ? 'text-green-400' : 'text-red-400'}`}
                                >
                                  {d.winRate.toFixed(0)}% W
                                </span>
                              </div>
                              <div className="w-full bg-gray-800 h-1.5">
                                <div
                                  className={`h-1.5 ${d.pnl >= 0 ? 'bg-green-500' : 'bg-red-500'}`}
                                  style={{ width: `${(Math.abs(d.pnl) / maxDowPnl) * 100}%` }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Time of Day */}
                      <div className="bg-gray-900/50 border border-gray-700/40 p-5">
                        <h4 className="text-base font-black text-white uppercase tracking-widest mb-4">
                          TIME OF DAY
                        </h4>
                        {hourRows.length === 0 ? (
                          <div className="text-gray-500 text-sm">
                            No time data — add entry time to trades
                          </div>
                        ) : (
                          (() => {
                            const maxH = Math.max(...hourRows.map((h) => Math.abs(h.pnl)), 1)
                            return (
                              <div className="space-y-3">
                                {hourRows.map((h) => (
                                  <div key={h.hour}>
                                    <div className="flex justify-between items-center mb-1">
                                      <span className="text-white font-black text-sm w-16">
                                        {h.label}
                                      </span>
                                      <span className="text-white text-xs font-semibold">
                                        {h.count} trades
                                      </span>
                                      <span
                                        className={`font-black text-sm font-mono w-20 text-right ${h.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}
                                      >
                                        {h.pnl >= 0 ? '+' : ''} ${h.pnl.toFixed(0)}
                                      </span>
                                      <span
                                        className={`text-xs font-bold w-14 text-right ${h.winRate >= 50 ? 'text-green-400' : 'text-red-400'}`}
                                      >
                                        {h.winRate.toFixed(0)}% W
                                      </span>
                                    </div>
                                    <div className="w-full bg-gray-800 h-1.5">
                                      <div
                                        className={`h-1.5 ${h.pnl >= 0 ? 'bg-green-500' : 'bg-red-500'}`}
                                        style={{ width: `${(Math.abs(h.pnl) / maxH) * 100}%` }}
                                      />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )
                          })()
                        )}
                      </div>

                      {/* Month Period */}
                      <div className="bg-gray-900/50 border border-gray-700/40 p-5">
                        <h4 className="text-base font-black text-white uppercase tracking-widest mb-4">
                          MONTH PERIOD
                        </h4>
                        <div className="space-y-4">
                          {periodStats.map((p) => {
                            const best = periodStats.reduce(
                              (a, b) => (b.pnl > a.pnl ? b : a),
                              periodStats[0]
                            )
                            return (
                              <div
                                key={p.label}
                                className={`p-4 border ${p.label === best.label && p.count > 0 ? 'border-cyan-500/60 bg-cyan-900/10' : 'border-gray-700/40 bg-black/30'}`}
                              >
                                <div className="flex justify-between items-center mb-2">
                                  <div>
                                    <div className="text-white font-black text-sm uppercase tracking-wide">
                                      {p.label}
                                    </div>
                                    <div className="text-gray-400 text-xs">{p.desc}</div>
                                  </div>
                                  {p.label === best.label && p.count > 0 && (
                                    <span className="text-cyan-400 text-xs font-black uppercase tracking-wide border border-cyan-500/40 px-2 py-0.5">
                                      BEST
                                    </span>
                                  )}
                                </div>
                                <div className="grid grid-cols-3 gap-2 text-center mt-3">
                                  <div>
                                    <div className="text-white font-black text-lg font-mono">
                                      {p.count}
                                    </div>
                                    <div className="text-gray-400 text-xs uppercase">Trades</div>
                                  </div>
                                  <div>
                                    <div
                                      className={`font-black text-lg font-mono ${p.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}
                                    >
                                      {p.pnl >= 0 ? '+' : ''} ${p.pnl.toFixed(0)}
                                    </div>
                                    <div className="text-gray-400 text-xs uppercase">P&L</div>
                                  </div>
                                  <div>
                                    <div
                                      className={`font-black text-lg font-mono ${p.winRate >= 50 ? 'text-green-400' : 'text-red-400'}`}
                                    >
                                      {p.winRate.toFixed(0)}%
                                    </div>
                                    <div className="text-gray-400 text-xs uppercase">Win Rate</div>
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  )
                })()}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'options' && (
          <div className="flex-1 overflow-y-auto h-full">
            {optionsContent ?? (
              <div className="flex items-center justify-center h-64">
                <div className="text-center">
                  <div className="text-white font-black text-lg uppercase tracking-widest mb-2">
                    No Options Tracked
                  </div>
                  <div className="text-gray-500 text-sm">
                    Add options from the Options Chain panel in the chart view
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'flow' && (
          <div className="flex-1 overflow-y-auto h-full">
            {flowContent ?? (
              <div className="flex items-center justify-center h-64">
                <div className="text-center">
                  <div className="text-white font-black text-lg uppercase tracking-widest mb-2">
                    No Flow Tracked
                  </div>
                  <div className="text-gray-500 text-sm">
                    Star trades in the Options Flow panel to track them here
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="overflow-y-auto" style={{ padding: '20px' }}>
            {/* ── BROKER IMPORT ── */}
            <div
              style={{
                background: '#0a0a0a',
                border: '2px solid #7c3aed',
                padding: '20px',
                marginBottom: '20px',
              }}
            >
              <h4
                style={{
                  fontSize: '16px',
                  fontWeight: 900,
                  color: '#c084fc',
                  letterSpacing: '2px',
                  marginBottom: '16px',
                  textTransform: 'uppercase',
                }}
              >
                IMPORT TRADES FROM BROKER
              </h4>

              {/* Broker Selector */}
              <div className="flex gap-3 mb-4">
                {(
                  [
                    {
                      id: 'tos',
                      label: 'ThinkOrSwim',
                      activeColor: '#facc15',
                      activeBg: '#422006',
                      activeBorder: '#facc15',
                    },
                    {
                      id: 'robinhood',
                      label: 'Robinhood',
                      activeColor: '#000',
                      activeBg: '#16a34a',
                      activeBorder: '#16a34a',
                    },
                    {
                      id: 'webull',
                      label: 'Webull',
                      activeColor: '#000',
                      activeBg: '#2563eb',
                      activeBorder: '#2563eb',
                    },
                  ] as const
                ).map((b) => {
                  const isActive = importBroker === b.id
                  return (
                    <button
                      key={b.id}
                      onClick={() => {
                        setImportBroker(b.id)
                        setImportStatus('idle')
                        setImportPreview([])
                        setImportError('')
                        setImportFileName('')
                      }}
                      style={{
                        flex: 1,
                        padding: '12px 8px',
                        fontSize: '15px',
                        fontWeight: 900,
                        letterSpacing: '1px',
                        textTransform: 'uppercase',
                        border: `2px solid ${isActive ? b.activeBorder : '#444'}`,
                        background: isActive ? b.activeBg : '#111',
                        color: isActive ? b.activeColor : '#ffffff',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                        boxShadow: isActive
                          ? `0 0 16px ${b.activeBorder}66, inset 0 1px 0 rgba(255,255,255,0.1)`
                          : 'none',
                      }}
                    >
                      {b.label}
                    </button>
                  )
                })}
              </div>

              {/* Instructions */}
              <div
                style={{
                  fontSize: '14px',
                  color: '#ffffff',
                  marginBottom: '16px',
                  border: '1px solid #333',
                  padding: '12px',
                  background: '#111',
                  lineHeight: 1.6,
                }}
              >
                {importBroker === 'tos' && (
                  <>
                    <span style={{ color: '#facc15', fontWeight: 900 }}>ThinkOrSwim: </span>Monitor
                    → Account Statement → Trade History → Export to CSV
                  </>
                )}
                {importBroker === 'robinhood' && (
                  <>
                    <span style={{ color: '#4ade80', fontWeight: 900 }}>Robinhood: </span>Account →
                    Statements &amp; History → Download CSV
                  </>
                )}
                {importBroker === 'webull' && (
                  <>
                    <span style={{ color: '#60a5fa', fontWeight: 900 }}>Webull: </span>My Account →
                    History → Orders → Export → CSV
                  </>
                )}
              </div>

              {/* Drop Zone */}
              <label
                onDragOver={(e) => {
                  e.preventDefault()
                  setImportDragging(true)
                }}
                onDragLeave={() => setImportDragging(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setImportDragging(false)
                  const file = e.dataTransfer.files[0]
                  if (file) handleBrokerImport(file)
                }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '100%',
                  border: `2px dashed ${importDragging ? '#c084fc' : '#555'}`,
                  cursor: 'pointer',
                  padding: '32px 16px',
                  marginBottom: '16px',
                  background: importDragging ? 'rgba(124,58,237,0.12)' : '#0d0d0d',
                  transition: 'all 0.2s',
                }}
              >
                <input
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) handleBrokerImport(f)
                    e.target.value = ''
                  }}
                />
                <svg
                  style={{
                    width: 36,
                    height: 36,
                    marginBottom: 10,
                    color: importDragging ? '#c084fc' : '#888',
                  }}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                  />
                </svg>
                <span
                  style={{
                    fontSize: '15px',
                    fontWeight: 900,
                    letterSpacing: '1px',
                    textTransform: 'uppercase',
                    color: importDragging ? '#c084fc' : '#ffffff',
                  }}
                >
                  {importFileName ? importFileName : 'Drop CSV here or click to browse'}
                </span>
              </label>

              {/* Status */}
              {importStatus === 'parsing' && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: '14px',
                    color: '#c084fc',
                    marginBottom: 12,
                    fontWeight: 700,
                  }}
                >
                  <div
                    style={{
                      width: 14,
                      height: 14,
                      border: '2px solid #c084fc',
                      borderTopColor: 'transparent',
                      borderRadius: '50%',
                      animation: 'spin 0.7s linear infinite',
                    }}
                  />
                  Parsing trades...
                </div>
              )}
              {importStatus === 'error' && (
                <div
                  style={{
                    fontSize: '14px',
                    color: '#f87171',
                    marginBottom: 12,
                    border: '1px solid #ef4444',
                    padding: '10px',
                    background: '#1a0000',
                    fontWeight: 600,
                  }}
                >
                  {importError}
                </div>
              )}
              {importStatus === 'done' && (
                <div
                  style={{
                    fontSize: '14px',
                    color: '#4ade80',
                    marginBottom: 12,
                    border: '1px solid #22c55e',
                    padding: '10px',
                    background: '#001a0a',
                    fontWeight: 700,
                  }}
                >
                  ✓ Successfully imported {importPreview.length} trades
                </div>
              )}

              {/* Preview Table */}
              {importStatus === 'preview' && importPreview.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div
                    style={{
                      fontSize: '14px',
                      fontWeight: 900,
                      color: '#c084fc',
                      letterSpacing: '1px',
                      marginBottom: 10,
                      textTransform: 'uppercase',
                    }}
                  >
                    {importPreview.length} trades detected — preview (first 5)
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid #333' }}>
                          {['Symbol', 'Type', 'Entry Date', 'Qty', 'Entry $', 'Exit $', 'P&L'].map(
                            (h) => (
                              <th
                                key={h}
                                style={{
                                  padding: '6px 8px',
                                  textAlign: 'left',
                                  color: '#ffffff',
                                  fontWeight: 900,
                                  fontSize: '12px',
                                  letterSpacing: '1px',
                                  textTransform: 'uppercase',
                                }}
                              >
                                {h}
                              </th>
                            )
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {importPreview.slice(0, 5).map((t, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid #222' }}>
                            <td style={{ padding: '7px 8px', color: '#fb923c', fontWeight: 900 }}>
                              {t.symbol}
                            </td>
                            <td style={{ padding: '7px 8px', color: '#ffffff', fontWeight: 700 }}>
                              {t.type}
                            </td>
                            <td style={{ padding: '7px 8px', color: '#ffffff' }}>{t.entryDate}</td>
                            <td style={{ padding: '7px 8px', color: '#ffffff' }}>{t.quantity}</td>
                            <td style={{ padding: '7px 8px', color: '#ffffff' }}>
                              ${t.entryPrice.toFixed(2)}
                            </td>
                            <td style={{ padding: '7px 8px', color: '#ffffff' }}>
                              {t.exitPrice ? `$${t.exitPrice.toFixed(2)}` : '—'}
                            </td>
                            <td
                              style={{
                                padding: '7px 8px',
                                fontWeight: 900,
                                color: (t.pnl ?? 0) >= 0 ? '#4ade80' : '#f87171',
                              }}
                            >
                              {t.pnl != null ? `${t.pnl >= 0 ? '+' : ''}$${t.pnl.toFixed(2)}` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex gap-3 mt-4">
                    <button
                      onClick={() => {
                        setTrades((prev) => {
                          const existing = new Set(
                            prev.map(
                              (t) => `${t.symbol}-${t.entryDate}-${t.entryPrice}-${t.quantity}`
                            )
                          )
                          const dedupe = importPreview.filter(
                            (t) =>
                              !existing.has(
                                `${t.symbol}-${t.entryDate}-${t.entryPrice}-${t.quantity}`
                              )
                          )
                          return [...prev, ...dedupe]
                        })
                        setImportStatus('done')
                      }}
                      style={{
                        flex: 1,
                        padding: '13px',
                        fontSize: '15px',
                        fontWeight: 900,
                        letterSpacing: '1px',
                        textTransform: 'uppercase',
                        border: '2px solid #7c3aed',
                        background: '#4c1d95',
                        color: '#ffffff',
                        cursor: 'pointer',
                        boxShadow: '0 0 12px #7c3aed66',
                      }}
                    >
                      Import {importPreview.length} Trades
                    </button>
                    <button
                      onClick={() => {
                        setImportStatus('idle')
                        setImportPreview([])
                        setImportFileName('')
                      }}
                      style={{
                        padding: '13px 24px',
                        fontSize: '15px',
                        fontWeight: 900,
                        letterSpacing: '1px',
                        textTransform: 'uppercase',
                        border: '2px solid #555',
                        background: '#1a1a1a',
                        color: '#ffffff',
                        cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Account Settings */}
              <div style={{ background: '#0a0a0a', border: '2px solid #166534', padding: '20px' }}>
                <h4
                  style={{
                    fontSize: '16px',
                    fontWeight: 900,
                    color: '#4ade80',
                    letterSpacing: '2px',
                    marginBottom: '16px',
                    textTransform: 'uppercase',
                  }}
                >
                  ACCOUNT PARAMETERS
                </h4>
                <div className="space-y-4">
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '13px',
                        fontWeight: 900,
                        color: '#ffffff',
                        letterSpacing: '1px',
                        textTransform: 'uppercase',
                        marginBottom: 6,
                      }}
                    >
                      Account Size ($)
                    </label>
                    <input
                      type="number"
                      value={accountSize}
                      onChange={(e) => setAccountSize(Number(e.target.value))}
                      style={{
                        width: '100%',
                        background: '#1a1a1a',
                        border: '1px solid #333',
                        padding: '10px 12px',
                        color: '#ffffff',
                        fontFamily: 'monospace',
                        fontSize: '15px',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                    <div style={{ fontSize: '13px', color: '#ffffff', marginTop: 4 }}>
                      Total trading capital available
                    </div>
                  </div>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '13px',
                        fontWeight: 900,
                        color: '#ffffff',
                        letterSpacing: '1px',
                        textTransform: 'uppercase',
                        marginBottom: 6,
                      }}
                    >
                      Max Risk Per Trade (%)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={maxRiskPerTrade}
                      onChange={(e) => setMaxRiskPerTrade(Number(e.target.value))}
                      style={{
                        width: '100%',
                        background: '#1a1a1a',
                        border: '1px solid #333',
                        padding: '10px 12px',
                        color: '#ffffff',
                        fontFamily: 'monospace',
                        fontSize: '15px',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                    <div style={{ fontSize: '13px', color: '#ffffff', marginTop: 4 }}>
                      Max ${((accountSize * maxRiskPerTrade) / 100).toFixed(0)} per trade
                    </div>
                  </div>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '13px',
                        fontWeight: 900,
                        color: '#ffffff',
                        letterSpacing: '1px',
                        textTransform: 'uppercase',
                        marginBottom: 6,
                      }}
                    >
                      Commission Per Trade ($)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      style={{
                        width: '100%',
                        background: '#1a1a1a',
                        border: '1px solid #333',
                        padding: '10px 12px',
                        color: '#ffffff',
                        fontFamily: 'monospace',
                        fontSize: '15px',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                      placeholder="0.65"
                    />
                    <div style={{ fontSize: '13px', color: '#ffffff', marginTop: 4 }}>
                      Round-trip commission cost
                    </div>
                  </div>
                </div>
              </div>

              {/* Risk Management */}
              <div style={{ background: '#0a0a0a', border: '2px solid #7f1d1d', padding: '20px' }}>
                <h4
                  style={{
                    fontSize: '16px',
                    fontWeight: 900,
                    color: '#f87171',
                    letterSpacing: '2px',
                    marginBottom: '16px',
                    textTransform: 'uppercase',
                  }}
                >
                  RISK CONTROLS
                </h4>
                <div className="space-y-4">
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '13px',
                        fontWeight: 900,
                        color: '#ffffff',
                        letterSpacing: '1px',
                        textTransform: 'uppercase',
                        marginBottom: 6,
                      }}
                    >
                      Daily Loss Limit ($)
                    </label>
                    <input
                      type="number"
                      style={{
                        width: '100%',
                        background: '#1a1a1a',
                        border: '1px solid #333',
                        padding: '10px 12px',
                        color: '#ffffff',
                        fontFamily: 'monospace',
                        fontSize: '15px',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                      placeholder="1000"
                    />
                    <div style={{ fontSize: '13px', color: '#ffffff', marginTop: 4 }}>
                      Stop trading when hit
                    </div>
                  </div>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '13px',
                        fontWeight: 900,
                        color: '#ffffff',
                        letterSpacing: '1px',
                        textTransform: 'uppercase',
                        marginBottom: 6,
                      }}
                    >
                      Max Open Positions
                    </label>
                    <input
                      type="number"
                      style={{
                        width: '100%',
                        background: '#1a1a1a',
                        border: '1px solid #333',
                        padding: '10px 12px',
                        color: '#ffffff',
                        fontFamily: 'monospace',
                        fontSize: '15px',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                      placeholder="5"
                    />
                    <div style={{ fontSize: '13px', color: '#ffffff', marginTop: 4 }}>
                      Maximum concurrent trades
                    </div>
                  </div>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '13px',
                        fontWeight: 900,
                        color: '#ffffff',
                        letterSpacing: '1px',
                        textTransform: 'uppercase',
                        marginBottom: 6,
                      }}
                    >
                      Portfolio Heat (%)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      style={{
                        width: '100%',
                        background: '#1a1a1a',
                        border: '1px solid #333',
                        padding: '10px 12px',
                        color: '#ffffff',
                        fontFamily: 'monospace',
                        fontSize: '15px',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                      placeholder="10.0"
                    />
                    <div style={{ fontSize: '13px', color: '#ffffff', marginTop: 4 }}>
                      Max total portfolio risk
                    </div>
                  </div>
                </div>
              </div>

              {/* Data Management */}
              <div style={{ background: '#0a0a0a', border: '2px solid #1e3a5f', padding: '20px' }}>
                <h4
                  style={{
                    fontSize: '16px',
                    fontWeight: 900,
                    color: '#60a5fa',
                    letterSpacing: '2px',
                    marginBottom: '16px',
                    textTransform: 'uppercase',
                  }}
                >
                  DATA EXPORT
                </h4>
                <div className="space-y-3">
                  {[
                    {
                      label: 'Export Trades (CSV)',
                      bg: '#1e3a5f',
                      border: '#3b82f6',
                      color: '#ffffff',
                      shadow: '#3b82f666',
                    },
                    {
                      label: 'Tax Report (PDF)',
                      bg: '#14401f',
                      border: '#22c55e',
                      color: '#ffffff',
                      shadow: '#22c55e66',
                    },
                    {
                      label: 'Performance Report',
                      bg: '#3b0764',
                      border: '#a855f7',
                      color: '#ffffff',
                      shadow: '#a855f766',
                    },
                    {
                      label: 'Backup Data',
                      bg: '#1a1a1a',
                      border: '#666',
                      color: '#ffffff',
                      shadow: 'none',
                    },
                  ].map((btn) => (
                    <button
                      key={btn.label}
                      style={{
                        width: '100%',
                        padding: '13px',
                        fontSize: '14px',
                        fontWeight: 900,
                        letterSpacing: '1px',
                        textTransform: 'uppercase',
                        background: btn.bg,
                        border: `2px solid ${btn.border}`,
                        color: btn.color,
                        cursor: 'pointer',
                        boxShadow: btn.shadow !== 'none' ? `0 0 10px ${btn.shadow}` : 'none',
                      }}
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* API Configuration */}
              <div style={{ background: '#0a0a0a', border: '2px solid #713f12', padding: '20px' }}>
                <h4
                  style={{
                    fontSize: '16px',
                    fontWeight: 900,
                    color: '#facc15',
                    letterSpacing: '2px',
                    marginBottom: '16px',
                    textTransform: 'uppercase',
                  }}
                >
                  API SETTINGS
                </h4>
                <div className="space-y-4">
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '13px',
                        fontWeight: 900,
                        color: '#ffffff',
                        letterSpacing: '1px',
                        textTransform: 'uppercase',
                        marginBottom: 6,
                      }}
                    >
                      Update Frequency (sec)
                    </label>
                    <select
                      style={{
                        width: '100%',
                        background: '#1a1a1a',
                        border: '1px solid #333',
                        padding: '10px 12px',
                        color: '#ffffff',
                        fontFamily: 'monospace',
                        fontSize: '15px',
                        outline: 'none',
                      }}
                    >
                      <option value="30">30 seconds</option>
                      <option value="60">1 minute</option>
                      <option value="300">5 minutes</option>
                    </select>
                  </div>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '13px',
                        fontWeight: 900,
                        color: '#ffffff',
                        letterSpacing: '1px',
                        textTransform: 'uppercase',
                        marginBottom: 6,
                      }}
                    >
                      Market Hours Only
                    </label>
                    <div className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        style={{ width: 18, height: 18, accentColor: '#fb923c' }}
                      />
                      <span style={{ fontSize: '14px', color: '#ffffff', fontWeight: 600 }}>
                        Only update during market hours
                      </span>
                    </div>
                  </div>
                  <div
                    style={{
                      background: '#111',
                      border: '1px solid #333',
                      padding: '12px',
                      marginTop: 8,
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        style={{
                          fontSize: '13px',
                          color: '#ffffff',
                          fontWeight: 900,
                          letterSpacing: '1px',
                        }}
                      >
                        API STATUS
                      </span>
                      <div className="flex items-center space-x-2">
                        <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                        <span style={{ fontSize: '13px', color: '#4ade80', fontWeight: 900 }}>
                          CONNECTED
                        </span>
                      </div>
                    </div>
                    <div style={{ fontSize: '13px', color: '#ffffff', marginTop: 6 }}>
                      Last update: {new Date().toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* System Status */}
            <div
              style={{
                background: '#0a0a0a',
                border: '2px solid #7c2d12',
                padding: '20px',
                marginTop: '20px',
              }}
            >
              <h4
                style={{
                  fontSize: '16px',
                  fontWeight: 900,
                  color: '#fb923c',
                  letterSpacing: '2px',
                  marginBottom: '16px',
                  textTransform: 'uppercase',
                }}
              >
                SYSTEM STATUS
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { value: trades.length, label: 'Total Trades', color: '#ffffff' },
                  {
                    value: trades.filter((t) => t.status === 'open').length,
                    label: 'Open Positions',
                    color: '#60a5fa',
                  },
                  {
                    value: `${((Object.keys(marketData).length * 100) / Math.max(trades.length, 1)).toFixed(0)}%`,
                    label: 'Data Coverage',
                    color: '#4ade80',
                  },
                  { value: goals.length, label: 'Active Goals', color: '#facc15' },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    style={{
                      textAlign: 'center',
                      background: '#111',
                      border: '1px solid #222',
                      padding: '16px 8px',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '32px',
                        fontWeight: 900,
                        color: stat.color,
                        lineHeight: 1.1,
                      }}
                    >
                      {stat.value}
                    </div>
                    <div
                      style={{
                        fontSize: '12px',
                        color: '#ffffff',
                        fontWeight: 700,
                        letterSpacing: '1px',
                        textTransform: 'uppercase',
                        marginTop: 6,
                      }}
                    >
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showAddTrade && AddTradeModal()}
      {showAddGoal && <AddGoalModal />}
    </div>
  )
}

export default TradingPlan
