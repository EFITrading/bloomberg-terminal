'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

// ETF Definitions
const SECTORS = [
  { symbol: 'XLK', name: 'Technology', color: '#00d4ff' },
  { symbol: 'XLF', name: 'Financials', color: '#ff6b35' },
  { symbol: 'XLV', name: 'Healthcare', color: '#4ecdc4' },
  { symbol: 'XLI', name: 'Industrials', color: '#ffd93d' },
  { symbol: 'XLY', name: 'Consumer Discretionary', color: '#ff006e' },
  { symbol: 'XLP', name: 'Consumer Staples', color: '#8338ec' },
  { symbol: 'XLE', name: 'Energy', color: '#06ffa5' },
  { symbol: 'XLU', name: 'Utilities', color: '#ff9f1c' },
  { symbol: 'XLRE', name: 'Real Estate', color: '#2ec4b6' },
  { symbol: 'XLB', name: 'Materials', color: '#e71d36' },
  { symbol: 'XLC', name: 'Communication Services', color: '#a855f7' }
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
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });
  const [seriesData, setSeriesData] = useState<SeriesData[]>([]);
  const [loading, setLoading] = useState(false);
  
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
    
    if (selectedSymbols.length === 0) {
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
      // Map timeframe to API format
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

      // Batch symbols (max 10 per request)
      const chunks: string[][] = [];
      for (let i = 0; i < selectedSymbols.length; i += 10) {
        chunks.push(selectedSymbols.slice(i, i + 10));
      }

      // Fetch all chunks
      const responses = await Promise.all(
        chunks.map(chunk =>
          fetch('/api/bulk-chart-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              symbols: chunk,
              timeframe: apiTimeframe,
              optimized: true
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
      
      // Process data into series
      const series: SeriesData[] = selectedSymbols
        .map(symbol => {
          const metadata = allSymbols.find(s => s.symbol === symbol);
          const rawData = allData[symbol];

          if (!metadata || !rawData || rawData.length === 0) {
            return null;
          }

          // Filter market hours for 1D
          let filteredData = rawData;
          if (timeframe === '1D') {
            filteredData = rawData.filter(point => {
              const date = new Date(point.timestamp);
              const hours = date.getUTCHours();
              const minutes = date.getUTCMinutes();
              const totalMinutes = hours * 60 + minutes;
              return totalMinutes >= 810 && totalMinutes <= 1200; // 13:30-20:00 UTC = 6:30-13:00 PST
            });
          }

          if (filteredData.length === 0) return null;

          // Calculate performance
          const firstPrice = filteredData[0].close;
          const dataPoints: DataPoint[] = filteredData.map(point => ({
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
  }, [selectedSymbols, timeframe]);

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

  // Fetch data when symbols or timeframe change
  useEffect(() => {
    if (isVisible && selectedSymbols.length > 0) {
      fetchData();
    } else if (selectedSymbols.length === 0) {
      // Clear data when no symbols selected
      setSeriesData([]);
      lastFetchKeyRef.current = ''; // Reset fetch key
    }
  }, [isVisible, fetchData, selectedSymbols.length]);

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

    const margin = { top: 50, right: 200, bottom: 60, left: 70 };
    const chartWidth = dimensions.width - margin.left - margin.right;
    const chartHeight = dimensions.height - margin.top - margin.bottom;

    if (chartWidth <= 0 || chartHeight <= 0) return;

    // Calculate visible data range
    const maxDataPoints = Math.max(...seriesData.map(s => s.data.length));
    const startIdx = Math.floor(zoomRange.start * maxDataPoints);
    const endIdx = Math.ceil(zoomRange.end * maxDataPoints);

    // Find min/max values in visible range
    let minVal = Infinity;
    let maxVal = -Infinity;
    
    seriesData.forEach(series => {
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

    // Grid
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1;

    // Horizontal grid lines
    for (let i = 0; i <= 10; i++) {
      const y = margin.top + (chartHeight * i / 10);
      ctx.beginPath();
      ctx.moveTo(margin.left, y);
      ctx.lineTo(margin.left + chartWidth, y);
      ctx.stroke();
    }

    // Y-axis labels
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (let i = 0; i <= 10; i++) {
      const value = minVal + (valueRange * (10 - i) / 10);
      const y = margin.top + (chartHeight * i / 10);
      ctx.fillText(`${value >= 0 ? '+' : ''}${value.toFixed(1)}%`, margin.left - 10, y);
    }

    // Zero line
    if (minVal < 0 && maxVal > 0) {
      const zeroY = yScale(0);
      ctx.strokeStyle = '#333333';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(margin.left, zeroY);
      ctx.lineTo(margin.left + chartWidth, zeroY);
      ctx.stroke();
    }

    // Draw lines
    seriesData.forEach(series => {
      const isHovered = hoveredSeries === series.symbol;
      
      ctx.strokeStyle = series.color;
      ctx.lineWidth = isHovered ? 3 : 2;
      ctx.globalAlpha = isHovered ? 1 : 0.85;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      ctx.beginPath();
      let started = false;

      const visibleData = series.data.slice(
        Math.max(0, startIdx),
        Math.min(series.data.length, endIdx)
      );

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
      });

      ctx.stroke();
    });

    ctx.globalAlpha = 1;

    // Legend
    const legendX = margin.left + chartWidth + 20;
    let legendY = margin.top;

    const sortedSeries = [...seriesData].sort((a, b) => b.performance - a.performance);

    sortedSeries.forEach(series => {
      const isHovered = hoveredSeries === series.symbol;
      
      // Background for hovered
      if (isHovered) {
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(legendX - 5, legendY - 12, 180, 22);
      }

      // Color dot
      ctx.fillStyle = series.color;
      ctx.beginPath();
      ctx.arc(legendX + 5, legendY, 4, 0, Math.PI * 2);
      ctx.fill();

      // Symbol
      ctx.fillStyle = '#ffffff';
      ctx.font = isHovered ? 'bold 12px monospace' : '11px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(series.symbol, legendX + 15, legendY);

      // Performance
      const perfColor = series.performance >= 0 ? '#00ff88' : '#ff4444';
      ctx.fillStyle = perfColor;
      ctx.font = isHovered ? 'bold 12px monospace' : '11px monospace';
      const perfText = `${series.performance >= 0 ? '+' : ''}${series.performance.toFixed(2)}%`;
      ctx.fillText(perfText, legendX + 90, legendY);

      legendY += 24;
    });

    // Title
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('PERFORMANCE COMPARISON', margin.left, 15);

    // X-axis labels
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const numXLabels = 8;
    const visiblePoints = endIdx - startIdx;
    for (let i = 0; i <= numXLabels; i++) {
      const dataIdx = startIdx + Math.floor(visiblePoints * i / numXLabels);
      if (seriesData[0]?.data[dataIdx]) {
        const x = xScale(dataIdx, maxDataPoints);
        const timestamp = seriesData[0].data[dataIdx].timestamp;
        const date = new Date(timestamp);
        let label = '';
        
        if (timeframe === '1D') {
          // Show time only for intraday
          label = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
        } else if (timeframe === '1W') {
          // Show day and time for 1 week
          const dayLabel = date.toLocaleDateString('en-US', { weekday: 'short' });
          const timeLabel = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
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

    // Timeframe indicator
    ctx.fillStyle = '#888888';
    ctx.font = '12px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(timeframe, dimensions.width - margin.right - 10, 15);

    // Draw crosshair
    if (crosshair) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);

      // Vertical line
      if (crosshair.x >= margin.left && crosshair.x <= margin.left + chartWidth) {
        ctx.beginPath();
        ctx.moveTo(crosshair.x, margin.top);
        ctx.lineTo(crosshair.x, margin.top + chartHeight);
        ctx.stroke();
      }

      // Horizontal line
      if (crosshair.y >= margin.top && crosshair.y <= margin.top + chartHeight) {
        ctx.beginPath();
        ctx.moveTo(margin.left, crosshair.y);
        ctx.lineTo(margin.left + chartWidth, crosshair.y);
        ctx.stroke();
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
    const margin = { top: 50, right: 200, bottom: 60, left: 70 };
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

    // Check legend hover
    if (mouseX > legendX && mouseY > margin.top && seriesData.length > 0) {
      const legendItemHeight = 24;
      const hoveredIdx = Math.floor((mouseY - margin.top) / legendItemHeight);
      const sortedSeries = [...seriesData].sort((a, b) => b.performance - a.performance);
      
      if (hoveredIdx >= 0 && hoveredIdx < sortedSeries.length) {
        setHoveredSeries(sortedSeries[hoveredIdx].symbol);
      } else {
        setHoveredSeries(null);
      }
    } else {
      if (hoveredSeries !== null) {
        setHoveredSeries(null);
      }
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

  // Zoom with wheel
  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    
    const canvas = canvasRef.current;
    if (!canvas || dimensions.width === 0) return;

    const rect = canvas.getBoundingClientRect();
    const margin = { top: 50, right: 200, bottom: 60, left: 70 };
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
      {/* Controls Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        padding: '20px 24px',
        borderBottom: '1px solid #1a1a1a',
        flexWrap: 'wrap',
        position: 'relative',
        zIndex: 1,
        overflow: 'visible'
      }}>
        {/* Timeframe Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: '#666', fontSize: '11px', textTransform: 'uppercase' }}>Timeframe:</span>
          <select
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value as Timeframe)}
            style={{
              padding: '8px 16px',
              background: '#1a1a1a',
              color: '#fff',
              border: '1px solid #333',
              borderRadius: '4px',
              fontSize: '12px',
              fontFamily: 'monospace',
              cursor: 'pointer',
              outline: 'none'
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
          { key: 'sectors', label: 'Sectors', data: SECTORS, color: '#00d4ff' },
          { key: 'industries', label: 'Industries', data: INDUSTRIES, color: '#ff6b35' },
          { key: 'special', label: 'Special', data: SPECIAL, color: '#a855f7' }
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
                  padding: '8px 16px',
                  background: someSelected ? category.color : '#1a1a1a',
                  color: someSelected ? '#000' : '#fff',
                  border: `1px solid ${category.color}`,
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  fontFamily: 'monospace',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  textTransform: 'uppercase',
                  userSelect: 'none'
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
                    background: '#1a1a1a',
                    border: `2px solid ${category.color}`,
                    borderRadius: '4px',
                    padding: '8px',
                    zIndex: 999999,
                    minWidth: '240px',
                    maxHeight: '400px',
                    overflowY: 'auto',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.9)'
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
                      padding: '8px 12px',
                      cursor: 'pointer',
                      color: allSelected ? category.color : '#999',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      borderBottom: '1px solid #333',
                      marginBottom: '4px',
                      background: allSelected ? 'rgba(255,255,255,0.05)' : 'transparent',
                      userSelect: 'none',
                      transition: 'background 0.15s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = allSelected ? 'rgba(255,255,255,0.05)' : 'transparent';
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
                          padding: '8px 12px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          fontSize: '11px',
                          color: isSelected ? '#fff' : '#999',
                          background: isSelected ? 'rgba(255,255,255,0.05)' : 'transparent',
                          borderRadius: '2px',
                          transition: 'background 0.15s',
                          userSelect: 'none'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = isSelected ? 'rgba(255,255,255,0.05)' : 'transparent';
                        }}
                      >
                        <span style={{ color: item.color, fontSize: '14px' }}>●</span>
                        <span>{isSelected ? '☑' : '☐'}</span>
                        <span style={{ fontWeight: isSelected ? 'bold' : 'normal' }}>{item.symbol}</span>
                        <span style={{ fontSize: '9px', color: '#666', marginLeft: 'auto' }}>{item.name}</span>
                      </div>
                    );
                  })}
                </div>,
                document.body
              )}
            </div>
          );
        })}

        {/* Selected Count */}
        {selectedSymbols.length > 0 && (
          <div style={{
            padding: '8px 16px',
            background: '#1a1a1a',
            border: '1px solid #333',
            borderRadius: '4px',
            fontSize: '11px',
            color: '#00ff88'
          }}>
            {selectedSymbols.length} symbol{selectedSymbols.length !== 1 ? 's' : ''} selected
          </div>
        )}

        {/* Reset Zoom */}
        {(zoomRange.start !== 0 || zoomRange.end !== 1) && (
          <button
            onClick={resetZoom}
            style={{
              padding: '8px 16px',
              background: '#1a1a1a',
              color: '#fff',
              border: '1px solid #666',
              borderRadius: '4px',
              fontSize: '11px',
              fontFamily: 'monospace',
              cursor: 'pointer',
              marginLeft: 'auto'
            }}
          >
            Reset Zoom
          </button>
        )}
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
          onWheel={handleWheel}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            cursor: isPanning ? 'grabbing' : 'grab',
            display: seriesData.length > 0 ? 'block' : 'none',
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
