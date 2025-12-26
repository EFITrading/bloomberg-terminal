'use client';

import React, { useState, useEffect, useRef } from 'react';
import { AlmanacService, IndexSeasonalData } from '../../lib/almanacService';
import AlmanacCalendar from './AlmanacCalendar';
import WeeklyScanTable from './WeeklyScanTable';

interface AlmanacDailyChartProps {
  month?: number; // 0-11
  showPostElection?: boolean;
  onMonthChange?: (month: number) => void;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const AlmanacDailyChart: React.FC<AlmanacDailyChartProps> = ({ 
  month = new Date().getMonth(),
  showPostElection = true,
  onMonthChange
}) => {
  const [seasonalData, setSeasonalData] = useState<IndexSeasonalData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(month);
  const [showRecentYears, setShowRecentYears] = useState(true);
  const [showPostElectionYears, setShowPostElectionYears] = useState(true);
  const [activeView, setActiveView] = useState<'chart' | 'calendar' | 'table'>('chart');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const almanacService = new AlmanacService();
  
  // Sync selectedMonth with prop when it changes from parent
  useEffect(() => {
    setSelectedMonth(month);
  }, [month]);
  
  useEffect(() => {
    loadData();
  }, [selectedMonth]);
  
  useEffect(() => {
    if (seasonalData.length > 0 && canvasRef.current) {
      // Delay draw to ensure container is rendered
      const timer = setTimeout(() => {
        drawChart();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [seasonalData, showRecentYears, showPostElectionYears]);
  
  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (seasonalData.length > 0) {
        drawChart();
      }
    };
    
    window.addEventListener('resize', handleResize);
    
    // Also redraw after initial mount with a delay
    const mountTimer = setTimeout(() => {
      if (seasonalData.length > 0) {
        drawChart();
      }
    }, 500);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(mountTimer);
    };
  }, [seasonalData]);
  
  const loadData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const data = await almanacService.getMonthlySeasonalData(selectedMonth, 18);
      setSeasonalData(data);
    } catch (err) {
      setError('Failed to load seasonal data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };
  
  const drawChart = () => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Set canvas size based on container
    const rect = container.getBoundingClientRect();
    
    // Ensure we have valid dimensions
    const width = Math.max(rect.width, 300);
    const height = Math.max(rect.height, 300);
    
    // If container is too small, skip drawing
    if (rect.width < 50 || rect.height < 50) {
      console.log('Container too small, skipping draw', rect);
      return;
    }
    
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);
    
    const padding = { top: 15, right: 8, bottom: 20, left: 60 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    
    // Clear canvas
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);
    
    // Find min/max values across all data
    let minValue = Infinity;
    let maxValue = -Infinity;
    
    seasonalData.forEach(index => {
      index.dailyData.forEach(point => {
        minValue = Math.min(minValue, point.cumulativeReturn, point.postElectionCumulative);
        maxValue = Math.max(maxValue, point.cumulativeReturn, point.postElectionCumulative);
      });
    });
    
    // Add padding to min/max
    const range = maxValue - minValue;
    minValue -= range * 0.1;
    maxValue += range * 0.1;
    
    // Get max trading days
    const maxTradingDays = Math.max(...seasonalData.map(d => d.dailyData.length));
    
    // Draw grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    
    // Horizontal grid lines
    const numHLines = 8;
    for (let i = 0; i <= numHLines; i++) {
      const y = padding.top + (chartHeight / numHLines) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
      
      // Y-axis labels
      const value = maxValue - ((maxValue - minValue) / numHLines) * i;
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 16px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${value.toFixed(1)}%`, padding.left - 8, y + 4);
    }
    
    // Draw 0% line if in range
    if (minValue < 0 && maxValue > 0) {
      const zeroY = padding.top + chartHeight * (maxValue / (maxValue - minValue));
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(padding.left, zeroY);
      ctx.lineTo(width - padding.right, zeroY);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    
    // Calculate x positions for trading days
    const getX = (tradingDay: number) => {
      return padding.left + (tradingDay - 1) * (chartWidth / (maxTradingDays - 1));
    };
    
    // Calculate y positions for values
    const getY = (value: number) => {
      return padding.top + chartHeight * ((maxValue - value) / (maxValue - minValue));
    };
    
    // Line colors for each index
    const colors = {
      'DJIA': '#FFFFFF',
      'S&P 500': '#00C853',
      'NASDAQ': '#2196F3',
      'Russell 1000': '#9C27B0',
      'Russell 2000': '#FF5722'
    };
    
    // Draw lines for each index
    seasonalData.forEach(index => {
      const color = colors[index.name as keyof typeof colors] || '#FFFFFF';
      
      // Draw solid line for recent years (all years average)
      if (showRecentYears) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        index.dailyData.forEach((point, i) => {
          const x = getX(point.tradingDay);
          const y = getY(point.cumulativeReturn);
          
          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        });
        ctx.stroke();
      }
      
      // Draw dashed line for post-election years
      if (showPostElectionYears) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 4]);
        ctx.beginPath();
        
        index.dailyData.forEach((point, i) => {
          const x = getX(point.tradingDay);
          const y = getY(point.postElectionCumulative);
          
          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        });
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });
    
    // Draw X-axis labels (trading days and dates)
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 15px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    
    const year = new Date().getFullYear();
    
    // Show every trading day or every other day depending on space
    const step = maxTradingDays > 15 ? 2 : 1;
    
    seasonalData[0]?.dailyData.forEach((point, i) => {
      if (i % step === 0 || i === seasonalData[0].dailyData.length - 1) {
        const x = getX(point.tradingDay);
        
        // Date only (e.g., 12/3)
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 15px "JetBrains Mono", monospace';
        ctx.fillText(point.date, x, height - padding.bottom + 25);
      }
    });
    
    // Draw annotations for key patterns
    drawAnnotations(ctx, width, height, padding, getX, getY, maxTradingDays);
  };
  
  const drawAnnotations = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    padding: { top: number; right: number; bottom: number; left: number },
    getX: (day: number) => number,
    getY: (value: number) => number,
    maxDays: number
  ) => {
    // No hardcoded annotations - chart shows pure data
    // Annotations could be added dynamically based on actual data patterns
  };
  
  return (
    <div className="almanac-daily-chart">
      {/* Controls Row with Legend */}
      <div className="chart-header-row">
        <div className="chart-controls-row">
          <select 
            value={selectedMonth} 
            onChange={(e) => {
              const newMonth = parseInt(e.target.value);
              setSelectedMonth(newMonth);
              onMonthChange?.(newMonth);
            }}
            className="month-selector"
          >
            {MONTH_NAMES.map((name, i) => (
              <option key={i} value={i}>{name}</option>
            ))}
          </select>
          
          <button 
            className={`toggle-btn ${activeView === 'calendar' ? 'active' : ''}`}
            onClick={() => setActiveView(activeView === 'calendar' ? 'chart' : 'calendar')}
            style={{ marginLeft: '12px' }}
          >
            Calendar
          </button>
          
          <button 
            className={`toggle-btn ${activeView === 'table' ? 'active' : ''}`}
            onClick={() => setActiveView(activeView === 'table' ? 'chart' : 'table')}
            style={{ marginLeft: '8px' }}
          >
            SeasonalTable
          </button>
        </div>
        
        {/* Toggle Buttons and Legend */}
        <div className="chart-legend-inline">
          <div className="toggle-buttons">
            <button 
              className={`toggle-btn ${showRecentYears ? 'active' : ''}`}
              onClick={() => setShowRecentYears(!showRecentYears)}
            >
              Recent Years (Solid)
            </button>
            <button 
              className={`toggle-btn ${showPostElectionYears ? 'active' : ''}`}
              onClick={() => setShowPostElectionYears(!showPostElectionYears)}
            >
              Post-Election (Dashed)
            </button>
          </div>
          <div className="legend-row">
            <div className="legend-item"><span>DIA</span><span className="legend-line solid" style={{ backgroundColor: '#FFFFFF' }}></span><span className="legend-line dashed" style={{ background: 'repeating-linear-gradient(90deg, #FFFFFF 0px, #FFFFFF 4px, transparent 4px, transparent 7px)' }}></span></div>
            <div className="legend-item"><span>SPY</span><span className="legend-line solid" style={{ backgroundColor: '#00C853' }}></span><span className="legend-line dashed" style={{ background: 'repeating-linear-gradient(90deg, #00C853 0px, #00C853 4px, transparent 4px, transparent 7px)' }}></span></div>
            <div className="legend-item"><span>QQQ</span><span className="legend-line solid" style={{ backgroundColor: '#2196F3' }}></span><span className="legend-line dashed" style={{ background: 'repeating-linear-gradient(90deg, #2196F3 0px, #2196F3 4px, transparent 4px, transparent 7px)' }}></span></div>
            <div className="legend-item"><span>IWB</span><span className="legend-line solid" style={{ backgroundColor: '#9C27B0' }}></span><span className="legend-line dashed" style={{ background: 'repeating-linear-gradient(90deg, #9C27B0 0px, #9C27B0 4px, transparent 4px, transparent 7px)' }}></span></div>
            <div className="legend-item"><span>IWM</span><span className="legend-line solid" style={{ backgroundColor: '#FF5722' }}></span><span className="legend-line dashed" style={{ background: 'repeating-linear-gradient(90deg, #FF5722 0px, #FF5722 4px, transparent 4px, transparent 7px)' }}></span></div>
          </div>
        </div>
      </div>
      
      {/* Chart Container */}
      <div className="chart-container" ref={containerRef}>
        {loading && (
          <div className="chart-loading">
            <div className="loading-spinner"></div>
            <p>Loading {MONTH_NAMES[selectedMonth]} seasonal data...</p>
          </div>
        )}
        
        {error && (
          <div className="chart-error">
            <p>{error}</p>
            <button onClick={loadData}>Retry</button>
          </div>
        )}
        
        {activeView === 'chart' && <canvas ref={canvasRef} />}
        {activeView === 'calendar' && <AlmanacCalendar month={selectedMonth} year={new Date().getFullYear()} />}
        {activeView === 'table' && <WeeklyScanTable />}
      </div>
    </div>
  );
};

export default AlmanacDailyChart;
