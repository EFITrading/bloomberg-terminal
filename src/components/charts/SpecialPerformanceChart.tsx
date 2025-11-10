'use client';

import React, { useState, useEffect, useRef } from 'react';

interface SpecialDataPoint {
  timestamp: number;
  value: number;
}

interface SpecialPerformance {
  symbol: string;
  name: string;
  color: string;
  data: SpecialDataPoint[];
  currentPerformance: number;
}

type Timeframe = '1D' | '1W' | '1M' | '3M' | '6M' | '1Y' | '2Y' | '5Y' | '10Y' | '20Y' | 'YTD';

const SPECIAL_ETFS = [
  { symbol: 'IWF', name: 'Russell 1000 Growth', color: '#00d4ff' },
  { symbol: 'IWD', name: 'Russell 1000 Value', color: '#ff6b35' },
  { symbol: 'IJR', name: 'S&P 600', color: '#ffd93d' },
  { symbol: 'USMV', name: 'Min Volatility', color: '#ff006e' },
  { symbol: 'VYM', name: 'High Dividend', color: '#8338ec' },
  { symbol: 'PKW', name: 'Buyback', color: '#06ffa5' },
  { symbol: 'CSD', name: 'Social Capital', color: '#fb5607' },
  { symbol: 'GURU', name: 'Hedge Fund', color: '#ffbe0b' },
  { symbol: 'IPO', name: 'IPOs', color: '#00ff00' },
  { symbol: 'QUAL', name: 'Quality', color: '#ff006e' },
  { symbol: 'PSP', name: 'Pacer Swan', color: '#06ffa5' },
  { symbol: 'IVE', name: 'S&P 500 Value', color: '#ffd93d' },
  { symbol: 'IVW', name: 'S&P 500 Growth', color: '#ffbe0b' },
  { symbol: 'IJJ', name: 'S&P 600 Growth', color: '#3a86ff' },
  { symbol: 'IJH', name: 'S&P 400', color: '#4ecdc4' },
  { symbol: 'IWN', name: 'Russell 2000 Value', color: '#ff0080' },
  { symbol: 'IWM', name: 'Russell 2000', color: '#ffa500' },
  { symbol: 'IWO', name: 'Russell 2000 Growth', color: '#00ffff' },
  { symbol: 'DIA', name: 'Dow Jones', color: '#ffffff' },
  { symbol: 'SPY', name: 'S&P 500', color: '#00ff00' },
  { symbol: 'QQQ', name: 'Nasdaq', color: '#ff0000' }
];

const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

