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
 MousePointer,
 MoreHorizontal
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

// TradingView-style timeframes - clean and comprehensive 
const TRADINGVIEW_TIMEFRAMES = [
 { value: '1m', label: '1m' },
 { value: '5m', label: '5m' },
 { value: '15m', label: '15m' },
 { value: '30m', label: '30m' },
 { value: '1h', label: '1h' },
 { value: '4h', label: '4h' },
 { value: '1d', label: '1D' },
 { value: '1W', label: '1W' },
 { value: '1M', label: '1M' },
];

// Enhanced timeframe configurations optimized for performance
const TIMEFRAME_CONFIGS = {
 '1m': { label: '1m', lookbackDays: 1 }, // 1 day for 1min
 '3m': { label: '3m', lookbackDays: 2 }, // 2 days for 3min
 '5m': { label: '5m', lookbackDays: 5 }, // 5 days for 5min
 '15m': { label: '15m', lookbackDays: 15 }, // 15 days for 15min
 '30m': { label: '30m', lookbackDays: 30 }, // 30 days for 30min
 '1h': { label: '1h', lookbackDays: 60 }, // 60 days for 1hour
 '2h': { label: '2h', lookbackDays: 120 }, // 120 days for 2hour
 '4h': { label: '4h', lookbackDays: 240 }, // 240 days for 4hour
 '6h': { label: '6h', lookbackDays: 360 }, // 360 days for 6hour
 '12h': { label: '12h', lookbackDays: 720 }, // 720 days for 12hour
 '1d': { label: '1D', lookbackDays: 7124 }, // 19.5 years for daily (19.5 * 365.25)
 '3d': { label: '3D', lookbackDays: 1095 }, // 3 years for 3day
 '1W': { label: '1W', lookbackDays: 1825 }, // 5 years for weekly
 '1M': { label: '1M', lookbackDays: 3650 }, // 10 years for monthly
} as const;

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
 
 // Core state - Default to SPY Daily chart
 const [data, setData] = useState<CandleData[]>(initialData);
 const [timeframe, setTimeframe] = useState('1d');
 const [chartType, setChartType] = useState<'candlestick' | 'line'>('candlestick');
 const [activeIndicators, setActiveIndicators] = useState<string[]>(['volume']);
 const [loading, setLoading] = useState(false);
 const [currentPrice, setCurrentPrice] = useState<number | null>(null);
 const [priceChange, setPriceChange] = useState<number>(0);
 const [priceChangePercent, setPriceChangePercent] = useState<number>(0);
 const [searchSymbol, setSearchSymbol] = useState(symbol || 'SPY');
 
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
 
 // Simple chart navigation state - REBUILT FROM SCRATCH
 const [xZoom, setXZoom] = useState(1); // X-axis zoom only (1 = normal, 2 = 2x zoomed in)
 const [xOffset, setXOffset] = useState(0); // Horizontal scroll position
 const [yOffset, setYOffset] = useState(0); // Vertical scroll position
 const [crosshair, setCrosshair] = useState<{ x: number; y: number } | null>(null);
 const [selectedCandle, setSelectedCandle] = useState<CandleData | null>(null);
 
 // Simple drag state
 const [isDragging, setIsDragging] = useState(false);
 const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
 const [dragType, setDragType] = useState<'horizontal' | 'vertical' | 'none'>('none');

 // Drawing tools state
 const [drawingMode, setDrawingMode] = useState<'none' | 'line' | 'fibonacci' | 'horizontal' | 'trendline' | 'rectangle'>('none');
 const [drawings, setDrawings] = useState<any[]>([]);
 const [fibRetracements, setFibRetracements] = useState<any[]>([]);
 const [isDrawingFib, setIsDrawingFib] = useState(false);
 const [fibStartPoint, setFibStartPoint] = useState<{ x: number; y: number; price: number } | null>(null);

 // UI state for dropdowns and settings

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

 // Enhanced fetch data function - FORCE LIVE DATA ONLY
 const fetchData = useCallback(async (sym: string, tf: string) => {
 console.log(` Starting fetchData for ${sym} ${tf}`);
 const startTime = performance.now();
 const lookbackDays = TIMEFRAME_CONFIGS[tf as keyof typeof TIMEFRAME_CONFIGS]?.lookbackDays || 365;
 
 console.log(` Setting loading to TRUE for ${sym} ${tf}`);
 setLoading(true);
 try {
 // FORCE FRESH DATA - NO CACHING FOR PRICING
 const timestamp = Date.now();
 const apiUrl = `/api/stock-data?symbol=${sym}&timeframe=${tf}&lookbackDays=${lookbackDays}&_t=${timestamp}`;
 console.log(` Fetching: ${apiUrl}`);
 
 const response = await fetch(apiUrl);
 console.log(` Response status: ${response.status}`);
 
 const result = await response.json();
 console.log(` Received data:`, result.data?.length || 0, 'bars');
 
 if (result.data && Array.isArray(result.data)) {
 console.log(` Processing ${result.data.length} data points...`);
 setData(result.data);
 setDataPoints(result.data.length);
 console.log(` Data loaded: ${result.data.length} bars for ${sym} ${tf}`);
 
 // FORCE LIVE PRICE from Polygon API directly
 try {
 const realtimeResponse = await fetch(`/api/realtime-quotes?symbol=${sym}&_t=${timestamp}`);
 const realtimeText = await realtimeResponse.text();
 
 // Parse the SSE response to get the live quote
 const lines = realtimeText.split('\n');
 for (const line of lines) {
 if (line.startsWith('data: ')) {
 try {
 const data = JSON.parse(line.substring(6));
 if (data.quotes && data.quotes.length > 0) {
 const quote = data.quotes[0];
 setCurrentPrice(quote.price);
 
 // Calculate change based on chart data
 if (result.data.length > 0) {
 const lastClose = result.data[result.data.length - 1].close;
 const previousClose = result.data.length > 1 ? result.data[result.data.length - 2].close : lastClose;
 const change = quote.price - previousClose;
 const changePercent = ((change / previousClose) * 100);
 
 setPriceChange(change);
 setPriceChangePercent(changePercent);
 
 console.log(` ${sym} [${tf}] - LIVE PRICE: $${quote.price.toFixed(2)} (Change: ${changePercent.toFixed(2)}%)`);
 }
 break;
 }
 } catch (parseError) {
 console.warn('Failed to parse realtime data:', parseError);
 }
 }
 }
 } catch (realtimeError) {
 console.warn('Failed to fetch live price, using API fallback:', realtimeError);
 if (result.meta) {
 setCurrentPrice(result.meta.currentPrice);
 setPriceChange(result.meta.priceChange);
 setPriceChangePercent(result.meta.priceChangePercent);
 }
 }
 } else {
 console.error('Invalid data format received:', result);
 setData([]);
 setDataPoints(0);
 }
 } catch (error) {
 console.error(' FETCH ERROR:', error);
 setData([]);
 setDataPoints(0);
 } finally {
 console.log(` Setting loading to FALSE for ${sym} ${tf}`);
 setLoading(false);
 const endTime = performance.now();
 setRenderTime(endTime - startTime);
 }
 }, []);

 // Performance-optimized real-time updates with consistent pricing
 const startRealTimeUpdates = useCallback(() => {
 if (!isRealtime || !autoRefresh) return;
 
 const interval = setInterval(() => {
 if (quickMode) {
 // In quick mode, ensure consistent pricing across all timeframes
 fetch(`/api/realtime-quotes?symbol=${symbol}`)
 .then(res => res.json())
 .then(realtimeData => {
 if (realtimeData.quotes && realtimeData.quotes.length > 0) {
 const quote = realtimeData.quotes[0];
 setCurrentPrice(quote.price);
 
 // Calculate consistent change based on current chart data
 if (data.length > 0) {
 const previousClose = data.length > 1 ? data[data.length - 2].close : data[data.length - 1].close;
 const change = quote.price - previousClose;
 const changePercent = ((change / previousClose) * 100);
 
 setPriceChange(change);
 setPriceChangePercent(changePercent);
 
 console.log(` [${timeframe}] Real-time update: ${symbol} $${quote.price.toFixed(2)} (${changePercent.toFixed(2)}%)`);
 }
 }
 })
 .catch(console.error);
 } else {
 // Full data refresh with consistent pricing
 fetchData(symbol, timeframe);
 }
 }, refreshInterval);
 
 return () => clearInterval(interval);
 }, [isRealtime, autoRefresh, quickMode, symbol, timeframe, refreshInterval, fetchData, data]);

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
 // Get current time in PST (Pacific Standard Time)
 const now = new Date();
 const pstTime = new Date(now.toLocaleString("en-US", {timeZone: "America/Los_Angeles"}));
 const hours = pstTime.getHours();
 const minutes = pstTime.getMinutes();
 const time = hours * 100 + minutes;
 
 // US Market hours in PST:
 // Pre-market: 1:00 AM - 6:30 AM PST
 // Regular: 6:30 AM - 1:00 PM PST 
 // After-hours: 1:00 PM - 5:00 PM PST
 if (time >= 630 && time < 1300) return 'regular'; // 6:30 AM - 1:00 PM PST
 if (time >= 100 && time < 630) return 'pre'; // 1:00 AM - 6:30 AM PST
 if (time >= 1300 && time < 1700) return 'after'; // 1:00 PM - 5:00 PM PST
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

 // Calculate visible data range based on xZoom and xOffset
 const barWidth = 8 * xZoom; // Apply zoom to bar width (8 base pixels per bar)
 const barsVisible = Math.floor(chartWidth / barWidth);
 const startIndex = Math.max(0, xOffset);
 const endIndex = Math.min(data.length, startIndex + barsVisible);
 const visibleData = data.slice(startIndex, endIndex);

 if (visibleData.length === 0) return;

 // Calculate price range with Y-axis offset
 const prices = visibleData.flatMap(d => [d.high, d.low]);
 const minPrice = Math.min(...prices);
 const maxPrice = Math.max(...prices);
 const basePriceRange = maxPrice - minPrice;
 const padding = basePriceRange * 0.1;
 
 // Apply simple Y-axis zoom (keep it simple for now)
 const zoomedPriceRange = basePriceRange + 2 * padding;
 
 // Calculate the center price for panning
 const centerPrice = (minPrice + maxPrice) / 2;
 
 // Apply Y-axis pan offset (simple pixel offset)
 const panOffset = yOffset * 0.01; // Scale pan to be relative to price range
 
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
 
 // Smart horizontal grid lines based on Y-axis price intervals
 const priceRange = adjustedMaxPrice - adjustedMinPrice;
 const getSmartInterval = (range: number) => {
 if (range >= 100) return 10;
 if (range >= 50) return 5;
 if (range >= 20) return 2;
 if (range >= 10) return 1;
 if (range >= 5) return 0.5;
 if (range >= 2) return 0.25;
 return 0.25;
 };
 
 const interval = getSmartInterval(priceRange);
 const startPrice = Math.floor(adjustedMinPrice / interval) * interval;
 const endPrice = Math.ceil(adjustedMaxPrice / interval) * interval;
 
 for (let price = startPrice; price <= endPrice; price += interval) {
 if (price >= adjustedMinPrice && price <= adjustedMaxPrice) {
 const y = Math.floor(yScale(price)) + 0.5;
 ctx.beginPath();
 ctx.moveTo(margin.left, y);
 ctx.lineTo(margin.left + chartWidth, y);
 ctx.stroke();
 }
 }
 
 // Vertical grid lines (time-based)
 const gridLines = Math.min(10, visibleData.length);
 for (let i = 0; i <= gridLines; i++) {
 const x = Math.floor(margin.left + (chartWidth / gridLines) * i) + 0.5;
 ctx.beginPath();
 ctx.moveTo(x, margin.top);
 ctx.lineTo(x, margin.top + chartHeight);
 ctx.stroke();
 }
 }

 // Draw price labels (Y-axis) with smart formatting
 ctx.fillStyle = chartSettings.axisTextColor;
 ctx.font = `${chartSettings.axisTextSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
 ctx.textAlign = 'left';
 ctx.textBaseline = 'middle';
 
 // Smart Y-axis price intervals
 const priceRange = adjustedMaxPrice - adjustedMinPrice;
 const getSmartInterval = (range: number) => {
 if (range >= 100) return 10; // $10 intervals for large ranges
 if (range >= 50) return 5; // $5 intervals
 if (range >= 20) return 2; // $2 intervals
 if (range >= 10) return 1; // $1 intervals
 if (range >= 5) return 0.5; // $0.50 intervals
 if (range >= 2) return 0.25; // $0.25 intervals (minimum as requested)
 return 0.25; // Always use $0.25 as minimum interval
 };
 
 const interval = getSmartInterval(priceRange);
 const startPrice = Math.floor(adjustedMinPrice / interval) * interval;
 const endPrice = Math.ceil(adjustedMaxPrice / interval) * interval;
 
 for (let price = startPrice; price <= endPrice; price += interval) {
 if (price >= adjustedMinPrice && price <= adjustedMaxPrice) {
 const y = yScale(price);
 const formattedPrice = interval >= 1 ? 
 `$${price.toFixed(0)}` : 
 `$${price.toFixed(2)}`;
 ctx.fillText(formattedPrice, margin.left + chartWidth + 10, y);
 }
 }

 // Draw X-axis (time labels) with correct chronological order
 ctx.textAlign = 'center';
 ctx.textBaseline = 'top';
 
 // Sort visible data by timestamp to ensure proper time ordering (oldest to newest)
 const sortedData = [...visibleData].sort((a, b) => a.timestamp - b.timestamp);
 
 // Smart X-axis labeling - show 5-6 evenly spaced time labels
 const maxLabels = 6;
 const labelInterval = Math.max(1, Math.floor(sortedData.length / maxLabels));
 const labeledTimes = new Set();
 
 for (let i = 0; i < sortedData.length; i += labelInterval) {
 const candle = sortedData[i];
 if (!candle) continue;
 
 // Find the original index in visibleData for positioning
 const originalIndex = visibleData.findIndex(c => c.timestamp === candle.timestamp);
 if (originalIndex === -1) continue;
 
 const x = xScale(originalIndex);
 const date = new Date(candle.timestamp);
 
 let timeLabel = '';
 let labelKey = '';
 
 // Smart time formatting based on timeframe - All in PST (California time)
 switch (timeframe) {
 case '1m':
 case '5m':
 timeLabel = date.toLocaleTimeString('en-US', { 
 hour: '2-digit', 
 minute: '2-digit',
 hour12: false,
 timeZone: 'America/Los_Angeles'
 });
 labelKey = `${date.getHours()}:${date.getMinutes()}`;
 break;
 
 case '15m':
 case '30m':
 timeLabel = date.toLocaleTimeString('en-US', { 
 hour: '2-digit', 
 minute: '2-digit',
 hour12: false,
 timeZone: 'America/Los_Angeles'
 });
 labelKey = `${date.getHours()}:${Math.floor(date.getMinutes() / 30) * 30}`;
 break;
 
 case '1h':
 case '2h':
 case '4h':
 timeLabel = date.toLocaleTimeString('en-US', { 
 hour: '2-digit', 
 minute: '2-digit',
 hour12: false,
 timeZone: 'America/Los_Angeles'
 });
 labelKey = `${date.getHours()}:00`;
 break;
 
 case '1d':
 timeLabel = date.toLocaleDateString('en-US', { 
 month: 'short', 
 day: 'numeric',
 timeZone: 'America/Los_Angeles'
 });
 labelKey = `${date.getMonth()}-${date.getDate()}`;
 break;
 
 case '1W':
 case '1M':
 timeLabel = date.toLocaleDateString('en-US', { 
 month: 'short', 
 day: 'numeric',
 timeZone: 'America/Los_Angeles'
 });
 labelKey = `${date.getMonth()}-${date.getDate()}`;
 break;
 
 default:
 timeLabel = date.toLocaleTimeString('en-US', { 
 hour: '2-digit', 
 minute: '2-digit',
 hour12: false,
 timeZone: 'America/Los_Angeles'
 });
 labelKey = timeLabel;
 }
 
 // Prevent duplicate labels
 if (labeledTimes.has(labelKey)) continue;
 labeledTimes.add(labelKey);
 
 // Draw the time label
 ctx.fillText(timeLabel, x, margin.top + chartHeight + 10);
 }

 // Draw candlesticks or line chart with high quality
 if (chartType === 'candlestick') {
 const candleWidth = Math.max(2, barWidth * 0.8); // Use zoom-aware bar width
 
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

 // Draw volume bars with crisp rendering above X-axis (time axis)
 if (activeIndicators.includes('volume')) {
 const volumeBaseY = margin.top + chartHeight + 10; // Position above X-axis labels
 const maxVolumeHeight = 50; // Maximum height for volume bars
 
 visibleData.forEach((candle, index) => {
 const x = Math.floor(xScale(index));
 const volumeHeight = Math.floor(volumeScale(candle.volume) * 0.6); // Scale down for better fit
 const isGreen = candle.close >= candle.open;
 
 // Use the same colors as candles for consistency
 ctx.fillStyle = isGreen ? 'rgba(0, 255, 64, 0.8)' : 'rgba(255, 0, 0, 0.8)';
 // Draw upward from the base position
 ctx.fillRect(x - 2, volumeBaseY - Math.min(volumeHeight, maxVolumeHeight), 4, Math.min(volumeHeight, maxVolumeHeight));
 });
 
 // Volume label with white text to match theme
 ctx.fillStyle = '#ffffff';
 ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
 ctx.textAlign = 'left';
 ctx.textBaseline = 'top';
 ctx.fillText('Volume', margin.left, volumeBaseY + 5);
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

 // Draw zoom and navigation info in top-right corner
 ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
 ctx.fillRect(rect.width - 160, 10, 150, 60);
 ctx.strokeStyle = '#f59e0b';
 ctx.strokeRect(rect.width - 160, 10, 150, 60);
 
 ctx.fillStyle = '#ffffff';
 ctx.font = '12px monospace';
 ctx.textAlign = 'left';
 ctx.fillText(`Zoom: ${xZoom.toFixed(1)}x`, rect.width - 150, 30);
 ctx.fillText(`Bars: ${barsVisible}`, rect.width - 150, 45);
 ctx.fillText(`Offset: ${xOffset}`, rect.width - 150, 60);

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
 }, [data, xZoom, xOffset, yOffset, crosshair, selectedCandle, activeIndicators, chartType, timeframe, 
 drawingMode, drawings, fibRetracements, height, chartSettings, priceAlerts, showVolumeProfile, 
 showOrderBook, showCandlePatterns]);

 // Mouse event handlers with enhanced Y-axis control
 // Simple mouse move handler for crosshair and candle selection
 const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
 if (!canvasRef.current || !containerRef.current) return;
 
 const canvas = canvasRef.current;
 const rect = canvas.getBoundingClientRect();
 const x = e.clientX - rect.left;
 const y = e.clientY - rect.top;
 
 setCrosshair({ x, y });
 
 // Handle drag movement with automatic direction detection
 if (isDragging && dragStart) {
 const deltaX = e.clientX - dragStart.x;
 const deltaY = e.clientY - dragStart.y;
 
 // Auto-detect drag direction if not set yet
 if (dragType === 'none') {
 const absX = Math.abs(deltaX);
 const absY = Math.abs(deltaY);
 
 if (absX > 5 || absY > 5) { // 5px threshold to start dragging
 if (absX > absY) {
 setDragType('horizontal');
 } else {
 setDragType('vertical');
 }
 }
 }
 
 if (dragType === 'horizontal') {
 // Horizontal scroll - use dynamic bar width based on zoom
 const barWidth = 8 * xZoom; // Apply zoom to bar width
 const barDelta = Math.floor(deltaX / barWidth);
 setXOffset(prev => Math.max(0, Math.min(data.length - 50, prev - barDelta))); // 50 min bars visible
 setDragStart({ x: e.clientX, y: e.clientY });
 } else if (dragType === 'vertical') {
 // Vertical price movement - more sensitive
 setYOffset(prev => prev + deltaY * 1.0); // Increased sensitivity
 setDragStart({ x: e.clientX, y: e.clientY });
 }
 }
 
 // Find selected candle
 if (data.length > 0) {
 const margin = { top: 30, right: 100, bottom: 80, left: 80 };
 const chartWidth = rect.width - margin.left - margin.right;
 const barWidth = 8 * xZoom; // Apply zoom to bar width
 const barsVisible = Math.floor(chartWidth / barWidth);
 const startIndex = Math.max(0, xOffset);
 const visibleData = data.slice(startIndex, startIndex + barsVisible);
 
 if (x >= margin.left && x <= margin.left + chartWidth && visibleData.length > 0) {
 const relativeX = x - margin.left;
 const candleIndex = Math.floor(relativeX / barWidth); // Use dynamic bar width
 
 if (candleIndex >= 0 && candleIndex < visibleData.length) {
 setSelectedCandle(visibleData[candleIndex]);
 }
 }
 }
 }, [isDragging, dragStart, dragType, data.length, xOffset, xZoom]);

 // Simple mouse down handler for drag start
 const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
 if (e.button === 0) { // Left mouse button
 setIsDragging(true);
 setDragStart({ x: e.clientX, y: e.clientY });
 
 // Start with no direction, let movement determine the drag type
 setDragType('none');
 }
 }, []);

 // Simple mouse up handler for drag end
 const handleMouseUp = useCallback(() => {
 setIsDragging(false);
 setDragStart(null);
 setDragType('none');
 }, []);

 const handleMouseLeave = useCallback(() => {
 setCrosshair(null);
 setIsDragging(false);
 setDragStart(null);
 setDragType('none');
 }, []);

 // Simple mouse wheel handler
 const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
 e.preventDefault();
 
 if (e.shiftKey) {
 // Horizontal scrolling with Shift key
 const scrollAmount = e.deltaY > 0 ? 5 : -5;
 setXOffset(prev => Math.max(0, Math.min(data.length - 50, prev + scrollAmount)));
 } else if (e.ctrlKey || e.metaKey) {
 // Vertical price zoom with Ctrl/Cmd key
 const zoomFactor = e.deltaY > 0 ? 1.15 : 0.87;
 const newYOffset = yOffset * zoomFactor;
 setYOffset(newYOffset);
 } else {
 // X-axis zoom (default)
 const zoomFactor = e.deltaY > 0 ? 1.15 : 0.87;
 setXZoom(prev => Math.max(0.1, Math.min(20, prev * zoomFactor)));
 }
 }, [data.length, xZoom, yOffset]);

 // Simple keyboard shortcuts
 const handleKeyDown = useCallback((e: KeyboardEvent) => {
 if (e.target !== document.body) return; // Only when not typing in inputs
 
 switch (e.key.toLowerCase()) {
 case 'f':
 // Auto-fit - reset all zoom and offsets
 setXZoom(1);
 setXOffset(0);
 setYOffset(0);
 break;
 case '=':
 case '+':
 // Zoom in
 setXZoom(prev => Math.min(20, prev * 1.25));
 break;
 case '-':
 case '_':
 // Zoom out
 setXZoom(prev => Math.max(0.1, prev * 0.8));
 break;
 case 'arrowleft':
 // Scroll left
 setXOffset(prev => Math.max(0, prev - 10));
 break;
 case 'arrowright':
 // Scroll right
 setXOffset(prev => Math.min(data.length - 50, prev + 10));
 break;
 case 'r':
 // Refresh data
 fetchData(symbol, timeframe);
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
 }, [symbol, timeframe, fetchData]);

 // Click outside handler for dropdowns
 const handleClickOutside = useCallback((e: Event) => {
 const target = e.target as Element;
 if (!target.closest('.dropdown-container')) {
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

 // Effects with price synchronization
 useEffect(() => {
 fetchData(symbol, timeframe);
 
 // Ensure price consistency when switching timeframes
 const syncPrice = async () => {
 try {
 const realtimeResponse = await fetch(`/api/realtime-quotes?symbol=${symbol}`);
 const realtimeResult = await realtimeResponse.json();
 
 if (realtimeResult.quotes && realtimeResult.quotes.length > 0) {
 const quote = realtimeResult.quotes[0];
 setCurrentPrice(quote.price);
 console.log(` Synced price for ${symbol} [${timeframe}]: $${quote.price.toFixed(2)}`);
 }
 } catch (error) {
 console.warn('Failed to sync price on timeframe change:', error);
 }
 };
 
 // Sync price after a short delay to ensure chart data is loaded
 setTimeout(syncPrice, 500);
 }, [symbol, timeframe, fetchData]);

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

 // Search handler - trigger symbol change through parent
 const handleSearch = () => {
 if (searchSymbol.trim()) {
 const newSymbol = searchSymbol.trim().toUpperCase();
 if (onSymbolChange) {
 onSymbolChange(newSymbol);
 }
 setSearchSymbol(''); // Clear the search box
 console.log(` Searching for: ${newSymbol}`);
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
 
 {/* Enhanced Professional Header */}
 <div className="bg-black border-b-2 border-orange-500/60 shadow-lg shadow-orange-500/20">
 {/* Single Row - All Controls */}
 <div className="px-8 py-6 flex items-center justify-between">
 {/* Left: Symbol & Price Info */}
 <div className="flex items-center space-x-8">
 <div className="flex items-center space-x-6">
 {/* Symbol Search */}
 <div className="relative">
 <input
 type="text"
 value={searchSymbol}
 onChange={(e) => setSearchSymbol(e.target.value.toUpperCase())}
 onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
 placeholder="Symbol..."
 className="w-36 px-5 py-3 bg-black text-white placeholder-gray-400 rounded-xl border-2 border-orange-500/60 focus:border-orange-400 focus:outline-none text-lg font-semibold shadow-lg shadow-orange-500/10"
 />
 </div>

 {/* Symbol Display */}
 <div className="flex items-center space-x-4">
 <span className="text-3xl font-bold text-white">{symbol}</span>
 <div className={`px-4 py-2 rounded-xl text-base font-bold border-2 ${
 marketSession === 'regular' ? 'bg-black border-green-500 text-green-400' :
 marketSession === 'pre' ? 'bg-black border-blue-500 text-blue-400' :
 marketSession === 'after' ? 'bg-black border-purple-500 text-purple-400' :
 'bg-black border-gray-500 text-gray-400'
 }`}>
 {marketSession === 'regular' ? 'LIVE' : marketSession.toUpperCase()}
 </div>
 </div>

 {/* Price Info */}
 {currentPrice && (
 <div className="flex items-center space-x-6">
 <span className="text-3xl font-bold text-white">
 ${currentPrice.toFixed(2)}
 </span>
 <div className={`flex items-center space-x-3 px-4 py-2 rounded-xl border-2 ${
 priceChange >= 0 
 ? 'bg-black border-green-500 text-green-400' 
 : 'bg-black border-red-500 text-red-400'
 }`}>
 {priceChange >= 0 ? (
 <TrendingUp className="w-5 h-5" />
 ) : (
 <TrendingDown className="w-5 h-5" />
 )}
 <span className="text-lg font-bold">
 {priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)}
 </span>
 <span className="text-base font-semibold">
 ({priceChange >= 0 ? '+' : ''}{priceChangePercent.toFixed(2)}%)
 </span>
 </div>
 </div>
 )}
 </div>
 </div>
 
 {/* Center: TradingView-Style Timeframe Selector */}
 <div className="flex items-center justify-center">
 <div className="bg-[#131722] border border-[#2a2e39] rounded-lg px-2 py-1 flex items-center space-x-1">
 {TRADINGVIEW_TIMEFRAMES.map((tf) => (
 <button
 key={tf.value}
 className={`px-3 py-2 text-sm font-medium rounded-md transition-all duration-200 min-w-[40px] ${
 timeframe === tf.value
 ? 'bg-[#2962ff] text-white shadow-sm'
 : 'text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#2a2e39]'
 }`}
 onClick={() => {
 setTimeframe(tf.value);
 if (symbol) {
 fetchData(symbol, tf.value);
 }
 }}
 >
 {tf.label}
 </button>
 ))}
 </div>
 </div>

 <div className="flex items-center space-x-10">
 {/* Chart Type */}
 <div className="bg-black border-2 border-orange-500/80 rounded-2xl p-3 shadow-xl shadow-orange-500/20">
 <div className="flex items-center space-x-2"
>
 <Button
 variant={chartType === 'candlestick' ? 'default' : 'ghost'}
 size="lg"
 className={`h-12 px-6 text-lg font-bold min-w-[140px] rounded-xl border-2 transition-all ${
 chartType === 'candlestick'
 ? 'bg-orange-500 text-black border-orange-400 shadow-lg shadow-orange-500/30'
 : 'bg-black text-white border-orange-500/60 hover:border-orange-400 hover:bg-orange-500/10'
 }`}
 onClick={() => setChartType('candlestick')}
 >
 <CandlestickChart className="w-6 h-6 mr-3" />
 CANDLES
 </Button>
 <Button
 variant={chartType === 'line' ? 'default' : 'ghost'}
 size="lg"
 className={`h-12 px-6 text-lg font-bold min-w-[140px] rounded-xl border-2 transition-all ${
 chartType === 'line'
 ? 'bg-orange-500 text-black border-orange-400 shadow-lg shadow-orange-500/30'
 : 'bg-black text-white border-orange-500/60 hover:border-orange-400 hover:bg-orange-500/10'
 }`}
 onClick={() => setChartType('line')}
 >
 <Activity className="w-6 h-6 mr-3" />
 LINE
 </Button>
 </div>
 </div>
 </div>

 {/* Right: Advanced Controls & Settings */}
 <div className="flex items-center space-x-8">
 {/* Indicators */}
 <div className="relative dropdown-container">
 <Button
 variant="ghost"
 size="lg"
 className="h-12 px-6 bg-black text-white border-2 border-orange-500/80 hover:border-orange-400 hover:bg-orange-500/10 z-[9999] text-lg font-bold rounded-2xl shadow-xl shadow-orange-500/20 transition-all"
 style={{ zIndex: 9999 }}
 onClick={() => setShowIndicatorDropdown(!showIndicatorDropdown)}
 >
 <BarChart3 className="w-6 h-6 mr-3" />
 INDICATORS
 {activeIndicators.length > 0 && (
 <span className="ml-3 w-7 h-7 bg-orange-500 text-black text-sm rounded-full flex items-center justify-center font-bold shadow-lg">
 {activeIndicators.length}
 </span>
 )}
 <ChevronDown className="w-6 h-6 ml-3" />
 </Button>
 
 {showIndicatorDropdown && (
 <div className="absolute top-full right-0 mt-2 w-60 bg-black border-2 border-orange-500/80 rounded-xl shadow-2xl shadow-orange-500/20 z-[9999] max-h-64 overflow-y-auto" style={{ zIndex: 9999 }}>
 {INDICATORS.map((indicator) => {
 const isActive = activeIndicators.includes(indicator.id);
 return (
 <button
 key={indicator.id}
 className="w-full px-4 py-3 text-left text-base font-bold text-white hover:bg-orange-500/20 first:rounded-t-xl last:rounded-b-xl flex items-center justify-between border-b border-orange-500/30 last:border-b-0"
 onClick={() => {
 setActiveIndicators(prev => 
 isActive 
 ? prev.filter(id => id !== indicator.id)
 : [...prev, indicator.id]
 );
 }}
 >
 <div className="flex items-center space-x-3">
 <div 
 className="w-3 h-3 rounded-full border-2 border-white" 
 style={{ backgroundColor: indicator.color }}
 ></div>
 <span>{indicator.name}</span>
 </div>
 {isActive && (
 <div className="w-3 h-3 bg-orange-500 rounded-full border-2 border-white"></div>
 )}
 </button>
 );
 })}
 </div>
 )}
 </div>

 {/* Settings Button */}
 <Button
 variant="ghost"
 size="lg"
 className="h-12 w-12 p-0 bg-black text-white border-2 border-orange-500/80 hover:border-orange-400 hover:bg-orange-500/10 rounded-2xl shadow-xl shadow-orange-500/20 transition-all"
 onClick={() => setShowSettingsPanel(!showSettingsPanel)}
 >
 <Settings className="w-7 h-7" />
 </Button>
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
 </div>
 )}
 </div>

 {/* Chart */}
 <div ref={containerRef} className="relative z-[1] bg-black m-2 rounded-2xl shadow-inner">
 {/* Loading Overlay */}
 {loading && (
 <div className="absolute inset-0 z-[999] bg-black/80 rounded-2xl flex items-center justify-center">
 <div className="bg-[#131722] border border-[#2a2e39] rounded-lg p-6 flex items-center space-x-3">
 <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#2962ff]"></div>
 <span className="text-white text-lg font-medium">Loading {timeframe} data...</span>
 </div>
 </div>
 )}
 
 {/* Inner glow effect */}
 <div className="absolute inset-0 rounded-2xl shadow-inner bg-gradient-to-br from-gray-800/10 via-transparent to-gray-900/20 pointer-events-none"></div>
 <canvas
 ref={canvasRef}
 className={`w-full relative z-[1] bg-black rounded-2xl ${
 isDragging ? 'cursor-grabbing' : 'cursor-crosshair'
 }`}
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
