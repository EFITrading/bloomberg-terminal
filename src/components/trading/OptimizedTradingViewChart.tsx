'use client';

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useOptimizedData } from '../../hooks/useOptimizedData';
import { useOptimizedRenderer } from '../../hooks/useOptimizedRenderer';

// Chart configuration interface
interface ChartConfig {
 symbol: string;
 timeframe: string;
 chartType: 'candlestick' | 'line';
 theme: 'dark' | 'light';
 showGrid: boolean;
}

// Component props interface
interface OptimizedTradingViewChartProps {
 symbol: string;
 initialTimeframe?: string;
 height?: number;
 onSymbolChange?: (symbol: string) => void;
 onTimeframeChange?: (timeframe: string) => void;
}

// Timeframes configuration
const TIMEFRAMES = [
 { label: '1m', value: '1m' },
 { label: '5m', value: '5m' },
 { label: '15m', value: '15m' },
 { label: '30m', value: '30m' },
 { label: '1H', value: '1h' },
 { label: '4H', value: '4h' },
 { label: '1D', value: '1d' },
 { label: '1W', value: '1w' },
 { label: '1M', value: '1mo' }
];

const OptimizedTradingViewChart: React.FC<OptimizedTradingViewChartProps> = React.memo(({
 symbol,
 initialTimeframe = '1d',
 height = 600,
 onSymbolChange,
 onTimeframeChange
}) => {
 // Refs
 const containerRef = useRef<HTMLDivElement>(null);
 const chartCanvasRef = useRef<HTMLCanvasElement>(null);

 // State
 const [config, setConfig] = useState<ChartConfig>({
 symbol,
 timeframe: initialTimeframe,
 chartType: 'candlestick',
 theme: 'dark',
 showGrid: true
 });

 const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
 const [visibleCandleCount, setVisibleCandleCount] = useState(150);
 const [scrollOffset, setScrollOffset] = useState(0);
 const [showTimeframeDropdown, setShowTimeframeDropdown] = useState(false);
 const [currentPrice, setCurrentPrice] = useState<number>(0);

 // Custom hooks
 const { 
 data, 
 isLoading, 
 error, 
 fetchTimeframeData,
 clearCache,
 getCacheStats 
 } = useOptimizedData();

 const { 
 renderChart, 
 cleanup: cleanupRenderer,
 clearCache: clearRendererCache 
 } = useOptimizedRenderer();

 // Memoized calculations
 const priceRange = useMemo(() => {
 if (data.length === 0) return { min: 0, max: 100 };
 
 const startIndex = Math.max(0, Math.floor(scrollOffset));
 const endIndex = Math.min(data.length, startIndex + visibleCandleCount);
 const visibleData = data.slice(startIndex, endIndex);
 
 if (visibleData.length === 0) return { min: 0, max: 100 };
 
 const prices = visibleData.flatMap(d => [d.high, d.low]);
 const minPrice = Math.min(...prices);
 const maxPrice = Math.max(...prices);
 const padding = (maxPrice - minPrice) * 0.1;
 
 return {
 min: minPrice - padding,
 max: maxPrice + padding
 };
 }, [data, scrollOffset, visibleCandleCount]);

 // Optimized timeframe change handler
 const handleTimeframeChange = useCallback((timeframe: string) => {
 console.log(` OPTIMIZED TIMEFRAME CHANGE: ${symbol} -> ${timeframe}`);
 
 // Update config
 setConfig(prev => ({ ...prev, timeframe }));
 
 // Fetch data (will use cache if available)
 fetchTimeframeData(symbol, timeframe);
 
 // Notify parent
 onTimeframeChange?.(timeframe);
 
 // Close dropdown
 setShowTimeframeDropdown(false);
 }, [symbol, fetchTimeframeData, onTimeframeChange]);

 // Handle chart type change
 const handleChartTypeChange = useCallback((chartType: ChartConfig['chartType']) => {
 setConfig(prev => ({ ...prev, chartType }));
 }, []);

 // Handle container resize
 const updateDimensions = useCallback(() => {
 if (containerRef.current) {
 const rect = containerRef.current.getBoundingClientRect();
 setDimensions({ width: rect.width, height: rect.height });
 }
 }, []);

 // Initialize scroll position
 const initializeScrollPosition = useCallback(() => {
 if (data.length > 0) {
 const defaultVisible = Math.min(150, data.length);
 setVisibleCandleCount(defaultVisible);
 setScrollOffset(Math.max(0, data.length - defaultVisible));
 
 // Update current price
 if (data.length > 0) {
 setCurrentPrice(data[data.length - 1].close);
 }
 }
 }, [data]);

 // Fetch real-time price (optimized)
 const fetchRealTimePrice = useCallback(async () => {
 try {
 const response = await fetch(`/api/realtime-price?symbol=${symbol}`, {
 method: 'GET',
 headers: { 'Cache-Control': 'no-cache' }
 });
 
 if (response.ok) {
 const result = await response.json();
 if (result && typeof result.price === 'number') {
 setCurrentPrice(result.price);
 }
 }
 } catch (error) {
 console.warn(` Real-time price fetch failed for ${symbol}:`, error);
 }
 }, [symbol]);

 // Effects
 useEffect(() => {
 updateDimensions();
 window.addEventListener('resize', updateDimensions);
 return () => window.removeEventListener('resize', updateDimensions);
 }, [updateDimensions]);

 useEffect(() => {
 if (symbol !== config.symbol) {
 setConfig(prev => ({ ...prev, symbol }));
 }
 }, [symbol, config.symbol]);

 // Fetch data when symbol or timeframe changes
 useEffect(() => {
 fetchTimeframeData(config.symbol, config.timeframe);
 }, [config.symbol, config.timeframe, fetchTimeframeData]);

 // Initialize scroll position when data changes
 useEffect(() => {
 initializeScrollPosition();
 }, [initializeScrollPosition]);

 // Real-time price updates
 useEffect(() => {
 fetchRealTimePrice(); // Initial fetch
 
 const interval = setInterval(fetchRealTimePrice, 5000);
 return () => clearInterval(interval);
 }, [fetchRealTimePrice]);

 // Render chart when data or dimensions change
 useEffect(() => {
 if (chartCanvasRef.current && data.length > 0 && dimensions.width > 0) {
 renderChart(chartCanvasRef.current, {
 data,
 config,
 dimensions,
 priceRange,
 visibleCandleCount,
 scrollOffset,
 volumeAreaHeight: 80
 });
 }
 }, [data, config, dimensions, priceRange, visibleCandleCount, scrollOffset, renderChart]);

 // Cleanup on unmount
 useEffect(() => {
 return () => {
 cleanupRenderer();
 };
 }, [cleanupRenderer]);

 // Handle mouse wheel for zoom/scroll
 const handleWheel = useCallback((e: React.WheelEvent) => {
 e.preventDefault();
 
 if (e.ctrlKey || e.metaKey) {
 // Zoom
 const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
 setVisibleCandleCount(prev => {
 const newCount = Math.round(prev * zoomFactor);
 return Math.max(10, Math.min(500, newCount));
 });
 } else {
 // Scroll
 const scrollSpeed = 3;
 setScrollOffset(prev => {
 const newOffset = prev + (e.deltaY > 0 ? scrollSpeed : -scrollSpeed);
 return Math.max(0, Math.min(data.length - visibleCandleCount, newOffset));
 });
 }
 }, [data.length, visibleCandleCount]);

 // Get cache statistics for debugging
 const cacheStats = getCacheStats();

 return (
 <div 
 ref={containerRef}
 className="relative w-full bg-[#0a0a0a] text-white overflow-hidden"
 style={{ height }}
 >
 {/* Header with controls */}
 <div className="absolute top-0 left-0 right-0 z-10 p-3 bg-black/80 border-b border-gray-800">
 <div className="flex items-center justify-between">
 {/* Symbol and Price */}
 <div className="flex items-center space-x-4">
 <h3 className="text-lg font-bold text-white">{config.symbol}</h3>
 <div className="text-sm">
 <span className="text-green-400">${currentPrice.toFixed(2)}</span>
 </div>
 </div>

 {/* Timeframe Selector */}
 <div className="relative">
 <button
 onClick={() => setShowTimeframeDropdown(!showTimeframeDropdown)}
 className="px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded text-sm border border-gray-600"
 >
 {TIMEFRAMES.find(tf => tf.value === config.timeframe)?.label || config.timeframe}
 </button>

 {showTimeframeDropdown && (
 <div className="absolute top-full right-0 mt-1 bg-gray-900 border border-gray-700 rounded shadow-lg z-20">
 {TIMEFRAMES.map((tf) => (
 <button
 key={tf.value}
 onClick={() => handleTimeframeChange(tf.value)}
 className={`block w-full px-4 py-2 text-left hover:bg-gray-800 text-sm ${
 config.timeframe === tf.value ? 'bg-blue-600' : ''
 }`}
 >
 {tf.label}
 </button>
 ))}
 </div>
 )}
 </div>

 {/* Chart Type Toggle */}
 <div className="flex space-x-2">
 <button
 onClick={() => handleChartTypeChange('candlestick')}
 className={`px-3 py-1 text-xs rounded ${
 config.chartType === 'candlestick' 
 ? 'bg-blue-600 text-white' 
 : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
 }`}
 >
 Candles
 </button>
 <button
 onClick={() => handleChartTypeChange('line')}
 className={`px-3 py-1 text-xs rounded ${
 config.chartType === 'line' 
 ? 'bg-blue-600 text-white' 
 : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
 }`}
 >
 Line
 </button>
 </div>
 </div>
 </div>

 {/* Loading indicator */}
 {isLoading && (
 <div className="absolute top-16 right-4 z-20 bg-black/80 text-green-400 px-3 py-1 rounded text-sm">
 Loading {config.timeframe} data...
 </div>
 )}

 {/* Error indicator */}
 {error && (
 <div className="absolute top-16 right-4 z-20 bg-red-900/80 text-red-200 px-3 py-1 rounded text-sm">
 {error}
 </div>
 )}

 {/* Cache stats (development) */}
 {process.env.NODE_ENV === 'development' && (
 <div className="absolute bottom-4 left-4 z-20 bg-black/80 text-xs text-gray-400 px-2 py-1 rounded">
 Cache: {cacheStats.size} items, {cacheStats.hits} hits, {cacheStats.misses} misses
 </div>
 )}

 {/* Chart Canvas */}
 <div className="absolute inset-0 pt-16">
 <canvas
 ref={chartCanvasRef}
 className="w-full h-full cursor-crosshair"
 onWheel={handleWheel}
 />
 </div>

 {/* Instructions */}
 <div className="absolute bottom-4 right-4 text-xs text-gray-500">
 Mouse wheel: scroll • Ctrl+wheel: zoom
 </div>
 </div>
 );
});

OptimizedTradingViewChart.displayName = 'OptimizedTradingViewChart';

export default OptimizedTradingViewChart;