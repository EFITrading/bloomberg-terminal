"use client";

import React, { useEffect, useRef, useState, useCallback, useMemo, memo } from 'react';
import { Button } from '../../../components/ui/button';
import { 
 Search, 
 TrendingUp, 
 TrendingDown, 
 BarChart3, 
 CandlestickChart,
 Activity,
 ZoomIn,
 ZoomOut,
 RotateCcw,
 Settings,
 Minus,
 Plus,
 Edit3,
 Ruler,
 ChevronDown,
 Palette,
 X,
 Play,
 Pause,
 RefreshCw,
 Download,
 Upload,
 Target,
 Crosshair,
 MousePointer
} from 'lucide-react';

interface CandleData {
 timestamp: number;
 open: number;
 high: number;
 low: number;
 close: number;
 volume: number;
 date: string;
 time: string;
 sma20?: number;
 sma50?: number;
 rsi?: number;
 macd?: number;
 macdSignal?: number;
 bollinger?: {
 upper: number;
 middle: number;
 lower: number;
 };
}

interface VolumeProfile {
 price: number;
 volume: number;
 percentage: number;
}

interface OrderBookLevel {
 price: number;
 volume: number;
 side: 'buy' | 'sell';
}

interface QuickAction {
 id: string;
 name: string;
 icon: React.ComponentType<any>;
 hotkey: string;
 action: () => void;
}

interface ChartTheme {
 background: string;
 grid: string;
 candle: {
 up: string;
 down: string;
 border: string;
 };
 text: string;
 accent: string;
}

interface PriceAlert {
 id: string;
 price: number;
 type: 'support' | 'resistance' | 'target';
 label: string;
 active: boolean;
}

interface TradingChartProps {
 symbol: string;
 initialData?: CandleData[];
 height?: number;
 onSymbolChange?: (symbol: string) => void;
}

const TIMEFRAMES = [
 { value: '5m', label: '5M' },
 { value: '30m', label: '30M' },
 { value: '1h', label: '1H' },
 { value: '1d', label: '1D' },
];

const ALL_TIMEFRAMES = [
 { value: '1m', label: '1M' },
 { value: '5m', label: '5M' },
 { value: '15m', label: '15M' },
 { value: '30m', label: '30M' },
 { value: '1h', label: '1H' },
 { value: '2h', label: '2H' },
 { value: '4h', label: '4H' },
 { value: '1d', label: '1D' },
 { value: '1W', label: '1W' },
];

const RANGES = [
 { value: '1D', label: '1D' },
 { value: '5D', label: '5D' },
 { value: '1M', label: '1M' },
 { value: '3M', label: '3M' },
 { value: '6M', label: '6M' },
 { value: '1Y', label: '1Y' },
 { value: '2Y', label: '2Y' },
 { value: '5Y', label: '5Y' },
 { value: '10Y', label: '10Y' },
 { value: '20Y', label: '20Y' },
];

const INDICATORS = [
 { id: 'sma20', name: 'SMA (20)', color: '#ff6b6b' },
 { id: 'sma50', name: 'SMA (50)', color: '#4ecdc4' },
 { id: 'ema20', name: 'EMA (20)', color: '#45b7d1' },
 { id: 'ema50', name: 'EMA (50)', color: '#96ceb4' },
 { id: 'bollinger', name: 'Bollinger Bands', color: '#feca57' },
 { id: 'rsi', name: 'RSI', color: '#ff9ff3' },
 { id: 'macd', name: 'MACD', color: '#a8e6cf' },
 { id: 'stochastic', name: 'Stochastic', color: '#dda0dd' },
 { id: 'volume', name: 'Volume', color: '#ff9ff3' },
 { id: 'volumeProfile', name: 'Volume Profile', color: '#5f27cd' },
 { id: 'supportResistance', name: 'Support/Resistance', color: '#00d2d3' },
 { id: 'candlePatterns', name: 'Candle Patterns', color: '#ff6348' },
 { id: 'orderBook', name: 'Order Book', color: '#2ed573' },
];

const DRAWING_TOOLS = [
 { id: 'fibonacci', name: 'Fibonacci Retracement', icon: Ruler },
 { id: 'horizontal', name: 'Horizontal Line', icon: Minus },
 { id: 'trendline', name: 'Trend Line', icon: Edit3 },
 { id: 'rectangle', name: 'Rectangle', icon: Plus },
];

// Enhanced Performance Constants
const CHART_UPDATE_THROTTLE = 16; // 60 FPS
const WEBSOCKET_RECONNECT_DELAY = 1000;
const DATA_CHUNK_SIZE = 1000;
const INDICATOR_CACHE_SIZE = 100;

// Chart Themes
const CHART_THEMES = {
 dark: {
 background: '#000000',
 grid: '#1a1a1a',
 candle: { up: '#00ff88', down: '#ff4444', border: '#ffffff' },
 text: '#ffffff',
 accent: '#00d2d3'
 },
 light: {
 background: '#ffffff',
 grid: '#f0f0f0',
 candle: { up: '#26a69a', down: '#ef5350', border: '#000000' },
 text: '#000000',
 accent: '#1976d2'
 },
 bloomberg: {
 background: '#000000',
 grid: '#333333',
 candle: { up: '#ffaa00', down: '#ff6b6b', border: '#ffffff' },
 text: '#ffaa00',
 accent: '#ffaa00'
 }
};

// Quick Actions for Speed Trading
const QUICK_ACTIONS = [
 { id: 'autofit', name: 'Auto Fit', icon: Target, hotkey: 'F' },
 { id: 'crosshair', name: 'Crosshair', icon: Crosshair, hotkey: 'C' },
 { id: 'refresh', name: 'Refresh', icon: RefreshCw, hotkey: 'R' },
 { id: 'fullscreen', name: 'Fullscreen', icon: MousePointer, hotkey: 'Space' },
];

