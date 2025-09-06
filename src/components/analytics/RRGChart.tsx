'use client';

import React, { useState, useEffect, useRef } from 'react';
import * as d3 from 'd3';
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
}

const RRGChart: React.FC<RRGChartProps> = ({
  data,
  benchmark = 'SPY',
  width = 1500,
  height = 950,
  showTails = true,
  tailLength = 10,
  timeframe = '14 weeks',
  onShowTailsChange,
  onTailLengthChange,
  onLookbackChange
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [selectedPoint, setSelectedPoint] = useState<RRGDataPoint | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<RRGDataPoint | null>(null);
  const [lookbackIndex, setLookbackIndex] = useState<number>(0);
  const [autoFit, setAutoFit] = useState<boolean>(true);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [selectedQuadrant, setSelectedQuadrant] = useState<string | null>(null);
  const [panOffset, setPanOffset] = useState<{x: number, y: number}>({x: 0, y: 0});
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [lastMousePos, setLastMousePos] = useState<{x: number, y: number}>({x: 0, y: 0});
  const [currentDomain, setCurrentDomain] = useState<{x: [number, number], y: [number, number]}>({x: [80, 120], y: [80, 120]});

  const margin = { top: 40, right: 60, bottom: 80, left: 60 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;

  // Generate historical dates for lookback slider
  const maxTailLength = Math.max(...data.map(d => d.tail.length));
  const historicalDates = Array.from({ length: maxTailLength + 1 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (maxTailLength - i) * 7); // Weekly intervals
    return date.toISOString().split('T')[0];
  });

  // Get current data based on lookback
  const getCurrentData = () => {
    if (lookbackIndex === 0) return data;
    
    return data.map(point => {
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
  };

  const currentData = getCurrentData();

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
    setPanOffset({x: 0, y: 0});
  };

  const centerChart = () => {
    // Reset to center on 100,100
    setZoomLevel(1);
    setAutoFit(false);
    setSelectedQuadrant(null);
    setPanOffset({x: 0, y: 0});
  };

  const playAnimation = () => {
    if (maxTailLength === 0) return;
    setLookbackIndex(maxTailLength);
    setIsPlaying(true);
  };
  const quadrantColors = {
    leading: '#00E676',      // Bright Green - Leading (top-right)
    weakening: '#FFD54F',    // Bright Yellow - Weakening (bottom-right) 
    lagging: '#FF5252',      // Bright Red - Lagging (bottom-left)
    improving: '#40C4FF'     // Bright Blue - Improving (top-left)
  };

  const getQuadrant = (rsRatio: number, rsMomentum: number): keyof typeof quadrantColors => {
    if (rsRatio >= 100 && rsMomentum >= 100) return 'leading';
    if (rsRatio >= 100 && rsMomentum < 100) return 'weakening';
    if (rsRatio < 100 && rsMomentum < 100) return 'lagging';
    return 'improving';
  };

  useEffect(() => {
    if (!svgRef.current || !currentData.length) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    // Add mouse event handlers with proper state closure
    const handleMouseDown = (event: MouseEvent) => {
      // Disable all dragging - chart should stay completely stable
      // if (event.button === 0) { // Left mouse button
      //   setIsDragging(true);
      //   setLastMousePos({x: event.clientX, y: event.clientY});
      //   event.preventDefault();
      // }
    };

    const handleMouseMove = (event: MouseEvent) => {
      // Chart should not move - disable all panning
      // if (isDragging) {
      //   // Panning disabled - chart stays stable
      // }
    };

    const handleMouseUp = () => {
      // Disable dragging state management - chart stays stable
      // setIsDragging(false);
    };

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const zoomIntensity = 0.1;
      const direction = event.deltaY > 0 ? -1 : 1;
      const newZoom = Math.max(0.1, Math.min(10, zoomLevel + direction * zoomIntensity));
      setZoomLevel(newZoom);
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
    
    if (autoFit && rsRatioExtent && rsMomentumExtent) {
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
    
    // Create clipping path to keep content strictly within chart bounds
    const clipId = `chart-clip-${Math.random().toString(36).substr(2, 9)}`;
    svg.append('defs')
      .append('clipPath')
      .attr('id', clipId)
      .append('rect')
      .attr('x', 1) // Small margin to ensure strict containment
      .attr('y', 1)
      .attr('width', chartWidth - 2) // Slightly smaller to prevent any overflow
      .attr('height', chartHeight - 2);
    
    // Create chart content group (moves with pan/zoom) with clipping
    const chartGroup = g.append('g')
      .attr('clip-path', `url(#${clipId})`);

    // Draw grid lines
    const xTicks = xScale.ticks(10);
    const yTicks = yScale.ticks(10);

    // Vertical grid lines
    chartGroup.selectAll('.grid-line-x')
      .data(xTicks)
      .enter()
      .append('line')
      .attr('class', 'grid-line-x')
      .attr('x1', d => xScale(d))
      .attr('x2', d => xScale(d))
      .attr('y1', 0)
      .attr('y2', chartHeight)
      .attr('stroke', d => d === 100 ? '#ffffff' : '#333')
      .attr('stroke-width', d => d === 100 ? 2 : 0.5)
      .attr('opacity', d => d === 100 ? 0.8 : 0.3);

    // Horizontal grid lines
    chartGroup.selectAll('.grid-line-y')
      .data(yTicks)
      .enter()
      .append('line')
      .attr('class', 'grid-line-y')
      .attr('x1', 0)
      .attr('x2', chartWidth)
      .attr('y1', d => yScale(d))
      .attr('y2', d => yScale(d))
      .attr('stroke', d => d === 100 ? '#ffffff' : '#333')
      .attr('stroke-width', d => d === 100 ? 2 : 0.5)
      .attr('opacity', d => d === 100 ? 0.8 : 0.3);

    // Draw quadrant background colors with stable positioning
    const center100X = xScale(100);
    const center100Y = yScale(100);
    
    // Only draw quadrant backgrounds if the center (100,100) is visible
    if (center100X >= 0 && center100X <= chartWidth && center100Y >= 0 && center100Y <= chartHeight) {
      // Leading quadrant (top-right) - Green
      chartGroup.append('rect')
        .attr('class', 'quadrant-bg leading')
        .attr('x', center100X)
        .attr('y', 0)
        .attr('width', chartWidth - center100X)
        .attr('height', center100Y)
        .attr('fill', quadrantColors.leading)
        .attr('opacity', 0.05);

      // Weakening quadrant (bottom-right) - Yellow
      chartGroup.append('rect')
        .attr('class', 'quadrant-bg weakening')
        .attr('x', center100X)
        .attr('y', center100Y)
        .attr('width', chartWidth - center100X)
        .attr('height', chartHeight - center100Y)
        .attr('fill', quadrantColors.weakening)
        .attr('opacity', 0.05);

      // Lagging quadrant (bottom-left) - Red
      chartGroup.append('rect')
        .attr('class', 'quadrant-bg lagging')
        .attr('x', 0)
        .attr('y', center100Y)
        .attr('width', center100X)
        .attr('height', chartHeight - center100Y)
        .attr('fill', quadrantColors.lagging)
        .attr('opacity', 0.05);

      // Improving quadrant (top-left) - Blue
      chartGroup.append('rect')
        .attr('class', 'quadrant-bg improving')
        .attr('x', 0)
        .attr('y', 0)
        .attr('width', center100X)
        .attr('height', center100Y)
        .attr('fill', quadrantColors.improving)
        .attr('opacity', 0.05);
    }

    // Create axes (stable, don't move with pan/zoom)
    const xAxis = d3.axisBottom(xAxisScale)
      .tickFormat(d => `${d}`);
    
    const yAxis = d3.axisLeft(yAxisScale)
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

    // Draw tails if enabled
    if (showTails) {
      currentData.forEach(point => {
        if (point.tail.length > 1) {
          // Limit tail points based on tailLength parameter
          const limitedTailPoints = point.tail.slice(-tailLength);
          
          // More aggressive filtering - strict boundaries with pixel-level checking
          const visibleTailPoints = limitedTailPoints.filter(tailPoint => {
            const x = xScale(tailPoint.rsRatio);
            const y = yScale(tailPoint.rsMomentum);
            return x >= 0 && x <= chartWidth && y >= 0 && y <= chartHeight &&
                   tailPoint.rsRatio >= currentXDomain[0] &&
                   tailPoint.rsRatio <= currentXDomain[1] &&
                   tailPoint.rsMomentum >= currentYDomain[0] &&
                   tailPoint.rsMomentum <= currentYDomain[1];
          });

          // Only include current position if it's also within bounds (both data and pixel level)
          const currentPoint = { rsRatio: point.rsRatio, rsMomentum: point.rsMomentum };
          const currentX = xScale(currentPoint.rsRatio);
          const currentY = yScale(currentPoint.rsMomentum);
          const isCurrentVisible = currentX >= 0 && currentX <= chartWidth && 
                                   currentY >= 0 && currentY <= chartHeight &&
                                   currentPoint.rsRatio >= currentXDomain[0] &&
                                   currentPoint.rsRatio <= currentXDomain[1] &&
                                   currentPoint.rsMomentum >= currentYDomain[0] &&
                                   currentPoint.rsMomentum <= currentYDomain[1];

          const tailData = isCurrentVisible ? [...visibleTailPoints, currentPoint] : visibleTailPoints;
          
          if (tailData.length > 1) {
            // Create unique gradient ID for this tail
            const gradientId = `tail-gradient-${point.symbol.replace(/[^a-zA-Z0-9]/g, '')}`;
            
            // Create gradient definition
            const defs = svg.select('defs').empty() ? svg.append('defs') : svg.select('defs');
            
            // Remove existing gradient with same ID to prevent duplicates
            defs.select(`#${gradientId}`).remove();
            
            const gradient = defs.append('linearGradient')
              .attr('id', gradientId)
              .attr('gradientUnits', 'userSpaceOnUse')
              .attr('x1', xScale(tailData[0].rsRatio))
              .attr('y1', yScale(tailData[0].rsMomentum))
              .attr('x2', xScale(tailData[tailData.length - 1].rsRatio))
              .attr('y2', yScale(tailData[tailData.length - 1].rsMomentum));

            // Calculate gradient stops based on path segments and their quadrants
            tailData.forEach((dataPoint, index) => {
              const quadrant = getQuadrant(dataPoint.rsRatio, dataPoint.rsMomentum);
              const color = quadrantColors[quadrant];
              const offset = (index / (tailData.length - 1)) * 100 + '%';
              
              gradient.append('stop')
                .attr('offset', offset)
                .attr('stop-color', color)
                .attr('stop-opacity', 0.8);
            });

            // Create smooth line generator with adaptive tension control
            const dataPointCount = tailData.length;
            const tension = dataPointCount > 10 ? 0.3 : dataPointCount > 5 ? 0.5 : 0.7; // More smoothing for more data points
            
            const smoothLine = d3.line<{ rsRatio: number; rsMomentum: number }>()
              .x(d => Math.max(0, Math.min(chartWidth, xScale(d.rsRatio))))
              .y(d => Math.max(0, Math.min(chartHeight, yScale(d.rsMomentum))))
              .curve(d3.curveCatmullRom.alpha(tension)); // Adaptive smooth curve

            // Draw main smooth tail path with gradient
            chartGroup.append('path')
              .datum(tailData)
              .attr('class', 'tail-path-smooth')
              .attr('fill', 'none')
              .attr('stroke', `url(#${gradientId})`)
              .attr('stroke-width', 3)
              .attr('stroke-opacity', 0.8)
              .attr('stroke-linecap', 'round')
              .attr('stroke-linejoin', 'round')
              .attr('d', smoothLine);

            // Add subtle shadow/glow effect for depth
            chartGroup.append('path')
              .datum(tailData)
              .attr('class', 'tail-shadow')
              .attr('fill', 'none')
              .attr('stroke', '#000')
              .attr('stroke-width', 5)
              .attr('stroke-opacity', 0.2)
              .attr('stroke-linecap', 'round')
              .attr('stroke-linejoin', 'round')
              .attr('d', smoothLine)
              .style('filter', 'blur(2px)');

            // Draw tail dots with reduced size for cleaner look
            chartGroup.selectAll(`.tail-dot-${point.symbol.replace(/[^a-zA-Z0-9]/g, '')}`)
              .data(visibleTailPoints.filter((_, index) => index % 2 === 0)) // Show every other dot to reduce clutter
              .enter()
              .append('circle')
              .attr('class', `tail-dot-${point.symbol.replace(/[^a-zA-Z0-9]/g, '')}`)
              .attr('cx', d => Math.max(0, Math.min(chartWidth, xScale(d.rsRatio))))
              .attr('cy', d => Math.max(0, Math.min(chartHeight, yScale(d.rsMomentum))))
              .attr('r', 1.5)
              .attr('fill', d => {
                const dotQuadrant = getQuadrant(d.rsRatio, d.rsMomentum);
                return quadrantColors[dotQuadrant];
              })
              .attr('opacity', 0.4)
              .attr('stroke', 'white')
              .attr('stroke-width', 0.5);

            // Add directional arrow at the end of the tail
            if (tailData.length >= 2) {
              const lastPoint = tailData[tailData.length - 1];
              const secondLastPoint = tailData[tailData.length - 2];
              
              const angle = Math.atan2(
                yScale(lastPoint.rsMomentum) - yScale(secondLastPoint.rsMomentum),
                xScale(lastPoint.rsRatio) - xScale(secondLastPoint.rsRatio)
              );
              
              const arrowSize = 6;
              const lastQuadrant = getQuadrant(lastPoint.rsRatio, lastPoint.rsMomentum);
              const arrowColor = quadrantColors[lastQuadrant];
              
              chartGroup.append('polygon')
                .attr('class', 'tail-arrow')
                .attr('fill', arrowColor)
                .attr('stroke', 'white')
                .attr('stroke-width', 1)
                .attr('opacity', 0.9)
                .attr('points', `0,-${arrowSize/2} ${arrowSize},0 0,${arrowSize/2}`)
                .attr('transform', `translate(${xScale(lastPoint.rsRatio)}, ${yScale(lastPoint.rsMomentum)}) rotate(${angle * 180 / Math.PI})`);
            }
          }
        }
      });
    }

    // Draw main points (only those within visible bounds with strict containment)
    const visiblePoints = currentData.filter(d => {
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
      .attr('class', 'rrg-point');

    points.append('circle')
      .attr('cx', d => Math.max(0, Math.min(chartWidth, xScale(d.rsRatio))))
      .attr('cy', d => Math.max(0, Math.min(chartHeight, yScale(d.rsMomentum))))
      .attr('r', 8)
      .attr('fill', d => {
        const quadrant = getQuadrant(d.rsRatio, d.rsMomentum);
        return quadrantColors[quadrant];
      })
      .attr('stroke', 'white')
      .attr('stroke-width', 2);

    // Add labels (also clamped to chart bounds)
    points.append('text')
      .attr('x', d => Math.max(0, Math.min(chartWidth, xScale(d.rsRatio))))
      .attr('y', d => Math.max(12, Math.min(chartHeight, yScale(d.rsMomentum) - 12)))
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
  }, [currentData, width, height, showTails, tailLength, lookbackIndex, zoomLevel, selectedQuadrant, panOffset, autoFit, isDragging, lastMousePos, currentDomain]);

  const handleLookbackChange = (value: number) => {
    setLookbackIndex(value);
    onLookbackChange?.(value);
  };

  return (
    <div className="rrg-chart-container">
      <div className="rrg-header">
        <div className="rrg-title">
          <h3>Relative Rotation Graph (RRG)</h3>
          <p>Benchmark: {benchmark} | Timeframe: {timeframe}</p>
        </div>
        <div className="rrg-controls">
          <button 
            className="control-btn"
            onClick={fitToData}
            title="Fit to Data"
          >
            📐 Fit
          </button>
          <button 
            className="control-btn"
            onClick={centerChart}
            title="Center Chart"
          >
            🎯 Center
          </button>
          <button 
            className="control-btn"
            onClick={playAnimation}
            disabled={isPlaying}
            title="Play Animation"
          >
            {isPlaying ? '⏸️' : '▶️'} Play
          </button>
          <label>
            <input
              type="checkbox"
              checked={showTails}
              onChange={(e) => onShowTailsChange?.(e.target.checked)}
            />
            Show Tails
          </label>
          {showTails && (
            <div className="tail-length-control">
              <label className="tail-length-label">
                <span>Tail Length: {tailLength}</span>
                <input
                  type="range"
                  min="3"
                  max="50"
                  value={tailLength}
                  onChange={(e) => onTailLengthChange?.(parseInt(e.target.value))}
                  className="tail-length-slider"
                  title={`Show last ${tailLength} data points in tails`}
                />
                <div className="tail-presets">
                  {[5, 10, 20, 30].map(preset => (
                    <button
                      key={preset}
                      className={`preset-btn ${tailLength === preset ? 'active' : ''}`}
                      onClick={() => onTailLengthChange?.(preset)}
                      title={`Set tail length to ${preset}`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </label>
            </div>
          )}
          {selectedQuadrant && (
            <span className="selected-quadrant">
              📍 {selectedQuadrant.charAt(0).toUpperCase() + selectedQuadrant.slice(1)} Quadrant
            </span>
          )}
          <span className="zoom-indicator">
            🔍 {zoomLevel.toFixed(1)}x
          </span>
        </div>
      </div>

      {/* Lookback Control Bar */}
      <div className="rrg-lookback-bar">
        <div className="lookback-controls">
          <span className="lookback-label">Historical Lookback:</span>
          <div className="lookback-slider-container">
            <input
              type="range"
              min="0"
              max={maxTailLength}
              value={maxTailLength - lookbackIndex}
              onChange={(e) => handleLookbackChange(maxTailLength - parseInt(e.target.value))}
              className="lookback-slider"
            />
            <div className="lookback-markers">
              <span>Past</span>
              <span className="current-date">
                {historicalDates[Math.max(0, historicalDates.length - 1 - lookbackIndex)]}
              </span>
              <span>Present</span>
            </div>
          </div>
          <div className="lookback-info">
            <span className="lookback-value">
              {lookbackIndex === 0 ? 'Current' : `${lookbackIndex} weeks ago`}
            </span>
          </div>
        </div>
      </div>
      
      <div className="rrg-chart-wrapper">
        <svg
          ref={svgRef}
          width={width}
          height={height}
          style={{ background: '#0a0a0a' }}
        />
      </div>

      <div className="rrg-legend">
        <h4 style={{ color: 'white', margin: '0 0 10px 0', fontSize: '16px' }}>RRG Quadrants</h4>
        <div className="legend-item">
          <div className="legend-color" style={{ backgroundColor: quadrantColors.leading, border: '2px solid white' }}></div>
          <span><strong>Leading</strong> (Strong RS, Improving Momentum)</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ backgroundColor: quadrantColors.weakening, border: '2px solid white' }}></div>
          <span><strong>Weakening</strong> (Strong RS, Declining Momentum)</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ backgroundColor: quadrantColors.lagging, border: '2px solid white' }}></div>
          <span><strong>Lagging</strong> (Weak RS, Declining Momentum)</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ backgroundColor: quadrantColors.improving, border: '2px solid white' }}></div>
          <span><strong>Improving</strong> (Weak RS, Improving Momentum)</span>
        </div>
        <div style={{ marginTop: '10px', fontSize: '12px', color: '#aaa' }}>
          <p>• Smooth tail paths show historical movement through quadrants</p>
          <p>• Gradient colors reflect position-based quadrant transitions</p>
          <p>• Arrow indicates direction of recent movement</p>
          <p>• Tail length control shows the last N data points (3-50)</p>
          <p>• Colors remain stable during zoom operations</p>
        </div>
      </div>
    </div>
  );
};

export default RRGChart;
