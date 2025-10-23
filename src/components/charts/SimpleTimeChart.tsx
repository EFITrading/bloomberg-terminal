"use client";

import React, { useState, useRef, useCallback, useEffect } from 'react';

interface DataPoint {
 time: string;
 value: number;
}

interface SimpleTimeChartProps {
 width?: number;
 height?: number;
 data?: DataPoint[];
 title?: string;
 ticker?: string;
 showIV?: boolean;
}

interface TooltipData {
 x: number;
 y: number;
 time: string;
 value: number;
 visible: boolean;
}

interface ZoomState {
 scale: number;
 translateX: number;
 translateY: number;
}

const SimpleTimeChart: React.FC<SimpleTimeChartProps> = ({ 
 width = 600, 
 height = 400, 
 data,
 title = "Performance Chart",
 ticker = "SPY",
 showIV = false
}) => {
 // Define margin and chart dimensions early
 const margin = { top: 60, right: 60, bottom: 80, left: 80 };
 const chartWidth = width - margin.left - margin.right;
 const chartHeight = height - margin.top - margin.bottom;

 // All hooks must be declared before any conditional returns
 const svgRef = useRef<SVGSVGElement>(null);
 const [tooltip, setTooltip] = useState<TooltipData>({
 x: 0, y: 0, time: '', value: 0, visible: false
 });
 const [zoom, setZoom] = useState<ZoomState>({
 scale: 1,
 translateX: 0,
 translateY: 0
 });
 const [isDragging, setIsDragging] = useState(false);
 const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
 const [ivData, setIvData] = useState<DataPoint[]>([]);
 const [loading, setLoading] = useState(false);
 const [error, setError] = useState<string | null>(null);

 // Fetch IV data from Polygon
 const fetchIVData = useCallback(async () => {
 if (!showIV) return;
 
 setLoading(true);
 setError(null);
 
 try {
 console.log(` Fetching IV data for ${ticker}...`);
 const response = await fetch(`/api/options-chain?ticker=${ticker}`);
 const result = await response.json();
 
 if (!result.success || !result.data) {
 throw new Error('Failed to fetch options data');
 }

 console.log('Options data structure:', Object.keys(result.data).slice(0, 2).map(key => ({
 expDate: key,
 structure: {
 calls: Array.isArray(result.data[key].calls) ? `Array(${result.data[key].calls.length})` : typeof result.data[key].calls,
 puts: Array.isArray(result.data[key].puts) ? `Array(${result.data[key].puts.length})` : typeof result.data[key].puts
 }
 })));
 
 // Calculate average IV for each expiration date
 const ivByExpiration: DataPoint[] = [];
 let debugCount = 0;
 
 Object.entries(result.data).forEach(([expDate, expData]: [string, any]) => {
 // Convert object structure to arrays
 const calls = expData.calls ? Object.values(expData.calls) : [];
 const puts = expData.puts ? Object.values(expData.puts) : [];
 const allOptions = [...calls, ...puts];
 
 console.log(` ${expDate}: calls=${calls.length}, puts=${puts.length}, total=${allOptions.length}`);
 
 // Debug: Check what fields are available in the first option (only for first 2 expirations)
 if (debugCount < 2) {
 if (allOptions.length > 0) {
 const sampleOption = allOptions[0];
 } else {
 }
 debugCount++;
 }
 
 // Filter options with valid IV data
 const validIVOptions = allOptions.filter((option: any) => 
 option && 
 typeof option.implied_volatility === 'number' &&
 option.implied_volatility > 0 && 
 option.implied_volatility < 5 && // Remove outliers > 500%
 typeof option.open_interest === 'number' &&
 option.open_interest > 0
 );
 
 if (validIVOptions.length > 0) {
 // Calculate weighted average IV by open interest
 const totalOI = validIVOptions.reduce((sum: number, opt: any) => sum + opt.open_interest, 0);
 const weightedIV = validIVOptions.reduce((sum: number, opt: any) => 
 sum + (opt.implied_volatility * opt.open_interest), 0) / totalOI;
 
 // Convert to percentage and format date
 ivByExpiration.push({
 time: expDate,
 value: weightedIV * 100 // Convert to percentage
 });
 
 console.log(` ${expDate}: ${validIVOptions.length} valid options, weighted IV: ${(weightedIV * 100).toFixed(1)}%`);
 } else {
 console.log(` ${expDate}: No valid IV options found`);
 }
 });
 
 // Sort by date and take first 10 expiration dates
 ivByExpiration.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
 const limitedData = ivByExpiration.slice(0, 10);
 
 console.log(` IV Data processed: ${limitedData.length} expiration dates`);
 console.log('IV Range:', limitedData.map(d => d.value.toFixed(1) + '%').join(', '));
 
 setIvData(limitedData);
 } catch (err) {
 console.error(' Error fetching IV data:', err);
 setError(err instanceof Error ? err.message : 'Failed to fetch IV data');
 } finally {
 setLoading(false);
 }
 }, [ticker, showIV]);

 // Determine which data to use - only real IV data when showIV is true
 const chartData = showIV ? ivData : data;

 // Calculate scales based on chartData
 const maxValue = chartData && chartData.length > 0 ? Math.max(...chartData.map(d => d.value)) : 100;
 const minValue = chartData && chartData.length > 0 ? Math.min(...chartData.map(d => d.value)) : 0;
 const valueRange = maxValue - minValue || 1;
 const paddedMax = maxValue + (valueRange * 0.1);
 const paddedMin = Math.max(0, minValue - (valueRange * 0.1));

 // Mouse event handlers - all hooks must be before conditional returns
 const handleMouseMove = useCallback((event: React.MouseEvent<SVGSVGElement>) => {
 if (!svgRef.current || !chartData || chartData.length === 0) return;
 
 const rect = svgRef.current.getBoundingClientRect();
 const mouseX = event.clientX - rect.left - margin.left;
 const mouseY = event.clientY - rect.top - margin.top;
 
 // Handle dragging for pan
 if (isDragging) {
 const deltaX = event.clientX - dragStart.x;
 const deltaY = event.clientY - dragStart.y;
 
 setZoom(prev => ({
 ...prev,
 translateX: prev.translateX + deltaX / zoom.scale,
 translateY: prev.translateY + deltaY / zoom.scale
 }));
 
 setDragStart({ x: event.clientX, y: event.clientY });
 return;
 }
 
 // Check if mouse is within chart area
 if (mouseX < 0 || mouseX > chartWidth || mouseY < 0 || mouseY > chartHeight) {
 setTooltip(prev => ({ ...prev, visible: false }));
 return;
 }
 
 // Find closest data point
 const dataIndex = Math.round((mouseX / chartWidth) * (chartData.length - 1));
 const clampedIndex = Math.max(0, Math.min(chartData.length - 1, dataIndex));
 const point = chartData[clampedIndex];
 
 if (point) {
 const x = (clampedIndex / (chartData.length - 1)) * chartWidth;
 const y = chartHeight - ((point.value - paddedMin) / (paddedMax - paddedMin)) * chartHeight;
 
 setTooltip({
 x: x + margin.left,
 y: y + margin.top,
 time: point.time,
 value: point.value,
 visible: true
 });
 }
 }, [chartData, chartWidth, chartHeight, paddedMax, paddedMin, margin, isDragging, dragStart, zoom.scale]);

 const handleMouseDown = useCallback((event: React.MouseEvent<SVGSVGElement>) => {
 setIsDragging(true);
 setDragStart({ x: event.clientX, y: event.clientY });
 }, []);

 const handleMouseUp = useCallback(() => {
 setIsDragging(false);
 }, []);

 const handleMouseLeave = useCallback(() => {
 setIsDragging(false);
 setTooltip(prev => ({ ...prev, visible: false }));
 }, []);

 // Fetch IV data on component mount or when ticker changes
 useEffect(() => {
 if (showIV) {
 fetchIVData();
 }
 }, [fetchIVData]);

 // Handle wheel events with proper non-passive listener
 useEffect(() => {
 const svg = svgRef.current;
 if (!svg) return;

 const handleWheel = (event: WheelEvent) => {
 event.preventDefault();
 
 const rect = svg.getBoundingClientRect();
 const mouseX = event.clientX - rect.left;
 const mouseY = event.clientY - rect.top;
 
 const scaleFactor = event.deltaY > 0 ? 0.9 : 1.1;
 const newScale = Math.max(0.5, Math.min(5, zoom.scale * scaleFactor));
 
 // Zoom towards mouse position
 const scaleRatio = newScale / zoom.scale;
 const newTranslateX = mouseX - (mouseX - zoom.translateX) * scaleRatio;
 const newTranslateY = mouseY - (mouseY - zoom.translateY) * scaleRatio;
 
 setZoom({
 scale: newScale,
 translateX: newTranslateX,
 translateY: newTranslateY
 });
 };

 svg.addEventListener('wheel', handleWheel, { passive: false });
 
 return () => {
 svg.removeEventListener('wheel', handleWheel);
 };
 }, [zoom.scale, zoom.translateX, zoom.translateY]);

 // Now all conditional returns come after ALL hooks
 console.log(` Chart render: showIV=${showIV}, ivData.length=${ivData.length}, data.length=${data?.length || 0}, loading=${loading}, error=${error}`);
 
 if (showIV && loading) {
 return (
 <div style={{ width, height, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#000', color: '#FF6600' }}>
 <div>Loading IV data for {ticker}...</div>
 </div>
 );
 }
 
 if (showIV && error) {
 return (
 <div style={{ width, height, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#000', color: '#ff4444' }}>
 <div>Error: {error}</div>
 </div>
 );
 }
 
 if (showIV && ivData.length === 0) {
 return (
 <div style={{ width, height, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#000', color: '#FF6600' }}>
 <div>No IV data available for {ticker}</div>
 </div>
 );
 }
 
 if (!chartData || chartData.length === 0) {
 return (
 <div style={{ width, height, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#000', color: '#FF6600' }}>
 <div>No data available</div>
 </div>
 );
 }

 // Generate line path
 const pathData = chartData.map((point, index) => {
 const x = (index / (chartData.length - 1)) * chartWidth;
 const y = chartHeight - ((point.value - paddedMin) / (paddedMax - paddedMin)) * chartHeight;
 return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
 }).join(' ');

 // Chart render JSX
 return (
 <div style={{ position: 'relative', width, height, backgroundColor: '#000' }}>
 {/* Chart */}
 <svg 
 ref={svgRef}
 width={width} 
 height={height} 
 style={{ 
 background: '#000000',
 cursor: isDragging ? 'grabbing' : 'grab'
 }}
 onMouseMove={handleMouseMove}
 onMouseDown={handleMouseDown}
 onMouseUp={handleMouseUp}
 onMouseLeave={handleMouseLeave}
 >
 <g transform={`scale(${zoom.scale}) translate(${zoom.translateX}, ${zoom.translateY})`}>
 {/* Grid lines */}
 <g stroke="#333" strokeWidth="0.5" opacity="0.3">
 {/* Vertical grid lines */}
 {Array.from({ length: 6 }, (_, i) => {
 const x = margin.left + (i * chartWidth / 5);
 return (
 <line 
 key={`vgrid-${i}`}
 x1={x} 
 y1={margin.top} 
 x2={x} 
 y2={margin.top + chartHeight} 
 />
 );
 })}
 {/* Horizontal grid lines */}
 {Array.from({ length: 6 }, (_, i) => {
 const y = margin.top + (i * chartHeight / 5);
 return (
 <line 
 key={`hgrid-${i}`}
 x1={margin.left} 
 y1={y} 
 x2={margin.left + chartWidth} 
 y2={y} 
 />
 );
 })}
 </g>

 {/* X-axis */}
 <line 
 x1={margin.left} 
 y1={margin.top + chartHeight} 
 x2={margin.left + chartWidth} 
 y2={margin.top + chartHeight} 
 stroke="#FF6600" 
 strokeWidth="2"
 />

 {/* Y-axis */}
 <line 
 x1={margin.left} 
 y1={margin.top} 
 x2={margin.left} 
 y2={margin.top + chartHeight} 
 stroke="#FF6600" 
 strokeWidth="2"
 />

 {/* Chart line */}
 <path
 d={pathData}
 fill="none"
 stroke="#FF6600"
 strokeWidth="2"
 transform={`translate(${margin.left}, ${margin.top})`}
 />

 {/* Data points */}
 {chartData.map((point, index) => {
 const x = margin.left + (index / (chartData.length - 1)) * chartWidth;
 const y = margin.top + chartHeight - ((point.value - paddedMin) / (paddedMax - paddedMin)) * chartHeight;
 return (
 <circle
 key={index}
 cx={x}
 cy={y}
 r="3"
 fill="#FF6600"
 stroke="#fff"
 strokeWidth="1"
 />
 );
 })}

 {/* X-axis labels */}
 {chartData.filter((_, i) => i % Math.max(1, Math.floor(chartData.length / 5)) === 0).map((point, index, filteredData) => {
 const originalIndex = chartData.findIndex(p => p === point);
 const x = margin.left + (originalIndex / (chartData.length - 1)) * chartWidth;
 return (
 <text
 key={`xlabel-${originalIndex}`}
 x={x}
 y={margin.top + chartHeight + 20}
 textAnchor="middle"
 fill="#FF6600"
 fontSize="12"
 >
 {point.time}
 </text>
 );
 })}

 {/* Y-axis labels */}
 {Array.from({ length: 6 }, (_, i) => {
 const value = paddedMin + (i * (paddedMax - paddedMin) / 5);
 const y = margin.top + chartHeight - (i * chartHeight / 5);
 return (
 <text
 key={`ylabel-${i}`}
 x={margin.left - 10}
 y={y + 4}
 textAnchor="end"
 fill="#FF6600"
 fontSize="12"
 >
 {showIV ? `${value.toFixed(1)}%` : value.toFixed(2)}
 </text>
 );
 })}

 {/* Title */}
 <text
 x={width / 2}
 y={30}
 textAnchor="middle"
 fill="#FF6600"
 fontSize="16"
 fontWeight="bold"
 >
 {showIV ? `${ticker} Implied Volatility Term Structure` : title}
 </text>
 </g>
 </svg>

 {/* Tooltip */}
 {tooltip.visible && (
 <div
 style={{
 position: 'absolute',
 left: tooltip.x + 10,
 top: tooltip.y - 10,
 background: 'rgba(0, 0, 0, 0.8)',
 color: '#FF6600',
 padding: '8px',
 borderRadius: '4px',
 fontSize: '12px',
 pointerEvents: 'none',
 border: '1px solid #FF6600',
 zIndex: 1000
 }}
 >
 <div>{tooltip.time}</div>
 <div>{showIV ? `${tooltip.value.toFixed(2)}%` : tooltip.value.toFixed(2)}</div>
 </div>
 )}
 </div>
 );
};

export default SimpleTimeChart;