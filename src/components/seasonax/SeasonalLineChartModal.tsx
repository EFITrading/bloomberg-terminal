'use client';

import React, { useEffect, useState } from 'react';
import { SeasonalPattern } from '@/lib/polygonService';

interface SeasonalLineChartModalProps {
  isOpen: boolean;
  onClose: () => void;
  pattern: SeasonalPattern;
  years: number;
  multiframeYears?: number[]; // e.g. [5, 10, 15] â€” qualifying timeframes from multi-TF scan
}

interface YearLineData {
  year: number;
  data: Array<{ date: Date; value: number; dayOffset: number }>;
  color: string;
  totalReturn: number;
}

interface TFAvgLineData {
  tf: number; // e.g. 5 for "5Y"
  avgLine: Array<{ dayOffset: number; value: number }>;
  totalReturn: number;
  color: string;
}

// Colors for per-timeframe average lines
const TF_COLORS: Record<number, string> = {
  5: '#00FF88',
  10: '#FFD700',
  15: '#00BFFF',
  20: '#FF6600',
};
const TF_COLOR_FALLBACK = ['#FF69B4', '#9370DB', '#00FA9A', '#FF8C00', '#1E90FF'];

const SeasonalLineChartModal: React.FC<SeasonalLineChartModalProps> = ({
  isOpen,
  onClose,
  pattern,
  years,
  multiframeYears,
}) => {
  const [lineData, setLineData] = useState<YearLineData[]>([]);
  const [tfAvgLines, setTfAvgLines] = useState<TFAvgLineData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Show multiframe tab by default when this is a multiframe pick
  const hasMultiframe = multiframeYears && multiframeYears.length >= 2;
  const [activeTab, setActiveTab] = useState<'historical' | 'multiframe'>(
    hasMultiframe ? 'multiframe' : 'historical'
  );
  // Set of enabled TF years in the multiframe chart (all enabled by default)
  const [enabledTFs, setEnabledTFs] = useState<Set<number>>(
    new Set(multiframeYears ?? [])
  );

  useEffect(() => {
    if (isOpen && pattern) {
      fetchSeasonalLines();
      // Reset enabled TFs whenever pattern/years change
      setEnabledTFs(new Set(multiframeYears ?? []));
    }
  }, [isOpen, pattern, years, multiframeYears]);

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

      // Determine how many years to fetch: max of years prop and any multiframe timeframe values
      const yearsToFetch = (multiframeYears && multiframeYears.length > 0)
        ? Math.max(years, ...multiframeYears)
        : years;

      const yearLines: YearLineData[] = [];

      // Fetch data for each year
      for (let i = 0; i < yearsToFetch; i++) {
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
            const startPrice = historicalData.results.find((d: any) => {
              const dataDate = new Date(d.t);
              return dataDate >= periodStartDate;
            })?.c || historicalData.results[0].c;

            // Calculate returns for each day in the period
            const periodData = historicalData.results
              .filter((d: any) => {
                const dataDate = new Date(d.t);
                return dataDate >= periodStartDate && dataDate <= periodEndDate;
              })
              .map((d: any, idx: number) => {
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

      const reversedLines = yearLines.reverse(); // Show oldest to newest
      setLineData(reversedLines);

      // Build per-timeframe average lines from the fetched data
      if (multiframeYears && multiframeYears.length >= 2 && yearLines.length > 0) {
        // yearLines (before reverse) is ordered most-recent-first
        // After reverse, reversedLines[reversedLines.length - 1] is the most recent year
        // Rebuild most-recent-first order for slicing
        const mostRecentFirst = [...reversedLines].reverse();

        const computed: TFAvgLineData[] = multiframeYears
          .slice()
          .sort((a, b) => a - b)
          .map((tf, idx) => {
            const slice = mostRecentFirst.slice(0, Math.min(tf, mostRecentFirst.length));
            if (slice.length === 0) return null;
            const maxD = Math.max(...slice.map((l) => l.data.length));
            const avgLine: Array<{ dayOffset: number; value: number }> = [];
            for (let d = 0; d < maxD; d++) {
              const vals = slice
                .map((l) => l.data[d]?.value)
                .filter((v): v is number => v !== undefined);
              if (vals.length > 0)
                avgLine.push({ dayOffset: d, value: vals.reduce((a, b) => a + b, 0) / vals.length });
            }
            const totalReturn = avgLine.length > 0 ? avgLine[avgLine.length - 1].value : 0;
            const color = TF_COLORS[tf] ?? TF_COLOR_FALLBACK[idx % TF_COLOR_FALLBACK.length];
            return { tf, avgLine, totalReturn, color } as TFAvgLineData;
          })
          .filter((x): x is TFAvgLineData => x !== null);
        setTfAvgLines(computed);
      }
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

  const toggleTF = (tf: number) => {
    setEnabledTFs((prev) => {
      const next = new Set(prev);
      if (next.has(tf)) {
        if (next.size > 1) next.delete(tf); // keep at least one active
      } else {
        next.add(tf);
      }
      return next;
    });
  };

  // â”€â”€ Chart dimensions & helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const chartWidth = 1200;
  const chartHeight = 560;
  const padding = { top: 36, right: 140, bottom: 56, left: 60 };
  const plotWidth = chartWidth - padding.left - padding.right;
  const plotHeight = chartHeight - padding.top - padding.bottom;

  // Historical tab helpers
  const maxDays = Math.max(...lineData.map(line => line.data.length), 1);
  const allReturns = lineData.flatMap(line => line.data.map(d => d.value));
  const maxReturn = Math.max(...allReturns, 5);
  const minReturn = Math.min(...allReturns, -5);
  const returnRange = maxReturn - minReturn || 1;
  const xScale = (d: number) => padding.left + (d / Math.max(maxDays - 1, 1)) * plotWidth;
  const yScale = (v: number) => padding.top + plotHeight - ((v - minReturn) / returnRange) * plotHeight;

  // Multiframe tab helpers â€” filter by enabled TFs
  const visibleTFLines = tfAvgLines.filter(t => enabledTFs.has(t.tf));
  const tfMaxDays = visibleTFLines.length > 0 ? Math.max(...visibleTFLines.map(t => t.avgLine.length), 1) : 1;
  const tfAllReturns = visibleTFLines.flatMap(t => t.avgLine.map(d => d.value));
  const tfMaxReturn = tfAllReturns.length > 0 ? Math.max(...tfAllReturns, 5) : 5;
  const tfMinReturn = tfAllReturns.length > 0 ? Math.min(...tfAllReturns, -5) : -5;
  const tfReturnRange = tfMaxReturn - tfMinReturn || 1;
  const tfXScale = (d: number) => padding.left + (d / Math.max(tfMaxDays - 1, 1)) * plotWidth;
  const tfYScale = (v: number) => padding.top + plotHeight - ((v - tfMinReturn) / tfReturnRange) * plotHeight;

  // Tab button â€” matches LiquidPanel/WatchPanel style exactly
  const renderTabBtn = (label: string, value: 'multiframe' | 'historical') => {
    const isActive = activeTab === value;
    return (
      <button
        key={value}
        onClick={() => setActiveTab(value)}
        className="flex-1 font-black uppercase tracking-[0.15em] transition-all relative"
        style={{
          padding: '13px 20px',
          fontSize: '13px',
          color: isActive ? '#FF6600' : '#ffffff',
          border: isActive ? '2px solid #FF6600' : '2px solid rgba(255,255,255,0.15)',
          background: isActive
            ? 'linear-gradient(180deg,#1a1a1a 0%,#060606 100%)'
            : 'linear-gradient(180deg,#111111 0%,#040404 100%)',
          boxShadow: isActive
            ? '0 0 18px rgba(255,102,0,0.35), inset 0 1px 0 rgba(255,255,255,0.1)'
            : 'inset 0 1px 0 rgba(255,255,255,0.04)',
          fontFamily: '"Roboto Mono", "Courier New", monospace',
          cursor: 'pointer',
          letterSpacing: '1.5px',
        }}
      >
        {isActive && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'linear-gradient(180deg,rgba(255,102,0,0.15) 0%,transparent 100%)' }}
          />
        )}
        <span className="relative" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.9)' }}>
          {label}
        </span>
      </button>
    );
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.88)',
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
          border: '2px solid rgba(255,102,0,0.7)',
          borderRadius: '0px',
          maxWidth: '1340px',
          width: '96vw',
          maxHeight: '92vh',
          overflow: 'auto',
          boxShadow: '0 0 60px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,102,0,0.12)',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >

        {/* â”€â”€ TOP BAR: Tabs + Close â€” matches LiquidPanel/WatchPanel â”€â”€ */}
        <div
          style={{
            display: 'flex',
            alignItems: 'stretch',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            background: '#000',
            flexShrink: 0,
            position: 'relative',
          }}
        >
          {/* Tabs row */}
          <div style={{ display: 'flex', flex: 1 }}>
            {hasMultiframe && renderTabBtn('MULTI-TF AVERAGES', 'multiframe')}
            {renderTabBtn('HISTORICAL LINES', 'historical')}
          </div>

          {/* Close button â€” same style as LiquidPanel */}
          <button
            onClick={onClose}
            style={{
              flexShrink: 0,
              width: '48px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              border: 'none',
              borderLeft: '2px solid rgba(255,255,255,0.15)',
              color: '#FF4444',
              fontSize: '18px',
              fontWeight: 'bold',
              cursor: 'pointer',
              fontFamily: 'monospace',
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,68,68,0.15)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            ✕
          </button>
        </div>

        {/* â”€â”€ HEADER: Symbol + Period + TF toggles â”€â”€ */}
        <div
          style={{
            padding: '16px 24px 14px',
            borderBottom: '1px solid rgba(255,255,255,0.07)',
            background: '#000',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          {/* Left: symbol + period */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap' }}>
            <span
              style={{
                color: '#FF6600',
                fontFamily: '"Roboto Mono","Courier New",monospace',
                fontSize: '22px',
                fontWeight: '900',
                letterSpacing: '2px',
                textShadow: '0 0 18px rgba(255,102,0,0.55)',
              }}
            >
              {pattern.symbol}
            </span>
            <span
              style={{
                color: 'rgba(255,255,255,0.45)',
                fontFamily: '"Roboto Mono","Courier New",monospace',
                fontSize: '14px',
                fontWeight: 'bold',
                letterSpacing: '0.5px',
              }}
            >
              —
            </span>
            <span
              style={{
                color: '#ffffff',
                fontFamily: '"Roboto Mono","Courier New",monospace',
                fontSize: '14px',
                fontWeight: '700',
                letterSpacing: '0.5px',
              }}
            >
              Seasonal Pattern
            </span>
            <span
              style={{
                color: 'rgba(255,255,255,0.35)',
                fontFamily: '"Roboto Mono","Courier New",monospace',
                fontSize: '12px',
              }}
            >
              •
            </span>
            <span
              style={{
                color: 'rgba(255,255,255,0.65)',
                fontFamily: '"Roboto Mono","Courier New",monospace',
                fontSize: '13px',
                letterSpacing: '0.5px',
              }}
            >
              {pattern.period}
            </span>
          </div>

          {/* Right: TF toggle pills (multiframe tab) or static label (historical tab) */}
          {hasMultiframe && activeTab === 'multiframe' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span
                style={{
                  color: 'rgba(255,255,255,0.4)',
                  fontFamily: '"Roboto Mono","Courier New",monospace',
                  fontSize: '10px',
                  letterSpacing: '1.5px',
                  textTransform: 'uppercase',
                  marginRight: '4px',
                }}
              >
                Timeframes
              </span>
              {(multiframeYears as number[]).slice().sort((a, b) => a - b).map((tf) => {
                const color = TF_COLORS[tf] ?? TF_COLOR_FALLBACK[(multiframeYears as number[]).indexOf(tf) % TF_COLOR_FALLBACK.length];
                const active = enabledTFs.has(tf);
                return (
                  <button
                    key={tf}
                    onClick={() => toggleTF(tf)}
                    style={{
                      padding: '5px 13px',
                      fontFamily: '"Roboto Mono","Courier New",monospace',
                      fontSize: '12px',
                      fontWeight: '900',
                      letterSpacing: '1px',
                      border: `2px solid ${active ? color : 'rgba(255,255,255,0.18)'}`,
                      borderRadius: '4px',
                      background: active ? `${color}1a` : 'transparent',
                      color: active ? color : 'rgba(255,255,255,0.35)',
                      cursor: 'pointer',
                      boxShadow: active ? `0 0 12px ${color}44` : 'none',
                      transition: 'all 0.15s ease',
                      position: 'relative',
                      overflow: 'hidden',
                    }}
                  >
                    {/* Underline indicator when active */}
                    {active && (
                      <span
                        style={{
                          position: 'absolute',
                          bottom: 0,
                          left: 0,
                          right: 0,
                          height: '2px',
                          background: color,
                          boxShadow: `0 0 6px ${color}`,
                        }}
                      />
                    )}
                    {tf}Y
                  </button>
                );
              })}
            </div>
          ) : (
            <span
              style={{
                color: 'rgba(255,255,255,0.38)',
                fontFamily: '"Roboto Mono","Courier New",monospace',
                fontSize: '12px',
                letterSpacing: '0.5px',
              }}
            >
              {years} Year Historical Lines
            </span>
          )}
        </div>

        {/* â”€â”€ CONTENT â”€â”€ */}
        <div style={{ padding: '20px 24px 24px', flex: 1 }}>
          {/* Loading / Error */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px', color: '#999999', fontFamily: 'monospace' }}>
              Loading seasonal data...
            </div>
          ) : error ? (
            <div style={{ textAlign: 'center', padding: '60px', color: '#FF4444', fontFamily: 'monospace' }}>
              {error}
            </div>
          ) : (

            /* â”€â”€ MULTI-TF AVERAGES TAB â”€â”€ */
            activeTab === 'multiframe' && hasMultiframe ? (
              <>
                {tfAvgLines.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '60px', color: '#999999', fontFamily: 'monospace' }}>
                    No multi-timeframe data available
                  </div>
                ) : (
                  <svg width={chartWidth} height={chartHeight} style={{ display: 'block', margin: '0 auto', maxWidth: '100%' }}>
                    {/* Grid lines */}
                    {[...Array(5)].map((_, i) => {
                      const y = padding.top + (plotHeight / 4) * i;
                      const value = tfMaxReturn - (tfReturnRange / 4) * i;
                      return (
                        <g key={`tf-grid-${i}`}>
                          <line x1={padding.left} y1={y} x2={chartWidth - padding.right} y2={y}
                            stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
                          <text x={padding.left - 10} y={y + 4} fill="rgba(255,255,255,0.75)" fontSize="11"
                            fontFamily="monospace" textAnchor="end" fontWeight="bold">
                            {value.toFixed(1)}%
                          </text>
                        </g>
                      );
                    })}

                    {/* X-axis day markers */}
                    {[...Array(6)].map((_, i) => {
                      const dayNum = Math.floor((tfMaxDays / 5) * i);
                      const x = tfXScale(dayNum);
                      return (
                        <g key={`tf-x-${i}`}>
                          <line x1={x} y1={chartHeight - padding.bottom} x2={x}
                            y2={chartHeight - padding.bottom + 5} stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
                          <text x={x} y={chartHeight - padding.bottom + 18} fill="rgba(255,255,255,0.65)" fontSize="11"
                            fontFamily="monospace" textAnchor="middle" fontWeight="bold">
                            {dayNum}
                          </text>
                        </g>
                      );
                    })}

                    {/* Zero line */}
                    {tfMinReturn < 0 && tfMaxReturn > 0 && (
                      <line x1={padding.left} y1={tfYScale(0)} x2={chartWidth - padding.right}
                        y2={tfYScale(0)} stroke="rgba(255,255,255,0.22)" strokeWidth="1.5" strokeDasharray="4,4" />
                    )}

                    {/* Per-timeframe average lines */}
                    {(() => {
                      const sorted = [...visibleTFLines].sort((a, b) => b.totalReturn - a.totalReturn);
                      return sorted.map((tfLine, idx) => {
                        const labelY = sorted.length === 1
                          ? padding.top + plotHeight / 2
                          : padding.top + (idx * plotHeight / Math.max(sorted.length - 1, 1));
                        const lastPt = tfLine.avgLine[tfLine.avgLine.length - 1];
                        const lastX = tfXScale(lastPt.dayOffset);
                        const lastY = tfYScale(lastPt.value);
                        const pathData = tfLine.avgLine.map((pt, i) =>
                          `${i === 0 ? 'M' : 'L'} ${tfXScale(pt.dayOffset)} ${tfYScale(pt.value)}`
                        ).join(' ');
                        return (
                          <g key={`tf-line-${tfLine.tf}`}>
                            {/* Glow layer */}
                            <path d={pathData} fill="none" stroke={tfLine.color} strokeWidth="6" opacity="0.12" />
                            {/* Main line */}
                            <path d={pathData} fill="none" stroke={tfLine.color} strokeWidth="2.5" opacity="0.97" />
                            {/* Connector */}
                            <line x1={lastX} y1={lastY} x2={chartWidth - padding.right + 5}
                              y2={labelY} stroke={tfLine.color} strokeWidth="1" strokeDasharray="2,3" opacity="0.4" />
                            {/* Label */}
                            <text x={chartWidth - padding.right + 10} y={labelY}
                              fill={tfLine.color} fontSize="12" fontFamily="monospace" fontWeight="bold">
                              {tfLine.tf}Y Avg: {tfLine.totalReturn >= 0 ? '+' : ''}{tfLine.totalReturn.toFixed(1)}%
                            </text>
                          </g>
                        );
                      });
                    })()}

                    {/* Axis labels */}
                    <text x={chartWidth / 2} y={chartHeight - 8} fill="rgba(255,255,255,0.45)" fontSize="12"
                      fontFamily="monospace" textAnchor="middle" fontWeight="bold">
                      Days in Seasonal Period
                    </text>
                    <text x={12} y={chartHeight / 2} fill="rgba(255,255,255,0.45)" fontSize="12"
                      fontFamily="monospace" textAnchor="middle" fontWeight="bold"
                      transform={`rotate(-90, 12, ${chartHeight / 2})`}>
                      Return %
                    </text>
                  </svg>
                )}

                {/* Legend */}
                {tfAvgLines.length > 0 && (
                  <div style={{ marginTop: '20px', display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'center' }}>
                    {tfAvgLines.slice().sort((a, b) => a.tf - b.tf).map((tfLine) => {
                      const active = enabledTFs.has(tfLine.tf);
                      return (
                        <button
                          key={`tf-legend-${tfLine.tf}`}
                          onClick={() => toggleTF(tfLine.tf)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            padding: '6px 16px',
                            background: active ? `${tfLine.color}12` : 'rgba(255,255,255,0.03)',
                            borderRadius: '4px',
                            border: `2px solid ${active ? tfLine.color : 'rgba(255,255,255,0.15)'}`,
                            boxShadow: active ? `0 0 10px ${tfLine.color}33` : 'none',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                            opacity: active ? 1 : 0.45,
                          }}>
                          <div style={{ width: '26px', height: '3px', background: active ? tfLine.color : 'rgba(255,255,255,0.3)', borderRadius: '2px' }} />
                          <span style={{ color: active ? tfLine.color : 'rgba(255,255,255,0.4)', fontFamily: 'monospace', fontSize: '13px', fontWeight: 'bold' }}>
                            {tfLine.tf}Y Avg — {tfLine.totalReturn >= 0 ? '+' : ''}{tfLine.totalReturn.toFixed(1)}%
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (

              /* â”€â”€ HISTORICAL LINES TAB â”€â”€ */
              lineData.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px', color: '#999999', fontFamily: 'monospace' }}>
                  No data available
                </div>
              ) : (
                <>
                  <svg width={chartWidth} height={chartHeight} style={{ display: 'block', margin: '0 auto', maxWidth: '100%' }}>
                    {/* Grid lines */}
                    {[...Array(5)].map((_, i) => {
                      const y = padding.top + (plotHeight / 4) * i;
                      const value = maxReturn - (returnRange / 4) * i;
                      return (
                        <g key={`grid-${i}`}>
                          <line x1={padding.left} y1={y} x2={chartWidth - padding.right} y2={y}
                            stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
                          <text x={padding.left - 10} y={y + 4} fill="rgba(255,255,255,0.75)" fontSize="11"
                            fontFamily="monospace" textAnchor="end" fontWeight="bold">
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
                          <line x1={x} y1={chartHeight - padding.bottom} x2={x}
                            y2={chartHeight - padding.bottom + 5} stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
                          <text x={x} y={chartHeight - padding.bottom + 18} fill="rgba(255,255,255,0.65)" fontSize="11"
                            fontFamily="monospace" textAnchor="middle" fontWeight="bold">
                            {dayNum}
                          </text>
                        </g>
                      );
                    })}

                    {/* Zero line */}
                    {minReturn < 0 && maxReturn > 0 && (
                      <line x1={padding.left} y1={yScale(0)} x2={chartWidth - padding.right}
                        y2={yScale(0)} stroke="rgba(255,255,255,0.22)" strokeWidth="1.5" strokeDasharray="4,4" />
                    )}

                    {/* Seasonal lines */}
                    {(() => {
                      const totalLines = lineData.length;
                      const sortedByReturn = [...lineData].sort((a, b) => b.totalReturn - a.totalReturn);
                      const labelPositions = sortedByReturn.map((line, idx) => {
                        const labelY = totalLines === 1
                          ? padding.top + plotHeight / 2
                          : padding.top + (idx * plotHeight / Math.max(1, totalLines - 1));
                        const lastPoint = line.data[line.data.length - 1];
                        return {
                          ...line,
                          labelY,
                          endX: xScale(lastPoint.dayOffset),
                          endY: yScale(lastPoint.value),
                        };
                      });
                      return labelPositions.map((yearLine, idx) => {
                        const pathData = yearLine.data.map((point, i) =>
                          `${i === 0 ? 'M' : 'L'} ${xScale(point.dayOffset)} ${yScale(point.value)}`
                        ).join(' ');
                        return (
                          <g key={`line-${idx}`}>
                            <path d={pathData} fill="none" stroke={yearLine.color} strokeWidth="2" opacity="0.82" />
                            <line x1={yearLine.endX} y1={yearLine.endY}
                              x2={chartWidth - padding.right + 5} y2={yearLine.labelY}
                              stroke={yearLine.color} strokeWidth="1" strokeDasharray="2,3" opacity="0.38" />
                            <text x={chartWidth - padding.right + 10} y={yearLine.labelY}
                              fill={yearLine.color} fontSize="11" fontFamily="monospace" fontWeight="bold">
                              {yearLine.year}: {yearLine.totalReturn >= 0 ? '+' : ''}{yearLine.totalReturn.toFixed(1)}%
                            </text>
                          </g>
                        );
                      });
                    })()}

                    {/* Axis labels */}
                    <text x={chartWidth / 2} y={chartHeight - 8} fill="rgba(255,255,255,0.45)" fontSize="12"
                      fontFamily="monospace" textAnchor="middle" fontWeight="bold">
                      Days in Seasonal Period
                    </text>
                    <text x={12} y={chartHeight / 2} fill="rgba(255,255,255,0.45)" fontSize="12"
                      fontFamily="monospace" textAnchor="middle" fontWeight="bold"
                      transform={`rotate(-90, 12, ${chartHeight / 2})`}>
                      Return %
                    </text>
                  </svg>

                  {/* Legend */}
                  <div style={{ marginTop: '20px', display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'center' }}>
                    {lineData.map((yearLine, idx) => (
                      <div key={`legend-${idx}`}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '6px',
                          padding: '4px 10px',
                          background: 'rgba(255,255,255,0.04)',
                          borderRadius: '4px',
                          border: `1px solid ${yearLine.color}80`,
                        }}>
                        <div style={{ width: '20px', height: '2px', background: yearLine.color }} />
                        <span style={{ color: yearLine.color, fontFamily: 'monospace', fontSize: '11px', fontWeight: 'bold' }}>
                          {yearLine.year}: {yearLine.totalReturn >= 0 ? '+' : ''}{yearLine.totalReturn.toFixed(1)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )
            )
          )}
        </div>
      </div>
    </div>
  );
};

export default SeasonalLineChartModal;

