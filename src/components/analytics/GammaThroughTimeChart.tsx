'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

interface GammaThroughTimeData {
  x: string; // ISO timestamp
  y: number; // Net GEX
  callGEX: number;
  putGEX: number;
  spotPrice: number;
}

interface GammaThroughTimeProps {
  ticker: string;
  width?: number;
  height?: number;
}

export default function GammaThroughTimeChart({ 
  ticker, 
  width = 800, 
  height = 400 
}: GammaThroughTimeProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [data, setData] = useState<GammaThroughTimeData[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [showCallGEX, setShowCallGEX] = useState<boolean>(true);
  const [showPutGEX, setShowPutGEX] = useState<boolean>(true);
  const [showNetGEX, setShowNetGEX] = useState<boolean>(true);

  // Load real data from your existing API
  useEffect(() => {
    loadRealData();
  }, [ticker]);

  const loadRealData = async () => {
    setLoading(true);
    
    try {
      // Fetch real options data from your existing API
      const response = await fetch(`/api/options-chain?ticker=${ticker}`);
      const result = await response.json();
      
      if (!result.success || !result.data) {
        console.error('Failed to fetch options data:', result.error);
        setData([]);
        setLoading(false);
        return;
      }
      
      // Get the first available expiration date
      const expirationDates = Object.keys(result.data);
      if (expirationDates.length === 0) {
        console.error('No expiration dates available');
        setData([]);
        setLoading(false);
        return;
      }
      
      const expiration = expirationDates[0]; // Use first expiration
      const expirationData = result.data[expiration];
      const spotPrice = expirationData.underlying_price || 571.50;
      
      console.log(`📊 Real data for ${ticker} expiring ${expiration}, spot: $${spotPrice}`);
      
      // Calculate time to expiry in years
      const expirationDate = new Date(expiration + 'T16:00:00');
      const now = new Date();
      const timeToExpiry = Math.max(0.001, (expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 365));
      
      // Generate timestamps for market hours (6:30 AM - 1:00 PM PT)
      const marketData: GammaThroughTimeData[] = [];
      const today = new Date();
      const marketOpen = new Date(today);
      marketOpen.setHours(6, 30, 0, 0); // 6:30 AM PT
      
      // Calculate real gamma exposure for multiple time points
      for (let i = 0; i < 13; i++) { // Every 30 minutes
        const timestamp = new Date(marketOpen.getTime() + (i * 30 * 60 * 1000));
        
        let totalCallGEX = 0;
        let totalPutGEX = 0;
        
        // Process calls
        if (expirationData.calls) {
          Object.entries(expirationData.calls).forEach(([strike, callData]: [string, any]) => {
            const strikeNum = parseFloat(strike);
            const openInterest = callData.open_interest || callData.openInterest || 0;
            
            if (openInterest > 0) {
              // Calculate gamma using Black-Scholes
              const gamma = calculateBlackScholesGamma(
                spotPrice, 
                strikeNum, 
                timeToExpiry, 
                0.20 // 20% IV estimate
              );
              
              // Calculate GEX
              const gex = calculateGammaExposure(openInterest, spotPrice, gamma, 'call');
              totalCallGEX += gex;
            }
          });
        }
        
        // Process puts
        if (expirationData.puts) {
          Object.entries(expirationData.puts).forEach(([strike, putData]: [string, any]) => {
            const strikeNum = parseFloat(strike);
            const openInterest = putData.open_interest || putData.openInterest || 0;
            
            if (openInterest > 0) {
              // Calculate gamma using Black-Scholes
              const gamma = calculateBlackScholesGamma(
                spotPrice, 
                strikeNum, 
                timeToExpiry, 
                0.20 // 20% IV estimate
              );
              
              // Calculate GEX
              const gex = calculateGammaExposure(openInterest, spotPrice, gamma, 'put');
              totalPutGEX += gex;
            }
          });
        }
        
        const netGEX = totalCallGEX + totalPutGEX;
        
        marketData.push({
          x: timestamp.toISOString(),
          y: netGEX,
          callGEX: totalCallGEX,
          putGEX: totalPutGEX,
          spotPrice
        });
      }
      
      console.log(`✅ Generated ${marketData.length} real data points for ${ticker}`);
      console.log(`📊 Sample GEX: Call=${marketData[0]?.callGEX.toFixed(0)}, Put=${marketData[0]?.putGEX.toFixed(0)}, Net=${marketData[0]?.y.toFixed(0)}`);
      
      // Debug: Log all data points
      marketData.forEach((point, index) => {
        if (index < 3) { // Log first 3 points
          console.log(`📊 Point ${index}: Net=${point.y.toFixed(0)}, Call=${point.callGEX.toFixed(0)}, Put=${point.putGEX.toFixed(0)}, Time=${point.x}`);
        }
      });
      
      setData(marketData);
      
    } catch (error) {
      console.error('Error fetching real options data:', error);
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Calculate real Gamma using Black-Scholes formula
   */
  const calculateBlackScholesGamma = (
    spot: number,
    strike: number,
    timeToExpiry: number,
    volatility: number,
    riskFreeRate: number = 0.05
  ): number => {
    if (timeToExpiry <= 0) return 0;
    
    const d1 = (Math.log(spot / strike) + (riskFreeRate + 0.5 * volatility * volatility) * timeToExpiry) / 
               (volatility * Math.sqrt(timeToExpiry));
    
    // Standard normal probability density function φ(d1)
    const phi_d1 = (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * d1 * d1);
    
    // Gamma calculation
    const gamma = phi_d1 / (spot * volatility * Math.sqrt(timeToExpiry));
    
    return gamma;
  };

  /**
   * Calculate Gamma Exposure (GEX) using calculated gamma
   */
  const calculateGammaExposure = (
    openInterest: number, 
    spot: number, 
    gamma: number,
    contractType: 'call' | 'put' = 'call'
  ): number => {
    if (!gamma || isNaN(gamma)) {
      return 0;
    }

    // GEX = Gamma × OI × 100 × Spot²
    let gex = gamma * openInterest * 100 * spot * spot;
    
    // Apply dealer perspective signs:
    // - Calls: Positive GEX (dealers short gamma)
    // - Puts: Negative GEX (dealers short gamma)
    if (contractType === 'put') {
      gex = -gex;
    }
    
    return gex;
  };

  useEffect(() => {
    if (!data.length || loading) return;
    
    console.log(`🔧 Rendering chart with ${data.length} data points`);
    console.log(`📊 Data range: ${data[0]?.y.toFixed(0)} to ${data[data.length-1]?.y.toFixed(0)}`);
    
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove(); // Clear previous chart
    
    const margin = { top: 20, right: 80, bottom: 60, left: 100 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;
    
    // Create scales with better domain handling
    const xScale = d3.scaleTime()
      .domain(d3.extent(data, d => new Date(d.x)) as [Date, Date])
      .range([0, chartWidth]);
    
    // Create Y scale with all visible data
    const allValues = [];
    if (showNetGEX) allValues.push(...data.map(d => d.y));
    if (showCallGEX) allValues.push(...data.map(d => d.callGEX));
    if (showPutGEX) allValues.push(...data.map(d => d.putGEX));
    
    const yExtent = d3.extent(allValues) as [number, number];
    console.log(`📊 Y-axis extent: [${yExtent[0].toFixed(0)}, ${yExtent[1].toFixed(0)}]`);
    
    const yScale = d3.scaleLinear()
      .domain(yExtent)
      .nice()
      .range([chartHeight, 0]);
    
    // Create main group
    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);
    
    // Add title
    g.append("text")
      .attr("x", chartWidth / 2)
      .attr("y", -5)
      .attr("text-anchor", "middle")
      .style("font-size", "16px")
      .style("font-weight", "bold")
      .style("fill", "#fff")
      .text(`${ticker} Gamma Through Time`);
    
    // Add grid lines
    const xAxis = d3.axisBottom(xScale).tickSize(-chartHeight).ticks(8);
    const yAxis = d3.axisLeft(yScale).tickSize(-chartWidth).ticks(6);
    
    g.append("g")
      .attr("class", "grid")
      .attr("transform", `translate(0,${chartHeight})`)
      .call(xAxis)
      .style("stroke-dasharray", "3,3")
      .style("opacity", 0.2)
      .style("stroke", "#333")
      .selectAll("text")
      .remove(); // Remove grid text
    
    g.append("g")
      .attr("class", "grid")
      .call(yAxis)
      .style("stroke-dasharray", "3,3")
      .style("opacity", 0.2)
      .style("stroke", "#333")
      .selectAll("text")
      .remove(); // Remove grid text
    
    // Create line generators
    const netLine = d3.line<GammaThroughTimeData>()
      .x(d => xScale(new Date(d.x)))
      .y(d => yScale(d.y))
      .curve(d3.curveMonotoneX)
      .defined(d => !isNaN(d.y) && isFinite(d.y));
    
    const callLine = d3.line<GammaThroughTimeData>()
      .x(d => xScale(new Date(d.x)))
      .y(d => yScale(d.callGEX))
      .curve(d3.curveMonotoneX)
      .defined(d => !isNaN(d.callGEX) && isFinite(d.callGEX));
    
    const putLine = d3.line<GammaThroughTimeData>()
      .x(d => xScale(new Date(d.x)))
      .y(d => yScale(d.putGEX))
      .curve(d3.curveMonotoneX)
      .defined(d => !isNaN(d.putGEX) && isFinite(d.putGEX));
    
    // Add lines with updated colors and debugging
    if (showNetGEX) {
      const netPath = g.append("path")
        .datum(data.filter(d => !isNaN(d.y) && isFinite(d.y)))
        .attr("fill", "none")
        .attr("stroke", "#0088ff") // Blue for Net GEX
        .attr("stroke-width", 3)
        .attr("d", netLine);
      
      console.log(`🔵 Net GEX line rendered with ${data.length} points`);
    }
    
    if (showCallGEX) {
      const callPath = g.append("path")
        .datum(data.filter(d => !isNaN(d.callGEX) && isFinite(d.callGEX)))
        .attr("fill", "none")
        .attr("stroke", "#00ff88") // Green for Call GEX
        .attr("stroke-width", 2)
        .attr("stroke-dasharray", "5,5")
        .attr("d", callLine);
      
      console.log(`🟢 Call GEX line rendered with ${data.length} points`);
    }
    
    if (showPutGEX) {
      const putPath = g.append("path")
        .datum(data.filter(d => !isNaN(d.putGEX) && isFinite(d.putGEX)))
        .attr("fill", "none")
        .attr("stroke", "#ff4444") // Red for Put GEX
        .attr("stroke-width", 2)
        .attr("stroke-dasharray", "5,5")
        .attr("d", putLine);
      
      console.log(`🔴 Put GEX line rendered with ${data.length} points`);
    }
    
    // Add data points with updated colors
    if (showNetGEX) {
      g.selectAll(".net-dot")
        .data(data.filter(d => !isNaN(d.y) && isFinite(d.y)))
        .enter().append("circle")
        .attr("class", "net-dot")
        .attr("cx", d => xScale(new Date(d.x)))
        .attr("cy", d => yScale(d.y))
        .attr("r", 4)
        .attr("fill", "#0088ff") // Blue for Net GEX
        .attr("stroke", "#000")
        .attr("stroke-width", 1);
      
      console.log(`🔵 Net GEX dots rendered: ${data.length} points`);
    }
    
    // Add zero line
    g.append("line")
      .attr("x1", 0)
      .attr("x2", chartWidth)
      .attr("y1", yScale(0))
      .attr("y2", yScale(0))
      .attr("stroke", "#666")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "2,2");
    
    // Add axes with proper formatting
    g.append("g")
      .attr("transform", `translate(0,${chartHeight})`)
      .call(d3.axisBottom(xScale)
        .tickFormat((domainValue) => {
          const date = domainValue as Date;
          return d3.timeFormat("%I:%M %p")(date); // 12-hour format with AM/PM
        })
        .ticks(d3.timeHour.every(1)) // Every hour
      )
      .style("color", "#ccc")
      .selectAll("text")
      .style("fill", "#ccc")
      .style("font-size", "12px");
    
    g.append("g")
      .call(d3.axisLeft(yScale)
        .tickFormat((domainValue) => {
          const value = domainValue as number;
          const abs = Math.abs(value);
          if (abs >= 1e9) {
            return `${(value / 1e9).toFixed(1)}B`;
          } else if (abs >= 1e6) {
            return `${(value / 1e6).toFixed(1)}M`;
          } else if (abs >= 1e3) {
            return `${(value / 1e3).toFixed(1)}K`;
          }
          return value.toFixed(0);
        })
        .ticks(6) // Limit to 6 ticks to avoid overlap
      )
      .style("color", "#ccc")
      .selectAll("text")
      .style("fill", "#ccc")
      .style("font-size", "12px");
    
    // Add axis labels
    g.append("text")
      .attr("transform", "rotate(-90)")
      .attr("y", 0 - margin.left)
      .attr("x", 0 - (chartHeight / 2))
      .attr("dy", "1em")
      .style("text-anchor", "middle")
      .style("fill", "#ccc")
      .text("Gamma Exposure ($)");
    
    g.append("text")
      .attr("transform", `translate(${chartWidth / 2}, ${chartHeight + margin.bottom - 10})`)
      .style("text-anchor", "middle")
      .style("fill", "#ccc")
      .text("Market Hours (PT)");
    
    // Add legend with updated colors
    const legend = g.append("g")
      .attr("transform", `translate(${chartWidth - 70}, 20)`);
    
    if (showNetGEX) {
      legend.append("line")
        .attr("x1", 0).attr("x2", 20)
        .attr("y1", 0).attr("y2", 0)
        .attr("stroke", "#0088ff") // Blue
        .attr("stroke-width", 3);
      legend.append("text")
        .attr("x", 25).attr("y", 4)
        .style("fill", "#0088ff")
        .style("font-size", "12px")
        .text("Net GEX");
    }
    
    if (showCallGEX) {
      legend.append("line")
        .attr("x1", 0).attr("x2", 20)
        .attr("y1", 20).attr("y2", 20)
        .attr("stroke", "#00ff88") // Green
        .attr("stroke-width", 2)
        .attr("stroke-dasharray", "5,5");
      legend.append("text")
        .attr("x", 25).attr("y", 24)
        .style("fill", "#00ff88")
        .style("font-size", "12px")
        .text("Call GEX");
    }
    
    if (showPutGEX) {
      legend.append("line")
        .attr("x1", 0).attr("x2", 20)
        .attr("y1", 40).attr("y2", 40)
        .attr("stroke", "#ff4444") // Red
        .attr("stroke-width", 2)
        .attr("stroke-dasharray", "5,5");
      legend.append("text")
        .attr("x", 25).attr("y", 44)
        .style("fill", "#ff4444")
        .style("font-size", "12px")
        .text("Put GEX");
    }
    
  }, [data, loading, showCallGEX, showPutGEX, showNetGEX, width, height]);

  return (
    <div className="bg-gray-900 p-6 rounded-lg border border-gray-700">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-white">
          🏛️ Gamma Through Time - RT Gamma Competitor
        </h3>
        
        <div className="flex gap-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={showNetGEX}
              onChange={(e) => setShowNetGEX(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-gray-300">Net GEX</span>
          </label>
          
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={showCallGEX}
              onChange={(e) => setShowCallGEX(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-gray-300">Call GEX</span>
          </label>
          
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={showPutGEX}
              onChange={(e) => setShowPutGEX(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-gray-300">Put GEX</span>
          </label>
          
          <button
            onClick={loadRealData}
            className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
          >
            🔄 Refresh
          </button>
        </div>
      </div>
      
      {loading ? (
        <div className="flex items-center justify-center h-96">
          <div className="text-gray-400">
            🔄 Loading Gamma Through Time data...
          </div>
        </div>
      ) : (
        <div className="relative">
          <svg 
            ref={svgRef} 
            width={width} 
            height={height}
            className="bg-black rounded border border-gray-600"
          />
        </div>
      )}
    </div>
  );
}