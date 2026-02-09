'use client';

import React, { useState, useEffect, useRef } from 'react';
import PolygonService, { SeasonalPattern } from '@/lib/polygonService';
import GlobalDataCache from '@/lib/GlobalDataCache';
import HeroSection from './HeroSection';
import MarketTabs from './MarketTabs';
import OpportunityCard from './OpportunityCard';
import { BullIcon } from '@/components/icons/BullIcon';
import { BearIcon } from '@/components/icons/BearIcon';


interface SeasonaxLandingProps {
  // Optional props for external control from sidebar
  autoStart?: boolean;
  initialMarket?: string;
  initialTimePeriod?: string;
  externalFilters?: { highWinRate: boolean; startingSoon: boolean; fiftyTwoWeek: boolean };
  onFiltersChange?: (filters: { highWinRate: boolean; startingSoon: boolean; fiftyTwoWeek: boolean }) => void;
  sidebarMode?: boolean; // Flag to enable larger fonts for sidebar
}

const SeasonaxLanding: React.FC<SeasonaxLandingProps> = ({
  autoStart = false,
  initialMarket = 'S&P 500',
  initialTimePeriod = '15Y',
  externalFilters,
  onFiltersChange,
  sidebarMode = false
}) => {
  const [activeMarket, setActiveMarket] = useState(initialMarket);
  const [timePeriod, setTimePeriod] = useState(initialTimePeriod);
  const [opportunities, setOpportunities] = useState<SeasonalPattern[]>([]);
  const [loading, setLoading] = useState(false); // Don't auto-load
  const [error, setError] = useState<string | null>(null);
  const [streamStatus, setStreamStatus] = useState<string>('');
  const [showWebsite, setShowWebsite] = useState(true); // Show UI immediately
  const [progressStats, setProgressStats] = useState({ processed: 0, total: 1000, found: 0 });
  const [hasScanned, setHasScanned] = useState(false); // Track if user has clicked scan
  const [filters, setFilters] = useState(externalFilters || { highWinRate: false, startingSoon: false, fiftyTwoWeek: false });
  const [seasonedMode, setSeasonedMode] = useState(false); // Track if showing seasoned multi-timeframe results
  const [bestMode, setBestMode] = useState(false); // Track if showing BEST scan results
  const autoStartTriggered = useRef(false);

  // Handle external filters
  useEffect(() => {
    if (externalFilters) {
      setFilters(externalFilters);
    }
  }, [externalFilters]);

  // Auto-start scan if prop is set
  useEffect(() => {
    if (autoStart && !autoStartTriggered.current && !hasScanned) {
      autoStartTriggered.current = true;
      console.log('🚀 Auto-starting seasonal scan from sidebar');
      loadMarketData(initialMarket);
    }
  }, [autoStart]);

  const displayedOpportunities = React.useMemo(() => {
    let filtered = [...opportunities];
    if (filters.highWinRate) {
      filtered = filtered.filter(opp => opp.winRate >= 60);
    }
    if (filters.startingSoon) {
      filtered = filtered.filter(opp => {
        const daysUntilStart = (opp as any).daysUntilStart || 0;
        return daysUntilStart >= 1 && daysUntilStart <= 3;
      });
    }
    if (filters.fiftyTwoWeek) {
      // Filter only opportunities that have 52-week high/low status
      filtered = filtered.filter(opp => (opp as any).fiftyTwoWeekStatus);
    }
    return filtered;
  }, [opportunities, filters]);

  const handleFilterChange = (newFilters: { highWinRate: boolean; startingSoon: boolean; fiftyTwoWeek: boolean }) => {
    setFilters(newFilters);
    onFiltersChange?.(newFilters);
  };

  const marketTabs = [
    { id: 'SP500', name: 'S&P 500' },
    { id: 'NASDAQ100', name: 'NASDAQ 100' },
    { id: 'DOWJONES', name: 'Dow Jones' }
  ];

  // Function to check 52-week high/low status
  const check52WeekStatus = async (opportunities: any[]) => {
    console.log('🔍 Checking 52-week high/low status for opportunities...');

    // Import PolygonService to use its configured API key
    const polygonService = new PolygonService();

    const enrichedOpportunities = await Promise.all(
      opportunities.map(async (opp) => {
        try {
          // Get 52-week data using PolygonService
          const toDate = new Date().toISOString().split('T')[0];
          const fromDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

          const data = await polygonService.getHistoricalData(opp.symbol, fromDate, toDate);

          if (data?.results && data.results.length > 0) {
            const highs = data.results.map((bar: any) => bar.h);
            const lows = data.results.map((bar: any) => bar.l);
            const currentPrice = data.results[data.results.length - 1].c;

            const fiftyTwoWeekHigh = Math.max(...highs);
            const fiftyTwoWeekLow = Math.min(...lows);

            // Check if within 5% of 52-week high or low
            const distanceFromHigh = ((fiftyTwoWeekHigh - currentPrice) / fiftyTwoWeekHigh) * 100;
            const distanceFromLow = ((currentPrice - fiftyTwoWeekLow) / fiftyTwoWeekLow) * 100;

            let fiftyTwoWeekStatus = null;

            if (distanceFromHigh <= 5) {
              fiftyTwoWeekStatus = '52 High';
            } else if (distanceFromLow <= 5) {
              fiftyTwoWeekStatus = '52 Low';
            }

            return {
              ...opp,
              currentPrice,
              fiftyTwoWeekHigh,
              fiftyTwoWeekLow,
              fiftyTwoWeekStatus
            };
          }

          return opp;
        } catch (error) {
          console.warn(`Error checking 52-week status for ${opp.symbol}:`, error);
          return opp;
        }
      })
    );

    console.log(`✅ 52-week status check complete. Found ${enrichedOpportunities.filter(o => o.fiftyTwoWeekStatus).length} near 52-week extremes`);
    return enrichedOpportunities;
  };

  // Debug state changes
  useEffect(() => {
  }, [opportunities.length, loading, showWebsite, error]);

  const timePeriodOptions = [
    { id: '5Y', name: '5 Years', years: 5, description: 'Recent - Current trends' },
    { id: '10Y', name: '10 Years', years: 10, description: 'Balanced - Market cycles' },
    { id: '15Y', name: '15 Years', years: 15, description: 'Comprehensive - Long patterns' },
    { id: '20Y', name: '20 Years', years: 20, description: 'Maximum depth - Full cycles' }
  ];

  const loadMarketData = async (selectedMarket?: string) => {
    try {
      // Load fresh data directly from SeasonalScreenerService
      console.log('📊 Loading fresh seasonal data...');

      // Import market indices and service
      const { default: SeasonalScreenerService } = await import('@/lib/seasonalScreenerService');
      const { getMarketStocks } = await import('@/lib/marketIndices');
      const seasonalService = new SeasonalScreenerService();

      // Get market-specific stocks
      const market = selectedMarket || activeMarket;
      const marketStocks = getMarketStocks(market);
      console.log(`📊 Scanning ${market}: ${marketStocks.length} stocks`);

      setHasScanned(true);
      setLoading(true);
      setError(null);
      setShowWebsite(false);
      setOpportunities([]);
      setSeasonedMode(false);
      setBestMode(false);
      setStreamStatus(`⚡ Loading real seasonal data from ${market} (${marketStocks.length} stocks)...`);
      setProgressStats({ processed: 0, total: marketStocks.length, found: 0 });

      const selectedPeriod = timePeriodOptions.find(p => p.id === timePeriod);
      const years = selectedPeriod?.years || 15; // FULL years as requested - no limits

      try {
        // Load FULL data using batch processing with real-time results
        setStreamStatus('');

        // Real-time progress callback to show results as they're found
        let lastUpdate = 0;

        const realOpportunities = await seasonalService.screenSeasonalOpportunitiesWithWorkers(
          years,
          marketStocks.length, // Use market-specific count
          50,
          (processed, total, foundOpportunities, currentSymbol) => {
            // Throttle updates to prevent UI overwhelming (update every 100ms max)
            const now = Date.now();
            const shouldUpdate = now - lastUpdate > 100 || foundOpportunities.length > opportunities.length;

            if (shouldUpdate) {
              lastUpdate = now;

              // Update progress stats in real-time
              setProgressStats({
                processed,
                total,
                found: foundOpportunities.length
              });

              // Update status with current processing info
              if (currentSymbol) {
                setStreamStatus(`📊 ${currentSymbol} - Found ${foundOpportunities.length} qualified opportunities (${processed}/${total})`);
              } else {
                setStreamStatus(`📊 ${processed}/${total} processed - ${foundOpportunities.length} opportunities found`);
              }

              // Show opportunities as they're found - REAL-TIME UPDATES
              if (foundOpportunities.length > 0) {
                const sortedOpportunities = foundOpportunities
                  .sort((a, b) => Math.abs(b.averageReturn) - Math.abs(a.averageReturn));

                console.log(` Setting ${foundOpportunities.length} opportunities in state:`, sortedOpportunities.slice(0, 3));
                setOpportunities(sortedOpportunities as unknown as SeasonalPattern[]);

                // DISMISS LOADING SCREEN immediately when first opportunities are found
                if (foundOpportunities.length === 1) {
                  console.log(' First opportunity found! Dismissing loading screen and showing results...');
                  setLoading(false);
                  setShowWebsite(true);
                } else if (foundOpportunities.length > 1 && loading) {
                  console.log(` ${foundOpportunities.length} opportunities found, ensuring loading screen is dismissed`);
                  setLoading(false);
                  setShowWebsite(true);
                }
              }
            }
          }
        );

        if (realOpportunities && realOpportunities.length > 0) {
          console.log(`✅ Completed! Found ${realOpportunities.length} seasonal opportunities`);

          // Check 52-week high/low status for all opportunities to display badges
          setStreamStatus('🔍 Checking 52-week high/low status...');
          const enrichedOpportunities = await check52WeekStatus(realOpportunities);

          // Final sort and display
          const finalSorted = enrichedOpportunities.sort((a, b) => Math.abs(b.averageReturn) - Math.abs(a.averageReturn));
          setOpportunities(finalSorted as unknown as SeasonalPattern[]);
          setLoading(false);
          setStreamStatus('✅ Processing completed!');
          setProgressStats({ processed: 1000, total: 1000, found: enrichedOpportunities.length });
        } else {
          throw new Error('No seasonal opportunities found');
        }
      } catch (error) {
        const errorMsg = `Failed to start seasonal screening: ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.error(` ${errorMsg}`);
        setError(errorMsg);
        setLoading(false);
        setShowWebsite(false);
      }
    } catch (outerError) {
      console.error('Failed to load seasonalScreenerService:', outerError);
      setError(`Failed to initialize screener: ${outerError instanceof Error ? outerError.message : 'Unknown error'}`);
      setLoading(false);
    }
  };

  // Load seasoned multi-timeframe data - scan 5Y, 10Y, 15Y, 20Y and find stocks with 60%+ win rate on 2+ timeframes
  const loadSeasonedData = async (selectedMarket?: string) => {
    try {
      console.log('🌟 Starting SEASONED multi-timeframe scan...');

      const { default: SeasonalScreenerService } = await import('@/lib/seasonalScreenerService');
      const { getMarketStocks } = await import('@/lib/marketIndices');
      const seasonalService = new SeasonalScreenerService();

      const market = selectedMarket || activeMarket;
      const marketStocks = getMarketStocks(market);

      setHasScanned(true);
      setLoading(true);
      setError(null);
      setShowWebsite(false);
      setOpportunities([]);
      setSeasonedMode(true);
      setBestMode(false);
      setStreamStatus(`🌟 SEASONED SCAN: Analyzing ${marketStocks.length} stocks across 4 timeframes (5Y, 10Y, 15Y, 20Y)...`);
      setProgressStats({ processed: 0, total: marketStocks.length * 4, found: 0 });

      const timeframes = [5, 10, 15, 20];
      const stockResults = new Map<string, { symbol: string; qualifyingTimeframes: number[]; patterns: any[] }>();

      // Scan each timeframe
      for (let i = 0; i < timeframes.length; i++) {
        const years = timeframes[i];
        console.log(`📊 Scanning ${years}Y timeframe...`);

        setStreamStatus(`🌟 Scanning ${years}Y timeframe (${i + 1}/4)...`);

        const results = await seasonalService.screenSeasonalOpportunitiesWithWorkers(
          years,
          marketStocks.length,
          50,
          (processed, total, foundOpportunities) => {
            const overallProcessed = (i * marketStocks.length) + processed;
            const overallTotal = marketStocks.length * 4;

            setProgressStats({
              processed: overallProcessed,
              total: overallTotal,
              found: stockResults.size
            });

            setStreamStatus(`🌟 ${years}Y: ${processed}/${total} | Total qualified stocks: ${stockResults.size}`);
          }
        );

        // Process results from this timeframe
        results.forEach((pattern: any) => {
          if (pattern.winRate >= 60) {
            const existing = stockResults.get(pattern.symbol);
            if (existing) {
              existing.qualifyingTimeframes.push(years);
              existing.patterns.push({ ...pattern, timeframe: years }); // Clone and tag with timeframe
            } else {
              stockResults.set(pattern.symbol, {
                symbol: pattern.symbol,
                qualifyingTimeframes: [years],
                patterns: [{ ...pattern, timeframe: years }] // Clone and tag with timeframe
              });
            }
          }
        });
      }

      // Filter stocks that qualify on 2+ timeframes
      const seasonedOpportunities: any[] = [];
      stockResults.forEach((stockData) => {
        if (stockData.qualifyingTimeframes.length >= 2) {
          // Calculate average win rate across all qualifying timeframes
          const avgWinRate = stockData.patterns.reduce((sum, p) => sum + p.winRate, 0) / stockData.patterns.length;
          const avgReturn = stockData.patterns.reduce((sum, p) => sum + (p.avgReturn || p.averageReturn || 0), 0) / stockData.patterns.length;

          // Use the first pattern as base and update with averages
          const basePattern = stockData.patterns[0];

          // Add metadata for color coding
          seasonedOpportunities.push({
            ...basePattern,
            winRate: avgWinRate,
            avgReturn: avgReturn,
            averageReturn: avgReturn,
            qualifyingTimeframes: stockData.qualifyingTimeframes.length,
            timeframeDetails: stockData.qualifyingTimeframes
          });
        }
      });

      console.log(`✅ SEASONED SCAN Complete! Found ${seasonedOpportunities.length} multi-timeframe qualified stocks`);

      if (seasonedOpportunities.length > 0) {
        // Check 52-week status
        setStreamStatus('🔍 Checking 52-week high/low status...');
        const enrichedOpportunities = await check52WeekStatus(seasonedOpportunities);

        // Sort by number of qualifying timeframes, then by win rate
        const sorted = enrichedOpportunities.sort((a: any, b: any) => {
          if (b.qualifyingTimeframes !== a.qualifyingTimeframes) {
            return b.qualifyingTimeframes - a.qualifyingTimeframes;
          }
          return b.winRate - a.winRate;
        });

        setOpportunities(sorted as unknown as SeasonalPattern[]);
        setLoading(false);
        setShowWebsite(true);
        setStreamStatus(`✅ Found ${seasonedOpportunities.length} SEASONED opportunities!`);
      } else {
        setError('No stocks found with 60%+ win rate on 2+ timeframes');
        setLoading(false);
        setShowWebsite(false);
      }

    } catch (error) {
      console.error('SEASONED scan failed:', error);
      setError(`SEASONED scan failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setLoading(false);
      setSeasonedMode(false);
    }
  };

  const handleScreenerStart = (market: string) => {
    console.log(`Starting screener for ${market}`);
    setActiveMarket(market);
    setSeasonedMode(false);
    loadMarketData(market);
  };

  // Load best bullish and bearish for each timeframe - scan 5Y, 10Y, 15Y, 20Y and find best of each
  const loadBestData = async (selectedMarket?: string) => {
    try {
      console.log('🏆 Starting BEST scan - Top bullish & bearish for each timeframe...');

      const { default: SeasonalScreenerService } = await import('@/lib/seasonalScreenerService');
      const { getMarketStocks } = await import('@/lib/marketIndices');
      const seasonalService = new SeasonalScreenerService();

      const market = selectedMarket || activeMarket;
      const marketStocks = getMarketStocks(market);

      setHasScanned(true);
      setLoading(true);
      setError(null);
      setShowWebsite(false);
      setOpportunities([]);
      setSeasonedMode(false);
      setBestMode(true); // Set BEST mode flag
      setStreamStatus(`🏆 BEST SCAN: Analyzing ${marketStocks.length} stocks across 4 timeframes (5Y, 10Y, 15Y, 20Y)...`);
      setProgressStats({ processed: 0, total: marketStocks.length * 4, found: 0 });

      const timeframes = [5, 10, 15, 20];
      const bestResults: any[] = [];

      // Scan each timeframe
      for (let i = 0; i < timeframes.length; i++) {
        const years = timeframes[i];
        console.log(`📊 Scanning ${years}Y timeframe for best trades...`);

        setStreamStatus(`🏆 Scanning ${years}Y timeframe (${i + 1}/4)...`);

        const results = await seasonalService.screenSeasonalOpportunitiesWithWorkers(
          years,
          marketStocks.length,
          50,
          (processed, total, foundOpportunities) => {
            const overallProcessed = (i * marketStocks.length) + processed;
            const overallTotal = marketStocks.length * 4;

            setProgressStats({
              processed: overallProcessed,
              total: overallTotal,
              found: bestResults.length
            });

            setStreamStatus(`🏆 ${years}Y: ${processed}/${total} | Best picks: ${bestResults.length}/8`);
          }
        );

        if (results && results.length > 0) {
          // Filter qualified patterns (win rate 60%+)
          const qualifiedPatterns = results.filter((p: any) => p.winRate >= 60);

          if (qualifiedPatterns.length > 0) {
            // Find best bullish (highest positive return)
            const bullishPatterns = qualifiedPatterns.filter((p: any) => (p.averageReturn || p.avgReturn || 0) >= 0);
            if (bullishPatterns.length > 0) {
              const bestBullish = bullishPatterns.reduce((prev, curr) => {
                const prevReturn = Math.abs(prev.averageReturn || prev.avgReturn || 0);
                const currReturn = Math.abs(curr.averageReturn || curr.avgReturn || 0);
                return currReturn > prevReturn ? curr : prev;
              });
              bestResults.push({
                ...bestBullish,
                timeframe: years,
                timeframeLabel: `${years}Y`
              });
            }

            // Find best bearish (most negative return)
            const bearishPatterns = qualifiedPatterns.filter((p: any) => (p.averageReturn || p.avgReturn || 0) < 0);
            if (bearishPatterns.length > 0) {
              const bestBearish = bearishPatterns.reduce((prev, curr) => {
                const prevReturn = Math.abs(prev.averageReturn || prev.avgReturn || 0);
                const currReturn = Math.abs(curr.averageReturn || curr.avgReturn || 0);
                return currReturn > prevReturn ? curr : prev;
              });
              bestResults.push({
                ...bestBearish,
                timeframe: years,
                timeframeLabel: `${years}Y`
              });
            }
          }
        }
      }

      console.log(`✅ BEST SCAN Complete! Found ${bestResults.length} best picks`);

      if (bestResults.length > 0) {
        // Check 52-week status
        setStreamStatus('🔍 Checking 52-week high/low status...');
        const enrichedOpportunities = await check52WeekStatus(bestResults);

        // Sort: bullish first (by timeframe), then bearish (by timeframe)
        const sorted = enrichedOpportunities.sort((a: any, b: any) => {
          const aReturn = a.averageReturn || a.avgReturn || 0;
          const bReturn = b.averageReturn || b.avgReturn || 0;
          const aIsBullish = aReturn >= 0;
          const bIsBullish = bReturn >= 0;

          // Bullish first
          if (aIsBullish && !bIsBullish) return -1;
          if (!aIsBullish && bIsBullish) return 1;

          // Within same type, sort by timeframe
          return a.timeframe - b.timeframe;
        });

        setOpportunities(sorted as unknown as SeasonalPattern[]);
        setLoading(false);
        setShowWebsite(true);
        setStreamStatus(`✅ Found ${bestResults.length} BEST picks!`);
      } else {
        setError('No qualified patterns found (60%+ win rate required)');
        setLoading(false);
        setShowWebsite(false);
      }

    } catch (error) {
      console.error('BEST scan failed:', error);
      setError(`BEST scan failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setLoading(false);
      setSeasonedMode(false);
    }
  };

  const handleSeasonedScan = (market: string) => {
    console.log(`Starting SEASONED scan for ${market}`);
    setActiveMarket(market);
    loadSeasonedData(market);
  };

  const handleBestScan = (market: string) => {
    console.log(`Starting BEST scan for ${market}`);
    setActiveMarket(market);
    loadBestData(market);
  };

  const handleTabChange = (tabId: string) => {
    setActiveMarket(tabId);
  };



  if (loading && !showWebsite) {
    return (
      <div className="seasonax-loading">
        <div className="loading-spinner"></div>
        <p>Starting seasonal screener...</p>
        <p>{streamStatus}</p>
        {progressStats.processed > 0 && (
          <div className="progress-info">
            <p> Processed: {progressStats.processed} | Found: {progressStats.found} opportunities</p>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${(progressStats.processed / progressStats.total) * 100}%` }}
              ></div>
            </div>
          </div>
        )}
      </div>
    );
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
    );
  }

  return (
    <div className="seasonax-container" style={{ marginTop: '-20px' }}>
      {/* Hide scrollbars CSS */}
      <style>
        {`
 .results-grid-split::-webkit-scrollbar {
 display: none;
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
        onBestScan={handleBestScan}
      />

      {/* Results Grid */}
      <div className="pro-results">
        {!hasScanned ? (
          <div className="pro-empty-state"></div>
        ) : displayedOpportunities.length > 0 ? (
          <div className="split-results-container" style={{
            border: '3px solid #FFD700',
            borderRadius: '12px',
            height: '80vh',
            overflow: 'hidden',
            boxShadow: '0 4px 20px rgba(255, 215, 0, 0.3)',
            display: 'flex',
            marginTop: sidebarMode ? '20px' : '0'
          }}>
            {(() => {
              // SEASONED MODE - Split by bullish/bearish like regular mode
              if (seasonedMode) {
                const bullishOpps = displayedOpportunities.filter(opp => (opp.averageReturn || opp.avgReturn || 0) >= 0);
                const bearishOpps = displayedOpportunities.filter(opp => (opp.averageReturn || opp.avgReturn || 0) < 0);

                return (
                  <>
                    {/* Left Column - Bullish Seasoned */}
                    <div className="seasoned-section" style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
                      <div className="section-header-split seasoned-header">
                        <div className="section-title">
                          <BullIcon size={48} />
                          BULLISH SEASONED
                          <span className="count">({bullishOpps.length})</span>
                        </div>
                      </div>
                      <div className="results-grid-split" style={{
                        overflowY: 'auto',
                        overflowX: 'hidden',
                        height: 'calc(80vh - 70px)',
                        paddingRight: '8px',
                        scrollbarWidth: 'none',
                        msOverflowStyle: 'none',
                        WebkitOverflowScrolling: 'touch'
                      } as React.CSSProperties & { scrollbarWidth?: string; msOverflowStyle?: string; WebkitOverflowScrolling?: string }}>
                        {bullishOpps.map((opportunity, index) => {
                          const qualifyingCount = (opportunity as any).qualifyingTimeframes || 0;
                          const timeframeYears = (opportunity as any).timeframe || (opportunity as any).years || 15;
                          return (
                            <OpportunityCard
                              key={`seasoned-bullish-${opportunity.symbol}-${index}`}
                              pattern={opportunity}
                              rank={index + 1}
                              isTopBullish={false}
                              isTopBearish={false}
                              sidebarMode={sidebarMode}
                              seasonedQualifying={qualifyingCount}
                              years={timeframeYears}
                              hideBestBadge={bestMode}
                            />
                          );
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
                    <div className="seasoned-section" style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
                      <div className="section-header-split seasoned-header">
                        <div className="section-title">
                          <BearIcon size={48} />
                          BEARISH SEASONED
                          <span className="count">({bearishOpps.length})</span>
                        </div>
                      </div>
                      <div className="results-grid-split" style={{
                        overflowY: 'auto',
                        overflowX: 'hidden',
                        height: 'calc(80vh - 70px)',
                        paddingRight: '8px',
                        scrollbarWidth: 'none',
                        msOverflowStyle: 'none',
                        WebkitOverflowScrolling: 'touch'
                      } as React.CSSProperties & { scrollbarWidth?: string; msOverflowStyle?: string; WebkitOverflowScrolling?: string }}>
                        {bearishOpps.map((opportunity, index) => {
                          const qualifyingCount = (opportunity as any).qualifyingTimeframes || 0;
                          const timeframeYears = (opportunity as any).timeframe || (opportunity as any).years || 15;
                          return (
                            <OpportunityCard
                              key={`seasoned-bearish-${opportunity.symbol}-${index}`}
                              pattern={opportunity}
                              rank={index + 1}
                              isTopBullish={false}
                              isTopBearish={false}
                              sidebarMode={sidebarMode}
                              seasonedQualifying={qualifyingCount}
                              years={timeframeYears}
                              hideBestBadge={bestMode}
                            />
                          );
                        })}
                      </div>
                    </div>
                  </>
                );
              }

              // REGULAR MODE - Bullish/Bearish split
              const bullishOpps = displayedOpportunities.filter(opp => (opp.averageReturn || opp.avgReturn || 0) >= 0);
              const bearishOpps = displayedOpportunities.filter(opp => (opp.averageReturn || opp.avgReturn || 0) < 0);

              const topBullish = bullishOpps.length > 0 ?
                bullishOpps.reduce((prev, curr) => {
                  const prevScore = (prev.winRate + ((prev as any).correlation || 0)) / 2;
                  const currScore = (curr.winRate + ((curr as any).correlation || 0)) / 2;
                  return currScore > prevScore ? curr : prev;
                }) : null;

              const topBearish = bearishOpps.length > 0 ?
                bearishOpps.reduce((prev, curr) => {
                  const prevScore = (prev.winRate + ((prev as any).correlation || 0)) / 2;
                  const currScore = (curr.winRate + ((curr as any).correlation || 0)) / 2;
                  return currScore > prevScore ? curr : prev;
                }) : null;

              return (
                <>
                  {/* Bullish Section - Left Side */}
                  <div className="bullish-section" style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
                    <div className="section-header-split bullish-header">
                      <div className="section-title">
                        <span className="bull-icon"></span>
                        BULLISH OPPORTUNITIES
                        <span className="count">({bullishOpps.length})</span>
                      </div>
                    </div>
                    <div className="results-grid-split" style={{
                      overflowY: 'auto',
                      overflowX: 'hidden',
                      height: 'calc(80vh - 70px)',
                      paddingRight: '8px',
                      scrollbarWidth: 'none',
                      msOverflowStyle: 'none',
                      WebkitOverflowScrolling: 'touch'
                    } as React.CSSProperties & { scrollbarWidth?: string; msOverflowStyle?: string; WebkitOverflowScrolling?: string }}>
                      {bullishOpps.map((opportunity, index) => {
                        const isTopBullish = topBullish ? opportunity.symbol === topBullish.symbol : false;
                        const timeframeYears = (opportunity as any).timeframe || (opportunity as any).years || 15;
                        return (
                          <OpportunityCard
                            key={`bullish-${opportunity.symbol}-${index}`}
                            pattern={opportunity}
                            rank={index + 1}
                            isTopBullish={isTopBullish}
                            isTopBearish={false}
                            sidebarMode={sidebarMode}
                            hideBestBadge={bestMode}
                            years={timeframeYears}
                          />
                        );
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
                  <div className="bearish-section" style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
                    <div className="section-header-split bearish-header">
                      <div className="section-title">
                        <span className="bear-icon">🩸</span>
                        BEARISH OPPORTUNITIES
                        <span className="count">({bearishOpps.length})</span>
                      </div>
                    </div>
                    <div className="results-grid-split" style={{
                      overflowY: 'auto',
                      overflowX: 'hidden',
                      height: 'calc(80vh - 70px)',
                      paddingRight: '8px',
                      scrollbarWidth: 'none',
                      msOverflowStyle: 'none',
                      WebkitOverflowScrolling: 'touch'
                    } as React.CSSProperties & { scrollbarWidth?: string; msOverflowStyle?: string; WebkitOverflowScrolling?: string }}>
                      {bearishOpps.map((opportunity, index) => {
                        const isTopBearish = topBearish ? opportunity.symbol === topBearish.symbol : false;
                        const timeframeYears = (opportunity as any).timeframe || (opportunity as any).years || 15;
                        return (
                          <OpportunityCard
                            key={`bearish-${opportunity.symbol}-${index}`}
                            pattern={opportunity}
                            rank={index + 1}
                            isTopBullish={false}
                            isTopBearish={isTopBearish}
                            hideBestBadge={bestMode}
                            sidebarMode={sidebarMode}
                            years={timeframeYears}
                          />
                        );
                      })}
                    </div>
                  </div>
                </>
              );
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
  );
};

export default SeasonaxLanding;
