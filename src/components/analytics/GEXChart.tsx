'use client';

import React, { useState, useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface GEXData {
  strike: number;
  gammaExposure: number;
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
  const [zoomTransform, setZoomTransform] = useState<any>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Helper function to calculate gamma exposure
  const calculateGammaExposure = (
    openInterest: number, 
    strike: number, 
    spot: number, 
    contractType: 'call' | 'put'
  ): number => {
    // Estimate gamma based on moneyness (distance from spot to strike)
    const moneyness = strike / spot;
    const timeToExpiry = 0.25; // Assume 3 months average for simplicity
    const volatility = 0.3; // Assume 30% IV for simplicity
    
    // Simplified gamma estimation (real calculation would use Black-Scholes)
    // Gamma is highest at-the-money and decreases as you move away
    const distanceFromATM = Math.abs(moneyness - 1);
    const estimatedGamma = Math.exp(-Math.pow(distanceFromATM * 3, 2)) * 0.01;
    
    // GEX = Open Interest * Gamma * Spot^2 * 100 (multiplier for scaling)
    // For puts, we multiply by -1 to show negative gamma exposure
    const gex = openInterest * estimatedGamma * Math.pow(spot, 2) * 100;
    return contractType === 'put' ? -gex : gex;
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
          const combinedStrikeMap = new Map<number, { callGEX?: number; putGEX?: number }>();
          
          for (const expDate of expirationDates) {
            const response = await fetch(`/api/options-chain?ticker=${selectedTicker}`);
            const result = await response.json();
            
            if (result.success && result.data && result.data[expDate]) {
              const expirationData = result.data[expDate];
              
              // Get current spot price (we'll use the first available strike as approximation)
              const spotPrice = expirationData.underlying_price || 100; // fallback
              
              // Process calls for this expiration
              if (expirationData.calls) {
                Object.entries(expirationData.calls).forEach(([strike, callData]: [string, any]) => {
                  const strikeNum = parseFloat(strike);
                  const openInterest = callData.open_interest || callData.openInterest || 0;
                  
                  if (openInterest > 0) {
                    const gex = calculateGammaExposure(openInterest, strikeNum, spotPrice, 'call');
                    
                    if (!combinedStrikeMap.has(strikeNum)) {
                      combinedStrikeMap.set(strikeNum, {});
                    }
                    
                    const existing = combinedStrikeMap.get(strikeNum)!;
                    existing.callGEX = (existing.callGEX || 0) + gex;
                  }
                });
              }
              
              // Process puts for this expiration
              if (expirationData.puts) {
                Object.entries(expirationData.puts).forEach(([strike, putData]: [string, any]) => {
                  const strikeNum = parseFloat(strike);
                  const openInterest = putData.open_interest || putData.openInterest || 0;
                  
                  if (openInterest > 0) {
                    const gex = calculateGammaExposure(openInterest, strikeNum, spotPrice, 'put');
                    
                    if (!combinedStrikeMap.has(strikeNum)) {
                      combinedStrikeMap.set(strikeNum, {});
                    }
                    
                    const existing = combinedStrikeMap.get(strikeNum)!;
                    existing.putGEX = (existing.putGEX || 0) + gex;
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
            
            if (Math.abs(callGEX) > 0 || Math.abs(putGEX) > 0) {
              chartData.push({
                strike,
                gammaExposure: callGEX,
                type: 'call'
              });
              chartData.push({
                strike,
                gammaExposure: putGEX,
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
            const chartData: GEXData[] = [];
            const strikeMap = new Map<number, { callGEX?: number; putGEX?: number }>();
            
            // Get current spot price
            const spotPrice = expirationData.underlying_price || 100; // fallback
            
            // Process calls
            if (expirationData.calls) {
              Object.entries(expirationData.calls).forEach(([strike, callData]: [string, any]) => {
                const strikeNum = parseFloat(strike);
                const openInterest = callData.open_interest || callData.openInterest || 0;
                
                if (openInterest > 0) {
                  const gex = calculateGammaExposure(openInterest, strikeNum, spotPrice, 'call');
                  
                  if (!strikeMap.has(strikeNum)) {
                    strikeMap.set(strikeNum, {});
                  }
                  strikeMap.get(strikeNum)!.callGEX = gex;
                }
              });
            }
            
            // Process puts
            if (expirationData.puts) {
              Object.entries(expirationData.puts).forEach(([strike, putData]: [string, any]) => {
                const strikeNum = parseFloat(strike);
                const openInterest = putData.open_interest || putData.openInterest || 0;
                
                if (openInterest > 0) {
                  const gex = calculateGammaExposure(openInterest, strikeNum, spotPrice, 'put');
                  
                  if (!strikeMap.has(strikeNum)) {
                    strikeMap.set(strikeNum, {});
                  }
                  strikeMap.get(strikeNum)!.putGEX = gex;
                }
              });
            }
            
            // Convert to chart data
            strikeMap.forEach((data, strike) => {
              const callGEX = data.callGEX || 0;
              const putGEX = data.putGEX || 0;
              
              if (Math.abs(callGEX) > 0 || Math.abs(putGEX) > 0) {
                chartData.push({
                  strike,
                  gammaExposure: callGEX,
                  type: 'call'
                });
                chartData.push({
                  strike,
                  gammaExposure: putGEX,
                  type: 'put'
                });
              }
            });
            
            setData(chartData.sort((a, b) => a.strike - b.strike || (a.type === 'call' ? -1 : 1)));
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
  }, [selectedTicker, selectedExpiration, showAllDates, expirationDates]);

  // D3 Chart rendering
  useEffect(() => {
    if (!data.length || !svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const margin = { top: 30, right: 180, bottom: 70, left: 100 };
    const width = 1500 - margin.left - margin.right;
    const height = 600 - margin.top - margin.bottom;

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

    // Sub-scale for call/put positioning within each strike
    const xSubScale = d3
      .scaleBand()
      .domain(['call', 'put'])
      .range([0, xScale.bandwidth()])
      .padding(0.1);

    // Y scale for gamma exposure (positive and negative)
    const maxGEX = d3.max(data, d => Math.abs(d.gammaExposure)) || 1;
    const yScale = d3
      .scaleLinear()
      .domain([-maxGEX * 1.1, maxGEX * 1.1])
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
        
        // Create new X scale with zoom applied
        const newXScale = transform.rescaleX(d3.scaleLinear().domain([0, uniqueStrikes.length - 1]).range([0, width]));
        
        // Get visible strike range
        const startIndex = Math.max(0, Math.floor(newXScale.invert(0)));
        const endIndex = Math.min(uniqueStrikes.length - 1, Math.ceil(newXScale.invert(width)));
        
        const visibleStrikes = uniqueStrikes.slice(startIndex, endIndex + 1);
        const visibleData = data.filter(d => visibleStrikes.includes(d.strike));
        
        // Recalculate Y scale based on visible data only for GEX
        const maxVisibleGEX = d3.max(visibleData, d => Math.abs(d.gammaExposure)) || 1;
        const newYScale = d3.scaleLinear()
          .domain([-maxVisibleGEX * 1.1, maxVisibleGEX * 1.1])
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
        container.selectAll('.gex-bar')
          .style('display', (d: any) => visibleStrikes.includes(d.strike) ? 'block' : 'none')
          .attr('x', (d: any) => {
            if (!visibleStrikes.includes(d.strike)) return -1000; // Hide off-screen bars
            const baseX = newXBandScale(d.strike.toString()) || 0;
            const subX = newXSubScale(d.type) || 0;
            return baseX + subX;
          })
          .attr('y', (d: any) => d.gammaExposure >= 0 ? newYScale(d.gammaExposure) : newYScale(0))
          .attr('width', newXSubScale.bandwidth())
          .attr('height', (d: any) => Math.abs(newYScale(d.gammaExposure) - newYScale(0)));
        
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
        yAxisUpdate.call(d3.axisLeft(newYScale)
          .tickFormat(d => {
            const val = Math.abs(Number(d));
            if (val >= 1e9) return (Number(d) / 1e9).toFixed(1) + 'B';
            if (val >= 1e6) return (Number(d) / 1e6).toFixed(1) + 'M';
            if (val >= 1e3) return (Number(d) / 1e3).toFixed(1) + 'K';
            return Number(d).toFixed(0);
          }) as any);
        
        yAxisUpdate.selectAll('text')
          .style('fill', 'white')
          .style('font-size', '12px');
        
        yAxisUpdate.selectAll('path, line')
          .style('stroke', 'white')
          .style('stroke-width', '1px');

        // Update zero line
        container.select('.zero-line')
          .attr('y1', newYScale(0))
          .attr('y2', newYScale(0));
      });

    // Create axes
    const xAxis = d3.axisBottom(xScale);
    const yAxis = d3.axisLeft(yScale)
      .tickFormat(d => {
        const val = Math.abs(Number(d));
        if (val >= 1e9) return (Number(d) / 1e9).toFixed(1) + 'B';
        if (val >= 1e6) return (Number(d) / 1e6).toFixed(1) + 'M';
        if (val >= 1e3) return (Number(d) / 1e3).toFixed(1) + 'K';
        return Number(d).toFixed(0);
      });

    // Add X axis
    container
      .append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,${height})`) // Position at bottom of chart
      .call(xAxis)
      .selectAll('text')
      .style('font-family', '"SF Mono", Consolas, monospace')
      .style('font-size', '12px')
      .style('fill', '#ffffff')
      .attr('transform', 'rotate(-45)')
      .style('text-anchor', 'end');

    // Add Y axis
    container
      .append('g')
      .attr('class', 'y-axis')
      .call(yAxis)
      .selectAll('text')
      .style('font-family', '"SF Mono", Consolas, monospace')
      .style('font-size', '12px')
      .style('fill', '#ffffff');

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
      if (d.gammaExposure > 0 && !showPositiveGamma) return false;
      if (d.gammaExposure < 0 && !showNegativeGamma) return false;
      return true;
    });

    // Add bars with enhanced styling
    container
      .selectAll('.gex-bar')
      .data(filteredData)
      .enter()
      .append('rect')
      .attr('class', 'gex-bar')
      .attr('x', d => (xScale(d.strike.toString()) || 0) + (xSubScale(d.type) || 0))
      .attr('y', d => d.gammaExposure >= 0 ? yScale(d.gammaExposure) : yScale(0))
      .attr('width', xSubScale.bandwidth())
      .attr('height', d => Math.abs(yScale(d.gammaExposure) - yScale(0)))
      .style('fill', d => {
        if (d.gammaExposure > 0) {
          return '#8b5cf6'; // Bright purple for positive gamma
        } else {
          return '#d97706'; // Orange for negative gamma
        }
      })
      .style('stroke', d => {
        if (d.gammaExposure > 0) {
          return '#7c3aed'; // Darker purple border
        } else {
          return '#b45309'; // Darker orange border
        }
      })
      .style('stroke-width', 1)
      .style('opacity', 0.95)
      .style('filter', 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3))')
      .on('mouseover', function(event, d) {
        d3.select(this)
          .style('opacity', 1)
          .style('filter', 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.5))')
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

        const gexValue = d.gammaExposure;
        const formatGEX = (value: number) => {
          const absValue = Math.abs(value);
          if (absValue >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
          if (absValue >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
          if (absValue >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
          return value.toFixed(0);
        };

        tooltip.html(`
          <div style="font-weight: 600; margin-bottom: 6px; color: ${d.gammaExposure > 0 ? '#8b5cf6' : '#d97706'};">
            Strike: $${d.strike} ${d.type.toUpperCase()}
          </div>
          <div style="margin-bottom: 4px;">
            Gamma Exposure: <span style="font-weight: 600;">${gexValue >= 0 ? '+' : ''}${formatGEX(gexValue)}</span>
          </div>
          <div style="font-size: 11px; color: #999999;">
            ${d.gammaExposure > 0 ? 'Positive Gamma (Support)' : 'Negative Gamma (Resistance)'}
          </div>
        `);

        tooltip
          .style('left', (event.pageX + 15) + 'px')
          .style('top', (event.pageY - 10) + 'px');
      })
      .on('mouseout', function() {
        d3.select(this)
          .style('opacity', 0.85)
          .style('filter', 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3))')
          .style('stroke-width', 1);
        d3.selectAll('.gex-tooltip').remove();
      });

    // Add chart title
    container
      .append('text')
      .attr('x', width / 2)
      .attr('y', -10)
      .style('text-anchor', 'middle')
      .style('font-family', '"SF Pro Display", sans-serif')
      .style('font-size', '16px')
      .style('font-weight', '600')
      .style('fill', '#ffffff')
      .text(`Gamma Exposure (GEX) - ${selectedTicker} ${showAllDates ? 'All Dates' : new Date(selectedExpiration).toLocaleDateString()}`);

    // Add Y axis label
    container
      .append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', -70)
      .attr('x', -height / 2)
      .style('text-anchor', 'middle')
      .style('font-family', '"SF Pro Display", sans-serif')
      .style('font-size', '14px')
      .style('fill', '#ffffff')
      .text('Gamma Exposure');

    // Add X axis label - positioned at the bottom
    container
      .append('text')
      .attr('x', width / 2)
      .attr('y', height + 60)
      .style('text-anchor', 'middle')
      .style('font-family', '"SF Pro Display", sans-serif')
      .style('font-size', '14px')
      .style('font-weight', '500')
      .style('fill', '#ffffff')
      .text('Strike Price');

    // Interactive Legend in original top-right position (Static SVG with React click overlays)
    const legendBox = container
      .append('g')
      .attr('transform', `translate(${width - 180}, 10)`);

    // Legend background box
    legendBox
      .append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', 170)
      .attr('height', 70)
      .style('fill', '#000000')
      .style('stroke', '#333333')
      .style('stroke-width', 1)
      .style('rx', 6)
      .style('ry', 6)
      .style('opacity', 0.95);

    // Positive gamma legend item (Visual only - click handled by React overlay)
    legendBox
      .append('rect')
      .attr('x', 12)
      .attr('y', 15)
      .attr('width', 14)
      .attr('height', 14)
      .style('fill', showPositiveGamma ? '#8b5cf6' : '#333333')
      .style('stroke', showPositiveGamma ? '#8b5cf6' : '#666666')
      .style('stroke-width', 2)
      .style('rx', 2)
      .style('ry', 2);

    // Add checkmark for positive gamma if enabled
    if (showPositiveGamma) {
      legendBox
        .append('text')
        .attr('x', 19)
        .attr('y', 26)
        .style('fill', '#ffffff')
        .style('font-size', '10px')
        .style('font-weight', 'bold')
        .style('text-anchor', 'middle')
        .text('✓');
    }

    legendBox
      .append('text')
      .attr('x', 32)
      .attr('y', 26)
      .style('font-family', '"SF Pro Display", sans-serif')
      .style('font-size', '12px')
      .style('font-weight', '500')
      .style('fill', showPositiveGamma ? '#8b5cf6' : '#666666')
      .text('Positive Gamma');

    // Negative gamma legend item (Visual only - click handled by React overlay)
    legendBox
      .append('rect')
      .attr('x', 12)
      .attr('y', 40)
      .attr('width', 14)
      .attr('height', 14)
      .style('fill', showNegativeGamma ? '#d97706' : '#333333')
      .style('stroke', showNegativeGamma ? '#d97706' : '#666666')
      .style('stroke-width', 2)
      .style('rx', 2)
      .style('ry', 2);

    // Add checkmark for negative gamma if enabled
    if (showNegativeGamma) {
      legendBox
        .append('text')
        .attr('x', 19)
        .attr('y', 51)
        .style('fill', '#ffffff')
        .style('font-size', '10px')
        .style('font-weight', 'bold')
        .style('text-anchor', 'middle')
        .text('✓');
    }

    legendBox
      .append('text')
      .attr('x', 32)
      .attr('y', 51)
      .style('font-family', '"SF Pro Display", sans-serif')
      .style('font-size', '12px')
      .style('font-weight', '500')
      .style('fill', showNegativeGamma ? '#d97706' : '#666666')
      .text('Negative Gamma');

    // Add zoom rectangle AFTER all other elements - covering the entire chart area - EXACT COPY from OpenInterestChart
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

  }, [data, showPositiveGamma, showNegativeGamma]);

  return (
    <div style={{ marginTop: '32px' }}>
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
          <strong>⚠️ {error}</strong>
        </div>
      )}

      {/* Chart */}
      {!loading && !error && (
        <div style={{ 
          background: '#000000', 
          borderRadius: '8px', 
          padding: '20px',
          border: '1px solid #333333',
          boxShadow: '0 4px 24px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
          position: 'relative'
        }}>
          <svg
            ref={svgRef}
            width={1500}
            height={600}
            style={{ background: 'transparent' }}
          />
          
          {/* Click overlays for GEX legend items */}
          {data.length > 0 && (
            <>
              {/* Positive Gamma legend click area - covers checkbox AND full text */}
              <div
                onClick={() => setShowPositiveGamma(!showPositiveGamma)}
                style={{
                  position: 'absolute',
                  top: '55px', // margin.top (30) + legend y (10) + rect y (15) = 55px
                  right: '50px', // Adjusted to cover the entire legend box including text
                  width: '160px', // Cover entire legend box width
                  height: '20px',
                  cursor: 'pointer',
                  backgroundColor: 'transparent',
                  zIndex: 10
                }}
                title="Click anywhere to toggle Positive Gamma visibility"
              />
              
              {/* Negative Gamma legend click area - covers checkbox AND full text */}
              <div
                onClick={() => setShowNegativeGamma(!showNegativeGamma)}
                style={{
                  position: 'absolute',
                  top: '80px', // margin.top (30) + legend y (10) + rect y (40) = 80px
                  right: '50px', // Adjusted to cover the entire legend box including text
                  width: '160px', // Cover entire legend box width
                  height: '20px',
                  cursor: 'pointer',
                  backgroundColor: 'transparent',
                  zIndex: 10
                }}
                title="Click anywhere to toggle Negative Gamma visibility"
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}