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
  statistics: {
    totalReturn: number;
    annualizedReturn: number;
    volatility: number;
    sharpeRatio: number;
    maxDrawdown: number;
    winRate: number;
    avgWin: number;
    avgLoss: number;
    bestTrade: number;
    worstTrade: number;
  };
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
  comparisonSymbols: string[];
}

interface SeasonaxMainChartProps {
  data: SeasonalAnalysis;
  comparisonData?: SeasonalAnalysis[];
  settings: ChartSettings;
  sweetSpotPeriod?: { startDay: number; endDay: number; period: string } | null;
  painPointPeriod?: { startDay: number; endDay: number; period: string } | null;
}

// Helper function to smooth data - removes abnormal spikes/crashes
const smoothData = (data: DailySeasonalData[]): DailySeasonalData[] => {
  if (data.length < 3) return data;
  
  const smoothed = data.map((point, index) => {
    if (index === 0 || index === data.length - 1) return point;
    
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
  if (data.length < 2) return data;
  
  // Calculate linear trend
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  const n = data.length;
  
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

// Helper function to draw a seasonal line
const drawSeasonalLine = (
  ctx: CanvasRenderingContext2D,
  dataPoints: DailySeasonalData[],
  containerWidth: number,
  containerHeight: number,
  padding: { top: number; right: number; bottom: number; left: number },
  chartWidth: number,
  chartHeight: number,
  paddedMin: number,
  paddedRange: number,
  color: string,
  lineWidth: number,
  symbol: string
) => {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();

  dataPoints.forEach((dayData, index) => {
    const x = padding.left + (dayData.dayOfYear / 365) * chartWidth;
    const y = containerHeight - padding.bottom - ((dayData.cumulativeReturn - paddedMin) / paddedRange) * chartHeight;
    
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();
  
  // Add symbol label at the end of the line
  if (dataPoints.length > 0) {
    const lastPoint = dataPoints[dataPoints.length - 1];
    const x = padding.left + (lastPoint.dayOfYear / 365) * chartWidth;
    const y = containerHeight - padding.bottom - ((lastPoint.cumulativeReturn - paddedMin) / paddedRange) * chartHeight;
    
    ctx.fillStyle = color;
    ctx.font = 'bold 12px "Roboto Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(symbol, x + 5, y - 5);
  }
};

const SeasonaxMainChart: React.FC<SeasonaxMainChartProps> = ({ data, comparisonData = [], settings, sweetSpotPeriod, painPointPeriod }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    console.log('SeasonaxMainChart useEffect triggered', { 
      hasData: !!data, 
      hasCanvas: !!canvasRef.current,
      comparisonCount: comparisonData.length
    });
    if (data && canvasRef.current) {
      console.log('Drawing charts with data:', data.symbol, 'dailyData length:', data.dailyData.length);
      drawCharts();
    }
  }, [data, comparisonData, settings]);

  useEffect(() => {
    if (!containerRef.current) return;

    let resizeTimeout: NodeJS.Timeout;
    let isResizing = false;
    
    const resizeObserver = new ResizeObserver((entries) => {
      // Prevent multiple rapid calls
      if (isResizing) return;
      isResizing = true;
      
      // Clear previous timeout to debounce
      if (resizeTimeout) clearTimeout(resizeTimeout);
      
      // Only trigger if container actually changed size
      const entry = entries[0];
      if (!entry) {
        isResizing = false;
        return;
      }
      
      const { width, height } = entry.contentRect;
      
      resizeTimeout = setTimeout(() => {
        try {
          // Only redraw if dimensions are reasonable and we have data
          if (data && canvasRef.current) {
            if (width > 100 && height > 100 && width < 5000 && height < 3000) {
              console.log(`Redrawing chart due to resize: ${width}x${height}`);
              drawCharts();
            } else {
              console.warn(`Skipping redraw - invalid dimensions: ${width}x${height}`);
            }
          }
        } catch (error) {
          console.error('Error during resize redraw:', error);
        } finally {
          isResizing = false;
        }
      }, 150);
    });

    try {
      resizeObserver.observe(containerRef.current);
    } catch (error) {
      console.error('Error setting up ResizeObserver:', error);
      isResizing = false;
    }

    return () => {
      if (resizeTimeout) clearTimeout(resizeTimeout);
      try {
        resizeObserver.disconnect();
      } catch (error) {
        console.error('Error disconnecting ResizeObserver:', error);
      }
      isResizing = false;
    };
  }, [data]);

  const drawCharts = () => {
    drawMainSeasonalChart();
  };

  const drawMainSeasonalChart = () => {
    const canvas = canvasRef.current;
    if (!canvas || !data) {
      console.log('drawMainSeasonalChart early return:', { hasCanvas: !!canvas, hasData: !!data });
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.log('No canvas context available');
      return;
    }

    console.log('Starting to draw main seasonal chart for:', data.symbol);

    // Get full container size to utilize all available space
    const container = containerRef.current;
    if (!container) return;
    
    const containerRect = container.getBoundingClientRect();
    const containerWidth = containerRect.width;
    const containerHeight = containerRect.height;

    // Prevent invalid dimensions - more strict checking
    if (containerWidth <= 100 || containerHeight <= 100 || 
        containerWidth > 5000 || containerHeight > 3000 ||
        !isFinite(containerWidth) || !isFinite(containerHeight)) {
      console.warn(`Invalid container dimensions: ${containerWidth}x${containerHeight}`);
      return;
    }

    try {
      // Setup high-DPI rendering with full container dimensions
      const devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2); // Cap at 2x for performance
      
      // Set actual canvas size (scaled for high-DPI)
      canvas.width = Math.floor(containerWidth * devicePixelRatio);
      canvas.height = Math.floor(containerHeight * devicePixelRatio);
      
      // Scale canvas back down using CSS with explicit dimensions
      canvas.style.width = Math.floor(containerWidth) + 'px';
      canvas.style.height = Math.floor(containerHeight) + 'px';
      
      // Clear any existing content first
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
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

      // Get data bounds from processed data and comparison data
      let allCumulativeReturns = processedData.map(d => d.cumulativeReturn);
      
      // Include comparison data in bounds calculation
      comparisonData.forEach(compData => {
        if (compData && compData.dailyData) {
          let compProcessedData = compData.dailyData;
          
          // Apply same processing as main data
          if (settings.smoothing) {
            compProcessedData = smoothData(compProcessedData);
          }
          if (settings.detrend) {
            compProcessedData = detrendData(compProcessedData);
          }
          
          const compReturns = compProcessedData.map(d => d.cumulativeReturn);
          allCumulativeReturns = allCumulativeReturns.concat(compReturns);
        }
      });
      
      const minReturn = Math.min(...allCumulativeReturns);
      const maxReturn = Math.max(...allCumulativeReturns);
      const returnRange = maxReturn - minReturn;
      
      // Add padding to range
      const paddedMin = minReturn - returnRange * 0.1;
      const paddedMax = maxReturn + returnRange * 0.1;
      const paddedRange = paddedMax - paddedMin;

      // Draw background
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, containerWidth, containerHeight);

      // Draw grid lines
      ctx.strokeStyle = '#333333';
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
      ctx.strokeStyle = '#FF6600';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(padding.left, zeroY);
      ctx.lineTo(containerWidth - padding.right, zeroY);
      ctx.stroke();

      // Fill areas above and below zero line with the main seasonal data
      if (processedData && processedData.length > 0) {
        // Green area (above zero line) - positive returns
        ctx.fillStyle = 'rgba(0, 255, 0, 0.1)';
        ctx.beginPath();
        ctx.moveTo(padding.left, zeroY);
        
        processedData.forEach((dayData, index) => {
          const x = padding.left + (dayData.dayOfYear / 365) * chartWidth;
          const y = containerHeight - padding.bottom - ((dayData.cumulativeReturn - paddedMin) / paddedRange) * chartHeight;
          
          if (dayData.cumulativeReturn >= 0) {
            ctx.lineTo(x, y);
          } else {
            ctx.lineTo(x, zeroY);
          }
        });
        
        ctx.lineTo(containerWidth - padding.right, zeroY);
        ctx.closePath();
        ctx.fill();

        // Red area (below zero line) - negative returns
        ctx.fillStyle = 'rgba(255, 0, 0, 0.1)';
        ctx.beginPath();
        ctx.moveTo(padding.left, zeroY);
        
        processedData.forEach((dayData, index) => {
          const x = padding.left + (dayData.dayOfYear / 365) * chartWidth;
          const y = containerHeight - padding.bottom - ((dayData.cumulativeReturn - paddedMin) / paddedRange) * chartHeight;
          
          if (dayData.cumulativeReturn < 0) {
            ctx.lineTo(x, y);
          } else {
            ctx.lineTo(x, zeroY);
          }
        });
        
        ctx.lineTo(containerWidth - padding.right, zeroY);
        ctx.closePath();
        ctx.fill();
      }

      // Draw main seasonal line with processed data
      drawSeasonalLine(ctx, processedData, containerWidth, containerHeight, padding, chartWidth, chartHeight, paddedMin, paddedRange, '#ffffff', 3, data.symbol);

      // Draw comparison lines
      const comparisonColors = ['#00FF00', '#FF00FF', '#00FFFF', '#FFFF00', '#FF8000'];
      comparisonData.forEach((compData, index) => {
        if (compData && compData.dailyData) {
          let compProcessedData = compData.dailyData;
          
          // Apply same processing as main data
          if (settings.smoothing) {
            compProcessedData = smoothData(compProcessedData);
          }
          if (settings.detrend) {
            compProcessedData = detrendData(compProcessedData);
          }
          
          const color = comparisonColors[index % comparisonColors.length];
          drawSeasonalLine(ctx, compProcessedData, containerWidth, containerHeight, padding, chartWidth, chartHeight, paddedMin, paddedRange, color, 2, compData.symbol);
        }
      });

      // Draw Sweet Spot highlighting (green overlay)
      if (sweetSpotPeriod) {
        const startX = padding.left + (sweetSpotPeriod.startDay / 365) * chartWidth;
        const endX = padding.left + (sweetSpotPeriod.endDay / 365) * chartWidth;
        
        ctx.fillStyle = 'rgba(0, 255, 0, 0.15)'; // Low opacity green
        ctx.fillRect(startX, padding.top, endX - startX, chartHeight);
        
        // Add Sweet Spot label
        ctx.fillStyle = '#00FF00';
        ctx.font = 'bold 14px "Roboto Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('SWEET SPOT', (startX + endX) / 2, padding.top - 5);
      }

      // Draw Pain Point highlighting (red overlay)
      if (painPointPeriod) {
        const startX = padding.left + (painPointPeriod.startDay / 365) * chartWidth;
        const endX = padding.left + (painPointPeriod.endDay / 365) * chartWidth;
        
        ctx.fillStyle = 'rgba(255, 0, 0, 0.15)'; // Low opacity red
        ctx.fillRect(startX, padding.top, endX - startX, chartHeight);
        
        // Add Pain Point label
        ctx.fillStyle = '#FF0000';
        ctx.font = 'bold 14px "Roboto Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('PAIN POINT', (startX + endX) / 2, padding.top - 5);
      }

      // Draw current date line if enabled
      if (settings.showCurrentDate) {
        const currentDate = new Date();
        const startOfYear = new Date(currentDate.getFullYear(), 0, 1);
        const dayOfYear = Math.floor((currentDate.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        
        const currentDateX = padding.left + (dayOfYear / 365) * chartWidth;
        
        ctx.strokeStyle = '#FF6600'; // Bloomberg Terminal orange color for current date
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]); // Dashed line
        ctx.beginPath();
        ctx.moveTo(currentDateX, padding.top);
        ctx.lineTo(currentDateX, containerHeight - padding.bottom);
        ctx.stroke();
        ctx.setLineDash([]); // Reset line dash
        
        // Add current date label - bigger and more visible
        ctx.fillStyle = '#FF6600';
        ctx.font = 'bold 20px "Roboto Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('TODAY', currentDateX, padding.top - 15);
      }

      // Draw Y-axis labels - crispy white with % symbol and 30% smaller
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 17px "Roboto Mono", monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';

      for (let i = 0; i <= 10; i++) {
        const value = paddedMax - (i * paddedRange) / 10;
        const y = padding.top + (i * chartHeight) / 10;
        ctx.fillText(value.toFixed(1) + '%', padding.left - 15, y);
      }

      // Draw X-axis labels (months) - crispy white and 30% smaller
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 17px "Roboto Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
      
      monthStarts.forEach((dayOfYear, index) => {
        if (index < monthNames.length) {
          const x = padding.left + (dayOfYear / 365) * chartWidth;
          ctx.fillText(monthNames[index], x, containerHeight - padding.bottom + 15);
        }
      });

      
    } catch (error) {
      console.error('Error drawing main seasonal chart:', error);
      // Try to clear canvas on error to prevent corrupted display
      try {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, containerWidth, containerHeight);
      } catch (clearError) {
        console.error('Error clearing canvas:', clearError);
      }
    }
  };

  return (
    <div className="seasonax-main-chart" ref={containerRef} style={{ 
      width: '100%', 
      height: '100%', 
      minHeight: '400px',
      minWidth: '300px',
      position: 'relative',
      overflow: 'hidden'
    }}>
      <div className="main-chart-container" style={{ 
        width: '100%', 
        height: '100%', 
        position: 'relative' 
      }}>
        <canvas 
          ref={canvasRef} 
          className="seasonax-canvas"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%'
          }}
        />
        
        {/* Chart Legend */}
        {(comparisonData.length > 0) && (
          <div className="chart-legend">
            <div className="legend-title">Symbols</div>
            <div className="legend-items">
              <div className="legend-item main">
                <div className="legend-color" style={{ backgroundColor: '#ffffff' }}></div>
                <div className="legend-label">{data.symbol}</div>
              </div>
              {comparisonData.map((compData, index) => {
                const comparisonColors = ['#00FF00', '#FF00FF', '#00FFFF', '#FFFF00', '#FF8000'];
                const color = comparisonColors[index % comparisonColors.length];
                return (
                  <div key={compData.symbol} className="legend-item comparison">
                    <div className="legend-color" style={{ backgroundColor: color }}></div>
                    <div className="legend-label">{compData.symbol}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SeasonaxMainChart;
