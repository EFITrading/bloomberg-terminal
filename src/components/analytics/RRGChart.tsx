'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as d3 from 'd3';
import { curveBasis, line as d3Line } from 'd3-shape';
import './RRGChart.css';

interface RRGDataPoint {
  symbol: string;
  name: string;
  rsRatio: number;
  rsMomentum: number;
  sector?: string;
  tail: Array<{ rsRatio: number; rsMomentum: number; date: string }>;
  currentPrice?: number;
  priceChange?: number;
  priceChangePercent?: number;
  currentIV?: number; // For IV mode - stored as percentage (e.g., 19.87 for 19.87%)
  ivRank?: number;
  ivPercentile?: number;
}

interface RRGChartProps {
  data: RRGDataPoint[];
  benchmark?: string;
  width?: number;
  height?: number;
  showTails?: boolean;
  tailLength?: number;
  timeframe?: string;
  onShowTailsChange?: (value: boolean) => void;
  onTailLengthChange?: (length: number) => void;
  onLookbackChange?: (index: number) => void;
  onRefresh?: () => void;
  // Control props
  selectedMode?: 'sectors' | 'industries' | 'custom' | 'waves' | 'weightedRRG';
  selectedSectorETF?: string | null;
  selectedIndustryETF?: string | null;
  customSymbols?: string;
  timeframeOptions?: Array<{ label: string; value: string; weeks: number; rsPeriod: number; momentumPeriod: number }>;
  benchmarkOptions?: Array<{ label: string; value: string }>;
  sectorETFs?: any;
  industryETFs?: any;
  onModeChange?: (mode: 'sectors' | 'industries' | 'custom' | 'waves' | 'weightedRRG') => void;
  onSectorETFChange?: (etf: string | null) => void;
  onIndustryETFChange?: (etf: string | null) => void;
  onCustomSymbolsChange?: (symbols: string) => void;
  onBenchmarkChange?: (benchmark: string) => void;
  onTimeframeChange?: (timeframe: string) => void;
  loading?: boolean;
  isIVMode?: boolean; // Flag to determine if this is IV RRG or regular RRG
  // IV RRG specific props
  symbolMode?: 'custom' | 'mag7' | 'highBeta' | 'lowBeta';
  onSymbolModeChange?: (mode: 'custom' | 'mag7' | 'highBeta' | 'lowBeta') => void;
}

