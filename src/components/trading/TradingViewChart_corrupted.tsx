'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';

// TradingView-style Chart Data Interface
interface ChartDataPoint {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  date: string;
  time: string;
}

// TradingView-style Chart Configuration
interface ChartConfig {
  symbol: string;
  timeframe: string;
  chartType: 'candlestick' | 'line' | 'area' | 'bars' | 'hollow_candles';
  theme: 'dark' | 'light';
  indicators: string[];
  drawings: any[];
  volume: boolean;
  crosshair: boolean;
  timezone: string;
  showGrid: boolean;
  axisStyle: {
    xAxis: {
      textSize: number;
      textColor: string;
    };
    yAxis: {
      textSize: number;
      textColor: string;
    };
  };
  colors: {
    bullish: {
      body: string;
      wick: string;
      border: string;
    };
    bearish: {
      body: string;
      wick: string;
      border: string;
    };
    volume: {
      bullish: string;
      bearish: string;
    };
  };
}

// TradingView Timeframes with proper lookback periods to match TradingView
const TRADINGVIEW_TIMEFRAMES = [
  { label: '1m', value: '1m', lookback: 5 }, // 5 days for 1-minute data
  { label: '5m', value: '5m', lookback: 30 }, // 30 days for 5-minute data
  { label: '15m', value: '15m', lookback: 90 }, // 90 days for 15-minute data  
  { label: '30m', value: '30m', lookback: 180 }, // 180 days for 30-minute data
  { label: '1H', value: '1h', lookback: 365 }, // 1 year for hourly data
  { label: '4H', value: '4h', lookback: 1460 }, // 4 years for 4-hour data (within 20Y limit)
  { label: '1D', value: '1d', lookback: 6205 }, // ~17 years back to 2007 (within 20Y limit)
  { label: '1W', value: '1w', lookback: 7300 }, // 20 years for weekly (max limit)
  { label: '1M', value: '1mo', lookback: 7300 } // 20 years for monthly (max limit)
];

// Chart Types
const MAIN_CHART_TYPES = [
  { 
    label: 'Candles', 
    value: 'candlestick', 
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        {/* Candlestick 1 */}
        <line x1="3" y1="2" x2="3" y2="14" stroke="currentColor" strokeWidth="1"/>
        <rect x="2" y="4" width="2" height="4" fill="currentColor"/>
        
        {/* Candlestick 2 */}
        <line x1="7" y1="1" x2="7" y2="13" stroke="currentColor" strokeWidth="1"/>
        <rect x="6" y="3" width="2" height="6" fill="none" stroke="currentColor" strokeWidth="1"/>
        
        {/* Candlestick 3 */}
        <line x1="11" y1="3" x2="11" y2="15" stroke="currentColor" strokeWidth="1"/>
        <rect x="10" y="5" width="2" height="3" fill="currentColor"/>
      </svg>
    )
  },
  { 
    label: 'Line', 
    value: 'line', 
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path 
          d="M1 13 L4 9 L7 11 L10 6 L13 8 L15 4" 
          stroke="currentColor" 
          strokeWidth="2" 
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Add small dots at connection points */}
        <circle cx="1" cy="13" r="1.5" fill="currentColor"/>
        <circle cx="4" cy="9" r="1.5" fill="currentColor"/>
        <circle cx="7" cy="11" r="1.5" fill="currentColor"/>
        <circle cx="10" cy="6" r="1.5" fill="currentColor"/>
        <circle cx="13" cy="8" r="1.5" fill="currentColor"/>
        <circle cx="15" cy="4" r="1.5" fill="currentColor"/>
      </svg>
    )
  }
];

const DROPDOWN_CHART_TYPES = [
  { label: 'Area', value: 'area', icon: '🏔️' },
  { label: 'Bars', value: 'bars', icon: '📶' },
  { label: 'Hollow', value: 'hollow_candles', icon: '⚪' }
];

const CHART_TYPES = [...MAIN_CHART_TYPES, ...DROPDOWN_CHART_TYPES];

// Technical Indicators
const INDICATORS = [
  { label: 'Moving Average', value: 'ma', category: 'trend' },
  { label: 'RSI', value: 'rsi', category: 'momentum' },
  { label: 'MACD', value: 'macd', category: 'momentum' },
  { label: 'Bollinger Bands', value: 'bb', category: 'volatility' },
  { label: 'Volume', value: 'volume', category: 'volume' },
  { label: 'Stochastic', value: 'stoch', category: 'momentum' },
  { label: 'Williams %R', value: 'williams', category: 'momentum' },
  { label: 'ATR', value: 'atr', category: 'volatility' }
];

interface TradingViewChartProps {
  symbol: string;
  initialTimeframe?: string;
  height?: number;
  onSymbolChange?: (symbol: string) => void;
  onTimeframeChange?: (timeframe: string) => void;
}

