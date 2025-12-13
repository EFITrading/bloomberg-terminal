'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

interface IVLineChartProps {
  data: Array<{
    symbol: string;
    ivHistory: Array<{ date: string; iv: number }>;
    color: string;
  }>;
  width?: number;
  height?: number;
}

const IVLineChart: React.FC<IVLineChartProps> = ({ data, height = 550 }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1600);

  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.offsetWidth - 40; // Subtract padding
        setWidth(containerWidth);
      }
    };

    updateWidth();
    window.addEventListener('resize', updateWidth);

    return () => {
      window.removeEventListener('resize', updateWidth);
    };
  }, []);

  useEffect(() => {
    if (!svgRef.current || !data || data.length === 0) return;

    // Validate data has IV history
    const validData = data.filter(d => d.ivHistory && d.ivHistory.length > 0);
    if (validData.length === 0) {
      console.warn('No valid IV history data');
      return;
    }

    console.log('Rendering IV chart with width:', width, 'height:', height); // Debug log

    // Clear previous chart
    d3.select(svgRef.current).selectAll('*').remove();

    const margin = { top: 40, right: 150, bottom: 60, left: 80 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height);

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Get all dates and IV values, filtering out invalid data
    const allDates = validData[0]?.ivHistory
      .map(d => new Date(d.date))
      .filter(d => !isNaN(d.getTime())) || [];
    
    const allIVValues = validData
      .flatMap(series => series.ivHistory
        .filter(d => typeof d.iv === 'number' && !isNaN(d.iv) && isFinite(d.iv))
        .map(d => d.iv * 100)); // Convert to percentage

    if (allDates.length === 0 || allIVValues.length === 0) {
      console.warn('No valid dates or IV values found');
      return;
    }

    // Create scales
    const xScale = d3.scaleTime()
      .domain(d3.extent(allDates) as [Date, Date])
      .range([0, innerWidth]);

    const maxIV = d3.max(allIVValues) as number;
    const minIV = d3.min(allIVValues) as number;
    
    const yScale = d3.scaleLinear()
      .domain([Math.max(0, minIV * 0.9), maxIV * 1.1]) // Add 10% padding, don't go below 0
      .range([innerHeight, 0]);

    // Create axes
    const xAxis = d3.axisBottom(xScale)
      .ticks(8)
      .tickFormat((d) => d3.timeFormat('%b %d')(d as Date));

    const yAxis = d3.axisLeft(yScale)
      .ticks(8)
      .tickFormat(d => `${d}%`);

    // Add grid lines
    g.append('g')
      .attr('class', 'grid')
      .attr('opacity', 0.1)
      .selectAll('line')
      .data(yScale.ticks(8))
      .enter()
      .append('line')
      .attr('x1', 0)
      .attr('x2', innerWidth)
      .attr('y1', d => yScale(d))
      .attr('y2', d => yScale(d))
      .attr('stroke', '#ffffff');

    // Add X axis
    const xAxisGroup = g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis);
    
    xAxisGroup.selectAll('text')
      .attr('fill', '#ffffff')
      .attr('font-family', 'Bloomberg Terminal, monospace')
      .attr('font-size', '15px')
      .attr('font-weight', '600');

    g.select('.domain')
      .style('stroke', '#ffffff')
      .style('stroke-width', '1px');

    g.selectAll('.tick line')
      .style('stroke', '#ffffff');

    // Add Y axis
    const yAxisGroup = g.append('g')
      .call(yAxis);
    
    yAxisGroup.selectAll('text')
      .attr('fill', '#ffffff')
      .attr('font-family', 'Bloomberg Terminal, monospace')
      .attr('font-size', '15px')
      .attr('font-weight', '600');

    g.selectAll('.domain')
      .style('stroke', '#ffffff')
      .style('stroke-width', '1px');

    g.selectAll('.tick line')
      .style('stroke', '#ffffff');

    // Add Y axis label
    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', -margin.left + 15)
      .attr('x', -innerHeight / 2)
      .attr('text-anchor', 'middle')
      .style('fill', '#ff8500')
      .style('font-family', 'Bloomberg Terminal, monospace')
      .style('font-size', '14px')
      .style('font-weight', 'bold')
      .text('IMPLIED VOLATILITY (%)');

    // Line generator
    const line = d3.line<{ date: string; iv: number }>()
      .defined(d => typeof d.iv === 'number' && !isNaN(d.iv) && isFinite(d.iv))
      .x(d => xScale(new Date(d.date)))
      .y(d => yScale(d.iv * 100))
      .curve(d3.curveMonotoneX);

    // Create tooltip
    const tooltip = d3.select('body').append('div')
      .attr('class', 'iv-chart-tooltip')
      .style('position', 'absolute')
      .style('background', 'rgba(0, 0, 0, 0.95)')
      .style('color', '#ffffff')
      .style('padding', '12px')
      .style('border', '2px solid #ff8500')
      .style('border-radius', '4px')
      .style('font-family', 'Bloomberg Terminal, monospace')
      .style('font-size', '12px')
      .style('pointer-events', 'none')
      .style('opacity', 0)
      .style('z-index', 10000);

    // Draw lines for each series
    validData.forEach((series, index) => {
      // Filter out invalid data points
      const validPoints = series.ivHistory.filter(d => 
        typeof d.iv === 'number' && !isNaN(d.iv) && isFinite(d.iv)
      );
      
      if (validPoints.length === 0) return;

      const path = g.append('path')
        .datum(validPoints)
        .attr('fill', 'none')
        .attr('stroke', series.color)
        .attr('stroke-width', series.symbol === 'SPY' ? 3 : 2)
        .attr('opacity', series.symbol === 'SPY' ? 0.9 : 0.7)
        .attr('d', line);

      // Add animation
      const totalLength = path.node()?.getTotalLength() || 0;
      if (totalLength > 0) {
        path
          .attr('stroke-dasharray', `${totalLength} ${totalLength}`)
          .attr('stroke-dashoffset', totalLength)
          .transition()
          .duration(1500)
          .delay(index * 200)
          .ease(d3.easeLinear)
          .attr('stroke-dashoffset', 0);
      }

      // Add data points
      g.selectAll(`.dot-${index}`)
        .data(validPoints)
        .enter()
        .append('circle')
        .attr('cx', d => xScale(new Date(d.date)))
        .attr('cy', d => yScale(d.iv * 100))
        .attr('r', series.symbol === 'SPY' ? 4 : 3)
        .attr('fill', series.color)
        .attr('stroke', '#000000')
        .attr('stroke-width', 1)
        .attr('opacity', 0)
        .on('mouseover', function(event, d) {
          d3.select(this)
            .transition()
            .duration(200)
            .attr('r', series.symbol === 'SPY' ? 6 : 5)
            .attr('opacity', 1);

          tooltip
            .style('opacity', 1)
            .html(`
              <div style="margin-bottom: 6px; font-weight: bold; color: ${series.color};">${series.symbol}</div>
              <div>Date: ${d3.timeFormat('%b %d, %Y')(new Date(d.date))}</div>
              <div>IV: ${(d.iv * 100).toFixed(2)}%</div>
            `)
            .style('left', `${event.pageX + 15}px`)
            .style('top', `${event.pageY - 15}px`);
        })
        .on('mouseout', function() {
          d3.select(this)
            .transition()
            .duration(200)
            .attr('r', series.symbol === 'SPY' ? 4 : 3)
            .attr('opacity', 0);

          tooltip.style('opacity', 0);
        })
        .transition()
        .duration(500)
        .delay(1500 + index * 200)
        .attr('opacity', 0.6);
    });

    // Add legend
    const legend = g.append('g')
      .attr('transform', `translate(${innerWidth + 20}, 20)`);

    validData.forEach((series, i) => {
      const legendRow = legend.append('g')
        .attr('transform', `translate(0, ${i * 30})`);

      legendRow.append('line')
        .attr('x1', 0)
        .attr('x2', 25)
        .attr('y1', 0)
        .attr('y2', 0)
        .attr('stroke', series.color)
        .attr('stroke-width', series.symbol === 'SPY' ? 3 : 2);

      legendRow.append('text')
        .attr('x', 35)
        .attr('y', 5)
        .text(series.symbol)
        .style('fill', '#ffffff')
        .style('font-family', 'Bloomberg Terminal, monospace')
        .style('font-size', '12px')
        .style('font-weight', series.symbol === 'SPY' ? 'bold' : 'normal');
    });

    // Add title
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', 20)
      .attr('text-anchor', 'middle')
      .style('fill', '#ff8500')
      .style('font-family', 'Bloomberg Terminal, monospace')
      .style('font-size', '16px')
      .style('font-weight', 'bold')
      .text('IMPLIED VOLATILITY HISTORICAL COMPARISON');

    // Cleanup tooltip on unmount
    return () => {
      tooltip.remove();
    };
  }, [data, width, height]);

  return (
    <div 
      ref={containerRef}
      style={{ 
        background: '#000000', 
        padding: '20px',
        borderRadius: '8px',
        border: '1px solid rgba(255, 133, 0, 0.3)',
        width: '100%',
        overflow: 'hidden'
      }}>
      <svg ref={svgRef}></svg>
    </div>
  );
};

export default IVLineChart;
