"use client";

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import '../mobile-trading.css';

// Dynamically import EFICharting to avoid SSR issues
const TradingViewChart = dynamic(
 () => import('../../components/trading/EFICharting'),
 { ssr: false }
);

export default function MarketPage() {
 const [selectedSymbol, setSelectedSymbol] = useState('SPY');
 const [selectedTimeframe, setSelectedTimeframe] = useState('1d');
 const [chartHeight, setChartHeight] = useState(800);

 useEffect(() => {
 // Disable scrolling on this page
 document.body.style.overflow = 'hidden';
 document.documentElement.style.overflow = 'hidden';
 
 const updateHeight = () => {
 const isMobile = window.innerWidth <= 768;
 const navHeight = isMobile ? 80 : 120;
 const calculatedHeight = window.innerHeight - navHeight;
 setChartHeight(Math.max(400, calculatedHeight));
 };

 updateHeight();
 window.addEventListener('resize', updateHeight);
 
 return () => {
 window.removeEventListener('resize', updateHeight);
 document.body.style.overflow = '';
 document.documentElement.style.overflow = '';
 };
 }, []);

 const handleSymbolChange = (symbol: string) => {
 setSelectedSymbol(symbol);
 };

 const handleTimeframeChange = (timeframe: string) => {
 setSelectedTimeframe(timeframe);
 };

 return (
 <div className="market-overview-container h-screen bg-[#0a0a0a] text-white overflow-hidden fixed inset-0" style={{ paddingTop: '120px' }}>
 <div className="w-full h-full">
 <TradingViewChart
 symbol={selectedSymbol}
 initialTimeframe={selectedTimeframe}
 height={chartHeight}
 onSymbolChange={handleSymbolChange}
 onTimeframeChange={handleTimeframeChange}
 />
 </div>
 </div>
 );
}
