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
 console.log(` DEBUG ${expDate} - No options found. ExpData structure:`, {
 hasCallsArray: Array.isArray(expData.calls),
 hasPutsArray: Array.isArray(expData.puts),
 callsType: typeof expData.calls,
 putsType: typeof expData.puts,
 expDataKeys: Object.keys(expData)
 });
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

 // Mouse event handlers
 const handleMouseMove = useCallback((event: React.MouseEvent<SVGSVGElement>) => {
 if (!svgRef.current) return;
 
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
 setTooltip(prev => ({ ...prev, visible: false }));
 setIsDragging(false);
 }, []);

 const resetZoom = useCallback(() => {
 setZoom({ scale: 1, translateX: 0, translateY: 0 });
 }, []);
 
 // Create path for the line
 const pathData = chartData.length > 0 ? chartData.map((point, index) => {
 const x = (index / Math.max(1, chartData.length - 1)) * chartWidth;
 const y = chartHeight - ((point.value - paddedMin) / (paddedMax - paddedMin)) * chartHeight;
 return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
 }).join(' ') : '';

 // Y-axis ticks
 const yTicks = 6;
 const yTickValues = Array.from({ length: yTicks }, (_, i) => {
 return paddedMin + (i / (yTicks - 1)) * (paddedMax - paddedMin);
 });

 // X-axis ticks (show every 2nd point for IV data, every 3rd for time data)
 const tickInterval = showIV ? 2 : 3;
 const xTickIndices = chartData.map((_, i) => i).filter(i => i % tickInterval === 0 || i === chartData.length - 1);

 return (
 <div style={{ 
 background: '#000000',
 padding: '20px',
 borderRadius: '8px',
 border: '1px solid #333333',
 position: 'relative'
 }}>
 <h3 style={{ 
 color: '#FF6600', 
 textAlign: 'center', 
 margin: '0 0 20px 0',
 fontSize: '18px',
 fontWeight: '600'
 }}>
 {title}
 </h3>

 {/* Loading/Error States */}
 {loading && (
 <div style={{
 position: 'absolute',
 top: '50%',
 left: '50%',
 transform: 'translate(-50%, -50%)',
 color: '#FF6600',
 fontSize: '14px',
 fontWeight: '600'
 }}>
 Loading IV data...
 </div>
 )}

 {error && (
 <div style={{
 position: 'absolute',
 top: '50%',
 left: '50%',
 transform: 'translate(-50%, -50%)',
 color: '#FF4444',
 fontSize: '14px',
 textAlign: 'center'
 }}>
 Error: {error}
 </div>
 )}

 {/* Chart */}
 {!loading && !error && (
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
 {/* Grid lines */}
 <defs>
 <pattern id="grid" width={chartWidth/6} height={chartHeight/6} patternUnits="userSpaceOnUse">
 <path 
 d={`M ${chartWidth/6} 0 L 0 0 0 ${chartHeight/6}`} 
 fill="none" 
 stroke="#222222" 
 strokeWidth="0.5"
 />
 </pattern>
 </defs>
 
 <g 
 transform={`translate(${margin.left + zoom.translateX}, ${margin.top + zoom.translateY}) scale(${zoom.scale})`}
 style={{ transformOrigin: '0 0' }}
 >
 {/* Grid */}
 <rect width={chartWidth} height={chartHeight} fill="url(#grid)" />
 
 {/* Y-axis */}
 <line 
 x1={0} 
 y1={0} 
 x2={0} 
 y2={chartHeight} 
 stroke="#666666" 
 strokeWidth="2"
 />
 
 {/* X-axis */}
 <line 
 x1={0} 
 y1={chartHeight} 
 x2={chartWidth} 
 y2={chartHeight} 
 stroke="#666666" 
 strokeWidth="2"
 />
 
 {/* Y-axis ticks and labels */}
 {yTickValues.map((value, index) => {
 const y = chartHeight - (index / (yTicks - 1)) * chartHeight;
 return (
 <g key={index}>
 <line 
 x1={-5} 
 y1={y} 
 x2={0} 
 y2={y} 
 stroke="#666666" 
 strokeWidth="1"
 />
 <text 
 x={-10} 
 y={y + 4} 
 fill="#CCCCCC" 
 fontSize="12" 
 textAnchor="end"
 fontFamily="Inter, monospace"
 >
 {value.toFixed(1)}%
 </text>
 </g>
 );
 })}
 
 {/* X-axis ticks and labels */}
 {xTickIndices.map((dataIndex) => {
 const x = (dataIndex / Math.max(1, chartData.length - 1)) * chartWidth;
 return (
 <g key={dataIndex}>
 <line 
 x1={x} 
 y1={chartHeight} 
 x2={x} 
 y2={chartHeight + 5} 
 stroke="#666666" 
 strokeWidth="1"
 />
 <text 
 x={x} 
 y={chartHeight + 20} 
 fill="#CCCCCC" 
 fontSize="12" 
 textAnchor="middle"
 fontFamily="Inter, monospace"
 >
 {showIV ? 
 new Date(chartData[dataIndex]?.time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) :
 chartData[dataIndex]?.time
 }
 </text>
 </g>
 );
 })}
 
 {/* Data line */}
 {pathData && (
 <path 
 d={pathData} 
 fill="none" 
 stroke="#FF6600" 
 strokeWidth="2"
 strokeLinecap="round"
 strokeLinejoin="round"
 />
 )}
 
 {/* Data points with hover effects */}
 {chartData.map((point, index) => {
 const x = (index / Math.max(1, chartData.length - 1)) * chartWidth;
 const y = chartHeight - ((point.value - paddedMin) / (paddedMax - paddedMin)) * chartHeight;
 return (
 <circle 
 key={index}
 cx={x} 
 cy={y} 
 r="3" 
 fill="#FF6600" 
 stroke="#000000" 
 strokeWidth="1"
 style={{ 
 cursor: 'pointer',
 transition: 'r 0.1s ease'
 }}
 onMouseEnter={() => {
 // Increase radius on hover
 const circle = document.querySelector(`circle[cx="${x}"][cy="${y}"]`) as SVGCircleElement;
 if (circle) circle.setAttribute('r', '5');
 }}
 onMouseLeave={() => {
 // Reset radius
 const circle = document.querySelector(`circle[cx="${x}"][cy="${y}"]`) as SVGCircleElement;
 if (circle) circle.setAttribute('r', '3');
 }}
 />
 );
 })}
 </g>
 
 {/* Axis labels */}
 <text 
 x={width / 2} 
 y={height - 20} 
 fill="#CCCCCC" 
 fontSize="14" 
 textAnchor="middle"
 fontWeight="600"
 fontFamily="Inter, sans-serif"
 >
 {showIV ? 'Expiration Date' : 'Time'}
 </text>
 
 <text 
 x={20} 
 y={height / 2} 
 fill="#CCCCCC" 
 fontSize="14" 
 textAnchor="middle"
 fontWeight="600"
 fontFamily="Inter, sans-serif"
 transform={`rotate(-90, 20, ${height / 2})`}
 >
 {showIV ? 'Implied Volatility (%)' : 'Percentage (%)'}
 </text>
 </svg>
 )}

 {/* Tooltip */}
 {tooltip.visible && (
 <div
 style={{
 position: 'absolute',
 left: tooltip.x + 10,
 top: tooltip.y - 10,
 background: 'rgba(0, 0, 0, 0.9)',
 border: '1px solid #FF6600',
 borderRadius: '4px',
 padding: '8px 12px',
 color: '#FFFFFF',
 fontSize: '12px',
 fontFamily: 'Inter, monospace',
 pointerEvents: 'none',
 zIndex: 1000,
 boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)'
 }}
 >
 <div style={{ color: '#FF6600', fontWeight: '600' }}>
 {showIV ? 'Expiration' : 'Time'}: {showIV ? 
 new Date(tooltip.time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) :
 tooltip.time
 }
 </div>
 <div>
 {showIV ? 'IV' : 'Value'}: {tooltip.value.toFixed(2)}%
 </div>
 </div>
 )}

 {/* Instructions */}
 <div style={{
 marginTop: '10px',
 fontSize: '11px',
 color: '#444444',
 textAlign: 'center',
 fontFamily: 'Inter, sans-serif'
 }}>
 Scroll to zoom • Click and drag to pan • Hover for details
 </div>
 </div>
 );
};

export default SimpleTimeChart;