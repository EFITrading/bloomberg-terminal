'use client';

import React, { useState, useEffect, useRef } from 'react';
import * as d3 from 'd3';
import GEXChart from './GEXChart';

interface OptionsData {
 strike: number;
 openInterest: number;
 type: 'call' | 'put';
}

interface OpenInterestChartProps {
 selectedTicker?: string;
 onTickerChange?: (ticker: string) => void;
 onExpirationChange?: (expiration: string) => void;
 hideTickerInput?: boolean;
 compactMode?: boolean;
}

export default function OpenInterestChart({ 
 selectedTicker: propTicker, 
 onTickerChange, 
 onExpirationChange,
 hideTickerInput = false,
 compactMode = false
}: OpenInterestChartProps) {
 const [selectedTicker, setSelectedTicker] = useState<string>(propTicker || 'SPY');
 const [tickerInput, setTickerInput] = useState<string>(propTicker || 'SPY');
 const [selectedExpiration, setSelectedExpiration] = useState<string>('');
 const [showAllDates, setShowAllDates] = useState<boolean>(false);
 const [expirationDates, setExpirationDates] = useState<string[]>([]);
 const [data, setData] = useState<OptionsData[]>([]);
 const [loading, setLoading] = useState(false);
 const [error, setError] = useState<string>('');
 const [isMobile, setIsMobile] = useState<boolean>(false);
 const [zoomTransform, setZoomTransform] = useState<any>(null);
 const [currentPrice, setCurrentPrice] = useState<number>(0);
 
 // Sync with prop changes and notify parent
 useEffect(() => {
 if (propTicker && propTicker !== selectedTicker) {
 setSelectedTicker(propTicker);
 setTickerInput(propTicker);
 }
 }, [propTicker]);

 // Notify parent when ticker changes
 useEffect(() => {
 if (onTickerChange && selectedTicker) {
 onTickerChange(selectedTicker);
 }
 }, [selectedTicker, onTickerChange]);

 // Notify parent when expiration changes
 useEffect(() => {
 if (onExpirationChange && selectedExpiration) {
 onExpirationChange(selectedExpiration);
 }
 }, [selectedExpiration, onExpirationChange]);
 
 // Toggle states for chart visibility
 const [showCalls, setShowCalls] = useState<boolean>(true);
 const [showPuts, setShowPuts] = useState<boolean>(true);
 const [showNetOI, setShowNetOI] = useState<boolean>(false);
 const [showPositiveGamma, setShowPositiveGamma] = useState<boolean>(true);
 const [showNegativeGamma, setShowNegativeGamma] = useState<boolean>(true);
 const [oiDropdownOpen, setOiDropdownOpen] = useState<boolean>(false);
 const [gexDropdownOpen, setGexDropdownOpen] = useState<boolean>(false);
 const [expectedRangePCRatio, setExpectedRangePCRatio] = useState<string>('');
 const [cumulativePCRatio45Days, setCumulativePCRatio45Days] = useState<string>('');
 const [expectedRange80, setExpectedRange80] = useState<{call: number, put: number} | null>(null);
 
 const svgRef = useRef<SVGSVGElement>(null);

 // Mobile detection
 useEffect(() => {
 const checkMobile = () => {
 setIsMobile(window.innerWidth <= 768);
 };
 
 checkMobile();
 window.addEventListener('resize', checkMobile);
 return () => window.removeEventListener('resize', checkMobile);
 }, []);

 // Black-Scholes helper functions for Expected Range
 const normalCDF = (x: number): number => {
 return 0.5 * (1 + erf(x / Math.sqrt(2)));
 };

 const erf = (x: number): number => {
 const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
 const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
 const sign = x >= 0 ? 1 : -1;
 x = Math.abs(x);
 const t = 1.0 / (1.0 + p * x);
 const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
 return sign * y;
 };

 const calculateD2 = (S: number, K: number, r: number, sigma: number, T: number): number => {
 const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
 return d1 - sigma * Math.sqrt(T);
 };

 const chanceOfProfitSellCall = (S: number, K: number, r: number, sigma: number, T: number): number => {
 const d2 = calculateD2(S, K, r, sigma, T);
 return (1 - normalCDF(d2)) * 100;
 };

 const chanceOfProfitSellPut = (S: number, K: number, r: number, sigma: number, T: number): number => {
 const d2 = calculateD2(S, K, r, sigma, T);
 return normalCDF(d2) * 100;
 };

 const findStrikeForProbability = (S: number, r: number, sigma: number, T: number, targetProb: number, isCall: boolean): number => {
 if (isCall) {
 let low = S + 0.01, high = S * 1.50;
 for (let i = 0; i < 50; i++) {
 const mid = (low + high) / 2;
 const prob = chanceOfProfitSellCall(S, mid, r, sigma, T);
 if (Math.abs(prob - targetProb) < 0.1) return mid;
 if (prob < targetProb) low = mid; else high = mid;
 }
 return (low + high) / 2;
 } else {
 let low = S * 0.50, high = S - 0.01;
 for (let i = 0; i < 50; i++) {
 const mid = (low + high) / 2;
 const prob = chanceOfProfitSellPut(S, mid, r, sigma, T);
 if (Math.abs(prob - targetProb) < 0.1) return mid;
 if (prob < targetProb) high = mid; else low = mid;
 }
 return (low + high) / 2;
 }
 };

 // Calculate Expected Range and P/C Ratio
 useEffect(() => {
 if (!selectedTicker || !selectedExpiration || !currentPrice || data.length === 0) {
 setExpectedRangePCRatio('');
 setExpectedRange80(null);
 return;
 }

 const calculateExpectedRangePCRatio = async () => {
 try {
 // Get IV from options chain
 const response = await fetch(`/api/options-chain?ticker=${selectedTicker}&expiration=${selectedExpiration}`);
 const result = await response.json();
 
 if (!result.success || !result.data || !result.data[selectedExpiration]) {
 setExpectedRangePCRatio('N/A');
 return;
 }

 const expData = result.data[selectedExpiration];
 
 // Calculate average IV from ATM options
 const atmStrike = Object.keys(expData.calls || {})
 .map(Number)
 .reduce((prev, curr) => Math.abs(curr - currentPrice) < Math.abs(prev - currentPrice) ? curr : prev);
 
 const callIV = expData.calls?.[atmStrike]?.implied_volatility || 0.3;
 const putIV = expData.puts?.[atmStrike]?.implied_volatility || 0.3;
 const avgIV = (callIV + putIV) / 2;

 // Calculate time to expiry
 const expDate = new Date(selectedExpiration + 'T16:00:00');
 const now = new Date();
 const daysToExpiry = Math.max(1, Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
 const T = daysToExpiry / 365;

 const r = 0.0387; // Risk-free rate

 // Calculate 90% expected range
 const call90 = findStrikeForProbability(currentPrice, r, avgIV, T, 90, true);
 const put90 = findStrikeForProbability(currentPrice, r, avgIV, T, 90, false);

 // Calculate 80% expected range for chart lines
 const call80 = findStrikeForProbability(currentPrice, r, avgIV, T, 80, true);
 const put80 = findStrikeForProbability(currentPrice, r, avgIV, T, 80, false);

 setExpectedRange80({ call: call80, put: put80 });

 console.log(`90% Expected Range: $${put90.toFixed(2)} - $${call90.toFixed(2)}`);
 console.log(`80% Expected Range: $${put80.toFixed(2)} - $${call80.toFixed(2)}`);

 // Calculate P/C ratio for OI within range
 let totalCallOI = 0;
 let totalPutOI = 0;

 data.forEach(item => {
 if (item.strike >= put90 && item.strike <= call90) {
 if (item.type === 'call') {
 totalCallOI += item.openInterest;
 } else if (item.type === 'put') {
 totalPutOI += item.openInterest;
 }
 }
 });

 console.log(`OI in range - Calls: ${totalCallOI}, Puts: ${totalPutOI}`);

 if (totalCallOI === 0 && totalPutOI === 0) {
 setExpectedRangePCRatio('N/A');
 } else if (totalCallOI === 0) {
 setExpectedRangePCRatio('∞ (No Calls)');
 } else {
 const ratio = totalPutOI / totalCallOI;
 setExpectedRangePCRatio(`${ratio.toFixed(2)} (${put90.toFixed(0)}-${call90.toFixed(0)})`);
 }
 } catch (error) {
 console.error('Error calculating Expected Range P/C Ratio:', error);
 setExpectedRangePCRatio('Error');
 setExpectedRange80(null);
 }
 };

 calculateExpectedRangePCRatio();
 }, [selectedTicker, selectedExpiration, currentPrice, data]);

 // Calculate 45-Day Cumulative P/C Ratio
 useEffect(() => {
 if (!selectedTicker || !currentPrice || expirationDates.length === 0) {
 setCumulativePCRatio45Days('');
 return;
 }

 const calculate45DayPCRatio = async () => {
 try {
 const now = new Date();
 const maxDate = new Date(now.getTime() + (45 * 24 * 60 * 60 * 1000));

 // Filter expiration dates within 45 days
 const validExpirations = expirationDates.filter(exp => {
 const expDate = new Date(exp + 'T16:00:00');
 return expDate >= now && expDate <= maxDate;
 }).sort();

 if (validExpirations.length === 0) {
 setCumulativePCRatio45Days('N/A');
 return;
 }

 console.log(`Calculating 45-day P/C ratio for ${validExpirations.length} expirations:`, validExpirations);

 let totalCallOI = 0;
 let totalPutOI = 0;
 let expCount = 0;

 // Fetch and accumulate OI for each expiration
 for (const exp of validExpirations) {
 try {
 const response = await fetch(`/api/options-chain?ticker=${selectedTicker}&expiration=${exp}`);
 const result = await response.json();

 if (result.success && result.data && result.data[exp]) {
 const expData = result.data[exp];

 // Calculate average IV for this expiration
 const atmStrike = Object.keys(expData.calls || {})
 .map(Number)
 .reduce((prev, curr) => Math.abs(curr - currentPrice) < Math.abs(prev - currentPrice) ? curr : prev);

 const callIV = expData.calls?.[atmStrike]?.implied_volatility || 0.3;
 const putIV = expData.puts?.[atmStrike]?.implied_volatility || 0.3;
 const avgIV = (callIV + putIV) / 2;

 // Calculate time to expiry
 const expDate = new Date(exp + 'T16:00:00');
 const daysToExpiry = Math.max(1, Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
 const T = daysToExpiry / 365;
 const r = 0.0387;

 // Calculate 90% expected range for this expiration
 const call90 = findStrikeForProbability(currentPrice, r, avgIV, T, 90, true);
 const put90 = findStrikeForProbability(currentPrice, r, avgIV, T, 90, false);

 // Accumulate OI within range
 if (expData.calls) {
 Object.entries(expData.calls).forEach(([strike, callData]: [string, any]) => {
 const strikeNum = parseFloat(strike);
 if (strikeNum >= put90 && strikeNum <= call90) {
 totalCallOI += callData.open_interest || 0;
 }
 });
 }

 if (expData.puts) {
 Object.entries(expData.puts).forEach(([strike, putData]: [string, any]) => {
 const strikeNum = parseFloat(strike);
 if (strikeNum >= put90 && strikeNum <= call90) {
 totalPutOI += putData.open_interest || 0;
 }
 });
 }

 expCount++;
 }
 } catch (error) {
 console.error(`Error fetching data for ${exp}:`, error);
 }
 }

 console.log(`45-day totals - Calls: ${totalCallOI}, Puts: ${totalPutOI} (${expCount} expirations)`);

 if (totalCallOI === 0 && totalPutOI === 0) {
 setCumulativePCRatio45Days('N/A');
 } else if (totalCallOI === 0) {
 setCumulativePCRatio45Days('∞ (No Calls)');
 } else {
 const ratio = totalPutOI / totalCallOI;
 setCumulativePCRatio45Days(`${ratio.toFixed(2)} (${expCount} exp)`);
 }
 } catch (error) {
 console.error('Error calculating 45-day cumulative P/C Ratio:', error);
 setCumulativePCRatio45Days('Error');
 }
 };

 calculate45DayPCRatio();
 }, [selectedTicker, currentPrice, expirationDates]);

 // Fetch available expiration dates
 useEffect(() => {
 if (!selectedTicker) return;
 
 const fetchExpirations = async () => {
 try {
 setLoading(true);
 const response = await fetch(`/api/options-chain?ticker=${selectedTicker}`);
 const result = await response.json();
 
 if (result.success && result.data) {
 const dates = Object.keys(result.data).sort();
 setExpirationDates(dates);
 
 console.log('Available expiration dates:', dates);
 console.log('Current selectedExpiration:', selectedExpiration);
 console.log('API result data keys:', Object.keys(result.data));
 
 // Extract current price from API response
 if (result.currentPrice) {
 setCurrentPrice(result.currentPrice);
 }
 
 if (dates.length > 0) {
 console.log('Setting selectedExpiration to first available:', dates[0]);
 // In compact mode, auto-select first expiration immediately
 // In regular mode, use setTimeout to ensure state update happens
 if (compactMode) {
 setSelectedExpiration(dates[0]);
 } else {
 setTimeout(() => {
 setSelectedExpiration(dates[0]);
 }, 100);
 }
 }
 } else {
 console.error('API call failed or no data:', result);
 setError('No data received from API');
 }
 } catch (err) {
 setError('Failed to fetch expiration dates');
 console.error('Error fetching expirations:', err);
 } finally {
 setLoading(false);
 }
 };

 fetchExpirations();
 }, [selectedTicker, compactMode]); // Include compactMode to ensure proper initialization

 // Fetch options data for selected expiration or all dates
 useEffect(() => {
 console.log('useEffect triggered - selectedTicker:', selectedTicker, 'selectedExpiration:', selectedExpiration, 'showAllDates:', showAllDates);
 
 if (!selectedTicker) {
 console.log('No ticker selected, returning');
 return;
 }
 
 // In compact mode (DealerAttraction), wait for expiration dates to load first
 if (compactMode && expirationDates.length === 0) {
 console.log('Compact mode: waiting for expiration dates to load');
 return;
 }
 
 // If no expiration is selected and we're not showing all dates, return early
 if (!selectedExpiration && !showAllDates) {
 console.log('No expiration selected and not showing all dates, returning');
 return;
 }

 const fetchOptionsData = async () => {
 try {
 setLoading(true);
 setError('');
 
 if (showAllDates) {
 // Fetch and combine data from all expiration dates
 const combinedStrikeMap = new Map<number, { call?: number; put?: number }>();
 
 for (const expDate of expirationDates) {
 const response = await fetch(`/api/options-chain?ticker=${selectedTicker}&expiration=${expDate}`);
 const result = await response.json();
 
 if (result.success && result.data && result.data[expDate]) {
 // Extract current price from API response
 if (result.currentPrice) {
 setCurrentPrice(result.currentPrice);
 }
 
 const expirationData = result.data[expDate];
 
 // Process calls for this expiration
 if (expirationData.calls) {
 Object.entries(expirationData.calls).forEach(([strike, callData]: [string, any]) => {
 const strikeNum = parseFloat(strike);
 const openInterest = callData.open_interest || callData.openInterest || 0;
 
 if (!combinedStrikeMap.has(strikeNum)) {
 combinedStrikeMap.set(strikeNum, {});
 }
 
 const existing = combinedStrikeMap.get(strikeNum)!;
 existing.call = (existing.call || 0) + openInterest;
 });
 }
 
 // Process puts for this expiration
 if (expirationData.puts) {
 Object.entries(expirationData.puts).forEach(([strike, putData]: [string, any]) => {
 const strikeNum = parseFloat(strike);
 const openInterest = putData.open_interest || putData.openInterest || 0;
 
 if (!combinedStrikeMap.has(strikeNum)) {
 combinedStrikeMap.set(strikeNum, {});
 }
 
 const existing = combinedStrikeMap.get(strikeNum)!;
 existing.put = (existing.put || 0) + openInterest;
 });
 }
 }
 }
 
 // Convert combined data to chart format
 const chartData: OptionsData[] = [];
 combinedStrikeMap.forEach((data, strike) => {
 const callOI = data.call || 0;
 const putOI = data.put || 0;
 
 if (callOI > 0 || putOI > 0) {
 chartData.push({
 strike,
 openInterest: callOI,
 type: 'call'
 });
 chartData.push({
 strike,
 openInterest: putOI,
 type: 'put'
 });
 }
 });
 
 setData(chartData.sort((a, b) => a.strike - b.strike || (a.type === 'call' ? -1 : 1)));
 } else {
 // Fetch data for single expiration date using the FIXED endpoint with full strike coverage
 const response = await fetch(`/api/options-chain?ticker=${selectedTicker}&expiration=${selectedExpiration}`);
 const result = await response.json();
 
 if (result.success && result.data && result.data[selectedExpiration]) {
 console.log('API Response received, processing...');
 console.log('Selected expiration:', selectedExpiration);
 
 // Extract current price from API response
 if (result.currentPrice) {
 setCurrentPrice(result.currentPrice);
 }
 
 const expirationData = result.data[selectedExpiration];
 const chartData: OptionsData[] = [];
 const strikeMap = new Map<number, { call?: number; put?: number }>();
 
 // Process calls
 if (expirationData.calls) {
 Object.entries(expirationData.calls).forEach(([strike, callData]: [string, any]) => {
 const strikeNum = parseFloat(strike);
 const openInterest = callData.open_interest || callData.openInterest || 0;
 if (!strikeMap.has(strikeNum)) {
 strikeMap.set(strikeNum, {});
 }
 strikeMap.get(strikeNum)!.call = openInterest;
 });
 }
 
 // Process puts
 if (expirationData.puts) {
 Object.entries(expirationData.puts).forEach(([strike, putData]: [string, any]) => {
 const strikeNum = parseFloat(strike);
 const openInterest = putData.open_interest || putData.openInterest || 0;
 if (!strikeMap.has(strikeNum)) {
 strikeMap.set(strikeNum, {});
 }
 strikeMap.get(strikeNum)!.put = openInterest;
 });
 }
 
 // Convert to chart data with both calls and puts for each strike
 strikeMap.forEach((data, strike) => {
 const callOI = data.call || 0;
 const putOI = data.put || 0;
 
 // Only include strikes that have some open interest
 if (callOI > 0 || putOI > 0) {
 if (showNetOI) {
 // Show NET Open Interest (Calls - Puts)
 const netOI = callOI - putOI;
 if (Math.abs(netOI) > 0) {
 chartData.push({
 strike,
 openInterest: Math.abs(netOI),
 type: netOI >= 0 ? 'call' : 'put' // Color based on net direction
 });
 }
 } else {
 // Show separate call and put bars
 chartData.push({
 strike,
 openInterest: callOI,
 type: 'call'
 });
 chartData.push({
 strike,
 openInterest: putOI,
 type: 'put'
 });
 }
 }
 });
 
 setData(chartData.sort((a, b) => a.strike - b.strike || (a.type === 'call' ? -1 : 1)));
 console.log('Chart data set:', chartData.length, 'items');
 } else {
 console.log('No data found for selected expiration');
 setError('No options data available for this expiration');
 }
 }
 } catch (err) {
 setError('Failed to fetch options data');
 console.error('Error fetching options data:', err);
 } finally {
 setLoading(false);
 }
 };

 fetchOptionsData();
 }, [selectedTicker, selectedExpiration, showAllDates, expirationDates, showNetOI, compactMode]); // Include showNetOI and compactMode for re-rendering

 // D3 Chart rendering
 useEffect(() => {
 console.log(' OpenInterestChart main useEffect triggered');
 console.log(' Data length:', data.length);
 console.log(' SVG ref exists:', !!svgRef.current);
 
 if (!data.length || !svgRef.current) {
 console.log(' Early return - data length:', data.length, 'svgRef:', !!svgRef.current);
 return;
 }

 console.log(' Starting chart creation process...');

 const svg = d3.select(svgRef.current);
 svg.selectAll('*').remove();

 const margin = isMobile 
 ? { top: 50, right: 30, bottom: 80, left: 50 }
 : compactMode
 ? { top: 50, right: 20, bottom: 1, left: 60 }
 : { top: 70, right: 20, bottom: 70, left: 100 };
 const width = (isMobile ? 350 : compactMode ? 1120 : 1360) - margin.left - margin.right;
 const height = (isMobile ? 415 : compactMode ? 555 : 700) - margin.top - margin.bottom;

 const container = svg
 .append('g')
 .attr('transform', `translate(${margin.left},${margin.top})`);

 // Scales
 const uniqueStrikes = [...new Set(data.map(d => d.strike))].sort((a, b) => a - b);
 
 const xScale = d3
 .scaleBand()
 .domain(uniqueStrikes.map(s => s.toString()))
 .range([0, width])
 .padding(0.2);

 // Create sub-scale for call/put positioning within each strike
 const xSubScale = d3
 .scaleBand()
 .domain(['call', 'put'])
 .range([0, xScale.bandwidth()])
 .padding(0.1);

 const yScale = d3
 .scaleLinear()
 .domain([0, d3.max(data, d => d.openInterest) || 0])
 .range([height, 0]);

 // Color scale - Solid bright Bloomberg terminal colors
 const colorScale = (type: string) => type === 'call' ? '#00ff00' : '#ff0000';

 // Create zoom behavior for X-axis only
 const zoom = d3.zoom<Element, unknown>()
 .scaleExtent([1, 10])
 .filter((event) => {
 // Allow wheel and drag events, block right-click and ctrl+wheel
 return !event.ctrlKey && !event.button;
 })
 .on('zoom', (event) => {
 const { transform } = event;
 setZoomTransform(transform);
 
 console.log(' Open Interest Chart zoom:', { k: transform.k, x: transform.x, y: transform.y });
 
 // Create new X scale with zoom applied
 const newXScale = transform.rescaleX(d3.scaleLinear().domain([0, uniqueStrikes.length - 1]).range([0, width]));
 
 // Get visible strike range
 const startIndex = Math.max(0, Math.floor(newXScale.invert(0)));
 const endIndex = Math.min(uniqueStrikes.length - 1, Math.ceil(newXScale.invert(width)));
 
 const visibleStrikes = uniqueStrikes.slice(startIndex, endIndex + 1);
 const visibleData = data.filter(d => visibleStrikes.includes(d.strike));
 
 // Recalculate Y scale based on visible data only
 const maxVisibleOI = d3.max(visibleData, d => d.openInterest) || 0;
 const newYScale = d3.scaleLinear()
 .domain([0, maxVisibleOI])
 .range([height, 0]);
 
 // Create new band scale for visible strikes only
 const newXBandScale = d3.scaleBand()
 .domain(visibleStrikes.map(s => s.toString()))
 .range([0, width])
 .padding(0.2);
 
 const newXSubScale = d3.scaleBand()
 .domain(['call', 'put'])
 .range([0, newXBandScale.bandwidth()])
 .padding(0.1);
 
 // Update bars with new scales
 container.selectAll('.bar')
 .style('display', (d: any) => visibleStrikes.includes(d.strike) ? 'block' : 'none')
 .attr('x', (d: any) => {
 if (!visibleStrikes.includes(d.strike)) return -1000; // Hide off-screen bars
 const baseX = newXBandScale(d.strike.toString()) || 0;
 const subX = newXSubScale(d.type) || 0;
 return baseX + subX;
 })
 .attr('y', (d: any) => newYScale(d.openInterest))
 .attr('width', newXSubScale.bandwidth())
 .attr('height', (d: any) => height - newYScale(d.openInterest));
 
 // Update X-axis with visible strikes only
 const maxVisibleLabels = isMobile ? 9 : 15;
 const visibleTickInterval = Math.max(1, Math.ceil(visibleStrikes.length / maxVisibleLabels));
 const filteredVisibleTicks = visibleStrikes.filter((_, index) => index % visibleTickInterval === 0);
 
 const customVisibleXAxis = d3.axisBottom(newXBandScale)
 .tickValues(filteredVisibleTicks.map(s => s.toString()));
 
 const xAxisUpdate = container.select('.x-axis') as d3.Selection<SVGGElement, unknown, null, undefined>;
 xAxisUpdate.call(customVisibleXAxis);
 
 // Calculate dynamic font size for visible ticks - keep consistent with initial render
 const visibleFontSize = isMobile 
   ? Math.max(10, Math.min(12, 150 / filteredVisibleTicks.length))
   : Math.max(14, Math.min(18, 250 / filteredVisibleTicks.length));
 
 xAxisUpdate.selectAll('text')
 .style('fill', '#ff9900')
 .style('font-size', `${visibleFontSize}px`)
 .attr('transform', 'rotate(-35)')
 .style('text-anchor', 'end')
 .attr('dx', '-0.5em')
 .attr('dy', '0.5em');
 
 xAxisUpdate.selectAll('path, line')
 .style('stroke', '#ff9900')
 .style('stroke-width', '1px');
 
 // Update Y-axis with new scale
 const yAxisUpdate = container.select('.y-axis') as d3.Selection<SVGGElement, unknown, null, undefined>;
 yAxisUpdate.call(d3.axisLeft(newYScale).tickFormat(d3.format(',d')) as any);
 
 yAxisUpdate.selectAll('text')
 .style('fill', '#ff9900')
 .style('font-size', '14px');
 
 yAxisUpdate.selectAll('path, line')
 .style('stroke', '#ff9900')
 .style('stroke-width', '1px');
 
 // Update current price line position during zoom
 if (currentPrice > 0) {
 const currentPriceX = visibleStrikes.findIndex(strike => strike >= currentPrice);
 let xPosition;
 
 if (currentPriceX === -1) {
 // Price is above all visible strikes
 xPosition = width;
 } else if (currentPriceX === 0) {
 // Price is below all visible strikes
 xPosition = 0;
 } else {
 // Interpolate between strikes
 const lowerStrike = visibleStrikes[currentPriceX - 1];
 const upperStrike = visibleStrikes[currentPriceX];
 const ratio = (currentPrice - lowerStrike) / (upperStrike - lowerStrike);
 const lowerX = (newXBandScale(lowerStrike.toString()) || 0) + newXBandScale.bandwidth() / 2;
 const upperX = (newXBandScale(upperStrike.toString()) || 0) + newXBandScale.bandwidth() / 2;
 xPosition = lowerX + ratio * (upperX - lowerX);
 }
 
 // Update the current price line position
 container.select('.current-price-line')
 .attr('x1', xPosition)
 .attr('x2', xPosition);
 
 // Update the current price label position
 container.select('.current-price-label')
 .attr('x', xPosition);
 }

 // Update 80% expected range lines position during zoom
 if (expectedRange80) {
 const { call: call80, put: put80 } = expectedRange80;
 
 // Update Put 80% line
 const put80X = visibleStrikes.findIndex(strike => strike >= put80);
 let putXPosition;
 
 if (put80X === -1) {
 putXPosition = width;
 } else if (put80X === 0) {
 putXPosition = 0;
 } else {
 const lowerStrike = visibleStrikes[put80X - 1];
 const upperStrike = visibleStrikes[put80X];
 const ratio = (put80 - lowerStrike) / (upperStrike - lowerStrike);
 const lowerX = (newXBandScale(lowerStrike.toString()) || 0) + newXBandScale.bandwidth() / 2;
 const upperX = (newXBandScale(upperStrike.toString()) || 0) + newXBandScale.bandwidth() / 2;
 putXPosition = lowerX + ratio * (upperX - lowerX);
 }
 
 container.select('.expected-range-put-80')
 .attr('x1', putXPosition)
 .attr('x2', putXPosition);
 
 container.select('.expected-range-put-label')
 .attr('x', putXPosition);
 
 // Update Call 80% line
 const call80X = visibleStrikes.findIndex(strike => strike >= call80);
 let callXPosition;
 
 if (call80X === -1) {
 callXPosition = width;
 } else if (call80X === 0) {
 callXPosition = 0;
 } else {
 const lowerStrike = visibleStrikes[call80X - 1];
 const upperStrike = visibleStrikes[call80X];
 const ratio = (call80 - lowerStrike) / (upperStrike - lowerStrike);
 const lowerX = (newXBandScale(lowerStrike.toString()) || 0) + newXBandScale.bandwidth() / 2;
 const upperX = (newXBandScale(upperStrike.toString()) || 0) + newXBandScale.bandwidth() / 2;
 callXPosition = lowerX + ratio * (upperX - lowerX);
 }
 
 container.select('.expected-range-call-80')
 .attr('x1', callXPosition)
 .attr('x2', callXPosition);
 
 container.select('.expected-range-call-label')
 .attr('x', callXPosition);
 }
 });

 // Filter data based on toggle states
 const filteredData = data.filter(d => {
 if (d.type === 'call' && !showCalls) return false;
 if (d.type === 'put' && !showPuts) return false;
 return true;
 });

 // Bars
 console.log(' Creating bars with filtered data:', filteredData.length, 'items');
 
 const bars = container
 .selectAll('.bar')
 .data(filteredData)
 .enter()
 .append('rect')
 .attr('class', 'bar')
 .attr('x', d => {
 const baseX = xScale(d.strike.toString()) || 0;
 const subX = xSubScale(d.type) || 0;
 return baseX + subX;
 })
 .attr('y', d => yScale(d.openInterest))
 .attr('width', xSubScale.bandwidth())
 .attr('height', d => height - yScale(d.openInterest))
 .attr('fill', d => colorScale(d.type))
 .attr('opacity', 1);

 // X-axis with intelligent tick filtering
 const maxLabels = isMobile ? 9 : 15; // Maximum number of labels to show
 const tickInterval = Math.max(1, Math.ceil(uniqueStrikes.length / maxLabels));
 
 // Create filtered tick values - show every nth strike
 const filteredTicks = uniqueStrikes.filter((_, index) => index % tickInterval === 0);
 
 // Create custom axis with filtered ticks
 const customXAxis = d3.axisBottom(xScale)
 .tickValues(filteredTicks.map(s => s.toString()));
 
 const xAxis = container
 .append('g')
 .attr('class', 'x-axis')
 .attr('transform', `translate(0,${height})`)
 .call(customXAxis);
 
 // Calculate dynamic font size based on number of visible ticks (larger sizes)
 const fontSize = isMobile 
   ? Math.max(10, Math.min(12, 150 / filteredTicks.length))
   : Math.max(14, Math.min(18, 250 / filteredTicks.length));
 
 xAxis.selectAll('text')
 .style('fill', '#ff9900')
 .style('font-size', `${fontSize}px`)
 .attr('transform', 'rotate(-35)')
 .style('text-anchor', 'end')
 .attr('dx', '-0.5em')
 .attr('dy', '0.5em');
 
 xAxis.selectAll('path, line')
 .style('stroke', '#ff9900')
 .style('stroke-width', '1px');

 // Y-axis
 const yAxis = container
 .append('g')
 .attr('class', 'y-axis')
 .call(d3.axisLeft(yScale).tickFormat(d3.format(',d')));
 
 yAxis.selectAll('text')
 .style('fill', '#ff9900')
 .style('font-size', '14px');
 
 yAxis.selectAll('path, line')
 .style('stroke', '#ff9900')
 .style('stroke-width', '1px');

 // Chart title - positioned higher to avoid overlap with current price line
 container
 .append('text')
 .attr('x', width / 2)
 .attr('y', -35)
 .style('text-anchor', 'middle')
 .style('font-family', '"SF Pro Display", sans-serif')
 .style('font-size', '16px')
 .style('font-weight', '600')
 .style('fill', '#ff9900')
 .text('Open Interest (OI)');

 // Axis labels - hide on mobile, hide Y-axis in compact mode
 if (!isMobile) {
 // Only show Y-axis label in Analysis Suite (not in DealerAttraction compact mode)
 if (!compactMode) {
 container
 .append('text')
 .attr('transform', 'rotate(-90)')
 .attr('y', -70)
 .attr('x', 0 - (height / 2))
 .attr('dy', '1em')
 .style('text-anchor', 'middle')
 .style('fill', '#ff9900')
 .style('font-size', '14px')
 .text('Open Interest');
 }

 container
 .append('text')
 .attr('transform', `translate(${width / 2}, ${height + 70})`)
 .style('text-anchor', 'middle')
 .style('fill', '#ff9900')
 .style('font-size', '14px')
 .text('Strike Price ($)');
 }

 // Current Price Line - use real current price from API
 const strikes = uniqueStrikes;
 
 if (currentPrice > 0) {
 // Find the position on the x-scale for the current price
 const currentPriceX = strikes.findIndex(strike => strike >= currentPrice);
 let xPosition;
 
 if (currentPriceX === -1) {
 // Price is above all strikes
 xPosition = width;
 } else if (currentPriceX === 0) {
 // Price is below all strikes
 xPosition = 0;
 } else {
 // Interpolate between strikes
 const lowerStrike = strikes[currentPriceX - 1];
 const upperStrike = strikes[currentPriceX];
 const ratio = (currentPrice - lowerStrike) / (upperStrike - lowerStrike);
 const lowerX = (xScale(lowerStrike.toString()) || 0) + xScale.bandwidth() / 2;
 const upperX = (xScale(upperStrike.toString()) || 0) + xScale.bandwidth() / 2;
 xPosition = lowerX + ratio * (upperX - lowerX);
 }

 // Draw vertical dotted line
 container
 .append('line')
 .attr('class', 'current-price-line')
 .attr('x1', xPosition)
 .attr('x2', xPosition)
 .attr('y1', 0)
 .attr('y2', height)
 .style('stroke', '#ff9900')
 .style('stroke-width', 2)
 .style('stroke-dasharray', '5,5')
 .style('opacity', 0.8);

 // Add text label above the line
 container
 .append('text')
 .attr('class', 'current-price-label')
 .attr('x', xPosition)
 .attr('y', -10)
 .style('text-anchor', 'middle')
 .style('fill', '#ff9900')
 .style('font-size', '12px')
 .style('font-weight', 'bold')
 .text(`Current Price: $${currentPrice.toFixed(2)}`);
 }

 // Draw 80% Expected Range lines (blue dashed vertical lines)
 if (expectedRange80) {
 const { call: call80, put: put80 } = expectedRange80;
 
 // Draw Put 80% line (lower bound)
 const putStrikeIndex = strikes.findIndex((s, idx) => {
 if (idx === strikes.length - 1) return true;
 return put80 >= strikes[idx] && put80 < strikes[idx + 1];
 });
 
 if (putStrikeIndex !== -1) {
 let putXPosition = 0;
 
 if (put80 === strikes[putStrikeIndex]) {
 putXPosition = (xScale(strikes[putStrikeIndex].toString()) || 0) + xScale.bandwidth() / 2;
 } else {
 const lowerStrike = strikes[putStrikeIndex];
 const upperStrike = strikes[putStrikeIndex + 1] || lowerStrike;
 const ratio = (put80 - lowerStrike) / (upperStrike - lowerStrike || 1);
 const lowerX = (xScale(lowerStrike.toString()) || 0) + xScale.bandwidth() / 2;
 const upperX = (xScale(upperStrike.toString()) || 0) + xScale.bandwidth() / 2;
 putXPosition = lowerX + ratio * (upperX - lowerX);
 }
 
 container
 .append('line')
 .attr('class', 'expected-range-put-80')
 .attr('x1', putXPosition)
 .attr('x2', putXPosition)
 .attr('y1', 0)
 .attr('y2', height)
 .style('stroke', '#3b82f6')
 .style('stroke-width', 2)
 .style('stroke-dasharray', '5,5')
 .style('opacity', 0.7);
 
 container
 .append('text')
 .attr('class', 'expected-range-put-label')
 .attr('x', putXPosition)
 .attr('y', -25)
 .style('text-anchor', 'middle')
 .style('fill', '#3b82f6')
 .style('font-size', '11px')
 .style('font-weight', 'bold')
 .text(`80% Put: $${put80.toFixed(2)}`);
 }
 
 // Draw Call 80% line (upper bound)
 const callStrikeIndex = strikes.findIndex((s, idx) => {
 if (idx === strikes.length - 1) return true;
 return call80 >= strikes[idx] && call80 < strikes[idx + 1];
 });
 
 if (callStrikeIndex !== -1) {
 let callXPosition = 0;
 
 if (call80 === strikes[callStrikeIndex]) {
 callXPosition = (xScale(strikes[callStrikeIndex].toString()) || 0) + xScale.bandwidth() / 2;
 } else {
 const lowerStrike = strikes[callStrikeIndex];
 const upperStrike = strikes[callStrikeIndex + 1] || lowerStrike;
 const ratio = (call80 - lowerStrike) / (upperStrike - lowerStrike || 1);
 const lowerX = (xScale(lowerStrike.toString()) || 0) + xScale.bandwidth() / 2;
 const upperX = (xScale(upperStrike.toString()) || 0) + xScale.bandwidth() / 2;
 callXPosition = lowerX + ratio * (upperX - lowerX);
 }
 
 container
 .append('line')
 .attr('class', 'expected-range-call-80')
 .attr('x1', callXPosition)
 .attr('x2', callXPosition)
 .attr('y1', 0)
 .attr('y2', height)
 .style('stroke', '#3b82f6')
 .style('stroke-width', 2)
 .style('stroke-dasharray', '5,5')
 .style('opacity', 0.7);
 
 container
 .append('text')
 .attr('class', 'expected-range-call-label')
 .attr('x', callXPosition)
 .attr('y', -25)
 .style('text-anchor', 'middle')
 .style('fill', '#3b82f6')
 .style('font-size', '11px')
 .style('font-weight', 'bold')
 .text(`80% Call: $${call80.toFixed(2)}`);
 }
 }



 // Add zoom rectangle AFTER all other elements - covering the entire chart area
 const zoomRect = svg
 .append('rect')
 .attr('class', 'zoom-overlay')
 .attr('x', margin.left)
 .attr('y', margin.top)
 .attr('width', width)
 .attr('height', height)
 .style('fill', 'none') // Invisible overlay
 .style('pointer-events', 'all')
 .style('cursor', 'grab');
 
 // Apply zoom behavior to the entire SVG
 svg.call(zoom as any);

 // Apply existing zoom transform if it exists
 if (zoomTransform) {
 svg.call(zoom.transform as any, zoomTransform);
 }
 
 // Debug: Check how many bars were actually created
 const actualBarsCreated = container.selectAll('.bar').size();
 console.log(' Chart creation complete. Total bars created:', actualBarsCreated);

 }, [data, showCalls, showPuts, currentPrice, showNetOI, expectedRange80]);

 return (
 <div style={{ color: '#ff9900', fontFamily: '"Roboto Mono", monospace', overflowX: 'hidden', overflowY: 'visible' }}>
 {/* Controls */}
 <div style={{ 
 display: 'flex',
 flexDirection: 'row',
 flexWrap: isMobile ? 'wrap' : 'nowrap',
 gap: isMobile ? '8px' : '16px',
 alignItems: 'center', 
 marginBottom: '24px',
 padding: isMobile ? '16px' : '20px 24px',
 background: '#000000',
 borderRadius: '12px',
 border: '1px solid #333333',
 boxShadow: `
 0 8px 32px rgba(0, 0, 0, 0.8),
 0 2px 8px rgba(0, 0, 0, 0.6),
 inset 0 1px 0 rgba(255, 255, 255, 0.1),
 inset 0 -1px 0 rgba(0, 0, 0, 0.8)
 `,
 position: 'relative',
 zIndex: 100,
 transform: 'translateZ(0)',
 backdropFilter: 'blur(20px)',
 overflow: 'visible'
 }}>
 {/* 3D Highlight Effect */}
 <div style={{
 position: 'absolute',
 top: '1px',
 left: '1px',
 right: '1px',
 height: '50%',
 background: 'rgba(255, 255, 255, 0.05)',
 borderRadius: '12px 12px 0 0',
 pointerEvents: 'none'
 }} />
 
 {/* Current Ticker Display */}
 {!hideTickerInput && (
 <>
 <div style={{ 
 display: 'flex', 
 alignItems: 'center', 
 gap: isMobile ? '4px' : '8px', 
 zIndex: 1,
 flex: isMobile ? '1 1 48%' : '0 0 auto',
 minWidth: isMobile ? '0' : 'auto'
 }}>
 <label style={{ 
 color: '#ffffff', 
 fontSize: '13px', 
 fontWeight: '600',
 letterSpacing: '0.5px',
 textTransform: 'uppercase',
 minWidth: isMobile ? 'auto' : '60px',
 textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)'
 }}>
 Ticker
 </label>
 <input
 type="text"
 value={tickerInput}
 onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
 onKeyDown={(e) => {
 if (e.key === 'Enter') {
 e.preventDefault();
 setSelectedTicker(tickerInput);
 }
 }}
 onBlur={() => setSelectedTicker(tickerInput)}
 style={{
 background: '#000000',
 border: '1px solid #333333',
 borderRadius: '8px',
 color: '#ffffff',
 padding: '10px 14px',
 fontSize: '14px',
 fontWeight: '500',
 width: isMobile ? '60px' : '140px',
 fontFamily: '"SF Pro Display", -apple-system, BlinkMacSystemFont, sans-serif',
 boxShadow: `
 inset 0 2px 4px rgba(0, 0, 0, 0.6),
 inset 0 -1px 0 rgba(255, 255, 255, 0.05),
 0 1px 0 rgba(255, 255, 255, 0.1)
 `,
 textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)',
 outline: 'none',
 cursor: 'text'
 }}
 placeholder="Enter ticker..."
 />
 </div>
 
 {/* Divider */}
 <div style={{ 
 width: '1px', 
 height: '32px', 
 background: 'linear-gradient(180deg, transparent 0%, #555 50%, transparent 100%)',
 boxShadow: '1px 0 0 rgba(255, 255, 255, 0.05)',
 display: isMobile ? 'none' : 'block'
 }} />
 </>
 )}
 
 <div style={{ 
 display: 'flex', 
 alignItems: 'center', 
 gap: isMobile ? '4px' : '8px', 
 zIndex: 1,
 flex: isMobile ? '1 1 48%' : '0 0 auto',
 minWidth: isMobile ? '0' : 'auto'
 }}>
 <label style={{ 
 color: '#ffffff', 
 fontSize: '13px', 
 fontWeight: '600',
 letterSpacing: '0.5px',
 textTransform: 'uppercase',
 minWidth: isMobile ? '30px' : '90px',
 marginLeft: isMobile ? '-25px' : '0',
 textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)'
 }}>
 Expiry
 </label>
 <select
 value={showAllDates ? 'ALL_DATES' : selectedExpiration}
 style={{
 background: '#000000',
 border: '1px solid #333333',
 borderRadius: '8px',
 color: showAllDates ? '#666666' : '#ffffff',
 padding: '10px 14px',
 fontSize: '14px',
 fontWeight: '500',
 minWidth: isMobile ? '120px' : '160px',
 outline: 'none',
 cursor: showAllDates ? 'not-allowed' : 'pointer',
 transition: 'all 0.2s ease',
 fontFamily: '"SF Pro Display", -apple-system, BlinkMacSystemFont, sans-serif',
 boxShadow: `
 inset 0 2px 4px rgba(0, 0, 0, 0.6),
 inset 0 -1px 0 rgba(255, 255, 255, 0.05),
 0 1px 0 rgba(255, 255, 255, 0.1)
 `,
 textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)',
 opacity: showAllDates ? 0.5 : 1
 }}
 disabled={loading || showAllDates}
 onFocus={(e) => {
 if (!showAllDates) {
 e.target.style.border = '1px solid #d97706';
 e.target.style.boxShadow = `
 inset 0 2px 4px rgba(0, 0, 0, 0.6),
 inset 0 -1px 0 rgba(255, 255, 255, 0.05),
 0 0 0 2px rgba(217, 119, 6, 0.2),
 0 1px 0 rgba(255, 255, 255, 0.1)
 `;
 }
 }}
 onBlur={(e) => {
 if (!showAllDates) {
 e.target.style.border = '1px solid #333333';
 e.target.style.boxShadow = `
 inset 0 2px 4px rgba(0, 0, 0, 0.6),
 inset 0 -1px 0 rgba(255, 255, 255, 0.05),
 0 1px 0 rgba(255, 255, 255, 0.1)
 `;
 }
 }}
 onChange={(e) => {
 const value = e.target.value;
 if (value === 'ALL_DATES') {
 setShowAllDates(true);
 setSelectedExpiration('');
 } else {
 setShowAllDates(false);
 setSelectedExpiration(value);
 }
 }}
 >
 <option value="ALL_DATES" style={{ background: '#000000', color: '#ff9900' }}>
 All Dates
 </option>
 {expirationDates.map(date => (
 <option key={date} value={date} style={{ background: '#000000', color: '#ffffff' }}>
 {new Date(date + 'T00:00:00').toLocaleDateString()}
 </option>
 ))}
 </select>
 </div>
 
 {/* Divider */}
 <div style={{ 
 width: '1px', 
 height: '32px', 
 background: 'linear-gradient(180deg, transparent 0%, #555 50%, transparent 100%)',
 boxShadow: '1px 0 0 rgba(255, 255, 255, 0.05)'
 }} />
 
 {/* Expected Range PC Bar */}
 <div style={{ 
 display: 'flex', 
 alignItems: 'center', 
 gap: '8px', 
 zIndex: 1,
 flex: isMobile ? '1 1 30%' : '0 0 auto',
 minWidth: isMobile ? '0' : 'auto'
 }}>
 <label style={{ 
 color: '#ffffff', 
 fontSize: '13px', 
 fontWeight: '600',
 letterSpacing: '0.5px',
 textTransform: 'uppercase',
 textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)'
 }}>
 90% Range P/C
 </label>
 <div style={{
 background: '#000000',
 border: '1px solid #333333',
 borderRadius: '8px',
 padding: '10px 16px',
 color: expectedRangePCRatio.startsWith('∞') ? '#ff6b6b' : expectedRangePCRatio === 'N/A' || expectedRangePCRatio === 'Error' ? '#888888' : '#00ff88',
 fontSize: '14px',
 fontWeight: '500',
 minWidth: '180px',
 textAlign: 'center',
 fontFamily: '"SF Mono", Consolas, monospace',
 boxShadow: `
 inset 0 2px 4px rgba(0, 0, 0, 0.6),
 inset 0 -1px 0 rgba(255, 255, 255, 0.05),
 0 1px 0 rgba(255, 255, 255, 0.1)
 `,
 textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)'
 }}>
 {expectedRangePCRatio || 'Loading...'}
 </div>
 </div>
 
 {/* Divider */}
 <div style={{ 
 width: '1px', 
 height: '32px', 
 background: 'linear-gradient(180deg, transparent 0%, #555 50%, transparent 100%)',
 boxShadow: '1px 0 0 rgba(255, 255, 255, 0.05)'
 }} />

 {/* 45-Day Cumulative P/C Ratio */}
 <div style={{ 
 display: 'flex', 
 alignItems: 'center', 
 gap: '8px', 
 zIndex: 1,
 flex: isMobile ? '1 1 30%' : '0 0 auto',
 minWidth: isMobile ? '0' : 'auto'
 }}>
 <label style={{ 
 color: '#ffffff', 
 fontSize: '13px', 
 fontWeight: '600',
 letterSpacing: '0.5px',
 textTransform: 'uppercase',
 textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)'
 }}>
 45D P/C
 </label>
 <div style={{
 background: '#000000',
 border: '1px solid #333333',
 borderRadius: '8px',
 padding: '10px 16px',
 color: cumulativePCRatio45Days.startsWith('∞') ? '#ff6b6b' : cumulativePCRatio45Days === 'N/A' || cumulativePCRatio45Days === 'Error' ? '#888888' : '#00ff88',
 fontSize: '14px',
 fontWeight: '500',
 minWidth: '140px',
 textAlign: 'center',
 fontFamily: '"SF Mono", Consolas, monospace',
 boxShadow: `
 inset 0 2px 4px rgba(0, 0, 0, 0.6),
 inset 0 -1px 0 rgba(255, 255, 255, 0.05),
 0 1px 0 rgba(255, 255, 255, 0.1)
 `,
 textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)'
 }}>
 {cumulativePCRatio45Days || 'Loading...'}
 </div>
 </div>
 
 {/* Divider */}
 <div style={{ 
 width: '1px', 
 height: '32px', 
 background: 'linear-gradient(180deg, transparent 0%, #555 50%, transparent 100%)',
 boxShadow: '1px 0 0 rgba(255, 255, 255, 0.05)'
 }} />
 
 {/* Action Buttons */}
 <div style={{ 
 display: 'flex', 
 alignItems: 'center', 
 gap: '12px', 
 marginLeft: isMobile ? '0' : 'auto', 
 zIndex: 1,
 flex: isMobile ? '1 1 65%' : '0 0 auto',
 minWidth: isMobile ? '0' : 'auto'
 }}>
 <button
 onClick={() => {
 // TODO: Implement AI Assistance functionality
 console.log('AI Assistance clicked');
 }}
 style={{
 background: '#3b82f6',
 border: '1px solid #3b82f6',
 borderRadius: '8px',
 color: '#ffffff',
 padding: '10px 16px',
 fontSize: '13px',
 fontWeight: '600',
 letterSpacing: '0.3px',
 cursor: 'pointer',
 transition: 'all 0.2s ease',
 fontFamily: '"SF Pro Display", -apple-system, BlinkMacSystemFont, sans-serif',
 textTransform: 'uppercase',
 boxShadow: `
 0 2px 8px rgba(59, 130, 246, 0.4),
 inset 0 1px 0 rgba(255, 255, 255, 0.2),
 inset 0 -1px 0 rgba(0, 0, 0, 0.2)
 `,
 textShadow: '0 1px 2px rgba(0, 0, 0, 0.3)'
 }}
 onMouseEnter={(e) => {
 e.currentTarget.style.background = '#60a5fa';
 e.currentTarget.style.transform = 'translateY(-2px)';
 e.currentTarget.style.boxShadow = `
 0 4px 16px rgba(59, 130, 246, 0.6),
 0 2px 8px rgba(0, 0, 0, 0.4),
 inset 0 1px 0 rgba(255, 255, 255, 0.3),
 inset 0 -1px 0 rgba(0, 0, 0, 0.1)
 `;
 }}
 onMouseLeave={(e) => {
 e.currentTarget.style.background = '#3b82f6';
 e.currentTarget.style.transform = 'translateY(0)';
 e.currentTarget.style.boxShadow = `
 0 2px 8px rgba(59, 130, 246, 0.4),
 inset 0 1px 0 rgba(255, 255, 255, 0.2),
 inset 0 -1px 0 rgba(0, 0, 0, 0.2)
 `;
 }}
 >
 AI
 </button>
 
 <button
 onClick={() => {
 // TODO: Implement Quick Chart functionality
 console.log('Quick Chart clicked');
 }}
 style={{
 background: '#000000',
 border: '1px solid #333333',
 borderRadius: '8px',
 color: '#ffffff',
 padding: '10px 16px',
 fontSize: '13px',
 fontWeight: '600',
 letterSpacing: '0.3px',
 cursor: 'pointer',
 transition: 'all 0.2s ease',
 fontFamily: '"SF Pro Display", -apple-system, BlinkMacSystemFont, sans-serif',
 textTransform: 'uppercase',
 boxShadow: `
 0 2px 8px rgba(0, 0, 0, 0.4),
 inset 0 1px 0 rgba(255, 255, 255, 0.1),
 inset 0 -1px 0 rgba(0, 0, 0, 0.4)
 `,
 textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)'
 }}
 onMouseEnter={(e) => {
 if (!showAllDates) {
 e.currentTarget.style.background = '#d97706';
 e.currentTarget.style.color = '#000000';
 e.currentTarget.style.border = '1px solid #d97706';
 e.currentTarget.style.transform = 'translateY(-2px)';
 e.currentTarget.style.boxShadow = `
 0 4px 16px rgba(217, 119, 6, 0.4),
 0 2px 8px rgba(0, 0, 0, 0.6),
 inset 0 1px 0 rgba(255, 255, 255, 0.2),
 inset 0 -1px 0 rgba(0, 0, 0, 0.2)
 `;
 e.currentTarget.style.textShadow = '0 1px 2px rgba(0, 0, 0, 0.3)';
 } else {
 e.currentTarget.style.transform = 'translateY(-2px)';
 e.currentTarget.style.boxShadow = `
 0 6px 20px rgba(217, 119, 6, 0.6),
 0 4px 12px rgba(0, 0, 0, 0.8),
 inset 0 1px 0 rgba(255, 255, 255, 0.3),
 inset 0 -1px 0 rgba(0, 0, 0, 0.1)
 `;
 }
 }}
 onMouseLeave={(e) => {
 if (!showAllDates) {
 e.currentTarget.style.background = '#000000';
 e.currentTarget.style.color = '#ffffff';
 e.currentTarget.style.border = '1px solid #333333';
 e.currentTarget.style.transform = 'translateY(0)';
 e.currentTarget.style.boxShadow = `
 0 2px 8px rgba(0, 0, 0, 0.4),
 inset 0 1px 0 rgba(255, 255, 255, 0.1),
 inset 0 -1px 0 rgba(0, 0, 0, 0.4)
 `;
 e.currentTarget.style.textShadow = '0 1px 2px rgba(0, 0, 0, 0.8)';
 } else {
 e.currentTarget.style.transform = 'translateY(0)';
 e.currentTarget.style.boxShadow = `
 0 4px 16px rgba(217, 119, 6, 0.4),
 0 2px 8px rgba(0, 0, 0, 0.6),
 inset 0 1px 0 rgba(255, 255, 255, 0.2),
 inset 0 -1px 0 rgba(0, 0, 0, 0.2)
 `;
 }
 }}
 >
 Chart
 </button>

 {/* OI Dropdown Button */}
 <div style={{ position: 'relative' }}>
 <button
 onClick={() => setOiDropdownOpen(!oiDropdownOpen)}
 style={{
 background: '#000000',
 border: '1px solid #333333',
 borderRadius: '8px',
 color: '#fbbf24',
 padding: '10px 14px',
 fontSize: '13px',
 fontWeight: '600',
 letterSpacing: '0.3px',
 cursor: 'pointer',
 transition: 'all 0.2s ease',
 fontFamily: '"SF Pro Display", -apple-system, BlinkMacSystemFont, sans-serif',
 textTransform: 'uppercase',
 boxShadow: `
 0 2px 8px rgba(0, 0, 0, 0.4),
 inset 0 1px 0 rgba(255, 255, 255, 0.1),
 inset 0 -1px 0 rgba(0, 0, 0, 0.4)
 `,
 textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)'
 }}
 >
 OI ▼
 </button>
 
 {oiDropdownOpen && (
 <div style={{
 position: 'absolute',
 top: '100%',
 left: '0',
 marginTop: '4px',
 background: '#000000',
 border: '1px solid #333333',
 borderRadius: '8px',
 minWidth: '120px',
 zIndex: 9999,
 boxShadow: '0 4px 12px rgba(0, 0, 0, 0.8)'
 }}>
 <div
 onClick={() => { setShowCalls(!showCalls); setOiDropdownOpen(false); }}
 style={{
 padding: '8px 12px',
 color: showCalls ? '#00ff88' : '#666',
 cursor: 'pointer',
 fontSize: '12px',
 borderBottom: '1px solid #333'
 }}
 >
 Calls
 </div>
 <div
 onClick={() => { setShowPuts(!showPuts); setOiDropdownOpen(false); }}
 style={{
 padding: '8px 12px',
 color: showPuts ? '#ff4444' : '#666',
 cursor: 'pointer', 
 fontSize: '12px',
 borderBottom: '1px solid #333'
 }}
 >
 Puts
 </div>
 <div
 onClick={() => { setShowNetOI(!showNetOI); setOiDropdownOpen(false); }}
 style={{
 padding: '8px 12px',
 color: showNetOI ? '#fbbf24' : '#666',
 cursor: 'pointer',
 fontSize: '12px'
 }}
 >
 Net
 </div>
 </div>
 )}
 </div>

 {/* GEX Dropdown Button */}
 <div style={{ position: 'relative' }}>
 <button
 onClick={() => setGexDropdownOpen(!gexDropdownOpen)}
 style={{
 background: '#000000',
 border: '1px solid #333333',
 borderRadius: '8px',
 color: '#a855f7',
 padding: '10px 14px',
 fontSize: '13px',
 fontWeight: '600',
 letterSpacing: '0.3px',
 cursor: 'pointer',
 transition: 'all 0.2s ease',
 fontFamily: '"SF Pro Display", -apple-system, BlinkMacSystemFont, sans-serif',
 textTransform: 'uppercase',
 boxShadow: `
 0 2px 8px rgba(0, 0, 0, 0.4),
 inset 0 1px 0 rgba(255, 255, 255, 0.1),
 inset 0 -1px 0 rgba(0, 0, 0, 0.4)
 `,
 textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)'
 }}
 >
 GEX ▼
 </button>
 
 {gexDropdownOpen && (
 <div style={{
 position: 'absolute',
 top: '100%',
 left: '0',
 marginTop: '4px',
 background: '#000000',
 border: '1px solid #333333',
 borderRadius: '8px',
 minWidth: '100px',
 zIndex: 9999,
 boxShadow: '0 4px 12px rgba(0, 0, 0, 0.8)'
 }}>
 <div
 onClick={() => { setShowPositiveGamma(!showPositiveGamma); setGexDropdownOpen(false); }}
 style={{
 padding: '8px 12px',
 color: showPositiveGamma ? '#a855f7' : '#666',
 cursor: 'pointer',
 fontSize: '12px',
 borderBottom: '1px solid #333'
 }}
 >
 Positive
 </div>
 <div
 onClick={() => { setShowNegativeGamma(!showNegativeGamma); setGexDropdownOpen(false); }}
 style={{
 padding: '8px 12px',
 color: showNegativeGamma ? '#f97316' : '#666',
 cursor: 'pointer',
 fontSize: '12px',
 borderBottom: '1px solid #333'
 }}
 >
 Negative
 </div>
 <div
 onClick={() => { /* TODO: Add DEX functionality */ setGexDropdownOpen(false); }}
 style={{
 padding: '8px 12px',
 color: '#666',
 cursor: 'pointer',
 fontSize: '12px',
 borderBottom: '1px solid #333'
 }}
 >
 DEX
 </div>
 <div
 onClick={() => { /* TODO: Add NET functionality */ setGexDropdownOpen(false); }}
 style={{
 padding: '8px 12px',
 color: '#666',
 cursor: 'pointer',
 fontSize: '12px'
 }}
 >
 NET
 </div>
 </div>
 )}
 </div>
 </div>
 
 {loading && (
 <div style={{ color: '#ff9900', fontSize: '14px', fontWeight: 'bold' }}>
 LOADING DATA...
 </div>
 )}
 </div>

 {/* Error Message */}
 {error && (
 <div style={{
 background: 'rgba(255, 0, 0, 0.1)',
 border: '1px solid #ff0000',
 borderRadius: '0px',
 padding: '15px',
 marginBottom: '20px',
 color: '#ff0000',
 fontWeight: 'bold',
 textAlign: 'center'
 }}>
 ERROR: {error}
 </div>
 )}

 {/* Chart */}
 {!loading && !error && data.length > 0 && (
 <div style={{
 background: '#000000',
 borderRadius: '8px 8px 0px 0px',
 padding: '20px',
 border: '1px solid #333333',
 borderBottom: 'none',
 boxShadow: '0 4px 24px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
 position: 'relative',
 zIndex: 1,
 width: '100%',
 marginTop: compactMode ? '-20px' : '0'
 }}>
 <div style={{ display: 'flex', justifyContent: 'center', position: 'relative' }}>
 <svg
 ref={svgRef}
 width={isMobile ? 350 : compactMode ? 1200 : 1320}
 height={isMobile ? 415 : compactMode ? 675 : 685}
 style={{ 
 background: 'transparent', 
 borderRadius: '0px',
 width: isMobile ? '100%' : '100%',
 height: isMobile ? 'auto' : 'auto',
 maxWidth: isMobile ? '100%' : 'none'
 }}
 />
 

 </div>
 
 </div>
 )}

 {/* No Data Message */}
 {!loading && !error && data.length === 0 && selectedExpiration && (
 <div style={{
 background: 'rgba(0, 0, 0, 0.9)',
 borderRadius: '8px',
 padding: '40px',
 textAlign: 'center',
 color: '#00ff88',
 border: '2px solid #ff0000',
 backdropFilter: 'blur(10px)'
 }}>
 <h3 style={{ color: '#ff0000', marginBottom: '15px', fontWeight: 'bold', textShadow: '0 0 10px #ff0000' }}>
 NO DATA AVAILABLE 
 </h3>
 <p style={{ fontWeight: 'bold' }}>
 No open interest data found for {selectedTicker} on {new Date(selectedExpiration + 'T00:00:00').toLocaleDateString()}
 </p>
 </div>
 )}
 
 {/* GEX Chart */}
 <GEXChart 
 selectedTicker={selectedTicker}
 selectedExpiration={selectedExpiration}
 showAllDates={showAllDates}
 expirationDates={expirationDates}
 showPositiveGamma={showPositiveGamma}
 showNegativeGamma={showNegativeGamma}
 setShowPositiveGamma={setShowPositiveGamma}
 setShowNegativeGamma={setShowNegativeGamma}
 compactMode={compactMode}
 />
 </div>
 );
}