export default function TradingViewChart({
  symbol,
  initialTimeframe = '1d',
  height = 600,
  onSymbolChange,
  onTimeframeChange
}: TradingViewChartProps) {
  // Canvas refs
  const containerRef = useRef<HTMLDivElement>(null);
  const chartCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);

  // Chart state
  const [config, setConfig] = useState<ChartConfig>({
    symbol,
    timeframe: initialTimeframe,
    chartType: 'candlestick',
    theme: 'dark',
    indicators: [],
    drawings: [],
    volume: true,
    crosshair: true,
    timezone: 'America/Los_Angeles',
    showGrid: false, // Start with grid disabled
    axisStyle: {
      xAxis: {
        textSize: 20,
        textColor: '#ffffff'
      },
      yAxis: {
        textSize: 20,
        textColor: '#ffffff'
      }
    },
    colors: {
      bullish: {
        body: '#00ff88',
        wick: '#00ff88',
        border: '#00ff88'
      },
      bearish: {
        body: '#ff4444',
        wick: '#ff4444', 
        border: '#ff4444'
      },
      volume: {
        bullish: '#00ff8880',
        bearish: '#ff444480'
      }
    }
  });

  // Settings panel state
  const [showSettings, setShowSettings] = useState(false);
  const [showTimeframeDropdown, setShowTimeframeDropdown] = useState(false);
  const [showChartTypeDropdown, setShowChartTypeDropdown] = useState(false);
  const [showIndicatorsDropdown, setShowIndicatorsDropdown] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);

  // Data state
  const [data, setData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Chart interaction state
  const [isDragging, setIsDragging] = useState(false);
  const [crosshairPosition, setCrosshairPosition] = useState({ x: 0, y: 0 });
  const [priceRange, setPriceRange] = useState({ min: 0, max: 0 });
  
  // TradingView-style navigation state
  const [scrollOffset, setScrollOffset] = useState(0); // Index of first visible candle
  const [visibleCandleCount, setVisibleCandleCount] = useState(100); // Number of visible candles

  // Price info state
  const [currentPrice, setCurrentPrice] = useState(0);
  const [priceChange, setPriceChange] = useState(0);
  const [priceChangePercent, setPriceChangePercent] = useState(0);

  // Chart dimensions
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const chartHeight = dimensions.height; // Use full height since volume is now integrated
  const volumeAreaHeight = 80; // Fixed height for volume area above X-axis

  // TradingView-style color scheme (dynamic based on theme)
  const colors = {
    background: config.theme === 'dark' ? '#000000' : '#ffffff',
    grid: config.theme === 'dark' ? '#1a1a1a' : '#e1e4e8',
    text: config.theme === 'dark' ? '#ffffff' : '#000000',
    textSecondary: config.theme === 'dark' ? '#999999' : '#6a737d',
    bullish: config.colors.bullish.body,
    bearish: config.colors.bearish.body,
    volume: config.theme === 'dark' ? '#333333' : '#f0f3fa',
    crosshair: config.theme === 'dark' ? '#666666' : '#6a737d',
    selection: '#2962ff',
    border: config.theme === 'dark' ? '#333333' : '#e1e4e8',
    header: config.theme === 'dark' ? '#111111' : '#f8f9fa'
  };

  // Fetch real-time price for current price display
  const fetchRealTimePrice = useCallback(async (sym: string) => {
    try {
      // Use a simple HTTP request to get latest trade data
      const response = await fetch(`https://api.polygon.io/v2/last/trade/${sym}?apikey=kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf`);
      if (response.ok) {
        const data = await response.json();
        if (data.results && data.results.p > 0) {
          const realtimePrice = data.results.p;
          setCurrentPrice(realtimePrice);
          
          // Calculate price change vs previous day's close (if available)
          if (data.length >= 2) {
            const previousClose = data[data.length - 2]?.close || realtimePrice;
            setPriceChange(realtimePrice - previousClose);
            setPriceChangePercent(((realtimePrice - previousClose) / previousClose) * 100);
          }
        }
      }
    } catch (error) {
      console.log('Real-time price fetch failed, using historical data');
    }
  }, [data]);

  // Search handler
  const handleSearch = (symbol: string) => {
    if (symbol && symbol.length > 0) {
      const upperSymbol = symbol.toUpperCase();
      if (onSymbolChange) {
        onSymbolChange(upperSymbol);
      }
      setSearchQuery('');
      setShowSearchResults(false);
    }
  };

  const handleSearchKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch(searchQuery);
    }
  };

  // Fetch data function
  const fetchData = useCallback(async (sym: string, timeframe: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const tf = TRADINGVIEW_TIMEFRAMES.find(t => t.value === timeframe);
      const lookbackDays = tf?.lookback || 365;
      
      const response = await fetch(
        `/api/stock-data?symbol=${sym}&timeframe=${timeframe}&lookbackDays=${lookbackDays}&_t=${Date.now()}`
      );
      
      if (!response.ok) {
        throw new Error(`Failed to fetch data: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.data && Array.isArray(result.data)) {
        setData(result.data);
        
        // Update price info from historical data
        if (result.data.length > 0) {
          const latest = result.data[result.data.length - 1];
          const previous = result.data[result.data.length - 2] || latest;
          
          setCurrentPrice(latest.close);
          setPriceChange(latest.close - previous.close);
          setPriceChangePercent(((latest.close - previous.close) / previous.close) * 100);
        }
        
        // Auto-fit chart inline to avoid circular dependency
        setTimeout(() => {
          if (result.data.length === 0) return;
          
          const prices = result.data.flatMap((d: ChartDataPoint) => [d.high, d.low]);
          const minPrice = Math.min(...prices);
          const maxPrice = Math.max(...prices);
          const padding = (maxPrice - minPrice) * 0.1;
          
          setScrollOffset(Math.max(0, result.data.length - Math.min(100, result.data.length)));
          setVisibleCandleCount(Math.min(100, result.data.length));
        }, 100);
      } else {
        throw new Error('Invalid data format');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
      setData([]);
    } finally {
      setLoading(false);
    }
  }, []); // Empty dependencies to avoid infinite loops

  // Auto-fit chart to data
  const fitChart = useCallback(() => {
    if (data.length === 0) return;
    
    const prices = data.flatMap(d => [d.high, d.low]);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const padding = (maxPrice - minPrice) * 0.1;
    
    setPriceRange({
      min: minPrice - padding,
      max: maxPrice + padding
    });
  }, [data]);

  // Handle container resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDimensions({ width: rect.width, height: rect.height });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Initialize chart
  useEffect(() => {
    fetchData(symbol, config.timeframe);
  }, [symbol, config.timeframe, fetchData]);

  // Initialize scroll position when data changes
  useEffect(() => {
    if (data.length > 0) {
      const defaultVisible = Math.min(100, data.length);
      setVisibleCandleCount(defaultVisible);
      setScrollOffset(Math.max(0, data.length - defaultVisible));
    }
  }, [data.length]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      
      if (showTimeframeDropdown && !target.closest('.timeframe-dropdown')) {
        setShowTimeframeDropdown(false);
      }
      
      if (showChartTypeDropdown && !target.closest('.chart-type-dropdown')) {
        setShowChartTypeDropdown(false);
      }
      
      if (showIndicatorsDropdown && !target.closest('.indicators-dropdown')) {
        setShowIndicatorsDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showTimeframeDropdown, showChartTypeDropdown, showIndicatorsDropdown]);

  // Render overlay (crosshair, zoom feedback)
  const renderOverlay = useCallback(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas || dimensions.width === 0 || dimensions.height === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = dimensions;

    // Set canvas size
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw crosshair if enabled and mouse is over chart
    if (config.crosshair && crosshairPosition.x > 0 && crosshairPosition.y > 0) {
      ctx.strokeStyle = config.theme === 'dark' ? '#555555' : '#cccccc';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);

      // Vertical crosshair line
      ctx.beginPath();
      ctx.moveTo(crosshairPosition.x, 0);
      ctx.lineTo(crosshairPosition.x, height);
      ctx.stroke();

      // Horizontal crosshair line  
      ctx.beginPath();
      ctx.moveTo(0, crosshairPosition.y);
      ctx.lineTo(width, crosshairPosition.y);
      ctx.stroke();

      ctx.setLineDash([]);
    }
  }, [dimensions, config.crosshair, config.theme, crosshairPosition]);

  // Update overlay when interactions change
  useEffect(() => {
    renderOverlay();
  }, [renderOverlay]);

  // Keyboard shortcuts for TradingView-like functionality
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target && (e.target as HTMLElement).tagName === 'INPUT') return; // Don't interfere with inputs
      
      switch (e.key) {
        case 'Home':
          e.preventDefault();
          // Go to beginning of data
          setScrollOffset(0);
          break;
        case 'End':
          e.preventDefault(); 
          // Go to end of data
          setScrollOffset(Math.max(0, data.length - visibleCandleCount));
          break;
        case '+':
        case '=':
          e.preventDefault();
          // Zoom in (show fewer candles)
          const newCountIn = Math.max(20, Math.round(visibleCandleCount * 0.8));
          const centerRatio = (scrollOffset + visibleCandleCount / 2) / data.length;
          const newOffsetIn = Math.max(0, Math.min(
            data.length - newCountIn,
            Math.round(centerRatio * data.length - newCountIn / 2)
          ));
          setVisibleCandleCount(newCountIn);
          setScrollOffset(newOffsetIn);
          break;
        case '-':
          e.preventDefault();
          // Zoom out (show more candles)
          const newCountOut = Math.min(500, Math.round(visibleCandleCount * 1.25));
          const centerRatioOut = (scrollOffset + visibleCandleCount / 2) / data.length;
          const newOffsetOut = Math.max(0, Math.min(
            data.length - newCountOut,
            Math.round(centerRatioOut * data.length - newCountOut / 2)
          ));
          setVisibleCandleCount(newCountOut);
          setScrollOffset(newOffsetOut);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          // Pan left (go back in time)
          const panLeft = Math.max(1, Math.round(visibleCandleCount * 0.1));
          setScrollOffset(Math.max(0, scrollOffset - panLeft));
          break;
        case 'ArrowRight':
          e.preventDefault();
          // Pan right (go forward in time)
          const panRight = Math.max(1, Math.round(visibleCandleCount * 0.1));
          setScrollOffset(Math.min(data.length - visibleCandleCount, scrollOffset + panRight));
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [data.length, scrollOffset, visibleCandleCount]);

  // Helper function to determine if a timestamp is during market hours
  const isMarketHours = (timestamp: number): boolean => {
    const date = new Date(timestamp);
    const hour = date.getHours();
    const minute = date.getMinutes();
    const totalMinutes = hour * 60 + minute;
    
    // Regular market hours: 9:30 AM - 4:00 PM ET (570 - 960 minutes)
    const marketOpen = 9 * 60 + 30; // 9:30 AM
    const marketClose = 16 * 60; // 4:00 PM
    
    return totalMinutes >= marketOpen && totalMinutes < marketClose;
  };

  // Draw market hours background shading
  const drawMarketHoursBackground = (
    ctx: CanvasRenderingContext2D, 
    width: number, 
    height: number, 
    visibleData: ChartDataPoint[], 
    chartWidth: number
  ) => {
    // Only show market hours shading for intraday timeframes
    if (!config.timeframe.includes('m') && !config.timeframe.includes('h')) {
      return; // Skip for daily and longer timeframes
    }

    const candleSpacing = chartWidth / visibleData.length;
    
    visibleData.forEach((candle, index) => {
      const x = 40 + (index * candleSpacing);
      const isMarket = isMarketHours(candle.timestamp);
      
      if (!isMarket) {
        // Draw gray background for pre-market and after-hours
        ctx.fillStyle = colors.grid + '20'; // Semi-transparent gray
        ctx.fillRect(x, 0, candleSpacing, height);
      }
    });
  };

  // Render main price chart with integrated volume
  const renderChart = useCallback(() => {
    const canvas = chartCanvasRef.current;
    if (!canvas || !data.length || dimensions.width === 0 || dimensions.height === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width } = dimensions;
    const height = chartHeight;

    // Set canvas size with device pixel ratio
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    console.log(`🎨 Rendering integrated chart: ${width}x${height}, theme: ${config.theme}, background: ${colors.background}`);

    // Clear canvas with theme-appropriate background
    ctx.fillStyle = colors.background;
    ctx.fillRect(0, 0, width, height);

    // Calculate chart areas - reserve space for volume and time axis
    const timeAxisHeight = 30;
    const priceChartHeight = height - volumeAreaHeight - timeAxisHeight;
    const volumeStartY = priceChartHeight;
    const volumeEndY = height - timeAxisHeight;

    // Draw grid first for price chart area (only if enabled)
    if (config.showGrid) {
      drawGrid(ctx, width, priceChartHeight);
    }

    // Calculate visible data range using scrollOffset and visibleCandleCount
    const startIndex = Math.max(0, Math.floor(scrollOffset));
    const endIndex = Math.min(data.length, startIndex + visibleCandleCount);
    const visibleData = data.slice(startIndex, endIndex);
    
    if (visibleData.length === 0) return;

    // Calculate chart dimensions
    const chartWidth = width - 120; // Leave more space for price scale to prevent overlap
    
    // Draw market hours background shading
    drawMarketHoursBackground(ctx, width, priceChartHeight, visibleData, chartWidth);

    // Calculate price range for visible data
    const prices = visibleData.flatMap(d => [d.high, d.low]);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const padding = (maxPrice - minPrice) * 0.1;
    const adjustedMin = minPrice - padding;
    const adjustedMax = maxPrice + padding;

    console.log(`💰 Price range: $${adjustedMin.toFixed(2)} - $${adjustedMax.toFixed(2)}`);

    // Draw chart in price chart area
    const candleWidth = Math.max(2, chartWidth / visibleData.length * 0.8);
    const candleSpacing = chartWidth / visibleData.length;

    if (config.chartType === 'line') {
      // Draw line chart connecting close prices
      if (visibleData.length > 1) {
        ctx.strokeStyle = colors.bullish;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();

        visibleData.forEach((candle, index) => {
          const x = 40 + (index * candleSpacing) + candleSpacing / 2;
          const closeY = priceChartHeight - ((candle.close - adjustedMin) / (adjustedMax - adjustedMin)) * priceChartHeight;
          
          if (index === 0) {
            ctx.moveTo(x, closeY);
          } else {
            ctx.lineTo(x, closeY);
          }
        });
        
        ctx.stroke();

        // Draw dots at each price point
        ctx.fillStyle = colors.bullish;
        visibleData.forEach((candle, index) => {
          const x = 40 + (index * candleSpacing) + candleSpacing / 2;
          const closeY = priceChartHeight - ((candle.close - adjustedMin) / (adjustedMax - adjustedMin)) * priceChartHeight;
          
          ctx.beginPath();
          ctx.arc(x, closeY, 2, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    } else {
      // Draw candlesticks/bars/area/hollow candles
      visibleData.forEach((candle, index) => {
        const x = 40 + (index * candleSpacing) + (candleSpacing - candleWidth) / 2;
        drawCandle(ctx, candle, x, candleWidth, priceChartHeight, adjustedMin, adjustedMax);
      });
    }

    // Draw volume bars above the X-axis
    if (config.volume) {
      const maxVolume = Math.max(...visibleData.map(d => d.volume));
      const barWidth = Math.max(1, chartWidth / visibleData.length * 0.8);
      const barSpacing = chartWidth / visibleData.length;

      visibleData.forEach((candle, index) => {
        const x = 40 + (index * barSpacing) + (barSpacing - barWidth) / 2;
        const barHeight = (candle.volume / maxVolume) * (volumeAreaHeight - 10);
        const isGreen = candle.close > candle.open;
        
        ctx.fillStyle = isGreen ? colors.bullish + '40' : colors.bearish + '40';
        ctx.fillRect(x, volumeEndY - barHeight, barWidth, barHeight);
      });

      // Draw volume scale on the right side
      ctx.fillStyle = colors.textSecondary;
      ctx.font = '9px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'left';
      
      const volumeSteps = 2;
      for (let i = 0; i <= volumeSteps; i++) {
        const volume = (maxVolume / volumeSteps) * (volumeSteps - i);
        const y = volumeStartY + 5 + ((volumeAreaHeight - 10) / volumeSteps) * i;
        
        // Format volume (K, M, B)
        let volumeText = '';
        if (volume >= 1000000000) {
          volumeText = (volume / 1000000000).toFixed(1) + 'B';
        } else if (volume >= 1000000) {
          volumeText = (volume / 1000000).toFixed(1) + 'M';
        } else if (volume >= 1000) {
          volumeText = (volume / 1000).toFixed(1) + 'K';
        } else {
          volumeText = volume.toFixed(0);
        }
        
        ctx.fillText(volumeText, width - 75, y + 3);
      }
    }

    // Draw price scale on the right for price chart area
    drawPriceScale(ctx, width, priceChartHeight, adjustedMin, adjustedMax);

    // Draw time axis at the bottom
    drawTimeAxis(ctx, width, height, visibleData, chartWidth);

    console.log(`✅ Integrated chart rendered successfully with ${config.theme} theme`);

  }, [data, dimensions, chartHeight, config.chartType, config.theme, config.volume, config.showGrid, config.axisStyle, colors, scrollOffset, visibleCandleCount, volumeAreaHeight]);

  // Draw grid lines for price chart area only
  const drawGrid = (ctx: CanvasRenderingContext2D, width: number, priceHeight: number) => {
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;

    // Horizontal grid lines (price levels) - only in price chart area
    for (let i = 0; i <= 10; i++) {
      const y = (priceHeight / 10) * i;
      ctx.beginPath();
      ctx.moveTo(50, y);
      ctx.lineTo(width - 20, y);
      ctx.stroke();
    }

    // Vertical grid lines (time)
    const gridSpacing = Math.max(50, (width - 70) / 20);
    for (let x = 50; x < width - 20; x += gridSpacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, priceHeight);
      ctx.stroke();
    }
  };

  // Draw individual candle
  const drawCandle = (
    ctx: CanvasRenderingContext2D,
    candle: ChartDataPoint,
    x: number,
    width: number,
    height: number,
    minPrice: number,
    maxPrice: number
  ) => {
    const { open, high, low, close } = candle;
    const isGreen = close > open;
    
    // Get custom colors
    const candleColors = isGreen ? config.colors.bullish : config.colors.bearish;
    
    // Convert prices to canvas coordinates
    const priceToY = (price: number) => {
      const ratio = (price - minPrice) / (maxPrice - minPrice);
      const chartArea = height - 30; // Reserve 30px at bottom for time labels
      return chartArea - (ratio * (chartArea - 20)) - 10; // Leave margins top and adjust for reserved space
    };

    const openY = priceToY(open);
    const closeY = priceToY(close);
    const highY = priceToY(high);
    const lowY = priceToY(low);

    // Draw wick (high-low line)
    ctx.strokeStyle = candleColors.wick;
    ctx.lineWidth = Math.max(1, width * 0.1);
    ctx.beginPath();
    ctx.moveTo(x + width / 2, highY);
    ctx.lineTo(x + width / 2, lowY);
    ctx.stroke();

    // Draw body (open-close rectangle)
    if (config.chartType === 'candlestick') {
      const bodyHeight = Math.abs(closeY - openY);
      const bodyY = Math.min(openY, closeY);
      const bodyWidth = Math.max(2, width - 2);
      
      // Fill the body
      ctx.fillStyle = candleColors.body;
      ctx.fillRect(x + 1, bodyY, bodyWidth, Math.max(1, bodyHeight));
      
      // Draw body border
      ctx.strokeStyle = candleColors.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 1, bodyY, bodyWidth, Math.max(1, bodyHeight));
    }
  };

  // Draw price scale on the right
  const drawPriceScale = (
    ctx: CanvasRenderingContext2D, 
    width: number, 
    height: number,
    minPrice: number,
    maxPrice: number
  ) => {
    ctx.fillStyle = config.axisStyle.yAxis.textColor;
    ctx.font = `${config.axisStyle.yAxis.textSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.textAlign = 'left';

    const chartArea = height - 30; // Reserve 30px at bottom for time labels
    const steps = 10;
    for (let i = 0; i <= steps; i++) {
      const ratio = i / steps;
      const price = minPrice + (maxPrice - minPrice) * (1 - ratio);
      const y = 20 + ((chartArea - 40) / steps) * i;
      
      // Draw price label
      ctx.fillText(`$${price.toFixed(2)}`, width - 70, y + 4);
      
      // Draw tick mark
      ctx.strokeStyle = colors.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(width - 75, y);
      ctx.lineTo(width - 70, y);
      ctx.stroke();
    }
  };

  // Draw time axis at the bottom
  const drawTimeAxis = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    visibleData: ChartDataPoint[],
    chartWidth: number
  ) => {
    if (visibleData.length === 0) return;

    ctx.fillStyle = config.axisStyle.xAxis.textColor;
    ctx.font = `${config.axisStyle.xAxis.textSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.textAlign = 'center';

    // Calculate how many labels we can fit
    const maxLabels = Math.floor(chartWidth / 80); // One label every 80px
    const labelStep = Math.max(1, Math.floor(visibleData.length / maxLabels));
    
    const candleSpacing = chartWidth / visibleData.length;

    visibleData.forEach((candle, index) => {
      if (index % labelStep === 0 || index === visibleData.length - 1) {
        const x = 40 + (index * candleSpacing) + candleSpacing / 2;
        
        // Format time based on timeframe
        let timeLabel = '';
        const date = new Date(candle.timestamp);
        
        if (config.timeframe.includes('m') || config.timeframe.includes('h')) {
          // For intraday, show time
          timeLabel = date.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: false
          });
        } else {
          // For daily and above, show date
          timeLabel = date.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric'
          });
        }
        
        // Draw time label at bottom
        ctx.fillText(timeLabel, x, height - 8);
        
        // Draw tick mark
        ctx.strokeStyle = colors.grid;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, height - 20);
        ctx.lineTo(x, height - 15);
        ctx.stroke();
      }
    });
  };

  // Re-render when data or settings change
  useEffect(() => {
    if (dimensions.width > 0 && dimensions.height > 0) {
      renderChart();
    }
  }, [renderChart, config.theme, config.colors, dimensions]);

  // TradingView-style interaction handlers
  const [lastMouseX, setLastMouseX] = useState(0);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartOffset, setDragStartOffset] = useState(0);

  // Mouse handlers for TradingView-style navigation
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left mouse button
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    
    setIsDragging(true);
    setLastMouseX(x);
    setDragStartX(x);
    setDragStartOffset(scrollOffset);
    
    e.preventDefault();
  }, [scrollOffset]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Update crosshair
    setCrosshairPosition({ x, y });
    
    // Handle dragging (panning)
    if (isDragging && data.length > 0) {
      const deltaX = x - dragStartX;
      const candleWidth = dimensions.width / visibleCandleCount;
      const candlesToMove = Math.round(deltaX / candleWidth);
      
      // Calculate new scroll offset (drag right = go back in time)
      const newOffset = Math.max(0, Math.min(
        data.length - visibleCandleCount,
        dragStartOffset - candlesToMove
      ));
      
      setScrollOffset(newOffset);
    }
  }, [isDragging, data.length, dimensions.width, visibleCandleCount, dragStartX, dragStartOffset]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    
    if (data.length === 0) return;
    
    // Determine scroll direction and amount
    const delta = e.deltaY;
    const scrollSensitivity = 3; // Candles to scroll per wheel tick
    
    if (Math.abs(delta) > Math.abs(e.deltaX)) {
      // Vertical scroll - zoom in/out
      const zoomDirection = delta > 0 ? 1 : -1; // 1 = zoom out, -1 = zoom in
      const zoomFactor = 0.1;
      
      // Calculate new candle count
      const newCount = Math.max(20, Math.min(500, 
        visibleCandleCount + (zoomDirection * visibleCandleCount * zoomFactor)
      ));
      
      // Adjust scroll offset to maintain center point
      const rect = e.currentTarget.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseRatio = mouseX / dimensions.width;
      
      const oldCenter = scrollOffset + (visibleCandleCount * mouseRatio);
      const newOffset = Math.max(0, Math.min(
        data.length - newCount,
        oldCenter - (newCount * mouseRatio)
      ));
      
      setVisibleCandleCount(Math.round(newCount));
      setScrollOffset(Math.round(newOffset));
    } else {
      // Horizontal scroll - pan left/right
      const scrollDirection = e.deltaX > 0 ? 1 : -1;
      const newOffset = Math.max(0, Math.min(
        data.length - visibleCandleCount,
        scrollOffset + (scrollDirection * scrollSensitivity)
      ));
      
      setScrollOffset(newOffset);
    }
  }, [data.length, visibleCandleCount, scrollOffset, dimensions.width]);

  const handleDoubleClick = useCallback(() => {
    // Reset to fit all data
    setVisibleCandleCount(Math.min(200, data.length));
    setScrollOffset(Math.max(0, data.length - Math.min(200, data.length)));
  }, [data.length]);

  // Handle timeframe change
  const handleTimeframeChange = (timeframe: string) => {
    setConfig(prev => ({ ...prev, timeframe }));
    onTimeframeChange?.(timeframe);
  };

  // Handle chart type change
  const handleChartTypeChange = (chartType: ChartConfig['chartType']) => {
    setConfig(prev => ({ ...prev, chartType }));
  };

  // Handle symbol change
  const handleSymbolChange = (newSymbol: string) => {
    setConfig(prev => ({ ...prev, symbol: newSymbol }));
    onSymbolChange?.(newSymbol);
  };

  return (
    <div className="w-full h-full rounded-lg overflow-hidden" style={{ backgroundColor: colors.background }}>
      {/* Enhanced Bloomberg Terminal Top Bar */}
      <div 
        className="h-14 border-b flex items-center justify-between px-6 relative"
        style={{ 
          background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 50%, #0a0a0a 100%)',
          borderColor: '#333333',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(10px)',
          zIndex: 10000
        }}
      >
        {/* Glossy overlay effect */}
        <div 
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.02) 50%, rgba(0, 0, 0, 0.1) 100%)',
            borderRadius: 'inherit'
          }}
        />
        
        {/* Symbol and Price Info */}
        <div className="flex items-center space-x-8 relative z-10 flex-1">
          {/* TradingView-style Symbol Search */}
          <div className="flex items-center">
            <div className="relative flex items-center">
              <div className="flex items-center space-x-3 px-4 py-2 rounded-lg" style={{
                background: 'linear-gradient(145deg, #1a1a1a 0%, #0d0d0d 25%, #000000 50%, #0d0d0d 75%, #1a1a1a 100%)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.1), inset 0 -1px 0 rgba(0, 0, 0, 0.5)',
                borderRadius: '8px'
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ color: '#9ca3af' }}>
                  <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/>
                  <path d="m21 21-4.35-4.35" stroke="currentColor" strokeWidth="2"/>
                </svg>
                <input
                  type="text"
                  value={searchQuery || symbol}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={handleSearchKeyPress}
                  onFocus={(e) => {
                    if (!searchQuery) setSearchQuery(symbol);
                    e.currentTarget.parentElement!.parentElement!.style.border = '1px solid rgba(41, 98, 255, 0.6)';
                    e.currentTarget.parentElement!.parentElement!.style.boxShadow = '0 4px 16px rgba(41, 98, 255, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.15), inset 0 -1px 0 rgba(0, 0, 0, 0.5)';
                  }}
                  onBlur={(e) => {
                    if (!searchQuery) setSearchQuery('');
                    e.currentTarget.parentElement!.parentElement!.style.border = '1px solid rgba(255, 255, 255, 0.15)';
                    e.currentTarget.parentElement!.parentElement!.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.1), inset 0 -1px 0 rgba(0, 0, 0, 0.5)';
                  }}
                  className="bg-transparent border-0 outline-none w-28 text-base font-bold"
                  style={{
                    color: '#ffffff',
                    textShadow: '0 1px 2px rgba(0, 0, 0, 0.9), 0 0 8px rgba(255, 255, 255, 0.2)',
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                    letterSpacing: '0.8px'
                  }}
                  placeholder="Search..."
                />
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color: '#666' }}>
                  <path d="M12 5v14l7-7-7-7z" fill="currentColor"/>
                </svg>
              </div>
            </div>
          </div>
          
          <div className="flex items-center space-x-6">
            <span 
              className="font-mono text-2xl font-bold"
              style={{
                color: '#ffffff',
                textShadow: '0 2px 4px rgba(0, 0, 0, 0.9), 0 0 12px rgba(255, 255, 255, 0.3)',
                letterSpacing: '1px',
                fontFamily: 'JetBrains Mono, Monaco, "Courier New", monospace'
              }}
            >
              ${currentPrice.toFixed(2)}
            </span>
            <span 
              className="font-mono text-base font-bold px-4 py-2 rounded-lg"
              style={{
                color: '#ffffff',
                background: priceChangePercent >= 0 
                  ? 'linear-gradient(145deg, #16a085 0%, #0e6b5c 25%, #0a5249 50%, #0e6b5c 75%, #16a085 100%)'
                  : 'linear-gradient(145deg, #e74c3c 0%, #c0392b 25%, #a93226 50%, #c0392b 75%, #e74c3c 100%)',
                textShadow: '0 2px 4px rgba(0, 0, 0, 0.9), 0 0 8px rgba(255, 255, 255, 0.2)',
                border: `1px solid ${priceChangePercent >= 0 ? 'rgba(22, 160, 133, 0.3)' : 'rgba(231, 76, 60, 0.3)'}`,
                letterSpacing: '0.5px',
                boxShadow: `0 4px 12px ${priceChangePercent >= 0 ? 'rgba(22, 160, 133, 0.4)' : 'rgba(231, 76, 60, 0.4)'}, inset 0 1px 0 rgba(255, 255, 255, 0.2), inset 0 -1px 0 rgba(0, 0, 0, 0.5)`
              }}
            >
              {priceChangePercent >= 0 ? '+' : ''}{priceChange.toFixed(2)} ({priceChangePercent.toFixed(2)}%)
            </span>
          </div>
        </div>

        {/* Spacer for center positioning */}
        <div className="flex-1"></div>

        {/* Right side buttons with enhanced spacing and candy black styling */}
        <div className="flex items-center space-x-4 relative z-10">

          {/* Enhanced Timeframes - Integrated Dropdown Style */}
          <div 
            className="flex items-center timeframe-dropdown"
            style={{
              background: 'linear-gradient(145deg, #1a1a1a 0%, #0d0d0d 25%, #000000 50%, #0d0d0d 75%, #1a1a1a 100%)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '12px',
              boxShadow: '0 6px 20px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.15), inset 0 -1px 0 rgba(0, 0, 0, 0.5)',
              padding: '4px'
            }}
          >
            {/* Main Timeframes */}
            {[
              { label: '5M', value: '5m' },
              { label: '30M', value: '30m' },
              { label: '1H', value: '1h' },
              { label: '4H', value: '4h' },
              { label: 'D', value: '1d' }
            ].map((tf, index) => (
              <button
                key={tf.label}
                onClick={() => handleTimeframeChange(tf.value)}
                className="relative group"
                style={{
                  padding: '10px 18px',
                  background: config.timeframe === tf.value
                    ? 'linear-gradient(145deg, #2962ff 0%, #1e4db7 25%, #1746a3 50%, #1e4db7 75%, #2962ff 100%)'
                    : 'linear-gradient(145deg, #2a2a2a 0%, #1a1a1a 25%, #0f0f0f 50%, #1a1a1a 75%, #2a2a2a 100%)',
                  color: '#ffffff',
                  fontWeight: '700',
                  fontSize: '14px',
                  letterSpacing: '0.8px',
                  textShadow: '0 2px 4px rgba(0, 0, 0, 0.9), 0 0 12px rgba(255, 255, 255, 0.3)',
                  borderRight: index < 4 ? '1px solid rgba(255, 255, 255, 0.1)' : 'none',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                  borderRadius: index === 0 ? '8px 0 0 8px' : index === 4 ? '0 8px 8px 0' : '0',
                  border: config.timeframe === tf.value ? '1px solid rgba(41, 98, 255, 0.4)' : '1px solid rgba(255, 255, 255, 0.1)',
                  boxShadow: config.timeframe === tf.value 
                    ? '0 4px 15px rgba(41, 98, 255, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.3), inset 0 -1px 0 rgba(0, 0, 0, 0.6)'
                    : '0 2px 8px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1), inset 0 -1px 0 rgba(0, 0, 0, 0.3)'
                }}
                onMouseEnter={(e) => {
                  if (config.timeframe !== tf.value) {
                    e.currentTarget.style.background = 'linear-gradient(145deg, #3a3a3a 0%, #2a2a2a 25%, #1f1f1f 50%, #2a2a2a 75%, #3a3a3a 100%)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.2), inset 0 -1px 0 rgba(0, 0, 0, 0.4)';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (config.timeframe !== tf.value) {
                    e.currentTarget.style.background = 'linear-gradient(145deg, #2a2a2a 0%, #1a1a1a 25%, #0f0f0f 50%, #1a1a1a 75%, #2a2a2a 100%)';
                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1), inset 0 -1px 0 rgba(0, 0, 0, 0.3)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }
                }}
              >
                {tf.label}
              </button>
            ))}

            {/* Timeframe Dropdown Button */}
            <button
              onClick={() => setShowTimeframeDropdown(!showTimeframeDropdown)}
              className="relative group ml-1"
              style={{
                padding: '10px 12px',
                background: showTimeframeDropdown
                  ? 'linear-gradient(145deg, #2962ff 0%, #1e4db7 25%, #1746a3 50%, #1e4db7 75%, #2962ff 100%)'
                  : 'linear-gradient(145deg, #2a2a2a 0%, #1a1a1a 25%, #0f0f0f 50%, #1a1a1a 75%, #2a2a2a 100%)',
                color: '#ffffff',
                fontWeight: '700',
                fontSize: '14px',
                textShadow: '0 2px 4px rgba(0, 0, 0, 0.9), 0 0 12px rgba(255, 255, 255, 0.3)',
                borderRadius: '8px',
                border: showTimeframeDropdown ? '1px solid rgba(41, 98, 255, 0.4)' : '1px solid rgba(255, 255, 255, 0.1)',
                boxShadow: showTimeframeDropdown
                  ? '0 4px 15px rgba(41, 98, 255, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.3), inset 0 -1px 0 rgba(0, 0, 0, 0.6)'
                  : '0 2px 8px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1), inset 0 -1px 0 rgba(0, 0, 0, 0.3)',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
              onMouseEnter={(e) => {
                if (!showTimeframeDropdown) {
                  e.currentTarget.style.background = 'linear-gradient(145deg, #3a3a3a 0%, #2a2a2a 25%, #1f1f1f 50%, #2a2a2a 75%, #3a3a3a 100%)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.2), inset 0 -1px 0 rgba(0, 0, 0, 0.4)';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }
              }}
              onMouseLeave={(e) => {
                if (!showTimeframeDropdown) {
                  e.currentTarget.style.background = 'linear-gradient(145deg, #2a2a2a 0%, #1a1a1a 25%, #0f0f0f 50%, #1a1a1a 75%, #2a2a2a 100%)';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1), inset 0 -1px 0 rgba(0, 0, 0, 0.3)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }
              }}
            >
              ▼
            </button>

            {/* Timeframe Dropdown */}
            {showTimeframeDropdown && (
              <div 
                className="absolute top-full left-0 mt-2 bg-[#1e222d] border border-[#2a2e39] rounded-lg py-2 w-32 shadow-2xl"
                style={{ zIndex: 9999 }}
              >
                {[
                  { label: '1 Min', value: '1m' },
                  { label: '15 Min', value: '15m' },
                  { label: '1 Week', value: '1w' },
                  { label: '1 Month', value: '1mo' }
                ].map((tf) => (
                  <button
                    key={tf.value}
                    onClick={() => {
                      handleTimeframeChange(tf.value);
                      setShowTimeframeDropdown(false);
                    }}
                    className="w-full text-left px-4 py-2 text-sm hover:bg-[#2a2e39] text-[#d1d4dc]"
                    style={{
                      background: config.timeframe === tf.value ? '#2962ff' : 'transparent',
                      color: config.timeframe === tf.value ? '#ffffff' : '#d1d4dc',
                      textShadow: '0 1px 1px rgba(0, 0, 0, 0.8)'
                    }}
                  >
                    {tf.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Enhanced Chart Controls Section */}
          <div className="flex items-center space-x-6">
            {/* Volume Toggle */}
            <button
              onClick={() => setConfig(prev => ({ ...prev, volume: !prev.volume }))}
              className="relative group"
              style={{
                padding: '10px 16px',
                background: config.volume
                  ? 'linear-gradient(145deg, #2962ff 0%, #1e4db7 25%, #1746a3 50%, #1e4db7 75%, #2962ff 100%)'
                  : 'linear-gradient(145deg, #2a2a2a 0%, #1a1a1a 25%, #0f0f0f 50%, #1a1a1a 75%, #2a2a2a 100%)',
                color: '#ffffff',
                fontWeight: '700',
                fontSize: '14px',
                letterSpacing: '0.8px',
                textShadow: '0 2px 4px rgba(0, 0, 0, 0.9), 0 0 12px rgba(255, 255, 255, 0.3)',
                borderRadius: '10px',
                border: config.volume ? '1px solid rgba(41, 98, 255, 0.4)' : '1px solid rgba(255, 255, 255, 0.15)',
                boxShadow: config.volume
                  ? '0 6px 20px rgba(41, 98, 255, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.3), inset 0 -1px 0 rgba(0, 0, 0, 0.6)'
                  : '0 4px 12px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.15), inset 0 -1px 0 rgba(0, 0, 0, 0.5)',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
              onMouseEnter={(e) => {
                if (!config.volume) {
                  e.currentTarget.style.background = 'linear-gradient(145deg, #3a3a3a 0%, #2a2a2a 25%, #1f1f1f 50%, #2a2a2a 75%, #3a3a3a 100%)';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.2), inset 0 -1px 0 rgba(0, 0, 0, 0.4)';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }
              }}
              onMouseLeave={(e) => {
                if (!config.volume) {
                  e.currentTarget.style.background = 'linear-gradient(145deg, #2a2a2a 0%, #1a1a1a 25%, #0f0f0f 50%, #1a1a1a 75%, #2a2a2a 100%)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.15), inset 0 -1px 0 rgba(0, 0, 0, 0.5)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }
              }}
            >
              VOLUME
            </button>

            {/* Chart Type Controls */}
            <div className="flex items-center">
              {/* Main chart type buttons */}
              <div className="flex items-center" style={{
                background: 'linear-gradient(145deg, #1a1a1a 0%, #0d0d0d 25%, #000000 50%, #0d0d0d 75%, #1a1a1a 100%)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '12px',
                boxShadow: '0 6px 20px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.15), inset 0 -1px 0 rgba(0, 0, 0, 0.5)',
                padding: '4px'
              }}>
                {MAIN_CHART_TYPES.map((type, index) => (
                  <button
                    key={type.value}
                    onClick={() => setConfig(prev => ({ ...prev, chartType: type.value as any }))}
                    className="relative group flex items-center space-x-2"
                    style={{
                      padding: '10px 16px',
                      background: config.chartType === type.value
                        ? 'linear-gradient(145deg, #2962ff 0%, #1e4db7 25%, #1746a3 50%, #1e4db7 75%, #2962ff 100%)'
                        : 'linear-gradient(145deg, #2a2a2a 0%, #1a1a1a 25%, #0f0f0f 50%, #1a1a1a 75%, #2a2a2a 100%)',
                      color: '#ffffff',
                      fontWeight: '700',
                      fontSize: '14px',
                      letterSpacing: '0.8px',
                      textShadow: '0 2px 4px rgba(0, 0, 0, 0.9), 0 0 12px rgba(255, 255, 255, 0.3)',
                      borderRadius: index === 0 ? '8px 0 0 8px' : index === MAIN_CHART_TYPES.length - 1 ? '0 8px 8px 0' : '0',
                      border: config.chartType === type.value ? '1px solid rgba(41, 98, 255, 0.4)' : '1px solid rgba(255, 255, 255, 0.1)',
                      borderRight: index < MAIN_CHART_TYPES.length - 1 ? '1px solid rgba(255, 255, 255, 0.1)' : 'none',
                      boxShadow: config.chartType === type.value
                        ? '0 4px 15px rgba(41, 98, 255, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.3), inset 0 -1px 0 rgba(0, 0, 0, 0.6)'
                        : '0 2px 8px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1), inset 0 -1px 0 rgba(0, 0, 0, 0.3)',
                      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                    }}
                    onMouseEnter={(e) => {
                      if (config.chartType !== type.value) {
                        e.currentTarget.style.background = 'linear-gradient(145deg, #3a3a3a 0%, #2a2a2a 25%, #1f1f1f 50%, #2a2a2a 75%, #3a3a3a 100%)';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.2), inset 0 -1px 0 rgba(0, 0, 0, 0.4)';
                        e.currentTarget.style.transform = 'translateY(-1px)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (config.chartType !== type.value) {
                        e.currentTarget.style.background = 'linear-gradient(145deg, #2a2a2a 0%, #1a1a1a 25%, #0f0f0f 50%, #1a1a1a 75%, #2a2a2a 100%)';
                        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1), inset 0 -1px 0 rgba(0, 0, 0, 0.3)';
                        e.currentTarget.style.transform = 'translateY(0)';
                      }
                    }}
                  >
                    <div dangerouslySetInnerHTML={{ __html: type.icon }} />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Enhanced Timeframes - Integrated Dropdown Style */}
          <div 
            className="flex items-center border-l border-[#333333] pl-6 timeframe-dropdown"
            style={{
              background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
            }}
          >
            {/* Main Timeframes */}
            {[
              { label: '5M', value: '5m' },
              { label: '30M', value: '30m' },
              { label: '1H', value: '1h' },
              { label: '4H', value: '4h' },
              { label: 'D', value: '1d' }
            ].map((tf, index) => (
              <button
                key={tf.label}
                onClick={() => handleTimeframeChange(tf.value)}
                className="relative group"
                style={{
                  padding: '8px 16px',
                  background: config.timeframe === tf.value
                    ? 'linear-gradient(135deg, #2962ff 0%, #1e4db7 100%)'
                    : 'transparent',
                  color: config.timeframe === tf.value ? '#ffffff' : '#d1d5db',
                  fontWeight: '600',
                  fontSize: '13px',
                  letterSpacing: '0.5px',
                  textShadow: config.timeframe === tf.value
                    ? '0 1px 2px rgba(0, 0, 0, 0.8), 0 0 8px rgba(41, 98, 255, 0.4)'
                    : '0 1px 1px rgba(0, 0, 0, 0.8)',
                  borderRight: index < 4 ? '1px solid rgba(255, 255, 255, 0.1)' : 'none',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                  borderRadius: '0'
                }}
                onMouseEnter={(e) => {
                  if (config.timeframe !== tf.value) {
                    e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%)';
                    e.currentTarget.style.color = '#ffffff';
                  }
                }}
                onMouseLeave={(e) => {
                  if (config.timeframe !== tf.value) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = '#d1d5db';
                  }
                }}
              >
                {tf.label}
              </button>
            ))}

            {/* More Timeframes Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowTimeframeDropdown(!showTimeframeDropdown)}
                className="flex items-center space-x-1 px-3 py-2"
                style={{
                  color: '#d1d5db',
                  fontSize: '13px',
                  fontWeight: '600',
                  letterSpacing: '0.5px',
                  textShadow: '0 1px 1px rgba(0, 0, 0, 0.8)',
                  borderLeft: '1px solid rgba(255, 255, 255, 0.1)',
                  background: showTimeframeDropdown 
                    ? 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%)'
                    : 'transparent',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                }}
              >
                <span>⋯</span>
                <span style={{ fontSize: '10px', transform: showTimeframeDropdown ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▼</span>
              </button>

              {/* Timeframe Dropdown */}
              {showTimeframeDropdown && (
                <div 
                  className="absolute top-full left-0 mt-1 bg-[#1e222d] border border-[#2a2e39] rounded-lg shadow-xl py-1 min-w-[120px]"
                  style={{ zIndex: 9999 }}
                >
                  {[
                    { label: '1M', value: '1m' },
                    { label: '15M', value: '15m' },
                    { label: '2H', value: '2h' },
                    { label: '6H', value: '6h' },
                    { label: '12H', value: '12h' },
                    { label: 'W', value: '1w' },
                    { label: 'M', value: '1M' }
                  ].map((tf) => (
                    <button
                      key={tf.value}
                      onClick={() => {
                        handleTimeframeChange(tf.value);
                        setShowTimeframeDropdown(false);
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-[#2a2e39] transition-colors"
                      style={{
                        color: config.timeframe === tf.value ? '#2962ff' : '#d1d4dc',
                        fontWeight: config.timeframe === tf.value ? '600' : '400'
                      }}
                    >
                      {tf.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Enhanced Chart Controls */}
          <div className="flex items-center space-x-3 relative" style={{ zIndex: 10000 }}>
          {/* Chart Type Selector - Integrated Dropdown Style */}
          <div 
            className="flex items-center chart-type-dropdown"
            style={{
              background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
            }}
          >
            {/* Main Chart Type Buttons */}
            {MAIN_CHART_TYPES.map((type, index) => (
              <button
                key={type.value}
                onClick={() => handleChartTypeChange(type.value as ChartConfig['chartType'])}
                className="relative group"
                style={{
                  padding: '8px 12px',
                  background: config.chartType === type.value
                    ? 'linear-gradient(135deg, #2962ff 0%, #1e4db7 100%)'
                    : 'transparent',
                  color: config.chartType === type.value ? '#ffffff' : '#d1d5db',
                  fontSize: '16px',
                  borderRight: '1px solid rgba(255, 255, 255, 0.1)',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                  textShadow: config.chartType === type.value
                    ? '0 1px 2px rgba(0, 0, 0, 0.8), 0 0 8px rgba(41, 98, 255, 0.4)'
                    : '0 1px 1px rgba(0, 0, 0, 0.8)',
                  borderRadius: '0'
                }}
                title={type.label}
                onMouseEnter={(e) => {
                  if (config.chartType !== type.value) {
                    e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%)';
                    e.currentTarget.style.color = '#ffffff';
                  }
                }}
                onMouseLeave={(e) => {
                  if (config.chartType !== type.value) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = '#d1d5db';
                  }
                }}
              >
                {type.icon}
              </button>
            ))}

            {/* Chart Type Dropdown Toggle - Integrated */}
            <div className="relative">
              <button
                onClick={() => setShowChartTypeDropdown(!showChartTypeDropdown)}
                className="relative group"
                style={{
                  padding: '8px 12px',
                  background: DROPDOWN_CHART_TYPES.some(type => type.value === config.chartType)
                    ? 'linear-gradient(135deg, #2962ff 0%, #1e4db7 100%)'
                    : 'transparent',
                  color: DROPDOWN_CHART_TYPES.some(type => type.value === config.chartType) ? '#ffffff' : '#d1d5db',
                  fontWeight: '600',
                  fontSize: '13px',
                  letterSpacing: '0.5px',
                  textShadow: DROPDOWN_CHART_TYPES.some(type => type.value === config.chartType)
                    ? '0 1px 2px rgba(0, 0, 0, 0.8), 0 0 8px rgba(41, 98, 255, 0.4)'
                    : '0 1px 1px rgba(0, 0, 0, 0.8)',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                }}
                onMouseEnter={(e) => {
                  if (!DROPDOWN_CHART_TYPES.some(type => type.value === config.chartType)) {
                    e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%)';
                    e.currentTarget.style.color = '#ffffff';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!DROPDOWN_CHART_TYPES.some(type => type.value === config.chartType)) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = '#d1d5db';
                  }
                }}
              >
                <div className="flex items-center space-x-1">
                  <span className="text-lg">
                    {DROPDOWN_CHART_TYPES.find(type => type.value === config.chartType)?.icon || '📊'}
                  </span>
                  <svg 
                    width="12" 
                    height="12" 
                    viewBox="0 0 12 12" 
                    fill="currentColor"
                    style={{
                      transform: showChartTypeDropdown ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s'
                    }}
                  >
                    <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                  </svg>
                </div>
              </button>

              {showChartTypeDropdown && (
                <div
                  className="absolute top-full left-0 mt-2 w-40 rounded-lg overflow-hidden"
                  style={{
                    background: 'linear-gradient(135deg, rgba(18, 18, 18, 0.95) 0%, rgba(12, 12, 12, 0.98) 100%)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
                    backdropFilter: 'blur(12px)',
                    zIndex: 9999
                  }}
                >
                  {DROPDOWN_CHART_TYPES.map((type) => (
                    <button
                      key={type.value}
                      onClick={() => {
                        handleChartTypeChange(type.value as ChartConfig['chartType']);
                        setShowChartTypeDropdown(false);
                      }}
                      className="w-full px-4 py-3 text-left flex items-center space-x-3 hover:bg-white/10 transition-colors"
                      style={{
                        background: config.chartType === type.value 
                          ? 'linear-gradient(135deg, #2962ff 0%, #1e4db7 100%)'
                          : 'transparent',
                        color: config.chartType === type.value ? '#ffffff' : '#d1d5db',
                        fontSize: '13px',
                        fontWeight: '500',
                        letterSpacing: '0.3px',
                        textShadow: config.chartType === type.value
                          ? '0 1px 2px rgba(0, 0, 0, 0.8)'
                          : '0 1px 1px rgba(0, 0, 0, 0.8)'
                      }}
                    >
                      <span className="text-lg">{type.icon}</span>
                      <span>{type.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Volume Toggle */}
          <button
            onClick={() => setConfig(prev => ({ ...prev, volume: !prev.volume }))}
            className="relative group"
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              background: config.volume
                ? 'linear-gradient(135deg, #2962ff 0%, #1e4db7 100%)'
                : 'linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%)',
              border: config.volume
                ? '1px solid rgba(41, 98, 255, 0.5)'
                : '1px solid rgba(255, 255, 255, 0.1)',
              color: config.volume ? '#ffffff' : '#d1d5db',
              fontWeight: '600',
              fontSize: '13px',
              letterSpacing: '0.5px',
              textShadow: config.volume
                ? '0 1px 2px rgba(0, 0, 0, 0.8), 0 0 8px rgba(41, 98, 255, 0.4)'
                : '0 1px 1px rgba(0, 0, 0, 0.8)',
              boxShadow: config.volume
                ? '0 4px 12px rgba(41, 98, 255, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
                : '0 2px 8px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
            onMouseEnter={(e) => {
              if (!config.volume) {
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.15)';
              }
            }}
            onMouseLeave={(e) => {
              if (!config.volume) {
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)';
              }
            }}
          >
            VOLUME
          </button>

          {/* Indicators Button with Dropdown */}
          <div 
            className="relative indicators-dropdown"
            style={{
              background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
            }}
          >
            <button 
              onClick={() => setShowIndicatorsDropdown(!showIndicatorsDropdown)}
              className="relative group flex items-center space-x-2"
              style={{
                padding: '8px 16px',
                background: 'transparent',
                color: '#d1d5db',
                fontWeight: '600',
                fontSize: '13px',
                letterSpacing: '0.5px',
                textShadow: '0 1px 1px rgba(0, 0, 0, 0.8)',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%)';
                e.currentTarget.style.color = '#ffffff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = '#d1d5db';
              }}
            >
              <span>INDICATORS</span>
              <svg 
                width="12" 
                height="12" 
                viewBox="0 0 12 12" 
                fill="currentColor"
                style={{
                  transform: showIndicatorsDropdown ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s'
                }}
              >
                <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
              </svg>
            </button>

            {showIndicatorsDropdown && (
              <div
                className="absolute top-full left-0 mt-2 w-48 rounded-lg overflow-hidden"
                style={{
                  background: 'linear-gradient(135deg, rgba(18, 18, 18, 0.95) 0%, rgba(12, 12, 12, 0.98) 100%)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
                  backdropFilter: 'blur(12px)',
                  zIndex: 9999
                }}
              >
                {INDICATORS.map((indicator) => (
                  <button
                    key={indicator.value}
                    onClick={() => {
                      setShowIndicatorsDropdown(false);
                    }}
                    className="w-full px-4 py-3 text-left flex items-center space-x-3 hover:bg-white/10 transition-colors"
                    style={{
                      background: 'transparent',
                      color: '#d1d5db',
                      fontSize: '13px',
                      fontWeight: '500',
                      letterSpacing: '0.3px',
                      textShadow: '0 1px 1px rgba(0, 0, 0, 0.8)'
                    }}
                  >
                    <span className="text-sm">📈</span>
                    <span>{indicator.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* New Action Buttons */}
          <div className="flex items-center space-x-2">
            {/* ADMIN Button */}
            <button 
              className="relative group"
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#d1d5db',
                fontWeight: '600',
                fontSize: '13px',
                letterSpacing: '0.5px',
                textShadow: '0 1px 1px rgba(0, 0, 0, 0.8)',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.15)';
                e.currentTarget.style.color = '#ffffff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.color = '#d1d5db';
              }}
            >
              ADMIN
            </button>

            {/* AI Button */}
            <button 
              className="relative group"
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#d1d5db',
                fontWeight: '600',
                fontSize: '13px',
                letterSpacing: '0.5px',
                textShadow: '0 1px 1px rgba(0, 0, 0, 0.8)',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.15)';
                e.currentTarget.style.color = '#ffffff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.color = '#d1d5db';
              }}
            >
              AI
            </button>

            {/* Tools Button */}
            <button 
              className="relative group"
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#d1d5db',
                fontWeight: '600',
                fontSize: '13px',
                letterSpacing: '0.5px',
                textShadow: '0 1px 1px rgba(0, 0, 0, 0.8)',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.15)';
                e.currentTarget.style.color = '#ffffff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.color = '#d1d5db';
              }}
            >
              TOOLS
            </button>
          </div>

          {/* Settings Button */}
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className="relative group"
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              background: showSettings
                ? 'linear-gradient(135deg, #2962ff 0%, #1e4db7 100%)'
                : 'linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%)',
              border: showSettings
                ? '1px solid rgba(41, 98, 255, 0.5)'
                : '1px solid rgba(255, 255, 255, 0.1)',
              color: showSettings ? '#ffffff' : '#d1d5db',
              fontWeight: '600',
              fontSize: '13px',
              letterSpacing: '0.5px',
              textShadow: showSettings
                ? '0 1px 2px rgba(0, 0, 0, 0.8), 0 0 8px rgba(41, 98, 255, 0.4)'
                : '0 1px 1px rgba(0, 0, 0, 0.8)',
              boxShadow: showSettings
                ? '0 4px 12px rgba(41, 98, 255, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
                : '0 2px 8px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
            onMouseEnter={(e) => {
              if (!showSettings) {
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.15)';
                e.currentTarget.style.color = '#ffffff';
              }
            }}
            onMouseLeave={(e) => {
              if (!showSettings) {
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.color = '#d1d5db';
              }
            }}
          >
            SETTINGS
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="absolute top-22 right-4 bg-[#1e222d] border border-[#2a2e39] rounded-lg p-6 w-80 shadow-2xl" style={{ zIndex: 9999 }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold">Chart Settings</h3>
            <button 
              onClick={() => setShowSettings(false)}
              className="text-[#787b86] hover:text-white text-xl"
            >
              ×
            </button>
          </div>

          {/* Grid Toggle */}
          <div className="mb-6">
            <label className="block text-[#d1d4dc] text-sm font-medium mb-2">Grid Lines</label>
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setConfig(prev => ({ ...prev, showGrid: !prev.showGrid }))}
                className={`flex items-center justify-center w-12 h-6 rounded-full transition-colors ${
                  config.showGrid
                    ? 'bg-[#2962ff]'
                    : 'bg-[#131722] border border-[#2a2e39]'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white transition-transform ${
                    config.showGrid ? 'translate-x-3' : 'translate-x-0'
                  }`}
                />
              </button>
              <span className="text-[#787b86] text-sm">
                {config.showGrid ? 'Enabled' : 'Disabled'}
              </span>
            </div>
          </div>

          {/* Y-Axis Settings */}
          <div className="mb-6">
            <label className="block text-[#d1d4dc] text-sm font-medium mb-3">Y-Axis (Price)</label>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[#787b86] text-sm">Text Size</span>
                <input
                  type="range"
                  min="8"
                  max="20"
                  value={config.axisStyle.yAxis.textSize}
                  onChange={(e) => setConfig(prev => ({
                    ...prev,
                    axisStyle: {
                      ...prev.axisStyle,
                      yAxis: { ...prev.axisStyle.yAxis, textSize: parseInt(e.target.value) }
                    }
                  }))}
                  className="w-20 accent-[#2962ff]"
                />
                <span className="text-[#787b86] text-xs w-8">{config.axisStyle.yAxis.textSize}px</span>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-[#787b86] text-sm">Text Color</span>
                <input
                  type="color"
                  value={config.axisStyle.yAxis.textColor}
                  onChange={(e) => setConfig(prev => ({
                    ...prev,
                    axisStyle: {
                      ...prev.axisStyle,
                      yAxis: { ...prev.axisStyle.yAxis, textColor: e.target.value }
                    }
                  }))}
                  className="w-8 h-8 rounded cursor-pointer bg-transparent"
                />
              </div>
            </div>
          </div>

          {/* X-Axis Settings */}
          <div className="mb-6">
            <label className="block text-[#d1d4dc] text-sm font-medium mb-3">X-Axis (Time)</label>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[#787b86] text-sm">Text Size</span>
                <input
                  type="range"
                  min="8"
                  max="20"
                  value={config.axisStyle.xAxis.textSize}
                  onChange={(e) => setConfig(prev => ({
                    ...prev,
                    axisStyle: {
                      ...prev.axisStyle,
                      xAxis: { ...prev.axisStyle.xAxis, textSize: parseInt(e.target.value) }
                    }
                  }))}
                  className="w-20 accent-[#2962ff]"
                />
                <span className="text-[#787b86] text-xs w-8">{config.axisStyle.xAxis.textSize}px</span>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-[#787b86] text-sm">Text Color</span>
                <input
                  type="color"
                  value={config.axisStyle.xAxis.textColor}
                  onChange={(e) => setConfig(prev => ({
                    ...prev,
                    axisStyle: {
                      ...prev.axisStyle,
                      xAxis: { ...prev.axisStyle.xAxis, textColor: e.target.value }
                    }
                  }))}
                  className="w-8 h-8 rounded cursor-pointer bg-transparent"
                />
              </div>
            </div>
          </div>

          {/* Theme Selection */}
          <div className="mb-6">
            <label className="block text-[#d1d4dc] text-sm font-medium mb-2">Theme</label>
            <div className="flex space-x-2">
              <button
                onClick={() => setConfig(prev => ({ ...prev, theme: 'dark' }))}
                className={`px-4 py-2 rounded text-sm transition-colors ${
                  config.theme === 'dark'
                    ? 'bg-[#2962ff] text-white'
                    : 'bg-[#131722] text-[#787b86] hover:text-white'
                }`}
              >
                🌙 Dark
              </button>
              <button
                onClick={() => setConfig(prev => ({ ...prev, theme: 'light' }))}
                className={`px-4 py-2 rounded text-sm transition-colors ${
                  config.theme === 'light'
                    ? 'bg-[#2962ff] text-white'
                    : 'bg-[#131722] text-[#787b86] hover:text-white'
                }`}
              >
                ☀️ Light
              </button>
            </div>
          </div>

          {/* Body Colors */}
          <div className="mb-6">
            <label className="block text-[#d1d4dc] text-sm font-medium mb-3">✅ Body</label>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[#787b86] text-sm">Bullish</span>
                <input
                  type="color"
                  value={config.colors.bullish.body}
                  onChange={(e) => setConfig(prev => ({
                    ...prev,
                    colors: {
                      ...prev.colors,
                      bullish: { ...prev.colors.bullish, body: e.target.value }
                    }
                  }))}
                  className="w-8 h-8 rounded cursor-pointer bg-transparent"
                />
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-[#787b86] text-sm">Bearish</span>
                <input
                  type="color"
                  value={config.colors.bearish.body}
                  onChange={(e) => setConfig(prev => ({
                    ...prev,
                    colors: {
                      ...prev.colors,
                      bearish: { ...prev.colors.bearish, body: e.target.value }
                    }
                  }))}
                  className="w-8 h-8 rounded cursor-pointer bg-transparent"
                />
              </div>
            </div>
          </div>

          {/* Border Colors */}
          <div className="mb-6">
            <label className="block text-[#d1d4dc] text-sm font-medium mb-3">✅ Borders</label>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[#787b86] text-sm">Bullish</span>
                <input
                  type="color"
                  value={config.colors.bullish.border}
                  onChange={(e) => setConfig(prev => ({
                    ...prev,
                    colors: {
                      ...prev.colors,
                      bullish: { ...prev.colors.bullish, border: e.target.value }
                    }
                  }))}
                  className="w-8 h-8 rounded cursor-pointer bg-transparent"
                />
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-[#787b86] text-sm">Bearish</span>
                <input
                  type="color"
                  value={config.colors.bearish.border}
                  onChange={(e) => setConfig(prev => ({
                    ...prev,
                    colors: {
                      ...prev.colors,
                      bearish: { ...prev.colors.bearish, border: e.target.value }
                    }
                  }))}
                  className="w-8 h-8 rounded cursor-pointer bg-transparent"
                />
              </div>
            </div>
          </div>

          {/* Wick Colors */}
          <div className="mb-6">
            <label className="block text-[#d1d4dc] text-sm font-medium mb-3">✅ Wick</label>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[#787b86] text-sm">Bullish</span>
                <input
                  type="color"
                  value={config.colors.bullish.wick}
                  onChange={(e) => setConfig(prev => ({
                    ...prev,
                    colors: {
                      ...prev.colors,
                      bullish: { ...prev.colors.bullish, wick: e.target.value }
                    }
                  }))}
                  className="w-8 h-8 rounded cursor-pointer bg-transparent"
                />
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-[#787b86] text-sm">Bearish</span>
                <input
                  type="color"
                  value={config.colors.bearish.wick}
                  onChange={(e) => setConfig(prev => ({
                    ...prev,
                    colors: {
                      ...prev.colors,
                      bearish: { ...prev.colors.bearish, wick: e.target.value }
                    }
                  }))}
                  className="w-8 h-8 rounded cursor-pointer bg-transparent"
                />
              </div>
            </div>
          </div>

          {/* Volume Colors */}
          <div className="mb-6">
            <label className="block text-[#d1d4dc] text-sm font-medium mb-3">Volume</label>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[#787b86] text-sm">Bullish</span>
                <input
                  type="color"
                  value={config.colors.volume.bullish.replace(/[0-9a-f]{2}$/i, '')} // Remove alpha
                  onChange={(e) => setConfig(prev => ({
                    ...prev,
                    colors: {
                      ...prev.colors,
                      volume: { ...prev.colors.volume, bullish: e.target.value + '80' } // Add alpha
                    }
                  }))}
                  className="w-8 h-8 rounded cursor-pointer bg-transparent"
                />
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-[#787b86] text-sm">Bearish</span>
                <input
                  type="color"
                  value={config.colors.volume.bearish.replace(/[0-9a-f]{2}$/i, '')} // Remove alpha
                  onChange={(e) => setConfig(prev => ({
                    ...prev,
                    colors: {
                      ...prev.colors,
                      volume: { ...prev.colors.volume, bearish: e.target.value + '80' } // Add alpha
                    }
                  }))}
                  className="w-8 h-8 rounded cursor-pointer bg-transparent"
                />
              </div>
            </div>
          </div>

          {/* Preset Themes */}
          <div className="mb-4">
            <label className="block text-[#d1d4dc] text-sm font-medium mb-2">Quick Presets</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setConfig(prev => ({
                  ...prev,
                  colors: {
                    bullish: { body: '#26a69a', wick: '#26a69a', border: '#26a69a' },
                    bearish: { body: '#ef5350', wick: '#ef5350', border: '#ef5350' },
                    volume: { bullish: '#26a69a80', bearish: '#ef535080' }
                  }
                }))}
                className="px-3 py-2 bg-[#131722] text-[#787b86] rounded text-sm hover:text-white hover:bg-[#2a2e39] transition-colors"
              >
                Classic
              </button>
              <button
                onClick={() => setConfig(prev => ({
                  ...prev,
                  colors: {
                    bullish: { body: '#00d4aa', wick: '#00d4aa', border: '#00d4aa' },
                    bearish: { body: '#fb8c00', wick: '#fb8c00', border: '#fb8c00' },
                    volume: { bullish: '#00d4aa80', bearish: '#fb8c0080' }
                  }
                }))}
                className="px-3 py-2 bg-[#131722] text-[#787b86] rounded text-sm hover:text-white hover:bg-[#2a2e39] transition-colors"
              >
                Neon
              </button>
              <button
                onClick={() => setConfig(prev => ({
                  ...prev,
                  colors: {
                    bullish: { body: '#4caf50', wick: '#4caf50', border: '#2e7d32' },
                    bearish: { body: '#f44336', wick: '#f44336', border: '#c62828' },
                    volume: { bullish: '#4caf5080', bearish: '#f4433680' }
                  }
                }))}
                className="px-3 py-2 bg-[#131722] text-[#787b86] rounded text-sm hover:text-white hover:bg-[#2a2e39] transition-colors"
              >
                Material
              </button>
              <button
                onClick={() => setConfig(prev => ({
                  ...prev,
                  colors: {
                    bullish: { body: '#2196f3', wick: '#2196f3', border: '#2196f3' },
                    bearish: { body: '#9c27b0', wick: '#9c27b0', border: '#9c27b0' },
                    volume: { bullish: '#2196f380', bearish: '#9c27b080' }
                  }
                }))}
                className="px-3 py-2 bg-[#131722] text-[#787b86] rounded text-sm hover:text-white hover:bg-[#2a2e39] transition-colors"
              >
                Blue/Purple
              </button>
            </div>
          </div>

          {/* Apply Button */}
          <button
            onClick={() => setShowSettings(false)}
            className="w-full px-4 py-2 bg-[#2962ff] text-white rounded hover:bg-[#2151cc] transition-colors"
          >
            Apply Settings
          </button>
        </div>
      )}

      {/* Chart Container */}
      <div 
        ref={containerRef}
        className="relative flex-1"
        style={{ height: height - 150 }} // Reduced height to leave space for X-axis
      >
        {/* Loading Overlay */}
        {loading && (
          <div className="absolute inset-0 z-50 bg-black/80 flex items-center justify-center">
            <div className="bg-[#1e222d] border border-[#2a2e39] rounded-lg p-6 flex items-center space-x-3">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#2962ff]"></div>
              <span className="text-white text-lg">Loading {config.timeframe} data...</span>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="absolute inset-0 z-50 bg-black/80 flex items-center justify-center">
            <div className="bg-[#1e222d] border border-red-500 rounded-lg p-6">
              <span className="text-red-400">Error: {error}</span>
            </div>
          </div>
        )}

        {/* Main Chart Canvas with Integrated Volume */}
        <canvas
          ref={chartCanvasRef}
          className="absolute top-0 left-0 z-10"
          style={{ height: chartHeight }}
        />

        {/* Crosshair and Interaction Overlay */}
        <canvas
          ref={overlayCanvasRef}
          className="absolute inset-0 z-20"
          style={{ 
            cursor: isDragging ? 'grabbing' : 'crosshair',
            transition: 'cursor 0.1s ease'
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          onDoubleClick={handleDoubleClick}
        />
      </div>
    </div>
  );
}
