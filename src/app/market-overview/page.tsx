"use client";

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

// Dynamically import TradingViewChart to avoid SSR issues
const TradingViewChart = dynamic(
  () => import('../../components/trading/TradingViewChart'),
  { ssr: false }
);

export default function MarketPage() {
  const [selectedSymbol, setSelectedSymbol] = useState('SPY');
  const [selectedTimeframe, setSelectedTimeframe] = useState('1d');
  const [chartHeight, setChartHeight] = useState(800);

  useEffect(() => {
    const updateHeight = () => {
      const headerHeight = 60; // Minimal header height for full TradingView experience
      setChartHeight(window.innerHeight - headerHeight);
    };

    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  const handleSymbolChange = (symbol: string) => {
    setSelectedSymbol(symbol);
  };

  const handleTimeframeChange = (timeframe: string) => {
    setSelectedTimeframe(timeframe);
  };

  return (
    <div className="h-screen bg-[#0a0a0a] text-white overflow-hidden">
      <div className="max-w-none mx-auto h-full flex flex-col">
        {/* Minimal Header for Full TradingView Experience */}
        <div className="p-2 shrink-0 bg-[#131722] border-b border-[#2a2e39]">
          <h1 className="text-lg font-semibold text-center">Bloomberg Terminal - Professional Trading Platform</h1>
        </div>

        {/* Full-Screen TradingView Chart */}
        <div className="flex-1 min-h-0">
          <TradingViewChart
            symbol={selectedSymbol}
            initialTimeframe={selectedTimeframe}
            height={chartHeight}
            onSymbolChange={handleSymbolChange}
            onTimeframeChange={handleTimeframeChange}
          />
        </div>
      </div>
    </div>
  );
}
