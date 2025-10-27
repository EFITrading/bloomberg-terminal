import React, { useState, useEffect } from 'react';
import { RefreshCw, AlertCircle, TrendingUp, Activity } from 'lucide-react';

interface GEXData {
  strike: number;
  [key: string]: number;
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
  const [expirationFilter, setExpirationFilter] = useState('Weekly');
  const [gexByStrikeByExpiration, setGexByStrikeByExpiration] = useState<{[expiration: string]: {[strike: number]: number}}>({});
  const [vexByStrikeByExpiration, setVexByStrikeByExpiration] = useState<{[expiration: string]: {[strike: number]: number}}>({});
  const [dexByStrikeByExpiration, setDexByStrikeByExpiration] = useState<{[expiration: string]: {[strike: number]: number}}>({});
  const [displayMode, setDisplayMode] = useState<'GEX' | 'DEX' | 'VEX'>('GEX');
  const [otmFilter, setOtmFilter] = useState<'2%' | '5%' | '10%' | '20%' | '100%'>('20%');

  // Helper function to get strike range based on OTM filter
  const getStrikeRange = (price: number) => {
    const percentage = parseFloat(otmFilter.replace('%', '')) / 100;
    const range = price * percentage;
    return {
      min: price - range,
      max: price + range
    };
  };

