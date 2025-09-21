"use client";

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

// Dynamically import TradingViewChart to avoid SSR issues
const TradingViewChart = dynamic(
  () => import('../../components/trading/TradingViewChart'),
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
      const navHeight = 120; // Account for the navigation bar height + more padding for chart toolbar
      setChartHeight(window.innerHeight - navHeight);
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
    <div className="h-screen bg-[#0a0a0a] text-white overflow-hidden fixed inset-0" style={{ paddingTop: '120px' }}>
      <div className="w-full h-full">
        <TradingViewChart
          symbol={selectedSymbol}
          initialTimeframe={selectedTimeframe}
          height={chartHeight}
          onSymbolChange={handleSymbolChange}
          onTimeframeChange={handleTimeframeChange}
          onAIButtonClick={handleAIButtonClick}
        />
      </div>
      
      {/* AI Trading Chatbot */}
      {showChatbot && (
        <div className="fixed bottom-6 right-6 z-[1001] drop-shadow-2xl">
          <div className="relative">
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
