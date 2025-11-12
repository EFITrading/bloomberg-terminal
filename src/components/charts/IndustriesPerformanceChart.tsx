'use client';

import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';

interface IndustryDataPoint {
  timestamp: number;
  value: number;
  isMarketHours?: boolean; // Track if this point is during market hours
}

interface IndustryPerformance {
  symbol: string;
  name: string;
  color: string;
  data: IndustryDataPoint[];
  currentPerformance: number;
}

type Timeframe = '1D' | '1W' | '1M' | '3M' | '6M' | '1Y' | '2Y' | '5Y' | '10Y' | '20Y' | 'YTD';

const INDUSTRIES_AND_ETFS = [
  { symbol: 'IGV', name: 'Software', color: '#00d4ff' },
  { symbol: 'SMH', name: 'Semiconductors', color: '#ff6b35' },
  { symbol: 'XRT', name: 'Retail', color: '#4ecdc4' },
  { symbol: 'KIE', name: 'Insurance', color: '#ffd93d' },
  { symbol: 'KRE', name: 'Regional Banks', color: '#ff006e' },
  { symbol: 'GDX', name: 'Gold Miners', color: '#8338ec' },
  { symbol: 'ITA', name: 'Aerospace', color: '#06ffa5' },
  { symbol: 'TAN', name: 'Solar', color: '#fb5607' },
  { symbol: 'XBI', name: 'Biotech', color: '#ffbe0b' },
  { symbol: 'ITB', name: 'Homebuilders', color: '#3a86ff' },
  { symbol: 'XHB', name: 'Housing', color: '#ff006e' },
  { symbol: 'XOP', name: 'Oil & Gas', color: '#06ffa5' },
  { symbol: 'OIH', name: 'Oil Services', color: '#ffd93d' },
  { symbol: 'XME', name: 'Metals & Mining', color: '#ffbe0b' },
  { symbol: 'ARKK', name: 'Innovation', color: '#ff0000' },
  { symbol: 'IPO', name: 'IPOs', color: '#00ff00' },
  { symbol: 'VNQ', name: 'Real Estate', color: '#3a86ff' },
  { symbol: 'JETS', name: 'Airlines', color: '#4ecdc4' },
  { symbol: 'KWEB', name: 'China Internet', color: '#8338ec' },
  { symbol: 'DIA', name: 'Dow Jones', color: '#ffffff' },
  { symbol: 'SPY', name: 'S&P 500', color: '#00ff00' },
  { symbol: 'QQQ', name: 'Nasdaq', color: '#ff0000' },
  { symbol: 'IWM', name: 'Russell 2000', color: '#ffa500' }
];

const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

