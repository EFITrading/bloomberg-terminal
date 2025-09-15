'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';

// Simple chart data interface
interface ChartDataPoint {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  date: string;
}

// Polygon API response
interface PolygonDataItem {
  t: number; // timestamp
  o: number; // open
  h: number; // high
  l: number; // low
  c: number; // close
  v: number; // volume
}

interface ChartConfig {
  timeframe: string;
  chartType: 'candlestick' | 'line';
  theme: 'dark' | 'light';
}

interface TradingViewChartProps {
  symbol: string;
  config: ChartConfig;
  height: number;
  onTimeframeChange?: (timeframe: string) => void;
  onSymbolChange?: (symbol: string) => void;
}

export default function TradingViewChart({
  symbol,
  config,
  height,
  onTimeframeChange,
  onSymbolChange
}: TradingViewChartProps) {
  // Simple state
  const [data, setData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentPrice, setCurrentPrice] = useState(0);
  const [priceChange, setPriceChange] = useState(0);
  const [priceChangePercent, setPriceChangePercent] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Timeframe options
  const timeframes = [
    { label: '1m', value: '1m' },
    { label: '5m', value: '5m' },
    { label: '15m', value: '15m' },
    { label: '1h', value: '1h' },
    { label: '4h', value: '4h' },
    { label: '1d', value: '1d' }
  ];

  // Get current real price
  const fetchCurrentPrice = useCallback(async (sym: string) => {
    try {
      console.log(`Getting current price for ${sym}`);
      const response = await fetch(`/api/realtime-price?symbol=${sym}`);
      const result = await response.json();
      
      if (result.price) {
        console.log(`${sym} current price: $${result.price}`);
        setCurrentPrice(result.price);
        return result.price;
      }
    } catch (error) {
      console.error('Error fetching current price:', error);
    }
    return null;
  }, []);

  // Simple data fetch
  const fetchData = useCallback(async (sym: string, timeframe: string) => {
    setLoading(true);
    try {
      console.log(`Fetching ${sym} ${timeframe} data`);
      
      // Get appropriate date range
      const endDate = '2025-09-12';
      let lookbackDays = 30;
      
      switch (timeframe) {
        case '1m': lookbackDays = 1; break;
        case '5m': lookbackDays = 5; break;
        case '15m': lookbackDays = 10; break;
        case '1h': lookbackDays = 30; break;
        case '4h': lookbackDays = 90; break;
        case '1d': lookbackDays = 365; break;
      }
      
      const startDate = new Date();
      startDate.setFullYear(2025, 8, 12);
      startDate.setDate(startDate.getDate() - lookbackDays);
      const startDateStr = startDate.toISOString().split('T')[0];
      
      const response = await fetch(
        `/api/historical-data?symbol=${sym}&startDate=${startDateStr}&endDate=${endDate}&timeframe=${timeframe}`
      );
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result?.results?.length) {
        const chartData = result.results.map((item: PolygonDataItem) => ({
          timestamp: item.t,
          open: item.o,
          high: item.h,
          low: item.l,
          close: item.c,
          volume: item.v || 0,
          date: new Date(item.t).toISOString().split('T')[0]
        }));
        
        setData(chartData);
        
        // Calculate price change from data
        if (chartData.length >= 2) {
          const latest = chartData[chartData.length - 1];
          const previous = chartData[chartData.length - 2];
          const change = latest.close - previous.close;
          const changePercent = (change / previous.close) * 100;
          
          setPriceChange(change);
          setPriceChangePercent(changePercent);
          
          // Update current price if this is recent data
          if (timeframe === '1m' || timeframe === '5m') {
            setCurrentPrice(latest.close);
          }
        }
        
        console.log(`Loaded ${chartData.length} ${timeframe} candles for ${sym}`);
        console.log(`Latest price from data: $${chartData[chartData.length - 1]?.close}`);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Draw simple chart
  const drawChart = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data.length) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Set canvas size
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    
    const width = rect.width;
    const height = rect.height;
    
    // Clear canvas
    ctx.fillStyle = config.theme === 'dark' ? '#000000' : '#ffffff';
    ctx.fillRect(0, 0, width, height);
    
    // Get price range
    const prices = data.flatMap(d => [d.high, d.low]);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice;
    const padding = priceRange * 0.1;
    
    const chartTop = 50;
    const chartBottom = height - 100;
    const chartHeight = chartBottom - chartTop;
    
    // Draw price grid
    ctx.strokeStyle = config.theme === 'dark' ? '#333' : '#ddd';
    ctx.lineWidth = 1;
    
    for (let i = 0; i <= 5; i++) {
      const y = chartTop + (chartHeight * i / 5);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      
      // Price labels
      const price = maxPrice + padding - ((maxPrice + padding - (minPrice - padding)) * i / 5);
      ctx.fillStyle = config.theme === 'dark' ? '#fff' : '#000';
      ctx.font = '12px monospace';
      ctx.fillText(price.toFixed(2), width - 60, y + 4);
    }
    
    // Draw candlesticks
    const candleWidth = Math.max(2, width / data.length * 0.8);
    
    data.forEach((candle, index) => {
      const x = (width / data.length) * index + (width / data.length) / 2;
      
      // Calculate Y positions
      const highY = chartTop + ((maxPrice + padding - candle.high) / ((maxPrice + padding) - (minPrice - padding))) * chartHeight;
      const lowY = chartTop + ((maxPrice + padding - candle.low) / ((maxPrice + padding) - (minPrice - padding))) * chartHeight;
      const openY = chartTop + ((maxPrice + padding - candle.open) / ((maxPrice + padding) - (minPrice - padding))) * chartHeight;
      const closeY = chartTop + ((maxPrice + padding - candle.close) / ((maxPrice + padding) - (minPrice - padding))) * chartHeight;
      
      const isGreen = candle.close >= candle.open;
      
      // Draw wick
      ctx.strokeStyle = isGreen ? '#00ff00' : '#ff0000';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, highY);
      ctx.lineTo(x, lowY);
      ctx.stroke();
      
      // Draw body
      ctx.fillStyle = isGreen ? '#00ff00' : '#ff0000';
      const bodyTop = Math.min(openY, closeY);
      const bodyHeight = Math.abs(closeY - openY);
      ctx.fillRect(x - candleWidth/2, bodyTop, candleWidth, bodyHeight || 1);
    });
    
    // Draw current price line
    if (currentPrice) {
      const currentY = chartTop + ((maxPrice + padding - currentPrice) / ((maxPrice + padding) - (minPrice - padding))) * chartHeight;
      ctx.strokeStyle = '#ffff00';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(0, currentY);
      ctx.lineTo(width, currentY);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Price label
      ctx.fillStyle = '#ffff00';
      ctx.font = 'bold 14px monospace';
      ctx.fillText(`$${currentPrice.toFixed(2)}`, width - 80, currentY - 5);
    }
  }, [data, config.theme, currentPrice]);

  // Handle timeframe change
  const handleTimeframeChange = (newTimeframe: string) => {
    onTimeframeChange?.(newTimeframe);
    fetchData(symbol, newTimeframe);
  };

  // Load data when symbol or timeframe changes
  useEffect(() => {
    fetchData(symbol, config.timeframe);
    fetchCurrentPrice(symbol);
  }, [symbol, config.timeframe, fetchData, fetchCurrentPrice]);

  // Draw chart when data changes
  useEffect(() => {
    drawChart();
  }, [drawChart]);

  // Handle canvas resize
  useEffect(() => {
    const handleResize = () => drawChart();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [drawChart]);

  return (
    <div className="w-full bg-black text-white" style={{ height }}>
      {/* Header with price info */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h2 className="text-2xl font-bold">{symbol}</h2>
            <div className="flex items-center space-x-2">
              <span className="text-2xl font-bold">${currentPrice.toFixed(2)}</span>
              <span className={`text-lg ${priceChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)} ({priceChangePercent.toFixed(2)}%)
              </span>
            </div>
          </div>
          
          {/* Timeframe buttons */}
          <div className="flex space-x-2">
            {timeframes.map((tf) => (
              <button
                key={tf.value}
                onClick={() => handleTimeframeChange(tf.value)}
                className={`px-3 py-1 rounded ${
                  config.timeframe === tf.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chart area */}
      <div ref={containerRef} className="relative" style={{ height: height - 100 }}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 z-10">
            <div className="text-white">Loading {config.timeframe} data...</div>
          </div>
        )}
        
        <canvas
          ref={canvasRef}
          className="w-full h-full"
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    </div>
  );
}