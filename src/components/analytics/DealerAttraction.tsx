import React, { useState, useEffect, useMemo } from 'react';
import { RefreshCw, AlertCircle, TrendingUp, Activity } from 'lucide-react';

interface GEXData {
  strike: number;
  [key: string]: number | {call: number, put: number, net: number, callOI: number, putOI: number, callPremium?: number, putPremium?: number};
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
  const [gexByStrikeByExpiration, setGexByStrikeByExpiration] = useState<{[expiration: string]: {[strike: number]: {call: number, put: number, callOI: number, putOI: number}}}>({});
  const [viewMode, setViewMode] = useState<'NET' | 'CP'>('CP'); // C/P by default
  const [analysisType, setAnalysisType] = useState<'GEX' | 'PREMIUM'>('GEX'); // Gamma Exposure by default
  const [premiumByStrikeByExpiration, setPremiumByStrikeByExpiration] = useState<{[expiration: string]: {[strike: number]: {call: number, put: number, callOI: number, putOI: number}}}>({});
  const [showGEX, setShowGEX] = useState(true);
  const [gexMode, setGexMode] = useState<'GEX' | 'LIVE_GEX' | 'NET'>('GEX');
  const [showPremium, setShowPremium] = useState(false);
  const [premiumMode, setPremiumMode] = useState<'PREMIUM' | 'LIVE' | 'NET'>('PREMIUM');
  const [showOI, setShowOI] = useState(false);
  const [oiMode, setOiMode] = useState<'OI' | 'LIVE_OI'>('OI');

  // Helper function to filter expirations to 3 months max
  const filterTo3Months = (expirations: string[]) => {
    const threeMonthsFromNow = new Date();
    threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3);
    
