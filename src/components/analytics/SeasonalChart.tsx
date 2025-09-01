'use client';

import React, { useEffect, useRef } from 'react';

interface SeasonalData {
  symbol: string;
  monthlyReturns: MonthlyReturn[];
  statistics: SeasonalStatistics;
  yearlyData: YearlyData[];
}

interface MonthlyReturn {
  month: number;
  monthName: string;
  avgReturn: number;
  successRate: number;
  bestYear: number;
  worstYear: number;
  standardDev: number;
  occurrences: number;
}

interface SeasonalStatistics {
  bestMonth: { month: string; return: number };
  worstMonth: { month: string; return: number };
  mostConsistent: { month: string; stdDev: number };
  overallReturn: number;
  sharpeRatio: number;
  maxDrawdown: number;
  yearsOfData: number;
}

interface YearlyData {
  year: number;
  monthlyPerformance: number[];
  totalReturn: number;
}

interface ChartSettings {
  timeframe: string;
  chartType: 'seasonal' | 'probability' | 'distribution';
  showConfidenceBands: boolean;
  benchmarkSymbol: string;
  selectedYears: number[];
}

interface SeasonalChartProps {
  data: SeasonalData | null;
  settings: ChartSettings;
  onSettingsChange: (settings: Partial<ChartSettings>) => void;
}

