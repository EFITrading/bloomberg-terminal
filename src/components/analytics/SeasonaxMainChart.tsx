'use client';

import React, { useEffect, useRef } from 'react';

interface DailySeasonalData {
  dayOfYear: number;
  month: number;
  day: number;
  monthName: string;
  avgReturn: number;
  cumulativeReturn: number;
  occurrences: number;
  positiveYears: number;
  winningTrades: number;
  pattern: number;
  yearlyReturns: { [year: number]: number };
}

interface SeasonalAnalysis {
  symbol: string;
  companyName: string;
  currency: string;
  period: string;
  dailyData: DailySeasonalData[];
  statistics: any;
  patternReturns: { [year: number]: number };
}

interface ChartSettings {
  startDate: string;
  endDate: string;
  yearsOfData: number;
  showCumulative: boolean;
  showPatternReturns: boolean;
  selectedYears: number[];
  smoothing: boolean;
  detrend: boolean;
  showCurrentDate: boolean;
}

interface SeasonaxMainChartProps {
  data: SeasonalAnalysis;
  settings: ChartSettings;
}

// Helper function to smooth data - removes abnormal spikes/crashes
const smoothData = (data: DailySeasonalData[]): DailySeasonalData[] => {
  if (data.length < 3) return data;
  
  const smoothed = data.map((point, index) => {
    if (index === 0 || index === data.length - 1) {
      return point; // Keep first and last points unchanged
    }
    
    // Use moving average with adjacent points
    const prev = data[index - 1];
    const next = data[index + 1];
    const smoothedReturn = (prev.cumulativeReturn + point.cumulativeReturn + next.cumulativeReturn) / 3;
    
    return {
      ...point,
      cumulativeReturn: smoothedReturn
    };
  });
  
  return smoothed;
};

// Helper function to detrend data - removes overall trend
const detrendData = (data: DailySeasonalData[]): DailySeasonalData[] => {
  if (data.length === 0) return data;
  
  // Calculate linear trend
  const n = data.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  
  data.forEach((point, index) => {
    const x = index;
    const y = point.cumulativeReturn;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  });
  
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  
  // Remove trend from data
  const detrended = data.map((point, index) => {
    const trend = slope * index + intercept;
    return {
      ...point,
      cumulativeReturn: point.cumulativeReturn - trend
    };
  });
  
  return detrended;
};

