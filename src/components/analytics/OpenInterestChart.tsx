'use client';

import React, { useState, useEffect, useRef } from 'react';
import * as d3 from 'd3';
import GEXChart from './GEXChart';

interface OptionsData {
  strike: number;
  openInterest: number;
  type: 'call' | 'put';
}

interface OpenInterestChartProps {}

export default function OpenInterestChart({}: OpenInterestChartProps) {
  const [selectedTicker, setSelectedTicker] = useState<string>('SPY');
  const [selectedExpiration, setSelectedExpiration] = useState<string>('');
  const [showAllDates, setShowAllDates] = useState<boolean>(false);
  const [expirationDates, setExpirationDates] = useState<string[]>([]);
  const [data, setData] = useState<OptionsData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [zoomTransform, setZoomTransform] = useState<any>(null);
  
  // Toggle states for chart visibility
  const [showCalls, setShowCalls] = useState<boolean>(true);
  const [showPuts, setShowPuts] = useState<boolean>(true);
  const [showPositiveGamma, setShowPositiveGamma] = useState<boolean>(true);
  const [showNegativeGamma, setShowNegativeGamma] = useState<boolean>(true);
  
  const svgRef = useRef<SVGSVGElement>(null);

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
          if (dates.length > 0 && !selectedExpiration) {
            setSelectedExpiration(dates[0]);
          }
        }
      } catch (err) {
        setError('Failed to fetch expiration dates');
        console.error('Error fetching expirations:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchExpirations();
  }, [selectedTicker]);

  // Fetch options data for selected expiration or all dates
  useEffect(() => {
    if (!selectedTicker || (!selectedExpiration && !showAllDates)) return;

    const fetchOptionsData = async () => {
      try {
        setLoading(true);
        setError('');
        
        if (showAllDates) {
          // Fetch and combine data from all expiration dates
          const combinedStrikeMap = new Map<number, { call?: number; put?: number }>();
          
          for (const expDate of expirationDates) {
            const response = await fetch(`/api/options-chain?ticker=${selectedTicker}`);
            const result = await response.json();
            
            if (result.success && result.data && result.data[expDate]) {
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
          // Fetch data for single expiration date
          const response = await fetch(`/api/options-chain?ticker=${selectedTicker}`);
          const result = await response.json();
          
          if (result.success && result.data && result.data[selectedExpiration]) {
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
  }, [selectedTicker, selectedExpiration, showAllDates, expirationDates]);

  // D3 Chart rendering
  useEffect(() => {
    if (!data.length || !svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const margin = { top: 30, right: 180, bottom: 70, left: 80 };
    const width = 1500 - margin.left - margin.right;
    const height = 750 - margin.top - margin.bottom;

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
        const xAxisUpdate = container.select('.x-axis') as d3.Selection<SVGGElement, unknown, null, undefined>;
        xAxisUpdate.call(d3.axisBottom(newXBandScale) as any);
        
        xAxisUpdate.selectAll('text')
          .style('fill', 'white')
          .style('font-size', '12px')
          .attr('transform', 'rotate(-45)')
          .style('text-anchor', 'end');
        
        xAxisUpdate.selectAll('path, line')
          .style('stroke', 'white')
          .style('stroke-width', '1px');
        
        // Update Y-axis with new scale
        const yAxisUpdate = container.select('.y-axis') as d3.Selection<SVGGElement, unknown, null, undefined>;
        yAxisUpdate.call(d3.axisLeft(newYScale).tickFormat(d3.format(',d')) as any);
        
        yAxisUpdate.selectAll('text')
          .style('fill', 'white')
          .style('font-size', '12px');
        
        yAxisUpdate.selectAll('path, line')
          .style('stroke', 'white')
          .style('stroke-width', '1px');
      });

    // Filter data based on toggle states
    const filteredData = data.filter(d => {
      if (d.type === 'call' && !showCalls) return false;
      if (d.type === 'put' && !showPuts) return false;
      return true;
    });

    // Bars
    container
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
      .attr('opacity', 1)
      .on('mouseover', function(event, d) {
        d3.select(this).attr('opacity', 1);
        
        // Tooltip
        const tooltip = d3.select('body')
          .append('div')
          .style('position', 'absolute')
          .style('background', '#000')
          .style('color', '#ff9900')
          .style('padding', '12px')
          .style('border-radius', '0px')
          .style('border', '1px solid #ff9900')
          .style('font-size', '14px')
          .style('font-weight', 'bold')
          .style('pointer-events', 'none')
          .style('z-index', '1000');

        tooltip.html(`
          <div><strong>STRIKE:</strong> $${d.strike}</div>
          <div><strong>TYPE:</strong> ${d.type.toUpperCase()}</div>
          <div><strong>OPEN INTEREST:</strong> ${d.openInterest.toLocaleString()}</div>
        `)
        .style('left', (event.pageX + 10) + 'px')
        .style('top', (event.pageY - 10) + 'px');
      })
      .on('mouseout', function() {
        d3.select(this).attr('opacity', 1);
        d3.selectAll('body > div').filter(function() {
          return d3.select(this).style('position') === 'absolute';
        }).remove();
      });

    // X-axis
    const xAxis = container
      .append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(xScale));
    
    xAxis.selectAll('text')
      .style('fill', '#ff9900')
      .style('font-size', '12px')
      .attr('transform', 'rotate(-45)')
      .style('text-anchor', 'end');
    
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
      .style('font-size', '12px');
    
    yAxis.selectAll('path, line')
      .style('stroke', '#ff9900')
      .style('stroke-width', '1px');

    // Axis labels
    container
      .append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', -50)
      .attr('x', 0 - (height / 2))
      .attr('dy', '1em')
      .style('text-anchor', 'middle')
      .style('fill', '#ff9900')
      .style('font-size', '14px')
      .text('Open Interest');

    container
      .append('text')
      .attr('transform', `translate(${width / 2}, ${height + margin.bottom - 20})`)
      .style('text-anchor', 'middle')
      .style('fill', '#ff9900')
      .style('font-size', '14px')
      .text('Strike Price ($)');

    // Current Price Line (estimate from middle of strike range)
    const strikes = uniqueStrikes;
    const currentPrice = strikes.length > 0 ? (strikes[0] + strikes[strikes.length - 1]) / 2 : 0;
    
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
        .attr('x', xPosition)
        .attr('y', -10)
        .style('text-anchor', 'middle')
        .style('fill', '#ff9900')
        .style('font-size', '12px')
        .style('font-weight', 'bold')
        .text(`Current Price: $${currentPrice.toFixed(2)}`);
    }

    // Interactive Legend in original right-side position (Static SVG with React click overlays)
    const legend = container
      .append('g')
      .attr('transform', `translate(${width - 150}, 30)`);

    // Calls Legend Item (Visual only - click handled by React overlay)
    legend
      .append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', 15)
      .attr('height', 15)
      .attr('fill', showCalls ? '#00ff00' : '#333333')
      .attr('stroke', showCalls ? '#00ff00' : '#666666')
      .attr('stroke-width', 2);

    // Add checkmark for calls if enabled
    if (showCalls) {
      legend
        .append('text')
        .attr('x', 7.5)
        .attr('y', 11)
        .style('fill', '#000000')
        .style('font-size', '10px')
        .style('font-weight', 'bold')
        .style('text-anchor', 'middle')
        .text('✓');
    }

    legend
      .append('text')
      .attr('x', 20)
      .attr('y', 14)
      .style('fill', showCalls ? '#00ff00' : '#666666')
      .style('font-size', '14px')
      .style('font-weight', 'bold')
      .text('CALLS');

    // Puts Legend Item (Visual only - click handled by React overlay)
    legend
      .append('rect')
      .attr('x', 0)
      .attr('y', 30)
      .attr('width', 15)
      .attr('height', 15)
      .attr('fill', showPuts ? '#ff0000' : '#333333')
      .attr('stroke', showPuts ? '#ff0000' : '#666666')
      .attr('stroke-width', 2);

    // Add checkmark for puts if enabled
    if (showPuts) {
      legend
        .append('text')
        .attr('x', 7.5)
        .attr('y', 41)
        .style('fill', '#ffffff')
        .style('font-size', '10px')
        .style('font-weight', 'bold')
        .style('text-anchor', 'middle')
        .text('✓');
    }

    legend
      .append('text')
      .attr('x', 20)
      .attr('y', 42)
      .style('fill', showPuts ? '#ff0000' : '#666666')
      .style('font-size', '14px')
      .style('font-weight', 'bold')
      .text('PUTS');

    // Add zoom rectangle AFTER all other elements - covering the entire chart area
    const zoomRect = svg
      .append('rect')
      .attr('class', 'zoom-overlay')
      .attr('x', margin.left)
      .attr('y', margin.top)
      .attr('width', width)
      .attr('height', height)
      .style('fill', 'none')  // Invisible overlay
      .style('pointer-events', 'all')
      .style('cursor', 'grab');
    
    // Apply zoom behavior to the entire SVG
    svg.call(zoom as any);

    // Apply existing zoom transform if it exists
    if (zoomTransform) {
      svg.call(zoom.transform as any, zoomTransform);
    }

  }, [data, showCalls, showPuts]);

  return (
    <div style={{ color: '#ff9900', fontFamily: '"Roboto Mono", monospace' }}>
      {/* Controls */}
      <div style={{ 
        display: 'flex', 
        gap: '16px', 
        alignItems: 'center', 
        marginBottom: '24px',
        padding: '20px 24px',
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
        transform: 'translateZ(0)',
        backdropFilter: 'blur(20px)'
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
        
        {/* Ticker Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', zIndex: 1 }}>
          <label style={{ 
            color: '#ffffff', 
            fontSize: '13px', 
            fontWeight: '600',
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
            minWidth: '60px',
            textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)'
          }}>
            Ticker
          </label>
          <input
            type="text"
            placeholder="Enter symbol"
            value={selectedTicker}
            onChange={(e) => setSelectedTicker(e.target.value.toUpperCase())}
            style={{
              background: '#000000',
              border: '1px solid #333333',
              borderRadius: '8px',
              color: '#ffffff',
              padding: '10px 14px',
              fontSize: '14px',
              fontWeight: '500',
              width: '140px',
              outline: 'none',
              transition: 'all 0.2s ease',
              fontFamily: '"SF Pro Display", -apple-system, BlinkMacSystemFont, sans-serif',
              boxShadow: `
                inset 0 2px 4px rgba(0, 0, 0, 0.6),
                inset 0 -1px 0 rgba(255, 255, 255, 0.05),
                0 1px 0 rgba(255, 255, 255, 0.1)
              `,
              textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)'
            }}
            onFocus={(e) => {
              e.target.style.border = '1px solid #d97706';
              e.target.style.boxShadow = `
                inset 0 2px 4px rgba(0, 0, 0, 0.6),
                inset 0 -1px 0 rgba(255, 255, 255, 0.05),
                0 0 0 2px rgba(217, 119, 6, 0.2),
                0 1px 0 rgba(255, 255, 255, 0.1)
              `;
            }}
            onBlur={(e) => {
              e.target.style.border = '1px solid #333333';
              e.target.style.boxShadow = `
                inset 0 2px 4px rgba(0, 0, 0, 0.6),
                inset 0 -1px 0 rgba(255, 255, 255, 0.05),
                0 1px 0 rgba(255, 255, 255, 0.1)
              `;
            }}
          />
        </div>
        
        {/* Divider */}
        <div style={{ 
          width: '1px', 
          height: '32px', 
          background: 'linear-gradient(180deg, transparent 0%, #555  50%, transparent 100%)',
          boxShadow: '1px 0 0 rgba(255, 255, 255, 0.05)'
        }} />
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', zIndex: 1 }}>
          <label style={{ 
            color: '#ffffff', 
            fontSize: '13px', 
            fontWeight: '600',
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
            minWidth: '90px',
            textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)'
          }}>
            Expiration
          </label>
          <select
            value={selectedExpiration}
            onChange={(e) => setSelectedExpiration(e.target.value)}
            style={{
              background: '#000000',
              border: '1px solid #333333',
              borderRadius: '8px',
              color: showAllDates ? '#666666' : '#ffffff',
              padding: '10px 14px',
              fontSize: '14px',
              fontWeight: '500',
              minWidth: '160px',
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
          >
            {showAllDates ? (
              <option value="" style={{ background: '#000000', color: '#666666' }}>
                All Expiration Dates Combined
              </option>
            ) : (
              expirationDates.map(date => (
                <option key={date} value={date} style={{ background: '#000000', color: '#ffffff' }}>
                  {new Date(date).toLocaleDateString()}
                </option>
              ))
            )}
          </select>
          
          <button
            onClick={() => {
              setShowAllDates(!showAllDates);
              if (!showAllDates) {
                // When switching to "All Dates", clear selected expiration
                setSelectedExpiration('');
              } else {
                // When switching back to single date, select first available date
                if (expirationDates.length > 0) {
                  setSelectedExpiration(expirationDates[0]);
                }
              }
            }}
            style={{
              background: showAllDates ? '#d97706' : '#000000',
              border: `1px solid ${showAllDates ? '#d97706' : '#333333'}`,
              borderRadius: '8px',
              color: showAllDates ? '#000000' : '#ffffff',
              padding: '10px 16px',
              fontSize: '13px',
              fontWeight: '600',
              letterSpacing: '0.3px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              fontFamily: '"SF Pro Display", -apple-system, BlinkMacSystemFont, sans-serif',
              textTransform: 'uppercase',
              boxShadow: showAllDates ? `
                0 4px 16px rgba(217, 119, 6, 0.4),
                0 2px 8px rgba(0, 0, 0, 0.6),
                inset 0 1px 0 rgba(255, 255, 255, 0.2),
                inset 0 -1px 0 rgba(0, 0, 0, 0.2)
              ` : `
                0 2px 8px rgba(0, 0, 0, 0.4),
                inset 0 1px 0 rgba(255, 255, 255, 0.1),
                inset 0 -1px 0 rgba(0, 0, 0, 0.4)
              `,
              textShadow: showAllDates ? '0 1px 2px rgba(0, 0, 0, 0.3)' : '0 1px 2px rgba(0, 0, 0, 0.8)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'linear-gradient(145deg, #d97706 0%, #b45309 50%, #d97706 100%)';
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
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'linear-gradient(145deg, #1a1a1a 0%, #000000 50%, #0a0a0a 100%)';
              e.currentTarget.style.color = '#ffffff';
              e.currentTarget.style.border = '1px solid #333333';
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = `
                0 2px 8px rgba(0, 0, 0, 0.4),
                inset 0 1px 0 rgba(255, 255, 255, 0.1),
                inset 0 -1px 0 rgba(0, 0, 0, 0.4)
              `;
              e.currentTarget.style.textShadow = '0 1px 2px rgba(0, 0, 0, 0.8)';
            }}
          >
            All Dates
          </button>
        </div>
        
        {/* Divider */}
        <div style={{ 
          width: '1px', 
          height: '32px', 
          background: 'linear-gradient(180deg, transparent 0%, #555 50%, transparent 100%)',
          boxShadow: '1px 0 0 rgba(255, 255, 255, 0.05)'
        }} />
        
        {/* Expected Range PC Bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', zIndex: 1 }}>
          <label style={{ 
            color: '#ffffff', 
            fontSize: '13px', 
            fontWeight: '600',
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
            textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)'
          }}>
            Expected Range
          </label>
          <div style={{
            background: '#000000',
            border: '1px solid #333333',
            borderRadius: '8px',
            padding: '10px 16px',
            color: '#ffffff',
            fontSize: '14px',
            fontWeight: '500',
            minWidth: '100px',
            textAlign: 'center',
            fontFamily: '"SF Mono", Consolas, monospace',
            boxShadow: `
              inset 0 2px 4px rgba(0, 0, 0, 0.6),
              inset 0 -1px 0 rgba(255, 255, 255, 0.05),
              0 1px 0 rgba(255, 255, 255, 0.1)
            `,
            textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)'
          }}>
            -- / --
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginLeft: 'auto', zIndex: 1 }}>
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
            AI Assist
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
            Quick Chart
          </button>
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
          background: 'rgba(0, 0, 0, 0.98)',
          borderRadius: '0px',
          padding: '15px',
          border: '1px solid #ff9900',
          minHeight: '800px',
          width: '100%'
        }}>
          <div style={{ display: 'flex', justifyContent: 'center', position: 'relative' }}>
            <svg
              ref={svgRef}
              width={1500}
              height={750}
              style={{ 
                background: '#000000', 
                borderRadius: '0px',
                border: '1px solid #333'
              }}
            />
            
            {/* Click overlays for legend items */}
            {!loading && !error && data.length > 0 && (
              <>
                {/* Calls legend click area - covers checkbox AND text */}
                <div
                  onClick={() => setShowCalls(!showCalls)}
                  style={{
                    position: 'absolute',
                    top: '60px', // margin.top (30) + legend y position (30) + rect y (0) = 60px
                    right: '100px', // Adjusted to cover text area too
                    width: '120px', // Cover checkbox + full text area
                    height: '20px',
                    cursor: 'pointer',
                    backgroundColor: 'transparent',
                    zIndex: 10
                  }}
                  title="Click anywhere to toggle CALLS visibility"
                />
                
                {/* Puts legend click area - covers checkbox AND text */}
                <div
                  onClick={() => setShowPuts(!showPuts)}
                  style={{
                    position: 'absolute',
                    top: '90px', // margin.top (30) + legend y position (30) + rect y (30) = 90px
                    right: '100px', // Adjusted to cover text area too
                    width: '120px', // Cover checkbox + full text area
                    height: '20px',
                    cursor: 'pointer',
                    backgroundColor: 'transparent',
                    zIndex: 10
                  }}
                  title="Click anywhere to toggle PUTS visibility"
                />
              </>
            )}
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
            ⚠️ NO DATA AVAILABLE ⚠️
          </h3>
          <p style={{ fontWeight: 'bold' }}>
            No open interest data found for {selectedTicker} on {new Date(selectedExpiration).toLocaleDateString()}
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
      />
    </div>
  );
}