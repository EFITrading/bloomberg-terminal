'use client'

import {
  Activity,
  ArrowUpDown,
  BarChart3,
  Bell,
  ChevronRight,
  Filter,
  Layers,
  RefreshCw,
  Search,
  Settings,
  Shield,
  Target,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react'

import React, { useEffect, useRef, useState } from 'react'

import { TOP_1000_SYMBOLS } from '@/lib/Top1000Symbols'

interface GEXScreenerData {
  ticker: string
  attractionLevel: number
  currentPrice: number
  dealerSweat: number
  netGex: number
  bias: 'Bullish' | 'Bearish'
  strength: number
  volatility: 'Low' | 'Medium' | 'High'
  range: number
  marketCap?: number
  gexImpactScore?: number
  // Wall data for Support/Resistance tab
  largestWall?: {
    strike: number
    gex: number
    type: 'call' | 'put'
    pressure: number
    cluster?: {
      strikes: number[]
      centralStrike: number
      totalGEX: number
      contributions: number[] // Percentage contributions
      type: 'call' | 'put'
    }
  }
}

interface PremiumImbalance {
  symbol: string
  stockPrice: number
  atmStrike: number
  callMid: number
  callBid: number
  callAsk: number
  callSpreadPercent: number
  putMid: number
  putBid: number
  putAsk: number
  putSpreadPercent: number
  premiumDifference: number
  imbalancePercent: number
  expensiveSide: 'CALLS' | 'PUTS'
  imbalanceSeverity: 'EXTREME' | 'HIGH' | 'MODERATE'
  strikeSpacing: number
  putStrike: number
  callStrike: number
  lastSeenTime?: string
  expiry?: string
}

interface GEXScreenerProps {
  compactMode?: boolean
}

export default function GEXScreener({ compactMode = false }: GEXScreenerProps) {
  const [activeTab, setActiveTab] = useState('attraction')
  const [scanning, setScanning] = useState(false)
  const [selectedRow, setSelectedRow] = useState<number | null>(null)
  const [liveUpdate, setLiveUpdate] = useState(true)
  const [sortBy, setSortBy] = useState('dealerSweat')
  const [sortOrder, setSortOrder] = useState('desc')
  const [searchTerm, setSearchTerm] = useState('')
  const [hoveredRow, setHoveredRow] = useState<number | null>(null)
  const [animationClass, setAnimationClass] = useState('')
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 0 })
  const [gexData, setGexData] = useState<GEXScreenerData[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [expirationFilter, setExpirationFilter] = useState('Default')
  const [strengthFilter, setStrengthFilter] = useState<'all' | 'purple' | 'blue' | 'yellow'>('all')
  const [currentPage, setCurrentPage] = useState(1)

  // Mobile detection
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Responsive items per page: 10 for mobile, 20 for desktop
  const itemsPerPage = isMobile ? 10 : 20

  // OTM Premium Scanner state
  const [otmResults, setOtmResults] = useState<PremiumImbalance[]>([])
  const [otmLoading, setOtmLoading] = useState(false)
  const [otmSymbols] = useState(TOP_1000_SYMBOLS.join(','))
  const [otmExpiry, setOtmExpiry] = useState('')
  const [otmLastUpdate, setOtmLastUpdate] = useState<Date | null>(null)
  const [otmScanProgress, setOtmScanProgress] = useState({ current: 0, total: 0 })
  const [otmScanningSymbol, setOtmScanningSymbol] = useState('')
  const otmEventSourceRef = useRef<EventSource | null>(null)

  // Disabled auto-refresh on filter change to prevent flickering - user can manually refresh
  // useEffect(() => {
  // if (gexData.length > 0) { // Only auto-refresh if we already have data
  // fetchGEXData();
  // }
  // }, [expirationFilter]);

  // Function to fetch real GEX data with streaming updates
  const fetchGEXData = async () => {
    setLoading(true)
    setError('')
    setAnimationClass('animate-pulse')

    // Don't clear existing data to prevent flickering

    try {
      console.log(
        ` Starting real-time GEX screener scan with ${expirationFilter} expiration filter...`
      )

      const response = await fetch(
        `/api/gex-screener?limit=1000&stream=true&expirationFilter=${expirationFilter}`
      )

      if (!response.ok) {
        throw new Error(`Failed to fetch GEX data: ${response.statusText}`)
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        throw new Error('Failed to get response reader')
      }

      let buffer = ''
      const currentResults: GEXScreenerData[] = []
      let isNewScan = false

      while (true) {
        const { done, value } = await reader.read()

        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Process complete messages
        const lines = buffer.split('\n\n')
        buffer = lines.pop() || '' // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const messageData = JSON.parse(line.substring(6))

              switch (messageData.type) {
                case 'start':
                  console.log(` Starting scan of ${messageData.total} symbols...`)
                  setScanProgress({ current: 0, total: messageData.total })
                  isNewScan = true
                  // Clear results only when a new scan starts
                  currentResults.length = 0
                  break

                case 'result':
                  // Update progress
                  setScanProgress({ current: messageData.progress, total: messageData.total })

                  // Transform and add new result
                  const transformedItem: GEXScreenerData = {
                    ticker: messageData.data.ticker,
                    attractionLevel: messageData.data.attractionLevel,
                    currentPrice: messageData.data.currentPrice,
                    dealerSweat: messageData.data.dealerSweat,
                    netGex: messageData.data.netGex,
                    bias:
                      messageData.data.dealerSweat > 0
                        ? ('Bullish' as const)
                        : ('Bearish' as const),
                    strength: messageData.data.gexImpactScore || 0,
                    volatility:
                      Math.abs(messageData.data.netGex) > 2
                        ? ('High' as const)
                        : Math.abs(messageData.data.netGex) > 0.5
                          ? ('Medium' as const)
                          : ('Low' as const),
                    range: Math.abs(
                      ((messageData.data.attractionLevel - messageData.data.currentPrice) /
                        messageData.data.currentPrice) *
                        100
                    ),
                    marketCap: messageData.data.marketCap,
                    gexImpactScore: messageData.data.gexImpactScore,
                    largestWall: messageData.data.largestWall,
                  }

                  currentResults.push(transformedItem)

                  // Update display in real-time as results stream in
                  const sortedResults = [...currentResults].sort(
                    (a, b) => (b.gexImpactScore || 0) - (a.gexImpactScore || 0)
                  )
                  setGexData(sortedResults)

                  // DON'T update display during scan - only log progress
                  // This prevents flickering and constant re-renders

                  const wallInfo = messageData.data.largestWall
                    ? messageData.data.largestWall.cluster
                      ? `| Cluster: ${messageData.data.largestWall.type.toUpperCase()} ${messageData.data.largestWall.cluster.strikes.length} strikes @ $${messageData.data.largestWall.strike.toFixed(0)} (${messageData.data.largestWall.pressure}% pressure)`
                      : `| Wall: ${messageData.data.largestWall.type.toUpperCase()} $${messageData.data.largestWall.strike.toFixed(0)} (${messageData.data.largestWall.pressure}% pressure)`
                    : '| No walls found'
                  console.log(
                    ` Added ${messageData.data.ticker}: Attraction $${messageData.data.attractionLevel.toFixed(0)} | GEX Impact: ${messageData.data.gexImpactScore}% ${wallInfo} (${messageData.progress}/${messageData.total})`
                  )
                  break

                case 'complete':
                  console.log(` GEX screener completed with ${messageData.count} results`)
                  setScanProgress({ current: messageData.count, total: messageData.count })
                  // Set final sorted results
                  const finalSortedResults = [...currentResults].sort(
                    (a, b) => (b.gexImpactScore || 0) - (a.gexImpactScore || 0)
                  )
                  setGexData(finalSortedResults)
                  setLoading(false)
                  setAnimationClass('')

                  break

                case 'error':
                  throw new Error(messageData.error)
              }
            } catch (parseError) {
              console.error('Error parsing SSE message:', parseError)
            }
          }
        }
      }
    } catch (err) {
      console.error(' GEX screener error:', err)
      setError(err instanceof Error ? err.message : 'Failed to load GEX data')
      setLoading(false)
      setAnimationClass('')
    }
  }

  const handleScan = () => {
    setScanning(true)
    fetchGEXData().finally(() => {
      setScanning(false)
    })
  }

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(column)
      setSortOrder('desc')
    }
  }

  // OTM Premium Scanner functions
  const getNextMonthlyExpiry = () => {
    const today = new Date()
    const year = today.getFullYear()
    const month = today.getMonth()
    const nextMonth = new Date(year, month + 1, 1)
    let firstFriday = 1
    while (new Date(nextMonth.getFullYear(), nextMonth.getMonth(), firstFriday).getDay() !== 5) {
      firstFriday++
    }
    const thirdFriday = firstFriday + 14
    const expiryDate = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), thirdFriday)
    const yyyy = expiryDate.getFullYear()
    const mm = String(expiryDate.getMonth() + 1).padStart(2, '0')
    const dd = String(expiryDate.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }

  const scanOTMPremiums = async () => {
    console.log('[OTM] scanOTMPremiums called')
    setOtmLoading(true)
    setOtmResults([])
    setOtmScanProgress({ current: 0, total: otmSymbols.split(',').length })

    if (otmEventSourceRef.current) {
      otmEventSourceRef.current.close()
    }

    try {
      const url = `/api/scan-premium-stream?symbols=${encodeURIComponent(otmSymbols)}`
      console.log('[OTM] opening EventSource:', url.slice(0, 120))
      const eventSource = new EventSource(url)
      otmEventSourceRef.current = eventSource

      eventSource.onopen = () => console.log('[OTM] EventSource connected')

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type === 'progress') {
            setOtmScanProgress(data.progress)
            setOtmScanningSymbol(data.symbol)
          } else if (data.type === 'debug') {
            console.log('[OTM]', data.msg)
          } else if (data.type === 'result') {
            console.log(
              '[OTM] RESULT:',
              data.result?.symbol,
              data.result?.imbalancePercent?.toFixed(1) + '%'
            )
            setOtmResults((prev) => {
              const newResults = [...prev, data.result]
              return newResults.sort(
                (a, b) => Math.abs(b.imbalancePercent) - Math.abs(a.imbalancePercent)
              )
            })
          } else if (data.type === 'complete') {
            console.log('[OTM] scan complete')
            setOtmLoading(false)
            setOtmLastUpdate(new Date())
            setOtmScanningSymbol('')
            eventSource.close()
          } else if (data.type === 'error') {
            console.error('[OTM] scan error:', data.error)
          }
        } catch (e) {
          console.error('[OTM] failed to parse event:', event.data, e)
        }
      }

      eventSource.onerror = (e) => {
        console.error('[OTM] EventSource error — readyState:', eventSource.readyState, e)
        setOtmLoading(false)
        setOtmScanningSymbol('')
        eventSource.close()
      }
    } catch (error) {
      console.error('[OTM] failed to open stream:', error)
      setOtmLoading(false)
    }
  }

  const formatExpiryDate = (dateStr: string) => {
    if (!dateStr) return ''
    const date = new Date(dateStr + 'T00:00:00')
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  useEffect(() => {
    const monthlyExpiry = getNextMonthlyExpiry()
    setOtmExpiry(monthlyExpiry)
  }, [])

  const filteredGexData = gexData
    .filter((item) => item.ticker.toLowerCase().includes(searchTerm.toLowerCase()))
    .filter((item) => {
      // Base filter: only show strength >= 40% (Yellow, Blue, Purple)
      if (item.strength < 40) return false

      // Strength filter
      if (strengthFilter === 'purple') return item.strength > 75
      if (strengthFilter === 'blue') return item.strength >= 63 && item.strength <= 75
      if (strengthFilter === 'yellow') return item.strength >= 40 && item.strength < 63
      return true // 'all' shows all >= 40%
    })
    .sort((a, b) => {
      const aValue =
        sortBy === 'dealerSweat'
          ? a.dealerSweat
          : sortBy === 'targetLevel'
            ? a.attractionLevel
            : a.currentPrice
      const bValue =
        sortBy === 'dealerSweat'
          ? b.dealerSweat
          : sortBy === 'targetLevel'
            ? b.attractionLevel
            : b.currentPrice

      return sortOrder === 'desc' ? bValue - aValue : aValue - bValue
    })

  // Pagination calculations
  const totalPages = Math.ceil(filteredGexData.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedData = filteredGexData.slice(startIndex, endIndex)

  // Support/Resistance tab pagination
  const filteredWallData = filteredGexData
    .filter((item) => item.largestWall)
    .sort((a, b) => (b.largestWall?.pressure || 0) - (a.largestWall?.pressure || 0))
  const totalWallPages = Math.ceil(filteredWallData.length / itemsPerPage)
  const paginatedWallData = filteredWallData.slice(startIndex, endIndex)

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, sortBy, sortOrder, strengthFilter])

  return (
    <div className="bg-gradient-to-br from-gray-950 via-black to-gray-900 text-white">
      {/* Premium Header - Mobile Responsive */}
      <div className="bg-gradient-to-r from-black via-gray-950 to-black border-b border-orange-500/30 shadow-2xl backdrop-blur-sm">
        <div className="px-3 md:px-8 py-3 md:py-6">
          {/* Mobile: Stack everything vertically */}
          <div className="flex flex-col gap-3 md:gap-0 md:flex-row md:items-center md:justify-between">
            {/* Title and Status Row - Hidden in compact mode */}
            {!compactMode && (
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-8">
                <div className="flex items-center gap-2 md:gap-4">
                  <div className="space-y-1">
                    <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        {expirationFilter !== 'Default' && (
                          <div className="px-2 md:px-3 py-1 rounded-full bg-purple-500/20 border border-purple-500/40">
                            <span className="text-purple-400 text-xs md:text-sm font-bold">
                              {expirationFilter.toUpperCase()} EXPIRY
                            </span>
                          </div>
                        )}
                        {loading && scanProgress.total > 0 && (
                          <div className="flex items-center gap-2 px-2 md:px-3 py-1 rounded-full bg-orange-500/20 border border-orange-500/40 animate-pulse">
                            <div className="w-1.5 h-1.5 md:w-2 md:h-2 bg-orange-400 rounded-full animate-pulse"></div>
                            <span className="text-orange-400 text-xs md:text-sm font-bold">
                              SCANNING
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    {loading && scanProgress.total > 0 && (
                      <div className="text-xs md:text-sm text-orange-300/80">
                        {scanProgress.current}/{scanProgress.total} (
                        {Math.round((scanProgress.current / scanProgress.total) * 100)}%)
                      </div>
                    )}
                  </div>
                </div>

                {/* Search Bar - Full width on mobile - Hidden in compact mode */}
                <div className="relative w-full md:w-80 md:ml-8">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-3 w-3 md:h-4 md:w-4 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    placeholder="Search..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="block w-full pl-8 md:pl-10 pr-3 py-2 md:py-3 text-sm border border-gray-700 rounded-xl bg-gray-900/50 backdrop-blur-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all duration-300"
                  />
                </div>
              </div>
            )}

            {/* Action Buttons Row - Hidden in compact mode (moved to filters) */}
            {!compactMode && (
              <div className="flex items-center gap-2 md:gap-4">
                <button
                  onClick={handleScan}
                  disabled={loading}
                  className={`px-4 md:px-6 py-2 md:py-3 font-bold text-xs md:text-sm transition-all duration-300 rounded-xl flex items-center gap-2 ${
                    loading
                      ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                      : 'bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white shadow-lg hover:shadow-xl transform hover:scale-105'
                  }`}
                >
                  <RefreshCw className={`w-4 h-4 md:w-5 md:h-5 ${loading ? 'animate-spin' : ''}`} />
                  {loading ? 'SCANNING...' : 'SCAN NOW'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Enhanced Navigation - Mobile Responsive */}
      <div className="bg-gradient-to-r from-gray-900/80 to-black/80 backdrop-blur-sm border-b border-orange-500/20 px-3 md:px-8 py-3 md:py-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          {/* Tab Buttons - Scroll on mobile */}
          <div className="flex gap-2 md:gap-4 overflow-x-auto pb-2 md:pb-0 scrollbar-hide">
            <button
              onClick={() => {
                setActiveTab('attraction')
                setCurrentPage(1)
              }}
              className={`flex items-center gap-2 md:gap-4 px-6 md:px-12 py-3 md:py-6 font-black text-sm md:text-lg transition-all duration-300 relative rounded-xl whitespace-nowrap flex-shrink-0 ${
                activeTab === 'attraction'
                  ? 'bg-gradient-to-b from-black via-gray-900 to-black text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_4px_8px_rgba(0,0,0,0.8)] border-2 border-gray-700 transform scale-105'
                  : 'bg-gradient-to-b from-black via-gray-900 to-black text-gray-400 hover:text-white border-2 border-gray-800 hover:border-gray-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_2px_4px_rgba(0,0,0,0.8)]'
              }`}
            >
              <Target className="w-4 h-4 md:w-6 md:h-6" />
              <span className="hidden sm:inline tracking-wider">ATTRACTION ZONES</span>
              <span className="sm:hidden tracking-wider">ATTRACTION</span>
              {activeTab === 'attraction' && (
                <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-12 h-1.5 bg-gradient-to-r from-orange-400 to-orange-600 rounded-full shadow-lg" />
              )}
            </button>
            <button
              onClick={() => {
                setActiveTab('otm-premiums')
                setCurrentPage(1)
              }}
              className={`flex items-center gap-2 md:gap-4 px-6 md:px-12 py-3 md:py-6 font-black text-sm md:text-lg transition-all duration-300 relative rounded-xl whitespace-nowrap flex-shrink-0 ${
                activeTab === 'otm-premiums'
                  ? 'bg-gradient-to-b from-black via-gray-900 to-black text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_4px_8px_rgba(0,0,0,0.8)] border-2 border-gray-700 transform scale-105'
                  : 'bg-gradient-to-b from-black via-gray-900 to-black text-gray-400 hover:text-white border-2 border-gray-800 hover:border-gray-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_2px_4px_rgba(0,0,0,0.8)]'
              }`}
            >
              <Layers className="w-4 h-4 md:w-6 md:h-6" />
              <span className="hidden sm:inline tracking-wider">OTM PREMIUMS</span>
              <span className="sm:hidden tracking-wider">OTM</span>
              {activeTab === 'otm-premiums' && (
                <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-12 h-1.5 bg-gradient-to-r from-orange-400 to-orange-600 rounded-full shadow-lg" />
              )}
            </button>
          </div>

          {/* Filter Controls - Expiration and Strength Filters */}
          <div className="flex items-center gap-3">
            <select
              value={expirationFilter}
              onChange={(e) => setExpirationFilter(e.target.value)}
              className="bg-gray-800/50 border border-gray-600/50 rounded-xl px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm font-semibold text-white hover:bg-gray-700/70 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="Default">Default (45 Days)</option>
              <option value="Week">Week</option>
              <option value="Month">Month</option>
              <option value="Quad">Quad</option>
            </select>

            <select
              value={strengthFilter}
              onChange={(e) =>
                setStrengthFilter(e.target.value as 'all' | 'purple' | 'blue' | 'yellow')
              }
              className="bg-gray-800/50 border border-gray-600/50 rounded-xl px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm font-semibold text-white hover:bg-gray-700/70 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="all">All Strengths</option>
              <option value="purple">🟣 Magnetic Only (&gt;75%)</option>
              <option value="blue">🔵 Moderate Only (63-75%)</option>
              <option value="yellow">🟡 Weak Pull (40-62%)</option>
            </select>

            {/* SCAN NOW button - Only visible in compact mode */}
            {compactMode && (
              <button
                onClick={handleScan}
                disabled={loading}
                className={`px-4 md:px-6 py-2 md:py-3 font-bold text-xs md:text-sm transition-all duration-300 rounded-xl flex items-center gap-2 ${
                  loading
                    ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white shadow-lg hover:shadow-xl transform hover:scale-105'
                }`}
              >
                <RefreshCw className={`w-4 h-4 md:w-5 md:h-5 ${loading ? 'animate-spin' : ''}`} />
                {loading ? 'SCANNING...' : 'SCAN NOW'}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="px-3 md:px-8 py-3 md:py-6">
        {/* Attraction Zones View */}
        {activeTab === 'attraction' && (
          <div>
            {/* Scan Progress Bar */}
            {loading && scanProgress.total > 0 && (
              <div className="mb-4 bg-gray-900/50 border border-blue-500/30 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-bold text-blue-400">
                    Scan Progress: {scanProgress.current} / {scanProgress.total} stocks
                  </span>
                  <span className="text-sm font-bold text-blue-400">
                    {Math.round((scanProgress.current / scanProgress.total) * 100)}%
                  </span>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-3 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-blue-400 transition-all duration-300 ease-out relative"
                    style={{ width: `${(scanProgress.current / scanProgress.total) * 100}%` }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
                  </div>
                </div>
              </div>
            )}

            {/* Column Headers - Desktop Only */}
            <div className="hidden lg:block px-6 py-3 mb-4 bg-gradient-to-b from-black via-gray-900 to-black border border-gray-800 rounded-lg shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <div className="flex items-center gap-8">
                {/* Symbol Header */}
                <div className="w-24 flex-shrink-0">
                  <div className="text-2xl font-bold text-orange-400 uppercase tracking-wider">
                    Symbol
                  </div>
                </div>

                {/* Main Data Headers */}
                <div className="flex-1 grid grid-cols-5 gap-8">
                  <div className="border-l border-gray-700/50 pl-4">
                    <div className="text-2xl font-bold text-orange-400 uppercase tracking-wider">
                      Current Price
                    </div>
                  </div>
                  <div className="border-l border-gray-700/50 pl-4">
                    <div className="text-2xl font-bold text-orange-400 uppercase tracking-wider">
                      Target Level
                    </div>
                  </div>
                  <div className="border-l border-gray-700/50 pl-4">
                    <div className="text-2xl font-bold text-orange-400 uppercase tracking-wider">
                      Value
                    </div>
                  </div>
                  <div className="border-l border-gray-700/50 pl-4">
                    <div className="text-2xl font-bold text-orange-400 uppercase tracking-wider">
                      Wall Level
                    </div>
                  </div>
                  <div className="border-l border-gray-700/50 pl-4">
                    <div className="text-2xl font-bold text-orange-400 uppercase tracking-wider">
                      Wall Value
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {error && (
                <div className="text-center py-8">
                  <div className="text-red-400 font-bold text-sm"> {error}</div>
                </div>
              )}
              {(!loading || paginatedData.length > 0) &&
                paginatedData.map((item, idx) => (
                  <div
                    key={`${item.ticker}-${idx}`}
                    onClick={() => setSelectedRow(selectedRow === idx ? null : idx)}
                    onMouseEnter={() => setHoveredRow(idx)}
                    onMouseLeave={() => setHoveredRow(null)}
                    className={`relative rounded-xl md:rounded-2xl border transition-all duration-500 cursor-pointer animate-fadeIn ${
                      selectedRow === idx
                        ? 'bg-black border-orange-500/50 shadow-xl shadow-orange-500/20'
                        : hoveredRow === idx
                          ? 'bg-black border-orange-400/40 shadow-lg shadow-orange-500/10'
                          : 'bg-black border-gray-700/30 hover:border-gray-600/50'
                    } ${idx === 0 && loading ? 'border-orange-400/60 shadow-lg shadow-orange-400/20' : ''}`}
                  >
                    {/* Desktop Layout */}
                    <div className="hidden lg:block relative p-6">
                      <div className="flex items-center gap-8">
                        {/* Symbol */}
                        <div className="w-24 flex-shrink-0">
                          <div className="text-2xl font-black text-white">{item.ticker}</div>
                        </div>

                        {/* Main Data Grid */}
                        <div className="flex-1 grid grid-cols-5 gap-8">
                          <div>
                            <div className="text-xl font-bold text-white">
                              ${item.currentPrice.toFixed(2)}
                            </div>
                          </div>
                          <div>
                            <div
                              className={`text-xl font-black ${
                                item.strength > 75
                                  ? 'text-purple-400'
                                  : item.strength >= 63
                                    ? 'text-blue-400'
                                    : item.strength >= 40
                                      ? 'text-yellow-400'
                                      : 'text-white'
                              }`}
                            >
                              ${item.attractionLevel.toFixed(2)}
                            </div>
                          </div>
                          <div>
                            <div
                              className={`text-xl font-bold ${item.dealerSweat > 0 ? 'text-green-400' : 'text-red-400'}`}
                            >
                              {item.dealerSweat > 0 ? '+' : ''}
                              {item.dealerSweat.toFixed(2)}B
                            </div>
                          </div>
                          <div>
                            {item.largestWall ? (
                              <div
                                className={`text-xl font-black ${
                                  item.largestWall.type === 'call'
                                    ? 'text-red-500'
                                    : 'text-green-500'
                                }`}
                              >
                                ${item.largestWall.strike.toFixed(2)}
                              </div>
                            ) : (
                              <div className="text-xl font-bold text-gray-500">-</div>
                            )}
                          </div>
                          <div>
                            {item.largestWall ? (
                              <div className="text-xl font-bold text-white">
                                ${item.largestWall.gex.toFixed(2)}B
                              </div>
                            ) : (
                              <div className="text-xl font-bold text-gray-500">-</div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Expanded Details */}
                      {selectedRow === idx && (
                        <div className="mt-6 pt-6 border-t border-gray-600/30 animate-fadeIn">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6">
                            <div className="bg-gray-800/50 rounded-xl p-3 md:p-4">
                              <div className="text-xs text-gray-400 mb-1 md:mb-2">
                                Volume Profile
                              </div>
                              <div className="text-sm md:text-lg font-bold text-green-400">
                                High Activity
                              </div>
                            </div>
                            <div className="bg-gray-800/50 rounded-xl p-3 md:p-4">
                              <div className="text-xs text-gray-400 mb-1 md:mb-2">
                                Delta Exposure
                              </div>
                              <div className="text-sm md:text-lg font-bold text-blue-400">
                                +2.4M
                              </div>
                            </div>
                            <div className="bg-gray-800/50 rounded-xl p-3 md:p-4">
                              <div className="text-xs text-gray-400 mb-1 md:mb-2">Implied Move</div>
                              <div className="text-sm md:text-lg font-bold text-purple-400">
                                ±3.2%
                              </div>
                            </div>
                            <div className="bg-gray-800/50 rounded-xl p-3 md:p-4">
                              <div className="text-xs text-gray-400 mb-1 md:mb-2">Risk Level</div>
                              <div className="text-sm md:text-lg font-bold text-yellow-400">
                                Medium
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Mobile Card Layout */}
                    <div className="lg:hidden relative p-3 md:p-4">
                      <div className="space-y-3">
                        {/* Symbol and Price Row */}
                        <div className="flex items-center justify-between">
                          <div className="text-xl md:text-2xl font-black text-white">
                            {item.ticker}
                          </div>
                          <div className="text-lg md:text-xl font-bold text-white">
                            ${item.currentPrice.toFixed(2)}
                          </div>
                        </div>

                        {/* Data Grid - 2 columns on mobile */}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-gray-900/50 rounded-lg p-2">
                            <div className="text-xs text-orange-400 font-bold mb-1">
                              TARGET LEVEL
                            </div>
                            <div
                              className={`text-base font-black ${
                                item.strength > 75
                                  ? 'text-purple-400'
                                  : item.strength >= 63
                                    ? 'text-blue-400'
                                    : item.strength >= 40
                                      ? 'text-yellow-400'
                                      : 'text-white'
                              }`}
                            >
                              ${item.attractionLevel.toFixed(2)}
                            </div>
                          </div>

                          <div className="bg-gray-900/50 rounded-lg p-2">
                            <div className="text-xs text-orange-400 font-bold mb-1">VALUE</div>
                            <div
                              className={`text-base font-bold ${item.dealerSweat > 0 ? 'text-green-400' : 'text-red-400'}`}
                            >
                              {item.dealerSweat > 0 ? '+' : ''}
                              {item.dealerSweat.toFixed(2)}B
                            </div>
                          </div>

                          <div className="bg-gray-900/50 rounded-lg p-2">
                            <div className="text-xs text-orange-400 font-bold mb-1">WALL LEVEL</div>
                            {item.largestWall ? (
                              <div
                                className={`text-base font-black ${
                                  item.largestWall.type === 'call'
                                    ? 'text-red-500'
                                    : 'text-green-500'
                                }`}
                              >
                                ${item.largestWall.strike.toFixed(2)}
                              </div>
                            ) : (
                              <div className="text-base font-bold text-gray-500">-</div>
                            )}
                          </div>

                          <div className="bg-gray-900/50 rounded-lg p-2">
                            <div className="text-xs text-orange-400 font-bold mb-1">WALL VALUE</div>
                            {item.largestWall ? (
                              <div className="text-base font-bold text-white">
                                ${item.largestWall.gex.toFixed(2)}B
                              </div>
                            ) : (
                              <div className="text-base font-bold text-gray-500">-</div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Expanded Details for Mobile */}
                      {selectedRow === idx && (
                        <div className="mt-3 pt-3 border-t border-gray-600/30 animate-fadeIn">
                          <div className="grid grid-cols-2 gap-3">
                            <div className="bg-gray-800/50 rounded-xl p-3">
                              <div className="text-xs text-gray-400 mb-1">Volume Profile</div>
                              <div className="text-sm font-bold text-green-400">High Activity</div>
                            </div>
                            <div className="bg-gray-800/50 rounded-xl p-3">
                              <div className="text-xs text-gray-400 mb-1">Delta Exposure</div>
                              <div className="text-sm font-bold text-blue-400">+2.4M</div>
                            </div>
                            <div className="bg-gray-800/50 rounded-xl p-3">
                              <div className="text-xs text-gray-400 mb-1">Implied Move</div>
                              <div className="text-sm font-bold text-purple-400">±3.2%</div>
                            </div>
                            <div className="bg-gray-800/50 rounded-xl p-3">
                              <div className="text-xs text-gray-400 mb-1">Risk Level</div>
                              <div className="text-sm font-bold text-yellow-400">Medium</div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
            </div>

            {/* Pagination Controls for Attraction Tab */}
            {filteredGexData.length > itemsPerPage && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 md:mt-8 px-3 md:px-6 py-3 md:py-6 bg-gray-900/30 rounded-xl border border-gray-700/30">
                <div className="text-xs md:text-sm text-gray-400 font-semibold">
                  {startIndex + 1}-{Math.min(endIndex, filteredGexData.length)} of{' '}
                  {filteredGexData.length}
                </div>
                <div className="flex items-center gap-2 md:gap-3">
                  <button
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="px-3 md:px-6 py-2 md:py-3 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-300 text-xs md:text-sm font-bold text-white"
                  >
                    <span className="hidden sm:inline">← Previous</span>
                    <span className="sm:hidden">←</span>
                  </button>
                  <div className="flex items-center gap-1 md:gap-2">
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                      const pageNum =
                        currentPage <= 3
                          ? i + 1
                          : currentPage >= totalPages - 2
                            ? totalPages - 4 + i
                            : currentPage - 2 + i
                      return pageNum > 0 && pageNum <= totalPages ? (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`min-w-[32px] md:min-w-[44px] h-8 md:h-12 px-2 md:px-4 rounded-lg font-bold transition-all duration-300 text-xs md:text-base ${
                            currentPage === pageNum
                              ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-black shadow-lg scale-110'
                              : 'bg-gray-800 border border-gray-700 text-white hover:bg-gray-700 hover:border-orange-500/50'
                          }`}
                        >
                          {pageNum}
                        </button>
                      ) : null
                    })}
                  </div>
                  <button
                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 md:px-6 py-2 md:py-3 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-300 text-xs md:text-sm font-bold text-white"
                  >
                    <span className="hidden sm:inline">Next →</span>
                    <span className="sm:hidden">→</span>
                  </button>
                </div>
                <div className="text-sm text-gray-400 font-semibold">
                  Page {currentPage} of {totalPages}
                </div>
              </div>
            )}
          </div>
        )}

        {/* OTM Premiums View */}
        {activeTab === 'otm-premiums' && (
          <div
            style={{
              background: 'linear-gradient(180deg, #0a0a0f 0%, #050508 100%)',
              minHeight: '400px',
            }}
          >
            {/* Control Bar */}
            <div
              className="px-4 py-3 flex flex-wrap items-center gap-4"
              style={{
                borderBottom: '1px solid #1a1a2e',
                background: 'linear-gradient(180deg, #0d0d1a 0%, #080810 100%)',
                boxShadow: '0 1px 0 #ffffff08 inset',
              }}
            >
              <button
                onClick={scanOTMPremiums}
                disabled={otmLoading}
                className="flex items-center gap-2 disabled:cursor-not-allowed"
                style={{
                  padding: '8px 20px',
                  background: otmLoading
                    ? '#1a3a6e'
                    : 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 50%, #1e40af 100%)',
                  border: '1px solid #3b82f6',
                  borderRadius: '6px',
                  color: '#ffffff',
                  fontFamily: 'monospace',
                  fontWeight: 900,
                  fontSize: '13px',
                  letterSpacing: '0.05em',
                  boxShadow: '0 1px 0 #60a5fa40 inset, 0 2px 8px #1d4ed840',
                  cursor: otmLoading ? 'not-allowed' : 'pointer',
                }}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${otmLoading ? 'animate-spin' : ''}`} />
                {otmLoading ? 'SCANNING...' : 'SCAN'}
              </button>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 14px',
                  background: 'linear-gradient(180deg, #111122 0%, #0a0a18 100%)',
                  border: '1px solid #1e1e3a',
                  borderRadius: '6px',
                  boxShadow: '0 1px 0 #ffffff06 inset',
                }}
              >
                <span
                  style={{
                    color: '#6b7280',
                    fontFamily: 'monospace',
                    fontWeight: 700,
                    fontSize: '12px',
                  }}
                >
                  EXP
                </span>
                <span
                  style={{
                    color: '#ffffff',
                    fontFamily: 'monospace',
                    fontWeight: 900,
                    fontSize: '13px',
                  }}
                >
                  {formatExpiryDate(otmExpiry)}
                </span>
              </div>

              {!otmLoading && otmResults.length > 0 && (
                <>
                  <span
                    style={{
                      color: '#ffffff',
                      fontFamily: 'monospace',
                      fontWeight: 900,
                      fontSize: '13px',
                    }}
                  >
                    {otmResults.length} FOUND
                  </span>
                  <span
                    style={{
                      color: '#ef4444',
                      fontFamily: 'monospace',
                      fontWeight: 900,
                      fontSize: '13px',
                    }}
                  >
                    {otmResults.filter((r) => r.imbalanceSeverity === 'EXTREME').length} EXTREME
                  </span>
                  <span
                    style={{
                      color: '#f97316',
                      fontFamily: 'monospace',
                      fontWeight: 900,
                      fontSize: '13px',
                    }}
                  >
                    {otmResults.filter((r) => r.imbalanceSeverity === 'HIGH').length} HIGH
                  </span>
                </>
              )}

              {otmLoading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                  <span
                    style={{
                      color: '#60a5fa',
                      fontFamily: 'monospace',
                      fontWeight: 700,
                      fontSize: '13px',
                    }}
                  >
                    {otmScanningSymbol || 'Processing...'}
                  </span>
                  <span
                    style={{
                      color: '#ffffff',
                      fontFamily: 'monospace',
                      fontWeight: 700,
                      fontSize: '13px',
                    }}
                  >
                    {otmScanProgress.current}/{otmScanProgress.total}
                  </span>
                  <div
                    style={{
                      flex: 1,
                      height: '4px',
                      background: '#1a1a2e',
                      borderRadius: '2px',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        background: 'linear-gradient(90deg, #2563eb, #60a5fa)',
                        borderRadius: '2px',
                        transition: 'width 0.3s',
                        width: `${otmScanProgress.total > 0 ? (otmScanProgress.current / otmScanProgress.total) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Results */}
            <div className="px-4">
              {otmResults.length === 0 && !otmLoading && !otmLastUpdate && (
                <div style={{ textAlign: 'center', padding: '80px 0' }}>
                  <div
                    style={{
                      color: '#ffffff',
                      fontFamily: 'monospace',
                      fontWeight: 900,
                      fontSize: '16px',
                      marginBottom: '8px',
                    }}
                  >
                    OTM PREMIUM IMBALANCE SCANNER
                  </div>
                  <div style={{ color: '#6b7280', fontFamily: 'monospace', fontSize: '12px' }}>
                    Scans TOP 1000 stocks · last minute price was perfectly between two strikes ·
                    real bid/ask at that exact moment
                  </div>
                </div>
              )}
              {otmResults.length === 0 && !otmLoading && otmLastUpdate && (
                <div style={{ textAlign: 'center', padding: '80px 0' }}>
                  <div
                    style={{
                      color: '#ffffff',
                      fontFamily: 'monospace',
                      fontWeight: 900,
                      fontSize: '16px',
                    }}
                  >
                    NO RESULTS
                  </div>
                </div>
              )}
              {otmResults.length === 0 && otmLoading && (
                <div style={{ textAlign: 'center', padding: '80px 0' }}>
                  <RefreshCw className="w-6 h-6 text-white animate-spin mb-4 mx-auto" />
                  <div
                    style={{
                      color: '#ffffff',
                      fontFamily: 'monospace',
                      fontWeight: 900,
                      fontSize: '14px',
                    }}
                  >
                    SCANNING TOP 1000 STOCKS...
                  </div>
                </div>
              )}

              {otmResults.length > 0 && (
                <div
                  style={{
                    marginTop: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  {/* Header */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns:
                        '90px 90px 130px 100px 70px 70px 70px 70px 70px 90px 80px',
                      padding: '8px 12px',
                      background: 'linear-gradient(180deg, #111122 0%, #0c0c1a 100%)',
                      border: '1px solid #1e1e3a',
                      borderRadius: '6px',
                      fontFamily: 'monospace',
                      fontWeight: 900,
                      fontSize: '11px',
                      color: '#6b7280',
                      letterSpacing: '0.06em',
                    }}
                  >
                    <span>SYMBOL</span>
                    <span>PRICE</span>
                    <span>STRIKES</span>
                    <span>EXPIRY</span>
                    <span>TIME</span>
                    <span>C BID</span>
                    <span>C ASK</span>
                    <span>P BID</span>
                    <span>P ASK</span>
                    <span>IMBAL %</span>
                    <span>SIDE</span>
                  </div>
                  {/* Rows */}
                  {otmResults.map((r, idx) => {
                    const sev = r.imbalanceSeverity
                    const imbalColor =
                      sev === 'EXTREME' ? '#ef4444' : sev === 'HIGH' ? '#f97316' : '#facc15'
                    const rowBg =
                      idx % 2 === 0
                        ? 'linear-gradient(180deg, #0d0d1c 0%, #090912 100%)'
                        : 'linear-gradient(180deg, #0a0a14 0%, #070710 100%)'
                    const rowBorder =
                      sev === 'EXTREME' ? '#ef444430' : sev === 'HIGH' ? '#f9731620' : '#1e1e3a'
                    return (
                      <div
                        key={`${r.symbol}-${idx}`}
                        style={{
                          display: 'grid',
                          gridTemplateColumns:
                            '90px 90px 130px 100px 70px 70px 70px 70px 70px 90px 80px',
                          padding: '10px 12px',
                          background: rowBg,
                          border: `1px solid ${rowBorder}`,
                          borderRadius: '6px',
                          boxShadow: '0 1px 0 #ffffff05 inset',
                          alignItems: 'center',
                          fontFamily: 'monospace',
                          fontSize: '13px',
                          fontWeight: 700,
                          cursor: 'default',
                          transition: 'filter 0.15s',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(1.15)')}
                        onMouseLeave={(e) => (e.currentTarget.style.filter = 'brightness(1)')}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ color: '#f97316', fontWeight: 900, fontSize: '14px' }}>
                            {r.symbol}
                          </span>
                          {sev === 'EXTREME' && (
                            <span
                              style={{
                                width: '7px',
                                height: '7px',
                                borderRadius: '50%',
                                background: '#ef4444',
                                display: 'inline-block',
                                boxShadow: '0 0 6px #ef4444',
                              }}
                              className="animate-pulse"
                            />
                          )}
                        </span>
                        <span style={{ color: '#ffffff', fontWeight: 900 }}>
                          ${r.stockPrice.toFixed(2)}
                        </span>
                        <span style={{ color: '#ffffff' }}>
                          <span style={{ color: '#ef4444' }}>${r.putStrike}</span>
                          <span style={{ color: '#4b5563' }}>/</span>
                          <span style={{ color: '#00d084' }}>${r.callStrike}</span>
                        </span>
                        <span style={{ color: '#ffffff' }}>{r.expiry ?? '—'}</span>
                        <span style={{ color: '#ffffff' }}>{r.lastSeenTime ?? '—'}</span>
                        <span style={{ color: '#00d084', fontWeight: 900 }}>
                          ${r.callBid.toFixed(2)}
                        </span>
                        <span style={{ color: '#00d084', fontWeight: 900 }}>
                          ${r.callAsk.toFixed(2)}
                        </span>
                        <span style={{ color: '#ef4444', fontWeight: 900 }}>
                          ${r.putBid.toFixed(2)}
                        </span>
                        <span style={{ color: '#ef4444', fontWeight: 900 }}>
                          ${r.putAsk.toFixed(2)}
                        </span>
                        <span style={{ color: imbalColor, fontWeight: 900, fontSize: '15px' }}>
                          {r.imbalancePercent > 0 ? '+' : ''}
                          {r.imbalancePercent.toFixed(1)}%
                        </span>
                        <span
                          style={{
                            color: '#000000',
                            fontWeight: 900,
                            fontSize: '11px',
                            background: r.expensiveSide === 'CALLS' ? '#00d084' : '#ef4444',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            boxShadow:
                              r.expensiveSide === 'CALLS'
                                ? '0 0 8px #00d08460'
                                : '0 0 8px #ef444460',
                            display: 'inline-block',
                          }}
                        >
                          {r.expensiveSide}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Custom Styles */}
      <style jsx>{`
        @keyframes shimmer {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
      `}</style>
    </div>
  )
}