const IndustriesPerformanceChart: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const timeframeRef = useRef<Timeframe>('1W'); // Use ref to persist timeframe
  const lastDrawParamsRef = useRef<any>(null); // Store last draw parameters
  const [timeframe, setTimeframe] = useState<Timeframe>('1W'); // Default to 1W
  const [performanceData, setPerformanceData] = useState<IndustryPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [hoveredSector, setHoveredSector] = useState<string | null>(null);
  
  // Professional zoom/pan state
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 1 }); // 0 to 1 as percentage
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, rangeStart: 0 });
  
  // Crosshair state - use ref to avoid re-renders
  const crosshairRef = useRef<{ x: number; y: number } | null>(null);
  
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
    defensives: true
  });
  
  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Category definitions for Industries
  const GROWTH_TICKERS = ['IGV', 'SMH', 'IPO', 'ARKK', 'TAN', 'KRE', 'XRT'];
  const VALUE_TICKERS = ['JETS', 'XHB', 'ITB', 'KIE', 'ITA'];
  const DEFENSIVE_TICKERS = ['VNQ', 'KWEB', 'XME', 'XOP', 'OIH', 'GDX'];
  
  // Toggle category filter
  const toggleCategory = (category: 'growth' | 'value' | 'defensives') => {
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
    if (activeCategories.defensives) allowedTickers.push(...DEFENSIVE_TICKERS);
    
    let filteredData = performanceData.filter(sector => allowedTickers.includes(sector.symbol));
    
    // Apply benchmarking if enabled
    if (isBenchmarked) {
      filteredData = calculateBenchmarkedData(filteredData);
    }
    
    return filteredData;
  };
  
  // Calculate benchmarked performance (ticker/SPY)
  const calculateBenchmarkedData = (data: IndustryPerformance[]): IndustryPerformance[] => {
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

  // Calculate date range based on timeframe
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
        from = new Date(now.getFullYear(), 0, 1);
        break;
    }

    return { from: from.toISOString().split('T')[0], to };
  };

  // Fetch data from Polygon API
  const fetchSectorData = async () => {
    setLoading(true);
    const { from, to } = getDateRange(timeframe);
    const multiplier = (timeframe === '1D' || timeframe === '1W') ? 5 : 1;
    const timespan = (timeframe === '1D' || timeframe === '1W') ? 'minute' : 'day';

    try {
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
      const fetchWithRetry = async (sector: typeof INDUSTRIES_AND_ETFS[0], retries = 5): Promise<IndustryPerformance | null> => {
        const url = `https://api.polygon.io/v2/aggs/ticker/${sector.symbol}/range/${multiplier}/${timespan}/${from}/${to}?adjusted=true&sort=asc&apiKey=${POLYGON_API_KEY}`;
        
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
              return null;
            }
            
            const data = await response.json();

            if (data.results && data.results.length > 0) {
              let results = data.results;
              
              if (timeframe === '1D') {
                results = results.filter((point: any) => isMarketHours(point.t));
              }
              
              if (results.length === 0) return null;
              
              const firstPrice = results[0].c;
              const normalizedData: IndustryDataPoint[] = results.map((point: any) => ({
                timestamp: point.t,
                value: ((point.c - firstPrice) / firstPrice) * 100,
                isMarketHours: timeframe === '1W' ? isMarketHours(point.t) : true
              }));

              const currentPerformance = normalizedData[normalizedData.length - 1]?.value || 0;

              return {
                symbol: sector.symbol,
                name: sector.name,
                color: sector.color,
                data: normalizedData,
                currentPerformance
              };
            }
            return null;
          } catch (error: any) {
            if (error.name === 'AbortError') {
              console.warn(`Timeout fetching ${sector.symbol}, attempt ${attempt + 1}/${retries}`);
            }
            if (attempt < retries - 1) {
              await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
              continue;
            }
            console.error(`Failed to fetch ${sector.symbol} after ${retries} attempts:`, error);
            return null;
          }
        }
        return null;
      };

      // Parallel processing with chunking - process 6 at a time with minimal delay
      const chunkSize = 6;
      const results: (IndustryPerformance | null)[] = [];
      
      for (let i = 0; i < INDUSTRIES_AND_ETFS.length; i += chunkSize) {
        const chunk = INDUSTRIES_AND_ETFS.slice(i, i + chunkSize);
        const chunkPromises = chunk.map(sector => fetchWithRetry(sector));
        const chunkResults = await Promise.all(chunkPromises);
        results.push(...chunkResults);
        
        if (i + chunkSize < INDUSTRIES_AND_ETFS.length) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }

      const validResults = results.filter((r): r is IndustryPerformance => r !== null);
      setPerformanceData(validResults);
    } catch (error) {
      console.error('Error fetching industry data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Update dimensions
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        setDimensions({ width, height });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);
  
  // Update dimensions when fullscreen changes
  useLayoutEffect(() => {
    if (containerRef.current) {
      // Wait for CSS transition to complete (300ms) then measure
      setTimeout(() => {
        if (containerRef.current) {
          const { width, height } = containerRef.current.getBoundingClientRect();
          console.log('Fullscreen dimensions update:', { width, height, isFullscreen });
          setDimensions({ width, height });
        }
      }, 350); // Wait for 300ms transition + 50ms buffer
    }
  }, [isFullscreen]);

  // Fetch data when timeframe changes
  useEffect(() => {
    fetchSectorData();
    
    // Set up 5-minute auto-refresh interval
    const refreshInterval = setInterval(() => {
      fetchSectorData();
    }, 300000); // 300000ms = 5 minutes
    
    return () => clearInterval(refreshInterval);
  }, [timeframe, useCustomDates, customStartDate, customEndDate]);

  // Draw chart
  useEffect(() => {
    if (!canvasRef.current || performanceData.length === 0 || dimensions.width === 0) return;

    const drawChart = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Get device pixel ratio for sharp rendering
      const dpr = window.devicePixelRatio || 1;

      // Set canvas size with device pixel ratio for crisp rendering
      canvas.width = dimensions.width * dpr;
      canvas.height = dimensions.height * dpr;
      
      // Scale context to match device pixel ratio
      ctx.scale(dpr, dpr);
      
      // Set canvas display size
      canvas.style.width = dimensions.width + 'px';
      canvas.style.height = dimensions.height + 'px';

      // Clear canvas
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, dimensions.width, dimensions.height);

      // Chart margins - dynamic bottom margin based on fullscreen state
      const margin = { 
        top: 40, 
        right: 100, 
        bottom: isFullscreen ? 30 : 80, 
        left: 60 
      };
      const chartWidth = dimensions.width - margin.left - margin.right;
      const chartHeight = dimensions.height - margin.top - margin.bottom;

      // Get filtered data based on active categories
      const filteredData = getFilteredData();

      // Calculate visible data range
      const totalDataPoints = performanceData[0]?.data.length || 1;
      const startIndex = Math.floor(visibleRange.start * totalDataPoints);
      const endIndex = Math.ceil(visibleRange.end * totalDataPoints);
      const visibleDataPoints = endIndex - startIndex;

      // Find min/max values from visible range only (use filtered data)
      const visibleValues = filteredData.flatMap(sector => 
        sector.data.slice(startIndex, endIndex).map(d => d.value)
      );
      const minValue = visibleValues.length > 0 ? Math.min(...visibleValues) : 0;
      const maxValue = visibleValues.length > 0 ? Math.max(...visibleValues) : 0;
      const valueRange = maxValue - minValue || 1;
      const padding = valueRange * 0.1;

      // Scale functions - map data index to screen position
      const xScale = (index: number, total: number) => {
        const relativeIndex = (index - startIndex) / visibleDataPoints;
        return margin.left + relativeIndex * chartWidth;
      };
      
      const yScale = (value: number) => 
        margin.top + chartHeight - ((value - (minValue - padding)) / (valueRange + 2 * padding)) * chartHeight;

      // Draw grid lines - REMOVED dashed lines
      // ctx.strokeStyle = '#1a1a1a';
      // ctx.lineWidth = 1;
      // ctx.setLineDash([5, 5]);
      
      // Adaptive grid lines based on zoom level
      const zoom = 1 / (visibleRange.end - visibleRange.start);
      const gridLines = Math.min(10, Math.max(5, Math.floor(5 * Math.sqrt(zoom))));
      
      // Only draw Y-axis labels, no grid lines
      for (let i = 0; i <= gridLines; i++) {
        const y = margin.top + (chartHeight * i / gridLines);
        // Removed grid line drawing

        // Y-axis labels
        const value = maxValue + padding - ((valueRange + 2 * padding) * i / gridLines);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 13px monospace';
        ctx.textAlign = 'right';
        const decimals = zoom > 2 ? 2 : 1;
        ctx.fillText(`${value.toFixed(decimals)}%`, margin.left - 15, y + 5);
      }
      
      // ctx.setLineDash([]);

      // Draw zero line
      if (minValue < 0 && maxValue > 0) {
        const zeroY = yScale(0);
        ctx.strokeStyle = '#444444';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(margin.left, zeroY);
        ctx.lineTo(margin.left + chartWidth, zeroY);
        ctx.stroke();
      }

      // Clip to chart area to prevent overflow
      ctx.save();
      ctx.beginPath();
      ctx.rect(margin.left, margin.top, chartWidth, chartHeight);
      ctx.clip();

      // Draw gray shading for pre-market and after-hours in 1W view
      if (timeframe === '1W' && performanceData[0]?.data) {
        ctx.fillStyle = 'rgba(100, 100, 100, 0.15)';
        
        performanceData[0].data.forEach((point, index) => {
          if (index < startIndex || index >= endIndex) return;
          
          // If this data point is NOT during market hours, draw a gray bar
          if (!point.isMarketHours) {
            const x = xScale(index, performanceData[0].data.length);
            const nextX = index < performanceData[0].data.length - 1 
              ? xScale(index + 1, performanceData[0].data.length) 
              : x + 2;
            const barWidth = nextX - x;
            
            ctx.fillRect(x, margin.top, barWidth, chartHeight);
          }
        });
      }

      // Draw sector lines with antialiasing
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      
      filteredData.forEach((sector) => {
        const isHovered = hoveredSector === sector.symbol;
        ctx.strokeStyle = sector.color;
        ctx.lineWidth = isHovered ? 1.5 : 1;
        ctx.globalAlpha = isHovered || !hoveredSector ? 1 : 0.3;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        ctx.beginPath();
        sector.data.forEach((point, index) => {
          const x = xScale(index, sector.data.length);
          const y = yScale(point.value);

          if (index === 0) {
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

      // Draw legend on the right - only show ticker symbols without percentages
      const legendX = margin.left + chartWidth + 30;
      let legendY = margin.top + 20;

      // Sort by performance (use filtered data)
      const sortedData = [...filteredData].sort((a, b) => b.currentPerformance - a.currentPerformance);

      // Dynamic spacing and font size based on fullscreen mode
      const itemSpacing = isFullscreen ? 32 : 28;
      const fontSize = isFullscreen ? 12 : 10;
      const hoveredFontSize = isFullscreen ? 13 : 11;

      sortedData.forEach((sector, index) => {
        const y = legendY + (index * itemSpacing);
        const isHovered = hoveredSector === sector.symbol;

        // Background for hovered item
        if (isHovered) {
          ctx.fillStyle = '#1a1a1a';
          ctx.fillRect(legendX - 5, y - 14, 190, 26);
        }

        // Ticker - use sector color
        ctx.fillStyle = sector.color;
        ctx.font = isHovered ? `bold ${hoveredFontSize}px monospace` : `${fontSize}px monospace`;
        ctx.textAlign = 'left';
        ctx.fillText(sector.symbol, legendX, y);

        // Percentage next to ticker
        const perfColor = sector.currentPerformance >= 0 ? '#00ff00' : '#ff0000';
        ctx.fillStyle = perfColor;
        const perfText = ` ${sector.currentPerformance >= 0 ? '+' : ''}${sector.currentPerformance.toFixed(2)}%`;
        ctx.fillText(perfText, legendX + 20, y);
      });

      // X-axis time labels - adaptive based on zoom and timeframe (Koyfin-style)
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';

      const xLabelCount = Math.min(12, Math.max(6, Math.floor(6 * zoom)));
      let lastDateShown = '';
      
      for (let i = 0; i <= xLabelCount; i++) {
        const dataIndex = startIndex + Math.floor(visibleDataPoints * i / xLabelCount);
        if (performanceData[0]?.data[dataIndex]) {
          const x = xScale(dataIndex, totalDataPoints);
          if (x >= margin.left && x <= margin.left + chartWidth) {
            const date = new Date(performanceData[0].data[dataIndex].timestamp);
            const dateET = new Date(date.toLocaleString('en-US', { timeZone: 'America/New_York' }));
            
            let label: string;
            
            if (timeframe === '1D') {
              // 1D: Show only time (9:30, 10:00, 14:30)
              const hours = dateET.getHours();
              const minutes = dateET.getMinutes();
              label = `${hours}:${minutes.toString().padStart(2, '0')}`;
              
            } else if (timeframe === '1W') {
              // 1W: Calculate visible time span to determine label format
              const visibleTimeSpan = performanceData[0].data[endIndex - 1]?.timestamp - performanceData[0].data[startIndex]?.timestamp;
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

      // Draw crosshair if mouse is hovering
      const crosshair = crosshairRef.current;
      if (crosshair && crosshair.x >= margin.left && crosshair.x <= margin.left + chartWidth &&
          crosshair.y >= margin.top && crosshair.y <= margin.top + chartHeight) {
        
        // Crosshair lines
        ctx.strokeStyle = '#888888';
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
        
        // Calculate and display Y-axis value
        const yValue = maxValue + padding - ((crosshair.y - margin.top) / chartHeight) * (valueRange + 2 * padding);
        
        // Y-axis label background
        ctx.fillStyle = '#ff6600';
        const yLabelText = `${yValue.toFixed(2)}%`;
        ctx.font = 'bold 12px monospace';
        const yLabelWidth = ctx.measureText(yLabelText).width;
        ctx.fillRect(margin.left - yLabelWidth - 20, crosshair.y - 10, yLabelWidth + 10, 20);
        
        // Y-axis label text
        ctx.fillStyle = '#000000';
        ctx.textAlign = 'right';
        ctx.fillText(yLabelText, margin.left - 15, crosshair.y + 5);
        
        // Calculate and display X-axis date
        const xPercent = (crosshair.x - margin.left) / chartWidth;
        const dataIndex = Math.floor(startIndex + xPercent * visibleDataPoints);
        
        if (performanceData[0]?.data[dataIndex]) {
          const date = new Date(performanceData[0].data[dataIndex].timestamp);
          const dateLabel = timeframe === '1D'
            ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
            : date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
          
          // X-axis label background
          ctx.fillStyle = '#ff6600';
          ctx.textAlign = 'center';
          const xLabelWidth = ctx.measureText(dateLabel).width;
          ctx.fillRect(crosshair.x - xLabelWidth / 2 - 5, dimensions.height - margin.bottom + 15, xLabelWidth + 10, 20);
          
          // X-axis label text
          ctx.fillStyle = '#000000';
          ctx.fillText(dateLabel, crosshair.x, dimensions.height - margin.bottom + 30);
        }
      }
    };
    
    drawChart();
  }, [performanceData, dimensions, hoveredSector, visibleRange, activeCategories, isBenchmarked]);

  // Handle mouse move for hover and drag
  const handleMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    
    const margin = { top: 40, right: 100, bottom: 80, left: 60 };
    const chartWidth = dimensions.width - margin.left - margin.right;
    const chartHeight = dimensions.height - margin.top - margin.bottom;

    // Update crosshair position if mouse is within chart area
    if (mouseX >= margin.left && mouseX <= margin.left + chartWidth &&
        mouseY >= margin.top && mouseY <= margin.top + chartHeight) {
      crosshairRef.current = { x: mouseX, y: mouseY };
    } else {
      crosshairRef.current = null;
    }

    // Handle dragging for pan
    if (isDragging) {
      const deltaX = mouseX - dragStart.x;
      const rangeSize = visibleRange.end - visibleRange.start;
      const rangeDelta = -(deltaX / chartWidth) * rangeSize;
      
      let newStart = dragStart.rangeStart + rangeDelta;
      let newEnd = newStart + rangeSize;
      
      // Constrain to data bounds
      if (newStart < 0) {
        newStart = 0;
        newEnd = rangeSize;
      }
      if (newEnd > 1) {
        newEnd = 1;
        newStart = 1 - rangeSize;
      }
      
      setVisibleRange({ start: newStart, end: newEnd });
      return;
    }

    const legendX = dimensions.width - margin.right + 30;
    const legendY = margin.top + 20;
    const itemSpacing = isFullscreen ? 32 : 28;

    let found = false;
    const sortedData = [...performanceData].sort((a, b) => b.currentPerformance - a.currentPerformance);
    
    sortedData.forEach((sector, index) => {
      const y = legendY + (index * itemSpacing);
      if (mouseX >= legendX - 5 && mouseX <= legendX + 185 && 
          mouseY >= y - 14 && mouseY <= y + 12) {
        if (hoveredSector !== sector.symbol) {
          setHoveredSector(sector.symbol);
        }
        found = true;
      }
    });

    if (!found && hoveredSector !== null) {
      setHoveredSector(null);
    }
  };

  // Handle mouse down to start dragging
  const handleMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    setIsDragging(true);
    setDragStart({
      x: event.clientX - rect.left,
      rangeStart: visibleRange.start
    });
  };

  // Handle mouse up to stop dragging
  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Handle wheel for zoom - Koyfin style
  const handleWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const margin = { top: 40, right: 100, bottom: 80, left: 60 };
    const chartWidth = dimensions.width - margin.left - margin.right;
    const mouseX = event.clientX - rect.left;
    
    // Only zoom if mouse is over chart area
    if (mouseX < margin.left || mouseX > margin.left + chartWidth) return;
    
    // Calculate mouse position relative to data (0 to 1)
    const mouseDataPos = visibleRange.start + ((mouseX - margin.left) / chartWidth) * (visibleRange.end - visibleRange.start);
    
    // Zoom factor
    const zoomFactor = event.deltaY > 0 ? 1.1 : 0.9;
    let newRangeSize = (visibleRange.end - visibleRange.start) * zoomFactor;
    
    // Constrain minimum and maximum zoom
    newRangeSize = Math.max(0.02, Math.min(1, newRangeSize)); // 2% to 100%
    
    // Calculate new start/end keeping mouse position fixed
    const mousePercent = (mouseX - margin.left) / chartWidth;
    let newStart = mouseDataPos - newRangeSize * mousePercent;
    let newEnd = newStart + newRangeSize;
    
    // Constrain to bounds
    if (newStart < 0) {
      newStart = 0;
      newEnd = newRangeSize;
    }
    if (newEnd > 1) {
      newEnd = 1;
      newStart = 1 - newRangeSize;
    }
    
    setVisibleRange({ start: newStart, end: newEnd });
  };

  return (
    <div className="sector-performance-chart" style={{ 
      width: '1000px',
      height: isFullscreen ? '870px' : '600px',
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
            onClick={() => toggleCategory('defensives')}
            style={{
              padding: '6px 12px',
              backgroundColor: activeCategories.defensives ? '#ffaa00' : '#1a1a1a',
              color: activeCategories.defensives ? '#000000' : '#999999',
              border: activeCategories.defensives ? '1px solid #ffaa00' : '1px solid #333333',
              borderRadius: '3px',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: activeCategories.defensives ? 'bold' : 'normal',
              fontFamily: 'monospace',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              if (!activeCategories.defensives) {
                e.currentTarget.style.backgroundColor = '#2a2a2a';
                e.currentTarget.style.borderColor = '#555555';
              }
            }}
            onMouseLeave={(e) => {
              if (!activeCategories.defensives) {
                e.currentTarget.style.backgroundColor = '#1a1a1a';
                e.currentTarget.style.borderColor = '#333333';
              }
            }}
          >
            Defensives
          </button>
        </div>
        
        {/* Benchmarked Button */}
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
        <div style={{ 
          display: 'flex', 
          gap: '8px', 
          alignItems: 'center',
          borderLeft: '1px solid #333333', 
          paddingLeft: '20px' 
        }}>
          <label style={{ 
            color: '#999999', 
            fontSize: '11px', 
            fontFamily: 'monospace' 
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
            fontFamily: 'monospace' 
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

      {/* Chart Canvas */}
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
        {loading ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: '#666666',
            fontSize: '14px',
            fontFamily: 'monospace'
          }}>
            Loading data...
          </div>
        ) : (
          <>
            <canvas
              ref={canvasRef}
              onMouseMove={handleMouseMove}
              onMouseDown={handleMouseDown}
              onMouseUp={handleMouseUp}
              onMouseLeave={() => {
                crosshairRef.current = null;
                if (hoveredSector !== null) {
                  setHoveredSector(null);
                }
                if (isDragging) {
                  setIsDragging(false);
                }
              }}
              onWheel={handleWheel}
              style={{ 
                cursor: isDragging ? 'grabbing' : 'grab',
                display: 'block'
              }}
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
          </>
        )}
      </div>
    </div>
  );
};

export default IndustriesPerformanceChart;
