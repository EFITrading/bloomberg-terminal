'use client';

import React, { useState } from 'react';

interface HeroSectionProps {
  onScreenerStart?: (market: string) => void;
  onStartScreener?: () => void;
}

const HeroSection: React.FC<HeroSectionProps> = ({ onScreenerStart, onStartScreener }) => {
  const [selectedMarket, setSelectedMarket] = useState('S&P 500');

  const markets = [
    'S&P 500',
    'NASDAQ 100',
    'DOW JONES',
    'RUSSELL 2000'
  ];

  const handleStartScreener = () => {
    if (onStartScreener) {
      onStartScreener();
    } else if (onScreenerStart) {
      onScreenerStart(selectedMarket);
    }
  };

  return (
    <div className="seasonax-hero">
      <div className="hero-background">
        <div className="hero-geometric-pattern"></div>
      </div>
      
      <div className="hero-content">
        <h1 className="hero-title">Seasonality Screener</h1>
        <p className="hero-subtitle">
          Find the best trading opportunity on a daily basis with one click!
        </p>
        
        <div className="hero-additional-content">
          <p className="hero-description">
            Discover seasonal patterns and market opportunities with advanced analytics
          </p>
        </div>
        
        <div className="hero-controls">
          <div className="market-selector">
            <select 
              value={selectedMarket}
              onChange={(e) => setSelectedMarket(e.target.value)}
              className="market-dropdown"
            >
              {markets.map((market) => (
                <option key={market} value={market}>
                  {market}
                </option>
              ))}
            </select>
          </div>
          
          <button 
            className="start-screener-btn"
            onClick={handleStartScreener}
          >
            SEASONAL CHART <span className="btn-arrow">›</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default HeroSection;