const SeasonalChart: React.FC<SeasonalChartProps> = ({ data, settings, onSettingsChange }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (data && canvasRef.current) {
      drawChart();
    }
  }, [data, settings]);

  const drawChart = () => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const container = containerRef.current;
    if (container) {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    }

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (settings.chartType === 'seasonal') {
      drawSeasonalChart(ctx, canvas.width, canvas.height);
    } else if (settings.chartType === 'probability') {
      drawProbabilityChart(ctx, canvas.width, canvas.height);
    } else if (settings.chartType === 'distribution') {
      drawDistributionChart(ctx, canvas.width, canvas.height);
    }
  };

  const drawSeasonalChart = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    if (!data) return;

    const padding = 60;
    const chartWidth = width - 2 * padding;
    const chartHeight = height - 2 * padding;

    // Find min/max values for scaling
    const allReturns = data.monthlyReturns.map(m => m.avgReturn);
    const minReturn = Math.min(...allReturns);
    const maxReturn = Math.max(...allReturns);
    const returnRange = maxReturn - minReturn;
    const yScale = chartHeight / (returnRange + returnRange * 0.2); // Add 20% padding
    const xScale = chartWidth / 11; // 12 months

    // Draw grid lines
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 1;

    // Horizontal grid lines
    for (let i = 0; i <= 10; i++) {
      const y = padding + (i * chartHeight) / 10;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();
    }

    // Vertical grid lines
    for (let i = 0; i <= 12; i++) {
      const x = padding + (i * chartWidth) / 12;
      ctx.beginPath();
      ctx.moveTo(x, padding);
      ctx.lineTo(x, height - padding);
      ctx.stroke();
    }

    // Draw zero line
    const zeroY = height - padding - ((0 - minReturn - returnRange * 0.1) * yScale);
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding, zeroY);
    ctx.lineTo(width - padding, zeroY);
    ctx.stroke();

    // Draw confidence bands if enabled
    if (settings.showConfidenceBands) {
      ctx.fillStyle = 'rgba(100, 150, 255, 0.1)';
      ctx.beginPath();
      
      // Upper confidence band
      data.monthlyReturns.forEach((monthData, index) => {
        const x = padding + (index * chartWidth) / 11;
        const upperY = height - padding - ((monthData.avgReturn + monthData.standardDev - minReturn - returnRange * 0.1) * yScale);
        if (index === 0) {
          ctx.moveTo(x, upperY);
        } else {
          ctx.lineTo(x, upperY);
        }
      });
      
      // Lower confidence band (reverse order)
      for (let i = data.monthlyReturns.length - 1; i >= 0; i--) {
        const monthData = data.monthlyReturns[i];
        const x = padding + (i * chartWidth) / 11;
        const lowerY = height - padding - ((monthData.avgReturn - monthData.standardDev - minReturn - returnRange * 0.1) * yScale);
        ctx.lineTo(x, lowerY);
      }
      
      ctx.closePath();
      ctx.fill();
    }

    // Draw main seasonal line
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 3;
    ctx.beginPath();

    data.monthlyReturns.forEach((monthData, index) => {
      const x = padding + (index * chartWidth) / 11;
      const y = height - padding - ((monthData.avgReturn - minReturn - returnRange * 0.1) * yScale);
      
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    // Draw data points
    ctx.fillStyle = '#00ff88';
    data.monthlyReturns.forEach((monthData, index) => {
      const x = padding + (index * chartWidth) / 11;
      const y = height - padding - ((monthData.avgReturn - minReturn - returnRange * 0.1) * yScale);
      
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, 2 * Math.PI);
      ctx.fill();
    });

    // Draw labels
    ctx.fillStyle = '#fff';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';

    // Month labels
    data.monthlyReturns.forEach((monthData, index) => {
      const x = padding + (index * chartWidth) / 11;
      ctx.fillText(monthData.monthName.substr(0, 3), x, height - 10);
    });

    // Y-axis labels
    ctx.textAlign = 'right';
    for (let i = 0; i <= 10; i++) {
      const value = maxReturn + returnRange * 0.1 - (i * (returnRange + returnRange * 0.2)) / 10;
      const y = padding + (i * chartHeight) / 10;
      ctx.fillText(value.toFixed(1) + '%', padding - 10, y + 4);
    }

    // Chart title
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`${data.symbol} - Seasonal Performance`, width / 2, 30);
  };

  const drawProbabilityChart = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    if (!data) return;

    const padding = 60;
    const chartWidth = width - 2 * padding;
    const chartHeight = height - 2 * padding;
    const barWidth = chartWidth / 12;

    // Draw grid
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 1;

    // Horizontal grid lines
    for (let i = 0; i <= 10; i++) {
      const y = padding + (i * chartHeight) / 10;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();
    }

    // Draw bars
    data.monthlyReturns.forEach((monthData, index) => {
      const x = padding + (index * barWidth);
      const barHeight = (monthData.successRate / 100) * chartHeight;
      const y = height - padding - barHeight;

      // Color based on success rate
      const intensity = monthData.successRate / 100;
      if (intensity > 0.6) {
        ctx.fillStyle = `rgba(0, 255, 136, ${intensity})`;
      } else if (intensity > 0.4) {
        ctx.fillStyle = `rgba(255, 255, 0, ${intensity})`;
      } else {
        ctx.fillStyle = `rgba(255, 100, 100, ${intensity})`;
      }

      ctx.fillRect(x + 5, y, barWidth - 10, barHeight);

      // Draw success rate text
      ctx.fillStyle = '#fff';
      ctx.font = '10px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(
        monthData.successRate.toFixed(0) + '%',
        x + barWidth / 2,
        y - 5
      );
    });

    // Draw labels
    ctx.fillStyle = '#fff';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';

    // Month labels
    data.monthlyReturns.forEach((monthData, index) => {
      const x = padding + (index * barWidth) + barWidth / 2;
      ctx.fillText(monthData.monthName.substr(0, 3), x, height - 10);
    });

    // Y-axis labels
    ctx.textAlign = 'right';
    for (let i = 0; i <= 10; i++) {
      const value = 100 - (i * 10);
      const y = padding + (i * chartHeight) / 10;
      ctx.fillText(value + '%', padding - 10, y + 4);
    }

    // Chart title
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`${data.symbol} - Success Rate by Month`, width / 2, 30);
  };

  const drawDistributionChart = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    if (!data) return;

    const padding = 60;
    const chartWidth = width - 2 * padding;
    const chartHeight = height - 2 * padding;
    const boxWidth = chartWidth / 12;

    // Find global min/max for scaling
    const allValues = data.monthlyReturns.flatMap(m => [m.bestYear, m.worstYear, m.avgReturn]);
    const minValue = Math.min(...allValues);
    const maxValue = Math.max(...allValues);
    const valueRange = maxValue - minValue;
    const yScale = chartHeight / (valueRange + valueRange * 0.2);

    // Draw grid
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 1;

    for (let i = 0; i <= 10; i++) {
      const y = padding + (i * chartHeight) / 10;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();
    }

    // Draw box plots
    data.monthlyReturns.forEach((monthData, index) => {
      const x = padding + (index * boxWidth) + boxWidth / 2;
      
      // Calculate positions
      const maxY = height - padding - ((monthData.bestYear - minValue - valueRange * 0.1) * yScale);
      const avgY = height - padding - ((monthData.avgReturn - minValue - valueRange * 0.1) * yScale);
      const minY = height - padding - ((monthData.worstYear - minValue - valueRange * 0.1) * yScale);
      
      // Draw whiskers
      ctx.strokeStyle = '#666';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, maxY);
      ctx.lineTo(x, minY);
      ctx.stroke();

      // Draw min/max lines
      ctx.beginPath();
      ctx.moveTo(x - 10, maxY);
      ctx.lineTo(x + 10, maxY);
      ctx.moveTo(x - 10, minY);
      ctx.lineTo(x + 10, minY);
      ctx.stroke();

      // Draw average point
      ctx.fillStyle = '#00ff88';
      ctx.beginPath();
      ctx.arc(x, avgY, 3, 0, 2 * Math.PI);
      ctx.fill();
    });

    // Draw labels
    ctx.fillStyle = '#fff';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';

    // Month labels
    data.monthlyReturns.forEach((monthData, index) => {
      const x = padding + (index * boxWidth) + boxWidth / 2;
      ctx.fillText(monthData.monthName.substr(0, 3), x, height - 10);
    });

    // Y-axis labels
    ctx.textAlign = 'right';
    for (let i = 0; i <= 10; i++) {
      const value = maxValue + valueRange * 0.1 - (i * (valueRange + valueRange * 0.2)) / 10;
      const y = padding + (i * chartHeight) / 10;
      ctx.fillText(value.toFixed(1) + '%', padding - 10, y + 4);
    }

    // Chart title
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`${data.symbol} - Return Distribution by Month`, width / 2, 30);
  };

  const handleResize = () => {
    if (data) {
      setTimeout(drawChart, 100); // Small delay to ensure container has resized
    }
  };

  useEffect(() => {
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [data]);

  if (!data) {
    return (
      <div className="chart-placeholder">
        <div className="placeholder-content">
          <div className="placeholder-icon">📊</div>
          <p>Select a symbol to view seasonal analysis</p>
        </div>
      </div>
    );
  }

  return (
    <div className="seasonal-chart" ref={containerRef}>
      <div className="chart-header">
        <div className="chart-type-selector">
          <button
            className={settings.chartType === 'seasonal' ? 'active' : ''}
            onClick={() => onSettingsChange({ chartType: 'seasonal' })}
          >
            Seasonal Performance
          </button>
          <button
            className={settings.chartType === 'probability' ? 'active' : ''}
            onClick={() => onSettingsChange({ chartType: 'probability' })}
          >
            Success Rate
          </button>
          <button
            className={settings.chartType === 'distribution' ? 'active' : ''}
            onClick={() => onSettingsChange({ chartType: 'distribution' })}
          >
            Distribution
          </button>
        </div>
        
        <div className="chart-options">
          <label className="confidence-toggle">
            <input
              type="checkbox"
              checked={settings.showConfidenceBands}
              onChange={(e) => onSettingsChange({ showConfidenceBands: e.target.checked })}
            />
            Show Confidence Bands
          </label>
        </div>
      </div>
      
      <canvas
        ref={canvasRef}
        className="seasonal-canvas"
        style={{ width: '100%', height: '100%' }}
      />
      
      <div className="chart-legend">
        <div className="legend-item">
          <div className="legend-color" style={{ backgroundColor: '#00ff88' }}></div>
          <span>Average Return</span>
        </div>
        {settings.showConfidenceBands && (
          <div className="legend-item">
            <div className="legend-color" style={{ backgroundColor: 'rgba(100, 150, 255, 0.3)' }}></div>
            <span>±1 Standard Deviation</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default SeasonalChart;
