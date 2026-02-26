'use client'

import { ArrowUpDown, RefreshCw, Target, TrendingDown, TrendingUp } from 'lucide-react'

import React, { useEffect, useState } from 'react'

import DealerGEXChart from './DealerGEXChart'
import DealerOpenInterestChart from './DealerOpenInterestChart'

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
  largestWall?: {
    strike: number
    gex: number
    type: 'call' | 'put'
    pressure: number
    cluster?: {
      strikes: number[]
      centralStrike: number
      totalGEX: number
      contributions: number[] // percentages (0-100)
      oi: number[] // real open interest per strike
      type: 'call' | 'put'
    }
  }
}

interface AttractionZoneScannerProps {
  compactMode?: boolean
}

function GEXLevelMap({ item }: { item: GEXScreenerData }) {
  const wall = item.largestWall
  if (!wall) return null

  const levels = [item.currentPrice, item.attractionLevel, wall.strike]
  const minP = Math.min(...levels)
  const maxP = Math.max(...levels)
  const span = maxP - minP || item.currentPrice * 0.05
  const pad = span * 0.28
  const domMin = minP - pad
  const domMax = maxP + pad
  const toX = (p: number) => Math.max(2, Math.min(98, ((p - domMin) / (domMax - domMin)) * 100))

  const isCall = wall.type === 'call'
  const wallColor = isCall ? '#ff2222' : '#00ff66'
  const wallLabel = isCall ? 'Call Wall' : 'Put Wall'
  const wallTextCls = isCall ? 'text-red-500' : 'text-green-400'
  const wallTextColor = isCall ? '#ff2222' : '#00ff66'
  const PURPLE = '#c84fff'

  const attractDir = item.attractionLevel >= item.currentPrice ? '↑' : '↓'
  const attractDist = Math.abs(
    ((item.attractionLevel - item.currentPrice) / item.currentPrice) * 100
  ).toFixed(1)
  const wallDist = Math.abs(((wall.strike - item.currentPrice) / item.currentPrice) * 100).toFixed(
    1
  )

  const xCurrent = toX(item.currentPrice)
  const xAttract = toX(item.attractionLevel)
  const xWall = toX(wall.strike)

  // Stagger price labels vertically to avoid horizontal overlap
  // Sort by x position, then assign a row (0 or 1) if adjacent markers are within 12% apart
  const sortedByX = [
    { x: xWall, key: 'wall' },
    { x: xAttract, key: 'attract' },
    { x: xCurrent, key: 'price' },
  ].sort((a, b) => a.x - b.x)
  const labelRow: Record<string, number> = {}
  sortedByX.forEach((m, i) => {
    const prev = sortedByX[i - 1]
    labelRow[m.key] = prev && m.x - prev.x < 12 ? 1 : 0
  })

  // Layout constants — all in px
  const TOP_ROWS = 2 // max staggered label rows above track
  const LABEL_H = 20 // height of one price label
  const ROW_GAP = 4
  const STEM_H = 14 // fixed stem height (top-label → marker)
  const MARKER_R = 9
  const BOT_LABEL_H = 20 // height of name labels below track
  const BOT_GAP = 6 // gap between track and name labels

  // track Y = top of ruler + space for up to 2 label rows + stems + marker top-half
  const TRACK_Y = TOP_ROWS * (LABEL_H + ROW_GAP) + STEM_H + MARKER_R
  const CONTAINER_H = TRACK_Y + MARKER_R + BOT_GAP + BOT_LABEL_H + 4

  // which stagger row each label sits in (0 = top row, 1 = second row)
  const labelTopY = (key: string) => (labelRow[key] || 0) * (LABEL_H + ROW_GAP)
  // stem goes from bottom of label to top of marker circle
  const stemTopY = (key: string) => labelTopY(key) + LABEL_H + 2
  const stemHeight = (key: string) => TRACK_Y - MARKER_R - stemTopY(key)
  // markers sit on the track centre
  const markerTopY = TRACK_Y - MARKER_R
  // name labels sit below the track
  const botLabelY = TRACK_Y + MARKER_R + BOT_GAP

  return (
    <div className="mt-4 pt-4 border-t border-gray-700/40">
      <div className="text-sm text-white uppercase tracking-widest font-semibold mb-3">
        GEX Level Map — {item.ticker}
      </div>

      {/* Price ruler */}
      <div className="relative mx-2 mb-4" style={{ height: CONTAINER_H }}>
        {/* Base track */}
        <div
          className="absolute"
          style={{
            top: TRACK_Y,
            left: 0,
            right: 0,
            height: 2,
            background: '#1f2937',
            borderRadius: 1,
          }}
        />

        {/* Shaded zone between current price and attraction */}
        <div
          className="absolute"
          style={{
            top: TRACK_Y - 3,
            left: `${Math.min(xCurrent, xAttract)}%`,
            width: `${Math.abs(xAttract - xCurrent)}%`,
            height: 8,
            background: 'rgba(200,79,255,0.25)',
            borderRadius: 2,
          }}
        />

        {/* ── Wall marker ── */}
        {/* price label above */}
        <div
          className="text-sm font-bold text-center"
          style={{
            color: wallColor,
            whiteSpace: 'nowrap',
            position: 'absolute',
            top: labelTopY('wall'),
            left: `${xWall}%`,
            transform: 'translateX(-50%)',
          }}
        >
          ${wall.strike.toFixed(wall.strike >= 100 ? 0 : 1)}
        </div>
        {/* stem */}
        <div
          style={{
            position: 'absolute',
            left: `${xWall}%`,
            marginLeft: -1,
            top: stemTopY('wall'),
            width: 2,
            height: stemHeight('wall'),
            background: wallColor,
          }}
        />
        {/* diamond */}
        <div
          style={{
            position: 'absolute',
            left: `${xWall}%`,
            top: markerTopY,
            marginLeft: -7,
            marginTop: 0,
            width: 14,
            height: 14,
            transform: 'rotate(45deg)',
            border: `2.5px solid ${wallColor}`,
            background: 'transparent',
            boxShadow: `0 0 6px ${wallColor}`,
          }}
        />
        {/* name label below */}
        <div
          className="text-xs font-semibold text-center"
          style={{
            color: wallColor,
            whiteSpace: 'nowrap',
            position: 'absolute',
            top: botLabelY,
            left: `${xWall}%`,
            transform: 'translateX(-50%)',
          }}
        >
          {wallLabel}
        </div>

        {/* ── Attraction marker ── */}
        {/* price label above */}
        <div
          className="text-sm font-bold text-center"
          style={{
            color: PURPLE,
            whiteSpace: 'nowrap',
            position: 'absolute',
            top: labelTopY('attract'),
            left: `${xAttract}%`,
            transform: 'translateX(-50%)',
          }}
        >
          ${item.attractionLevel.toFixed(item.attractionLevel >= 100 ? 0 : 1)}
        </div>
        {/* stem */}
        <div
          style={{
            position: 'absolute',
            left: `${xAttract}%`,
            marginLeft: -1,
            top: stemTopY('attract'),
            width: 2,
            height: stemHeight('attract'),
            background: PURPLE,
          }}
        />
        {/* circle */}
        <div
          style={{
            position: 'absolute',
            left: `${xAttract}%`,
            top: markerTopY,
            marginLeft: -MARKER_R,
            marginTop: 0,
            width: MARKER_R * 2,
            height: MARKER_R * 2,
            borderRadius: '50%',
            background: PURPLE,
            border: `2px solid #fff`,
            boxShadow: `0 0 8px ${PURPLE}`,
          }}
        />
        {/* name label below */}
        <div
          className="text-xs font-semibold text-center"
          style={{
            color: PURPLE,
            whiteSpace: 'nowrap',
            position: 'absolute',
            top: botLabelY,
            left: `${xAttract}%`,
            transform: 'translateX(-50%)',
          }}
        >
          Attraction
        </div>

        {/* ── Current price marker ── */}
        {/* price label above */}
        <div
          className="text-sm font-black text-white text-center"
          style={{
            whiteSpace: 'nowrap',
            position: 'absolute',
            top: labelTopY('price'),
            left: `${xCurrent}%`,
            transform: 'translateX(-50%)',
            zIndex: 10,
          }}
        >
          ${item.currentPrice.toFixed(2)}
        </div>
        {/* stem */}
        <div
          style={{
            position: 'absolute',
            left: `${xCurrent}%`,
            marginLeft: -1,
            top: stemTopY('price'),
            width: 2,
            height: stemHeight('price'),
            background: '#fff',
            zIndex: 10,
          }}
        />
        {/* circle */}
        <div
          style={{
            position: 'absolute',
            left: `${xCurrent}%`,
            top: markerTopY,
            marginLeft: -MARKER_R,
            marginTop: 0,
            width: MARKER_R * 2,
            height: MARKER_R * 2,
            borderRadius: '50%',
            background: '#fff',
            border: '3px solid #111',
            zIndex: 10,
          }}
        />
        {/* name label below */}
        <div
          className="text-xs font-semibold text-white text-center"
          style={{
            whiteSpace: 'nowrap',
            position: 'absolute',
            top: botLabelY,
            left: `${xCurrent}%`,
            transform: 'translateX(-50%)',
            zIndex: 10,
          }}
        >
          Price
        </div>
      </div>

      {/* Single row stats */}
      <div className="flex flex-wrap items-center gap-x-8 gap-y-2 px-1 py-3 bg-gray-900/40 border border-gray-800 rounded-xl">
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold text-white">Attraction:</span>
          <span className="text-base font-black" style={{ color: PURPLE }}>
            ${item.attractionLevel.toFixed(2)}
          </span>
          <span className="text-sm font-semibold text-white">
            {attractDir} {attractDist}% away
          </span>
        </div>
        <div className="w-px h-5 bg-gray-700" />
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold text-white">{wallLabel}:</span>
          <span className="text-base font-black" style={{ color: wallTextColor }}>
            ${wall.strike.toFixed(2)}
          </span>
          <span className="text-sm font-semibold text-white">{wallDist}% away</span>
        </div>
        <div className="w-px h-5 bg-gray-700" />
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold text-white">GEX:</span>
          <span className="text-base font-black" style={{ color: wallTextColor }}>
            {wall.gex.toFixed(2)}B
          </span>
        </div>
        <div className="w-px h-5 bg-gray-700" />
        <div className="flex items-center gap-3">
          <span className="text-base font-semibold text-white">Nearness:</span>
          <span className="text-base font-black text-orange-400">{wall.pressure.toFixed(0)}%</span>
          <div className="w-24 bg-gray-800 rounded-full" style={{ height: 5 }}>
            <div
              className="h-full rounded-full bg-orange-400"
              style={{ width: `${wall.pressure}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AttractionZoneScanner({ compactMode = false }: AttractionZoneScannerProps) {
  const [scanning, setScanning] = useState(false)
  const [selectedRow, setSelectedRow] = useState<number | null>(null)
  const [sortBy, setSortBy] = useState('strength')
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
  const [gammaClusterFilter, setGammaClusterFilter] = useState<'none' | 'positive' | 'negative'>(
    'none'
  )
  const [currentPage, setCurrentPage] = useState(1)
  const [customTicker, setCustomTicker] = useState('')
  const [lastUpdate, setLastUpdate] = useState('')

  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const itemsPerPage = isMobile ? 10 : 20

  const fetchGEXData = async () => {
    setLoading(true)
    setError('')
    setAnimationClass('animate-pulse')

    try {
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

      while (true) {
        const { done, value } = await reader.read()

        if (done) break

        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const messageData = JSON.parse(line.substring(6))

              switch (messageData.type) {
                case 'start':
                  setScanProgress({ current: 0, total: messageData.total })
                  currentResults.length = 0
                  break

                case 'result':
                  setScanProgress({ current: messageData.progress, total: messageData.total })

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
                      Math.abs(messageData.data.netGex || 0) > 2
                        ? ('High' as const)
                        : Math.abs(messageData.data.netGex || 0) > 0.5
                          ? ('Medium' as const)
                          : ('Low' as const),
                    range: messageData.data.currentPrice
                      ? Math.abs(
                          ((messageData.data.attractionLevel - messageData.data.currentPrice) /
                            messageData.data.currentPrice) *
                            100
                        )
                      : 0,
                    marketCap: messageData.data.marketCap,
                    gexImpactScore: messageData.data.gexImpactScore,
                    largestWall: messageData.data.largestWall,
                  }

                  currentResults.push(transformedItem)

                  const sortedResults = [...currentResults].sort(
                    (a, b) => (b.gexImpactScore || 0) - (a.gexImpactScore || 0)
                  )
                  setGexData(sortedResults)
                  break

                case 'complete':
                  setScanProgress({ current: messageData.count, total: messageData.count })
                  const finalSortedResults = [...currentResults].sort(
                    (a, b) => (b.gexImpactScore || 0) - (a.gexImpactScore || 0)
                  )
                  setGexData(finalSortedResults)
                  setLastUpdate(new Date().toLocaleTimeString())
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
      console.error('❌ GEX screener error:', err)
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

  const scanCustomTicker = async () => {
    if (!customTicker.trim()) return

    setLoading(true)
    setError('')
    setAnimationClass('animate-pulse')

    try {
      const response = await fetch(
        `/api/gex-screener?symbols=${encodeURIComponent(customTicker.toUpperCase().trim())}&expirationFilter=${expirationFilter}`
      )

      if (!response.ok) {
        throw new Error(`Failed to fetch GEX data: ${response.statusText}`)
      }

      const data = await response.json()

      if (data && data.success && Array.isArray(data.data)) {
        // Transform data to match expected structure
        const transformedData = data.data.map((item: any) => ({
          ticker: item.ticker,
          attractionLevel: item.attractionLevel,
          currentPrice: item.currentPrice,
          dealerSweat: item.dealerSweat,
          netGex: item.netGex,
          bias: item.dealerSweat > 0 ? ('Bullish' as const) : ('Bearish' as const),
          strength: item.gexImpactScore || 0,
          volatility:
            Math.abs(item.netGex || 0) > 2
              ? ('High' as const)
              : Math.abs(item.netGex || 0) > 0.5
                ? ('Medium' as const)
                : ('Low' as const),
          range: item.currentPrice
            ? Math.abs(((item.attractionLevel - item.currentPrice) / item.currentPrice) * 100)
            : 0,
          marketCap: item.marketCap,
          gexImpactScore: item.gexImpactScore,
          largestWall: item.largestWall,
        }))

        setGexData(transformedData)
        setLastUpdate(new Date().toLocaleTimeString())
      } else {
        setGexData([])
      }

      setCustomTicker('')
    } catch (err: any) {
      console.error('Error scanning custom ticker:', err)
      setError(err.message || 'Failed to scan ticker')
    } finally {
      setLoading(false)
      setAnimationClass('')
    }
  }

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(column)
      setSortOrder('desc')
    }
  }

  const filteredGexData = gexData
    .filter((item) => item.ticker.toLowerCase().includes(searchTerm.toLowerCase()))
    .filter((item) => {
      if (!item.strength || item.strength < 40) return false

      if (strengthFilter === 'purple') return item.strength > 75
      if (strengthFilter === 'blue') return item.strength >= 63 && item.strength <= 75
      if (strengthFilter === 'yellow') return item.strength >= 40 && item.strength < 63
      return true
    })
    .filter((item) => {
      if (gammaClusterFilter === 'none') return true
      // Must be purple (magnetic) strength
      if (!item.strength || item.strength <= 75) return false
      // Must have a cluster of 3+ strikes
      const cluster = item.largestWall?.cluster
      if (!cluster || cluster.strikes.length < 3) return false
      // Match cluster polarity
      if (gammaClusterFilter === 'positive' && cluster.type !== 'call') return false
      if (gammaClusterFilter === 'negative' && cluster.type !== 'put') return false
      // Price must be inside the cluster's strike range (between lowest and highest strike)
      const minStrike = Math.min(...cluster.strikes)
      const maxStrike = Math.max(...cluster.strikes)
      return item.currentPrice >= minStrike && item.currentPrice <= maxStrike
    })
    .sort((a, b) => {
      const aValue =
        sortBy === 'strength'
          ? a.strength || 0
          : sortBy === 'targetLevel'
            ? a.attractionLevel || 0
            : a.currentPrice || 0
      const bValue =
        sortBy === 'strength'
          ? b.strength || 0
          : sortBy === 'targetLevel'
            ? b.attractionLevel || 0
            : b.currentPrice || 0

      return sortOrder === 'desc' ? bValue - aValue : aValue - bValue
    })

  const totalPages = Math.ceil(filteredGexData.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedData = filteredGexData.slice(startIndex, endIndex)

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, sortBy, sortOrder, strengthFilter, gammaClusterFilter])

  const selectStyle: React.CSSProperties = {
    appearance: 'none' as const,
    background: '#0d0d12',
    border: '1px solid rgba(255,255,255,0.14)',
    color: '#ffffff',
    padding: '8px 36px 8px 14px',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.07em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    outline: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23888' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 10px center',
    backgroundSize: '10px',
    minWidth: 148,
  }

  return (
    <div
      className="text-white rounded-xl overflow-hidden"
      style={{
        background: '#06060a',
        border: '1px solid rgba(255,120,0,0.18)',
        boxShadow: '0 8px 40px rgba(0,0,0,0.8)',
      }}
    >
      {/* ── Title bar ── */}
      <div
        className="flex items-center gap-4 px-6 py-4"
        style={{
          background: 'linear-gradient(180deg, #101016 0%, #08080d 100%)',
          borderBottom: '1px solid rgba(255,120,0,0.22)',
        }}
      >
        <Target className="w-7 h-7 flex-shrink-0" style={{ color: '#f97316' }} />
        <div>
          <div
            className="font-black text-white tracking-[0.18em]"
            style={{ letterSpacing: '0.18em', fontSize: '1.35rem' }}
          >
            ATTRACTION ZONES
          </div>
        </div>
        {loading && scanProgress.total > 0 && (
          <div
            className="flex items-center gap-2 ml-2 px-3 py-1 rounded-full"
            style={{
              background: 'rgba(249,115,22,0.15)',
              border: '1px solid rgba(249,115,22,0.3)',
            }}
          >
            <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#f97316' }} />
            <span
              className="text-xs font-black"
              style={{ color: '#f97316', letterSpacing: '0.1em' }}
            >
              SCANNING {scanProgress.current}/{scanProgress.total}
            </span>
          </div>
        )}
      </div>

      {/* ── Controls bar: all controls in ONE row ── */}
      <div
        className="flex flex-wrap items-center gap-3 px-6 py-3"
        style={{ background: '#0a0a0f', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        {/* Scan all */}
        <button
          onClick={handleScan}
          disabled={loading}
          style={{
            background: loading ? '#1a1a22' : 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
            border: loading ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(249,115,22,0.5)',
            color: loading ? '#555' : '#fff',
            padding: '8px 18px',
            borderRadius: 8,
            fontWeight: 800,
            fontSize: 12,
            letterSpacing: '0.1em',
            cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            flexShrink: 0,
            boxShadow: loading ? 'none' : '0 2px 12px rgba(249,115,22,0.35)',
            transition: 'all 0.15s',
          }}
        >
          <RefreshCw style={{ width: 14, height: 14 }} className={loading ? 'animate-spin' : ''} />
          {loading ? 'SCANNING...' : 'SCAN ALL'}
        </button>

        {/* Vertical divider */}
        <div
          style={{ width: 1, height: 28, background: 'rgba(255,255,255,0.08)', flexShrink: 0 }}
        />

        {/* Single-ticker input — also filters live results */}
        <input
          type="text"
          value={customTicker}
          onChange={(e) => {
            const v = e.target.value.toUpperCase()
            setCustomTicker(v)
            setSearchTerm(v)
          }}
          onKeyPress={(e) => {
            if (e.key === 'Enter' && customTicker.trim()) scanCustomTicker()
          }}
          placeholder="TICKER / FILTER"
          disabled={loading}
          style={{
            background: '#0d0d12',
            border: '1px solid rgba(255,255,255,0.14)',
            color: '#fff',
            padding: '8px 12px',
            borderRadius: 8,
            fontWeight: 700,
            fontSize: 13,
            letterSpacing: '0.12em',
            outline: 'none',
            width: 160,
            opacity: loading ? 0.45 : 1,
            fontFamily: 'monospace',
          }}
        />
        <button
          onClick={scanCustomTicker}
          disabled={!customTicker.trim() || loading}
          style={{
            background:
              customTicker.trim() && !loading
                ? 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)'
                : '#14141a',
            border:
              customTicker.trim() && !loading
                ? '1px solid rgba(249,115,22,0.5)'
                : '1px solid rgba(255,255,255,0.07)',
            color: customTicker.trim() && !loading ? '#fff' : '#444',
            padding: '8px 14px',
            borderRadius: 8,
            fontWeight: 800,
            fontSize: 12,
            letterSpacing: '0.1em',
            cursor: customTicker.trim() && !loading ? 'pointer' : 'not-allowed',
            flexShrink: 0,
            transition: 'all 0.15s',
          }}
        >
          SCAN
        </button>

        {/* Push dropdowns to the right */}
        <div style={{ flex: 1 }} />

        {/* Gamma cluster two-button bar */}
        <div
          style={{
            display: 'flex',
            borderRadius: 8,
            overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.12)',
            flexShrink: 0,
          }}
        >
          <button
            onClick={() => setGammaClusterFilter((v) => (v === 'positive' ? 'none' : 'positive'))}
            style={{
              padding: '8px 14px',
              fontWeight: 800,
              fontSize: 11,
              letterSpacing: '0.08em',
              cursor: 'pointer',
              border: 'none',
              borderRight: '1px solid rgba(255,255,255,0.1)',
              transition: 'all 0.15s',
              background: gammaClusterFilter === 'positive' ? 'rgba(255,55,55,0.18)' : '#0d0d12',
              color: gammaClusterFilter === 'positive' ? '#ff4444' : 'rgba(255,255,255,0.45)',
              boxShadow:
                gammaClusterFilter === 'positive' ? 'inset 0 0 12px rgba(255,55,55,0.15)' : 'none',
            }}
          >
            ▲ POSITIVE CLUSTER
          </button>
          <button
            onClick={() => setGammaClusterFilter((v) => (v === 'negative' ? 'none' : 'negative'))}
            style={{
              padding: '8px 14px',
              fontWeight: 800,
              fontSize: 11,
              letterSpacing: '0.08em',
              cursor: 'pointer',
              border: 'none',
              transition: 'all 0.15s',
              background: gammaClusterFilter === 'negative' ? 'rgba(0,210,100,0.15)' : '#0d0d12',
              color: gammaClusterFilter === 'negative' ? '#00d264' : 'rgba(255,255,255,0.45)',
              boxShadow:
                gammaClusterFilter === 'negative' ? 'inset 0 0 12px rgba(0,210,100,0.12)' : 'none',
            }}
          >
            ▼ NEGATIVE CLUSTER
          </button>
        </div>

        {/* Expiry dropdown */}
        <select
          value={expirationFilter}
          onChange={(e) => setExpirationFilter(e.target.value)}
          style={selectStyle}
        >
          <option value="Default">45 Days</option>
          <option value="Week">Week</option>
          <option value="Month">Month</option>
          <option value="Quad">Quad</option>
        </select>

        {/* Strength dropdown */}
        <select
          value={strengthFilter}
          onChange={(e) =>
            setStrengthFilter(e.target.value as 'all' | 'purple' | 'blue' | 'yellow')
          }
          style={selectStyle}
        >
          <option value="all">All Strengths</option>
          <option value="purple">Magnetic (&gt;75%)</option>
          <option value="blue">Moderate (63–75%)</option>
          <option value="yellow">Weak (40–62%)</option>
        </select>
      </div>

      {/* ── Scan progress (inline, no extra box) ── */}
      {loading && scanProgress.total > 0 && (
        <div
          style={{
            background: '#08080d',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            padding: '0 24px',
          }}
        >
          <div style={{ height: 3, background: '#111118', borderRadius: 2, overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                background: 'linear-gradient(90deg, #f97316, #fb923c)',
                borderRadius: 2,
                width: `${(scanProgress.current / scanProgress.total) * 100}%`,
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>
      )}

      <div className="px-3 md:px-8 py-3 md:py-6">
        {/* Column Headers - Desktop Only */}
        <div
          className="hidden lg:flex items-center px-6 py-3 mb-2 rounded-lg"
          style={{
            gap: '2rem',
            background: 'linear-gradient(180deg, #1c1c22 0%, #111115 100%)',
            borderTop: '1px solid rgba(255,255,255,0.10)',
            borderBottom: '1px solid rgba(0,0,0,0.8)',
            borderLeft: '1px solid rgba(255,255,255,0.04)',
            borderRight: '1px solid rgba(255,255,255,0.04)',
            boxShadow: '0 2px 10px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.08)',
          }}
        >
          {/* Must exactly match row Symbol div */}
          <div className="w-28 flex-shrink-0">
            <span className="text-white font-black text-sm uppercase tracking-[0.15em]">
              Symbol
            </span>
          </div>
          {/* Must exactly match row data grid: flex-1 grid grid-cols-4 gap-4 */}
          <div className="flex-1 grid grid-cols-4" style={{ gap: '1rem' }}>
            <div className="text-center">
              <button
                onClick={() => handleSort('currentPrice')}
                className="text-white hover:text-blue-300 font-black text-sm uppercase tracking-[0.12em] flex items-center justify-center gap-1 transition-colors"
              >
                Current <ArrowUpDown className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="text-center">
              <button
                onClick={() => handleSort('targetLevel')}
                className="text-white hover:text-blue-300 font-black text-sm uppercase tracking-[0.12em] flex items-center justify-center gap-1 transition-colors"
              >
                Target <ArrowUpDown className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="text-center">
              <span className="text-white font-black text-sm uppercase tracking-[0.12em]">
                Distance
              </span>
            </div>
            <div className="text-center">
              <button
                onClick={() => handleSort('strength')}
                className="text-white hover:text-blue-300 font-black text-sm uppercase tracking-[0.12em] flex items-center justify-center gap-1 transition-colors"
              >
                Strength <ArrowUpDown className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Results */}
        <div className="space-y-[3px]">
          {paginatedData.length === 0 && !loading && (
            <div className="text-center py-16 text-white font-semibold">
              {searchTerm
                ? 'No results found for your search'
                : lastUpdate
                  ? 'No results found'
                  : 'Click "SCAN NOW" to find attraction zones'}
            </div>
          )}

          {paginatedData.map((item, index) => {
            const isSelected = selectedRow === index
            const isHovered = hoveredRow === index
            const isEven = index % 2 === 0
            return (
              <div
                key={`${item.ticker}-${index}`}
                onClick={() => setSelectedRow(isSelected ? null : index)}
                onMouseEnter={() => setHoveredRow(index)}
                onMouseLeave={() => setHoveredRow(null)}
                className="px-4 md:px-6 py-4 md:py-5 cursor-pointer transition-all duration-150"
                style={
                  isSelected
                    ? {
                        background: 'linear-gradient(180deg, #1e1e2e 0%, #12121a 100%)',
                        borderTop: '1px solid rgba(180,120,255,0.35)',
                        borderBottom: '1px solid rgba(0,0,0,0.9)',
                        borderLeft: '2px solid rgba(180,120,255,0.6)',
                        borderRight: '1px solid rgba(180,120,255,0.15)',
                        boxShadow:
                          '0 4px 24px rgba(140,80,255,0.15), inset 0 1px 0 rgba(255,255,255,0.06)',
                        borderRadius: 10,
                      }
                    : isHovered
                      ? {
                          background: 'linear-gradient(180deg, #1a1a22 0%, #0f0f16 100%)',
                          borderTop: '1px solid rgba(255,255,255,0.10)',
                          borderBottom: '1px solid rgba(0,0,0,0.8)',
                          borderLeft: '1px solid rgba(255,255,255,0.05)',
                          borderRight: '1px solid rgba(255,255,255,0.03)',
                          boxShadow:
                            '0 3px 14px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)',
                          borderRadius: 10,
                        }
                      : {
                          background: isEven
                            ? 'linear-gradient(180deg, #141418 0%, #0c0c10 100%)'
                            : 'linear-gradient(180deg, #111115 0%, #0a0a0e 100%)',
                          borderTop: '1px solid rgba(255,255,255,0.055)',
                          borderBottom: '1px solid rgba(0,0,0,0.7)',
                          borderLeft: '1px solid rgba(255,255,255,0.03)',
                          borderRight: '1px solid rgba(255,255,255,0.02)',
                          boxShadow:
                            '0 2px 6px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)',
                          borderRadius: 8,
                        }
                }
              >
                {/* Row: Symbol + Data — mirrors header layout exactly */}
                <div className="flex items-center" style={{ gap: '2rem' }}>
                  {/* Symbol */}
                  <div className="w-28 flex-shrink-0">
                    <div className="flex items-center gap-3">
                      <span
                        className="text-xl font-black text-white tracking-wide"
                        style={{ textShadow: '0 0 12px rgba(255,255,255,0.15)' }}
                      >
                        {item.ticker}
                      </span>
                      {item.bias === 'Bullish' ? (
                        <TrendingUp className="w-5 h-5" style={{ color: '#00ff66' }} />
                      ) : (
                        <TrendingDown className="w-5 h-5" style={{ color: '#ff2222' }} />
                      )}
                    </div>
                  </div>

                  {/* Data Grid */}
                  <div className="flex-1 grid grid-cols-4" style={{ gap: '1rem' }}>
                    {/* Current Price */}
                    <div className="text-center">
                      <div className="text-xl font-black text-white">
                        ${item.currentPrice?.toFixed(2) || 'N/A'}
                      </div>
                    </div>

                    {/* Target Level */}
                    <div className="text-center">
                      <div
                        className="text-xl font-black"
                        style={{
                          color: item.attractionLevel > item.currentPrice ? '#00ff66' : '#ff2222',
                        }}
                      >
                        ${item.attractionLevel?.toFixed(2) || 'N/A'}
                      </div>
                    </div>

                    {/* Distance */}
                    <div className="text-center">
                      <div className="text-lg font-black" style={{ color: '#ff9500' }}>
                        {item.range?.toFixed(1) || 'N/A'}%
                      </div>
                    </div>

                    {/* Strength */}
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{
                            background:
                              (item.strength || 0) > 75
                                ? '#c84fff'
                                : (item.strength || 0) >= 63
                                  ? '#3b82f6'
                                  : '#eab308',
                            boxShadow:
                              (item.strength || 0) > 75
                                ? '0 0 7px #c84fff'
                                : (item.strength || 0) >= 63
                                  ? '0 0 7px #3b82f6'
                                  : '0 0 7px #eab308',
                          }}
                        />
                        <span className="text-lg font-black text-white">
                          {item.strength?.toFixed(0) || '0'}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Expanded Details */}
                {isSelected &&
                  (gammaClusterFilter !== 'none' ? (
                    <div
                      className="mt-4 pt-4 border-t"
                      style={{ borderColor: 'rgba(200,79,255,0.25)' }}
                    >
                      {/* Header */}
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}
                      >
                        <div
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: '#c84fff',
                            boxShadow: '0 0 8px #c84fff',
                          }}
                        />
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 800,
                            letterSpacing: '0.16em',
                            color: '#c84fff',
                          }}
                        >
                          GAMMA CLUSTER ANALYSIS — {item.ticker}
                        </span>
                        <div style={{ flex: 1, height: 1, background: 'rgba(200,79,255,0.2)' }} />
                        <span
                          style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}
                        >
                          cluster @ ${item.largestWall?.cluster?.centralStrike?.toFixed(2)} ·{' '}
                          {item.largestWall?.cluster?.strikes?.length} strikes ·{' '}
                          {item.largestWall?.cluster?.type?.toUpperCase()}
                        </span>
                      </div>
                      {/* Open Interest + GEX side by side */}
                      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <DealerOpenInterestChart
                            selectedTicker={item.ticker}
                            selectedExpiration={
                              expirationFilter === 'Week'
                                ? '7-days'
                                : expirationFilter === 'Month'
                                  ? '30-days'
                                  : '45-days'
                            }
                            hideAllControls={true}
                            hideExpirationSelector={true}
                            compactMode={true}
                            chartWidth={650}
                            showCalls={true}
                            showPuts={true}
                            showNetOI={false}
                            showTowers={true}
                          />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <DealerGEXChart
                            selectedTicker={item.ticker}
                            selectedExpiration={
                              expirationFilter === 'Week'
                                ? '7-days'
                                : expirationFilter === 'Month'
                                  ? '30-days'
                                  : '45-days'
                            }
                            hideAllControls={true}
                            hideExpirationSelector={true}
                            compactMode={true}
                            chartWidth={650}
                            showPositiveGamma={true}
                            showNegativeGamma={true}
                            showNetGamma={true}
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <GEXLevelMap item={item} />
                  ))}
              </div>
            )
          })}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-between">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 md:px-6 py-2 md:py-3 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-300 text-xs md:text-sm font-bold text-white"
            >
              <span className="hidden sm:inline">← Previous</span>
              <span className="sm:hidden">←</span>
            </button>
            <div className="text-sm text-gray-400 font-semibold">
              Page {currentPage} of {totalPages}
            </div>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 md:px-6 py-2 md:py-3 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-300 text-xs md:text-sm font-bold text-white"
            >
              <span className="hidden sm:inline">Next →</span>
              <span className="sm:hidden">→</span>
            </button>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes shimmer {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }
      `}</style>
    </div>
  )
}
