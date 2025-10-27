'use client';

import React, { useState, useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface GEXData {
 strike: number;
 gammaExposure: number;
 deltaExposure: number; // Add delta exposure
 type: 'call' | 'put';
}

interface GEXChartProps {
 selectedTicker: string;
 selectedExpiration: string;
 showAllDates: boolean;
 expirationDates: string[];
 showPositiveGamma: boolean;
 showNegativeGamma: boolean;
 setShowPositiveGamma: (show: boolean) => void;
 setShowNegativeGamma: (show: boolean) => void;
}

export default function GEXChart({ 
 selectedTicker, 
 selectedExpiration, 
 showAllDates, 
 expirationDates,
 showPositiveGamma,
 showNegativeGamma,
 setShowPositiveGamma,
 setShowNegativeGamma
}: GEXChartProps) {
 const [data, setData] = useState<GEXData[]>([]);
 const [loading, setLoading] = useState<boolean>(false);
 const [error, setError] = useState<string>('');
 const [currentPrice, setCurrentPrice] = useState<number>(0);
 const [zoomTransform, setZoomTransform] = useState<any>(null);
 const [showNetGamma, setShowNetGamma] = useState<boolean>(true); // Default to NET view
 const [showGEX, setShowGEX] = useState<boolean>(true); // Toggle between GEX and DEX
 const [isMobile, setIsMobile] = useState<boolean>(false);
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

 /**
 * Calculate real Gamma using Black-Scholes formula
 * Gamma = (φ(d1)) / (S * σ * √T)
 * Where φ(d1) is the standard normal probability density function
 */
 const calculateRealGamma = (
 spot: number,
 strike: number,
 timeToExpiry: number, // in years
 volatility: number,
 riskFreeRate: number = 0.05
 ): number => {
 if (timeToExpiry <= 0) return 0;
 
 const d1 = (Math.log(spot / strike) + (riskFreeRate + 0.5 * volatility * volatility) * timeToExpiry) / 
 (volatility * Math.sqrt(timeToExpiry));
 
 // Standard normal probability density function φ(d1)
 const phi_d1 = (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * d1 * d1);
 
 // Gamma calculation
 const gamma = phi_d1 / (spot * volatility * Math.sqrt(timeToExpiry));
 
 return gamma;
 };

 /**
 * Calculate Gamma Exposure (GEX) using REAL calculated gamma, not fake Polygon data
 */
 const calculateGammaExposure = (
 openInterest: number, 
 spot: number, 
 polygonGamma?: number,
 contractType: 'call' | 'put' = 'call'
 ): number => {
 // Use Polygon's real gamma - if no gamma, return 0
 if (!polygonGamma || isNaN(polygonGamma)) {
 return 0;
 }

 // FILTER OUT FAKE GAMMA VALUES - but keep sign information!
 const absGamma = Math.abs(polygonGamma);
 
 // Realistic gamma bounds: SPY options actually have gamma between 0.00001 and 0.1
 // Any gamma above 1.0 is likely fake/corrupted data
 if (absGamma > 1.0) {
 console.warn(`� FILTERING FAKE GAMMA: ${absGamma} for ${contractType} (too high)`);
 return 0;
 }
 
 // Filter only extremely low values that are likely zero/noise
 if (absGamma < 0.000001) {
 return 0;
 }
 
 // GEX = Gamma × OI × 100 × Spot² - USE RAW GAMMA like market overview API
 let gex = polygonGamma * openInterest * 100 * spot * spot;
 
 // Apply dealer perspective signs (same as market overview API):
 // - Calls: Keep positive (dealers short gamma)
 // - Puts: Make negative (dealers short gamma)
 if (contractType === 'put') {
 gex = -gex;
 }
 
 return gex;
 };

 /**
 * Calculate Delta Exposure (DEX) using real Polygon delta data
 * 
 * Formula: DEX = Delta × Open Interest × 100 × Spot
 * Dealer perspective: Long calls = negative DEX, Long puts = positive DEX
 */
 const calculateDeltaExposure = (
 openInterest: number, 
 spot: number, 
 polygonDelta?: number,
 contractType: 'call' | 'put' = 'call'
 ): number => {
 // Use Polygon's real delta - if no delta, return 0
 if (!polygonDelta || isNaN(polygonDelta)) {
 return 0;
 }

 // DEX = Delta × OI × 100 × Spot
 let dex = polygonDelta * openInterest * 100 * spot;
 
 // Apply dealer perspective signs:
 // - Calls: Negative DEX (dealers short calls = negative delta exposure)
 // - Puts: Positive DEX (dealers short puts = positive delta exposure) 
 if (contractType === 'call') {
 dex = -dex;
 }
 // Puts are already positive from the dealer perspective
 
 return dex;
 };

 // Helper function to get the current exposure value based on toggle state
 const getCurrentExposure = (d: GEXData) => {
 return showGEX ? d.gammaExposure : d.deltaExposure;
 };

 // Fetch GEX data
 useEffect(() => {
 if (!selectedTicker || (!selectedExpiration && !showAllDates)) return;

 const fetchGEXData = async () => {
 try {
 setLoading(true);
 setError('');
 
 if (showAllDates) {
 // Fetch and combine GEX data from all expiration dates
 const combinedStrikeMap = new Map<number, { callGEX?: number; putGEX?: number; callDEX?: number; putDEX?: number }>();
 
 for (const expDate of expirationDates) {
 const response = await fetch(`/api/options-chain?ticker=${selectedTicker}`);
 const result = await response.json();
 
 if (result.success && result.data && result.data[expDate]) {
 const expirationData = result.data[expDate];
 
 // Get current spot price from real data only
 const spotPrice = expirationData.underlying_price;
 
 // Skip if no real spot price available
 if (!spotPrice) {
 console.warn(`No real spot price for ${selectedTicker} on ${expDate}, skipping`);
 continue;
 }
 
 // Process calls for this expiration
 if (expirationData.calls) {
 Object.entries(expirationData.calls).forEach(([strike, callData]: [string, any]) => {
 const strikeNum = parseFloat(strike);
 const openInterest = callData.open_interest || callData.openInterest || 0;
 
 if (openInterest > 0) {
 const gex = calculateGammaExposure(
 openInterest, 
 spotPrice, 
 callData.greeks?.gamma,
 'call'
 );
 
 const dex = calculateDeltaExposure(
 openInterest, 
 spotPrice, 
 callData.greeks?.delta,
 'call'
 );
 
 if (!combinedStrikeMap.has(strikeNum)) {
 combinedStrikeMap.set(strikeNum, {});
 }
 
 const existing = combinedStrikeMap.get(strikeNum)!;
 existing.callGEX = (existing.callGEX || 0) + gex;
 existing.callDEX = (existing.callDEX || 0) + dex;
 }
 });
 }
 
 // Process puts for this expiration
 if (expirationData.puts) {
 Object.entries(expirationData.puts).forEach(([strike, putData]: [string, any]) => {
 const strikeNum = parseFloat(strike);
 const openInterest = putData.open_interest || putData.openInterest || 0;
 
 if (openInterest > 0) {
 const gex = calculateGammaExposure(
 openInterest, 
 spotPrice, 
 putData.greeks?.gamma,
 'put'
 );
 
 const dex = calculateDeltaExposure(
 openInterest, 
 spotPrice, 
 putData.greeks?.delta,
 'put'
 );
 
 if (!combinedStrikeMap.has(strikeNum)) {
 combinedStrikeMap.set(strikeNum, {});
 }
 
 const existing = combinedStrikeMap.get(strikeNum)!;
 existing.putGEX = (existing.putGEX || 0) + gex;
 existing.putDEX = (existing.putDEX || 0) + dex;
 }
 });
 }
 }
 }
 
 // Convert combined data to chart format
 const chartData: GEXData[] = [];
 combinedStrikeMap.forEach((data, strike) => {
 const callGEX = data.callGEX || 0;
 const putGEX = data.putGEX || 0;
 const callDEX = data.callDEX || 0;
 const putDEX = data.putDEX || 0;
 
 if (Math.abs(callGEX) > 0 || Math.abs(putGEX) > 0) {
 if (showNetGamma) {
 // Show NET gamma exposure (calls + puts)
 const netGEX = callGEX + putGEX;
 const netDEX = callDEX + putDEX;
 if (Math.abs(netGEX) > 0) {
 chartData.push({
 strike,
 gammaExposure: netGEX,
 deltaExposure: netDEX,
 type: netGEX >= 0 ? 'call' : 'put' // Color based on net direction
 });
 }
 } else {
 // Show separate call and put bars
 if (Math.abs(callGEX) > 0) {
 chartData.push({
 strike,
 gammaExposure: callGEX,
 deltaExposure: callDEX,
 type: 'call'
 });
 }
 if (Math.abs(putGEX) > 0) {
 chartData.push({
 strike,
 gammaExposure: putGEX,
 deltaExposure: putDEX,
 type: 'put'
 });
 }
 }
 }
 });
 
 setData(chartData.sort((a, b) => a.strike - b.strike || (a.type === 'call' ? -1 : 1)));
 } else {
 // Fetch data for single expiration date
 const response = await fetch(`/api/options-chain?ticker=${selectedTicker}`);
 const result = await response.json();
 
 if (result.success && result.data) {
 // Use EXACT same logic as OpenInterest chart
 const availableExpirations = Object.keys(result.data);
 const expirationToUse = availableExpirations.includes(selectedExpiration) 
 ? selectedExpiration 
 : availableExpirations[0];
 
 if (expirationToUse && result.data[expirationToUse]) {
 const expirationData = result.data[expirationToUse];
 
 const chartData: GEXData[] = [];
 const strikeMap = new Map<number, { callGEX?: number; putGEX?: number; callDEX?: number; putDEX?: number }>();
 
 // Get current spot price - use same logic as OpenInterest chart
 const spotPrice = result.currentPrice || expirationData.underlying_price || 100;
 setCurrentPrice(spotPrice);
 
 // Process calls
 if (expirationData.calls) {
 Object.entries(expirationData.calls).forEach(([strike, callData]: [string, any]) => {
 const strikeNum = parseFloat(strike);
 const openInterest = callData.open_interest || callData.openInterest || 0;
 
 if (openInterest > 0) {
 const gex = calculateGammaExposure(
 openInterest, 
 spotPrice, 
 callData.greeks?.gamma,
 'call'
 );
 
 const dex = calculateDeltaExposure(
 openInterest, 
 spotPrice, 
 callData.greeks?.delta,
 'call'
 );
 
 if (!strikeMap.has(strikeNum)) {
 strikeMap.set(strikeNum, {});
 }
 strikeMap.get(strikeNum)!.callGEX = gex;
 strikeMap.get(strikeNum)!.callDEX = dex;
 }
 });
 }
 
 // Process puts
 if (expirationData.puts) {
 Object.entries(expirationData.puts).forEach(([strike, putData]: [string, any]) => {
 const strikeNum = parseFloat(strike);
 const openInterest = putData.open_interest || putData.openInterest || 0;
 
 if (openInterest > 0) {
 const gex = calculateGammaExposure(
 openInterest, 
 spotPrice, 
 putData.greeks?.gamma,
 'put'
 );
 
 const dex = calculateDeltaExposure(
 openInterest, 
 spotPrice, 
 putData.greeks?.delta,
 'put'
 );
 
 if (!strikeMap.has(strikeNum)) {
 strikeMap.set(strikeNum, {});
 }
 strikeMap.get(strikeNum)!.putGEX = gex;
 strikeMap.get(strikeNum)!.putDEX = dex;
 }
 });
 }
 
 // Convert to chart data
 strikeMap.forEach((data, strike) => {
 const callGEX = data.callGEX || 0;
 const putGEX = data.putGEX || 0;
 const callDEX = data.callDEX || 0;
 const putDEX = data.putDEX || 0;
 
 if (Math.abs(callGEX) > 0 || Math.abs(putGEX) > 0) {
 if (showNetGamma) {
 // Show NET gamma exposure (calls + puts)
 const netGEX = callGEX + putGEX;
 const netDEX = callDEX + putDEX;
 if (Math.abs(netGEX) > 0) {
 chartData.push({
 strike,
 gammaExposure: netGEX,
 deltaExposure: netDEX,
 type: netGEX >= 0 ? 'call' : 'put' // Color based on net direction
 });
 }
 } else {
 // Show separate call and put bars
 if (Math.abs(callGEX) > 0) {
 chartData.push({
 strike,
 gammaExposure: callGEX,
 deltaExposure: callDEX,
 type: 'call'
 });
 }
 if (Math.abs(putGEX) > 0) {
 chartData.push({
 strike,
 gammaExposure: putGEX,
 deltaExposure: putDEX,
 type: 'put'
 });
 }
 }
 }
 });
 
 setData(chartData.sort((a, b) => a.strike - b.strike || (a.type === 'call' ? -1 : 1)));
 } else {
 setError('No options data available for GEX calculation');
 }
 } else {
 setError('No options data available for GEX calculation');
 }
 }
 } catch (err) {
 setError('Failed to fetch GEX data');
 console.error('Error fetching GEX data:', err);
 } finally {
 setLoading(false);
 }
 };

 fetchGEXData();
 }, [selectedTicker, selectedExpiration, showAllDates, expirationDates, showNetGamma]);

 // D3 Chart rendering 
 useEffect(() => {
 if (!data.length || !svgRef.current) return;

 const svg = d3.select(svgRef.current);
 svg.selectAll('*').remove();

 const margin = isMobile 
 ? { top: 50, right: 30, bottom: 80, left: 50 }
 : { top: 60, right: 180, bottom: 80, left: 100 };
 const width = (isMobile ? 350 : 1500) - margin.left - margin.right;
 const height = (isMobile ? 415 : 600) - margin.top - margin.bottom;

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

 // Y scale for current exposure (gamma or delta)
 const maxExposure = d3.max(data, d => Math.abs(getCurrentExposure(d))) || 1;
 const yScale = d3
 .scaleLinear()
 .domain([-maxExposure * 1.1, maxExposure * 1.1])
 .range([height, 0]);

 // Create zoom behavior for X-axis only - EXACT COPY from OpenInterestChart
 const zoom = d3.zoom<Element, unknown>()
 .scaleExtent([1, 10])
 .filter((event) => {
 // Allow wheel and drag events, block right-click and ctrl+wheel
 return !event.ctrlKey && !event.button;
 })
 .on('zoom', (event) => {
 const { transform } = event;
 setZoomTransform(transform);
 
 console.log(' GEX Chart zoom:', { k: transform.k, x: transform.x, y: transform.y });
 
 // Create new X scale with zoom applied
 const newXScale = transform.rescaleX(d3.scaleLinear().domain([0, uniqueStrikes.length - 1]).range([0, width]));
 
 // Get visible strike range
 const startIndex = Math.max(0, Math.floor(newXScale.invert(0)));
 const endIndex = Math.min(uniqueStrikes.length - 1, Math.ceil(newXScale.invert(width)));
 
 const visibleStrikes = uniqueStrikes.slice(startIndex, endIndex + 1);
 const visibleData = data.filter(d => visibleStrikes.includes(d.strike));
 
 // Recalculate Y scale based on visible data only for current exposure
 const maxVisibleExposure = d3.max(visibleData, d => Math.abs(getCurrentExposure(d))) || 1;
 const newYScale = d3.scaleLinear()
 .domain([-maxVisibleExposure * 1.1, maxVisibleExposure * 1.1])
 .range([height, 0]);
 
 // Create new band scale for visible strikes only
 const newXBandScale = d3.scaleBand()
 .domain(visibleStrikes.map(s => s.toString()))
 .range([0, width])
 .padding(0.2);
 
 // Update bars with new scales - centered on each strike
 container.selectAll('.gex-bar')
 .style('display', (d: any) => visibleStrikes.includes(d.strike) ? 'block' : 'none')
 .attr('x', (d: any) => {
 if (!visibleStrikes.includes(d.strike)) return -1000; // Hide off-screen bars
 return newXBandScale(d.strike.toString()) || 0;
 })
 .attr('y', (d: any) => getCurrentExposure(d) >= 0 ? newYScale(getCurrentExposure(d)) : newYScale(0))
 .attr('width', newXBandScale.bandwidth())
 .attr('height', (d: any) => Math.abs(newYScale(getCurrentExposure(d)) - newYScale(0)));
 
 // Update X-axis with visible strikes only
 const maxVisibleLabels = isMobile ? 9 : 15; // Mobile: 9 strikes, Desktop: 15 strikes
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
 yAxisUpdate.call(d3.axisLeft(newYScale)
 .tickFormat(d => {
 const val = Math.abs(Number(d));
 if (val >= 1e9) return (Number(d) / 1e9).toFixed(1) + 'B';
 if (val >= 1e6) return (Number(d) / 1e6).toFixed(1) + 'M';
 if (val >= 1e3) return (Number(d) / 1e3).toFixed(1) + 'K';
 return Number(d).toFixed(0);
 }) as any);
 
 yAxisUpdate.selectAll('text')
 .style('fill', '#ff9900')
 .style('font-size', '14px');
 
 yAxisUpdate.selectAll('path, line')
 .style('stroke', '#ff9900')
 .style('stroke-width', '1px');

 // Update zero line
 container.select('.zero-line')
 .attr('y1', newYScale(0))
 .attr('y2', newYScale(0));
 
 // Update current price line position to stay anchored at actual price
 if (currentPrice > 0) {
 const currentPriceX = visibleStrikes.findIndex(strike => strike >= currentPrice);
 let xPosition: number;
 
 if (currentPriceX === -1) {
 // Current price is above all visible strikes
 xPosition = (newXBandScale(visibleStrikes[visibleStrikes.length - 1].toString()) || 0) + newXBandScale.bandwidth() / 2;
 } else if (currentPriceX === 0) {
 // Current price is below the first visible strike 
 xPosition = (newXBandScale(visibleStrikes[0].toString()) || 0) + newXBandScale.bandwidth() / 2;
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
 });

 // Create axes with intelligent tick filtering
 const maxLabels = isMobile ? 9 : 15; // Mobile: 9 strikes, Desktop: 15 strikes
 const tickInterval = Math.max(1, Math.ceil(uniqueStrikes.length / maxLabels));
 
 // Create filtered tick values - show every nth strike
 const filteredTicks = uniqueStrikes.filter((_, index) => index % tickInterval === 0);
 
 // Create custom axis with filtered ticks
 const customXAxis = d3.axisBottom(xScale)
 .tickValues(filteredTicks.map(s => s.toString()));
 
 const xAxis = customXAxis;
 const yAxis = d3.axisLeft(yScale)
 .tickFormat(d => {
 const val = Math.abs(Number(d));
 if (val >= 1e9) return (Number(d) / 1e9).toFixed(1) + 'B';
 if (val >= 1e6) return (Number(d) / 1e6).toFixed(1) + 'M';
 if (val >= 1e3) return (Number(d) / 1e3).toFixed(1) + 'K';
 return Number(d).toFixed(0);
 });

 // Add X axis
 // Calculate dynamic font size based on number of visible ticks - match OpenInterest logic
 const fontSize = isMobile 
   ? Math.max(10, Math.min(12, 150 / filteredTicks.length))
   : Math.max(14, Math.min(18, 250 / filteredTicks.length));
 
 container
 .append('g')
 .attr('class', 'x-axis')
 .attr('transform', `translate(0,${height})`) // Position at bottom of chart
 .call(xAxis)
 .selectAll('text')
 .style('font-family', '"SF Pro Display", sans-serif')
 .style('font-size', `${fontSize}px`)
 .style('fill', '#ff9900')
 .attr('transform', 'rotate(-35)')
 .style('text-anchor', 'end')
 .attr('dx', '-0.5em')
 .attr('dy', '0.5em');

 // Add Y axis
 container
 .append('g')
 .attr('class', 'y-axis')
 .call(yAxis)
 .selectAll('text')
 .style('font-family', '"SF Pro Display", sans-serif')
 .style('font-size', '14px')
 .style('fill', '#ff9900');

 // Add zero line
 container
 .append('line')
 .attr('class', 'zero-line')
 .attr('x1', 0)
 .attr('x2', width)
 .attr('y1', yScale(0))
 .attr('y2', yScale(0))
 .style('stroke', '#666666')
 .style('stroke-width', 2)
 .style('stroke-dasharray', '5,5');

 // Filter data based on toggle states
 const filteredData = data.filter(d => {
 const exposureValue = getCurrentExposure(d);
 if (exposureValue > 0 && !showPositiveGamma) return false;
 if (exposureValue < 0 && !showNegativeGamma) return false;
 return true;
 });

 // Add bars with enhanced styling - centered on each strike
 container
 .selectAll('.gex-bar')
 .data(filteredData)
 .enter()
 .append('rect')
 .attr('class', 'gex-bar')
 .attr('x', d => (xScale(d.strike.toString()) || 0))
 .attr('y', d => getCurrentExposure(d) >= 0 ? yScale(getCurrentExposure(d)) : yScale(0))
 .attr('width', xScale.bandwidth())
 .attr('height', d => Math.abs(yScale(getCurrentExposure(d)) - yScale(0)))
 .style('fill', d => {
 if (getCurrentExposure(d) > 0) {
 return '#a855f7'; // Brighter, more vibrant purple for positive exposure
 } else {
 return '#f59e0b'; // Brighter, more vibrant orange for negative exposure
 }
 })
 .style('stroke', d => {
 if (getCurrentExposure(d) > 0) {
 return '#9333ea'; // Bright purple border
 } else {
 return '#d97706'; // Bright orange border
 }
 })
 .style('stroke-width', 1)
 .style('opacity', 1.0)
 .on('mouseover', function(event, d) {
 d3.select(this)
 .style('opacity', 1.0)
 .style('stroke-width', 2);
 
 // Show enhanced tooltip
 const tooltip = d3.select('body')
 .append('div')
 .attr('class', 'gex-tooltip')
 .style('position', 'absolute')
 .style('background', 'linear-gradient(145deg, #1a1a1a 0%, #000000 50%, #0a0a0a 100%)')
 .style('color', '#ffffff')
 .style('padding', '12px 16px')
 .style('border-radius', '8px')
 .style('font-family', '"SF Pro Display", sans-serif')
 .style('font-size', '13px')
 .style('pointer-events', 'none')
 .style('border', '1px solid #333333')
 .style('box-shadow', '0 8px 24px rgba(0, 0, 0, 0.7)')
 .style('backdrop-filter', 'blur(10px)')
 .style('z-index', '1000');

 const exposureValue = getCurrentExposure(d);
 const gexValue = d.gammaExposure;
 const formatGEX = (value: number) => {
 const absValue = Math.abs(value);
 if (absValue >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
 if (absValue >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
 if (absValue >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
 return value.toFixed(0);
 };

 tooltip.html(`
 <div style="font-weight: 600; margin-bottom: 6px; color: ${exposureValue > 0 ? '#8b5cf6' : '#d97706'};">
 Strike: $${d.strike} ${d.type.toUpperCase()}
 </div>
 <div style="margin-bottom: 4px;">
 ${showGEX ? 'Gamma' : 'Delta'} Exposure: <span style="font-weight: 600;">${exposureValue >= 0 ? '+' : ''}${formatGEX(exposureValue)}</span>
 </div>
 <div style="font-size: 11px; color: #999999;">
 ${exposureValue > 0 ? `Positive ${showGEX ? 'Gamma (Support)' : 'Delta'}` : `Negative ${showGEX ? 'Gamma (Resistance)' : 'Delta'}`}
 </div>
 `);

 tooltip
 .style('left', (event.pageX + 15) + 'px')
 .style('top', (event.pageY - 10) + 'px');
 })
 .on('mouseout', function() {
 d3.select(this)
 .style('opacity', 1.0)
 .style('stroke-width', 1);
 d3.selectAll('.gex-tooltip').remove();
 });

 // Add current price vertical line (same logic as OpenInterest chart)
 if (currentPrice > 0) {
 const strikes = uniqueStrikes;
 const currentPriceX = strikes.findIndex(strike => strike >= currentPrice);
 let xPosition: number;
 
 if (currentPriceX === -1) {
 // Current price is above all strikes
 xPosition = (xScale(strikes[strikes.length - 1].toString()) || 0) + xScale.bandwidth() / 2;
 } else if (currentPriceX === 0) {
 // Current price is below the first strike
 xPosition = (xScale(strikes[0].toString()) || 0) + xScale.bandwidth() / 2;
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

 // Add chart title - positioned higher to avoid overlap with current price line
 container
 .append('text')
 .attr('x', width / 2)
 .attr('y', -35)
 .style('text-anchor', 'middle')
 .style('font-family', '"SF Pro Display", sans-serif')
 .style('font-size', '16px')
 .style('font-weight', '600')
 .style('fill', '#ff9900')
 .text(showGEX ? `Gamma Exposure (GEX)` : `Delta Exposure (DEX)`);

 // Add Y axis label - hide on mobile
 if (!isMobile) {
 container
 .append('text')
 .attr('transform', 'rotate(-90)')
 .attr('y', -70)
 .attr('x', -height / 2)
 .style('text-anchor', 'middle')
 .style('font-family', '"SF Pro Display", sans-serif')
 .style('font-size', '14px')
 .style('fill', '#ff9900')
 .text(showGEX ? 'Gamma Exposure' : 'Delta Exposure');

 // Add X axis label - positioned at the bottom
 container
 .append('text')
 .attr('x', width / 2)
 .attr('y', height + 60)
 .style('text-anchor', 'middle')
 .style('font-family', '"SF Pro Display", sans-serif')
 .style('font-size', '14px')
 .style('font-weight', '500')
 .style('fill', '#ff9900')
 .text('Strike Price');
 }



 // Add zoom rectangle AFTER all other elements - covering the entire chart area - EXACT COPY from OpenInterestChart
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

 }, [data, showPositiveGamma, showNegativeGamma, showGEX]);

 return (
 <div style={{ marginTop: isMobile ? '0px' : '32px' }}>
 {/* Loading and Error States */}
 {loading && (
 <div style={{ 
 textAlign: 'center', 
 color: '#ffffff', 
 padding: '40px',
 fontFamily: '"SF Pro Display", sans-serif',
 background: '#000000',
 borderRadius: '8px',
 border: '1px solid #333333'
 }}>
 <div style={{
 display: 'inline-block',
 width: '20px',
 height: '20px',
 border: '2px solid #333333',
 borderTop: '2px solid #d97706',
 borderRadius: '50%',
 animation: 'spin 1s linear infinite',
 marginRight: '12px'
 }} />
 Loading GEX data...
 </div>
 )}
 
 {error && (
 <div style={{ 
 textAlign: 'center', 
 color: '#ff6b6b', 
 padding: '40px',
 fontFamily: '"SF Pro Display", sans-serif',
 background: '#000000',
 borderRadius: '8px',
 border: '1px solid #ff6b6b'
 }}>
 <strong> {error}</strong>
 </div>
 )}

 {/* Chart */}
 {!loading && !error && (
 <div style={{ 
 background: '#000000', 
 borderRadius: '0px 0px 8px 8px', 
 padding: '20px',
 border: '1px solid #333333',
 borderTop: 'none',
 boxShadow: '0 4px 24px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
 position: 'relative'
 }}>
 <svg
 ref={svgRef}
 width={isMobile ? 350 : 1500}
 height={isMobile ? 415 : 560}
 style={{ 
 background: 'transparent',
 width: isMobile ? '100%' : 'auto',
 height: isMobile ? 'auto' : 'auto',
 maxWidth: isMobile ? '100%' : 'none'
 }}
 />
 

 </div>
 )}
 </div>
 );
}