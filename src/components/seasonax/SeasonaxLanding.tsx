'use client';

import React, { useState, useEffect } from 'react';
import PolygonService, { SeasonalPattern } from '@/lib/polygonService';
import HeroSection from './HeroSection';
import MarketTabs from './MarketTabs';
import OpportunityCard from './OpportunityCard';
import FeaturedPatterns from './FeaturedPatterns';

interface SeasonaxLandingProps {
  onStartScreener?: () => void;
}

const SeasonaxLanding: React.FC<SeasonaxLandingProps> = ({ onStartScreener }) => {
  const [activeMarket, setActiveMarket] = useState('SP500');
  const [opportunities, setOpportunities] = useState<SeasonalPattern[]>([]);
  const [featuredPatterns, setFeaturedPatterns] = useState<SeasonalPattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  const polygonService = new PolygonService();

  const marketTabs = [
    { id: 'SP500', name: 'S&P 500' },
    { id: 'NASDAQ100', name: 'NASDAQ 100' },
    { id: 'DOWJONES', name: 'Dow Jones' }
  ];

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    loadMarketData();
  }, [activeMarket]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Load real data from Polygon API
      const featured = await polygonService.getFeaturedPatterns();
      const marketData = await polygonService.getMarketPatterns('SP500');
      
      if (featured.length === 0 || marketData.length === 0) {
        throw new Error('No data returned from Polygon API - check your API key and rate limits');
      }
      
      setFeaturedPatterns(featured);
      setOpportunities(marketData);
      
    } catch (error) {
      console.error('Failed to load data from Polygon API:', error);
      setError(error instanceof Error ? error.message : 'Failed to load data from Polygon API');
    } finally {
      setLoading(false);
    }
  };

  const loadMarketData = async () => {
    if (activeMarket === 'SP500') return; // Already loaded in initial load
    
    try {
      setLoading(true);
      setError(null);
      console.log(`Loading data for market: ${activeMarket}`);
      
      const marketData = await polygonService.getMarketPatterns(activeMarket);
      
      if (marketData.length === 0) {
        throw new Error(`No seasonal patterns found for ${activeMarket} from Polygon API`);
      }
      
      setOpportunities(marketData);
      console.log(`Loaded ${marketData.length} patterns for ${activeMarket}`);
      
    } catch (error) {
      console.error(`Failed to load ${activeMarket} data:`, error);
      setError(`Failed to load ${activeMarket} data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleScreenerStart = (market: string) => {
    console.log(`Starting screener for ${market}`);
    alert(`Starting screener for ${market} - This would navigate to the screener page`);
  };

  const handleTabChange = (tabId: string) => {
    setActiveMarket(tabId);
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    // Implement search functionality
    console.log('Searching for:', query);
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
      {/* Header */}
      <header className="seasonax-header">
        <div className="header-content">
          <div className="seasonax-logo">
            <span className="logo-text">seasonax</span>
          </div>
          
          <nav className="header-nav">
            <button className="nav-item dropdown">
              Popular Instruments <span className="dropdown-arrow">▼</span>
            </button>
            <button className="nav-item active">Screener</button>
          </nav>
        </div>
        
        <div className="header-search">
          <input
            type="text"
            placeholder="Search instruments (stocks, indices, currencies, commodities and more)..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="search-input"
          />
        </div>
      </header>

      {/* Real Data Indicator */}
      <div className="data-source-banner real-data">
        <span>📊 Live data from Polygon.io API - Real-time seasonal analysis</span>
      </div>

      {/* Hero Section */}
      <HeroSection 
        onScreenerStart={handleScreenerStart} 
        onStartScreener={onStartScreener}
      />

      {/* Market Tabs */}
      <MarketTabs
        tabs={marketTabs}
        activeTab={activeMarket}
        onTabChange={handleTabChange}
      />

      {/* Opportunities Grid */}
      <section className="opportunities-section">
        <div className="opportunities-grid">
          {opportunities.slice(0, 3).map((opportunity, index) => (
            <OpportunityCard
              key={`${opportunity.symbol}-${index}`}
              pattern={opportunity}
            />
          ))}
        </div>
      </section>

      {/* Featured Patterns */}
      <FeaturedPatterns patterns={featuredPatterns} />
    </div>
  );
};

export default SeasonaxLanding;