    return expirations.filter(exp => {
      const expDate = new Date(exp);
      return expDate <= threeMonthsFromNow;
    });
  };



  const [otmFilter, setOtmFilter] = useState<'2%' | '5%' | '10%' | '20%' | '100%'>('2%');
  const [progress, setProgress] = useState(0);


  // Helper function to get strike range based on OTM filter
  const getStrikeRange = (price: number) => {
    const percentage = parseFloat(otmFilter.replace('%', '')) / 100;
    const range = price * percentage;
    return {
      min: price - range,
      max: price + range
    };
  };

  // Fetch option prices in parallel batches for premium calculation
  const fetchOptionPrices = async (optionsContracts: {exp: string, strike: number, type: 'call' | 'put', oi: number}[]) => {
    const batchSize = 50; // Process 50 options at a time
    const results: {[key: string]: number} = {};
    const apiKey = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';
    
    for (let i = 0; i < optionsContracts.length; i += batchSize) {
      const batch = optionsContracts.slice(i, i + batchSize);
      
      // Create promises for this batch
      const batchPromises = batch.map(async (contract) => {
        try {
          // Format option ticker: O:SPY251103P00682000
          const expDateFormatted = contract.exp.replace(/-/g, '').substring(2); // Remove dashes and century
          const strikeFormatted = String(contract.strike * 1000).padStart(8, '0');
          const optionType = contract.type === 'call' ? 'C' : 'P';
          const optionTicker = `O:${selectedTicker}${expDateFormatted}${optionType}${strikeFormatted}`;
          
          // Use direct Polygon API call
          const response = await fetch(`https://api.polygon.io/v3/snapshot/options/${selectedTicker}/${optionTicker}?apikey=${apiKey}`);
          const data = await response.json();
          
          if (data.results?.last_quote?.ask && data.results.last_quote.ask > 0) {
            return {
              key: `${contract.exp}_${contract.strike}_${contract.type}`,
              price: data.results.last_quote.ask,
              oi: contract.oi
            };
          }
          
          return null;
        } catch (err) {
          console.error(`Error fetching price for ${contract.type} ${contract.strike}:`, err);
          return null;
        }
      });
      
      // Wait for batch to complete
      const batchResults = await Promise.all(batchPromises);
      
      // Process results
      batchResults.forEach(result => {
        if (result) {
          results[result.key] = result.price;
        }
      });
      
      // Update progress
      const progress = 95 + Math.round((i / optionsContracts.length) * 5);
      setProgress(progress);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    
    return results;
  };



  // Fetch detailed GEX data using Web Worker for ultra-fast parallel processing
  const fetchOptionsData = async () => {
    const totalStartTime = performance.now();
    setLoading(true);
    setError(null);
    setProgress(0);
    

    
    try {
      // Get options chain data
      const apiStartTime = performance.now();
      setProgress(10);
      await new Promise(resolve => setTimeout(resolve, 0)); // Force UI update
      
      const optionsResponse = await fetch(`/api/options-chain?ticker=${selectedTicker}`);
      const optionsResult = await optionsResponse.json();
      
      setProgress(20);
      await new Promise(resolve => setTimeout(resolve, 0)); // Force UI update
      
      if (!optionsResult.success || !optionsResult.data) {
        throw new Error(optionsResult.error || 'Failed to fetch options data');
      }
      
      const currentPrice = optionsResult.currentPrice;
      setCurrentPrice(currentPrice);
      

      
      // Get all available expiration dates, sorted
      const allExpirations = Object.keys(optionsResult.data).sort();
      
      // Filter to only 3 months max for performance
      const allAvailableExpirations = filterTo3Months(allExpirations);
      

      
      setExpirations(allAvailableExpirations);
      
      // Calculate GEX for all expiration dates with async batching for progress updates
      const calcStartTime = performance.now();
      setProgress(25);
      await new Promise(resolve => setTimeout(resolve, 0)); // Force UI update
      
      const gexByStrikeByExp: {[expiration: string]: {[strike: number]: {call: number, put: number, callOI: number, putOI: number}}} = {};
      const allStrikes = new Set<number>();
      
      // Smart batching: larger batches for more expirations
      const batchSize = allAvailableExpirations.length <= 10 ? allAvailableExpirations.length : 
                        allAvailableExpirations.length <= 30 ? 10 : 20;
      
      for (let batchStart = 0; batchStart < allAvailableExpirations.length; batchStart += batchSize) {
        const batchEnd = Math.min(batchStart + batchSize, allAvailableExpirations.length);
        const batch = allAvailableExpirations.slice(batchStart, batchEnd);
        
        // Process this batch
        batch.forEach((expDate) => {
          const { calls, puts } = optionsResult.data[expDate];
          gexByStrikeByExp[expDate] = {};
          
          // Process calls
          Object.entries(calls).forEach(([strike, data]: [string, any]) => {
            const strikeNum = parseFloat(strike);
            let oi = data.open_interest || 0;
            
            if (oi > 0) {
              const gamma = data.greeks?.gamma || 0;
              
              // Initialize strike object if it doesn't exist
              if (!gexByStrikeByExp[expDate][strikeNum]) {
                gexByStrikeByExp[expDate][strikeNum] = { call: 0, put: 0, callOI: 0, putOI: 0 };
              }
              
              if (gamma) {
                const gex = gamma * oi * (currentPrice * currentPrice) * 100;
                gexByStrikeByExp[expDate][strikeNum].call += gex;
              }
              gexByStrikeByExp[expDate][strikeNum].callOI += oi;
              allStrikes.add(strikeNum);
            }
          });
          
          // Process puts
          Object.entries(puts).forEach(([strike, data]: [string, any]) => {
            const strikeNum = parseFloat(strike);
            let oi = data.open_interest || 0;
            
            if (oi > 0) {
              const gamma = data.greeks?.gamma || 0;
              
              // Initialize strike object if it doesn't exist
              if (!gexByStrikeByExp[expDate][strikeNum]) {
                gexByStrikeByExp[expDate][strikeNum] = { call: 0, put: 0, callOI: 0, putOI: 0 };
              }
              
              if (gamma) {
                const gex = -gamma * oi * (currentPrice * currentPrice) * 100;
                gexByStrikeByExp[expDate][strikeNum].put += gex;
              }
              gexByStrikeByExp[expDate][strikeNum].putOI += oi;
              allStrikes.add(strikeNum);
            }
          });
        });
        
        // Update progress and yield to browser - FORCE UI UPDATE EVERY BATCH
        const prog = 25 + Math.round((batchEnd / allAvailableExpirations.length) * 65);
        setProgress(prog);
        
        // Always yield to UI for progress updates
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      

      
      setProgress(92);
      await new Promise(resolve => setTimeout(resolve, 0)); // Force UI update
      
      setGexByStrikeByExpiration(gexByStrikeByExp);
      setProgress(90);
      await new Promise(resolve => setTimeout(resolve, 0)); // Force UI update
      
      // Always calculate premium values
      console.log('🔄 Fetching option prices for premium calculation...');
      
      // Collect all option contracts that need pricing
      const contractsToPrice: {exp: string, strike: number, type: 'call' | 'put', oi: number}[] = [];
      
      Object.entries(gexByStrikeByExp).forEach(([exp, strikes]) => {
        Object.entries(strikes).forEach(([strike, data]) => {
          const strikeNum = parseFloat(strike);
          if (data.callOI > 0) {
            contractsToPrice.push({ exp, strike: strikeNum, type: 'call', oi: data.callOI });
          }
          if (data.putOI > 0) {
            contractsToPrice.push({ exp, strike: strikeNum, type: 'put', oi: data.putOI });
          }
        });
      });
      
      console.log(`📊 Fetching prices for ${contractsToPrice.length} option contracts...`);
      
      // Fetch all option prices in parallel
      const optionPrices = await fetchOptionPrices(contractsToPrice);
      
      // Calculate premium values
      const premiumByStrikeByExp: {[expiration: string]: {[strike: number]: {call: number, put: number, callOI: number, putOI: number}}} = {};
      
      Object.entries(gexByStrikeByExp).forEach(([exp, strikes]) => {
        premiumByStrikeByExp[exp] = {};
        
        Object.entries(strikes).forEach(([strike, data]) => {
          const strikeNum = parseFloat(strike);
          const callPriceKey = `${exp}_${strikeNum}_call`;
          const putPriceKey = `${exp}_${strikeNum}_put`;
          
          const callPrice = optionPrices[callPriceKey] || 0;
          const putPrice = optionPrices[putPriceKey] || 0;
          
          // Calculate premium values: (price * OI * 100)
          const callPremium = callPrice * data.callOI * 100;
          const putPremium = putPrice * data.putOI * 100;
          
          premiumByStrikeByExp[exp][strikeNum] = {
            call: callPremium,
            put: putPremium,
            callOI: data.callOI,
            putOI: data.putOI
          };
        });
      });
      
      setPremiumByStrikeByExpiration(premiumByStrikeByExp);
      console.log('✅ Premium values calculated');
      
      setProgress(95);
      await new Promise(resolve => setTimeout(resolve, 0)); // Force UI update
      
      // Format and display data
      const strikeRange = getStrikeRange(currentPrice);
      const relevantStrikes = Array.from(allStrikes)
        .filter(s => s >= strikeRange.min && s <= strikeRange.max)
        .sort((a, b) => b - a);
      
        const formattedData = relevantStrikes.map(strike => {
          const row: GEXData = { strike };
          allAvailableExpirations.forEach(exp => {
            if (analysisType === 'PREMIUM') {
              const data = premiumByStrikeByExpiration[exp]?.[strike] || { call: 0, put: 0, callOI: 0, putOI: 0 };
              row[exp] = { call: data.call, put: data.put, net: data.call + data.put, callOI: data.callOI, putOI: data.putOI };
            } else {
              const data = gexByStrikeByExp[exp]?.[strike] || { call: 0, put: 0, callOI: 0, putOI: 0 };
              row[exp] = { call: data.call, put: data.put, net: data.call + data.put, callOI: data.callOI, putOI: data.putOI };
            }
          });
          return row;
        });      setData(formattedData);
      setProgress(100);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOptionsData();
  }, [selectedTicker]);

  // Update data when display mode or OTM filter changes
  useEffect(() => {
    if (gexByStrikeByExpiration && Object.keys(gexByStrikeByExpiration).length > 0) {
      const strikeRange = getStrikeRange(currentPrice);
      const relevantStrikes = Array.from(new Set([
        ...Object.values(gexByStrikeByExpiration).flatMap(exp => Object.keys(exp).map(Number))
      ]))
        .filter(s => s >= strikeRange.min && s <= strikeRange.max)
        .sort((a, b) => b - a);

      const formattedData = relevantStrikes.map(strike => {
        const row: GEXData = { strike };
        expirations.forEach(exp => {
          // Always use GEX data structure for consistency, display logic will handle what to show
          const gexData = gexByStrikeByExpiration[exp]?.[strike] || { call: 0, put: 0, callOI: 0, putOI: 0 };
          const premiumData = premiumByStrikeByExpiration[exp]?.[strike] || { call: 0, put: 0, callOI: 0, putOI: 0 };
          
          // Store both GEX and premium data for flexible display
          row[exp] = { 
            call: gexData.call, 
            put: gexData.put, 
            net: gexData.call + gexData.put, 
            callOI: gexData.callOI, 
            putOI: gexData.putOI,
            // Add premium data as additional properties
            callPremium: premiumData.call,
            putPremium: premiumData.put
          };
        });
        return row;
      });
      
      setData(formattedData);
    }
  }, [viewMode, gexByStrikeByExpiration, premiumByStrikeByExpiration, currentPrice, expirations, otmFilter, analysisType, showGEX, showPremium, showOI, gexMode, premiumMode, oiMode]);

  const handleTickerSubmit = () => {
    const newTicker = tickerInput.trim().toUpperCase();
    if (newTicker && newTicker !== selectedTicker) {
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
    
    // Original GEX formatting (always used for middle line)
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

  const formatPremium = (value: number) => {
    const absValue = Math.abs(value);
    const sign = value < 0 ? '-' : value > 0 ? '+' : '';
    
    // Smart premium formatting with $ prefix
    if (absValue >= 1e9) {
      // Billions: $1B, $4.32B
      const billions = absValue / 1e9;
      if (billions >= 10) {
        return `${sign}$${billions.toFixed(2)}B`;
      } else {
        return `${sign}$${billions % 1 === 0 ? billions.toFixed(0) : billions.toFixed(2)}B`;
      }
    } else if (absValue >= 1e6) {
      // Millions: $1M, $1.34M, $12.32M, $124.42M
      const millions = absValue / 1e6;
      if (millions >= 100) {
        return `${sign}$${millions.toFixed(2)}M`;
      } else if (millions >= 10) {
        return `${sign}$${millions % 1 === 0 ? millions.toFixed(0) : millions.toFixed(2)}M`;
      } else {
        return `${sign}$${millions % 1 === 0 ? millions.toFixed(0) : millions.toFixed(2)}M`;
      }
    } else if (absValue >= 1000) {
      // Thousands: $1K, $1.2K, $13.4K, $104.4K
      const thousands = absValue / 1000;
      if (thousands >= 100) {
        return `${sign}$${thousands.toFixed(1)}K`;
      } else if (thousands >= 10) {
        return `${sign}$${thousands % 1 === 0 ? thousands.toFixed(0) : thousands.toFixed(1)}K`;
      } else {
        return `${sign}$${thousands % 1 === 0 ? thousands.toFixed(0) : thousands.toFixed(1)}K`;
      }
    } else if (absValue >= 500) {
      // 500-999: $0.5K
      return `${sign}$${(absValue / 1000).toFixed(1)}K`;
    } else if (absValue > 0) {
      return `${sign}$${absValue.toFixed(0)}`;
    }
    return '$0';
  };

  const formatOI = (value: number) => {
    return value.toLocaleString('en-US');
  };

  const getTopValues = () => {
    const allValues = data.flatMap(row => 
      expirations.flatMap(exp => {
        const value = row[exp] as {call: number, put: number, net: number};
        // Include individual call/put values for normal mode
        const individualValues = [Math.abs(value?.call || 0), Math.abs(value?.put || 0)];
        
        // Also include NET values when GEX is in NET mode
        const netValues = (showGEX && gexMode === 'NET') ? [Math.abs(value?.net || 0)] : [];
        
        return [...individualValues, ...netValues];
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
    
    {
      // GEX Color Scheme
      // 1st - Gold (largest absolute value, positive or negative)
      if (absValue === tops.highest && absValue > 0) {
        return 'bg-gradient-to-br from-yellow-600/70 to-yellow-800/70 text-yellow-100 font-bold shadow-lg shadow-yellow-500/30';
      }
      // 2nd - Purple (second largest absolute value, positive or negative)
      if (absValue === tops.second && absValue > 0) {
        return 'bg-gradient-to-br from-purple-600/70 to-purple-800/70 text-purple-100 font-bold shadow-lg shadow-purple-500/30';
      }
      // 3rd - Lime Green (third largest absolute value, positive or negative)
      if (absValue === tops.third && absValue > 0) {
        return 'bg-gradient-to-br from-lime-600/70 to-lime-800/70 text-lime-100 font-bold shadow-lg shadow-lime-500/30';
      }
      // 4th-10th - Light Blue (4th through 10th largest absolute values, positive or negative)
      if (tops.top10.includes(absValue) && absValue > 0) {
        return 'bg-gradient-to-br from-blue-600/70 to-blue-800/70 text-blue-100 font-bold shadow-lg shadow-blue-500/30';
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
    // Split the date string and create date in local timezone
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
                    
                    {/* Analysis Type & OTM Dropdown */}
                    <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-8">
                      {/* Display Toggle Checkboxes */}
                      <div className="flex items-center gap-4">
                        <span className="text-xs font-bold text-white uppercase tracking-wider">DISPLAY</span>
                        <div className="flex items-center gap-6">
                          {/* GEX Dropdown */}
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={showGEX}
                              onChange={(e) => setShowGEX(e.target.checked)}
                              className="w-4 h-4 text-orange-500 bg-black border-2 border-gray-600 rounded focus:ring-orange-500 focus:ring-2"
                            />
                            <div className="relative">
                              <select
                                value={gexMode}
                                onChange={(e) => setGexMode(e.target.value as 'GEX' | 'LIVE_GEX' | 'NET')}
                                className="bg-black border-2 border-gray-800 focus:border-orange-500 focus:outline-none px-3 py-1.5 pr-8 text-white text-xs font-bold uppercase appearance-none cursor-pointer min-w-[80px] transition-all"
                              >
                                <option value="GEX">GEX</option>
                                <option value="LIVE_GEX">LIVE GEX</option>
                                <option value="NET">NET</option>
                              </select>
                              <div className="absolute right-2 top-1/2 transform -translate-y-1/2 pointer-events-none">
                                <svg className="w-3 h-3 text-orange-500" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                                </svg>
                              </div>
                            </div>
                          </div>
                          
                          {/* Premium Dropdown */}
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={showPremium}
                              onChange={(e) => setShowPremium(e.target.checked)}
                              className="w-4 h-4 text-green-500 bg-black border-2 border-gray-600 rounded focus:ring-green-500 focus:ring-2"
                            />
                            <div className="relative">
                              <select
                                value={premiumMode}
                                onChange={(e) => setPremiumMode(e.target.value as 'PREMIUM' | 'LIVE' | 'NET')}
                                className="bg-black border-2 border-gray-800 focus:border-green-500 focus:outline-none px-3 py-1.5 pr-8 text-white text-xs font-bold uppercase appearance-none cursor-pointer min-w-[80px] transition-all"
                              >
                                <option value="PREMIUM">PREMIUM</option>
                                <option value="LIVE">LIVE</option>
                                <option value="NET">NET</option>
                              </select>
                              <div className="absolute right-2 top-1/2 transform -translate-y-1/2 pointer-events-none">
                                <svg className="w-3 h-3 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                                </svg>
                              </div>
                            </div>
                          </div>
                          
                          {/* OI Dropdown */}
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={showOI}
                              onChange={(e) => setShowOI(e.target.checked)}
                              className="w-4 h-4 text-blue-500 bg-black border-2 border-gray-600 rounded focus:ring-blue-500 focus:ring-2"
                            />
                            <div className="relative">
                              <select
                                value={oiMode}
                                onChange={(e) => setOiMode(e.target.value as 'OI' | 'LIVE_OI')}
                                className="bg-black border-2 border-gray-800 focus:border-blue-500 focus:outline-none px-3 py-1.5 pr-8 text-white text-xs font-bold uppercase appearance-none cursor-pointer min-w-[80px] transition-all"
                              >
                                <option value="OI">OI</option>
                                <option value="LIVE_OI">LIVE OI</option>
                              </select>
                              <div className="absolute right-2 top-1/2 transform -translate-y-1/2 pointer-events-none">
                                <svg className="w-3 h-3 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                                </svg>
                              </div>
                            </div>
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
                      
                      {/* Mobile Refresh Button */}
                      <div className="md:hidden">
                        <button
                          onClick={fetchOptionsData}
                          disabled={loading}
                          className="w-full flex items-center gap-2 px-5 py-2.5 bg-black hover:bg-gray-900 border-2 border-gray-800 hover:border-orange-500 text-white hover:text-orange-500 font-bold text-sm uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 justify-center"
                        >
                          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                          {loading ? 'UPDATING' : 'REFRESH'}
                        </button>
                      </div>
                    </div>


                  </div>
                  
                  {/* Desktop Refresh Button */}
                  <button
                    onClick={fetchOptionsData}
                    disabled={loading}
                    className="flex items-center gap-2 px-5 py-2.5 bg-black hover:bg-gray-900 border-2 border-gray-800 hover:border-orange-500 text-white hover:text-orange-500 font-bold text-sm uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
                  >
                    <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                    {loading ? 'UPDATING' : 'REFRESH'}
                  </button>
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
                          <th key={exp} className="text-center bg-gray-900 border-l border-r border-gray-800">
                            <div className="text-xs font-bold text-white uppercase px-2 py-2 bg-gray-800 border border-gray-700 mb-2">
                              {formatDate(exp)}
                            </div>
                            <div className="flex">
                              <div className="flex-1 text-xs font-bold text-green-400 uppercase px-2 py-1 bg-gray-800 border-r border-gray-700">
                                CALL
                              </div>
                              <div className="flex-1 text-xs font-bold text-red-400 uppercase px-2 py-1 bg-gray-800">
                                PUT
                              </div>
                            </div>
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
                        
                        // Find the strike with the largest absolute value within current expirations (GEX or Premium)
                        const largestValueStrike = data.reduce((largest, current) => {
                          const currentMaxValue = Math.max(...expirations.map(exp => {
                            const value = current[exp] as {call: number, put: number, net: number};
                            return Math.max(Math.abs(value?.call || 0), Math.abs(value?.put || 0));
                          }));
                          const largestMaxValue = Math.max(...expirations.map(exp => {
                            const value = largest[exp] as {call: number, put: number, net: number};
                            return Math.max(Math.abs(value?.call || 0), Math.abs(value?.put || 0));
                          }));
                          return currentMaxValue > largestMaxValue ? current : largest;
                        }).strike;

                        // Find the cell with largest premium value (only when premium is enabled)
                        let largestPremiumCell: { strike: number | null, exp: string | null, type: string | null, value: number } = { strike: null, exp: null, type: null, value: 0 };
                        if (showPremium) {
                          data.forEach(row => {
                            expirations.forEach(exp => {
                              const value = row[exp] as {call: number, put: number, net: number, callPremium?: number, putPremium?: number};
                              if (Math.abs(value?.callPremium || 0) > largestPremiumCell.value) {
                                largestPremiumCell = { strike: row.strike, exp, type: 'call', value: Math.abs(value?.callPremium || 0) };
                              }
                              if (Math.abs(value?.putPremium || 0) > largestPremiumCell.value) {
                                largestPremiumCell = { strike: row.strike, exp, type: 'put', value: Math.abs(value?.putPremium || 0) };
                              }
                            });
                          });
                        }
                        
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
                              const value = row[exp] as {call: number, put: number, net: number, callOI: number, putOI: number, callPremium?: number, putPremium?: number};
                              const callValue = value?.call || 0;
                              const putValue = value?.put || 0;
                              const netValue = value?.net || 0;
                              const callOI = value?.callOI || 0;
                              const putOI = value?.putOI || 0;
                              const callPremium = value?.callPremium || 0;
                              const putPremium = value?.putPremium || 0;
                              
                              // Check if this is the largest premium cell
                              const isLargestPremiumCall = showPremium && 
                                largestPremiumCell.strike === row.strike && 
                                largestPremiumCell.exp === exp && 
                                largestPremiumCell.type === 'call';
                              const isLargestPremiumPut = showPremium && 
                                largestPremiumCell.strike === row.strike && 
                                largestPremiumCell.exp === exp && 
                                largestPremiumCell.type === 'put';
                              
                              return (
                                <td
                                  key={exp}
                                  className={`px-1 py-3 ${
                                    isCurrentPriceRow ? 'bg-yellow-900/15' : 
                                    isLargestValueRow ? 'bg-purple-900/15' : ''
                                  }`}
                                >
                                  {/* Check if we should display NET mode (single cell) or separate call/put cells */}
                                  {(showGEX && gexMode === 'NET') || (showPremium && premiumMode === 'NET') ? (
                                    // NET MODE - Single cell with net values
                                    <div className="flex justify-center">
                                      <div className={`${getCellStyle(netValue)} px-2 py-2 rounded-lg text-center font-mono w-full transition-all hover:scale-105 ${
                                        isCurrentPriceRow ? 'ring-1 ring-yellow-500/40' : 
                                        isLargestValueRow ? 'ring-1 ring-purple-500/50' : ''
                                      }`}>
                                        {showPremium && premiumMode === 'NET' && (
                                          <div className="text-xs font-bold text-cyan-400 mb-1">
                                            {formatPremium(callPremium - putPremium)}
                                          </div>
                                        )}
                                        {showGEX && gexMode === 'NET' && (
                                          <div className="text-xs font-bold">{formatCurrency(netValue)}</div>
                                        )}
                                        {showOI && (
                                          <div className="text-xs text-orange-500 font-bold mt-1">{formatOI(callOI + putOI)}</div>
                                        )}
                                      </div>
                                    </div>
                                  ) : (
                                    // NORMAL MODE - Separate call/put cells
                                    <div className="flex gap-1">
                                      <div className={`${getCellStyle(callValue)} px-2 py-2 rounded-lg text-center font-mono flex-1 transition-all hover:scale-105 ${
                                        isCurrentPriceRow ? 'ring-1 ring-yellow-500/40' : 
                                        isLargestValueRow ? 'ring-1 ring-purple-500/50' : 
                                        isLargestPremiumCall ? 'ring-2 ring-red-500 shadow-lg shadow-red-500/50' : ''
                                      }`} style={isLargestPremiumCall ? {
                                        boxShadow: '0 0 20px rgba(239, 68, 68, 0.8), 0 0 40px rgba(239, 68, 68, 0.4)'
                                      } : {}}>
                                        {showPremium && premiumMode !== 'NET' && (
                                          <div className="text-xs font-bold text-green-400 mb-1">
                                            {formatPremium(callPremium)}
                                          </div>
                                        )}
                                        {showGEX && gexMode !== 'NET' && (
                                          <div className="text-xs font-bold">{formatCurrency(callValue)}</div>
                                        )}
                                        {showOI && (
                                          <div className="text-xs text-orange-500 font-bold mt-1">{formatOI(callOI)}</div>
                                        )}
                                      </div>
                                      <div className={`${getCellStyle(putValue)} px-2 py-2 rounded-lg text-center font-mono flex-1 transition-all hover:scale-105 ${
                                        isCurrentPriceRow ? 'ring-1 ring-yellow-500/40' : 
                                        isLargestValueRow ? 'ring-1 ring-purple-500/50' : 
                                        isLargestPremiumPut ? 'ring-2 ring-red-500 shadow-lg shadow-red-500/50' : ''
                                      }`} style={isLargestPremiumPut ? {
                                        boxShadow: '0 0 20px rgba(239, 68, 68, 0.8), 0 0 40px rgba(239, 68, 68, 0.4)'
                                      } : {}}>
                                        {showPremium && premiumMode !== 'NET' && (
                                          <div className="text-xs font-bold text-red-400 mb-1">
                                            {formatPremium(putPremium)}
                                          </div>
                                        )}
                                        {showGEX && gexMode !== 'NET' && (
                                          <div className="text-xs font-bold">{formatCurrency(putValue)}</div>
                                        )}
                                        {showOI && (
                                          <div className="text-xs text-orange-500 font-bold mt-1">{formatOI(putOI)}</div>
                                        )}
                                      </div>
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