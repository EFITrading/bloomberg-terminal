'use client';

import React, { useRef, useEffect, useCallback } from 'react';
import ChartDataCache from '../../lib/chartDataCache';

interface ChartInstance { id: string; symbol: string; timeframe: string; }
type ChartLayout = '1x1' | '1x2' | '2x2';
interface ChartDataPoint { timestamp: number; open: number; high: number; low: number; close: number; volume: number; date: string; time: string; }

interface MultiChartViewProps {
  layout: ChartLayout; instances: ChartInstance[]; activeChartId: string;
  onActiveChartChange: (chartId: string) => void; config: any; colors: any;
  symbol: string; dimensions: any; data: ChartDataPoint[]; scrollOffset: number;
  visibleCandleCount: number; priceRange: any; crosshair: any; isDragging: boolean;
  isDraggingYAxis: boolean; isAutoScale: boolean; manualPriceRange: { min: number; max: number } | null;
  setScrollOffset: (offset: number) => void; setVisibleCandleCount: (count: number) => void;
  setManualPriceRange: (range: { min: number; max: number } | null) => void;
  setIsAutoScale: (auto: boolean) => void; setIsDragging: (dragging: boolean) => void;
  setIsDraggingYAxis: (dragging: boolean) => void;
  handleTimeframeChange: (timeframe: string) => void; handleMouseMove: (e: React.MouseEvent) => void;
  isSeasonalActive: boolean; seasonal20YData: any; seasonal15YData: any; seasonal10YData: any;
  seasonalElectionData: any; isSeasonal20YActive: boolean; isSeasonal15YActive: boolean;
  isSeasonal10YActive: boolean; isSeasonalElectionActive: boolean;
  isExpectedRangeActive: boolean; expectedRangeLevels: any;
  isWeeklyActive: boolean; isMonthlyActive: boolean; isExpansionLiquidationActive: boolean;
  technalysisActive: boolean; technalysisFeatures: any; isFlowChartActive: boolean;
  flowChartData: any[]; flowChartHeight: number; isIVRankActive: boolean; isIVPercentileActive: boolean;
  isHVActive: boolean; showIVPanel: boolean; ivData: any[]; isIVLoading: boolean;
  showCallIVLine: boolean; showPutIVLine: boolean; showNetIVLine: boolean; hvWindow: number;
  ivPanelHeight: number; drawings: any[]; activeTool: string | null;
  renderExpectedRangeLines: any; detectExpansionLiquidation: any;
  invalidateTouchedZones: any; renderExpansionLiquidationZone: any; renderTechnalysisIndicators: any;
  handleUnifiedMouseDown: any; handleCanvasMouseMove: any; handleMouseLeave: any;
  perChartIndicators?: Record<string, Record<string, any>>;
}

