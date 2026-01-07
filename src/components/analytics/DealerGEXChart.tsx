'use client';

import React, { useState, useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface GEXData {
  strike: number;
  gammaExposure: number;
  premium: number;
  type: 'call' | 'put';
}

interface DealerGEXChartProps {
  selectedTicker: string;
  selectedExpiration?: string;
  hideExpirationSelector?: boolean;
  hideAllControls?: boolean;
  compactMode?: boolean;
  chartWidth?: number;
  // Controlled props from unified bar
  gexViewMode?: 'gex' | 'premium';
  showPositiveGamma?: boolean;
  showNegativeGamma?: boolean;
  showNetGamma?: boolean;
  showAttrax?: boolean; // AI button triggers Attrax detection
  expectedRange90?: { call: number, put: number } | null;
}

export default function DealerGEXChart({
  selectedTicker,
  selectedExpiration: propExpiration,
  hideExpirationSelector = false,
  hideAllControls = false,
  compactMode = false,
  chartWidth = 1120,
  gexViewMode: propViewMode,
  showPositiveGamma: propShowPositiveGamma,
  showNegativeGamma: propShowNegativeGamma,
  showNetGamma: propShowNetGamma,
  showAttrax: propShowAttrax,
  expectedRange90
}: DealerGEXChartProps) {
  const [selectedExpiration, setSelectedExpiration] = useState<string>(propExpiration || '');
  const [expirationDates, setExpirationDates] = useState<string[]>([]);
  const [data, setData] = useState<GEXData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  const [viewMode, setViewMode] = useState<'gex' | 'premium'>(propViewMode || 'gex');
  const [showPositiveGamma, setShowPositiveGamma] = useState<boolean>(propShowPositiveGamma ?? true);
  const [showNegativeGamma, setShowNegativeGamma] = useState<boolean>(propShowNegativeGamma ?? true);
  const [showNetGamma, setShowNetGamma] = useState<boolean>(propShowNetGamma ?? true);
  const [zoomTransform, setZoomTransform] = useState<any>(null);

  // Attrax detection state
  const [attraxPoints, setAttraxPoints] = useState<Array<{
    strikes: number[],
    values: number[],
    peakStrike: number,
    peakValue: number,
    direction: 'up' | 'down'
  }>>([]);

  // Sync controlled props
  useEffect(() => {
    if (propViewMode !== undefined) setViewMode(propViewMode);
  }, [propViewMode]);
  useEffect(() => {
    if (propShowPositiveGamma !== undefined) setShowPositiveGamma(propShowPositiveGamma);
  }, [propShowPositiveGamma]);
  useEffect(() => {
    if (propShowNegativeGamma !== undefined) setShowNegativeGamma(propShowNegativeGamma);
  }, [propShowNegativeGamma]);
  useEffect(() => {
    if (propShowNetGamma !== undefined) setShowNetGamma(propShowNetGamma);
  }, [propShowNetGamma]);

  // Trigger Attrax detection when AI button is activated
  useEffect(() => {
    if (propShowAttrax && showNetGamma && data.length > 0) {
      detectAttrax();
    } else {
      setAttraxPoints([]);
    }
  }, [propShowAttrax, showNetGamma, data]);

  const svgRef = useRef<SVGSVGElement>(null);

  // Attrax Detection Function - detects 3-5 consecutive strikes with 10%+ increase
  const detectAttrax = () => {
    if (!data || data.length === 0 || !showNetGamma) {
      setAttraxPoints([]);
      return;
    }

    const attraxDetections: Array<{
      strikes: number[],
      values: number[],
      peakStrike: number,
      peakValue: number,
      direction: 'up' | 'down'
    }> = [];

    // Calculate net GEX for each strike
    const netGexByStrike = new Map<number, number>();
    data.forEach(d => {
      const currentNet = netGexByStrike.get(d.strike) || 0;
      netGexByStrike.set(d.strike, currentNet + d.gammaExposure);
    });

    const uniqueStrikes = Array.from(netGexByStrike.keys()).sort((a, b) => a - b);

    // Scan for increasing sequences (3-5 strikes with 10%+ increase each)
    for (let i = 0; i < uniqueStrikes.length; i++) {
      const firstValue = netGexByStrike.get(uniqueStrikes[i]) || 0;

      // Skip if first value is too small (noise threshold)
      if (Math.abs(firstValue) < 1000000) continue; // 1M threshold

      const sequence: number[] = [uniqueStrikes[i]];
      const values: number[] = [firstValue];

      // Determine if we're looking for positive growth or negative growth (more negative)
      const isPositiveSequence = firstValue >= 0;

      // Try to build a sequence of 3-5 strikes
      for (let j = i + 1; j < uniqueStrikes.length && sequence.length < 5; j++) {
        const prevValue = values[values.length - 1];
        const currentValue = netGexByStrike.get(uniqueStrikes[j]) || 0;

        let isIncreasing = false;

        if (isPositiveSequence) {
          // For positive sequences: current should be >= prev * 1.1 (can cross from negative to positive)
          // Examples: 10 -> 14, -10 -> 0 -> 12
          if (prevValue >= 0) {
            isIncreasing = currentValue >= prevValue * 1.1;
          } else {
            // Transitioning from negative: either getting less negative or crossing to positive
            isIncreasing = currentValue >= prevValue * 1.1 || (currentValue >= 0 && Math.abs(prevValue) * 1.1 <= Math.abs(currentValue));
          }
        } else {
          // For negative sequences: current should be <= prev * 1.1 (more negative)
          // Examples: -10 -> -14 -> -19
          isIncreasing = currentValue <= prevValue * 1.1 && currentValue < 0;
        }

        if (isIncreasing) {
          sequence.push(uniqueStrikes[j]);
          values.push(currentValue);
        } else {
          break; // Sequence broken
        }
      }

      // Valid attrax if we have 3-5 strikes
      if (sequence.length >= 3 && sequence.length <= 5) {
        const peakStrike = sequence[sequence.length - 1];
        const peakValue = values[values.length - 1];
        const firstStrike = sequence[0];
        const firstValue = values[0];

        // Direction validation relative to current price:
        // The sequence strikes can go up or down, what matters is:
        // - Above current price: need positive/increasing GEX values
        // - Below current price: need negative/decreasing GEX values (more negative)
        if (currentPrice > 0) {
          const avgStrike = sequence.reduce((sum, s) => sum + s, 0) / sequence.length;
          const isAbovePrice = avgStrike > currentPrice;

          // Above price: need positive final GEX (attraction pulling up)
          if (isAbovePrice && peakValue < 0) {
            continue;
          }

          // Below price: need negative final GEX (attraction pulling down)
          if (!isAbovePrice && peakValue > 0) {
            continue;
          }
        }

        // Filter to 90% expected range with exception:
        // If at least one strike is within the range, allow the sequence
        if (expectedRange90) {
          const { call: call90, put: put90 } = expectedRange90;
          const hasStrikeInRange = sequence.some(strike => strike >= put90 && strike <= call90);

          if (!hasStrikeInRange) {
            continue; // Skip this sequence
          }
        }

        // Determine direction based on peak value sign
        const direction: 'up' | 'down' = peakValue >= 0 ? 'up' : 'down';

        attraxDetections.push({
          strikes: sequence,
          values: values,
          peakStrike,
          peakValue,
          direction
        });

        // Skip ahead to avoid overlapping sequences
        i = i + sequence.length - 1;
      }
    }

    setAttraxPoints(attraxDetections);
  };

  // Sync with prop changes
  useEffect(() => {
    if (propExpiration && propExpiration !== selectedExpiration) {
      setSelectedExpiration(propExpiration);
    }
  }, [propExpiration]);

  /**
   * Calculate Gamma Exposure (GEX)
   */
  const calculateGammaExposure = (
    openInterest: number,
    spot: number,
    polygonGamma?: number,
    contractType: 'call' | 'put' = 'call'
  ): number => {
    if (!polygonGamma || isNaN(polygonGamma)) return 0;

    const absGamma = Math.abs(polygonGamma);
    if (absGamma > 1.0 || absGamma < 0.000001) return 0;

    let gex = polygonGamma * openInterest * 100 * spot * spot;

    // Dealer perspective: puts are negative gamma
    if (contractType === 'put') {
      gex = -gex;
    }

    return gex;
  };

  // Fetch available expiration dates
  useEffect(() => {
    if (!selectedTicker) return;

    const fetchExpirations = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/dealer-options-premium?ticker=${selectedTicker}`, { cache: 'no-store' });
        const result = await response.json();

        if (result.success && result.data) {
          const dates = Object.keys(result.data).sort();
          setExpirationDates(dates);

          if (result.currentPrice) {
            setCurrentPrice(result.currentPrice);
          }

          if (dates.length > 0 && !selectedExpiration) {
            setSelectedExpiration(dates[0]);
          }
        } else {
          setError('No data received from API');
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

  // Fetch GEX data for selected expiration
  useEffect(() => {
    if (!selectedTicker || !selectedExpiration) return;

    const fetchGEXData = async () => {
      try {
        setLoading(true);
        setError('');

        // Handle "all-expirations" aggregation (all expiration dates)
        if (selectedExpiration === 'all-expirations') {
          const response = await fetch(`/api/dealer-options-premium?ticker=${selectedTicker}`);
          const result = await response.json();

          if (result.success && result.data) {
            const today = new Date();
            const spotPrice = result.currentPrice || 0;

            if (spotPrice) {
              setCurrentPrice(spotPrice);
            }

            // Get all future expirations (no date filtering)
            const validExpirations = Object.keys(result.data).filter(exp => {
              const expDate = new Date(exp + 'T16:00:00');
              return expDate >= today;
            });

            if (validExpirations.length === 0) {
              setError('No future expirations');
              setLoading(false);
              return;
            }

            // Aggregate GEX data from all valid expirations
            const strikeMap = new Map<number, {
              callGEX: number;
              putGEX: number;
              callPremium: number;
              putPremium: number
            }>();

            validExpirations.forEach(exp => {
              const expirationData = result.data[exp];

              // Process calls
              if (expirationData.calls) {
                Object.entries(expirationData.calls).forEach(([strike, callData]: [string, any]) => {
                  const strikeNum = parseFloat(strike);
                  const openInterest = callData.open_interest || 0;
                  const gamma = callData.greeks?.gamma || 0;
                  const midPrice = ((callData.bid || 0) + (callData.ask || 0)) / 2;
                  const premium = openInterest * midPrice * 100;
                  const gex = calculateGammaExposure(openInterest, spotPrice, gamma, 'call');

                  if (!strikeMap.has(strikeNum)) {
                    strikeMap.set(strikeNum, { callGEX: 0, putGEX: 0, callPremium: 0, putPremium: 0 });
                  }
                  const entry = strikeMap.get(strikeNum)!;
                  entry.callGEX += gex;
                  entry.callPremium += premium;
                });
              }

              // Process puts
              if (expirationData.puts) {
                Object.entries(expirationData.puts).forEach(([strike, putData]: [string, any]) => {
                  const strikeNum = parseFloat(strike);
                  const openInterest = putData.open_interest || 0;
                  const gamma = putData.greeks?.gamma || 0;
                  const midPrice = ((putData.bid || 0) + (putData.ask || 0)) / 2;
                  const premium = openInterest * midPrice * 100;
                  const gex = calculateGammaExposure(openInterest, spotPrice, gamma, 'put');

                  if (!strikeMap.has(strikeNum)) {
                    strikeMap.set(strikeNum, { callGEX: 0, putGEX: 0, callPremium: 0, putPremium: 0 });
                  }
                  const entry = strikeMap.get(strikeNum)!;
                  entry.putGEX += gex;
                  entry.putPremium += premium;
                });
              }
            });

            // Convert to chart format based on display mode
            const chartData: GEXData[] = [];
            strikeMap.forEach((value, strike) => {
              if (showNetGamma) {
                // Net GEX mode: combine call and put into single net value
                const netGEX = value.callGEX + value.putGEX; // putGEX already negative
                const netPremium = value.callPremium + Math.abs(value.putPremium);
                if (netGEX !== 0) {
                  chartData.push({
                    strike,
                    gammaExposure: netGEX,
                    premium: netPremium,
                    type: netGEX >= 0 ? 'call' : 'put'
                  });
                }
              } else {
                // Separate modes: create individual call/put entries
                if (showPositiveGamma && value.callGEX > 0) {
                  chartData.push({
                    strike,
                    gammaExposure: value.callGEX,
                    premium: value.callPremium,
                    type: 'call'
                  });
                }
                if (showNegativeGamma && value.putGEX < 0) {
                  chartData.push({
                    strike,
                    gammaExposure: value.putGEX,
                    premium: value.putPremium,
                    type: 'put'
                  });
                }
              }
            });

            setData(chartData);
          } else {
            setError('Failed to fetch data');
          }
          setLoading(false);
          return;
        }

        // Handle \"45-days\" aggregation
        if (selectedExpiration === '45-days') {
          const response = await fetch(`/api/dealer-options-premium?ticker=${selectedTicker}`);
          const result = await response.json();

          if (result.success && result.data) {
            const today = new Date();
            const fortyFiveDaysFromNow = new Date(today.getTime() + 45 * 24 * 60 * 60 * 1000);
            const spotPrice = result.currentPrice || 0;

            if (spotPrice) {
              setCurrentPrice(spotPrice);
            }

            // Filter expirations within 45 days
            const validExpirations = Object.keys(result.data).filter(exp => {
              const expDate = new Date(exp + 'T16:00:00');
              return expDate >= today && expDate <= fortyFiveDaysFromNow;
            });

            if (validExpirations.length === 0) {
              setError('No expirations within 45 days');
              setLoading(false);
              return;
            }

            // Aggregate GEX data from all valid expirations
            const strikeMap = new Map<number, {
              callGEX: number;
              putGEX: number;
              callPremium: number;
              putPremium: number
            }>();

            validExpirations.forEach(exp => {
              const expirationData = result.data[exp];

              // Process calls
              if (expirationData.calls) {
                Object.entries(expirationData.calls).forEach(([strike, callData]: [string, any]) => {
                  const strikeNum = parseFloat(strike);
                  const openInterest = callData.open_interest || 0;
                  const gamma = callData.greeks?.gamma || 0;
                  const midPrice = ((callData.bid || 0) + (callData.ask || 0)) / 2;
                  const premium = openInterest * midPrice * 100;
                  const gex = calculateGammaExposure(openInterest, spotPrice, gamma, 'call');

                  if (!strikeMap.has(strikeNum)) {
                    strikeMap.set(strikeNum, { callGEX: 0, putGEX: 0, callPremium: 0, putPremium: 0 });
                  }
                  const entry = strikeMap.get(strikeNum)!;
                  entry.callGEX += gex;
                  entry.callPremium += premium;
                });
              }

              // Process puts
              if (expirationData.puts) {
                Object.entries(expirationData.puts).forEach(([strike, putData]: [string, any]) => {
                  const strikeNum = parseFloat(strike);
                  const openInterest = putData.open_interest || 0;
                  const gamma = putData.greeks?.gamma || 0;
                  const midPrice = ((putData.bid || 0) + (putData.ask || 0)) / 2;
                  const premium = openInterest * midPrice * 100;
                  const gex = calculateGammaExposure(openInterest, spotPrice, gamma, 'put');

                  if (!strikeMap.has(strikeNum)) {
                    strikeMap.set(strikeNum, { callGEX: 0, putGEX: 0, callPremium: 0, putPremium: 0 });
                  }
                  const entry = strikeMap.get(strikeNum)!;
                  entry.putGEX += gex;
                  entry.putPremium += premium;
                });
              }
            });

            // Convert to chart format based on display mode
            const chartData: GEXData[] = [];
            strikeMap.forEach((value, strike) => {
              if (showNetGamma) {
                // Net GEX mode: combine call and put into single net value
                const netGEX = value.callGEX + value.putGEX; // putGEX already negative
                const netPremium = value.callPremium + Math.abs(value.putPremium);
                if (netGEX !== 0) {
                  chartData.push({
                    strike,
                    gammaExposure: netGEX,
                    premium: netPremium,
                    type: netGEX >= 0 ? 'call' : 'put'
                  });
                }
              } else {
                // Separate modes: create individual call/put entries
                if (showPositiveGamma && value.callGEX > 0) {
                  chartData.push({
                    strike,
                    gammaExposure: value.callGEX,
                    premium: value.callPremium,
                    type: 'call'
                  });
                }
                if (showNegativeGamma && value.putGEX < 0) {
                  chartData.push({
                    strike,
                    gammaExposure: value.putGEX,
                    premium: value.putPremium,
                    type: 'put'
                  });
                }
              }
            });

            setData(chartData);
          } else {
            setError('Failed to fetch data');
          }
          setLoading(false);
          return;
        }

        // Normal single expiration fetch
        const response = await fetch(`/api/dealer-options-premium?ticker=${selectedTicker}&expiration=${selectedExpiration}`, { cache: 'no-store' });
        const result = await response.json();

        if (result.success && result.data && result.data[selectedExpiration]) {
          if (result.currentPrice) {
            setCurrentPrice(result.currentPrice);
          }

          const expirationData = result.data[selectedExpiration];
          const chartData: GEXData[] = [];
          const strikeMap = new Map<number, {
            callGEX: number;
            putGEX: number;
            callPremium: number;
            putPremium: number
          }>();

          const spotPrice = result.currentPrice || 0;

          // Process calls
          if (expirationData.calls) {
            Object.entries(expirationData.calls).forEach(([strike, callData]: [string, any]) => {
              const strikeNum = parseFloat(strike);
              const openInterest = callData.open_interest || 0;
              const gamma = callData.greeks?.gamma || 0;
              const midPrice = ((callData.bid || 0) + (callData.ask || 0)) / 2;
              const premium = openInterest * midPrice * 100;
              const gex = calculateGammaExposure(openInterest, spotPrice, gamma, 'call');

              if (!strikeMap.has(strikeNum)) {
                strikeMap.set(strikeNum, { callGEX: 0, putGEX: 0, callPremium: 0, putPremium: 0 });
              }
              const entry = strikeMap.get(strikeNum)!;
              entry.callGEX = gex;
              entry.callPremium = premium;
            });
          }

          // Process puts
          if (expirationData.puts) {
            Object.entries(expirationData.puts).forEach(([strike, putData]: [string, any]) => {
              const strikeNum = parseFloat(strike);
              const openInterest = putData.open_interest || 0;
              const gamma = putData.greeks?.gamma || 0;
              const midPrice = ((putData.bid || 0) + (putData.ask || 0)) / 2;
              const premium = openInterest * midPrice * 100;
              const gex = calculateGammaExposure(openInterest, spotPrice, gamma, 'put');

              if (!strikeMap.has(strikeNum)) {
                strikeMap.set(strikeNum, { callGEX: 0, putGEX: 0, callPremium: 0, putPremium: 0 });
              }
              const entry = strikeMap.get(strikeNum)!;
              entry.putGEX = gex;
              entry.putPremium = premium;
            });
          }

          // Build chart data
          strikeMap.forEach((value, strike) => {
            if (showNetGamma) {
              const netGEX = value.callGEX + value.putGEX; // putGEX already negative
              const netPremium = value.callPremium + Math.abs(value.putPremium);
              if (netGEX !== 0) {
                chartData.push({
                  strike,
                  gammaExposure: netGEX,
                  premium: netPremium,
                  type: netGEX >= 0 ? 'call' : 'put'
                });
              }
            } else {
              if (showPositiveGamma && value.callGEX > 0) {
                chartData.push({
                  strike,
                  gammaExposure: value.callGEX,
                  premium: value.callPremium,
                  type: 'call'
                });
              }
              if (showNegativeGamma && value.putGEX < 0) {
                chartData.push({
                  strike,
                  gammaExposure: value.putGEX,
                  premium: value.putPremium,
                  type: 'put'
                });
              }
            }
          });

          setData(chartData.sort((a, b) => a.strike - b.strike));
        } else {
          setError('No GEX data available for this expiration');
        }
      } catch (err) {
        setError('Failed to fetch GEX data');
        console.error('Error fetching GEX data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchGEXData();
  }, [selectedTicker, selectedExpiration, showNetGamma, showPositiveGamma, showNegativeGamma]);

  // D3 Chart rendering
  useEffect(() => {
    if (!data.length || !svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const margin = { top: 50, right: 20, bottom: 60, left: 80 };
    const width = chartWidth - margin.left - margin.right;
    const height = 605 - margin.top - margin.bottom;

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

    const yValue = (d: GEXData) => viewMode === 'premium' ? d.premium : Math.abs(d.gammaExposure);

    const maxValue = d3.max(data, yValue) || 0;
    const minValue = viewMode === 'premium' ? 0 : d3.min(data, d => d.gammaExposure) || 0;

    // Add 20% padding to negative values so bars don't touch the X-axis
    const adjustedMinValue = minValue < 0 ? minValue * 1.2 : minValue;

    const yScale = d3
      .scaleLinear()
      .domain([adjustedMinValue < 0 ? adjustedMinValue : 0, maxValue])
      .range([height, 0]);

    // Dealer-focused color scheme - purple for positive gamma, orange for negative gamma
    const colorScale = (type: string) => type === 'call' ? '#a855f7' : '#ff6600';

    // Create zoom behavior for X-axis only
    const zoom = d3.zoom<Element, unknown>()
      .scaleExtent([1, 10])
      .filter((event) => {
        return !event.ctrlKey && !event.button;
      })
      .on('zoom', (event) => {
        const { transform } = event;
        setZoomTransform(transform);

        const newXScale = transform.rescaleX(d3.scaleLinear().domain([0, uniqueStrikes.length - 1]).range([0, width]));

        const startIndex = Math.max(0, Math.floor(newXScale.invert(0)));
        const endIndex = Math.min(uniqueStrikes.length - 1, Math.ceil(newXScale.invert(width)));

        const visibleStrikes = uniqueStrikes.slice(startIndex, endIndex + 1);
        const visibleData = data.filter(d => visibleStrikes.includes(d.strike));

        const maxVisibleValue = d3.max(visibleData, yValue) || 0;
        const minVisibleValue = viewMode === 'premium' ? 0 : d3.min(visibleData, d => d.gammaExposure) || 0;

        // Add 20% padding to negative values so bars don't touch the X-axis
        const adjustedMinVisibleValue = minVisibleValue < 0 ? minVisibleValue * 1.2 : minVisibleValue;

        const newYScale = d3.scaleLinear()
          .domain([adjustedMinVisibleValue < 0 ? adjustedMinVisibleValue : 0, maxVisibleValue])
          .range([height, 0]);

        const newXBandScale = d3.scaleBand()
          .domain(visibleStrikes.map(s => s.toString()))
          .range([0, width])
          .padding(0.2);

        container.selectAll('.bar')
          .style('display', (d: any) => visibleStrikes.includes(d.strike) ? 'block' : 'none')
          .attr('x', (d: any) => {
            if (!visibleStrikes.includes(d.strike)) return -1000;
            return newXBandScale(d.strike.toString()) || 0;
          })
          .attr('y', (d: any) => {
            if (viewMode === 'premium') {
              return newYScale(d.premium);
            } else {
              return d.gammaExposure >= 0 ? newYScale(d.gammaExposure) : newYScale(0);
            }
          })
          .attr('width', newXBandScale.bandwidth())
          .attr('height', (d: any) => {
            if (viewMode === 'premium') {
              return height - newYScale(d.premium);
            } else {
              return d.gammaExposure >= 0
                ? height - newYScale(d.gammaExposure) - (height - newYScale(0))
                : newYScale(d.gammaExposure) - newYScale(0);
            }
          });

        const maxVisibleLabels = 15;
        const visibleTickInterval = Math.max(1, Math.ceil(visibleStrikes.length / maxVisibleLabels));
        const filteredVisibleTicks = visibleStrikes.filter((_, index) => index % visibleTickInterval === 0);

        const customVisibleXAxis = d3.axisBottom(newXBandScale)
          .tickValues(filteredVisibleTicks.map(s => s.toString()));

        const xAxisUpdate = container.select('.x-axis') as d3.Selection<SVGGElement, unknown, null, undefined>;
        xAxisUpdate.call(customVisibleXAxis);

        xAxisUpdate.selectAll('text')
          .style('fill', '#ffaa00')
          .style('font-size', '14px')
          .style('font-weight', 'bold')
          .attr('transform', 'rotate(-35)')
          .style('text-anchor', 'end')
          .attr('dx', '-0.5em')
          .attr('dy', '0.5em');

        xAxisUpdate.selectAll('path, line')
          .style('stroke', '#ffaa00')
          .style('stroke-width', '2px');

        const yAxisFormat = (d: any) => {
          const value = Math.abs(d);
          if (value >= 1000000000) {
            return `${d >= 0 ? '' : '-'}${(Math.abs(d) / 1000000000).toFixed(1)}B`;
          } else if (value >= 1000000) {
            return `${d >= 0 ? '' : '-'}${(Math.abs(d) / 1000000).toFixed(1)}M`;
          } else if (value >= 1000) {
            return `${d >= 0 ? '' : '-'}${(Math.abs(d) / 1000).toFixed(0)}k`;
          } else {
            return d.toString();
          }
        };

        const yAxisUpdate = container.select('.y-axis') as d3.Selection<SVGGElement, unknown, null, undefined>;
        yAxisUpdate.call(d3.axisLeft(newYScale).tickFormat(yAxisFormat as any) as any);

        yAxisUpdate.selectAll('text')
          .style('fill', '#ffaa00')
          .style('font-size', '14px')
          .style('font-weight', 'bold');

        yAxisUpdate.selectAll('path, line')
          .style('stroke', '#ffaa00')
          .style('stroke-width', '2px');

        if (currentPrice > 0) {
          const currentPriceX = visibleStrikes.findIndex(strike => strike >= currentPrice);
          let xPosition;

          if (currentPriceX === -1) {
            xPosition = width;
          } else if (currentPriceX === 0) {
            xPosition = 0;
          } else {
            const lowerStrike = visibleStrikes[currentPriceX - 1];
            const upperStrike = visibleStrikes[currentPriceX];
            const ratio = (currentPrice - lowerStrike) / (upperStrike - lowerStrike);
            const lowerX = (newXBandScale(lowerStrike.toString()) || 0) + newXBandScale.bandwidth() / 2;
            const upperX = (newXBandScale(upperStrike.toString()) || 0) + newXBandScale.bandwidth() / 2;
            xPosition = lowerX + ratio * (upperX - lowerX);
          }

          container.select('.current-price-line')
            .attr('x1', xPosition)
            .attr('x2', xPosition);

          container.select('.current-price-label')
            .attr('x', xPosition);
        }

        // Update zero line position during zoom
        if (viewMode === 'gex') {
          container.select('.zero-line')
            .attr('y1', newYScale(0))
            .attr('y2', newYScale(0));
        }

        // Update Attrax structures position during zoom
        if (propShowAttrax && showNetGamma && attraxPoints.length > 0) {
          attraxPoints.forEach((pattern, patternIndex) => {
            const { strikes, values, peakStrike, peakValue } = pattern;

            // Check if strikes are in visible range
            const allStrikesVisible = strikes.every(s => visibleStrikes.includes(s));
            if (!allStrikesVisible) {
              overlayLayer.selectAll(`.attrax-curve-${patternIndex}, .attrax-icon-${patternIndex}`).style('display', 'none');
              return;
            }

            overlayLayer.selectAll(`.attrax-curve-${patternIndex}, .attrax-icon-${patternIndex}`).style('display', 'block');

            // Recalculate path points with new scale - connect at extreme point of each bar
            const pathPoints = strikes.map((strike, idx) => {
              const barX = newXBandScale(strike.toString()) || 0;
              const value = values[idx];
              // Connect at the value point (top for positive, bottom for negative)
              const yPos = newYScale(value) || 0;
              const xPos = barX;

              return { x: xPos, y: yPos };
            });

            const lineGenerator = d3.line<{ x: number; y: number }>()
              .x(d => d.x)
              .y(d => d.y);

            const pathData = lineGenerator(pathPoints);

            if (pathData) {
              overlayLayer.select(`.attrax-curve-${patternIndex}`)
                .attr('d', pathData);

              // Update icon position at center of bar
              const peakBarX = newXBandScale(peakStrike.toString()) || 0;
              const peakBarWidth = newXBandScale.bandwidth();
              const peakYPos = newYScale(peakValue) || 0;

              overlayLayer.select(`.attrax-icon-${patternIndex}`)
                .attr('transform', `translate(${peakBarX + peakBarWidth / 2}, ${peakYPos - 20})`);
            }
          });
        }
      });

    // Add zero line for GEX view
    if (viewMode === 'gex' && minValue < 0) {
      container.append('line')
        .attr('class', 'zero-line')
        .attr('x1', 0)
        .attr('x2', width)
        .attr('y1', yScale(0))
        .attr('y2', yScale(0))
        .style('stroke', '#ffaa00')
        .style('stroke-width', '2px');
    }

    // Add bars
    container.selectAll('.bar')
      .data(data)
      .enter()
      .append('rect')
      .attr('class', 'bar')
      .attr('x', d => xScale(d.strike.toString()) || 0)
      .attr('y', d => {
        if (viewMode === 'premium') {
          return yScale(d.premium);
        } else {
          return d.gammaExposure >= 0 ? yScale(d.gammaExposure) : yScale(0);
        }
      })
      .attr('width', xScale.bandwidth())
      .attr('height', d => {
        if (viewMode === 'premium') {
          return height - yScale(d.premium);
        } else {
          return d.gammaExposure >= 0
            ? height - yScale(d.gammaExposure) - (height - yScale(0))
            : yScale(d.gammaExposure) - yScale(0);
        }
      })
      .attr('fill', d => colorScale(d.type))
      .attr('opacity', 1)
      .style('cursor', 'pointer')
      .on('mouseover', function (event, d) {
        d3.select(this).attr('opacity', 1);

        const tooltip = container.append('g')
          .attr('class', 'tooltip')
          .attr('transform', `translate(${(xScale(d.strike.toString()) || 0) + xScale.bandwidth() / 2}, ${yScale(yValue(d)) - 10})`);

        const gexFormatted = (d.gammaExposure / 1000000).toFixed(2);
        const premiumFormatted = (d.premium / 1000000).toFixed(2);
        const text = `Strike: ${d.strike} | GEX: $${gexFormatted}M | Premium: $${premiumFormatted}M`;

        tooltip.append('rect')
          .attr('x', -text.length * 3.5)
          .attr('y', -20)
          .attr('width', text.length * 7)
          .attr('height', 25)
          .attr('fill', '#1a1a1a')
          .attr('stroke', colorScale(d.type))
          .attr('stroke-width', 2)
          .attr('rx', 4);

        tooltip.append('text')
          .attr('text-anchor', 'middle')
          .attr('y', -5)
          .style('fill', colorScale(d.type))
          .style('font-size', '12px')
          .style('font-weight', 'bold')
          .text(text);
      })
      .on('mouseout', function () {
        d3.select(this).attr('opacity', 1);
        container.selectAll('.tooltip').remove();
      });

    // Add current price line
    if (currentPrice > 0) {
      const priceIndex = uniqueStrikes.findIndex(s => s >= currentPrice);
      if (priceIndex !== -1) {
        const xPos = (xScale(uniqueStrikes[priceIndex].toString()) || 0) + xScale.bandwidth() / 2;

        container.append('line')
          .attr('class', 'current-price-line')
          .attr('x1', xPos)
          .attr('x2', xPos)
          .attr('y1', 0)
          .attr('y2', height)
          .style('stroke', '#ffaa00')
          .style('stroke-width', '3px')
          .style('stroke-dasharray', '8,4');

        container.append('text')
          .attr('class', 'current-price-label')
          .attr('x', xPos + 5)
          .attr('y', -10)
          .style('fill', '#ffaa00')
          .style('font-size', '14px')
          .style('font-weight', 'bold')
          .text(`Current: $${currentPrice.toFixed(2)}`);
      }
    }

    // X-axis
    const maxLabels = 15;
    const tickInterval = Math.max(1, Math.ceil(uniqueStrikes.length / maxLabels));
    const filteredTicks = uniqueStrikes.filter((_, index) => index % tickInterval === 0);

    const xAxis = d3.axisBottom(xScale)
      .tickValues(filteredTicks.map(s => s.toString()));

    container.append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,${height})`)
      .call(xAxis)
      .selectAll('text')
      .style('fill', '#cc3300')
      .style('font-size', '14px')
      .style('font-weight', 'bold')
      .attr('transform', 'rotate(-35)')
      .style('text-anchor', 'end')
      .attr('dx', '-0.5em')
      .attr('dy', '0.5em');

    container.selectAll('.x-axis path, .x-axis line')
      .style('stroke', '#cc3300')
      .style('stroke-width', '2px');

    // Y-axis
    const yAxisFormat = (d: any) => {
      const value = Math.abs(d);
      if (value >= 1000000000) {
        return `${d >= 0 ? '' : '-'}${(Math.abs(d) / 1000000000).toFixed(1)}B`;
      } else if (value >= 1000000) {
        return `${d >= 0 ? '' : '-'}${(Math.abs(d) / 1000000).toFixed(1)}M`;
      } else if (value >= 1000) {
        return `${d >= 0 ? '' : '-'}${(Math.abs(d) / 1000).toFixed(0)}k`;
      } else {
        return d.toString();
      }
    };

    const yAxis = d3.axisLeft(yScale).tickFormat(yAxisFormat as any);

    container.append('g')
      .attr('class', 'y-axis')
      .call(yAxis)
      .selectAll('text')
      .style('fill', '#cc3300')
      .style('font-size', '14px')
      .style('font-weight', 'bold');

    container.selectAll('.y-axis path, .y-axis line')
      .style('stroke', '#cc3300')
      .style('stroke-width', '2px');

    // Y-axis label
    container.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -height / 2)
      .attr('y', -60)
      .attr('text-anchor', 'middle')
      .style('fill', '#ffaa00')
      .style('font-size', '16px')
      .style('font-weight', 'bold')
      .text(viewMode === 'premium' ? 'Gamma Premium ($)' : 'Gamma Exposure (GEX)');

    // Create overlay layer for Attrax (not affected by zoom)
    const overlayLayer = svg
      .append('g')
      .attr('class', 'attrax-overlay-layer')
      .attr('transform', `translate(${margin.left},${margin.top})`)
      .style('pointer-events', 'none');

    // Draw Attrax parabolic curves and magnet emojis in overlay layer (Net GEX mode only, when AI button is on)
    if (propShowAttrax && attraxPoints.length > 0 && showNetGamma) {
      attraxPoints.forEach((pattern, patternIndex) => {
        const { strikes, values, peakStrike, peakValue, direction } = pattern;

        // Build path data points - connect at the top of each bar
        const pathPoints = strikes.map((strike, idx) => {
          const barX = xScale(strike.toString()) || 0;
          const value = values[idx];

          // For positive values: top of bar is at yScale(value)
          // For negative values: top of bar is at yScale(0), bottom is at yScale(value)
          // We want to connect at the actual extreme point (top for positive, bottom for negative)
          const yPos = value >= 0 ? yScale(value) : yScale(value);

          // X position at left corner of bar
          const xPos = barX;

          return { x: xPos, y: yPos };
        });

        // Create straight line connecting the points
        const lineGenerator = d3.line<{ x: number; y: number }>()
          .x(d => d.x)
          .y(d => d.y);

        const pathData = lineGenerator(pathPoints);

        if (pathData) {
          // Draw the parabolic curve
          overlayLayer.append('path')
            .attr('class', `attrax-curve attrax-curve-${patternIndex}`)
            .attr('d', pathData)
            .style('fill', 'none')
            .style('stroke', peakValue > 0 ? '#00ff88' : '#ff0088')
            .style('stroke-width', '3px')
            .style('stroke-dasharray', '5,3')
            .style('opacity', 0.8);

          // Add animated attraction icon at peak (centered on bar)
          const peakBarX = xScale(peakStrike.toString()) || 0;
          const peakBarWidth = xScale.bandwidth();
          const peakYPos = yScale(peakValue) || 0;

          // Create animated icon group
          const iconGroup = overlayLayer.append('g')
            .attr('class', `attrax-icon attrax-icon-${patternIndex}`)
            .attr('transform', `translate(${peakBarX + peakBarWidth / 2}, ${peakYPos - 20})`);

          // Outer pulsing ring - orange
          iconGroup.append('circle')
            .attr('r', 10)
            .attr('fill', 'none')
            .attr('stroke', '#ff8800')
            .attr('stroke-width', 2.5)
            .attr('opacity', 0.8)
            .append('animate')
            .attr('attributeName', 'r')
            .attr('values', '10;14;10')
            .attr('dur', '2s')
            .attr('repeatCount', 'indefinite');

          // Middle ring - blue
          iconGroup.append('circle')
            .attr('r', 7)
            .attr('fill', 'none')
            .attr('stroke', '#0088ff')
            .attr('stroke-width', 2)
            .attr('opacity', 0.7)
            .append('animate')
            .attr('attributeName', 'opacity')
            .attr('values', '0.7;1;0.7')
            .attr('dur', '2s')
            .attr('repeatCount', 'indefinite');

          // Center with gradient - orange to blue
          const gradientId = `attrax-grad-${patternIndex}`;
          const defs = iconGroup.append('defs');
          const gradient = defs.append('radialGradient')
            .attr('id', gradientId);

          gradient.append('stop')
            .attr('offset', '0%')
            .attr('stop-color', '#ff8800');

          gradient.append('stop')
            .attr('offset', '100%')
            .attr('stop-color', '#0088ff');

          iconGroup.append('circle')
            .attr('r', 5)
            .attr('fill', `url(#${gradientId})`);

          // Magnetic field lines radiating out - alternating colors
          const fieldLines = [
            { angle: 0, color: '#ff8800', delay: '0s' },
            { angle: 90, color: '#0088ff', delay: '0.5s' },
            { angle: 180, color: '#ff8800', delay: '1s' },
            { angle: 270, color: '#0088ff', delay: '1.5s' }
          ];

          fieldLines.forEach(({ angle, color, delay }) => {
            const rad = (angle * Math.PI) / 180;
            const x1 = Math.cos(rad) * 4;
            const y1 = Math.sin(rad) * 4;
            const x2 = Math.cos(rad) * 11;
            const y2 = Math.sin(rad) * 11;

            iconGroup.append('line')
              .attr('x1', x1)
              .attr('y1', y1)
              .attr('x2', x2)
              .attr('y2', y2)
              .attr('stroke', color)
              .attr('stroke-width', 2)
              .attr('stroke-linecap', 'round')
              .attr('opacity', 0.8)
              .append('animate')
              .attr('attributeName', 'opacity')
              .attr('values', '0.8;0.2;0.8')
              .attr('dur', '2s')
              .attr('begin', delay)
              .attr('repeatCount', 'indefinite');
          });
        }
      });
    }

    // Add zoom rectangle AFTER all other elements
    const zoomRect = svg
      .append('rect')
      .attr('class', 'zoom-overlay')
      .attr('x', margin.left)
      .attr('y', margin.top)
      .attr('width', width)
      .attr('height', height)
      .style('fill', 'none')
      .style('pointer-events', 'all')
      .style('cursor', 'grab');

    // Apply zoom behavior to the entire SVG
    svg.call(zoom as any);

    // Apply existing zoom transform if it exists (but don't trigger re-render)
    if (zoomTransform) {
      svg.call(zoom.transform as any, zoomTransform);
    }

  }, [data, currentPrice, viewMode, propShowAttrax, attraxPoints, showNetGamma]);

  return (
    <div className="bg-black border-2 border-orange-500 rounded-lg p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">

        {/* View Mode Toggle - Hidden when controls are in unified bar */}
        {!hideAllControls && (
          <div className="flex gap-3">
            <button
              onClick={() => setViewMode('gex')}
              className={`px-4 py-2 font-bold text-sm uppercase tracking-wider rounded-lg transition-all ${viewMode === 'gex'
                  ? 'bg-orange-600 text-white border-2 border-orange-500'
                  : 'bg-gray-900 text-orange-400 border-2 border-gray-700 hover:border-orange-500'
                }`}
            >
              GEX
            </button>
            <button
              onClick={() => setViewMode('premium')}
              className={`px-4 py-2 font-bold text-sm uppercase tracking-wider rounded-lg transition-all ${viewMode === 'premium'
                  ? 'bg-orange-600 text-white border-2 border-orange-500'
                  : 'bg-gray-900 text-orange-400 border-2 border-gray-700 hover:border-orange-500'
                }`}
            >
              Premium ($)
            </button>
          </div>
        )}
      </div>

      {/* Control Bar */}
      {!hideAllControls && (
        <div style={{
          display: 'flex',
          flexDirection: 'row',
          flexWrap: 'nowrap',
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
          position: 'relative' as const,
          zIndex: 100,
          transform: 'translateZ(0)',
          backdropFilter: 'blur(20px)',
          overflow: 'visible' as const
        }}>
          {/* 3D Highlight Effect */}
          <div style={{
            position: 'absolute' as const,
            top: '1px',
            left: '1px',
            right: '1px',
            height: '50%',
            background: 'rgba(255, 255, 255, 0.05)',
            borderRadius: '12px 12px 0 0',
            pointerEvents: 'none' as const
          }} />

          {/* Expiration Selector - only show if not hidden */}
          {!hideExpirationSelector && (
            <>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                zIndex: 1
              }}>
                <label style={{
                  color: '#ffffff',
                  fontSize: '13px',
                  fontWeight: '600',
                  letterSpacing: '0.5px',
                  textTransform: 'uppercase' as const,
                  textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)'
                }}>
                  Expiry
                </label>
                <select
                  value={selectedExpiration}
                  onChange={(e) => setSelectedExpiration(e.target.value)}
                  style={{
                    background: '#000000',
                    border: '1px solid #333333',
                    borderRadius: '8px',
                    color: '#ffffff',
                    padding: '10px 14px',
                    fontSize: '14px',
                    fontWeight: '500',
                    minWidth: '160px',
                    outline: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    fontFamily: '"SF Pro Display", -apple-system, BlinkMacSystemFont, sans-serif',
                    boxShadow: `
                  inset 0 2px 4px rgba(0, 0, 0, 0.6),
                  inset 0 -1px 0 rgba(255, 255, 255, 0.05),
                  0 1px 0 rgba(255, 255, 255, 0.1)
                `,
                    textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)'
                  }}
                >
                  {expirationDates.map(date => (
                    <option key={date} value={date} style={{ background: '#000000', color: '#ffffff' }}>
                      {new Date(date).toLocaleDateString()}
                    </option>
                  ))}
                </select>
              </div>

              {/* Divider */}
              <div style={{
                width: '1px',
                height: '32px',
                background: 'linear-gradient(180deg, transparent 0%, #555 50%, transparent 100%)',
                boxShadow: '1px 0 0 rgba(255, 255, 255, 0.05)'
              }} />
            </>
          )}

          {/* Gamma Filter Dropdown */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginLeft: 'auto',
            zIndex: 1
          }}>
            <select
              value={showNetGamma ? 'net' : showPositiveGamma && showNegativeGamma ? 'both' : showPositiveGamma ? 'positive' : 'negative'}
              onChange={(e) => {
                const value = e.target.value;
                if (value === 'net') {
                  setShowNetGamma(true);
                  setShowPositiveGamma(false);
                  setShowNegativeGamma(false);
                } else if (value === 'both') {
                  setShowNetGamma(false);
                  setShowPositiveGamma(true);
                  setShowNegativeGamma(true);
                } else if (value === 'positive') {
                  setShowNetGamma(false);
                  setShowPositiveGamma(true);
                  setShowNegativeGamma(false);
                } else if (value === 'negative') {
                  setShowNetGamma(false);
                  setShowPositiveGamma(false);
                  setShowNegativeGamma(true);
                }
              }}
              style={{
                background: '#000000',
                border: '1px solid #333333',
                borderRadius: '8px',
                color: '#ffffff',
                padding: '10px 14px',
                fontSize: '14px',
                fontWeight: '500',
                minWidth: '180px',
                outline: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                fontFamily: '"SF Pro Display", -apple-system, BlinkMacSystemFont, sans-serif',
                boxShadow: `
                inset 0 2px 4px rgba(0, 0, 0, 0.6),
                inset 0 -1px 0 rgba(255, 255, 255, 0.05),
                0 1px 0 rgba(255, 255, 255, 0.1)
              `,
                textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)'
              }}
            >
              <option value="both" style={{ background: '#000000', color: '#ffffff' }}>Positive + Negative</option>
              <option value="positive" style={{ background: '#000000', color: '#ffffff' }}>Positive Only</option>
              <option value="negative" style={{ background: '#000000', color: '#ffffff' }}>Negative Only</option>
              <option value="net" style={{ background: '#000000', color: '#ffffff' }}>Net GEX</option>
            </select>
          </div>
        </div>
      )}

      {/* Chart */}
      {loading ? (
        <div className="flex items-center justify-center h-[605px]">
          <div className="text-orange-400 text-lg font-bold animate-pulse">Loading...</div>
        </div>
      ) : error ? (
        <div className="flex items-center justify-center h-[605px]">
          <div className="text-red-500 text-lg font-bold">{error}</div>
        </div>
      ) : (
        <svg ref={svgRef} width={chartWidth} height={605} className="bg-black"></svg>
      )}
    </div>
  );
}
