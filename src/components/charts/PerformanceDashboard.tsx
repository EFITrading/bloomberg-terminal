'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

// ETF Definitions
const SECTORS = [
  { symbol: 'XLK', name: 'Technology', color: '#00d4ff' },
  { symbol: 'XLF', name: 'Financials', color: '#ff6b35' },
  { symbol: 'XLV', name: 'Healthcare', color: '#4ecdc4' },
  { symbol: 'XLI', name: 'Industrials', color: '#ffd93d' },
  { symbol: 'XLY', name: 'Discretionary', color: '#ff006e' },
  { symbol: 'XLP', name: 'Staples', color: '#8338ec' },
  { symbol: 'XLE', name: 'Energy', color: '#06ffa5' },
  { symbol: 'XLU', name: 'Utilities', color: '#ff9f1c' },
  { symbol: 'XLRE', name: 'Real Estate', color: '#2ec4b6' },
  { symbol: 'XLB', name: 'Materials', color: '#e71d36' },
  { symbol: 'XLC', name: 'Communication', color: '#a855f7' }
];

const INDUSTRIES = [
  { symbol: 'IGV', name: 'Software', color: '#00d4ff' },
  { symbol: 'SMH', name: 'Semiconductors', color: '#ff6b35' },
  { symbol: 'XRT', name: 'Retail', color: '#4ecdc4' },
  { symbol: 'KIE', name: 'Insurance', color: '#ffd93d' },
  { symbol: 'KRE', name: 'Regional Banks', color: '#ff006e' },
  { symbol: 'XBI', name: 'Biotech', color: '#8338ec' },
  { symbol: 'XHB', name: 'Homebuilders', color: '#06ffa5' },
  { symbol: 'ITB', name: 'Building', color: '#ff9f1c' },
  { symbol: 'XME', name: 'Metals & Mining', color: '#2ec4b6' },
  { symbol: 'IYT', name: 'Transportation', color: '#e71d36' },
  { symbol: 'XOP', name: 'Oil & Gas', color: '#a855f7' }
];

const SPECIAL = [
  { symbol: 'IWF', name: 'Russell 1000 Growth', color: '#00d4ff' },
  { symbol: 'IWD', name: 'Russell 1000 Value', color: '#ff6b35' },
  { symbol: 'IJR', name: 'S&P 600', color: '#ffd93d' },
  { symbol: 'USMV', name: 'Min Volatility', color: '#ff006e' },
  { symbol: 'VYM', name: 'High Dividend', color: '#8338ec' },
  { symbol: 'MTUM', name: 'Momentum', color: '#06ffa5' },
  { symbol: 'QUAL', name: 'Quality', color: '#ff9f1c' },
  { symbol: 'SIZE', name: 'Size Factor', color: '#2ec4b6' },
  { symbol: 'VLUE', name: 'Value Factor', color: '#e71d36' }
];

// Wave groups - same as RRG groupings
const WAVE_GROUPS = {
  growth: {
    name: 'Growth',
    tickers: ['XLK', 'XLY', 'XLC'],
    color: 'rgba(0, 255, 100, 0.9)'
  },
  value: {
    name: 'Value',
    tickers: ['XLI', 'XLB', 'XLE', 'XLF'],
    color: 'rgba(100, 150, 255, 0.9)'
  },
  defensives: {
    name: 'Defensives',
    tickers: ['XLV', 'XLU', 'XLRE', 'XLP'],
    color: 'rgba(255, 200, 0, 0.9)'
  }
};

type Timeframe = '1D' | '1W' | '1M' | '3M' | '6M' | '1Y' | '2Y' | '5Y' | '10Y' | '20Y' | 'YTD';

interface DataPoint {
  timestamp: number;
  value: number;
}

interface SeriesData {
  symbol: string;
  name: string;
  color: string;
  data: DataPoint[];
  performance: number;
}

interface PerformanceDashboardProps {
  isVisible?: boolean;
}

