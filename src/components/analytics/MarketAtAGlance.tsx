'use client';

import React, { useState, useEffect } from 'react';
import { AlmanacService, MarketGlanceData } from '../../lib/almanacService';

interface MarketAtAGlanceProps {
  onRefresh?: () => void;
}

const MarketAtAGlance: React.FC<MarketAtAGlanceProps> = ({ onRefresh }) => {
  const [data, setData] = useState<MarketGlanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const almanacService = new AlmanacService();
  
  useEffect(() => {
    loadData();
  }, []);
  
  const loadData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const glanceData = await almanacService.getMarketAtAGlance();
      setData(glanceData);
    } catch (err) {
      setError('Failed to load market data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };
  
  const getOutlookClass = (outlook: string): string => {
    switch (outlook) {
      case 'Bullish':
        return 'outlook-bullish';
      case 'Bearish':
        return 'outlook-bearish';
      case 'Neutral':
        return 'outlook-neutral';
      default:
        return '';
    }
  };
  
  if (loading) {
    return (
      <div className="market-at-a-glance loading">
        <div className="loading-spinner"></div>
        <p>Loading market data...</p>
      </div>
    );
  }
  
  if (error || !data) {
    return (
      <div className="market-at-a-glance error">
        <p>{error || 'No data available'}</p>
        <button onClick={loadData}>Retry</button>
      </div>
    );
  }
  
  // Get current month name
  const currentMonth = new Date().toLocaleDateString('en-US', { month: 'long' });
  
  return (
    <div className="market-at-a-glance">
      <div className="glance-header">
        <h1 className="glance-title">Market at a Glance</h1>
        <button className="refresh-btn" onClick={loadData}>
          Refresh
        </button>
      </div>
      
      {/* Current Index Prices - REAL DATA from Polygon */}
      <div className="index-prices-section">
        <div className="as-of-date">{data.asOfDate}:</div>
        <div className="index-prices">
          {data.indices.map(index => (
            <span key={index.symbol} className="index-price">
              <span className="index-name">{index.name}</span>
              <span className="index-value">{index.price.toFixed(2)}</span>
              {index.change !== 0 && (
                <span className={`index-change ${index.change >= 0 ? 'positive' : 'negative'}`}>
                  {index.change >= 0 ? '+' : ''}{index.change.toFixed(2)} ({index.changePercent.toFixed(2)}%)
                </span>
              )}
            </span>
          ))}
        </div>
      </div>
      
      {/* Seasonal Analysis - CALCULATED from real historical data */}
      <div className="analysis-sections">
        <div className="analysis-section seasonal-highlight">
          <div className="section-header">
            <span className="section-title">{currentMonth} Seasonal Outlook:</span>
            <span className={`section-outlook ${getOutlookClass(data.seasonal.outlook)}`}>
              {data.seasonal.outlook}
            </span>
          </div>
          <div className="seasonal-stats">
            <div className="stat-item">
              <span className="stat-label">Historical Win Rate:</span>
              <span className={`stat-value ${data.seasonal.winRate >= 60 ? 'positive' : data.seasonal.winRate <= 40 ? 'negative' : ''}`}>
                {data.seasonal.winRate.toFixed(1)}%
              </span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Average Return:</span>
              <span className={`stat-value ${data.seasonal.avgReturn >= 0 ? 'positive' : 'negative'}`}>
                {data.seasonal.avgReturn >= 0 ? '+' : ''}{data.seasonal.avgReturn.toFixed(2)}%
              </span>
            </div>
          </div>
          <p className="section-content">
            Based on 21 years of historical SPY data for {currentMonth}.
          </p>
        </div>
      </div>
    </div>
  );
};

export default MarketAtAGlance;