export default function MultiChartView({
  layout, instances, activeChartId, onActiveChartChange, config, colors,
  symbol, dimensions, data, scrollOffset, visibleCandleCount, priceRange, crosshair,
  isDragging, isDraggingYAxis, isAutoScale, manualPriceRange,
  setScrollOffset, setVisibleCandleCount, setManualPriceRange, setIsAutoScale,
  setIsDragging, setIsDraggingYAxis, handleTimeframeChange, handleMouseMove,
  isSeasonalActive, seasonal20YData, seasonal15YData, seasonal10YData, seasonalElectionData,
  isSeasonal20YActive, isSeasonal15YActive, isSeasonal10YActive, isSeasonalElectionActive,
  isExpectedRangeActive, expectedRangeLevels,
  isWeeklyActive, isMonthlyActive, isExpansionLiquidationActive, technalysisActive, technalysisFeatures,
  isFlowChartActive, flowChartData, flowChartHeight, isIVRankActive, isIVPercentileActive,
  isHVActive, showIVPanel, ivData, isIVLoading, showCallIVLine, showPutIVLine, showNetIVLine,
  hvWindow, ivPanelHeight, drawings, activeTool,
  renderExpectedRangeLines, renderGEXLevels, detectExpansionLiquidation,
  invalidateTouchedZones, renderExpansionLiquidationZone, renderTechnalysisIndicators,
  handleUnifiedMouseDown, handleCanvasMouseMove, handleMouseLeave,
  perChartIndicators = {},
}: MultiChartViewProps) {

  const chartCanvasRefs = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const overlayCanvasRefs = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const chartDataMap = useRef<Map<string, ChartDataPoint[]>>(new Map());
  const chartScrollMap = useRef<Map<string, number>>(new Map());
  const chartZoomMap = useRef<Map<string, number>>(new Map());
  const chartPriceRangeMap = useRef<Map<string, { min: number; max: number } | null>>(new Map());
  const chartLoadingMap = useRef<Map<string, boolean>>(new Map());
  const chartComputedStateMap = useRef<Map<string, {
    adjustedMin: number; adjustedMax: number; priceChartHeight: number; chartWidth: number;
    candleSpacing: number; visibleData: ChartDataPoint[]; startIndex: number; timeframe: string;
  }>>(new Map());

  const isMultiChart = layout !== '1x1';
  const getFP = (n: number) => n <= 50 ? 10 : n <= 100 ? 15 : n <= 200 ? 20 : 25;

  const renderChartInstance = useCallback((chartId: string) => {
    const canvas = chartCanvasRefs.current.get(chartId);
    const chartData = chartDataMap.current.get(chartId);
    const inst = instances.find(ci => ci.id === chartId);
    if (!canvas || !chartData || !inst || chartData.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const W = rect.width, H = rect.height;
    if (W === 0 || H === 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
    ctx.scale(dpr, dpr);
    ctx.imageSmoothingEnabled = false;

    ctx.fillStyle = colors.background || '#000000';
    ctx.fillRect(0, 0, W, H);

    // Per-chart indicator isolation
    const ovr = perChartIndicators[chartId] || {};
    const d = (k: string, g: boolean) => ovr[k] !== undefined ? ovr[k] : (isMultiChart ? false : g);
    const eRA = d('isExpectedRangeActive', isExpectedRangeActive);
    const wkA = d('isWeeklyActive', isWeeklyActive);
    const moA = d('isMonthlyActive', isMonthlyActive);
    const seaA = d('isSeasonalActive', isSeasonalActive);
    const s20A = d('isSeasonal20YActive', isSeasonal20YActive);
    const s15A = d('isSeasonal15YActive', isSeasonal15YActive);
    const s10A = d('isSeasonal10YActive', isSeasonal10YActive);
    const selA = d('isSeasonalElectionActive', isSeasonalElectionActive);
    const expA = d('isExpansionLiquidationActive', isExpansionLiquidationActive);
    const tecA = d('technalysisActive', technalysisActive);
    const flwA = d('isFlowChartActive', isFlowChartActive);

    const timeAxisH = 30;
    const flowH = flwA ? flowChartHeight : 0;
    const ivCount = [isIVRankActive, isIVPercentileActive, isHVActive].filter(Boolean).length;
    const ivH = ivCount > 0 ? ivCount * ivPanelHeight : 0;
    const volH = 80;
    const botH = flowH + ivH + volH + timeAxisH;
    const priceCH = H - botH;
    const chartW = W - 120;

    if (!chartZoomMap.current.has(chartId))
      chartZoomMap.current.set(chartId, Math.max(30, Math.min(300, Math.floor(chartW / 8))));
    if (!chartScrollMap.current.has(chartId)) {
      const def = chartZoomMap.current.get(chartId)!;
      chartScrollMap.current.set(chartId, Math.max(0, chartData.length - def));
    }

    const visCount = chartZoomMap.current.get(chartId)!;
    const scrollOff = chartScrollMap.current.get(chartId)!;
    const fp = getFP(visCount);
    const maxFP = Math.min(fp, Math.ceil(visCount * 0.2));
    const si = Math.max(0, Math.floor(scrollOff));
    const ei = Math.min(chartData.length + maxFP, si + visCount);
    const vis = chartData.slice(si, Math.min(ei, chartData.length));
    const futC = Math.max(0, ei - chartData.length);
    const totVis = vis.length + futC;
    if (vis.length === 0 && futC === 0) return;

    const cw = Math.max(2, (chartW / totVis) * 0.8);
    const cs = chartW / totVis;

    // After-hours shading
    if (inst.timeframe.includes('m') || inst.timeframe.includes('h')) {
      vis.forEach((c2, i) => {
        const d2 = new Date(new Date(c2.timestamp).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
        const tot = d2.getHours() * 60 + d2.getMinutes();
        if (tot < 6 * 60 + 30 || tot >= 13 * 60) {
          ctx.fillStyle = (colors.grid || '#333333') + '20';
          ctx.fillRect(40 + i * cs, 0, cs, H);
        }
      });
    }

    // Price range
    const mr = chartPriceRangeMap.current.get(chartId);
    let aMax: number, aMin: number;
    if (mr) { aMax = mr.max; aMin = mr.min; }
    else {
      const prices = vis.flatMap(c2 => [c2.high, c2.low]);
      const mx = Math.max(...prices), mn = Math.min(...prices);
      const pad = (mx - mn) * 0.1;
      aMax = mx + pad; aMin = mn - pad;
    }
    if (eRA && expectedRangeLevels && !mr) {
      const lvls = [
        expectedRangeLevels.weekly80Call, expectedRangeLevels.weekly90Call,
        expectedRangeLevels.weekly80Put, expectedRangeLevels.weekly90Put,
        expectedRangeLevels.monthly80Call, expectedRangeLevels.monthly90Call,
        expectedRangeLevels.monthly80Put, expectedRangeLevels.monthly90Put,
      ].filter(Boolean);
      if (lvls.length) {
        const pad = (aMax - aMin) * 0.05;
        aMin = Math.min(aMin, Math.min(...lvls) - pad);
        aMax = Math.max(aMax, Math.max(...lvls) + pad);
      }
    }

    // Candles / Line
    if (config.chartType === 'line') {
      if (vis.length > 1) {
        ctx.strokeStyle = colors.bullish || '#00ff00'; ctx.lineWidth = 2; ctx.beginPath();
        vis.forEach((c2, i) => {
          const x = 40 + i * cs + cs / 2;
          const y = priceCH - ((c2.close - aMin) / (aMax - aMin)) * priceCH;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.stroke();
      }
    } else {
      vis.forEach((c2, i) => {
        const x = Math.round(40 + i * cs + (cs - cw) / 2);
        const bull = c2.close >= c2.open;
        const hiY = priceCH - ((c2.high - aMin) / (aMax - aMin)) * priceCH;
        const loY = priceCH - ((c2.low - aMin) / (aMax - aMin)) * priceCH;
        const opY = priceCH - ((c2.open - aMin) / (aMax - aMin)) * priceCH;
        const clY = priceCH - ((c2.close - aMin) / (aMax - aMin)) * priceCH;
        ctx.strokeStyle = bull ? config.colors.bullish.wick : config.colors.bearish.wick;
        ctx.lineWidth = Math.max(1, cw * 0.1);
        ctx.beginPath(); ctx.moveTo(x + cw / 2, hiY); ctx.lineTo(x + cw / 2, loY); ctx.stroke();
        ctx.fillStyle = bull ? config.colors.bullish.body : config.colors.bearish.body;
        ctx.fillRect(x + cw * 0.1, Math.min(opY, clY), cw * 0.8, Math.max(1, Math.abs(clY - opY)));
      });
    }

    // Price scale — same coordinate system as candles so labels align exactly
    ctx.fillStyle = config.axisStyle?.yAxis?.textColor || '#ffffff';
    ctx.font = `bold ${config.axisStyle?.yAxis?.textSize || 20}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.textAlign = 'left';
    for (let i = 0; i <= 10; i++) {
      const price = aMin + (aMax - aMin) * (1 - i / 10);
      const y = priceCH - ((price - aMin) / (aMax - aMin)) * priceCH;
      const abs = Math.abs(price);
      const lbl = abs >= 1000 ? abs.toFixed(0) : abs >= 100 ? abs.toFixed(1) : abs.toFixed(2);
      ctx.fillStyle = config.axisStyle?.yAxis?.textColor || '#ffffff';
      ctx.fillText(`$${lbl}`, W - 85, y + 6);
    }

    // Expected Range
    if (eRA && expectedRangeLevels && renderExpectedRangeLines) {
      if (wkA) renderExpectedRangeLines(ctx, chartW, priceCH, aMin, aMax, expectedRangeLevels, 'weekly', vis, visCount);
      if (moA) renderExpectedRangeLines(ctx, chartW, priceCH, aMin, aMax, expectedRangeLevels, 'monthly', vis, visCount);
    }

    // Seasonal
    if (seaA && vis.length > 0) {
      const last = vis[vis.length - 1];
      const lTime = new Date(last.timestamp).getTime();
      const lX = 40 + (vis.length - 1) * cs + cs / 2;
      const lY = priceCH - ((last.close - aMin) / (aMax - aMin)) * priceCH;
      const drawSea = (proj: any, col: string, dashed: boolean) => {
        if (!proj?.length) return;
        ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 2;
        if (dashed) ctx.setLineDash([5, 5]);
        ctx.beginPath(); ctx.moveTo(lX, lY);
        proj.forEach((pt: any) => {
          const days = (pt.date.getTime() - lTime) / 86400000;
          const x = lX + days * cs;
          const y = priceCH - ((pt.price - aMin) / (aMax - aMin)) * priceCH;
          if (y >= 0 && y <= priceCH) ctx.lineTo(x, y);
        });
        ctx.stroke(); ctx.restore();
      };
      if (s20A) drawSea(seasonal20YData, '#FFFFFF', false);
      if (s15A) drawSea(seasonal15YData, '#FFD700', false);
      if (s10A) drawSea(seasonal10YData, '#4169E1', false);
      if (selA) drawSea(seasonalElectionData, '#9370DB', true);
    }

    // Expansion/Liquidation
    if (expA && detectExpansionLiquidation && invalidateTouchedZones && renderExpansionLiquidationZone) {
      const zones = invalidateTouchedZones(detectExpansionLiquidation(chartData), chartData);
      zones.forEach((z: any) => {
        if (!z.isValid) return;
        if (z.breakoutIndex >= si && z.breakoutIndex <= ei + 50)
          renderExpansionLiquidationZone(ctx, z, chartData, chartW, priceCH, aMin, aMax, si, visCount);
      });
    }

    // Technalysis
    if ((tecA || Object.values(technalysisFeatures).some((f: any) => f)) && renderTechnalysisIndicators)
      renderTechnalysisIndicators(ctx, chartData, chartW, priceCH, aMin, aMax, si, visCount, technalysisFeatures);

    // Volume
    const maxVol = Math.max(...vis.map(c2 => c2.volume).filter(v => v > 0), 1);
    const rgba = (hex: string, a: number) => {
      const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
      return `rgba(${r},${g},${b},${a})`;
    };
    vis.forEach((c2, i) => {
      if (!c2.volume || c2.volume <= 0) return;
      const x = Math.round(40 + i * cs + (cs - cw) / 2);
      const vh = (c2.volume / maxVol) * volH;
      ctx.fillStyle = rgba(c2.close > c2.open ? config.colors.volume.bullish : config.colors.volume.bearish, 0.7);
      ctx.fillRect(x, priceCH + volH - vh, Math.round(cw), vh);
    });

    // Time axis — same adaptive logic as main chart drawTimeAxis
    const taxY = H - timeAxisH;
    ctx.strokeStyle = colors.grid || '#1a1a1a'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, taxY); ctx.lineTo(W, taxY); ctx.stroke();
    ctx.fillStyle = config.axisStyle?.xAxis?.textColor || '#ffffff';
    ctx.font = `bold ${config.axisStyle?.xAxis?.textSize || 20}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.textAlign = 'center';

    if (vis.length > 0) {
      const tf = inst.timeframe;
      const span = vis.length > 1 ? vis[vis.length - 1].timestamp - vis[0].timestamp : 86400000;
      const intra = tf.includes('m') || tf.includes('h');
      const hrs = span / 3600000, days = span / 86400000, mos = days / 30, yrs = days / 365;
      let fmt: string, spc: number;
      if (intra && hrs <= 24) { fmt = 'time'; spc = Math.max(1, Math.floor(visCount / 12)); }
      else if (intra && hrs <= 168) { fmt = 'datetime'; spc = Math.max(1, Math.floor(visCount / 16)); }
      else if (days <= 30) { fmt = 'date'; spc = Math.max(1, Math.floor(visCount / 12)); }
      else if (mos <= 12) { fmt = 'monthday'; spc = Math.max(1, Math.floor(visCount / 16)); }
      else if (yrs <= 5) { fmt = 'monthyear'; spc = Math.max(1, Math.floor(visCount / 20)); }
      else { fmt = 'year'; spc = Math.max(1, Math.floor(visCount / 24)); }

      let lastL = '';
      const placed: { x: number; w: number }[] = [];

      const fmtL = (ts: number): string => {
        const dt = new Date(ts); let lbl = '';
        switch (fmt) {
          case 'time': lbl = dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Los_Angeles' }); break;
          case 'datetime': {
            const ds = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' });
            const ts2 = dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Los_Angeles' });
            lbl = ds !== lastL ? `${ds} ${ts2}` : ts2; lastL = ds; return lbl;
          }
          case 'date': case 'monthday': lbl = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' }); break;
          case 'monthyear': lbl = dt.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'America/Los_Angeles' }); break;
          case 'year': lbl = dt.toLocaleDateString('en-US', { year: 'numeric', timeZone: 'America/Los_Angeles' }).split(',')[0]; break;
        }
        if (lbl === lastL && fmt !== 'time') return '';
        lastL = lbl; return lbl;
      };

      const canPlace = (x: number, txt: string) => {
        const tw = ctx.measureText(txt).width, l = x - tw / 2, r = x + tw / 2;
        if (l < 50 || r > W - 10) return false;
        return !placed.some(p => !(r < p.x - p.w / 2 - 8 || l > p.x + p.w / 2 + 8));
      };

      vis.forEach((c2, vi) => {
        if ((si + vi) % spc !== 0) return;
        const x = 40 + vi * cs + cs / 2;
        const lbl = fmtL(c2.timestamp);
        if (!lbl || !canPlace(x, lbl)) return;
        placed.push({ x, w: ctx.measureText(lbl).width });
        ctx.fillStyle = config.axisStyle?.xAxis?.textColor || '#ffffff';
        ctx.fillText(lbl, x, taxY + 18);
        ctx.strokeStyle = colors.grid || '#1a1a1a'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, taxY + 2); ctx.lineTo(x, taxY + 8); ctx.stroke();
      });
    }

    chartComputedStateMap.current.set(chartId, {
      adjustedMin: aMin, adjustedMax: aMax, priceChartHeight: priceCH,
      chartWidth: chartW, candleSpacing: cs, visibleData: vis, startIndex: si,
      timeframe: inst.timeframe,
    });
  }, [
    instances, colors, config, layout, perChartIndicators,
    isExpectedRangeActive, expectedRangeLevels, isWeeklyActive, isMonthlyActive,
    isSeasonalActive, seasonal20YData, seasonal15YData, seasonal10YData,
    seasonalElectionData, isSeasonal20YActive, isSeasonal15YActive,
    isSeasonal10YActive, isSeasonalElectionActive,
    isExpansionLiquidationActive, technalysisActive, technalysisFeatures,
    isFlowChartActive, flowChartHeight, isIVRankActive, isIVPercentileActive, isHVActive, ivPanelHeight,
    renderExpectedRangeLines, detectExpansionLiquidation,
    invalidateTouchedZones, renderExpansionLiquidationZone, renderTechnalysisIndicators,
  ]);

  useEffect(() => {
    const fetchData = async () => {
      for (const ci of instances) {
        const { id, symbol: sym, timeframe: tf } = ci;
        if (!sym || !tf) continue;
        chartLoadingMap.current.set(id, true);
        try {
          const cache = ChartDataCache.getInstance();
          const fetched = await cache.getOrFetch(sym, tf, async () => {
            const now = new Date();
            const end = now.toISOString().split('T')[0];
            const start = new Date(now.getTime() - 365 * 86400000).toISOString().split('T')[0];
            const res = await fetch(`/api/historical-data?symbol=${sym}&startDate=${start}&endDate=${end}&timeframe=${tf}&ultrafast=true`);
            if (!res.ok) throw new Error(`API ${res.status}`);
            const result = await res.json();
            if (!result?.results?.length) throw new Error('No data');
            return result.results.map((item: any) => ({
              timestamp: item.t, open: item.o, high: item.h, low: item.l, close: item.c,
              volume: item.v || 0, date: new Date(item.t).toLocaleDateString(), time: new Date(item.t).toLocaleTimeString(),
            }));
          });
          chartDataMap.current.set(id, fetched);
          chartLoadingMap.current.set(id, false);
          chartZoomMap.current.delete(id);
          chartScrollMap.current.delete(id);
          renderChartInstance(id);
        } catch (err) {
          console.error(`Fetch error ${sym}:`, err);
          chartLoadingMap.current.set(id, false);
        }
      }
    };
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(instances.map(i => ({ symbol: i.symbol, timeframe: i.timeframe })))]);

  useEffect(() => {
    instances.forEach(ci => { if (chartDataMap.current.has(ci.id)) renderChartInstance(ci.id); });
  }, [renderChartInstance, perChartIndicators]);

  const getGrid = () => {
    if (layout === '1x2') return { gridTemplateColumns: '1fr', gridTemplateRows: '1fr 1fr' };
    if (layout === '2x2') return { gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr' };
    return { gridTemplateColumns: '1fr', gridTemplateRows: '1fr' };
  };

  return (
    <div className="w-full h-full grid gap-1" style={{ ...getGrid(), background: '#000000' }}>
      {instances.map((inst) => (
        <div key={inst.id} className="relative"
          style={{ border: activeChartId === inst.id ? '2px solid rgba(255,255,255,0.3)' : '1px solid #333333', background: '#000000' }}>

          {/* Symbol badge */}
          <div style={{
            position: 'absolute', top: 8, left: 8, zIndex: 30,
            background: 'rgba(0,0,0,0.7)', color: activeChartId === inst.id ? '#ff8833' : '#ffffff',
            padding: '6px 12px', borderRadius: 4, fontSize: 13, fontWeight: 'bold',
            border: '1px solid rgba(255,255,255,0.2)', pointerEvents: 'none',
            fontFamily: '"Segoe UI", system-ui, sans-serif', letterSpacing: '0.5px',
          }}>
            {inst.symbol} · {inst.timeframe.toUpperCase()}
          </div>

          {/* Chart canvas */}
          <canvas
            ref={(el) => {
              if (!el) return;
              chartCanvasRefs.current.set(inst.id, el);
              const container = el.parentElement;
              if (container) {
                const r = container.getBoundingClientRect();
                const dpr = window.devicePixelRatio || 1;
                el.width = r.width * dpr; el.height = r.height * dpr;
                el.style.width = `${r.width}px`; el.style.height = `${r.height}px`;
              }
              if (chartDataMap.current.has(inst.id))
                setTimeout(() => renderChartInstance(inst.id), 50);
            }}
            className="absolute top-0 left-0 z-10"
            style={{ width: '100%', height: '100%', display: 'block' }}
          />

          {/* Overlay canvas */}
          <canvas
            ref={(el) => {
              if (!el) return;
              overlayCanvasRefs.current.set(inst.id, el);
              const r = el.getBoundingClientRect();
              const dpr = window.devicePixelRatio || 1;
              el.width = r.width * dpr; el.height = r.height * dpr;
              el.style.width = `${r.width}px`; el.style.height = `${r.height}px`;
            }}
            className="absolute inset-0 z-20"
            style={{ width: '100%', height: '100%', cursor: 'crosshair' }}

            onClick={(e) => { e.stopPropagation(); onActiveChartChange(inst.id); }}

            onMouseMove={(e) => {
              // Update cursor: ns-resize over Y-axis area, crosshair elsewhere
              const rect = e.currentTarget.getBoundingClientRect();
              const mx = e.clientX - rect.left, my = e.clientY - rect.top;
              const cWcur = rect.width - 120;
              (e.currentTarget as HTMLCanvasElement).style.cursor = mx > cWcur ? 'ns-resize' : 'crosshair';

              if (activeTool && activeChartId === inst.id) { handleCanvasMouseMove(e as any); return; }

              const drawCH = (ov: HTMLCanvasElement, cx: number, cy: number, tid: string, labels: boolean) => {
                const or = ov.getBoundingClientRect();
                const c = ov.getContext('2d');
                if (!c) return;
                const dpr2 = window.devicePixelRatio || 1;
                const W2 = or.width, H2 = or.height;
                c.clearRect(0, 0, ov.width, ov.height);
                c.save(); c.scale(dpr2, dpr2);

                // Crosshair lines — exact main chart style
                c.strokeStyle = config.theme === 'dark' ? '#555555' : '#cccccc';
                c.lineWidth = 1; c.setLineDash([2, 2]);
                if (cx >= 0) { c.beginPath(); c.moveTo(cx, 0); c.lineTo(cx, H2); c.stroke(); }
                c.beginPath(); c.moveTo(0, cy); c.lineTo(W2, cy); c.stroke();
                c.setLineDash([]);

                if (labels) {
                  const comp = chartComputedStateMap.current.get(tid);
                  if (comp) {
                    const { adjustedMin: aMin2, adjustedMax: aMax2, priceChartHeight: pch2, candleSpacing: cs2, visibleData: vis2, timeframe: tf2 } = comp;
                    c.font = 'bold 18px "Segoe UI", system-ui, -apple-system, sans-serif';
                    c.imageSmoothingEnabled = false; c.textBaseline = 'middle';

                    // Y-axis price label — dark bg, orange text
                    if (cy >= 0 && cy <= pch2) {
                      const price = aMax2 - (cy / pch2) * (aMax2 - aMin2);
                      const ptxt = `$${price.toFixed(2)}`;
                      const ptw = c.measureText(ptxt).width + 24;
                      c.fillStyle = config.theme === 'dark' ? '#1a202c' : '#2d3748';
                      c.strokeStyle = config.theme === 'dark' ? '#2d3748' : '#4a5568';
                      c.lineWidth = 1;
                      c.fillRect(W2 - ptw - 5, cy - 16, ptw, 32);
                      c.strokeRect(W2 - ptw - 5, cy - 16, ptw, 32);
                      c.shadowColor = 'rgba(0,0,0,0.9)'; c.shadowBlur = 3; c.shadowOffsetX = 1; c.shadowOffsetY = 1;
                      c.fillStyle = '#FF6600'; c.textAlign = 'center';
                      c.fillText(ptxt, W2 - ptw / 2 - 5, cy);
                      c.shadowColor = 'transparent'; c.shadowBlur = 0; c.shadowOffsetX = 0; c.shadowOffsetY = 0;
                    }

                    // X-axis date label — dark bg, orange text
                    if (cx >= 0) {
                      const ci2 = Math.floor((cx - 40) / cs2);
                      if (ci2 >= 0 && ci2 < vis2.length) {
                        const candle = vis2[ci2];
                        const dt = new Date(candle.timestamp);
                        const intra = ['1m', '5m', '15m', '30m', '1h', '2h', '4h'].includes(tf2);
                        let dateTxt: string;
                        if (intra) {
                          const ds = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' });
                          const ts2 = dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Los_Angeles' });
                          dateTxt = `${ds} ${ts2}`;
                        } else {
                          dateTxt = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' });
                        }
                        const dtw = c.measureText(dateTxt).width + 24;
                        const xLY = H2 - 70;
                        const lx = Math.max(dtw / 2, Math.min(W2 - dtw / 2, cx));
                        c.fillStyle = config.theme === 'dark' ? '#1a202c' : '#2d3748';
                        c.strokeStyle = config.theme === 'dark' ? '#2d3748' : '#4a5568';
                        c.lineWidth = 1; c.textAlign = 'center';
                        c.fillRect(lx - dtw / 2, xLY - 14, dtw, 28);
                        c.strokeRect(lx - dtw / 2, xLY - 14, dtw, 28);
                        c.shadowColor = 'rgba(0,0,0,0.9)'; c.shadowBlur = 3; c.shadowOffsetX = 1; c.shadowOffsetY = 1;
                        c.fillStyle = '#FF6600'; c.fillText(dateTxt, lx, xLY);
                        c.shadowColor = 'transparent'; c.shadowBlur = 0; c.shadowOffsetX = 0; c.shadowOffsetY = 0;

                        // OHLC panel — exact match to main chart
                        const bull = candle.close >= candle.open;
                        const px2 = 20, py2 = 44, pw2 = 200, ph2 = 80;
                        c.fillStyle = 'rgba(0,0,0,0.9)'; c.strokeStyle = '#333333'; c.lineWidth = 1;
                        c.textAlign = 'left'; c.textBaseline = 'top';
                        c.fillRect(px2, py2, pw2, ph2); c.strokeRect(px2, py2, pw2, ph2);
                        c.font = 'bold 13px "Segoe UI", system-ui, sans-serif';
                        let ly2 = py2 + 8; const lh2 = 18; const lc = '#FF6600';
                        c.fillStyle = lc; c.fillText('O:', px2 + 12, ly2);
                        c.fillStyle = '#ffffff'; c.fillText(`$${candle.open.toFixed(2)}`, px2 + 35, ly2);
                        c.fillStyle = lc; c.fillText('H:', px2 + 120, ly2);
                        c.fillStyle = '#00ff88'; c.fillText(`$${candle.high.toFixed(2)}`, px2 + 143, ly2);
                        ly2 += lh2;
                        c.fillStyle = lc; c.fillText('L:', px2 + 12, ly2);
                        c.fillStyle = '#ff4444'; c.fillText(`$${candle.low.toFixed(2)}`, px2 + 35, ly2);
                        c.fillStyle = lc; c.fillText('C:', px2 + 120, ly2);
                        c.fillStyle = bull ? '#00ff88' : '#ff4444'; c.fillText(`$${candle.close.toFixed(2)}`, px2 + 143, ly2);
                        ly2 += lh2;
                        const chg = candle.close - candle.open, pct = (chg / candle.open) * 100;
                        c.font = 'bold 12px "Segoe UI", system-ui, sans-serif';
                        c.fillStyle = bull ? '#00ff88' : '#ff4444';
                        c.fillText(`${chg >= 0 ? '+' : ''}$${Math.abs(chg).toFixed(2)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`, px2 + 12, ly2);
                      }
                    }
                  }
                }
                c.restore();
              };

              const myOv = overlayCanvasRefs.current.get(inst.id);
              if (myOv) drawCH(myOv, mx, my, inst.id, true);

              // Sync price-level crosshair across all other charts
              const comp = chartComputedStateMap.current.get(inst.id);
              if (comp && my >= 0 && my <= comp.priceChartHeight) {
                const price = comp.adjustedMax - (my / comp.priceChartHeight) * (comp.adjustedMax - comp.adjustedMin);
                overlayCanvasRefs.current.forEach((ov, oid) => {
                  if (oid === inst.id) return;
                  const oc = chartComputedStateMap.current.get(oid);
                  if (!oc) return;
                  const oy = (1 - (price - oc.adjustedMin) / (oc.adjustedMax - oc.adjustedMin)) * oc.priceChartHeight;
                  drawCH(ov, -1, oy, oid, true);
                });
              }
            }}

            onMouseLeave={() => {
              overlayCanvasRefs.current.forEach(ov => { const c = ov.getContext('2d'); if (c) c.clearRect(0, 0, ov.width, ov.height); });
              if (activeChartId === inst.id) handleMouseLeave();
            }}

            onWheel={(e) => {
              e.preventDefault();
              const chartData = chartDataMap.current.get(inst.id);
              if (!chartData) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const mx = e.clientX - rect.left;
              const cW = rect.width - 120;
              const curZoom = chartZoomMap.current.get(inst.id) || Math.max(30, Math.floor(cW / 8));
              const newZoom = Math.max(20, Math.min(500, Math.round(curZoom * (e.deltaY > 0 ? 1.1 : 0.91))));
              const curScroll = chartScrollMap.current.get(inst.id) || 0;
              // Center zoom on cursor (same as main chart)
              const t = Math.max(0, Math.min(1, (mx - 40) / cW));
              const barF = curScroll + t * curZoom;
              const newStart = barF - t * newZoom;
              const fp = getFP(newZoom);
              const maxS = chartData.length - newZoom + Math.min(fp, Math.ceil(newZoom * 0.2));
              chartZoomMap.current.set(inst.id, newZoom);
              chartScrollMap.current.set(inst.id, Math.max(0, Math.min(maxS, newStart)));
              renderChartInstance(inst.id);
            }}

            onMouseDown={(e) => {
              onActiveChartChange(inst.id);
              // Route drawing tools — use inst.id not stale activeChartId to avoid dropping first click
              if (activeTool) { handleUnifiedMouseDown(e as any); return; }
              if (e.button !== 0) return;
              e.preventDefault(); e.stopPropagation();

              const canvas2 = e.currentTarget as HTMLCanvasElement;
              const rect = canvas2.getBoundingClientRect();
              const sx = e.clientX, sy = e.clientY;
              const mx0 = e.clientX - rect.left;
              const startScroll = chartScrollMap.current.get(inst.id) || 0;
              const zoom = chartZoomMap.current.get(inst.id) || 80;
              const cW = rect.width - 120;
              const chartData = chartDataMap.current.get(inst.id);
              // Detect Y-axis area (right 120px) for scale drag vs chart area for pan
              const inYAxis = mx0 > cW;

              // Capture start price range
              let startPR: { min: number; max: number } | null = null;
              const mr = chartPriceRangeMap.current.get(inst.id);
              if (mr) { startPR = { ...mr }; }
              else if (chartData) {
                const slice = chartData.slice(Math.floor(startScroll), Math.floor(startScroll) + zoom);
                if (slice.length) {
                  const prices = slice.flatMap(c2 => [c2.high, c2.low]);
                  const mx2 = Math.max(...prices), mn = Math.min(...prices), pad = (mx2 - mn) * 0.1;
                  startPR = { min: mn - pad, max: mx2 + pad };
                }
              }

              canvas2.style.cursor = inYAxis ? 'ns-resize' : 'grabbing';

              const onMove = (me: MouseEvent) => {
                if (!chartData) return;
                const dx = me.clientX - sx, dy = me.clientY - sy;

                if (inYAxis) {
                  // Y-axis drag: scale (zoom) price range around its center
                  // drag up (dy<0) = tighten (zoom in), drag down (dy>0) = expand (zoom out)
                  if (startPR) {
                    const center = (startPR.max + startPR.min) / 2;
                    const halfSpan = (startPR.max - startPR.min) / 2;
                    const scaleFactor = Math.max(0.05, 1 + dy * 0.005);
                    chartPriceRangeMap.current.set(inst.id, {
                      min: center - halfSpan * scaleFactor,
                      max: center + halfSpan * scaleFactor,
                    });
                  }
                } else {
                  // Chart area: simultaneous X pan + Y pan (no modifier key needed)
                  const ppc = cW / zoom;
                  const fp = getFP(zoom);
                  const maxS = chartData.length - zoom + Math.min(fp, Math.ceil(zoom * 0.2));
                  chartScrollMap.current.set(inst.id, Math.max(0, Math.min(maxS, startScroll - dx / ppc)));
                  if (startPR) {
                    const pch = rect.height - 30 - 80;
                    const span = startPR.max - startPR.min;
                    chartPriceRangeMap.current.set(inst.id, { min: startPR.min + (dy / pch) * span, max: startPR.max + (dy / pch) * span });
                  }
                }
                renderChartInstance(inst.id);
              };
              const onUp = () => { canvas2.style.cursor = inYAxis ? 'ns-resize' : 'crosshair'; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
              document.addEventListener('mousemove', onMove);
              document.addEventListener('mouseup', onUp);
            }}
          />
        </div>
      ))}
    </div>
  );
}
