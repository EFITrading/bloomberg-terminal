'use client';

import React, { useEffect, useState } from 'react';
import { SeasonalPattern } from '@/lib/polygonService';

interface SeasonalLineChartModalProps {
  isOpen: boolean;
  onClose: () => void;
  pattern: SeasonalPattern;
  years: number;
}

interface YearLineData {
  year: number;
  data: Array<{ date: Date; value: number; dayOffset: number }>;
  color: string;
  totalReturn: number;
}

const SeasonalLineChartModal: React.FC<SeasonalLineChartModalProps> = ({
  isOpen,
  onClose,
  pattern,
  years
}) => {
  const [lineData, setLineData] = useState<YearLineData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && pattern) {
      fetchSeasonalLines();
    }
  }, [isOpen, pattern, years]);

  const parseDate = (dateStr: string): { month: number; day: number } => {
    const parts = dateStr.split(' ');
    const months: { [key: string]: number } = {
      'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
      'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
    };
    return { month: months[parts[0]], day: parseInt(parts[1]) };
  };

  const fetchSeasonalLines = async () => {
    setLoading(true);
    setError(null);

    try {
      // Parse the period string (e.g., "Jan 9 - Feb 7")
      const [startStr, endStr] = pattern.period.split(' - ');
      const startDate = parseDate(startStr);
      const endDate = parseDate(endStr);

      const { polygonService } = await import('@/lib/polygonService');

      const currentYear = new Date().getFullYear();
      const colors = [
        '#FF6600', '#00FF88', '#FF4444', '#FFD700', '#00BFFF',
        '#FF69B4', '#9370DB', '#00FA9A', '#FF8C00', '#1E90FF',
        '#FF1493', '#7FFF00', '#DC143C', '#00CED1', '#FF4500'
      ];

      const yearLines: YearLineData[] = [];

      // Fetch data for each year
      for (let i = 0; i < years; i++) {
        const year = currentYear - 1 - i; // Start from last year going back
        
        // Calculate date range
        const periodStartDate = new Date(year, startDate.month, startDate.day);
        const periodEndDate = new Date(
          endDate.month < startDate.month ? year + 1 : year,
          endDate.month,
          endDate.day
        );

        // Add buffer for data
        const fetchStartDate = new Date(periodStartDate);
        fetchStartDate.setDate(fetchStartDate.getDate() - 5);
        
        const fetchEndDate = new Date(periodEndDate);
        fetchEndDate.setDate(fetchEndDate.getDate() + 1);

        // Convert dates to ISO string format (YYYY-MM-DD)
        const fetchStartDateStr = fetchStartDate.toISOString().split('T')[0];
        const fetchEndDateStr = fetchEndDate.toISOString().split('T')[0];

        try {
          const historicalData = await polygonService.getHistoricalData(
            pattern.symbol,
            fetchStartDateStr,
            fetchEndDateStr
          );

          if (historicalData && historicalData.results && historicalData.results.length > 0) {
            // Find starting price
            const startPrice = historicalData.results.find(d => {
              const dataDate = new Date(d.t);
              return dataDate >= periodStartDate;
            })?.c || historicalData.results[0].c;

            // Calculate returns for each day in the period
            const periodData = historicalData.results
              .filter(d => {
                const dataDate = new Date(d.t);
                return dataDate >= periodStartDate && dataDate <= periodEndDate;
              })
              .map((d, idx) => {
                const dataDate = new Date(d.t);
                const returnPct = ((d.c - startPrice) / startPrice) * 100;
                return {
                  date: dataDate,
                  value: returnPct,
                  dayOffset: idx
                };
              });

            if (periodData.length > 0) {
              const totalReturn = periodData[periodData.length - 1].value;
              yearLines.push({
                year,
                data: periodData,
                color: colors[i % colors.length],
                totalReturn
              });
            }
          }
        } catch (err) {
          console.warn(`Failed to fetch data for year ${year}:`, err);
        }
      }

      setLineData(yearLines.reverse()); // Show oldest to newest
    } catch (err) {
      console.error('Error fetching seasonal lines:', err);
      setError('Failed to load seasonal data');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Calculate chart dimensions and scales
  const chartWidth = 1200;
  const chartHeight = 500;
  const padding = { top: 40, right: 125, bottom: 60, left: 60 };
  const plotWidth = chartWidth - padding.left - padding.right;
  const plotHeight = chartHeight - padding.top - padding.bottom;

  // Find max days and max/min returns
  const maxDays = Math.max(...lineData.map(line => line.data.length), 1);
  const allReturns = lineData.flatMap(line => line.data.map(d => d.value));
  const maxReturn = Math.max(...allReturns, 5);
  const minReturn = Math.min(...allReturns, -5);
  const returnRange = maxReturn - minReturn;

  const xScale = (dayOffset: number) => padding.left + (dayOffset / (maxDays - 1)) * plotWidth;
  const yScale = (returnValue: number) => padding.top + plotHeight - ((returnValue - minReturn) / returnRange) * plotHeight;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        backdropFilter: 'blur(8px)'
      }}
      onClick={handleBackdropClick}
    >
      <div
        style={{
          background: '#000000',
          border: '2px solid #FF6600',
          borderRadius: '12px',
          padding: '24px',
          maxWidth: '1300px',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.8)',
          position: 'relative'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'rgba(255, 68, 68, 0.2)',
            border: '1px solid #FF4444',
            borderRadius: '6px',
            color: '#FF4444',
            padding: '8px 16px',
            cursor: 'pointer',
            fontFamily: 'monospace',
            fontSize: '14px',
            fontWeight: 'bold',
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 68, 68, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255, 68, 68, 0.2)';
          }}
        >
          ✕ CLOSE
        </button>

        {/* Title */}
        <h2
          style={{
            color: '#FF6600',
            fontFamily: 'monospace',
            fontSize: '24px',
            marginBottom: '8px',
            textShadow: '0 0 10px rgba(255, 102, 0, 0.5)'
          }}
        >
          {pattern.symbol} - Seasonal Pattern
        </h2>
        <p
          style={{
            color: '#FFFFFF',
            fontFamily: 'monospace',
            fontSize: '14px',
            marginBottom: '24px'
          }}
        >
          {pattern.period} • {years} Year Historical Lines
        </p>

        {/* Chart */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: '#999999', fontFamily: 'monospace' }}>
            Loading seasonal data...
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '60px', color: '#FF4444', fontFamily: 'monospace' }}>
            {error}
          </div>
        ) : lineData.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', color: '#999999', fontFamily: 'monospace' }}>
            No data available
          </div>
        ) : (
          <svg width={chartWidth} height={chartHeight} style={{ display: 'block', margin: '0 auto' }}>
            {/* Grid lines */}
            {[...Array(5)].map((_, i) => {
              const y = padding.top + (plotHeight / 4) * i;
              const value = maxReturn - (returnRange / 4) * i;
              return (
                <g key={`grid-${i}`}>
                  <line
                    x1={padding.left}
                    y1={y}
                    x2={chartWidth - padding.right}
                    y2={y}
                    stroke="rgba(255, 255, 255, 0.1)"
                    strokeWidth="1"
                  />
                  <text
                    x={padding.left - 10}
                    y={y + 4}
                    fill="#FFFFFF"
                    fontSize="12"
                    fontFamily="monospace"
                    textAnchor="end"
                    fontWeight="bold"
                  >
                    {value.toFixed(1)}%
                  </text>
                </g>
              );
            })}

            {/* X-axis day markers */}
            {[...Array(6)].map((_, i) => {
              const dayNum = Math.floor((maxDays / 5) * i);
              const x = xScale(dayNum);
              return (
                <g key={`x-axis-${i}`}>
                  <line
                    x1={x}
                    y1={chartHeight - padding.bottom}
                    x2={x}
                    y2={chartHeight - padding.bottom + 5}
                    stroke="#FFFFFF"
                    strokeWidth="1"
                  />
                  <text
                    x={x}
                    y={chartHeight - padding.bottom + 20}
                    fill="#FFFFFF"
                    fontSize="11"
                    fontFamily="monospace"
                    textAnchor="middle"
                    fontWeight="bold"
                  >
                    {dayNum}
                  </text>
                </g>
              );
            })}

            {/* Zero line */}
            {minReturn < 0 && maxReturn > 0 && (
              <line
                x1={padding.left}
                y1={yScale(0)}
                x2={chartWidth - padding.right}
                y2={yScale(0)}
                stroke="rgba(255, 255, 255, 0.3)"
                strokeWidth="2"
                strokeDasharray="4,4"
              />
            )}

            {/* Seasonal lines */}
            {(() => {
              // Calculate uniform label positions - each year gets its own row
              const labelHeight = 18; // Height allocated for each label
              const availableHeight = plotHeight;
              const totalLines = lineData.length;
              
              // Sort by return percentage (highest to lowest)
              const sortedByReturn = [...lineData].sort((a, b) => b.totalReturn - a.totalReturn);
              
              // Create evenly distributed positions from top to bottom based on return %
              const labelPositions = sortedByReturn.map((line, idx) => {
                // Distribute labels evenly across the available height
                const labelY = padding.top + (idx * availableHeight / Math.max(1, totalLines - 1));
                
                const lastPoint = line.data[line.data.length - 1];
                const lastX = xScale(lastPoint.dayOffset);
                const lastY = yScale(lastPoint.value);
                
                return {
                  ...line,
                  labelY: totalLines === 1 ? padding.top + availableHeight / 2 : labelY,
                  endX: lastX,
                  endY: lastY
                };
              });

              return labelPositions.map((yearLine, idx) => {
                const pathData = yearLine.data.map((point, i) => {
                  const x = xScale(point.dayOffset);
                  const y = yScale(point.value);
                  return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
                }).join(' ');

                return (
                  <g key={`line-${idx}`}>
                    {/* Line path */}
                    <path
                      d={pathData}
                      fill="none"
                      stroke={yearLine.color}
                      strokeWidth="2"
                      opacity="0.8"
                    />
                    
                    {/* Connector line from end of data to label */}
                    <line
                      x1={yearLine.endX}
                      y1={yearLine.endY}
                      x2={chartWidth - padding.right + 5}
                      y2={yearLine.labelY}
                      stroke={yearLine.color}
                      strokeWidth="1"
                      strokeDasharray="2,2"
                      opacity="0.4"
                    />
                    
                    {/* Year and return label - stacked vertically with no overlap */}
                    <text
                      x={chartWidth - padding.right + 10}
                      y={yearLine.labelY}
                      fill={yearLine.color}
                      fontSize="11"
                      fontFamily="monospace"
                      fontWeight="bold"
                    >
                      {yearLine.year}: {yearLine.totalReturn >= 0 ? '+' : ''}{yearLine.totalReturn.toFixed(1)}%
                    </text>
                  </g>
                );
              });
            })()}

            {/* X-axis label */}
            <text
              x={chartWidth / 2}
              y={chartHeight - 10}
              fill="#FFFFFF"
              fontSize="14"
              fontFamily="monospace"
              textAnchor="middle"
              fontWeight="bold"
            >
              Days in Seasonal Period
            </text>

            {/* Y-axis label */}
            <text
              x={10}
              y={chartHeight / 2}
              fill="#FFFFFF"
              fontSize="14"
              fontFamily="monospace"
              textAnchor="middle"
              fontWeight="bold"
              transform={`rotate(-90, 10, ${chartHeight / 2})`}
            >
              Return %
            </text>
          </svg>
        )}

        {/* Legend */}
        {!loading && !error && lineData.length > 0 && (
          <div style={{ marginTop: '24px', display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'center' }}>
            {lineData.map((yearLine, idx) => (
              <div
                key={`legend-${idx}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 8px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  borderRadius: '4px',
                  border: `1px solid ${yearLine.color}`
                }}
              >
                <div
                  style={{
                    width: '20px',
                    height: '3px',
                    background: yearLine.color
                  }}
                />
                <span
                  style={{
                    color: yearLine.color,
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    fontWeight: 'bold'
                  }}
                >
                  {yearLine.year}: {yearLine.totalReturn >= 0 ? '+' : ''}{yearLine.totalReturn.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SeasonalLineChartModal;
