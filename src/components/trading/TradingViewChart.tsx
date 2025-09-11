'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { 
  TbChartLine, 
  TbNews, 
  TbBellRinging, 
  TbMessageCircle, 
  TbTrendingUp,
  TbX,
  TbSend,
  TbPhoto
} from 'react-icons/tb';

// Add custom styles for 3D carved effect
const carvedTextStyles = `
  .text-shadow-carved {
    text-shadow: 
      1px 1px 0px rgba(0, 0, 0, 0.9),
      -1px -1px 0px rgba(255, 255, 255, 0.1),
      0px -1px 0px rgba(255, 255, 255, 0.05),
      0px 1px 0px rgba(0, 0, 0, 0.8);
  }
  
  .glow-yellow {
    text-shadow: 0 0 5px rgba(255, 255, 0, 0.5), 0 0 10px rgba(255, 255, 0, 0.3);
  }
  
  .glow-green {
    text-shadow: 0 0 5px rgba(0, 255, 0, 0.5), 0 0 10px rgba(0, 255, 0, 0.3);
  }
  
  .glow-red {
    text-shadow: 0 0 5px rgba(255, 0, 0, 0.5), 0 0 10px rgba(255, 0, 0, 0.3);
  }
`;

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
  chartType: 'candlestick' | 'line';
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

// Drawing Style Interface
interface DrawingStyle {
  color?: string;
  lineWidth?: number;
  lineDash?: number[];
  fillOpacity?: number;
  textSize?: number;
  showLabels?: boolean;
  showLevels?: boolean;
}

// Drawing Interface
interface Drawing {
  id: string | number;
  type: string;
  startPoint?: { x: number; y: number };
  endPoint?: { x: number; y: number };
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
  text?: string;
  style?: DrawingStyle;
  points?: { x: number; y: number }[];
  timestamp?: number;
  metadata?: any;
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

const DROPDOWN_CHART_TYPES: { label: string; value: string; icon: string }[] = [
  // Only Candlestick and Line chart types are now supported
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

// TradingView Drawing Tools - Complete Implementation with Functionality
const DRAWING_TOOLS = {
  'Line Tools': [
    { label: 'Trend Line', value: 'trend_line', icon: '⟍', description: '', functional: true },
    { label: 'Horizontal Line', value: 'horizontal_line', icon: '━', description: '', functional: true },
    { label: 'Vertical Line', value: 'vertical_line', icon: '┃', description: '', functional: true },
    { label: 'Horizontal Ray', value: 'ray', icon: '━▷', description: '', functional: true }
  ],
  'FIB Tools': [
    { label: 'Fibonacci Retracement', value: 'fib_retracement', icon: '◇', description: '', functional: true },
    { label: 'Fibonacci Extension', value: 'fib_extension', icon: '◈', description: '', functional: true },
    { label: 'Fibonacci Fan', value: 'fib_fan', icon: '◢', description: '', functional: true },
    { label: 'Fibonacci Arc', value: 'fib_arc', icon: '◐', description: '', functional: true },
    { label: 'Fibonacci Time Zone', value: 'fib_timezone', icon: '⫸', description: '', functional: true },
    { label: 'Fibonacci Channel', value: 'fib_channel', icon: '⧄', description: '', functional: true },
    { label: 'Fibonacci Speed Fan', value: 'fib_speed_fan', icon: '◣', description: '', functional: true }
  ],
  'Shapes': [
    { label: 'Rectangle', value: 'rectangle', icon: '▭', description: '', functional: true },
    { label: 'Ellipse', value: 'ellipse', icon: '○', description: '', functional: true },
    { label: 'Triangle', value: 'triangle', icon: '△', description: '', functional: true },
    { label: 'Circle', value: 'circle', icon: '◯', description: '', functional: true },
    { label: 'Arc', value: 'arc', icon: '◠', description: '', functional: true },
    { label: 'Polyline', value: 'polyline', icon: '⟲', description: '', functional: true },
    { label: 'Polygon', value: 'polygon', icon: '⬟', description: '', functional: true }
  ],
  'Gann': [
    { label: 'Gann Line', value: 'gann_line', icon: '∠', description: '', functional: true },
    { label: 'Gann Fan', value: 'gann_fan', icon: '✦', description: '', functional: true },
    { label: 'Gann Box', value: 'gann_box', icon: '□', description: '', functional: true },
    { label: 'Gann Square', value: 'gann_square', icon: '◻', description: '', functional: true }
  ],
  'Elliott': [
    { label: 'Elliott Wave', value: 'elliott_wave', icon: '~', description: '', functional: true },
    { label: 'Elliott Impulse', value: 'elliott_impulse', icon: '↗', description: '', functional: true },
    { label: 'Elliott Correction', value: 'elliott_correction', icon: '↩', description: '', functional: true },
    { label: 'Elliott Triple Combo', value: 'elliott_triple', icon: '≈', description: '', functional: true }
  ],
  'Prediction': [
    { label: 'Pitchfork', value: 'pitchfork', icon: '⟡', description: '', functional: true },
    { label: 'Schiff Pitchfork', value: 'schiff_pitchfork', icon: '✧', description: '', functional: true },
    { label: 'Inside Pitchfork', value: 'inside_pitchfork', icon: '⧨', description: '', functional: true },
    { label: 'Regression Trend', value: 'regression', icon: '↘', description: '', functional: true },
    { label: 'Forecast', value: 'forecast', icon: '⤳', description: '', functional: true }
  ],
  'Measure': [
    { label: 'Ruler', value: 'ruler', icon: '━', description: '', functional: true },
    { label: 'Price Range', value: 'price_range', icon: '┃', description: '', functional: true },
    { label: 'Date Range', value: 'date_range', icon: '┳', description: '', functional: true },
    { label: 'Date & Price Range', value: 'date_price_range', icon: '╂', description: '', functional: true },
    { label: 'Projection', value: 'projection', icon: '⤻', description: '', functional: true }
  ],
  'Notes': [
    { label: 'Text', value: 'text', icon: 'T', description: '', functional: true },
    { label: 'Note', value: 'note', icon: 'N', description: '', functional: true },
    { label: 'Callout', value: 'callout', icon: 'C', description: '', functional: true },
    { label: 'Price Label', value: 'price_label', icon: 'P', description: '', functional: true },
    { label: 'Flag', value: 'flag', icon: 'F', description: '', functional: true },
    { label: 'Anchored Text', value: 'anchored_text', icon: 'A', description: '', functional: true }
  ],
  'Volume': [
    { label: 'Volume Profile', value: 'volume_profile', icon: '▬', description: '', functional: true },
    { label: 'Fixed Range VP', value: 'fixed_range_vp', icon: '⊞', description: '', functional: true },
    { label: 'Anchored VWAP', value: 'anchored_vwap', icon: '⚓', description: '', functional: true },
    { label: 'Session Volume', value: 'session_volume', icon: '⧗', description: '', functional: true }
  ],
  'Patterns': [
    { label: 'Head & Shoulders', value: 'head_shoulders', icon: 'H', description: '', functional: true },
    { label: 'Triangle Pattern', value: 'triangle_pattern', icon: '▲', description: '', functional: true },
    { label: 'Flag Pattern', value: 'flag_pattern', icon: '⚑', description: '', functional: true },
    { label: 'Wedge Pattern', value: 'wedge_pattern', icon: '◆', description: '', functional: true },
    { label: 'ABCD Pattern', value: 'abcd_pattern', icon: 'ᴀʙᴄᴅ', description: '', functional: true }
  ],
  'Harmonic': [
    { label: 'Bat Pattern', value: 'bat_pattern', icon: 'B', description: '', functional: true },
    { label: 'Butterfly Pattern', value: 'butterfly_pattern', icon: 'ʙ', description: '', functional: true },
    { label: 'Gartley Pattern', value: 'gartley_pattern', icon: 'G', description: '', functional: true },
    { label: 'Crab Pattern', value: 'crab_pattern', icon: 'C', description: '', functional: true },
    { label: 'Shark Pattern', value: 'shark_pattern', icon: 'S', description: '', functional: true },
    { label: 'Cypher Pattern', value: 'cypher_pattern', icon: 'Ɔ', description: '', functional: true }
  ],
  'Cycles': [
    { label: 'Cycle Lines', value: 'cycle_lines', icon: '○', description: '', functional: true },
    { label: 'Sine Line', value: 'sine_line', icon: '∼', description: '', functional: true },
    { label: 'Time Cycles', value: 'time_cycles', icon: '⊙', description: '', functional: true }
  ],
  'Orders': [
    { label: 'Long Position', value: 'long_position', icon: '↗', description: '', functional: true },
    { label: 'Short Position', value: 'short_position', icon: '↘', description: '', functional: true },
    { label: 'Risk & Reward', value: 'risk_reward', icon: '⚖', description: '', functional: true },
    { label: 'Price Alert', value: 'price_alert', icon: '!', description: '', functional: true }
  ]
};

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
    timezone: 'UTC',
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
  const [showIndicatorsDropdown, setShowIndicatorsDropdown] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);

  // Sidebar panel state
  const [activeSidebarPanel, setActiveSidebarPanel] = useState<string | null>(null);
  const [watchlistTab, setWatchlistTab] = useState('Markets');
  const [regimesTab, setRegimesTab] = useState('Life');
  const [chatTab, setChatTab] = useState('admin');

  // Watchlist data state
  const [watchlistData, setWatchlistData] = useState<{[key: string]: {
    price: number;
    change1d: number;
    change5d: number;
    change13d: number;
    change21d: number;
    performance: string;
    performanceColor: string;
  }}>({});

  // Market data for major indices and sectors
  const marketSymbols = {
    Markets: ['SPY', 'QQQ', 'IWM', 'DIA', 'XLK', 'XLY', 'XLC', 'XLRE', 'XLV', 'XLU', 'XLP', 'XLB', 'XLF', 'XLI', 'XLE'],
    Industries: ['IGV', 'SMH', 'XRT', 'KIE', 'KRE', 'GDX', 'ITA', 'TAN', 'XBI', 'ITB', 'XHB', 'XOP', 'OIH', 'XME', 'ARKK', 'IPO', 'VNQ', 'JETS', 'KWEB'],
    Special: []
  };

  // Fetch real market data from Polygon API
  useEffect(() => {
    const fetchRealMarketData = async () => {
      const symbols = [
        // Markets
        'SPY', 'QQQ', 'IWM', 'DIA', 'XLK', 'XLY', 'XLC', 'XLRE', 'XLV', 'XLU', 'XLP', 'XLB', 'XLF', 'XLI', 'XLE',
        // Industries
        'IGV', 'SMH', 'XRT', 'KIE', 'KRE', 'GDX', 'ITA', 'TAN', 'XBI', 'ITB', 'XHB', 'XOP', 'OIH', 'XME', 'ARKK', 'IPO', 'VNQ', 'JETS', 'KWEB'
      ];
      const processedData: any = {};

      try {
        console.log('🔄 Fetching watchlist data for symbols:', symbols);
        
        // For each symbol, fetch historical data and calculate metrics
        for (const symbol of symbols) {
          try {
            console.log(`📊 Fetching data for ${symbol}...`);
            
            // Get recent historical data (last 30 days) for price and performance calculations
            const endDate = new Date().toISOString().split('T')[0];
            const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            
            const response = await fetch(`/api/historical-data?symbol=${symbol}&startDate=${startDate}&endDate=${endDate}`);
            
            if (response.ok) {
              const result = await response.json();
              
              if (result?.results && Array.isArray(result.results) && result.results.length >= 21) {
                const data = result.results;
                const latest = data[data.length - 1];
                const currentPrice = latest.c; // close price
                
                console.log(`📊 ${symbol} - Data length: ${data.length}, Current price: ${currentPrice}`);
                
                // Calculate percentage changes safely - accounting for potential data gaps
                // Get actual trading days, not just array positions
                const price1DayAgo = data[data.length - 2]?.c || currentPrice;
                const price5DaysAgo = data[data.length - Math.min(6, data.length - 1)]?.c || currentPrice;
                const price13DaysAgo = data[data.length - Math.min(14, data.length - 1)]?.c || currentPrice;
                const price21DaysAgo = data[data.length - Math.min(22, data.length - 1)]?.c || currentPrice;

                console.log(`📈 ${symbol} Prices - Current: ${currentPrice}, 1D: ${price1DayAgo}, 5D: ${price5DaysAgo}, 13D: ${price13DaysAgo}, 21D: ${price21DaysAgo}`);

                const change1d = price1DayAgo ? ((currentPrice - price1DayAgo) / price1DayAgo) * 100 : 0;
                const change5d = price5DaysAgo ? ((currentPrice - price5DaysAgo) / price5DaysAgo) * 100 : 0;
                const change13d = price13DaysAgo ? ((currentPrice - price13DaysAgo) / price13DaysAgo) * 100 : 0;
                const change21d = price21DaysAgo ? ((currentPrice - price21DaysAgo) / price21DaysAgo) * 100 : 0;

                console.log(`📊 ${symbol} Changes - 1D: ${change1d.toFixed(2)}%, 5D: ${change5d.toFixed(2)}%, 13D: ${change13d.toFixed(2)}%, 21D: ${change21d.toFixed(2)}%`);

                let performance = 'Neutral';
                let performanceColor = 'text-white';

                // Store data first, then calculate relative performance after we have SPY data
                const tempData = {
                  price: currentPrice || 0,
                  change1d,
                  change5d,
                  change13d,
                  change21d,
                  performance: 'Neutral',
                  performanceColor: 'text-white'
                };
                
                processedData[symbol] = tempData;

                processedData[symbol] = {
                  price: currentPrice || 0,
                  change1d,
                  change5d,
                  change13d,
                  change21d,
                  performance,
                  performanceColor
                };
                
                console.log(`✅ ${symbol}: $${currentPrice?.toFixed(2)} (${change1d?.toFixed(2)}%) - ${performance}`);
              } else {
                console.warn(`⚠️ No sufficient data for ${symbol}`);
              }
            } else {
              console.warn(`❌ Failed to fetch data for ${symbol}:`, response.status);
            }
          } catch (symbolError) {
            console.warn(`❌ Error fetching data for ${symbol}:`, symbolError);
            // Continue with next symbol instead of breaking the entire loop
          }
        }

        // After collecting all data, calculate relative performance to SPY
        if (Object.keys(processedData).length > 0 && processedData['SPY']) {
          const spyData = processedData['SPY'];
          
          // Calculate relative performance for each symbol vs SPY
          Object.keys(processedData).forEach(symbol => {
            if (symbol !== 'SPY') {
              const symbolData = processedData[symbol];
              
              // Calculate relative performance vs SPY
              const relative1d = symbolData.change1d - spyData.change1d;
              const relative5d = symbolData.change5d - spyData.change5d;
              const relative13d = symbolData.change13d - spyData.change13d;
              const relative21d = symbolData.change21d - spyData.change21d;
              
              console.log(`🔍 ${symbol} vs SPY Relative Performance:`);
              console.log(`   1D: ${symbol}=${symbolData.change1d.toFixed(2)}% - SPY=${spyData.change1d.toFixed(2)}% = ${relative1d.toFixed(2)}%`);
              console.log(`   5D: ${symbol}=${symbolData.change5d.toFixed(2)}% - SPY=${spyData.change5d.toFixed(2)}% = ${relative5d.toFixed(2)}%`);
              console.log(`   13D: ${symbol}=${symbolData.change13d.toFixed(2)}% - SPY=${spyData.change13d.toFixed(2)}% = ${relative13d.toFixed(2)}%`);
              console.log(`   21D: ${symbol}=${symbolData.change21d.toFixed(2)}% - SPY=${spyData.change21d.toFixed(2)}% = ${relative21d.toFixed(2)}%`);
              
              let performance = 'Neutral';
              let performanceColor = 'text-white';
              
              // Performance based on relative strength to SPY (green = outperforming, red = underperforming)
              if (relative21d > 0) {
                performance = 'KING';
                performanceColor = 'text-yellow-400 drop-shadow-[0_0_8px_rgba(255,215,0,0.8)]';
              } else if (relative21d < 0) {
                performance = 'Fallen';
                performanceColor = 'text-orange-600 drop-shadow-[0_0_8px_rgba(255,165,0,0.8)]';
              } else if (relative13d > 0) {
                performance = 'Leader';
                performanceColor = 'text-green-400 drop-shadow-[0_0_8px_rgba(34,197,94,0.8)]';
              } else if (relative13d < 0) {
                performance = 'Laggard';
                performanceColor = 'text-red-400 drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]';
              } else if (relative5d > 0) {
                performance = 'Strong';
                performanceColor = 'text-green-400';
              } else if (relative5d < 0) {
                performance = 'Weak';
                performanceColor = 'text-red-400';
              } else if (relative1d > 0) {
                performance = 'Rising';
                performanceColor = 'text-blue-400';
              } else if (relative1d < 0) {
                performance = 'Falling';
                performanceColor = 'text-purple-400';
              }
              
              // Update the symbol's performance
              processedData[symbol].performance = performance;
              processedData[symbol].performanceColor = performanceColor;
              
              console.log(`✅ ${symbol}: $${symbolData.price?.toFixed(2)} vs SPY: 21d(${relative21d?.toFixed(2)}%) 13d(${relative13d?.toFixed(2)}%) 5d(${relative5d?.toFixed(2)}%) 1d(${relative1d?.toFixed(2)}%) - ${performance}`);
            } else {
              // SPY gets neutral since it's the benchmark
              processedData[symbol].performance = 'Benchmark';
              processedData[symbol].performanceColor = 'text-blue-300';
              console.log(`✅ SPY (Benchmark): $${processedData[symbol].price?.toFixed(2)} - Base comparison`);
            }
          });
        }

        // Update state only if we have some data
        if (Object.keys(processedData).length > 0) {
          console.log(`✅ Successfully processed ${Object.keys(processedData).length} symbols for watchlist`);
          setWatchlistData(processedData);
        } else {
          console.warn('❌ No watchlist data processed');
        }

      } catch (error) {
        console.error('❌ Error in market data fetching:', error);
      }
    };

    // Initial fetch
    fetchRealMarketData();
    
    // Set up interval for regular updates
    const interval = setInterval(fetchRealMarketData, 30000); // Update every 30 seconds
    
    return () => clearInterval(interval);
  }, []); // Empty dependency array to run only once

