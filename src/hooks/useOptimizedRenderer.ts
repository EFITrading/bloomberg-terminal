'use client';

import { useCallback, useRef, useEffect } from 'react';

interface ChartDataPoint {
 timestamp: number;
 open: number;
 high: number;
 low: number;
 close: number;
 volume: number;
 date: string;
 time: string;
}

interface ChartConfig {
 theme: 'dark' | 'light';
 chartType: 'candlestick' | 'line';
 showGrid: boolean;
}

interface UseOptimizedRendererOptions {
 data: ChartDataPoint[];
 config: ChartConfig;
 dimensions: { width: number; height: number };
 priceRange: { min: number; max: number };
 visibleCandleCount: number;
 scrollOffset: number;
 volumeAreaHeight: number;
}

interface Colors {
 background: string;
 grid: string;
 bullish: string;
 bearish: string;
 volume: string;
 text: string;
}

export const useOptimizedRenderer = () => {
 const renderingRef = useRef<boolean>(false);
 const animationFrameRef = useRef<number | null>(null);
 const lastRenderTime = useRef<number>(0);
 const canvasCache = useRef<Map<string, ImageData>>(new Map());

 // Theme-based colors
 const getColors = useCallback((theme: 'dark' | 'light'): Colors => {
 return theme === 'dark' ? {
 background: '#0a0a0a',
 grid: '#1e1e1e',
 bullish: '#00ff88',
 bearish: '#ff4444',
 volume: '#666666',
 text: '#ffffff'
 } : {
 background: '#ffffff',
 grid: '#f0f0f0',
 bullish: '#00aa44',
 bearish: '#cc3333',
 volume: '#999999',
 text: '#000000'
 };
 }, []);

 // Optimized grid rendering with caching
 const drawGrid = useCallback((
 ctx: CanvasRenderingContext2D, 
 width: number, 
 height: number, 
 colors: Colors
 ) => {
 const cacheKey = `grid_${width}_${height}_${colors.grid}`;
 
 if (canvasCache.current.has(cacheKey)) {
 const cachedGrid = canvasCache.current.get(cacheKey)!;
 ctx.putImageData(cachedGrid, 0, 0);
 return;
 }

 // Create temporary canvas for grid caching
 const tempCanvas = document.createElement('canvas');
 tempCanvas.width = width;
 tempCanvas.height = height;
 const tempCtx = tempCanvas.getContext('2d')!;

 tempCtx.strokeStyle = colors.grid;
 tempCtx.lineWidth = 1;
 tempCtx.globalAlpha = 0.3;
 
 // Vertical lines
 const verticalSpacing = Math.max(50, width / 20);
 for (let x = 0; x <= width; x += verticalSpacing) {
 tempCtx.beginPath();
 tempCtx.moveTo(x, 0);
 tempCtx.lineTo(x, height);
 tempCtx.stroke();
 }
 
 // Horizontal lines
 const horizontalSpacing = Math.max(30, height / 15);
 for (let y = 0; y <= height; y += horizontalSpacing) {
 tempCtx.beginPath();
 tempCtx.moveTo(0, y);
 tempCtx.lineTo(width, y);
 tempCtx.stroke();
 }
 
 // Cache the grid
 const gridImageData = tempCtx.getImageData(0, 0, width, height);
 canvasCache.current.set(cacheKey, gridImageData);
 
 // Draw to main canvas
 ctx.putImageData(gridImageData, 0, 0);
 }, []);

 // Optimized candlestick rendering with batching
 const drawCandlesticks = useCallback((
 ctx: CanvasRenderingContext2D,
 visibleData: ChartDataPoint[],
 chartWidth: number,
 chartHeight: number,
 priceRange: { min: number; max: number },
 colors: Colors
 ) => {
 if (visibleData.length === 0) return;

 const candleWidth = Math.max(1, (chartWidth / visibleData.length) * 0.8);
 const candleSpacing = chartWidth / visibleData.length;
 const priceSpan = priceRange.max - priceRange.min;

 // Batch rendering: prepare all drawing operations
 const bullishCandles: number[] = [];
 const bearishCandles: number[] = [];
 const wicks: number[] = [];

 visibleData.forEach((candle, index) => {
 const x = 40 + (index * candleSpacing);
 const isBullish = candle.close >= candle.open;
 
 // Calculate Y positions
 const highY = chartHeight - ((candle.high - priceRange.min) / priceSpan) * chartHeight;
 const lowY = chartHeight - ((candle.low - priceRange.min) / priceSpan) * chartHeight;
 const openY = chartHeight - ((candle.open - priceRange.min) / priceSpan) * chartHeight;
 const closeY = chartHeight - ((candle.close - priceRange.min) / priceSpan) * chartHeight;
 
 // Store wick data
 wicks.push(x + candleWidth / 2, highY, x + candleWidth / 2, lowY);
 
 // Store candle body data
 const bodyTop = Math.min(openY, closeY);
 const bodyHeight = Math.max(1, Math.abs(openY - closeY));
 
 if (isBullish) {
 bullishCandles.push(x, bodyTop, candleWidth, bodyHeight);
 } else {
 bearishCandles.push(x, bodyTop, candleWidth, bodyHeight);
 }
 });

 // Batch draw wicks
 ctx.strokeStyle = colors.text;
 ctx.lineWidth = 1;
 ctx.beginPath();
 for (let i = 0; i < wicks.length; i += 4) {
 ctx.moveTo(wicks[i], wicks[i + 1]);
 ctx.lineTo(wicks[i + 2], wicks[i + 3]);
 }
 ctx.stroke();

 // Batch draw bullish candles
 ctx.fillStyle = colors.bullish;
 ctx.strokeStyle = colors.bullish;
 ctx.lineWidth = 1;
 for (let i = 0; i < bullishCandles.length; i += 4) {
 ctx.strokeRect(bullishCandles[i], bullishCandles[i + 1], bullishCandles[i + 2], bullishCandles[i + 3]);
 }

 // Batch draw bearish candles
 ctx.fillStyle = colors.bearish;
 for (let i = 0; i < bearishCandles.length; i += 4) {
 ctx.fillRect(bearishCandles[i], bearishCandles[i + 1], bearishCandles[i + 2], bearishCandles[i + 3]);
 }
 }, []);

 // Optimized line chart rendering
 const drawLineChart = useCallback((
 ctx: CanvasRenderingContext2D,
 visibleData: ChartDataPoint[],
 chartWidth: number,
 chartHeight: number,
 priceRange: { min: number; max: number },
 colors: Colors
 ) => {
 if (visibleData.length < 2) return;

 const candleSpacing = chartWidth / visibleData.length;
 const priceSpan = priceRange.max - priceRange.min;

 ctx.strokeStyle = colors.bullish;
 ctx.lineWidth = 2;
 ctx.lineCap = 'round';
 ctx.lineJoin = 'round';
 ctx.beginPath();

 visibleData.forEach((candle, index) => {
 const x = 40 + (index * candleSpacing) + candleSpacing / 2;
 const closeY = chartHeight - ((candle.close - priceRange.min) / priceSpan) * chartHeight;
 
 if (index === 0) {
 ctx.moveTo(x, closeY);
 } else {
 ctx.lineTo(x, closeY);
 }
 });
 
 ctx.stroke();
 }, []);

 // Main optimized render function
 const renderChart = useCallback((
 canvas: HTMLCanvasElement,
 options: UseOptimizedRendererOptions
 ) => {
 // Throttle rendering to prevent excessive calls
 const now = performance.now();
 if (now - lastRenderTime.current < 16) { // ~60fps
 return;
 }
 lastRenderTime.current = now;

 if (renderingRef.current) return;
 renderingRef.current = true;

 // Use requestAnimationFrame for smooth rendering
 if (animationFrameRef.current) {
 cancelAnimationFrame(animationFrameRef.current);
 }

 animationFrameRef.current = requestAnimationFrame(() => {
 try {
 const ctx = canvas.getContext('2d');
 if (!ctx || !options.data.length || options.dimensions.width === 0 || options.dimensions.height === 0) {
 renderingRef.current = false;
 return;
 }

 const { width, height } = options.dimensions;
 const colors = getColors(options.config.theme);

 // Set canvas size with device pixel ratio for crisp rendering
 const dpr = window.devicePixelRatio || 1;
 canvas.width = width * dpr;
 canvas.height = height * dpr;
 canvas.style.width = `${width}px`;
 canvas.style.height = `${height}px`;
 ctx.scale(dpr, dpr);

 // Clear canvas
 ctx.fillStyle = colors.background;
 ctx.fillRect(0, 0, width, height);

 // Calculate chart areas
 const timeAxisHeight = 30;
 const chartHeight = height - options.volumeAreaHeight - timeAxisHeight;
 const chartWidth = width - 120;

 // Draw grid if enabled
 if (options.config.showGrid) {
 drawGrid(ctx, width, chartHeight, colors);
 }

 // Calculate visible data
 const startIndex = Math.max(0, Math.floor(options.scrollOffset));
 const endIndex = Math.min(options.data.length, startIndex + options.visibleCandleCount);
 const visibleData = options.data.slice(startIndex, endIndex);

 if (visibleData.length === 0) {
 renderingRef.current = false;
 return;
 }

 // Calculate price range for visible data
 const prices = visibleData.flatMap(d => [d.high, d.low]);
 const minPrice = Math.min(...prices);
 const maxPrice = Math.max(...prices);
 const padding = (maxPrice - minPrice) * 0.1;
 const effectiveRange = {
 min: minPrice - padding,
 max: maxPrice + padding
 };

 // Render chart based on type
 if (options.config.chartType === 'candlestick') {
 drawCandlesticks(ctx, visibleData, chartWidth, chartHeight, effectiveRange, colors);
 } else {
 drawLineChart(ctx, visibleData, chartWidth, chartHeight, effectiveRange, colors);
 }

 console.log(` Optimized render complete: ${visibleData.length} candles, ${width}x${height}`);
 
 } catch (error) {
 console.error(' Rendering error:', error);
 } finally {
 renderingRef.current = false;
 }
 });
 }, [getColors, drawGrid, drawCandlesticks, drawLineChart]);

 // Cleanup function
 const cleanup = useCallback(() => {
 if (animationFrameRef.current) {
 cancelAnimationFrame(animationFrameRef.current);
 animationFrameRef.current = null;
 }
 canvasCache.current.clear();
 renderingRef.current = false;
 }, []);

 // Clear cache function
 const clearCache = useCallback(() => {
 canvasCache.current.clear();
 console.log(' Renderer cache cleared');
 }, []);

 return {
 renderChart,
 cleanup,
 clearCache,
 isRendering: () => renderingRef.current
 };
};