const PerformanceDashboard: React.FC<PerformanceDashboardProps> = ({ isVisible = true }) => {
  // State with localStorage persistence
  const [timeframe, setTimeframe] = useState<Timeframe>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('performanceDashboard_timeframe');
      return (saved as Timeframe) || '1W';
    }
    return '1W';
  });
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('performanceDashboard_selectedSymbols');
      // Default to all sectors if nothing saved
      return saved ? JSON.parse(saved) : SECTORS.map(s => s.symbol);
    }
    return SECTORS.map(s => s.symbol);
  });
  const [seriesData, setSeriesData] = useState<SeriesData[]>([]);
  const [loading, setLoading] = useState(false);

  // Wave mode state
  const [isWaveMode, setIsWaveMode] = useState(false);
  const [waveData, setWaveData] = useState<SeriesData[]>([]);

  // UI State
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number } | null>(null);
  const [hoveredSeries, setHoveredSeries] = useState<string | null>(null);

  // Chart State
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [zoomRange, setZoomRange] = useState({ start: 0, end: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, rangeStart: 0, rangeEnd: 1 });
  const [crosshair, setCrosshair] = useState<{ x: number; y: number } | null>(null);

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const buttonRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});
  const lastFetchKeyRef = useRef<string>(''); // Track last fetch to prevent duplicates
  const labelPositionsRef = useRef<Array<{ symbol: string; x: number; y: number; width: number; height: number }>>([]);

  // Utility: Check if all symbols in category are selected
  const isAllSelected = (category: typeof SECTORS) => {
    return category.every(item => selectedSymbols.includes(item.symbol));
  };

  // Utility: Toggle all symbols in a category
  const toggleCategory = (category: typeof SECTORS) => {
    const categorySymbols = category.map(item => item.symbol);
    const allSelected = isAllSelected(category);

    if (allSelected) {
      // Deselect all from this category
      setSelectedSymbols(prev => prev.filter(s => !categorySymbols.includes(s)));
    } else {
      // Select all from this category
      setSelectedSymbols(prev => {
        const newSet = new Set([...prev, ...categorySymbols]);
        return Array.from(newSet);
      });
    }
  };

  // Utility: Toggle individual symbol
  const toggleSymbol = (symbol: string) => {
    setSelectedSymbols(prev =>
      prev.includes(symbol)
        ? prev.filter(s => s !== symbol)
        : [...prev, symbol]
    );
  };

  // Fetch data from API
  const fetchData = useCallback(async () => {
    // Create unique key for this fetch to prevent duplicates
    const fetchKey = `${timeframe}-${[...selectedSymbols].sort().join(',')}`;
    if (lastFetchKeyRef.current === fetchKey) {
      return;
    }
    lastFetchKeyRef.current = fetchKey;

    // In wave mode, we need to fetch all wave constituent symbols
    let symbolsToFetch = selectedSymbols;
    if (isWaveMode) {
      const allWaveSymbols = new Set<string>();
      Object.values(WAVE_GROUPS).forEach(group => {
        group.tickers.forEach(ticker => allWaveSymbols.add(ticker));
      });
      symbolsToFetch = Array.from(allWaveSymbols);
    }

    if (symbolsToFetch.length === 0) {
      setSeriesData([]);
      return;
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoading(true);

    try {
      // Map timeframe to API format and calculate date range
      const timeframeMap: Record<Timeframe, string> = {
        '1D': '5m',
        '1W': '1h',
        '1M': '1d',
        '3M': '1d',
        '6M': '1d',
        '1Y': '1d',
        '2Y': '1d',
        '5Y': '1d',
        '10Y': '1d',
        '20Y': '1d',
        'YTD': '1d'
      };

      const apiTimeframe = timeframeMap[timeframe];

      // Calculate start and end dates based on timeframe
      const now = new Date();
      const endDate = now.toISOString().split('T')[0];
      let startDate: string;

      if (timeframe === 'YTD') {
        // Year to date: from Jan 1 of current year
        startDate = `${now.getFullYear()}-01-01`;
      } else {
        // Calculate days back based on timeframe (with buffer for weekends/holidays)
        const daysBack: Record<Timeframe, number> = {
          '1D': 5,      // 1 day + 4 day buffer for weekends
          '1W': 10,     // 1 week + 3 day buffer
          '1M': 35,     // 1 month + 5 day buffer
          '3M': 95,     // 3 months + 5 day buffer
          '6M': 185,    // 6 months + 5 day buffer
          '1Y': 370,    // 1 year + 5 day buffer
          '2Y': 735,    // 2 years + 5 day buffer
          '5Y': 1830,   // 5 years + 5 day buffer
          '10Y': 3655,  // 10 years + 5 day buffer
          '20Y': 7305,  // 20 years + 5 day buffer
          'YTD': 365    // fallback
        };

        const days = daysBack[timeframe];
        startDate = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000))
          .toISOString().split('T')[0];
      }

      // Batch symbols (max 10 per request)
      const chunks: string[][] = [];
      for (let i = 0; i < symbolsToFetch.length; i += 10) {
        chunks.push(symbolsToFetch.slice(i, i + 10));
      }

      // Fetch all chunks with custom date range
      const responses = await Promise.all(
        chunks.map(chunk =>
          fetch('/api/bulk-chart-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              symbols: chunk,
              timeframe: apiTimeframe,
              startDate,
              endDate,
              optimized: false // Use custom date range
            }),
            signal: abortControllerRef.current!.signal
          })
        )
      );

      // Parse responses
      const allData: Record<string, any[]> = {};
      for (const response of responses) {
        if (response.ok) {
          const json = await response.json();
          if (json.success && json.data) {
            Object.assign(allData, json.data);
          }
        }
      }

      // Get metadata for symbols
      const allSymbols = [...SECTORS, ...INDUSTRIES, ...SPECIAL];

      // First pass: filter and collect all data
      const symbolDataMap: Record<string, any[]> = {};
      const allTimestamps = new Set<number>();

      symbolsToFetch.forEach(symbol => {
        const rawData = allData[symbol];
        if (rawData && rawData.length > 0) {
          // For 1D, show most recent day with extended hours filtering
          let filteredData = rawData;
          if (timeframe === '1D') {
            // Find the most recent date in the dataset
            const mostRecentTimestamp = Math.max(...rawData.map(p => p.timestamp));
            const mostRecentDate = new Date(mostRecentTimestamp);

            const formatter = new Intl.DateTimeFormat('en-US', {
              timeZone: 'America/New_York',
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: 'numeric',
              minute: 'numeric',
              hour12: false
            });

            const recentParts = formatter.formatToParts(mostRecentDate);
            const targetYear = recentParts.find(p => p.type === 'year')?.value;
            const targetMonth = recentParts.find(p => p.type === 'month')?.value;
            const targetDay = recentParts.find(p => p.type === 'day')?.value;

            filteredData = rawData.filter(point => {
              const pointDate = new Date(point.timestamp);
              const parts = formatter.formatToParts(pointDate);

              const year = parts.find(p => p.type === 'year')?.value;
              const month = parts.find(p => p.type === 'month')?.value;
              const day = parts.find(p => p.type === 'day')?.value;

              // Check if this point is from the most recent day
              if (year === targetYear && month === targetMonth && day === targetDay) {
                // Also check if it's within extended hours (4 AM - 8 PM ET)
                const hours = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
                const minutes = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
                const timeInMinutes = hours * 60 + minutes;
                return timeInMinutes >= 240 && timeInMinutes <= 1200;
              }
              return false;
            });
          }

          if (filteredData.length > 0) {
            symbolDataMap[symbol] = filteredData;
            // Collect all unique timestamps
            filteredData.forEach(point => allTimestamps.add(point.timestamp));
          } else {
            console.warn(`No data after filtering for ${symbol}`);
          }
        } else {
          console.warn(`No data received for ${symbol}`);
        }
      });

      // Sort timestamps to create common timeline
      const commonTimestamps = Array.from(allTimestamps).sort((a, b) => a - b);

      if (commonTimestamps.length === 0) {
        console.error('No common timestamps found across symbols');
        setSeriesData([]);
        return;
      }

      // Process data into series with interpolation
      const series: SeriesData[] = symbolsToFetch
        .map(symbol => {
          const metadata = allSymbols.find(s => s.symbol === symbol);
          const symbolData = symbolDataMap[symbol];

          if (!metadata || !symbolData || symbolData.length === 0) {
            return null;
          }

          // Create a map for quick lookup
          const dataMap = new Map(symbolData.map(point => [point.timestamp, point.close]));

          // Build aligned data using common timestamps with forward-fill for missing values
          let lastKnownPrice = symbolData[0].close;
          const alignedData: Array<{ timestamp: number, close: number }> = [];

          for (const timestamp of commonTimestamps) {
            const price = dataMap.get(timestamp);
            if (price !== undefined) {
              lastKnownPrice = price;
              alignedData.push({ timestamp, close: price });
            } else {
              // Forward-fill missing data
              alignedData.push({ timestamp, close: lastKnownPrice });
            }
          }

          if (alignedData.length === 0) {
            console.warn(`No aligned data for ${symbol}`);
            return null;
          }

          // Calculate performance from first to last
          const firstPrice = alignedData[0].close;
          const dataPoints: DataPoint[] = alignedData.map(point => ({
            timestamp: point.timestamp,
            value: ((point.close - firstPrice) / firstPrice) * 100
          }));

          const performance = dataPoints[dataPoints.length - 1]?.value || 0;

          return {
            symbol: metadata.symbol,
            name: metadata.name,
            color: metadata.color,
            data: dataPoints,
            performance
          };
        })
        .filter((s): s is SeriesData => s !== null);

      setSeriesData(series);
      setZoomRange({ start: 0, end: 1 });

    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('Performance Dashboard fetch error:', error);
        // Keep existing data on error to prevent chart from disappearing
      }
    } finally {
      setLoading(false);
    }
  }, [selectedSymbols, timeframe, isWaveMode]);

  // Save timeframe to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('performanceDashboard_timeframe', timeframe);
    }
  }, [timeframe]);

  // Save selectedSymbols to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('performanceDashboard_selectedSymbols', JSON.stringify(selectedSymbols));
    }
  }, [selectedSymbols]);

  // Fetch data when symbols or timeframe or wave mode change
  useEffect(() => {
    if (isVisible && (selectedSymbols.length > 0 || isWaveMode)) {
      fetchData();
    } else if (selectedSymbols.length === 0 && !isWaveMode) {
      // Clear data when no symbols selected
      setSeriesData([]);
      lastFetchKeyRef.current = ''; // Reset fetch key
    }
  }, [isVisible, fetchData, selectedSymbols.length]);

  // Calculate wave data when in wave mode
  useEffect(() => {
    if (!isWaveMode || seriesData.length === 0) {
      setWaveData([]);
      return;
    }

    // Calculate aggregate performance for each wave group
    const waves: SeriesData[] = [];

    Object.entries(WAVE_GROUPS).forEach(([groupKey, group]) => {
      // Find all series that belong to this group
      const groupSeries = seriesData.filter(s => group.tickers.includes(s.symbol));

      if (groupSeries.length === 0) return;

      // Calculate average performance across all data points
      // First, find common data length (minimum across group)
      const minLength = Math.min(...groupSeries.map(s => s.data.length));
      if (minLength === 0) return;

      // Calculate average value at each timestamp
      const avgData: DataPoint[] = [];
      for (let i = 0; i < minLength; i++) {
        const timestamp = groupSeries[0].data[i].timestamp;
        const avgValue = groupSeries.reduce((sum, s) => sum + s.data[i].value, 0) / groupSeries.length;
        avgData.push({ timestamp, value: avgValue });
      }

      const avgPerformance = avgData[avgData.length - 1]?.value || 0;

      waves.push({
        symbol: group.name.toUpperCase(),
        name: group.name,
        color: group.color,
        data: avgData,
        performance: avgPerformance
      });
    });

    setWaveData(waves);
  }, [isWaveMode, seriesData]);

  // Measure container dimensions
  useEffect(() => {
    if (!containerRef.current) return;

    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          setDimensions({ width: rect.width, height: rect.height });
        }
      }
    };

    updateDimensions();
    const resizeObserver = new ResizeObserver(updateDimensions);
    resizeObserver.observe(containerRef.current);

    return () => resizeObserver.disconnect();
  }, []);

  // Draw chart
  const drawChart = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');

    if (!canvas || !ctx || dimensions.width === 0 || dimensions.height === 0 || seriesData.length === 0) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    canvas.width = dimensions.width * dpr;
    canvas.height = dimensions.height * dpr;
    canvas.style.width = `${dimensions.width}px`;
    canvas.style.height = `${dimensions.height}px`;
    ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform
    ctx.scale(dpr, dpr);

    // Clear
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, dimensions.width, dimensions.height);

    const margin = { top: 50, right: 100, bottom: 60, left: 70 };
    const chartWidth = dimensions.width - margin.left - margin.right;
    const chartHeight = dimensions.height - margin.top - margin.bottom;

    if (chartWidth <= 0 || chartHeight <= 0) return;

    // Calculate visible data range - use waveData in wave mode
    const activeData = isWaveMode ? waveData : seriesData;
    const maxDataPoints = Math.max(...activeData.map(s => s.data.length));
    const startIdx = Math.floor(zoomRange.start * maxDataPoints);
    const endIdx = Math.ceil(zoomRange.end * maxDataPoints);

    // Find min/max values in visible range
    let minVal = Infinity;
    let maxVal = -Infinity;

    // Use waveData if in wave mode, otherwise use seriesData
    const dataForRange = isWaveMode ? waveData : seriesData;

    dataForRange.forEach(series => {
      const start = Math.min(startIdx, series.data.length - 1);
      const end = Math.min(endIdx, series.data.length);

      for (let i = start; i < end; i++) {
        const val = series.data[i]?.value;
        if (val !== undefined) {
          minVal = Math.min(minVal, val);
          maxVal = Math.max(maxVal, val);
        }
      }
    });

    if (!isFinite(minVal) || !isFinite(maxVal)) return;

    const padding = (maxVal - minVal) * 0.1;
    minVal -= padding;
    maxVal += padding;
    const valueRange = maxVal - minVal || 1;

    // Scales
    const xScale = (dataIdx: number, totalPoints: number) => {
      const normalized = (dataIdx - startIdx) / (endIdx - startIdx);
      return margin.left + normalized * chartWidth;
    };

    const yScale = (value: number) => {
      const normalized = (value - minVal) / valueRange;
      return margin.top + chartHeight - (normalized * chartHeight);
    };

    // Y-axis labels - enhanced with 20% bigger font
    ctx.font = 'bold 18px monospace'; // Increased from 15px to 18px (20% bigger)
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.imageSmoothingEnabled = false; // Crispy rendering

    for (let i = 0; i <= 10; i++) {
      const value = minVal + (valueRange * (10 - i) / 10);
      const y = margin.top + (chartHeight * i / 10);

      // Color based on positive/negative
      if (value > 0) {
        ctx.fillStyle = '#00ff00'; // Crispy green for positive
      } else if (value < 0) {
        ctx.fillStyle = '#ff0000'; // Crispy red for negative
      } else {
        ctx.fillStyle = '#888888'; // Gray for zero
      }

      ctx.fillText(`${Math.abs(value).toFixed(1)}%`, margin.left - 10, y);
    }

    ctx.imageSmoothingEnabled = true; // Reset

    // Draw L-shaped axis lines to separate axes
    ctx.strokeStyle = '#cc4400'; // Dark navy orange
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.beginPath();
    // Vertical line (Y-axis)
    ctx.moveTo(margin.left, margin.top);
    ctx.lineTo(margin.left, margin.top + chartHeight);
    // Horizontal line (X-axis)
    ctx.lineTo(margin.left + chartWidth, margin.top + chartHeight);
    ctx.stroke();

    // Zero line with dashes
    if (minVal < 0 && maxVal > 0) {
      const zeroY = yScale(0);
      ctx.strokeStyle = '#666666';
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 5]); // Dashed line
      ctx.beginPath();
      ctx.moveTo(margin.left, zeroY);
      ctx.lineTo(margin.left + chartWidth, zeroY);
      ctx.stroke();
      ctx.setLineDash([]); // Reset to solid line
    }

    // Draw pre-market and after-hours shading for intraday timeframes
    if (timeframe === '1D' || timeframe === '1W') {
      ctx.globalAlpha = 0.15;

      // Shade entire visible area first, then we'll overlay with correct periods
      for (let i = startIdx; i < endIdx; i++) {
        if (seriesData[0]?.data[i]) {
          const timestamp = seriesData[0].data[i].timestamp;
          const date = new Date(timestamp);

          const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/New_York',
            hour: 'numeric',
            minute: 'numeric',
            hour12: false
          });
          const parts = formatter.formatToParts(date);
          const hours = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
          const minutes = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
          const timeInMinutes = hours * 60 + minutes;

          const x = xScale(i, maxDataPoints);
          const nextX = i < endIdx - 1 ? xScale(i + 1, maxDataPoints) : x + (x - xScale(i - 1, maxDataPoints));
          const width = nextX - x;

          // Determine color based on time
          let color: string;
          if (timeInMinutes >= 240 && timeInMinutes < 570) {
            // Pre-market: 4:00 AM - 9:30 AM
            color = 'rgba(255, 140, 0, 1)';
          } else if (timeInMinutes >= 960 && timeInMinutes <= 1200) {
            // After-hours: 4:00 PM - 8:00 PM
            color = 'rgba(30, 58, 138, 1)';
          } else if (timeInMinutes > 1200 || timeInMinutes < 240) {
            // Overnight: after 8 PM or before 4 AM
            color = 'rgba(20, 20, 40, 1)';
          } else {
            // Market hours: 9:30 AM - 4:00 PM (no shading)
            continue;
          }

          ctx.fillStyle = color;
          ctx.fillRect(x, margin.top, width, chartHeight);
        }
      }

      ctx.globalAlpha = 1;
    }

    // Draw lines and collect end positions
    const labelPositions: Array<{ symbol: string; color: string; performance: number; x: number; y: number; isHovered: boolean }> = [];

    // Choose which data to render: waves or regular series
    const dataToRender = isWaveMode ? waveData : seriesData;

    // Helper function to calculate activity status at each point in time
    const calculateActivityMap = (waveSeries: SeriesData): boolean[] => {
      if (!isWaveMode) return [];

      // Find the wave group
      const waveGroup = Object.values(WAVE_GROUPS).find(g => g.name === waveSeries.name);
      if (!waveGroup) return [];

      // Get all individual series for this wave
      const constituents = seriesData.filter(s => waveGroup.tickers.includes(s.symbol));
      if (constituents.length < 2) return [];

      const activityMap: boolean[] = [];
      const windowSize = Math.max(5, Math.floor(waveSeries.data.length * 0.05)); // 5% window or minimum 5 points

      // Calculate activity for each point using a rolling window
      for (let i = 0; i < waveSeries.data.length; i++) {
        const windowStart = Math.max(0, i - windowSize);
        const windowEnd = Math.min(waveSeries.data.length, i + 1);

        // Calculate direction vectors for each constituent in this window
        const vectors = constituents.map(series => {
          if (series.data.length < windowEnd) return null;

          const startVal = series.data[windowStart]?.value;
          const endVal = series.data[i]?.value;
          if (startVal === undefined || endVal === undefined) return null;

          return endVal - startVal;
        }).filter((v): v is number => v !== null);

        if (vectors.length < 2) {
          activityMap.push(false);
          continue;
        }

        // Check if vectors are aligned (same direction and similar magnitude)
        const avgVector = vectors.reduce((sum, v) => sum + v, 0) / vectors.length;

        // Calculate alignment score
        const alignmentScores = vectors.map(v => {
          if (avgVector === 0) return 0;
          const ratio = v / avgVector;
          return Math.abs(ratio) > 0.5 ? Math.min(1, Math.abs(ratio)) : 0;
        });

        const avgAlignment = alignmentScores.reduce((sum, s) => sum + s, 0) / alignmentScores.length;

        // Active if average alignment > 0.7 (70% aligned)
        activityMap.push(avgAlignment > 0.7);
      }

      return activityMap;
    };

    dataToRender.forEach(series => {
      const isHovered = hoveredSeries === series.symbol;

      ctx.strokeStyle = series.color;
      ctx.lineWidth = isHovered ? 4 : (isWaveMode ? 3 : 2);
      ctx.globalAlpha = isHovered ? 1 : 0.85;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      const visibleData = series.data.slice(
        Math.max(0, startIdx),
        Math.min(series.data.length, endIdx)
      );

      let lastX = 0;
      let lastY = 0;

      // For wave mode, calculate activity at each point
      if (isWaveMode) {
        const activityMap = calculateActivityMap(series);

        // Draw line in segments based on activity
        let currentSegmentActive: boolean | null = null;
        let segmentPath: Array<{ x: number; y: number }> = [];

        visibleData.forEach((point, idx) => {
          const actualIdx = startIdx + idx;
          const x = xScale(actualIdx, maxDataPoints);
          const y = yScale(point.value);

          const isActive = activityMap[actualIdx] ?? false;

          // If activity state changed, draw previous segment and start new one
          if (currentSegmentActive !== null && currentSegmentActive !== isActive) {
            // Draw previous segment if exists
            if (segmentPath.length > 1) {
              ctx.setLineDash(currentSegmentActive ? [] : [10, 5]);
              ctx.beginPath();
              ctx.moveTo(segmentPath[0].x, segmentPath[0].y);
              for (let i = 1; i < segmentPath.length; i++) {
                ctx.lineTo(segmentPath[i].x, segmentPath[i].y);
              }
              ctx.stroke();
            }

            // Start new segment with LAST point from previous segment to connect smoothly
            segmentPath = segmentPath.length > 0 ? [segmentPath[segmentPath.length - 1], { x, y }] : [{ x, y }];
            currentSegmentActive = isActive;
          } else {
            // Continue current segment or start first segment
            segmentPath.push({ x, y });
            if (currentSegmentActive === null) {
              currentSegmentActive = isActive;
            }
          }

          lastX = x;
          lastY = y;
        });

        // Draw final segment
        if (segmentPath.length > 1) {
          ctx.setLineDash(currentSegmentActive ? [] : [10, 5]);
          ctx.beginPath();
          ctx.moveTo(segmentPath[0].x, segmentPath[0].y);
          for (let i = 1; i < segmentPath.length; i++) {
            ctx.lineTo(segmentPath[i].x, segmentPath[i].y);
          }
          ctx.stroke();
        }

        // Reset dash
        ctx.setLineDash([]);
      } else {
        // Regular mode: draw entire line as solid
        ctx.setLineDash([]);
        ctx.beginPath();
        let started = false;

        visibleData.forEach((point, idx) => {
          const actualIdx = startIdx + idx;
          const x = xScale(actualIdx, maxDataPoints);
          const y = yScale(point.value);

          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }

          lastX = x;
          lastY = y;
        });

        ctx.stroke();
      }

      // Store end position for label
      if (visibleData.length > 0) {
        labelPositions.push({
          symbol: series.symbol,
          color: series.color,
          performance: series.performance,
          x: lastX,
          y: lastY,
          isHovered
        });
      }
    });

    ctx.globalAlpha = 1;

    // Adjust label positions to prevent overlap
    const labelHeight = 16; // Approximate height of label
    const minSpacing = 20; // Minimum vertical spacing between labels

    // Sort by y position
    labelPositions.sort((a, b) => a.y - b.y);

    // Adjust overlapping labels
    for (let i = 1; i < labelPositions.length; i++) {
      const current = labelPositions[i];
      const previous = labelPositions[i - 1];

      if (current.y - previous.y < minSpacing) {
        current.y = previous.y + minSpacing;
      }
    }

    // Draw all labels at adjusted positions and store their bounding boxes
    const storedLabelPositions: Array<{ symbol: string; x: number; y: number; width: number; height: number }> = [];

    labelPositions.forEach(label => {
      // Draw small circle at original end point
      ctx.fillStyle = label.color;
      ctx.beginPath();
      ctx.arc(label.x, label.y, 3, 0, Math.PI * 2);
      ctx.fill();

      // Draw ticker symbol in line color with crisp rendering
      ctx.fillStyle = label.color;
      ctx.font = label.isHovered ? 'bold 15px monospace' : 'bold 14px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.imageSmoothingEnabled = false;
      ctx.fillText(label.symbol, label.x + 8, label.y);

      // Draw percentage
      const perfColor = label.performance >= 0 ? '#00ff88' : '#ff4444';
      ctx.fillStyle = perfColor;
      ctx.font = label.isHovered ? 'bold 15px monospace' : 'bold 14px monospace';
      const perfText = `${label.performance.toFixed(2)}%`;
      const symbolWidth = ctx.measureText(label.symbol).width;
      const perfWidth = ctx.measureText(perfText).width;
      ctx.fillText(perfText, label.x + 12 + symbolWidth, label.y);
      ctx.imageSmoothingEnabled = true;

      // Store label bounding box for hover detection
      const totalWidth = symbolWidth + perfWidth + 20;
      storedLabelPositions.push({
        symbol: label.symbol,
        x: label.x + 8,
        y: label.y - 10,
        width: totalWidth,
        height: 20
      });
    });

    // Store in ref for mouse handler
    labelPositionsRef.current = storedLabelPositions;

    // X-axis labels
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const numXLabels = 8;
    const visiblePoints = endIdx - startIdx;

    // For weekly view, find indices where market opens (9:30 AM ET) to mark day boundaries
    const dayBoundaries: number[] = [];
    if (timeframe === '1W') {
      let lastDate = '';
      for (let i = startIdx; i < endIdx; i++) {
        if (seriesData[0]?.data[i]) {
          const timestamp = seriesData[0].data[i].timestamp;
          const date = new Date(timestamp);

          const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/New_York',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: 'numeric',
            minute: 'numeric',
            hour12: false
          });
          const parts = formatter.formatToParts(date);
          const dateStr = `${parts.find(p => p.type === 'year')?.value}-${parts.find(p => p.type === 'month')?.value}-${parts.find(p => p.type === 'day')?.value}`;
          const hours = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
          const minutes = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
          const timeInMinutes = hours * 60 + minutes;

          // Mark first point at or after 9:30 AM each day
          if (dateStr !== lastDate && timeInMinutes >= 570) {
            dayBoundaries.push(i);
            lastDate = dateStr;
          }
        }
      }
    }

    for (let i = 0; i <= numXLabels; i++) {
      let dataIdx = startIdx + Math.floor(visiblePoints * i / numXLabels);

      // For weekly view, snap to day boundaries (9:30 AM)
      if (timeframe === '1W' && dayBoundaries.length > 0) {
        const targetIdx = startIdx + Math.floor(visiblePoints * i / numXLabels);
        // Find closest day boundary
        const closestBoundary = dayBoundaries.reduce((prev, curr) =>
          Math.abs(curr - targetIdx) < Math.abs(prev - targetIdx) ? curr : prev
        );
        dataIdx = closestBoundary;
      }

      if (seriesData[0]?.data[dataIdx]) {
        const x = xScale(dataIdx, maxDataPoints);
        const timestamp = seriesData[0].data[dataIdx].timestamp;
        const date = new Date(timestamp);

        let label = '';

        if (timeframe === '1D') {
          // Show time with AM/PM for intraday in ET
          label = date.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
            timeZone: 'America/New_York'
          });
        } else if (timeframe === '1W') {
          // Show day, date and time for 1 week in ET (at 9:30 AM)
          const dayLabel = date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', timeZone: 'America/New_York' });
          const timeLabel = date.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
            timeZone: 'America/New_York'
          });
          label = `${dayLabel} ${timeLabel}`;
        } else if (timeframe === '1M') {
          // Show date for 1 month
          label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        } else {
          // Show month/year for longer timeframes
          label = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        }

        ctx.fillText(label, x, margin.top + chartHeight + 10);
      }
    }

    // Draw crosshair with labels
    if (crosshair) {
      ctx.strokeStyle = '#ff8800'; // Crispy orange 100% opacity
      ctx.lineWidth = 1;
      ctx.setLineDash([]);

      // Vertical line
      if (crosshair.x >= margin.left && crosshair.x <= margin.left + chartWidth) {
        ctx.beginPath();
        ctx.moveTo(crosshair.x, margin.top);
        ctx.lineTo(crosshair.x, margin.top + chartHeight);
        ctx.stroke();

        // Find the data point at crosshair position
        const normalizedX = (crosshair.x - margin.left) / chartWidth;
        const dataIdx = Math.floor(startIdx + normalizedX * (endIdx - startIdx));

        if (seriesData[0]?.data[dataIdx]) {
          const timestamp = seriesData[0].data[dataIdx].timestamp;
          const date = new Date(timestamp);

          let label = '';

          if (timeframe === '1D') {
            label = date.toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
              timeZone: 'America/New_York'
            });
          } else if (timeframe === '1W') {
            const dayLabel = date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'America/New_York' });
            const timeLabel = date.toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
              timeZone: 'America/New_York'
            });
            label = `${dayLabel} ${timeLabel}`;
          } else if (timeframe === '1M') {
            label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
          } else {
            label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          }

          // Draw label box at bottom
          ctx.fillStyle = '#ff8800';
          ctx.font = 'bold 16px monospace'; // Increased from 12px to 16px (33% bigger, rounded to 30%)
          const textWidth = ctx.measureText(label).width;
          ctx.fillRect(crosshair.x - textWidth / 2 - 5, margin.top + chartHeight + 5, textWidth + 10, 24);
          ctx.fillStyle = '#000000';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, crosshair.x, margin.top + chartHeight + 17);
        }
      }

      // Horizontal line
      if (crosshair.y >= margin.top && crosshair.y <= margin.top + chartHeight) {
        ctx.beginPath();
        ctx.moveTo(margin.left, crosshair.y);
        ctx.lineTo(margin.left + chartWidth, crosshair.y);
        ctx.stroke();

        // Calculate Y value
        const normalizedY = 1 - ((crosshair.y - margin.top) / chartHeight);
        const yValue = minVal + (normalizedY * valueRange);

        // Draw label box on left
        ctx.fillStyle = '#ff8800';
        const yLabel = `${Math.abs(yValue).toFixed(2)}%`;
        ctx.font = 'bold 16px monospace'; // Increased from 12px to 16px (33% bigger, rounded to 30%)
        const yTextWidth = ctx.measureText(yLabel).width;
        ctx.fillRect(margin.left - yTextWidth - 15, crosshair.y - 12, yTextWidth + 10, 24);
        ctx.fillStyle = '#000000';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(yLabel, margin.left - 10, crosshair.y);
      }

      ctx.setLineDash([]);
    }

  }, [dimensions, seriesData, zoomRange, hoveredSeries, timeframe, crosshair]);

  // Redraw on changes
  useEffect(() => {
    if (seriesData.length === 0 || dimensions.width === 0 || dimensions.height === 0) {
      return;
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    const draw = () => {
      try {
        drawChart();
      } catch (err) {
        console.error('Chart draw error:', err);
      }
    };

    animationFrameRef.current = requestAnimationFrame(draw);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [dimensions.width, dimensions.height, seriesData, zoomRange, timeframe, hoveredSeries, crosshair]);

  // Mouse handlers for panning
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;

    setIsPanning(true);
    setPanStart({ x, rangeStart: zoomRange.start, rangeEnd: zoomRange.end });
  }, [zoomRange]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas || dimensions.width === 0) return;

    const rect = canvas.getBoundingClientRect();
    const margin = { top: 50, right: 100, bottom: 60, left: 70 };
    const legendX = dimensions.width - margin.right;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Update crosshair position if in chart area
    if (mouseX >= margin.left && mouseX <= dimensions.width - margin.right &&
      mouseY >= margin.top && mouseY <= dimensions.height - margin.bottom) {
      setCrosshair({ x: mouseX, y: mouseY });
    } else {
      setCrosshair(null);
    }

    // Check hover over ticker labels at end of lines
    let foundHover = false;
    for (const labelPos of labelPositionsRef.current) {
      if (mouseX >= labelPos.x && mouseX <= labelPos.x + labelPos.width &&
        mouseY >= labelPos.y && mouseY <= labelPos.y + labelPos.height) {
        setHoveredSeries(labelPos.symbol);
        foundHover = true;
        break;
      }
    }

    if (!foundHover && hoveredSeries !== null) {
      setHoveredSeries(null);
    }

    // Panning
    if (isPanning) {
      const chartWidth = dimensions.width - margin.left - margin.right;
      const dx = (e.clientX - rect.left - panStart.x) / chartWidth;
      const rangeSize = panStart.rangeEnd - panStart.rangeStart;

      let newStart = panStart.rangeStart - dx;
      let newEnd = panStart.rangeEnd - dx;

      // Clamp
      if (newStart < 0) {
        newStart = 0;
        newEnd = rangeSize;
      }
      if (newEnd > 1) {
        newEnd = 1;
        newStart = 1 - rangeSize;
      }

      setZoomRange({ start: newStart, end: newEnd });
    }
  }, [dimensions.width, seriesData, hoveredSeries, isPanning, panStart]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsPanning(false);
    setHoveredSeries(null);
    setCrosshair(null);
  }, []);

  // Zoom with wheel - prevent page zoom
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const wheelHandler = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (dimensions.width === 0) return;

      const rect = canvas.getBoundingClientRect();
      const margin = { top: 50, right: 100, bottom: 60, left: 70 };
      const chartWidth = dimensions.width - margin.left - margin.right;
      const mouseX = e.clientX - rect.left;

      // Only zoom in chart area
      if (mouseX < margin.left || mouseX > margin.left + chartWidth) return;

      const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
      const mousePos = (mouseX - margin.left) / chartWidth;
      const currentRange = zoomRange.end - zoomRange.start;
      const newRange = Math.min(1, Math.max(0.05, currentRange * zoomFactor));

      const pivot = zoomRange.start + currentRange * mousePos;
      let newStart = pivot - newRange * mousePos;
      let newEnd = newStart + newRange;

      // Clamp
      if (newStart < 0) {
        newStart = 0;
        newEnd = newRange;
      }
      if (newEnd > 1) {
        newEnd = 1;
        newStart = 1 - newRange;
      }

      setZoomRange({ start: newStart, end: newEnd });
    };

    // Add listener with passive: false to prevent default zoom
    canvas.addEventListener('wheel', wheelHandler, { passive: false });

    return () => {
      canvas.removeEventListener('wheel', wheelHandler);
    };
  }, [dimensions.width, zoomRange]);

  // Reset zoom
  const resetZoom = () => {
    setZoomRange({ start: 0, end: 1 });
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-dropdown]') && !target.closest('[data-dropdown-button]')) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  if (!isVisible) return null;

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: '#000000',
      fontFamily: 'monospace',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Bloomberg-Style Professional Header Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 32px',
        background: 'linear-gradient(180deg, #0a1a15 0%, #050d0a 100%)',
        borderBottom: '2px solid #ff8800',
        boxShadow: '0 4px 12px rgba(0,0,0,0.8)',
        position: 'relative',
        zIndex: 1,
        overflow: 'visible'
      }}>
        {/* Left Section - Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* Timeframe Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: 'bold',
              letterSpacing: '0.5px',
              textTransform: 'uppercase'
            }}>TIMEFRAME:</span>
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value as Timeframe)}
              style={{
                padding: '10px 20px',
                background: '#000000',
                color: '#ffffff',
                border: '2px solid #333333',
                borderRadius: '0',
                fontSize: '14px',
                fontWeight: 'bold',
                fontFamily: 'monospace',
                cursor: 'pointer',
                outline: 'none',
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5), 0 2px 4px rgba(255,255,255,0.1)',
                letterSpacing: '1px'
              }}
            >
              <option value="1D">1D</option>
              <option value="1W">1W</option>
              <option value="1M">1M</option>
              <option value="3M">3M</option>
              <option value="6M">6M</option>
              <option value="1Y">1Y</option>
              <option value="2Y">2Y</option>
              <option value="5Y">5Y</option>
              <option value="10Y">10Y</option>
              <option value="20Y">20Y</option>
              <option value="YTD">YTD</option>
            </select>
          </div>

          {/* Category Buttons */}
          {[
            { key: 'sectors', label: 'SECTORS', data: SECTORS, color: '#00d4ff' },
            { key: 'industries', label: 'INDUSTRIES', data: INDUSTRIES, color: '#ff6b35' },
            { key: 'special', label: 'SPECIAL', data: SPECIAL, color: '#a855f7' }
          ].map(category => {
            const allSelected = isAllSelected(category.data);
            const someSelected = category.data.some(item => selectedSymbols.includes(item.symbol));
            const isOpen = openDropdown === category.key;

            return (
              <div key={category.key} style={{ position: 'relative' }}>
                <button
                  ref={(el) => { buttonRefs.current[category.key] = el; }}
                  data-dropdown-button
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    if (isOpen) {
                      setOpenDropdown(null);
                      setDropdownPosition(null);
                    } else {
                      const rect = buttonRefs.current[category.key]?.getBoundingClientRect();
                      if (rect) {
                        setDropdownPosition({
                          top: rect.bottom + 4,
                          left: rect.left
                        });
                      }
                      setOpenDropdown(category.key);
                    }
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    toggleCategory(category.data);
                    setOpenDropdown(null);
                  }}
                  style={{
                    padding: '10px 20px',
                    background: '#000000',
                    color: '#ffffff',
                    border: `2px solid ${category.color}`,
                    borderRadius: '0',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    fontFamily: 'monospace',
                    cursor: 'pointer',
                    textTransform: 'uppercase',
                    userSelect: 'none',
                    letterSpacing: '1px',
                    boxShadow: someSelected
                      ? `0 0 15px ${category.color}88, inset 0 0 10px ${category.color}33`
                      : `0 2px 4px rgba(0,0,0,0.8)`,
                    transition: 'all 0.15s'
                  }}
                >
                  {allSelected ? '☑' : someSelected ? '◩' : '☐'} {category.label} ▼
                </button>

                {/* Dropdown - Rendered via Portal */}
                {isOpen && dropdownPosition && typeof window !== 'undefined' && createPortal(
                  <div
                    data-dropdown
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                    }}
                    style={{
                      position: 'fixed',
                      top: `${dropdownPosition.top}px`,
                      left: `${dropdownPosition.left}px`,
                      background: '#000000',
                      border: `3px solid ${category.color}`,
                      borderRadius: '0',
                      padding: '12px',
                      zIndex: 999999,
                      minWidth: '280px',
                      maxHeight: '450px',
                      overflowY: 'auto',
                      boxShadow: `0 12px 32px rgba(0,0,0,0.95), 0 0 20px ${category.color}33`
                    }}
                  >
                    {/* Select All Option */}
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        toggleCategory(category.data);
                      }}
                      style={{
                        padding: '10px 14px',
                        cursor: 'pointer',
                        color: allSelected ? category.color : '#ffffff',
                        fontSize: '13px',
                        fontWeight: 'bold',
                        borderBottom: `2px solid ${category.color}44`,
                        marginBottom: '6px',
                        background: allSelected ? 'rgba(255,255,255,0.08)' : 'transparent',
                        userSelect: 'none',
                        transition: 'background 0.15s',
                        letterSpacing: '0.5px'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.12)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = allSelected ? 'rgba(255,255,255,0.08)' : 'transparent';
                      }}
                    >
                      {allSelected ? '☑' : '☐'} SELECT ALL
                    </div>

                    {/* Individual Items */}
                    {category.data.map(item => {
                      const isSelected = selectedSymbols.includes(item.symbol);
                      return (
                        <div
                          key={item.symbol}
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            toggleSymbol(item.symbol);
                          }}
                          style={{
                            padding: '10px 14px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            fontSize: '13px',
                            color: isSelected ? '#ffffff' : '#999999',
                            background: isSelected ? 'rgba(255,255,255,0.08)' : 'transparent',
                            background: isSelected ? 'rgba(255,255,255,0.08)' : 'transparent',
                            borderRadius: '0',
                            transition: 'background 0.15s',
                            userSelect: 'none',
                            fontWeight: isSelected ? 'bold' : 'normal'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(255,255,255,0.12)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = isSelected ? 'rgba(255,255,255,0.08)' : 'transparent';
                          }}
                        >
                          <span style={{ color: item.color, fontSize: '16px' }}>●</span>
                          <span>{isSelected ? '☑' : '☐'}</span>
                          <span style={{ fontWeight: isSelected ? 'bold' : 'normal' }}>{item.symbol}</span>
                          <span style={{ fontSize: '10px', color: '#666', marginLeft: 'auto' }}>{item.name}</span>
                        </div>
                      );
                    })}
                  </div>,
                  document.body
                )}
              </div>
            );
          })}

          {/* Waves Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setIsWaveMode(!isWaveMode);
              setOpenDropdown(null);
            }}
            style={{
              padding: '10px 20px',
              background: '#000000',
              color: '#ffffff',
              border: '2px solid #ff8800',
              borderRadius: '0',
              fontSize: '14px',
              fontWeight: 'bold',
              fontFamily: 'monospace',
              cursor: 'pointer',
              textTransform: 'uppercase',
              userSelect: 'none',
              letterSpacing: '1px',
              boxShadow: isWaveMode
                ? '0 0 15px #ff880088, inset 0 0 10px #ff880033'
                : '0 2px 4px rgba(0,0,0,0.8)',
              transition: 'all 0.15s'
            }}
          >
            {isWaveMode ? '☑' : '☐'} WAVES 🌊
          </button>

          {/* Selected Count */}
          {selectedSymbols.length > 0 && !isWaveMode && (
            <div style={{
              padding: '10px 20px',
              background: '#000000',
              border: '2px solid #00ff88',
              borderRadius: '0',
              fontSize: '13px',
              fontWeight: 'bold',
              color: '#00ff88',
              letterSpacing: '0.5px',
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5), 0 0 8px #00ff8833'
            }}>
              {selectedSymbols.length} SYMBOL{selectedSymbols.length !== 1 ? 'S' : ''} SELECTED
            </div>
          )}
        </div>

        {/* Right Section - Reset Zoom */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {(zoomRange.start !== 0 || zoomRange.end !== 1) && (
            <button
              onClick={resetZoom}
              style={{
                padding: '10px 20px',
                background: '#000000',
                color: '#ffffff',
                border: '2px solid #ff0000',
                borderRadius: '0',
                fontSize: '13px',
                fontWeight: 'bold',
                fontFamily: 'monospace',
                cursor: 'pointer',
                letterSpacing: '0.5px',
                textTransform: 'uppercase',
                boxShadow: '0 2px 4px rgba(0,0,0,0.8)',
                transition: 'all 0.15s'
              }}
            >
              RESET ZOOM
            </button>
          )}
        </div>
      </div>

      {/* Chart Container */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          position: 'relative',
          minHeight: '500px',
          overflow: 'hidden'
        }}
      >
        {loading && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
            color: '#666',
            fontSize: '14px'
          }}>
            <div style={{
              width: '40px',
              height: '40px',
              border: '3px solid #1a1a1a',
              borderTop: '3px solid #00d4ff',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 12px'
            }} />
            Loading {selectedSymbols.length} symbol{selectedSymbols.length !== 1 ? 's' : ''}...
          </div>
        )}

        {!loading && selectedSymbols.length === 0 && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
            color: '#666',
            fontSize: '14px'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📊</div>
            <div>Select symbols to view performance comparison</div>
          </div>
        )}

        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            cursor: isPanning ? 'grabbing' : 'grab',
            display: !loading && seriesData.length > 0 ? 'block' : 'none',
            touchAction: 'none'
          }}
        />
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default PerformanceDashboard;
