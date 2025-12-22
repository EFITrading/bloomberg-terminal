'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import ChartDataCache from '../../lib/chartDataCache';

// Chart instance interface
interface ChartInstance {
  id: string;
  symbol: string;
  timeframe: string;
}

// Layout types
type ChartLayout = '1x1' | '1x2' | '2x2';

// Chart data point interface
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

interface MultiChartViewProps {
  layout: ChartLayout;
  instances: ChartInstance[];
  activeChartId: string;
  onActiveChartChange: (chartId: string) => void;
  config: any;
  colors: any;
  symbol: string;
  dimensions: any;
  data: ChartDataPoint[];
  scrollOffset: number;
  visibleCandleCount: number;
  priceRange: any;
  crosshair: any;
  isDragging: boolean;
  isDraggingYAxis: boolean;
  isAutoScale: boolean;
  manualPriceRange: { min: number; max: number } | null;
  setScrollOffset: (offset: number) => void;
  setVisibleCandleCount: (count: number) => void;
  setManualPriceRange: (range: { min: number; max: number } | null) => void;
  setIsAutoScale: (auto: boolean) => void;
  setIsDragging: (dragging: boolean) => void;
  setIsDraggingYAxis: (dragging: boolean) => void;
  handleTimeframeChange: (timeframe: string) => void;
  handleMouseMove: (e: React.MouseEvent) => void;
  // All indicator states
  isSeasonalActive: boolean;
  seasonal20YData: any;
  seasonal15YData: any;
  seasonal10YData: any;
  seasonalElectionData: any;
  isSeasonal20YActive: boolean;
  isSeasonal15YActive: boolean;
  isSeasonal10YActive: boolean;
  isSeasonalElectionActive: boolean;
  isGexActive: boolean;
  liveGexData: any;
  gexData: any;
  isExpectedRangeActive: boolean;
  expectedRangeLevels: any;
  isWeeklyActive: boolean;
  isMonthlyActive: boolean;
  isExpansionLiquidationActive: boolean;
  technalysisActive: boolean;
  technalysisFeatures: any;
  isFlowChartActive: boolean;
  flowChartData: any[];
  flowChartHeight: number;
  isIVRankActive: boolean;
  isIVPercentileActive: boolean;
  isHVActive: boolean;
  showIVPanel: boolean;
  ivData: any[];
  isIVLoading: boolean;
  showCallIVLine: boolean;
  showPutIVLine: boolean;
  showNetIVLine: boolean;
  hvWindow: number;
  ivPanelHeight: number;
  drawings: any[];
  activeTool: string | null;
  // Render functions from main chart
  renderExpectedRangeLines: any;
  renderGEXLevels: any;
  detectExpansionLiquidation: any;
  invalidateTouchedZones: any;
  renderExpansionLiquidationZone: any;
  renderTechnalysisIndicators: any;
  // Mouse handlers
  handleUnifiedMouseDown: any;
  handleCanvasMouseMove: any;
  handleMouseLeave: any;
}

