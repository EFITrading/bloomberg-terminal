'use client';

import React, { useState, useEffect } from 'react';
import PolygonService, { SeasonalPattern } from '@/lib/polygonService';
import HeroSection from './HeroSection';
import MarketTabs from './MarketTabs';
import OpportunityCard from './OpportunityCard';

interface SeasonaxLandingProps {
  onStartScreener?: () => void;
}

const SeasonaxLanding: React.FC<SeasonaxLandingProps> = ({ onStartScreener }) => {
  const [activeMarket, setActiveMarket] = useState('SP500');
  const [timePeriod, setTimePeriod] = useState('15Y'); // Changed default from 5Y to 15Y
  const [opportunities, setOpportunities] = useState<SeasonalPattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [streamStatus, setStreamStatus] = useState<string>('');
  const [showWebsite, setShowWebsite] = useState(false);
  const [progressStats, setProgressStats] = useState({ processed: 0, total: 500, found: 0 });
  const [eventSource, setEventSource] = useState<EventSource | null>(null);

  const marketTabs = [
    { id: 'SP500', name: 'S&P 500' },
    { id: 'NASDAQ100', name: 'NASDAQ 100' },
    { id: 'DOWJONES', name: 'Dow Jones' }
  ];

  const timePeriodOptions = [
    { id: '10Y', name: '10 Years', years: 10, description: 'Balanced - Market cycles' },
    { id: '15Y', name: '15 Years', years: 15, description: 'Comprehensive - Long patterns' },
    { id: '20Y', name: '20 Years', years: 20, description: 'Maximum depth - Full cycles' }
  ];

  useEffect(() => {
    loadMarketData();
  }, [timePeriod]); // Only reload when time period changes

  // Cleanup EventSource on component unmount
  useEffect(() => {
    return () => {
      if (eventSource) {
        console.log('🔌 Cleaning up EventSource on component unmount...');
        eventSource.close();
      }
    };
  }, [eventSource]);

  const loadMarketData = async () => {
    try {
      // Close any existing EventSource connection
      if (eventSource) {
        console.log('🔌 Closing existing EventSource connection...');
        eventSource.close();
        setEventSource(null);
      }
      
      setLoading(true);
      setError(null);
      setShowWebsite(false);
      setOpportunities([]);
      setStreamStatus('');
      setProgressStats({ processed: 0, total: 500, found: 0 });
      
      const selectedPeriod = timePeriodOptions.find(p => p.id === timePeriod);
      console.log(`🚀 Starting streaming seasonal screening for top 500 stocks using ${selectedPeriod?.name} (${selectedPeriod?.years} years)...`);
      
      // Use streaming API for progressive loading
      const newEventSource = new EventSource(`/api/patterns/stream?years=${selectedPeriod?.years || 15}`);
      setEventSource(newEventSource);
      
      newEventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          switch (data.type) {
            case 'status':
              setStreamStatus(data.message);
              if (data.processed !== undefined) {
                setProgressStats({ processed: data.processed, total: data.total, found: data.found });
              }
              console.log(`📊 ${data.message}`);
              break;
              
            case 'opportunity':
              // Add new opportunity to the list (check for duplicates)
              setOpportunities(prev => {
                // Check if this symbol already exists
                const exists = prev.some(existing => existing.symbol === data.data.symbol);
                if (exists) {
                  console.log(`⚠️ Duplicate ${data.data.symbol} ignored`);
                  return prev; // Don't add duplicate
                }
                
                const newOpportunities = [...prev, data.data];
                // Sort by average return (best opportunities first)
                return newOpportunities.sort((a, b) => Math.abs(b.averageReturn) - Math.abs(a.averageReturn));
              });
              setProgressStats(data.stats);
              console.log(`🎯 Found ${data.data.symbol}: ${data.data.averageReturn.toFixed(2)}% (${data.stats.found} total found)`);
              break;
              
            case 'show_website':
              setShowWebsite(true);
              setLoading(false);
              setStreamStatus(data.message);
              setProgressStats({ processed: data.processed, total: data.total, found: data.found });
              console.log(`🚀 ${data.message}`);
              break;
              
            case 'batch_complete':
              setStreamStatus(data.message);
              setProgressStats({ processed: data.processed, total: data.total, found: data.found });
              console.log(`✅ ${data.message}`);
              break;
              
            case 'complete':
              setStreamStatus(data.message);
              setProgressStats({ processed: data.processed, total: data.total, found: data.found });
              setLoading(false);
              console.log(`🎯 ${data.message}`);
              newEventSource.close();
              setEventSource(null);
              break;
              
            case 'error':
              setError(data.message);
              setLoading(false);
              console.error(`❌ ${data.message}`);
              newEventSource.close();
              setEventSource(null);
              break;
          }
        } catch (parseError) {
          console.error('Failed to parse stream data:', parseError);
        }
      };
      
      newEventSource.onerror = (event) => {
        console.error('Stream error:', event);
        setError('Connection to streaming API lost');
        setLoading(false);
        newEventSource.close();
        setEventSource(null);
      };
      
    } catch (error) {
      const errorMsg = `Failed to start seasonal screening: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error(`❌ ${errorMsg}`);
      setError(errorMsg);
      setLoading(false);
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

  if (loading && !showWebsite) {
    return (
      <div className="seasonax-loading">
        <div className="loading-spinner"></div>
        <p>Starting progressive seasonal screening...</p>
        <p>{streamStatus}</p>
        {progressStats.processed > 0 && (
          <div className="progress-info">
            <p>📊 Processed: {progressStats.processed} | Found: {progressStats.found} opportunities</p>
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
        <div className="error-icon">⚠️</div>
        <h2>API Connection Error</h2>
        <p>{error}</p>
        <button onClick={loadMarketData} className="retry-button">
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

      {/* Live Seasonal Opportunities Grid */}
      <section className="opportunities-section">
        <div className="section-header">
          <h2>Live Seasonal Stock Screening ({opportunities.length})</h2>
          <p>Progressive analysis - Opportunities appear as they're discovered from top 500 companies by market cap</p>
          {streamStatus && (
            <div className="stream-status">
              <p className="status-message">{streamStatus}</p>
              <div className="progress-stats">
                <span>📊 Scanned: {progressStats.processed}/{progressStats.total}</span>
                <span>🎯 Found: {progressStats.found} opportunities</span>
              </div>
              {progressStats.processed < progressStats.total && (
                <div className="progress-bar">
                  <div 
                    className="progress-fill" 
                    style={{ width: `${(progressStats.processed / progressStats.total) * 100}%` }}
                  ></div>
                </div>
              )}
            </div>
          )}
        </div>
        
        {error ? (
          <div className="error-message">
            <h3>Error Loading Data</h3>
            <p>{error}</p>
            <p>Please check your Polygon API key and rate limits.</p>
          </div>
        ) : opportunities.length === 0 && showWebsite ? (
          <div className="no-data-message">
            <h3>Scanning for Seasonal Patterns...</h3>
            <p>The system is progressively scanning stocks. Opportunities will appear here as they're found.</p>
          </div>
        ) : (
          <div className="opportunities-grid top-10">
            {opportunities.map((opportunity, index) => (
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