export default function TradingChart({ 
 symbol, 
 initialData = [], 
 height = 600,
 onSymbolChange 
}: TradingChartProps) {
 const canvasRef = useRef<HTMLCanvasElement>(null);
 const containerRef = useRef<HTMLDivElement>(null);
 const animationFrameRef = useRef<number | null>(null);
 const dataCache = useRef<Map<string, CandleData[]>>(new Map());
 const indicatorCache = useRef<Map<string, any>>(new Map());
 
 // Core state
 const [data, setData] = useState<CandleData[]>(initialData);
 const [timeframe, setTimeframe] = useState('1h');
 const [range, setRange] = useState('1D');
 const [chartType, setChartType] = useState<'candlestick' | 'line'>('candlestick');
 const [activeIndicators, setActiveIndicators] = useState<string[]>(['volume']);
 const [loading, setLoading] = useState(false);
 const [currentPrice, setCurrentPrice] = useState<number | null>(null);
 const [priceChange, setPriceChange] = useState<number>(0);
 const [priceChangePercent, setPriceChangePercent] = useState<number>(0);
 const [searchSymbol, setSearchSymbol] = useState(symbol);
 
 // Enhanced Performance State
 const [fps, setFps] = useState(60);
 const [renderTime, setRenderTime] = useState(0);
 const [dataPoints, setDataPoints] = useState(0);
 const [isRealtime, setIsRealtime] = useState(true);
 const [autoRefresh, setAutoRefresh] = useState(true);
 const [refreshInterval, setRefreshInterval] = useState(5000);
 const [currentTheme, setCurrentTheme] = useState<keyof typeof CHART_THEMES>('dark');
 const [isFullscreen, setIsFullscreen] = useState(false);
 const [quickMode, setQuickMode] = useState(false);
 
 // Chart state
 const [zoom, setZoom] = useState(1);
 const [pan, setPan] = useState(0);
 const [yZoom, setYZoom] = useState(1);
 const [yPan, setYPan] = useState(0);
 const [crosshair, setCrosshair] = useState<{ x: number; y: number } | null>(null);
 const [selectedCandle, setSelectedCandle] = useState<CandleData | null>(null);
 
 // Panning state
 const [isPanning, setIsPanning] = useState(false);
 const [isYPanning, setIsYPanning] = useState(false);
 const [lastPanX, setLastPanX] = useState(0);
 const [lastPanY, setLastPanY] = useState(0);

 // Drawing tools state
 const [drawingMode, setDrawingMode] = useState<'none' | 'line' | 'fibonacci' | 'horizontal' | 'trendline' | 'rectangle'>('none');
 const [drawings, setDrawings] = useState<any[]>([]);
 const [fibRetracements, setFibRetracements] = useState<any[]>([]);
 const [isDrawingFib, setIsDrawingFib] = useState(false);
 const [fibStartPoint, setFibStartPoint] = useState<{ x: number; y: number; price: number } | null>(null);

 // UI state for dropdowns and settings
 const [showTimeframeDropdown, setShowTimeframeDropdown] = useState(false);
 const [showRangeDropdown, setShowRangeDropdown] = useState(false);
 const [showIndicatorDropdown, setShowIndicatorDropdown] = useState(false);
 const [showToolsDropdown, setShowToolsDropdown] = useState(false);
 const [showSettingsPanel, setShowSettingsPanel] = useState(false);

 // Enhanced features state
 const [volumeProfile, setVolumeProfile] = useState<VolumeProfile[]>([]);
 const [priceAlerts, setPriceAlerts] = useState<PriceAlert[]>([]);
 const [showVolumeProfile, setShowVolumeProfile] = useState(false);
 const [showOrderBook, setShowOrderBook] = useState(false);
 const [showCandlePatterns, setShowCandlePatterns] = useState(false);
 const [marketSession, setMarketSession] = useState<'pre' | 'regular' | 'after' | 'closed'>('regular');
 const [hoveredAlert, setHoveredAlert] = useState<string | null>(null);

 // Chart customization settings
 const [chartSettings, setChartSettings] = useState({
 backgroundColor: '#000000',
 candleUpColor: '#00ff40',
 candleDownColor: '#ff0000',
 candleBorderColor: '#ffffff',
 wickColor: '#ffffff',
 axisTextColor: '#ffffff',
 axisTextSize: 14,
 gridColor: '#000000',
 showGrid: true,
 });

 // Enhanced fetch data function with caching and performance monitoring
 const fetchData = useCallback(async (sym: string, tf: string, rng: string) => {
 const startTime = performance.now();
 const cacheKey = `${sym}-${tf}-${rng}`;
 
 // Check cache first
 if (dataCache.current.has(cacheKey)) {
 const cachedData = dataCache.current.get(cacheKey)!;
 setData(cachedData);
 setDataPoints(cachedData.length);
 return;
 }
 
 setLoading(true);
 try {
 const response = await fetch(`/api/stock-data?symbol=${sym}&timeframe=${tf}&range=${rng}`);
 const result = await response.json();
 
 if (result.data && Array.isArray(result.data)) {
 // Cache the data
 dataCache.current.set(cacheKey, result.data);
 
 // Limit cache size
 if (dataCache.current.size > 50) {
 const firstKey = dataCache.current.keys().next().value;
 if (firstKey) {
 dataCache.current.delete(firstKey);
 }
 }
 
 setData(result.data);
 setDataPoints(result.data.length);
 
 if (result.meta) {
 setCurrentPrice(result.meta.currentPrice);
 setPriceChange(result.meta.priceChange);
 setPriceChangePercent(result.meta.priceChangePercent);
 }
 } else {
 console.error('Invalid data format received:', result);
 setData([]);
 setDataPoints(0);
 }
 } catch (error) {
 console.error('Failed to fetch data:', error);
 setData([]);
 setDataPoints(0);
 } finally {
 setLoading(false);
 const endTime = performance.now();
 setRenderTime(endTime - startTime);
 }
 }, []);

 // Performance-optimized real-time updates
 const startRealTimeUpdates = useCallback(() => {
 if (!isRealtime || !autoRefresh) return;
 
 const interval = setInterval(() => {
 if (quickMode) {
 // In quick mode, only update price without full chart redraw
 fetch(`/api/realtime-quotes?symbol=${symbol}`)
 .then(res => res.json())
 .then(data => {
 if (data.price) {
 setCurrentPrice(data.price);
 setPriceChange(data.change || 0);
 setPriceChangePercent(data.changePercent || 0);
 }
 })
 .catch(console.error);
 } else {
 // Full data refresh
 fetchData(symbol, timeframe, range);
 }
 }, refreshInterval);
 
 return () => clearInterval(interval);
 }, [isRealtime, autoRefresh, quickMode, symbol, timeframe, range, refreshInterval, fetchData]);

 // Calculate moving averages
 const calculateSMA = (data: CandleData[], period: number) => {
 if (!Array.isArray(data) || data.length < period) return [];
 
 const sma = [];
 for (let i = period - 1; i < data.length; i++) {
 const sum = data.slice(i - period + 1, i + 1).reduce((acc, candle) => acc + candle.close, 0);
 sma.push(sum / period);
 }
 return sma;
 };

 const calculateEMA = (data: CandleData[], period: number) => {
 if (!Array.isArray(data) || data.length === 0) return [];
 
 const ema = [];
 const multiplier = 2 / (period + 1);
 let previousEma = data[0].close;
 
 for (let i = 0; i < data.length; i++) {
 if (i === 0) {
 ema.push(data[i].close);
 } else {
 const currentEma = (data[i].close * multiplier) + (previousEma * (1 - multiplier));
 ema.push(currentEma);
 previousEma = currentEma;
 }
 }
 return ema;
 };

 // Enhanced technical indicator calculations
 const calculateRSI = (data: CandleData[], period: number = 14) => {
 if (!Array.isArray(data) || data.length < period + 1) return [];
 
 const rsi = [];
 const gains = [];
 const losses = [];
 
 for (let i = 1; i < data.length; i++) {
 const change = data[i].close - data[i - 1].close;
 gains.push(change > 0 ? change : 0);
 losses.push(change < 0 ? Math.abs(change) : 0);
 }
 
 for (let i = period; i < gains.length; i++) {
 const avgGain = gains.slice(i - period, i).reduce((a, b) => a + b) / period;
 const avgLoss = losses.slice(i - period, i).reduce((a, b) => a + b) / period;
 const rs = avgGain / avgLoss;
 rsi.push(100 - (100 / (1 + rs)));
 }
 
 return rsi;
 };

 const calculateMACD = (data: CandleData[], fastPeriod: number = 12, slowPeriod: number = 26, signalPeriod: number = 9) => {
 if (!Array.isArray(data) || data.length < slowPeriod) return { macd: [], signal: [] };
 
 const fastEMA = calculateEMA(data, fastPeriod);
 const slowEMA = calculateEMA(data, slowPeriod);
 const macdLine = [];
 
 for (let i = 0; i < Math.min(fastEMA.length, slowEMA.length); i++) {
 macdLine.push(fastEMA[i] - slowEMA[i]);
 }
 
 const macdData = macdLine.map((val, idx) => ({ 
 close: val, 
 open: val, 
 high: val, 
 low: val, 
 volume: 0, 
 timestamp: data[idx]?.timestamp || 0,
 date: data[idx]?.date || '',
 time: data[idx]?.time || ''
 }));
 const signalLine = calculateEMA(macdData, signalPeriod);
 return { macd: macdLine, signal: signalLine };
 };

 const calculateBollingerBands = (data: CandleData[], period: number = 20, stdDev: number = 2) => {
 if (!Array.isArray(data) || data.length < period) return [];
 
 const sma = calculateSMA(data, period);
 const bands = [];
 
 for (let i = period - 1; i < data.length; i++) {
 const slice = data.slice(i - period + 1, i + 1);
 const mean = sma[i - period + 1];
 const variance = slice.reduce((acc, candle) => acc + Math.pow(candle.close - mean, 2), 0) / period;
 const stdDeviation = Math.sqrt(variance);
 
 bands.push({
 upper: mean + (stdDev * stdDeviation),
 middle: mean,
 lower: mean - (stdDev * stdDeviation)
 });
 }
 
 return bands;
 };

 const calculateVolumeProfile = (data: CandleData[]) => {
 if (!Array.isArray(data) || data.length === 0) return [];
 
 const profile: { [key: number]: number } = {};
 const priceStep = 0.01; // $0.01 price levels
 
 data.forEach(candle => {
 const avgPrice = (candle.high + candle.low + candle.close) / 3;
 const priceLevel = Math.round(avgPrice / priceStep) * priceStep;
 profile[priceLevel] = (profile[priceLevel] || 0) + candle.volume;
 });
 
 const totalVolume = Object.values(profile).reduce((a, b) => a + b, 0);
 
 return Object.entries(profile)
 .map(([price, volume]) => ({
 price: parseFloat(price),
 volume,
 percentage: (volume / totalVolume) * 100
 }))
 .sort((a, b) => b.volume - a.volume)
 .slice(0, 20); // Top 20 volume levels
 };

 const detectCandlePatterns = (data: CandleData[]) => {
 if (!Array.isArray(data) || data.length < 3) return [];
 
 const patterns = [];
 
 for (let i = 2; i < data.length; i++) {
 const current = data[i];
 const prev = data[i - 1];
 const prev2 = data[i - 2];
 
 const currentBody = Math.abs(current.close - current.open);
 const currentRange = current.high - current.low;
 const prevBody = Math.abs(prev.close - prev.open);
 
 // Doji pattern
 if (currentBody < currentRange * 0.1) {
 patterns.push({ index: i, type: 'doji', strength: 0.7 });
 }
 
 // Hammer pattern
 if (current.close > current.open && 
 (current.open - current.low) > currentBody * 2 &&
 (current.high - current.close) < currentBody * 0.5) {
 patterns.push({ index: i, type: 'hammer', strength: 0.8 });
 }
 
 // Engulfing pattern
 if (current.close > current.open && prev.close < prev.open &&
 current.open < prev.close && current.close > prev.open) {
 patterns.push({ index: i, type: 'bullish_engulfing', strength: 0.9 });
 }
 }
 
 return patterns;
 };

 const getMarketSession = () => {
 const now = new Date();
 const hours = now.getHours();
 const minutes = now.getMinutes();
 const time = hours * 100 + minutes;
 
 // Market hours in ET (convert if needed)
 if (time >= 930 && time < 1600) return 'regular';
 if (time >= 400 && time < 930) return 'pre';
 if (time >= 1600 && time < 2000) return 'after';
 return 'closed';
 };

 // Draw chart function with high DPI support
 const drawChart = useCallback(() => {
 if (!canvasRef.current || !containerRef.current) return;
 
 // Ensure data is an array and has content
 if (!Array.isArray(data) || data.length === 0) return;

 const canvas = canvasRef.current;
 const ctx = canvas.getContext('2d');
 if (!ctx) return;

 const container = containerRef.current;
 const rect = container.getBoundingClientRect();
 
 // Get device pixel ratio for crisp rendering
 const dpr = window.devicePixelRatio || 1;
 
 // Set actual canvas size in memory (scaled for high DPI)
 canvas.width = rect.width * dpr;
 canvas.height = height * dpr;
 
 // Scale canvas back down using CSS
 canvas.style.width = rect.width + 'px';
 canvas.style.height = height + 'px';
 
 // Scale the drawing context so everything draws at the correct size
 ctx.scale(dpr, dpr);
 
 // Clear canvas with custom background color
 ctx.fillStyle = chartSettings.backgroundColor;
 ctx.fillRect(0, 0, rect.width, rect.height);

 const margin = { top: 30, right: 100, bottom: 80, left: 80 }; // Increased margins for better spacing
 const chartWidth = rect.width - margin.left - margin.right;
 const chartHeight = height - margin.top - margin.bottom - 80; // Reserve space for volume

 // Calculate visible data range based on zoom and pan
 const visibleDataCount = Math.floor(data.length / zoom);
 const startIndex = Math.max(0, Math.min(data.length - visibleDataCount, pan));
 const endIndex = Math.min(data.length, startIndex + visibleDataCount);
 const visibleData = data.slice(startIndex, endIndex);

 if (visibleData.length === 0) return;

 // Calculate price range with Y-axis zoom and pan
 const prices = visibleData.flatMap(d => [d.high, d.low]);
 const minPrice = Math.min(...prices);
 const maxPrice = Math.max(...prices);
 const basePriceRange = maxPrice - minPrice;
 const padding = basePriceRange * 0.1;
 
 // Apply Y-axis zoom (smaller range = more zoomed in)
 const zoomedPriceRange = (basePriceRange + 2 * padding) / yZoom;
 
 // Calculate the center price for panning
 const centerPrice = (minPrice + maxPrice) / 2;
 
 // Apply Y-axis pan offset
 const panOffset = yPan * (basePriceRange / 100); // Scale pan to be relative to price range
 
 // Calculate adjusted min/max with zoom and pan
 const adjustedMinPrice = centerPrice - zoomedPriceRange / 2 + panOffset;
 const adjustedMaxPrice = centerPrice + zoomedPriceRange / 2 + panOffset;

 // Scale functions
 const xScale = (index: number) => margin.left + (index / (visibleData.length - 1)) * chartWidth;
 const yScale = (price: number) => margin.top + ((adjustedMaxPrice - price) / (adjustedMaxPrice - adjustedMinPrice)) * chartHeight;
 const volumeScale = (volume: number) => {
 const maxVolume = Math.max(...visibleData.map(d => d.volume));
 return (volume / maxVolume) * 80; // 80px max height for volume bars
 };

 // Enable anti-aliasing for crisp lines
 ctx.imageSmoothingEnabled = true;
 ctx.imageSmoothingQuality = 'high';

 // Draw grid with custom color (if enabled)
 if (chartSettings.showGrid) {
 ctx.strokeStyle = chartSettings.gridColor;
 ctx.lineWidth = 1;
 
 // Horizontal grid lines
 for (let i = 0; i <= 10; i++) {
 const y = Math.floor(margin.top + (chartHeight / 10) * i) + 0.5; // +0.5 for crisp lines
 ctx.beginPath();
 ctx.moveTo(margin.left, y);
 ctx.lineTo(margin.left + chartWidth, y);
 ctx.stroke();
 }
 
 // Vertical grid lines
 for (let i = 0; i <= 10; i++) {
 const x = Math.floor(margin.left + (chartWidth / 10) * i) + 0.5; // +0.5 for crisp lines
 ctx.beginPath();
 ctx.moveTo(x, margin.top);
 ctx.lineTo(x, margin.top + chartHeight);
 ctx.stroke();
 }
 }

 // Draw price labels (Y-axis) with custom text settings
 ctx.fillStyle = chartSettings.axisTextColor;
 ctx.font = `${chartSettings.axisTextSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
 ctx.textAlign = 'left';
 ctx.textBaseline = 'middle';
 
 for (let i = 0; i <= 10; i++) {
 const price = adjustedMaxPrice - ((adjustedMaxPrice - adjustedMinPrice) / 10) * i;
 const y = margin.top + (chartHeight / 10) * i;
 ctx.fillText(`$${price.toFixed(2)}`, margin.left + chartWidth + 10, y);
 }

 // Draw X-axis (time labels)
 ctx.textAlign = 'center';
 ctx.textBaseline = 'top';
 
 const timeLabels = Math.min(10, visibleData.length);
 for (let i = 0; i < timeLabels; i++) {
 const dataIndex = Math.floor((visibleData.length - 1) * (i / (timeLabels - 1)));
 const candle = visibleData[dataIndex];
 if (candle) {
 const x = xScale(dataIndex);
 const date = new Date(candle.timestamp);
 const timeLabel = timeframe.includes('D') || timeframe.includes('W') 
 ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
 : date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
 
 ctx.fillText(timeLabel, x, margin.top + chartHeight + 10);
 }
 }

 // Draw candlesticks or line chart with high quality
 if (chartType === 'candlestick') {
 const candleWidth = Math.max(2, chartWidth / visibleData.length * 0.8);
 
 visibleData.forEach((candle, index) => {
 const x = Math.floor(xScale(index)) + 0.5; // Crisp positioning
 const openY = Math.floor(yScale(candle.open)) + 0.5;
 const closeY = Math.floor(yScale(candle.close)) + 0.5;
 const highY = Math.floor(yScale(candle.high)) + 0.5;
 const lowY = Math.floor(yScale(candle.low)) + 0.5;
 
 const isGreen = candle.close >= candle.open;
 ctx.strokeStyle = isGreen ? chartSettings.candleUpColor : chartSettings.candleDownColor;
 ctx.fillStyle = isGreen ? chartSettings.candleUpColor : chartSettings.candleDownColor;
 ctx.lineWidth = 1;
 
 // Draw wick with custom color and crisp lines
 ctx.strokeStyle = chartSettings.wickColor;
 ctx.beginPath();
 ctx.moveTo(x, highY);
 ctx.lineTo(x, lowY);
 ctx.stroke();
 
 // Reset stroke style for body border
 ctx.strokeStyle = chartSettings.candleBorderColor;
 
 // Draw body with crisp edges
 const bodyHeight = Math.max(1, Math.abs(closeY - openY));
 ctx.fillRect(x - candleWidth / 2, Math.min(openY, closeY), candleWidth, bodyHeight);
 ctx.strokeRect(x - candleWidth / 2, Math.min(openY, closeY), candleWidth, bodyHeight);
 });
 } else {
 // Line chart with smooth curves
 ctx.strokeStyle = '#3b82f6';
 ctx.lineWidth = 2;
 ctx.lineCap = 'round';
 ctx.lineJoin = 'round';
 ctx.beginPath();
 
 visibleData.forEach((candle, index) => {
 const x = xScale(index);
 const y = yScale(candle.close);
 
 if (index === 0) {
 ctx.moveTo(x, y);
 } else {
 ctx.lineTo(x, y);
 }
 });
 ctx.stroke();
 }

 // Draw volume bars with crisp rendering above Y-axis
 if (activeIndicators.includes('volume')) {
 const volumeY = height - margin.bottom - 60; // Moved higher above Y-axis
 
 visibleData.forEach((candle, index) => {
 const x = Math.floor(xScale(index));
 const volumeHeight = Math.floor(volumeScale(candle.volume));
 const isGreen = candle.close >= candle.open;
 
 // Use the same colors as candles for consistency
 ctx.fillStyle = isGreen ? 'rgba(0, 255, 64, 0.8)' : 'rgba(255, 0, 0, 0.8)';
 ctx.fillRect(x - 2, volumeY - volumeHeight, 4, volumeHeight);
 });
 
 // Volume label with white text to match theme
 ctx.fillStyle = '#ffffff';
 ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
 ctx.textAlign = 'left';
 ctx.textBaseline = 'top';
 ctx.fillText('Volume', margin.left, volumeY + 5); // Adjusted position
 }

 // Draw indicators with smooth lines
 if (activeIndicators.includes('sma20')) {
 const sma20 = calculateSMA(data.slice(startIndex, endIndex), 20);
 if (sma20.length > 0) {
 ctx.strokeStyle = '#ff6b6b';
 ctx.lineWidth = 2;
 ctx.lineCap = 'round';
 ctx.lineJoin = 'round';
 ctx.beginPath();
 
 sma20.forEach((value, index) => {
 if (index + 19 < visibleData.length) {
 const x = xScale(index + 19);
 const y = yScale(value);
 
 if (index === 0) {
 ctx.moveTo(x, y);
 } else {
 ctx.lineTo(x, y);
 }
 }
 });
 ctx.stroke();
 }
 }

 if (activeIndicators.includes('sma50')) {
 const sma50 = calculateSMA(data.slice(startIndex, endIndex), 50);
 if (sma50.length > 0) {
 ctx.strokeStyle = '#4ecdc4';
 ctx.lineWidth = 2;
 ctx.lineCap = 'round';
 ctx.lineJoin = 'round';
 ctx.beginPath();
 
 sma50.forEach((value, index) => {
 if (index + 49 < visibleData.length) {
 const x = xScale(index + 49);
 const y = yScale(value);
 
 if (index === 0) {
 ctx.moveTo(x, y);
 } else {
 ctx.lineTo(x, y);
 }
 }
 });
 ctx.stroke();
 }
 }

 // EMA 20 indicator
 if (activeIndicators.includes('ema20')) {
 const ema20 = calculateEMA(visibleData, 20);
 if (ema20.length > 0) {
 ctx.strokeStyle = '#45b7d1';
 ctx.lineWidth = 2;
 ctx.lineCap = 'round';
 ctx.lineJoin = 'round';
 ctx.beginPath();
 
 ema20.forEach((value, index) => {
 if (index >= 19) {
 const x = xScale(index);
 const y = yScale(value);
 
 if (index === 19) {
 ctx.moveTo(x, y);
 } else {
 ctx.lineTo(x, y);
 }
 }
 });
 ctx.stroke();
 }
 }

 // EMA 50 indicator
 if (activeIndicators.includes('ema50')) {
 const ema50 = calculateEMA(visibleData, 50);
 if (ema50.length > 0) {
 ctx.strokeStyle = '#96ceb4';
 ctx.lineWidth = 2;
 ctx.lineCap = 'round';
 ctx.lineJoin = 'round';
 ctx.beginPath();
 
 ema50.forEach((value, index) => {
 if (index >= 49) {
 const x = xScale(index);
 const y = yScale(value);
 
 if (index === 49) {
 ctx.moveTo(x, y);
 } else {
 ctx.lineTo(x, y);
 }
 }
 });
 ctx.stroke();
 }
 }

 // RSI indicator (displayed in bottom panel)
 if (activeIndicators.includes('rsi')) {
 const rsi = calculateRSI(visibleData);
 if (rsi.length > 0) {
 const rsiY = height - margin.bottom - 40;
 const rsiHeight = 60;
 
 // RSI background
 ctx.fillStyle = 'rgba(255, 159, 243, 0.1)';
 ctx.fillRect(margin.left, rsiY - rsiHeight, chartWidth, rsiHeight);
 
 // RSI lines
 ctx.strokeStyle = 'rgba(255, 159, 243, 0.3)';
 ctx.lineWidth = 1;
 ctx.setLineDash([2, 2]);
 
 // 70 line (overbought)
 const overboughtY = rsiY - (rsiHeight * 0.7);
 ctx.beginPath();
 ctx.moveTo(margin.left, overboughtY);
 ctx.lineTo(margin.left + chartWidth, overboughtY);
 ctx.stroke();
 
 // 30 line (oversold)
 const oversoldY = rsiY - (rsiHeight * 0.3);
 ctx.beginPath();
 ctx.moveTo(margin.left, oversoldY);
 ctx.lineTo(margin.left + chartWidth, oversoldY);
 ctx.stroke();
 
 ctx.setLineDash([]);
 
 // RSI line
 ctx.strokeStyle = '#ff9ff3';
 ctx.lineWidth = 2;
 ctx.beginPath();
 
 rsi.forEach((value, index) => {
 if (index + 14 < visibleData.length) {
 const x = xScale(index + 14);
 const y = rsiY - (value / 100) * rsiHeight;
 
 if (index === 0) {
 ctx.moveTo(x, y);
 } else {
 ctx.lineTo(x, y);
 }
 }
 });
 ctx.stroke();
 
 // RSI label
 ctx.fillStyle = '#ff9ff3';
 ctx.font = '12px monospace';
 ctx.textAlign = 'left';
 ctx.fillText('RSI', margin.left + 5, rsiY - rsiHeight + 15);
 }
 }

 // MACD indicator (displayed in bottom panel)
 if (activeIndicators.includes('macd')) {
 const macdData = calculateMACD(visibleData);
 if (macdData.macd.length > 0 && macdData.signal.length > 0) {
 const macdY = height - margin.bottom - 120;
 const macdHeight = 80;
 
 // MACD background
 ctx.fillStyle = 'rgba(168, 230, 207, 0.1)';
 ctx.fillRect(margin.left, macdY - macdHeight, chartWidth, macdHeight);
 
 // Zero line
 ctx.strokeStyle = 'rgba(168, 230, 207, 0.3)';
 ctx.lineWidth = 1;
 ctx.setLineDash([2, 2]);
 ctx.beginPath();
 ctx.moveTo(margin.left, macdY - macdHeight/2);
 ctx.lineTo(margin.left + chartWidth, macdY - macdHeight/2);
 ctx.stroke();
 ctx.setLineDash([]);
 
 // MACD line
 ctx.strokeStyle = '#a8e6cf';
 ctx.lineWidth = 2;
 ctx.beginPath();
 
 const maxMacd = Math.max(...macdData.macd.map(Math.abs));
 
 macdData.macd.forEach((value, index) => {
 if (index + 26 < visibleData.length) {
 const x = xScale(index + 26);
 const y = macdY - macdHeight/2 - (value / maxMacd) * (macdHeight/4);
 
 if (index === 0) {
 ctx.moveTo(x, y);
 } else {
 ctx.lineTo(x, y);
 }
 }
 });
 ctx.stroke();
 
 // Signal line
 ctx.strokeStyle = '#ff6b6b';
 ctx.lineWidth = 1;
 ctx.beginPath();
 
 macdData.signal.forEach((value, index) => {
 if (index + 35 < visibleData.length) {
 const x = xScale(index + 35);
 const y = macdY - macdHeight/2 - (value / maxMacd) * (macdHeight/4);
 
 if (index === 0) {
 ctx.moveTo(x, y);
 } else {
 ctx.lineTo(x, y);
 }
 }
 });
 ctx.stroke();
 
 // MACD label
 ctx.fillStyle = '#a8e6cf';
 ctx.font = '12px monospace';
 ctx.textAlign = 'left';
 ctx.fillText('MACD', margin.left + 5, macdY - macdHeight + 15);
 }
 }

 // Support/Resistance levels
 if (activeIndicators.includes('supportResistance')) {
 const prices = visibleData.map(d => d.close);
 const maxPrice = Math.max(...prices);
 const minPrice = Math.min(...prices);
 const priceRange = maxPrice - minPrice;
 
 // Fibonacci-based support/resistance levels
 const levels = [
 { level: 0.236, color: '#00d2d3' },
 { level: 0.382, color: '#00d2d3' },
 { level: 0.5, color: '#00d2d3' },
 { level: 0.618, color: '#00d2d3' },
 { level: 0.786, color: '#00d2d3' }
 ];
 
 levels.forEach(level => {
 const price = minPrice + (priceRange * level.level);
 const y = yScale(price);
 
 ctx.strokeStyle = level.color;
 ctx.lineWidth = 1;
 ctx.setLineDash([5, 5]);
 ctx.beginPath();
 ctx.moveTo(margin.left, y);
 ctx.lineTo(margin.left + chartWidth, y);
 ctx.stroke();
 
 // Price label
 ctx.fillStyle = level.color;
 ctx.font = '10px monospace';
 ctx.textAlign = 'right';
 ctx.fillText(`$${price.toFixed(2)}`, margin.left + chartWidth - 5, y - 2);
 });
 
 ctx.setLineDash([]);
 }

 // Draw crosshair
 if (crosshair) {
 ctx.strokeStyle = '#6b7280';
 ctx.lineWidth = 1;
 ctx.setLineDash([5, 5]);
 
 // Vertical line
 ctx.beginPath();
 ctx.moveTo(crosshair.x, margin.top);
 ctx.lineTo(crosshair.x, margin.top + chartHeight);
 ctx.stroke();
 
 // Horizontal line
 ctx.beginPath();
 ctx.moveTo(margin.left, crosshair.y);
 ctx.lineTo(margin.left + chartWidth, crosshair.y);
 ctx.stroke();
 
 ctx.setLineDash([]);
 }

 // Draw fibonacci retracements
 if (fibRetracements.length > 0) {
 const FIB_LEVELS = [
 { level: 0, label: '0.0%', color: '#ffffff' },
 { level: 0.236, label: '23.6%', color: '#ff6b6b' },
 { level: 0.382, label: '38.2%', color: '#4ecdc4' },
 { level: 0.5, label: '50.0%', color: '#45b7d1' },
 { level: 0.618, label: '61.8%', color: '#96ceb4' },
 { level: 0.786, label: '78.6%', color: '#feca57' },
 { level: 1, label: '100.0%', color: '#ffffff' },
 ];

 fibRetracements.forEach(fib => {
 const priceDiff = fib.end.price - fib.start.price;
 
 FIB_LEVELS.forEach(level => {
 const fibPrice = fib.start.price + (priceDiff * level.level);
 const y = yScale(fibPrice);
 
 ctx.strokeStyle = level.color;
 ctx.lineWidth = level.level === 0 || level.level === 1 ? 2 : 1;
 ctx.setLineDash(level.level === 0 || level.level === 1 ? [] : [5, 5]);
 
 ctx.beginPath();
 ctx.moveTo(fib.start.x, y);
 ctx.lineTo(fib.end.x, y);
 ctx.stroke();
 
 // Draw price label
 ctx.fillStyle = level.color;
 ctx.font = '11px monospace';
 ctx.textAlign = 'left';
 ctx.fillText(
 `${level.label} $${fibPrice.toFixed(2)}`, 
 fib.end.x + 5, 
 y + 4
 );
 });
 });
 
 ctx.setLineDash([]);
 }

 // Draw trend lines
 if (drawings.length > 0) {
 drawings.forEach(drawing => {
 ctx.strokeStyle = drawing.color || '#2196f3';
 ctx.lineWidth = 2;
 
 if (drawing.type === 'line') {
 ctx.beginPath();
 ctx.moveTo(drawing.start.x, drawing.start.y);
 ctx.lineTo(drawing.end.x, drawing.end.y);
 ctx.stroke();
 } else if (drawing.type === 'horizontal') {
 ctx.beginPath();
 ctx.moveTo(margin.left, drawing.start.y);
 ctx.lineTo(margin.left + chartWidth, drawing.start.y);
 ctx.stroke();
 
 // Add price label
 ctx.fillStyle = drawing.color || '#2196f3';
 ctx.font = '12px monospace';
 ctx.textAlign = 'left';
 ctx.fillText(
 `$${drawing.price.toFixed(2)}`,
 margin.left + chartWidth + 5,
 drawing.start.y + 4
 );
 }
 });
 }

 // Draw enhanced selected candle info with performance metrics
 if (selectedCandle) {
 const infoX = 10;
 const infoY = 10;
 const infoWidth = 280;
 const infoHeight = 160;
 
 // Enhanced background with border
 ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
 ctx.fillRect(infoX, infoY, infoWidth, infoHeight);
 ctx.strokeStyle = '#374151';
 ctx.lineWidth = 1;
 ctx.strokeRect(infoX, infoY, infoWidth, infoHeight);
 
 ctx.fillStyle = '#ffffff';
 ctx.font = '12px monospace';
 ctx.textAlign = 'left';
 
 // Basic OHLCV data
 ctx.fillText(`Open: $${selectedCandle.open.toFixed(2)}`, infoX + 10, infoY + 20);
 ctx.fillText(`High: $${selectedCandle.high.toFixed(2)}`, infoX + 10, infoY + 35);
 ctx.fillText(`Low: $${selectedCandle.low.toFixed(2)}`, infoX + 10, infoY + 50);
 ctx.fillText(`Close: $${selectedCandle.close.toFixed(2)}`, infoX + 10, infoY + 65);
 ctx.fillText(`Volume: ${selectedCandle.volume.toLocaleString()}`, infoX + 10, infoY + 80);
 
 // Performance metrics
 const change = selectedCandle.close - selectedCandle.open;
 const changePercent = (change / selectedCandle.open) * 100;
 const range = selectedCandle.high - selectedCandle.low;
 const rangePercent = (range / selectedCandle.open) * 100;
 
 ctx.fillStyle = change >= 0 ? '#10b981' : '#ef4444';
 ctx.fillText(`Change: ${change >= 0 ? '+' : ''}$${change.toFixed(2)} (${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%)`, infoX + 10, infoY + 95);
 
 ctx.fillStyle = '#ffffff';
 ctx.fillText(`Range: $${range.toFixed(2)} (${rangePercent.toFixed(2)}%)`, infoX + 10, infoY + 110);
 ctx.fillText(`Time: ${selectedCandle.date} ${selectedCandle.time}`, infoX + 10, infoY + 125);
 
 // Technical indicators for this candle (if available)
 if (selectedCandle.rsi) {
 ctx.fillStyle = selectedCandle.rsi > 70 ? '#ef4444' : selectedCandle.rsi < 30 ? '#10b981' : '#fbbf24';
 ctx.fillText(`RSI: ${selectedCandle.rsi.toFixed(1)}`, infoX + 10, infoY + 140);
 }
 }

 // Enhanced Features

 // Draw Volume Profile
 if (activeIndicators.includes('volumeProfile') && showVolumeProfile) {
 const profile = calculateVolumeProfile(visibleData);
 const maxVolume = Math.max(...profile.map(p => p.volume));
 const profileWidth = chartWidth * 0.2; // 20% of chart width
 
 profile.forEach(level => {
 const y = yScale(level.price);
 const barWidth = (level.volume / maxVolume) * profileWidth;
 
 ctx.fillStyle = 'rgba(95, 39, 205, 0.3)';
 ctx.fillRect(margin.left + chartWidth - barWidth, y - 2, barWidth, 4);
 
 // Price level label
 ctx.fillStyle = '#5f27cd';
 ctx.font = '10px monospace';
 ctx.textAlign = 'right';
 ctx.fillText(
 `$${level.price.toFixed(2)}`,
 margin.left + chartWidth - barWidth - 5,
 y + 3
 );
 });
 }

 // Draw Order Book simulation
 if (activeIndicators.includes('orderBook') && showOrderBook) {
 const currentPrice = visibleData[visibleData.length - 1]?.close || 0;
 const priceRange = maxPrice - minPrice;
 const levels = 10;
 
 // Level II order book data unavailable - requires real market data API
 console.error(' Level II order book data unavailable - requires real market data feed');
 }

 // Draw Bollinger Bands
 if (activeIndicators.includes('bollinger')) {
 const bands = calculateBollingerBands(visibleData);
 if (bands.length > 0) {
 // Upper band
 ctx.strokeStyle = 'rgba(254, 202, 87, 0.8)';
 ctx.lineWidth = 1;
 ctx.setLineDash([2, 2]);
 ctx.beginPath();
 bands.forEach((band, index) => {
 const x = xScale(index + 19);
 const y = yScale(band.upper);
 if (index === 0) ctx.moveTo(x, y);
 else ctx.lineTo(x, y);
 });
 ctx.stroke();
 
 // Lower band
 ctx.beginPath();
 bands.forEach((band, index) => {
 const x = xScale(index + 19);
 const y = yScale(band.lower);
 if (index === 0) ctx.moveTo(x, y);
 else ctx.lineTo(x, y);
 });
 ctx.stroke();
 
 // Fill between bands
 ctx.fillStyle = 'rgba(254, 202, 87, 0.1)';
 ctx.beginPath();
 bands.forEach((band, index) => {
 const x = xScale(index + 19);
 const y = yScale(band.upper);
 if (index === 0) ctx.moveTo(x, y);
 else ctx.lineTo(x, y);
 });
 bands.reverse().forEach((band, index) => {
 const x = xScale(bands.length - 1 - index + 19);
 const y = yScale(band.lower);
 ctx.lineTo(x, y);
 });
 ctx.closePath();
 ctx.fill();
 
 ctx.setLineDash([]);
 }
 }

 // Draw candle patterns
 if (activeIndicators.includes('candlePatterns') && showCandlePatterns) {
 const patterns = detectCandlePatterns(visibleData);
 patterns.forEach(pattern => {
 const x = xScale(pattern.index);
 const candle = visibleData[pattern.index];
 const y = yScale(candle.high);
 
 // Pattern indicator
 ctx.fillStyle = pattern.type === 'doji' ? '#fbbf24' :
 pattern.type === 'hammer' ? '#10b981' : '#3b82f6';
 ctx.font = '12px sans-serif';
 ctx.textAlign = 'center';
 ctx.fillText(pattern.type.toUpperCase(), x, y - 10);
 });
 }

 // Draw price alerts
 priceAlerts.forEach(alert => {
 if (!alert.active) return;
 
 const y = yScale(alert.price);
 const alertColor = alert.type === 'support' ? '#10b981' :
 alert.type === 'resistance' ? '#ef4444' : '#fbbf24';
 
 ctx.strokeStyle = alertColor;
 ctx.lineWidth = 2;
 ctx.setLineDash([5, 5]);
 ctx.beginPath();
 ctx.moveTo(margin.left, y);
 ctx.lineTo(margin.left + chartWidth, y);
 ctx.stroke();
 ctx.setLineDash([]);
 
 // Alert label
 ctx.fillStyle = alertColor;
 ctx.font = '10px sans-serif';
 ctx.textAlign = 'left';
 ctx.fillText(
 `${alert.label} ($${alert.price.toFixed(2)})`,
 margin.left + 5,
 y - 5
 );
 });

 // Performance monitoring
 const endTime = performance.now();
 const currentFps = 1000 / (endTime - startTime);
 setFps(Math.round(currentFps));
 setRenderTime(endTime - startTime);
 }, [data, zoom, pan, yZoom, yPan, crosshair, selectedCandle, activeIndicators, chartType, timeframe, 
 drawingMode, drawings, fibRetracements, height, chartSettings, priceAlerts, showVolumeProfile, 
 showOrderBook, showCandlePatterns]);

 // Mouse event handlers with enhanced Y-axis control
 const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
 if (!canvasRef.current || !containerRef.current) return;
 
 const canvas = canvasRef.current;
 const rect = canvas.getBoundingClientRect();
 const x = e.clientX - rect.left;
 const y = e.clientY - rect.top;
 
 setCrosshair({ x, y });
 
 // Handle panning
 if (isPanning && !isYPanning) {
 const deltaX = e.clientX - lastPanX;
 const sensitivity = 2;
 setPan(prev => Math.max(0, Math.min(data.length - Math.floor(data.length / zoom), prev - deltaX * sensitivity)));
 setLastPanX(e.clientX);
 } else if (isYPanning && !isPanning) {
 const deltaY = e.clientY - lastPanY;
 const sensitivity = 2;
 setYPan(prev => prev + deltaY * sensitivity);
 setLastPanY(e.clientY);
 }
 
 // Find selected candle based on mouse position
 if (data.length > 0) {
 const margin = { top: 30, right: 100, bottom: 80, left: 80 };
 const chartWidth = rect.width - margin.left - margin.right;
 const visibleDataCount = Math.floor(data.length / zoom);
 const startIndex = Math.max(0, Math.min(data.length - visibleDataCount, pan));
 const visibleData = data.slice(startIndex, startIndex + visibleDataCount);
 
 if (x >= margin.left && x <= margin.left + chartWidth && visibleData.length > 0) {
 const relativeX = x - margin.left;
 const candleIndex = Math.floor((relativeX / chartWidth) * visibleData.length);
 
 if (candleIndex >= 0 && candleIndex < visibleData.length) {
 setSelectedCandle(visibleData[candleIndex]);
 }
 }
 }
 }, [isPanning, isYPanning, lastPanX, lastPanY, data, zoom, pan]);

 const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
 if (e.button === 0) { // Left mouse button
 if (e.ctrlKey || e.metaKey) {
 // Y-axis panning with Ctrl/Cmd key
 setIsYPanning(true);
 setLastPanY(e.clientY);
 } else {
 // X-axis panning
 setIsPanning(true);
 setLastPanX(e.clientX);
 }
 }
 }, []);

 const handleMouseUp = useCallback(() => {
 setIsPanning(false);
 setIsYPanning(false);
 }, []);

 const handleMouseLeave = useCallback(() => {
 setCrosshair(null);
 setIsPanning(false);
 setIsYPanning(false);
 }, []);

 // Enhanced mouse wheel handler for X and Y zoom
 const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
 e.preventDefault();
 
 if (e.ctrlKey || e.metaKey) {
 // Y-axis zoom with Ctrl/Cmd key
 const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
 setYZoom(prev => Math.max(0.1, Math.min(10, prev * zoomFactor)));
 } else {
 // X-axis zoom (default)
 const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
 setZoom(prev => Math.max(0.1, Math.min(10, prev * zoomFactor)));
 }
 }, []);

 // Enhanced keyboard shortcuts
 const handleKeyDown = useCallback((e: KeyboardEvent) => {
 if (e.target !== document.body) return; // Only when not typing in inputs
 
 switch (e.key.toLowerCase()) {
 case 'f':
 // Auto-fit
 setZoom(1);
 setPan(0);
 setYZoom(1);
 setYPan(0);
 break;
 case 'r':
 // Refresh data
 fetchData(symbol, timeframe, range);
 break;
 case 'c':
 // Toggle crosshair
 setCrosshair(prev => prev ? null : { x: 0, y: 0 });
 break;
 case ' ':
 e.preventDefault();
 // Toggle fullscreen
 setIsFullscreen(prev => !prev);
 break;
 case 'escape':
 // Reset drawing mode
 setDrawingMode('none');
 setCrosshair(null);
 break;
 default:
 break;
 }
 }, [symbol, timeframe, range, fetchData]);

 // Click outside handler for dropdowns
 const handleClickOutside = useCallback((e: Event) => {
 const target = e.target as Element;
 if (!target.closest('.dropdown-container')) {
 setShowTimeframeDropdown(false);
 setShowRangeDropdown(false);
 setShowIndicatorDropdown(false);
 setShowToolsDropdown(false);
 }
 }, []);

 const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
 if (!canvasRef.current || drawingMode === 'none') return;
 
 const canvas = canvasRef.current;
 const rect = canvas.getBoundingClientRect();
 const x = e.clientX - rect.left;
 const y = e.clientY - rect.top;
 
 if (drawingMode === 'horizontal') {
 // Add horizontal line at current price
 const margin = { top: 30, right: 100, bottom: 80, left: 80 };
 const chartHeight = canvas.height - margin.top - margin.bottom - 80;
 
 if (data.length > 0) {
 const prices = data.flatMap(d => [d.high, d.low]);
 const minPrice = Math.min(...prices);
 const maxPrice = Math.max(...prices);
 const priceRange = maxPrice - minPrice;
 const padding = priceRange * 0.1;
 
 const adjustedMinPrice = minPrice - padding;
 const adjustedMaxPrice = maxPrice + padding;
 const price = adjustedMaxPrice - ((y - margin.top) / chartHeight) * (adjustedMaxPrice - adjustedMinPrice);
 
 setDrawings(prev => [...prev, {
 type: 'horizontal',
 start: { x, y },
 price,
 color: '#2196f3'
 }]);
 }
 }
 
 setDrawingMode('none');
 }, [drawingMode, data]);

 // Effects
 useEffect(() => {
 fetchData(symbol, timeframe, range);
 }, [symbol, timeframe, range, fetchData]);

 useEffect(() => {
 if (data.length > 0) {
 drawChart();
 }
 }, [drawChart]);

 useEffect(() => {
 const cleanup = startRealTimeUpdates();
 return cleanup;
 }, [startRealTimeUpdates]);

 useEffect(() => {
 window.addEventListener('keydown', handleKeyDown);
 return () => window.removeEventListener('keydown', handleKeyDown);
 }, [handleKeyDown]);

 useEffect(() => {
 document.addEventListener('mousedown', handleClickOutside);
 return () => document.removeEventListener('mousedown', handleClickOutside);
 }, [handleClickOutside]);

 useEffect(() => {
 setMarketSession(getMarketSession());
 const interval = setInterval(() => {
 setMarketSession(getMarketSession());
 }, 60000); // Check every minute
 
 return () => {
 clearInterval(interval);
 };
 }, []);

 // Search handler
 const handleSearch = () => {
 if (searchSymbol.trim() && onSymbolChange) {
 onSymbolChange(searchSymbol.trim().toUpperCase());
 }
 };

 const startTime = performance.now();

 return (
 <div className="w-full bg-black text-white rounded-3xl overflow-hidden shadow-2xl border-2 border-gray-800/80 relative">
 {/* 3D Candy Black Corner Effects */}
 <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-gray-800/20 via-transparent to-gray-900/40 pointer-events-none"></div>
 <div className="absolute top-0 left-0 w-8 h-8 bg-gradient-to-br from-gray-600/30 to-transparent rounded-br-3xl pointer-events-none"></div>
 <div className="absolute top-0 right-0 w-8 h-8 bg-gradient-to-bl from-gray-600/30 to-transparent rounded-bl-3xl pointer-events-none"></div>
 <div className="absolute bottom-0 left-0 w-8 h-8 bg-gradient-to-tr from-gray-600/30 to-transparent rounded-tr-3xl pointer-events-none"></div>
 <div className="absolute bottom-0 right-0 w-8 h-8 bg-gradient-to-tl from-gray-600/30 to-transparent rounded-tl-3xl pointer-events-none"></div>
 
 {/* Professional Header with Gradient Background */}
 <div className="bg-gradient-to-r from-slate-950 via-gray-950 to-slate-900 border-b border-slate-600/30 relative backdrop-blur-xl z-[100]">
 {/* Main Info Bar */}
 <div className="px-8 py-6 flex items-center justify-between">
 <div className="flex items-center space-x-8">
 {/* Professional Symbol Search */}
 <div className="flex items-center space-x-4">
 <div className="relative group">
 <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-purple-600/20 rounded-xl blur opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
 <input
 type="text"
 value={searchSymbol}
 onChange={(e) => setSearchSymbol(e.target.value.toUpperCase())}
 onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
 placeholder="Enter symbol..."
 className="relative w-56 px-5 py-3.5 bg-slate-800/80 backdrop-blur-sm text-white placeholder-slate-400 rounded-xl border border-slate-600/50 focus:border-blue-500/70 focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all duration-300 text-sm font-medium tracking-wide shadow-lg"
 />
 <div className="absolute inset-y-0 right-0 flex items-center pr-4">
 <Search className="w-4 h-4 text-slate-400 group-hover:text-blue-400 transition-colors duration-200" />
 </div>
 </div>
 </div>
 
 {/* Premium Stock Info Display */}
 <div className="flex items-center space-x-6">
 <div className="flex items-center space-x-4">
 <div className="flex items-center space-x-3">
 <span className="text-xl font-bold text-white tracking-tight">{symbol}</span>
 <div className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg font-medium text-sm backdrop-blur-sm border ${
 marketSession === 'regular' ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' :
 marketSession === 'pre' ? 'bg-blue-500/20 border-blue-500/30 text-blue-400' :
 marketSession === 'after' ? 'bg-purple-500/20 border-purple-500/30 text-purple-400' :
 'bg-gray-500/20 border-gray-500/30 text-gray-400'
 }`}>
 <div className={`w-2 h-2 rounded-full ${
 marketSession === 'regular' ? 'bg-emerald-400' :
 marketSession === 'pre' ? 'bg-blue-400' :
 marketSession === 'after' ? 'bg-purple-400' :
 'bg-gray-400'
 }`}></div>
 <span className="capitalize">{marketSession === 'regular' ? 'Live' : marketSession}</span>
 </div>
 </div>
 
 {currentPrice && (
 <div className="flex items-center space-x-4">
 <span className="text-2xl font-bold text-white tabular-nums">
 ${currentPrice.toFixed(2)}
 </span>
 <div className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg font-medium ${
 priceChange >= 0 
 ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
 : 'bg-red-500/20 text-red-400 border border-red-500/30'
 }`}>
 {priceChange >= 0 ? (
 <TrendingUp className="w-4 h-4" />
 ) : (
 <TrendingDown className="w-4 h-4" />
 )}
 <span className="tabular-nums">
 {priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)}
 </span>
 <span className="text-xs">
 ({priceChange >= 0 ? '+' : ''}{priceChangePercent.toFixed(2)}%)
 </span>
 </div>
 </div>
 )}
 </div>
 </div>
 </div>
 
 {/* Enhanced Controls */}
 <div className="flex items-center space-x-4">
 {/* Quick Actions */}
 <div className="flex items-center space-x-2">
 {QUICK_ACTIONS.map((action) => (
 <Button
 key={action.id}
 variant="ghost"
 size="sm"
 className="h-8 w-8 p-0 hover:bg-slate-700/50 text-slate-400 hover:text-white transition-all duration-200"
 onClick={() => {
 switch (action.id) {
 case 'autofit':
 setZoom(1);
 setPan(0);
 setYZoom(1);
 setYPan(0);
 break;
 case 'crosshair':
 setCrosshair(prev => prev ? null : { x: 0, y: 0 });
 break;
 case 'refresh':
 fetchData(symbol, timeframe, range);
 break;
 case 'fullscreen':
 setIsFullscreen(prev => !prev);
 break;
 }
 }}
 title={`${action.name} (${action.hotkey})`}
 >
 <action.icon className="w-4 h-4" />
 </Button>
 ))}
 </div>
 
 {/* Settings */}
 <Button
 variant="ghost"
 size="sm"
 className="h-8 w-8 p-0 hover:bg-slate-700/50 text-slate-400 hover:text-white transition-all duration-200"
 onClick={() => setShowSettingsPanel(!showSettingsPanel)}
 >
 <Settings className="w-4 h-4" />
 </Button>
 </div>
 </div>
 
 {/* Trading Controls Row */}
 <div className="px-8 pb-4 flex items-center justify-between border-t border-slate-700/30 pt-4">
 <div className="flex items-center space-x-6">
 {/* Timeframe Selector */}
 <div className="relative dropdown-container">
 <Button
 variant="ghost"
 size="sm"
 className="h-9 px-4 bg-slate-800/50 hover:bg-slate-700/50 text-white border border-slate-600/50 hover:border-slate-500/50 transition-all duration-200 font-medium z-[9999]"
 style={{ zIndex: 9999 }}
 onClick={() => setShowTimeframeDropdown(!showTimeframeDropdown)}
 >
 <span className="text-xs text-slate-300 mr-2">TIMEFRAME</span>
 <span className="font-bold">{timeframe.toUpperCase()}</span>
 <ChevronDown className="w-3 h-3 ml-2" />
 </Button>
 
 {showTimeframeDropdown && (
 <div className="absolute top-full left-0 mt-1 w-32 bg-slate-800/95 backdrop-blur-xl border border-slate-600/50 rounded-lg shadow-2xl z-[9999]" style={{ zIndex: 9999 }}>
 {ALL_TIMEFRAMES.map((tf) => (
 <button
 key={tf.value}
 className="w-full px-3 py-2 text-left text-sm text-white hover:bg-slate-700/50 first:rounded-t-lg last:rounded-b-lg transition-all duration-150"
 onClick={() => {
 setTimeframe(tf.value);
 setShowTimeframeDropdown(false);
 }}
 >
 {tf.label}
 </button>
 ))}
 </div>
 )}
 </div>

 {/* Range Selector */}
 <div className="relative dropdown-container">
 <Button
 variant="ghost"
 size="sm"
 className="h-9 px-4 bg-slate-800/50 hover:bg-slate-700/50 text-white border border-slate-600/50 hover:border-slate-500/50 transition-all duration-200 font-medium z-[9999]"
 style={{ zIndex: 9999 }}
 onClick={() => setShowRangeDropdown(!showRangeDropdown)}
 >
 <span className="text-xs text-slate-300 mr-2">RANGE</span>
 <span className="font-bold">{range}</span>
 <ChevronDown className="w-3 h-3 ml-2" />
 </Button>
 
 {showRangeDropdown && (
 <div className="absolute top-full left-0 mt-1 w-24 bg-slate-800/95 backdrop-blur-xl border border-slate-600/50 rounded-lg shadow-2xl z-[9999]" style={{ zIndex: 9999 }}>
 {RANGES.map((r) => (
 <button
 key={r.value}
 className="w-full px-3 py-2 text-left text-sm text-white hover:bg-slate-700/50 first:rounded-t-lg last:rounded-b-lg transition-all duration-150"
 onClick={() => {
 setRange(r.value);
 setShowRangeDropdown(false);
 }}
 >
 {r.label}
 </button>
 ))}
 </div>
 )}
 </div>

 {/* Chart Type Toggle */}
 <div className="flex items-center bg-slate-800/50 rounded-lg border border-slate-600/50 p-1">
 <Button
 variant={chartType === 'candlestick' ? 'default' : 'ghost'}
 size="sm"
 className="h-7 px-3 text-xs font-medium"
 onClick={() => setChartType('candlestick')}
 >
 <CandlestickChart className="w-3 h-3 mr-1" />
 Candles
 </Button>
 <Button
 variant={chartType === 'line' ? 'default' : 'ghost'}
 size="sm"
 className="h-7 px-3 text-xs font-medium"
 onClick={() => setChartType('line')}
 >
 <Activity className="w-3 h-3 mr-1" />
 Line
 </Button>
 </div>

 {/* Indicators */}
 <div className="relative dropdown-container">
 <Button
 variant="ghost"
 size="sm"
 className="h-9 px-4 bg-slate-800/50 hover:bg-slate-700/50 text-white border border-slate-600/50 hover:border-slate-500/50 transition-all duration-200 font-medium z-[9999]"
 style={{ zIndex: 9999 }}
 onClick={() => setShowIndicatorDropdown(!showIndicatorDropdown)}
 >
 <BarChart3 className="w-3 h-3 mr-2" />
 <span className="text-xs">INDICATORS</span>
 <span className="ml-2 px-1.5 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded">
 {activeIndicators.length}
 </span>
 <ChevronDown className="w-3 h-3 ml-2" />
 </Button>
 
 {showIndicatorDropdown && (
 <div className="absolute top-full left-0 mt-1 w-64 bg-slate-800/95 backdrop-blur-xl border border-slate-600/50 rounded-lg shadow-2xl z-[9999] max-h-80 overflow-y-auto" style={{ zIndex: 9999 }}>
 {INDICATORS.map((indicator) => {
 const isActive = activeIndicators.includes(indicator.id);
 return (
 <button
 key={indicator.id}
 className="w-full px-3 py-2 text-left text-sm text-white hover:bg-slate-700/50 first:rounded-t-lg last:rounded-b-lg transition-all duration-150 flex items-center justify-between"
 onClick={() => {
 setActiveIndicators(prev => 
 isActive 
 ? prev.filter(id => id !== indicator.id)
 : [...prev, indicator.id]
 );
 }}
 >
 <div className="flex items-center space-x-2">
 <div 
 className="w-3 h-3 rounded-full" 
 style={{ backgroundColor: indicator.color }}
 ></div>
 <span>{indicator.name}</span>
 </div>
 {isActive && (
 <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
 )}
 </button>
 );
 })}
 </div>
 )}
 </div>

 {/* Drawing Tools */}
 <div className="relative dropdown-container">
 <Button
 variant="ghost"
 size="sm"
 className="h-9 px-4 bg-slate-800/50 hover:bg-slate-700/50 text-white border border-slate-600/50 hover:border-slate-500/50 transition-all duration-200 font-medium z-[9999]"
 style={{ zIndex: 9999 }}
 onClick={() => setShowToolsDropdown(!showToolsDropdown)}
 >
 <Edit3 className="w-3 h-3 mr-2" />
 <span className="text-xs">TOOLS</span>
 <ChevronDown className="w-3 h-3 ml-2" />
 </Button>
 
 {showToolsDropdown && (
 <div className="absolute top-full left-0 mt-1 w-52 bg-slate-800/95 backdrop-blur-xl border border-slate-600/50 rounded-lg shadow-2xl z-[9999]" style={{ zIndex: 9999 }}>
 {DRAWING_TOOLS.map((tool) => (
 <button
 key={tool.id}
 className="w-full px-3 py-2 text-left text-sm text-white hover:bg-slate-700/50 first:rounded-t-lg last:rounded-b-lg transition-all duration-150 flex items-center space-x-2"
 onClick={() => {
 setDrawingMode(tool.id as any);
 setShowToolsDropdown(false);
 }}
 >
 <tool.icon className="w-3 h-3" />
 <span>{tool.name}</span>
 </button>
 ))}
 </div>
 )}
 </div>
 </div>
 
 {/* Performance Metrics */}
 <div className="flex items-center space-x-4 text-xs">
 <div className="flex items-center space-x-2">
 <div className={`w-2 h-2 rounded-full ${fps >= 50 ? 'bg-emerald-400' : fps >= 30 ? 'bg-yellow-400' : 'bg-red-400'}`}></div>
 <span className="text-slate-400">FPS:</span>
 <span className={`font-mono ${fps >= 50 ? 'text-emerald-400' : fps >= 30 ? 'text-yellow-400' : 'text-red-400'}`}>
 {fps}
 </span>
 </div>
 <div className="flex items-center space-x-2">
 <div className="w-2 h-2 rounded-full bg-blue-400"></div>
 <span className="text-slate-400">Points:</span>
 <span className="font-mono text-blue-400">{dataPoints.toLocaleString()}</span>
 </div>
 <div className="flex items-center space-x-2">
 <div className="w-2 h-2 rounded-full bg-purple-400"></div>
 <span className="text-slate-400">Render:</span>
 <span className="font-mono text-purple-400">{renderTime.toFixed(1)}ms</span>
 </div>
 </div>
 </div>
 
 {/* Settings Panel */}
 {showSettingsPanel && (
 <div className="absolute top-full right-8 mt-2 w-80 bg-slate-800/95 backdrop-blur-xl border border-slate-600/50 rounded-lg shadow-2xl z-[9999] p-6" style={{ zIndex: 9999 }}>
 <div className="flex items-center justify-between mb-4">
 <h3 className="text-lg font-semibold text-white">Chart Settings</h3>
 <Button
 variant="ghost"
 size="sm"
 className="h-6 w-6 p-0 text-slate-400 hover:text-white"
 onClick={() => setShowSettingsPanel(false)}
 >
 <X className="w-4 h-4" />
 </Button>
 </div>
 
 <div className="space-y-4">
 <div>
 <label className="block text-sm font-medium text-slate-300 mb-2">
 Theme
 </label>
 <div className="flex space-x-2">
 {Object.keys(CHART_THEMES).map((theme) => (
 <Button
 key={theme}
 variant={currentTheme === theme ? 'default' : 'ghost'}
 size="sm"
 className="capitalize"
 onClick={() => setCurrentTheme(theme as keyof typeof CHART_THEMES)}
 >
 {theme}
 </Button>
 ))}
 </div>
 </div>
 
 <div>
 <label className="block text-sm font-medium text-slate-300 mb-2">
 Auto Refresh ({refreshInterval / 1000}s)
 </label>
 <div className="flex items-center space-x-4">
 <input
 type="range"
 min="1000"
 max="30000"
 step="1000"
 value={refreshInterval}
 onChange={(e) => setRefreshInterval(Number(e.target.value))}
 className="flex-1"
 />
 <Button
 variant={autoRefresh ? 'default' : 'ghost'}
 size="sm"
 onClick={() => setAutoRefresh(!autoRefresh)}
 >
 {autoRefresh ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
 </Button>
 </div>
 </div>
 
 <div>
 <label className="block text-sm font-medium text-slate-300 mb-2">
 Quick Mode
 </label>
 <Button
 variant={quickMode ? 'default' : 'ghost'}
 size="sm"
 onClick={() => setQuickMode(!quickMode)}
 className="w-full"
 >
 {quickMode ? 'Enabled' : 'Disabled'}
 </Button>
 </div>
 </div>
 
 <div className="mt-6 pt-4 border-t border-slate-700/50">
 <h4 className="text-sm font-medium text-slate-300 mb-3">Performance</h4>
 <div className="space-y-3">
 <div className="flex items-center justify-between py-1">
 <div className="flex items-center space-x-2">
 <div className={`w-2 h-2 rounded-full ${fps >= 50 ? 'bg-emerald-400' : fps >= 30 ? 'bg-yellow-400' : 'bg-red-400'}`}></div>
 <span className="text-xs text-slate-300 font-medium">FPS</span>
 </div>
 <span className={`text-sm font-bold font-mono ${fps >= 50 ? 'text-emerald-400' : fps >= 30 ? 'text-yellow-400' : 'text-red-400'}`}>
 {fps}
 </span>
 </div>
 <div className="flex items-center justify-between py-1">
 <div className="flex items-center space-x-2">
 <div className="w-2 h-2 rounded-full bg-purple-400"></div>
 <span className="text-xs text-slate-300 font-medium">Render</span>
 </div>
 <span className="text-sm font-bold text-purple-400 font-mono">{renderTime.toFixed(1)}ms</span>
 </div>
 <div className="flex items-center justify-between py-1">
 <div className="flex items-center space-x-2">
 <div className="w-2 h-2 rounded-full bg-blue-400"></div>
 <span className="text-xs text-slate-300 font-medium">Data Points</span>
 </div>
 <span className="text-sm font-bold text-blue-400 font-mono">{dataPoints.toLocaleString()}</span>
 </div>
 </div>
 </div>
 </div>
 )}
 </div>

 {/* Chart */}
 <div ref={containerRef} className="relative z-[1] bg-black m-2 rounded-2xl shadow-inner">
 {/* Inner glow effect */}
 <div className="absolute inset-0 rounded-2xl shadow-inner bg-gradient-to-br from-gray-800/10 via-transparent to-gray-900/20 pointer-events-none"></div>
 <canvas
 ref={canvasRef}
 className="w-full cursor-crosshair relative z-[1] bg-black rounded-2xl"
 style={{ height: `${height}px`, backgroundColor: '#000000' }}
 onMouseMove={handleMouseMove}
 onMouseDown={handleMouseDown}
 onMouseUp={handleMouseUp}
 onMouseLeave={handleMouseLeave}
 onWheel={handleWheel}
 onClick={handleCanvasClick}
 />
 </div>
 </div>
 );
}
