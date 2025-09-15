'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
import { IndustryAnalysisService, MarketRegimeData, IndustryPerformance, TimeframeAnalysis } from '../../lib/industryAnalysisService';

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

// Drawing types for proper TypeScript support
interface DrawingPoint {
  x: number;
  y: number;
}

// Data coordinates for persistent drawings
interface DataPoint {
  candleIndex: number;
  price: number;
}

interface DrawingMetadata {
  [key: string]: unknown;
}

// Specific metadata interfaces for different drawing types
interface WaveDrawingMetadata extends DrawingMetadata {
  waveLabels: string[];
}

interface MeasureDrawingMetadata extends DrawingMetadata {
  distance: number;
  angle: number;
  priceDistance: number;
}

interface PolygonDataItem {
  c: number;
  h: number;
  l: number;
  o: number;
  t: number;
  v: number;
  vw: number;
  n: number;
}

// TradingView-style Chart Configuration
interface ChartConfig {
  symbol: string;
  timeframe: string;
  chartType: 'candlestick' | 'line';
  theme: 'dark' | 'light';
  indicators: string[];
  drawings: Drawing[];
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

// Drawing Interface with TradingView-style time+price coordinates
interface Drawing {
  id: string | number;
  type: string;
  startPoint?: DrawingPoint;
  endPoint?: DrawingPoint;
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
  text?: string;
  style?: DrawingStyle;
  points?: DrawingPoint[];
  timestamp?: number;
  metadata?: DrawingMetadata;
  // TradingView-style time+price coordinates for persistent anchoring
  time?: number;        // Single timestamp for horizontal/vertical lines
  price?: number;       // Single price for horizontal/vertical lines
  time1?: number;       // Start timestamp for two-point drawings
  price1?: number;      // Start price for two-point drawings
  time2?: number;       // End timestamp for two-point drawings
  price2?: number;      // End price for two-point drawings
  // Legacy data coordinate fields for backward compatibility
  startDataPoint?: DataPoint;
  endDataPoint?: DataPoint;
  dataPoints?: DataPoint[];
}

// TradingView Professional Timeframes with extensive historical data
const TRADINGVIEW_TIMEFRAMES = [
  { label: '1m', value: '1m', lookback: 7 }, // 7 days for 1-minute data
  { label: '5m', value: '5m', lookback: 30 }, // 30 days for 5-minute data
  { label: '15m', value: '15m', lookback: 90 }, // 90 days for 15-minute data  
  { label: '30m', value: '30m', lookback: 180 }, // 180 days for 30-minute data
  { label: '1H', value: '1h', lookback: 365 }, // 1 year for hourly data
  { label: '4H', value: '4h', lookback: 1095 }, // 3 years for 4-hour data
  { label: '1D', value: '1d', lookback: 5475 }, // 15 years for daily data (like TradingView Pro)
  { label: '1W', value: '1w', lookback: 7300 }, // 20 years for weekly data
  { label: '1M', value: '1mo', lookback: 10950 }, // 30 years for monthly data
  { label: '1M', value: '1mo', lookback: 3650 } // 10 years for monthly data
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
  { label: 'SMA 20', value: 'sma20', category: 'trend' },
  { label: 'SMA 50', value: 'sma50', category: 'trend' },
  { label: 'EMA 12', value: 'ema12', category: 'trend' },
  { label: 'EMA 26', value: 'ema26', category: 'trend' },
  { label: 'RSI', value: 'rsi', category: 'momentum' },
  { label: 'MACD', value: 'macd', category: 'momentum' },
  { label: 'Bollinger Bands', value: 'bollinger', category: 'volatility' },
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
  
  // Dropdown button refs for positioning
  const indicatorsButtonRef = useRef<HTMLButtonElement>(null);
  const timeframeButtonRef = useRef<HTMLButtonElement>(null);
  const toolsButtonRef = useRef<HTMLButtonElement>(null);
  const lineToolsButtonRef = useRef<HTMLButtonElement>(null);
  const fibButtonRef = useRef<HTMLButtonElement>(null);
  const shapesButtonRef = useRef<HTMLButtonElement>(null);
  const gannButtonRef = useRef<HTMLButtonElement>(null);
  const elliottButtonRef = useRef<HTMLButtonElement>(null);
  const predictionButtonRef = useRef<HTMLButtonElement>(null);
  const measureButtonRef = useRef<HTMLButtonElement>(null);
  const notesButtonRef = useRef<HTMLButtonElement>(null);
  const volumeButtonRef = useRef<HTMLButtonElement>(null);
  const patternsButtonRef = useRef<HTMLButtonElement>(null);
  const harmonicButtonRef = useRef<HTMLButtonElement>(null);
  const cyclesButtonRef = useRef<HTMLButtonElement>(null);
  const ordersButtonRef = useRef<HTMLButtonElement>(null);

  // Dynamic refs storage for drawing tool categories
  const drawingToolRefs = useRef<{[key: string]: React.RefObject<HTMLButtonElement | null>}>({
    linetools: lineToolsButtonRef,
    fibtools: fibButtonRef,
    shapes: shapesButtonRef,
    gann: gannButtonRef,
    elliott: elliottButtonRef,
    prediction: predictionButtonRef,
    measure: measureButtonRef,
    notes: notesButtonRef,
    volume: volumeButtonRef,
    patterns: patternsButtonRef,
    harmonic: harmonicButtonRef,
    cycles: cyclesButtonRef,
    orders: ordersButtonRef
  });

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
        body: '#00ff00',      // Pure green for bullish body
        wick: '#00ff00',      // Pure green for bullish wick  
        border: '#00ff00'     // Pure green for bullish border
      },
      bearish: {
        body: '#ff0000',      // Pure red for bearish body
        wick: '#ff0000',      // Pure red for bearish wick
        border: '#ff0000'     // Pure red for bearish border
      },
      volume: {
        bullish: '#00ffff80', // Cyan/teal for bullish volume (semi-transparent)
        bearish: '#ff000080'  // Red for bearish volume (semi-transparent)
      }
    }
  });

  // Settings panel state
  const [showSettings, setShowSettings] = useState(false);
  const [showTimeframeDropdown, setShowTimeframeDropdown] = useState(false);
  const [showIndicatorsDropdown, setShowIndicatorsDropdown] = useState(false);
  
  // Dropdown positioning state
  const [dropdownPositions, setDropdownPositions] = useState({
    indicators: { x: 0, y: 0, width: 0 },
    timeframe: { x: 0, y: 0, width: 0 },
    tools: { x: 0, y: 0, width: 0 },
    lineTools: { x: 0, y: 0, width: 0 },
    fib: { x: 0, y: 0, width: 0 },
    shapes: { x: 0, y: 0, width: 0 },
    gann: { x: 0, y: 0, width: 0 },
    elliott: { x: 0, y: 0, width: 0 },
    prediction: { x: 0, y: 0, width: 0 },
    measure: { x: 0, y: 0, width: 0 },
    notes: { x: 0, y: 0, width: 0 },
    volume: { x: 0, y: 0, width: 0 },
    patterns: { x: 0, y: 0, width: 0 },
    harmonic: { x: 0, y: 0, width: 0 },
    cycles: { x: 0, y: 0, width: 0 },
    orders: { x: 0, y: 0, width: 0 }
  });

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);

  // Favorites drawing tools state - Default classic tools
  const [favoriteDrawingTools, setFavoriteDrawingTools] = useState<string[]>([
    'fib_retracement',      // Classic Fibonacci Retracement
    'ray',                  // Horizontal Ray
    'vertical_line',        // Vertical Line
    'trend_line',          // Trend Line
    'elliott_correction',   // Elliott Wave ABC
    'elliott_impulse',      // Elliott Wave 12345
    'date_price_range',     // Measure Price Range
    'text'                 // Text Note
  ]);

  // Professional crosshair information state
  const [crosshairInfo, setCrosshairInfo] = useState<{
    price: string;
    date: string;
    time: string;
    visible: boolean;
    volume?: number;
  }>({
    price: '',
    date: '',
    time: '',
    visible: false,
    volume: 0
  });

  // Sidebar panel state
  const [activeSidebarPanel, setActiveSidebarPanel] = useState<string | null>(null);
  const [watchlistTab, setWatchlistTab] = useState('Markets');
  const [regimesTab, setRegimesTab] = useState('Life');
  const [chatTab, setChatTab] = useState('admin');

  // Market Regime Analysis state with caching and progress tracking
  const [marketRegimeData, setMarketRegimeData] = useState<MarketRegimeData | null>(null);
  const [isLoadingRegimes, setIsLoadingRegimes] = useState(false);
  const [regimeDataCache, setRegimeDataCache] = useState<{ [key: string]: MarketRegimeData }>({});
  const [lastRegimeUpdate, setLastRegimeUpdate] = useState<number>(0);
  const [regimeUpdateProgress, setRegimeUpdateProgress] = useState<number>(0);
  const [regimeLoadingStage, setRegimeLoadingStage] = useState<string>('');
  const [selectedIndustry, setSelectedIndustry] = useState<IndustryPerformance | null>(null);

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
      const processedData: {[symbol: string]: {
        price: number;
        change1d: number;
        change5d: number;
        change13d: number;
        change21d: number;
        performance: string;
        performanceColor: string;
      }} = {};

      try {
        console.log('🔄 Fetching watchlist data for symbols:', symbols);
        
        // For each symbol, fetch historical data and calculate metrics
        for (const symbol of symbols) {
          try {
            console.log(`📊 Fetching data for ${symbol}...`);
            
            // Get recent historical data (expand to 90 days to ensure we get 21 trading days)
            const endDate = new Date().toISOString().split('T')[0];
            const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            
            const response = await fetch(`/api/historical-data?symbol=${symbol}&startDate=${startDate}&endDate=${endDate}`);
            
            if (response.ok) {
              const result = await response.json();
              
              // Use original 21 trading days requirement
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
          console.warn('❌ No watchlist data processed - using fallback data');
          // Provide fallback data to prevent empty loading states
          const fallbackData = {
            'SPY': { price: 560.00, change1d: 0.5, change5d: 1.2, change13d: 2.1, change21d: 3.5, performance: 'Benchmark', performanceColor: 'text-blue-300' },
            'QQQ': { price: 485.00, change1d: 0.8, change5d: 2.1, change13d: 3.2, change21d: 4.8, performance: 'Leader', performanceColor: 'text-green-400' },
            'IWM': { price: 225.00, change1d: -0.2, change5d: 0.5, change13d: 1.8, change21d: 2.9, performance: 'Strong', performanceColor: 'text-green-400' }
          };
          setWatchlistData(fallbackData);
        }

      } catch (error) {
        console.error('❌ Error in market data fetching:', error);
        // Provide fallback data in case of complete failure
        const fallbackData = {
          'SPY': { price: 560.00, change1d: 0.5, change5d: 1.2, change13d: 2.1, change21d: 3.5, performance: 'Benchmark', performanceColor: 'text-blue-300' },
          'QQQ': { price: 485.00, change1d: 0.8, change5d: 2.1, change13d: 3.2, change21d: 4.8, performance: 'Leader', performanceColor: 'text-green-400' },
          'IWM': { price: 225.00, change1d: -0.2, change5d: 0.5, change13d: 1.8, change21d: 2.9, performance: 'Strong', performanceColor: 'text-green-400' }
        };
        setWatchlistData(fallbackData);
      }
    };

    // Initial fetch
    fetchRealMarketData();
    
    // Set up interval for regular updates
    const interval = setInterval(fetchRealMarketData, 30000); // Update every 30 seconds
    
    return () => clearInterval(interval);
  }, []); // Empty dependency array to run only once

  // Enhanced Market Regime Data Loading with immediate start and streaming results
  useEffect(() => {
    const loadMarketRegimeData = async () => {
      // Start loading immediately on component mount, not waiting for panel click
      if (!isLoadingRegimes && !marketRegimeData) {
        const cacheKey = new Date().toDateString(); // Cache by day
        const now = Date.now();
        
        // Check if we have recent cached data (within 15 minutes)
        if (regimeDataCache[cacheKey] && (now - lastRegimeUpdate) < 15 * 60 * 1000) {
          setMarketRegimeData(regimeDataCache[cacheKey]);
          return;
        }

        setIsLoadingRegimes(true);
        setRegimeUpdateProgress(0);
        setRegimeLoadingStage('Starting immediate analysis...');
        
        try {
          console.log('� Auto-starting Market Regime Analysis on component mount...');
          
          // Create a progress tracker
          const progressCallback = (stage: string, progress: number) => {
            setRegimeLoadingStage(stage);
            setRegimeUpdateProgress(progress);
          };

          // Create a streaming callback to update results as they come in
          const streamCallback = (timeframe: string, data: TimeframeAnalysis) => {
            console.log(`📊 Streaming ${timeframe} timeframe results...`);
            setMarketRegimeData(prev => ({
              ...prev,
              [timeframe.toLowerCase()]: data
            } as MarketRegimeData));
          };

          const regimeData = await IndustryAnalysisService.getMarketRegimeDataStreaming(progressCallback, streamCallback);
          
          // Cache the complete data
          setRegimeDataCache(prev => ({
            ...prev,
            [cacheKey]: regimeData
          }));
          
          setMarketRegimeData(regimeData);
          setLastRegimeUpdate(now);
          console.log('✅ Market Regime Analysis Auto-loaded and Cached');
        } catch (error) {
          console.error('❌ Error loading market regime data:', error);
          setRegimeLoadingStage('Error loading data');
        } finally {
          setIsLoadingRegimes(false);
          setRegimeUpdateProgress(100);
          setTimeout(() => {
            setRegimeLoadingStage('');
            setRegimeUpdateProgress(0);
          }, 1000);
        }
      }
    };

    // Start market regime loading immediately
    console.log('🔄 Starting immediate market regime analysis...');
    loadMarketRegimeData();
  }, []); // Empty dependency array to run only once on mount

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
  const drawingsRef = useRef<Drawing[]>([]);
  const [drawings, setDrawingsState] = useState<Drawing[]>([]);
  
  // Custom setDrawings that updates both ref and state
  const setDrawings = useCallback((updater: Drawing[] | ((prev: Drawing[]) => Drawing[])) => {
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
  const [dragStartPosition, setDragStartPosition] = useState<{ x: number; y: number } | null>(null);
  const [originalDrawing, setOriginalDrawing] = useState<any | null>(null); // Store original drawing state before dragging
  const [dragPreviewOffset, setDragPreviewOffset] = useState<{ x: number; y: number } | null>(null); // Preview offset during drag
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

  // Data state - SIMPLE
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
      console.log(`🔴 LIVE: Fetching real-time price for ${sym}`);
      
      // Use the dedicated real-time price endpoint
      const response = await fetch(`/api/realtime-price?symbol=${sym}&_t=${Date.now()}`);
      const result = await response.json();
      
      if (response.ok && result.price) {
        console.log(`💰 LIVE PRICE: ${sym} = $${result.price} (${result.source}: ${result.date})`);
        setCurrentPrice(result.price);
        
        // For price change calculation, use current dates - NOT HARDCODED
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        
        const histResponse = await fetch(`/api/historical-data?symbol=${sym}&startDate=${yesterdayStr}&endDate=${todayStr}&timeframe=1d&_t=${Date.now()}`);
        if (histResponse.ok) {
          const histResult = await histResponse.json();
          if (histResult?.results && histResult.results.length >= 2) {
            const current = result.price;
            const previous = histResult.results[histResult.results.length - 2]?.c || current;
            const change = current - previous;
            const changePercent = ((change) / previous) * 100;
            setPriceChange(change);
            setPriceChangePercent(changePercent);
            console.log(`📈 CHANGE: ${sym} ${change >= 0 ? '+' : ''}${change.toFixed(2)} (${changePercent.toFixed(2)}%)`);
          }
        }
      } else {
        console.error(`❌ Failed to get real-time price for ${sym}:`, result);
      }
    } catch (error) {
      console.log('Real-time price fetch failed:', error);
    }
  }, []);

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

  // High-performance bulk data fetch with parallel requests
  const fetchData = useCallback(async (sym: string, timeframe: string) => {
    setLoading(true);
    setError(null);
    
    try {
      // Professional-grade date range calculation like TradingView/Bloomberg
      const now = new Date();
      const endDate = now.toISOString().split('T')[0];
      let startDate: string;
      let daysBack: number;
      
      // Professional timeframe ranges that match industry standards
      switch (timeframe) {
        case '1m':
          daysBack = 7; // 7 days of 1-minute data (max for most APIs)
          break;
        case '5m':
          daysBack = 30; // 30 days of 5-minute data
          break;
        case '15m':
          daysBack = 90; // 3 months of 15-minute data
          break;
        case '30m':
          daysBack = 180; // 6 months of 30-minute data
          break;
        case '1h':
          daysBack = 365; // 1 year of hourly data
          break;
        case '4h':
          daysBack = 1095; // 3 years of 4-hour data
          break;
        case '1d':
          daysBack = 5475; // 15 years of daily data (TradingView Pro level)
          break;
        case '1w':
          daysBack = 7300; // 20 years of weekly data
          break;
        case '1mo':
          daysBack = 10950; // 30 years of monthly data
          break;
        default:
          daysBack = 365; // Default to 1 year
      }
      
      startDate = new Date(now.getTime() - (daysBack * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];
      
      console.log(`📊 PROFESSIONAL FETCH: ${sym} ${timeframe} from ${startDate} to ${endDate} (${daysBack} days)`);
      
      // High-performance parallel requests with aggressive caching
      const [historicalResponse] = await Promise.allSettled([
        fetch(`/api/historical-data?symbol=${sym}&startDate=${startDate}&endDate=${endDate}&timeframe=${timeframe}&cache=aggressive&_t=${Date.now()}`)
      ]);
      
      // Fetch real-time price separately for immediate feedback
      fetchRealTimePrice(sym).catch(() => {}); // Non-blocking
      
      if (historicalResponse.status === 'rejected' || !historicalResponse.value?.ok) {
        const errorStatus = historicalResponse.status === 'rejected' ? 'Network error' : historicalResponse.value?.status;
        console.error(`❌ Failed to fetch ${timeframe} data for ${sym}:`, errorStatus);
        throw new Error(`Failed to fetch historical data: ${errorStatus}`);
      }
      
      // ULTRA-FAST JSON PARSING optimized for large datasets
      const result = await historicalResponse.value.json();
      
      if (result && result.results && Array.isArray(result.results)) {
        console.log(`📈 Processing ${result.results.length} data points for ${sym} ${timeframe}`);
        
        // HIGH-PERFORMANCE BULK TRANSFORM - optimized for large datasets (up to 15 years of data)
        const rawData = result.results;
        const dataLength = rawData.length;
        
        // Pre-allocate arrays for maximum performance
        const transformedData = new Array(dataLength);
        const prices = new Float32Array(dataLength * 2);
        let priceIndex = 0;
        
        // Single-pass processing for maximum efficiency
        for (let i = 0; i < dataLength; i++) {
          const item = rawData[i];
          
          // Transform data
          transformedData[i] = {
            timestamp: item.t,
            open: item.o,
            high: item.h,
            low: item.l,
            close: item.c,
            volume: item.v || 0,
            date: new Date(item.t).toISOString().split('T')[0],
            time: new Date(item.t).toLocaleTimeString('en-US', { 
              hour: '2-digit', 
              minute: '2-digit', 
              hour12: false 
            })
          };
          
          // Collect price data for range calculation
          prices[priceIndex++] = item.h;
          prices[priceIndex++] = item.l;
        }
        
        // PROFESSIONAL CHART SETUP - like TradingView
        if (dataLength > 0) {
          const minPrice = Math.min(...prices);
          const maxPrice = Math.max(...prices);
          const padding = (maxPrice - minPrice) * 0.05; // Smaller padding for professional look
          
          // Intelligent visible candle count based on timeframe
          let visibleCandles: number;
          switch (timeframe) {
            case '1m':
            case '5m':
              visibleCandles = Math.min(200, dataLength); // Show more for intraday
              break;
            case '15m':
            case '30m':
              visibleCandles = Math.min(300, dataLength);
              break;
            case '1h':
            case '4h':
              visibleCandles = Math.min(500, dataLength);
              break;
            case '1d':
              visibleCandles = Math.min(1000, dataLength); // Show many years
              break;
            case '1w':
            case '1mo':
              visibleCandles = Math.min(2000, dataLength); // Show decades
              break;
            default:
              visibleCandles = Math.min(300, dataLength);
          }
          
          const scrollOffset = Math.max(0, dataLength - visibleCandles);
          
          // ATOMIC STATE UPDATE - all at once for best performance
          setData(transformedData);
          setPriceRange({ min: minPrice - padding, max: maxPrice + padding });
          setScrollOffset(scrollOffset);
          setVisibleCandleCount(visibleCandles);
          
          // Update current price from historical data (real-time fetched separately)
          const latest = transformedData[dataLength - 1];
          setCurrentPrice(latest.close);
        } else {
          console.warn(`⚠️ No data returned for ${symbol} ${timeframe}`);
          setData([]);
          setError(`No historical data available for ${symbol} in the ${timeframe} timeframe. This may be due to market holidays, weekends, or symbol trading status.`);
        }
      } else {
        throw new Error('Invalid data format - missing results array');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch data';
      console.error(`❌ Error fetching data for ${symbol} ${timeframe}:`, errorMessage);
      
      // INTELLIGENT ERROR HANDLING - provide helpful suggestions
      if (errorMessage.includes('404')) {
        setError(`Symbol ${symbol} not found. Please verify the ticker symbol.`);
      } else if (errorMessage.includes('rate limit')) {
        setError(`Rate limit exceeded. Please wait a moment and try again.`);
      } else if (errorMessage.includes('network')) {
        setError(`Network error. Please check your connection and try again.`);
      } else {
        setError(`Unable to load ${timeframe} data for ${symbol}: ${errorMessage}`);
      }
      
      setData([]);
    } finally {
      setLoading(false);
      
      // PERFORMANCE METRICS for optimization
      console.log(`⏱️ Data load completed for ${symbol} ${config.timeframe}`);
    }
  }, [symbol, config.timeframe, setError, setLoading, setData, setPriceRange, setScrollOffset, setVisibleCandleCount, setCurrentPrice]);

  // ENHANCED DATA FETCHING WITH PROFESSIONAL CACHING
  useEffect(() => {
    if (!symbol || !config.timeframe) return;
    
    console.log(`🔄 Fetching data for ${symbol} ${config.timeframe}`);
    fetchData(symbol, config.timeframe);
  }, [symbol, config.timeframe, fetchData]);

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

  // Initialize chart - SIMPLE
  useEffect(() => {
    fetchData(symbol, config.timeframe);
  }, [symbol, config.timeframe, fetchData]);

  // Fetch current price independently when symbol changes
  useEffect(() => {
    fetchRealTimePrice(symbol);
  }, [symbol, fetchRealTimePrice]);

  // Set up REAL-TIME price updates every 5 seconds for live data
  useEffect(() => {
    const interval = setInterval(() => {
      console.log(`🔄 REAL-TIME refresh for ${symbol}...`);
      fetchRealTimePrice(symbol);
    }, 5000); // Update every 5 seconds for REAL-TIME

    return () => clearInterval(interval);
  }, [symbol, fetchRealTimePrice]);

  // Initialize scroll position with FULL DATA - EFFICIENT RENDERING
  useEffect(() => {
    if (data.length > 0) {
      const defaultVisible = Math.min(500, data.length); // SHOW UP TO 500 CANDLES
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
      if (showLineToolsDropdown && !target.closest('.linetools-dropdown') && !target.closest('.star-favorite-btn')) {
        setShowLineToolsDropdown(false);
      }
      if (showFibDropdown && !target.closest('.fibtools-dropdown') && !target.closest('.star-favorite-btn')) {
        setShowFibDropdown(false);
      }
      if (showShapesDropdown && !target.closest('.shapes-dropdown') && !target.closest('.star-favorite-btn')) {
        setShowShapesDropdown(false);
      }
      if (showGannDropdown && !target.closest('.gann-dropdown') && !target.closest('.star-favorite-btn')) {
        setShowGannDropdown(false);
      }
      if (showElliottDropdown && !target.closest('.elliott-dropdown') && !target.closest('.star-favorite-btn')) {
        setShowElliottDropdown(false);
      }
      if (showPredictionDropdown && !target.closest('.prediction-dropdown') && !target.closest('.star-favorite-btn')) {
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

      // PROFESSIONAL CROSSHAIR LABELS - Display price and date/time on axes
      if (crosshairInfo.visible) {
        // CRISP HIGH-QUALITY TEXT RENDERING
        ctx.font = 'bold 14px "Segoe UI", system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Y-AXIS PRICE LABEL (right side)
        const priceText = crosshairInfo.price;
        const priceTextWidth = ctx.measureText(priceText).width + 20;
        const priceY = crosshairPosition.y;
        
        // Price label background (right side of chart) - darker for contrast
        ctx.fillStyle = config.theme === 'dark' ? '#1a202c' : '#2d3748';
        ctx.strokeStyle = config.theme === 'dark' ? '#2d3748' : '#4a5568';
        ctx.lineWidth = 1;
        ctx.fillRect(width - priceTextWidth - 5, priceY - 14, priceTextWidth, 28);
        ctx.strokeRect(width - priceTextWidth - 5, priceY - 14, priceTextWidth, 28);
        
        // CRISP WHITE PRICE TEXT with shadow for clarity
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx.shadowBlur = 2;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.fillText(priceText, width - priceTextWidth/2 - 5, priceY);
        
        // Reset shadow
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        // X-AXIS DATE/TIME LABEL (bottom)
        const dateText = crosshairInfo.date + (crosshairInfo.time ? ` ${crosshairInfo.time}` : '');
        const dateTextWidth = ctx.measureText(dateText).width + 20;
        const dateX = crosshairPosition.x;
        
        // Ensure date label doesn't go off screen
        const labelX = Math.max(dateTextWidth/2, Math.min(width - dateTextWidth/2, dateX));
        
        // Date label background (bottom of chart) - darker for contrast
        ctx.fillStyle = config.theme === 'dark' ? '#1a202c' : '#2d3748';
        ctx.strokeStyle = config.theme === 'dark' ? '#2d3748' : '#4a5568';
        ctx.lineWidth = 1;
        ctx.fillRect(labelX - dateTextWidth/2, height - 37, dateTextWidth, 28);
        ctx.strokeRect(labelX - dateTextWidth/2, height - 37, dateTextWidth, 28);
        
        // CRISP WHITE DATE TEXT with shadow for clarity
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx.shadowBlur = 2;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.fillText(dateText, labelX, height - 23);
        
        // Reset shadow
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
      }
    }
  }, [dimensions, config.crosshair, config.theme, crosshairPosition, crosshairInfo]);

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
          // Pan right (go forward in time) - allow extending beyond data for future view
          const panRight = Math.max(1, Math.round(visibleCandleCount * 0.1));
          const futurePeriods = getFuturePeriods(config.timeframe);
          const maxFuturePeriods = Math.min(futurePeriods, Math.ceil(visibleCandleCount * 0.2));
          const maxScrollOffset = data.length - visibleCandleCount + maxFuturePeriods;
          setScrollOffset(Math.min(maxScrollOffset, scrollOffset + panRight));
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [data.length, scrollOffset, visibleCandleCount]);

  // Wheel event handler for zoom and scroll - with proper passive handling
  useEffect(() => {
    const handleWheelEvent = (e: WheelEvent) => {
      // Check if the event is on our canvas elements
      const overlayCanvas = overlayCanvasRef.current;
      const chartCanvas = chartCanvasRef.current;
      
      if (!overlayCanvas || !chartCanvas || data.length === 0) return;
      
      // Check if the wheel event is over one of our canvas elements
      const target = e.target as Element;
      if (!overlayCanvas.contains(target) && !chartCanvas.contains(target) && target !== overlayCanvas && target !== chartCanvas) {
        return;
      }
      
      e.preventDefault();
      
      // Determine scroll direction and amount
      const delta = e.deltaY;
      const scrollSensitivity = 3; // Candles to scroll per wheel tick
      
      if (Math.abs(delta) > Math.abs(e.deltaX)) {
        // Vertical scroll - zoom in/out
        const zoomDirection = delta > 0 ? 1 : -1; // 1 = zoom out, -1 = zoom in
        const zoomFactor = 0.1;
        
        // Calculate new candle count
        const currentCount = visibleCandleCount;
        const maxCandles = Math.min(data.length, 300);
        const minCandles = 20;
        
        let newCount;
        if (zoomDirection === 1) {
          // Zoom out - show more candles
          newCount = Math.min(maxCandles, Math.round(currentCount * (1 + zoomFactor)));
        } else {
          // Zoom in - show fewer candles
          newCount = Math.max(minCandles, Math.round(currentCount * (1 - zoomFactor)));
        }
        
        // Adjust scroll offset to keep the center of the view relatively stable
        const centerRatio = 0.5;
        const oldCenterIndex = scrollOffset + (currentCount * centerRatio);
        const futurePeriods = getFuturePeriods(config.timeframe);
        const maxFuturePeriods = Math.min(futurePeriods, Math.ceil(newCount * 0.2));
        const newOffset = Math.max(0, Math.min(
          data.length - newCount + maxFuturePeriods,
          Math.round(oldCenterIndex - (newCount * centerRatio))
        ));
        
        setVisibleCandleCount(newCount);
        setScrollOffset(newOffset);
      } else {
        // Horizontal scroll - pan left/right - allow extending beyond data for future view
        const scrollDirection = delta > 0 ? 1 : -1;
        const futurePeriods = getFuturePeriods(config.timeframe);
        const maxFuturePeriods = Math.min(futurePeriods, Math.ceil(visibleCandleCount * 0.2));
        const maxScrollOffset = data.length - visibleCandleCount + maxFuturePeriods;
        const newOffset = Math.max(0, Math.min(
          maxScrollOffset,
          scrollOffset + (scrollDirection * scrollSensitivity)
        ));
        setScrollOffset(newOffset);
      }
    };

    // Add wheel event listener with passive: false to allow preventDefault
    const overlayCanvas = overlayCanvasRef.current;
    const chartCanvas = chartCanvasRef.current;
    
    if (overlayCanvas) {
      overlayCanvas.addEventListener('wheel', handleWheelEvent, { passive: false });
    }
    if (chartCanvas) {
      chartCanvas.addEventListener('wheel', handleWheelEvent, { passive: false });
    }
    
    return () => {
      if (overlayCanvas) {
        overlayCanvas.removeEventListener('wheel', handleWheelEvent);
      }
      if (chartCanvas) {
        chartCanvas.removeEventListener('wheel', handleWheelEvent);
      }
    };
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
    chartWidth: number,
    visibleCandleCount: number
  ) => {
    // Only show market hours shading for intraday timeframes
    if (!config.timeframe.includes('m') && !config.timeframe.includes('h')) {
      return; // Skip for daily and longer timeframes
    }

    const candleSpacing = chartWidth / visibleCandleCount;
    
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

    // Calculate chart areas - reserve space for volume, indicators, and time axis
    const timeAxisHeight = 30;
    const oscillatorIndicators = config.indicators.filter(ind => ['rsi', 'macd', 'stoch'].includes(ind));
    const indicatorPanelHeight = oscillatorIndicators.length > 0 ? 120 * oscillatorIndicators.length : 0;
    
    const priceChartHeight = height - volumeAreaHeight - indicatorPanelHeight - timeAxisHeight;
    const volumeStartY = priceChartHeight;
    const volumeEndY = priceChartHeight + volumeAreaHeight;
    const indicatorStartY = volumeEndY;
    const indicatorEndY = indicatorStartY + indicatorPanelHeight;

    // Draw grid first for price chart area (only if enabled)
    if (config.showGrid) {
      drawGrid(ctx, width, priceChartHeight);
    }

    // Calculate visible data range using scrollOffset and visibleCandleCount
    const startIndex = Math.max(0, Math.floor(scrollOffset));
    const endIndex = Math.min(data.length, startIndex + visibleCandleCount);
    const visibleData = data.slice(startIndex, endIndex);
    
    if (visibleData.length === 0) return;

    // Debug logging
    console.log('Scroll Debug:', {
      scrollOffset,
      startIndex,
      endIndex,
      dataLength: data.length,
      visibleCandleCount,
      visibleDataLength: visibleData.length,
      beyondData: (startIndex + visibleCandleCount) > data.length
    });

    // Calculate chart dimensions - only extend when scrolled near the end
    const chartWidth = width - 120; // Leave more space for price scale to prevent overlap
    
    // Check if we're showing future area (scrolled beyond data)
    const actualDataEnd = startIndex + visibleData.length;
    const requestedEnd = startIndex + visibleCandleCount;
    const showingFutureArea = requestedEnd > data.length;
    
    let totalPeriods = visibleCandleCount; // Always use full visible candle count for consistent spacing
    let limitedFuturePeriods = 0;
    
    if (showingFutureArea) {
      // We're in the future area, calculate how much
      limitedFuturePeriods = requestedEnd - data.length;
      console.log('Future area detected:', {
        requestedEnd,
        dataLength: data.length,
        futurePeriodsShown: limitedFuturePeriods
      });
    }
    
    // Draw market hours background shading
    drawMarketHoursBackground(ctx, width, priceChartHeight, visibleData, chartWidth, visibleCandleCount);

    // Calculate price range for visible data
    const prices = visibleData.flatMap(d => [d.high, d.low]);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const padding = (maxPrice - minPrice) * 0.1;
    const adjustedMin = minPrice - padding;
    const adjustedMax = maxPrice + padding;

    console.log(`💰 Price range: $${adjustedMin.toFixed(2)} - $${adjustedMax.toFixed(2)}`);

    // Draw chart in price chart area - use consistent spacing regardless of future area
    const candleWidth = Math.max(2, chartWidth / visibleCandleCount * 0.8);
    const candleSpacing = chartWidth / visibleCandleCount;

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
    drawTimeAxis(ctx, width, height, visibleData, chartWidth, visibleCandleCount, scrollOffset, data);

    // Draw indicators if enabled
    if (config.indicators && config.indicators.length > 0) {
      console.log(`🔍 Drawing ${config.indicators.length} indicators:`, config.indicators);
      drawIndicators(ctx, visibleData, chartWidth, priceChartHeight, adjustedMin, adjustedMax, candleSpacing, indicatorStartY, indicatorEndY, oscillatorIndicators);
    } else {
      console.log(`🔍 No indicators to draw. config.indicators:`, config.indicators);
    }

    // Draw stored drawings on top of everything
    drawStoredDrawings(ctx);

    console.log(`✅ Integrated chart rendered successfully with ${config.theme} theme`);

  }, [data, dimensions, chartHeight, config.chartType, config.theme, config.volume, config.showGrid, config.axisStyle, config.indicators, colors, scrollOffset, visibleCandleCount, volumeAreaHeight, drawings]);

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

  // Helper function to calculate future periods for 4 weeks
  const getFuturePeriods = (timeframe: string): number => {
    switch (timeframe) {
      case '1m': return 4 * 7 * 24 * 60; // 4 weeks * 7 days * 24 hours * 60 minutes
      case '5m': return 4 * 7 * 24 * 12; // 4 weeks * 7 days * 24 hours * 12 (5-min periods per hour)
      case '15m': return 4 * 7 * 24 * 4; // 4 weeks * 7 days * 24 hours * 4 (15-min periods per hour)
      case '30m': return 4 * 7 * 24 * 2; // 4 weeks * 7 days * 24 hours * 2 (30-min periods per hour)
      case '1h': return 4 * 7 * 24; // 4 weeks * 7 days * 24 hours
      case '4h': return 4 * 7 * 6; // 4 weeks * 7 days * 6 (4-hour periods per day)
      case '1d': return 4 * 7; // 4 weeks * 7 days
      case '1w': return 4; // 4 weeks
      case '1mo': return 1; // Approximately 1 month for 4 weeks
      default: return 4 * 7; // Default to 4 weeks in days
    }
  };

  // Technical Indicator Calculations
  const calculateRSI = (data: ChartDataPoint[], period = 14): number[] => {
    if (data.length < period + 1) return [];
    
    const rsi: number[] = [];
    const gains: number[] = [];
    const losses: number[] = [];
    
    for (let i = 1; i < data.length; i++) {
      const change = data[i].close - data[i - 1].close;
      gains.push(change > 0 ? change : 0);
      losses.push(change < 0 ? Math.abs(change) : 0);
    }
    
    for (let i = period - 1; i < gains.length; i++) {
      const avgGain = gains.slice(i - period + 1, i + 1).reduce((a, b) => a + b) / period;
      const avgLoss = losses.slice(i - period + 1, i + 1).reduce((a, b) => a + b) / period;
      
      if (avgLoss === 0) {
        rsi.push(100);
      } else {
        const rs = avgGain / avgLoss;
        rsi.push(100 - (100 / (1 + rs)));
      }
    }
    
    return rsi;
  };

  const calculateSMA = (data: ChartDataPoint[], period: number): number[] => {
    const sma: number[] = [];
    for (let i = period - 1; i < data.length; i++) {
      const sum = data.slice(i - period + 1, i + 1).reduce((acc, candle) => acc + candle.close, 0);
      sma.push(sum / period);
    }
    return sma;
  };

  const calculateEMA = (data: ChartDataPoint[], period: number): number[] => {
    const ema: number[] = [];
    const multiplier = 2 / (period + 1);
    
    // Start with SMA for first value
    const firstSMA = data.slice(0, period).reduce((acc, candle) => acc + candle.close, 0) / period;
    ema.push(firstSMA);
    
    for (let i = period; i < data.length; i++) {
      const currentEMA: number = (data[i].close * multiplier) + (ema[ema.length - 1] * (1 - multiplier));
      ema.push(currentEMA);
    }
    
    return ema;
  };

  const calculateMACD = (data: ChartDataPoint[]): { macdLine: number[], signalLine: number[] } => {
    const ema12 = calculateEMA(data, 12);
    const ema26 = calculateEMA(data, 26);
    
    const macdLine: number[] = [];
    const startIndex = Math.max(0, ema26.length - ema12.length);
    
    for (let i = startIndex; i < ema12.length; i++) {
      macdLine.push(ema12[i] - ema26[i - startIndex]);
    }
    
    // Signal line (9-period EMA of MACD)
    const signalLine = calculateEMA(macdLine.map((value, index) => ({ close: value })) as ChartDataPoint[], 9);
    
    return { macdLine, signalLine };
  };

  const calculateBollingerBands = (data: ChartDataPoint[], period = 20, stdDev = 2): Array<{upper: number, middle: number, lower: number}> => {
    const sma = calculateSMA(data, period);
    const bands: Array<{upper: number, middle: number, lower: number}> = [];
    
    for (let i = period - 1; i < data.length; i++) {
      const slice = data.slice(i - period + 1, i + 1);
      const mean = sma[i - period + 1];
      const variance = slice.reduce((acc, candle) => acc + Math.pow(candle.close - mean, 2), 0) / period;
      const standardDeviation = Math.sqrt(variance);
      
      bands.push({
        upper: mean + (standardDeviation * stdDev),
        middle: mean,
        lower: mean - (standardDeviation * stdDev)
      });
    }
    
    return bands;
  };

  // Draw indicators on the chart
  const drawIndicators = (
    ctx: CanvasRenderingContext2D,
    visibleData: ChartDataPoint[],
    chartWidth: number,
    chartHeight: number,
    minPrice: number,
    maxPrice: number,
    candleSpacing: number,
    indicatorStartY: number,
    indicatorEndY: number,
    oscillatorIndicators: string[]
  ) => {
    const padding = (maxPrice - minPrice) * 0.1;
    const adjustedMin = minPrice - padding;
    const adjustedMax = maxPrice + padding;

    console.log(`🎯 drawIndicators called with ${config.indicators.length} indicators:`, config.indicators);
    console.log(`🎯 Chart dimensions: ${chartWidth}x${chartHeight}, price range: ${adjustedMin}-${adjustedMax}`);
    console.log(`🎯 Oscillator indicators:`, oscillatorIndicators);
    console.log(`🎯 Indicator panel: Y ${indicatorStartY} to ${indicatorEndY}`);

    // Calculate panel dimensions for oscillators
    const panelHeight = oscillatorIndicators.length > 0 ? (indicatorEndY - indicatorStartY) / oscillatorIndicators.length : 0;
    let oscillatorIndex = 0;

    config.indicators.forEach(indicator => {
      console.log(`🎨 Rendering indicator: ${indicator}`);
      switch (indicator) {
        case 'sma20':
          drawSMA(ctx, visibleData, chartWidth, chartHeight, adjustedMin, adjustedMax, candleSpacing, 20, '#ffeb3b');
          break;
        case 'sma50':
          drawSMA(ctx, visibleData, chartWidth, chartHeight, adjustedMin, adjustedMax, candleSpacing, 50, '#ff9800');
          break;
        case 'ema12':
          drawEMA(ctx, visibleData, chartWidth, chartHeight, adjustedMin, adjustedMax, candleSpacing, 12, '#2196f3');
          break;
        case 'ema26':
          drawEMA(ctx, visibleData, chartWidth, chartHeight, adjustedMin, adjustedMax, candleSpacing, 26, '#9c27b0');
          break;
        case 'bollinger':
          drawBollingerBands(ctx, visibleData, chartWidth, chartHeight, adjustedMin, adjustedMax, candleSpacing);
          break;
        case 'rsi':
          const rsiPanelStart = indicatorStartY + (oscillatorIndex * panelHeight);
          const rsiPanelEnd = rsiPanelStart + panelHeight;
          drawRSI(ctx, visibleData, chartWidth, candleSpacing, rsiPanelStart, rsiPanelEnd);
          oscillatorIndex++;
          break;
        case 'macd':
          const macdPanelStart = indicatorStartY + (oscillatorIndex * panelHeight);
          const macdPanelEnd = macdPanelStart + panelHeight;
          drawMACD(ctx, visibleData, chartWidth, candleSpacing, macdPanelStart, macdPanelEnd);
          oscillatorIndex++;
          break;
        case 'stoch':
          const stochPanelStart = indicatorStartY + (oscillatorIndex * panelHeight);
          const stochPanelEnd = stochPanelStart + panelHeight;
          // drawStochastic(ctx, visibleData, chartWidth, candleSpacing, stochPanelStart, stochPanelEnd);
          oscillatorIndex++;
          break;
        default:
          console.log(`⚠️ Unknown indicator: ${indicator}`);
      }
    });
  };

  const drawSMA = (
    ctx: CanvasRenderingContext2D,
    visibleData: ChartDataPoint[],
    chartWidth: number,
    chartHeight: number,
    minPrice: number,
    maxPrice: number,
    candleSpacing: number,
    period: number,
    color: string
  ) => {
    console.log(`📈 Drawing SMA${period} with ${visibleData.length} data points, color: ${color}`);
    const sma = calculateSMA(visibleData, period);
    console.log(`📈 Calculated SMA${period}: ${sma.length} values, first few:`, sma.slice(0, 3));
    
    if (sma.length < 2) {
      console.log(`❌ Not enough SMA data: ${sma.length} values`);
      return;
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();

    const startOffset = period - 1;
    sma.forEach((value, index) => {
      const x = 40 + ((index + startOffset) * candleSpacing) + candleSpacing / 2;
      const y = chartHeight - ((value - minPrice) / (maxPrice - minPrice)) * chartHeight;
      
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    
    ctx.stroke();
    console.log(`✅ SMA${period} drawn successfully`);
  };

  const drawEMA = (
    ctx: CanvasRenderingContext2D,
    visibleData: ChartDataPoint[],
    chartWidth: number,
    chartHeight: number,
    minPrice: number,
    maxPrice: number,
    candleSpacing: number,
    period: number,
    color: string
  ) => {
    const ema = calculateEMA(visibleData, period);
    if (ema.length < 2) return;

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();

    const startOffset = period - 1;
    ema.forEach((value, index) => {
      const x = 40 + ((index + startOffset) * candleSpacing) + candleSpacing / 2;
      const y = chartHeight - ((value - minPrice) / (maxPrice - minPrice)) * chartHeight;
      
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    
    ctx.stroke();
  };

  const drawBollingerBands = (
    ctx: CanvasRenderingContext2D,
    visibleData: ChartDataPoint[],
    chartWidth: number,
    chartHeight: number,
    minPrice: number,
    maxPrice: number,
    candleSpacing: number
  ) => {
    const bands = calculateBollingerBands(visibleData);
    if (bands.length < 2) return;

    const bandColors = ['#e91e63', '#4caf50', '#e91e63']; // Upper, Middle, Lower
    const lines = ['upper', 'middle', 'lower'];

    lines.forEach((line, lineIndex) => {
      ctx.strokeStyle = bandColors[lineIndex];
      ctx.lineWidth = 1.5;
      ctx.setLineDash(line === 'middle' ? [] : [5, 5]);
      ctx.beginPath();

      bands.forEach((band, index) => {
        const value = band[line as keyof typeof band];
        const x = 40 + ((index + 19) * candleSpacing) + candleSpacing / 2;
        const y = chartHeight - ((value - minPrice) / (maxPrice - minPrice)) * chartHeight;
        
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      
      ctx.stroke();
      ctx.setLineDash([]);
    });
  };

  const drawRSI = (
    ctx: CanvasRenderingContext2D,
    visibleData: ChartDataPoint[],
    chartWidth: number,
    candleSpacing: number,
    panelStartY: number,
    panelEndY: number
  ) => {
    const rsi = calculateRSI(visibleData);
    if (rsi.length < 2) return;

    // Calculate RSI panel dimensions with proper margins
    const margin = 5;
    const rsiStartY = panelStartY + margin;
    const rsiHeight = panelEndY - panelStartY - (margin * 2);

    // Draw RSI panel background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(40, rsiStartY, chartWidth - 80, rsiHeight);

    // Draw RSI panel border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.strokeRect(40, rsiStartY, chartWidth - 80, rsiHeight);

    // RSI reference lines (30, 50, 70) with proper scaling
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    
    [30, 50, 70].forEach(level => {
      const y = rsiStartY + rsiHeight - (level / 100) * rsiHeight;
      ctx.beginPath();
      ctx.moveTo(40, y);
      ctx.lineTo(chartWidth - 40, y);
      ctx.stroke();
      
      // Draw level labels
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.fillText(level.toString(), chartWidth - 45, y + 3);
    });

    // Calculate visible data range
    const dataStartIndex = 14; // RSI needs 14 periods to calculate
    
    if (rsi.length === 0) return;

    // RSI line - start from the beginning of visible area
    ctx.strokeStyle = '#ff9800';
    ctx.lineWidth = 2;
    ctx.beginPath();

    // Map RSI values to the visible chart area
    rsi.forEach((value, index) => {
      // Calculate x position to align with the candlestick data
      // RSI index 0 corresponds to candlestick at dataStartIndex (14th candle)
      const candlestickIndex = index + dataStartIndex;
      const x = 40 + (candlestickIndex * candleSpacing) + candleSpacing / 2;
      const y = rsiStartY + rsiHeight - (value / 100) * rsiHeight;
      
      // Only draw if within chart bounds and we have valid data
      if (x >= 40 && x <= chartWidth - 40 && candlestickIndex < visibleData.length) {
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
    });
    
    ctx.stroke();

    // Draw RSI label and current value
    ctx.fillStyle = '#ff9800';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('RSI', 45, rsiStartY + 18);
    
    // Show current RSI value
    if (rsi.length > 0) {
      const currentRSI = rsi[rsi.length - 1];
      ctx.fillStyle = currentRSI > 70 ? '#f44336' : currentRSI < 30 ? '#4caf50' : '#ff9800';
      ctx.fillText(currentRSI.toFixed(1), 80, rsiStartY + 18);
    }
  };

  const drawMACD = (
    ctx: CanvasRenderingContext2D,
    visibleData: ChartDataPoint[],
    chartWidth: number,
    candleSpacing: number,
    panelStartY: number,
    panelEndY: number
  ) => {
    const { macdLine, signalLine } = calculateMACD(visibleData);
    if (macdLine.length < 2) return;

    // Calculate MACD panel dimensions with proper margins
    const margin = 5;
    const macdStartY = panelStartY + margin;
    const macdHeight = panelEndY - panelStartY - (margin * 2);

    // Draw MACD panel background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(40, macdStartY, chartWidth - 80, macdHeight);

    // Draw MACD panel border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.strokeRect(40, macdStartY, chartWidth - 80, macdHeight);

    // Find MACD range for scaling
    const allValues = [...macdLine, ...signalLine];
    const macdMin = Math.min(...allValues);
    const macdMax = Math.max(...allValues);
    const macdRange = macdMax - macdMin || 1; // Prevent division by zero

    // Draw zero line
    const zeroY = macdStartY + macdHeight - ((0 - macdMin) / macdRange) * macdHeight;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(40, zeroY);
    ctx.lineTo(chartWidth - 40, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw MACD histogram (bars)
    ctx.fillStyle = 'rgba(100, 100, 100, 0.3)';
    macdLine.forEach((macdValue, index) => {
      if (index < signalLine.length) {
        const histogram = macdValue - signalLine[index];
        const dataIndex = index + 26; // MACD calculation offset
        const x = 40 + (dataIndex * candleSpacing) + candleSpacing / 2;
        
        // Only draw if within chart bounds and we have valid data
        if (x >= 40 && x <= chartWidth - 40 && dataIndex < visibleData.length) {
          const barHeight = Math.abs((histogram / macdRange) * macdHeight);
          const barY = histogram >= 0 
            ? zeroY - barHeight 
            : zeroY;
          
          ctx.fillStyle = histogram >= 0 ? 'rgba(76, 175, 80, 0.3)' : 'rgba(244, 67, 54, 0.3)';
          ctx.fillRect(x - candleSpacing / 4, barY, candleSpacing / 2, barHeight);
        }
      }
    });

    // MACD line (blue)
    ctx.strokeStyle = '#2196f3';
    ctx.lineWidth = 2;
    ctx.beginPath();

    macdLine.forEach((value, index) => {
      const dataIndex = index + 26; // MACD calculation offset
      const x = 40 + (dataIndex * candleSpacing) + candleSpacing / 2;
      const y = macdStartY + macdHeight - ((value - macdMin) / macdRange) * macdHeight;
      
      // Only draw if within chart bounds and we have valid data
      if (x >= 40 && x <= chartWidth - 40 && dataIndex < visibleData.length) {
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
    });
    
    ctx.stroke();

    // Signal line (red)
    ctx.strokeStyle = '#f44336';
    ctx.lineWidth = 2;
    ctx.beginPath();

    signalLine.forEach((value, index) => {
      const dataIndex = index + 35; // Signal line calculation offset (26 + 9)
      const x = 40 + (dataIndex * candleSpacing) + candleSpacing / 2;
      const y = macdStartY + macdHeight - ((value - macdMin) / macdRange) * macdHeight;
      
      // Only draw if within chart bounds and we have valid data
      if (x >= 40 && x <= chartWidth - 40 && dataIndex < visibleData.length) {
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
    });
    
    ctx.stroke();

    // Draw MACD labels and current values
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    
    ctx.fillStyle = '#2196f3';
    ctx.fillText('MACD', 45, macdStartY + 18);
    
    ctx.fillStyle = '#f44336';
    ctx.fillText('Signal', 90, macdStartY + 18);

    // Show current values
    if (macdLine.length > 0 && signalLine.length > 0) {
      const currentMACD = macdLine[macdLine.length - 1];
      const currentSignal = signalLine[signalLine.length - 1];
      const currentHistogram = currentMACD - currentSignal;
      
      ctx.fillStyle = '#2196f3';
      ctx.fillText(currentMACD.toFixed(3), 140, macdStartY + 18);
      
      ctx.fillStyle = '#f44336';
      ctx.fillText(currentSignal.toFixed(3), 200, macdStartY + 18);
      
      ctx.fillStyle = currentHistogram >= 0 ? '#4caf50' : '#f44336';
      ctx.fillText(currentHistogram.toFixed(3), 260, macdStartY + 18);
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
    
    // DEBUG LOG
    console.log(`🐛 Y-AXIS DEBUG: chartArea=${chartArea}, minPrice=${minPrice.toFixed(2)}, maxPrice=${maxPrice.toFixed(2)}`);
    
    for (let i = 0; i <= steps; i++) {
      const ratio = i / steps;
      const price = minPrice + (maxPrice - minPrice) * (1 - ratio);
      const y = 20 + ((chartArea - 40) / steps) * i;
      
      // DEBUG LOG for first few
      if (i <= 2 || i >= 8) {
        console.log(`🐛 Y-AXIS step ${i}: ratio=${ratio.toFixed(3)}, price=$${price.toFixed(2)}, y=${y}`);
      }
      
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
    chartWidth: number,
    visibleCandleCount: number,
    scrollOffset: number,
    allData: ChartDataPoint[]
  ) => {
    if (visibleData.length === 0) return;

    ctx.fillStyle = config.axisStyle.xAxis.textColor;
    ctx.font = `${config.axisStyle.xAxis.textSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.textAlign = 'center';

    // Calculate how many labels we can fit
    const maxLabels = Math.floor(chartWidth / 80); // One label every 80px
    const labelStep = Math.max(1, Math.floor(visibleCandleCount / maxLabels));
    
    const candleSpacing = chartWidth / visibleCandleCount;

    // Calculate if we're showing future area
    const startIndex = Math.max(0, Math.floor(scrollOffset));
    const actualDataEnd = Math.min(allData.length, startIndex + visibleCandleCount);
    const showingFutureArea = (startIndex + visibleCandleCount) > allData.length;
    const futurePeriodsShown = showingFutureArea ? (startIndex + visibleCandleCount) - allData.length : 0;

    // Helper function to calculate future timestamp
    const getFutureTimestamp = (baseTimestamp: number, periodsAhead: number): number => {
      const timeframe = config.timeframe;
      let milliseconds = 0;
      
      switch (timeframe) {
        case '1m': milliseconds = 60 * 1000; break;
        case '5m': milliseconds = 5 * 60 * 1000; break;
        case '15m': milliseconds = 15 * 60 * 1000; break;
        case '30m': milliseconds = 30 * 60 * 1000; break;
        case '1h': milliseconds = 60 * 60 * 1000; break;
        case '4h': milliseconds = 4 * 60 * 60 * 1000; break;
        case '1d': milliseconds = 24 * 60 * 60 * 1000; break;
        case '1w': milliseconds = 7 * 24 * 60 * 60 * 1000; break;
        case '1mo': milliseconds = 30 * 24 * 60 * 60 * 1000; break;
        default: milliseconds = 24 * 60 * 60 * 1000; break;
      }
      
      return baseTimestamp + (periodsAhead * milliseconds);
    };

    // Draw labels for actual data
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

    // Draw future labels if we're showing future area
    if (showingFutureArea && futurePeriodsShown > 0 && allData.length > 0) {
      const lastDataTimestamp = allData[allData.length - 1].timestamp;
      
      for (let i = 1; i <= futurePeriodsShown; i++) {
        const futureIndex = visibleData.length + i - 1;
        if (futureIndex % labelStep === 0) {
          const x = 40 + (futureIndex * candleSpacing) + candleSpacing / 2;
          const futureTimestamp = getFutureTimestamp(lastDataTimestamp, i);
          
          // Format future time based on timeframe
          let timeLabel = '';
          const date = new Date(futureTimestamp);
          
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
          
          // Draw future time label with slightly different style
          ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'; // Slightly dimmed for future
          ctx.fillText(timeLabel, x, height - 8);
          
          // Draw tick mark
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'; // Dimmed tick for future
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x, height - 20);
          ctx.lineTo(x, height - 15);
          ctx.stroke();
          
          // Reset color
          ctx.fillStyle = config.axisStyle.xAxis.textColor;
        }
      }
    }
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

    // Define tool categories within the function scope
    const textTools = ['text', 'note', 'callout', 'price_label', 'anchored_text'];
    const singleClickTools = [
      'horizontal_line', 'vertical_line', 'cross_line', 'flag', 
      'long_position', 'short_position', 'price_alert', 'ray'
    ];
    const twoPointTools = [
      'trend_line', 'fib_retracement', 'fib_extension', 'fib_fan', 'fib_arc',
      'fib_timezone', 'fib_channel', 'fib_speed_fan', 'rectangle', 'ellipse',
      'triangle', 'circle', 'arc', 'gann_line', 'gann_fan', 'gann_box',
      'gann_square', 'regression', 'forecast', 'ruler', 'price_range',
      'date_range', 'date_price_range', 'projection'
    ];
    const multiPointTools = [
      'pitchfork', 'schiff_pitchfork', 'inside_pitchfork', 'elliott_wave', 
      'elliott_impulse', 'elliott_correction', 'polyline', 'polygon',
      'head_shoulders', 'triangle_pattern', 'abcd_pattern', 'bat_pattern',
      'butterfly_pattern', 'gartley_pattern', 'crab_pattern', 'shark_pattern',
      'cypher_pattern', 'cycle_lines'
    ];

    // If we have an active drawing tool, handle the drawing
    if (activeTool) {
      console.log('🎨 Processing drawing tool:', activeTool);
      
      // Handle text input tools
      if (textTools.includes(activeTool)) {
        setTextInputPosition({ x, y });
        setShowTextInput(true);
        return;
      }

      // Handle single-click tools
      if (singleClickTools.includes(activeTool)) {
        console.log('🖱️ Single-click tool activated:', activeTool, 'at:', { x, y });
        
        let newDrawing;
        
        if (activeTool === 'ray') {
          // TradingView-style horizontal ray: only needs start point
          newDrawing = {
            id: Date.now(),
            type: 'ray',
            startPoint: { x, y },
            timestamp: Date.now(),
            style: drawingStyle
          };
        } else if (activeTool === 'vertical_line') {
          newDrawing = {
            id: Date.now(),
            type: 'vertical_line',
            startPoint: { x, y },
            timestamp: Date.now(),
            style: drawingStyle
          };
        } else {
          // Other single-click tools
          newDrawing = {
            id: Date.now(),
            type: activeTool || 'unknown',
            startPoint: { x, y },
            endPoint: { x, y },
            timestamp: Date.now(),
            style: drawingStyle
          };
        }
        
        console.log('✅ Creating new single-click drawing:', newDrawing);
        setDrawings(prev => {
          const updated = [...prev, newDrawing];
          console.log('📊 Updated drawings array:', updated.length, 'drawings');
          return updated;
        });
        setActiveTool(null); // Clear tool after single use
        return;
      }

      // Handle two-point tools (most common drawing tools) 
      if (twoPointTools.includes(activeTool)) {
        if (!isDrawing) {
          // Start drawing
          console.log('🎯 Starting two-point tool:', activeTool);
          setIsDrawing(true);
          setDrawingStartPoint({ x, y });
        } else {
          // Complete drawing
          if (drawingStartPoint) {
            console.log('✅ Completing two-point tool:', activeTool);
            
            const newDrawing: Drawing = {
              id: Date.now(),
              type: activeTool || 'unknown',
              startPoint: drawingStartPoint,
              endPoint: { x, y },
              timestamp: Date.now(),
              style: drawingStyle
            };
            
            console.log('✅ Adding new two-point drawing:', newDrawing);
            setDrawings(prev => {
              const newDrawings = [...prev, newDrawing];
              console.log('📊 Updated drawings count:', newDrawings.length);
              return newDrawings;
            });
            setIsDrawing(false);
            setDrawingStartPoint(null);
            setActiveTool(null); // Clear tool after use
          }
        }
        return;
      }

      // Handle multi-point tools
      if (multiPointTools.includes(activeTool)) {
        const newPoint = { x, y };
        const updatedPoints = [...multiPointDrawing, newPoint];
        setMultiPointDrawing(updatedPoints);
        
        // Determine if we have enough points to complete the tool
        let requiredPoints = 2; // Default
        switch (activeTool) {
          case 'elliott_impulse':
            requiredPoints = 5;
            break;
          case 'elliott_correction':
            requiredPoints = 3;
            break;
          case 'pitchfork':
          case 'schiff_pitchfork':
          case 'inside_pitchfork':
            requiredPoints = 3;
            break;
        }
        
        if (updatedPoints.length >= requiredPoints) {
          // Complete the multi-point drawing
          const newDrawing = {
            id: Date.now(),
            type: activeTool || 'unknown',
            points: updatedPoints,
            timestamp: Date.now(),
            style: drawingStyle
          };
          
          console.log('✅ Creating multi-point drawing:', newDrawing);
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
      
      return;
    }

    // Check for drawing selection when no tool is active
    if (!activeTool) {
      // Simple hit detection for rays
      const clickedDrawing = drawings.find((drawing: any) => {
        if (drawing.type === 'ray') {
          const priceChartHeight = dimensions.height * 0.7;
          const ratio = (priceRange.max - drawing.price) / (priceRange.max - priceRange.min);
          const drawingY = ratio * priceChartHeight;
          return x >= drawing.x && Math.abs(y - drawingY) < 10;
        }
        return false;
      });

      if (clickedDrawing) {
        setSelectedDrawing(clickedDrawing);
        setIsDraggingDrawing(true);
        console.log('🎯 Selected drawing:', clickedDrawing);
        return;
      }
    }

    // Chart panning fallback
    setIsDragging(true);
    setLastMouseX(x);
    setDragStartX(x);
    setDragStartOffset(scrollOffset);
    
    e.preventDefault();
  }, [activeTool, drawings, dimensions, priceRange, scrollOffset, isDrawing, drawingStartPoint, multiPointDrawing, drawingStyle]);

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
    
    // ALWAYS update crosshair position first
    setCrosshairPosition({ x, y });

    // Handle drawing dragging
    if (isDraggingDrawing && selectedDrawing) {
      // Convert Y to price
      const priceChartHeight = dimensions.height * 0.7;
      const ratio = y / priceChartHeight;
      const newPrice = priceRange.max - ((priceRange.max - priceRange.min) * ratio);
      
      setDrawings(prev => prev.map((d: any) => 
        d.id === selectedDrawing.id 
          ? { ...d, price: newPrice, y }
          : d
      ));
      return;
    }

    // Handle chart panning
    if (isDragging) {
      const deltaX = x - lastMouseX;
      const currentOffset = scrollOffset;
      const maxOffset = Math.max(0, data.length - visibleCandleCount);
      const newOffset = Math.max(0, Math.min(maxOffset, currentOffset - Math.floor(deltaX / 5)));
      
      if (newOffset !== currentOffset) {
        setScrollOffset(newOffset);
      }
      
      setLastMouseX(x);
      return;
    }

    // Update crosshair info
    if (data.length > 0 && config.crosshair) {
      const priceChartHeight = dimensions.height * 0.7;
      const relativeY = y / priceChartHeight;
      const price = priceRange.max - ((priceRange.max - priceRange.min) * relativeY);
      
      // Calculate candle index
      const chartWidth = dimensions.width - 100;
      const candleWidth = chartWidth / visibleCandleCount;
      const relativeX = Math.max(0, x - 40);
      const visibleCandleIndex = Math.floor(relativeX / candleWidth);
      const candleIndex = scrollOffset + visibleCandleIndex;
      
      if (candleIndex >= 0 && candleIndex < data.length) {
        const candle = data[candleIndex];
        setCrosshairInfo({
          visible: true,
          price: `$${price.toFixed(2)}`,
          date: new Date(candle?.timestamp || Date.now()).toLocaleDateString(),
          time: String(candle?.timestamp || ''),
          volume: candle?.volume || 0
        });
      }
    }
  }, [isDragging, isDraggingDrawing, selectedDrawing, lastMouseX, scrollOffset, visibleCandleCount, data, dimensions, priceRange, config.crosshair]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setIsDraggingDrawing(false);
    setSelectedDrawing(null);
  }, []);

  // Simple drawing rendering effect
  useEffect(() => {
    const overlayCanvas = overlayCanvasRef.current;
    if (!overlayCanvas || drawings.length === 0) return;

    const ctx = overlayCanvas.getContext('2d');
    if (!ctx) return;

    // Clear overlay
    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    // Render all drawings
    drawings.forEach((drawing: any) => {
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 2;
      ctx.setLineDash([]);

      ctx.beginPath();
      
      if (drawing.type === 'ray') {
        // Horizontal ray from start point to right edge
        const startY = drawing.y || drawing.startY;
        const startX = drawing.x || drawing.startX || 100;
        
        ctx.moveTo(startX, startY);
        ctx.lineTo(overlayCanvas.width, startY);
        
        // Draw start point marker
        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        ctx.arc(startX, startY, 4, 0, 2 * Math.PI);
        ctx.fill();
        
        // Draw line
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(overlayCanvas.width, startY);
      } else if (drawing.type === 'trend_line') {
        // Regular line from start to end
        ctx.moveTo(drawing.startX || 0, drawing.startY || 0);
        ctx.lineTo(drawing.endX || 100, drawing.endY || 100);
      }
      
      ctx.stroke();
    });
  }, [drawings]);

  const handleMouseLeave = useCallback(() => {
    // Hide crosshair info when mouse leaves chart area
    setCrosshairInfo(prev => ({ ...prev, visible: false }));
  }, []);

  const handleDoubleClick = useCallback(() => {
    // Reset to fit all data
    setVisibleCandleCount(Math.min(200, data.length));
    setScrollOffset(Math.max(0, data.length - Math.min(200, data.length)));
  }, [data.length]);

  // Handle timeframe change - SIMPLE DIRECT FETCH (no broken cache)
  const handleTimeframeChange = (timeframe: string) => {
    console.log(`🔄 TIMEFRAME CHANGE: ${symbol} -> ${timeframe}`);
    
    // ALWAYS fetch fresh data - no cache bullshit that shows wrong prices
    console.log(`� FRESH FETCH: Getting live ${timeframe} data for ${symbol}`);
    fetchData(symbol, timeframe);
    
    // Update config
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

  // Update dropdown positions based on button positions
  const updateDropdownPosition = (type: 'indicators' | 'timeframe' | 'tools' | 'lineTools' | 'fib' | 'shapes' | 'gann' | 'elliott' | 'prediction' | 'measure' | 'notes' | 'volume' | 'patterns' | 'harmonic' | 'cycles' | 'orders') => {
    const buttonRef = type === 'indicators' ? indicatorsButtonRef : 
                     type === 'timeframe' ? timeframeButtonRef : 
                     type === 'tools' ? toolsButtonRef :
                     type === 'lineTools' ? lineToolsButtonRef :
                     type === 'fib' ? fibButtonRef :
                     type === 'shapes' ? shapesButtonRef :
                     type === 'gann' ? gannButtonRef :
                     type === 'elliott' ? elliottButtonRef :
                     type === 'prediction' ? predictionButtonRef :
                     type === 'measure' ? measureButtonRef :
                     type === 'notes' ? notesButtonRef :
                     type === 'volume' ? volumeButtonRef :
                     type === 'patterns' ? patternsButtonRef :
                     type === 'harmonic' ? harmonicButtonRef :
                     type === 'cycles' ? cyclesButtonRef :
                     ordersButtonRef;
    
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPositions(prev => ({
        ...prev,
        [type]: {
          x: rect.left,
          y: rect.bottom + 8, // 8px gap below button
          width: rect.width
        }
      }));
    }
  };

  // Drawing Tools Functions
  const selectDrawingTool = (toolValue: string) => {
    console.log(`🎨 Activating drawing tool: ${toolValue}`);
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
    console.log(`🎨 Deactivating drawing tool: ${activeTool}`);
    setActiveTool(null);
    setIsDrawing(false);
    setDrawingStartPoint(null);
  };

  const clearAllDrawings = () => {
    setDrawings([]);
    setConfig(prev => ({ ...prev, drawings: [] }));
  };

  // Favorites functions
  const toggleFavoriteDrawingTool = (toolValue: string) => {
    console.log('🌟 Toggling favorite for tool:', toolValue);
    setFavoriteDrawingTools(prev => {
      const newFavorites = prev.includes(toolValue)
        ? prev.filter(fav => fav !== toolValue)
        : [...prev, toolValue];
      console.log('🌟 Updated favorites:', newFavorites);
      return newFavorites;
    });
  };

  const getFavoriteTools = () => {
    const allTools: any[] = [];
    Object.entries(DRAWING_TOOLS).forEach(([category, tools]) => {
      allTools.push(...tools);
    });
    const favorites = allTools.filter(tool => favoriteDrawingTools.includes(tool.value));
    console.log('🌟 Getting favorite tools. Current favorites:', favoriteDrawingTools, 'Found tools:', favorites);
    return favorites;
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
    console.log('🔥 handleCanvasMouseDown called with activeTool:', activeTool);
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    // Use crosshair position if available, otherwise fall back to mouse position
    const x = crosshairPosition.x || (e.clientX - rect.left);
    const y = crosshairPosition.y || (e.clientY - rect.top);

    console.log('🖱️ Mouse down at:', { x, y, activeTool, crosshairPosition });

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
          setDragStartPosition({ x, y });
          
          // Calculate offset based on drawing type
          let offsetX = 0, offsetY = 0;
          if (clickedDrawing.startPoint) {
            offsetX = x - clickedDrawing.startPoint.x;
            offsetY = y - clickedDrawing.startPoint.y;
          } else if (clickedDrawing.startX !== undefined && clickedDrawing.startY !== undefined) {
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
    
    // Multi-point tools that require multiple clicks (for Fibonacci, Elliott waves, complex patterns)
    const multiPointTools = [
      'pitchfork', 'schiff_pitchfork', 'inside_pitchfork', 'elliott_wave', 
      'elliott_impulse', 'elliott_correction', 'polyline', 'polygon',
      'head_shoulders', 'triangle_pattern', 'abcd_pattern', 'bat_pattern',
      'butterfly_pattern', 'gartley_pattern', 'crab_pattern', 'shark_pattern',
      'cypher_pattern', 'cycle_lines'
    ];
    
    // Text input tools
    const textTools = ['text', 'note', 'callout', 'price_label', 'anchored_text'];
    
    // Single-click tools (create immediately on first click)
    const singleClickTools = [
      'horizontal_line', 'vertical_line', 'cross_line', 'flag', 
      'long_position', 'short_position', 'price_alert', 'ray'
    ];
    
    // Two-point tools (start on first click, complete on second click)
    const twoPointTools = [
      'trend_line', 'fib_retracement', 'fib_extension', 'fib_fan', 'fib_arc',
      'fib_timezone', 'fib_channel', 'fib_speed_fan', 'rectangle', 'ellipse',
      'triangle', 'circle', 'arc', 'gann_line', 'gann_fan', 'gann_box',
      'gann_square', 'regression', 'forecast', 'ruler', 'price_range',
      'date_range', 'date_price_range', 'projection'
    ];

    if (textTools.includes(activeTool)) {
      // Handle text input tools
      setTextInputPosition({ x, y });
      setShowTextInput(true);
      return;
    }

    if (singleClickTools.includes(activeTool)) {
      // Handle single-click tools with TradingView-style coordinates
      console.log('🖱️ Single-click tool activated:', activeTool, 'at:', { x, y });
      const dataCoords = screenToDataCoordinates(x, y);
      
      // Convert candle index to timestamp
      const timestamp = data[Math.min(dataCoords.candleIndex, data.length - 1)]?.timestamp || Date.now();
      
      let newDrawing;
      
      if (activeTool === 'ray') {
        // TradingView-style horizontal ray: uses time+price anchoring
        newDrawing = {
          id: Date.now(),
          type: 'ray',
          startPoint: { x, y },
          // TradingView coordinates for persistent anchoring
          time: timestamp,
          price: dataCoords.price,
          // Legacy coordinates for backward compatibility
          startDataPoint: dataCoords,
          timestamp: Date.now(),
          style: drawingStyle
        };
      } else {
        // Other single-click tools
        newDrawing = {
          id: Date.now(),
          type: activeTool || 'unknown',
          startPoint: { x, y },
          endPoint: { x, y },
          // TradingView coordinates for persistent anchoring
          time: timestamp,
          price: dataCoords.price,
          // Legacy coordinates for backward compatibility
          startDataPoint: dataCoords,
          endDataPoint: dataCoords,
          timestamp: Date.now(),
          style: drawingStyle,
          text: activeTool === 'price_alert' ? `Alert: $${getPriceAtY(y).toFixed(2)}` : ''
        };
      }
      
      console.log('✅ Creating new TradingView-style drawing:', newDrawing);
      setDrawings(prev => {
        const updated = [...prev, newDrawing];
        console.log('📊 Updated drawings array:', updated.length, 'drawings');
        console.log('📊 All drawings:', updated);
        return updated;
      });
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
        const dataPoints = updatedPoints.map(point => screenToDataCoordinates(point.x, point.y));
        const newDrawing = {
          id: Date.now(),
          type: activeTool || 'unknown',
          points: updatedPoints,
          dataPoints: dataPoints,
          timestamp: Date.now(),
          style: drawingStyle,
          metadata: getToolMetadata(activeTool || 'unknown', updatedPoints)
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

    // Handle two-point tools (most common drawing tools) 
    if (twoPointTools.includes(activeTool)) {
      if (!isDrawing) {
        // Start drawing
        console.log('🎯 Starting two-point tool:', activeTool);
        setIsDrawing(true);
        setDrawingStartPoint({ x, y });
      } else {
        // Complete drawing
        if (drawingStartPoint) {
          console.log('✅ Completing two-point tool:', activeTool);
          const startDataPoint = screenToDataCoordinates(drawingStartPoint.x, drawingStartPoint.y);
          const endDataPoint = screenToDataCoordinates(x, y);
          
          // Convert candle indices to timestamps for TradingView-style anchoring
          const startTimestamp = data[Math.min(startDataPoint.candleIndex, data.length - 1)]?.timestamp || Date.now();
          const endTimestamp = data[Math.min(endDataPoint.candleIndex, data.length - 1)]?.timestamp || Date.now();
          
          const newDrawing: Drawing = {
            id: Date.now(),
            type: activeTool || 'unknown',
            startPoint: drawingStartPoint,
            endPoint: { x, y },
            // TradingView coordinates for persistent anchoring
            time1: startTimestamp,
            price1: startDataPoint.price,
            time2: endTimestamp,
            price2: endDataPoint.price,
            // Legacy coordinates for backward compatibility
            startDataPoint: startDataPoint,
            endDataPoint: endDataPoint,
            timestamp: Date.now(),
            style: drawingStyle,
            metadata: calculateDrawingMetadata(activeTool || 'unknown', drawingStartPoint, { x, y })
          };

          // Handle special tool types that need additional properties
          switch (activeTool) {
            case 'fib_retracement':
            case 'fib_extension':
              newDrawing.metadata = {
                ...newDrawing.metadata,
                levels: activeTool === 'fib_retracement' ? fibonacciLevels : fibonacciExtensionLevels,
                priceRange: Math.abs(getPriceAtY(y) - getPriceAtY(drawingStartPoint.y))
              };
              break;
          }
          
          console.log('✅ Adding new two-point drawing:', newDrawing);
          setDrawings(prev => {
            const newDrawings = [...prev, newDrawing];
            console.log('📊 Updated drawings count:', newDrawings.length);
            return newDrawings;
          });
          setIsDrawing(false);
          setDrawingStartPoint(null);
          setActiveTool(null); // Clear tool after use
        }
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
        const startDataPoint = screenToDataCoordinates(drawingStartPoint.x, drawingStartPoint.y);
        const endDataPoint = screenToDataCoordinates(x, y);
        
        // Convert candle indices to timestamps for TradingView-style anchoring
        const startTimestamp = data[Math.min(startDataPoint.candleIndex, data.length - 1)]?.timestamp || Date.now();
        const endTimestamp = data[Math.min(endDataPoint.candleIndex, data.length - 1)]?.timestamp || Date.now();
        
        const newDrawing: Drawing = {
          id: Date.now(),
          type: activeTool || 'unknown',
          startPoint: drawingStartPoint,
          endPoint: { x, y },
          // TradingView coordinates for persistent anchoring
          time1: startTimestamp,
          price1: startDataPoint.price,
          time2: endTimestamp,
          price2: endDataPoint.price,
          // Legacy coordinates for backward compatibility
          startDataPoint: startDataPoint,
          endDataPoint: endDataPoint,
          timestamp: Date.now(),
          style: drawingStyle,
          metadata: calculateDrawingMetadata(activeTool || 'unknown', drawingStartPoint, { x, y })
        };

        // Handle special tool types that need additional properties
        switch (activeTool) {
          case 'fib_retracement':
          case 'fib_extension':
            newDrawing.metadata = {
              ...newDrawing.metadata,
              levels: activeTool === 'fib_retracement' ? fibonacciLevels : fibonacciExtensionLevels,
              priceRange: Math.abs(getPriceAtY(y) - getPriceAtY(drawingStartPoint.y))
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
              priceRange: Math.abs(getPriceAtY(y) - getPriceAtY(drawingStartPoint.y)),
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

  // Helper functions to convert between screen and data coordinates
  const getPriceAtY = (y: number): number => {
    return screenToDataCoordinates(0, y).price;
  };
  const screenToDataCoordinates = (screenX: number, screenY: number): { candleIndex: number; price: number } => {
    const canvas = overlayCanvasRef.current;
    if (!canvas || !data.length) return { candleIndex: 0, price: 0 };
    
    const rect = canvas.getBoundingClientRect();
    const chartWidth = rect.width - 80; // Account for margins
    const candleWidth = chartWidth / visibleCandleCount;
    
    // Convert screen X to candle index
    const relativeX = Math.max(0, screenX - 40); // Account for left margin
    const visibleCandleIndex = Math.floor(relativeX / candleWidth);
    const candleIndex = scrollOffset + visibleCandleIndex;
    
    // For TradingView-style behavior, we need ABSOLUTE price coordinates
    // Use GLOBAL price range (entire dataset) so drawings don't shift with zoom/scroll
    const globalPrices = data.flatMap(d => [d.high, d.low]);
    const globalMinPrice = Math.min(...globalPrices);
    const globalMaxPrice = Math.max(...globalPrices);
    const globalPadding = (globalMaxPrice - globalMinPrice) * 0.1;
    const globalAdjustedMin = globalMinPrice - globalPadding;
    const globalAdjustedMax = globalMaxPrice + globalPadding;
    
    // Convert screen Y to ABSOLUTE price (doesn't change with zoom)
    const priceChartHeight = rect.height * 0.7;
    const relativeY = screenY / priceChartHeight;
    const price = globalAdjustedMax - ((globalAdjustedMax - globalAdjustedMin) * relativeY);
    
    const result = { candleIndex: Math.max(0, Math.min(data.length - 1, candleIndex)), price };
    
    return result;
  };

  const dataToScreenCoordinates = (candleIndex: number, price: number): { x: number; y: number } => {
    const canvas = overlayCanvasRef.current;
    if (!canvas || !data.length) return { x: 0, y: 0 };
    
    const rect = canvas.getBoundingClientRect();
    const chartWidth = rect.width - 80; // Account for margins
    const candleWidth = chartWidth / visibleCandleCount;
    
    // Convert candle index to screen X (this part is correct)
    const visibleCandleIndex = candleIndex - scrollOffset;
    const x = 40 + (visibleCandleIndex * candleWidth) + (candleWidth / 2);
    
    // CRITICAL: Drawing coordinates are stored in ABSOLUTE coordinates (global price range)
    // But chart rendering uses RELATIVE coordinates (visible price range)
    // We need to transform from absolute to the current visible range
    
    // Get CURRENT visible data range (what the chart is actually using for rendering)
    const startIndex = Math.max(0, scrollOffset);
    const endIndex = Math.min(data.length, startIndex + visibleCandleCount);
    const visibleData = data.slice(startIndex, endIndex);
    
    if (!visibleData.length) return { x, y: 0 };
    
    // Chart's CURRENT visible price range (changes with zoom/scroll)
    const visiblePrices = visibleData.flatMap(d => [d.high, d.low]);
    const visibleMinPrice = Math.min(...visiblePrices);
    const visibleMaxPrice = Math.max(...visiblePrices);
    const visiblePadding = (visibleMaxPrice - visibleMinPrice) * 0.1;
    const visibleAdjustedMin = visibleMinPrice - visiblePadding;
    const visibleAdjustedMax = visibleMaxPrice + visiblePadding;
    
    // Convert ABSOLUTE price to screen Y using CURRENT visible range
    const priceChartHeight = rect.height * 0.7;
    const relativePrice = (price - visibleAdjustedMin) / (visibleAdjustedMax - visibleAdjustedMin);
    const y = priceChartHeight - (relativePrice * priceChartHeight);
    
    const result = { x, y };
    
    return result;
  };

  // Helper function to calculate drawing metadata
  const calculateDrawingMetadata = (toolType: string, start: {x: number, y: number}, end: {x: number, y: number}) => {
    const metadata: DrawingMetadata = {};
    
    switch (toolType) {
      case 'fib_retracement':
      case 'fib_extension':
        metadata.levels = toolType === 'fib_retracement' ? fibonacciLevels : fibonacciExtensionLevels;
        metadata.priceRange = Math.abs(getPriceAtY(end.y) - getPriceAtY(start.y));
        break;
      case 'gann_line':
        metadata.angle = Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI;
        break;
      case 'ruler':
        metadata.distance = Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2);
        metadata.angle = Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI;
        metadata.priceDistance = Math.abs(getPriceAtY(end.y) - getPriceAtY(start.y));
        break;
      case 'regression':
        metadata.slope = (end.y - start.y) / (end.x - start.x);
        break;
    }
    
    return metadata;
  };

  // Helper function to get tool-specific metadata
  const getToolMetadata = (toolType: string, points: {x: number, y: number}[]) => {
    const metadata: DrawingMetadata = {};
    
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
        type: activeTool || 'unknown',
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
  const isPointNearDrawing = (point: { x: number; y: number }, drawing: Drawing, tolerance = 8): boolean => {
    const { x, y } = point;
    
    // Get current screen coordinates for the drawing
    let startPoint = drawing.startPoint;
    let endPoint = drawing.endPoint;
    let points = drawing.points;

    // If data coordinates exist, convert them to current screen coordinates
    if (drawing.startDataPoint) {
      const screenCoords = dataToScreenCoordinates(drawing.startDataPoint.candleIndex, drawing.startDataPoint.price);
      startPoint = screenCoords;
    }
    if (drawing.endDataPoint) {
      const screenCoords = dataToScreenCoordinates(drawing.endDataPoint.candleIndex, drawing.endDataPoint.price);
      endPoint = screenCoords;
    }
    if (drawing.dataPoints && drawing.dataPoints.length > 0) {
      points = drawing.dataPoints.map(dataPoint => 
        dataToScreenCoordinates(dataPoint.candleIndex, dataPoint.price)
      );
    }
    
    switch (drawing.type) {
      case 'trend_line':
      case 'extended_line':
        return startPoint && endPoint ? 
          isPointNearLine(x, y, startPoint, endPoint, tolerance) : false;
      
      case 'ray':
        // TradingView-style horizontal ray: check if point is near horizontal line extending to the right
        if (startPoint) {
          const rayEndPoint = { x: 9999, y: startPoint.y }; // Virtual end point far to the right
          return x >= startPoint.x && Math.abs(y - startPoint.y) <= tolerance;
        }
        return false;
      
      case 'horizontal_line':
        return startPoint ? Math.abs(y - startPoint.y) <= tolerance : false;
      
      case 'vertical_line':
        return startPoint ? Math.abs(x - startPoint.x) <= tolerance : false;
      
      case 'rectangle':
        return startPoint && endPoint ? 
          isPointInRectangle(x, y, startPoint, endPoint, tolerance) : false;
      
      case 'ellipse':
      case 'circle':
        return startPoint && endPoint ? 
          isPointNearEllipse(x, y, startPoint, endPoint, tolerance) : false;
      
      case 'fib_retracement':
      case 'fib_extension':
        return startPoint && endPoint ? 
          isPointNearLine(x, y, startPoint, endPoint, tolerance) : false;
      
      case 'text':
      case 'note':
      case 'callout':
        return startPoint ? 
          isPointInTextBox(x, y, startPoint, drawing.text || '', tolerance) : false;
      
      default:
        return startPoint && endPoint ? 
          isPointNearLine(x, y, startPoint, endPoint, tolerance) : false;
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
  const findDrawingAtPoint = (point: { x: number; y: number }): Drawing | null => {
    for (let i = drawings.length - 1; i >= 0; i--) {
      if (isPointNearDrawing(point, drawings[i])) {
        return drawings[i];
      }
    }
    return null;
  };

  // Function to move a drawing to absolute position based on original drawing
  const moveDrawingToPosition = (drawingId: number, deltaX: number, deltaY: number, originalDrawing: any) => {
    setDrawings(prev => prev.map(drawing => {
      if (drawing.id === drawingId) {
        const updatedDrawing = { ...originalDrawing }; // Start with the original drawing
        
        // Move data coordinates (TradingView-style absolute coordinates)
        if (originalDrawing.startDataPoint) {
          const originalScreenCoords = dataToScreenCoordinates(originalDrawing.startDataPoint.candleIndex, originalDrawing.startDataPoint.price);
          const newScreenCoords = { x: originalScreenCoords.x + deltaX, y: originalScreenCoords.y + deltaY };
          const newDataCoords = screenToDataCoordinates(newScreenCoords.x, newScreenCoords.y);
          updatedDrawing.startDataPoint = newDataCoords;
        }
        
        if (originalDrawing.endDataPoint) {
          const originalScreenCoords = dataToScreenCoordinates(originalDrawing.endDataPoint.candleIndex, originalDrawing.endDataPoint.price);
          const newScreenCoords = { x: originalScreenCoords.x + deltaX, y: originalScreenCoords.y + deltaY };
          const newDataCoords = screenToDataCoordinates(newScreenCoords.x, newScreenCoords.y);
          updatedDrawing.endDataPoint = newDataCoords;
        }
        
        if (originalDrawing.dataPoints && originalDrawing.dataPoints.length > 0) {
          updatedDrawing.dataPoints = originalDrawing.dataPoints.map((dataPoint: any) => {
            const originalScreenCoords = dataToScreenCoordinates(dataPoint.candleIndex, dataPoint.price);
            const newScreenCoords = { x: originalScreenCoords.x + deltaX, y: originalScreenCoords.y + deltaY };
            return screenToDataCoordinates(newScreenCoords.x, newScreenCoords.y);
          });
        }
        
        // Also update screen coordinates for immediate visual feedback (these get recalculated on render anyway)
        if (originalDrawing.startPoint) {
          updatedDrawing.startPoint = {
            x: originalDrawing.startPoint.x + deltaX,
            y: originalDrawing.startPoint.y + deltaY
          };
        }
        
        if (originalDrawing.endPoint) {
          updatedDrawing.endPoint = {
            x: originalDrawing.endPoint.x + deltaX,
            y: originalDrawing.endPoint.y + deltaY
          };
        }
        
        if (originalDrawing.points) {
          updatedDrawing.points = originalDrawing.points.map((point: { x: number; y: number }) => ({
            x: point.x + deltaX,
            y: point.y + deltaY
          }));
        }
        
        return updatedDrawing;
      }
      return drawing;
    }));
  };

  // Function to move a drawing
  const moveDrawing = (drawingId: number, deltaX: number, deltaY: number) => {
    setDrawings(prev => prev.map(drawing => {
      if (drawing.id === drawingId) {
        const updatedDrawing = { ...drawing };
        
        // Move data coordinates (TradingView-style absolute coordinates)
        if (drawing.startDataPoint) {
          const currentScreenCoords = dataToScreenCoordinates(drawing.startDataPoint.candleIndex, drawing.startDataPoint.price);
          const newScreenCoords = { x: currentScreenCoords.x + deltaX, y: currentScreenCoords.y + deltaY };
          const newDataCoords = screenToDataCoordinates(newScreenCoords.x, newScreenCoords.y);
          updatedDrawing.startDataPoint = newDataCoords;
        }
        
        if (drawing.endDataPoint) {
          const currentScreenCoords = dataToScreenCoordinates(drawing.endDataPoint.candleIndex, drawing.endDataPoint.price);
          const newScreenCoords = { x: currentScreenCoords.x + deltaX, y: currentScreenCoords.y + deltaY };
          const newDataCoords = screenToDataCoordinates(newScreenCoords.x, newScreenCoords.y);
          updatedDrawing.endDataPoint = newDataCoords;
        }
        
        if (drawing.dataPoints && drawing.dataPoints.length > 0) {
          updatedDrawing.dataPoints = drawing.dataPoints.map(dataPoint => {
            const currentScreenCoords = dataToScreenCoordinates(dataPoint.candleIndex, dataPoint.price);
            const newScreenCoords = { x: currentScreenCoords.x + deltaX, y: currentScreenCoords.y + deltaY };
            return screenToDataCoordinates(newScreenCoords.x, newScreenCoords.y);
          });
        }
        
        // Also update screen coordinates for immediate visual feedback (these get recalculated on render anyway)
        if (drawing.startPoint) {
          updatedDrawing.startPoint = {
            x: drawing.startPoint.x + deltaX,
            y: drawing.startPoint.y + deltaY
          };
        }
        
        if (drawing.endPoint) {
          updatedDrawing.endPoint = {
            x: drawing.endPoint.x + deltaX,
            y: drawing.endPoint.y + deltaY
          };
        }
        
        if (drawing.points) {
          updatedDrawing.points = drawing.points.map((point: { x: number; y: number }) => ({
            x: point.x + deltaX,
            y: point.y + deltaY
          }));
        }
        
        return updatedDrawing;
      }
      return drawing;
    }));
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Just update crosshair position - don't clear overlay canvas
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setCrosshairPosition({ x, y });
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

  // TradingView-style drawing renderer: converts time+price coordinates to screen position
  const drawStoredDrawings = (ctx: CanvasRenderingContext2D) => {
    const currentDrawings = drawingsRef.current;
    console.log('🎨 Rendering TradingView-style drawings, count:', currentDrawings.length);
    
    if (currentDrawings.length === 0) {
      console.log('❌ No drawings to render');
      return;
    }

    // TradingView coordinate conversion: time+price → screen coordinates
    const timeToScreenX = (timestamp: number): number => {
      if (!data || data.length === 0) return 0;
      
      // Find the candle index for this timestamp
      const candleIndex = data.findIndex((candle: any) => candle.timestamp >= timestamp);
      if (candleIndex === -1) return ctx.canvas.width; // Future timestamp, draw at right edge
      
      // Convert candle index to screen x using current scroll offset
      const canvas = overlayCanvasRef.current;
      if (!canvas) return 0;
      
      const rect = canvas.getBoundingClientRect();
      const chartWidth = rect.width - 80; // Account for margins
      const candleWidth = chartWidth / visibleCandleCount;
      const x = (candleIndex - scrollOffset) * candleWidth + candleWidth / 2 + 40; // Add left margin
      
      return Math.max(0, Math.min(ctx.canvas.width, x));
    };

    const priceToScreenY = (price: number): number => {
      if (!priceRange) return ctx.canvas.height / 2;
      
      // Use current visible price range for screen positioning
      const { min: low, max: high } = priceRange;
      const priceHeight = high - low;
      if (priceHeight === 0) return ctx.canvas.height / 2;
      
      // Convert price to screen Y coordinate (inverted: high price = low Y)
      const canvas = overlayCanvasRef.current;
      if (!canvas) return ctx.canvas.height / 2;
      
      const rect = canvas.getBoundingClientRect();
      const priceChartHeight = rect.height * 0.7; // 70% for price chart
      const normalizedPrice = (price - low) / priceHeight;
      return priceChartHeight - (normalizedPrice * priceChartHeight);
    };

    // Helper function to convert TradingView coordinates to screen coordinates
    const getScreenCoordinates = (drawing: Drawing) => {
      let startPoint: DrawingPoint | null = null;
      let endPoint: DrawingPoint | null = null;
      let points: DrawingPoint[] | null = null;

      // Convert TradingView time+price coordinates to screen coordinates
      if (drawing.time && drawing.price !== undefined) {
        startPoint = {
          x: timeToScreenX(drawing.time),
          y: priceToScreenY(drawing.price)
        };
      }
      
      if (drawing.time1 && drawing.price1 !== undefined) {
        startPoint = {
          x: timeToScreenX(drawing.time1),
          y: priceToScreenY(drawing.price1)
        };
      }
      
      if (drawing.time2 && drawing.price2 !== undefined) {
        endPoint = {
          x: timeToScreenX(drawing.time2),
          y: priceToScreenY(drawing.price2)
        };
      }

      // Fallback to legacy coordinates if TradingView coordinates not available
      if (!startPoint && drawing.startDataPoint) {
        const screenCoords = dataToScreenCoordinates(drawing.startDataPoint.candleIndex, drawing.startDataPoint.price);
        startPoint = screenCoords;
      }
      if (!endPoint && drawing.endDataPoint) {
        const screenCoords = dataToScreenCoordinates(drawing.endDataPoint.candleIndex, drawing.endDataPoint.price);
        endPoint = screenCoords;
      }
      if (!points && drawing.dataPoints && drawing.dataPoints.length > 0) {
        points = drawing.dataPoints.map(dataPoint => 
          dataToScreenCoordinates(dataPoint.candleIndex, dataPoint.price)
        );
      }

      // Final fallback to screen coordinates
      if (!startPoint && drawing.startPoint) {
        startPoint = drawing.startPoint;
      }
      if (!endPoint && drawing.endPoint) {
        endPoint = drawing.endPoint;
      }
      if (!points && drawing.points) {
        points = drawing.points;
      }

      return { startPoint, endPoint, points };
    };
    
    // Render each drawing using TradingView coordinate system
    currentDrawings.forEach((drawing, index) => {
      console.log(`🖌️ Rendering TradingView drawing ${index + 1}:`, drawing.type, drawing.id);
      
      // Get current screen coordinates (converted from time+price coordinates)
      let { startPoint, endPoint, points } = getScreenCoordinates(drawing);
      
      // Apply drag preview offset if this drawing is being dragged
      if (isDraggingDrawing && selectedDrawing && selectedDrawing.id === drawing.id && dragPreviewOffset) {
        console.log('👻 Applying drag preview offset:', dragPreviewOffset);
        if (startPoint) {
          startPoint = { x: startPoint.x + dragPreviewOffset.x, y: startPoint.y + dragPreviewOffset.y };
        }
        if (endPoint) {
          endPoint = { x: endPoint.x + dragPreviewOffset.x, y: endPoint.y + dragPreviewOffset.y };
        }
        if (points) {
          points = points.map(point => ({ x: point.x + dragPreviewOffset.x, y: point.y + dragPreviewOffset.y }));
        }
      }
      
      // Safety check to prevent crashes from undefined points
      if (drawing.type !== 'note' && drawing.type !== 'text' && drawing.type !== 'ray' && 
          (!startPoint || (!endPoint && 
           ['trend_line', 'extended_line', 'arrow', 'parallel_channel', 'rectangle', 'ellipse'].includes(drawing.type)))) {
        console.warn(`⚠️ Skipping drawing ${drawing.id} due to missing required points`);
        return;
      }
      
      // Special check for ray - only needs startPoint
      if (drawing.type === 'ray' && !startPoint) {
        console.warn(`⚠️ Skipping ray ${drawing.id} due to missing start point`);
        return;
      }
      
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
      
      // TypeScript suppression for drawing rendering - points are validated above
      switch (drawing.type) {
        // Line Tools
        case 'trend_line':
        case 'extended_line':
          if (startPoint && endPoint) {
            ctx.moveTo(startPoint.x, startPoint.y);
            ctx.lineTo(endPoint.x, endPoint.y);
          }
          break;
          
        case 'ray':
          // TradingView-style horizontal ray: start point + infinite line to the right
          console.log('🌟 Rendering ray at:', startPoint);
          if (startPoint) {
            // Draw horizontal line extending to the right edge of the canvas
            ctx.moveTo(startPoint.x, startPoint.y);
            ctx.lineTo(ctx.canvas.width, startPoint.y);
            console.log('✅ Ray line drawn from', startPoint.x, startPoint.y, 'to', ctx.canvas.width, startPoint.y);
          }
          break;
          
        case 'horizontal_line':
          if (startPoint) {
            ctx.moveTo(0, startPoint.y);
            ctx.lineTo(ctx.canvas.width, startPoint.y);
          }
          break;
          
        case 'vertical_line':
          if (startPoint) {
            ctx.moveTo(startPoint.x, 0);
            ctx.lineTo(startPoint.x, ctx.canvas.height);
          }
          break;
          
        case 'cross_line':
          if (startPoint) {
            ctx.moveTo(0, startPoint.y);
            ctx.lineTo(ctx.canvas.width, startPoint.y);
            ctx.moveTo(startPoint.x, 0);
            ctx.lineTo(startPoint.x, ctx.canvas.height);
          }
          break;
          
        case 'arrow':
          if (startPoint && endPoint) {
            ctx.moveTo(startPoint.x, startPoint.y);
            ctx.lineTo(endPoint.x, endPoint.y);
            ctx.stroke();
            drawArrowHead(ctx, startPoint.x, startPoint.y, endPoint.x, endPoint.y);
            ctx.beginPath();
          }
          break;
          
        case 'parallel_channel':
          if (startPoint && endPoint) {
            const dx = endPoint.x - startPoint.x;
            const dy = endPoint.y - startPoint.y;
            const channelWidth = 50;
            const perpX = -dy / Math.sqrt(dx * dx + dy * dy) * channelWidth;
            const perpY = dx / Math.sqrt(dx * dx + dy * dy) * channelWidth;
            
            ctx.moveTo(startPoint.x, startPoint.y);
            ctx.lineTo(endPoint.x, endPoint.y);
            ctx.moveTo(startPoint.x + perpX, startPoint.y + perpY);
            ctx.lineTo(endPoint.x + perpX, endPoint.y + perpY);
          }
          break;

        // Geometric Shapes
        case 'rectangle':
          if (startPoint && endPoint) {
            ctx.rect(
              startPoint.x,
              startPoint.y,
              endPoint.x - startPoint.x,
              endPoint.y - startPoint.y
            );
          }
          break;
          
        case 'ellipse':
        case 'circle':
          if (startPoint && endPoint) {
            const centerX = (startPoint.x + endPoint.x) / 2;
            const centerY = (startPoint.y + endPoint.y) / 2;
            const radiusX = Math.abs(endPoint.x - startPoint.x) / 2;
            const radiusY = drawing.type === 'circle' ? radiusX : Math.abs(endPoint.y - startPoint.y) / 2;
            ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
          }
          break;
          
        case 'triangle':
          if (startPoint && endPoint) {
            const midX = (startPoint.x + endPoint.x) / 2;
            ctx.moveTo(midX, startPoint.y);
            ctx.lineTo(startPoint.x, endPoint.y);
            ctx.lineTo(endPoint.x, endPoint.y);
            ctx.closePath();
          }
          break;

        // Fibonacci Tools
        case 'fib_retracement':
          if (startPoint && endPoint) {
            ctx.moveTo(startPoint.x, startPoint.y);
            ctx.lineTo(endPoint.x, endPoint.y);
            ctx.stroke();
            
            // Draw fibonacci levels
            fibonacciLevels.forEach((level, index) => {
              if (startPoint && endPoint) {
                const levelY = startPoint.y + (endPoint.y - startPoint.y) * level;
                ctx.beginPath();
                ctx.setLineDash([2, 2]);
                ctx.moveTo(Math.min(startPoint.x, endPoint.x), levelY);
                ctx.lineTo(Math.max(startPoint.x, endPoint.x), levelY);
                ctx.stroke();
                
                if (drawing.style?.showLabels) {
                  ctx.fillText(`${(level * 100).toFixed(1)}%`, Math.max(startPoint.x, endPoint.x) + 5, levelY + 3);
                }
              }
            });
            ctx.setLineDash([]);
            ctx.beginPath();
          }
          break;
          
        case 'fib_extension':
          if (startPoint && endPoint) {
            ctx.moveTo(startPoint.x, startPoint.y);
            ctx.lineTo(endPoint.x, endPoint.y);
            ctx.stroke();
          
            fibonacciExtensionLevels.forEach((level, index) => {
              if (startPoint && endPoint) {
                const levelY = startPoint.y + (endPoint.y - startPoint.y) * level;
                ctx.beginPath();
                ctx.setLineDash([2, 2]);
                ctx.moveTo(Math.min(startPoint.x, endPoint.x), levelY);
                ctx.lineTo(Math.max(startPoint.x, endPoint.x), levelY);
                ctx.stroke();
                
                if (drawing.style?.showLabels) {
                  ctx.fillText(`${(level * 100).toFixed(1)}%`, Math.max(startPoint.x, endPoint.x) + 5, levelY + 3);
                }
              }
            });
            ctx.setLineDash([]);
            ctx.beginPath();
          }
          break;
          
        case 'fib_fan':
          if (startPoint && endPoint) {
            const baseLength = Math.sqrt((endPoint.x - startPoint.x) ** 2 + (endPoint.y - startPoint.y) ** 2);
            fibonacciLevels.forEach(level => {
              if (startPoint && endPoint) {
                const fanLength = baseLength * level;
                const angle = Math.atan2(endPoint.y - startPoint.y, endPoint.x - startPoint.x);
                const fanX = startPoint.x + fanLength * Math.cos(angle);
                const fanY = startPoint.y + fanLength * Math.sin(angle);
                ctx.moveTo(startPoint.x, startPoint.y);
                ctx.lineTo(fanX, fanY);
              }
            });
          }
          break;

        // Gann Tools
        case 'gann_fan':
          if (startPoint) {
            gannAngles.forEach(angle => {
              if (startPoint) {
                const radians = (angle * Math.PI) / 180;
                const length = 200;
                const gannX = startPoint.x + length * Math.cos(radians);
                const gannY = startPoint.y - length * Math.sin(radians);
                ctx.moveTo(startPoint.x, startPoint.y);
                ctx.lineTo(gannX, gannY);
              }
            });
          }
          break;
          
        case 'gann_box':
          if (startPoint && endPoint) {
            const boxSize = Math.max(Math.abs(endPoint.x - startPoint.x), Math.abs(endPoint.y - startPoint.y));
            ctx.rect(startPoint.x, startPoint.y, boxSize, boxSize);
            ctx.stroke();
            
            // Draw internal divisions
            for (let i = 1; i < 8; i++) {
              const div = (boxSize / 8) * i;
              ctx.beginPath();
              ctx.moveTo(startPoint.x + div, startPoint.y);
              ctx.lineTo(startPoint.x + div, startPoint.y + boxSize);
              ctx.moveTo(startPoint.x, startPoint.y + div);
              ctx.lineTo(startPoint.x + boxSize, startPoint.y + div);
              ctx.stroke();
            }
            ctx.beginPath();
          }
          break;

        // Multi-point tools
        case 'pitchfork':
        case 'schiff_pitchfork':
        case 'inside_pitchfork':
          if (points && points.length >= 3) {
            drawPitchfork(ctx, points[0], points[1], points[2], drawing.type);
          }
          break;
          
        case 'elliott_wave':
          if (points && points.length > 1) {
            points.forEach((point: DrawingPoint, index: number) => {
              if (index > 0 && points) {
                ctx.moveTo(points[index - 1].x, points[index - 1].y);
                ctx.lineTo(point.x, point.y);
              }
              
              if (drawing.style?.showLabels && drawing.metadata?.waveLabels) {
                const waveMetadata = drawing.metadata as WaveDrawingMetadata;
                ctx.fillText(waveMetadata.waveLabels[index], point.x + 5, point.y - 5);
              }
            });
          }
          break;

        // Pattern Recognition
        case 'head_shoulders':
        case 'triangle_pattern':
        case 'flag_pattern':
        case 'wedge_pattern':
          if (points && points.length > 1) {
            points.forEach((point: DrawingPoint, index: number) => {
              if (index > 0 && points) {
                ctx.moveTo(points[index - 1].x, points[index - 1].y);
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
          if (points && points.length >= 4) {
            const [X, A, B, C] = points;
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
          if (startPoint && endPoint) {
            ctx.moveTo(startPoint.x, startPoint.y);
            ctx.lineTo(endPoint.x, endPoint.y);
            ctx.stroke();
            
            if (drawing.metadata && drawing.style?.showLabels) {
              const measureMetadata = drawing.metadata as MeasureDrawingMetadata;
              const midX = (startPoint.x + endPoint.x) / 2;
              const midY = (startPoint.y + endPoint.y) / 2;
              ctx.fillText(
                `${measureMetadata.distance.toFixed(1)}px, ${measureMetadata.angle.toFixed(1)}°`,
                midX, midY - 10
              );
              ctx.fillText(
                `$${measureMetadata.priceDistance.toFixed(2)}`,
                midX, midY + 10
              );
            }
          }
          break;
          
        case 'price_range':
          if (startPoint && endPoint) {
            ctx.rect(0, Math.min(startPoint.y, endPoint.y),
                    ctx.canvas.width, Math.abs(endPoint.y - startPoint.y));
            ctx.fill();
          }
          break;
          
        case 'date_range':
          if (startPoint && endPoint) {
            ctx.rect(Math.min(startPoint.x, endPoint.x), 0, 
                    Math.abs(endPoint.x - startPoint.x), ctx.canvas.height);
            ctx.fill();
          }
          break;
          
        // Volume Analysis
        case 'volume_profile':
          if (startPoint && endPoint) {
            ctx.rect(Math.min(startPoint.x, endPoint.x), 
                    Math.min(startPoint.y, endPoint.y),
                    Math.abs(endPoint.x - startPoint.x), 
                    Math.abs(endPoint.y - startPoint.y));
            ctx.stroke();
            
            // Draw volume bars
            const barCount = 10;
            const barHeight = Math.abs(endPoint.y - startPoint.y) / barCount;
            for (let i = 0; i < barCount; i++) {
              const barY = Math.min(startPoint.y, endPoint.y) + i * barHeight;
              const barWidth = Math.random() * Math.abs(endPoint.x - startPoint.x) * 0.8;
              ctx.fillRect(Math.min(startPoint.x, endPoint.x), barY, barWidth, barHeight * 0.8);
            }
          }
          break;

        // Text and Annotation Tools
        case 'text':
        case 'note':
        case 'callout':
        case 'price_label':
        case 'anchored_text':
        case 'flag':
          if (drawing.text && startPoint) {
            ctx.fillText(drawing.text, startPoint.x, startPoint.y);
          }
          break;

        // Trading Position Markers
        case 'long_position':
          if (startPoint) {
            ctx.beginPath();
            ctx.arc(startPoint.x, startPoint.y, 8, 0, 2 * Math.PI);
            ctx.fillStyle = '#00ff88';
            ctx.fill();
            ctx.fillStyle = '#000000';
            ctx.fillText('L', startPoint.x - 3, startPoint.y + 3);
          }
          break;
          
        case 'short_position':
          if (startPoint) {
            ctx.beginPath();
            ctx.arc(startPoint.x, startPoint.y, 8, 0, 2 * Math.PI);
            ctx.fillStyle = '#ff4444';
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.fillText('S', startPoint.x - 3, startPoint.y + 3);
          }
          break;
          
        case 'price_alert':
          if (startPoint) {
            ctx.beginPath();
            ctx.arc(startPoint.x, startPoint.y, 6, 0, 2 * Math.PI);
            ctx.fillStyle = '#ffaa00';
            ctx.fill();
            if (drawing.text) {
              ctx.fillStyle = drawing.style?.color || '#ffaa00';
              ctx.fillText(drawing.text, startPoint.x + 10, startPoint.y);
            }
          }
          break;

        default:
          // Default line drawing for unknown tools
          if (startPoint && endPoint) {
            ctx.moveTo(startPoint.x, startPoint.y);
            ctx.lineTo(endPoint.x, endPoint.y);
          }
          break;
      }
      
      ctx.stroke();
      ctx.setLineDash([]); // Reset line dash
      
      // TradingView-style ray enhancements: Add start point marker and price label
      if (drawing.type === 'ray' && startPoint) {
        // Draw start point marker (small circle)
        ctx.fillStyle = highlightColor;
        ctx.beginPath();
        ctx.arc(startPoint.x, startPoint.y, 4, 0, 2 * Math.PI);
        ctx.fill();
        
        // Draw price label on Y-axis (right side) using TradingView time+price data
        if (drawing.time && drawing.price !== undefined) {
          const price = drawing.price;
          const priceText = price.toFixed(2);
          
          // Position the label on the right edge of the chart
          const labelX = ctx.canvas.width - 60;
          const labelY = startPoint.y;
          
          // Draw background rectangle for price label
          ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
          const textWidth = ctx.measureText(priceText).width + 8;
          ctx.fillRect(labelX - 4, labelY - 10, textWidth, 16);
          
          // Draw price text
          ctx.fillStyle = highlightColor;
          ctx.font = '12px Arial';
          ctx.fillText(priceText, labelX, labelY + 3);
        } else if (drawing.startDataPoint) {
          // Fallback to legacy data point
          const price = drawing.startDataPoint.price;
          const priceText = price.toFixed(2);
          
          // Position the label on the right edge of the chart
          const labelX = ctx.canvas.width - 60;
          const labelY = startPoint.y;
          
          // Draw background rectangle for price label
          ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
          const textWidth = ctx.measureText(priceText).width + 8;
          ctx.fillRect(labelX - 4, labelY - 10, textWidth, 16);
          
          // Draw price text
          ctx.fillStyle = highlightColor;
          ctx.font = '12px Arial';
          ctx.fillText(priceText, labelX, labelY + 3);
        }
      }
    });
  };

  // Property Editor Component for Selected Drawings
  // TEST COMMENT
  const PropertyEditor = () => {
    if (!showDrawingEditor || !selectedDrawing) return null;

    const currentStyle = selectedDrawing.style || {};

    const updateDrawingStyle = (updates: Partial<DrawingStyle>) => {
      setDrawings((prev: Drawing[]) => prev.map(d => 
        d.id === selectedDrawing.id 
          ? { ...d, style: { ...d.style, ...updates } }
          : d
      ));
      setSelectedDrawing((prev: Drawing | null) => prev ? { ...prev, style: { ...prev.style, ...updates } } : null);
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
                  setDrawings((prev: Drawing[]) => prev.map(d => 
                    d.id === selectedDrawing.id 
                      ? { ...d, text: e.target.value }
                      : d
                  ));
                  setSelectedDrawing((prev: Drawing | null) => prev ? { ...prev, text: e.target.value } : null);
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
                    <div 
                      className="grid grid-cols-7 gap-0 hover:bg-gradient-to-r hover:from-gray-700 hover:via-gray-800 hover:to-gray-900 hover:shadow-xl transition-all duration-300 cursor-pointer mb-1 bg-gradient-to-r from-black via-gray-900 to-black shadow-lg border border-gray-800 hover:border-gray-600"
                      onClick={() => {
                        console.log(`📊 Switching chart to ${symbol}`);
                        if (onSymbolChange) {
                          onSymbolChange(symbol);
                        }
                        // Update the config state as well
                        setConfig(prev => ({ ...prev, symbol }));
                      }}
                    >
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

  // RegimesPanel component removed for reconstruction
  // RegimesPanel component removed for reconstruction

  // RegimesPanel component removed for reconstruction

  // RegimesPanel component removed for reconstruction
  // RegimesPanel component removed for reconstruction
  // RegimesPanel component removed for reconstruction
  // Enhanced Market Regimes Panel Component with advanced analytics
  const RegimesPanel = ({ activeTab, setActiveTab }: { activeTab: string, setActiveTab: (tab: string) => void }) => {
    // Remove empty tabs - only keep the functional content
    // const [viewMode, setViewMode] = React.useState<'overview'>('overview');
    
    const getCurrentTimeframeData = () => {
      if (!marketRegimeData) return null;
      
      switch (activeTab) {
        case 'Life':
          return marketRegimeData.life;
        case 'Developing':
          return marketRegimeData.developing;
        case 'Momentum':
          return marketRegimeData.momentum;
        default:
          return marketRegimeData.life;
      }
    };

    const timeframeData = getCurrentTimeframeData();
    const bullishIndustries = timeframeData?.industries.filter(industry => industry.trend === 'bullish').slice(0, 20) || [];
    const bearishIndustries = timeframeData?.industries.filter(industry => industry.trend === 'bearish').slice(0, 20) || [];

    return (
      <div className="h-full flex flex-col" style={{
        background: 'linear-gradient(145deg, #000000 0%, #0a0a0a 25%, #000000 50%, #0a0a0a 75%, #000000 100%)',
        boxShadow: 'inset 0 0 20px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
        borderRadius: '0',
        overflow: 'hidden'
      }}>
        {/* Professional Glossy Header */}
        <div style={{
          background: 'linear-gradient(145deg, #000000 0%, #1a1a1a 50%, #000000 100%)',
          borderBottom: '2px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.9), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
        }}>
          {/* Enhanced Centered Title */}
          <div className="px-8 py-8 text-center relative" style={{
            background: 'linear-gradient(145deg, #000000 0%, #1a1a1a 25%, #2a2a2a 50%, #1a1a1a 75%, #000000 100%)',
            borderBottom: '2px solid rgba(255, 255, 255, 0.15)',
            boxShadow: 'inset 0 4px 12px rgba(0, 0, 0, 0.8), inset 0 -2px 8px rgba(255, 255, 255, 0.05), 0 8px 20px rgba(0, 0, 0, 0.6)',
            position: 'relative',
            overflow: 'hidden'
          }}>
            {/* Background enhancement elements */}
            <div className="absolute inset-0" style={{
              background: 'radial-gradient(ellipse at center, rgba(255, 255, 255, 0.03) 0%, transparent 70%)',
              pointerEvents: 'none'
            }}/>
            <div className="absolute inset-0" style={{
              background: 'linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.02) 50%, transparent 100%)',
              pointerEvents: 'none'
            }}/>
            
            <h1 className="font-mono font-bold tracking-[0.25em] uppercase relative z-10" style={{
              fontSize: '32px',
              background: 'linear-gradient(135deg, #ffffff 0%, #f0f0f0 25%, #ffffff 50%, #f0f0f0 75%, #ffffff 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              textShadow: '0 4px 15px rgba(255, 255, 255, 0.4), 0 0 40px rgba(255, 255, 255, 0.15), 0 2px 0 rgba(0, 0, 0, 0.8)',
              letterSpacing: '0.2em',
              lineHeight: '1.2',
              filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.8))'
            }}>
              Market Regimes
            </h1>
            
            {/* Subtle decorative elements */}
            <div className="absolute left-1/2 bottom-2 transform -translate-x-1/2" style={{
              width: '60px',
              height: '2px',
              background: 'linear-gradient(90deg, transparent 0%, #ffffff 50%, transparent 100%)',
              opacity: 0.3
            }}/>
          </div>
          
          {/* Professional 3D Tabs */}
          <div className="px-6 py-8 flex justify-center">
            <div className="flex" style={{
              background: 'linear-gradient(145deg, #000000 0%, #0a0a0a 50%, #000000 100%)',
              borderRadius: '12px',
              padding: '6px',
              boxShadow: 'inset 0 4px 8px rgba(0, 0, 0, 0.8), inset 0 -4px 8px rgba(0, 0, 0, 0.6), 0 0 20px rgba(0, 0, 0, 0.9)',
              border: '1px solid rgba(255, 255, 255, 0.05)'
            }}>
              {['Life', 'Developing', 'Momentum'].map((tab, index) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className="relative px-8 py-4 text-lg font-bold transition-all duration-300 font-mono uppercase tracking-wider"
                  style={{
                    background: activeTab === tab 
                      ? 'linear-gradient(145deg, #1a1a1a 0%, #000000 25%, #2a2a2a 50%, #000000 75%, #1a1a1a 100%)'
                      : 'linear-gradient(145deg, #000000 0%, #0a0a0a 50%, #000000 100%)',
                    color: activeTab === tab ? '#ffffff' : '#666666',
                    borderRadius: '8px',
                    margin: '0 2px',
                    minWidth: '140px',
                    textShadow: activeTab === tab 
                      ? '0 2px 4px rgba(0, 0, 0, 0.9), 0 0 10px rgba(255, 255, 255, 0.2)' 
                      : '0 1px 2px rgba(0, 0, 0, 0.8)',
                    boxShadow: activeTab === tab
                      ? 'inset 0 2px 4px rgba(0, 0, 0, 0.8), inset 0 -2px 4px rgba(255, 255, 255, 0.1), 0 4px 12px rgba(0, 0, 0, 0.7)'
                      : 'inset 0 1px 2px rgba(0, 0, 0, 0.6), inset 0 -1px 2px rgba(255, 255, 255, 0.02), 0 2px 6px rgba(0, 0, 0, 0.5)',
                    border: activeTab === tab 
                      ? '1px solid rgba(255, 255, 255, 0.1)' 
                      : '1px solid rgba(255, 255, 255, 0.02)',
                    transform: activeTab === tab ? 'translateY(-1px)' : 'translateY(0)',
                    letterSpacing: '0.1em'
                  }}
                  onMouseEnter={(e) => {
                    if (activeTab !== tab) {
                      e.currentTarget.style.background = 'linear-gradient(145deg, #0a0a0a 0%, #1a1a1a 50%, #0a0a0a 100%)';
                      e.currentTarget.style.color = '#cccccc';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.style.boxShadow = 'inset 0 2px 4px rgba(0, 0, 0, 0.7), inset 0 -2px 4px rgba(255, 255, 255, 0.05), 0 4px 10px rgba(0, 0, 0, 0.6)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (activeTab !== tab) {
                      e.currentTarget.style.background = 'linear-gradient(145deg, #000000 0%, #0a0a0a 50%, #000000 100%)';
                      e.currentTarget.style.color = '#666666';
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = 'inset 0 1px 2px rgba(0, 0, 0, 0.6), inset 0 -1px 2px rgba(255, 255, 255, 0.02), 0 2px 6px rgba(0, 0, 0, 0.5)';
                    }
                  }}
                >
                  {tab}
                  {activeTab === tab && (
                    <div 
                      className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 rounded-full"
                      style={{
                        width: '30px',
                        height: '3px',
                        background: 'linear-gradient(90deg, transparent 0%, #ffffff 50%, transparent 100%)',
                        boxShadow: '0 0 10px rgba(255, 255, 255, 0.5)'
                      }}
                    />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
        
        {/* Progress bar */}
        {isLoadingRegimes && (
          <div className="w-full bg-[#1a1a1a]">
            <div 
              className="bg-emerald-500 h-1 transition-all duration-300 ease-out"
              style={{ width: `${regimeUpdateProgress}%` }}
            />
          </div>
        )}
        
        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {isLoadingRegimes && !marketRegimeData ? (
            <div className="flex flex-col items-center justify-center h-full space-y-4">
              <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
              <div className="text-white text-opacity-60 text-sm text-center">
                <div>{regimeLoadingStage}</div>
                <div className="text-xs text-white text-opacity-40 mt-1">{regimeUpdateProgress}% complete</div>
                <div className="text-xs text-emerald-400 mt-2">📊 Auto-loading on startup...</div>
              </div>
            </div>
          ) : !marketRegimeData ? (
            <div className="flex flex-col items-center justify-center h-full space-y-4">
              <div className="text-white text-opacity-60 text-center">
                <div className="text-lg mb-2">📊</div>
                <div>Market Regime Analysis</div>
                <div className="text-xs text-white text-opacity-40 mt-1">Analysis loading automatically...</div>
              </div>
            </div>
          ) : (
            <div className="h-full overflow-y-auto">
              {/* Show streaming indicator while still loading */}
              {isLoadingRegimes && (
                <div className="mx-4 mt-3 px-3 py-2 bg-emerald-900 bg-opacity-20 border border-emerald-500 border-opacity-30 rounded text-xs text-emerald-400">
                  🔄 {regimeLoadingStage} ({regimeUpdateProgress}% complete)
                </div>
              )}
              
              {/* Content - Industry Lists */}
              <div className="p-4">
                {/* Industry Lists */}
                <div className="grid grid-cols-2 gap-6">
                  {/* Bullish Industries */}
                  <div className="space-y-4">
                    <h3 className="text-xl font-bold text-green-400 uppercase tracking-wider mb-4">Bullish Industries</h3>
                    <div className="grid grid-cols-2 gap-3">
                    {bullishIndustries.length > 0 ? bullishIndustries.map((industry, index) => (
                      <div 
                        key={industry.symbol} 
                        className="group p-4 rounded-lg bg-black border border-green-400 border-opacity-20 hover:border-green-400 hover:border-opacity-40 transition-all duration-200 shadow-lg"
                      >
                        <div className="flex justify-between items-center mb-3">
                          <div className="flex items-center">
                            <span className="text-base text-gray-500 mr-3 font-mono">#{index + 1}</span>
                            <span className="text-green-400 font-bold text-xl tracking-wide">{industry.symbol}</span>
                          </div>
                          <div className="text-green-300 text-base font-mono bg-green-400 bg-opacity-10 px-2 py-1 rounded">
                            +{industry.relativePerformance.toFixed(2)}%
                          </div>
                        </div>
                        <div className="text-white text-lg mb-1 font-medium">{industry.name}</div>
                        
                        {/* Top Performing Stocks within this Industry */}
                        {industry.topPerformers && industry.topPerformers.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-green-400 border-opacity-20">
                            <div className="space-y-2">
                              {industry.topPerformers.slice(0, 3).map((stock, stockIndex) => (
                                <div 
                                  key={stock.symbol} 
                                  className="flex justify-between items-center bg-gray-900 bg-opacity-50 px-3 py-2 rounded cursor-pointer hover:bg-gray-800 hover:bg-opacity-60 transition-all duration-200"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    console.log(`📊 Switching chart to ${stock.symbol} from bullish industry`);
                                    if (onSymbolChange) {
                                      onSymbolChange(stock.symbol);
                                    }
                                    setConfig(prev => ({ ...prev, symbol: stock.symbol }));
                                  }}
                                >
                                  <span className="text-white font-mono font-medium text-base">{stock.symbol}</span>
                                  <span className="text-green-400 font-mono font-bold text-base">
                                    +{stock.relativePerformance.toFixed(1)}%
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )) : (
                      <div className="p-4 rounded-lg bg-black border border-gray-500 border-opacity-30 text-center">
                        <div className="text-gray-400 text-base">No bullish industries</div>
                        <div className="text-gray-500 text-sm mt-1">in this timeframe</div>
                      </div>
                    )}
                    </div>
                  </div>
                  
                  {/* Bearish Industries */}
                  <div className="space-y-4">
                    <h3 className="text-xl font-bold text-red-400 uppercase tracking-wider mb-4">Bearish Industries</h3>
                    <div className="grid grid-cols-2 gap-3">
                    {bearishIndustries.length > 0 ? bearishIndustries.map((industry, index) => (
                      <div 
                        key={industry.symbol} 
                        className="group p-4 rounded-lg bg-black border border-red-400 border-opacity-20 hover:border-red-400 hover:border-opacity-40 transition-all duration-200 shadow-lg"
                      >
                        <div className="flex justify-between items-center mb-3">
                          <div className="flex items-center">
                            <span className="text-base text-gray-500 mr-3 font-mono">#{index + 1}</span>
                            <span className="text-red-400 font-bold text-xl tracking-wide">{industry.symbol}</span>
                          </div>
                          <div className="text-red-300 text-base font-mono bg-red-400 bg-opacity-10 px-2 py-1 rounded">
                            {industry.relativePerformance.toFixed(2)}%
                          </div>
                        </div>
                        <div className="text-white text-lg mb-1 font-medium">{industry.name}</div>
                        
                        {/* Worst Performing Stocks within this Industry */}
                        {industry.worstPerformers && industry.worstPerformers.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-red-400 border-opacity-20">
                            <div className="space-y-2">
                              {industry.worstPerformers.slice(0, 3).map((stock, stockIndex) => (
                                <div 
                                  key={stock.symbol} 
                                  className="flex justify-between items-center bg-gray-900 bg-opacity-50 px-3 py-2 rounded cursor-pointer hover:bg-gray-800 hover:bg-opacity-60 transition-all duration-200"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    console.log(`📊 Switching chart to ${stock.symbol} from bearish industry`);
                                    if (onSymbolChange) {
                                      onSymbolChange(stock.symbol);
                                    }
                                    setConfig(prev => ({ ...prev, symbol: stock.symbol }));
                                  }}
                                >
                                  <span className="text-white font-mono font-medium text-base">{stock.symbol}</span>
                                  <span className="text-red-400 font-mono font-bold text-base">
                                    {stock.relativePerformance.toFixed(1)}%
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )) : (
                      <div className="p-4 rounded-lg bg-black border border-gray-500 border-opacity-30 text-center">
                        <div className="text-gray-400 text-base">No bearish industries</div>
                        <div className="text-gray-500 text-sm mt-1">in this timeframe</div>
                      </div>
                    )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };
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
                : 'text-white text-opacity-60 hover:text-white hover:text-opacity-80'
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
            <div className="w-8 h-8 rounded-full bg-blue-500 bg-opacity-20 flex items-center justify-center">
              <span className="text-blue-400 text-sm font-medium">U</span>
            </div>
            <div className="flex-1">
              <div className="flex items-center space-x-2">
                <span className="text-white text-opacity-80 font-medium">User {i + 1}</span>
                <span className="text-white text-opacity-40 text-xs">2m ago</span>
              </div>
              <div className="text-white text-opacity-70 text-sm mt-1">
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
          <button className="p-2 text-white text-opacity-60 hover:text-violet-400 transition-colors">
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
      {/* Advanced CSS for Premium Navigation and 3D Effects */}
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
          
          /* Premium Navigation Animations */
          @keyframes premiumGlow {
            0% { box-shadow: 0 4px 20px rgba(0, 0, 0, 0.9), inset 0 1px 0 rgba(128, 128, 128, 0.1), 0 0 15px rgba(64, 64, 64, 0.05); }
            50% { box-shadow: 0 4px 20px rgba(0, 0, 0, 0.9), inset 0 1px 0 rgba(128, 128, 128, 0.2), 0 0 20px rgba(64, 64, 64, 0.1); }
            100% { box-shadow: 0 4px 20px rgba(0, 0, 0, 0.9), inset 0 1px 0 rgba(128, 128, 128, 0.1), 0 0 15px rgba(64, 64, 64, 0.05); }
          }
          
          @keyframes grayBorderSweep {
            0% { background-position: -200% 0; }
            100% { background-position: 200% 0; }
          }
          
          @keyframes subtleShimmer {
            0% { opacity: 0.7; transform: translateX(-100%); }
            50% { opacity: 0.9; transform: translateX(0%); }
            100% { opacity: 0.7; transform: translateX(100%); }
          }
          
          /* 3D Carved Button Effects */
          .btn-3d-carved {
            background: linear-gradient(145deg, #1a1a1a 0%, #000000 50%, #1a1a1a 100%) !important;
            border: 1px solid rgba(128, 128, 128, 0.2) !important;
            box-shadow: 
              inset 2px 2px 4px rgba(128, 128, 128, 0.05),
              inset -2px -2px 4px rgba(0, 0, 0, 0.8),
              0 4px 8px rgba(0, 0, 0, 0.6),
              0 0 0 1px rgba(64, 64, 64, 0.1) !important;
            text-shadow: 
              1px 1px 0px rgba(0, 0, 0, 0.9),
              -1px -1px 0px rgba(128, 128, 128, 0.1),
              0 0 5px rgba(128, 128, 128, 0.1) !important;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
            border-radius: 2px !important;
          }
          
          /* Active State - Crispy Orange */
          .btn-3d-carved.active {
            background: linear-gradient(145deg, #2a1a0a 0%, #1a1000 50%, #2a1a0a 100%) !important;
            border: 1px solid rgba(255, 140, 0, 0.4) !important;
            color: #ff8c00 !important;
            box-shadow: 
              inset 2px 2px 4px rgba(255, 140, 0, 0.1),
              inset -2px -2px 4px rgba(0, 0, 0, 0.8),
              0 4px 8px rgba(0, 0, 0, 0.6),
              0 0 0 1px rgba(255, 140, 0, 0.3),
              0 0 10px rgba(255, 140, 0, 0.2) !important;
            text-shadow: 
              1px 1px 0px rgba(0, 0, 0, 0.9),
              -1px -1px 0px rgba(255, 140, 0, 0.2),
              0 0 8px rgba(255, 140, 0, 0.4) !important;
          }
          
          .btn-3d-carved:hover {
            background: linear-gradient(145deg, #2a2a2a 0%, #1a1a1a 50%, #2a2a2a 100%) !important;
            box-shadow: 
              inset 2px 2px 6px rgba(128, 128, 128, 0.1),
              inset -2px -2px 6px rgba(0, 0, 0, 0.9),
              0 6px 12px rgba(0, 0, 0, 0.7),
              0 0 0 1px rgba(96, 96, 96, 0.2) !important;
            transform: translateY(-1px) !important;
          }
          
          .btn-3d-carved.active:hover {
            background: linear-gradient(145deg, #3a2a1a 0%, #2a1a0a 50%, #3a2a1a 100%) !important;
            box-shadow: 
              inset 2px 2px 6px rgba(255, 140, 0, 0.15),
              inset -2px -2px 6px rgba(0, 0, 0, 0.9),
              0 6px 12px rgba(0, 0, 0, 0.7),
              0 0 0 1px rgba(255, 140, 0, 0.4),
              0 0 15px rgba(255, 140, 0, 0.3) !important;
            transform: translateY(-1px) !important;
          }
          
          .btn-3d-carved:active {
            background: linear-gradient(145deg, #0a0a0a 0%, #000000 50%, #0a0a0a 100%) !important;
            box-shadow: 
              inset 3px 3px 6px rgba(0, 0, 0, 0.9),
              inset -1px -1px 3px rgba(128, 128, 128, 0.05),
              0 2px 4px rgba(0, 0, 0, 0.5) !important;
            transform: translateY(1px) !important;
          }
          
          /* Professional Search Bar */
          .search-bar-premium {
            background: linear-gradient(145deg, #0a0a0a 0%, #1a1a1a 100%) !important;
            border: 2px solid rgba(128, 128, 128, 0.3) !important;
            box-shadow: 
              inset 0 2px 4px rgba(0, 0, 0, 0.8),
              inset 0 -2px 4px rgba(128, 128, 128, 0.05),
              0 4px 12px rgba(0, 0, 0, 0.6),
              0 0 0 1px rgba(96, 96, 96, 0.2) !important;
            border-radius: 3px !important;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
          }
          
          .search-bar-premium:focus-within {
            border: 2px solid rgba(160, 160, 160, 0.6) !important;
            box-shadow: 
              inset 0 2px 4px rgba(0, 0, 0, 0.8),
              inset 0 -2px 4px rgba(128, 128, 128, 0.1),
              0 4px 12px rgba(0, 0, 0, 0.6),
              0 0 15px rgba(128, 128, 128, 0.2),
              0 0 0 2px rgba(96, 96, 96, 0.1) !important;
          }
          
          /* Premium Navigation Container */
          .navigation-bar-premium {
            position: relative;
            overflow: hidden;
          }
          
          .navigation-bar-premium::before {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(128, 128, 128, 0.05), transparent);
            animation: subtleSweep 6s ease-in-out infinite;
            pointer-events: none;
          }
          
          @keyframes subtleSweep {
            0% { left: -100%; }
            50% { left: 100%; }
            100% { left: -100%; }
          }
          
          /* Sharp Corner Enhancements */
          .sharp-corners {
            border-radius: 0 !important;
            clip-path: polygon(0 0, calc(100% - 4px) 0, 100% 4px, 100% 100%, 4px 100%, 0 calc(100% - 4px));
          }
        `
      }} />
      
      <div className="w-full h-full rounded-lg overflow-hidden" style={{ backgroundColor: colors.background }}>
      {/* Premium Bloomberg Terminal Top Bar with Solid Black & Gold */}
      <div 
        className="h-14 border-b flex items-center justify-between px-6 relative navigation-bar-premium"
        style={{ 
          background: '#000000',
          backgroundSize: '400% 400%',
          borderColor: '#333333',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.9), inset 0 1px 0 rgba(128, 128, 128, 0.1), 0 0 15px rgba(64, 64, 64, 0.05)',
          backdropFilter: 'blur(10px)',
          zIndex: 10000,
          animation: 'premiumGlow 8s ease infinite alternate'
        }}
      >
        {/* Premium Gray Border Animation */}
        <div 
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(128, 128, 128, 0.3), transparent)',
            backgroundSize: '200% 100%',
            animation: 'grayBorderSweep 5s linear infinite',
            borderRadius: 'inherit',
            opacity: 0.6
          }}
        />
        
        {/* Premium Metallic Overlay */}
        <div 
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(180deg, rgba(128, 128, 128, 0.05) 0%, transparent 30%, transparent 70%, rgba(96, 96, 96, 0.02) 100%)',
            borderRadius: 'inherit',
            animation: 'subtleShimmer 10s ease-in-out infinite'
          }}
        />
        
        {/* Drawing Tools Status Badge */}
        <div className="absolute top-2 left-4 z-20">
          <div
            className="flex items-center space-x-2 px-3 py-1 rounded-full bg-black bg-opacity-60 backdrop-blur border border-gray-600 border-opacity-50"
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
        <div className="flex items-center w-full relative z-10">
          {/* Left side: Symbol Search + Price + Controls */}
          <div className="flex items-center space-x-8 flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="relative flex items-center">
              <div className="search-bar-premium flex items-center space-x-2 px-3 py-2 rounded-md">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ color: 'rgba(128, 128, 128, 0.5)' }}>
                  <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/>
                  <path d="m21 21-4.35-4.35" stroke="currentColor" strokeWidth="2"/>
                </svg>
                <input
                  type="text"
                  value={searchQuery || symbol}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={handleSearchKeyPress}
                  className="bg-transparent border-0 outline-none w-28 text-lg font-bold"
                  style={{
                    color: '#ffffff',
                    textShadow: '0 0 5px rgba(128, 128, 128, 0.2), 0 1px 2px rgba(0, 0, 0, 0.8)',
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
          
          <div className="flex flex-col items-start space-y-1">
            <span 
              className="font-mono text-xl font-bold leading-tight"
              style={{
                color: '#ffffff',
                textShadow: '0 1px 2px rgba(0, 0, 0, 0.8), 0 0 8px rgba(255, 255, 255, 0.2)',
                letterSpacing: '0.3px'
              }}
            >
              ${currentPrice.toFixed(2)}
            </span>
            <span 
              className="font-mono text-xs font-semibold px-2 py-0.5 rounded"
              style={{
                color: priceChangePercent >= 0 ? '#10b981' : '#ef4444',
                background: priceChangePercent >= 0 
                  ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(16, 185, 129, 0.05) 100%)'
                  : 'linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(239, 68, 68, 0.05) 100%)',
                textShadow: `0 1px 1px rgba(0, 0, 0, 0.8), 0 0 6px ${priceChangePercent >= 0 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                border: `1px solid ${priceChangePercent >= 0 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                letterSpacing: '0.2px'
              }}
            >
              {priceChangePercent >= 0 ? '+' : ''}{priceChange.toFixed(2)} ({priceChangePercent.toFixed(2)}%)
            </span>
          </div>

          {/* Timeframes - Moved closer to symbol/price */}
          <div 
            className="flex items-center timeframe-dropdown"
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
                className={`btn-3d-carved relative group ${config.timeframe === tf.value ? 'active' : 'text-white'}`}
                style={{
                  padding: '10px 20px',
                  fontWeight: '700',
                  fontSize: '15px',
                  letterSpacing: '0.8px',
                  borderRadius: '4px'
                }}
              >
                {tf.label}
              </button>
            ))}
            
            {/* Dropdown Toggle Button - Integrated */}
            <div className="relative">
              <button
                ref={timeframeButtonRef}
                onClick={() => {
                  setShowTimeframeDropdown(!showTimeframeDropdown);
                  if (!showTimeframeDropdown) {
                    updateDropdownPosition('timeframe');
                  }
                }}
                className={`btn-3d-carved relative group flex items-center space-x-1 ${['1m', '15m', '1w', '1mo'].includes(config.timeframe) ? 'active' : 'text-white'}`}
                style={{
                  padding: '8px 12px',
                  fontWeight: '600',
                  fontSize: '13px',
                  letterSpacing: '0.5px',
                  borderRadius: '4px'
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
              
            </div>
          </div>

          {/* Glowing Orange Separator */}
          <div className="mx-8" style={{
            width: '4px',
            height: '50px',
            background: 'linear-gradient(180deg, transparent 0%, #ff6600 15%, #ff8833 50%, #ff6600 85%, transparent 100%)',
            boxShadow: '0 0 12px rgba(255, 102, 0, 0.8), 0 0 24px rgba(255, 102, 0, 0.4), 0 0 32px rgba(255, 102, 0, 0.2)',
            borderRadius: '2px'
          }}></div>

          {/* Chart Type Selector - Moved to left side */}
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
                className={`btn-3d-carved relative group ${config.chartType === type.value ? 'active' : 'text-white'}`}
                style={{
                  padding: '10px 14px',
                  fontSize: '16px',
                  fontWeight: '700',
                  borderRadius: '4px'
                }}
                title={type.label}
              >
                {type.icon}
              </button>
            ))}
          </div>

          {/* Glowing Orange Separator */}
          <div className="mx-8" style={{
            width: '4px',
            height: '50px',
            background: 'linear-gradient(180deg, transparent 0%, #ff6600 15%, #ff8833 50%, #ff6600 85%, transparent 100%)',
            boxShadow: '0 0 12px rgba(255, 102, 0, 0.8), 0 0 24px rgba(255, 102, 0, 0.4), 0 0 32px rgba(255, 102, 0, 0.2)',
            borderRadius: '2px'
          }}></div>

          {/* Indicators Button - Moved to left side */}
          <div className="relative indicators-dropdown search-bar-premium">
            <button 
              ref={indicatorsButtonRef}
              onClick={() => {
                setShowIndicatorsDropdown(!showIndicatorsDropdown);
                if (!showIndicatorsDropdown) {
                  updateDropdownPosition('indicators');
                }
              }}
              className={`btn-3d-carved relative group flex items-center space-x-2 ${showIndicatorsDropdown || config.indicators.length > 0 ? 'active' : 'text-white'}`}
              style={{
                padding: '10px 14px',
                fontWeight: '700',
                fontSize: '13px',
                borderRadius: '4px'
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
          </div>

          {/* Glowing Orange Separator */}
          <div className="mx-8" style={{
            width: '4px',
            height: '50px',
            background: 'linear-gradient(180deg, transparent 0%, #ff6600 15%, #ff8833 50%, #ff6600 85%, transparent 100%)',
            boxShadow: '0 0 12px rgba(255, 102, 0, 0.8), 0 0 24px rgba(255, 102, 0, 0.4), 0 0 32px rgba(255, 102, 0, 0.2)',
            borderRadius: '2px'
          }}></div>

          {/* Favorites Drawing Tools Bar */}
          {favoriteDrawingTools.length > 0 && (
            <div className="flex items-center space-x-1 px-3 py-2 rounded-md" style={{
              background: 'linear-gradient(145deg, #1a1a1a 0%, #000000 50%, #1a1a1a 100%)',
              border: '2px solid rgba(59, 130, 246, 0.6)',
              boxShadow: 'inset 0 1px 2px rgba(59, 130, 246, 0.1), 0 2px 4px rgba(0, 0, 0, 0.5), 0 0 8px rgba(59, 130, 246, 0.3)',
              height: '44px'
            }}>
              <span className="text-xs font-semibold text-blue-400 mr-2">★</span>
              {getFavoriteTools().map((tool, index) => (
                <button
                  key={tool.value}
                  onClick={() => {
                    console.log('🌟 Favorite tool clicked:', tool.value);
                    selectDrawingTool(tool.value);
                  }}
                  className={`btn-3d-carved relative group ${activeTool === tool.value ? 'active' : 'text-white'}`}
                  style={{
                    padding: '10px 12px',
                    fontSize: '14px',
                    fontWeight: '600',
                    borderRadius: '3px',
                    height: '36px',
                    minWidth: '36px'
                  }}
                  title={tool.label}
                >
                  {tool.icon}
                </button>
              ))}
            </div>
          )}
          </div>

          {/* Spacer to push remaining items to the right */}
          <div className="flex-1"></div>

          {/* Remaining Controls on the Right */}
          <div className="flex items-center flex-shrink-0">

          {/* Glowing Orange Separator */}
          <div className="mx-6" style={{
            width: '4px',
            height: '50px',
            background: 'linear-gradient(180deg, transparent 0%, #ff6600 15%, #ff8833 50%, #ff6600 85%, transparent 100%)',
            boxShadow: '0 0 12px rgba(255, 102, 0, 0.8), 0 0 24px rgba(255, 102, 0, 0.4), 0 0 32px rgba(255, 102, 0, 0.2)',
            borderRadius: '2px'
          }}></div>

          {/* Volume Toggle */}
          <button
            onClick={() => setConfig(prev => ({ ...prev, volume: !prev.volume }))}
            className={`btn-3d-carved relative group ${config.volume ? 'active' : 'text-gray-400'}`}
            style={{
              padding: '10px 14px',
              fontWeight: '700',
              fontSize: '13px',
              letterSpacing: '0.5px'
            }}
          >
            VOLUME
          </button>

          {/* Glowing Orange Separator */}
          <div className="mx-6" style={{
            width: '4px',
            height: '50px',
            background: 'linear-gradient(180deg, transparent 0%, #ff6600 15%, #ff8833 50%, #ff6600 85%, transparent 100%)',
            boxShadow: '0 0 12px rgba(255, 102, 0, 0.8), 0 0 24px rgba(255, 102, 0, 0.4), 0 0 32px rgba(255, 102, 0, 0.2)',
            borderRadius: '2px'
          }}></div>

          {/* Test Future Scroll Button */}
          <button
            onClick={() => {
              const futurePeriods = getFuturePeriods(config.timeframe);
              const maxFuturePeriods = Math.min(futurePeriods, Math.ceil(visibleCandleCount * 0.2));
              const futureScrollOffset = data.length - visibleCandleCount + maxFuturePeriods;
              setScrollOffset(futureScrollOffset);
              console.log('Scrolling to future:', { futureScrollOffset, dataLength: data.length, visibleCandleCount, maxFuturePeriods });
            }}
            className="btn-3d-carved relative group text-gray-300"
            style={{
              padding: '10px 14px',
              fontWeight: '700',
              fontSize: '13px',
              letterSpacing: '0.5px'
            }}
          >
            FUTURE
          </button>

          {/* Glowing Orange Separator */}
          <div className="mx-6" style={{
            width: '4px',
            height: '50px',
            background: 'linear-gradient(180deg, transparent 0%, #ff6600 15%, #ff8833 50%, #ff6600 85%, transparent 100%)',
            boxShadow: '0 0 12px rgba(255, 102, 0, 0.8), 0 0 24px rgba(255, 102, 0, 0.4), 0 0 32px rgba(255, 102, 0, 0.2)',
            borderRadius: '2px'
          }}></div>

          {/* Enhanced Action Buttons */}
          <div className="flex items-center space-x-4">

            {/* Glowing Orange Separator */}
            <div className="mx-6" style={{
              width: '4px',
              height: '50px',
              background: 'linear-gradient(180deg, transparent 0%, #ff6600 15%, #ff8833 50%, #ff6600 85%, transparent 100%)',
              boxShadow: '0 0 12px rgba(255, 102, 0, 0.8), 0 0 24px rgba(255, 102, 0, 0.4), 0 0 32px rgba(255, 102, 0, 0.2)',
              borderRadius: '2px'
            }}></div>

            {/* ADMIN Button - Premium Gold Design */}
            <button 
              className="relative group overflow-hidden"
              style={{
                padding: '12px 20px',
                borderRadius: '10px',
                background: 'linear-gradient(145deg, #1a1a1a 0%, #000000 30%, #1a1a1a 70%, #2a2a2a 100%)',
                border: '2px solid transparent',
                backgroundImage: 'linear-gradient(145deg, #1a1a1a 0%, #000000 30%, #1a1a1a 70%, #2a2a2a 100%), linear-gradient(90deg, #FFD700, #FFA500, #FFD700)',
                backgroundOrigin: 'border-box',
                backgroundClip: 'padding-box, border-box',
                color: '#FFD700',
                fontWeight: '800',
                fontSize: '13px',
                letterSpacing: '1.2px',
                textShadow: `
                  0 0 5px rgba(255, 215, 0, 0.8),
                  0 2px 4px rgba(0, 0, 0, 0.9),
                  0 0 10px rgba(255, 215, 0, 0.4),
                  2px 2px 0px rgba(0, 0, 0, 0.8)
                `,
                boxShadow: `
                  inset 0 3px 6px rgba(0, 0, 0, 0.4),
                  inset 0 -3px 6px rgba(255, 215, 0, 0.1),
                  0 6px 20px rgba(0, 0, 0, 0.6),
                  0 2px 8px rgba(255, 215, 0, 0.2),
                  0 0 25px rgba(255, 215, 0, 0.1)
                `,
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                position: 'relative'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-3px) scale(1.05)';
                e.currentTarget.style.textShadow = `
                  0 0 8px rgba(255, 215, 0, 1),
                  0 2px 4px rgba(0, 0, 0, 0.9),
                  0 0 15px rgba(255, 215, 0, 0.6),
                  2px 2px 0px rgba(0, 0, 0, 0.8)
                `;
                e.currentTarget.style.boxShadow = `
                  inset 0 4px 8px rgba(0, 0, 0, 0.5),
                  inset 0 -4px 8px rgba(255, 215, 0, 0.15),
                  0 8px 25px rgba(0, 0, 0, 0.7),
                  0 4px 12px rgba(255, 215, 0, 0.3),
                  0 0 35px rgba(255, 215, 0, 0.2)
                `;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0) scale(1)';
                e.currentTarget.style.textShadow = `
                  0 0 5px rgba(255, 215, 0, 0.8),
                  0 2px 4px rgba(0, 0, 0, 0.9),
                  0 0 10px rgba(255, 215, 0, 0.4),
                  2px 2px 0px rgba(0, 0, 0, 0.8)
                `;
                e.currentTarget.style.boxShadow = `
                  inset 0 3px 6px rgba(0, 0, 0, 0.4),
                  inset 0 -3px 6px rgba(255, 215, 0, 0.1),
                  0 6px 20px rgba(0, 0, 0, 0.6),
                  0 2px 8px rgba(255, 215, 0, 0.2),
                  0 0 25px rgba(255, 215, 0, 0.1)
                `;
              }}
            >
              {/* Gold shine effect */}
              <div 
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                style={{
                  background: 'linear-gradient(45deg, transparent 30%, rgba(255, 215, 0, 0.1) 50%, transparent 70%)',
                  animation: 'shimmer 2s infinite',
                  borderRadius: '8px'
                }}
              ></div>
              <span className="relative z-10">ADMIN</span>
            </button>

            {/* Glowing Orange Separator */}
            <div className="mx-6" style={{
              width: '4px',
              height: '50px',
              background: 'linear-gradient(180deg, transparent 0%, #ff6600 15%, #ff8833 50%, #ff6600 85%, transparent 100%)',
              boxShadow: '0 0 12px rgba(255, 102, 0, 0.8), 0 0 24px rgba(255, 102, 0, 0.4), 0 0 32px rgba(255, 102, 0, 0.2)',
              borderRadius: '2px'
            }}></div>

            {/* AI Button - Futuristic Silver/Chrome Design */}
            <button 
              className="relative group overflow-hidden"
              style={{
                padding: '12px 20px',
                borderRadius: '10px',
                background: 'linear-gradient(145deg, #1a1a1a 0%, #000000 30%, #1a1a1a 70%, #2a2a2a 100%)',
                border: '2px solid transparent',
                backgroundImage: 'linear-gradient(145deg, #1a1a1a 0%, #000000 30%, #1a1a1a 70%, #2a2a2a 100%), linear-gradient(90deg, #C0C0C0, #E8E8E8, #C0C0C0)',
                backgroundOrigin: 'border-box',
                backgroundClip: 'padding-box, border-box',
                color: '#E8E8E8',
                fontWeight: '800',
                fontSize: '13px',
                letterSpacing: '1.2px',
                textShadow: `
                  0 0 5px rgba(232, 232, 232, 0.8),
                  0 2px 4px rgba(0, 0, 0, 0.9),
                  0 0 10px rgba(192, 192, 192, 0.4),
                  2px 2px 0px rgba(0, 0, 0, 0.8)
                `,
                boxShadow: `
                  inset 0 3px 6px rgba(0, 0, 0, 0.4),
                  inset 0 -3px 6px rgba(232, 232, 232, 0.1),
                  0 6px 20px rgba(0, 0, 0, 0.6),
                  0 2px 8px rgba(192, 192, 192, 0.2),
                  0 0 25px rgba(192, 192, 192, 0.1)
                `,
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                position: 'relative'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-3px) scale(1.05)';
                e.currentTarget.style.color = '#FFFFFF';
                e.currentTarget.style.textShadow = `
                  0 0 8px rgba(255, 255, 255, 1),
                  0 2px 4px rgba(0, 0, 0, 0.9),
                  0 0 15px rgba(232, 232, 232, 0.6),
                  2px 2px 0px rgba(0, 0, 0, 0.8)
                `;
                e.currentTarget.style.boxShadow = `
                  inset 0 4px 8px rgba(0, 0, 0, 0.5),
                  inset 0 -4px 8px rgba(232, 232, 232, 0.15),
                  0 8px 25px rgba(0, 0, 0, 0.7),
                  0 4px 12px rgba(192, 192, 192, 0.3),
                  0 0 35px rgba(192, 192, 192, 0.2)
                `;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0) scale(1)';
                e.currentTarget.style.color = '#E8E8E8';
                e.currentTarget.style.textShadow = `
                  0 0 5px rgba(232, 232, 232, 0.8),
                  0 2px 4px rgba(0, 0, 0, 0.9),
                  0 0 10px rgba(192, 192, 192, 0.4),
                  2px 2px 0px rgba(0, 0, 0, 0.8)
                `;
                e.currentTarget.style.boxShadow = `
                  inset 0 3px 6px rgba(0, 0, 0, 0.4),
                  inset 0 -3px 6px rgba(232, 232, 232, 0.1),
                  0 6px 20px rgba(0, 0, 0, 0.6),
                  0 2px 8px rgba(192, 192, 192, 0.2),
                  0 0 25px rgba(192, 192, 192, 0.1)
                `;
              }}
            >
              {/* Chrome shine effect */}
              <div 
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                style={{
                  background: 'linear-gradient(45deg, transparent 30%, rgba(255, 255, 255, 0.1) 50%, transparent 70%)',
                  animation: 'shimmer 1.5s infinite',
                  borderRadius: '8px'
                }}
              ></div>
              <span className="relative z-10">AI</span>
            </button>

            {/* Glowing Orange Separator */}
            <div className="mx-6" style={{
              width: '4px',
              height: '50px',
              background: 'linear-gradient(180deg, transparent 0%, #ff6600 15%, #ff8833 50%, #ff6600 85%, transparent 100%)',
              boxShadow: '0 0 12px rgba(255, 102, 0, 0.8), 0 0 24px rgba(255, 102, 0, 0.4), 0 0 32px rgba(255, 102, 0, 0.2)',
              borderRadius: '2px'
            }}></div>

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
                    ref={drawingToolRefs.current[categoryKey] || null}
                    onClick={(e) => {
                      // Calculate dropdown position
                      const buttonRef = drawingToolRefs.current[categoryKey];
                      if (buttonRef?.current) {
                        const rect = buttonRef.current.getBoundingClientRect();
                        
                        // Map category keys to state property names
                        const stateKey = {
                          'linetools': 'lineTools',
                          'fibtools': 'fib',
                          'shapes': 'shapes',
                          'gann': 'gann',
                          'elliott': 'elliott',
                          'prediction': 'prediction',
                          'measure': 'measure',
                          'notes': 'notes',
                          'volume': 'volume',
                          'patterns': 'patterns',
                          'harmonic': 'harmonic',
                          'cycles': 'cycles',
                          'orders': 'orders'
                        }[categoryKey] || categoryKey;
                        
                        setDropdownPositions(prev => ({
                          ...prev,
                          [stateKey]: {
                            x: rect.left,
                            y: rect.bottom + 8,
                            width: rect.width
                          }
                        }));
                      }
                      
                      setDropdownState && setDropdownState(!dropdownState);
                    }}
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
                </div>
              );
            })}
          </div>

          {/* SETTINGS Button - Professional Orange Design */}
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className="relative group overflow-hidden"
            style={{
              padding: '12px 20px',
              borderRadius: '10px',
              background: showSettings
                ? 'linear-gradient(145deg, #2d1a00 0%, #1a1100 30%, #3d2400 70%, #2d1a00 100%)'
                : 'linear-gradient(145deg, #1a1a1a 0%, #000000 30%, #2d1a00 70%, #1a1a1a 100%)',
              border: '2px solid transparent',
              backgroundImage: showSettings
                ? 'linear-gradient(145deg, #2d1a00 0%, #1a1100 30%, #3d2400 70%, #2d1a00 100%), linear-gradient(90deg, #FF8C00, #FFA500, #FF8C00)'
                : 'linear-gradient(145deg, #1a1a1a 0%, #000000 30%, #2d1a00 70%, #1a1a1a 100%), linear-gradient(90deg, #FF8C00, #FFA500, #FF8C00)',
              backgroundOrigin: 'border-box',
              backgroundClip: 'padding-box, border-box',
              color: showSettings ? '#FFB84D' : '#FFA500',
              fontWeight: '800',
              fontSize: '13px',
              letterSpacing: '1.2px',
              textShadow: showSettings
                ? `
                  0 0 8px rgba(255, 184, 77, 1),
                  0 2px 4px rgba(0, 0, 0, 0.9),
                  0 0 15px rgba(255, 165, 0, 0.6),
                  2px 2px 0px rgba(0, 0, 0, 0.8)
                `
                : `
                  0 0 5px rgba(255, 165, 0, 0.8),
                  0 2px 4px rgba(0, 0, 0, 0.9),
                  0 0 10px rgba(255, 140, 0, 0.4),
                  2px 2px 0px rgba(0, 0, 0, 0.8)
                `,
              boxShadow: showSettings
                ? `
                  inset 0 4px 8px rgba(0, 0, 0, 0.5),
                  inset 0 -4px 8px rgba(255, 165, 0, 0.15),
                  0 8px 25px rgba(0, 0, 0, 0.7),
                  0 4px 12px rgba(255, 140, 0, 0.3),
                  0 0 35px rgba(255, 140, 0, 0.2)
                `
                : `
                  inset 0 3px 6px rgba(0, 0, 0, 0.4),
                  inset 0 -3px 6px rgba(255, 165, 0, 0.1),
                  0 6px 20px rgba(0, 0, 0, 0.6),
                  0 2px 8px rgba(255, 140, 0, 0.2),
                  0 0 25px rgba(255, 140, 0, 0.1)
                `,
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              position: 'relative'
            }}
            onMouseEnter={(e) => {
              if (!showSettings) {
                e.currentTarget.style.transform = 'translateY(-3px) scale(1.05)';
                e.currentTarget.style.color = '#FFB84D';
                e.currentTarget.style.textShadow = `
                  0 0 8px rgba(255, 184, 77, 1),
                  0 2px 4px rgba(0, 0, 0, 0.9),
                  0 0 15px rgba(255, 165, 0, 0.6),
                  2px 2px 0px rgba(0, 0, 0, 0.8)
                `;
                e.currentTarget.style.boxShadow = `
                  inset 0 4px 8px rgba(0, 0, 0, 0.5),
                  inset 0 -4px 8px rgba(255, 165, 0, 0.15),
                  0 8px 25px rgba(0, 0, 0, 0.7),
                  0 4px 12px rgba(255, 140, 0, 0.3),
                  0 0 35px rgba(255, 140, 0, 0.2)
                `;
              }
            }}
            onMouseLeave={(e) => {
              if (!showSettings) {
                e.currentTarget.style.transform = 'translateY(0) scale(1)';
                e.currentTarget.style.color = '#FFA500';
                e.currentTarget.style.textShadow = `
                  0 0 5px rgba(255, 165, 0, 0.8),
                  0 2px 4px rgba(0, 0, 0, 0.9),
                  0 0 10px rgba(255, 140, 0, 0.4),
                  2px 2px 0px rgba(0, 0, 0, 0.8)
                `;
                e.currentTarget.style.boxShadow = `
                  inset 0 3px 6px rgba(0, 0, 0, 0.4),
                  inset 0 -3px 6px rgba(255, 165, 0, 0.1),
                  0 6px 20px rgba(0, 0, 0, 0.6),
                  0 2px 8px rgba(255, 140, 0, 0.2),
                  0 0 25px rgba(255, 140, 0, 0.1)
                `;
              }
            }}
          >
            {/* Orange glow effect */}
            <div 
              className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
              style={{
                background: 'linear-gradient(45deg, transparent 30%, rgba(255, 165, 0, 0.1) 50%, transparent 70%)',
                animation: 'shimmer 1.5s infinite',
                borderRadius: '8px'
              }}
            ></div>
            <span className="relative z-10">SETTINGS</span>
          </button>
          </div>
        </div>
        </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="absolute top-22 right-4 bg-[#1e222d] border border-[#2a2e39] rounded-lg p-6 w-80 shadow-2xl" style={{ zIndex: 99999 }}>
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
            <div className="absolute top-0 left-0 w-full h-full" style={{ background: 'linear-gradient(to bottom right, rgba(255,255,255,0.05), transparent, rgba(255,255,255,0.03))' }}></div>
            <div className="absolute w-6 h-6 bg-white bg-opacity-3 rounded-full animate-pulse" style={{ top: '25%', left: '25%' }}></div>
            <div className="absolute w-4 h-4 bg-white bg-opacity-2 rounded-full animate-pulse" style={{ bottom: '33.333%', right: '25%', animationDelay: '2000ms' }}></div>
          </div>
          
          <div className="relative z-10 flex flex-col items-center py-4 h-full">
            {/* Sidebar Buttons */}
            {[
              { id: 'watchlist', icon: TbChartLine, label: 'Watch', color: 'from-gray-800 to-gray-900', accent: 'blue' },
              { id: 'regimes', icon: TbTrendingUp, label: 'Markets', color: 'from-gray-800 to-gray-900', accent: 'emerald' },
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
                <span className="text-xs text-white text-opacity-40 font-medium mb-1 tracking-wide text-center">
                  {item.label}
                </span>
                
                <button
                className={`sidebar-btn group relative w-12 h-12 rounded-lg bg-gradient-to-br ${item.color} 
                           shadow-lg hover:shadow-2xl transform transition-all duration-300 
                           hover:scale-105 hover:-translate-y-0.5 active:scale-95
                           border border-gray-700 border-opacity-50 hover:border-gray-600 hover:border-opacity-70
                           relative overflow-hidden
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
                <div className="absolute inset-0.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ background: 'linear-gradient(to bottom right, rgba(255,255,255,0.05), transparent, transparent)' }}></div>
                
                {/* Icon with accent color */}
                <span className={`z-10 text-4xl filter drop-shadow-lg transition-all duration-300 group-hover:scale-110 ${accentColors[item.accent]}`}>
                  <IconComponent />
                </span>
                
                {/* Subtle ripple effect */}
                <div className="absolute inset-0 rounded-lg bg-white bg-opacity-10 scale-0 group-active:scale-100 transition-transform duration-200"></div>
                
                {/* Accent glow effect */}
                <div className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-30 blur-sm transition-opacity duration-300" style={{ background: `linear-gradient(to right, ${item.accent === 'blue' ? 'rgba(59, 130, 246, 0.2)' : item.accent === 'emerald' ? 'rgba(16, 185, 129, 0.2)' : item.accent === 'purple' ? 'rgba(147, 51, 234, 0.2)' : item.accent === 'amber' ? 'rgba(245, 158, 11, 0.2)' : item.accent === 'rose' ? 'rgba(244, 63, 94, 0.2)' : 'rgba(59, 130, 246, 0.2)'}, ${item.accent === 'blue' ? 'rgba(37, 99, 235, 0.2)' : item.accent === 'emerald' ? 'rgba(5, 150, 105, 0.2)' : item.accent === 'purple' ? 'rgba(126, 34, 206, 0.2)' : item.accent === 'amber' ? 'rgba(217, 119, 6, 0.2)' : item.accent === 'rose' ? 'rgba(225, 29, 72, 0.2)' : 'rgba(37, 99, 235, 0.2)'})` }}></div>
              </button>
              </div>
              );
            })}
            
            {/* Decorative elements */}
            <div className="flex-1"></div>
            <div className="w-8 h-px bg-gradient-to-r from-transparent via-white via-opacity-10 to-transparent mb-2"></div>
            <div className="text-xs text-white text-opacity-40 font-mono tracking-wider">EFI</div>
          </div>
          
          {/* Subtle side accent */}
          <div className="absolute top-0 right-0 w-px h-full" style={{ background: 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.1), transparent)' }}></div>
        </div>

        {/* Main Chart Area */}
        <div 
          ref={containerRef}
          className="relative flex-1"
          style={{ height: height - 150 }} // Reduced height to leave space for X-axis
        >
        {/* Loading Overlay */}
        {loading && (
          <div className="absolute inset-0 z-50 bg-black bg-opacity-80 flex items-center justify-center">
            <div className="bg-[#1e222d] border border-[#2a2e39] rounded-lg p-6 flex items-center space-x-3">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#2962ff]"></div>
              <span className="text-white text-lg">Loading {config.timeframe} data...</span>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="absolute inset-0 z-50 bg-black bg-opacity-80 flex items-center justify-center">
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
            const startPoint = drawing.startPoint || (drawing.startX !== undefined && drawing.startY !== undefined ? { x: drawing.startX, y: drawing.startY } : null);
            const endPoint = drawing.endPoint || (drawing.endX !== undefined && drawing.endY !== undefined ? { x: drawing.endX, y: drawing.endY } : null);
            
            if (startPoint && endPoint && isPointNearLine(x, y, startPoint, endPoint, 10)) {
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
          onMouseLeave={(e) => {
            handleMouseUp();
            handleMouseLeave();
          }}
          onDoubleClick={handleDoubleClick}
        />
      </div>

      {/* Text Input Modal for Drawing Tools */}
      {showTextInput && textInputPosition && (
        <div 
          className="absolute z-[10000] bg-[#1e222d] border border-[#2a2e39] rounded-lg p-4 shadow-xl"
          style={{
            left: (textInputPosition?.x || 0) + 10,
            top: (textInputPosition?.y || 0) - 10,
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
        <div className="fixed top-40 bottom-0 left-16 w-[720px] bg-[#0a0a0a] border-r border-[#1a1a1a] shadow-2xl z-40 transform transition-transform duration-300 ease-out">
          {/* Panel Header */}
          <div className="h-12 border-b border-[#1a1a1a] flex items-center justify-between px-4">
            <h3 className="text-white font-medium capitalize">{activeSidebarPanel}</h3>
            <button 
              onClick={() => setActiveSidebarPanel(null)}
              className="text-white text-opacity-60 hover:text-white transition-colors p-1"
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
              <div className="p-4 text-center text-white text-opacity-50">
                News section coming soon...
              </div>
            )}
            {activeSidebarPanel === 'alerts' && (
              <div className="p-4 text-center text-white text-opacity-50">
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

      {/* Portal Dropdowns - Rendered outside chart container to avoid z-index issues */}
      {showIndicatorsDropdown && createPortal(
        <div
          className="fixed w-48 rounded-lg overflow-hidden"
          style={{
            left: `${dropdownPositions.indicators.x}px`,
            top: `${dropdownPositions.indicators.y}px`,
            background: 'linear-gradient(135deg, rgba(18, 18, 18, 0.95) 0%, rgba(12, 12, 12, 0.98) 100%)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(12px)',
            zIndex: 999999
          }}
        >
          {INDICATORS.map((indicator) => (
            <button
              key={indicator.value}
              onClick={() => {
                // Add indicator to chart
                const isCurrentlyActive = config.indicators.includes(indicator.value);
                setConfig(prev => ({
                  ...prev,
                  indicators: isCurrentlyActive
                    ? prev.indicators.filter(ind => ind !== indicator.value)
                    : [...prev.indicators, indicator.value]
                }));
                console.log(`📊 ${isCurrentlyActive ? 'Removed' : 'Added'} indicator: ${indicator.label}`);
                setShowIndicatorsDropdown(false);
              }}
              className={`w-full px-4 py-3 text-left flex items-center justify-between hover:bg-white hover:bg-opacity-10 transition-colors ${
                config.indicators.includes(indicator.value) ? 'bg-blue-600 bg-opacity-20' : ''
              }`}
              style={{
                background: config.indicators.includes(indicator.value) 
                  ? 'rgba(41, 98, 255, 0.2)' 
                  : 'transparent',
                color: config.indicators.includes(indicator.value) 
                  ? '#60a5fa' 
                  : '#d1d5db',
                fontSize: '13px',
                fontWeight: '500',
                letterSpacing: '0.3px',
                textShadow: '0 1px 1px rgba(0, 0, 0, 0.8)'
              }}
            >
              <div className="flex items-center space-x-3">
                <span className="text-sm">📈</span>
                <span>{indicator.label}</span>
              </div>
              {config.indicators.includes(indicator.value) && (
                <span className="text-blue-400 text-sm">✓</span>
              )}
            </button>
          ))}
        </div>,
        document.body
      )}

      {showTimeframeDropdown && createPortal(
        <div 
          className="fixed rounded-xl shadow-2xl min-w-[120px] backdrop-blur-lg"
          style={{
            left: `${dropdownPositions.timeframe.x}px`,
            top: `${dropdownPositions.timeframe.y}px`,
            background: 'linear-gradient(135deg, rgba(10, 10, 10, 0.95) 0%, rgba(26, 26, 26, 0.95) 100%)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
            zIndex: 999999
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
        </div>,
        document.body
      )}

      {/* Line Tools Portal Dropdown */}
      {showLineToolsDropdown && createPortal(
        <div 
          className="fixed bg-black bg-opacity-95 backdrop-blur-xl border border-gray-700 rounded-lg shadow-2xl min-w-72"
          style={{
            left: `${dropdownPositions.lineTools?.x || 0}px`,
            top: `${dropdownPositions.lineTools?.y || 0}px`,
            background: 'linear-gradient(135deg, rgba(26,26,26,0.98) 0%, rgba(45,45,45,0.98) 100%)',
            boxShadow: '0 20px 40px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.08)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            zIndex: 999999
          }}
        >
          <div className="px-4 py-3 border-b border-gray-600 border-opacity-50 bg-gray-900 bg-opacity-70">
            <h4 className="text-white font-bold text-base tracking-wide" style={{ textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)', letterSpacing: '0.5px' }}>
              Line Tools
            </h4>
          </div>
          <div className="py-1 max-h-80 overflow-y-auto">
            {DRAWING_TOOLS['Line Tools']?.map((tool: any) => (
              <div key={tool.value} className="flex items-center group">
                <button
                  onClick={() => {
                    selectDrawingTool(tool.value);
                    setShowLineToolsDropdown(false);
                  }}
                  disabled={!tool.functional}
                  className="flex-1 px-4 py-3 text-left flex items-center space-x-3 hover:bg-white hover:bg-opacity-15 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background: activeTool === tool.value ? 'linear-gradient(135deg, #2962ff 0%, #1e4db7 100%)' : 'transparent',
                    color: '#ffffff',
                    fontSize: '14px',
                    fontWeight: '500'
                  }}
                >
                  <span className="text-lg" style={{ color: activeTool === tool.value ? '#ffffff' : '#c0c0c0', textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)' }}>
                    {tool.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold">
                      <span style={{ color: '#ffffff', textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)', fontSize: '15px' }}>
                        {tool.label}
                      </span>
                    </div>
                  </div>
                  {activeTool === tool.value && <span className="text-blue-300 text-xs">✓</span>}
                </button>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('🌟 STAR CLICKED FOR:', tool.label, 'Value:', tool.value);
                    toggleFavoriteDrawingTool(tool.value);
                  }}
                  className="star-favorite-btn px-4 py-3 hover:bg-yellow-500 hover:bg-opacity-30 transition-all duration-200 bg-gray-800"
                  title={favoriteDrawingTools.includes(tool.value) ? "Remove from favorites" : "Add to favorites"}
                  style={{ minWidth: '40px', backgroundColor: '#333' }}
                >
                  <span className={`text-lg font-bold ${favoriteDrawingTools.includes(tool.value) ? 'text-yellow-400' : 'text-gray-400'}`}>
                    ★
                  </span>
                </button>
              </div>
            ))}
          </div>
        </div>,
        document.body
      )}

      {/* Fib Tools Portal Dropdown */}
      {showFibDropdown && createPortal(
        <div 
          className="fixed bg-black bg-opacity-95 backdrop-blur-xl border border-gray-700 rounded-lg shadow-2xl min-w-72"
          style={{
            left: `${dropdownPositions.fib?.x || 0}px`,
            top: `${dropdownPositions.fib?.y || 0}px`,
            background: 'linear-gradient(135deg, rgba(26,26,26,0.98) 0%, rgba(45,45,45,0.98) 100%)',
            boxShadow: '0 20px 40px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.08)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            zIndex: 999999
          }}
        >
          <div className="px-4 py-3 border-b border-gray-600 border-opacity-50 bg-gray-900 bg-opacity-70">
            <h4 className="text-white font-bold text-base tracking-wide" style={{ textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)', letterSpacing: '0.5px' }}>
              Fib Tools
            </h4>
          </div>
          <div className="py-1 max-h-80 overflow-y-auto">
            {DRAWING_TOOLS['FIB Tools']?.map((tool: any) => (
              <div key={tool.value} className="flex items-center group">
                <button
                  onClick={() => {
                    selectDrawingTool(tool.value);
                    setShowFibDropdown(false);
                  }}
                  disabled={!tool.functional}
                  className="flex-1 px-4 py-3 text-left flex items-center space-x-3 hover:bg-white hover:bg-opacity-15 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background: activeTool === tool.value ? 'linear-gradient(135deg, #2962ff 0%, #1e4db7 100%)' : 'transparent',
                    color: '#ffffff',
                    fontSize: '14px',
                    fontWeight: '500'
                  }}
                >
                  <span className="text-lg" style={{ color: activeTool === tool.value ? '#ffffff' : '#c0c0c0', textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)' }}>
                    {tool.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold">
                      <span style={{ color: '#ffffff', textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)', fontSize: '15px' }}>
                        {tool.label}
                      </span>
                    </div>
                  </div>
                  {activeTool === tool.value && <span className="text-blue-300 text-xs">✓</span>}
                </button>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('🌟 FIB STAR CLICKED FOR:', tool.label, 'Value:', tool.value);
                    toggleFavoriteDrawingTool(tool.value);
                  }}
                  className="star-favorite-btn px-4 py-3 hover:bg-yellow-500 hover:bg-opacity-30 transition-all duration-200 bg-gray-800"
                  title={favoriteDrawingTools.includes(tool.value) ? "Remove from favorites" : "Add to favorites"}
                  style={{ minWidth: '40px', backgroundColor: '#333' }}
                >
                  <span className={`text-lg font-bold ${favoriteDrawingTools.includes(tool.value) ? 'text-yellow-400' : 'text-gray-400'}`}>
                    ★
                  </span>
                </button>
              </div>
            ))}
          </div>
        </div>,
        document.body
      )}

      {/* Shapes Portal Dropdown */}
      {showShapesDropdown && createPortal(
        <div 
          className="fixed bg-black bg-opacity-95 backdrop-blur-xl border border-gray-700 rounded-lg shadow-2xl min-w-72"
          style={{
            left: `${dropdownPositions.shapes?.x || 0}px`,
            top: `${dropdownPositions.shapes?.y || 0}px`,
            background: 'linear-gradient(135deg, rgba(26,26,26,0.98) 0%, rgba(45,45,45,0.98) 100%)',
            boxShadow: '0 20px 40px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.08)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            zIndex: 999999
          }}
        >
          <div className="px-4 py-3 border-b border-gray-600 border-opacity-50 bg-gray-900 bg-opacity-70">
            <h4 className="text-white font-bold text-base tracking-wide" style={{ textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)', letterSpacing: '0.5px' }}>
              Shapes
            </h4>
          </div>
          <div className="py-1 max-h-80 overflow-y-auto">
            {DRAWING_TOOLS['Shapes']?.map((tool: any) => (
              <button
                key={tool.value}
                onClick={() => {
                  selectDrawingTool(tool.value);
                  setShowShapesDropdown(false);
                }}
                disabled={!tool.functional}
                className="w-full px-4 py-3 text-left flex items-center space-x-3 hover:bg-white hover:bg-opacity-15 transition-all duration-200 group disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: activeTool === tool.value ? 'linear-gradient(135deg, #2962ff 0%, #1e4db7 100%)' : 'transparent',
                  color: '#ffffff',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
              >
                <span className="text-lg" style={{ color: activeTool === tool.value ? '#ffffff' : '#c0c0c0', textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)' }}>
                  {tool.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold">
                    <span style={{ color: '#ffffff', textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)', fontSize: '15px' }}>
                      {tool.label}
                    </span>
                  </div>
                </div>
                {activeTool === tool.value && <span className="text-blue-300 text-xs">✓</span>}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}

      {/* Gann Portal Dropdown */}
      {showGannDropdown && createPortal(
        <div 
          className="fixed bg-black bg-opacity-95 backdrop-blur-xl border border-gray-700 rounded-lg shadow-2xl min-w-72"
          style={{
            left: `${dropdownPositions.gann?.x || 0}px`,
            top: `${dropdownPositions.gann?.y || 0}px`,
            background: 'linear-gradient(135deg, rgba(26,26,26,0.98) 0%, rgba(45,45,45,0.98) 100%)',
            boxShadow: '0 20px 40px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.08)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            zIndex: 999999
          }}
        >
          <div className="px-4 py-3 border-b border-gray-600 border-opacity-50 bg-gray-900 bg-opacity-70">
            <h4 className="text-white font-bold text-base tracking-wide" style={{ textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)', letterSpacing: '0.5px' }}>
              Gann
            </h4>
          </div>
          <div className="py-1 max-h-80 overflow-y-auto">
            {DRAWING_TOOLS['Gann']?.map((tool: any) => (
              <button
                key={tool.value}
                onClick={() => {
                  selectDrawingTool(tool.value);
                  setShowGannDropdown(false);
                }}
                disabled={!tool.functional}
                className="w-full px-4 py-3 text-left flex items-center space-x-3 hover:bg-white hover:bg-opacity-15 transition-all duration-200 group disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: activeTool === tool.value ? 'linear-gradient(135deg, #2962ff 0%, #1e4db7 100%)' : 'transparent',
                  color: '#ffffff',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
              >
                <span className="text-lg" style={{ color: activeTool === tool.value ? '#ffffff' : '#c0c0c0', textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)' }}>
                  {tool.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold">
                    <span style={{ color: '#ffffff', textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)', fontSize: '15px' }}>
                      {tool.label}
                    </span>
                  </div>
                </div>
                {activeTool === tool.value && <span className="text-blue-300 text-xs">✓</span>}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}

      {/* Elliott Portal Dropdown */}
      {showElliottDropdown && createPortal(
        <div 
          className="fixed bg-black bg-opacity-95 backdrop-blur-xl border border-gray-700 rounded-lg shadow-2xl min-w-72"
          style={{
            left: `${dropdownPositions.elliott?.x || 0}px`,
            top: `${dropdownPositions.elliott?.y || 0}px`,
            background: 'linear-gradient(135deg, rgba(26,26,26,0.98) 0%, rgba(45,45,45,0.98) 100%)',
            boxShadow: '0 20px 40px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.08)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            zIndex: 999999
          }}
        >
          <div className="px-4 py-3 border-b border-gray-600 border-opacity-50 bg-gray-900 bg-opacity-70">
            <h4 className="text-white font-bold text-base tracking-wide" style={{ textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)', letterSpacing: '0.5px' }}>
              Elliott
            </h4>
          </div>
          <div className="py-1 max-h-80 overflow-y-auto">
            {DRAWING_TOOLS['Elliott']?.map((tool: any) => (
              <button
                key={tool.value}
                onClick={() => {
                  selectDrawingTool(tool.value);
                  setShowElliottDropdown(false);
                }}
                disabled={!tool.functional}
                className="w-full px-4 py-3 text-left flex items-center space-x-3 hover:bg-white hover:bg-opacity-15 transition-all duration-200 group disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: activeTool === tool.value ? 'linear-gradient(135deg, #2962ff 0%, #1e4db7 100%)' : 'transparent',
                  color: '#ffffff',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
              >
                <span className="text-lg" style={{ color: activeTool === tool.value ? '#ffffff' : '#c0c0c0', textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)' }}>
                  {tool.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold">
                    <span style={{ color: '#ffffff', textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)', fontSize: '15px' }}>
                      {tool.label}
                    </span>
                  </div>
                </div>
                {activeTool === tool.value && <span className="text-blue-300 text-xs">✓</span>}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}

      {/* Prediction Portal Dropdown */}
      {showPredictionDropdown && createPortal(
        <div 
          className="fixed bg-black bg-opacity-95 backdrop-blur-xl border border-gray-700 rounded-lg shadow-2xl min-w-72"
          style={{
            left: `${dropdownPositions.prediction?.x || 0}px`,
            top: `${dropdownPositions.prediction?.y || 0}px`,
            background: 'linear-gradient(135deg, rgba(26,26,26,0.98) 0%, rgba(45,45,45,0.98) 100%)',
            boxShadow: '0 20px 40px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.08)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            zIndex: 999999
          }}
        >
          <div className="px-4 py-3 border-b border-gray-600 border-opacity-50 bg-gray-900 bg-opacity-70">
            <h4 className="text-white font-bold text-base tracking-wide" style={{ textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)', letterSpacing: '0.5px' }}>
              Prediction
            </h4>
          </div>
          <div className="py-1 max-h-80 overflow-y-auto">
            {DRAWING_TOOLS['Prediction']?.map((tool: any) => (
              <button
                key={tool.value}
                onClick={() => {
                  selectDrawingTool(tool.value);
                  setShowPredictionDropdown(false);
                }}
                disabled={!tool.functional}
                className="w-full px-4 py-3 text-left flex items-center space-x-3 hover:bg-white hover:bg-opacity-15 transition-all duration-200 group disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: activeTool === tool.value ? 'linear-gradient(135deg, #2962ff 0%, #1e4db7 100%)' : 'transparent',
                  color: '#ffffff',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
              >
                <span className="text-lg" style={{ color: activeTool === tool.value ? '#ffffff' : '#c0c0c0', textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)' }}>
                  {tool.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold">
                    <span style={{ color: '#ffffff', textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)', fontSize: '15px' }}>
                      {tool.label}
                    </span>
                  </div>
                </div>
                {activeTool === tool.value && <span className="text-blue-300 text-xs">✓</span>}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}

      {/* Measure Portal Dropdown */}
      {showMeasureDropdown && createPortal(
        <div 
          className="fixed bg-black bg-opacity-95 backdrop-blur-xl border border-gray-700 rounded-lg shadow-2xl min-w-72"
          style={{
            left: `${dropdownPositions.measure?.x || 0}px`,
            top: `${dropdownPositions.measure?.y || 0}px`,
            background: 'linear-gradient(135deg, rgba(26,26,26,0.98) 0%, rgba(45,45,45,0.98) 100%)',
            boxShadow: '0 20px 40px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.08)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            zIndex: 999999
          }}
        >
          <div className="px-4 py-3 border-b border-gray-600 border-opacity-50 bg-gray-900 bg-opacity-70">
            <h4 className="text-white font-bold text-base tracking-wide" style={{ textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)', letterSpacing: '0.5px' }}>
              Measure
            </h4>
          </div>
          <div className="py-1 max-h-80 overflow-y-auto">
            {DRAWING_TOOLS['Measure']?.map((tool: any) => (
              <button
                key={tool.value}
                onClick={() => {
                  selectDrawingTool(tool.value);
                  setShowMeasureDropdown(false);
                }}
                disabled={!tool.functional}
                className="w-full px-4 py-3 text-left flex items-center space-x-3 hover:bg-white hover:bg-opacity-15 transition-all duration-200 group disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: activeTool === tool.value ? 'linear-gradient(135deg, #2962ff 0%, #1e4db7 100%)' : 'transparent',
                  color: '#ffffff',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
              >
                <span className="text-lg" style={{ color: activeTool === tool.value ? '#ffffff' : '#c0c0c0', textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)' }}>
                  {tool.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold">
                    <span style={{ color: '#ffffff', textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)', fontSize: '15px' }}>
                      {tool.label}
                    </span>
                  </div>
                </div>
                {activeTool === tool.value && <span className="text-blue-300 text-xs">✓</span>}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}

      {/* Notes Portal Dropdown */}
      {showNotesDropdown && createPortal(
        <div 
          className="fixed bg-black bg-opacity-95 backdrop-blur-xl border border-gray-700 rounded-lg shadow-2xl min-w-72"
          style={{
            left: `${dropdownPositions.notes?.x || 0}px`,
            top: `${dropdownPositions.notes?.y || 0}px`,
            background: 'linear-gradient(135deg, rgba(26,26,26,0.98) 0%, rgba(45,45,45,0.98) 100%)',
            boxShadow: '0 20px 40px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.08)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            zIndex: 999999
          }}
        >
          <div className="px-4 py-3 border-b border-gray-600 border-opacity-50 bg-gray-900 bg-opacity-70">
            <h4 className="text-white font-bold text-base tracking-wide" style={{ textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)', letterSpacing: '0.5px' }}>
              Notes
            </h4>
          </div>
          <div className="py-1 max-h-80 overflow-y-auto">
            {DRAWING_TOOLS['Notes']?.map((tool: any) => (
              <button
                key={tool.value}
                onClick={() => {
                  selectDrawingTool(tool.value);
                  setShowNotesDropdown(false);
                }}
                disabled={!tool.functional}
                className="w-full px-4 py-3 text-left flex items-center space-x-3 hover:bg-white hover:bg-opacity-15 transition-all duration-200 group disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: activeTool === tool.value ? 'linear-gradient(135deg, #2962ff 0%, #1e4db7 100%)' : 'transparent',
                  color: '#ffffff',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
              >
                <span className="text-lg" style={{ color: activeTool === tool.value ? '#ffffff' : '#c0c0c0', textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)' }}>
                  {tool.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold">
                    <span style={{ color: '#ffffff', textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)', fontSize: '15px' }}>
                      {tool.label}
                    </span>
                  </div>
                </div>
                {activeTool === tool.value && <span className="text-blue-300 text-xs">✓</span>}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
