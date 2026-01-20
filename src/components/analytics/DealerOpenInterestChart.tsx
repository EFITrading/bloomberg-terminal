'use client';

import React, { useState, useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface OptionsData {
  strike: number;
  openInterest: number;
  premium: number;
  type: 'call' | 'put';
}

interface DealerOpenInterestChartProps {
  selectedTicker: string;
  selectedExpiration?: string;
  onExpirationChange?: (expiration: string) => void;
  hideExpirationSelector?: boolean;
  hideAllControls?: boolean;
  compactMode?: boolean;
  chartWidth?: number;
  // Controlled props from unified bar
  oiViewMode?: 'contracts' | 'premium';
  showCalls?: boolean;
  showPuts?: boolean;
  showNetOI?: boolean;
  showTowers?: boolean;
  onExpectedRangePCRatioChange?: (value: string) => void;
  onCumulativePCRatio45DaysChange?: (value: string) => void;
  onExpectedRange90Change?: (range: { call: number, put: number } | null) => void;
}

export default function DealerOpenInterestChart({
  selectedTicker,
  selectedExpiration: propExpiration,
  onExpirationChange,
  hideExpirationSelector = false,
  hideAllControls = false,
  compactMode = false,
  chartWidth = 1120,
  oiViewMode: propViewMode,
  showCalls: propShowCalls,
  showPuts: propShowPuts,
  showNetOI: propShowNetOI,
  showTowers: propShowTowers,
  onExpectedRangePCRatioChange,
  onCumulativePCRatio45DaysChange,
  onExpectedRange90Change
}: DealerOpenInterestChartProps) {
  const [selectedExpiration, setSelectedExpiration] = useState<string>(propExpiration || '');
  const [expirationDates, setExpirationDates] = useState<string[]>([]);
  const [data, setData] = useState<OptionsData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  const [viewMode, setViewMode] = useState<'contracts' | 'premium'>(propViewMode || 'contracts');

  // Toggle states for chart visibility
  const [showCalls, setShowCalls] = useState<boolean>(propShowCalls ?? true);
  const [showPuts, setShowPuts] = useState<boolean>(propShowPuts ?? true);
  const [showNetOI, setShowNetOI] = useState<boolean>(propShowNetOI ?? false);
  const [zoomTransform, setZoomTransform] = useState<any>(null);

  // AI Tower Detection State
  const [towerStructures, setTowerStructures] = useState<Array<{ strike: number, leftStrike: number, rightStrike: number, type: 'call' | 'put' }>>([]);
  const [showTowers, setShowTowers] = useState<boolean>(propShowTowers ?? false);

  // Sync controlled props
  useEffect(() => {
    if (propViewMode !== undefined) setViewMode(propViewMode);
  }, [propViewMode]);
  useEffect(() => {
    if (propShowCalls !== undefined) setShowCalls(propShowCalls);
  }, [propShowCalls]);
  useEffect(() => {
    if (propShowPuts !== undefined) setShowPuts(propShowPuts);
  }, [propShowPuts]);
  useEffect(() => {
    if (propShowNetOI !== undefined) setShowNetOI(propShowNetOI);
  }, [propShowNetOI]);
  useEffect(() => {
    if (propShowTowers !== undefined) {
      setShowTowers(propShowTowers);
      // Trigger tower detection when AI is turned on
      if (propShowTowers && data.length > 0) {
        detectTowerStructures();
      }
    }
  }, [propShowTowers, data]);

  // Expected Range and P/C Ratio State
  const [cumulativePCRatio45Days, setCumulativePCRatio45Days] = useState<string>('');
  const [expectedRangePCRatio, setExpectedRangePCRatio] = useState<string>('');
  const [expectedRange80, setExpectedRange80] = useState<{ call: number, put: number } | null>(null);
  const [expectedRange90, setExpectedRange90] = useState<{ call: number, put: number } | null>(null);

  // Re-trigger tower detection when expected range is calculated
  useEffect(() => {
    if (showTowers && expectedRange90 && data.length > 0) {
      detectTowerStructures();
    }
  }, [expectedRange90, showTowers]);

  // Notify parent of P/C ratio changes
  useEffect(() => {
    if (onExpectedRangePCRatioChange) {
      onExpectedRangePCRatioChange(expectedRangePCRatio);
    }
  }, [expectedRangePCRatio, onExpectedRangePCRatioChange]);

  useEffect(() => {
    if (onCumulativePCRatio45DaysChange) {
      onCumulativePCRatio45DaysChange(cumulativePCRatio45Days);
    }
  }, [cumulativePCRatio45Days, onCumulativePCRatio45DaysChange]);

  const svgRef = useRef<SVGSVGElement>(null);

  // AI Tower Detection Function
  const detectTowerStructures = () => {
    if (!data || data.length === 0) {
      return;
    }

    // Only detect towers if we have the 90% range calculated
    if (!expectedRange90) {
      return;
    }

    const { call: call90, put: put90 } = expectedRange90;
    const towers: Array<{ strike: number, leftStrike: number, rightStrike: number, type: 'call' | 'put', totalPremium?: number }> = [];

    // Get unique strikes sorted
    const uniqueStrikes = [...new Set(data.map(d => d.strike))].sort((a, b) => a - b);

    // Detect common strike intervals (e.g., $5, $2.5, $1, $0.5)
    const intervals: number[] = [];
    for (let i = 1; i < Math.min(uniqueStrikes.length, 20); i++) {
      const diff = uniqueStrikes[i] - uniqueStrikes[i - 1];
      intervals.push(diff);
    }

    // Find the most common intervals
    const intervalCounts = new Map<number, number>();
    intervals.forEach(interval => {
      const rounded = Math.round(interval * 100) / 100; // Round to 2 decimals
      intervalCounts.set(rounded, (intervalCounts.get(rounded) || 0) + 1);
    });

    // Sort intervals by frequency
    const commonIntervals = Array.from(intervalCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([interval]) => interval)
      .filter(interval => interval > 0);

    // For Net OI mode, data structure is different (one entry per strike)
    // For normal mode, separate call/put entries
    const typesToCheck = showNetOI ? ['call', 'put'] : ['call', 'put'];

    // For each type (call/put), check for tower structures
    typesToCheck.forEach(type => {
      for (let i = 0; i < uniqueStrikes.length; i++) {
        const centerStrike = uniqueStrikes[i];

        // Filter: Only include towers within 90% expected range
        if (centerStrike < put90 || centerStrike > call90) {
          continue;
        }

        // Get center data - in Net OI mode, we look at all bars regardless of color
        let centerData;
        if (showNetOI) {
          // In Net OI mode, one entry per strike - check if this entry matches our type
          centerData = data.find(d => d.strike === centerStrike && d.type === type);
        } else {
          // In normal mode, separate call/put entries
          centerData = data.find(d => d.strike === centerStrike && d.type === type);
        }

        if (!centerData) continue;

        const centerOI = centerData.openInterest;
        if (centerOI === 0) continue;

        // Try multiple distance intervals (adjacent, $5 apart, $10 apart)
        const distancesToCheck = [1]; // Start with adjacent strikes

        // Add common intervals if they exist - now including $10
        commonIntervals.slice(0, 4).forEach(interval => {
          if (interval >= 1 && interval <= 15) {
            const stepsAway = Math.round(interval / (uniqueStrikes[1] - uniqueStrikes[0]));
            if (stepsAway > 1) {
              distancesToCheck.push(stepsAway);
            }
          }
        });

        // Try each distance
        for (const distance of distancesToCheck) {
          const leftIndex = i - distance;
          const rightIndex = i + distance;

          if (leftIndex < 0 || rightIndex >= uniqueStrikes.length) continue;

          const leftStrike = uniqueStrikes[leftIndex];
          const rightStrike = uniqueStrikes[rightIndex];

          // Get OI values
          let leftData, rightData;
          if (showNetOI) {
            // In Net OI mode, match the type (color)
            leftData = data.find(d => d.strike === leftStrike && d.type === type);
            rightData = data.find(d => d.strike === rightStrike && d.type === type);
          } else {
            leftData = data.find(d => d.strike === leftStrike && d.type === type);
            rightData = data.find(d => d.strike === rightStrike && d.type === type);
          }

          if (!leftData || !rightData) continue;

          const leftOI = leftData.openInterest;
          const rightOI = rightData.openInterest;

          // Check tower criteria:
          // Left and Right OI must be between 25% and 65% of center
          const leftPercent = (leftOI / centerOI) * 100;
          const rightPercent = (rightOI / centerOI) * 100;

          if (leftPercent >= 25 && leftPercent <= 65 &&
            rightPercent >= 25 && rightPercent <= 65) {

            // Check if this tower is already detected (avoid duplicates)
            const alreadyExists = towers.some(t =>
              t.strike === centerStrike &&
              t.type === type
            );

            if (!alreadyExists) {
              // Calculate total premium for this tower (sum of 3 bars)
              const centerPremium = centerData.premium || 0;
              const leftPremium = leftData.premium || 0;
              const rightPremium = rightData.premium || 0;
              const totalPremium = centerPremium + leftPremium + rightPremium;

              towers.push({
                strike: centerStrike,
                leftStrike: leftStrike,
                rightStrike: rightStrike,
                type: type as 'call' | 'put',
                totalPremium: totalPremium
              });

              break; // Found a valid tower for this center, no need to check other distances
            }
          }
        }
      }
    });

    // Filter to keep only top 2 calls and top 2 puts based on total premium
    const callTowers = towers.filter(t => t.type === 'call').sort((a, b) => (b.totalPremium || 0) - (a.totalPremium || 0)).slice(0, 2);
    const putTowers = towers.filter(t => t.type === 'put').sort((a, b) => (b.totalPremium || 0) - (a.totalPremium || 0)).slice(0, 2);
    const topTowers = [...callTowers, ...putTowers];

    setTowerStructures(topTowers);
    setShowTowers(true);
  };

  // Black-Scholes helper functions for Expected Range
  const normalCDF = (x: number): number => {
    return 0.5 * (1 + erf(x / Math.sqrt(2)));
  };

  const erf = (x: number): number => {
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
    const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const sign = x >= 0 ? 1 : -1;
    x = Math.abs(x);
    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return sign * y;
  };

  const calculateD2 = (S: number, K: number, r: number, sigma: number, T: number): number => {
    const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    return d1 - sigma * Math.sqrt(T);
  };

  const chanceOfProfitSellCall = (S: number, K: number, r: number, sigma: number, T: number): number => {
    const d2 = calculateD2(S, K, r, sigma, T);
    return (1 - normalCDF(d2)) * 100;
  };

  const chanceOfProfitSellPut = (S: number, K: number, r: number, sigma: number, T: number): number => {
    const d2 = calculateD2(S, K, r, sigma, T);
    return normalCDF(d2) * 100;
  };

  const findStrikeForProbability = (S: number, r: number, sigma: number, T: number, targetProb: number, isCall: boolean): number => {
    if (isCall) {
      let low = S + 0.01, high = S * 1.50;
      for (let i = 0; i < 50; i++) {
        const mid = (low + high) / 2;
        const prob = chanceOfProfitSellCall(S, mid, r, sigma, T);
        if (Math.abs(prob - targetProb) < 0.1) return mid;
        if (prob < targetProb) low = mid; else high = mid;
      }
      return (low + high) / 2;
    } else {
      let low = S * 0.50, high = S - 0.01;
      for (let i = 0; i < 50; i++) {
        const mid = (low + high) / 2;
        const prob = chanceOfProfitSellPut(S, mid, r, sigma, T);
        if (Math.abs(prob - targetProb) < 0.1) return mid;
        if (prob < targetProb) high = mid; else low = mid;
      }
      return (low + high) / 2;
    }
  };

  // Sync with prop changes
  useEffect(() => {
    if (propExpiration && propExpiration !== selectedExpiration) {
      setSelectedExpiration(propExpiration);
    }
  }, [propExpiration]);

  // Fetch available expiration dates
  useEffect(() => {
    if (!selectedTicker) return;

    const fetchExpirations = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/dealer-options-premium?ticker=${selectedTicker}`);
        const result = await response.json();

        if (result.success && result.data) {
          const dates = Object.keys(result.data).sort();
          setExpirationDates(dates);

          if (result.currentPrice) {
            setCurrentPrice(result.currentPrice);
          }

          if (dates.length > 0 && !selectedExpiration) {
            const firstDate = dates[0];
            setSelectedExpiration(firstDate);
            onExpirationChange?.(firstDate);
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

  // Fetch options data for selected expiration
  useEffect(() => {
    if (!selectedTicker || !selectedExpiration) return;

    const fetchOptionsData = async () => {
      try {
        setLoading(true);
        setError('');

        // Handle "all-expirations" aggregation (all expiration dates)
        if (selectedExpiration === 'all-expirations') {
          const response = await fetch(`/api/dealer-options-premium?ticker=${selectedTicker}`);
          const result = await response.json();

          if (result.success && result.data) {
            const today = new Date();

            // Get all expirations (no date filtering)
            const validExpirations = Object.keys(result.data).filter(exp => {
              const expDate = new Date(exp + 'T16:00:00');
              return expDate >= today; // Only include future expirations
            });

            if (validExpirations.length === 0) {
              setError('No future expirations');
              setLoading(false);
              return;
            }

            // Aggregate data from all valid expirations
            const aggregatedData = new Map<number, { strike: number, callOI: number, putOI: number, callPremium: number, putPremium: number }>();

            validExpirations.forEach(exp => {
              const expData = result.data[exp];

              // Process calls
              if (expData.calls) {
                Object.entries(expData.calls).forEach(([strike, callData]: [string, any]) => {
                  const strikeNum = parseFloat(strike);
                  const openInterest = callData.open_interest || 0;
                  const midPrice = ((callData.bid || 0) + (callData.ask || 0)) / 2;
                  const premium = openInterest * midPrice * 100;

                  if (!aggregatedData.has(strikeNum)) {
                    aggregatedData.set(strikeNum, { strike: strikeNum, callOI: 0, putOI: 0, callPremium: 0, putPremium: 0 });
                  }
                  const existing = aggregatedData.get(strikeNum)!;
                  existing.callOI += openInterest;
                  existing.callPremium += premium;
                });
              }

              // Process puts
              if (expData.puts) {
                Object.entries(expData.puts).forEach(([strike, putData]: [string, any]) => {
                  const strikeNum = parseFloat(strike);
                  const openInterest = putData.open_interest || 0;
                  const midPrice = ((putData.bid || 0) + (putData.ask || 0)) / 2;
                  const premium = openInterest * midPrice * 100;

                  if (!aggregatedData.has(strikeNum)) {
                    aggregatedData.set(strikeNum, { strike: strikeNum, callOI: 0, putOI: 0, callPremium: 0, putPremium: 0 });
                  }
                  const existing = aggregatedData.get(strikeNum)!;
                  existing.putOI += openInterest;
                  existing.putPremium += premium;
                });
              }
            });

            // Convert to chart format
            const chartData: OptionsData[] = [];
            aggregatedData.forEach(data => {
              if (showNetOI) {
                const netOI = data.callOI - data.putOI;
                const netPremium = data.callPremium - data.putPremium;
                chartData.push({
                  strike: data.strike,
                  openInterest: Math.abs(netOI),
                  premium: Math.abs(netPremium),
                  type: netOI >= 0 ? 'call' : 'put'
                });
              } else {
                if (showCalls && data.callOI > 0) {
                  chartData.push({
                    strike: data.strike,
                    openInterest: data.callOI,
                    premium: data.callPremium,
                    type: 'call'
                  });
                }
                if (showPuts && data.putOI > 0) {
                  chartData.push({
                    strike: data.strike,
                    openInterest: data.putOI,
                    premium: data.putPremium,
                    type: 'put'
                  });
                }
              }
            });

            setData(chartData);
            if (result.currentPrice) {
              setCurrentPrice(result.currentPrice);
            }
          } else {
            setError('Failed to fetch data');
          }
          setLoading(false);
          return;
        }

        // Handle "45-days" aggregation
        if (selectedExpiration === '45-days') {
          const response = await fetch(`/api/dealer-options-premium?ticker=${selectedTicker}`);
          const result = await response.json();

          if (result.success && result.data) {
            const today = new Date();
            const fortyFiveDaysFromNow = new Date(today.getTime() + 45 * 24 * 60 * 60 * 1000);

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

            // Aggregate data from all valid expirations
            const aggregatedData = new Map<number, { strike: number, callOI: number, putOI: number, callPremium: number, putPremium: number }>();

            validExpirations.forEach(exp => {
              const expData = result.data[exp];

              // Process calls
              if (expData.calls) {
                Object.entries(expData.calls).forEach(([strike, callData]: [string, any]) => {
                  const strikeNum = parseFloat(strike);
                  const openInterest = callData.open_interest || 0;
                  const midPrice = ((callData.bid || 0) + (callData.ask || 0)) / 2;
                  const premium = openInterest * midPrice * 100;

                  if (!aggregatedData.has(strikeNum)) {
                    aggregatedData.set(strikeNum, { strike: strikeNum, callOI: 0, putOI: 0, callPremium: 0, putPremium: 0 });
                  }
                  const existing = aggregatedData.get(strikeNum)!;
                  existing.callOI += openInterest;
                  existing.callPremium += premium;
                });
              }

              // Process puts
              if (expData.puts) {
                Object.entries(expData.puts).forEach(([strike, putData]: [string, any]) => {
                  const strikeNum = parseFloat(strike);
                  const openInterest = putData.open_interest || 0;
                  const midPrice = ((putData.bid || 0) + (putData.ask || 0)) / 2;
                  const premium = openInterest * midPrice * 100;

                  if (!aggregatedData.has(strikeNum)) {
                    aggregatedData.set(strikeNum, { strike: strikeNum, callOI: 0, putOI: 0, callPremium: 0, putPremium: 0 });
                  }
                  const existing = aggregatedData.get(strikeNum)!;
                  existing.putOI += openInterest;
                  existing.putPremium += premium;
                });
              }
            });

            // Convert to chart format
            const chartData: OptionsData[] = [];
            aggregatedData.forEach(data => {
              if (showNetOI) {
                const netOI = data.callOI - data.putOI;
                const netPremium = data.callPremium - data.putPremium;
                // Always show net OI
                chartData.push({
                  strike: data.strike,
                  openInterest: Math.abs(netOI),
                  premium: Math.abs(netPremium),
                  type: netOI >= 0 ? 'call' : 'put'
                });
              } else {
                if (showCalls && data.callOI > 0) {
                  chartData.push({
                    strike: data.strike,
                    openInterest: data.callOI,
                    premium: data.callPremium,
                    type: 'call'
                  });
                }
                if (showPuts && data.putOI > 0) {
                  chartData.push({
                    strike: data.strike,
                    openInterest: data.putOI,
                    premium: data.putPremium,
                    type: 'put'
                  });
                }
              }
            });

            setData(chartData);
            if (result.currentPrice) {
              setCurrentPrice(result.currentPrice);
            }
          } else {
            setError('Failed to fetch data');
          }
          setLoading(false);
          return;
        }

        // Normal single expiration fetch
        const response = await fetch(`/api/dealer-options-premium?ticker=${selectedTicker}&expiration=${selectedExpiration}`);
        const result = await response.json();

        if (result.success && result.data && result.data[selectedExpiration]) {
          if (result.currentPrice) {
            setCurrentPrice(result.currentPrice);
          }

          const expirationData = result.data[selectedExpiration];
          const chartData: OptionsData[] = [];
          const strikeMap = new Map<number, { callOI: number; putOI: number; callPremium: number; putPremium: number }>();

          // Process calls
          if (expirationData.calls) {
            Object.entries(expirationData.calls).forEach(([strike, callData]: [string, any]) => {
              const strikeNum = parseFloat(strike);
              const openInterest = callData.open_interest || 0;
              const midPrice = ((callData.bid || 0) + (callData.ask || 0)) / 2;
              const premium = openInterest * midPrice * 100; // Premium in dollars

              if (!strikeMap.has(strikeNum)) {
                strikeMap.set(strikeNum, { callOI: 0, putOI: 0, callPremium: 0, putPremium: 0 });
              }
              const entry = strikeMap.get(strikeNum)!;
              entry.callOI = openInterest;
              entry.callPremium = premium;
            });
          }

          // Process puts
          if (expirationData.puts) {
            Object.entries(expirationData.puts).forEach(([strike, putData]: [string, any]) => {
              const strikeNum = parseFloat(strike);
              const openInterest = putData.open_interest || 0;
              const midPrice = ((putData.bid || 0) + (putData.ask || 0)) / 2;
              const premium = openInterest * midPrice * 100;

              if (!strikeMap.has(strikeNum)) {
                strikeMap.set(strikeNum, { callOI: 0, putOI: 0, callPremium: 0, putPremium: 0 });
              }
              const entry = strikeMap.get(strikeNum)!;
              entry.putOI = openInterest;
              entry.putPremium = premium;
            });
          }

          // Build chart data
          strikeMap.forEach((value, strike) => {
            if (showNetOI) {
              const netOI = value.callOI - value.putOI;
              const netPremium = value.callPremium - value.putPremium;
              // Always show net OI, even if zero (to show balanced strikes)
              chartData.push({
                strike,
                openInterest: Math.abs(netOI), // Use absolute for bar height
                premium: Math.abs(netPremium),
                type: netOI >= 0 ? 'call' : 'put' // Color indicates direction
              });
            } else {
              if (showCalls && value.callOI > 0) {
                chartData.push({
                  strike,
                  openInterest: value.callOI,
                  premium: value.callPremium,
                  type: 'call'
                });
              }
              if (showPuts && value.putOI > 0) {
                chartData.push({
                  strike,
                  openInterest: value.putOI,
                  premium: value.putPremium,
                  type: 'put'
                });
              }
            }
          });

          setData(chartData.sort((a, b) => a.strike - b.strike || (a.type === 'call' ? -1 : 1)));
        } else {
          setError('No options data available for this expiration');
        }
      } catch (err) {
        setError('Failed to fetch options data');
        console.error('Error fetching options data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchOptionsData();
  }, [selectedTicker, selectedExpiration, showNetOI, showCalls, showPuts]);

  // Calculate Expected Range (80% and 90%)
  useEffect(() => {
    if (!selectedTicker || !selectedExpiration || !currentPrice || data.length === 0) {
      setExpectedRange80(null);
      setExpectedRange90(null);
      setExpectedRangePCRatio('');
      return;
    }

    const calculateExpectedRange = async () => {
      try {
        // Handle 45-days aggregation
        if (selectedExpiration === '45-days') {
          const response = await fetch(`/api/dealer-options-premium?ticker=${selectedTicker}`);
          const result = await response.json();

          if (!result.success || !result.data) {
            setExpectedRangePCRatio('N/A');
            return;
          }

          const today = new Date();
          const fortyFiveDaysFromNow = new Date(today.getTime() + 45 * 24 * 60 * 60 * 1000);

          // Get all expirations within 45 days
          const validExpirations = Object.keys(result.data).filter(exp => {
            const expDate = new Date(exp + 'T16:00:00');
            return expDate >= today && expDate <= fortyFiveDaysFromNow;
          });

          if (validExpirations.length === 0) {
            setExpectedRangePCRatio('N/A');
            return;
          }

          // Use the LAST (furthest) expiration for IV and time calculation
          const furthestExp = validExpirations[validExpirations.length - 1];
          const expData = result.data[furthestExp];

          // Calculate average IV from ATM options
          const atmStrike = Object.keys(expData.calls || {})
            .map(Number)
            .reduce((prev, curr) => Math.abs(curr - currentPrice) < Math.abs(prev - currentPrice) ? curr : prev);

          const callIV = expData.calls?.[atmStrike]?.implied_volatility || 0.3;
          const putIV = expData.puts?.[atmStrike]?.implied_volatility || 0.3;
          const avgIV = (callIV + putIV) / 2;

          // Calculate time to furthest expiration
          const expDate = new Date(furthestExp + 'T16:00:00');
          const now = new Date();
          const daysToExpiry = Math.max(1, Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
          const T = daysToExpiry / 365;
          const r = 0.0387;

          // Calculate 90% expected range
          const call90 = findStrikeForProbability(currentPrice, r, avgIV, T, 90, true);
          const put90 = findStrikeForProbability(currentPrice, r, avgIV, T, 90, false);
          setExpectedRange90({ call: call90, put: put90 });

          if (onExpectedRange90Change) {
            onExpectedRange90Change({ call: call90, put: put90 });
          }

          // Calculate 80% expected range
          const call80 = findStrikeForProbability(currentPrice, r, avgIV, T, 80, true);
          const put80 = findStrikeForProbability(currentPrice, r, avgIV, T, 80, false);
          setExpectedRange80({ call: call80, put: put80 });

          // Calculate P/C ratio from aggregated data
          let totalCallOI = 0;
          let totalPutOI = 0;

          data.forEach(item => {
            if (item.strike >= put90 && item.strike <= call90) {
              if (item.type === 'call') {
                totalCallOI += item.openInterest;
              } else if (item.type === 'put') {
                totalPutOI += item.openInterest;
              }
            }
          });

          if (totalCallOI === 0 && totalPutOI === 0) {
            setExpectedRangePCRatio('N/A');
          } else if (totalCallOI === 0) {
            setExpectedRangePCRatio('∞ (No Calls)');
          } else {
            const ratio = totalPutOI / totalCallOI;
            setExpectedRangePCRatio(`${ratio.toFixed(2)} (${put90.toFixed(0)}-${call90.toFixed(0)})`);
          }

          return;
        }

        // Normal single expiration calculation
        const response = await fetch(`/api/dealer-options-premium?ticker=${selectedTicker}&expiration=${selectedExpiration}`);
        const result = await response.json();

        if (!result.success || !result.data || !result.data[selectedExpiration]) {
          setExpectedRangePCRatio('N/A');
          return;
        }

        const expData = result.data[selectedExpiration];

        // Calculate average IV from ATM options
        const atmStrike = Object.keys(expData.calls || {})
          .map(Number)
          .reduce((prev, curr) => Math.abs(curr - currentPrice) < Math.abs(prev - currentPrice) ? curr : prev);

        const callIV = expData.calls?.[atmStrike]?.implied_volatility || 0.3;
        const putIV = expData.puts?.[atmStrike]?.implied_volatility || 0.3;
        const avgIV = (callIV + putIV) / 2;

        // Calculate time to expiry
        const expDate = new Date(selectedExpiration + 'T16:00:00');
        const now = new Date();
        const daysToExpiry = Math.max(1, Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
        const T = daysToExpiry / 365;

        const r = 0.0387; // Risk-free rate

        // Calculate 90% expected range
        const call90 = findStrikeForProbability(currentPrice, r, avgIV, T, 90, true);
        const put90 = findStrikeForProbability(currentPrice, r, avgIV, T, 90, false);
        setExpectedRange90({ call: call90, put: put90 });

        // Pass to parent component
        if (onExpectedRange90Change) {
          onExpectedRange90Change({ call: call90, put: put90 });
        }

        // Calculate 80% expected range for chart lines
        const call80 = findStrikeForProbability(currentPrice, r, avgIV, T, 80, true);
        const put80 = findStrikeForProbability(currentPrice, r, avgIV, T, 80, false);
        setExpectedRange80({ call: call80, put: put80 });
        // Calculate P/C ratio for OI within 90% range
        let totalCallOI = 0;
        let totalPutOI = 0;

        data.forEach(item => {
          if (item.strike >= put90 && item.strike <= call90) {
            if (item.type === 'call') {
              totalCallOI += item.openInterest;
            } else if (item.type === 'put') {
              totalPutOI += item.openInterest;
            }
          }
        });

        if (totalCallOI === 0 && totalPutOI === 0) {
          setExpectedRangePCRatio('N/A');
        } else if (totalCallOI === 0) {
          setExpectedRangePCRatio('∞ (No Calls)');
        } else {
          const ratio = totalPutOI / totalCallOI;
          setExpectedRangePCRatio(`${ratio.toFixed(2)} (${put90.toFixed(0)}-${call90.toFixed(0)})`);
        }
      } catch (error) {
        console.error('Error calculating expected range:', error);
        setExpectedRangePCRatio('Error');
      }
    };

    calculateExpectedRange();
  }, [selectedTicker, selectedExpiration, currentPrice, data]);

  // Calculate 45-day cumulative P/C Ratio
  useEffect(() => {
    if (!selectedTicker || !currentPrice || expirationDates.length === 0 || !expectedRange90) {
      setCumulativePCRatio45Days('');
      return;
    }

    const calculate45DayPCRatio = async () => {
      try {
        const today = new Date();
        const futureDate = new Date(today);
        futureDate.setDate(futureDate.getDate() + 45);

        // Filter expirations within 45 days
        const expirations45Days = expirationDates.filter(exp => {
          const expDate = new Date(exp);
          return expDate >= today && expDate <= futureDate;
        });

        if (expirations45Days.length === 0) {
          setCumulativePCRatio45Days('N/A');
          return;
        }

        let totalCallOI = 0;
        let totalPutOI = 0;
        let expCount = 0;

        const { call: call90, put: put90 } = expectedRange90;

        for (const exp of expirations45Days) {
          try {
            const response = await fetch(`/api/dealer-options-premium?ticker=${selectedTicker}&expiration=${exp}`);
            const result = await response.json();

            if (result.success && result.data && result.data[exp]) {
              const expData = result.data[exp];

              if (expData.calls) {
                Object.entries(expData.calls).forEach(([strike, callData]: [string, any]) => {
                  const strikeNum = parseFloat(strike);
                  if (strikeNum >= put90 && strikeNum <= call90) {
                    totalCallOI += callData.open_interest || 0;
                  }
                });
              }

              if (expData.puts) {
                Object.entries(expData.puts).forEach(([strike, putData]: [string, any]) => {
                  const strikeNum = parseFloat(strike);
                  if (strikeNum >= put90 && strikeNum <= call90) {
                    totalPutOI += putData.open_interest || 0;
                  }
                });
              }

              expCount++;
            }
          } catch (error) {
            console.error(`Error fetching data for ${exp}:`, error);
          }
        }

        if (totalCallOI === 0 && totalPutOI === 0) {
          setCumulativePCRatio45Days('N/A');
        } else if (totalCallOI === 0) {
          setCumulativePCRatio45Days('∞ (No Calls)');
        } else {
          const ratio = totalPutOI / totalCallOI;
          setCumulativePCRatio45Days(`${ratio.toFixed(2)} (${expCount} exp)`);
        }
      } catch (error) {
        console.error('Error calculating 45-day cumulative P/C Ratio:', error);
        setCumulativePCRatio45Days('Error');
      }
    };

    calculate45DayPCRatio();
  }, [selectedTicker, currentPrice, expirationDates, expectedRange90]);

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

    const xSubScale = d3
      .scaleBand()
      .domain(['call', 'put'])
      .range([0, xScale.bandwidth()])
      .padding(0.1);

    const yValue = (d: OptionsData) => viewMode === 'premium' ? d.premium : d.openInterest;

    const yScale = d3
      .scaleLinear()
      .domain([0, d3.max(data, yValue) || 0])
      .range([height, 0]);

    // Dealer-focused color scheme - green for calls, red for puts
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
        const maxVisibleValue = d3.max(visibleData, yValue) || 0;
        const newYScale = d3.scaleLinear()
          .domain([0, maxVisibleValue])
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
            if (!visibleStrikes.includes(d.strike)) return -1000;
            const baseX = newXBandScale(d.strike.toString()) || 0;
            const subX = newXSubScale(d.type) || 0;
            return baseX + subX;
          })
          .attr('y', (d: any) => newYScale(yValue(d)))
          .attr('width', newXSubScale.bandwidth())
          .attr('height', (d: any) => height - newYScale(yValue(d)));

        // Update X-axis with visible strikes only
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

        // Update Y-axis with new scale
        const yAxisFormat = (d: any) => {
          const value = Math.abs(d);
          if (value >= 1000000) {
            return `${(d / 1000000).toFixed(1)}M`;
          } else if (value >= 1000) {
            return `${(d / 1000).toFixed(0)}k`;
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

        // Update current price line position during zoom
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

        // Update 80% expected range lines position during zoom
        if (expectedRange80) {
          const { call: call80, put: put80 } = expectedRange80;

          // Update Put 80% line
          const put80X = visibleStrikes.findIndex(strike => strike >= put80);
          let putXPosition;

          if (put80X === -1) {
            putXPosition = width;
          } else if (put80X === 0) {
            putXPosition = 0;
          } else {
            const lowerStrike = visibleStrikes[put80X - 1];
            const upperStrike = visibleStrikes[put80X];
            const ratio = (put80 - lowerStrike) / (upperStrike - lowerStrike);
            const lowerX = (newXBandScale(lowerStrike.toString()) || 0) + newXBandScale.bandwidth() / 2;
            const upperX = (newXBandScale(upperStrike.toString()) || 0) + newXBandScale.bandwidth() / 2;
            putXPosition = lowerX + ratio * (upperX - lowerX);
          }

          container.select('.expected-range-put-80')
            .attr('x1', putXPosition)
            .attr('x2', putXPosition);

          container.select('.expected-range-put-label')
            .attr('x', putXPosition);

          // Update Call 80% line
          const call80X = visibleStrikes.findIndex(strike => strike >= call80);
          let callXPosition;

          if (call80X === -1) {
            callXPosition = width;
          } else if (call80X === 0) {
            callXPosition = 0;
          } else {
            const lowerStrike = visibleStrikes[call80X - 1];
            const upperStrike = visibleStrikes[call80X];
            const ratio = (call80 - lowerStrike) / (upperStrike - lowerStrike);
            const lowerX = (newXBandScale(lowerStrike.toString()) || 0) + newXBandScale.bandwidth() / 2;
            const upperX = (newXBandScale(upperStrike.toString()) || 0) + newXBandScale.bandwidth() / 2;
            callXPosition = lowerX + ratio * (upperX - lowerX);
          }

          container.select('.expected-range-call-80')
            .attr('x1', callXPosition)
            .attr('x2', callXPosition);

          container.select('.expected-range-call-label')
            .attr('x', callXPosition);
        }

        // Update tower structures position during zoom
        if (showTowers && towerStructures.length > 0) {
          towerStructures.forEach((tower, index) => {
            const centerStrike = tower.strike;
            const leftStrike = tower.leftStrike;
            const rightStrike = tower.rightStrike;

            // Check if strikes are in visible range
            if (!visibleStrikes.includes(centerStrike)) {
              container.select(`.tower-group.tower-${index}`).style('display', 'none');
              return;
            }

            container.select(`.tower-group.tower-${index}`).style('display', 'block');

            // Get sub-scale positions for the specific type (call/put)
            const newXSubScale = d3.scaleBand()
              .domain(['call', 'put'])
              .range([0, newXBandScale.bandwidth()])
              .padding(0.1);

            // Calculate the actual bar positions including sub-band offset
            const centerBarX = (newXBandScale(centerStrike.toString()) || 0) + (newXSubScale(tower.type) || 0);
            const leftBarX = (newXBandScale(leftStrike.toString()) || 0) + (newXSubScale(tower.type) || 0);
            const rightBarX = (newXBandScale(rightStrike.toString()) || 0) + (newXSubScale(tower.type) || 0);
            const barWidth = newXSubScale.bandwidth();

            // Calculate corner positions for corner-to-corner connections
            const centerLeftCorner = centerBarX;
            const centerRightCorner = centerBarX + barWidth;
            const leftRightCorner = leftBarX + barWidth;
            const rightLeftCorner = rightBarX;

            // Get updated Y positions for all three bars
            const centerData = visibleData.find(d => d.strike === centerStrike && d.type === tower.type);
            const leftData = visibleData.find(d => d.strike === leftStrike && d.type === tower.type);
            const rightData = visibleData.find(d => d.strike === rightStrike && d.type === tower.type);

            const centerOI = centerData ? (viewMode === 'premium' ? centerData.premium : centerData.openInterest) : 0;
            const leftOI = leftData ? (viewMode === 'premium' ? leftData.premium : leftData.openInterest) : 0;
            const rightOI = rightData ? (viewMode === 'premium' ? rightData.premium : rightData.openInterest) : 0;

            const centerY = newYScale(centerOI);
            const leftY = newYScale(leftOI);
            const rightY = newYScale(rightOI);

            // Update left bridge line - right corner of left bar to left corner of center bar
            container.select(`.tower-${index} .tower-bridge-left`)
              .attr('x1', leftRightCorner)
              .attr('x2', centerLeftCorner)
              .attr('y1', leftY)
              .attr('y2', centerY);

            // Update right bridge line - right corner of center bar to left corner of right bar
            container.select(`.tower-${index} .tower-bridge-right`)
              .attr('x1', centerRightCorner)
              .attr('x2', rightLeftCorner)
              .attr('y1', centerY)
              .attr('y2', rightY);

            // Update tower icon position
            const iconX = centerBarX + barWidth / 2;
            const iconY = centerY - 10;
            container.select(`.tower-${index} .tower-icon`)
              .attr('transform', `translate(${iconX}, ${iconY})`);
          });
        }
      });

    // Add bars
    container.selectAll('.bar')
      .data(data)
      .enter()
      .append('rect')
      .attr('class', 'bar')
      .attr('x', d => {
        const baseX = xScale(d.strike.toString()) || 0;
        const subX = xSubScale(d.type) || 0;
        return baseX + subX;
      })
      .attr('y', d => yScale(yValue(d)))
      .attr('width', xSubScale.bandwidth())
      .attr('height', d => height - yScale(yValue(d)))
      .attr('fill', d => colorScale(d.type))
      .attr('opacity', 1)
      .style('cursor', 'pointer')
      .on('mouseover', function (event, d) {
        d3.select(this).attr('opacity', 1);

        const tooltip = container.append('g')
          .attr('class', 'tooltip')
          .attr('transform', `translate(${xScale(d.strike.toString())! + xScale.bandwidth() / 2}, ${yScale(yValue(d)) - 10})`);

        const text = `${d.type.toUpperCase()}: ${d.strike} | OI: ${d.openInterest.toLocaleString()} | Premium: $${(d.premium / 1000000).toFixed(2)}M`;

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
      if (value >= 1000000) {
        return `${(d / 1000000).toFixed(1)}M`;
      } else if (value >= 1000) {
        return `${(d / 1000).toFixed(0)}k`;
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
      .style('fill', '#cc3300')
      .style('font-size', '16px')
      .style('font-weight', 'bold')
      .text(viewMode === 'premium' ? 'Open Interest Premium ($)' : 'Open Interest (Contracts)');

    // Draw 80% Expected Range lines (blue dashed vertical lines)
    if (expectedRange80) {
      const { call: call80, put: put80 } = expectedRange80;
      const strikes = uniqueStrikes;

      // Draw Put 80% line (lower bound)
      const putStrikeIndex = strikes.findIndex((s, idx) => {
        if (idx === strikes.length - 1) return true;
        return put80 >= strikes[idx] && put80 < strikes[idx + 1];
      });

      if (putStrikeIndex !== -1) {
        let putXPosition = 0;

        if (put80 === strikes[putStrikeIndex]) {
          putXPosition = (xScale(strikes[putStrikeIndex].toString()) || 0) + xScale.bandwidth() / 2;
        } else {
          const lowerStrike = strikes[putStrikeIndex];
          const upperStrike = strikes[putStrikeIndex + 1] || lowerStrike;
          const ratio = (put80 - lowerStrike) / (upperStrike - lowerStrike || 1);
          const lowerX = (xScale(lowerStrike.toString()) || 0) + xScale.bandwidth() / 2;
          const upperX = (xScale(upperStrike.toString()) || 0) + xScale.bandwidth() / 2;
          putXPosition = lowerX + ratio * (upperX - lowerX);
        }

        container
          .append('line')
          .attr('class', 'expected-range-put-80')
          .attr('x1', putXPosition)
          .attr('x2', putXPosition)
          .attr('y1', 0)
          .attr('y2', height)
          .style('stroke', '#3b82f6')
          .style('stroke-width', 2)
          .style('stroke-dasharray', '5,5')
          .style('opacity', 0.7);

        container
          .append('text')
          .attr('class', 'expected-range-put-label')
          .attr('x', putXPosition)
          .attr('y', -25)
          .style('text-anchor', 'middle')
          .style('fill', '#3b82f6')
          .style('font-size', '11px')
          .style('font-weight', 'bold')
          .text(`80% Put: $${put80.toFixed(2)}`);
      }

      // Draw Call 80% line (upper bound)
      const callStrikeIndex = strikes.findIndex((s, idx) => {
        if (idx === strikes.length - 1) return true;
        return call80 >= strikes[idx] && call80 < strikes[idx + 1];
      });

      if (callStrikeIndex !== -1) {
        let callXPosition = 0;

        if (call80 === strikes[callStrikeIndex]) {
          callXPosition = (xScale(strikes[callStrikeIndex].toString()) || 0) + xScale.bandwidth() / 2;
        } else {
          const lowerStrike = strikes[callStrikeIndex];
          const upperStrike = strikes[callStrikeIndex + 1] || lowerStrike;
          const ratio = (call80 - lowerStrike) / (upperStrike - lowerStrike || 1);
          const lowerX = (xScale(lowerStrike.toString()) || 0) + xScale.bandwidth() / 2;
          const upperX = (xScale(upperStrike.toString()) || 0) + xScale.bandwidth() / 2;
          callXPosition = lowerX + ratio * (upperX - lowerX);
        }

        container
          .append('line')
          .attr('class', 'expected-range-call-80')
          .attr('x1', callXPosition)
          .attr('x2', callXPosition)
          .attr('y1', 0)
          .attr('y2', height)
          .style('stroke', '#3b82f6')
          .style('stroke-width', 2)
          .style('stroke-dasharray', '5,5')
          .style('opacity', 0.7);

        container
          .append('text')
          .attr('class', 'expected-range-call-label')
          .attr('x', callXPosition)
          .attr('y', -25)
          .style('text-anchor', 'middle')
          .style('fill', '#3b82f6')
          .style('font-size', '11px')
          .style('font-weight', 'bold')
          .text(`80% Call: $${call80.toFixed(2)}`);
      }
    }

    // AI Tower Structure Visualization
    if (showTowers && towerStructures.length > 0) {
      console.log('🏰 Rendering towers:', towerStructures.length, 'Towers:', towerStructures);
      console.log('🏰 Container:', container.node());
      console.log('🏰 Data length:', data.length);

      towerStructures.forEach((tower, index) => {
        // Find the center strike position - using the band center
        const centerStrikeStr = tower.strike.toString();
        const leftStrikeStr = tower.leftStrike.toString();
        const rightStrikeStr = tower.rightStrike.toString();

        console.log(`🏰 Tower ${index}: Looking for strikes`, centerStrikeStr, leftStrikeStr, rightStrikeStr);

        const centerBandX = xScale(centerStrikeStr);
        const leftBandX = xScale(leftStrikeStr);
        const rightBandX = xScale(rightStrikeStr);

        console.log(`🏰 Tower ${index}: X positions`, centerBandX, leftBandX, rightBandX);

        if (centerBandX === undefined || leftBandX === undefined || rightBandX === undefined) {
          console.log('⚠️ Strike not found in scale for tower:', tower);
          return;
        }

        // Get sub-scale positions for the specific type (call/put)
        const xSubScale = d3.scaleBand()
          .domain(['call', 'put'])
          .range([0, xScale.bandwidth()])
          .padding(0.1);

        // Calculate the actual bar positions including sub-band offset
        const centerBarX = centerBandX + (xSubScale(tower.type) || 0);
        const leftBarX = leftBandX + (xSubScale(tower.type) || 0);
        const rightBarX = rightBandX + (xSubScale(tower.type) || 0);
        const barWidth = xSubScale.bandwidth();

        // Calculate corner positions for corner-to-corner connections
        const centerLeftCorner = centerBarX; // Left edge of center bar
        const centerRightCorner = centerBarX + barWidth; // Right edge of center bar
        const leftRightCorner = leftBarX + barWidth; // Right edge of left bar
        const rightLeftCorner = rightBarX; // Left edge of right bar

        // Get the height of the center bar for positioning
        const centerData = data.find(d => d.strike === tower.strike && d.type === tower.type);
        const leftData = data.find(d => d.strike === tower.leftStrike && d.type === tower.type);
        const rightData = data.find(d => d.strike === tower.rightStrike && d.type === tower.type);

        const centerOI = centerData ? (viewMode === 'premium' ? centerData.premium : centerData.openInterest) : 0;
        const leftOI = leftData ? (viewMode === 'premium' ? leftData.premium : leftData.openInterest) : 0;
        const rightOI = rightData ? (viewMode === 'premium' ? rightData.premium : rightData.openInterest) : 0;

        const centerY = yScale(centerOI);
        const leftY = yScale(leftOI);
        const rightY = yScale(rightOI);

        // Create a group for this tower with higher z-index
        const towerGroup = container
          .append('g')
          .attr('class', `tower-group tower-${index}`)
          .style('pointer-events', 'all');

        // Line color based on type - gold for calls, purple for puts
        const lineColor = tower.type === 'call' ? '#ffd700' : '#a855f7';

        // Determine stroke style based on strike distance
        const strikeDistance = Math.abs(tower.strike - tower.leftStrike);
        let strokeDasharray = 'none'; // Default solid line for $1 strikes

        if (Math.abs(strikeDistance - 10) < 0.1) {
          strokeDasharray = '8,4'; // Dashed line for $10 strikes
        } else if (Math.abs(strikeDistance - 5) < 0.1) {
          strokeDasharray = '2,2'; // Dotted line for $5 strikes
        }

        // Draw left bridge line - from right corner of left bar to left corner of center bar
        towerGroup
          .append('line')
          .attr('class', 'tower-bridge-left')
          .attr('x1', leftRightCorner)
          .attr('x2', centerLeftCorner)
          .attr('y1', leftY)
          .attr('y2', centerY)
          .style('stroke', lineColor)
          .style('stroke-width', 2)
          .style('stroke-dasharray', strokeDasharray)
          .style('opacity', 1);

        // Draw right bridge line - from right corner of center bar to left corner of right bar
        towerGroup
          .append('line')
          .attr('class', 'tower-bridge-right')
          .attr('x1', centerRightCorner)
          .attr('x2', rightLeftCorner)
          .attr('y1', centerY)
          .attr('y2', rightY)
          .style('stroke', lineColor)
          .style('stroke-width', 2)
          .style('stroke-dasharray', strokeDasharray)
          .style('opacity', 1);

        // Add animated tower icon at the center
        const iconX = centerBarX + barWidth / 2;
        const iconY = centerY - 10;

        const iconGroup = towerGroup
          .append('g')
          .attr('class', 'tower-icon')
          .attr('transform', `translate(${iconX}, ${iconY})`)
          .style('cursor', 'pointer');

        // Determine colors based on type
        const isCall = lineColor === '#ffd700';
        const accentColor = isCall ? '#00d4ff' : '#ff00ff'; // Cyan for calls, Magenta for puts

        // Define gradients for 3D glass effect
        const glassGradientId = `tower-glass-${index}`;
        const defs = iconGroup.append('defs');

        // Main glass gradient (silver with shine)
        const glassGradient = defs.append('linearGradient')
          .attr('id', glassGradientId)
          .attr('x1', '0%')
          .attr('y1', '0%')
          .attr('x2', '100%')
          .attr('y2', '0%');

        glassGradient.append('stop')
          .attr('offset', '0%')
          .attr('stop-color', '#555555')
          .attr('stop-opacity', 0.9);

        glassGradient.append('stop')
          .attr('offset', '30%')
          .attr('stop-color', '#cccccc')
          .attr('stop-opacity', 0.95);

        glassGradient.append('stop')
          .attr('offset', '50%')
          .attr('stop-color', '#ffffff')
          .attr('stop-opacity', 1);

        glassGradient.append('stop')
          .attr('offset', '70%')
          .attr('stop-color', '#cccccc')
          .attr('stop-opacity', 0.95);

        glassGradient.append('stop')
          .attr('offset', '100%')
          .attr('stop-color', '#555555')
          .attr('stop-opacity', 0.9);

        // Outer pulsing glow ring
        iconGroup.append('circle')
          .attr('r', 12)
          .attr('fill', 'none')
          .attr('stroke', accentColor)
          .attr('stroke-width', 2)
          .attr('opacity', 0.6)
          .append('animate')
          .attr('attributeName', 'r')
          .attr('values', '12;16;12')
          .attr('dur', '2s')
          .attr('repeatCount', 'indefinite');

        // Tower base - wide with 3D effect
        iconGroup.append('rect')
          .attr('x', -8)
          .attr('y', 6)
          .attr('width', 16)
          .attr('height', 4)
          .attr('fill', `url(#${glassGradientId})`)
          .attr('stroke', '#888888')
          .attr('stroke-width', 0.5)
          .attr('rx', 0.5);

        // Base shadow/depth
        iconGroup.append('rect')
          .attr('x', -8)
          .attr('y', 9.5)
          .attr('width', 16)
          .attr('height', 0.5)
          .attr('fill', '#000000')
          .attr('opacity', 0.4);

        // Base glow
        iconGroup.append('rect')
          .attr('x', -9)
          .attr('y', 5)
          .attr('width', 18)
          .attr('height', 6)
          .attr('fill', accentColor)
          .attr('opacity', 0.2)
          .attr('rx', 1)
          .append('animate')
          .attr('attributeName', 'opacity')
          .attr('values', '0.2;0.4;0.2')
          .attr('dur', '2s')
          .attr('repeatCount', 'indefinite');

        // Tower middle section with glass effect
        iconGroup.append('rect')
          .attr('x', -6)
          .attr('y', -2)
          .attr('width', 12)
          .attr('height', 8)
          .attr('fill', `url(#${glassGradientId})`)
          .attr('stroke', '#999999')
          .attr('stroke-width', 0.5)
          .attr('rx', 0.5);

        // Middle section right edge highlight (3D)
        iconGroup.append('rect')
          .attr('x', 5.5)
          .attr('y', -2)
          .attr('width', 0.5)
          .attr('height', 8)
          .attr('fill', '#444444')
          .attr('opacity', 0.6);

        // Middle section shine
        iconGroup.append('rect')
          .attr('x', -5)
          .attr('y', -1.5)
          .attr('width', 2)
          .attr('height', 7)
          .attr('fill', '#ffffff')
          .attr('opacity', 0.3);

        // Windows on middle section (glowing)
        [[-3, 0], [3, 0], [-3, 3], [3, 3]].forEach(([x, y], idx) => {
          iconGroup.append('rect')
            .attr('x', x - 1)
            .attr('y', y - 0.5)
            .attr('width', 2)
            .attr('height', 1.5)
            .attr('fill', accentColor)
            .attr('opacity', 0.7)
            .attr('rx', 0.2)
            .append('animate')
            .attr('attributeName', 'opacity')
            .attr('values', '0.7;0.3;0.7')
            .attr('dur', '2s')
            .attr('begin', `${idx * 0.5}s`)
            .attr('repeatCount', 'indefinite');
        });

        // Tower top section with glass effect
        iconGroup.append('rect')
          .attr('x', -4)
          .attr('y', -8)
          .attr('width', 8)
          .attr('height', 6)
          .attr('fill', `url(#${glassGradientId})`)
          .attr('stroke', '#aaaaaa')
          .attr('stroke-width', 0.5)
          .attr('rx', 0.5);

        // Top section right edge highlight (3D)
        iconGroup.append('rect')
          .attr('x', 3.5)
          .attr('y', -8)
          .attr('width', 0.5)
          .attr('height', 6)
          .attr('fill', '#444444')
          .attr('opacity', 0.6);

        // Top section shine
        iconGroup.append('rect')
          .attr('x', -3)
          .attr('y', -7.5)
          .attr('width', 1.5)
          .attr('height', 5)
          .attr('fill', '#ffffff')
          .attr('opacity', 0.4);

        // Spire/antenna on top (metallic)
        iconGroup.append('line')
          .attr('x1', 0)
          .attr('y1', -8)
          .attr('x2', 0)
          .attr('y2', -12)
          .attr('stroke', '#bbbbbb')
          .attr('stroke-width', 1.5)
          .attr('stroke-linecap', 'round');

        // Spire shadow (3D depth)
        iconGroup.append('line')
          .attr('x1', 0.5)
          .attr('y1', -8)
          .attr('x2', 0.5)
          .attr('y2', -12)
          .attr('stroke', '#666666')
          .attr('stroke-width', 0.5)
          .attr('stroke-linecap', 'round');

        // Pulsing beacon at top
        iconGroup.append('circle')
          .attr('cx', 0)
          .attr('cy', -12)
          .attr('r', 1.5)
          .attr('fill', accentColor)
          .append('animate')
          .attr('attributeName', 'r')
          .attr('values', '1.5;2.5;1.5')
          .attr('dur', '1s')
          .attr('repeatCount', 'indefinite');

        // Energy waves emanating from beacon
        [3, 5, 7].forEach((radius, idx) => {
          const wave = iconGroup.append('circle')
            .attr('cx', 0)
            .attr('cy', -12)
            .attr('r', radius)
            .attr('fill', 'none')
            .attr('stroke', accentColor)
            .attr('stroke-width', 1)
            .attr('opacity', 0);

          wave.append('animate')
            .attr('attributeName', 'opacity')
            .attr('values', '0;0.6;0')
            .attr('dur', '2s')
            .attr('begin', `${idx * 0.7}s`)
            .attr('repeatCount', 'indefinite');

          wave.append('animate')
            .attr('attributeName', 'r')
            .attr('values', `${radius};${radius + 3};${radius + 3}`)
            .attr('dur', '2s')
            .attr('begin', `${idx * 0.7}s`)
            .attr('repeatCount', 'indefinite');
        });

        // Add tooltip on hover
        iconGroup
          .on('mouseover', function (event) {
            const tooltip = d3.select('body')
              .append('div')
              .attr('class', 'tower-tooltip')
              .style('position', 'absolute')
              .style('background', 'rgba(0, 0, 0, 0.95)')
              .style('color', '#ffd700')
              .style('padding', '12px')
              .style('border-radius', '8px')
              .style('border', '2px solid #ffd700')
              .style('font-size', '14px')
              .style('font-weight', 'bold')
              .style('pointer-events', 'none')
              .style('z-index', '10000')
              .html(`
                <div style="margin-bottom: 4px;">👑 <strong>TOWER STRUCTURE</strong></div>
                <div style="color: #ffffff;">Strike: <span style="color: #ffd700;">${tower.strike}</span></div>
                <div style="color: #ffffff;">Type: <span style="color: ${lineColor};">${tower.type.toUpperCase()}</span></div>
                <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #ffd700;">
                  <div>Center OI: <span style="color: #ffd700;">${centerData?.openInterest.toLocaleString()}</span></div>
                  <div>Left OI: <span style="color: #ffffff;">${leftData?.openInterest.toLocaleString()}</span></div>
                  <div>Right OI: <span style="color: #ffffff;">${rightData?.openInterest.toLocaleString()}</span></div>
                </div>
              `)
              .style('left', (event.pageX + 15) + 'px')
              .style('top', (event.pageY - 10) + 'px');
          })
          .on('mouseout', function () {
            d3.selectAll('.tower-tooltip').remove();
          });
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

  }, [data, currentPrice, viewMode, showTowers, towerStructures, expectedRange80]);

  return (
    <div className="bg-black border-2 border-orange-500 rounded-lg p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">

        {/* View Mode Toggle - Hidden when controls are in unified bar */}
        {!hideAllControls && (
          <div className="flex gap-3">
            <button
              onClick={() => setViewMode('contracts')}
              className={`px-4 py-2 font-bold text-sm uppercase tracking-wider rounded-lg transition-all ${viewMode === 'contracts'
                ? 'bg-orange-600 text-white border-2 border-orange-500'
                : 'bg-gray-900 text-orange-400 border-2 border-gray-700 hover:border-orange-500'
                }`}
            >
              Contracts
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
                  onChange={(e) => {
                    const newValue = e.target.value;
                    setSelectedExpiration(newValue);
                    onExpirationChange?.(newValue);
                  }}
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

          {/* 90% Range P/C */}
          {expectedRangePCRatio && (
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
                  90% Range P/C
                </label>
                <div style={{
                  background: '#000000',
                  border: '1px solid #333333',
                  borderRadius: '8px',
                  padding: '10px 16px',
                  color: (() => {
                    if (expectedRangePCRatio === 'N/A' || expectedRangePCRatio === 'Error') return '#888888';
                    if (expectedRangePCRatio.startsWith('∞')) return '#ff6b6b';
                    const match = expectedRangePCRatio.match(/^([\d.]+)/);
                    if (match) {
                      const pcValue = parseFloat(match[1]);
                      if (!isNaN(pcValue)) {
                        if (pcValue >= 2.0) return '#ff0000';
                        if (pcValue <= 0.45) return '#00ff00';
                        return '#ffffff';
                      }
                    }
                    return '#00ff00';
                  })(),
                  fontSize: '14px',
                  fontWeight: '500',
                  minWidth: '180px',
                  textAlign: 'center' as const,
                  fontFamily: '"SF Mono", Consolas, monospace',
                  boxShadow: `
                  inset 0 2px 4px rgba(0, 0, 0, 0.6),
                  inset 0 -1px 0 rgba(255, 255, 255, 0.05),
                  0 1px 0 rgba(255, 255, 255, 0.1)
                `,
                  textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)'
                }}>
                  {expectedRangePCRatio}
                </div>
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

          {/* 45D P/C */}
          {cumulativePCRatio45Days && (
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
                  45D P/C
                </label>
                <div style={{
                  background: '#000000',
                  border: '1px solid #333333',
                  borderRadius: '8px',
                  padding: '10px 16px',
                  color: cumulativePCRatio45Days.startsWith('∞') ? '#ff6b6b' : cumulativePCRatio45Days === 'N/A' || cumulativePCRatio45Days === 'Error' ? '#888888' : '#00ff88',
                  fontSize: '14px',
                  fontWeight: '500',
                  minWidth: '140px',
                  textAlign: 'center' as const,
                  fontFamily: '"SF Mono", Consolas, monospace',
                  boxShadow: `
                  inset 0 2px 4px rgba(0, 0, 0, 0.6),
                  inset 0 -1px 0 rgba(255, 255, 255, 0.05),
                  0 1px 0 rgba(255, 255, 255, 0.1)
                `,
                  textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)'
                }}>
                  {cumulativePCRatio45Days}
                </div>
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

          {/* Action Buttons */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginLeft: 'auto',
            zIndex: 1
          }}>
            <button
              onClick={() => detectTowerStructures()}
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
                textTransform: 'uppercase' as const,
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
              AI
            </button>

            {towerStructures.length > 0 && (
              <button
                onClick={() => setShowTowers(!showTowers)}
                style={{
                  background: showTowers ? '#ffd700' : '#333333',
                  border: showTowers ? '1px solid #ffd700' : '1px solid #555555',
                  borderRadius: '8px',
                  color: showTowers ? '#000000' : '#999999',
                  padding: '10px 16px',
                  fontSize: '13px',
                  fontWeight: '600',
                  letterSpacing: '0.3px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  fontFamily: '"SF Pro Display", -apple-system, BlinkMacSystemFont, sans-serif',
                  textTransform: 'uppercase' as const,
                  boxShadow: showTowers
                    ? '0 2px 8px rgba(255, 215, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.3)'
                    : '0 1px 4px rgba(0, 0, 0, 0.4)',
                  textShadow: showTowers ? '0 1px 1px rgba(0, 0, 0, 0.3)' : 'none'
                }}
                onMouseEnter={(e) => {
                  if (showTowers) {
                    e.currentTarget.style.background = '#ffed4e';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  } else {
                    e.currentTarget.style.background = '#444444';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = showTowers ? '#ffd700' : '#333333';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                👑 Towers ({towerStructures.length})
              </button>
            )}

            {/* OI Filter Dropdown */}
            <select
              value={showNetOI ? 'net' : showCalls && showPuts ? 'both' : showCalls ? 'calls' : 'puts'}
              onChange={(e) => {
                const value = e.target.value;
                if (value === 'net') {
                  setShowNetOI(true);
                  setShowCalls(false);
                  setShowPuts(false);
                } else if (value === 'both') {
                  setShowNetOI(false);
                  setShowCalls(true);
                  setShowPuts(true);
                } else if (value === 'calls') {
                  setShowNetOI(false);
                  setShowCalls(true);
                  setShowPuts(false);
                } else if (value === 'puts') {
                  setShowNetOI(false);
                  setShowCalls(false);
                  setShowPuts(true);
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
                minWidth: '140px',
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
              <option value="both" style={{ background: '#000000', color: '#ffffff' }}>Calls + Puts</option>
              <option value="calls" style={{ background: '#000000', color: '#ffffff' }}>Calls Only</option>
              <option value="puts" style={{ background: '#000000', color: '#ffffff' }}>Puts Only</option>
              <option value="net" style={{ background: '#000000', color: '#ffffff' }}>Net OI</option>
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
