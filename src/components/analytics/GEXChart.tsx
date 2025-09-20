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
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  const [zoomTransform, setZoomTransform] = useState<any>(null);
  const [showNetGamma, setShowNetGamma] = useState<boolean>(true); // Default to NET view
  const svgRef = useRef<SVGSVGElement>(null);

  /**
   * Calculate Gamma Exposure (GEX) using real Polygon gamma data
   * 
   * Simple formula: GEX = Gamma × Open Interest × 100 × Spot²
   * No bullshit, no dealer perspective flipping, just straight math
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

    // Use absolute value of gamma (gamma should always be positive)
    const absGamma = Math.abs(polygonGamma);
    
    // GEX = Gamma × OI × 100 × Spot²
    let gex = absGamma * openInterest * 100 * spot * spot;
    
    // Apply dealer perspective signs:
    // - Calls: Positive GEX (dealers short gamma)
    // - Puts: Negative GEX (dealers short gamma)
    if (contractType === 'put') {
      gex = -gex;
    }
    
    return gex;
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
                    const gex = calculateGammaExposure(
                      openInterest, 
                      spotPrice, 
                      callData.greeks?.gamma,
                      'call'
                    );
                    
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
                    const gex = calculateGammaExposure(
                      openInterest, 
                      spotPrice, 
                      putData.greeks?.gamma,
                      'put'
                    );
                    
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
              if (showNetGamma) {
                // Show NET gamma exposure (calls + puts)
                const netGEX = callGEX + putGEX;
                if (Math.abs(netGEX) > 0) {
                  chartData.push({
                    strike,
                    gammaExposure: netGEX,
                    type: netGEX >= 0 ? 'call' : 'put' // Color based on net direction
                  });
                }
              } else {
                // Show separate call and put bars
                if (Math.abs(callGEX) > 0) {
                  chartData.push({
                    strike,
                    gammaExposure: callGEX,
                    type: 'call'
                  });
                }
                if (Math.abs(putGEX) > 0) {
                  chartData.push({
                    strike,
                    gammaExposure: putGEX,
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
              const strikeMap = new Map<number, { callGEX?: number; putGEX?: number }>();
              
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
                    const gex = calculateGammaExposure(
                      openInterest, 
                      spotPrice, 
                      putData.greeks?.gamma,
                      'put'
                    );
                    
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
                  if (showNetGamma) {
                    // Show NET gamma exposure (calls + puts)
                    const netGEX = callGEX + putGEX;
                    if (Math.abs(netGEX) > 0) {
                      chartData.push({
                        strike,
                        gammaExposure: netGEX,
                        type: netGEX >= 0 ? 'call' : 'put' // Color based on net direction
                      });
                    }
                  } else {
                    // Show separate call and put bars
                    if (Math.abs(callGEX) > 0) {
                      chartData.push({
                        strike,
                        gammaExposure: callGEX,
                        type: 'call'
                      });
                    }
                    if (Math.abs(putGEX) > 0) {
                      chartData.push({
                        strike,
                        gammaExposure: putGEX,
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

    const margin = { top: 60, right: 180, bottom: 80, left: 100 };
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
        
        // Update bars with new scales - centered on each strike
        container.selectAll('.gex-bar')
          .style('display', (d: any) => visibleStrikes.includes(d.strike) ? 'block' : 'none')
          .attr('x', (d: any) => {
            if (!visibleStrikes.includes(d.strike)) return -1000; // Hide off-screen bars
            return newXBandScale(d.strike.toString()) || 0;
          })
          .attr('y', (d: any) => d.gammaExposure >= 0 ? newYScale(d.gammaExposure) : newYScale(0))
          .attr('width', newXBandScale.bandwidth())
          .attr('height', (d: any) => Math.abs(newYScale(d.gammaExposure) - newYScale(0)));
        
        // Update X-axis with visible strikes only
        const maxVisibleLabels = 15;
        const visibleTickInterval = Math.max(1, Math.ceil(visibleStrikes.length / maxVisibleLabels));
        const filteredVisibleTicks = visibleStrikes.filter((_, index) => index % visibleTickInterval === 0);
        
        const customVisibleXAxis = d3.axisBottom(newXBandScale)
          .tickValues(filteredVisibleTicks.map(s => s.toString()));
        
        const xAxisUpdate = container.select('.x-axis') as d3.Selection<SVGGElement, unknown, null, undefined>;
        xAxisUpdate.call(customVisibleXAxis);
        
        // Calculate dynamic font size for visible ticks (larger sizes)
        const visibleFontSize = Math.max(14, Math.min(18, 250 / filteredVisibleTicks.length));
        
        xAxisUpdate.selectAll('text')
          .style('fill', 'white')
          .style('font-size', `${visibleFontSize}px`)
          .attr('transform', 'rotate(-35)')
          .style('text-anchor', 'end')
          .attr('dx', '-0.5em')
          .attr('dy', '0.5em');
        
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
          .style('font-size', '14px');
        
        yAxisUpdate.selectAll('path, line')
          .style('stroke', 'white')
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
    const maxLabels = 15; // Maximum number of labels to show
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
    // Calculate dynamic font size based on number of visible ticks (larger sizes)
    const fontSize = Math.max(14, Math.min(18, 250 / filteredTicks.length));
    
    container
      .append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,${height})`) // Position at bottom of chart
      .call(xAxis)
      .selectAll('text')
      .style('font-family', '"SF Mono", Consolas, monospace')
      .style('font-size', `${fontSize}px`)
      .style('fill', '#ffffff')
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
      .style('font-family', '"SF Mono", Consolas, monospace')
      .style('font-size', '14px')
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

    // Add bars with enhanced styling - centered on each strike
    container
      .selectAll('.gex-bar')
      .data(filteredData)
      .enter()
      .append('rect')
      .attr('class', 'gex-bar')
      .attr('x', d => (xScale(d.strike.toString()) || 0))
      .attr('y', d => d.gammaExposure >= 0 ? yScale(d.gammaExposure) : yScale(0))
      .attr('width', xScale.bandwidth())
      .attr('height', d => Math.abs(yScale(d.gammaExposure) - yScale(0)))
      .style('fill', d => {
        if (d.gammaExposure > 0) {
          return '#a855f7'; // Brighter, more vibrant purple for positive gamma
        } else {
          return '#f59e0b'; // Brighter, more vibrant orange for negative gamma
        }
      })
      .style('stroke', d => {
        if (d.gammaExposure > 0) {
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
      .style('fill', '#ffffff')
      .text(`Gamma Exposure (GEX)`);

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
              {/* Net/Separate Gamma toggle - positioned above existing toggles */}
              <div
                onClick={() => setShowNetGamma(!showNetGamma)}
                style={{
                  position: 'absolute',
                  top: '30px', // Above existing toggles
                  right: '50px',
                  width: '160px',
                  height: '20px',
                  cursor: 'pointer',
                  backgroundColor: 'transparent',
                  zIndex: 10,
                  border: '1px solid #666666',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  color: '#ff9900',
                  fontFamily: '"Roboto Mono", monospace'
                }}
                title={`Click to switch to ${showNetGamma ? 'Separate' : 'Net'} view`}
              >
                {showNetGamma ? 'NET GAMMA' : 'SEPARATE'}
              </div>
              
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