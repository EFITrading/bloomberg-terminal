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
 <div className="pro-hero">
 <div className="hero-container">
 <div className="hero-header">
 <h1 className="hero-title">SEASONAL PATTERNS</h1>
 <div className="hero-subtitle">Real-Time Market Intelligence</div>
 </div>
 
 <div className="hero-controls">
 <select 
 value={selectedMarket}
 onChange={(e) => setSelectedMarket(e.target.value)}
 className="pro-market-select"
 >
 {markets.map((market) => (
 <option key={market} value={market}>
 {market}
 </option>
 ))}
 </select>
 
 <button 
 className="pro-scan-btn"
 onClick={handleStartScreener}
 >
 START SCAN
 </button>
 </div>
 </div>
 </div>
 );
};

export default HeroSection;
