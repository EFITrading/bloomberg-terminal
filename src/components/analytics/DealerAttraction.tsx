import React, { useState, useEffect } from 'react';
import { RefreshCw, AlertCircle, TrendingUp, Activity } from 'lucide-react';

interface GEXData {
  strike: number;
  [key: string]: number | {call: number, put: number, net: number};
}

interface ServerGEXData {
  ticker: string;
  attractionLevel: number;
  dealerSweat: number;
  currentPrice: number;
  netGex: number;
  marketCap?: number;
  gexImpactScore?: number;
  largestWall?: {
    strike: number;
    gex: number;
    type: 'call' | 'put';
    pressure: number;
    cluster?: {
      strikes: number[];
      centralStrike: number;
      totalGEX: number;
      contributions: number[];
      type: 'call' | 'put';
    };
  };
}

interface OptionContract {
  ticker: string;
  expiration_date: string;
  strike_price: number;
  contract_type: 'call' | 'put';
}

const DealerAttraction = () => {
  const [data, setData] = useState<GEXData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expirations, setExpirations] = useState<string[]>([]);
  const [currentPrice, setCurrentPrice] = useState(0);
  const [selectedTicker, setSelectedTicker] = useState('SPY');
  const [tickerInput, setTickerInput] = useState('SPY');
  const [expirationFilter, setExpirationFilter] = useState('Daily');
  const [gexByStrikeByExpiration, setGexByStrikeByExpiration] = useState<{[expiration: string]: {[strike: number]: {call: number, put: number}}}>({});
  const [vexByStrikeByExpiration, setVexByStrikeByExpiration] = useState<{[expiration: string]: {[strike: number]: {call: number, put: number}}}>({});
  const [dexByStrikeByExpiration, setDexByStrikeByExpiration] = useState<{[expiration: string]: {[strike: number]: {call: number, put: number}}}>({});
  const [displayMode, setDisplayMode] = useState<'GEX' | 'DEX' | 'VEX'>('GEX');
  const [viewMode, setViewMode] = useState<'NET' | 'CP'>('NET'); // NET by default

  // Calculate Vanna from Vega using Black-Scholes
  const calculateVanna = (vega: number, delta: number, strike: number, spot: number, tte: number, iv: number): number => {
    if (!vega || !tte || tte <= 0 || !iv || iv <= 0) return 0;
    
    // Vanna = Vega * (d2 / (S * σ * √T))
    // Where d2 = d1 - σ√T
    // And d1 = [ln(S/K) + (r + σ²/2)T] / (σ√T)
    
    const sqrtT = Math.sqrt(tte);
    const d1 = (Math.log(spot / strike) + (0.5 * iv * iv * tte)) / (iv * sqrtT);
    const d2 = d1 - (iv * sqrtT);
    
    const vanna = vega * (d2 / (spot * iv * sqrtT));
    return vanna;
  };
  const [otmFilter, setOtmFilter] = useState<'2%' | '5%' | '10%' | '20%' | '100%'>('2%');
  const [progress, setProgress] = useState(0);
  const [dataCache, setDataCache] = useState<{[key: string]: any}>({});

  // Helper function to get strike range based on OTM filter
  const getStrikeRange = (price: number) => {
    const percentage = parseFloat(otmFilter.replace('%', '')) / 100;
    const range = price * percentage;
    return {
      min: price - range,
      max: price + range
    };
  };

  // Fetch detailed GEX data using Web Worker for ultra-fast parallel processing
  const fetchOptionsData = async () => {
    const totalStartTime = performance.now();
    console.log(`⏱️ [START] Loading ${selectedTicker}`);
    setLoading(true);
    setError(null);
    setProgress(0);
    
    try {
      // Check localStorage cache first (5 minute expiry)
      const cacheKey = `gex-${selectedTicker}-${expirationFilter}`;
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        try {
          const { data: cachedData, timestamp } = JSON.parse(cached);
          const age = Date.now() - timestamp;
          if (age < 5 * 60 * 1000) { // 5 minutes
            console.log(`📦 [CACHE HIT] Loaded from localStorage (${Math.round(age/1000)}s old)`);
            setCurrentPrice(cachedData.currentPrice);
            setExpirations(cachedData.expirations);
            setGexByStrikeByExpiration(cachedData.gexByStrikeByExp);
            setVexByStrikeByExpiration(cachedData.vexByStrikeByExp);
            setDexByStrikeByExpiration(cachedData.dexByStrikeByExp);
            setData(cachedData.formattedData);
            setLoading(false);
            return;
          }
        } catch (e) {
          console.warn('Cache parse error, fetching fresh data');
        }
      }
      
      // Check in-memory cache
      const memoryCacheKey = `${selectedTicker}-${expirationFilter}`;
      if (dataCache[memoryCacheKey]) {
        console.log(`📦 [MEMORY CACHE] Using cached data for ${memoryCacheKey}`);
        const cached = dataCache[memoryCacheKey];
        setCurrentPrice(cached.currentPrice);
        setExpirations(cached.expirations);
        setGexByStrikeByExpiration(cached.gexByStrikeByExp);
        setVexByStrikeByExpiration(cached.vexByStrikeByExp);
        setDexByStrikeByExpiration(cached.dexByStrikeByExp);
        
        const strikeRange = getStrikeRange(cached.currentPrice);
        const allStrikesArray = Array.from(cached.allStrikes as Set<number>);
        const relevantStrikes = allStrikesArray
          .filter((s) => s >= strikeRange.min && s <= strikeRange.max)
          .sort((a, b) => b - a);
        
        const formattedData = relevantStrikes.map((strike) => {
          const row: GEXData = { strike };
          cached.expirations.forEach((exp: string) => {
            if (displayMode === 'GEX') {
              const data = cached.gexByStrikeByExp[exp]?.[strike] || { call: 0, put: 0 };
              row[exp] = { call: data.call, put: data.put, net: data.call + data.put };
            } else if (displayMode === 'VEX') {
              const data = cached.vexByStrikeByExp[exp]?.[strike] || { call: 0, put: 0 };
              row[exp] = { call: data.call, put: data.put, net: data.call + data.put };
            } else {
              const data = cached.dexByStrikeByExp[exp]?.[strike] || { call: 0, put: 0 };
              row[exp] = { call: data.call, put: data.put, net: data.call + data.put };
            }
          });
          return row;
        });
        
        setData(formattedData);
        setLoading(false);
        return;
      }
      
      // First get options chain data
      const apiStartTime = performance.now();
      setProgress(10);
      await new Promise(resolve => setTimeout(resolve, 0)); // Force UI update
      
      const optionsResponse = await fetch(`/api/options-chain?ticker=${selectedTicker}`);
      const optionsResult = await optionsResponse.json();
      console.log(`🌐 [API] Options chain fetched in ${(performance.now() - apiStartTime).toFixed(0)}ms`);
      
      setProgress(20);
      await new Promise(resolve => setTimeout(resolve, 0)); // Force UI update
      
      if (!optionsResult.success || !optionsResult.data) {
        throw new Error(optionsResult.error || 'Failed to fetch options data');
      }
      
      const currentPrice = optionsResult.currentPrice;
      setCurrentPrice(currentPrice);
      
      // Get all available expiration dates, sorted
      const allExpirations = Object.keys(optionsResult.data).sort();
      
      // Filter expirations based on the selected filter using server-side logic
      let filteredExpirations: string[] = [];
      const today = new Date();
      
      // Helper function to parse expiration date correctly (avoid timezone issues)
      const parseExpirationDate = (dateStr: string): Date => {
        const [year, month, day] = dateStr.split('-').map(Number);
        return new Date(year, month - 1, day); // Local timezone, month is 0-indexed
      };
      
      // Helper function to check if a date is a Friday
      const isFriday = (date: Date): boolean => {
        return date.getDay() === 5; // Friday is day 5
      };
      
      // Helper function to check if it's a monthly expiration (3rd Friday of the month)
      const isMonthlyExpiration = (date: Date): boolean => {
        const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
        const firstFriday = new Date(firstDay);
        firstFriday.setDate(firstDay.getDate() + (5 - firstDay.getDay() + 7) % 7);
        const thirdFriday = new Date(firstFriday);
        thirdFriday.setDate(firstFriday.getDate() + 14);
        
        return date.getDate() === thirdFriday.getDate() && date.getMonth() === thirdFriday.getMonth();
      };
      
      // Helper function to check if it's a quarterly expiration (March, June, September, December)
      const isQuarterlyExpiration = (date: Date): boolean => {
        const month = date.getMonth(); // 0-based month
        return (month === 2 || month === 5 || month === 8 || month === 11) && isMonthlyExpiration(date);
      };
      
      const oneYearOut = new Date(today.getTime() + 365 * 24 * 60 * 60 * 1000);
      
      switch (expirationFilter) {
        case 'Daily':
          // Show all available expirations (daily if available) up to 1 month
          const monthOut = new Date(today.getTime() + 35 * 24 * 60 * 60 * 1000);
          filteredExpirations = allExpirations.filter(exp => parseExpirationDate(exp) <= monthOut);
          break;
        case 'Weekly':
          // Only Friday expirations up to 1 year
          filteredExpirations = allExpirations.filter(exp => {
            const expDate = parseExpirationDate(exp);
            return expDate <= oneYearOut && isFriday(expDate);
          });
          break;
        case 'Monthly':
          // Only monthly expirations (3rd Friday of each month) up to 1 year
          filteredExpirations = allExpirations.filter(exp => {
            const expDate = parseExpirationDate(exp);
            return expDate <= oneYearOut && isMonthlyExpiration(expDate);
          });
          break;
        case 'Quarterly':
          // Only quarterly expirations (March, June, September, December) up to 1 year
          filteredExpirations = allExpirations.filter(exp => {
            const expDate = parseExpirationDate(exp);
            return expDate <= oneYearOut && isQuarterlyExpiration(expDate);
          });
          break;
        case 'All':
          // All available expirations up to 1 year
          filteredExpirations = allExpirations.filter(exp => parseExpirationDate(exp) <= oneYearOut);
          break;
        default:
          // Default to Weekly
          filteredExpirations = allExpirations.filter(exp => {
            const expDate = parseExpirationDate(exp);
            return expDate <= oneYearOut && isFriday(expDate);
          });
      }
      
      setExpirations(filteredExpirations);
      
      // Calculate GEX/DEX/VANNA with async batching for progress updates
      console.log(`🔧 Starting calculation for ${filteredExpirations.length} expirations`);
      const calcStartTime = performance.now();
      setProgress(25);
      await new Promise(resolve => setTimeout(resolve, 0)); // Force UI update
      
      const gexByStrikeByExp: {[expiration: string]: {[strike: number]: {call: number, put: number}}} = {};
      const vexByStrikeByExp: {[expiration: string]: {[strike: number]: {call: number, put: number}}} = {};
      const dexByStrikeByExp: {[expiration: string]: {[strike: number]: {call: number, put: number}}} = {};
      const allStrikes = new Set<number>();
      
      // Smart batching: larger batches for more expirations
      const batchSize = filteredExpirations.length <= 10 ? filteredExpirations.length : 
                        filteredExpirations.length <= 30 ? 10 : 20;
      console.log(`📦 Using batch size: ${batchSize} for ${filteredExpirations.length} expirations`);
      
      for (let batchStart = 0; batchStart < filteredExpirations.length; batchStart += batchSize) {
        const batchEnd = Math.min(batchStart + batchSize, filteredExpirations.length);
        const batch = filteredExpirations.slice(batchStart, batchEnd);
        
        // Process this batch
        batch.forEach((expDate) => {
          const { calls, puts } = optionsResult.data[expDate];
          gexByStrikeByExp[expDate] = {};
          vexByStrikeByExp[expDate] = {};
          dexByStrikeByExp[expDate] = {};
          
          // Calculate time to expiration in years
          const expDateObj = new Date(expDate + 'T16:00:00'); // Options expire at 4pm ET
          const tte = Math.max(0, (expDateObj.getTime() - Date.now()) / (365.25 * 24 * 60 * 60 * 1000));
          
          // Process calls
          Object.entries(calls).forEach(([strike, data]: [string, any]) => {
            const strikeNum = parseFloat(strike);
            const oi = data.open_interest || 0;
            if (oi > 0) {
              const gamma = data.greeks?.gamma || 0;
              const vega = data.greeks?.vega || 0;
              const delta = data.greeks?.delta || 0;
              const iv = data.implied_volatility || 0.3; // Default 30% IV if missing
              
              // Initialize strike object if it doesn't exist
              if (!gexByStrikeByExp[expDate][strikeNum]) {
                gexByStrikeByExp[expDate][strikeNum] = { call: 0, put: 0 };
              }
              if (!vexByStrikeByExp[expDate][strikeNum]) {
                vexByStrikeByExp[expDate][strikeNum] = { call: 0, put: 0 };
              }
              if (!dexByStrikeByExp[expDate][strikeNum]) {
                dexByStrikeByExp[expDate][strikeNum] = { call: 0, put: 0 };
              }
              
              if (gamma) {
                const gex = gamma * oi * (currentPrice * currentPrice) * 100;
                gexByStrikeByExp[expDate][strikeNum].call += gex;
              }
              if (vega && tte > 0) {
                // Calculate Vanna instead of using raw Vega
                const vanna = calculateVanna(vega, delta, strikeNum, currentPrice, tte, iv);
                const vex = vanna * oi * 100;
                vexByStrikeByExp[expDate][strikeNum].call += vex;
              }
              if (delta) {
                const dex = delta * oi * currentPrice * 100;
                dexByStrikeByExp[expDate][strikeNum].call += dex;
              }
              allStrikes.add(strikeNum);
            }
          });
          
          // Process puts
          Object.entries(puts).forEach(([strike, data]: [string, any]) => {
            const strikeNum = parseFloat(strike);
            const oi = data.open_interest || 0;
            if (oi > 0) {
              const gamma = data.greeks?.gamma || 0;
              const vega = data.greeks?.vega || 0;
              const delta = data.greeks?.delta || 0;
              const iv = data.implied_volatility || 0.3; // Default 30% IV if missing
              
              // Initialize strike object if it doesn't exist
              if (!gexByStrikeByExp[expDate][strikeNum]) {
                gexByStrikeByExp[expDate][strikeNum] = { call: 0, put: 0 };
              }
              if (!vexByStrikeByExp[expDate][strikeNum]) {
                vexByStrikeByExp[expDate][strikeNum] = { call: 0, put: 0 };
              }
              if (!dexByStrikeByExp[expDate][strikeNum]) {
                dexByStrikeByExp[expDate][strikeNum] = { call: 0, put: 0 };
              }
              
              if (gamma) {
                const gex = -gamma * oi * (currentPrice * currentPrice) * 100;
                gexByStrikeByExp[expDate][strikeNum].put += gex;
              }
              if (vega && tte > 0) {
                // Calculate Vanna instead of using raw Vega
                const vanna = calculateVanna(vega, delta, strikeNum, currentPrice, tte, iv);
                const vex = vanna * oi * 100;
                vexByStrikeByExp[expDate][strikeNum].put += vex;
              }
              if (delta) {
                const dex = delta * oi * currentPrice * 100;
                dexByStrikeByExp[expDate][strikeNum].put += dex;
              }
              allStrikes.add(strikeNum);
            }
          });
        });
        
        // Update progress and yield to browser - FORCE UI UPDATE EVERY BATCH
        const prog = 25 + Math.round((batchEnd / filteredExpirations.length) * 65);
        setProgress(prog);
        console.log(`📊 Progress: ${prog}% (${batchEnd}/${filteredExpirations.length} expirations)`);
        
        // Always yield to UI for progress updates
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      
      console.log(`⚡ Calculations complete in ${(performance.now() - calcStartTime).toFixed(0)}ms`);
      
      setProgress(92);
      await new Promise(resolve => setTimeout(resolve, 0)); // Force UI update
      
      setGexByStrikeByExpiration(gexByStrikeByExp);
      setVexByStrikeByExpiration(vexByStrikeByExp);
      setDexByStrikeByExpiration(dexByStrikeByExp);
      setProgress(95);
      await new Promise(resolve => setTimeout(resolve, 0)); // Force UI update
      
      // Format and display data
      const strikeRange = getStrikeRange(currentPrice);
      const relevantStrikes = Array.from(allStrikes)
        .filter(s => s >= strikeRange.min && s <= strikeRange.max)
        .sort((a, b) => b - a);
      
      const formattedData = relevantStrikes.map(strike => {
        const row: GEXData = { strike };
        filteredExpirations.forEach(exp => {
          if (displayMode === 'GEX') {
            const data = gexByStrikeByExp[exp]?.[strike] || { call: 0, put: 0 };
            row[exp] = { call: data.call, put: data.put, net: data.call + data.put };
          } else if (displayMode === 'VEX') {
            const data = vexByStrikeByExp[exp]?.[strike] || { call: 0, put: 0 };
            row[exp] = { call: data.call, put: data.put, net: data.call + data.put };
          } else {
            const data = dexByStrikeByExp[exp]?.[strike] || { call: 0, put: 0 };
            row[exp] = { call: data.call, put: data.put, net: data.call + data.put };
          }
        });
        return row;
      });
      
      setData(formattedData);
      setProgress(100);
      setLoading(false);
      
      const totalTime = (performance.now() - totalStartTime).toFixed(0);
      console.log(`✅ [COMPLETE] Total load time: ${totalTime}ms | ${relevantStrikes.length} strikes × ${filteredExpirations.length} expirations`);
      
      // Save to localStorage for next time
      const lsCacheKey = `gex-${selectedTicker}-${expirationFilter}`;
      try {
        localStorage.setItem(lsCacheKey, JSON.stringify({
          timestamp: Date.now(),
          data: {
            currentPrice,
            expirations: filteredExpirations,
            gexByStrikeByExp,
            vexByStrikeByExp,
            dexByStrikeByExp,
            formattedData
          }
        }));
      } catch (e) {
        console.warn('Failed to save to localStorage:', e);
      }
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOptionsData();
  }, [selectedTicker, expirationFilter]);

  // Update data when display mode or OTM filter changes
  useEffect(() => {
    if (gexByStrikeByExpiration && vexByStrikeByExpiration && dexByStrikeByExpiration && Object.keys(gexByStrikeByExpiration).length > 0) {
      const strikeRange = getStrikeRange(currentPrice);
      const relevantStrikes = Array.from(new Set([
        ...Object.values(gexByStrikeByExpiration).flatMap(exp => Object.keys(exp).map(Number)),
        ...Object.values(vexByStrikeByExpiration).flatMap(exp => Object.keys(exp).map(Number)),
        ...Object.values(dexByStrikeByExpiration).flatMap(exp => Object.keys(exp).map(Number))
      ]))
        .filter(s => s >= strikeRange.min && s <= strikeRange.max)
        .sort((a, b) => b - a);

      const formattedData = relevantStrikes.map(strike => {
        const row: GEXData = { strike };
        expirations.forEach(exp => {
          if (displayMode === 'GEX') {
            const data = gexByStrikeByExpiration[exp]?.[strike] || { call: 0, put: 0 };
            row[exp] = { call: data.call, put: data.put, net: data.call + data.put };
          } else if (displayMode === 'VEX') {
            const data = vexByStrikeByExpiration[exp]?.[strike] || { call: 0, put: 0 };
            row[exp] = { call: data.call, put: data.put, net: data.call + data.put };
          } else {
            const data = dexByStrikeByExpiration[exp]?.[strike] || { call: 0, put: 0 };
            row[exp] = { call: data.call, put: data.put, net: data.call + data.put };
          }
        });
        return row;
      });
      
      setData(formattedData);
    }
  }, [displayMode, viewMode, gexByStrikeByExpiration, vexByStrikeByExpiration, dexByStrikeByExpiration, currentPrice, expirations, otmFilter]);

  const handleTickerSubmit = () => {
    const newTicker = tickerInput.trim().toUpperCase();
    if (newTicker && newTicker !== selectedTicker) {
      console.log(`Changing ticker from ${selectedTicker} to ${newTicker}`);
      setSelectedTicker(newTicker);
      setTickerInput(newTicker); // Ensure input stays synchronized
    }
  };

  // Sync tickerInput with selectedTicker when selectedTicker changes
  useEffect(() => {
    setTickerInput(selectedTicker);
  }, [selectedTicker]);

  const formatCurrency = (value: number) => {
    const absValue = Math.abs(value);
    const sign = value < 0 ? '-' : value > 0 ? '+' : '';
    
    if (absValue >= 1e9) {
      return `${sign}${(absValue / 1e9).toFixed(2)}B`;
    } else if (absValue >= 1e6) {
      return `${sign}${(absValue / 1e6).toFixed(1)}M`;
    } else if (absValue >= 1000) {
      return `${sign}${(absValue / 1000).toFixed(1)}K`;
    } else if (absValue > 0) {
      return `${sign}${absValue.toFixed(0)}`;
    }
    return '0';
  };

  const getTopValues = () => {
    const allValues = data.flatMap(row => 
      expirations.flatMap(exp => {
        const value = row[exp] as {call: number, put: number, net: number};
        if (viewMode === 'NET') {
          return [Math.abs(value?.net || 0)];
        } else {
          return [Math.abs(value?.call || 0), Math.abs(value?.put || 0)];
        }
      })
    ).filter(v => v > 0);
    
    const sorted = [...allValues].sort((a, b) => b - a);
    return {
      highest: sorted[0] || 0,
      second: sorted[1] || 0,
      third: sorted[2] || 0,
      top10: sorted.slice(3, 10) // 4th through 10th highest values
    };
  };

  const getCellStyle = (value: number) => {
    const absValue = Math.abs(value);
    const tops = getTopValues();
    
    if (displayMode === 'GEX') {
      // GEX Color Scheme
      // 1st - Gold (largest absolute value, positive or negative)
      if (absValue === tops.highest && absValue > 0) {
        return 'bg-gradient-to-br from-yellow-400 to-yellow-600 text-black font-bold shadow-lg shadow-yellow-500/50';
      }
      // 2nd - Purple (second largest absolute value, positive or negative)
      if (absValue === tops.second && absValue > 0) {
        return 'bg-gradient-to-br from-purple-500 to-purple-700 text-white font-bold shadow-lg shadow-purple-500/50';
      }
      // 3rd - Lime Green (third largest absolute value, positive or negative)
      if (absValue === tops.third && absValue > 0) {
        return 'bg-gradient-to-br from-lime-400 to-lime-600 text-black font-bold shadow-lg shadow-lime-500/50';
      }
      // 4th-10th - Light Blue (4th through 10th largest absolute values, positive or negative)
      if (tops.top10.includes(absValue) && absValue > 0) {
        return 'bg-gradient-to-br from-blue-400 to-blue-600 text-white font-bold shadow-lg shadow-blue-500/50';
      }
    } else if (displayMode === 'VEX') {
      // VANNA Color Scheme (measures delta sensitivity to IV changes)
      // 1st - Red (largest VANNA value)
      if (absValue === tops.highest && absValue > 0) {
        return 'bg-gradient-to-br from-red-500 to-red-700 text-white font-bold shadow-lg shadow-red-500/50';
      }
      // 2nd - Pink (second largest VANNA value)
      if (absValue === tops.second && absValue > 0) {
        return 'bg-gradient-to-br from-pink-400 to-pink-600 text-white font-bold shadow-lg shadow-pink-500/50';
      }
      // 3rd - Orange (third largest VANNA value)
      if (absValue === tops.third && absValue > 0) {
        return 'bg-gradient-to-br from-orange-400 to-orange-600 text-black font-bold shadow-lg shadow-orange-500/50';
      }
      // 4th-10th - Light Blue (4th through 10th largest VANNA values)
      if (tops.top10.includes(absValue) && absValue > 0) {
        return 'bg-gradient-to-br from-blue-400 to-blue-600 text-white font-bold shadow-lg shadow-blue-500/50';
      }
    } else {
      // DEX Color Scheme
      // 1st - Emerald Green (largest DEX value)
      if (absValue === tops.highest && absValue > 0) {
        return 'bg-gradient-to-br from-emerald-400 to-emerald-600 text-black font-bold shadow-lg shadow-emerald-500/50';
      }
      // 2nd - Teal (second largest DEX value)
      if (absValue === tops.second && absValue > 0) {
        return 'bg-gradient-to-br from-teal-400 to-teal-600 text-white font-bold shadow-lg shadow-teal-500/50';
      }
      // 3rd - Cyan (third largest DEX value)
      if (absValue === tops.third && absValue > 0) {
        return 'bg-gradient-to-br from-cyan-400 to-cyan-600 text-black font-bold shadow-lg shadow-cyan-500/50';
      }
      // 4th-10th - Sky Blue (4th through 10th largest DEX values)
      if (tops.top10.includes(absValue) && absValue > 0) {
        return 'bg-gradient-to-br from-sky-400 to-sky-600 text-white font-bold shadow-lg shadow-sky-500/50';
      }
    }
    
    // Everything else - Black
    if (value !== 0) {
      return 'bg-gradient-to-br from-black to-gray-900 text-white border border-gray-700/30';
    }
    return 'bg-gradient-to-br from-gray-950 to-black text-gray-400 border border-gray-800/30';
  };

  const formatDate = (dateStr: string) => {
    // Parse as local date to avoid timezone conversion issues
    // Split the date string (e.g., "2025-10-31") and create date in local timezone
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day); // month is 0-indexed in Date constructor
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      timeZone: 'America/New_York' // Use ET timezone for options expiration consistency
    });
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950 text-white p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-950/50 border border-red-800/50 rounded-xl p-6 backdrop-blur">
            <div className="flex items-center gap-3 text-red-400">
              <AlertCircle size={24} />
              <div>
                <div className="font-semibold text-lg">Error Loading Data</div>
                <div className="text-sm text-red-300 mt-1">{error}</div>
              </div>
            </div>
            <button 
              onClick={fetchOptionsData}
              className="mt-4 px-6 py-3 bg-red-600 hover:bg-red-700 transition-all rounded-lg font-medium"
            >
              Retry Connection
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950 text-white">
      <style>{`
        /* Custom scrollbar styling */
        .overflow-x-auto::-webkit-scrollbar,
        .overflow-y-auto::-webkit-scrollbar {
          width: 12px;
          height: 12px;
          background-color: #000000;
        }
        
        .overflow-x-auto::-webkit-scrollbar-track,
        .overflow-y-auto::-webkit-scrollbar-track {
          background-color: #000000;
        }
        
        .overflow-x-auto::-webkit-scrollbar-thumb,
        .overflow-y-auto::-webkit-scrollbar-thumb {
          background-color: #1f2937;
          border: 2px solid #000000;
        }
        
        .overflow-x-auto::-webkit-scrollbar-thumb:hover,
        .overflow-y-auto::-webkit-scrollbar-thumb:hover {
          background-color: #374151;
        }
        
        @media (max-width: 768px) {
          .dealer-attraction-container {
            padding-top: 30px !important;
          }
        }
      `}</style>
      <div className="p-6 pt-24 md:pt-6 dealer-attraction-container">
        <div className="max-w-[95vw] mx-auto">
          {/* Bloomberg Terminal Header */}
          <div className="mb-6 bg-black border border-gray-600/40">
            {/* Control Panel */}
            <div className="bg-black border-y border-gray-800">
              <div className="px-4 md:px-8 py-3 md:py-6">
                {/* Premium Tabs - Now at top of control panel */}
                <div className="flex gap-0 w-full mb-4">
                  <button className="flex-1 font-black uppercase tracking-[0.15em] transition-all bg-black text-orange-500 hover:text-white border-2 border-gray-800 hover:border-orange-500 hover:shadow-[0_0_15px_rgba(255,102,0,0.3)]" style={{ padding: '14px 16px', fontSize: '10px' }}>
                    WORKBENCH
                  </button>
                  <button className="flex-1 font-black uppercase tracking-[0.15em] transition-all bg-black text-orange-500 hover:text-white border-2 border-gray-800 hover:border-orange-500 hover:shadow-[0_0_15px_rgba(255,102,0,0.3)]" style={{ padding: '14px 16px', fontSize: '10px' }}>
                    ATTRACTION
                  </button>
                  <button className="relative flex-1 font-black uppercase tracking-[0.15em] transition-all text-white border-2 border-orange-500 shadow-[0_0_20px_rgba(255,102,0,0.4),inset_0_1px_0_rgba(255,255,255,0.1)]" style={{ padding: '14px 16px', fontSize: '10px' }}>
                    <div className="absolute inset-0 bg-gradient-to-b from-orange-500/20 to-transparent"></div>
                    <span className="relative" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>OTM PREMIUM</span>
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  {/* Left Controls */}
                  <div className="flex items-center gap-4 md:gap-8">
                    {/* Ticker Search */}
                    <div className="flex flex-col md:flex-row items-start md:items-center gap-2 md:gap-4">
                      <div className="relative flex items-center">
                        <div className="search-bar-premium flex items-center space-x-2 px-3 py-2 rounded-md">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ color: 'rgba(128, 128, 128, 0.5)' }}>
                            <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/>
                            <path d="m21 21-4.35-4.35" stroke="currentColor" strokeWidth="2"/>
                          </svg>
                          <input
                            type="text"
                            value={tickerInput}
                            onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleTickerSubmit();
                              }
                            }}
                            className="bg-transparent border-0 outline-none w-28 text-lg font-bold uppercase"
                            style={{
                              color: '#ffffff',
                              textShadow: '0 0 5px rgba(128, 128, 128, 0.2), 0 1px 2px rgba(0, 0, 0, 0.8)',
                              fontFamily: 'system-ui, -apple-system, sans-serif',
                              letterSpacing: '0.8px'
                            }}
                            placeholder="Search..."
                          />
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ color: '#666' }}>
                            <path d="M12 5v14l7-7-7-7z" fill="currentColor"/>
                          </svg>
                        </div>
                      </div>
                      

                    </div>
                    
                    {/* Expiration & OTM Dropdowns - Stacked on mobile, side-by-side on desktop */}
                    <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-8">
                      {/* Expiration Dropdown */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white uppercase tracking-wider">EXPIRATION</span>
                        <div className="relative">
                          <select
                            value={expirationFilter}
                            onChange={(e) => setExpirationFilter(e.target.value)}
                            className="bg-black border-2 border-gray-800 focus:border-orange-500 focus:outline-none px-4 py-2.5 pr-10 text-white text-sm font-bold uppercase appearance-none cursor-pointer min-w-[100px] transition-all"
                          >
                            <option value="Daily">DAILY</option>
                            <option value="Weekly">WEEKLY</option>
                            <option value="Monthly">MONTHLY</option>
                            <option value="Quarterly">QUARTERLY</option>
                            <option value="All">ALL</option>
                          </select>
                          <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                            <svg className="w-4 h-4 text-orange-500" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                          </div>
                        </div>
                      </div>

                      {/* OTM Filter Dropdown */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white uppercase tracking-wider">OTM RANGE</span>
                        <div className="relative">
                          <select
                            value={otmFilter}
                            onChange={(e) => setOtmFilter(e.target.value as '2%' | '5%' | '10%' | '20%' | '100%')}
                            className="bg-black border-2 border-gray-800 focus:border-orange-500 focus:outline-none px-4 py-2.5 pr-10 text-white text-sm font-bold uppercase appearance-none cursor-pointer min-w-[90px] transition-all"
                          >
                            <option value="2%">±2%</option>
                            <option value="5%">±5%</option>
                            <option value="10%">±10%</option>
                            <option value="20%">±20%</option>
                            <option value="100%">±100%</option>
                          </select>
                          <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                            <svg className="w-4 h-4 text-orange-500" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                          </div>
                        </div>
                      </div>
                      
                      {/* Mobile NET/C/P Toggle and Refresh - Below OTM on mobile */}
                      <div className="md:hidden flex gap-2">
                        <button
                          onClick={() => setViewMode(viewMode === 'NET' ? 'CP' : 'NET')}
                          className={`flex-1 px-3 py-2.5 font-bold text-sm uppercase tracking-wide transition-all duration-200 bg-black border-2 ${
                            viewMode === 'NET' 
                              ? 'text-blue-500 border-blue-500' 
                              : 'text-orange-500 border-orange-500'
                          }`}
                        >
                          {viewMode === 'NET' ? 'NET' : 'C/P'}
                        </button>
                        <button
                          onClick={fetchOptionsData}
                          disabled={loading}
                          className="flex-1 flex items-center gap-2 px-5 py-2.5 bg-black hover:bg-gray-900 border-2 border-gray-800 hover:border-orange-500 text-white hover:text-orange-500 font-bold text-sm uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 justify-center"
                        >
                          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                          {loading ? 'UPDATING' : 'REFRESH'}
                        </button>
                      </div>
                    </div>


                  </div>
                  
                  {/* GEX, DEX & VANNA Buttons */}
                  <div className="flex flex-col md:flex-row items-start md:items-center gap-2">
                    <button
                      onClick={() => setDisplayMode('GEX')}
                      className={`relative px-3 py-1.5 font-bold text-sm md:text-xs uppercase tracking-wide transition-all duration-200 bg-black border-2 ${
                        displayMode === 'GEX' 
                          ? 'text-purple-500 border-purple-500' 
                          : 'text-purple-500/50 border-gray-800 hover:text-purple-500 hover:border-purple-500'
                      }`}
                    >
                      GAMMA EXPOSURE
                    </button>
                    <button
                      onClick={() => setDisplayMode('DEX')}
                      className={`relative px-3 py-1.5 font-bold text-sm md:text-xs uppercase tracking-wide transition-all duration-200 bg-black border-2 ${
                        displayMode === 'DEX' 
                          ? 'text-yellow-500 border-yellow-500' 
                          : 'text-yellow-500/50 border-gray-800 hover:text-yellow-500 hover:border-yellow-500'
                      }`}
                    >
                      DELTA EXPOSURE
                    </button>
                    <button
                      onClick={() => setDisplayMode('VEX')}
                      className={`relative px-3 py-1.5 font-bold text-sm md:text-xs uppercase tracking-wide transition-all duration-200 bg-black border-2 ${
                        displayMode === 'VEX' 
                          ? 'text-green-500 border-green-500' 
                          : 'text-green-500/50 border-gray-800 hover:text-green-500 hover:border-green-500'
                      }`}
                    >
                      VANNA EXPOSURE
                    </button>
                    {/* NET/C/P Toggle Button */}
                    <button
                      onClick={() => setViewMode(viewMode === 'NET' ? 'CP' : 'NET')}
                      className={`relative px-3 py-1.5 font-bold text-sm md:text-xs uppercase tracking-wide transition-all duration-200 bg-black border-2 ${
                        viewMode === 'NET' 
                          ? 'text-blue-500 border-blue-500' 
                          : 'text-orange-500 border-orange-500'
                      }`}
                    >
                      {viewMode === 'NET' ? 'NET' : 'C/P'}
                    </button>
                    <div className="hidden md:block w-px h-10 bg-gray-800 mx-2"></div>
                    {/* Desktop Refresh Button */}
                    <button
                      onClick={fetchOptionsData}
                      disabled={loading}
                      className="hidden md:flex items-center gap-2 px-5 py-2.5 bg-black hover:bg-gray-900 border-2 border-gray-800 hover:border-orange-500 text-white hover:text-orange-500 font-bold text-sm uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
                    >
                      <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                      {loading ? 'UPDATING' : 'REFRESH'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {loading && data.length === 0 ? (
            <div className="text-center py-32 bg-gradient-to-r from-gray-900/50 to-gray-800/50 backdrop-blur-xl rounded-2xl border border-gray-700/50">
              <RefreshCw size={48} className="animate-spin mx-auto mb-6 text-blue-400" />
              <p className="text-xl font-semibold text-gray-300">Loading Real Market Data</p>
              <p className="text-sm text-gray-500 mt-2">Fetching options chains and calculating dealer attraction levels...</p>
              
              {/* Web Worker Progress Bar */}
              {progress > 0 && (
                <div className="mt-6 mx-auto max-w-md">
                  <div className="relative w-full h-3 bg-gray-800 rounded-full overflow-hidden border border-gray-700">
                    <div 
                      className="absolute top-0 left-0 h-full bg-gradient-to-r from-blue-500 to-blue-400 transition-all duration-300 ease-out shadow-lg shadow-blue-500/50"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-2">Processing: {progress}%</p>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="bg-gray-900 border border-gray-700 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-700 bg-gray-800">
                        <th className="px-6 py-4 text-left sticky left-0 bg-black z-10 border-r border-gray-700">
                          <div className="text-xs font-bold text-white uppercase">Strike</div>
                        </th>
                        {expirations.map(exp => (
                          <th key={exp} className={`text-center bg-gray-900 border-l border-r border-gray-800 ${viewMode === 'NET' ? 'min-w-[120px] max-w-[120px]' : ''}`}>
                            <div className="text-xs font-bold text-white uppercase px-2 py-2 bg-gray-800 border border-gray-700 mb-2">
                              {formatDate(exp)}
                            </div>
                            {viewMode === 'CP' ? (
                              <div className="flex">
                                <div className="flex-1 text-xs font-bold text-green-400 uppercase px-2 py-1 bg-gray-800 border-r border-gray-700">
                                  CALL
                                </div>
                                <div className="flex-1 text-xs font-bold text-red-400 uppercase px-2 py-1 bg-gray-800">
                                  PUT
                                </div>
                              </div>
                            ) : (
                              <div className="text-xs font-bold text-blue-400 uppercase px-2 py-1 bg-gray-800">
                                NET
                              </div>
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.map((row, idx) => {
                        // Find the single closest strike to current price
                        const closestStrike = currentPrice > 0 ? data.reduce((closest, current) => 
                          Math.abs(current.strike - currentPrice) < Math.abs(closest.strike - currentPrice) ? current : closest
                        ).strike : 0;
                        
                        // Find the strike with the largest absolute value within current expirations (GEX or VEX)
                        const largestValueStrike = data.reduce((largest, current) => {
                          const currentMaxValue = Math.max(...expirations.map(exp => {
                            const value = current[exp] as {call: number, put: number, net: number};
                            if (viewMode === 'NET') {
                              return Math.abs(value?.net || 0);
                            } else {
                              return Math.max(Math.abs(value?.call || 0), Math.abs(value?.put || 0));
                            }
                          }));
                          const largestMaxValue = Math.max(...expirations.map(exp => {
                            const value = largest[exp] as {call: number, put: number, net: number};
                            if (viewMode === 'NET') {
                              return Math.abs(value?.net || 0);
                            } else {
                              return Math.max(Math.abs(value?.call || 0), Math.abs(value?.put || 0));
                            }
                          }));
                          return currentMaxValue > largestMaxValue ? current : largest;
                        }).strike;
                        
                        const isCurrentPriceRow = currentPrice > 0 && row.strike === closestStrike;
                        const isLargestValueRow = row.strike === largestValueStrike;
                        
                        return (
                          <tr 
                            key={idx} 
                            className={`border-b border-gray-800/30 hover:bg-gray-800/20 transition-colors ${
                              isCurrentPriceRow ? 'bg-yellow-900/20 border-yellow-500/40' : 
                              isLargestValueRow ? 'bg-purple-900/20 border-purple-500/40' : ''
                            }`}
                          >
                            <td className={`px-6 py-4 font-bold sticky left-0 z-10 border-r border-gray-700/30 ${
                              isCurrentPriceRow ? 'bg-yellow-800/30' : 
                              isLargestValueRow ? 'bg-purple-800/30' : 'bg-black'
                            }`}>
                              <div className={`text-base font-mono font-bold ${
                                isCurrentPriceRow ? 'text-yellow-300' : 
                                isLargestValueRow ? 'text-purple-300' : 'text-white'
                              }`} style={{
                                textShadow: isCurrentPriceRow ? '0 0 12px rgba(234, 179, 8, 0.8)' : 
                                           isLargestValueRow ? '0 0 15px rgba(147, 51, 234, 0.9)' : 
                                           '0 0 8px rgba(255,255,255,0.5)'
                              }}>
                                {row.strike.toFixed(1)}
                                {isCurrentPriceRow && <span className="ml-2 text-xs text-yellow-400">● CURRENT</span>}
                              </div>
                            </td>
                            {expirations.map(exp => {
                              const value = row[exp] as {call: number, put: number, net: number};
                              const callValue = value?.call || 0;
                              const putValue = value?.put || 0;
                              const netValue = value?.net || 0;
                              return (
                                <td
                                  key={exp}
                                  className={`${viewMode === 'NET' ? 'px-2' : 'px-1'} py-3 ${
                                    isCurrentPriceRow ? 'bg-yellow-900/15' : 
                                    isLargestValueRow ? 'bg-purple-900/15' : ''
                                  }`}
                                >
                                  {viewMode === 'CP' ? (
                                    <div className="flex gap-1">
                                      <div className={`${getCellStyle(callValue)} px-2 py-2 rounded-lg text-center font-mono text-xs flex-1 transition-all hover:scale-105 ${
                                        isCurrentPriceRow ? 'ring-1 ring-yellow-500/40' : 
                                        isLargestValueRow ? 'ring-1 ring-purple-500/50' : ''
                                      }`}>
                                        {formatCurrency(callValue)}
                                      </div>
                                      <div className={`${getCellStyle(putValue)} px-2 py-2 rounded-lg text-center font-mono text-xs flex-1 transition-all hover:scale-105 ${
                                        isCurrentPriceRow ? 'ring-1 ring-yellow-500/40' : 
                                        isLargestValueRow ? 'ring-1 ring-purple-500/50' : ''
                                      }`}>
                                        {formatCurrency(putValue)}
                                      </div>
                                    </div>
                                  ) : (
                                    <div className={`${getCellStyle(netValue)} px-3 py-2 rounded-lg text-center font-mono text-sm transition-all hover:scale-105 ${
                                      isCurrentPriceRow ? 'ring-2 ring-yellow-500/40' : 
                                      isLargestValueRow ? 'ring-2 ring-purple-500/50' : ''
                                    }`}>
                                      {formatCurrency(netValue)}
                                    </div>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>


            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default DealerAttraction;