const SpecialPerformanceChart: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>('1M');
  const [performanceData, setPerformanceData] = useState<SpecialPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [hoveredSector, setHoveredSector] = useState<string | null>(null);
  
  // Professional zoom/pan state
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 1 }); // 0 to 1 as percentage
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, rangeStart: 0 });
  
  // Crosshair state
  const [crosshair, setCrosshair] = useState<{ x: number; y: number } | null>(null);
  
  // Benchmarked mode state
  const [isBenchmarked, setIsBenchmarked] = useState(false);
  
  // Custom date range state
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [useCustomDates, setUseCustomDates] = useState(false);
  
  // Category filter state - all active by default
  const [activeCategories, setActiveCategories] = useState({
    growth: true,
    value: true,
    specialty: true
  });
  
  // Category definitions for Special ETFs
  const GROWTH_TICKERS = ['IVW', 'IJH', 'IWO', 'IWF', 'IJR'];
  const VALUE_TICKERS = ['IVE', 'IJJ', 'IWN', 'IWD'];
  const SPECIALTY_TICKERS = ['PKW', 'USMV', 'VYM', 'QUAL', 'IPO', 'GURU', 'CSD', 'PSP'];
  
  // Toggle category filter
  const toggleCategory = (category: 'growth' | 'value' | 'specialty') => {
    setActiveCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };
  
  // Filter performance data based on active categories
  const getFilteredData = () => {
    const allowedTickers: string[] = [];
    if (activeCategories.growth) allowedTickers.push(...GROWTH_TICKERS);
    if (activeCategories.value) allowedTickers.push(...VALUE_TICKERS);
    if (activeCategories.specialty) allowedTickers.push(...SPECIALTY_TICKERS);
    
    // Don't include indexes in the chart lines (only in legend for reference)
    // const indexTickers = ['DIA', 'SPY', 'QQQ', 'IWM'];
    // allowedTickers.push(...indexTickers);
    
    return performanceData.filter(item => allowedTickers.includes(item.symbol));
  };

  // Get date range based on timeframe
  const getDateRange = (tf: Timeframe): { startDate: string; endDate: string } => {
    const end = new Date();
    const start = new Date();
    
    if (useCustomDates && customStartDate && customEndDate) {
      return { startDate: customStartDate, endDate: customEndDate };
    }
    
    switch (tf) {
      case '1D':
        start.setDate(end.getDate() - 1);
        break;
      case '1W':
        start.setDate(end.getDate() - 7);
        break;
      case '1M':
        start.setMonth(end.getMonth() - 1);
        break;
      case '3M':
        start.setMonth(end.getMonth() - 3);
        break;
      case '6M':
        start.setMonth(end.getMonth() - 6);
        break;
      case '1Y':
        start.setFullYear(end.getFullYear() - 1);
        break;
      case '2Y':
        start.setFullYear(end.getFullYear() - 2);
        break;
      case '5Y':
        start.setFullYear(end.getFullYear() - 5);
        break;
      case '10Y':
        start.setFullYear(end.getFullYear() - 10);
        break;
      case '20Y':
        start.setFullYear(end.getFullYear() - 20);
        break;
      case 'YTD':
        start.setMonth(0, 1); // January 1st of current year
        break;
    }
    
    return {
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0]
    };
  };

  // Fetch data from Polygon API
  const fetchSpecialData = async () => {
    setLoading(true);
    console.log('🔵 SpecialPerformanceChart: Starting data fetch...');
    try {
      const { startDate, endDate } = getDateRange(timeframe);
      console.log('🔵 Date range:', startDate, 'to', endDate);
      
      const dataPromises = SPECIAL_ETFS.map(async (etf) => {
        try {
          const url = `https://api.polygon.io/v2/aggs/ticker/${etf.symbol}/range/1/day/${startDate}/${endDate}?adjusted=true&sort=asc&apiKey=${POLYGON_API_KEY}`;
          const response = await fetch(url);
          
          if (!response.ok) {
            console.warn(`Failed to fetch ${etf.symbol}`);
            return null;
          }
          
          const data = await response.json();
          
          if (!data.results || data.results.length === 0) {
            return null;
          }
          
          // Calculate performance relative to first data point
          const firstClose = data.results[0].c;
          const performancePoints: SpecialDataPoint[] = data.results.map((bar: any) => ({
            timestamp: bar.t,
            value: ((bar.c - firstClose) / firstClose) * 100
          }));
          
          const currentPerformance = performancePoints[performancePoints.length - 1]?.value || 0;
          
          return {
            symbol: etf.symbol,
            name: etf.name,
            color: etf.color,
            data: performancePoints,
            currentPerformance
          };
        } catch (error) {
          console.error(`Error fetching ${etf.symbol}:`, error);
          return null;
        }
      });
      
      const results = await Promise.all(dataPromises);
      const validResults = results.filter((r): r is SpecialPerformance => r !== null);
      
      console.log('🔵 Fetched', validResults.length, 'valid results out of', SPECIAL_ETFS.length, 'ETFs');
      
      // If benchmarked mode, subtract SPY performance
      if (isBenchmarked) {
        const spyData = validResults.find(r => r.symbol === 'SPY');
        if (spyData) {
          validResults.forEach(result => {
            if (result.symbol !== 'SPY') {
              result.data = result.data.map((point, idx) => ({
                timestamp: point.timestamp,
                value: point.value - (spyData.data[idx]?.value || 0)
              }));
              result.currentPerformance = result.data[result.data.length - 1]?.value || 0;
            } else {
              // SPY becomes flat line at 0 in benchmarked mode
              result.data = result.data.map(point => ({
                timestamp: point.timestamp,
                value: 0
              }));
              result.currentPerformance = 0;
            }
          });
        }
      }
      
      console.log('🔵 Setting performance data with', validResults.length, 'items');
      setPerformanceData(validResults);
      console.log('🔵 Valid results sample:', validResults.slice(0, 2).map(r => ({ symbol: r.symbol, dataPoints: r.data.length })));
    } catch (error) {
      console.error('❌ Error fetching special data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Auto-refresh every 1 minute
  useEffect(() => {
    fetchSpecialData();
    const interval = setInterval(fetchSpecialData, 60000);
    return () => clearInterval(interval);
  }, [timeframe, isBenchmarked, useCustomDates, customStartDate, customEndDate]);

  // Handle canvas resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        console.log('🔵 Setting dimensions:', { width, height });
        setDimensions({ width, height });
      } else {
        console.log('🔵 containerRef.current is null, will retry');
      }
    };

    // Update dimensions when loading state changes (container appears)
    updateDimensions();
    
    window.addEventListener('resize', updateDimensions);
    return () => {
      window.removeEventListener('resize', updateDimensions);
    };
  }, [loading]); // Re-run when loading changes

  // Draw chart
  useEffect(() => {
    console.log('🔵 Draw effect triggered, performanceData length:', performanceData.length, 'dimensions:', dimensions);
    const canvas = canvasRef.current;
    if (!canvas || performanceData.length === 0 || dimensions.width === 0 || dimensions.height === 0) {
      console.log('🔵 Draw skipped - canvas:', !!canvas, 'data length:', performanceData.length, 'dimensions:', dimensions);
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    console.log('🔵 Drawing chart with', performanceData.length, 'data series');

    // Get device pixel ratio for sharp rendering (matching SectorPerformanceChart)
    const dpr = window.devicePixelRatio || 1;

    // Set canvas size with device pixel ratio for crisp rendering
    canvas.width = dimensions.width * dpr;
    canvas.height = dimensions.height * dpr;
    
    // Scale context to match device pixel ratio
    ctx.scale(dpr, dpr);
    
    // Set canvas display size
    canvas.style.width = dimensions.width + 'px';
    canvas.style.height = dimensions.height + 'px';

    // Clear canvas with black background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, dimensions.width, dimensions.height);

    const filteredData = getFilteredData();
    console.log('🔵 Filtered data length:', filteredData.length);
    if (filteredData.length === 0) return;

    // Chart margins - matching SectorPerformanceChart
    const margin = { top: 40, right: 100, bottom: 80, left: 60 };
    const chartWidth = dimensions.width - margin.left - margin.right;
    const chartHeight = dimensions.height - margin.top - margin.bottom;

    // Get all data points to determine range
    const allDataPoints = filteredData.flatMap(s => s.data);
    if (allDataPoints.length === 0) return;

    // Calculate visible data range
    const totalPoints = allDataPoints.length / filteredData.length;
    const startIdx = Math.floor(visibleRange.start * totalPoints);
    const endIdx = Math.ceil(visibleRange.end * totalPoints);

    // Get min/max for Y-axis
    const visiblePoints = filteredData.flatMap(s => s.data.slice(startIdx, endIdx));
    const minY = Math.min(...visiblePoints.map(p => p.value));
    const maxY = Math.max(...visiblePoints.map(p => p.value));
    const yRange = maxY - minY || 1;
    const yPadding = yRange * 0.1;

    // Helper functions
    const getX = (index: number) => {
      const relativeIdx = (index - startIdx) / (endIdx - startIdx);
      return margin.left + relativeIdx * chartWidth;
    };

    const getY = (value: number) => {
      return margin.top + chartHeight - ((value - (minY - yPadding)) / (yRange + 2 * yPadding)) * chartHeight;
    };

    // Clip to chart area
    ctx.save();
    ctx.beginPath();
    ctx.rect(margin.left, margin.top, chartWidth, chartHeight);
    ctx.clip();

    // Draw grid lines - REMOVED dashed lines
    // ctx.strokeStyle = '#1a1a1a';
    // ctx.lineWidth = 1;
    // ctx.setLineDash([5, 5]);

    // Horizontal grid lines - REMOVED
    // for (let i = 0; i <= 5; i++) {
    //   const y = margin.top + (chartHeight / 5) * i;
    //   ctx.beginPath();
    //   ctx.moveTo(margin.left, y);
    //   ctx.lineTo(margin.left + chartWidth, y);
    //   ctx.stroke();
    // }

    // Vertical grid lines - REMOVED
    // for (let i = 0; i <= 10; i++) {
    //   const x = margin.left + (chartWidth / 10) * i;
    //   ctx.beginPath();
    //   ctx.moveTo(x, margin.top);
    //   ctx.lineTo(x, margin.top + chartHeight);
    //   ctx.stroke();
    // }
    
    // ctx.setLineDash([]);

    // Draw zero line if visible
    if (minY < 0 && maxY > 0) {
      const zeroY = getY(0);
      ctx.strokeStyle = '#444444';
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(margin.left, zeroY);
      ctx.lineTo(margin.left + chartWidth, zeroY);
      ctx.stroke();
    }

    // Draw lines for each ETF with proper antialiasing and hover effects
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    filteredData.forEach(etf => {
      const visibleData = etf.data.slice(startIdx, endIdx);
      if (visibleData.length < 2) return;

      const isHovered = hoveredSector === etf.symbol;
      ctx.strokeStyle = etf.color;
      ctx.lineWidth = isHovered ? 1.5 : 1;
      ctx.globalAlpha = isHovered || !hoveredSector ? 1 : 0.3; // Full opacity unless another is hovered
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      ctx.beginPath();
      visibleData.forEach((point, idx) => {
        const x = getX(startIdx + idx);
        const y = getY(point.value);
        if (idx === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
    });

    ctx.globalAlpha = 1;
    
    // Restore context to remove clipping
    ctx.restore();

    // Draw crosshair
    if (crosshair) {
      ctx.strokeStyle = '#ff6600';
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

      // Calculate value at crosshair
      const relativeX = (crosshair.x - margin.left) / chartWidth;
      const dataIdx = Math.floor(startIdx + relativeX * (endIdx - startIdx));
      const yValue = ((margin.top + chartHeight - crosshair.y) / chartHeight) * (yRange + 2 * yPadding) + (minY - yPadding);

      // Draw Y-axis label
      ctx.fillStyle = '#ff6600';
      ctx.fillRect(5, crosshair.y - 10, 50, 20);
      ctx.fillStyle = '#000';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${yValue.toFixed(1)}%`, 30, crosshair.y + 4);

      // Draw X-axis label (date)
      if (filteredData[0]?.data[dataIdx]) {
        const timestamp = filteredData[0].data[dataIdx].timestamp;
        const date = new Date(timestamp);
        ctx.fillStyle = '#ff6600';
        ctx.fillRect(crosshair.x - 40, dimensions.height - 25, 80, 20);
        ctx.fillStyle = '#000';
        ctx.textAlign = 'center';
        ctx.fillText(date.toLocaleDateString(), crosshair.x, dimensions.height - 11);
      }
    }

    // Draw Y-axis labels - matching SectorPerformanceChart font
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 5; i++) {
      const value = (minY - yPadding) + ((yRange + 2 * yPadding) / 5) * (5 - i);
      const y = margin.top + (chartHeight / 5) * i;
      ctx.fillText(`${value.toFixed(1)}%`, margin.left - 10, y + 4);
    }

    // X-axis time labels - adaptive based on zoom (matching SectorPerformanceChart)
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';

    const zoom = 1 / (visibleRange.end - visibleRange.start);
    const xLabelCount = Math.min(12, Math.max(6, Math.floor(6 * zoom)));
    const visibleDataPoints = endIdx - startIdx;
    
    for (let i = 0; i <= xLabelCount; i++) {
      const dataIndex = startIdx + Math.floor(visibleDataPoints * i / xLabelCount);
      if (filteredData[0]?.data[dataIndex]) {
        const x = getX(dataIndex);
        if (x >= margin.left && x <= margin.left + chartWidth) {
          const date = new Date(filteredData[0].data[dataIndex].timestamp);
          const label = timeframe === '1D' 
            ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
          
          ctx.fillText(label, x, dimensions.height - margin.bottom + 30);
        }
      }
    }

    // Draw legend - matching SectorPerformanceChart style with hover backgrounds
    const legendX = margin.left + chartWidth + 30;
    let legendY = margin.top + 20;
    
    // Sort by performance
    const sortedData = [...filteredData].sort((a, b) => b.currentPerformance - a.currentPerformance);
    
    sortedData.forEach((etf, index) => {
      const y = legendY + (index * 28);
      const isHovered = hoveredSector === etf.symbol;

      // Background for hovered item
      if (isHovered) {
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(legendX - 5, y - 14, 190, 26);
      }

      // Color line
      ctx.fillStyle = etf.color;
      ctx.fillRect(legendX, y - 6, 24, 4);

      // Symbol - only show ticker
      ctx.fillStyle = isHovered ? '#ffffff' : '#dddddd';
      ctx.font = isHovered ? 'bold 14px monospace' : '13px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(etf.symbol, legendX + 30, y);
    });

  }, [performanceData, dimensions, visibleRange, hoveredSector, crosshair, activeCategories, timeframe]);

  // Mouse handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    setIsDragging(true);
    setDragStart({
      x: e.clientX - rect.left,
      rangeStart: visibleRange.start
    });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // Check for legend hover
    const margin = { top: 40, right: 100, bottom: 80, left: 60 };
    const chartWidth = dimensions.width - margin.left - margin.right;
    const legendX = margin.left + chartWidth + 30;
    const legendY = margin.top + 20;
    
    const filteredData = getFilteredData();
    const sortedData = [...filteredData].sort((a, b) => b.currentPerformance - a.currentPerformance);
    
    let found = false;
    sortedData.forEach((etf, index) => {
      const y = legendY + (index * 28);
      if (mouseX >= legendX - 5 && mouseX <= legendX + 185 && 
          mouseY >= y - 14 && mouseY <= y + 12) {
        setHoveredSector(etf.symbol);
        found = true;
      }
    });
    
    if (!found && !isDragging) {
      setHoveredSector(null);
    }
    
    // Update crosshair
    if (mouseX >= margin.left && mouseX <= dimensions.width - margin.right &&
        mouseY >= margin.top && mouseY <= dimensions.height - margin.bottom) {
      setCrosshair({ x: mouseX, y: mouseY });
    } else {
      setCrosshair(null);
    }
    
    if (isDragging) {
      const deltaX = mouseX - dragStart.x;
      const rangeDelta = -(deltaX / chartWidth) * (visibleRange.end - visibleRange.start);
      
      let newStart = dragStart.rangeStart + rangeDelta;
      let newEnd = visibleRange.end + (newStart - visibleRange.start);
      
      if (newStart < 0) {
        newEnd += -newStart;
        newStart = 0;
      }
      if (newEnd > 1) {
        newStart -= (newEnd - 1);
        newEnd = 1;
      }
      
      setVisibleRange({ start: Math.max(0, newStart), end: Math.min(1, newEnd) });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const mouseX = e.clientX - rect.left;
    const padding = { left: 60, right: 80 };
    const chartWidth = dimensions.width - padding.left - padding.right;
    const mousePos = (mouseX - padding.left) / chartWidth;
    
    const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
    const currentRange = visibleRange.end - visibleRange.start;
    const newRange = Math.min(1, Math.max(0.05, currentRange * zoomFactor));
    
    const zoomPoint = visibleRange.start + currentRange * mousePos;
    let newStart = zoomPoint - newRange * mousePos;
    let newEnd = newStart + newRange;
    
    if (newStart < 0) {
      newStart = 0;
      newEnd = newRange;
    }
    if (newEnd > 1) {
      newEnd = 1;
      newStart = 1 - newRange;
    }
    
    setVisibleRange({ start: newStart, end: newEnd });
  };

  const handleMouseLeave = () => {
    setCrosshair(null);
  };

  return (
    <div className="sector-performance-chart" style={{ 
      width: '1000px',
      height: '650px',
      backgroundColor: '#000000',
      border: '1px solid #333',
      borderRadius: '4px',
      padding: '20px',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'flex-start', 
        alignItems: 'center',
        marginBottom: '15px',
        gap: '20px'
      }}>
        {/* Timeframe Dropdown */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <label style={{ 
            color: '#999999', 
            fontSize: '11px', 
            fontFamily: 'monospace',
            fontWeight: 'bold'
          }}>
            Timeframe:
          </label>
          <select
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value as Timeframe)}
            style={{
              padding: '6px 12px',
              backgroundColor: '#1a1a1a',
              color: '#ffffff',
              border: '1px solid #ff6600',
              borderRadius: '3px',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 'bold',
              fontFamily: 'monospace',
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

        {/* Category Filter Buttons */}
        <div style={{ display: 'flex', gap: '8px', borderLeft: '1px solid #333333', paddingLeft: '20px' }}>
          <button
            onClick={() => toggleCategory('growth')}
            style={{
              padding: '6px 12px',
              backgroundColor: activeCategories.growth ? '#00cc88' : '#1a1a1a',
              color: activeCategories.growth ? '#000000' : '#999999',
              border: activeCategories.growth ? '1px solid #00cc88' : '1px solid #333333',
              borderRadius: '3px',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: activeCategories.growth ? 'bold' : 'normal',
              fontFamily: 'monospace',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              if (!activeCategories.growth) {
                e.currentTarget.style.backgroundColor = '#2a2a2a';
                e.currentTarget.style.borderColor = '#555555';
              }
            }}
            onMouseLeave={(e) => {
              if (!activeCategories.growth) {
                e.currentTarget.style.backgroundColor = '#1a1a1a';
                e.currentTarget.style.borderColor = '#333333';
              }
            }}
          >
            Growth
          </button>
          <button
            onClick={() => toggleCategory('value')}
            style={{
              padding: '6px 12px',
              backgroundColor: activeCategories.value ? '#3366ff' : '#1a1a1a',
              color: activeCategories.value ? '#ffffff' : '#999999',
              border: activeCategories.value ? '1px solid #3366ff' : '1px solid #333333',
              borderRadius: '3px',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: activeCategories.value ? 'bold' : 'normal',
              fontFamily: 'monospace',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              if (!activeCategories.value) {
                e.currentTarget.style.backgroundColor = '#2a2a2a';
                e.currentTarget.style.borderColor = '#555555';
              }
            }}
            onMouseLeave={(e) => {
              if (!activeCategories.value) {
                e.currentTarget.style.backgroundColor = '#1a1a1a';
                e.currentTarget.style.borderColor = '#333333';
              }
            }}
          >
            Value
          </button>
          <button
            onClick={() => toggleCategory('specialty')}
            style={{
              padding: '6px 12px',
              backgroundColor: activeCategories.specialty ? '#cc00ff' : '#1a1a1a',
              color: activeCategories.specialty ? '#ffffff' : '#999999',
              border: activeCategories.specialty ? '1px solid #cc00ff' : '1px solid #333333',
              borderRadius: '3px',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: activeCategories.specialty ? 'bold' : 'normal',
              fontFamily: 'monospace',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              if (!activeCategories.specialty) {
                e.currentTarget.style.backgroundColor = '#2a2a2a';
                e.currentTarget.style.borderColor = '#555555';
              }
            }}
            onMouseLeave={(e) => {
              if (!activeCategories.specialty) {
                e.currentTarget.style.backgroundColor = '#1a1a1a';
                e.currentTarget.style.borderColor = '#333333';
              }
            }}
          >
            Specialty
          </button>
        </div>

        {/* Benchmarked Toggle */}
        <div style={{ borderLeft: '1px solid #333333', paddingLeft: '20px' }}>
          <button
            onClick={() => setIsBenchmarked(!isBenchmarked)}
            style={{
              padding: '6px 12px',
              backgroundColor: isBenchmarked ? '#ffaa00' : '#1a1a1a',
              color: isBenchmarked ? '#000000' : '#999999',
              border: isBenchmarked ? '1px solid #ffaa00' : '1px solid #333333',
              borderRadius: '3px',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: isBenchmarked ? 'bold' : 'normal',
              fontFamily: 'monospace',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              if (!isBenchmarked) {
                e.currentTarget.style.backgroundColor = '#2a2a2a';
                e.currentTarget.style.borderColor = '#555555';
              }
            }}
            onMouseLeave={(e) => {
              if (!isBenchmarked) {
                e.currentTarget.style.backgroundColor = '#1a1a1a';
                e.currentTarget.style.borderColor = '#333333';
              }
            }}
          >
            Benchmarked
          </button>
        </div>

        {/* Custom Date Range */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', borderLeft: '1px solid #333333', paddingLeft: '20px' }}>
          <label style={{ 
            color: '#999999', 
            fontSize: '11px', 
            fontFamily: 'monospace',
            fontWeight: 'bold'
          }}>
            Start:
          </label>
          <input
            type="date"
            value={customStartDate}
            onChange={(e) => setCustomStartDate(e.target.value)}
            style={{
              padding: '4px 8px',
              backgroundColor: '#1a1a1a',
              color: '#ffffff',
              border: '1px solid #333333',
              borderRadius: '3px',
              fontSize: '11px',
              fontFamily: 'monospace',
              outline: 'none'
            }}
          />
          <label style={{ 
            color: '#999999', 
            fontSize: '11px', 
            fontFamily: 'monospace',
            fontWeight: 'bold'
          }}>
            End:
          </label>
          <input
            type="date"
            value={customEndDate}
            onChange={(e) => setCustomEndDate(e.target.value)}
            style={{
              padding: '4px 8px',
              backgroundColor: '#1a1a1a',
              color: '#ffffff',
              border: '1px solid #333333',
              borderRadius: '3px',
              fontSize: '11px',
              fontFamily: 'monospace',
              outline: 'none'
            }}
          />
          {customStartDate && customEndDate && (
            <>
              <button
                onClick={() => setUseCustomDates(!useCustomDates)}
                style={{
                  padding: '6px 12px',
                  backgroundColor: useCustomDates ? '#00cc88' : '#1a1a1a',
                  color: useCustomDates ? '#000000' : '#999999',
                  border: useCustomDates ? '1px solid #00cc88' : '1px solid #333333',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: useCustomDates ? 'bold' : 'normal',
                  fontFamily: 'monospace',
                  transition: 'all 0.2s'
                }}
              >
                Apply
              </button>
              {useCustomDates && (
                <button
                  onClick={() => {
                    setUseCustomDates(false);
                    setCustomStartDate('');
                    setCustomEndDate('');
                  }}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: '#cc0000',
                    color: '#ffffff',
                    border: '1px solid #cc0000',
                    borderRadius: '3px',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    fontFamily: 'monospace'
                  }}
                >
                  Clear
                </button>
              )}
            </>
          )}
        </div>
      </div>
      
      {loading ? (
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          height: '550px',
          color: '#999999',
          fontSize: '14px',
          fontFamily: 'monospace'
        }}>
          Loading...
        </div>
      ) : (
        <div 
          ref={containerRef} 
          style={{ 
            width: '100%', 
            height: '550px',
            position: 'relative'
          }}
        >
          <canvas
            ref={canvasRef}
            style={{ 
              display: 'block',
              width: '100%', 
              height: '100%',
              cursor: isDragging ? 'grabbing' : 'crosshair'
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onWheel={handleWheel}
          />
        </div>
      )}
    </div>
  );
};

export default SpecialPerformanceChart;
