"use client";

import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';
// @ts-expect-error technicalindicators package lacks TypeScript definitions
import { technicalindicators } from 'technicalindicators';
import { Button } from '../../../components/ui/button';
import { 
  Search, 
  TrendingUp, 
  TrendingDown, 
  BarChart3, 
  CandlestickChart,
  Activity,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Settings,
  Minus,
  Plus,
  Edit3,
  Ruler
} from 'lucide-react';

interface CandleData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  date: string;
  time: string;
}

interface TradingChartProps {
  symbol: string;
  initialData?: CandleData[];
  height?: number;
  onSymbolChange?: (symbol: string) => void;
}

interface TechnicalIndicator {
  id: string;
  name: string;
  visible: boolean;
  params: Record<string, any>;
  data: number[];
  color: string;
}

interface DrawingTool {
  id: string;
  type: 'line' | 'fibonacci' | 'horizontal' | 'trendline' | 'rectangle';
  points: Array<{ x: number; y: number; timestamp: number; price: number }>;
  color: string;
  completed: boolean;
}

const TIMEFRAMES = [
  { value: '1m', label: '1m' },
  { value: '5m', label: '5m' },
  { value: '15m', label: '15m' },
  { value: '30m', label: '30m' },
  { value: '1h', label: '1h' },
  { value: '4h', label: '4h' },
  { value: '1D', label: '1D' },
  { value: '1W', label: '1W' },
];

const RANGES = [
  { value: '1D', label: '1D' },
  { value: '5D', label: '5D' },
  { value: '1M', label: '1M' },
  { value: '3M', label: '3M' },
  { value: '6M', label: '6M' },
  { value: '1Y', label: '1Y' },
  { value: '2Y', label: '2Y' },
  { value: '5Y', label: '5Y' },
  { value: '10Y', label: '10Y' },
  { value: '20Y', label: '20Y' },
];

const INDICATORS = [
  { id: 'sma', name: 'SMA (20)', color: '#ff6b6b', period: 20 },
  { id: 'ema', name: 'EMA (20)', color: '#4ecdc4', period: 20 },
  { id: 'bollinger', name: 'Bollinger Bands', color: '#45b7d1', period: 20 },
  { id: 'rsi', name: 'RSI (14)', color: '#96ceb4', period: 14 },
  { id: 'macd', name: 'MACD', color: '#feca57', fast: 12, slow: 26, signal: 9 },
  { id: 'stochastic', name: 'Stochastic', color: '#ff9ff3', k: 14, d: 3 },
];