  // Fetch detailed GEX data using server-side endpoint with proper expiration filtering
  const fetchOptionsData = async () => {
    console.log(`Fetching options data for ticker: ${selectedTicker}`);
    setLoading(true);
    setError(null);
    
    try {
      // First get options chain data to understand available expirations and current price
      const optionsResponse = await fetch(`/api/options-chain?ticker=${selectedTicker}`);
      const optionsResult = await optionsResponse.json();
      
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
      
      // Calculate GEX, DEX, and VEX by strike for each expiration using proper server-side formulas
      const gexByStrikeByExp: {[expiration: string]: {[strike: number]: number}} = {};
      const vexByStrikeByExp: {[expiration: string]: {[strike: number]: number}} = {};
      const dexByStrikeByExp: {[expiration: string]: {[strike: number]: number}} = {};
      const allStrikes = new Set<number>();
      
      for (const expDate of filteredExpirations) {
        const { calls, puts } = optionsResult.data[expDate];
        gexByStrikeByExp[expDate] = {};
        vexByStrikeByExp[expDate] = {};
        dexByStrikeByExp[expDate] = {};
        
        // Process calls
        Object.entries(calls).forEach(([strike, data]: [string, any]) => {
          const strikeNum = parseFloat(strike);
          const oi = data.open_interest || 0;
          const gamma = data.greeks?.gamma || 0;
          const vega = data.greeks?.vega || 0;
          const delta = data.greeks?.delta || 0;
          
          if (oi > 0) {
            // GEX calculation (positive for calls)
            if (gamma) {
              const gex = gamma * oi * (currentPrice * currentPrice) * 100;
              gexByStrikeByExp[expDate][strikeNum] = (gexByStrikeByExp[expDate][strikeNum] || 0) + gex;
            }
            
            // VEX calculation (Volatility Exposure)
            if (vega) {
              const vex = vega * oi * 100; // VEX = Vega * Open Interest * 100
              vexByStrikeByExp[expDate][strikeNum] = (vexByStrikeByExp[expDate][strikeNum] || 0) + vex;
            }
            
            // DEX calculation (Delta Exposure - positive for calls)
            if (delta) {
              const dex = delta * oi * currentPrice * 100; // DEX = Delta * Open Interest * Underlying Price * 100
              dexByStrikeByExp[expDate][strikeNum] = (dexByStrikeByExp[expDate][strikeNum] || 0) + dex;
            }
            
            allStrikes.add(strikeNum);
          }
        });
        
        // Process puts
        Object.entries(puts).forEach(([strike, data]: [string, any]) => {
          const strikeNum = parseFloat(strike);
          const oi = data.open_interest || 0;
          const gamma = data.greeks?.gamma || 0;
          const vega = data.greeks?.vega || 0;
          const delta = data.greeks?.delta || 0;
          
          if (oi > 0) {
            // GEX calculation (negative for puts)
            if (gamma) {
              const gex = -gamma * oi * (currentPrice * currentPrice) * 100;
              gexByStrikeByExp[expDate][strikeNum] = (gexByStrikeByExp[expDate][strikeNum] || 0) + gex;
            }
            
            // VEX calculation (positive for puts - volatility exposure is always positive)
            if (vega) {
              const vex = vega * oi * 100; // VEX = Vega * Open Interest * 100
              vexByStrikeByExp[expDate][strikeNum] = (vexByStrikeByExp[expDate][strikeNum] || 0) + vex;
            }
            
            // DEX calculation (negative for puts - delta is negative for puts)
            if (delta) {
              const dex = delta * oi * currentPrice * 100; // DEX = Delta * Open Interest * Underlying Price * 100
              dexByStrikeByExp[expDate][strikeNum] = (dexByStrikeByExp[expDate][strikeNum] || 0) + dex;
            }
            
            allStrikes.add(strikeNum);
          }
        });
      }
      
      setGexByStrikeByExpiration(gexByStrikeByExp);
      setVexByStrikeByExpiration(vexByStrikeByExp);
      setDexByStrikeByExpiration(dexByStrikeByExp);
      
      // Filter strikes based on OTM filter percentage
      const strikeRange = getStrikeRange(currentPrice);
      const relevantStrikes = Array.from(allStrikes)
        .filter(s => s >= strikeRange.min && s <= strikeRange.max)
        .sort((a, b) => b - a); // Sort descending (highest strikes at top)
      
      // Format data for table display (will be updated based on display mode)
      const formattedGexData = relevantStrikes.map(strike => {
        const row: GEXData = { strike };
        filteredExpirations.forEach(exp => {
          row[exp] = gexByStrikeByExp[exp][strike] || 0;
        });
        return row;
      });
      
      const formattedVexData = relevantStrikes.map(strike => {
        const row: GEXData = { strike };
        filteredExpirations.forEach(exp => {
          row[exp] = vexByStrikeByExp[exp][strike] || 0;
        });
        return row;
      });
      
      const formattedDexData = relevantStrikes.map(strike => {
        const row: GEXData = { strike };
        filteredExpirations.forEach(exp => {
          row[exp] = dexByStrikeByExp[exp][strike] || 0;
        });
        return row;
      });

      // Set data based on current display mode
      setData(displayMode === 'GEX' ? formattedGexData : displayMode === 'VEX' ? formattedVexData : formattedDexData);
      setLoading(false);
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
            row[exp] = gexByStrikeByExpiration[exp]?.[strike] || 0;
          } else if (displayMode === 'VEX') {
            row[exp] = vexByStrikeByExpiration[exp]?.[strike] || 0;
          } else {
            row[exp] = dexByStrikeByExpiration[exp]?.[strike] || 0;
          }
        });
        return row;
      });
      
      setData(formattedData);
    }
  }, [displayMode, gexByStrikeByExpiration, vexByStrikeByExpiration, dexByStrikeByExpiration, currentPrice, expirations, otmFilter]);

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
      expirations.map(exp => Math.abs(row[exp] || 0))
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
      // VEX Color Scheme
      // 1st - Red (largest VEX value)
      if (absValue === tops.highest && absValue > 0) {
        return 'bg-gradient-to-br from-red-500 to-red-700 text-white font-bold shadow-lg shadow-red-500/50';
      }
      // 2nd - Pink (second largest VEX value)
      if (absValue === tops.second && absValue > 0) {
        return 'bg-gradient-to-br from-pink-400 to-pink-600 text-white font-bold shadow-lg shadow-pink-500/50';
      }
      // 3rd - Orange (third largest VEX value)
      if (absValue === tops.third && absValue > 0) {
        return 'bg-gradient-to-br from-orange-400 to-orange-600 text-black font-bold shadow-lg shadow-orange-500/50';
      }
      // 4th-10th - Light Blue (4th through 10th largest VEX values)
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
      <div className="p-6">
        <div className="max-w-[95vw] mx-auto">
          {/* Bloomberg Terminal Header */}
          <div className="mb-6 bg-black border border-gray-600/40 shadow-2xl">
            {/* Enhanced Metallic Title Bar */}
            <div className="bg-gradient-to-b from-black via-gray-900 to-black border-b border-gray-600/80 px-6 py-8 relative overflow-hidden h-24">
              {/* Metallic background texture */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-gray-800/10 to-transparent"></div>
              <div className="absolute inset-0 bg-gradient-to-b from-gray-700/5 via-transparent to-gray-800/10"></div>
              
              <div className="flex items-center justify-center h-full relative z-10">
                <h1 className="text-4xl font-bold text-orange-400 uppercase tracking-[0.3em] relative drop-shadow-lg">
                  <span className="relative" style={{
                    textShadow: '0 0 10px rgba(251, 146, 60, 0.5), 0 0 20px rgba(251, 146, 60, 0.3), 0 0 30px rgba(251, 146, 60, 0.1)',
                    filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.8))'
                  }}>
                    Dealers Workbench
                    {/* Crispy glow effect */}
                    <div className="absolute inset-0 text-orange-300 opacity-50 blur-sm">
                      Dealers Workbench
                    </div>
                  </span>
                </h1>
              </div>
              
              {/* Subtle edge highlights */}
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gray-500/30 to-transparent"></div>
              <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gray-600/50 to-transparent"></div>
            </div>

            {/* Enhanced Professional Control Panel */}
            <div className="bg-black border-y border-gray-800 shadow-lg">
              <div className="px-8 py-6">
                <div className="flex items-center justify-between">
                  {/* Left Controls - Horizontal Layout */}
                  <div className="flex items-center gap-8">
                    {/* Premium Ticker Search */}
                    <div className="flex items-center gap-4">
                      <div className="text-sm font-bold text-orange-400 uppercase tracking-[0.2em] min-w-[70px]" style={{textShadow: '0 0 8px rgba(251, 146, 60, 0.6)'}}>SYMBOL</div>
                      <div className="relative group">
                        <input
                          type="text"
                          value={tickerInput}
                          onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleTickerSubmit();
                            }
                          }}
                          className="bg-gray-950 border-2 border-gray-700 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 px-3 py-2 text-white text-sm font-mono font-bold w-20 text-center uppercase tracking-[0.2em] transition-all duration-200 rounded-sm shadow-inner"
                          placeholder="SPY"
                        />
                        <button
                          onClick={handleTickerSubmit}
                          className="absolute right-0 top-0 bottom-0 px-3 bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-500 hover:to-orange-600 text-white text-xs font-bold transition-all duration-200 rounded-r-sm shadow-lg hover:shadow-orange-500/25 active:scale-95"
                        >
                          GO
                        </button>
                      </div>
                    </div>
                    
                    {/* Enhanced Expiration Dropdown */}
                    <div className="flex items-center gap-4">
                      <div className="text-sm font-bold text-orange-400 uppercase tracking-[0.2em] min-w-[100px]" style={{textShadow: '0 0 8px rgba(251, 146, 60, 0.6)'}}>EXPIRATION</div>
                      <div className="relative group">
                        <select
                          value={expirationFilter}
                          onChange={(e) => setExpirationFilter(e.target.value)}
                          className="bg-gray-950 border-2 border-gray-700 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 px-3 py-2 pr-10 text-white text-xs font-bold uppercase tracking-[0.1em] appearance-none cursor-pointer transition-all duration-200 rounded-sm shadow-inner min-w-[120px]"
                        >
                          <option value="Daily">DAILY</option>
                          <option value="Weekly">WEEKLY</option>
                          <option value="Monthly">MONTHLY</option>
                          <option value="Quarterly">QUARTERLY</option>
                          <option value="All">ALL</option>
                        </select>
                        <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none transition-colors group-hover:text-orange-400">
                          <svg className="w-3 h-3 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        </div>
                      </div>
                    </div>

                    {/* OTM Filter Dropdown */}
                    <div className="flex items-center gap-4">
                      <div className="relative group">
                        <select
                          value={otmFilter}
                          onChange={(e) => setOtmFilter(e.target.value as '2%' | '5%' | '10%' | '20%' | '100%')}
                          className="bg-gray-950 border-2 border-gray-700 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 px-3 py-2 pr-10 text-white text-xs font-bold uppercase tracking-[0.1em] appearance-none cursor-pointer transition-all duration-200 rounded-sm shadow-inner min-w-[100px]"
                        >
                          <option value="2%">±2%</option>
                          <option value="5%">±5%</option>
                          <option value="10%">±10%</option>
                          <option value="20%">±20%</option>
                          <option value="100%">±100%</option>
                        </select>
                        <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none transition-colors group-hover:text-orange-400">
                          <svg className="w-3 h-3 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        </div>
                      </div>
                    </div>

                    {/* Enhanced Price Display */}
                    {currentPrice > 0 && (
                      <div className="flex items-center gap-4 border-l border-gray-700 pl-8 ml-6">
                        <div className="bg-gray-950 border-2 border-gray-700 px-4 py-2 rounded-sm shadow-inner">
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-bold text-gray-300 uppercase tracking-[0.1em]">
                              {selectedTicker}
                            </span>
                            <span className="text-lg font-bold text-white font-mono tracking-tight" style={{textShadow: '0 0 10px rgba(255,255,255,0.2)'}}>
                              ${currentPrice.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* GEX, DEX & VEX Buttons */}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setDisplayMode('GEX')}
                      className={`flex items-center gap-2 px-4 py-2 border-2 text-white font-bold text-sm uppercase tracking-[0.1em] transition-all duration-200 rounded-sm shadow-lg hover:shadow-xl active:scale-95 ${
                        displayMode === 'GEX' 
                          ? 'bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-500 hover:to-orange-600 border-orange-500' 
                          : 'bg-gradient-to-r from-gray-700 to-gray-800 hover:from-gray-600 hover:to-gray-700 border-gray-600 hover:border-gray-500'
                      }`}
                    >
                      GEX
                    </button>
                    <button
                      onClick={() => setDisplayMode('DEX')}
                      className={`flex items-center gap-2 px-4 py-2 border-2 text-white font-bold text-sm uppercase tracking-[0.1em] transition-all duration-200 rounded-sm shadow-lg hover:shadow-xl active:scale-95 ${
                        displayMode === 'DEX' 
                          ? 'bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-500 hover:to-orange-600 border-orange-500' 
                          : 'bg-gradient-to-r from-gray-700 to-gray-800 hover:from-gray-600 hover:to-gray-700 border-gray-600 hover:border-gray-500'
                      }`}
                    >
                      DEX
                    </button>
                    <button
                      onClick={() => setDisplayMode('VEX')}
                      className={`flex items-center gap-2 px-4 py-2 border-2 text-white font-bold text-sm uppercase tracking-[0.1em] transition-all duration-200 rounded-sm shadow-lg hover:shadow-xl active:scale-95 ${
                        displayMode === 'VEX' 
                          ? 'bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-500 hover:to-orange-600 border-orange-500' 
                          : 'bg-gradient-to-r from-gray-700 to-gray-800 hover:from-gray-600 hover:to-gray-700 border-gray-600 hover:border-gray-500'
                      }`}
                    >
                      VEX
                    </button>
                    <button
                      onClick={fetchOptionsData}
                      disabled={loading}
                      className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-gray-800 to-gray-900 hover:from-gray-700 hover:to-gray-800 border-2 border-gray-600 hover:border-gray-500 text-white font-bold text-xs uppercase tracking-[0.1em] transition-all duration-200 disabled:opacity-50 rounded-sm shadow-lg hover:shadow-xl active:scale-95 ml-2"
                    >
                      <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
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
            </div>
          ) : (
            <>
              <div className="bg-gradient-to-r from-gray-900/50 to-gray-800/50 backdrop-blur-xl rounded-2xl border border-gray-700/50 shadow-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-700/50 bg-gradient-to-r from-gray-800/80 to-gray-900/80">
                        <th className="px-6 py-4 text-left sticky left-0 bg-black z-10 border-r border-gray-700/50">
                          <div className="text-xs font-bold text-white uppercase tracking-wider shadow-lg" style={{textShadow: '0 0 6px rgba(255,255,255,0.4)'}}>Strike</div>
                        </th>
                        {expirations.map(exp => (
                          <th key={exp} className="px-4 py-4 text-center min-w-[120px] max-w-[120px] bg-gradient-to-b from-gray-900 via-black to-gray-900 shadow-inner border-l border-r border-gray-800">
                            <div 
                              className="text-xs font-bold text-white uppercase tracking-wider px-3 py-2 rounded-sm bg-gradient-to-b from-gray-800 via-black to-gray-900 shadow-lg border border-gray-700" 
                              style={{
                                textShadow: '0 0 6px rgba(255,255,255,0.3)',
                                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.8), 0 2px 8px rgba(0,0,0,0.6)'
                              }}
                            >
                              {formatDate(exp)}
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
                        
                        // Find the strike with the largest absolute value within current expirations (GEX or VEX)
                        const largestValueStrike = data.reduce((largest, current) => {
                          const currentMaxValue = Math.max(...expirations.map(exp => Math.abs(current[exp] || 0)));
                          const largestMaxValue = Math.max(...expirations.map(exp => Math.abs(largest[exp] || 0)));
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
                              const value = row[exp] || 0;
                              return (
                                <td
                                  key={exp}
                                  className={`px-2 py-3 ${
                                    isCurrentPriceRow ? 'bg-yellow-900/15' : 
                                    isLargestValueRow ? 'bg-purple-900/15' : ''
                                  }`}
                                >
                                  <div className={`${getCellStyle(value)} px-3 py-2 rounded-lg text-center font-mono text-sm transition-all hover:scale-105 ${
                                    isCurrentPriceRow ? 'ring-2 ring-yellow-500/40' : 
                                    isLargestValueRow ? 'ring-2 ring-purple-500/50' : ''
                                  }`}>
                                    {formatCurrency(value)}
                                  </div>
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