const SeasonaxMainChart: React.FC<SeasonaxMainChartProps> = ({ data, settings }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cumulativeCanvasRef = useRef<HTMLCanvasElement>(null);
  const patternCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (data && canvasRef.current && cumulativeCanvasRef.current && patternCanvasRef.current) {
      drawCharts();
    }
  }, [data, settings]);

  useEffect(() => {
    if (!containerRef.current) return;

    let resizeTimeout: NodeJS.Timeout;
    const resizeObserver = new ResizeObserver((entries) => {
      // Clear previous timeout to debounce
      if (resizeTimeout) clearTimeout(resizeTimeout);
      
      // Only trigger if container actually changed size
      const entry = entries[0];
      const { width, height } = entry.contentRect;
      
      resizeTimeout = setTimeout(() => {
        if (data && canvasRef.current && cumulativeCanvasRef.current && patternCanvasRef.current) {
          // Only redraw if dimensions are reasonable
          if (width > 0 && height > 0 && width < 5000 && height < 3000) {
            drawCharts();
          }
        }
      }, 200);
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      if (resizeTimeout) clearTimeout(resizeTimeout);
      resizeObserver.disconnect();
    };
  }, [data]);

  const drawCharts = () => {
    drawMainSeasonalChart();
  };

  const drawMainSeasonalChart = () => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Get full container size to utilize all available space
    const container = containerRef.current;
    if (!container) return;
    
    const containerRect = container.getBoundingClientRect();
    const containerWidth = containerRect.width;
    const containerHeight = containerRect.height;

    // Prevent invalid dimensions
    if (containerWidth <= 0 || containerHeight <= 0) return;

    // Setup high-DPI rendering with full container dimensions
    const devicePixelRatio = window.devicePixelRatio || 1;
    
    // Set actual canvas size (scaled for high-DPI)
    canvas.width = containerWidth * devicePixelRatio;
    canvas.height = containerHeight * devicePixelRatio;
    
    // Scale canvas back down using CSS with explicit dimensions
    canvas.style.width = containerWidth + 'px';
    canvas.style.height = containerHeight + 'px';
    
    // Scale the drawing context for crisp rendering
    ctx.scale(devicePixelRatio, devicePixelRatio);
    
    // Enable crisp rendering
    ctx.imageSmoothingEnabled = false;

    // Clear canvas
    ctx.clearRect(0, 0, containerWidth, containerHeight);

    const padding = { top: 40, right: 60, bottom: 60, left: 60 };
    const chartWidth = containerWidth - padding.left - padding.right;
    const chartHeight = containerHeight - padding.top - padding.bottom;

    // Process data based on settings
    let processedData = [...data.dailyData];
    
    // Apply smoothing if enabled - removes abnormal pumps/crashes
    if (settings.smoothing) {
      processedData = smoothData(processedData);
    }
    
    // Apply detrending if enabled - removes overall trend
    if (settings.detrend) {
      processedData = detrendData(processedData);
    }

    // Get data bounds from processed data
    const cumulativeReturns = processedData.map(d => d.cumulativeReturn);
    const minReturn = Math.min(...cumulativeReturns);
    const maxReturn = Math.max(...cumulativeReturns);
    const returnRange = maxReturn - minReturn;
    
    // Add padding to range
    const paddedMin = minReturn - returnRange * 0.1;
    const paddedMax = maxReturn + returnRange * 0.1;
    const paddedRange = paddedMax - paddedMin;

    // Draw background
    ctx.fillStyle = '#1a2332';
    ctx.fillRect(0, 0, containerWidth, containerHeight);

    // Draw grid lines
    ctx.strokeStyle = '#2a3441';
    ctx.lineWidth = 1;

    // Horizontal grid lines
    for (let i = 0; i <= 10; i++) {
      const y = padding.top + (i * chartHeight) / 10;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(containerWidth - padding.right, y);
      ctx.stroke();
    }

    // Vertical grid lines (monthly)
    const monthStarts = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]; // Day of year for each month
    monthStarts.forEach(dayOfYear => {
      const x = padding.left + (dayOfYear / 365) * chartWidth;
      ctx.beginPath();
      ctx.moveTo(x, padding.top);
      ctx.lineTo(x, containerHeight - padding.bottom);
      ctx.stroke();
    });

    // Draw zero line
    const zeroY = containerHeight - padding.bottom - ((0 - paddedMin) / paddedRange) * chartHeight;
    ctx.strokeStyle = '#4a5568';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding.left, zeroY);
    ctx.lineTo(containerWidth - padding.right, zeroY);
    ctx.stroke();

    // Draw main seasonal line with processed data
    ctx.strokeStyle = '#38d9a9'; // Teal color like Seasonax
    ctx.lineWidth = 3;
    ctx.beginPath();

    processedData.forEach((dayData, index) => {
      const x = padding.left + (dayData.dayOfYear / 365) * chartWidth;
      const y = containerHeight - padding.bottom - ((dayData.cumulativeReturn - paddedMin) / paddedRange) * chartHeight;
      
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    // Draw current date line if enabled
    if (settings.showCurrentDate) {
      const currentDate = new Date();
      const startOfYear = new Date(currentDate.getFullYear(), 0, 1);
      const dayOfYear = Math.floor((currentDate.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      
      const currentDateX = padding.left + (dayOfYear / 365) * chartWidth;
      
      ctx.strokeStyle = '#3b82f6'; // Blue color for current date
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]); // Dashed line
      ctx.beginPath();
      ctx.moveTo(currentDateX, padding.top);
      ctx.lineTo(currentDateX, containerHeight - padding.bottom);
      ctx.stroke();
      ctx.setLineDash([]); // Reset line dash
      
      // Add current date label - bigger and more visible
      ctx.fillStyle = '#3b82f6';
      ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto';
      ctx.textAlign = 'center';
      ctx.fillText('Today', currentDateX, padding.top - 15);
    }

    // Draw Y-axis labels - crispy white with % symbol and 30% smaller
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 17px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (let i = 0; i <= 10; i++) {
      const value = paddedMax - (i * paddedRange) / 10;
      const y = padding.top + (i * chartHeight) / 10;
      ctx.fillText(value.toFixed(1) + '%', padding.left - 15, y);
    }

    // Draw X-axis labels (months) - crispy white and 30% smaller
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 17px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    monthStarts.forEach((dayOfYear, index) => {
      if (index < monthNames.length) {
        const x = padding.left + (dayOfYear / 365) * chartWidth;
        ctx.fillText(monthNames[index], x, containerHeight - padding.bottom + 15);
      }
    });

    // Chart title - crispy white and bigger
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto';
    ctx.textAlign = 'center';
    ctx.fillText('Annual Seasonality', containerWidth / 2, 25);
  };

  const drawCumulativeProfitChart = () => {
    const canvas = cumulativeCanvasRef.current;
    if (!canvas || !data) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Get full container size to utilize all available space
    const parentContainer = canvas.parentElement;
    if (!parentContainer) return;
    
    const containerRect = parentContainer.getBoundingClientRect();
    const containerWidth = containerRect.width - 30; // Account for padding
    const containerHeight = containerRect.height - 30;

    // Prevent invalid dimensions
    if (containerWidth <= 0 || containerHeight <= 0) return;

    // Setup high-DPI rendering
    const devicePixelRatio = window.devicePixelRatio || 1;
    
    canvas.width = containerWidth * devicePixelRatio;
    canvas.height = containerHeight * devicePixelRatio;
    
    canvas.style.width = containerWidth + 'px';
    canvas.style.height = containerHeight + 'px';
    
    ctx.scale(devicePixelRatio, devicePixelRatio);
    ctx.imageSmoothingEnabled = false;

    ctx.clearRect(0, 0, containerWidth, containerHeight);

    const padding = { top: 20, right: 40, bottom: 40, left: 40 };
    const chartWidth = containerWidth - padding.left - padding.right;
    const chartHeight = containerHeight - padding.top - padding.bottom;

    // Background
    ctx.fillStyle = '#1a2332';
    ctx.fillRect(0, 0, containerWidth, containerHeight);

    // Sample cumulative profit data (this would be calculated from actual data)
    const yearlyReturns = Object.values(data.patternReturns);
    const cumulativeData: number[] = [];
    let cumulative = 100; // Start at 100

    yearlyReturns.forEach(returnPct => {
      cumulative *= (1 + returnPct / 100);
      cumulativeData.push(cumulative);
    });

    if (cumulativeData.length === 0) return;

    const minValue = Math.min(100, ...cumulativeData);
    const maxValue = Math.max(...cumulativeData);
    const valueRange = maxValue - minValue;

    // Grid
    ctx.strokeStyle = '#2a3441';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = padding.top + (i * chartHeight) / 5;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(containerWidth - padding.right, y);
      ctx.stroke();
    }

    // Line
    ctx.strokeStyle = '#38d9a9';
    ctx.lineWidth = 2;
    ctx.beginPath();

    cumulativeData.forEach((value, index) => {
      const x = padding.left + (index / (cumulativeData.length - 1)) * chartWidth;
      const y = containerHeight - padding.bottom - ((value - minValue) / valueRange) * chartHeight;
      
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    // Title
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto';
    ctx.textAlign = 'left';
    ctx.fillText('Cumulative profit', 10, 15);
  };

  const drawPatternReturnsChart = () => {
    const canvas = patternCanvasRef.current;
    if (!canvas || !data) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Get full container size to utilize all available space
    const parentContainer = canvas.parentElement;
    if (!parentContainer) return;
    
    const containerRect = parentContainer.getBoundingClientRect();
    const containerWidth = containerRect.width - 30; // Account for padding
    const containerHeight = containerRect.height - 30;

    // Prevent invalid dimensions
    if (containerWidth <= 0 || containerHeight <= 0) return;

    // Setup high-DPI rendering
    const devicePixelRatio = window.devicePixelRatio || 1;
    
    canvas.width = containerWidth * devicePixelRatio;
    canvas.height = containerHeight * devicePixelRatio;
    
    canvas.style.width = containerWidth + 'px';
    canvas.style.height = containerHeight + 'px';
    
    ctx.scale(devicePixelRatio, devicePixelRatio);
    ctx.imageSmoothingEnabled = false;

    ctx.clearRect(0, 0, containerWidth, containerHeight);

    const padding = { top: 20, right: 40, bottom: 40, left: 40 };
    const chartWidth = containerWidth - padding.left - padding.right;
    const chartHeight = containerHeight - padding.top - padding.bottom;

    // Background
    ctx.fillStyle = '#1a2332';
    ctx.fillRect(0, 0, containerWidth, containerHeight);

    const yearlyReturns = Object.values(data.patternReturns);
    
    if (yearlyReturns.length === 0) return;

    const maxReturn = Math.max(...yearlyReturns, 0);
    const minReturn = Math.min(...yearlyReturns, 0);
    const range = Math.max(Math.abs(maxReturn), Math.abs(minReturn));

    const barWidth = chartWidth / yearlyReturns.length * 0.8;
    const barSpacing = chartWidth / yearlyReturns.length * 0.2;

    // Grid
    ctx.strokeStyle = '#2a3441';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = padding.top + (i * chartHeight) / 5;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(containerWidth - padding.right, y);
      ctx.stroke();
    }

    // Zero line
    const zeroY = padding.top + chartHeight / 2;
    ctx.strokeStyle = '#4a5568';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding.left, zeroY);
    ctx.lineTo(containerWidth - padding.right, zeroY);
    ctx.stroke();

    // Bars
    yearlyReturns.forEach((returnPct, index) => {
      const x = padding.left + index * (barWidth + barSpacing);
      const barHeight = Math.abs(returnPct / range) * (chartHeight / 2);
      
      const barY = returnPct >= 0 
        ? zeroY - barHeight 
        : zeroY;

      ctx.fillStyle = returnPct >= 0 ? '#38d9a9' : '#f56565';
      ctx.fillRect(x, barY, barWidth, Math.abs(barHeight));
    });

    // Title
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto';
    ctx.textAlign = 'left';
    ctx.fillText('Pattern returns', 10, 15);
  };

  const handleResize = () => {
    setTimeout(drawCharts, 100);
  };

  useEffect(() => {
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [data]);

  return (
    <div className="seasonax-main-chart" ref={containerRef}>
      <div className="main-chart-container">
        <canvas ref={canvasRef} className="seasonax-canvas" />
      </div>
    </div>
  );
};

export default SeasonaxMainChart;