export default function TradingChart({ 
  symbol, 
  initialData = [], 
  height = 600,
  onSymbolChange 
}: TradingChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [data, setData] = useState<CandleData[]>(initialData);
  const [timeframe, setTimeframe] = useState('1h');
  const [range, setRange] = useState('1D');
  const [chartType, setChartType] = useState<'candlestick' | 'line'>('candlestick');
  const [indicators, setIndicators] = useState<TechnicalIndicator[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [priceChange, setPriceChange] = useState<number>(0);
  const [priceChangePercent, setPriceChangePercent] = useState<number>(0);
  const [searchSymbol, setSearchSymbol] = useState(symbol);
  
  // Drawing tools state
  const [drawingMode, setDrawingMode] = useState<'none' | 'line' | 'fibonacci' | 'horizontal' | 'trendline' | 'rectangle'>('none');
  const [drawings, setDrawings] = useState<DrawingTool[]>([]);
  const [currentDrawing, setCurrentDrawing] = useState<DrawingTool | null>(null);
  
  // Chart dimensions and scales
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [scales, setScales] = useState<{
    x: d3.ScaleTime<number, number, never> | null;
    y: d3.ScaleLinear<number, number, never> | null;
  }>({ x: null, y: null });
  
  // Zoom and pan
  const [zoomTransform, setZoomTransform] = useState<d3.ZoomTransform>(d3.zoomIdentity);

  // Fetch data function
  const fetchData = useCallback(async (sym: string, tf: string, rng: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/stock-data?symbol=${sym}&timeframe=${tf}&range=${rng}`);
      const result = await response.json();
      
      if (result.data) {
        setData(result.data);
        setCurrentPrice(result.meta.currentPrice);
        setPriceChange(result.meta.priceChange);
        setPriceChangePercent(result.meta.priceChangePercent);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Calculate technical indicators
  const calculateIndicators = useCallback((chartData: CandleData[], activeIndicators: TechnicalIndicator[]) => {
    const closes = chartData.map(d => d.close);
    const highs = chartData.map(d => d.high);
    const lows = chartData.map(d => d.low);
    const volumes = chartData.map(d => d.volume);

    return activeIndicators.map(indicator => {
      let calculatedData: number[] = [];
      
      try {
        switch (indicator.id) {
          case 'sma':
            calculatedData = technicalindicators.SMA.calculate({
              period: indicator.params.period || 20,
              values: closes
            });
            break;
          case 'ema':
            calculatedData = technicalindicators.EMA.calculate({
              period: indicator.params.period || 20,
              values: closes
            });
            break;
          case 'rsi':
            calculatedData = technicalindicators.RSI.calculate({
              period: indicator.params.period || 14,
              values: closes
            });
            break;
          case 'bollinger':
            const bb = technicalindicators.BollingerBands.calculate({
              period: indicator.params.period || 20,
              stdDev: 2,
              values: closes
            });
            calculatedData = bb.map((b: any) => b.middle);
            break;
          case 'macd':
            const macd = technicalindicators.MACD.calculate({
              fastPeriod: indicator.params.fast || 12,
              slowPeriod: indicator.params.slow || 26,
              signalPeriod: indicator.params.signal || 9,
              values: closes
            });
            calculatedData = macd.map((m: any) => m.MACD);
            break;
          case 'stochastic':
            const stoch = technicalindicators.Stochastic.calculate({
              high: highs,
              low: lows,
              close: closes,
              period: indicator.params.k || 14,
              signalPeriod: indicator.params.d || 3
            });
            calculatedData = stoch.map((s: any) => s.k);
            break;
        }
      } catch (error) {
        console.warn(`Failed to calculate ${indicator.name}:`, error);
      }

      return {
        ...indicator,
        data: calculatedData
      };
    });
  }, []);

  // Initialize chart
  const initializeChart = useCallback(() => {
    if (!svgRef.current || !containerRef.current || data.length === 0) return;

    const container = containerRef.current;
    const rect = container.getBoundingClientRect();
    const margin = { top: 20, right: 80, bottom: 40, left: 60 };
    const width = rect.width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    setDimensions({ width, height: chartHeight });

    // Clear previous chart
    d3.select(svgRef.current).selectAll("*").remove();

    const svg = d3.select(svgRef.current)
      .attr("width", rect.width)
      .attr("height", height);

    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Create scales
    const xScale = d3.scaleTime()
      .domain(d3.extent(data, d => new Date(d.timestamp)) as [Date, Date])
      .range([0, width]);

    const yScale = d3.scaleLinear()
      .domain(d3.extent(data, d => d.high) as [number, number])
      .nice()
      .range([chartHeight, 0]);

    setScales({ x: xScale, y: yScale });

    // Create axes
    const xAxis = d3.axisBottom(xScale).tickFormat((d: any) => d3.timeFormat("%m/%d %H:%M")(d));
    const yAxis = d3.axisRight(yScale).tickFormat((d: any) => `$${(d as number).toFixed(2)}`);

    g.append("g")
      .attr("class", "x-axis")
      .attr("transform", `translate(0,${chartHeight})`)
      .call(xAxis as any);

    g.append("g")
      .attr("class", "y-axis")
      .attr("transform", `translate(${width},0)`)
      .call(yAxis as any);

    // Add grid lines
    g.append("g")
      .attr("class", "grid")
      .attr("transform", `translate(0,${chartHeight})`)
      .call(d3.axisBottom(xScale)
        .tickSize(-chartHeight)
        .tickFormat(() => "")
      )
      .style("stroke-dasharray", "3,3")
      .style("opacity", 0.3);

    g.append("g")
      .attr("class", "grid")
      .attr("transform", `translate(${width},0)`)
      .call(d3.axisRight(yScale)
        .tickSize(-width)
        .tickFormat(() => "")
      )
      .style("stroke-dasharray", "3,3")
      .style("opacity", 0.3);

    // Draw candlesticks or line chart
    if (chartType === 'candlestick') {
      drawCandlesticks(g, data, xScale, yScale);
    } else {
      drawLineChart(g, data, xScale, yScale);
    }

    // Draw volume bars
    drawVolume(g, data, xScale, yScale, chartHeight);

    // Draw indicators
    const calculatedIndicators = calculateIndicators(data, indicators);
    drawIndicators(g, calculatedIndicators, data, xScale, yScale);

    // Draw drawings
    drawDrawings(g, drawings, xScale, yScale);

    // Add zoom and pan
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 10])
      .on("zoom", (event) => {
        const { transform } = event;
        setZoomTransform(transform);
        
        // Update scales with zoom transform
        const newXScale = transform.rescaleX(xScale);
        const newYScale = transform.rescaleY(yScale);
        
        // Update axes
        g.select(".x-axis").call(d3.axisBottom(newXScale).tickFormat((d: any) => d3.timeFormat("%m/%d %H:%M")(d)) as any);
        g.select(".y-axis").call(d3.axisRight(newYScale).tickFormat((d: any) => `$${(d as number).toFixed(2)}`) as any);
        
        // Redraw chart elements with new scales
        if (chartType === 'candlestick') {
          drawCandlesticks(g, data, newXScale, newYScale);
        } else {
          drawLineChart(g, data, newXScale, newYScale);
        }
        
        drawVolume(g, data, newXScale, newYScale, chartHeight);
        drawIndicators(g, calculatedIndicators, data, newXScale, newYScale);
        drawDrawings(g, drawings, newXScale, newYScale);
      });

    svg.call(zoom);

    // Add crosshair
    addCrosshair(g, data, xScale, yScale, width, chartHeight);

  }, [data, chartType, indicators, drawings, height, calculateIndicators]);

  // Draw candlesticks
  const drawCandlesticks = (g: d3.Selection<SVGGElement, unknown, null, undefined>, 
                           chartData: CandleData[], 
                           xScale: d3.ScaleTime<number, number, never>, 
                           yScale: d3.ScaleLinear<number, number, never>) => {
    g.selectAll(".candle").remove();

    const candleWidth = Math.max(1, (xScale.range()[1] - xScale.range()[0]) / chartData.length * 0.8);

    const candles = g.selectAll(".candle")
      .data(chartData)
      .enter()
      .append("g")
      .attr("class", "candle");

    // Wicks
    candles.append("line")
      .attr("class", "wick")
      .attr("x1", d => xScale(new Date(d.timestamp)))
      .attr("x2", d => xScale(new Date(d.timestamp)))
      .attr("y1", d => yScale(d.high))
      .attr("y2", d => yScale(d.low))
      .attr("stroke", d => d.close >= d.open ? "#26a69a" : "#ef5350")
      .attr("stroke-width", 1);

    // Bodies
    candles.append("rect")
      .attr("class", "body")
      .attr("x", d => xScale(new Date(d.timestamp)) - candleWidth / 2)
      .attr("y", d => yScale(Math.max(d.open, d.close)))
      .attr("width", candleWidth)
      .attr("height", d => Math.abs(yScale(d.open) - yScale(d.close)) || 1)
      .attr("fill", d => d.close >= d.open ? "#26a69a" : "#ef5350")
      .attr("stroke", d => d.close >= d.open ? "#26a69a" : "#ef5350");
  };

  // Draw line chart
  const drawLineChart = (g: d3.Selection<SVGGElement, unknown, null, undefined>, 
                        chartData: CandleData[], 
                        xScale: d3.ScaleTime<number, number, never>, 
                        yScale: d3.ScaleLinear<number, number, never>) => {
    g.selectAll(".line").remove();

    const line = d3.line<CandleData>()
      .x(d => xScale(new Date(d.timestamp)))
      .y(d => yScale(d.close))
      .curve(d3.curveMonotoneX);

    g.append("path")
      .datum(chartData)
      .attr("class", "line")
      .attr("fill", "none")
      .attr("stroke", "#2196f3")
      .attr("stroke-width", 2)
      .attr("d", line);
  };

  // Draw volume
  const drawVolume = (g: d3.Selection<SVGGElement, unknown, null, undefined>, 
                     chartData: CandleData[], 
                     xScale: d3.ScaleTime<number, number, never>, 
                     yScale: d3.ScaleLinear<number, number, never>,
                     chartHeight: number) => {
    g.selectAll(".volume").remove();

    const volumeScale = d3.scaleLinear()
      .domain([0, d3.max(chartData, d => d.volume) || 0])
      .range([0, chartHeight * 0.2]);

    const volumeY = chartHeight - volumeScale.range()[1];

    const volumeBars = g.selectAll(".volume")
      .data(chartData)
      .enter()
      .append("rect")
      .attr("class", "volume")
      .attr("x", d => xScale(new Date(d.timestamp)) - 2)
      .attr("y", d => volumeY + volumeScale.range()[1] - volumeScale(d.volume))
      .attr("width", 4)
      .attr("height", d => volumeScale(d.volume))
      .attr("fill", d => d.close >= d.open ? "rgba(38, 166, 154, 0.5)" : "rgba(239, 83, 80, 0.5)");
  };

  // Draw indicators
  const drawIndicators = (g: d3.Selection<SVGGElement, unknown, null, undefined>, 
                         calculatedIndicators: TechnicalIndicator[], 
                         chartData: CandleData[], 
                         xScale: d3.ScaleTime<number, number, never>, 
                         yScale: d3.ScaleLinear<number, number, never>) => {
    g.selectAll(".indicator").remove();

    calculatedIndicators.forEach(indicator => {
      if (!indicator.visible || indicator.data.length === 0) return;

      const line = d3.line<number>()
        .x((d, i) => {
          const dataIndex = chartData.length - indicator.data.length + i;
          return xScale(new Date(chartData[dataIndex]?.timestamp || 0));
        })
        .y(d => yScale(d))
        .curve(d3.curveMonotoneX);

      g.append("path")
        .datum(indicator.data)
        .attr("class", `indicator indicator-${indicator.id}`)
        .attr("fill", "none")
        .attr("stroke", indicator.color)
        .attr("stroke-width", 2)
        .attr("d", line);
    });
  };

  // Draw drawings (lines, fibs, etc.)
  const drawDrawings = (g: d3.Selection<SVGGElement, unknown, null, undefined>, 
                       drawingList: DrawingTool[], 
                       xScale: d3.ScaleTime<number, number, never>, 
                       yScale: d3.ScaleLinear<number, number, never>) => {
    g.selectAll(".drawing").remove();

    drawingList.forEach(drawing => {
      if (drawing.points.length < 2) return;

      const [start, end] = drawing.points;

      switch (drawing.type) {
        case 'line':
        case 'trendline':
          g.append("line")
            .attr("class", "drawing")
            .attr("x1", xScale(new Date(start.timestamp)))
            .attr("y1", yScale(start.price))
            .attr("x2", xScale(new Date(end.timestamp)))
            .attr("y2", yScale(end.price))
            .attr("stroke", drawing.color)
            .attr("stroke-width", 2);
          break;

        case 'horizontal':
          g.append("line")
            .attr("class", "drawing")
            .attr("x1", xScale.range()[0])
            .attr("y1", yScale(start.price))
            .attr("x2", xScale.range()[1])
            .attr("y2", yScale(start.price))
            .attr("stroke", drawing.color)
            .attr("stroke-width", 2);
          break;

        case 'fibonacci':
          const priceDiff = end.price - start.price;
          const fibLevels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
          
          fibLevels.forEach(level => {
            const price = start.price + (priceDiff * level);
            g.append("line")
              .attr("class", "drawing fibonacci")
              .attr("x1", xScale(new Date(start.timestamp)))
              .attr("y1", yScale(price))
              .attr("x2", xScale(new Date(end.timestamp)))
              .attr("y2", yScale(price))
              .attr("stroke", drawing.color)
              .attr("stroke-width", 1)
              .attr("stroke-dasharray", level === 0 || level === 1 ? "none" : "5,5");

            g.append("text")
              .attr("class", "drawing fib-label")
              .attr("x", xScale(new Date(end.timestamp)) + 5)
              .attr("y", yScale(price))
              .attr("dy", "0.3em")
              .attr("fill", drawing.color)
              .attr("font-size", "12px")
              .text(`${(level * 100).toFixed(1)}%`);
          });
          break;
      }
    });
  };

  // Add crosshair
  const addCrosshair = (g: d3.Selection<SVGGElement, unknown, null, undefined>, 
                       chartData: CandleData[], 
                       xScale: d3.ScaleTime<number, number, never>, 
                       yScale: d3.ScaleLinear<number, number, never>,
                       width: number, 
                       chartHeight: number) => {
    const focus = g.append("g")
      .attr("class", "focus")
      .style("display", "none");

    focus.append("line")
      .attr("class", "x-hover-line hover-line")
      .attr("y1", 0)
      .attr("y2", chartHeight);

    focus.append("line")
      .attr("class", "y-hover-line hover-line")
      .attr("x1", 0)
      .attr("x2", width);

    focus.append("circle")
      .attr("r", 4);

    const overlay = g.append("rect")
      .attr("class", "overlay")
      .attr("width", width)
      .attr("height", chartHeight)
      .style("fill", "none")
      .style("pointer-events", "all")
      .on("mouseover", () => focus.style("display", null))
      .on("mouseout", () => focus.style("display", "none"))
      .on("mousemove", (event) => {
        const [mouseX] = d3.pointer(event);
        const x0 = xScale.invert(mouseX);
        const bisectDate = d3.bisector((d: CandleData) => new Date(d.timestamp)).left;
        const i = bisectDate(chartData, x0, 1);
        const d0 = chartData[i - 1];
        const d1 = chartData[i];
        const d = x0.getTime() - new Date(d0?.timestamp || 0).getTime() > new Date(d1?.timestamp || 0).getTime() - x0.getTime() ? d1 : d0;
        
        if (d) {
          focus.attr("transform", `translate(${xScale(new Date(d.timestamp))},${yScale(d.close)})`);
          focus.select(".x-hover-line").attr("x1", 0).attr("x2", 0);
          focus.select(".y-hover-line").attr("y1", 0).attr("y2", 0);
        }
      })
      .on("click", handleChartClick);
  };

  // Handle chart clicks for drawing tools
  const handleChartClick = useCallback((event: MouseEvent) => {
    if (drawingMode === 'none' || !scales.x || !scales.y) return;

    const [mouseX, mouseY] = d3.pointer(event);
    const timestamp = scales.x.invert(mouseX).getTime();
    const price = scales.y.invert(mouseY);

    if (!currentDrawing) {
      // Start new drawing
      const newDrawing: DrawingTool = {
        id: `drawing-${Date.now()}`,
        type: drawingMode,
        points: [{ x: mouseX, y: mouseY, timestamp, price }],
        color: '#2196f3',
        completed: false
      };
      setCurrentDrawing(newDrawing);
    } else {
      // Complete drawing
      const completedDrawing = {
        ...currentDrawing,
        points: [...currentDrawing.points, { x: mouseX, y: mouseY, timestamp, price }],
        completed: true
      };
      setDrawings(prev => [...prev, completedDrawing]);
      setCurrentDrawing(null);
      setDrawingMode('none');
    }
  }, [drawingMode, currentDrawing, scales]);

  // Add indicator
  const addIndicator = (indicatorConfig: any) => {
    const newIndicator: TechnicalIndicator = {
      id: `${indicatorConfig.id}-${Date.now()}`,
      name: indicatorConfig.name,
      visible: true,
      params: indicatorConfig,
      data: [],
      color: indicatorConfig.color
    };
    setIndicators(prev => [...prev, newIndicator]);
  };

  // Remove indicator
  const removeIndicator = (id: string) => {
    setIndicators(prev => prev.filter(ind => ind.id !== id));
  };

  // Real-time data updates
  useEffect(() => {
    const interval = setInterval(async () => {
      if (symbol) {
        try {
          const response = await fetch(`/api/stock-data?symbol=${symbol}&timeframe=${timeframe}&range=1D`);
          const result = await response.json();
          
          if (result.data && result.data.length > 0) {
            const latestData = result.data[result.data.length - 1];
            setCurrentPrice(result.meta.currentPrice);
            setPriceChange(result.meta.priceChange);
            setPriceChangePercent(result.meta.priceChangePercent);
            
            // Update last candle if it's the same timestamp, otherwise add new one
            setData(prevData => {
              if (prevData.length === 0) return result.data;
              
              const lastCandle = prevData[prevData.length - 1];
              if (lastCandle.timestamp === latestData.timestamp) {
                // Update existing candle
                return [...prevData.slice(0, -1), latestData];
              } else {
                // Add new candle
                return [...prevData, latestData];
              }
            });
          }
        } catch (error) {
          console.error('Failed to update real-time data:', error);
        }
      }
    }, 5000); // Update every 5 seconds

    return () => clearInterval(interval);
  }, [symbol, timeframe]);

  // Initialize and update chart
  useEffect(() => {
    if (data.length > 0) {
      initializeChart();
    }
  }, [data, initializeChart]);

  // Fetch data when params change
  useEffect(() => {
    if (symbol) {
      fetchData(symbol, timeframe, range);
    }
  }, [symbol, timeframe, range, fetchData]);

  // Handle search
  const handleSearch = () => {
    if (searchSymbol && onSymbolChange) {
      onSymbolChange(searchSymbol.toUpperCase());
    }
  };

  return (
    <div className="w-full bg-gray-900 text-white rounded-lg overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={searchSymbol}
                onChange={(e) => setSearchSymbol(e.target.value.toUpperCase())}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Enter symbol..."
                className="bg-gray-800 text-white px-3 py-2 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
              />
              <Button onClick={handleSearch} size="sm" className="bg-blue-600 hover:bg-blue-700">
                <Search className="w-4 h-4" />
              </Button>
            </div>
            
            <div className="flex items-center space-x-2">
              <span className="text-2xl font-bold">{symbol}</span>
              {currentPrice && (
                <div className="flex items-center space-x-2">
                  <span className="text-xl">${currentPrice.toFixed(2)}</span>
                  <span className={`flex items-center ${priceChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {priceChange >= 0 ? <TrendingUp className="w-4 h-4 mr-1" /> : <TrendingDown className="w-4 h-4 mr-1" />}
                    {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)} ({priceChangePercent.toFixed(2)}%)
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {loading && <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>}
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-4">
          {/* Timeframes */}
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-400">Timeframe:</span>
            <div className="flex space-x-1">
              {TIMEFRAMES.map(tf => (
                <Button
                  key={tf.value}
                  size="sm"
                  variant={timeframe === tf.value ? "default" : "outline"}
                  onClick={() => setTimeframe(tf.value)}
                  className="text-xs"
                >
                  {tf.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Ranges */}
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-400">Range:</span>
            <div className="flex space-x-1">
              {RANGES.map(r => (
                <Button
                  key={r.value}
                  size="sm"
                  variant={range === r.value ? "default" : "outline"}
                  onClick={() => setRange(r.value)}
                  className="text-xs"
                >
                  {r.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Chart Type */}
          <div className="flex items-center space-x-2">
            <Button
              size="sm"
              variant={chartType === 'candlestick' ? "default" : "outline"}
              onClick={() => setChartType('candlestick')}
            >
              <CandlestickChart className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              variant={chartType === 'line' ? "default" : "outline"}
              onClick={() => setChartType('line')}
            >
              <Activity className="w-4 h-4" />
            </Button>
          </div>

          {/* Drawing Tools */}
          <div className="flex items-center space-x-1">
            <Button
              size="sm"
              variant={drawingMode === 'line' ? "default" : "outline"}
              onClick={() => setDrawingMode(drawingMode === 'line' ? 'none' : 'line')}
            >
              <Edit3 className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              variant={drawingMode === 'fibonacci' ? "default" : "outline"}
              onClick={() => setDrawingMode(drawingMode === 'fibonacci' ? 'none' : 'fibonacci')}
            >
              <Ruler className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              variant={drawingMode === 'horizontal' ? "default" : "outline"}
              onClick={() => setDrawingMode(drawingMode === 'horizontal' ? 'none' : 'horizontal')}
            >
              <Minus className="w-4 h-4" />
            </Button>
          </div>

          {/* Indicators */}
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-400">Indicators:</span>
            <select
              onChange={(e) => {
                const indicator = INDICATORS.find(ind => ind.id === e.target.value);
                if (indicator) addIndicator(indicator);
                e.target.value = '';
              }}
              className="bg-gray-800 text-white px-2 py-1 rounded border border-gray-600 text-xs"
            >
              <option value="">Add Indicator</option>
              {INDICATORS.map(ind => (
                <option key={ind.id} value={ind.id}>{ind.name}</option>
              ))}
            </select>
          </div>

          {/* Clear Drawings */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setDrawings([]);
              setCurrentDrawing(null);
              setDrawingMode('none');
            }}
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
        </div>

        {/* Active Indicators */}
        {indicators.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {indicators.map(indicator => (
              <div key={indicator.id} className="flex items-center space-x-2 bg-gray-800 px-2 py-1 rounded text-xs">
                <div className="w-3 h-3 rounded" style={{ backgroundColor: indicator.color }}></div>
                <span>{indicator.name}</span>
                <button
                  onClick={() => removeIndicator(indicator.id)}
                  className="text-red-400 hover:text-red-300"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Chart */}
      <div ref={containerRef} className="relative">
        <svg ref={svgRef} className="w-full" style={{ height: `${height}px` }}>
        </svg>
      </div>
    </div>
  );
}