export default function MultiChartView({
  layout,
  instances,
  activeChartId,
  onActiveChartChange,
  config,
  colors,
  symbol,
  dimensions,
  data,
  scrollOffset,
  visibleCandleCount,
  priceRange,
  crosshair,
  isDragging,
  isDraggingYAxis,
  isAutoScale,
  manualPriceRange,
  setScrollOffset,
  setVisibleCandleCount,
  setManualPriceRange,
  setIsAutoScale,
  setIsDragging,
  setIsDraggingYAxis,
  handleTimeframeChange,
  handleMouseMove,
  isSeasonalActive,
  seasonal20YData,
  seasonal15YData,
  seasonal10YData,
  seasonalElectionData,
  isSeasonal20YActive,
  isSeasonal15YActive,
  isSeasonal10YActive,
  isSeasonalElectionActive,
  isGexActive,
  liveGexData,
  gexData,
  isExpectedRangeActive,
  expectedRangeLevels,
  isWeeklyActive,
  isMonthlyActive,
  isExpansionLiquidationActive,
  technalysisActive,
  technalysisFeatures,
  isFlowChartActive,
  flowChartData,
  flowChartHeight,
  isIVRankActive,
  isIVPercentileActive,
  isHVActive,
  showIVPanel,
  ivData,
  isIVLoading,
  showCallIVLine,
  showPutIVLine,
  showNetIVLine,
  hvWindow,
  ivPanelHeight,
  drawings,
  activeTool,
  renderExpectedRangeLines,
  renderGEXLevels,
  detectExpansionLiquidation,
  invalidateTouchedZones,
  renderExpansionLiquidationZone,
  renderTechnalysisIndicators,
  handleUnifiedMouseDown,
  handleCanvasMouseMove,
  handleMouseLeave,
}: MultiChartViewProps) {
  
  // Per-chart storage refs
  const chartCanvasRefs = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const overlayCanvasRefs = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const chartDataMap = useRef<Map<string, ChartDataPoint[]>>(new Map());
  const chartScrollMap = useRef<Map<string, number>>(new Map());
  const chartZoomMap = useRef<Map<string, number>>(new Map());
  const chartPriceRangeMap = useRef<Map<string, { min: number; max: number } | null>>(new Map());
  const chartCrosshairMap = useRef<Map<string, { x: number; y: number }>>(new Map());
  const chartLoadingMap = useRef<Map<string, boolean>>(new Map());
  const chartDragStateMap = useRef<Map<string, { startX: number; startY: number; startScroll: number }>>(new Map());

  // Comprehensive chart rendering with ALL features
  const renderChartInstance = useCallback((chartId: string) => {
    const canvas = chartCanvasRefs.current.get(chartId);
    const chartData = chartDataMap.current.get(chartId);
    const chartInstance = instances.find(ci => ci.id === chartId);
    
    if (!canvas || !chartData || !chartInstance || chartData.length === 0) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);
    
    ctx.imageSmoothingEnabled = false;
    
    // Clear canvas
    ctx.fillStyle = colors.background;
    ctx.fillRect(0, 0, width, height);
    
    // Calculate dimensions (same as main chart)
    const timeAxisHeight = 30;
    const actualFlowChartHeight = isFlowChartActive ? flowChartHeight : 0;
    const activeIVPanelCount = [isIVRankActive, isIVPercentileActive, isHVActive].filter(Boolean).length;
    const actualIVPanelHeight = activeIVPanelCount > 0 ? (activeIVPanelCount * ivPanelHeight) : 0;
    const volumeAreaHeight = 80;
    const totalBottomSpace = actualFlowChartHeight + actualIVPanelHeight + volumeAreaHeight + timeAxisHeight;
    const priceChartHeight = height - totalBottomSpace;
    const chartWidth = width - 120;
    
    // Get or initialize scroll/zoom
    if (!chartZoomMap.current.has(chartId)) {
      chartZoomMap.current.set(chartId, 100);
    }
    if (!chartScrollMap.current.has(chartId)) {
      chartScrollMap.current.set(chartId, Math.max(0, chartData.length - 100));
    }
    
    const instanceVisibleCount = chartZoomMap.current.get(chartId) || 100;
    const instanceScrollOffset = chartScrollMap.current.get(chartId) || 0;
    
    // Calculate future periods for 20% right buffer (same as main chart)
    const getFuturePeriods = (visibleCount: number): number => {
      if (visibleCount <= 50) return 10;
      if (visibleCount <= 100) return 15;
      if (visibleCount <= 200) return 20;
      return 25;
    };
    const futurePeriods = getFuturePeriods(instanceVisibleCount);
    const maxFuturePeriods = Math.min(futurePeriods, Math.ceil(instanceVisibleCount * 0.2));
    
    // Calculate visible data with buffer
    const startIndex = Math.max(0, Math.floor(instanceScrollOffset));
    const endIndex = Math.min(chartData.length + maxFuturePeriods, startIndex + instanceVisibleCount);
    const visibleData = chartData.slice(startIndex, Math.min(endIndex, chartData.length));
    
    // Extend visible area to include future candles if scrolled to the end
    const futureCandles = Math.max(0, endIndex - chartData.length);
    const totalVisibleCount = visibleData.length + futureCandles;
    
    if (visibleData.length === 0 && futureCandles === 0) return;
    
    // Calculate candle spacing using total visible count (includes buffer)
    const candleWidth = Math.max(2, chartWidth / totalVisibleCount * 0.8);
    const candleSpacing = chartWidth / totalVisibleCount;
    
    // Helper function to determine if timestamp is during market hours
    const isMarketHours = (timestamp: number): boolean => {
      const date = new Date(timestamp);
      const pstString = date.toLocaleString("en-US", {timeZone: "America/Los_Angeles"});
      const pstDate = new Date(pstString);
      const hour = pstDate.getHours();
      const minute = pstDate.getMinutes();
      const totalMinutes = hour * 60 + minute;
      const marketOpen = 6 * 60 + 30; // 6:30 AM PST
      const marketClose = 13 * 60; // 1:00 PM PST
      return totalMinutes >= marketOpen && totalMinutes < marketClose;
    };
    
    // Draw market hours background shading (afterhours coloring)
    if (chartInstance.timeframe.includes('m') || chartInstance.timeframe.includes('h')) {
      visibleData.forEach((candle, index) => {
        const x = 40 + (index * candleSpacing);
        const isMarket = isMarketHours(candle.timestamp);
        if (!isMarket) {
          ctx.fillStyle = colors.grid + '20'; // Semi-transparent gray for afterhours
          ctx.fillRect(x, 0, candleSpacing, height);
        }
      });
    }
    
    // Calculate price range - use manual if set, otherwise auto
    const manualRange = chartPriceRangeMap.current.get(chartId);
    let adjustedMax: number;
    let adjustedMin: number;
    
    if (manualRange) {
      // Use manual price range from vertical drag
      adjustedMax = manualRange.max;
      adjustedMin = manualRange.min;
    } else {
      // Auto calculate from visible data
      const visiblePrices = visibleData.flatMap(d => [d.high, d.low]);
      const maxPrice = Math.max(...visiblePrices);
      const minPrice = Math.min(...visiblePrices);
      const priceRange = maxPrice - minPrice;
      const pricePadding = priceRange * 0.1;
      adjustedMax = maxPrice + pricePadding;
      adjustedMin = minPrice - pricePadding;
    }
    
    // Expand for Expected Range if active
    if (isExpectedRangeActive && expectedRangeLevels && !manualRange) {
      const allLevels = [
        expectedRangeLevels.weekly80Call,
        expectedRangeLevels.weekly90Call,
        expectedRangeLevels.weekly80Put,
        expectedRangeLevels.weekly90Put,
        expectedRangeLevels.monthly80Call,
        expectedRangeLevels.monthly90Call,
        expectedRangeLevels.monthly80Put,
        expectedRangeLevels.monthly90Put
      ];
      const minLevel = Math.min(...allLevels);
      const maxLevel = Math.max(...allLevels);
      const originalRange = adjustedMax - adjustedMin;
      const padding = originalRange * 0.05;
      adjustedMin = Math.min(adjustedMin, minLevel - padding);
      adjustedMax = Math.max(adjustedMax, maxLevel + padding);
    }
    
    const adjustedRange = adjustedMax - adjustedMin;
    
    // Draw candles
    if (config.chartType === 'line') {
      if (visibleData.length > 1) {
        ctx.strokeStyle = colors.bullish;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        visibleData.forEach((candle, index) => {
          const x = 40 + (index * candleSpacing) + candleSpacing / 2;
          const closeY = priceChartHeight - ((candle.close - adjustedMin) / (adjustedMax - adjustedMin)) * priceChartHeight;
          if (index === 0) {
            ctx.moveTo(x, closeY);
          } else {
            ctx.lineTo(x, closeY);
          }
        });
        ctx.stroke();
      }
    } else {
      // Candlesticks
      visibleData.forEach((candle, index) => {
        const x = Math.round(40 + (index * candleSpacing) + (candleSpacing - candleWidth) / 2);
        const isBullish = candle.close >= candle.open;
        const highY = priceChartHeight - ((candle.high - adjustedMin) / (adjustedMax - adjustedMin)) * priceChartHeight;
        const lowY = priceChartHeight - ((candle.low - adjustedMin) / (adjustedMax - adjustedMin)) * priceChartHeight;
        const openY = priceChartHeight - ((candle.open - adjustedMin) / (adjustedMax - adjustedMin)) * priceChartHeight;
        const closeY = priceChartHeight - ((candle.close - adjustedMin) / (adjustedMax - adjustedMin)) * priceChartHeight;
        
        // Wick
        ctx.strokeStyle = isBullish ? config.colors.bullish.wick : config.colors.bearish.wick;
        ctx.lineWidth = Math.max(1, candleWidth * 0.1);
        ctx.beginPath();
        ctx.moveTo(x + candleWidth / 2, highY);
        ctx.lineTo(x + candleWidth / 2, lowY);
        ctx.stroke();
        
        // Body
        const bodyTop = Math.min(openY, closeY);
        const bodyHeight = Math.max(1, Math.abs(closeY - openY));
        ctx.fillStyle = isBullish ? config.colors.bullish.body : config.colors.bearish.body;
        ctx.fillRect(x + candleWidth * 0.1, bodyTop, candleWidth * 0.8, bodyHeight);
      });
    }
    
    // Draw price scale
    ctx.fillStyle = colors.text;
    ctx.font = 'bold 20px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'left';
    const priceScaleX = chartWidth + 10;
    const steps = 10;
    for (let i = 0; i <= steps; i++) {
      const ratio = i / steps;
      const price = adjustedMin + (adjustedMax - adjustedMin) * (1 - ratio);
      const y = priceChartHeight - ((price - adjustedMin) / (adjustedMax - adjustedMin)) * priceChartHeight;
      ctx.fillStyle = colors.text;
      ctx.fillText(price.toFixed(2), priceScaleX, y + 4);
      ctx.strokeStyle = colors.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(chartWidth, y);
      ctx.lineTo(chartWidth + 5, y);
      ctx.stroke();
    }
    
    // Draw Expected Range lines if active
    if (isExpectedRangeActive && expectedRangeLevels && renderExpectedRangeLines) {
      if (isWeeklyActive) renderExpectedRangeLines(ctx, chartWidth, priceChartHeight, adjustedMin, adjustedMax, expectedRangeLevels, 'weekly', visibleData, instanceVisibleCount);
      if (isMonthlyActive) renderExpectedRangeLines(ctx, chartWidth, priceChartHeight, adjustedMin, adjustedMax, expectedRangeLevels, 'monthly', visibleData, instanceVisibleCount);
    }
    
    // Draw Seasonal lines if active
    if (isSeasonalActive && visibleData.length > 0) {
      const lastVisibleCandle = visibleData[visibleData.length - 1];
      const lastCandleTime = new Date(lastVisibleCandle.timestamp).getTime();
      const lastCandlePrice = lastVisibleCandle.close;
      const lastCandleIndex = visibleData.length - 1;
      const lastCandleX = 40 + (lastCandleIndex * candleSpacing) + candleSpacing / 2;
      const lastCandleY = priceChartHeight - ((lastCandlePrice - adjustedMin) / (adjustedMax - adjustedMin)) * priceChartHeight;
      
      const drawSeasonalLine = (projectionData: Array<{date: Date, price: number}> | null, color: string, isDashed: boolean) => {
        if (!projectionData || projectionData.length === 0) return;
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        if (isDashed) ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(lastCandleX, lastCandleY);
        projectionData.forEach((point) => {
          const pointTime = point.date.getTime();
          const timeDiff = pointTime - lastCandleTime;
          const daysFromEnd = timeDiff / (24 * 60 * 60 * 1000);
          const x = lastCandleX + (daysFromEnd * candleSpacing);
          const y = priceChartHeight - ((point.price - adjustedMin) / (adjustedMax - adjustedMin)) * priceChartHeight;
          if (y >= 0 && y <= priceChartHeight) {
            ctx.lineTo(x, y);
          }
        });
        ctx.stroke();
        ctx.restore();
      };
      
      if (isSeasonal20YActive) drawSeasonalLine(seasonal20YData, '#FFFFFF', false);
      if (isSeasonal15YActive) drawSeasonalLine(seasonal15YData, '#FFD700', false);
      if (isSeasonal10YActive) drawSeasonalLine(seasonal10YData, '#4169E1', false);
      if (isSeasonalElectionActive) drawSeasonalLine(seasonalElectionData, '#9370DB', true);
    }
    
    // Draw GEX levels if active
    if (isGexActive && (liveGexData || gexData) && renderGEXLevels) {
      const gexDataToUse = liveGexData || gexData;
      renderGEXLevels(ctx, chartWidth, priceChartHeight, adjustedMin, adjustedMax, gexDataToUse);
    }
    
    // Draw Expansion/Liquidation zones if active
    if (isExpansionLiquidationActive && detectExpansionLiquidation && invalidateTouchedZones && renderExpansionLiquidationZone) {
      const allZones = detectExpansionLiquidation(chartData);
      const validZones = invalidateTouchedZones(allZones, chartData);
      validZones.forEach((zone: any) => {
        if (!zone.isValid) return;
        if (zone.breakoutIndex >= startIndex && zone.breakoutIndex <= endIndex + 50) {
          renderExpansionLiquidationZone(ctx, zone, chartData, chartWidth, priceChartHeight, adjustedMin, adjustedMax, startIndex, instanceVisibleCount);
        }
      });
    }
    
    // Draw Technalysis indicators if active
    const anyFeatureEnabled = technalysisActive || Object.values(technalysisFeatures).some((f: any) => f);
    if (anyFeatureEnabled && renderTechnalysisIndicators) {
      renderTechnalysisIndicators(ctx, chartData, chartWidth, priceChartHeight, adjustedMin, adjustedMax, startIndex, instanceVisibleCount, technalysisFeatures);
    }
    
    // Draw volume bars
    const maxVolume = Math.max(...visibleData.map(d => d.volume));
    const hexToRgba = (hex: string, alpha: number) => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };
    
    const volumeStartY = priceChartHeight;
    const volumeEndY = priceChartHeight + volumeAreaHeight;
    
    visibleData.forEach((candle, index) => {
      const x = Math.round(40 + (index * candleSpacing) + (candleSpacing - candleWidth) / 2);
      const volumeValue = candle.volume;
      if (!volumeValue || volumeValue <= 0) return;
      const volumeHeight = (volumeValue / maxVolume) * volumeAreaHeight;
      const barY = volumeEndY - volumeHeight;
      const isGreen = candle.close > candle.open;
      const volumeColor = isGreen ? config.colors.volume.bullish : config.colors.volume.bearish;
      ctx.fillStyle = hexToRgba(volumeColor, 0.7);
      ctx.fillRect(x, barY, Math.round(candleWidth), volumeHeight);
      ctx.strokeStyle = hexToRgba(volumeColor, 0.9);
      ctx.lineWidth = 0.5;
      ctx.strokeRect(x, barY, Math.round(candleWidth), volumeHeight);
    });
    
    // Draw time axis
    const timeAxisY = height - timeAxisHeight;
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, timeAxisY);
    ctx.lineTo(width, timeAxisY);
    ctx.stroke();
    
    ctx.fillStyle = colors.text;
    ctx.font = 'bold 11px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    
    if (visibleData.length > 0) {
      const numTimeLabels = Math.min(6, Math.floor(visibleData.length / 10));
      for (let i = 0; i <= numTimeLabels; i++) {
        const dataIndex = Math.floor((i / numTimeLabels) * (visibleData.length - 1));
        const candle = visibleData[dataIndex];
        const x = 40 + (dataIndex * candleSpacing) + candleSpacing / 2;
        const date = new Date(candle.timestamp);
        
        // Smart date formatting based on timeframe (same as main chart)
        let dateLabel: string;
        const tf = chartInstance.timeframe;
        if (tf === '1m' || tf === '5m' || tf === '15m' || tf === '30m') {
          // Intraday: show time only
          const hours = date.getHours().toString().padStart(2, '0');
          const mins = date.getMinutes().toString().padStart(2, '0');
          dateLabel = `${hours}:${mins}`;
        } else if (tf === '1h' || tf === '2h' || tf === '4h') {
          // Hourly: show date + time
          const month = (date.getMonth() + 1).toString().padStart(2, '0');
          const day = date.getDate().toString().padStart(2, '0');
          const hours = date.getHours().toString().padStart(2, '0');
          dateLabel = `${month}/${day} ${hours}:00`;
        } else {
          // Daily and above: show date only
          const month = (date.getMonth() + 1).toString().padStart(2, '0');
          const day = date.getDate().toString().padStart(2, '0');
          const year = date.getFullYear().toString().slice(-2);
          dateLabel = `${month}/${day}/${year}`;
        }
        ctx.fillText(dateLabel, x, timeAxisY + 18);
      }
    }
    
  }, [instances, colors, config, isExpectedRangeActive, expectedRangeLevels, isWeeklyActive, isMonthlyActive, isSeasonalActive, seasonal20YData, seasonal15YData, seasonal10YData, seasonalElectionData, isSeasonal20YActive, isSeasonal15YActive, isSeasonal10YActive, isSeasonalElectionActive, isGexActive, liveGexData, gexData, isExpansionLiquidationActive, technalysisActive, technalysisFeatures, isFlowChartActive, flowChartHeight, isIVRankActive, isIVPercentileActive, isHVActive, ivPanelHeight, drawings, renderExpectedRangeLines, renderGEXLevels, detectExpansionLiquidation, invalidateTouchedZones, renderExpansionLiquidationZone, renderTechnalysisIndicators]);

  // Fetch data for each chart instance when symbol or timeframe changes
  useEffect(() => {
    const fetchData = async () => {
      for (const chartInstance of instances) {
        const { id, symbol: chartSymbol, timeframe: chartTimeframe } = chartInstance;
        
        if (!chartSymbol || !chartTimeframe) continue;
        
        console.log(`🔄 MultiChart: Fetching data for chart ${id}: ${chartSymbol} ${chartTimeframe}`);
        chartLoadingMap.current.set(id, true);
        
        try {
          // Check if this is a new symbol/timeframe combo for this chart - if so, clear scroll state
          const existingData = chartDataMap.current.get(id);
          const cache = ChartDataCache.getInstance();
          
          const data = await cache.getOrFetch(chartSymbol, chartTimeframe, async () => {
            console.log(`📡 Fetching fresh data from API for ${chartSymbol} ${chartTimeframe}`);
            const now = new Date();
            const endDate = now.toISOString().split('T')[0];
            const daysBack = 365;
            const startDate = new Date(now.getTime() - (daysBack * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];
            
            const response = await fetch(
              `/api/historical-data?symbol=${chartSymbol}&startDate=${startDate}&endDate=${endDate}&timeframe=${chartTimeframe}&ultrafast=true`
            );
            
            if (!response.ok) throw new Error(`API error: ${response.status}`);
            const result = await response.json();
            
            if (!result?.results?.length) throw new Error(`No data available`);
            
            return result.results.map((item: any) => ({
              timestamp: item.t,
              open: item.o,
              high: item.h,
              low: item.l,
              close: item.c,
              volume: item.v || 0,
              date: new Date(item.t).toLocaleDateString(),
              time: new Date(item.t).toLocaleTimeString()
            }));
          });
          
          console.log(`✅ Got data for ${chartSymbol}: ${data.length} candles`);
          chartDataMap.current.set(id, data);
          chartLoadingMap.current.set(id, false);
          
          // Reset scroll position when symbol changes
          chartScrollMap.current.set(id, Math.max(0, data.length - 100));
          
          renderChartInstance(id);
        } catch (error) {
          console.error(`❌ Error fetching data for ${chartSymbol}:`, error);
          chartLoadingMap.current.set(id, false);
        }
      }
    };
    
    fetchData();
  }, [JSON.stringify(instances.map(i => ({ symbol: i.symbol, timeframe: i.timeframe }))), renderChartInstance]);

  // Re-render when any indicator state changes
  useEffect(() => {
    instances.forEach(ci => {
      const data = chartDataMap.current.get(ci.id);
      if (data && data.length > 0) {
        renderChartInstance(ci.id);
      }
    });
  }, [renderChartInstance, isSeasonalActive, isGexActive, isExpectedRangeActive, isExpansionLiquidationActive, technalysisActive, isFlowChartActive]);

  // Grid layout styles
  const getGridStyle = () => {
    if (layout === '1x1') return { gridTemplateColumns: '1fr', gridTemplateRows: '1fr' };
    if (layout === '1x2') return { gridTemplateColumns: '1fr', gridTemplateRows: '1fr 1fr' };
    if (layout === '2x2') return { gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr' };
    return {};
  };

  return (
    <div 
      className="w-full h-full grid gap-1"
      style={{
        ...getGridStyle(),
        background: '#000000'
      }}
    >
      {instances.map((chartInstance) => (
        <div
          key={chartInstance.id}
          className="relative"
          style={{
            border: activeChartId === chartInstance.id ? '2px solid rgba(255, 255, 255, 0.3)' : '1px solid #333333',
            transition: 'border-color 0.2s ease',
            background: '#000000'
          }}
        >
          {/* Chart identifier badge */}
          <div style={{
            position: 'absolute',
            top: '8px',
            left: '8px',
            zIndex: 30,
            background: 'rgba(0, 0, 0, 0.7)',
            color: activeChartId === chartInstance.id ? '#ff8833' : '#ffffff',
            padding: '6px 12px',
            borderRadius: '4px',
            fontSize: '13px',
            fontWeight: 'bold',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            pointerEvents: 'none',
            fontFamily: '"Segoe UI", system-ui, sans-serif',
            letterSpacing: '0.5px'
          }}>
            {chartInstance.symbol} · {chartInstance.timeframe.toUpperCase()}
          </div>

          {/* Main Chart Canvas */}
          <canvas
            ref={(el) => {
              if (el) {
                chartCanvasRefs.current.set(chartInstance.id, el);
                const container = el.parentElement;
                if (container) {
                  const rect = container.getBoundingClientRect();
                  const dpr = window.devicePixelRatio || 1;
                  el.width = rect.width * dpr;
                  el.height = rect.height * dpr;
                  el.style.width = `${rect.width}px`;
                  el.style.height = `${rect.height}px`;
                }
                // Only render if we have data
                if (chartDataMap.current.has(chartInstance.id)) {
                  setTimeout(() => renderChartInstance(chartInstance.id), 50);
                }
              }
            }}
            className="absolute top-0 left-0 z-10"
            style={{ width: '100%', height: '100%', display: 'block' }}
          />

          {/* Overlay Canvas for interactions */}
          <canvas
            ref={(el) => {
              if (el) {
                overlayCanvasRefs.current.set(chartInstance.id, el);
                const rect = el.getBoundingClientRect();
                const dpr = window.devicePixelRatio || 1;
                el.width = rect.width * dpr;
                el.height = rect.height * dpr;
                el.style.width = `${rect.width}px`;
                el.style.height = `${rect.height}px`;
              }
            }}
            className="absolute inset-0 z-20"
            onClick={(e) => {
              e.stopPropagation();
              onActiveChartChange(chartInstance.id);
            }}
            onMouseMove={(e) => {
              if (activeTool && activeChartId === chartInstance.id) {
                handleCanvasMouseMove(e as any);
                return;
              }
              
              const rect = e.currentTarget.getBoundingClientRect();
              const x = e.clientX - rect.left;
              const y = e.clientY - rect.top;
              
              chartCrosshairMap.current.set(chartInstance.id, { x, y });
              
              const canvas = e.currentTarget;
              const ctx = canvas.getContext('2d');
              if (!ctx) return;
              
              const dpr = window.devicePixelRatio || 1;
              const canvasWidth = rect.width;
              const canvasHeight = rect.height;
              
              ctx.clearRect(0, 0, canvas.width, canvas.height);
              ctx.save();
              ctx.scale(dpr, dpr);
              
              // Draw crosshair
              ctx.strokeStyle = config.theme === 'dark' ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)';
              ctx.lineWidth = 1;
              ctx.setLineDash([4, 4]);
              
              ctx.beginPath();
              ctx.moveTo(x, 0);
              ctx.lineTo(x, canvasHeight);
              ctx.stroke();
              
              ctx.beginPath();
              ctx.moveTo(0, y);
              ctx.lineTo(canvasWidth, y);
              ctx.stroke();
              
              ctx.restore();
            }}
            onMouseLeave={(e) => {
              const canvas = e.currentTarget;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
              }
              chartCrosshairMap.current.delete(chartInstance.id);
              
              if (activeChartId === chartInstance.id) {
                handleMouseLeave();
              }
            }}
            onWheel={(e) => {
              const delta = e.deltaY;
              const chartData = chartDataMap.current.get(chartInstance.id);
              if (!chartData) return;
              
              const currentZoom = chartZoomMap.current.get(chartInstance.id) || 100;
              const zoomFactor = delta > 0 ? 1.1 : 0.9;
              const newZoom = Math.max(20, Math.min(500, Math.round(currentZoom * zoomFactor)));
              chartZoomMap.current.set(chartInstance.id, newZoom);
              
              const currentScroll = chartScrollMap.current.get(chartInstance.id) || 0;
              const scrollAdjust = (newZoom - currentZoom) / 2;
              chartScrollMap.current.set(chartInstance.id, Math.max(0, Math.min(chartData.length - newZoom, currentScroll - scrollAdjust)));
              
              renderChartInstance(chartInstance.id);
            }}
            onMouseDown={(e) => {
              onActiveChartChange(chartInstance.id);
              
              if (activeTool && activeChartId === chartInstance.id) {
                handleUnifiedMouseDown(e as any);
                return;
              }
              
              if (e.button !== 0) return;
              
              e.preventDefault();
              e.stopPropagation();
              
              const canvas = e.currentTarget as HTMLCanvasElement;
              const rect = canvas.getBoundingClientRect();
              const startX = e.clientX;
              const startY = e.clientY;
              const x = startX - rect.left;
              const y = startY - rect.top;
              
              const chartData = chartDataMap.current.get(chartInstance.id);
              if (!chartData) return;
              
              const startScroll = chartScrollMap.current.get(chartInstance.id) || 0;
              const zoom = chartZoomMap.current.get(chartInstance.id) || 100;
              const chartWidth = rect.width - 120;
              
              // Detect drag mode: SHIFT key for vertical, default for horizontal
              const isVerticalDrag = e.shiftKey;
              
              // Get initial price range for vertical drag
              const visiblePrices = chartData.slice(Math.floor(startScroll), Math.floor(startScroll) + zoom).flatMap(d => [d.high, d.low]);
              const maxPrice = Math.max(...visiblePrices);
              const minPrice = Math.min(...visiblePrices);
              const priceRange = maxPrice - minPrice;
              const padding = priceRange * 0.1;
              const startPriceRange = { min: minPrice - padding, max: maxPrice + padding };
              
              canvas.style.cursor = isVerticalDrag ? 'ns-resize' : 'grabbing';
              
              const handleMove = (moveE: MouseEvent) => {
                const currentX = moveE.clientX;
                const currentY = moveE.clientY;
                const totalDeltaX = currentX - startX;
                const totalDeltaY = currentY - startY;
                
                if (isVerticalDrag) {
                  // Vertical drag - pan Y-axis (price)
                  const timeAxisHeight = 30;
                  const actualFlowChartHeight = isFlowChartActive ? flowChartHeight : 0;
                  const activeIVPanelCount = [isIVRankActive, isIVPercentileActive, isHVActive].filter(Boolean).length;
                  const actualIVPanelHeight = activeIVPanelCount > 0 ? (activeIVPanelCount * ivPanelHeight) : 0;
                  const volumeAreaHeight = 80;
                  const totalBottomSpace = actualFlowChartHeight + actualIVPanelHeight + volumeAreaHeight + timeAxisHeight;
                  const priceChartHeight = rect.height - totalBottomSpace;
                  
                  const priceSpan = startPriceRange.max - startPriceRange.min;
                  const panAmount = (totalDeltaY / priceChartHeight) * priceSpan;
                  
                  const newPriceRange = {
                    min: startPriceRange.min + panAmount,
                    max: startPriceRange.max + panAmount
                  };
                  chartPriceRangeMap.current.set(chartInstance.id, newPriceRange);
                } else {
                  // Horizontal drag - pan time
                  const pixelsPerCandle = chartWidth / zoom;
                  const candlesDelta = -(totalDeltaX / pixelsPerCandle);
                  const futurePeriods = zoom <= 50 ? 10 : zoom <= 100 ? 15 : zoom <= 200 ? 20 : 25;
                  const maxFuturePeriods = Math.min(futurePeriods, Math.ceil(zoom * 0.2));
                  const maxScrollOffset = chartData.length - zoom + maxFuturePeriods;
                  const newScroll = Math.max(0, Math.min(maxScrollOffset, startScroll + candlesDelta));
                  chartScrollMap.current.set(chartInstance.id, newScroll);
                }
                renderChartInstance(chartInstance.id);
              };
              
              const handleUp = () => {
                canvas.style.cursor = 'crosshair';
                document.removeEventListener('mousemove', handleMove);
                document.removeEventListener('mouseup', handleUp);
              };
              
              document.addEventListener('mousemove', handleMove);
              document.addEventListener('mouseup', handleUp);
            }}
            style={{ 
              width: '100%',
              height: '100%',
              cursor: 'crosshair'
            }}
          />
        </div>
      ))}
    </div>
  );
}