const RRGChart: React.FC<RRGChartProps> = ({
  data,
  benchmark = 'SPY',
  width = 1500,
  height = 950,
  showTails = true,
  tailLength = 5,
  timeframe = '12 weeks',
  onShowTailsChange,
  onTailLengthChange,
  onLookbackChange,
  onRefresh,
  // Control props
  selectedMode = 'sectors',
  selectedSectorETF = null,
  selectedIndustryETF = null,
  customSymbols = '',
  timeframeOptions = [],
  benchmarkOptions = [],
  sectorETFs = {},
  industryETFs = {},
  onModeChange,
  onSectorETFChange,
  onIndustryETFChange,
  onCustomSymbolsChange,
  onBenchmarkChange,
  onTimeframeChange,
  loading = false,
  isIVMode = false,
  symbolMode = 'custom',
  onSymbolModeChange
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [selectedPoint, setSelectedPoint] = useState<RRGDataPoint | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<RRGDataPoint | null>(null);
  const [lookbackIndex, setLookbackIndex] = useState<number>(0);
  const [autoFit, setAutoFit] = useState<boolean>(true);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [selectedQuadrant, setSelectedQuadrant] = useState<string | null>(null);
  const [panOffset, setPanOffset] = useState<{ x: number, y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [lastMousePos, setLastMousePos] = useState<{ x: number, y: number }>({ x: 0, y: 0 });
  const [currentDomain, setCurrentDomain] = useState<{ x: [number, number], y: [number, number] }>({ x: [80, 120], y: [80, 120] });
  const [showWaves, setShowWaves] = useState<boolean>(false);
  const [activeWaves, setActiveWaves] = useState<Array<{ group: string, symbols: string[], quadrant: string, isActive: boolean }>>([]);

  // State for ticker visibility toggles
  const [visibleTickers, setVisibleTickers] = useState<Set<string>>(new Set());

  // State for long-press functionality
  const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(null);
  const [isLongPressing, setIsLongPressing] = useState<string | null>(null);
  const [previousVisibleTickers, setPreviousVisibleTickers] = useState<Set<string> | null>(null);

  // Initialize all tickers as visible when data changes
  useEffect(() => {
    if (data && data.length > 0) {
      setVisibleTickers(new Set(data.map(d => d.symbol)));
    }
  }, [data]);

  const margin = { top: 40, right: 60, bottom: 80, left: 60 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;

  // Sector group definitions
  const sectorGroups = {
    growth: ['XLK', 'XLY', 'XLC'],
    value: ['XLI', 'XLB', 'XLE', 'XLF'],
    defensives: ['XLV', 'XLU', 'XLRE', 'XLP']
  };

  // Generate historical dates for lookback slider
  const maxTailLength = Math.max(...data.map(d => d.tail.length));
  const historicalDates = Array.from({ length: maxTailLength + 1 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (maxTailLength - i) * 7); // Weekly intervals
    return date.toISOString().split('T')[0];
  });

  // Get current data based on lookback and filter by visible tickers
  const getCurrentData = () => {
    let currentData = data;

    if (lookbackIndex !== 0) {
      currentData = data.map(point => {
        const tailIndex = Math.max(0, point.tail.length - lookbackIndex);
        if (tailIndex >= point.tail.length) {
          return {
            ...point,
            rsRatio: point.tail[0]?.rsRatio || point.rsRatio,
            rsMomentum: point.tail[0]?.rsMomentum || point.rsMomentum,
            tail: []
          };
        }

        const currentPosition = point.tail[tailIndex];
        return {
          ...point,
          rsRatio: currentPosition.rsRatio,
          rsMomentum: currentPosition.rsMomentum,
          tail: point.tail.slice(0, tailIndex)
        };
      });
    }

    // Filter by visible tickers
    return currentData.filter(point => visibleTickers.has(point.symbol));
  };

  const currentData = useMemo(() => getCurrentData(), [data, lookbackIndex, visibleTickers]);

  // Wave detection logic
  useEffect(() => {
    if (!showWaves || data.length === 0) {
      setActiveWaves([]);
      return;
    }

    const detectWaves = () => {
      const waves: Array<{ group: string, symbols: string[], quadrant: string, isActive: boolean }> = [];

      console.log('🌊 Detecting waves with currentData:', currentData.length, 'points');
      console.log('🌊 Data length:', data.length);
      console.log('🌊 visibleTickers:', Array.from(visibleTickers));
      console.log('🌊 Sector groups:', sectorGroups);

      // Helper to get quadrant
      const getQuadrant = (rsRatio: number, rsMomentum: number) => {
        if (rsRatio >= 100 && rsMomentum >= 100) return 'leading';
        if (rsRatio >= 100 && rsMomentum < 100) return 'weakening';
        if (rsRatio < 100 && rsMomentum < 100) return 'lagging';
        return 'improving';
      };

      // Helper to calculate distance between two points
      const distance = (p1: RRGDataPoint, p2: RRGDataPoint) => {
        const dx = p1.rsRatio - p2.rsRatio;
        const dy = p1.rsMomentum - p2.rsMomentum;
        return Math.sqrt(dx * dx + dy * dy);
      };

      // Helper to check if vectors are aligned (moving in similar direction)
      const areVectorsAligned = (p1: RRGDataPoint, p2: RRGDataPoint, threshold = 0.5) => {
        if (!p1.tail.length || !p2.tail.length) return false;

        const p1Prev = p1.tail[p1.tail.length - 1];
        const p2Prev = p2.tail[p2.tail.length - 1];

        const v1 = { x: p1.rsRatio - p1Prev.rsRatio, y: p1.rsMomentum - p1Prev.rsMomentum };
        const v2 = { x: p2.rsRatio - p2Prev.rsRatio, y: p2.rsMomentum - p2Prev.rsMomentum };

        const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
        const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);

        if (mag1 === 0 || mag2 === 0) return false;

        const dot = (v1.x * v2.x + v1.y * v2.y) / (mag1 * mag2);
        return dot > threshold; // Vectors pointing in similar direction
      };

      // Check each group - ALWAYS show all three groups
      Object.entries(sectorGroups).forEach(([groupName, symbols]) => {
        const groupPoints = currentData.filter(d => symbols.includes(d.symbol));

        if (groupPoints.length < 2) {
          // Even if not enough points, add as inactive wave
          waves.push({
            group: groupName,
            symbols: groupPoints.map(p => p.symbol),
            quadrant: 'none',
            isActive: false
          });
          return;
        }

        // Group points by quadrant
        const quadrantGroups: { [key: string]: RRGDataPoint[] } = {};
        groupPoints.forEach(point => {
          const quad = getQuadrant(point.rsRatio, point.rsMomentum);
          if (!quadrantGroups[quad]) quadrantGroups[quad] = [];
          quadrantGroups[quad].push(point);
        });

        // Track if we found an active wave for this group
        let foundActiveWave = false;

        // Check each quadrant for clustering
        Object.entries(quadrantGroups).forEach(([quadrant, points]) => {
          const minPoints = groupName === 'growth' ? 2 : 3;
          if (points.length < minPoints) return;

          // Check if points are clustered (within proximity threshold)
          const proximityThreshold = 5; // Adjust based on scale
          let clustered = true;

          for (let i = 0; i < points.length - 1; i++) {
            for (let j = i + 1; j < points.length; j++) {
              if (distance(points[i], points[j]) > proximityThreshold) {
                clustered = false;
                break;
              }
            }
            if (!clustered) break;
          }

          // Check if they're moving together (aligned vectors)
          if (clustered) {
            let movingTogether = true;
            for (let i = 0; i < points.length - 1; i++) {
              if (!areVectorsAligned(points[i], points[i + 1])) {
                movingTogether = false;
                break;
              }
            }

            if (movingTogether) {
              waves.push({
                group: groupName,
                symbols: points.map(p => p.symbol),
                quadrant,
                isActive: true
              });
              foundActiveWave = true;
            }
          }
        });

        // If no active wave found, add as inactive
        if (!foundActiveWave) {
          waves.push({
            group: groupName,
            symbols: groupPoints.map(p => p.symbol),
            quadrant: 'scattered',
            isActive: false
          });
        }
      });

      console.log('🌊 Waves detected:', waves.length, 'waves');
      console.log('🌊 Wave details:', waves);
      setActiveWaves(waves);
    };

    detectWaves();
  }, [showWaves, data, lookbackIndex, visibleTickers]);

  // Auto-enable waves when in waves mode
  useEffect(() => {
    if (selectedMode === 'waves') {
      console.log('🌊 Auto-enabling waves for waves mode');
      setShowWaves(true);
    } else {
      setShowWaves(false);
    }
  }, [selectedMode]);

  // Auto-play functionality
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      setLookbackIndex(prev => {
        const next = prev + 1;
        if (next >= maxTailLength) {
          setIsPlaying(false);
          return 0;
        }
        return next;
      });
    }, 500);

    return () => clearInterval(interval);
  }, [isPlaying, maxTailLength]);

  // Fit and center functions
  const fitToData = () => {
    setAutoFit(true);
    setZoomLevel(1);
    setSelectedQuadrant(null);
    setPanOffset({ x: 0, y: 0 });
  };

  const centerChart = () => {
    // Reset to center on 100,100
    setZoomLevel(1);
    setAutoFit(false);
    setSelectedQuadrant(null);
    setPanOffset({ x: 0, y: 0 });
  };

  const playAnimation = () => {
    if (maxTailLength === 0) return;
    setLookbackIndex(maxTailLength);
    setIsPlaying(true);
  };

  // Toggle ticker visibility
  const toggleTickerVisibility = (symbol: string) => {
    setVisibleTickers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(symbol)) {
        newSet.delete(symbol);
      } else {
        newSet.add(symbol);
      }
      return newSet;
    });
  };

  // Toggle all tickers on/off
  const toggleAllTickers = (show: boolean) => {
    if (show) {
      setVisibleTickers(new Set(data.map(d => d.symbol)));
    } else {
      setVisibleTickers(new Set());
    }
  };

  // Long-press functionality for ticker isolation
  const startLongPress = (symbol: string) => {
    // Clear any existing timer
    if (longPressTimer) {
      clearTimeout(longPressTimer);
    }

    setIsLongPressing(symbol);

    // Start 4-second timer
    const timer = setTimeout(() => {
      // Save current state for restoration
      setPreviousVisibleTickers(new Set(visibleTickers));

      // Isolate the ticker (show only this one)
      setVisibleTickers(new Set([symbol]));

      // Clear long press state
      setIsLongPressing(null);
      setLongPressTimer(null);

      // Optional: Show visual feedback
      console.log(`Isolated ticker: ${symbol}`);
    }, 4000); // 4 seconds

    setLongPressTimer(timer);
  };

  const cancelLongPress = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
    setIsLongPressing(null);
  };

  // Restore previous ticker visibility
  const restorePreviousTickers = () => {
    if (previousVisibleTickers) {
      setVisibleTickers(new Set(previousVisibleTickers));
      setPreviousVisibleTickers(null);
    }
  };

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
      }
    };
  }, [longPressTimer]);

  // Persistent color palette for tickers - each ticker gets a unique color that never changes
  const generateTickerColor = (symbol: string, index: number): string => {
    const colors = [
      '#FF0000', // BRIGHT RED
      '#00FF00', // BRIGHT GREEN
      '#0000FF', // BRIGHT BLUE
      '#FFFF00', // BRIGHT YELLOW
      '#FF00FF', // BRIGHT MAGENTA
      '#00FFFF', // BRIGHT CYAN
      '#FF8000', // BRIGHT ORANGE
      '#8000FF', // BRIGHT PURPLE
      '#FF0080', // BRIGHT PINK
      '#00FF80', // BRIGHT SPRING GREEN
      '#FFFFFF', // WHITE
      '#FF4500', // RED ORANGE
      '#32CD32', // LIME GREEN
      '#1E90FF', // DODGE BLUE
      '#FFD700', // GOLD
      '#9932CC', // DARK ORCHID
      '#FF69B4', // HOT PINK
      '#F0F8FF', // ALICE BLUE
      '#ADFF2F', // GREEN YELLOW
      '#87CEFA', // LIGHT SKY BLUE
      '#DC143C', // CRIMSON
      '#00FA9A', // MEDIUM SPRING GREEN
      '#4169E1', // ROYAL BLUE
      '#FFFF99', // LIGHT YELLOW
      '#DA70D6', // ORCHID
      '#FFB6C1', // LIGHT PINK
      '#E6E6FA', // LAVENDER
      '#7FFF00', // CHARTREUSE
      '#B0E0E6', // POWDER BLUE
      '#CD5C5C', // INDIAN RED
      '#98FB98', // PALE GREEN
      '#6495ED', // CORNFLOWER BLUE
      '#F0E68C', // KHAKI
      '#DDA0DD', // PLUM
      '#FFDAB9', // PEACH PUFF
      '#FFFACD', // LEMON CHIFFON
      '#90EE90', // LIGHT GREEN
      '#ADD8E6', // LIGHT BLUE
      '#FF6347', // TOMATO
      '#40E0D0', // TURQUOISE
      '#8A2BE2', // BLUE VIOLET
      '#FFA500', // ORANGE
      '#20B2AA', // LIGHT SEA GREEN
      '#BA55D3', // MEDIUM ORCHID
      '#FF1493', // DEEP PINK
      '#00CED1', // DARK TURQUOISE
      '#FF7F50', // CORAL
      '#9AFF9A', // MINT GREEN
      '#FF8C00', // DARK ORANGE
      '#00BFFF', // DEEP SKY BLUE
      '#FFEFD5', // PAPAYA WHIP
      '#FA8072' // SALMON
    ];

    // Use symbol hash for consistent color assignment
    let hash = 0;
    for (let i = 0; i < symbol.length; i++) {
      hash = ((hash << 5) - hash + symbol.charCodeAt(i)) & 0xffffffff;
    }
    return colors[Math.abs(hash) % colors.length];
  };

  // Memoize ticker colors to ensure consistency
  const tickerColors = useMemo(() => {
    const colorMap: { [key: string]: string } = {};
    currentData.forEach((item, index) => {
      colorMap[item.symbol] = generateTickerColor(item.symbol, index);
    });
    return colorMap;
  }, [currentData.map(d => d.symbol).join(',')]);

  // Bloomberg Terminal Color Scheme for IV RRG
  const ivQuadrantColors = {
    leading: '#30D158', // GREEN - Leading Negative (top-right)
    weakening: '#FF3B30', // RED - Lagging Positive (bottom-right)
    lagging: '#FF9500', // ORANGE - Lagging Negative (bottom-left)
    improving: '#00D4FF' // BLUE/CYAN - Leading Positive (top-left)
  };

  // Standard RRG Color Scheme
  const standardQuadrantColors = {
    leading: '#228B22', // GREEN - Leading (top-right)
    weakening: '#FFD700', // YELLOW - Weakening (bottom-right)
    lagging: '#FF0000', // RED - Lagging (bottom-left)
    improving: '#0000FF' // BLUE - Improving (top-left)
  };

  // Use IV colors when in IV mode, otherwise use standard colors
  const quadrantColors = isIVMode ? ivQuadrantColors : standardQuadrantColors;

  const getQuadrant = (rsRatio: number, rsMomentum: number): keyof typeof quadrantColors => {
    if (rsRatio >= 100 && rsMomentum >= 100) return 'leading';
    if (rsRatio >= 100 && rsMomentum < 100) return 'weakening';
    if (rsRatio < 100 && rsMomentum < 100) return 'lagging';
    return 'improving';
  };

  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    // Add mouse event handlers with proper state closure
    const handleMouseDown = (event: MouseEvent) => {
      // Enable dragging for panning when zoomed in
      if (event.button === 0) { // Left mouse button
        setIsDragging(true);
        setLastMousePos({ x: event.clientX, y: event.clientY });
        event.preventDefault();
      }
    };

    const handleMouseMove = (event: MouseEvent) => {
      // Professional RRG drag mechanics - inverted like EFI Terminal
      if (isDragging && zoomLevel > 1) {
        const deltaX = event.clientX - lastMousePos.x;
        const deltaY = event.clientY - lastMousePos.y;

        // Much slower sensitivity - 90% reduction from 0.2 to 0.02
        const sensitivity = 0.02;

        // CORRECTED drag directions like EFI Terminal:
        // Drag down = move DOWN Y axis (lower momentum values)
        // Drag up = move UP Y axis (higher momentum values) 
        // Drag left = move right X axis (positive strength)
        // Drag right = move left X axis (negative strength)
        const adjustedDeltaX = deltaX * sensitivity; // Same direction for X 
        const adjustedDeltaY = -deltaY * sensitivity; // INVERTED for Y to fix the flip

        setPanOffset(prev => {
          const newX = prev.x + adjustedDeltaX;
          const newY = prev.y + adjustedDeltaY;

          // Calculate maximum pan based on zoom level to keep quadrants visible
          const maxPanX = Math.max(0, (chartWidth * (zoomLevel - 1)) / (2 * zoomLevel));
          const maxPanY = Math.max(0, (chartHeight * (zoomLevel - 1)) / (2 * zoomLevel));

          // Hard stop at calculated boundaries - no gray area allowed
          return {
            x: Math.max(-maxPanX, Math.min(maxPanX, newX)),
            y: Math.max(-maxPanY, Math.min(maxPanY, newY))
          };
        });

        setLastMousePos({ x: event.clientX, y: event.clientY });
      }
    };

    const handleMouseUp = () => {
      // Simple mouse up - no complex boundary snapping
      setIsDragging(false);
    };

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();

      // StockCharts-style zoom: smooth, mouse-centered, professional feel
      const rect = svgElement.getBoundingClientRect();
      const mouseX = (event.clientX - rect.left) / rect.width; // Normalized mouse position
      const mouseY = (event.clientY - rect.top) / rect.height;

      // StockCharts zoom increments: smooth but not too fine
      const zoomIntensity = 0.15; // Balanced zoom speed
      const direction = event.deltaY > 0 ? -1 : 1;
      const oldZoom = zoomLevel;
      const newZoom = Math.max(0.5, Math.min(4, zoomLevel + direction * zoomIntensity));

      if (newZoom !== oldZoom) {
        setZoomLevel(newZoom);

        // StockCharts-style mouse-centered zoom with automatic pan adjustment
        if (newZoom > 1) {
          const zoomRatio = newZoom / oldZoom;
          const zoomCenterOffsetX = (mouseX - 0.5) * 20; // Offset toward mouse position
          const zoomCenterOffsetY = (mouseY - 0.5) * 20;

          setPanOffset(prev => ({
            x: prev.x * zoomRatio + (zoomCenterOffsetX * (newZoom - oldZoom) * 0.3),
            y: prev.y * zoomRatio + (zoomCenterOffsetY * (newZoom - oldZoom) * 0.3)
          }));
        } else {
          // Auto-center when zooming back to 1x (StockCharts behavior)
          setPanOffset({ x: 0, y: 0 });
        }
      }
    };

    // Add event listeners
    const svgElement = svgRef.current;
    svgElement.addEventListener('mousedown', handleMouseDown);
    svgElement.addEventListener('mousemove', handleMouseMove);
    svgElement.addEventListener('mouseup', handleMouseUp);
    svgElement.addEventListener('mouseleave', handleMouseUp);
    svgElement.addEventListener('wheel', handleWheel, { passive: false });

    // Create scales
    const rsRatioExtent = d3.extent(currentData.flatMap(d => [
      d.rsRatio,
      ...d.tail.map(t => t.rsRatio)
    ])) as [number, number];

    const rsMomentumExtent = d3.extent(currentData.flatMap(d => [
      d.rsMomentum,
      ...d.tail.map(t => t.rsMomentum)
    ])) as [number, number];

    // Expand scales to ensure 100,100 is centered or use auto-fit
    let xDomain, yDomain;

    // If no data, use default centered domain to show empty quadrants
    if (currentData.length === 0 || !rsRatioExtent[0] || !rsMomentumExtent[0]) {
      xDomain = [80, 120];
      yDomain = [80, 120];
    } else if (autoFit && rsRatioExtent && rsMomentumExtent) {
      const rsRatioPadding = (rsRatioExtent[1] - rsRatioExtent[0]) * 0.1;
      const rsMomentumPadding = (rsMomentumExtent[1] - rsMomentumExtent[0]) * 0.1;

      xDomain = [
        rsRatioExtent[0] - rsRatioPadding,
        rsRatioExtent[1] + rsRatioPadding
      ];
      yDomain = [
        rsMomentumExtent[0] - rsMomentumPadding,
        rsMomentumExtent[1] + rsMomentumPadding
      ];
    } else {
      xDomain = [
        Math.min(rsRatioExtent[0] || 80, 80),
        Math.max(rsRatioExtent[1] || 120, 120)
      ];
      yDomain = [
        Math.min(rsMomentumExtent[0] || 80, 80),
        Math.max(rsMomentumExtent[1] || 120, 120)
      ];
    }

    // Calculate zoom and view parameters with pan offset
    let currentXDomain = xDomain;
    let currentYDomain = yDomain;

    // Apply pan offset first
    const panX = panOffset.x / zoomLevel;
    const panY = panOffset.y / zoomLevel;

    // Apply quadrant-specific zoom
    if (selectedQuadrant && zoomLevel > 1) {
      const centerX = 100;
      const centerY = 100;

      // More aggressive zoom for quadrant focus
      const quadrantZoomFactor = zoomLevel * 1.5;
      const rangeX = (xDomain[1] - xDomain[0]) / quadrantZoomFactor;
      const rangeY = (yDomain[1] - yDomain[0]) / quadrantZoomFactor;

      switch (selectedQuadrant) {
        case 'leading':
          // Top-right quadrant (RS > 100, Momentum > 100)
          currentXDomain = [centerX - panX, centerX + rangeX - panX];
          currentYDomain = [centerY - panY, centerY + rangeY - panY];
          break;
        case 'weakening':
          // Bottom-right quadrant (RS > 100, Momentum < 100)
          currentXDomain = [centerX - panX, centerX + rangeX - panX];
          currentYDomain = [centerY - rangeY - panY, centerY - panY];
          break;
        case 'lagging':
          // Bottom-left quadrant (RS < 100, Momentum < 100)
          currentXDomain = [centerX - rangeX - panX, centerX - panX];
          currentYDomain = [centerY - rangeY - panY, centerY - panY];
          break;
        case 'improving':
          // Top-left quadrant (RS < 100, Momentum > 100)
          currentXDomain = [centerX - rangeX - panX, centerX - panX];
          currentYDomain = [centerY - panY, centerY + rangeY - panY];
          break;
      }
    } else if (zoomLevel > 1) {
      // General zoom around center with pan
      const centerX = (xDomain[0] + xDomain[1]) / 2;
      const centerY = (yDomain[0] + yDomain[1]) / 2;
      const rangeX = (xDomain[1] - xDomain[0]) / zoomLevel;
      const rangeY = (yDomain[1] - yDomain[0]) / zoomLevel;

      currentXDomain = [centerX - rangeX / 2 - panX, centerX + rangeX / 2 - panX];
      currentYDomain = [centerY - rangeY / 2 - panY, centerY + rangeY / 2 - panY];
    } else {
      // Just apply pan offset to base domain
      currentXDomain = [xDomain[0] - panX, xDomain[1] - panX];
      currentYDomain = [yDomain[0] - panY, yDomain[1] - panY];
    }

    // Create scales for chart content (with pan/zoom)
    const xScale = d3.scaleLinear()
      .domain(currentXDomain)
      .range([0, chartWidth]);

    const yScale = d3.scaleLinear()
      .domain(currentYDomain)
      .range([chartHeight, 0]);

    // Create stable scales for axes (without pan/zoom)
    const xAxisScale = d3.scaleLinear()
      .domain(xDomain)
      .range([0, chartWidth]);

    const yAxisScale = d3.scaleLinear()
      .domain(yDomain)
      .range([chartHeight, 0]);

    // Create main group
    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Create stable axes group (doesn't move with pan/zoom)
    const axesGroup = g.append('g');

    // Create clipping path to strictly contain all elements within chart boundaries
    const clipId = `chart-clip-${Math.random().toString(36).substr(2, 9)}`;
    const defs = svg.append('defs');

    defs.append('clipPath')
      .attr('id', clipId)
      .append('rect')
      .attr('x', 0) // Start at chart origin
      .attr('y', 0)
      .attr('width', chartWidth) // Exact chart dimensions
      .attr('height', chartHeight);

    // Create arrow marker for tail endpoints
    const arrowMarkerId = `arrow-${Math.random().toString(36).substr(2, 9)}`;
    defs.append('marker')
      .attr('id', arrowMarkerId)
      .attr('viewBox', '0 0 10 10')
      .attr('refX', 8)
      .attr('refY', 3)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,0 L0,6 L9,3 z')
      .attr('fill', 'currentColor');

    // Add invisible background rect FIRST (behind everything) to capture mouse events
    const chartBackground = g.append('rect')
      .attr('class', 'chart-background')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', chartWidth)
      .attr('height', chartHeight)
      .attr('fill', 'transparent')
      .attr('pointer-events', 'all');

    // Create chart content group (moves with pan/zoom) with generous clipping
    const chartGroup = g.append('g')
      .attr('clip-path', `url(#${clipId})`);

    // Draw center cross grid lines only (100,100)
    const center100X = xScale(100);
    const center100Y = yScale(100);

    // Center vertical line (x=100)
    if (center100X >= 0 && center100X <= chartWidth) {
      chartGroup.append('line')
        .attr('class', 'center-grid-line-x')
        .attr('x1', center100X)
        .attr('x2', center100X)
        .attr('y1', 0)
        .attr('y2', chartHeight)
        .attr('stroke', '#ffffff')
        .attr('stroke-width', 2)
        .attr('opacity', 0.8);
    }

    // Center horizontal line (y=100)
    if (center100Y >= 0 && center100Y <= chartHeight) {
      chartGroup.append('line')
        .attr('class', 'center-grid-line-y')
        .attr('x1', 0)
        .attr('x2', chartWidth)
        .attr('y1', center100Y)
        .attr('y2', center100Y)
        .attr('stroke', '#ffffff')
        .attr('stroke-width', 2)
        .attr('opacity', 0.8);
    }

    // Draw quadrant background colors that move with pan/zoom

    // Calculate quadrant boundaries using scale coordinates
    const domainMinX = xScale.domain()[0];
    const domainMaxX = xScale.domain()[1];
    const domainMinY = yScale.domain()[0];
    const domainMaxY = yScale.domain()[1];

    if (isIVMode) {
      // Bloomberg Terminal style gradients for IV RRG - More vibrant and visible
      const defs = svg.append('defs');

      // Leading gradient (top-right - Green)
      const leadingGradient = defs.append('linearGradient')
        .attr('id', 'leading-gradient')
        .attr('x1', '0%')
        .attr('y1', '0%')
        .attr('x2', '100%')
        .attr('y2', '100%');
      leadingGradient.append('stop')
        .attr('offset', '0%')
        .attr('stop-color', '#000000')
        .attr('stop-opacity', 1);
      leadingGradient.append('stop')
        .attr('offset', '50%')
        .attr('stop-color', '#00b300')
        .attr('stop-opacity', 1);
      leadingGradient.append('stop')
        .attr('offset', '100%')
        .attr('stop-color', '#000000')
        .attr('stop-opacity', 1);

      // Weakening gradient (bottom-right - Red)
      const weakeningGradient = defs.append('linearGradient')
        .attr('id', 'weakening-gradient')
        .attr('x1', '0%')
        .attr('y1', '0%')
        .attr('x2', '100%')
        .attr('y2', '100%');
      weakeningGradient.append('stop')
        .attr('offset', '0%')
        .attr('stop-color', '#000000')
        .attr('stop-opacity', 1);
      weakeningGradient.append('stop')
        .attr('offset', '50%')
        .attr('stop-color', '#b30000')
        .attr('stop-opacity', 1);
      weakeningGradient.append('stop')
        .attr('offset', '100%')
        .attr('stop-color', '#000000')
        .attr('stop-opacity', 1);

      // Lagging gradient (bottom-left - Orange)
      const laggingGradient = defs.append('linearGradient')
        .attr('id', 'lagging-gradient')
        .attr('x1', '0%')
        .attr('y1', '0%')
        .attr('x2', '100%')
        .attr('y2', '100%');
      laggingGradient.append('stop')
        .attr('offset', '0%')
        .attr('stop-color', '#000000')
        .attr('stop-opacity', 1);
      laggingGradient.append('stop')
        .attr('offset', '50%')
        .attr('stop-color', '#b35900')
        .attr('stop-opacity', 1);
      laggingGradient.append('stop')
        .attr('offset', '100%')
        .attr('stop-color', '#000000')
        .attr('stop-opacity', 1);

      // Improving gradient (top-left - Blue/Cyan)
      const improvingGradient = defs.append('linearGradient')
        .attr('id', 'improving-gradient')
        .attr('x1', '0%')
        .attr('y1', '0%')
        .attr('x2', '100%')
        .attr('y2', '100%');
      improvingGradient.append('stop')
        .attr('offset', '0%')
        .attr('stop-color', '#000000')
        .attr('stop-opacity', 1);
      improvingGradient.append('stop')
        .attr('offset', '50%')
        .attr('stop-color', '#00b3b3')
        .attr('stop-opacity', 1);
      improvingGradient.append('stop')
        .attr('offset', '100%')
        .attr('stop-color', '#000000')
        .attr('stop-opacity', 1);

      // Leading quadrant (top-right) - RS Ratio >= 100, RS Momentum >= 100
      chartGroup.append('rect')
        .attr('class', 'quadrant-bg leading')
        .attr('x', Math.min(xScale(100), xScale(domainMaxX)))
        .attr('y', Math.min(yScale(domainMaxY), yScale(100)))
        .attr('width', Math.max(0, Math.abs(xScale(domainMaxX) - xScale(100))))
        .attr('height', Math.max(0, Math.abs(yScale(100) - yScale(domainMaxY))))
        .attr('fill', 'url(#leading-gradient)')
        .attr('opacity', 1);

      // Weakening quadrant (bottom-right) - RS Ratio >= 100, RS Momentum < 100
      chartGroup.append('rect')
        .attr('class', 'quadrant-bg weakening')
        .attr('x', Math.min(xScale(100), xScale(domainMaxX)))
        .attr('y', Math.min(yScale(100), yScale(domainMinY)))
        .attr('width', Math.max(0, Math.abs(xScale(domainMaxX) - xScale(100))))
        .attr('height', Math.max(0, Math.abs(yScale(domainMinY) - yScale(100))))
        .attr('fill', 'url(#weakening-gradient)')
        .attr('opacity', 1);

      // Lagging quadrant (bottom-left) - RS Ratio < 100, RS Momentum < 100
      chartGroup.append('rect')
        .attr('class', 'quadrant-bg lagging')
        .attr('x', Math.min(xScale(domainMinX), xScale(100)))
        .attr('y', Math.min(yScale(100), yScale(domainMinY)))
        .attr('width', Math.max(0, Math.abs(xScale(100) - xScale(domainMinX))))
        .attr('height', Math.max(0, Math.abs(yScale(domainMinY) - yScale(100))))
        .attr('fill', 'url(#lagging-gradient)')
        .attr('opacity', 1);

      // Improving quadrant (top-left) - RS Ratio < 100, RS Momentum >= 100
      chartGroup.append('rect')
        .attr('class', 'quadrant-bg improving')
        .attr('x', Math.min(xScale(domainMinX), xScale(100)))
        .attr('y', Math.min(yScale(domainMaxY), yScale(100)))
        .attr('width', Math.max(0, Math.abs(xScale(100) - xScale(domainMinX))))
        .attr('height', Math.max(0, Math.abs(yScale(100) - yScale(domainMaxY))))
        .attr('fill', 'url(#improving-gradient)')
        .attr('opacity', 1);
    } else {
      // Standard solid colors for regular RRG
      // Leading quadrant (top-right) - RS Ratio >= 100, RS Momentum >= 100
      chartGroup.append('rect')
        .attr('class', 'quadrant-bg leading')
        .attr('x', xScale(100))
        .attr('y', yScale(domainMaxY))
        .attr('width', xScale(domainMaxX) - xScale(100))
        .attr('height', yScale(100) - yScale(domainMaxY))
        .attr('fill', quadrantColors.leading)
        .attr('opacity', 0.4);

      // Weakening quadrant (bottom-right) - RS Ratio >= 100, RS Momentum < 100
      chartGroup.append('rect')
        .attr('class', 'quadrant-bg weakening')
        .attr('x', xScale(100))
        .attr('y', yScale(100))
        .attr('width', xScale(domainMaxX) - xScale(100))
        .attr('height', yScale(domainMinY) - yScale(100))
        .attr('fill', quadrantColors.weakening)
        .attr('opacity', 0.4);

      // Lagging quadrant (bottom-left) - RS Ratio < 100, RS Momentum < 100
      chartGroup.append('rect')
        .attr('class', 'quadrant-bg lagging')
        .attr('x', xScale(domainMinX))
        .attr('y', yScale(100))
        .attr('width', xScale(100) - xScale(domainMinX))
        .attr('height', yScale(domainMinY) - yScale(100))
        .attr('fill', quadrantColors.lagging)
        .attr('opacity', 0.4);

      // Improving quadrant (top-left) - RS Ratio < 100, RS Momentum >= 100
      chartGroup.append('rect')
        .attr('class', 'quadrant-bg improving')
        .attr('x', xScale(domainMinX))
        .attr('y', yScale(domainMaxY))
        .attr('width', xScale(100) - xScale(domainMinX))
        .attr('height', yScale(100) - yScale(domainMaxY))
        .attr('fill', quadrantColors.improving)
        .attr('opacity', 0.4);
    }

    // Create axes that stay fixed at chart edges but use updated scales
    const xAxis = d3.axisBottom(xScale)
      .tickFormat(d => `${d}`);

    const yAxis = d3.axisLeft(yScale)
      .tickFormat(d => `${d}`);

    axesGroup.append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,${chartHeight})`)
      .call(xAxis)
      .append('text')
      .attr('x', chartWidth / 2)
      .attr('y', 35)
      .attr('fill', 'white')
      .attr('text-anchor', 'middle')
      .attr('font-size', '14px')
      .text('RS-Ratio (Relative Strength)');

    axesGroup.append('g')
      .attr('class', 'y-axis')
      .call(yAxis)
      .append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', -40)
      .attr('x', -chartHeight / 2)
      .attr('fill', 'white')
      .attr('text-anchor', 'middle')
      .attr('font-size', '14px')
      .text('RS-Momentum (Rate of Change)');

    // Add quadrant labels directly on the chart
    if (isIVMode) {
      // IV RRG labels
      // Bottom-left label with background
      const bottomLeftLabel = axesGroup.append('g');
      const bottomLeftText = bottomLeftLabel.append('text')
        .attr('x', center100X / 2)
        .attr('y', chartHeight - 10)
        .attr('fill', '#00CED1')
        .attr('text-anchor', 'middle')
        .attr('font-size', '16px')
        .attr('font-weight', 'bold')
        .text('Cheap Vol Getting Cheaper');
      const bottomLeftBBox = (bottomLeftText.node() as SVGTextElement).getBBox();
      bottomLeftLabel.insert('rect', 'text')
        .attr('x', bottomLeftBBox.x - 8)
        .attr('y', bottomLeftBBox.y - 4)
        .attr('width', bottomLeftBBox.width + 16)
        .attr('height', bottomLeftBBox.height + 8)
        .attr('fill', '#000000')
        .attr('stroke', '#00CED1')
        .attr('stroke-width', 1.5)
        .attr('rx', 4);

      // Bottom-right label with background
      const bottomRightLabel = axesGroup.append('g');
      const bottomRightText = bottomRightLabel.append('text')
        .attr('x', center100X + (chartWidth - center100X) / 2)
        .attr('y', chartHeight - 10)
        .attr('fill', '#DA70D6')
        .attr('text-anchor', 'middle')
        .attr('font-size', '16px')
        .attr('font-weight', 'bold')
        .text('Expensive Vol Cooling Off');
      const bottomRightBBox = (bottomRightText.node() as SVGTextElement).getBBox();
      bottomRightLabel.insert('rect', 'text')
        .attr('x', bottomRightBBox.x - 8)
        .attr('y', bottomRightBBox.y - 4)
        .attr('width', bottomRightBBox.width + 16)
        .attr('height', bottomRightBBox.height + 8)
        .attr('fill', '#000000')
        .attr('stroke', '#DA70D6')
        .attr('stroke-width', 1.5)
        .attr('rx', 4);

      // Top-left label with background
      const topLeftLabel = axesGroup.append('g');
      const topLeftText = topLeftLabel.append('text')
        .attr('x', center100X / 2)
        .attr('y', 20)
        .attr('fill', '#00CED1')
        .attr('text-anchor', 'middle')
        .attr('font-size', '16px')
        .attr('font-weight', 'bold')
        .text('Cheap Vol Heating Up');
      const topLeftBBox = (topLeftText.node() as SVGTextElement).getBBox();
      topLeftLabel.insert('rect', 'text')
        .attr('x', topLeftBBox.x - 8)
        .attr('y', topLeftBBox.y - 4)
        .attr('width', topLeftBBox.width + 16)
        .attr('height', topLeftBBox.height + 8)
        .attr('fill', '#000000')
        .attr('stroke', '#00CED1')
        .attr('stroke-width', 1.5)
        .attr('rx', 4);

      // Top-right label with background
      const topRightLabel = axesGroup.append('g');
      const topRightText = topRightLabel.append('text')
        .attr('x', center100X + (chartWidth - center100X) / 2)
        .attr('y', 20)
        .attr('fill', '#DA70D6')
        .attr('text-anchor', 'middle')
        .attr('font-size', '16px')
        .attr('font-weight', 'bold')
        .text('Expensive Vol Getting More Expensive');
      const topRightBBox = (topRightText.node() as SVGTextElement).getBBox();
      topRightLabel.insert('rect', 'text')
        .attr('x', topRightBBox.x - 8)
        .attr('y', topRightBBox.y - 4)
        .attr('width', topRightBBox.width + 16)
        .attr('height', topRightBBox.height + 8)
        .attr('fill', '#000000')
        .attr('stroke', '#DA70D6')
        .attr('stroke-width', 1.5)
        .attr('rx', 4);
    } else {
      // Regular RRG labels
      // Bottom-left label
      axesGroup.append('text')
        .attr('x', center100X / 2)
        .attr('y', chartHeight - 10)
        .attr('fill', '#FF0000')
        .attr('text-anchor', 'middle')
        .attr('font-size', '16px')
        .attr('font-weight', 'bold')
        .text('Lagging');

      // Bottom-right label
      axesGroup.append('text')
        .attr('x', center100X + (chartWidth - center100X) / 2)
        .attr('y', chartHeight - 10)
        .attr('fill', '#FFD700')
        .attr('text-anchor', 'middle')
        .attr('font-size', '16px')
        .attr('font-weight', 'bold')
        .text('Weakening');

      // Top-left label
      axesGroup.append('text')
        .attr('x', center100X / 2)
        .attr('y', 20)
        .attr('fill', '#0000FF')
        .attr('text-anchor', 'middle')
        .attr('font-size', '16px')
        .attr('font-weight', 'bold')
        .text('Improving');

      // Top-right label
      axesGroup.append('text')
        .attr('x', center100X + (chartWidth - center100X) / 2)
        .attr('y', 20)
        .attr('fill', '#228B22')
        .attr('text-anchor', 'middle')
        .attr('font-size', '16px')
        .attr('font-weight', 'bold')
        .text('Leading');
    }

    // Draw tails if enabled (hide in waves mode)
    if (showTails && selectedMode !== 'waves') {
      currentData.forEach(point => {
        if (point.tail.length > 1) {
          // Dynamic tail length based on timeframe - use the tailLength parameter
          const dynamicTailLength = tailLength;

          const limitedTailPoints = point.tail.slice(-dynamicTailLength);

          // Don't filter tail points - show full tail and let SVG clipping handle visibility
          // This prevents tails from jumping when zooming (StockCharts behavior)
          const tailData = [...limitedTailPoints, { rsRatio: point.rsRatio, rsMomentum: point.rsMomentum }];

          if (tailData.length > 1) {
            // Get persistent color for this ticker
            // Get persistent ticker color with fallback to prevent gray lines
            const tickerColor = tickerColors[point.symbol] || generateTickerColor(point.symbol, 0);

            // Create smooth line generator WITHOUT clipping bounds for tails
            const line = d3.line<{ rsRatio: number; rsMomentum: number }>()
              .x(d => xScale(d.rsRatio)) // No Math.max/min clipping - let clipping path handle it
              .y(d => yScale(d.rsMomentum)) // No Math.max/min clipping - let clipping path handle it
              .curve(d3.curveCatmullRom.alpha(0.5)); // Smoother curve

            // Create STABLE offset based on ticker symbol hash (±2 pixels)
            const symbolHash = point.symbol.split('').reduce((a, b) => {
              a = ((a << 5) - a) + b.charCodeAt(0);
              return a & a;
            }, 0);
            const offsetX = ((symbolHash % 100) / 100 - 0.5) * 4;
            const offsetY = (((symbolHash * 7) % 100) / 100 - 0.5) * 4;

            // Create unique arrow marker for this ticker with its specific color
            const tickerArrowId = `arrow-${point.symbol.replace(/[^a-zA-Z0-9]/g, '')}-${Math.random().toString(36).substr(2, 4)}`;
            defs.append('marker')
              .attr('id', tickerArrowId)
              .attr('viewBox', '0 0 10 10')
              .attr('refX', 8)
              .attr('refY', 3)
              .attr('markerWidth', 6)
              .attr('markerHeight', 6)
              .attr('orient', 'auto')
              .append('path')
              .attr('d', 'M0,0 L0,6 L9,3 z')
              .attr('fill', tickerColor); // Use specific ticker color

            // Draw main tail path with FORCED persistent ticker color and specific arrow marker
            chartGroup.append('path')
              .datum(tailData)
              .attr('class', `tail-path-${point.symbol.replace(/[^a-zA-Z0-9]/g, '')} ticker-element ticker-${point.symbol.replace(/[^a-zA-Z0-9]/g, '')} ${isIVMode ? 'iv-rrg-tail' : ''}`)
              .attr('fill', 'none')
              .attr('stroke', tickerColor)
              .attr('stroke-width', 3.5)
              .attr('stroke-opacity', 1)
              .attr('stroke-linecap', 'round')
              .attr('stroke-linejoin', 'round')
              .attr('d', line)
              .attr('transform', `translate(${offsetX}, ${offsetY})`)
              .attr('marker-end', `url(#${tickerArrowId})`) // Use ticker-specific arrow
              .style('stroke', tickerColor) // Force stroke color in style to override any CSS
              .style('opacity', isIVMode ? '1' : null); // Force full opacity for IV RRG only

            // Add subtle shadow for depth with same stable offset
            chartGroup.append('path')
              .datum(tailData)
              .attr('class', `tail-shadow-${point.symbol.replace(/[^a-zA-Z0-9]/g, '')} ticker-element ticker-${point.symbol.replace(/[^a-zA-Z0-9]/g, '')}`)
              .attr('fill', 'none')
              .attr('stroke', '#000')
              .attr('stroke-width', 4)
              .attr('stroke-opacity', 0.5)
              .attr('stroke-linecap', 'round')
              .attr('stroke-linejoin', 'round')
              .attr('d', line)
              .attr('transform', `translate(${offsetX}, ${offsetY})`)
              .style('filter', 'blur(1px)');

            // Draw reduced number of tail dots to minimize clutter
            const dotInterval = Math.max(1, Math.floor(tailData.length / 6)); // Show max 6 dots per tail
            chartGroup.selectAll(`.tail-dot-${point.symbol.replace(/[^a-zA-Z0-9]/g, '')}`)
              .data(tailData.filter((_, index) => index % dotInterval === 0))
              .enter()
              .append('circle')
              .attr('class', `tail-dot-${point.symbol.replace(/[^a-zA-Z0-9]/g, '')} ticker-element ticker-${point.symbol.replace(/[^a-zA-Z0-9]/g, '')}`)
              .attr('cx', d => Math.max(0, Math.min(chartWidth, xScale(d.rsRatio))) + offsetX)
              .attr('cy', d => Math.max(0, Math.min(chartHeight, yScale(d.rsMomentum))) + offsetY)
              .attr('r', 1.2)
              .attr('fill', tickerColor)
              .attr('opacity', 0.6)
              .attr('stroke', 'white')
              .attr('stroke-width', 0.5);

            // Add directional arrow at the end of the tail with ticker color
            if (tailData.length >= 2) {
              const lastPoint = tailData[tailData.length - 1];
              const secondLastPoint = tailData[tailData.length - 2];

              const angle = Math.atan2(
                yScale(lastPoint.rsMomentum) - yScale(secondLastPoint.rsMomentum),
                xScale(lastPoint.rsRatio) - xScale(secondLastPoint.rsRatio)
              );

              const arrowSize = 6;
              const arrowColor = tickerColor; // Use persistent ticker color

              chartGroup.append('polygon')
                .attr('class', `tail-arrow ticker-element ticker-${point.symbol.replace(/[^a-zA-Z0-9]/g, '')}`)
                .attr('fill', arrowColor)
                .attr('stroke', 'white')
                .attr('stroke-width', 1)
                .attr('opacity', 0.9)
                .attr('points', `0,-${arrowSize / 2} ${arrowSize},0 0,${arrowSize / 2}`)
                .attr('transform', `translate(${xScale(lastPoint.rsRatio) + offsetX}, ${yScale(lastPoint.rsMomentum) + offsetY}) rotate(${angle * 180 / Math.PI})`);
            }
          }
        }
      });
    }

    // Draw waves if enabled
    if (showWaves && activeWaves.length > 0) {
      console.log('🌊 RENDERING WAVES - showWaves:', showWaves, 'activeWaves:', activeWaves.length);
      activeWaves.forEach((wave, waveIndex) => {
        const wavePoints = currentData.filter(d => wave.symbols.includes(d.symbol));
        console.log('🌊 Wave', wave.group, '- points:', wavePoints.length, 'isActive:', wave.isActive);
        if (wavePoints.length < 1) return; // Need at least 1 point to draw something

        // Get wave color based on group
        const waveColors = {
          growth: 'rgba(0, 255, 100, 0.4)',
          value: 'rgba(100, 150, 255, 0.4)',
          defensives: 'rgba(255, 200, 0, 0.4)'
        };
        const waveColor = waveColors[wave.group as keyof typeof waveColors] || 'rgba(255, 255, 255, 0.3)';

        // Find the starting point where they began moving together
        // Look backwards through tails to find convergence point
        let startIndex = 0;
        const minTailLength = Math.min(...wavePoints.map(p => p.tail.length));

        if (minTailLength > 0) {
          // Find where they started clustering
          for (let i = minTailLength - 1; i >= 0; i--) {
            const tailPositions = wavePoints.map(p => p.tail[i]);
            let allClose = true;

            for (let j = 0; j < tailPositions.length - 1; j++) {
              const dx = tailPositions[j].rsRatio - tailPositions[j + 1].rsRatio;
              const dy = tailPositions[j].rsMomentum - tailPositions[j + 1].rsMomentum;
              const dist = Math.sqrt(dx * dx + dy * dy);

              if (dist > 5) { // Proximity threshold
                allClose = false;
                break;
              }
            }

            if (!allClose) {
              startIndex = i + 1;
              break;
            }
          }
        }

        // Build wave path from tail history to current position (the tip)
        const wavePath: [number, number][] = [];

        // Only process tail data if we have points with tails
        if (wavePoints.length > 0 && minTailLength > 0) {
          // Add tail points from start to current
          for (let i = startIndex; i < minTailLength; i++) {
            const avgX = wavePoints.reduce((sum, p) => sum + p.tail[i].rsRatio, 0) / wavePoints.length;
            const avgY = wavePoints.reduce((sum, p) => sum + p.tail[i].rsMomentum, 0) / wavePoints.length;
            wavePath.push([xScale(avgX), yScale(avgY)]);
          }
        }

        // Add current position as the tip (always add this)
        const tipX = wavePoints.reduce((sum, p) => sum + xScale(p.rsRatio), 0) / wavePoints.length;
        const tipY = wavePoints.reduce((sum, p) => sum + yScale(p.rsMomentum), 0) / wavePoints.length;
        wavePath.push([tipX, tipY]);

        // If we only have 1 point, duplicate it to create a short path
        if (wavePath.length < 2 && wavePoints.length > 0) {
          // Add a small offset to create a minimal visible line
          wavePath.unshift([tipX - 10, tipY - 10]);
        }

        if (wavePath.length < 2) return; // Still need at least 2 points to draw a line

        // Create smooth wave body line
        const lineGenerator = d3Line()
          .curve(curveBasis)
          .x(d => d[0])
          .y(d => d[1]);

        // Determine styling based on active status
        const isDashed = !wave.isActive;
        const strokeDashArray = isDashed ? '10,8' : 'none';
        const bodyOpacity = wave.isActive ? 0.6 : 0.3;
        const centerOpacity = wave.isActive ? 1 : 0.5;
        const bodyWidth = wave.isActive ? 12 : 8;
        const centerWidth = wave.isActive ? 3 : 2;

        // Draw wave body (thick glowing line)
        chartGroup.append('path')
          .attr('class', `wave-body wave-${wave.group} ${isDashed ? 'wave-inactive' : 'wave-active'}`)
          .attr('d', lineGenerator(wavePath as any))
          .attr('fill', 'none')
          .attr('stroke', waveColor.replace('0.4', '0.8'))
          .attr('stroke-width', bodyWidth)
          .attr('stroke-linecap', 'round')
          .attr('stroke-linejoin', 'round')
          .attr('stroke-dasharray', strokeDashArray)
          .style('filter', wave.isActive ? `drop-shadow(0 0 8px ${waveColor}) blur(1px)` : 'blur(1px)')
          .style('opacity', bodyOpacity);

        // Draw wave center line
        chartGroup.append('path')
          .attr('class', `wave-center wave-${wave.group} ${isDashed ? 'wave-inactive' : 'wave-active'}`)
          .attr('d', lineGenerator(wavePath as any))
          .attr('fill', 'none')
          .attr('stroke', waveColor.replace('0.4', '1'))
          .attr('stroke-width', centerWidth)
          .attr('stroke-linecap', 'round')
          .attr('stroke-linejoin', 'round')
          .attr('stroke-dasharray', strokeDashArray)
          .style('filter', wave.isActive ? `drop-shadow(0 0 10px ${waveColor})` : 'none')
          .style('opacity', centerOpacity);

        // Draw wave tip (triangular arrow pointing in movement direction)
        const tipPoint = wavePath[wavePath.length - 1];
        const preTipPoint = wavePath[wavePath.length - 2];

        // Calculate angle of movement
        const angle = Math.atan2(tipPoint[1] - preTipPoint[1], tipPoint[0] - preTipPoint[0]);

        // Create arrow tip (only for active waves)
        const arrowSize = wave.isActive ? 15 : 10;
        const arrowPoints = [
          [tipPoint[0], tipPoint[1]], // Tip
          [tipPoint[0] - arrowSize * Math.cos(angle - Math.PI / 6), tipPoint[1] - arrowSize * Math.sin(angle - Math.PI / 6)],
          [tipPoint[0] - arrowSize * Math.cos(angle + Math.PI / 6), tipPoint[1] - arrowSize * Math.sin(angle + Math.PI / 6)]
        ];

        chartGroup.append('polygon')
          .attr('class', `wave-tip wave-${wave.group} ${isDashed ? 'wave-inactive' : 'wave-active'}`)
          .attr('points', arrowPoints.map(p => p.join(',')).join(' '))
          .attr('fill', waveColor.replace('0.4', wave.isActive ? '1' : '0.6'))
          .attr('stroke', wave.isActive ? '#ffffff' : 'rgba(255,255,255,0.5)')
          .attr('stroke-width', wave.isActive ? 2 : 1)
          .style('filter', wave.isActive ? `drop-shadow(0 0 12px ${waveColor})` : 'none')
          .style('opacity', wave.isActive ? 1 : 0.5);

        // Add wave label near the tip
        chartGroup.append('text')
          .attr('class', `wave-label wave-${wave.group} ${isDashed ? 'wave-inactive' : 'wave-active'}`)
          .attr('x', tipPoint[0])
          .attr('y', tipPoint[1] - 25)
          .attr('text-anchor', 'middle')
          .attr('font-size', wave.isActive ? '12px' : '10px')
          .attr('font-weight', 'bold')
          .attr('fill', waveColor.replace('0.4', wave.isActive ? '1' : '0.7'))
          .attr('stroke', '#000')
          .attr('stroke-width', 3)
          .attr('paint-order', 'stroke')
          .text(`${wave.group.toUpperCase()} ${wave.isActive ? 'WAVE' : '(INACTIVE)'}`)
          .style('filter', wave.isActive ? 'drop-shadow(0 0 4px rgba(0,0,0,0.8))' : 'none')
          .style('opacity', wave.isActive ? 1 : 0.6);

        // Add symbol labels
        chartGroup.append('text')
          .attr('class', `wave-symbols wave-${wave.group} ${isDashed ? 'wave-inactive' : 'wave-active'}`)
          .attr('x', tipPoint[0])
          .attr('y', tipPoint[1] - 10)
          .attr('text-anchor', 'middle')
          .attr('font-size', wave.isActive ? '10px' : '9px')
          .attr('font-weight', '600')
          .attr('fill', '#ffffff')
          .attr('stroke', '#000')
          .attr('stroke-width', 2)
          .attr('paint-order', 'stroke')
          .text(wave.symbols.join(', '))
          .style('opacity', wave.isActive ? 0.9 : 0.5);
      });
    }

    // Draw main points (only those within visible bounds with strict containment)
    // Hide points when in waves mode
    const visiblePoints = selectedMode === 'waves' ? [] : currentData.filter(d => {
      const x = xScale(d.rsRatio);
      const y = yScale(d.rsMomentum);
      return x >= 0 && x <= chartWidth && y >= 0 && y <= chartHeight &&
        d.rsRatio >= currentXDomain[0] && d.rsRatio <= currentXDomain[1] &&
        d.rsMomentum >= currentYDomain[0] && d.rsMomentum <= currentYDomain[1];
    });

    const points = chartGroup.selectAll('.rrg-point')
      .data(visiblePoints)
      .enter()
      .append('g')
      .attr('class', d => `rrg-point ticker-element ticker-${d.symbol.replace(/[^a-zA-Z0-9]/g, '')}`)
      .style('cursor', 'pointer')
      .on('mouseenter', function (event, d) {
        // Stop propagation to prevent background from resetting
        event.stopPropagation();

        // Stop all ongoing transitions
        chartGroup.selectAll('.ticker-element').interrupt();
        chartGroup.selectAll('[class*="tail-path-"]').interrupt();
        chartGroup.selectAll('.tail-arrow').interrupt();

        // Dim all other elements
        chartGroup.selectAll('.ticker-element')
          .filter(function (this: any) {
            return !d3.select(this).classed(`ticker-${d.symbol.replace(/[^a-zA-Z0-9]/g, '')}`);
          })
          .transition()
          .duration(150)
          .style('opacity', 0.08)
          .style('filter', 'grayscale(70%)');

        // Highlight current ticker
        chartGroup.selectAll(`.ticker-${d.symbol.replace(/[^a-zA-Z0-9]/g, '')}`)
          .transition()
          .duration(150)
          .style('opacity', 1)
          .style('filter', `brightness(1.3) saturate(1.2) drop-shadow(0 0 8px ${tickerColors[d.symbol]})`);

        // Enhance tail
        chartGroup.selectAll(`.tail-path-${d.symbol.replace(/[^a-zA-Z0-9]/g, '')}`)
          .transition()
          .duration(150)
          .attr('stroke-width', 4)
          .style('filter', `drop-shadow(0 0 6px ${tickerColors[d.symbol]}) brightness(1.2)`);

        // Enhance arrow
        chartGroup.selectAll(`.ticker-${d.symbol.replace(/[^a-zA-Z0-9]/g, '')}.tail-arrow`)
          .transition()
          .duration(150)
          .style('filter', `drop-shadow(0 0 5px ${tickerColors[d.symbol]}) brightness(1.3)`);
      })
      .on('mouseleave', function () {
        // FORCE immediate reset - no transitions that can be interrupted
        chartGroup.selectAll('.ticker-element')
          .interrupt()
          .style('opacity', 1)
          .style('filter', null);

        chartGroup.selectAll('[class*="tail-path-"]')
          .interrupt()
          .attr('stroke-width', 2.5)
          .style('filter', null);

        chartGroup.selectAll('.tail-arrow')
          .interrupt()
          .style('filter', null);
      });

    points.append('circle')
      .attr('cx', d => xScale(d.rsRatio)) // No clipping - let clipping path handle it
      .attr('cy', d => yScale(d.rsMomentum)) // No clipping - let clipping path handle it
      .attr('r', 8)
      .attr('fill', d => tickerColors[d.symbol]) // Use persistent ticker color
      .attr('stroke', 'white')
      .attr('stroke-width', 2)
      .style('filter', d => `drop-shadow(0 0 4px ${tickerColors[d.symbol]}60)`);

    // Add labels (no clipping - let clipping path handle it)
    points.append('text')
      .attr('x', d => xScale(d.rsRatio)) // No clipping constraints
      .attr('y', d => yScale(d.rsMomentum) - 12) // No clipping constraints
      .attr('text-anchor', 'middle')
      .attr('font-size', '12px')
      .attr('font-weight', 'bold')
      .attr('fill', 'white')
      .attr('stroke', '#000')
      .attr('stroke-width', 0.5)
      .text(d => d.symbol)
      .style('pointer-events', 'none');

    // Style axes
    svg.selectAll('.x-axis text, .y-axis text')
      .attr('fill', 'white')
      .attr('font-size', '12px');

    svg.selectAll('.x-axis path, .y-axis path, .x-axis line, .y-axis line')
      .attr('stroke', 'white');

    // Cleanup function
    return () => {
      if (svgElement) {
        svgElement.removeEventListener('mousedown', handleMouseDown);
        svgElement.removeEventListener('mousemove', handleMouseMove);
        svgElement.removeEventListener('mouseup', handleMouseUp);
        svgElement.removeEventListener('mouseleave', handleMouseUp);
        svgElement.removeEventListener('wheel', handleWheel);
      }
    };
  }, [currentData, width, height, showTails, tailLength, lookbackIndex, zoomLevel, selectedQuadrant, panOffset, autoFit, isDragging, lastMousePos, currentDomain, showWaves, activeWaves]);

  const handleLookbackChange = (value: number) => {
    setLookbackIndex(value);
    onLookbackChange?.(value);
  };

  return (
    <div className={`rrg-chart-container${isIVMode ? ' iv-mode' : ''}`}>
      {/* Redesigned Header - One Clean Row */}
      <div style={{
        padding: '16px 20px',
        background: 'linear-gradient(135deg, #0a1628 0%, #000000 50%, #0a1628 100%)',
        borderBottom: '2px solid rgba(59, 130, 246, 0.3)',
        display: 'flex',
        alignItems: 'center',
        gap: '20px',
        flexWrap: 'wrap',
        boxShadow: 'inset 0 2px 4px rgba(255, 255, 255, 0.05), inset 0 -2px 4px rgba(0, 0, 0, 0.3)'
      }}>

        {/* Analysis Mode / Symbol Group */}
        {isIVMode ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <label style={{ color: '#ff8844', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase' }}>Symbol Group:</label>
            <select
              value={symbolMode}
              onChange={(e) => {
                const value = e.target.value as 'custom' | 'mag7' | 'highBeta' | 'lowBeta';
                onSymbolModeChange?.(value);
              }}
              disabled={loading}
              style={{
                padding: '6px 12px',
                background: '#0a0a0a',
                border: '1px solid rgba(255, 107, 0, 0.3)',
                borderRadius: '3px',
                color: '#ffffff',
                fontSize: '12px',
                fontWeight: '600'
              }}
            >
              <option value="custom">CUSTOM</option>
              <option value="mag7">MAG 7</option>
              <option value="highBeta">HIGH BETA</option>
              <option value="lowBeta">LOW BETA</option>
            </select>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <label style={{ color: '#ff8844', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase' }}>Analysis Mode:</label>
            <select
              value={selectedIndustryETF || selectedSectorETF || selectedMode}
              onChange={(e) => {
                const value = e.target.value;
                if (value === 'sectors' || value === 'industries' || value === 'custom' || value === 'waves' || value === 'weightedRRG') {
                  onModeChange?.(value as 'sectors' | 'industries' | 'custom' | 'waves' | 'weightedRRG');
                  onSectorETFChange?.(null);
                  onIndustryETFChange?.(null);
                  // Auto-enable waves when switching to waves mode
                  if (value === 'waves') {
                    setShowWaves(true);
                  }
                } else if (industryETFs && industryETFs[value]) {
                  onModeChange?.('industries');
                  onIndustryETFChange?.(value);
                  onSectorETFChange?.(null);
                } else if (sectorETFs && sectorETFs[value]) {
                  onModeChange?.('sectors');
                  onSectorETFChange?.(value);
                  onIndustryETFChange?.(null);
                }
              }}
              disabled={loading}
              style={{
                padding: '6px 12px',
                background: '#0a0a0a',
                border: '1px solid rgba(255, 107, 0, 0.3)',
                borderRadius: '3px',
                color: '#ffffff',
                fontSize: '12px',
                fontWeight: '600',
                maxWidth: '140px'
              }}
            >
              <option value="custom">CUSTOM</option>
              <option value="waves">WAVES</option>
              <option value="sectors">SECTORS</option>
              {Object.entries(sectorETFs).map(([symbol, info]: [string, any]) => (
                <option key={symbol} value={symbol}>
                  {symbol} Holdings ({info.holdings.length} stocks)
                </option>
              ))}
              <option value="industries">INDUSTRIES</option>
              {Object.entries(industryETFs).map(([symbol, info]: [string, any]) => (
                <option key={symbol} value={symbol}>
                  {symbol} - {info.name} ({info.holdings.length} stocks)
                </option>
              ))}
            </select>

            {/* Weighted RRG button - shows for all modes */}
            <button
              onClick={() => {
                if (selectedMode === 'weightedRRG') {
                  onModeChange?.('sectors');
                } else {
                  onModeChange?.('weightedRRG');
                }
              }}
              disabled={loading}
              style={{
                padding: '6px 12px',
                background: selectedMode === 'weightedRRG' ? 'rgba(255, 107, 0, 0.3)' : '#0a0a0a',
                border: '1px solid rgba(255, 107, 0, 0.3)',
                borderRadius: '3px',
                color: selectedMode === 'weightedRRG' ? '#ff6b00' : '#ffffff',
                fontSize: '12px',
                fontWeight: '600',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.5 : 1,
                transition: 'all 0.2s ease'
              }}
            >
              Weighted RRG
            </button>
          </div>
        )}

        {/* Benchmark */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label style={{ color: '#ff8844', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase' }}>Benchmark:</label>
          <select
            value={benchmark}
            onChange={(e) => onBenchmarkChange?.(e.target.value)}
            disabled={loading}
            style={{
              padding: '6px 10px',
              background: '#0a0a0a',
              border: '1px solid rgba(255, 107, 0, 0.3)',
              borderRadius: '3px',
              color: '#ffffff',
              fontSize: '12px',
              fontWeight: '600',
              maxWidth: '120px'
            }}
          >
            {benchmarkOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Timeframe */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label style={{ color: '#ff8844', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase' }}>Timeframe:</label>
          {selectedMode === 'weightedRRG' ? (
            <div
              style={{
                padding: '6px 12px',
                background: '#0a0a0a',
                border: '1px solid rgba(255, 107, 0, 0.3)',
                borderRadius: '3px',
                color: '#ff6b00',
                fontSize: '12px',
                fontWeight: '700',
                textTransform: 'uppercase'
              }}
            >
              MAX
            </div>
          ) : (
            <select
              value={timeframe}
              onChange={(e) => onTimeframeChange?.(e.target.value)}
              disabled={loading}
              style={{
                padding: '6px 12px',
                background: '#0a0a0a',
                border: '1px solid rgba(255, 107, 0, 0.3)',
                borderRadius: '3px',
                color: '#ffffff',
                fontSize: '12px',
                fontWeight: '600'
              }}
            >
              {timeframeOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Wave Toggle Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => setShowWaves(!showWaves)}
            style={{
              padding: '6px 16px',
              background: showWaves ? 'linear-gradient(135deg, #ff6b00 0%, #ff8844 100%)' : '#1a1a1a',
              border: `1px solid ${showWaves ? '#ff6b00' : 'rgba(255, 107, 0, 0.3)'}`,
              borderRadius: '4px',
              color: '#ffffff',
              fontSize: '12px',
              fontWeight: '700',
              cursor: 'pointer',
              textTransform: 'uppercase',
              transition: 'all 0.2s ease',
              boxShadow: showWaves ? '0 0 10px rgba(255, 107, 0, 0.3)' : 'none'
            }}
          >
            <span style={{ marginRight: '6px' }}>🌊</span>
            Waves {showWaves ? 'ON' : 'OFF'}
          </button>
          {showWaves && (
            <span style={{
              padding: '4px 10px',
              background: activeWaves.filter(w => w.isActive).length > 0 ? 'rgba(255, 107, 0, 0.2)' : 'rgba(100, 100, 100, 0.2)',
              border: `1px solid ${activeWaves.filter(w => w.isActive).length > 0 ? 'rgba(255, 107, 0, 0.5)' : 'rgba(150, 150, 150, 0.5)'}`,
              borderRadius: '3px',
              color: activeWaves.filter(w => w.isActive).length > 0 ? '#ff8844' : '#aaaaaa',
              fontSize: '11px',
              fontWeight: '700',
              animation: activeWaves.filter(w => w.isActive).length > 0 ? 'pulse 2s ease-in-out infinite' : 'none'
            }}>
              {activeWaves.filter(w => w.isActive).length} Active / {activeWaves.length} Total
            </span>
          )}
        </div>

        {/* Tail Length */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label style={{ color: '#ff8844', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase' }}>
            Tail Length: {tailLength >= maxTailLength ? 'MAX' : ''}
          </label>
          <input
            type="number"
            min="0"
            max={maxTailLength}
            value={tailLength}
            onChange={(e) => {
              const value = e.target.value;
              if (value === '' || value === '-') return; // Allow temporary empty state
              const newValue = parseInt(value, 10);
              if (!isNaN(newValue) && newValue >= 0) {
                onTailLengthChange?.(Math.min(newValue, maxTailLength));
              }
            }}
            onBlur={(e) => {
              // On blur, ensure we have a valid value
              const value = e.target.value;
              if (value === '' || value === '-') {
                onTailLengthChange?.(5); // Reset to default if empty
              }
            }}
            style={{
              width: '60px',
              padding: '6px 8px',
              background: '#0a0a0a',
              border: `1px solid ${tailLength >= maxTailLength ? 'rgba(255, 0, 0, 0.5)' : 'rgba(255, 107, 0, 0.3)'}`,
              borderRadius: '3px',
              color: tailLength >= maxTailLength ? '#ff6b00' : '#ffffff',
              fontSize: '12px',
              fontWeight: '600',
              textAlign: 'center'
            }}
          />
        </div>

        {/* Action Buttons */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          <button
            onClick={fitToData}
            style={{
              padding: '6px 16px',
              background: 'linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 50%, #1a1a1a 100%)',
              border: '1px solid rgba(255, 107, 0, 0.3)',
              borderRadius: '3px',
              color: '#ff8844',
              fontSize: '11px',
              fontWeight: '700',
              textTransform: 'uppercase',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.borderColor = 'rgba(255, 107, 0, 0.6)'}
            onMouseLeave={(e) => e.currentTarget.style.borderColor = 'rgba(255, 107, 0, 0.3)'}
          >
            FIT
          </button>
          <button
            onClick={centerChart}
            style={{
              padding: '6px 16px',
              background: 'linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 50%, #1a1a1a 100%)',
              border: '1px solid rgba(255, 107, 0, 0.3)',
              borderRadius: '3px',
              color: '#ff8844',
              fontSize: '11px',
              fontWeight: '700',
              textTransform: 'uppercase',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.borderColor = 'rgba(255, 107, 0, 0.6)'}
            onMouseLeave={(e) => e.currentTarget.style.borderColor = 'rgba(255, 107, 0, 0.3)'}
          >
            CENTER
          </button>
          <button
            onClick={onRefresh}
            style={{
              padding: '6px 16px',
              background: 'linear-gradient(135deg, #ff6b00 0%, #ff8533 100%)',
              border: '1px solid #ff8533',
              borderRadius: '3px',
              color: '#000000',
              fontSize: '11px',
              fontWeight: '700',
              textTransform: 'uppercase',
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: '0 2px 6px rgba(255, 107, 0, 0.3)'
            }}
            onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 4px 12px rgba(255, 107, 0, 0.5)'}
            onMouseLeave={(e) => e.currentTarget.style.boxShadow = '0 2px 6px rgba(255, 107, 0, 0.3)'}
          >
            REFRESH
          </button>
        </div>
      </div>

      {/* Custom Symbols Input Row (if needed) */}
      {((isIVMode && symbolMode === 'custom') || (!isIVMode && selectedMode === 'custom')) && (
        <div style={{
          padding: '12px 20px',
          background: '#000000',
          borderBottom: '1px solid rgba(255, 107, 0, 0.2)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <label style={{ color: '#ff8844', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', minWidth: '150px' }}>
              Custom Symbols:
            </label>
            <input
              type="text"
              value={customSymbols}
              onChange={(e) => onCustomSymbolsChange?.(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && customSymbols.trim()) {
                  onRefresh?.();
                }
              }}
              placeholder="e.g., AAPL, MSFT, GOOGL (Press Enter to scan)"
              disabled={loading}
              style={{
                flex: 1,
                padding: '8px 12px',
                background: '#0a0a0a',
                border: '1px solid rgba(255, 107, 0, 0.3)',
                borderRadius: '3px',
                color: '#ffffff',
                fontSize: '12px',
                fontWeight: '600'
              }}
            />
          </div>
        </div>
      )}

      {/* Lookback Control Bar - Redesigned */}
      <div style={{
        padding: '12px 20px',
        background: '#000000',
        borderBottom: '1px solid rgba(255, 107, 0, 0.2)',
        display: 'flex',
        alignItems: 'center',
        gap: '20px'
      }}>
        <span style={{
          color: '#ff8844',
          fontSize: '12px',
          fontWeight: '700',
          textTransform: 'uppercase',
          minWidth: '140px'
        }}>
          Historical Lookback:
        </span>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <input
            type="range"
            min="0"
            max={maxTailLength}
            value={maxTailLength - lookbackIndex}
            onChange={(e) => handleLookbackChange(maxTailLength - parseInt(e.target.value))}
            style={{
              width: '100%',
              accentColor: '#ff6b00'
            }}
          />
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '11px',
            color: '#888'
          }}>
            <span>Past</span>
            <span style={{ color: '#ffffff', fontWeight: '600' }}>
              {historicalDates[Math.max(0, historicalDates.length - 1 - lookbackIndex)]}
            </span>
            <span>Present</span>
          </div>
        </div>
        <div style={{
          color: '#ffffff',
          fontSize: '12px',
          fontWeight: '600',
          minWidth: '120px',
          textAlign: 'right'
        }}>
          {lookbackIndex === 0 ? 'Current' : `${lookbackIndex} weeks ago`}
        </div>
      </div>

      <div className="rrg-chart-wrapper" style={{ position: 'relative' }}>
        {zoomLevel > 1 && (
          <div style={{
            position: 'absolute',
            top: '10px',
            left: '10px',
            color: '#00ff88',
            fontSize: '11px',
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            padding: '4px 8px',
            borderRadius: '4px',
            zIndex: 10,
            border: '1px solid #333'
          }}>
            Zoom: {zoomLevel.toFixed(1)}x | Drag to pan
          </div>
        )}

        {/* StockCharts-style boundary indicator */}
        {(() => {
          const maxOffset = 30 / zoomLevel;
          const isNearBoundary = Math.abs(panOffset.x) > maxOffset * 0.8 || Math.abs(panOffset.y) > maxOffset * 0.8;
          const isAtBoundary = Math.abs(panOffset.x) > maxOffset || Math.abs(panOffset.y) > maxOffset;

          return isNearBoundary && zoomLevel > 1 && (
            <div style={{
              position: 'absolute',
              bottom: '10px',
              left: '10px',
              color: isAtBoundary ? '#ff6b47' : '#ffa500',
              fontSize: '10px',
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              padding: '3px 6px',
              borderRadius: '3px',
              zIndex: 10,
              border: `1px solid ${isAtBoundary ? '#ff6b47' : '#ffa500'}`
            }}>
              {isAtBoundary ? ' Boundary reached' : ' Near boundary'}
            </div>
          );
        })()}

        <svg
          ref={svgRef}
          width={width}
          height={height}
          style={{
            background: '#0a0a0a',
            cursor: zoomLevel > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
            transition: isDragging ? 'none' : 'border 0.2s ease', // Smooth boundary feedback
            border: (() => {
              const maxOffset = 30 / zoomLevel;
              const isAtBoundary = Math.abs(panOffset.x) > maxOffset || Math.abs(panOffset.y) > maxOffset;
              return isAtBoundary && zoomLevel > 1 ? '2px solid #ff6b47' : '1px solid #333';
            })()
          }}
        />
      </div>

      <div className="rrg-legend">
        <div style={{ display: 'flex', gap: '30px', flexWrap: 'wrap' }}>
          {/* Ticker Colors Legend */}
          <div style={{ flex: '1', minWidth: '300px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h4 style={{ color: 'white', margin: '0', fontSize: '16px' }}>Ticker Colors</h4>
              <div style={{ display: 'flex', gap: '8px' }}>
                {previousVisibleTickers && (
                  <button
                    onClick={restorePreviousTickers}
                    style={{
                      padding: '4px 8px',
                      fontSize: '0.7rem',
                      background: 'rgba(255, 193, 7, 0.2)',
                      border: '1px solid #ffc107',
                      borderRadius: '3px',
                      color: '#ffc107',
                      cursor: 'pointer'
                    }}
                  >
                    ↶ Restore
                  </button>
                )}
                <button
                  onClick={() => toggleAllTickers(true)}
                  style={{
                    padding: '4px 8px',
                    fontSize: '0.7rem',
                    background: 'rgba(0, 255, 136, 0.2)',
                    border: '1px solid #00ff88',
                    borderRadius: '3px',
                    color: '#00ff88',
                    cursor: 'pointer'
                  }}
                >
                  Show All
                </button>
                <button
                  onClick={() => toggleAllTickers(false)}
                  style={{
                    padding: '4px 8px',
                    fontSize: '0.7rem',
                    background: 'rgba(255, 68, 68, 0.2)',
                    border: '1px solid #ff4444',
                    borderRadius: '3px',
                    color: '#ff4444',
                    cursor: 'pointer'
                  }}
                >
                  Hide All
                </button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '6px', maxHeight: '200px', overflowY: 'auto' }}>
              {Object.entries(tickerColors).slice(0, 20).map(([symbol, color]) => {
                const isVisible = visibleTickers.has(symbol);
                const isLongPressActive = isLongPressing === symbol;
                return (
                  <div
                    key={symbol}
                    className="legend-item ticker-toggle"
                    onClick={() => toggleTickerVisibility(symbol)}
                    onMouseDown={() => startLongPress(symbol)}
                    onMouseUp={cancelLongPress}
                    onMouseLeave={cancelLongPress}
                    onTouchStart={() => startLongPress(symbol)}
                    onTouchEnd={cancelLongPress}
                    onTouchCancel={cancelLongPress}
                    style={{
                      padding: '4px 8px',
                      fontSize: '15px',
                      cursor: 'pointer',
                      opacity: isVisible ? 1 : 0.4,
                      background: isLongPressActive
                        ? `linear-gradient(45deg, rgba(255, 255, 255, 0.1), ${color}20)`
                        : isVisible ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.02)',
                      border: `2px solid ${isLongPressActive ? color : isVisible ? color : 'rgba(255, 255, 255, 0.1)'}`,
                      borderRadius: '4px',
                      transition: 'all 0.2s ease',
                      position: 'relative',
                      transform: isLongPressActive ? 'scale(1.05)' : 'scale(1)',
                      boxShadow: 'none'
                    }}
                  >
                    <div className="legend-color" style={{
                      backgroundColor: color,
                      border: '1px solid white',
                      width: '12px',
                      height: '12px',
                      opacity: isVisible ? 1 : 0.3,
                      transform: isLongPressActive ? 'scale(1.2)' : 'scale(1)',
                      transition: 'transform 0.2s ease'
                    }}></div>
                    <span style={{
                      fontWeight: 'bold',
                      textDecoration: isVisible ? 'none' : 'line-through',
                      color: color,
                      opacity: 1,
                      whiteSpace: 'nowrap'
                    }}>{symbol}</span>

                    {/* Long press progress indicator */}
                    {isLongPressActive && (
                      <div style={{
                        position: 'absolute',
                        bottom: '2px',
                        left: '4px',
                        right: '4px',
                        height: '2px',
                        background: 'rgba(255, 255, 255, 0.2)',
                        borderRadius: '1px',
                        overflow: 'hidden'
                      }}>
                        <div style={{
                          height: '100%',
                          background: color,
                          width: '0%',
                          animation: 'longPressProgress 4s linear forwards',
                          borderRadius: '1px'
                        }}></div>
                      </div>
                    )}

                    {!isVisible && !isLongPressActive && (
                      <span style={{
                        position: 'absolute',
                        right: '4px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        fontSize: '0.7rem',
                        color: '#ff4444'
                      }}>OFF</span>
                    )}
                  </div>
                );
              })}
              {Object.keys(tickerColors).length > 20 && (
                <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: '#aaa', fontSize: '0.7rem', padding: '4px' }}>
                  ... and {Object.keys(tickerColors).length - 20} more (click Show All to see them)
                </div>
              )}
            </div>
            <div style={{ marginTop: '8px', fontSize: '0.7rem', color: '#888' }}>
              Showing {visibleTickers.size} of {Object.keys(tickerColors).length} tickers
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RRGChart;
