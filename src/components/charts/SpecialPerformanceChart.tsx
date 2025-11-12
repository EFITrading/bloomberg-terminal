'use client';

import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';

interface SpecialDataPoint {
  timestamp: number;
  value: number;
  isMarketHours?: boolean;
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
  
  // Refs for performance optimization - prevent re-renders
  const animationFrameRef = useRef<number | null>(null);
  const timeframeRef = useRef<Timeframe>('1W');
  const lastDrawParamsRef = useRef<string>('');
  const crosshairRef = useRef<{ x: number; y: number } | null>(null);
  
  const [timeframe, setTimeframe] = useState<Timeframe>('1W');
  const [performanceData, setPerformanceData] = useState<SpecialPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [hoveredSector, setHoveredSector] = useState<string | null>(null);
  
  // Professional zoom/pan state
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 1 }); // 0 to 1 as percentage
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, rangeStart: 0 });
  
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
  
  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(false);
  
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
  
  // Fullscreen handler - toggles expanded view
  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };
  
  // Filter performance data based on active categories
  const getFilteredData = () => {
    const allowedTickers: string[] = [];
    if (activeCategories.growth) allowedTickers.push(...GROWTH_TICKERS);
    if (activeCategories.value) allowedTickers.push(...VALUE_TICKERS);
    if (activeCategories.specialty) allowedTickers.push(...SPECIALTY_TICKERS);
    
    let filteredData = performanceData.filter(item => allowedTickers.includes(item.symbol));
    
    // Apply benchmarking if enabled
    if (isBenchmarked) {
      filteredData = calculateBenchmarkedData(filteredData);
    }
    
    return filteredData;
  };
  
  // Calculate benchmarked performance (ticker/SPY)
  const calculateBenchmarkedData = (data: SpecialPerformance[]): SpecialPerformance[] => {
    const spyData = performanceData.find(sector => sector.symbol === 'SPY');
    if (!spyData || spyData.data.length === 0) return data;
    
    return data.map(sector => {
      if (sector.symbol === 'SPY') {
        // SPY/SPY = 0% (flat line)
        return {
          ...sector,
          data: sector.data.map(point => ({ ...point, value: 0 })),
          currentPerformance: 0
        };
      }
      
      // Calculate ticker - SPY for each data point (simple subtraction)
      const benchmarkedData = sector.data.map((point, index) => {
        const spyPoint = spyData.data[index];
        if (!spyPoint) return point;
        
        // Simple subtraction: ticker% - SPY%
        const relativePerformance = point.value - spyPoint.value;
        
        return {
          ...point,
          value: relativePerformance
        };
      });
      
      const currentBenchmarkedPerf = benchmarkedData.length > 0 
        ? benchmarkedData[benchmarkedData.length - 1].value 
        : 0;
      
      return {
        ...sector,
        data: benchmarkedData,
        currentPerformance: currentBenchmarkedPerf
      };
    });
  };

  // Get date range based on timeframe
  const getDateRange = (tf: Timeframe): { from: string; to: string } => {
    const now = new Date();
    const to = now.toISOString().split('T')[0];
    
    // Use custom dates if start date is provided
    if (useCustomDates && customStartDate) {
      return { 
        from: customStartDate, 
        to: customEndDate || to // If no end date, use today
      };
    }
    
    let from = new Date();

    switch (tf) {
      case '1D':
        // For intraday view, start from today (not yesterday)
        from.setDate(now.getDate());
        from.setHours(0, 0, 0, 0);
        break;
      case '1W':
        // For 1W, show last 5 trading days
        from.setDate(now.getDate() - 7);
        break;
      case '1M':
        from.setMonth(now.getMonth() - 1);
        break;
      case '3M':
        from.setMonth(now.getMonth() - 3);
        break;
      case '6M':
        from.setMonth(now.getMonth() - 6);
        break;
      case '1Y':
        from.setFullYear(now.getFullYear() - 1);
        break;
      case '2Y':
        from.setFullYear(now.getFullYear() - 2);
        break;
      case '5Y':
        from.setFullYear(now.getFullYear() - 5);
        break;
      case '10Y':
        from.setFullYear(now.getFullYear() - 10);
        break;
      case '20Y':
        from.setFullYear(now.getFullYear() - 20);
        break;
      case 'YTD':
        from.setMonth(0, 1); // January 1st of current year
        break;
    }

    return {
      from: from.toISOString().split('T')[0],
      to
    };
  };

  // Fetch data from Polygon API
  const fetchSpecialData = async () => {
    setLoading(true);
    console.log('🔵 SpecialPerformanceChart: Starting data fetch...');
    try {
      const { from, to } = getDateRange(timeframe);
      console.log('🔵 Date range:', from, 'to', to);
      
      const multiplier = (timeframe === '1D' || timeframe === '1W') ? 5 : 1;
      const timespan = (timeframe === '1D' || timeframe === '1W') ? 'minute' : 'day';
      
      // Helper function to check if time is during market hours (9:30 AM - 4:00 PM ET)
      const isMarketHours = (timestamp: number): boolean => {
        const date = new Date(timestamp);
        const dateET = new Date(date.toLocaleString('en-US', { timeZone: 'America/New_York' }));
        const hoursET = dateET.getHours();
        const minutesET = dateET.getMinutes();
        const totalMinutesET = hoursET * 60 + minutesET;
        
        // 9:30 AM = 570 minutes, 4:00 PM = 960 minutes
        return totalMinutesET >= 570 && totalMinutesET <= 960;
      };

      // Optimized fetch with aggressive retry and request reuse
      const fetchWithRetry = async (etf: typeof SPECIAL_ETFS[0], retries = 5): Promise<SpecialPerformance | null> => {
        const url = `https://api.polygon.io/v2/aggs/ticker/${etf.symbol}/range/${multiplier}/${timespan}/${from}/${to}?adjusted=true&sort=asc&apiKey=${POLYGON_API_KEY}`;
        
        for (let attempt = 0; attempt < retries; attempt++) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            
            const response = await fetch(url, { 
              signal: controller.signal,
              headers: {
                'Connection': 'keep-alive'
              }
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
              if (response.status === 429) {
                await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)));
                continue;
              }
              if (attempt < retries - 1) {
                await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
                continue;
              }
              console.warn(`Failed to fetch ${etf.symbol}`);
              return null;
            }
            
            const data = await response.json();
            
            if (!data.results || data.results.length === 0) {
              return null;
            }
            
            let results = data.results;
            
            if (timeframe === '1D') {
              results = results.filter((point: any) => isMarketHours(point.t));
            }
            
            if (results.length === 0) return null;
            
            const firstClose = results[0].c;
            const performancePoints: SpecialDataPoint[] = results.map((bar: any) => ({
              timestamp: bar.t,
              value: ((bar.c - firstClose) / firstClose) * 100,
              isMarketHours: timeframe === '1W' ? isMarketHours(bar.t) : true
            }));
            
            const currentPerformance = performancePoints[performancePoints.length - 1]?.value || 0;
            
            return {
              symbol: etf.symbol,
              name: etf.name,
              color: etf.color,
              data: performancePoints,
              currentPerformance
            };
          } catch (error: any) {
            if (error.name === 'AbortError') {
              console.warn(`Timeout fetching ${etf.symbol}, attempt ${attempt + 1}/${retries}`);
            }
            if (attempt < retries - 1) {
              await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
              continue;
            }
            console.error(`Failed to fetch ${etf.symbol} after ${retries} attempts:`, error);
            return null;
          }
        }
        return null;
      };

      // Parallel processing with chunking - process 6 at a time with minimal delay
      const chunkSize = 6;
      const results: (SpecialPerformance | null)[] = [];
      
      for (let i = 0; i < SPECIAL_ETFS.length; i += chunkSize) {
        const chunk = SPECIAL_ETFS.slice(i, i + chunkSize);
        const chunkPromises = chunk.map(etf => fetchWithRetry(etf));
        const chunkResults = await Promise.all(chunkPromises);
        results.push(...chunkResults);
        
        if (i + chunkSize < SPECIAL_ETFS.length) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }
      
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
                value: point.value - (spyData.data[idx]?.value || 0),
                isMarketHours: point.isMarketHours
              }));
              result.currentPerformance = result.data[result.data.length - 1]?.value || 0;
            } else {
              // SPY becomes flat line at 0 in benchmarked mode
              result.data = result.data.map(point => ({
                timestamp: point.timestamp,
                value: 0,
                isMarketHours: point.isMarketHours
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

  // Auto-refresh every 5 minutes
  useEffect(() => {
    fetchSpecialData();
    const interval = setInterval(fetchSpecialData, 300000);
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
  
  // Update dimensions when fullscreen changes
  useLayoutEffect(() => {
    if (containerRef.current) {
      // Wait for CSS transition to complete (300ms) then measure
      setTimeout(() => {
        if (containerRef.current) {
          const { width, height } = containerRef.current.getBoundingClientRect();
          console.log('🔵 Fullscreen dimensions update:', { width, height, isFullscreen });
          setDimensions({ width, height });
        }
      }, 350); // Wait for 300ms transition + 50ms buffer
    }
  }, [isFullscreen]);

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

    // Chart margins - dynamic bottom margin based on fullscreen state
    const margin = { 
      top: 40, 
      right: 100, 
      bottom: isFullscreen ? 30 : 80, 
      left: 60 
    };
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

    // Draw gray shading for pre-market and after-hours in 1W view
    if (timeframe === '1W' && performanceData[0]?.data) {
      ctx.fillStyle = 'rgba(100, 100, 100, 0.15)';
      
      performanceData[0].data.forEach((point, index) => {
        if (index < startIdx || index >= endIdx) return;
        
        // If this data point is NOT during market hours, draw a gray bar
        if (!point.isMarketHours) {
          const x = getX(index);
          const nextX = index < performanceData[0].data.length - 1 
            ? getX(index + 1) 
            : x + 2;
          const barWidth = nextX - x;
          
          ctx.fillRect(x, margin.top, barWidth, chartHeight);
        }
      });
    }

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
    const crosshair = crosshairRef.current;
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

    // X-axis time labels - adaptive based on zoom and timeframe (Koyfin-style)
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';

    const zoom = 1 / (visibleRange.end - visibleRange.start);
    const xLabelCount = Math.min(12, Math.max(6, Math.floor(6 * zoom)));
    const visibleDataPoints = endIdx - startIdx;
    let lastDateShown = '';
    
    for (let i = 0; i <= xLabelCount; i++) {
      const dataIndex = startIdx + Math.floor(visibleDataPoints * i / xLabelCount);
      if (filteredData[0]?.data[dataIndex]) {
        const x = getX(dataIndex);
        if (x >= margin.left && x <= margin.left + chartWidth) {
          const date = new Date(filteredData[0].data[dataIndex].timestamp);
          const dateET = new Date(date.toLocaleString('en-US', { timeZone: 'America/New_York' }));
          
          let label: string;
          
          if (timeframe === '1D') {
            // 1D: Show only time (9:30, 10:00, 14:30)
            const hours = dateET.getHours();
            const minutes = dateET.getMinutes();
            label = `${hours}:${minutes.toString().padStart(2, '0')}`;
            
          } else if (timeframe === '1W') {
            // 1W: Calculate visible time span to determine label format
            const visibleTimeSpan = filteredData[0].data[endIdx - 1]?.timestamp - filteredData[0].data[startIdx]?.timestamp;
            const daysVisible = visibleTimeSpan / (1000 * 60 * 60 * 24);
            
            if (daysVisible <= 3) {
              // 3 days or less: show time only (intraday view)
              const hours = dateET.getHours();
              const minutes = dateET.getMinutes();
              label = `${hours}:${minutes.toString().padStart(2, '0')}`;
            } else {
              // More than 3 days: show date once per day, then times
              const month = dateET.getMonth() + 1;
              const day = dateET.getDate();
              const currentDate = `${month}/${day}`;
              
              if (currentDate !== lastDateShown) {
                // First time seeing this date - show it
                label = currentDate;
                lastDateShown = currentDate;
              } else {
                // Same day - just show time
                const hours = dateET.getHours();
                const minutes = dateET.getMinutes();
                label = `${hours}:${minutes.toString().padStart(2, '0')}`;
              }
            }
            
          } else {
            // 1M, 3M, 6M, 1Y+: Show only dates (Mon DD format)
            label = dateET.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          }
          
          ctx.fillText(label, x, dimensions.height - margin.bottom + 30);
        }
      }
    }

    // Draw legend - matching SectorPerformanceChart style with hover backgrounds
    const legendX = margin.left + chartWidth + 30;
    let legendY = margin.top + 20;
    
    // Sort by performance
    const sortedData = [...filteredData].sort((a, b) => b.currentPerformance - a.currentPerformance);
    
    // Dynamic spacing and font size based on fullscreen mode
    const itemSpacing = isFullscreen ? 32 : 28;
    const fontSize = isFullscreen ? 12 : 10;
    const hoveredFontSize = isFullscreen ? 13 : 11;
    
    sortedData.forEach((etf, index) => {
      const y = legendY + (index * itemSpacing);
      const isHovered = hoveredSector === etf.symbol;

      // Background for hovered item
      if (isHovered) {
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(legendX - 5, y - 14, 190, 26);
      }

      // Ticker - use etf color
      ctx.fillStyle = etf.color;
      ctx.font = isHovered ? `bold ${hoveredFontSize}px monospace` : `${fontSize}px monospace`;
      ctx.textAlign = 'left';
      ctx.fillText(etf.symbol, legendX, y);

      // Percentage next to ticker
      const perfColor = etf.currentPerformance >= 0 ? '#00ff00' : '#ff0000';
      ctx.fillStyle = perfColor;
      const perfText = ` ${etf.currentPerformance >= 0 ? '+' : ''}${etf.currentPerformance.toFixed(2)}%`;
      ctx.fillText(perfText, legendX + 20, y);
    });

  }, [performanceData, dimensions, visibleRange, hoveredSector, activeCategories, timeframe]);

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
    const itemSpacing = isFullscreen ? 32 : 28;
    
    const filteredData = getFilteredData();
    const sortedData = [...filteredData].sort((a, b) => b.currentPerformance - a.currentPerformance);
    
    let found = false;
    sortedData.forEach((etf, index) => {
      const y = legendY + (index * itemSpacing);
      if (mouseX >= legendX - 5 && mouseX <= legendX + 185 && 
          mouseY >= y - 14 && mouseY <= y + 12) {
        if (hoveredSector !== etf.symbol) {
          setHoveredSector(etf.symbol);
        }
        found = true;
      }
    });
    
    if (!found && !isDragging && hoveredSector !== null) {
      setHoveredSector(null);
    }
    
    // Update crosshair
    if (mouseX >= margin.left && mouseX <= dimensions.width - margin.right &&
        mouseY >= margin.top && mouseY <= dimensions.height - margin.bottom) {
      crosshairRef.current = { x: mouseX, y: mouseY };
    } else {
      crosshairRef.current = null;
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
    crosshairRef.current = null;
    if (hoveredSector !== null) {
      setHoveredSector(null);
    }
    if (isDragging) {
      setIsDragging(false);
    }
  };

  return (
    <div className="sector-performance-chart" style={{ 
      width: '1000px',
      height: isFullscreen ? '870px' : '650px',
      backgroundColor: '#000000',
      border: '1px solid #333',
      borderRadius: '4px',
      padding: '20px',
      position: 'relative',
      overflow: 'hidden',
      transition: 'height 0.3s ease'
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
            onChange={(e) => {
              const newTimeframe = e.target.value as Timeframe;
              setTimeframe(newTimeframe);
              timeframeRef.current = newTimeframe;
            }}
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
              backgroundColor: isBenchmarked ? '#9d4edd' : '#1a1a1a',
              color: isBenchmarked ? '#ffffff' : '#999999',
              border: isBenchmarked ? '1px solid #9d4edd' : '1px solid #333333',
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
            onChange={(e) => {
              setCustomStartDate(e.target.value);
              if (e.target.value) {
                setUseCustomDates(true);
              }
            }}
            style={{
              padding: '4px 8px',
              backgroundColor: '#1a1a1a',
              color: '#ffffff',
              border: '1px solid #333333',
              borderRadius: '3px',
              fontSize: '11px',
              fontFamily: 'monospace',
              cursor: 'pointer'
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
            onChange={(e) => {
              setCustomEndDate(e.target.value);
              if (customStartDate) {
                setUseCustomDates(true);
              }
            }}
            style={{
              padding: '4px 8px',
              backgroundColor: '#1a1a1a',
              color: '#ffffff',
              border: '1px solid #333333',
              borderRadius: '3px',
              fontSize: '11px',
              fontFamily: 'monospace',
              cursor: 'pointer'
            }}
          />
          
          {useCustomDates && (
            <button
              onClick={() => {
                setUseCustomDates(false);
                setCustomStartDate('');
                setCustomEndDate('');
              }}
              style={{
                padding: '4px 8px',
                backgroundColor: '#ff3333',
                color: '#ffffff',
                border: '1px solid #ff3333',
                borderRadius: '3px',
                cursor: 'pointer',
                fontSize: '11px',
                fontFamily: 'monospace',
                fontWeight: 'bold'
              }}
            >
              Clear
            </button>
          )}
          
          {/* Top/Bottom Button */}
          <button
            style={{
              padding: '4px 12px',
              background: 'linear-gradient(145deg, #1a1a1a, #0d0d0d)',
              color: '#ff8800',
              border: '1px solid #333333',
              borderRadius: '3px',
              cursor: 'pointer',
              fontSize: '11px',
              fontFamily: 'monospace',
              fontWeight: 'bold',
              boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 2px 4px rgba(0, 0, 0, 0.5)',
              marginLeft: '12px'
            }}
          >
            Top/Bottom
          </button>
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
            height: isFullscreen ? '770px' : '550px',
            position: 'relative',
            backgroundColor: '#000000',
            transition: 'height 0.3s ease'
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
          
          {/* Fullscreen Button */}
          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            style={{
              position: 'absolute',
              bottom: '10px',
              right: '10px',
              width: '28px',
              height: '28px',
              backgroundColor: 'rgba(26, 26, 26, 0.8)',
              border: '1px solid #444444',
              borderRadius: '4px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#999999',
              fontSize: '14px',
              transition: 'all 0.2s',
              zIndex: 10
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 136, 0, 0.2)';
              e.currentTarget.style.borderColor = '#ff8800';
              e.currentTarget.style.color = '#ff8800';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(26, 26, 26, 0.8)';
              e.currentTarget.style.borderColor = '#444444';
              e.currentTarget.style.color = '#999999';
            }}
          >
            {isFullscreen ? '⊡' : '⛶'}
          </button>
        </div>
      )}
    </div>
  );
};

export default SpecialPerformanceChart;
