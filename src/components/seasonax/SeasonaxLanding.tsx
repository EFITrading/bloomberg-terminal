'use client'

import React, { useEffect, useRef, useState } from 'react'

import { BearIcon } from '@/components/icons/BearIcon'
import { BullIcon } from '@/components/icons/BullIcon'
import GlobalDataCache from '@/lib/GlobalDataCache'
import PolygonService, { SeasonalPattern } from '@/lib/polygonService'

import HeroSection from './HeroSection'
import MarketTabs from './MarketTabs'
import OpportunityCard from './OpportunityCard'

interface SeasonaxLandingProps {
  // Optional props for external control from sidebar
  autoStart?: boolean
  initialMarket?: string
  initialTimePeriod?: string
  externalFilters?: { highWinRate: string; startingSoon: string; fiftyTwoWeek: boolean }
  onFiltersChange?: (filters: {
    highWinRate: string
    startingSoon: string
    fiftyTwoWeek: boolean
  }) => void
  sidebarMode?: boolean // Flag to enable larger fonts for sidebar
}

const SeasonaxLanding: React.FC<SeasonaxLandingProps> = ({
  autoStart = false,
  initialMarket = 'S&P 500',
  initialTimePeriod = '15Y',
  externalFilters,
  onFiltersChange,
  sidebarMode = false,
}) => {
  const [activeMarket, setActiveMarket] = useState(initialMarket)
  const [timePeriod, setTimePeriod] = useState(initialTimePeriod)
  const [opportunities, setOpportunities] = useState<SeasonalPattern[]>([])
  const [loading, setLoading] = useState(false) // Don't auto-load
  const [error, setError] = useState<string | null>(null)
  const [streamStatus, setStreamStatus] = useState<string>('')
  const [showWebsite, setShowWebsite] = useState(true) // Show UI immediately
  const [progressStats, setProgressStats] = useState({ processed: 0, total: 1000, found: 0 })
  const [hasScanned, setHasScanned] = useState(false) // Track if user has clicked scan
  const [filters, setFilters] = useState(
    externalFilters || { highWinRate: '', startingSoon: '', fiftyTwoWeek: false }
  )
  const [seasonedMode, setSeasonedMode] = useState(false) // Track if showing seasoned multi-timeframe results
  const [leapsMode, setLeapsMode] = useState(false) // Track if showing Seasonal Leaps results
  const [expandedKey, setExpandedKey] = useState<string | null>(null) // Track which card is expanded
  const autoStartTriggered = useRef(false)
  const [isMobileView, setIsMobileView] = useState(false)
  useEffect(() => {
    const check = () => setIsMobileView(window.innerWidth <= 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Handle external filters
  useEffect(() => {
    if (externalFilters) {
      setFilters(externalFilters)
    }
  }, [externalFilters])

  // Auto-start scan if prop is set
  useEffect(() => {
    if (autoStart && !autoStartTriggered.current && !hasScanned) {
      autoStartTriggered.current = true
      console.log('🚀 Auto-starting seasonal scan from sidebar')
      loadMarketData(initialMarket)
    }
  }, [autoStart])

  const displayedOpportunities = React.useMemo(() => {
    let filtered = [...opportunities]
    // Always filter 70%+ and sort by win rate descending
    filtered = filtered.filter((opp) => opp.winRate >= 70)
    filtered = filtered.sort((a, b) => b.winRate - a.winRate)
    // Entry window filter
    if (filters.startingSoon) {
      filtered = filtered.filter((opp) => {
        const d = (opp as any).daysUntilStart ?? 0
        if (filters.startingSoon === 'upcoming') return d >= 1 && d <= 9
        if (filters.startingSoon === 'recent') return d >= -10 && d <= -5
        return true
      })
    }
    if (filters.fiftyTwoWeek) {
      // Filter only opportunities that have 52-week high/low status
      filtered = filtered.filter((opp) => (opp as any).fiftyTwoWeekStatus)
    }
    return filtered
  }, [opportunities, filters])

  const handleFilterChange = (newFilters: {
    highWinRate: string
    startingSoon: string
    fiftyTwoWeek: boolean
  }) => {
    setFilters(newFilters)
    onFiltersChange?.(newFilters)
  }

  const marketTabs = [
    { id: 'SP500', name: 'S&P 500' },
    { id: 'NASDAQ100', name: 'NASDAQ 100' },
    { id: 'DOWJONES', name: 'Dow Jones' },
  ]

  // Function to check 52-week high/low status
  const check52WeekStatus = async (opportunities: any[]) => {
    // Import PolygonService to use its configured API key
    const polygonService = new PolygonService()

    const enrichedOpportunities = await Promise.all(
      opportunities.map(async (opp) => {
        try {
          // Get 52-week data using PolygonService
          const toDate = new Date().toISOString().split('T')[0]
          const fromDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0]

          const data = await polygonService.getHistoricalData(opp.symbol, fromDate, toDate)

          if (data?.results && data.results.length > 0) {
            const highs = data.results.map((bar: any) => bar.h)
            const lows = data.results.map((bar: any) => bar.l)
            const currentPrice = data.results[data.results.length - 1].c

            const fiftyTwoWeekHigh = Math.max(...highs)
            const fiftyTwoWeekLow = Math.min(...lows)

            // Check if within 5% of 52-week high or low
            const distanceFromHigh = ((fiftyTwoWeekHigh - currentPrice) / fiftyTwoWeekHigh) * 100
            const distanceFromLow = ((currentPrice - fiftyTwoWeekLow) / fiftyTwoWeekLow) * 100

            let fiftyTwoWeekStatus = null

            if (distanceFromHigh <= 5) {
              fiftyTwoWeekStatus = '52 High'
            } else if (distanceFromLow <= 5) {
              fiftyTwoWeekStatus = '52 Low'
            }

            return {
              ...opp,
              currentPrice,
              fiftyTwoWeekHigh,
              fiftyTwoWeekLow,
              fiftyTwoWeekStatus,
            }
          }

          return opp
        } catch (error) {
          console.warn(`Error checking 52-week status for ${opp.symbol}:`, error)
          return opp
        }
      })
    )

    return enrichedOpportunities
  }

  const timePeriodOptions = [
    { id: '5Y', name: '5 Years', years: 5, description: 'Recent - Current trends' },
    { id: '10Y', name: '10 Years', years: 10, description: 'Balanced - Market cycles' },
    { id: '15Y', name: '15 Years', years: 15, description: 'Comprehensive - Long patterns' },
    { id: '20Y', name: '20 Years', years: 20, description: 'Maximum depth - Full cycles' },
  ]

  const selectedYears = timePeriodOptions.find((p) => p.id === timePeriod)?.years || 15

  const loadMarketData = async (selectedMarket?: string) => {
    try {
      // Load fresh data directly from SeasonalScreenerService
      console.log('📊 Loading fresh seasonal data...')

      // Import market indices and service
      const { default: SeasonalScreenerService } = await import('@/lib/seasonalScreenerService')
      const { getMarketStocks } = await import('@/lib/marketIndices')
      const seasonalService = new SeasonalScreenerService()

      // Get market-specific stocks
      const market = selectedMarket || activeMarket
      const marketStocks = getMarketStocks(market)
      console.log(`📊 Scanning ${market}: ${marketStocks.length} stocks`)

      setHasScanned(true)
      setLoading(true)
      setError(null)
      setShowWebsite(false)
      setOpportunities([])
      setSeasonedMode(false)
      setLeapsMode(false)
      setStreamStatus(
      )
      setProgressStats({ processed: 0, total: marketStocks.length, found: 0 })

      const selectedPeriod = timePeriodOptions.find((p) => p.id === timePeriod)
      const years = selectedPeriod?.years || 15 // FULL years as requested - no limits

      try {
        // Load FULL data using batch processing with real-time results
        setStreamStatus('')

        // Real-time progress callback to show results as they're found
        let lastUpdate = 0

        const realOpportunities = await seasonalService.screenSeasonalOpportunitiesWithWorkers(
          years,
          marketStocks.length, // Use market-specific count
          50,
          (processed, total, foundOpportunities, currentSymbol) => {
            // Throttle updates to prevent UI overwhelming (update every 100ms max)
            const now = Date.now()
            const shouldUpdate =
              now - lastUpdate > 100 || foundOpportunities.length > opportunities.length

            if (shouldUpdate) {
              lastUpdate = now

              // Update progress stats in real-time
              setProgressStats({
                processed,
                total,
                found: foundOpportunities.length,
              })

              // Update status with current processing info
              if (currentSymbol) {
                setStreamStatus(
                  `📊 ${currentSymbol} - Found ${foundOpportunities.length} qualified opportunities (${processed}/${total})`
                )
              } else {
                setStreamStatus(
                  `📊 ${processed}/${total} processed - ${foundOpportunities.length} opportunities found`
                )
              }

              // Show opportunities as they're found - REAL-TIME UPDATES
              if (foundOpportunities.length > 0) {
                const sortedOpportunities = foundOpportunities.sort(
                  (a, b) => Math.abs(b.averageReturn) - Math.abs(a.averageReturn)
                )

                setOpportunities(sortedOpportunities as unknown as SeasonalPattern[])

                // DISMISS LOADING SCREEN immediately when first opportunities are found
                if (foundOpportunities.length === 1) {
                  setLoading(false)
                  setShowWebsite(true)
                } else if (foundOpportunities.length > 1 && loading) {
                  setLoading(false)
                  setShowWebsite(true)
                }
              }
            }
          }
        )

        if (realOpportunities && realOpportunities.length > 0) {
          // Check 52-week high/low status for all opportunities to display badges
          setStreamStatus('🔍 Checking 52-week high/low status...')
          const enrichedOpportunities = await check52WeekStatus(realOpportunities)

          // Final sort and display
          const finalSorted = enrichedOpportunities.sort(
            (a, b) => Math.abs(b.averageReturn) - Math.abs(a.averageReturn)
          )
          setOpportunities(finalSorted as unknown as SeasonalPattern[])
          setLoading(false)
          setStreamStatus('✅ Processing completed!')
          setProgressStats({ processed: 1000, total: 1000, found: enrichedOpportunities.length })
        } else {
          throw new Error('No seasonal opportunities found')
        }
      } catch (error) {
        const errorMsg = `Failed to start seasonal screening: ${error instanceof Error ? error.message : 'Unknown error'}`
        console.error(` ${errorMsg}`)
        setError(errorMsg)
        setLoading(false)
        setShowWebsite(false)
      }
    } catch (outerError) {
      console.error('Failed to load seasonalScreenerService:', outerError)
      setError(
        `Failed to initialize screener: ${outerError instanceof Error ? outerError.message : 'Unknown error'}`
      )
      setLoading(false)
    }
  }

  // Load seasoned multi-timeframe data - scan 5Y, 10Y, 15Y, 20Y and find stocks with 60%+ win rate on 2+ timeframes
  const loadSeasonedData = async (selectedMarket?: string) => {
    try {
      console.log('🌟 Starting SEASONED multi-timeframe scan...')

      const { default: SeasonalScreenerService } = await import('@/lib/seasonalScreenerService')
      const { getMarketStocks } = await import('@/lib/marketIndices')
      const seasonalService = new SeasonalScreenerService()

      const market = selectedMarket || activeMarket
      const marketStocks = getMarketStocks(market)

      setHasScanned(true)
      setLoading(true)
      setError(null)
      setShowWebsite(false)
      setOpportunities([])
      setSeasonedMode(true)
      setLeapsMode(false)
      setStreamStatus(
        `🌟 SEASONED SCAN: Analyzing ${marketStocks.length} stocks across 4 timeframes (5Y, 10Y, 15Y, 20Y)...`
      )
      setProgressStats({ processed: 0, total: marketStocks.length * 4, found: 0 })

      const timeframes = [5, 10, 15, 20]
      const stockResults = new Map<
        string,
        { symbol: string; qualifyingTimeframes: number[]; patterns: any[] }
      >()

      // Scan each timeframe
      for (let i = 0; i < timeframes.length; i++) {
        const years = timeframes[i]
        console.log(`📊 Scanning ${years}Y timeframe...`)

        setStreamStatus(`🌟 Scanning ${years}Y timeframe (${i + 1}/4)...`)

        const results = await seasonalService.screenSeasonalOpportunitiesWithWorkers(
          years,
          marketStocks.length,
          50,
          (processed, total, foundOpportunities) => {
            const overallProcessed = i * marketStocks.length + processed
            const overallTotal = marketStocks.length * 4

            setProgressStats({
              processed: overallProcessed,
              total: overallTotal,
              found: stockResults.size,
            })

            setStreamStatus(
              `🌟 ${years}Y: ${processed}/${total} | Total qualified stocks: ${stockResults.size}`
            )
          }
        )

        // Process results from this timeframe
        results.forEach((pattern: any) => {
          if (pattern.winRate >= 60) {
            const existing = stockResults.get(pattern.symbol)
            if (existing) {
              existing.qualifyingTimeframes.push(years)
              existing.patterns.push({ ...pattern, timeframe: years }) // Clone and tag with timeframe
            } else {
              stockResults.set(pattern.symbol, {
                symbol: pattern.symbol,
                qualifyingTimeframes: [years],
                patterns: [{ ...pattern, timeframe: years }], // Clone and tag with timeframe
              })
            }
          }
        })
      }

      // Filter stocks that qualify on 2+ timeframes
      const seasonedOpportunities: any[] = []
      stockResults.forEach((stockData) => {
        if (stockData.qualifyingTimeframes.length >= 2) {
          // Calculate average win rate across all qualifying timeframes
          const avgWinRate =
            stockData.patterns.reduce((sum, p) => sum + p.winRate, 0) / stockData.patterns.length
          const avgReturn =
            stockData.patterns.reduce((sum, p) => sum + (p.avgReturn || p.averageReturn || 0), 0) /
            stockData.patterns.length

          // Use the first pattern as base and update with averages
          const basePattern = stockData.patterns[0]

          // Add metadata for color coding
          seasonedOpportunities.push({
            ...basePattern,
            winRate: avgWinRate,
            avgReturn: avgReturn,
            averageReturn: avgReturn,
            qualifyingTimeframes: stockData.qualifyingTimeframes.length,
            timeframeDetails: stockData.qualifyingTimeframes,
          })
        }
      })

      console.log(
        `✅ SEASONED SCAN Complete! Found ${seasonedOpportunities.length} multi-timeframe qualified stocks`
      )

      if (seasonedOpportunities.length > 0) {
        // Check 52-week status
        setStreamStatus('🔍 Checking 52-week high/low status...')
        const enrichedOpportunities = await check52WeekStatus(seasonedOpportunities)

        // Sort by number of qualifying timeframes, then by win rate
        const sorted = enrichedOpportunities.sort((a: any, b: any) => {
          if (b.qualifyingTimeframes !== a.qualifyingTimeframes) {
            return b.qualifyingTimeframes - a.qualifyingTimeframes
          }
          return b.winRate - a.winRate
        })

        setOpportunities(sorted as unknown as SeasonalPattern[])
        setLoading(false)
        setShowWebsite(true)
        setStreamStatus(`✅ Found ${seasonedOpportunities.length} SEASONED opportunities!`)
      } else {
        setError('No stocks found with 60%+ win rate on 2+ timeframes')
        setLoading(false)
        setShowWebsite(false)
      }
    } catch (error) {
      console.error('SEASONED scan failed:', error)
      setError(`SEASONED scan failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
      setLoading(false)
      setSeasonedMode(false)
    }
  }

  const handleScreenerStart = (market: string) => {
    console.log(`Starting screener for ${market}`)
    setActiveMarket(market)
    setSeasonedMode(false)
    loadMarketData(market)
  }

  // ── Seasonal Leaps scan: sweet-spot/pain-point (50–90 day), 8–15 years ──
  const loadLeapsData = async (selectedMarket?: string) => {
    try {
      const { default: SeasonalScreenerService } = await import('@/lib/seasonalScreenerService')
      const { getMarketStocks } = await import('@/lib/marketIndices')
      const seasonalService = new SeasonalScreenerService()

      const market = selectedMarket || activeMarket
      const marketStocks = getMarketStocks(market)

      setHasScanned(true)
      setLoading(true)
      setError(null)
      setShowWebsite(false)
      setOpportunities([])
      setSeasonedMode(false)
      setLeapsMode(true)
      setStreamStatus(`🚀 SEASONAL LEAPS: Scanning ${marketStocks.length} stocks (8–15 year sweet-spot windows)...`)
      setProgressStats({ processed: 0, total: marketStocks.length, found: 0 })

      const results = await seasonalService.screenSeasonalLeaps(
        marketStocks.length,
        50,
        (processed, total, found) => {
          setProgressStats({ processed, total, found: found.length })
          setStreamStatus(`🚀 ${processed}/${total} scanned | ${found.length} leaps found`)
        },
        marketStocks
      )

      if (results.length > 0) {
        setStreamStatus('🔍 Checking 52-week high/low status...')
        const enriched = await check52WeekStatus(results)
        setOpportunities(enriched as unknown as SeasonalPattern[])
        setLoading(false)
        setShowWebsite(true)
        setStreamStatus(`✅ Found ${results.length} Seasonal Leaps!`)
      } else {
        setError('No active seasonal leaps found right now.')
        setLoading(false)
        setShowWebsite(false)
      }
    } catch (error) {
      console.error('Seasonal Leaps scan failed:', error)
      setError(`Leaps scan failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
      setLoading(false)
      setLeapsMode(false)
    }
  }

  const handleSeasonedScan = (market: string) => {
    console.log(`Starting SEASONED scan for ${market}`)
    setActiveMarket(market)
    loadSeasonedData(market)
  }

  const handleLeapsScan = (market: string) => {
    console.log(`Starting SEASONAL LEAPS scan for ${market}`)
    setActiveMarket(market)
    loadLeapsData(market)
  }

  const handleTabChange = (tabId: string) => {
    setActiveMarket(tabId)
  }

  if (loading && !showWebsite) {
    return (
      <div className="seasonax-loading">
        <div className="loading-spinner"></div>
        <p>Starting seasonal screener...</p>
        <p>{streamStatus}</p>
        {progressStats.processed > 0 && (
          <div className="progress-info">
            <p>
              {' '}
              Processed: {progressStats.processed} | Found: {progressStats.found} opportunities
            </p>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${(progressStats.processed / progressStats.total) * 100}%` }}
              ></div>
            </div>
          </div>
        )}
      </div>
    )
  }

  if (error) {
    return (
      <div className="seasonax-error">
        <div className="error-icon"></div>
        <h2>API Connection Error</h2>
        <p>{error}</p>
        <button onClick={() => loadMarketData()} className="retry-button">
          Retry API Connection
        </button>
      </div>
    )
  }

  return (
    <div className="seasonax-container" style={{ marginTop: '0' }}>
      {/* Hide scrollbars CSS + mobile 2-col grid */}
      <style>
        {`
 .results-grid-split::-webkit-scrollbar {
 display: none;
 }
 @media (max-width: 768px) {
   .seasonax-container { margin-top: 0 !important; }
   .results-grid-split {
     display: grid !important;
     grid-template-columns: repeat(2, 1fr) !important;
     gap: 6px !important;
     padding: 6px !important;
     height: auto !important;
     overflow-y: visible !important;
     overflow-x: hidden !important;
   }
   .split-results-container .golden-separator { display: none !important; }
   .bullish-section, .bearish-section, .seasoned-section {
     height: auto !important; min-height: 0 !important;
   }
   .section-header-split { padding: 6px 10px !important; }
   .section-title { font-size: 12px !important; gap: 6px !important; }
   .section-title svg { width: 18px !important; height: 18px !important; }
   .section-title .count { font-size: 11px !important; }
   .pro-results { padding: 0 !important; }
 }
 `}
      </style>

      {/* Hero Section */}
      <HeroSection
        onScreenerStart={handleScreenerStart}
        timePeriod={timePeriod}
        onTimePeriodChange={setTimePeriod}
        progressStats={progressStats}
        opportunitiesCount={displayedOpportunities.length}
        loading={loading}
        timePeriodOptions={timePeriodOptions}
        onFilterChange={handleFilterChange}
        onSeasonedScan={handleSeasonedScan}
        onBestScan={handleLeapsScan}
      />

      {/* Results Grid */}
      <div className="pro-results">
        {!hasScanned ? (
          <div className="pro-empty-state"></div>
        ) : displayedOpportunities.length > 0 ? (
          <div
            className="split-results-container"
            style={{
              border: isMobileView ? 'none' : '3px solid #FFD700',
              borderRadius: isMobileView ? '0' : '12px',
              height: isMobileView ? 'auto' : '82vh',
              overflow: isMobileView ? 'visible' : 'hidden',
              display: 'flex',
              flexDirection: isMobileView ? 'column' : 'row',
              marginTop: sidebarMode ? '20px' : '0',
            }}
          >
            {(() => {
              // SEASONED MODE - Split by bullish/bearish like regular mode
              if (seasonedMode) {
                const bullishOpps = displayedOpportunities.filter(
                  (opp) => (opp.averageReturn || opp.avgReturn || 0) >= 0
                )
                const bearishOpps = displayedOpportunities.filter(
                  (opp) => (opp.averageReturn || opp.avgReturn || 0) < 0
                )

                return (
                  <>
                    {/* Left Column - Bullish Seasoned */}
                    <div
                      className="seasoned-section"
                      style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        height: '100%',
                        minHeight: 0,
                      }}
                    >
                      <div className="section-header-split seasoned-header">
                        <div className="section-title">
                          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
                            <style>{`
                              @keyframes sl-rocket-rise { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-3px)} }
                              @keyframes sl-flame { 0%,100%{opacity:1;transform:scaleY(1)} 50%{opacity:0.6;transform:scaleY(0.7)} }
                              @keyframes sl-trail { 0%{opacity:0;transform:scaleX(0)} 60%{opacity:1;transform:scaleX(1)} 100%{opacity:0;transform:scaleX(1)} }
                              .sl-rocket-g { animation: sl-rocket-rise 1.8s ease-in-out infinite; transform-origin: 14px 14px; }
                              .sl-flame { animation: sl-flame 0.4s ease-in-out infinite; transform-origin: 14px 20px; }
                              .sl-trail { animation: sl-trail 1.8s ease-in-out infinite; transform-origin: 14px 20px; }
                            `}</style>
                            <g className="sl-rocket-g">
                              <path d="M14 4 C14 4 9 10 9 16 L14 20 L19 16 C19 10 14 4 14 4Z" fill="#00FF88" opacity="0.9" />
                              <circle cx="14" cy="13" r="2.5" fill="#000" opacity="0.6" />
                              <path d="M9 16 L6 18 L9 19Z" fill="#00CC66" />
                              <path d="M19 16 L22 18 L19 19Z" fill="#00CC66" />
                              <path className="sl-flame" d="M12 20 Q14 25 16 20 Q14 23 12 20Z" fill="#FFD700" />
                            </g>
                          </svg>
                          BULLISH SEASONALITY
                          <span className="count">({bullishOpps.length})</span>
                        </div>
                      </div>
                      <div
                        className="results-grid-split"
                        style={{
                          overflowY: 'auto',
                          overflowX: 'hidden',
                          height: 'calc(82vh - 70px)',
                        }}
                      >
                        {bullishOpps.map((opportunity, index) => {
                          const cardKey = `bullish-${(opportunity as any).symbol}-${index}`
                          const qualifyingCount = (opportunity as any).qualifyingTimeframes || 0
                          const timeframeYears =
                            (opportunity as any).timeframe ||
                            (opportunity as any).years ||
                            selectedYears
                          return (
                            <OpportunityCard
                              key={cardKey}
                              pattern={opportunity}
                              rank={index + 1}
                              isTopBullish={false}
                              isTopBearish={false}
                              sidebarMode={sidebarMode}
                              seasonedQualifying={qualifyingCount}
                              years={timeframeYears}
                              hideBestBadge={leapsMode}
                              isLeaps={leapsMode}
                              isExpanded={expandedKey === cardKey}
                              onExpand={() => setExpandedKey(expandedKey === cardKey ? null : cardKey)}
                            />
                          )
                        })}
                      </div>
                    </div>

                    {/* Golden Vertical Separator */}
                    <div className="golden-separator">
                      <div className="separator-line"></div>
                      <div className="separator-orb">
                        <div className="orb-inner"></div>
                      </div>
                    </div>

                    {/* Right Column - Bearish Seasoned */}
                    <div
                      className="seasoned-section"
                      style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        height: '100%',
                        minHeight: 0,
                      }}
                    >
                      <div className="section-header-split seasoned-header">
                        <div className="section-title">
                          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
                            <style>{`
                              @keyframes sl-bear-pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.06)} }
                              @keyframes sl-claw { 0%{transform:translateY(0)} 40%{transform:translateY(2px)} 100%{transform:translateY(0)} }
                              .sl-bear-body { animation: sl-bear-pulse 2s ease-in-out infinite; transform-origin: 14px 14px; }
                              .sl-claw1 { animation: sl-claw 2s 0s ease-in-out infinite; transform-origin: 10px 20px; }
                              .sl-claw2 { animation: sl-claw 2s 0.3s ease-in-out infinite; transform-origin: 14px 21px; }
                              .sl-claw3 { animation: sl-claw 2s 0.6s ease-in-out infinite; transform-origin: 18px 20px; }
                            `}</style>
                            <g className="sl-bear-body">
                              <path d="M7 10 Q14 5 21 10 L22 20 Q14 24 6 20Z" fill="#FF4444" opacity="0.85" />
                              <circle cx="10" cy="8" r="2.5" fill="#FF4444" />
                              <circle cx="18" cy="8" r="2.5" fill="#FF4444" />
                              <circle cx="10.5" cy="13" r="1.2" fill="#1a0000" />
                              <circle cx="17.5" cy="13" r="1.2" fill="#1a0000" />
                            </g>
                            <line className="sl-claw1" x1="10" y1="20" x2="9" y2="24" stroke="#FF6666" strokeWidth="1.5" strokeLinecap="round" />
                            <line className="sl-claw2" x1="14" y1="21" x2="14" y2="25" stroke="#FF6666" strokeWidth="1.5" strokeLinecap="round" />
                            <line className="sl-claw3" x1="18" y1="20" x2="19" y2="24" stroke="#FF6666" strokeWidth="1.5" strokeLinecap="round" />
                          </svg>
                          BEARISH SEASONALITY
                          <span className="count">({bearishOpps.length})</span>
                        </div>
                      </div>
                      <div
                        className="results-grid-split"
                        style={{
                          overflowY: 'auto',
                          overflowX: 'hidden',
                          height: 'calc(82vh - 70px)',
                        }}
                      >
                        {bearishOpps.map((opportunity, index) => {
                          const cardKey = `bearish-${(opportunity as any).symbol}-${index}`
                          const qualifyingCount = (opportunity as any).qualifyingTimeframes || 0
                          const timeframeYears =
                            (opportunity as any).timeframe ||
                            (opportunity as any).years ||
                            selectedYears
                          return (
                            <OpportunityCard
                              key={cardKey}
                              pattern={opportunity}
                              rank={index + 1}
                              isTopBullish={false}
                              isTopBearish={false}
                              sidebarMode={sidebarMode}
                              seasonedQualifying={qualifyingCount}
                              years={timeframeYears}
                              hideBestBadge={leapsMode}
                              isLeaps={leapsMode}
                              isExpanded={expandedKey === cardKey}
                              onExpand={() => setExpandedKey(expandedKey === cardKey ? null : cardKey)}
                            />
                          )
                        })}
                      </div>
                    </div>
                  </>
                )
              }

              // REGULAR MODE - Bullish/Bearish split
              const bullishOpps = displayedOpportunities.filter(
                (opp) => (opp.averageReturn || opp.avgReturn || 0) >= 0
              )
              const bearishOpps = displayedOpportunities.filter(
                (opp) => (opp.averageReturn || opp.avgReturn || 0) < 0
              )

              const topBullish =
                bullishOpps.length > 0
                  ? bullishOpps.reduce((prev, curr) => {
                    const prevScore = (prev.winRate + ((prev as any).correlation || 0)) / 2
                    const currScore = (curr.winRate + ((curr as any).correlation || 0)) / 2
                    return currScore > prevScore ? curr : prev
                  })
                  : null

              const topBearish =
                bearishOpps.length > 0
                  ? bearishOpps.reduce((prev, curr) => {
                    const prevScore = (prev.winRate + ((prev as any).correlation || 0)) / 2
                    const currScore = (curr.winRate + ((curr as any).correlation || 0)) / 2
                    return currScore > prevScore ? curr : prev
                  })
                  : null

              return (
                <>
                  {/* Bullish Section - Left Side */}
                  <div
                    className="bullish-section"
                    style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      height: '100%',
                      minHeight: 0,
                    }}
                  >
                    <div className="section-header-split bullish-header">
                      <div className="section-title">
                        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
                          <style>{`
                            @keyframes sl-arrow-up { 0%,100%{transform:translateY(0);opacity:1} 50%{transform:translateY(-4px);opacity:0.7} }
                            @keyframes sl-bar-grow { 0%,100%{transform:scaleY(1)} 50%{transform:scaleY(1.15)} }
                            @keyframes sl-spark { 0%,100%{opacity:0;transform:scale(0)} 50%{opacity:1;transform:scale(1)} }
                            .sl-arrow { animation: sl-arrow-up 1.4s ease-in-out infinite; transform-origin: 14px 8px; }
                            .sl-bar1 { animation: sl-bar-grow 1.4s 0s ease-in-out infinite; transform-origin: 8px 22px; }
                            .sl-bar2 { animation: sl-bar-grow 1.4s 0.2s ease-in-out infinite; transform-origin: 14px 22px; }
                            .sl-bar3 { animation: sl-bar-grow 1.4s 0.4s ease-in-out infinite; transform-origin: 20px 22px; }
                            .sl-spark { animation: sl-spark 1.4s ease-in-out infinite; transform-origin: 14px 6px; }
                          `}</style>
                          <rect className="sl-bar1" x="6" y="16" width="5" height="6" rx="1" fill="#00FF88" opacity="0.7" />
                          <rect className="sl-bar2" x="11.5" y="12" width="5" height="10" rx="1" fill="#00FF88" opacity="0.85" />
                          <rect className="sl-bar3" x="17" y="8" width="5" height="14" rx="1" fill="#00FF88" />
                          <g className="sl-arrow">
                            <polyline points="10,10 14,5 18,10" stroke="#00FF88" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                            <line x1="14" y1="5" x2="14" y2="14" stroke="#00FF88" strokeWidth="2" strokeLinecap="round" />
                          </g>
                          <circle className="sl-spark" cx="14" cy="3" r="1.5" fill="#FFD700" />
                        </svg>
                        BULLISH SEASONALITY
                        <span className="count">({bullishOpps.length})</span>
                      </div>
                    </div>
                    <div
                      className="results-grid-split"
                      style={{
                        overflowY: 'auto',
                        overflowX: 'hidden',
                        height: 'calc(82vh - 70px)',
                      }}
                    >
                      {bullishOpps.map((opportunity, index) => {
                        const isTopBullish = topBullish
                          ? opportunity.symbol === topBullish.symbol
                          : false
                        const timeframeYears =
                          (opportunity as any).timeframe ||
                          (opportunity as any).years ||
                          selectedYears
                        const cardKey = `bullish-${opportunity.symbol}-${index}`
                        return (
                          <OpportunityCard
                            key={cardKey}
                            pattern={opportunity}
                            rank={index + 1}
                            isTopBullish={isTopBullish}
                            isTopBearish={false}
                            sidebarMode={sidebarMode}
                            hideBestBadge={leapsMode}
                            isLeaps={leapsMode}
                            years={timeframeYears}
                            isExpanded={expandedKey === cardKey}
                            onExpand={() => setExpandedKey(expandedKey === cardKey ? null : cardKey)}
                          />
                        )
                      })}
                    </div>
                  </div>

                  {/* Golden Vertical Separator */}
                  <div className="golden-separator">
                    <div className="separator-line"></div>
                    <div className="separator-orb">
                      <div className="orb-inner"></div>
                    </div>
                  </div>

                  {/* Bearish Section - Right Side */}
                  <div
                    className="bearish-section"
                    style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      height: '100%',
                      minHeight: 0,
                    }}
                  >
                    <div className="section-header-split bearish-header">
                      <div className="section-title">
                        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
                          <style>{`
                            @keyframes sl-arrow-dn { 0%,100%{transform:translateY(0);opacity:1} 50%{transform:translateY(4px);opacity:0.7} }
                            @keyframes sl-bar-shrink { 0%,100%{transform:scaleY(1)} 50%{transform:scaleY(0.85)} }
                            @keyframes sl-drip { 0%,60%{opacity:0;transform:translateY(0)} 80%{opacity:1;transform:translateY(3px)} 100%{opacity:0;transform:translateY(5px)} }
                            .sl-dn-arrow { animation: sl-arrow-dn 1.4s ease-in-out infinite; transform-origin: 14px 20px; }
                            .sl-rbar1 { animation: sl-bar-shrink 1.4s 0.4s ease-in-out infinite; transform-origin: 8px 6px; }
                            .sl-rbar2 { animation: sl-bar-shrink 1.4s 0.2s ease-in-out infinite; transform-origin: 14px 6px; }
                            .sl-rbar3 { animation: sl-bar-shrink 1.4s 0s ease-in-out infinite; transform-origin: 20px 6px; }
                            .sl-drip { animation: sl-drip 1.4s ease-in-out infinite; }
                          `}</style>
                          <rect className="sl-rbar1" x="6" y="6" width="5" height="14" rx="1" fill="#FF4444" />
                          <rect className="sl-rbar2" x="11.5" y="6" width="5" height="10" rx="1" fill="#FF4444" opacity="0.85" />
                          <rect className="sl-rbar3" x="17" y="6" width="5" height="6" rx="1" fill="#FF4444" opacity="0.7" />
                          <g className="sl-dn-arrow">
                            <polyline points="10,18 14,23 18,18" stroke="#FF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                            <line x1="14" y1="23" x2="14" y2="14" stroke="#FF4444" strokeWidth="2" strokeLinecap="round" />
                          </g>
                          <circle className="sl-drip" cx="14" cy="25" r="1.5" fill="#FF6666" />
                        </svg>
                        BEARISH SEASONALITY
                        <span className="count">({bearishOpps.length})</span>
                      </div>
                    </div>
                    <div
                      className="results-grid-split"
                      style={{
                        overflowY: 'auto',
                        overflowX: 'hidden',
                        height: 'calc(82vh - 70px)',
                      }}
                    >
                      {bearishOpps.map((opportunity, index) => {
                        const isTopBearish = topBearish
                          ? opportunity.symbol === topBearish.symbol
                          : false
                        const timeframeYears =
                          (opportunity as any).timeframe ||
                          (opportunity as any).years ||
                          selectedYears
                        const cardKey = `bearish-${opportunity.symbol}-${index}`
                        return (
                          <OpportunityCard
                            key={cardKey}
                            pattern={opportunity}
                            rank={index + 1}
                            isTopBullish={false}
                            isTopBearish={isTopBearish}
                            hideBestBadge={leapsMode}
                            isLeaps={leapsMode}
                            sidebarMode={sidebarMode}
                            years={timeframeYears}
                            isExpanded={expandedKey === cardKey}
                            onExpand={() => setExpandedKey(expandedKey === cardKey ? null : cardKey)}
                          />
                        )
                      })}
                    </div>
                  </div>
                </>
              )
            })()}
          </div>
        ) : error ? (
          <div className="pro-error">
            <div className="error-icon"></div>
            <div className="error-text">Connection Error</div>
            <div className="error-details">{error}</div>
          </div>
        ) : (
          <div className="pro-loading">
            <div className="loading-indicator"></div>
            <div className="loading-text">Scanning Markets...</div>
          </div>
        )}
      </div>
    </div>
  )
}

export default SeasonaxLanding
