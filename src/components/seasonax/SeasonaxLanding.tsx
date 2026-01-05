'use client';

import React, { useState, useEffect, useRef } from 'react';
import PolygonService, { SeasonalPattern } from '@/lib/polygonService';
import GlobalDataCache from '@/lib/GlobalDataCache';
import HeroSection from './HeroSection';
import MarketTabs from './MarketTabs';
import OpportunityCard from './OpportunityCard';


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

  const handleScreenerStart = (market: string) => {
    console.log(`Starting screener for ${market}`);
    setActiveMarket(market);
    loadMarketData(market);
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
              // Split opportunities into bullish and bearish
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
                        return (
                          <OpportunityCard
                            key={`bullish-${opportunity.symbol}-${index}`}
                            pattern={opportunity}
                            rank={index + 1}
                            isTopBullish={isTopBullish}
                            isTopBearish={false}
                            sidebarMode={sidebarMode}
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
                        return (
                          <OpportunityCard
                            key={`bearish-${opportunity.symbol}-${index}`}
                            pattern={opportunity}
                            rank={index + 1}
                            isTopBullish={false}
                            isTopBearish={isTopBearish}
                            sidebarMode={sidebarMode}
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