  // Drawing Tools State - Enhanced for All TradingView Tools
  const [showToolsDropdown, setShowToolsDropdown] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  
  // Individual Category Dropdown States
  const [showLineToolsDropdown, setShowLineToolsDropdown] = useState(false);
  const [showFibDropdown, setShowFibDropdown] = useState(false);
  const [showShapesDropdown, setShowShapesDropdown] = useState(false);
  const [showGannDropdown, setShowGannDropdown] = useState(false);
  const [showElliottDropdown, setShowElliottDropdown] = useState(false);
  const [showPredictionDropdown, setShowPredictionDropdown] = useState(false);
  const [showMeasureDropdown, setShowMeasureDropdown] = useState(false);
  const [showNotesDropdown, setShowNotesDropdown] = useState(false);
  const [showVolumeDropdown, setShowVolumeDropdown] = useState(false);
  const [showPatternsDropdown, setShowPatternsDropdown] = useState(false);
  const [showHarmonicDropdown, setShowHarmonicDropdown] = useState(false);
  const [showCyclesDropdown, setShowCyclesDropdown] = useState(false);
  const [showOrdersDropdown, setShowOrdersDropdown] = useState(false);
  
  // Bulletproof drawing persistence using useRef + useState
  const drawingsRef = useRef<any[]>([]);
  const [drawings, setDrawingsState] = useState<any[]>([]);
  
  // Custom setDrawings that updates both ref and state
  const setDrawings = useCallback((updater: any) => {
    const newValue = typeof updater === 'function' ? updater(drawingsRef.current) : updater;
    drawingsRef.current = newValue;
    setDrawingsState(newValue);
    console.log('� PERSISTENT: drawings updated to', newValue.length, 'items');
  }, []);
  
  // Debug: Monitor drawings state changes
  useEffect(() => {
    console.log('🔍 Drawings state changed:', drawings.length, drawings);
  }, [drawings]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawingStartPoint, setDrawingStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [multiPointDrawing, setMultiPointDrawing] = useState<{ x: number; y: number }[]>([]);
  const [currentDrawingPhase, setCurrentDrawingPhase] = useState(0); // For multi-step tools
  const [drawingText, setDrawingText] = useState('');
  const [showTextInput, setShowTextInput] = useState(false);
  const [textInputPosition, setTextInputPosition] = useState<{ x: number; y: number } | null>(null);

  // Drawing selection and editing states
  const [selectedDrawing, setSelectedDrawing] = useState<any | null>(null);
  const [isDraggingDrawing, setIsDraggingDrawing] = useState(false);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  const [showDrawingEditor, setShowDrawingEditor] = useState(false);
  const [editorPosition, setEditorPosition] = useState({ x: 0, y: 0 });
  const [hoveredDrawing, setHoveredDrawing] = useState<any | null>(null);
  
  // Double-click detection
  const [lastClickTime, setLastClickTime] = useState(0);
  const [lastClickDrawing, setLastClickDrawing] = useState<any | null>(null);

  // Fibonacci levels configuration
  const fibonacciLevels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
  const fibonacciExtensionLevels = [0, 0.618, 1, 1.272, 1.414, 1.618, 2, 2.618];
  
  // Gann angles (1x1, 2x1, 3x1, 4x1, 8x1, 1x2, 1x3, 1x4, 1x8)
  const gannAngles = [45, 63.75, 71.25, 75, 82.5, 26.25, 18.75, 15, 7.5];

  // Pattern recognition data
  const [patternPoints, setPatternPoints] = useState<{ x: number; y: number }[]>([]);
  const [elliottWaveCount, setElliottWaveCount] = useState(1);
  const [harmonicRatios, setHarmonicRatios] = useState<{ [key: string]: number }>({});

  // Drawing style configuration
  const [drawingStyle, setDrawingStyle] = useState({
    color: '#00ff88',
    lineWidth: 2,
    lineDash: [],
    fillOpacity: 0.1,
    textSize: 12,
    showLabels: true,
    showLevels: true
  });

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
      // Use the same API endpoint that works for the watchlist
      const today = new Date();
      const endDate = today.toISOString().split('T')[0];
      const startDate = new Date(today.getTime() - (365 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0]; // 1 year ago
      
      const response = await fetch(
        `/api/historical-data?symbol=${sym}&startDate=${startDate}&endDate=${endDate}&_t=${Date.now()}`
      );
      
      if (!response.ok) {
        throw new Error(`Failed to fetch data: ${response.status}`);
      }
      
      const result = await response.json();
      
      // Polygon.io API returns data in result.results array format
      if (result && result.results && Array.isArray(result.results)) {
        // Transform the Polygon.io data to match the expected ChartDataPoint format
        const transformedData = result.results.map((item: any) => ({
          timestamp: item.t, // Polygon uses 't' for timestamp
          open: item.o,     // Polygon uses 'o' for open
          high: item.h,     // Polygon uses 'h' for high
          low: item.l,      // Polygon uses 'l' for low
          close: item.c,    // Polygon uses 'c' for close
          volume: item.v || 0, // Polygon uses 'v' for volume
          date: new Date(item.t).toISOString().split('T')[0],
          time: new Date(item.t).toLocaleTimeString()
        }));
        
        setData(transformedData);
        
        // Update price info from historical data
        if (transformedData.length > 0) {
          const latest = transformedData[transformedData.length - 1];
          const previous = transformedData[transformedData.length - 2] || latest;
          
          setCurrentPrice(latest.close);
          setPriceChange(latest.close - previous.close);
          setPriceChangePercent(((latest.close - previous.close) / previous.close) * 100);
        }
        
        // Auto-fit chart inline to avoid circular dependency
        setTimeout(() => {
          if (transformedData.length === 0) return;
          
          const prices = transformedData.flatMap((d: ChartDataPoint) => [d.high, d.low]);
          const minPrice = Math.min(...prices);
          const maxPrice = Math.max(...prices);
          const padding = (maxPrice - minPrice) * 0.1;
          
          setScrollOffset(Math.max(0, transformedData.length - Math.min(100, transformedData.length)));
          setVisibleCandleCount(Math.min(100, transformedData.length));
        }, 100);
      } else {
        throw new Error('Invalid data format - missing results array');
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
      
      if (showIndicatorsDropdown && !target.closest('.indicators-dropdown')) {
        setShowIndicatorsDropdown(false);
      }
      
      if (showToolsDropdown && !target.closest('.tools-dropdown')) {
        setShowToolsDropdown(false);
      }

      // Individual category dropdowns
      if (showLineToolsDropdown && !target.closest('.linetools-dropdown')) {
        setShowLineToolsDropdown(false);
      }
      if (showFibDropdown && !target.closest('.fibtools-dropdown')) {
        setShowFibDropdown(false);
      }
      if (showShapesDropdown && !target.closest('.shapes-dropdown')) {
        setShowShapesDropdown(false);
      }
      if (showGannDropdown && !target.closest('.gann-dropdown')) {
        setShowGannDropdown(false);
      }
      if (showElliottDropdown && !target.closest('.elliott-dropdown')) {
        setShowElliottDropdown(false);
      }
      if (showPredictionDropdown && !target.closest('.prediction-dropdown')) {
        setShowPredictionDropdown(false);
      }
      if (showMeasureDropdown && !target.closest('.measure-dropdown')) {
        setShowMeasureDropdown(false);
      }
      if (showNotesDropdown && !target.closest('.notes-dropdown')) {
        setShowNotesDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showTimeframeDropdown, showIndicatorsDropdown, showToolsDropdown, 
      showLineToolsDropdown, showFibDropdown, showShapesDropdown, showGannDropdown,
      showElliottDropdown, showPredictionDropdown, showMeasureDropdown, showNotesDropdown,
      showVolumeDropdown, showPatternsDropdown, showHarmonicDropdown, showCyclesDropdown, showOrdersDropdown]);

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

  // Debug: Monitor drawings state changes
  useEffect(() => {
    console.log('🔍 Debug: drawings state changed, count:', drawingsRef.current.length);
    console.log('🔍 Debug: current drawings:', drawingsRef.current);
  }, [drawings]);

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

    // Draw stored drawings on top of everything
    drawStoredDrawings(ctx);

    console.log(`✅ Integrated chart rendered successfully with ${config.theme} theme`);

  }, [data, dimensions, chartHeight, config.chartType, config.theme, config.volume, config.showGrid, config.axisStyle, colors, scrollOffset, visibleCandleCount, volumeAreaHeight, drawings]);

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

  // Unified mouse handler that prioritizes drawing interaction over chart panning
  const handleUnifiedMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return; // Only left mouse button
    
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    console.log('🖱️ Unified mouse down at:', { x, y, activeTool });

    // PRIORITY 1: Check for drawing selection (even when no active tool)
    if (!activeTool) {
      const clickedDrawing = findDrawingAtPoint({ x, y });
      console.log('🎯 Clicked drawing:', clickedDrawing);
      
      if (clickedDrawing) {
        // Drawing was clicked - handle drawing interaction
        const currentTime = Date.now();
        const isDoubleClick = 
          lastClickDrawing && 
          lastClickDrawing.id === clickedDrawing.id && 
          currentTime - lastClickTime < 500;

        console.log('⏰ Double-click check:', { isDoubleClick, timeDiff: currentTime - lastClickTime });

        setLastClickTime(currentTime);
        setLastClickDrawing(clickedDrawing);
        setSelectedDrawing(clickedDrawing);
        
        if (isDoubleClick) {
          console.log('🔧 Opening property editor');
          // Position the editor near the clicked drawing
          const canvas = e.currentTarget;
          const rect = canvas.getBoundingClientRect();
          const editorX = Math.min(x + rect.left + 20, window.innerWidth - 300); // Ensure it doesn't go off-screen
          const editorY = Math.min(y + rect.top, window.innerHeight - 400);
          
          setEditorPosition({ x: editorX, y: editorY });
          setShowDrawingEditor(true);
        } else {
          console.log('🤏 Starting drawing drag');
          setIsDraggingDrawing(true);
          
          let offsetX = 0, offsetY = 0;
          if (clickedDrawing.startPoint) {
            offsetX = x - clickedDrawing.startPoint.x;
            offsetY = y - clickedDrawing.startPoint.y;
          } else if (clickedDrawing.startX !== undefined) {
            offsetX = x - clickedDrawing.startX;
            offsetY = y - clickedDrawing.startY;
          }
          
          setDragOffset({ x: offsetX, y: offsetY });
        }
        
        e.preventDefault();
        return; // Don't proceed to chart panning
      } else {
        // No drawing clicked - deselect and allow chart panning
        console.log('🚫 No drawing clicked, deselecting');
        setSelectedDrawing(null);
        setShowDrawingEditor(false);
        setLastClickDrawing(null);
        
        // Fall through to chart panning logic below
      }
    }

    // PRIORITY 2: Handle active tool drawing
    if (activeTool) {
      // Call the original canvas drawing handler
      handleCanvasMouseDown(e);
      return;
    }

    // PRIORITY 3: Handle chart panning (original handleMouseDown logic)
    console.log('📊 Starting chart pan');
    setIsDragging(true);
    setLastMouseX(x);
    setDragStartX(x);
    setDragStartOffset(scrollOffset);
    
