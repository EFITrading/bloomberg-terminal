'use client';

import React, { useState } from 'react';

interface HeroSectionProps {
 onScreenerStart?: (market: string) => void;
}

const HeroSection: React.FC<HeroSectionProps> = ({ onScreenerStart }) => {
 const [selectedMarket, setSelectedMarket] = useState('S&P 500');

 const markets = [
 'S&P 500',
 'NASDAQ 100',
 'DOW JONES',
 'RUSSELL 2000'
 ];

 const handleStartScreener = () => {
 if (onScreenerStart) {
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
 
 <button 
 onClick={() => {
 // TODO: Add election picks functionality
 console.log('Election Picks clicked');
 }}
 style={{
 backgroundColor: '#000000',
 color: '#ff6600',
 border: '1px solid #ff6600',
 padding: '12px 24px',
 fontSize: '14px',
 fontWeight: '600',
 borderRadius: '4px',
 cursor: 'pointer',
 transition: 'all 0.3s ease',
 marginLeft: '12px',
 outline: 'none',
 textDecoration: 'none'
 }}
 onMouseEnter={(e) => {
 e.currentTarget.style.backgroundColor = '#ff6600';
 e.currentTarget.style.color = '#000000';
 }}
 onMouseLeave={(e) => {
 e.currentTarget.style.backgroundColor = '#000000';
 e.currentTarget.style.color = '#ff6600';
 }}
 >
 ELECTION PICKS
 </button>
 </div>
 </div>
 </div>
 );
};

export default HeroSection;
