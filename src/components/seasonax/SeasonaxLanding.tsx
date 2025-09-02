'use client';

import React, { useState, useEffect } from 'react';
import PolygonService, { SeasonalPattern } from '@/lib/polygonService';
import HeroSection from './HeroSection';
import MarketTabs from './MarketTabs';
import OpportunityCard from './OpportunityCard';

interface SeasonaxLandingProps {
  onStartScreener?: () => void;
  onSectorsClick?: () => void;
}

const SeasonaxLanding: React.FC<SeasonaxLandingProps> = ({ onStartScreener, onSectorsClick }) => {
  const [activeMarket, setActiveMarket] = useState('SP500');
  const [timePeriod, setTimePeriod] = useState('5Y');
  const [opportunities, setOpportunities] = useState<SeasonalPattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const marketTabs = [
    { id: 'SP500', name: 'S&P 500' },
    { id: 'NASDAQ100', name: 'NASDAQ 100' },
    { id: 'DOWJONES', name: 'Dow Jones' }
  ];

  const timePeriodOptions = [
    { id: '5Y', name: '5 Years', years: 5, description: 'Fast analysis - Recent trends' },
    { id: '10Y', name: '10 Years', years: 10, description: 'Balanced - Market cycles' },
    { id: '15Y', name: '15 Years', years: 15, description: 'Comprehensive - Long patterns' },
    { id: '20Y', name: '20 Years', years: 20, description: 'Maximum depth - Full cycles' }
  ];

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    loadMarketData();
  }, [activeMarket, timePeriod]); // Reload when market or time period changes

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('🔄 Starting real seasonal pattern analysis...');
      
      // Load market data
      console.log('📈 Starting market data analysis...');
      await loadMarketData();
      
    } catch (error) {
      console.error('❌ Failed to load initial data:', error);
      setError(error instanceof Error ? error.message : 'Failed to load seasonal data');
    } finally {
      setLoading(false);
      console.log('🏁 Data loading complete');
    }
  };

  const loadMarketData = async () => {
    try {
      setLoading(true);
      setError(null);
      const selectedPeriod = timePeriodOptions.find(p => p.id === timePeriod);
      console.log(`🚀 Starting ETF analysis for ${activeMarket} using ${selectedPeriod?.name} (${selectedPeriod?.years} years)...`);
      
      // Use Polygon service for ETF-based market analysis
      const polygonService = new PolygonService();
      const marketPatterns = await polygonService.getMarketPatterns(activeMarket, selectedPeriod?.years || 5);
      
      setOpportunities(marketPatterns);
      console.log(`🎯 ✅ ETF analysis complete! Found ${marketPatterns.length} valid patterns for ${activeMarket} using ${selectedPeriod?.name}`);
      console.log(`📊 Displaying top seasonal opportunities from ETF market analysis`);
      
      console.log('🔥 TOP PERFORMERS:');
      marketPatterns.slice(0, 10).forEach((pattern, idx) => {
        console.log(`  ${idx + 1}. ${pattern.symbol}: ${pattern.averageReturn.toFixed(2)}% (${pattern.winRate.toFixed(1)}% win rate)`);
      });
      
    } catch (error) {
      const errorMsg = `Failed to load ${activeMarket} data: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error(`❌ ${errorMsg}`);
      setError(errorMsg);
    } finally {
      setLoading(false);
      console.log(`🏁 ETF market data loading complete for ${activeMarket} (${timePeriod})`);
    }
  };

  const handleScreenerStart = (market: string) => {
    console.log(`Starting screener for ${market}`);
    if (onStartScreener) {
      onStartScreener();
    }
  };

  const handleTabChange = (tabId: string) => {
    setActiveMarket(tabId);
  };

  if (loading) {
    return (
      <div className="seasonax-loading">
        <div className="loading-spinner"></div>
        <p>Loading real-time seasonal patterns from Polygon API...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="seasonax-error">
        <div className="error-icon">⚠️</div>
        <h2>API Connection Error</h2>
        <p>{error}</p>
        <button onClick={loadData} className="retry-button">
          Retry API Connection
        </button>
      </div>
    );
  }

  return (
    <div className="seasonax-container">

      {/* Hero Section */}
      <HeroSection 
        onScreenerStart={handleScreenerStart} 
        onStartScreener={onStartScreener}
        onSectorsClick={onSectorsClick}
      />

      {/* Market Tabs */}
      <MarketTabs 
        tabs={marketTabs} 
        activeTab={activeMarket} 
        onTabChange={handleTabChange}
        loading={loading}
      />

      {/* Time Period Dropdown */}
      <section className="time-period-section">
        <div className="time-period-dropdown-container">
          <label htmlFor="time-period-select" className="dropdown-label">
            Historical Analysis Period:
          </label>
          <select
            id="time-period-select"
            value={timePeriod}
            onChange={(e) => setTimePeriod(e.target.value)}
            className="time-period-dropdown"
            disabled={loading}
          >
            {timePeriodOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name} - {option.description}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* Top 10 Opportunities Grid */}
      <section className="opportunities-section">
        <div className="section-header">
          <h2>Top Seasonal ETF Opportunities</h2>
          <p>Real seasonal analysis for September 2025 - {activeMarket.replace(/([A-Z])/g, ' $1').trim()} ETFs</p>
        </div>
        
        {loading ? (
          <div className="loading-message">
            <p>Analyzing {activeMarket === 'SP500' ? 'S&P 500' : activeMarket === 'NASDAQ100' ? 'NASDAQ 100' : 'Dow Jones'} ETFs using {timePeriod} of historical data...</p>
            <p>Processing ETF market coverage with Polygon API to find top seasonal opportunities.</p>
            <p>Using {timePeriodOptions.find(p => p.id === timePeriod)?.description || 'selected analysis period'} for comprehensive seasonal analysis.</p>
          </div>
        ) : error ? (
          <div className="error-message">
            <h3>Error Loading Data</h3>
            <p>{error}</p>
            <p>Please check your Polygon API key and rate limits.</p>
          </div>
        ) : opportunities.length === 0 ? (
          <div className="no-data-message">
            <h3>No Seasonal Patterns Found</h3>
            <p>Unable to load seasonal data. This could be due to:</p>
            <ul>
              <li>API rate limits or connectivity issues</li>
              <li>Insufficient historical data for analysis</li>
              <li>Weekend/holiday market closure</li>
            </ul>
            <button onClick={() => window.location.reload()} className="retry-button">
              Retry Loading Data
            </button>
          </div>
        ) : (
          <div className="opportunities-grid top-10">
            {opportunities.slice(0, 10).map((opportunity, index) => (
              <OpportunityCard
                key={`${opportunity.symbol}-${index}`}
                pattern={opportunity}
                rank={index + 1}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default SeasonaxLanding;
