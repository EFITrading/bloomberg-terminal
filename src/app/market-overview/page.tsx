"use client";

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import '../mobile-trading.css';

// Dynamically import EFICharting to avoid SSR issues
const TradingViewChart = dynamic(
 () => import('../../components/trading/EFICharting'),
 { ssr: false }
);

// Import TradingChatbot
import TradingChatbot from '../../components/chatbot/TradingChatbot';

export default function MarketPage() {
 const [selectedSymbol, setSelectedSymbol] = useState('SPY');
 const [selectedTimeframe, setSelectedTimeframe] = useState('1d');
 const [chartHeight, setChartHeight] = useState(800);
 const [showChatbot, setShowChatbot] = useState(false);

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

 const handleAIButtonClick = () => {
 setShowChatbot(!showChatbot);
 };

 return (
 <div className="market-overview-container h-screen bg-[#0a0a0a] text-white overflow-hidden fixed inset-0" style={{ paddingTop: '120px' }}>
 <div className="chart-container w-full h-full">
 <TradingViewChart
 symbol={selectedSymbol}
 initialTimeframe={selectedTimeframe}
 height={chartHeight}
 onSymbolChange={handleSymbolChange}
 onTimeframeChange={handleTimeframeChange}
 onAIButtonClick={handleAIButtonClick}
 />
 </div>

 {/* AI Trading Chatbot - Mobile Optimized */}
 {showChatbot && (
 <div className="fixed inset-0 z-[1001] bg-black bg-opacity-50 flex items-end justify-center md:items-center md:justify-end md:inset-auto md:bottom-6 md:right-6">
 <div className="relative w-full max-w-md mx-4 mb-4 md:w-96 md:mx-0 md:mb-0">
 {/* Close button for mobile */}
 <button
 onClick={() => setShowChatbot(false)}
 className="absolute top-2 right-2 z-10 w-8 h-8 bg-gray-800 hover:bg-gray-700 text-white rounded-full flex items-center justify-center text-lg font-bold border border-gray-600"
 >
 ×
 </button>
 
 {/* Glow effect */}
 <div className="absolute -inset-2 bg-gradient-to-r from-orange-400 via-yellow-400 to-orange-400 rounded-xl blur-lg opacity-30 animate-pulse"></div>
 <div className="relative z-10">
 <TradingChatbot />
 </div>
 </div>
 </div>
 )}
 </div>
 );
}