    e.preventDefault();
  }, [activeTool, lastClickDrawing, lastClickTime, scrollOffset]);

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
    setIsDraggingDrawing(false);
    setDragOffset(null);
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

  // Drawing Tools Functions
  const selectDrawingTool = (toolValue: string) => {
    setActiveTool(toolValue);
    setShowToolsDropdown(false);
    
    // Close all category dropdowns
    setShowLineToolsDropdown(false);
    setShowFibDropdown(false);
    setShowShapesDropdown(false);
    setShowGannDropdown(false);
    setShowElliottDropdown(false);
    setShowPredictionDropdown(false);
    setShowMeasureDropdown(false);
    setShowNotesDropdown(false);
    setShowVolumeDropdown(false);
    setShowPatternsDropdown(false);
    setShowHarmonicDropdown(false);
    setShowCyclesDropdown(false);
    setShowOrdersDropdown(false);
    
    // Reset any ongoing drawing
    setIsDrawing(false);
    setDrawingStartPoint(null);
  };

  const clearActiveTool = () => {
    setActiveTool(null);
    setIsDrawing(false);
    setDrawingStartPoint(null);
  };

  const clearAllDrawings = () => {
    setDrawings([]);
    setConfig(prev => ({ ...prev, drawings: [] }));
  };

  // Helper functions for coordinate conversion
  const canvasToPrice = (canvasY: number, minPrice: number, maxPrice: number, chartHeight: number): number => {
    const padding = (maxPrice - minPrice) * 0.1;
    const adjustedMin = minPrice - padding;
    const adjustedMax = maxPrice + padding;
    const priceRange = adjustedMax - adjustedMin;
    return adjustedMax - (canvasY / chartHeight) * priceRange;
  };

  const priceToCanvas = (price: number, minPrice: number, maxPrice: number, chartHeight: number): number => {
    const padding = (maxPrice - minPrice) * 0.1;
    const adjustedMin = minPrice - padding;
    const adjustedMax = maxPrice + padding;
    const priceRange = adjustedMax - adjustedMin;
    return ((adjustedMax - price) / priceRange) * chartHeight;
  };

  const canvasToTime = (canvasX: number, chartWidth: number, visibleDataLength: number, startIndex: number): number => {
    const index = Math.floor((canvasX / chartWidth) * visibleDataLength) + startIndex;
    return Math.max(0, Math.min(data.length - 1, index));
  };

  const timeToCanvas = (timeIndex: number, chartWidth: number, visibleDataLength: number, startIndex: number): number => {
    const relativeIndex = timeIndex - startIndex;
    return (relativeIndex / visibleDataLength) * chartWidth;
  };

  // Enhanced Canvas Drawing Interaction Handlers
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    console.log('🖱️ Mouse down at:', { x, y, activeTool });

    // If no active tool, handle drawing selection and movement
    if (!activeTool) {
      const clickedDrawing = findDrawingAtPoint({ x, y });
      console.log('🎯 Clicked drawing:', clickedDrawing);
      
      if (clickedDrawing) {
        // Double-click detection
        const currentTime = Date.now();
        const isDoubleClick = 
          lastClickDrawing && 
          lastClickDrawing.id === clickedDrawing.id && 
          currentTime - lastClickTime < 500;

        console.log('⏰ Double-click check:', { isDoubleClick, timeDiff: currentTime - lastClickTime });

        setLastClickTime(currentTime);
        setLastClickDrawing(clickedDrawing);

        // Select the drawing
        setSelectedDrawing(clickedDrawing);
        
        if (isDoubleClick) {
          // Open property editor on double-click
          console.log('🔧 Opening property editor');
          // Position the editor near the clicked drawing
          const canvas = e.currentTarget;
          const rect = canvas.getBoundingClientRect();
          const editorX = Math.min(x + rect.left + 20, window.innerWidth - 300);
          const editorY = Math.min(y + rect.top, window.innerHeight - 400);
          
          setEditorPosition({ x: editorX, y: editorY });
          setShowDrawingEditor(true);
        } else {
          // Single click - prepare for dragging
          console.log('🤏 Starting drag');
          setIsDraggingDrawing(true);
          
          // Calculate offset based on drawing type
          let offsetX = 0, offsetY = 0;
          if (clickedDrawing.startPoint) {
            offsetX = x - clickedDrawing.startPoint.x;
            offsetY = y - clickedDrawing.startPoint.y;
          } else if (clickedDrawing.startX !== undefined) {
            offsetX = x - clickedDrawing.startX;
            offsetY = y - clickedDrawing.startY;
          }
          
          // Also update editor position for potential future opening
          const canvas = e.currentTarget;
          const rect = canvas.getBoundingClientRect();
          const editorX = Math.min(x + rect.left + 20, window.innerWidth - 300);
          const editorY = Math.min(y + rect.top, window.innerHeight - 400);
          setEditorPosition({ x: editorX, y: editorY });
          
          setDragOffset({ x: offsetX, y: offsetY });
        }
      } else {
        // Deselect if clicking empty area
        console.log('🚫 Deselecting drawing');
        setSelectedDrawing(null);
        setShowDrawingEditor(false);
        setLastClickDrawing(null);
      }
      return;
    }
    
    // Multi-point tools that require multiple clicks
    const multiPointTools = [
      'pitchfork', 'schiff_pitchfork', 'inside_pitchfork', 'elliott_wave', 
      'elliott_impulse', 'elliott_correction', 'polyline', 'polygon',
      'head_shoulders', 'triangle_pattern', 'abcd_pattern', 'bat_pattern',
      'butterfly_pattern', 'gartley_pattern', 'crab_pattern', 'shark_pattern',
      'cypher_pattern', 'cycle_lines'
    ];
    
    // Text input tools
    const textTools = ['text', 'note', 'callout', 'price_label', 'anchored_text'];
    
    // Single-click tools
    const singleClickTools = [
      'horizontal_line', 'vertical_line', 'cross_line', 'flag', 
      'long_position', 'short_position', 'price_alert'
    ];

    if (textTools.includes(activeTool)) {
      // Handle text input tools
      setTextInputPosition({ x, y });
      setShowTextInput(true);
      return;
    }

    if (singleClickTools.includes(activeTool)) {
      // Handle single-click tools
      const newDrawing = {
        id: Date.now(),
        type: activeTool,
        startPoint: { x, y },
        endPoint: { x, y },
        timestamp: Date.now(),
        style: drawingStyle,
        text: activeTool === 'price_alert' ? `Alert: $${getCurrentPriceAtY(y).toFixed(2)}` : ''
      };
      
      setDrawings(prev => [...prev, newDrawing]);
      setIsDrawing(false);
      setDrawingStartPoint(null);
      setActiveTool(null); // Clear tool after single use
      return;
    }

    if (multiPointTools.includes(activeTool)) {
      // Handle multi-point tools
      const newPoint = { x, y };
      const updatedPoints = [...multiPointDrawing, newPoint];
      setMultiPointDrawing(updatedPoints);
      
      // Determine if we have enough points to complete the tool
      let requiredPoints = 2; // Default
      switch (activeTool) {
        case 'pitchfork':
        case 'schiff_pitchfork':
        case 'inside_pitchfork':
          requiredPoints = 3;
          break;
        case 'elliott_wave':
          requiredPoints = 8; // 5 impulse + 3 correction
          break;
        case 'elliott_impulse':
          requiredPoints = 5;
          break;
        case 'elliott_correction':
          requiredPoints = 3;
          break;
        case 'head_shoulders':
          requiredPoints = 5; // Left shoulder, head, right shoulder, neckline points
          break;
        case 'abcd_pattern':
          requiredPoints = 4;
          break;
        case 'bat_pattern':
        case 'butterfly_pattern':
        case 'gartley_pattern':
        case 'crab_pattern':
        case 'shark_pattern':
        case 'cypher_pattern':
          requiredPoints = 4; // X, A, B, C points
          break;
      }
      
      if (updatedPoints.length >= requiredPoints) {
        // Complete the multi-point drawing
        const newDrawing = {
          id: Date.now(),
          type: activeTool,
          points: updatedPoints,
          timestamp: Date.now(),
          style: drawingStyle,
          metadata: getToolMetadata(activeTool, updatedPoints)
        };
        
        setDrawings(prev => [...prev, newDrawing]);
        setMultiPointDrawing([]);
        setCurrentDrawingPhase(0);
        setActiveTool(null);
      } else {
        // Continue to next phase
        setCurrentDrawingPhase(prev => prev + 1);
      }
      return;
    }

    // Handle standard two-point tools and specialized tools
    if (!isDrawing) {
      // Start drawing
      setIsDrawing(true);
      setDrawingStartPoint({ x, y });
    } else {
      // Complete drawing
      if (drawingStartPoint) {
        const newDrawing: any = {
          id: Date.now(),
          type: activeTool,
          startPoint: drawingStartPoint,
          endPoint: { x, y },
          timestamp: Date.now(),
          style: drawingStyle,
          metadata: calculateDrawingMetadata(activeTool, drawingStartPoint, { x, y })
        };

        // Handle special tool types that need additional properties
        switch (activeTool) {
          case 'fib_retracement':
          case 'fib_extension':
            newDrawing.metadata = {
              ...newDrawing.metadata,
              levels: activeTool === 'fib_retracement' ? fibonacciLevels : fibonacciExtensionLevels,
              priceRange: Math.abs(getCurrentPriceAtY(y) - getCurrentPriceAtY(drawingStartPoint.y))
            };
            break;
          
          case 'fib_fan':
          case 'fib_arc':
          case 'fib_timezone':
          case 'fib_channel':
          case 'fib_speed_fan':
            newDrawing.metadata = {
              ...newDrawing.metadata,
              levels: fibonacciLevels,
              centerPoint: drawingStartPoint,
              radius: Math.sqrt((x - drawingStartPoint.x) ** 2 + (y - drawingStartPoint.y) ** 2)
            };
            break;
            
          case 'gann_line':
          case 'gann_fan':
            newDrawing.metadata = {
              ...newDrawing.metadata,
              angle: Math.atan2(y - drawingStartPoint.y, x - drawingStartPoint.x) * 180 / Math.PI,
              angles: gannAngles
            };
            break;
            
          case 'gann_box':
          case 'gann_square':
            newDrawing.metadata = {
              ...newDrawing.metadata,
              size: Math.max(Math.abs(x - drawingStartPoint.x), Math.abs(y - drawingStartPoint.y))
            };
            break;
            
          case 'regression':
            newDrawing.metadata = {
              ...newDrawing.metadata,
              slope: (y - drawingStartPoint.y) / (x - drawingStartPoint.x),
              correlation: 0.85 // Mock value - would calculate from actual data
            };
            break;
            
          case 'forecast':
            newDrawing.metadata = {
              ...newDrawing.metadata,
              projectionLength: Math.abs(x - drawingStartPoint.x),
              confidence: 0.75 // Mock confidence level
            };
            break;
            
          case 'volume_profile':
          case 'fixed_range_vp':
            newDrawing.metadata = {
              ...newDrawing.metadata,
              priceRange: Math.abs(getCurrentPriceAtY(y) - getCurrentPriceAtY(drawingStartPoint.y)),
              volumeNodes: [] // Would be populated with actual volume data
            };
            break;
        }
        
        console.log('✅ Adding new drawing:', newDrawing);
        console.log('📊 Current drawings before add:', drawings.length);
        console.log('🎯 Active tool:', activeTool);
        console.log('📍 Drawing points:', { startPoint: drawingStartPoint, endPoint: { x, y } });
        setDrawings(prev => {
          const newDrawings = [...prev, newDrawing];
          console.log('📊 New drawings array:', newDrawings.length, newDrawings);
          console.log('🆔 New drawing ID:', newDrawing.id);
          return newDrawings;
        });
        
        // Reset drawing state but keep tool active
        setIsDrawing(false);
        setDrawingStartPoint(null);
        // Don't clear activeTool - keep it active for multiple drawings
        // setActiveTool(null); // Removed - keep tool active
      }
    }
  };

  // Helper function to get current price at Y coordinate
  const getCurrentPriceAtY = (y: number): number => {
    const canvas = overlayCanvasRef.current;
    if (!canvas || !data.length) return 0;
    
    const rect = canvas.getBoundingClientRect();
    const priceRange = Math.max(...data.map(d => d.high)) - Math.min(...data.map(d => d.low));
    const priceMin = Math.min(...data.map(d => d.low));
    const relativeY = y / rect.height;
    return priceMin + (priceRange * (1 - relativeY));
  };

  // Helper function to calculate drawing metadata
  const calculateDrawingMetadata = (toolType: string, start: {x: number, y: number}, end: {x: number, y: number}) => {
    const metadata: any = {};
    
    switch (toolType) {
      case 'fib_retracement':
      case 'fib_extension':
        metadata.levels = toolType === 'fib_retracement' ? fibonacciLevels : fibonacciExtensionLevels;
        metadata.priceRange = Math.abs(getCurrentPriceAtY(end.y) - getCurrentPriceAtY(start.y));
        break;
      case 'gann_line':
        metadata.angle = Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI;
        break;
      case 'ruler':
        metadata.distance = Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2);
        metadata.angle = Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI;
        metadata.priceDistance = Math.abs(getCurrentPriceAtY(end.y) - getCurrentPriceAtY(start.y));
        break;
      case 'regression':
        metadata.slope = (end.y - start.y) / (end.x - start.x);
        break;
    }
    
    return metadata;
  };

  // Helper function to get tool-specific metadata
  const getToolMetadata = (toolType: string, points: {x: number, y: number}[]) => {
    const metadata: any = {};
    
    switch (toolType) {
      case 'elliott_wave':
        metadata.waveLabels = ['1', '2', '3', '4', '5', 'A', 'B', 'C'];
        metadata.waveTypes = ['impulse', 'correction'];
        break;
      case 'pitchfork':
        if (points.length >= 3) {
          const [p1, p2, p3] = points;
          metadata.medianLine = { start: p1, end: { x: (p2.x + p3.x) / 2, y: (p2.y + p3.y) / 2 } };
        }
        break;
      case 'bat_pattern':
        metadata.ratios = { XA_AB: 0.382, AB_BC: 0.382, BC_CD: 1.272, XA_AD: 0.886 };
        break;
      case 'gartley_pattern':
        metadata.ratios = { XA_AB: 0.618, AB_BC: 0.382, BC_CD: 1.272, XA_AD: 0.786 };
        break;
      case 'butterfly_pattern':
        metadata.ratios = { XA_AB: 0.786, AB_BC: 0.382, BC_CD: 1.618, XA_AD: 1.27 };
        break;
    }
    
    return metadata;
  };

  // Handle text input submission
  const handleTextSubmit = () => {
    if (textInputPosition && drawingText) {
      const newDrawing = {
        id: Date.now(),
        type: activeTool,
        startPoint: textInputPosition,
        endPoint: textInputPosition,
        timestamp: Date.now(),
        style: drawingStyle,
        text: drawingText
      };
      
      setDrawings(prev => [...prev, newDrawing]);
      setShowTextInput(false);
      setDrawingText('');
      setTextInputPosition(null);
      setActiveTool(null);
    }
  };

  // Helper function to test if a point is near a drawing (hit testing)
  const isPointNearDrawing = (point: { x: number; y: number }, drawing: any, tolerance = 8): boolean => {
    const { x, y } = point;
    
    switch (drawing.type) {
      case 'trend_line':
      case 'ray':
      case 'extended_line':
        return isPointNearLine(x, y, drawing.startPoint, drawing.endPoint, tolerance);
      
      case 'horizontal_line':
        return Math.abs(y - drawing.startPoint.y) <= tolerance;
      
      case 'vertical_line':
        return Math.abs(x - drawing.startPoint.x) <= tolerance;
      
      case 'rectangle':
        return isPointInRectangle(x, y, drawing.startPoint, drawing.endPoint, tolerance);
      
      case 'ellipse':
      case 'circle':
        return isPointNearEllipse(x, y, drawing.startPoint, drawing.endPoint, tolerance);
      
      case 'fib_retracement':
      case 'fib_extension':
        return isPointNearLine(x, y, drawing.startPoint, drawing.endPoint, tolerance);
      
      case 'text':
      case 'note':
      case 'callout':
        return isPointInTextBox(x, y, drawing.startPoint, drawing.text || '', tolerance);
      
      default:
        return isPointNearLine(x, y, drawing.startPoint, drawing.endPoint, tolerance);
    }
  };

  // Utility functions for hit testing
  const isPointNearLine = (x: number, y: number, start: { x: number; y: number }, end: { x: number; y: number }, tolerance: number): boolean => {
    const A = x - start.x;
    const B = y - start.y;
    const C = end.x - start.x;
    const D = end.y - start.y;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    
    if (lenSq === 0) return Math.sqrt(A * A + B * B) <= tolerance;
    
    const param = dot / lenSq;
    
    let xx, yy;
    if (param < 0) {
      xx = start.x;
      yy = start.y;
    } else if (param > 1) {
      xx = end.x;
      yy = end.y;
    } else {
      xx = start.x + param * C;
      yy = start.y + param * D;
    }

    const dx = x - xx;
    const dy = y - yy;
    return Math.sqrt(dx * dx + dy * dy) <= tolerance;
  };

  const isPointInRectangle = (x: number, y: number, start: { x: number; y: number }, end: { x: number; y: number }, tolerance: number): boolean => {
    const minX = Math.min(start.x, end.x) - tolerance;
    const maxX = Math.max(start.x, end.x) + tolerance;
    const minY = Math.min(start.y, end.y) - tolerance;
    const maxY = Math.max(start.y, end.y) + tolerance;
    
    return x >= minX && x <= maxX && y >= minY && y <= maxY;
  };

  const isPointNearEllipse = (x: number, y: number, start: { x: number; y: number }, end: { x: number; y: number }, tolerance: number): boolean => {
    const centerX = (start.x + end.x) / 2;
    const centerY = (start.y + end.y) / 2;
    const radiusX = Math.abs(end.x - start.x) / 2;
    const radiusY = Math.abs(end.y - start.y) / 2;
    
    const dx = x - centerX;
    const dy = y - centerY;
    const distance = Math.sqrt((dx * dx) / (radiusX * radiusX) + (dy * dy) / (radiusY * radiusY));
    
    return Math.abs(distance - 1) <= tolerance / Math.min(radiusX, radiusY);
  };

  const isPointInTextBox = (x: number, y: number, position: { x: number; y: number }, text: string, tolerance: number): boolean => {
    const textWidth = text.length * 8; // Approximate
    const textHeight = 16;
    
    return x >= position.x - tolerance && 
           x <= position.x + textWidth + tolerance && 
           y >= position.y - textHeight - tolerance && 
           y <= position.y + tolerance;
  };

  // Function to find drawing at point
  const findDrawingAtPoint = (point: { x: number; y: number }): any | null => {
    for (let i = drawings.length - 1; i >= 0; i--) {
      if (isPointNearDrawing(point, drawings[i])) {
        return drawings[i];
      }
    }
    return null;
  };

  // Function to move a drawing
  const moveDrawing = (drawingId: number, deltaX: number, deltaY: number) => {
    setDrawings(prev => prev.map(drawing => {
      if (drawing.id === drawingId) {
        return {
          ...drawing,
          startPoint: {
            x: drawing.startPoint.x + deltaX,
            y: drawing.startPoint.y + deltaY
          },
          endPoint: drawing.endPoint ? {
            x: drawing.endPoint.x + deltaX,
            y: drawing.endPoint.y + deltaY
          } : drawing.endPoint,
          points: drawing.points ? drawing.points.map((point: { x: number; y: number }) => ({
            x: point.x + deltaX,
            y: point.y + deltaY
          })) : drawing.points
        };
      }
      return drawing;
    }));
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Handle drawing dragging
    if (isDraggingDrawing && selectedDrawing && dragOffset) {
      const deltaX = x - (selectedDrawing.startPoint.x + dragOffset.x);
      const deltaY = y - (selectedDrawing.startPoint.y + dragOffset.y);
      
      moveDrawing(selectedDrawing.id, deltaX, deltaY);
      return;
    }

    // Handle hover detection for cursor change
    if (!activeTool && !isDraggingDrawing) {
      const hoveredDrawing = findDrawingAtPoint({ x, y });
      setHoveredDrawing(hoveredDrawing);
      
      // Change cursor when hovering over a drawing
      if (hoveredDrawing) {
        canvas.style.cursor = 'move';
      } else {
        canvas.style.cursor = 'crosshair';
      }
    }

    // Handle drawing preview (existing functionality)
    if (!isDrawing || !drawingStartPoint || !activeTool) return;
    
    // Update overlay canvas with preview
    const overlayCanvas = overlayCanvasRef.current;
    if (overlayCanvas) {
      const ctx = overlayCanvas.getContext('2d');
      if (ctx) {
        // Clear overlay
        ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
        
        // Draw preview based on tool type
        ctx.strokeStyle = drawingStyle.color;
        ctx.lineWidth = drawingStyle.lineWidth;
        ctx.setLineDash([5, 5]); // Dashed line for preview
        ctx.fillStyle = `${drawingStyle.color}${Math.floor(drawingStyle.fillOpacity * 255).toString(16).padStart(2, '0')}`;
        
        ctx.beginPath();
        switch (activeTool) {
          // Line Tools
          case 'trend_line':
          case 'ray':
          case 'extended_line':
          case 'arrow':
            ctx.moveTo(drawingStartPoint.x, drawingStartPoint.y);
            ctx.lineTo(x, y);
            if (activeTool === 'arrow') {
              drawArrowHead(ctx, drawingStartPoint.x, drawingStartPoint.y, x, y);
            }
            break;
            
          case 'horizontal_line':
            ctx.moveTo(0, drawingStartPoint.y);
            ctx.lineTo(overlayCanvas.width, drawingStartPoint.y);
            break;
            
          case 'vertical_line':
            ctx.moveTo(drawingStartPoint.x, 0);
            ctx.lineTo(drawingStartPoint.x, overlayCanvas.height);
            break;
            
          case 'cross_line':
            ctx.moveTo(0, drawingStartPoint.y);
            ctx.lineTo(overlayCanvas.width, drawingStartPoint.y);
            ctx.moveTo(drawingStartPoint.x, 0);
            ctx.lineTo(drawingStartPoint.x, overlayCanvas.height);
            break;
            
          case 'parallel_channel':
            // Draw two parallel lines
            const dx = x - drawingStartPoint.x;
            const dy = y - drawingStartPoint.y;
            const channelWidth = 50; // Default channel width
            const perpX = -dy / Math.sqrt(dx * dx + dy * dy) * channelWidth;
            const perpY = dx / Math.sqrt(dx * dx + dy * dy) * channelWidth;
            
            ctx.moveTo(drawingStartPoint.x, drawingStartPoint.y);
            ctx.lineTo(x, y);
            ctx.moveTo(drawingStartPoint.x + perpX, drawingStartPoint.y + perpY);
            ctx.lineTo(x + perpX, y + perpY);
            break;

          // Geometric Shapes
          case 'rectangle':
            ctx.rect(
              drawingStartPoint.x,
              drawingStartPoint.y,
              x - drawingStartPoint.x,
              y - drawingStartPoint.y
            );
            break;
            
          case 'ellipse':
          case 'circle':
            const centerX = (drawingStartPoint.x + x) / 2;
            const centerY = (drawingStartPoint.y + y) / 2;
            const radiusX = Math.abs(x - drawingStartPoint.x) / 2;
            const radiusY = activeTool === 'circle' ? radiusX : Math.abs(y - drawingStartPoint.y) / 2;
            ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
            break;
            
          case 'triangle':
            // Draw triangle
            const midX = (drawingStartPoint.x + x) / 2;
            ctx.moveTo(midX, drawingStartPoint.y);
            ctx.lineTo(drawingStartPoint.x, y);
            ctx.lineTo(x, y);
            ctx.closePath();
            break;

          // Fibonacci Tools
          case 'fib_retracement':
            ctx.moveTo(drawingStartPoint.x, drawingStartPoint.y);
            ctx.lineTo(x, y);
            // Draw fibonacci levels
            fibonacciLevels.forEach(level => {
              const levelY = drawingStartPoint.y + (y - drawingStartPoint.y) * level;
              ctx.moveTo(Math.min(drawingStartPoint.x, x), levelY);
              ctx.lineTo(Math.max(drawingStartPoint.x, x), levelY);
            });
            break;
            
          case 'fib_extension':
            ctx.moveTo(drawingStartPoint.x, drawingStartPoint.y);
            ctx.lineTo(x, y);
            // Draw extension levels
            fibonacciExtensionLevels.forEach(level => {
              const levelY = drawingStartPoint.y + (y - drawingStartPoint.y) * level;
              ctx.moveTo(Math.min(drawingStartPoint.x, x), levelY);
              ctx.lineTo(Math.max(drawingStartPoint.x, x), levelY);
            });
            break;
            
          case 'fib_fan':
            // Draw radiating fibonacci lines
            const baseLength = Math.sqrt((x - drawingStartPoint.x) ** 2 + (y - drawingStartPoint.y) ** 2);
            fibonacciLevels.forEach(level => {
              const fanLength = baseLength * level;
              const angle = Math.atan2(y - drawingStartPoint.y, x - drawingStartPoint.x);
              const fanX = drawingStartPoint.x + fanLength * Math.cos(angle);
              const fanY = drawingStartPoint.y + fanLength * Math.sin(angle);
              ctx.moveTo(drawingStartPoint.x, drawingStartPoint.y);
              ctx.lineTo(fanX, fanY);
            });
            break;

          // Gann Tools
          case 'gann_fan':
            // Draw Gann angles from starting point
            gannAngles.forEach(angle => {
              const radians = (angle * Math.PI) / 180;
              const length = 200; // Fixed length for preview
              const gannX = drawingStartPoint.x + length * Math.cos(radians);
              const gannY = drawingStartPoint.y - length * Math.sin(radians);
              ctx.moveTo(drawingStartPoint.x, drawingStartPoint.y);
              ctx.lineTo(gannX, gannY);
            });
            break;
            
          case 'gann_box':
            // Draw Gann square with divisions
            const boxSize = Math.max(Math.abs(x - drawingStartPoint.x), Math.abs(y - drawingStartPoint.y));
            ctx.rect(drawingStartPoint.x, drawingStartPoint.y, boxSize, boxSize);
            // Draw internal divisions
            for (let i = 1; i < 8; i++) {
              const div = (boxSize / 8) * i;
              ctx.moveTo(drawingStartPoint.x + div, drawingStartPoint.y);
              ctx.lineTo(drawingStartPoint.x + div, drawingStartPoint.y + boxSize);
              ctx.moveTo(drawingStartPoint.x, drawingStartPoint.y + div);
              ctx.lineTo(drawingStartPoint.x + boxSize, drawingStartPoint.y + div);
            }
            break;

          // Pitchfork Tools (3-point tools will need special handling)
          case 'pitchfork':
          case 'schiff_pitchfork':
            if (multiPointDrawing.length >= 2) {
              // Draw pitchfork with three points
              drawPitchfork(ctx, multiPointDrawing[0], multiPointDrawing[1], { x, y }, activeTool);
            } else if (multiPointDrawing.length === 1) {
              // Show second line
              ctx.moveTo(multiPointDrawing[0].x, multiPointDrawing[0].y);
              ctx.lineTo(x, y);
            }
            break;

          // Measurement Tools
          case 'ruler':
            ctx.moveTo(drawingStartPoint.x, drawingStartPoint.y);
            ctx.lineTo(x, y);
            // Show measurement text
            const distance = Math.sqrt((x - drawingStartPoint.x) ** 2 + (y - drawingStartPoint.y) ** 2);
            const angle = Math.atan2(y - drawingStartPoint.y, x - drawingStartPoint.x) * 180 / Math.PI;
            ctx.fillStyle = drawingStyle.color;
            ctx.font = `${drawingStyle.textSize}px Arial`;
            ctx.fillText(`${distance.toFixed(1)}px, ${angle.toFixed(1)}°`, (drawingStartPoint.x + x) / 2, (drawingStartPoint.y + y) / 2);
            break;
            
          case 'price_range':
            ctx.rect(0, Math.min(drawingStartPoint.y, y), overlayCanvas.width, Math.abs(y - drawingStartPoint.y));
            ctx.fill();
            break;
            
          case 'date_range':
            ctx.rect(Math.min(drawingStartPoint.x, x), 0, Math.abs(x - drawingStartPoint.x), overlayCanvas.height);
            ctx.fill();
            break;

          // Volume Analysis
          case 'volume_profile':
            ctx.rect(Math.min(drawingStartPoint.x, x), Math.min(drawingStartPoint.y, y), 
                    Math.abs(x - drawingStartPoint.x), Math.abs(y - drawingStartPoint.y));
            // Draw sample volume bars
            const barCount = 10;
            const barHeight = Math.abs(y - drawingStartPoint.y) / barCount;
            for (let i = 0; i < barCount; i++) {
              const barY = Math.min(drawingStartPoint.y, y) + i * barHeight;
              const barWidth = Math.random() * Math.abs(x - drawingStartPoint.x) * 0.8;
              ctx.fillRect(Math.min(drawingStartPoint.x, x), barY, barWidth, barHeight * 0.8);
            }
            break;

          // Pattern Recognition
          case 'head_shoulders':
            if (multiPointDrawing.length >= 4) {
              // Draw head and shoulders pattern
              ctx.moveTo(multiPointDrawing[0].x, multiPointDrawing[0].y);
              for (let i = 1; i < multiPointDrawing.length; i++) {
                ctx.lineTo(multiPointDrawing[i].x, multiPointDrawing[i].y);
              }
              ctx.lineTo(x, y);
            }
            break;

          default:
            // Default line drawing for unspecified tools
            ctx.moveTo(drawingStartPoint.x, drawingStartPoint.y);
            ctx.lineTo(x, y);
            break;
        }
        ctx.stroke();
        ctx.setLineDash([]); // Reset line dash
      }
    }
  };

  // Helper function to draw arrow heads
  const drawArrowHead = (ctx: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number) => {
    const headlen = 15; // length of head in pixels
    const angle = Math.atan2(toY - fromY, toX - fromX);
    
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headlen * Math.cos(angle - Math.PI / 6), toY - headlen * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headlen * Math.cos(angle + Math.PI / 6), toY - headlen * Math.sin(angle + Math.PI / 6));
  };

  // Helper function to draw pitchfork
  const drawPitchfork = (ctx: CanvasRenderingContext2D, p1: {x: number, y: number}, p2: {x: number, y: number}, p3: {x: number, y: number}, type: string) => {
    // Calculate median line
    const midX = (p2.x + p3.x) / 2;
    const midY = (p2.y + p3.y) / 2;
    
    // Draw median line
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(midX, midY);
    
    // Calculate parallel lines
    const dx = midX - p1.x;
    const dy = midY - p1.y;
    
    // Upper parallel line
    ctx.moveTo(p2.x, p2.y);
    ctx.lineTo(p2.x + dx, p2.y + dy);
    
    // Lower parallel line  
    ctx.moveTo(p3.x, p3.y);
    ctx.lineTo(p3.x + dx, p3.y + dy);
    
    if (type === 'schiff_pitchfork') {
      // Schiff modification - start from midpoint of first two points
      const schiffMidX = (p1.x + p2.x) / 2;
      const schiffMidY = (p1.y + p2.y) / 2;
      ctx.moveTo(schiffMidX, schiffMidY);
      ctx.lineTo(p3.x, p3.y);
    }
  };

  // Enhanced drawing rendering function with support for all TradingView tools
  const drawStoredDrawings = (ctx: CanvasRenderingContext2D) => {
    const currentDrawings = drawingsRef.current;
    console.log('🎨 Drawing stored drawings, count:', currentDrawings.length);
    console.log('🎨 Drawings array:', currentDrawings);
    if (currentDrawings.length === 0) {
      console.log('❌ No drawings to render');
      return;
    }
    
    currentDrawings.forEach((drawing, index) => {
      console.log(`🖌️ Rendering drawing ${index + 1}:`, drawing.type, drawing.id);
      const isSelected = selectedDrawing && selectedDrawing.id === drawing.id;
      const isHovered = hoveredDrawing && hoveredDrawing.id === drawing.id;
      
      // Apply selection or hover styling
      const baseColor = drawing.style?.color || '#00ff88';
      const highlightColor = isSelected ? '#00aaff' : isHovered ? '#ffaa00' : baseColor;
      const lineWidth = (drawing.style?.lineWidth || 2) + (isSelected ? 2 : isHovered ? 1 : 0);
      
      ctx.strokeStyle = highlightColor;
      ctx.lineWidth = lineWidth;
      ctx.setLineDash(drawing.style?.lineDash || []);
      ctx.fillStyle = `${highlightColor}${Math.floor((drawing.style?.fillOpacity || 0.1) * 255).toString(16).padStart(2, '0')}`;
      ctx.font = `${drawing.style?.textSize || 12}px Arial`;
      
      // Add glow effect for selected drawings
      if (isSelected) {
        ctx.shadowColor = '#00aaff';
        ctx.shadowBlur = 10;
      } else {
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
      }
      
      ctx.beginPath();
      
      switch (drawing.type) {
        // Line Tools
        case 'trend_line':
        case 'ray':
        case 'extended_line':
          ctx.moveTo(drawing.startPoint.x, drawing.startPoint.y);
          ctx.lineTo(drawing.endPoint.x, drawing.endPoint.y);
          break;
          
        case 'horizontal_line':
          ctx.moveTo(0, drawing.startPoint.y);
          ctx.lineTo(ctx.canvas.width, drawing.startPoint.y);
          break;
          
        case 'vertical_line':
          ctx.moveTo(drawing.startPoint.x, 0);
          ctx.lineTo(drawing.startPoint.x, ctx.canvas.height);
          break;
          
        case 'cross_line':
          ctx.moveTo(0, drawing.startPoint.y);
          ctx.lineTo(ctx.canvas.width, drawing.startPoint.y);
          ctx.moveTo(drawing.startPoint.x, 0);
          ctx.lineTo(drawing.startPoint.x, ctx.canvas.height);
          break;
          
        case 'arrow':
          ctx.moveTo(drawing.startPoint.x, drawing.startPoint.y);
          ctx.lineTo(drawing.endPoint.x, drawing.endPoint.y);
          ctx.stroke();
          drawArrowHead(ctx, drawing.startPoint.x, drawing.startPoint.y, drawing.endPoint.x, drawing.endPoint.y);
          ctx.beginPath();
          break;
          
        case 'parallel_channel':
          const dx = drawing.endPoint.x - drawing.startPoint.x;
          const dy = drawing.endPoint.y - drawing.startPoint.y;
          const channelWidth = 50;
          const perpX = -dy / Math.sqrt(dx * dx + dy * dy) * channelWidth;
          const perpY = dx / Math.sqrt(dx * dx + dy * dy) * channelWidth;
          
          ctx.moveTo(drawing.startPoint.x, drawing.startPoint.y);
          ctx.lineTo(drawing.endPoint.x, drawing.endPoint.y);
          ctx.moveTo(drawing.startPoint.x + perpX, drawing.startPoint.y + perpY);
          ctx.lineTo(drawing.endPoint.x + perpX, drawing.endPoint.y + perpY);
          break;

        // Geometric Shapes
        case 'rectangle':
          ctx.rect(
            drawing.startPoint.x,
            drawing.startPoint.y,
            drawing.endPoint.x - drawing.startPoint.x,
            drawing.endPoint.y - drawing.startPoint.y
          );
          break;
          
        case 'ellipse':
        case 'circle':
          const centerX = (drawing.startPoint.x + drawing.endPoint.x) / 2;
          const centerY = (drawing.startPoint.y + drawing.endPoint.y) / 2;
          const radiusX = Math.abs(drawing.endPoint.x - drawing.startPoint.x) / 2;
          const radiusY = drawing.type === 'circle' ? radiusX : Math.abs(drawing.endPoint.y - drawing.startPoint.y) / 2;
          ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
          break;
          
        case 'triangle':
          const midX = (drawing.startPoint.x + drawing.endPoint.x) / 2;
          ctx.moveTo(midX, drawing.startPoint.y);
          ctx.lineTo(drawing.startPoint.x, drawing.endPoint.y);
          ctx.lineTo(drawing.endPoint.x, drawing.endPoint.y);
          ctx.closePath();
          break;

        // Fibonacci Tools
        case 'fib_retracement':
          ctx.moveTo(drawing.startPoint.x, drawing.startPoint.y);
          ctx.lineTo(drawing.endPoint.x, drawing.endPoint.y);
          ctx.stroke();
          
          // Draw fibonacci levels
          fibonacciLevels.forEach((level, index) => {
            const levelY = drawing.startPoint.y + (drawing.endPoint.y - drawing.startPoint.y) * level;
            ctx.beginPath();
            ctx.setLineDash([2, 2]);
            ctx.moveTo(Math.min(drawing.startPoint.x, drawing.endPoint.x), levelY);
            ctx.lineTo(Math.max(drawing.startPoint.x, drawing.endPoint.x), levelY);
            ctx.stroke();
            
            if (drawing.style?.showLabels) {
              ctx.fillText(`${(level * 100).toFixed(1)}%`, Math.max(drawing.startPoint.x, drawing.endPoint.x) + 5, levelY + 3);
            }
          });
          ctx.setLineDash([]);
          ctx.beginPath();
          break;
          
        case 'fib_extension':
          ctx.moveTo(drawing.startPoint.x, drawing.startPoint.y);
          ctx.lineTo(drawing.endPoint.x, drawing.endPoint.y);
          ctx.stroke();
          
          fibonacciExtensionLevels.forEach((level, index) => {
            const levelY = drawing.startPoint.y + (drawing.endPoint.y - drawing.startPoint.y) * level;
            ctx.beginPath();
            ctx.setLineDash([2, 2]);
            ctx.moveTo(Math.min(drawing.startPoint.x, drawing.endPoint.x), levelY);
            ctx.lineTo(Math.max(drawing.startPoint.x, drawing.endPoint.x), levelY);
            ctx.stroke();
            
            if (drawing.style?.showLabels) {
              ctx.fillText(`${(level * 100).toFixed(1)}%`, Math.max(drawing.startPoint.x, drawing.endPoint.x) + 5, levelY + 3);
            }
          });
          ctx.setLineDash([]);
          ctx.beginPath();
          break;
          
        case 'fib_fan':
          const baseLength = Math.sqrt((drawing.endPoint.x - drawing.startPoint.x) ** 2 + (drawing.endPoint.y - drawing.startPoint.y) ** 2);
          fibonacciLevels.forEach(level => {
            const fanLength = baseLength * level;
            const angle = Math.atan2(drawing.endPoint.y - drawing.startPoint.y, drawing.endPoint.x - drawing.startPoint.x);
            const fanX = drawing.startPoint.x + fanLength * Math.cos(angle);
            const fanY = drawing.startPoint.y + fanLength * Math.sin(angle);
            ctx.moveTo(drawing.startPoint.x, drawing.startPoint.y);
            ctx.lineTo(fanX, fanY);
          });
          break;

        // Gann Tools
        case 'gann_fan':
          gannAngles.forEach(angle => {
            const radians = (angle * Math.PI) / 180;
            const length = 200;
            const gannX = drawing.startPoint.x + length * Math.cos(radians);
            const gannY = drawing.startPoint.y - length * Math.sin(radians);
            ctx.moveTo(drawing.startPoint.x, drawing.startPoint.y);
            ctx.lineTo(gannX, gannY);
          });
          break;
          
        case 'gann_box':
          const boxSize = Math.max(Math.abs(drawing.endPoint.x - drawing.startPoint.x), Math.abs(drawing.endPoint.y - drawing.startPoint.y));
          ctx.rect(drawing.startPoint.x, drawing.startPoint.y, boxSize, boxSize);
          ctx.stroke();
          
          // Draw internal divisions
          for (let i = 1; i < 8; i++) {
            const div = (boxSize / 8) * i;
            ctx.beginPath();
            ctx.moveTo(drawing.startPoint.x + div, drawing.startPoint.y);
            ctx.lineTo(drawing.startPoint.x + div, drawing.startPoint.y + boxSize);
            ctx.moveTo(drawing.startPoint.x, drawing.startPoint.y + div);
            ctx.lineTo(drawing.startPoint.x + boxSize, drawing.startPoint.y + div);
            ctx.stroke();
          }
          ctx.beginPath();
          break;

        // Multi-point tools
        case 'pitchfork':
        case 'schiff_pitchfork':
        case 'inside_pitchfork':
          if (drawing.points && drawing.points.length >= 3) {
            drawPitchfork(ctx, drawing.points[0], drawing.points[1], drawing.points[2], drawing.type);
          }
          break;
          
        case 'elliott_wave':
          if (drawing.points && drawing.points.length > 1) {
            drawing.points.forEach((point: any, index: number) => {
              if (index > 0) {
                ctx.moveTo(drawing.points[index - 1].x, drawing.points[index - 1].y);
                ctx.lineTo(point.x, point.y);
              }
              
              if (drawing.style?.showLabels && drawing.metadata?.waveLabels) {
                ctx.fillText(drawing.metadata.waveLabels[index], point.x + 5, point.y - 5);
              }
            });
          }
          break;

        // Pattern Recognition
        case 'head_shoulders':
        case 'triangle_pattern':
        case 'flag_pattern':
        case 'wedge_pattern':
          if (drawing.points && drawing.points.length > 1) {
            drawing.points.forEach((point: any, index: number) => {
              if (index > 0) {
                ctx.moveTo(drawing.points[index - 1].x, drawing.points[index - 1].y);
                ctx.lineTo(point.x, point.y);
              }
            });
          }
          break;

        // Harmonic Patterns
        case 'bat_pattern':
        case 'butterfly_pattern':
        case 'gartley_pattern':
        case 'crab_pattern':
        case 'shark_pattern':
        case 'cypher_pattern':
          if (drawing.points && drawing.points.length >= 4) {
            const [X, A, B, C] = drawing.points;
            ctx.moveTo(X.x, X.y);
            ctx.lineTo(A.x, A.y);
            ctx.lineTo(B.x, B.y);
            ctx.lineTo(C.x, C.y);
            ctx.lineTo(X.x, X.y); // Close pattern
            
            if (drawing.style?.showLabels) {
              ctx.fillText('X', X.x - 10, X.y - 10);
              ctx.fillText('A', A.x - 10, A.y - 10);
              ctx.fillText('B', B.x - 10, B.y - 10);
              ctx.fillText('C', C.x - 10, C.y - 10);
            }
          }
          break;

        // Measurement Tools
        case 'ruler':
          ctx.moveTo(drawing.startPoint.x, drawing.startPoint.y);
          ctx.lineTo(drawing.endPoint.x, drawing.endPoint.y);
          ctx.stroke();
          
          if (drawing.metadata && drawing.style?.showLabels) {
            const midX = (drawing.startPoint.x + drawing.endPoint.x) / 2;
            const midY = (drawing.startPoint.y + drawing.endPoint.y) / 2;
            ctx.fillText(
              `${drawing.metadata.distance.toFixed(1)}px, ${drawing.metadata.angle.toFixed(1)}°`,
              midX, midY - 10
            );
            ctx.fillText(
              `$${drawing.metadata.priceDistance.toFixed(2)}`,
              midX, midY + 10
            );
          }
          ctx.beginPath();
          break;
          
        case 'price_range':
          ctx.rect(0, Math.min(drawing.startPoint.y, drawing.endPoint.y), 
                  ctx.canvas.width, Math.abs(drawing.endPoint.y - drawing.startPoint.y));
          ctx.fill();
          break;
          
        case 'date_range':
          ctx.rect(Math.min(drawing.startPoint.x, drawing.endPoint.x), 0, 
                  Math.abs(drawing.endPoint.x - drawing.startPoint.x), ctx.canvas.height);
          ctx.fill();
          break;

        // Volume Analysis
        case 'volume_profile':
          ctx.rect(Math.min(drawing.startPoint.x, drawing.endPoint.x), 
                  Math.min(drawing.startPoint.y, drawing.endPoint.y),
                  Math.abs(drawing.endPoint.x - drawing.startPoint.x), 
                  Math.abs(drawing.endPoint.y - drawing.startPoint.y));
          ctx.stroke();
          
          // Draw volume bars
          const barCount = 10;
          const barHeight = Math.abs(drawing.endPoint.y - drawing.startPoint.y) / barCount;
          for (let i = 0; i < barCount; i++) {
            const barY = Math.min(drawing.startPoint.y, drawing.endPoint.y) + i * barHeight;
            const barWidth = Math.random() * Math.abs(drawing.endPoint.x - drawing.startPoint.x) * 0.8;
            ctx.fillRect(Math.min(drawing.startPoint.x, drawing.endPoint.x), barY, barWidth, barHeight * 0.8);
          }
          break;

        // Text and Annotation Tools
        case 'text':
        case 'note':
        case 'callout':
        case 'price_label':
        case 'anchored_text':
        case 'flag':
          if (drawing.text) {
            ctx.fillText(drawing.text, drawing.startPoint.x, drawing.startPoint.y);
          }
          break;

        // Trading Position Markers
        case 'long_position':
          ctx.beginPath();
          ctx.arc(drawing.startPoint.x, drawing.startPoint.y, 8, 0, 2 * Math.PI);
          ctx.fillStyle = '#00ff88';
          ctx.fill();
          ctx.fillStyle = '#000000';
          ctx.fillText('L', drawing.startPoint.x - 3, drawing.startPoint.y + 3);
          break;
          
        case 'short_position':
          ctx.beginPath();
          ctx.arc(drawing.startPoint.x, drawing.startPoint.y, 8, 0, 2 * Math.PI);
          ctx.fillStyle = '#ff4444';
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.fillText('S', drawing.startPoint.x - 3, drawing.startPoint.y + 3);
          break;
          
        case 'price_alert':
          ctx.beginPath();
          ctx.arc(drawing.startPoint.x, drawing.startPoint.y, 6, 0, 2 * Math.PI);
          ctx.fillStyle = '#ffaa00';
          ctx.fill();
          if (drawing.text) {
            ctx.fillStyle = drawing.style?.color || '#ffaa00';
            ctx.fillText(drawing.text, drawing.startPoint.x + 10, drawing.startPoint.y);
          }
          break;

        default:
          // Default line drawing for unknown tools
          if (drawing.startPoint && drawing.endPoint) {
            ctx.moveTo(drawing.startPoint.x, drawing.startPoint.y);
            ctx.lineTo(drawing.endPoint.x, drawing.endPoint.y);
          }
          break;
      }
      
      ctx.stroke();
      ctx.setLineDash([]); // Reset line dash
    });
  };

  // Property Editor Component for Selected Drawings
  const PropertyEditor = () => {
    if (!showDrawingEditor || !selectedDrawing) return null;

    const currentStyle = selectedDrawing.style || {};

    const updateDrawingStyle = (updates: Partial<DrawingStyle>) => {
      setDrawings((prev: any[]) => prev.map(d => 
        d.id === selectedDrawing.id 
          ? { ...d, style: { ...d.style, ...updates } }
          : d
      ));
      setSelectedDrawing((prev: any) => prev ? { ...prev, style: { ...prev.style, ...updates } } : null);
    };

    return (
      <div 
        className="fixed bg-[#1a1a1a] border border-gray-600 rounded-lg p-4 z-50 min-w-[250px] shadow-lg"
        style={{
          left: `${editorPosition.x}px`,
          top: `${editorPosition.y}px`
        }}
      >
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-white text-sm font-medium">
            {selectedDrawing.type.charAt(0).toUpperCase() + selectedDrawing.type.slice(1)} Properties
          </h3>
          <button 
            onClick={() => setShowDrawingEditor(false)}
            className="text-gray-400 hover:text-white text-lg leading-none"
          >
            ×
          </button>
        </div>
        
        {/* Color Picker */}
        <div className="mb-3">
          <label className="block text-gray-300 text-xs mb-1">Color</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={currentStyle.color || '#00ff88'}
              onChange={(e) => updateDrawingStyle({ color: e.target.value })}
              className="w-8 h-8 rounded border border-gray-600"
            />
            <span className="text-gray-300 text-xs">{currentStyle.color || '#00ff88'}</span>
          </div>
        </div>

        {/* Line Width */}
        <div className="mb-3">
          <label className="block text-gray-300 text-xs mb-1">
            Line Width: {currentStyle.lineWidth || 2}px
          </label>
          <input
            type="range"
            min="1"
            max="10"
            value={currentStyle.lineWidth || 2}
            onChange={(e) => updateDrawingStyle({ lineWidth: parseInt(e.target.value) })}
            className="w-full"
          />
        </div>

        {/* Line Style */}
        <div className="mb-3">
          <label className="block text-gray-300 text-xs mb-1">Line Style</label>
          <select
            value={JSON.stringify(currentStyle.lineDash || [])}
            onChange={(e) => updateDrawingStyle({ lineDash: JSON.parse(e.target.value) })}
            className="w-full bg-[#2a2a2a] border border-gray-600 rounded px-2 py-1 text-white text-xs"
          >
            <option value="[]">Solid</option>
            <option value="[5,5]">Dashed</option>
            <option value="[2,2]">Dotted</option>
            <option value="[10,5,2,5]">Dash-Dot</option>
          </select>
        </div>

        {/* Text-specific options */}
        {selectedDrawing.type === 'text' && (
          <>
            <div className="mb-3">
              <label className="block text-gray-300 text-xs mb-1">
                Text Size: {currentStyle.textSize || 12}px
              </label>
              <input
                type="range"
                min="8"
                max="32"
                value={currentStyle.textSize || 12}
                onChange={(e) => updateDrawingStyle({ textSize: parseInt(e.target.value) })}
                className="w-full"
              />
            </div>
            <div className="mb-3">
              <label className="block text-gray-300 text-xs mb-1">Text Content</label>
              <input
                type="text"
                value={selectedDrawing.text || ''}
                onChange={(e) => {
                  setDrawings((prev: any[]) => prev.map(d => 
                    d.id === selectedDrawing.id 
                      ? { ...d, text: e.target.value }
                      : d
                  ));
                  setSelectedDrawing((prev: any) => prev ? { ...prev, text: e.target.value } : null);
                }}
                className="w-full bg-[#2a2a2a] border border-gray-600 rounded px-2 py-1 text-white text-xs"
                placeholder="Enter text..."
              />
            </div>
          </>
        )}

        {/* Fill options for shapes */}
        {['rectangle', 'ellipse', 'circle'].includes(selectedDrawing.type) && (
          <div className="mb-3">
            <label className="block text-gray-300 text-xs mb-1">
              Fill Opacity: {Math.round((currentStyle.fillOpacity || 0.1) * 100)}%
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={currentStyle.fillOpacity || 0.1}
              onChange={(e) => updateDrawingStyle({ fillOpacity: parseFloat(e.target.value) })}
              className="w-full"
            />
          </div>
        )}

        {/* Delete button */}
        <button
          onClick={() => {
            setDrawings(prev => prev.filter(d => d.id !== selectedDrawing.id));
            setSelectedDrawing(null);
            setShowDrawingEditor(false);
          }}
          className="w-full bg-red-600 hover:bg-red-700 text-white text-xs py-2 rounded mt-2"
        >
          Delete Drawing
        </button>
      </div>
    );
  };

  // Handle sidebar button clicks
  const handleSidebarClick = (id: string) => {
    setActiveSidebarPanel(activeSidebarPanel === id ? null : id);
  };

  // Watchlist Panel Component - Bloomberg Terminal Style with 4-Column Performance
  const WatchlistPanel = ({ activeTab, setActiveTab }: { activeTab: string, setActiveTab: (tab: string) => void }) => {
    const currentSymbols = marketSymbols[activeTab as keyof typeof marketSymbols] || [];
    
    // Helper function to get performance status for a specific time period
    const getPerformanceStatus = (symbolChange: number, spyChange: number, symbol: string, period: string) => {
      if (symbol === 'SPY') return { status: 'NEUTRAL', color: 'text-yellow-400' };
      
      // Calculate relative performance: ticker vs SPY from period start to today
      const relativePerformance = symbolChange - spyChange;
      
      // Determine status based on relative performance vs SPY
      if (period === '21d') {
        if (relativePerformance > 0) {
          return { status: 'KING', color: 'text-yellow-400 font-bold glow-yellow' }; // Outperformed SPY over 21 days
        } else {
          return { status: 'FALLEN', color: 'text-red-400 font-bold glow-red' }; // Underperformed SPY over 21 days
        }
      } else if (period === '13d') {
        if (relativePerformance > 0) {
          return { status: 'LEADER', color: 'text-green-400 font-bold glow-green' }; // Outperformed SPY over 13 days
        } else {
          return { status: 'LAGGARD', color: 'text-red-400 font-bold glow-red' }; // Underperformed SPY over 13 days
        }
      } else if (period === '5d') {
        if (relativePerformance > 0) {
          return { status: 'STRONG', color: 'text-green-400 font-bold' }; // Outperformed SPY over 5 days
        } else {
          return { status: 'WEAK', color: 'text-red-400 font-bold' }; // Underperformed SPY over 5 days
        }
      } else if (period === '1d') {
        if (relativePerformance > 0) {
          return { status: 'RISING', color: 'text-lime-400 font-bold' }; // Outperformed SPY today
        } else {
          return { status: 'FALLING', color: 'text-red-300 font-bold' }; // Underperformed SPY today
        }
      }
      
      return { status: 'NEUTRAL', color: 'text-gray-400' };
    };

    // Helper function to calculate market regime for column headers only
    const getMarketRegimeForHeader = (period: string) => {
      // Growth sectors: XLY (Consumer Discretionary), XLK (Technology), XLC (Communication)
      const growthSectors = ['XLY', 'XLK', 'XLC'];
      // Defensive sectors: XLP (Consumer Staples), XLU (Utilities), XLRE (Real Estate), XLV (Healthcare)
      const defensiveSectors = ['XLP', 'XLU', 'XLRE', 'XLV'];
      
      // Get performance data for each sector vs SPY
      const growthPerformance = growthSectors.map(symbol => {
        const data = watchlistData[symbol];
        const spyData = watchlistData['SPY'];
        if (!data || !spyData) return null;
        
        let change = 0;
        let spyChange = 0;
        
        if (period === '1d') {
          change = data.change1d;
          spyChange = spyData.change1d;
        } else if (period === '5d') {
          change = data.change5d;
          spyChange = spyData.change5d;
        } else if (period === '13d') {
          change = data.change13d;
          spyChange = spyData.change13d;
        } else if (period === '21d') {
          change = data.change21d;
          spyChange = spyData.change21d;
        }
        
        return (change - spyChange) > 0; // true if outperforming SPY (rising relative to SPY)
      }).filter(result => result !== null);
      
      const defensivePerformance = defensiveSectors.map(symbol => {
        const data = watchlistData[symbol];
        const spyData = watchlistData['SPY'];
        if (!data || !spyData) return null;
        
        let change = 0;
        let spyChange = 0;
        
        if (period === '1d') {
          change = data.change1d;
          spyChange = spyData.change1d;
        } else if (period === '5d') {
          change = data.change5d;
          spyChange = spyData.change5d;
        } else if (period === '13d') {
          change = data.change13d;
          spyChange = spyData.change13d;
        } else if (period === '21d') {
          change = data.change21d;
          spyChange = spyData.change21d;
        }
        
        return (change - spyChange) > 0; // true if outperforming SPY (rising relative to SPY)
      }).filter(result => result !== null);
      
      // Count how many are rising
      const growthRising = growthPerformance.filter(Boolean).length;
      const defensiveFalling = defensivePerformance.filter(perf => !perf).length; // Count falling (underperforming)
      
      // RISK ON: All growth sectors rising AND most defensives falling
      if (growthRising === growthPerformance.length && defensiveFalling >= 3) {
        return 'RISK ON';
      }
      
      // DEFENSIVE: Growth sectors falling AND most defensives rising  
      const growthFalling = growthPerformance.filter(perf => !perf).length;
      const defensiveRising = defensivePerformance.filter(Boolean).length;
      
      if (growthFalling === growthPerformance.length && defensiveRising >= 3) {
        return 'DEFENSIVE';
      }
      
      // MIXED: Everything else
      return 'MIXED';
    };

    // Helper function to get group border styling
    const getGroupBorderStyle = (symbols: string[], startIndex: number, endIndex: number) => {
      if (startIndex === 0) {
        // Main indices group
        return 'border border-gray-300 rounded-md mb-2 p-1';
      } else if (startIndex === 4) {
        // Growth sectors group  
        return 'border border-green-600 rounded-md mb-2 p-1';
      } else if (startIndex === 7) {
        // Defensive sectors group
        return 'border border-red-600 rounded-md mb-2 p-1';
      } else if (startIndex === 11) {
        // Other sectors group
        return 'border border-blue-600 rounded-md mb-2 p-1';
      }
      return '';
    };
    
    return (
      <div className="h-full flex flex-col bg-black text-white">
        {/* Bloomberg-style Header */}
        <div className="p-3 border-b border-yellow-500 bg-black">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-base font-bold text-yellow-400 uppercase tracking-wider">
              Watchlist
            </h2>
            <div className="text-xs bg-yellow-500 text-black px-2 py-1 font-bold">
              Live • {currentSymbols.length}
            </div>
          </div>
          
          {/* Bloomberg-style Tabs */}
          <div className="flex border border-gray-700">
            {['Markets', 'Industries', 'Special'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 px-3 py-1 text-xs font-bold uppercase tracking-wide border-r border-gray-700 last:border-r-0 ${
                  activeTab === tab 
                    ? 'bg-yellow-500 text-black' 
                    : 'bg-gray-800 text-white hover:bg-gray-700'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
        
        {/* Bloomberg-style Column Headers - 7 Columns */}
        <div className="grid grid-cols-7 gap-0 border-b border-gray-700 bg-gradient-to-b from-gray-800 via-gray-900 to-black text-sm font-bold text-yellow-400 uppercase shadow-inner">
          <div className="p-3 border-r border-gray-700 bg-gradient-to-b from-gray-800 to-gray-900 shadow-inner border-l-2 border-l-gray-600 border-t-2 border-t-gray-600">
            <span className="drop-shadow-lg text-shadow-carved">Symbol</span>
          </div>
          <div className="p-3 border-r border-gray-700 bg-gradient-to-b from-gray-800 to-gray-900 shadow-inner border-t-2 border-t-gray-600">
            <span className="drop-shadow-lg text-shadow-carved">Price</span>
          </div>
          <div className="p-3 border-r border-gray-700 bg-gradient-to-b from-gray-800 to-gray-900 shadow-inner border-t-2 border-t-gray-600">
            <span className="drop-shadow-lg text-shadow-carved">Change</span>
          </div>
          <div className="p-3 border-r border-gray-700 text-center bg-gradient-to-b from-gray-800 to-gray-900 shadow-inner border-t-2 border-t-gray-600">
            <span className="drop-shadow-lg text-shadow-carved">{getMarketRegimeForHeader('1d')}</span>
          </div>
          <div className="p-3 border-r border-gray-700 text-center bg-gradient-to-b from-gray-800 to-gray-900 shadow-inner border-t-2 border-t-gray-600">
            <span className="drop-shadow-lg text-shadow-carved">{getMarketRegimeForHeader('5d')}</span>
          </div>
          <div className="p-3 border-r border-gray-700 text-center bg-gradient-to-b from-gray-800 to-gray-900 shadow-inner border-t-2 border-t-gray-600">
            <span className="drop-shadow-lg text-shadow-carved">{getMarketRegimeForHeader('13d')}</span>
          </div>
          <div className="p-3 text-center bg-gradient-to-b from-gray-800 to-gray-900 shadow-inner border-t-2 border-t-gray-600 border-r-2 border-r-gray-600">
            <span className="drop-shadow-lg text-shadow-carved">{getMarketRegimeForHeader('21d')}</span>
          </div>
        </div>
        
        {/* Bloomberg-style Content */}
        <div className="flex-1 overflow-y-auto bg-black">
          {currentSymbols.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <div className="text-lg font-bold mb-2">NO DATA</div>
              <div className="text-sm">No symbols in {activeTab.toUpperCase()}</div>
            </div>
          ) : (
            <div className="divide-y divide-gray-800">
              {currentSymbols.map((symbol, index) => {
                const data = watchlistData[symbol];
                const spyData = watchlistData['SPY'];
                const isLoading = !data;
                
                // Add separator rows between categories
                const separatorRows = [];
                
                // Add green separator after DIA (before XLK)
                if (symbol === 'XLK') {
                  separatorRows.push(
                    <div key="growth-separator" className="h-3 bg-green-500 my-2 rounded opacity-60"></div>
                  );
                }
                
                // Add red separator after XLC (before XLRE) 
                if (symbol === 'XLRE') {
                  separatorRows.push(
                    <div key="defensive-separator" className="h-3 bg-red-500 my-2 rounded opacity-60"></div>
                  );
                }
                
                // Add blue separator after XLP (before XLB)
                if (symbol === 'XLB') {
                  separatorRows.push(
                    <div key="other-separator" className="h-3 bg-blue-500 my-2 rounded opacity-60"></div>
                  );
                }
                
                if (isLoading) {
                  return (
                    <React.Fragment key={symbol}>
                      {separatorRows}
                      <div className="grid grid-cols-7 gap-0 hover:bg-gradient-to-r hover:from-gray-800 hover:to-gray-900 transition-all duration-300 mb-1 bg-gradient-to-r from-black via-gray-900 to-black shadow-lg border border-gray-800">
                        <div className="p-3 border-r border-gray-800 font-mono font-bold text-white text-sm bg-gradient-to-b from-gray-900 to-black shadow-inner">
                          <span className="drop-shadow-md">{symbol}</span>
                        </div>
                        <div className="p-3 border-r border-gray-800 text-gray-500 text-sm bg-gradient-to-b from-gray-900 to-black shadow-inner">
                          <span className="drop-shadow-md">Loading...</span>
                        </div>
                        <div className="p-3 border-r border-gray-800 text-gray-500 text-sm bg-gradient-to-b from-gray-900 to-black shadow-inner">
                          <span className="drop-shadow-md">--</span>
                        </div>
                        <div className="p-3 border-r border-gray-800 text-gray-500 text-center text-sm bg-gradient-to-b from-gray-900 to-black shadow-inner">
                          <span className="drop-shadow-md">--</span>
                        </div>
                        <div className="p-3 border-r border-gray-800 text-gray-500 text-center text-sm bg-gradient-to-b from-gray-900 to-black shadow-inner">
                          <span className="drop-shadow-md">--</span>
                        </div>
                        <div className="p-3 border-r border-gray-800 text-gray-500 text-center text-sm bg-gradient-to-b from-gray-900 to-black shadow-inner">
                          <span className="drop-shadow-md">--</span>
                        </div>
                        <div className="p-3 text-gray-500 text-center text-sm bg-gradient-to-b from-gray-900 to-black shadow-inner">
                          <span className="drop-shadow-md">--</span>
                        </div>
                      </div>
                    </React.Fragment>
                  );
                }
                
                const changeColor = data.change1d >= 0 ? 'text-green-400' : 'text-red-400';
                const changeSign = data.change1d >= 0 ? '+' : '';
                
                // Get performance status for each time period vs SPY
                const perf1d = spyData ? getPerformanceStatus(data.change1d, spyData.change1d, symbol, '1d') : { status: '--', color: 'text-gray-400' };
                const perf5d = spyData ? getPerformanceStatus(data.change5d, spyData.change5d, symbol, '5d') : { status: '--', color: 'text-gray-400' };
                const perf13d = spyData ? getPerformanceStatus(data.change13d, spyData.change13d, symbol, '13d') : { status: '--', color: 'text-gray-400' };
                const perf21d = spyData ? getPerformanceStatus(data.change21d, spyData.change21d, symbol, '21d') : { status: '--', color: 'text-gray-400' };
                
                return (
                  <React.Fragment key={symbol}>
                    {separatorRows}
                    <div className="grid grid-cols-7 gap-0 hover:bg-gradient-to-r hover:from-gray-700 hover:via-gray-800 hover:to-gray-900 hover:shadow-xl transition-all duration-300 cursor-pointer mb-1 bg-gradient-to-r from-black via-gray-900 to-black shadow-lg border border-gray-800 hover:border-gray-600">
                      {/* Symbol */}
                      <div className="p-3 border-r border-gray-800 bg-gradient-to-b from-gray-900 to-black shadow-inner hover:shadow-none transition-shadow duration-300">
                        <span className="font-mono font-bold text-white text-sm drop-shadow-md hover:drop-shadow-lg transition-all duration-300">{symbol}</span>
                      </div>
                      
                      {/* Price */}
                      <div className="p-3 border-r border-gray-800 bg-gradient-to-b from-gray-900 to-black shadow-inner hover:shadow-none transition-shadow duration-300">
                        <div className="font-mono text-white font-bold text-sm drop-shadow-md hover:drop-shadow-lg transition-all duration-300">
                          {data.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </div>
                      
                      {/* Change */}
                      <div className="p-3 border-r border-gray-800 bg-gradient-to-b from-gray-900 to-black shadow-inner hover:shadow-none transition-shadow duration-300">
                        <div className={`font-mono font-bold text-sm drop-shadow-md hover:drop-shadow-lg transition-all duration-300 ${changeColor}`}>
                          {changeSign}{data.change1d.toFixed(2)}%
                        </div>
                      </div>
                      
                      {/* 1D Performance */}
                      <div className="p-3 border-r border-gray-800 text-center bg-gradient-to-b from-gray-900 to-black shadow-inner hover:shadow-none transition-shadow duration-300">
                        <span className={`font-bold text-sm uppercase tracking-wider drop-shadow-md hover:drop-shadow-lg transition-all duration-300 ${perf1d.color}`}>
                          {perf1d.status}
                        </span>
                      </div>
                      
                      {/* 5D Performance */}
                      <div className="p-3 border-r border-gray-800 text-center bg-gradient-to-b from-gray-900 to-black shadow-inner hover:shadow-none transition-shadow duration-300">
                        <span className={`font-bold text-sm uppercase tracking-wider drop-shadow-md hover:drop-shadow-lg transition-all duration-300 ${perf5d.color}`}>
                          {perf5d.status}
                        </span>
                      </div>
                      
                      {/* 13D Performance */}
                      <div className="p-3 border-r border-gray-800 text-center bg-gradient-to-b from-gray-900 to-black shadow-inner hover:shadow-none transition-shadow duration-300">
                        <span className={`font-bold text-sm uppercase tracking-wider drop-shadow-md hover:drop-shadow-lg transition-all duration-300 ${perf13d.color}`}>
                          {perf13d.status}
                        </span>
                      </div>
                      
                      {/* 21D Performance */}
                      <div className="p-3 text-center bg-gradient-to-b from-gray-900 to-black shadow-inner hover:shadow-none transition-shadow duration-300">
                        <span className={`font-bold text-sm uppercase tracking-wider drop-shadow-md hover:drop-shadow-lg transition-all duration-300 ${perf21d.color}`}>
                          {perf21d.status}
                        </span>
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          )}
        </div>
        
        {/* Bloomberg-style Footer */}
        <div className="p-2 border-t border-yellow-500 bg-gray-900">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-3 text-gray-300">
              <span className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 bg-green-400 rounded-full"></div>
                REAL-TIME
              </span>
              <span>{new Date().toLocaleTimeString()}</span>
            </div>
            <div className="text-yellow-400 font-bold">
              VS SPY
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Market Regimes Panel Component
  const RegimesPanel = ({ activeTab, setActiveTab }: { activeTab: string, setActiveTab: (tab: string) => void }) => (
    <div className="h-full flex flex-col">
      {/* Tabs */}
      <div className="flex border-b border-[#1a1a1a]">
        {['Life', 'Developing', 'Momentum'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === tab 
                ? 'text-emerald-400 border-b-2 border-emerald-400' 
                : 'text-white/60 hover:text-white/80'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>
      
      {/* Column Headers */}
      <div className="grid grid-cols-2 gap-4 p-4 border-b border-[#1a1a1a] text-xs font-medium text-white/60">
        <div>Bullish</div>
        <div>Bearish</div>
      </div>
      
      {/* Content */}
      <div className="flex-1 p-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="p-3 rounded bg-green-500/10 border border-green-500/20">
                <div className="text-green-400 font-medium">Bull Signal {i + 1}</div>
                <div className="text-white/60 text-sm">Market trending up</div>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="p-3 rounded bg-red-500/10 border border-red-500/20">
                <div className="text-red-400 font-medium">Bear Signal {i + 1}</div>
                <div className="text-white/60 text-sm">Market trending down</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  // Chat Panel Component
  const ChatPanel = ({ activeTab, setActiveTab }: { activeTab: string, setActiveTab: (tab: string) => void }) => (
    <div className="h-full flex flex-col">
      {/* Tabs */}
      <div className="flex border-b border-[#1a1a1a]">
        {['admin', 'classic'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-3 text-sm font-medium transition-colors capitalize ${
              activeTab === tab 
                ? 'text-violet-400 border-b-2 border-violet-400' 
                : 'text-white/60 hover:text-white/80'
            }`}
          >
            {tab} chats
          </button>
        ))}
      </div>
      
      {/* Chat Messages */}
      <div className="flex-1 p-4 space-y-3 overflow-y-auto">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex items-start space-x-3">
            <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
              <span className="text-blue-400 text-sm font-medium">U</span>
            </div>
            <div className="flex-1">
              <div className="flex items-center space-x-2">
                <span className="text-white/80 font-medium">User {i + 1}</span>
                <span className="text-white/40 text-xs">2m ago</span>
              </div>
              <div className="text-white/70 text-sm mt-1">
                Sample message content for chat {i + 1}
              </div>
            </div>
          </div>
        ))}
      </div>
      
      {/* Chat Input */}
      <div className="border-t border-[#1a1a1a] p-4">
        <div className="flex items-center space-x-2">
          <input
            type="text"
            placeholder="Type a message..."
            className="flex-1 bg-[#1a1a1a] text-white px-3 py-2 rounded border border-[#2a2a2a] focus:border-violet-400 focus:outline-none"
          />
          <button className="p-2 text-white/60 hover:text-violet-400 transition-colors">
            <TbPhoto size={20} />
          </button>
          <button className="p-2 bg-violet-500 text-white rounded hover:bg-violet-600 transition-colors">
            <TbSend size={20} />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Inject custom styles for 3D carved effect */}
      <style dangerouslySetInnerHTML={{
        __html: `
          .text-shadow-carved {
            text-shadow: 
              1px 1px 0px rgba(0, 0, 0, 0.9),
              -1px -1px 0px rgba(255, 255, 255, 0.1),
              0px -1px 0px rgba(255, 255, 255, 0.05),
              0px 1px 0px rgba(0, 0, 0, 0.8) !important;
          }
          
          .glow-yellow {
            text-shadow: 0 0 5px rgba(255, 255, 0, 0.5), 0 0 10px rgba(255, 255, 0, 0.3) !important;
          }
          
          .glow-green {
            text-shadow: 0 0 5px rgba(0, 255, 0, 0.5), 0 0 10px rgba(0, 255, 0, 0.3) !important;
          }
          
          .glow-red {
            text-shadow: 0 0 5px rgba(255, 0, 0, 0.5), 0 0 10px rgba(255, 0, 0, 0.3) !important;
          }
        `
      }} />
      
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
        
        {/* Drawing Tools Status Badge */}
        <div className="absolute top-2 left-4 z-20">
          <div
            className="flex items-center space-x-2 px-3 py-1 rounded-full bg-black/60 backdrop-blur border border-gray-600/50"
            style={{
              background: 'linear-gradient(135deg, rgba(18, 18, 18, 0.9) 0%, rgba(12, 12, 12, 0.95) 100%)',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
              fontSize: '11px',
              display: 'none'
            }}
          >
          </div>
        </div>
        
        {/* Symbol and Price Info */}
        <div className="flex items-center justify-between w-full relative z-10">
          {/* Left side: Symbol Search + Price */}
          <div className="flex items-center space-x-8">
          <div className="flex items-center space-x-3">
            <div className="relative flex items-center">
              <div className="flex items-center space-x-2 px-3 py-2 rounded-md" style={{
                background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ color: '#9ca3af' }}>
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
                    e.currentTarget.parentElement!.parentElement!.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 0 0 2px rgba(41, 98, 255, 0.2)';
                  }}
                  onBlur={(e) => {
                    if (!searchQuery) setSearchQuery('');
                    e.currentTarget.parentElement!.parentElement!.style.border = '1px solid rgba(255, 255, 255, 0.2)';
                    e.currentTarget.parentElement!.parentElement!.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)';
                  }}
                  className="bg-transparent border-0 outline-none w-28 text-lg font-bold"
                  style={{
                    color: '#ffffff',
                    textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)',
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                    letterSpacing: '0.8px'
                  }}
                  placeholder="Search..."
                />
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ color: '#666' }}>
                  <path d="M12 5v14l7-7-7-7z" fill="currentColor"/>
                </svg>
              </div>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <span 
              className="font-mono text-3xl font-bold"
              style={{
                color: '#ffffff',
                textShadow: '0 2px 4px rgba(0, 0, 0, 0.8), 0 0 12px rgba(255, 255, 255, 0.3)',
                letterSpacing: '0.5px'
              }}
            >
              ${currentPrice.toFixed(2)}
            </span>
            <span 
              className="font-mono text-sm font-semibold px-3 py-1 rounded-full"
              style={{
                color: priceChangePercent >= 0 ? '#10b981' : '#ef4444',
                background: priceChangePercent >= 0 
                  ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(16, 185, 129, 0.05) 100%)'
                  : 'linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(239, 68, 68, 0.05) 100%)',
                textShadow: `0 1px 2px rgba(0, 0, 0, 0.8), 0 0 10px ${priceChangePercent >= 0 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                border: `1px solid ${priceChangePercent >= 0 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                letterSpacing: '0.3px'
              }}
            >
              {priceChangePercent >= 0 ? '+' : ''}{priceChange.toFixed(2)} ({priceChangePercent.toFixed(2)}%)
            </span>
          </div>
          </div>

          {/* Right side: Timeframes + Controls */}
          <div className="flex items-center space-x-6">
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
                  padding: '10px 20px',
                  background: config.timeframe === tf.value
                    ? 'linear-gradient(145deg, #1a1a1a 0%, #000000 50%, #1a1a1a 100%)'
                    : 'linear-gradient(145deg, #2a2a2a 0%, #1a1a1a 50%, #2a2a2a 100%)',
                  color: '#ffffff',
                  fontWeight: '700',
                  fontSize: '15px',
                  letterSpacing: '0.8px',
                  textShadow: '0 2px 4px rgba(0, 0, 0, 0.9), 0 0 10px rgba(255, 255, 255, 0.2)',
                  borderRight: index < 4 ? '1px solid rgba(255, 255, 255, 0.1)' : 'none',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                  borderRadius: '0',
                  boxShadow: config.timeframe === tf.value
                    ? 'inset 0 2px 4px rgba(0, 0, 0, 0.6), inset 0 -2px 4px rgba(255, 255, 255, 0.1), 0 4px 8px rgba(41, 98, 255, 0.3)'
                    : 'inset 0 2px 4px rgba(0, 0, 0, 0.3), inset 0 -2px 4px rgba(255, 255, 255, 0.05), 0 2px 4px rgba(0, 0, 0, 0.2)'
                }}
                onMouseEnter={(e) => {
                  if (config.timeframe !== tf.value) {
                    e.currentTarget.style.background = 'linear-gradient(145deg, #3a3a3a 0%, #2a2a2a 50%, #3a3a3a 100%)';
                    e.currentTarget.style.boxShadow = 'inset 0 2px 4px rgba(0, 0, 0, 0.4), inset 0 -2px 4px rgba(255, 255, 255, 0.1), 0 4px 8px rgba(0, 0, 0, 0.3)';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (config.timeframe !== tf.value) {
                    e.currentTarget.style.background = 'linear-gradient(145deg, #2a2a2a 0%, #1a1a1a 50%, #2a2a2a 100%)';
                    e.currentTarget.style.boxShadow = 'inset 0 2px 4px rgba(0, 0, 0, 0.3), inset 0 -2px 4px rgba(255, 255, 255, 0.05), 0 2px 4px rgba(0, 0, 0, 0.2)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }
                }}
              >
                {tf.label}
              </button>
            ))}
            
            {/* Dropdown Toggle Button - Integrated */}
            <div className="relative">
              <button
                onClick={() => setShowTimeframeDropdown(!showTimeframeDropdown)}
                className="relative group flex items-center space-x-1"
                style={{
                  padding: '8px 12px',
                  background: ['1m', '15m', '1w', '1mo'].includes(config.timeframe)
                    ? 'linear-gradient(135deg, #2962ff 0%, #1e4db7 100%)'
                    : 'transparent',
                  color: ['1m', '15m', '1w', '1mo'].includes(config.timeframe) ? '#ffffff' : '#d1d5db',
                  fontWeight: '600',
                  fontSize: '13px',
                  letterSpacing: '0.5px',
                  textShadow: ['1m', '15m', '1w', '1mo'].includes(config.timeframe)
                    ? '0 1px 2px rgba(0, 0, 0, 0.8), 0 0 8px rgba(41, 98, 255, 0.4)'
                    : '0 1px 1px rgba(0, 0, 0, 0.8)',
                  borderLeft: '1px solid rgba(255, 255, 255, 0.1)',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                }}
                onMouseEnter={(e) => {
                  if (!['1m', '15m', '1w', '1mo'].includes(config.timeframe)) {
                    e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%)';
                    e.currentTarget.style.color = '#ffffff';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!['1m', '15m', '1w', '1mo'].includes(config.timeframe)) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = '#d1d5db';
                  }
                }}
              >
                <svg 
                  width="12" 
                  height="12" 
                  viewBox="0 0 12 12" 
                  fill="currentColor"
                  style={{
                    transform: showTimeframeDropdown ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s'
                  }}
                >
                  <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                </svg>
              </button>
              
              {/* Enhanced Dropdown Menu */}
              {showTimeframeDropdown && (
                <div 
                  className="absolute top-full left-0 mt-2 rounded-xl shadow-2xl min-w-[120px] backdrop-blur-lg"
                  style={{
                    background: 'linear-gradient(135deg, rgba(10, 10, 10, 0.95) 0%, rgba(26, 26, 26, 0.95) 100%)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    boxShadow: '0 20px 40px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
                    zIndex: 9999
                  }}
                >
                  {['1M', '15M', '1W', '1MO'].map((tf, index) => (
                    <button
                      key={tf}
                      onClick={() => {
                        handleTimeframeChange(tf.toLowerCase());
                        setShowTimeframeDropdown(false);
                      }}
                      className="w-full text-left transition-all duration-150"
                      style={{
                        padding: '12px 16px',
                        background: config.timeframe === tf.toLowerCase()
                          ? 'linear-gradient(135deg, #2962ff 0%, #1e4db7 100%)'
                          : 'transparent',
                        color: config.timeframe === tf.toLowerCase() ? '#ffffff' : '#d1d5db',
                        fontWeight: '600',
                        fontSize: '13px',
                        letterSpacing: '0.5px',
                        textShadow: config.timeframe === tf.toLowerCase()
                          ? '0 1px 2px rgba(0, 0, 0, 0.8), 0 0 8px rgba(41, 98, 255, 0.4)'
                          : '0 1px 1px rgba(0, 0, 0, 0.8)',
                        borderRadius: index === 0 ? '10px 10px 0 0' : index === 3 ? '0 0 10px 10px' : '0'
                      }}
                      onMouseEnter={(e) => {
                        if (config.timeframe !== tf.toLowerCase()) {
                          e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%)';
                          e.currentTarget.style.color = '#ffffff';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (config.timeframe !== tf.toLowerCase()) {
                          e.currentTarget.style.background = 'transparent';
                          e.currentTarget.style.color = '#d1d5db';
                        }
                      }}
                    >
                      {tf}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Enhanced Chart Controls */}
        <div className="flex items-center space-x-3 relative" style={{ zIndex: 10000 }}>
          {/* Chart Type Selector - Integrated Dropdown Style */}
          <div 
            className="flex items-center chart-type-dropdown"
            style={{
              background: 'linear-gradient(145deg, #2a2a2a 0%, #1a1a1a 50%, #2a2a2a 100%)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '8px',
              boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.3), inset 0 -2px 4px rgba(255, 255, 255, 0.05), 0 4px 8px rgba(0, 0, 0, 0.4)'
            }}
          >
            {/* Main Chart Type Buttons */}
            {MAIN_CHART_TYPES.map((type, index) => (
              <button
                key={type.value}
                onClick={() => handleChartTypeChange(type.value as ChartConfig['chartType'])}
                className="relative group"
                style={{
                  padding: '10px 14px',
                  background: config.chartType === type.value
                    ? 'linear-gradient(145deg, #2962ff 0%, #1e4db7 50%, #2962ff 100%)'
                    : 'linear-gradient(145deg, #1a1a1a 0%, #000000 50%, #1a1a1a 100%)',
                  color: '#ffffff',
                  fontSize: '16px',
                  fontWeight: '700',
                  borderRight: index < MAIN_CHART_TYPES.length - 1 ? '1px solid rgba(255, 255, 255, 0.1)' : 'none',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                  textShadow: config.chartType === type.value
                    ? '0 2px 4px rgba(0, 0, 0, 0.9), 0 0 10px rgba(41, 98, 255, 0.4)'
                    : '0 2px 4px rgba(0, 0, 0, 0.9), 0 0 10px rgba(255, 255, 255, 0.2)',
                  borderRadius: '0',
                  boxShadow: config.chartType === type.value
                    ? 'inset 0 2px 4px rgba(0, 0, 0, 0.4), inset 0 -2px 4px rgba(255, 255, 255, 0.1), 0 4px 8px rgba(41, 98, 255, 0.3)'
                    : 'inset 0 2px 4px rgba(0, 0, 0, 0.3), inset 0 -2px 4px rgba(255, 255, 255, 0.05), 0 2px 4px rgba(0, 0, 0, 0.2)'
                }}
                title={type.label}
                onMouseEnter={(e) => {
                  if (config.chartType !== type.value) {
                    e.currentTarget.style.background = 'linear-gradient(145deg, #2a2a2a 0%, #1a1a1a 50%, #2a2a2a 100%)';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow = 'inset 0 2px 4px rgba(0, 0, 0, 0.4), inset 0 -2px 4px rgba(255, 255, 255, 0.1), 0 4px 8px rgba(0, 0, 0, 0.3)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (config.chartType !== type.value) {
                    e.currentTarget.style.background = 'linear-gradient(145deg, #1a1a1a 0%, #000000 50%, #1a1a1a 100%)';
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'inset 0 2px 4px rgba(0, 0, 0, 0.3), inset 0 -2px 4px rgba(255, 255, 255, 0.05), 0 2px 4px rgba(0, 0, 0, 0.2)';
                    e.currentTarget.style.color = '#d1d5db';
                  }
                }}
              >
                {type.icon}
              </button>
            ))}
          </div>

          {/* Volume Toggle */}
          <button
            onClick={() => setConfig(prev => ({ ...prev, volume: !prev.volume }))}
            className="relative group"
            style={{
              padding: '10px 14px',
              borderRadius: '8px',
              background: config.volume
                ? 'linear-gradient(145deg, #2962ff 0%, #1e4db7 50%, #2962ff 100%)'
                : 'linear-gradient(145deg, #1a1a1a 0%, #000000 50%, #1a1a1a 100%)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: config.volume ? '#ffffff' : '#d1d5db',
              fontWeight: '700',
              fontSize: '13px',
              letterSpacing: '0.5px',
              textShadow: config.volume
                ? '0 2px 4px rgba(0, 0, 0, 0.9), 0 0 10px rgba(41, 98, 255, 0.4)'
                : '0 2px 4px rgba(0, 0, 0, 0.9)',
              boxShadow: config.volume
                ? 'inset 0 2px 4px rgba(0, 0, 0, 0.4), inset 0 -2px 4px rgba(255, 255, 255, 0.1), 0 4px 8px rgba(41, 98, 255, 0.3)'
                : 'inset 0 2px 4px rgba(0, 0, 0, 0.3), inset 0 -2px 4px rgba(255, 255, 255, 0.05), 0 2px 4px rgba(0, 0, 0, 0.2)',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
            onMouseEnter={(e) => {
              if (!config.volume) {
                e.currentTarget.style.background = 'linear-gradient(145deg, #2a2a2a 0%, #1a1a1a 50%, #2a2a2a 100%)';
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = 'inset 0 2px 4px rgba(0, 0, 0, 0.4), inset 0 -2px 4px rgba(255, 255, 255, 0.1), 0 4px 8px rgba(0, 0, 0, 0.3)';
              }
            }}
            onMouseLeave={(e) => {
              if (!config.volume) {
                e.currentTarget.style.background = 'linear-gradient(145deg, #1a1a1a 0%, #000000 50%, #1a1a1a 100%)';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'inset 0 2px 4px rgba(0, 0, 0, 0.3), inset 0 -2px 4px rgba(255, 255, 255, 0.05), 0 2px 4px rgba(0, 0, 0, 0.2)';
              }
            }}
          >
            VOLUME
          </button>

          {/* Indicators Button with Dropdown */}
          <div 
            className="relative indicators-dropdown"
            style={{
              background: 'linear-gradient(145deg, #2a2a2a 0%, #1a1a1a 50%, #2a2a2a 100%)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.3), inset 0 -2px 4px rgba(255, 255, 255, 0.05), 0 2px 4px rgba(0, 0, 0, 0.2)'
            }}
          >
            <button 
              onClick={() => setShowIndicatorsDropdown(!showIndicatorsDropdown)}
              className="relative group flex items-center space-x-2"
              style={{
                padding: '10px 14px',
                background: 'linear-gradient(145deg, #1a1a1a 0%, #000000 50%, #1a1a1a 100%)',
                color: '#d1d5db',
                fontWeight: '700',
                fontSize: '13px',
                letterSpacing: '0.5px',
                textShadow: '0 2px 4px rgba(0, 0, 0, 0.9)',
                borderRadius: '8px',
                boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.3), inset 0 -2px 4px rgba(255, 255, 255, 0.05), 0 2px 4px rgba(0, 0, 0, 0.2)',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'linear-gradient(145deg, #2a2a2a 0%, #1a1a1a 50%, #2a2a2a 100%)';
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = 'inset 0 2px 4px rgba(0, 0, 0, 0.4), inset 0 -2px 4px rgba(255, 255, 255, 0.1), 0 4px 8px rgba(0, 0, 0, 0.3)';
                e.currentTarget.style.color = '#ffffff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'linear-gradient(145deg, #1a1a1a 0%, #000000 50%, #1a1a1a 100%)';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'inset 0 2px 4px rgba(0, 0, 0, 0.3), inset 0 -2px 4px rgba(255, 255, 255, 0.05), 0 2px 4px rgba(0, 0, 0, 0.2)';
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

          {/* Enhanced Action Buttons */}
          <div className="flex items-center space-x-3">
            {/* ADMIN Button */}
            <button 
              className="relative group"
              style={{
                padding: '10px 18px',
                borderRadius: '8px',
                background: 'linear-gradient(145deg, #1a1a1a 0%, #000000 50%, #1a1a1a 100%)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#ffffff',
                fontWeight: '700',
                fontSize: '13px',
                letterSpacing: '0.8px',
                textShadow: '0 2px 4px rgba(0, 0, 0, 0.9), 0 0 10px rgba(255, 255, 255, 0.2)',
                boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.3), inset 0 -2px 4px rgba(255, 255, 255, 0.05), 0 4px 8px rgba(0, 0, 0, 0.4)',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'linear-gradient(145deg, #2a2a2a 0%, #1a1a1a 50%, #2a2a2a 100%)';
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = 'inset 0 2px 4px rgba(0, 0, 0, 0.4), inset 0 -2px 4px rgba(255, 255, 255, 0.1), 0 6px 12px rgba(0, 0, 0, 0.5)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'linear-gradient(145deg, #1a1a1a 0%, #000000 50%, #1a1a1a 100%)';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'inset 0 2px 4px rgba(0, 0, 0, 0.3), inset 0 -2px 4px rgba(255, 255, 255, 0.05), 0 4px 8px rgba(0, 0, 0, 0.4)';
              }}
            >
              ADMIN
            </button>

            {/* AI Button */}
            <button 
              className="relative group"
              style={{
                padding: '10px 18px',
                borderRadius: '8px',
                background: 'linear-gradient(145deg, #1a1a1a 0%, #000000 50%, #1a1a1a 100%)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#ffffff',
                fontWeight: '700',
                fontSize: '13px',
                letterSpacing: '0.8px',
                textShadow: '0 2px 4px rgba(0, 0, 0, 0.9), 0 0 10px rgba(255, 255, 255, 0.2)',
                boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.3), inset 0 -2px 4px rgba(255, 255, 255, 0.05), 0 4px 8px rgba(0, 0, 0, 0.4)',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'linear-gradient(145deg, #2a2a2a 0%, #1a1a1a 50%, #2a2a2a 100%)';
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = 'inset 0 2px 4px rgba(0, 0, 0, 0.4), inset 0 -2px 4px rgba(255, 255, 255, 0.1), 0 6px 12px rgba(0, 0, 0, 0.5)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'linear-gradient(145deg, #1a1a1a 0%, #000000 50%, #1a1a1a 100%)';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'inset 0 2px 4px rgba(0, 0, 0, 0.3), inset 0 -2px 4px rgba(255, 255, 255, 0.05), 0 4px 8px rgba(0, 0, 0, 0.4)';
              }}
            >
              AI
            </button>

            {/* Drawing Tools Category Buttons */}
            {Object.entries(DRAWING_TOOLS).slice(0, 8).map(([category, tools]) => {
              const categoryKey = category.toLowerCase().replace(/\s+/g, '');
              const dropdownState = {
                'linetools': showLineToolsDropdown,
                'fibtools': showFibDropdown,
                'shapes': showShapesDropdown,
                'gann': showGannDropdown,
                'elliott': showElliottDropdown,
                'prediction': showPredictionDropdown,
                'measure': showMeasureDropdown,
                'notes': showNotesDropdown,
                'volume': showVolumeDropdown,
                'patterns': showPatternsDropdown,
                'harmonic': showHarmonicDropdown,
                'cycles': showCyclesDropdown,
                'orders': showOrdersDropdown
              }[categoryKey];
              
              const setDropdownState = {
                'linetools': setShowLineToolsDropdown,
                'fibtools': setShowFibDropdown,
                'shapes': setShowShapesDropdown,
                'gann': setShowGannDropdown,
                'elliott': setShowElliottDropdown,
                'prediction': setShowPredictionDropdown,
                'measure': setShowMeasureDropdown,
                'notes': setShowNotesDropdown,
                'volume': setShowVolumeDropdown,
                'patterns': setShowPatternsDropdown,
                'harmonic': setShowHarmonicDropdown,
                'cycles': setShowCyclesDropdown,
                'orders': setShowOrdersDropdown
              }[categoryKey];

              const hasActiveTool = tools.some(tool => tool.value === activeTool);
              const functionalCount = tools.filter(t => t.functional).length;
              
              return (
                <div key={category} className={`relative ${categoryKey}-dropdown`}>
                  <button 
                    onClick={() => setDropdownState && setDropdownState(!dropdownState)}
                    className="relative group flex items-center space-x-1"
                    style={{
                      padding: '8px 12px',
                      borderRadius: '6px',
                      background: hasActiveTool || dropdownState
                        ? 'linear-gradient(145deg, #2962ff 0%, #1e4db7 50%, #2962ff 100%)'
                        : 'linear-gradient(145deg, #1a1a1a 0%, #000000 50%, #1a1a1a 100%)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#ffffff',
                      fontWeight: '600',
                      fontSize: '11px',
                      letterSpacing: '0.5px',
                      textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)',
                      boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.3), inset 0 -1px 2px rgba(255, 255, 255, 0.05), 0 2px 4px rgba(0, 0, 0, 0.4)',
                      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                    }}
                    onMouseEnter={(e) => {
                      if (!hasActiveTool && !dropdownState) {
                        e.currentTarget.style.background = 'linear-gradient(145deg, #2a2a2a 0%, #1a1a1a 50%, #2a2a2a 100%)';
                        e.currentTarget.style.transform = 'translateY(-1px)';
                        e.currentTarget.style.boxShadow = 'inset 0 2px 4px rgba(0, 0, 0, 0.4), inset 0 -2px 4px rgba(255, 255, 255, 0.1), 0 4px 8px rgba(0, 0, 0, 0.5)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!hasActiveTool && !dropdownState) {
                        e.currentTarget.style.background = 'linear-gradient(145deg, #1a1a1a 0%, #000000 50%, #1a1a1a 100%)';
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = 'inset 0 1px 2px rgba(0, 0, 0, 0.3), inset 0 -1px 2px rgba(255, 255, 255, 0.05), 0 2px 4px rgba(0, 0, 0, 0.4)';
                      }
                    }}
                  >
                    {/* Special handling for Line Tools to show a custom icon */}
                    {categoryKey === 'linetools' ? (
                      <>
                        <span style={{ 
                          color: '#c0c0c0', 
                          fontSize: '16px', 
                          fontWeight: 'bold',
                          textShadow: '0 0 6px rgba(192, 192, 192, 0.8)',
                          filter: 'brightness(1.2)'
                        }}>
                          ━
                        </span>
                      </>
                    ) : (
                      <>
                        <span>{tools[0]?.icon || '�'}</span>
                        <span>{category.split(' ')[0]}</span>
                      </>
                    )}
                    <span style={{ 
                      transform: dropdownState ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s ease',
                      fontSize: '8px'
                    }}>
                      ▼
                    </span>
                  </button>

                  {/* Category Tools Dropdown */}
                  {dropdownState && (
                    <div 
                      className="absolute top-full left-0 mt-1 bg-black/95 backdrop-blur-xl border border-gray-700 rounded-lg shadow-2xl z-50 min-w-72"
                      style={{
                        background: 'linear-gradient(135deg, rgba(26,26,26,0.98) 0%, rgba(45,45,45,0.98) 100%)',
                        boxShadow: '0 20px 40px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.08)',
                        backdropFilter: 'blur(16px)',
                        border: '1px solid rgba(255, 255, 255, 0.15)'
                      }}
                    >
                      {/* Category Header */}
                      <div className="px-4 py-3 border-b border-gray-600/50 bg-gray-900/70">
                        <div className="flex items-center justify-between">
                          <h4 
                            className="text-white font-bold text-base tracking-wide"
                            style={{
                              textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)',
                              letterSpacing: '0.5px'
                            }}
                          >
                            {category}
                          </h4>
                        </div>
                      </div>

                      {/* Tools List */}
                      <div className="py-1 max-h-80 overflow-y-auto">
                        {tools.map((tool) => (
                          <button
                            key={tool.value}
                            onClick={() => selectDrawingTool(tool.value)}
                            disabled={!tool.functional}
                            className="w-full px-4 py-3 text-left flex items-center space-x-3 hover:bg-white/15 transition-all duration-200 group disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{
                              background: activeTool === tool.value 
                                ? 'linear-gradient(135deg, #2962ff 0%, #1e4db7 100%)'
                                : 'transparent',
                              color: activeTool === tool.value ? '#ffffff' : '#ffffff',
                              fontSize: '14px',
                              fontWeight: '500'
                            }}
                          >
                            <span 
                              className="text-lg"
                              style={{
                                color: activeTool === tool.value ? '#ffffff' : '#c0c0c0',
                                textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)'
                              }}
                            >
                              {tool.icon}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold">
                                <span 
                                  style={{
                                    color: '#ffffff',
                                    textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)',
                                    fontSize: '15px'
                                  }}
                                >
                                  {tool.label}
                                </span>
                              </div>
                            </div>
                            {activeTool === tool.value && (
                              <span className="text-blue-300 text-xs">✓</span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Settings Button */}
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className="relative group"
            style={{
              padding: '10px 18px',
              borderRadius: '8px',
              background: showSettings
                ? 'linear-gradient(145deg, #2962ff 0%, #1e4db7 50%, #2962ff 100%)'
                : 'linear-gradient(145deg, #1a1a1a 0%, #000000 50%, #1a1a1a 100%)',
              border: showSettings
                ? '1px solid rgba(41, 98, 255, 0.5)'
                : '1px solid rgba(255, 255, 255, 0.15)',
              color: '#ffffff',
              fontWeight: '700',
              fontSize: '13px',
              letterSpacing: '0.8px',
              textShadow: showSettings
                ? '0 2px 4px rgba(0, 0, 0, 0.9), 0 0 10px rgba(41, 98, 255, 0.4)'
                : '0 2px 4px rgba(0, 0, 0, 0.9), 0 0 10px rgba(255, 255, 255, 0.2)',
              boxShadow: showSettings
                ? 'inset 0 2px 4px rgba(0, 0, 0, 0.4), inset 0 -2px 4px rgba(255, 255, 255, 0.1), 0 4px 12px rgba(41, 98, 255, 0.3)'
                : 'inset 0 2px 4px rgba(0, 0, 0, 0.3), inset 0 -2px 4px rgba(255, 255, 255, 0.05), 0 4px 8px rgba(0, 0, 0, 0.4)',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
            onMouseEnter={(e) => {
              if (!showSettings) {
                e.currentTarget.style.background = 'linear-gradient(145deg, #2a2a2a 0%, #1a1a1a 50%, #2a2a2a 100%)';
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = 'inset 0 2px 4px rgba(0, 0, 0, 0.4), inset 0 -2px 4px rgba(255, 255, 255, 0.1), 0 6px 12px rgba(0, 0, 0, 0.5)';
              }
            }}
            onMouseLeave={(e) => {
              if (!showSettings) {
                e.currentTarget.style.background = 'linear-gradient(145deg, #1a1a1a 0%, #000000 50%, #1a1a1a 100%)';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'inset 0 2px 4px rgba(0, 0, 0, 0.3), inset 0 -2px 4px rgba(255, 255, 255, 0.05), 0 4px 8px rgba(0, 0, 0, 0.4)';
              }
            }}
          >
            SETTINGS
          </button>
          </div>
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

      {/* Chart Container with Sidebar */}
      <div className="flex flex-1 bg-[#0a0a0a]">
        {/* Animated 3D Sidebar */}
        <div className="sidebar-container w-16 bg-gradient-to-b from-[#000000] via-[#0a0a0a] to-[#000000] border-r border-[#1a1a1a] shadow-2xl relative overflow-hidden">
          {/* Subtle background pattern */}
          <div className="absolute inset-0 opacity-5">
            <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-white/5 via-transparent to-white/3"></div>
            <div className="absolute top-1/4 left-1/4 w-6 h-6 bg-white/3 rounded-full animate-pulse"></div>
            <div className="absolute bottom-1/3 right-1/4 w-4 h-4 bg-white/2 rounded-full animate-pulse" style={{ animationDelay: '2000ms' }}></div>
          </div>
          
          <div className="relative z-10 flex flex-col items-center py-4 h-full">
            {/* Sidebar Buttons */}
            {[
              { id: 'watchlist', icon: TbChartLine, label: 'Watch', color: 'from-gray-800 to-gray-900', accent: 'blue' },
              { id: 'regimes', icon: TbTrendingUp, label: 'Trends', color: 'from-gray-800 to-gray-900', accent: 'emerald' },
              { id: 'news', icon: TbNews, label: 'News', color: 'from-gray-800 to-gray-900', accent: 'amber' },
              { id: 'alerts', icon: TbBellRinging, label: 'Alerts', color: 'from-gray-800 to-gray-900', accent: 'red' },
              { id: 'chat', icon: TbMessageCircle, label: 'Chat', color: 'from-gray-800 to-gray-900', accent: 'violet' }
            ].map((item, index) => {
              const IconComponent = item.icon;
              const accentColors: { [key: string]: string } = {
                blue: 'text-blue-400 group-hover:text-blue-300',
                emerald: 'text-emerald-400 group-hover:text-emerald-300',
                amber: 'text-amber-400 group-hover:text-amber-300',
                red: 'text-red-400 group-hover:text-red-300',
                violet: 'text-violet-400 group-hover:text-violet-300'
              };
              return (
              <div key={item.id} className="flex flex-col items-center mb-3">
                {/* Title above button */}
                <span className="text-xs text-white/40 font-medium mb-1 tracking-wide text-center">
                  {item.label}
                </span>
                
                <button
                className={`sidebar-btn group relative w-12 h-12 rounded-lg bg-gradient-to-br ${item.color} 
                           shadow-lg hover:shadow-2xl transform transition-all duration-300 
                           hover:scale-105 hover:-translate-y-0.5 active:scale-95
                           border border-gray-700/50 hover:border-gray-600/70
                           before:absolute before:inset-0 before:rounded-lg 
                           before:bg-gradient-to-r before:from-white/0 before:via-white/5 before:to-white/0
                           before:translate-x-[-100%] hover:before:translate-x-[100%] 
                           before:transition-transform before:duration-700 before:ease-out overflow-hidden
                           backdrop-blur-sm flex items-center justify-center`}
                style={{ 
                  animationDelay: `${index * 100}ms`,
                  background: 'linear-gradient(135deg, rgba(17, 17, 17, 0.95) 0%, rgba(10, 10, 10, 0.98) 100%)',
                  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 2px 8px rgba(0, 0, 0, 0.5)'
                }}
                onClick={() => handleSidebarClick(item.id)}
                title={item.label}
              >
                {/* Subtle inner glow */}
                <div className="absolute inset-0.5 rounded-md bg-gradient-to-br from-white/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                
                {/* Icon with accent color */}
                <span className={`z-10 text-4xl filter drop-shadow-lg transition-all duration-300 group-hover:scale-110 ${accentColors[item.accent]}`}>
                  <IconComponent />
                </span>
                
                {/* Subtle ripple effect */}
                <div className="absolute inset-0 rounded-lg bg-white/10 scale-0 group-active:scale-100 transition-transform duration-200"></div>
                
                {/* Accent glow effect */}
                <div className={`absolute inset-0 rounded-lg bg-gradient-to-r from-${item.accent}-500/20 to-${item.accent}-600/20 opacity-0 group-hover:opacity-30 blur-sm transition-opacity duration-300`}></div>
              </button>
              </div>
              );
            })}
            
            {/* Decorative elements */}
            <div className="flex-1"></div>
            <div className="w-8 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent mb-2"></div>
            <div className="text-xs text-white/40 font-mono tracking-wider">EFI</div>
          </div>
          
          {/* Subtle side accent */}
          <div className="absolute top-0 right-0 w-px h-full bg-gradient-to-b from-transparent via-white/10 to-transparent"></div>
        </div>

        {/* Main Chart Area */}
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
            cursor: activeTool ? 'crosshair' : isDragging ? 'grabbing' : 'crosshair',
            transition: 'cursor 0.1s ease'
          }}
          onMouseDown={handleUnifiedMouseDown}
        onContextMenu={(e) => {
          e.preventDefault();
          const x = e.nativeEvent.offsetX;
          const y = e.nativeEvent.offsetY;
          
          // Check if right-clicking on a drawing
          for (const drawing of drawings) {
            const startPoint = drawing.startPoint || { x: drawing.startX, y: drawing.startY };
            const endPoint = drawing.endPoint || { x: drawing.endX, y: drawing.endY };
            
            if (isPointNearLine(x, y, startPoint, endPoint, 10)) {
              setSelectedDrawing(drawing);
              
              // Position editor near right-click location
              const canvas = e.currentTarget;
              const rect = canvas.getBoundingClientRect();
              const editorX = Math.min(x + rect.left + 20, window.innerWidth - 300);
              const editorY = Math.min(y + rect.top, window.innerHeight - 400);
              setEditorPosition({ x: editorX, y: editorY });
              setShowDrawingEditor(true);
              break;
            }
          }
        }}
          onMouseMove={activeTool ? handleCanvasMouseMove : handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          onDoubleClick={handleDoubleClick}
        />
      </div>

      {/* Text Input Modal for Drawing Tools */}
      {showTextInput && textInputPosition && (
        <div 
          className="absolute z-[10000] bg-[#1e222d] border border-[#2a2e39] rounded-lg p-4 shadow-xl"
          style={{
            left: textInputPosition.x + 10,
            top: textInputPosition.y - 10,
            minWidth: '200px'
          }}
        >
          <div className="mb-3">
            <label className="block text-white text-sm font-medium mb-2">
              {activeTool === 'text' ? 'Add Text' : 
               activeTool === 'note' ? 'Add Note' : 
               activeTool === 'callout' ? 'Add Callout' : 
               activeTool === 'price_label' ? 'Price Label' : 
               'Add Text'}
            </label>
            <input
              type="text"
              value={drawingText}
              onChange={(e) => setDrawingText(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleTextSubmit()}
              className="w-full px-3 py-2 bg-[#131722] border border-[#3a3e47] rounded text-white text-sm focus:outline-none focus:border-[#2962ff]"
              placeholder="Enter text..."
              autoFocus
            />
          </div>
          <div className="flex space-x-2">
            <button
              onClick={handleTextSubmit}
              className="px-3 py-1 bg-[#2962ff] text-white rounded text-sm hover:bg-[#1e4db7] transition-colors"
            >
              Add
            </button>
            <button
              onClick={() => {
                setShowTextInput(false);
                setDrawingText('');
                setTextInputPosition(null);
                setActiveTool(null);
              }}
              className="px-3 py-1 bg-[#131722] text-[#787b86] rounded text-sm hover:text-white transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Multi-point Drawing Instructions */}
      {activeTool && multiPointDrawing.length > 0 && (
        <div 
          className="absolute top-20 left-6 z-[9999] bg-[#1e222d] bg-opacity-90 border border-[#2a2e39] rounded-lg p-3 backdrop-blur-sm"
        >
          <div className="text-white text-sm">
            <div className="font-medium mb-1">
              {Object.values(DRAWING_TOOLS).flat().find(tool => tool.value === activeTool)?.label}
            </div>
            <div className="text-[#787b86] text-xs">
              Point {multiPointDrawing.length + 1} of {
                activeTool === 'pitchfork' || activeTool === 'schiff_pitchfork' ? '3' :
                activeTool === 'elliott_wave' ? '8' :
                activeTool === 'elliott_impulse' ? '5' :
                activeTool === 'elliott_correction' ? '3' :
                activeTool === 'head_shoulders' ? '5' :
                'multiple'
              }
            </div>
            {multiPointDrawing.length > 0 && (
              <button
                onClick={() => {
                  setMultiPointDrawing([]);
                  setCurrentDrawingPhase(0);
                  setActiveTool(null);
                }}
                className="mt-2 px-2 py-1 bg-red-600/20 text-red-400 border border-red-600/30 rounded text-xs hover:bg-red-600/30 transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {/* Active Tool Indicator */}
      {activeTool && (
        <div 
          className="absolute top-20 right-6 z-[9999] bg-[#1e222d] bg-opacity-90 border border-[#2a2e39] rounded-lg p-3 backdrop-blur-sm"
        >
          <div className="text-white text-sm flex items-center space-x-2">
            <span className="text-lg">
              {Object.values(DRAWING_TOOLS).flat().find(tool => tool.value === activeTool)?.icon}
            </span>
            <div>
              <div className="font-medium">
                {Object.values(DRAWING_TOOLS).flat().find(tool => tool.value === activeTool)?.label}
              </div>
            </div>
            <button
              onClick={() => setActiveTool(null)}
              className="ml-2 text-[#787b86] hover:text-white transition-colors"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Property Editor for Selected Drawings */}
      <PropertyEditor />
      </div>

      {/* Sidebar Panels */}
      {activeSidebarPanel && (
        <div className="fixed top-40 bottom-0 left-16 w-[576px] bg-[#0a0a0a] border-r border-[#1a1a1a] shadow-2xl z-40 transform transition-transform duration-300 ease-out">
          {/* Panel Header */}
          <div className="h-12 border-b border-[#1a1a1a] flex items-center justify-between px-4">
            <h3 className="text-white font-medium capitalize">{activeSidebarPanel}</h3>
            <button 
              onClick={() => setActiveSidebarPanel(null)}
              className="text-white/60 hover:text-white transition-colors p-1"
            >
              <TbX size={18} />
            </button>
          </div>

          {/* Panel Content */}
          <div className="h-full overflow-y-auto">
            {activeSidebarPanel === 'watchlist' && (
              <WatchlistPanel 
                activeTab={watchlistTab} 
                setActiveTab={setWatchlistTab} 
              />
            )}
            {activeSidebarPanel === 'regimes' && (
              <RegimesPanel 
                activeTab={regimesTab} 
                setActiveTab={setRegimesTab} 
              />
            )}
            {activeSidebarPanel === 'news' && (
              <div className="p-4 text-center text-white/50">
                News section coming soon...
              </div>
            )}
            {activeSidebarPanel === 'alerts' && (
              <div className="p-4 text-center text-white/50">
                Alerts section coming soon...
              </div>
            )}
            {activeSidebarPanel === 'chat' && (
              <ChatPanel 
                activeTab={chatTab} 
                setActiveTab={setChatTab} 
              />
            )}
          </div>
        </div>
      )}
      </div>
    </>
  );
}
