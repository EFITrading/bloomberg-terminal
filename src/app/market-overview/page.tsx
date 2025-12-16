"use client";

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import '../mobile-trading.css';

// Dynamically import EFICharting to avoid SSR issues
const TradingViewChart = dynamic(
 () => import('../../components/trading/EFICharting'),
 { ssr: false }
);

import SeasonalityChart from '../../components/analytics/SeasonalityChart';

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
 const navHeight = isMobile ? 80 : 120; // Smaller nav height on mobile
 const calculatedHeight = window.innerHeight - navHeight;
 setChartHeight(Math.max(400, calculatedHeight)); // Minimum height of 400px
 };

 updateHeight();
 window.addEventListener('resize', updateHeight);
 
 // Cleanup function to restore scrolling when leaving the page
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
 <>
 <style jsx global>{`
 .w-\\[35\\%\\] .seasonax-header {
 display: none !important;
 }
 .w-\\[35\\%\\] .seasonax-container {
 padding: 0;
 background: #000;
 }
 
 .w-\\[35\\%\\] .seasonax-content {
 height: 800px !important;
 min-height: 800px !important;
 }
 
 .w-\\[35\\%\\] .seasonax-charts {
 height: 800px !important;
 min-height: 800px !important;
 }
 
 .w-\\[35\\%\\] canvas {
 height: 800px !important;
 min-height: 800px !important;
 }
 
 .w-\\[35\\%\\] .seasonax-main-chart {
 height: 800px !important;
 min-height: 800px !important;
 }
 .w-\\[35\\%\\] .seasonax-symbol-search {
 display: none !important;
 }
 .w-\\[35\\%\\] .sweet-pain-buttons {
 display: none !important;
 }
 .w-\\[35\\%\\] .seasonax-controls {
 display: none !important;
 }
 
 /* Style the horizontal monthly returns to match exact design */
 .w-\\[35\\%\\] .horizontal-monthly-returns {
 display: flex !important;
 flex-direction: row !important;
 width: 100%;
 padding: 20px;
 background: #000;
 margin: 0;
 max-width: none;
 align-items: stretch;
 }
 
 .w-\\[35\\%\\] .monthly-returns-main-container {
 display: flex !important;
 flex-direction: row !important;
 width: 100%;
 gap: 15px;
 align-items: center;
 justify-content: space-between;
 }
 
 .w-\\[35\\%\\] .period-column {
 display: flex !important;
 flex-direction: column !important;
 }
 
 .w-\\[35\\%\\] .left-column,
 .w-\\[35\\%\\] .right-column {
 flex-shrink: 0;
 }
 
 .w-\\[35\\%\\] .period-item {
 min-width: 140px;
 padding: 16px 20px;
 border-radius: 16px;
 border: 2px solid;
 background: #000;
 }
 
 .w-\\[35\\%\\] .period-item.bullish-period {
 border-color: #00FF00;
 }
 
 .w-\\[35\\%\\] .period-item.bearish-period {
 border-color: #FF0000;
 }
 
 .w-\\[35\\%\\] .period-label,
 .w-\\[35\\%\\] .side-subtitle {
 font-size: 16px !important;
 font-weight: 800 !important;
 margin-bottom: 8px;
 letter-spacing: 1.5px;
 }
 
 .w-\\[35\\%\\] .period-date {
 font-size: 13px !important;
 color: #fff !important;
 margin-bottom: 8px;
 }
 
 .w-\\[35\\%\\] .period-return {
 font-size: 22px !important;
 font-weight: 900 !important;
 padding: 8px 12px;
 border-radius: 8px;
 }
 
 .w-\\[35\\%\\] .monthly-returns-container {
 display: flex !important;
 flex-direction: column !important;
 gap: 10px;
 flex: 1;
 }
 
 .w-\\[35\\%\\] .monthly-returns-row {
 display: flex !important;
 flex-direction: row !important;
 gap: 12px;
 justify-content: center;
 flex-wrap: nowrap;
 }
 
 .w-\\[35\\%\\] .monthly-return-item {
 min-width: 80px;
 padding: 12px 16px;
 border-radius: 12px;
 border: 1px solid rgba(255, 255, 255, 0.2);
 background: #0a0a0a;
 }
 
 .w-\\[35\\%\\] .month-label {
 font-size: 16px !important;
 font-weight: 800 !important;
 margin-bottom: 8px;
 letter-spacing: 1px;
 }
 
 .w-\\[35\\%\\] .return-value {
 font-size: 18px !important;
 font-weight: 800 !important;
 padding: 6px 10px;
 border-radius: 6px;
 }
 `}</style>
 <div className="market-overview-container h-screen bg-[#0a0a0a] text-white overflow-hidden fixed inset-0" style={{ paddingTop: '120px' }}>
 <div className="flex w-full h-full">
 <div className="w-[65%] h-full">
 <TradingViewChart
 symbol={selectedSymbol}
 initialTimeframe={selectedTimeframe}
 height={chartHeight}
 onSymbolChange={handleSymbolChange}
 onTimeframeChange={handleTimeframeChange}
 />
 </div>
 <div 
 className="w-[35%] h-full bg-black overflow-y-auto"
 style={{
 borderLeft: '2px solid rgba(255, 140, 50, 0.4)'
 }}
 >
 <SeasonalityChart 
 autoStart={true} 
 initialSymbol={selectedSymbol}
 onSymbolChange={handleSymbolChange}
 hideControls={true}
 />
 </div>
 </div>
 </div>
 </>
 );
}
