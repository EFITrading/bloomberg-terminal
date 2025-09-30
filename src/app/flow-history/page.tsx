"use client";

import React, { useState, useEffect } from 'react';

interface OptionsContract {
  id: string;
  ticker: string;
  underlying_ticker: string;
  strike: number;
  expiry: string;
  type: 'call' | 'put';
  trade_size: number;
  premium_per_contract: number;
  total_premium: number;
  timestamp: number;
  exchange: number;
  conditions: number[];
  flow_type?: 'bullish' | 'bearish' | 'neutral';
  trade_type?: 'block' | 'sweep';
  above_ask?: boolean;
  below_bid?: boolean;
  trade_intention?: 'BUY_TO_OPEN' | 'SELL_TO_OPEN' | 'BUY_TO_CLOSE' | 'SELL_TO_CLOSE' | 'UNKNOWN';
  bid_price?: number;
  ask_price?: number;
  mid_price?: number;
  price_vs_mid?: 'ABOVE' | 'BELOW' | 'AT_MID';
  unusual_activity?: boolean;
  stored_at: string;
  session_id?: string;
  volume?: number;
  open_interest?: number;
}

export default function FlowHistoryPage() {
  const [historicalTrades, setHistoricalTrades] = useState<OptionsContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchSymbol, setSearchSymbol] = useState('');
  const [showOnlyBlocks, setShowOnlyBlocks] = useState(false);
  const [showOnlySweeps, setShowOnlySweeps] = useState(false);
  const [showOnlyCalls, setShowOnlyCalls] = useState(false);
  const [showOnlyPuts, setShowOnlyPuts] = useState(false);
  const [showOnly100k, setShowOnly100k] = useState(false);
  const [dateFilter, setDateFilter] = useState('all');
  const [volOIData, setVolOIData] = useState<{[key: string]: {volume: number, open_interest: number}}>({});
  const [spotPrices, setSpotPrices] = useState<{[key: string]: {historical: number, current: number}}>({});

  const filteredTrades = historicalTrades.filter(trade => {
    if (searchSymbol && !trade.underlying_ticker.toLowerCase().includes(searchSymbol.toLowerCase())) {
      return false;
    }
    if (showOnlyBlocks && trade.trade_type !== 'block') {
      return false;
    }
    if (showOnlySweeps && trade.trade_type !== 'sweep') {
      return false;
    }
    if (showOnlyCalls && trade.type !== 'call') {
      return false;
    }
    if (showOnlyPuts && trade.type !== 'put') {
      return false;
    }
    if (showOnly100k && trade.total_premium < 100000) {
      return false;
    }
    
    // Date filtering
    if (dateFilter !== 'all') {
      const tradeDate = new Date(trade.stored_at);
      const now = new Date();
      const daysDiff = Math.floor((now.getTime() - tradeDate.getTime()) / (1000 * 60 * 60 * 24));
      
      if (dateFilter === 'today' && daysDiff > 0) return false;
      if (dateFilter === 'week' && daysDiff > 7) return false;
      if (dateFilter === 'month' && daysDiff > 30) return false;
    }
    
    return true;
  });

  const fetchHistoricalTrades = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('🔄 Fetching historical trades from API...');
      const response = await fetch('/api/flow-history?limit=1000');
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ HTTP Error Response:', response.status, errorText);
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
      }
      
      const responseText = await response.text();
      console.log('📥 Raw API Response (first 500 chars):', responseText.substring(0, 500));
      
      let response_data;
      try {
        response_data = JSON.parse(responseText);
      } catch (parseError) {
        console.error('❌ JSON Parse Error:', parseError);
        console.error('📄 Raw response:', responseText);
        throw new Error('Invalid JSON response from API');
      }
      
      console.log('📊 Parsed API Response Structure:', {
        success: response_data.success,
        hasData: !!response_data.data,
        dataType: typeof response_data.data,
        isArray: Array.isArray(response_data.data),
        dataLength: response_data.data ? response_data.data.length : 'N/A',
        hasError: !!response_data.error
      });
      
      // Handle the API response format
      if (!response_data.success) {
        const errorMsg = response_data.error || response_data.details || 'API request failed';
        console.error('❌ API returned success: false:', errorMsg);
        throw new Error(errorMsg);
      }
      
      const data = response_data.data;
      
      if (!data) {
        console.error('❌ No data property in response:', response_data);
        throw new Error('No data property in API response');
      }
      
      if (!Array.isArray(data)) {
        console.error('❌ Expected array in data property but got:', typeof data);
        console.error('📄 Full response_data:', response_data);
        console.error('📄 Data value:', data);
        throw new Error(`Invalid data format: expected array but got ${typeof data}`);
      }
      
      console.log(`✅ Successfully fetched ${data.length} historical trades`);
      
      // Debug: Log first few trades to check format
      if (data.length > 0) {
        console.log('🔍 Sample trades from API:', data.slice(0, 2).map(t => ({
          id: t.id,
          ticker: t.underlying_ticker,
          expiry: t.expiry,
          type: t.type,
          premium: t.total_premium
        })));
      }
      
      setHistoricalTrades(data);
      
      // Fetch Vol/OI data for unique option contracts
      await fetchVolOIData(data);
      
      // Fetch real spot prices for unique tickers
      await fetchSpotPrices(data);
      
    } catch (error) {
      console.error('❌ Error fetching historical trades:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch historical trades';
      setError(`Error: ${errorMessage}. Check browser console for details.`);
    } finally {
      setLoading(false);
    }
  };

  const fetchVolOIData = async (trades: OptionsContract[]) => {
    try {
      // Get first 100 trades for Vol/OI data (limit for performance)
      const contractsToFetch = trades.slice(0, 100);
      
      console.log(`� FAST BULK: Fetching Vol/OI data for ${contractsToFetch.length} contracts`);

      const response = await fetch('/api/bulk-vol-oi', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contracts: contractsToFetch
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.success) {
        setVolOIData(result.data);
        console.log(`✅ BULK SUCCESS: Loaded Vol/OI data for ${result.found} contracts`);
      } else {
        throw new Error(result.error || 'Failed to fetch bulk Vol/OI data');
      }
      
    } catch (error) {
      console.error('❌ Error fetching Vol/OI data:', error);
    }
  };

  const fetchSpotPrices = async (trades: OptionsContract[]) => {
    try {
      console.log(`📈 REAL HISTORICAL + CURRENT PRICES: Fetching for ${trades.length} trades`);

      const response = await fetch('/api/bulk-spot-prices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          trades: trades.slice(0, 50) // Limit for API rate limits
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.success) {
        setSpotPrices(result.data);
        console.log(`✅ REAL PRICE PAIRS: Loaded ${result.found} historical + current price pairs`);
      } else {
        throw new Error(result.error || 'Failed to fetch real price data');
      }
      
    } catch (error) {
      console.error('❌ Error fetching real price data:', error);
    }
  };

  useEffect(() => {
    fetchHistoricalTrades();
    
    // Set up a retry mechanism in case of initial load failure
    const retryTimer = setTimeout(() => {
      if (error && !loading) {
        console.log('🔄 Retrying failed API call after 3 seconds...');
        fetchHistoricalTrades();
      }
    }, 3000);
    
    return () => clearTimeout(retryTimer);
  }, []);

  const formatCurrency = (amount: number) => {
    if (amount >= 1000000) {
      return `$${(amount / 1000000).toFixed(1)}M`;
    } else if (amount >= 1000) {
      return `$${(amount / 1000).toFixed(0)}K`;
    }
    return `$${amount.toFixed(0)}`;
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatExpiration = (expiry: string) => {
    // Handle timezone issues by parsing the string directly instead of using Date constructor
    // Input is typically in YYYY-MM-DD format already
    if (expiry.includes('-') && expiry.length >= 10) {
      // If already in YYYY-MM-DD format, return as-is
      return expiry.substring(0, 10);
    }
    
    // If in other format, try to parse without timezone conversion
    try {
      // Parse manually to avoid timezone issues
      const parts = expiry.split(/[-/]/);
      if (parts.length >= 3) {
        const year = parts[0].length === 4 ? parts[0] : parts[2];
        const month = parts[1].padStart(2, '0');
        const day = parts[0].length === 4 ? parts[2].padStart(2, '0') : parts[0].padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
    } catch (error) {
      console.warn('Date parsing error for expiry:', expiry, error);
    }
    
    // Fallback to original string if parsing fails
    return expiry;
  };

  const formatPremium = (amount: number) => {
    if (amount >= 1000000) {
      return `$${(amount / 1000000).toFixed(0)}M`;
    }
    if (amount >= 1000) {
      return `$${(amount / 1000).toFixed(0)}K`;
    }
    return `$${amount.toFixed(0)}`;
  };

  // Bulk Vol/OI fetching now handled by the new /api/bulk-vol-oi endpoint

  // Helper function to check if option is Out of The Money (OTM)
  const isOTM = (trade: OptionsContract) => {
    // For this example, we'll assume OTM based on common patterns
    // In reality, you'd need current stock price to determine this accurately
    // For now, we'll use heuristics: calls with higher strikes are more likely OTM, puts with lower strikes are more likely OTM
    const strike = trade.strike;
    if (trade.type === 'call') {
      // Assume calls with strikes ending in 00 or 50 and above certain thresholds are likely OTM
      return strike >= 500 || strike % 50 === 0;
    } else {
      // Assume puts with strikes below certain thresholds are likely OTM
      return strike <= 300 || strike % 50 === 0;
    }
  };

  // Helper function to check if trade should have special candy gold glow
  const shouldHighlightTrade = (trade: OptionsContract) => {
    return (
      trade.total_premium >= 1000000 && // Over $1M
      isOTM(trade) && // Out of The Money
      trade.trade_type === 'sweep' // Is a sweep
    );
  };

  // Real spot prices fetched from Polygon API

  const getFlowTypeColor = (trade: OptionsContract) => {
    if (trade.above_ask) return 'text-green-400';
    if (trade.below_bid) return 'text-red-400';
    return 'text-gray-400';
  };

  const getFlowTypeSymbol = (trade: OptionsContract) => {
    if (trade.above_ask) return '↗';
    if (trade.below_bid) return '↘';
    return '→';
  };

  const getTradeIntentionDisplay = (trade: OptionsContract) => {
    const intention = trade.trade_intention;
    switch (intention) {
      case 'BUY_TO_OPEN':
        return { text: 'BTO', color: 'text-green-400', icon: '🟢' };
      case 'SELL_TO_OPEN':
        return { text: 'STO', color: 'text-red-400', icon: '🔴' };
      case 'BUY_TO_CLOSE':
        return { text: 'BTC', color: 'text-yellow-400', icon: '🟡' };
      case 'SELL_TO_CLOSE':
        return { text: 'STC', color: 'text-orange-400', icon: '🟠' };
      default:
        return { text: 'UNK', color: 'text-gray-400', icon: '⚪' };
    }
  };

  const totalPremium = filteredTrades.reduce((sum, trade) => sum + trade.total_premium, 0);
  const uniqueSymbols = new Set(filteredTrades.map(trade => trade.underlying_ticker)).size;

  return (
    <div className="min-h-screen bg-black text-green-400" style={{
      fontFamily: 'Monaco, Menlo, "Courier New", monospace'
    }}>
      {/* Header */}
      <div className="flex justify-center pb-8" style={{ marginTop: '45px' }}>
        <div className="w-full px-8" style={{ maxWidth: '1736px' }}>
          
          {/* Title and Back Button */}
          <div className="mb-8 text-center">
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => window.location.href = '/coming-soon'}
                className="px-4 py-2 bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white rounded-lg font-bold transition-all duration-200"
              >
                ← BACK TO LIVE FLOW
              </button>
              <h1 className="text-3xl font-bold text-orange-400">📊 HISTORICAL OPTIONS FLOW</h1>
              <button
                onClick={fetchHistoricalTrades}
                disabled={loading}
                className="px-4 py-2 bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800 disabled:from-gray-600 disabled:to-gray-700 text-white rounded-lg font-bold transition-all duration-200"
              >
                🔄 REFRESH
              </button>
            </div>
          </div>

          {/* Control Panel */}
          <div className="mb-8 bg-gradient-to-r from-gray-900 to-black rounded-xl border-2 border-orange-500/50 shadow-2xl shadow-orange-500/20 p-6">
            
            {/* Stats */}
            <div className="grid grid-cols-4 gap-6 mb-6 text-center">
              <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50">
                <div className="text-2xl font-bold text-green-400">{filteredTrades.length.toLocaleString()}</div>
                <div className="text-gray-400 text-sm">TOTAL TRADES</div>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50">
                <div className="text-2xl font-bold text-blue-400">{uniqueSymbols}</div>
                <div className="text-gray-400 text-sm">UNIQUE SYMBOLS</div>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50">
                <div className="text-2xl font-bold text-yellow-400">{formatCurrency(totalPremium)}</div>
                <div className="text-gray-400 text-sm">TOTAL PREMIUM</div>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50">
                <div className="text-2xl font-bold text-purple-400">{historicalTrades.length > 0 ? formatDate(historicalTrades[0].stored_at) : 'N/A'}</div>
                <div className="text-gray-400 text-sm">LATEST ENTRY</div>
              </div>
            </div>

            {/* Filters */}
            <div className="space-y-4">
              {/* Search and Date Filter */}
              <div className="flex space-x-4">
                <input
                  type="text"
                  placeholder="Search symbol (e.g., AAPL, TSLA)..."
                  value={searchSymbol}
                  onChange={(e) => setSearchSymbol(e.target.value)}
                  className="flex-1 px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:border-orange-500 focus:outline-none"
                />
                <select
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:border-orange-500 focus:outline-none"
                >
                  <option value="all">All Time</option>
                  <option value="today">Today</option>
                  <option value="week">Past Week</option>
                  <option value="month">Past Month</option>
                </select>
              </div>

              {/* Checkboxes */}
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center space-x-3 cursor-pointer hover:bg-blue-500/10 px-3 py-2 rounded-lg transition-all duration-200 group">
                  <input
                    type="checkbox"
                    checked={showOnlyBlocks}
                    onChange={(e) => setShowOnlyBlocks(e.target.checked)}
                    className="w-5 h-5 rounded-md bg-gray-700 border-2 border-gray-600 checked:bg-blue-600 checked:border-blue-600 focus:ring-2 focus:ring-blue-500/50 transition-all"
                  />
                  <span className="text-blue-400 font-bold text-base group-hover:text-blue-300 transition-colors">
                    BLOCKS ONLY
                  </span>
                </label>
                
                <label className="flex items-center space-x-3 cursor-pointer hover:bg-purple-500/10 px-3 py-2 rounded-lg transition-all duration-200 group">
                  <input
                    type="checkbox"
                    checked={showOnlySweeps}
                    onChange={(e) => setShowOnlySweeps(e.target.checked)}
                    className="w-5 h-5 rounded-md bg-gray-700 border-2 border-gray-600 checked:bg-purple-600 checked:border-purple-600 focus:ring-2 focus:ring-purple-500/50 transition-all"
                  />
                  <span className="text-purple-400 font-bold text-base group-hover:text-purple-300 transition-colors">
                    SWEEPS ONLY
                  </span>
                </label>
                
                <label className="flex items-center space-x-3 cursor-pointer hover:bg-green-500/10 px-3 py-2 rounded-lg transition-all duration-200 group">
                  <input
                    type="checkbox"
                    checked={showOnlyCalls}
                    onChange={(e) => setShowOnlyCalls(e.target.checked)}
                    className="w-5 h-5 rounded-md bg-gray-700 border-2 border-gray-600 checked:bg-green-600 checked:border-green-600 focus:ring-2 focus:ring-green-500/50 transition-all"
                  />
                  <span className="text-green-400 font-bold text-base group-hover:text-green-300 transition-colors">
                    CALLS ONLY
                  </span>
                </label>
                
                <label className="flex items-center space-x-3 cursor-pointer hover:bg-red-500/10 px-3 py-2 rounded-lg transition-all duration-200 group">
                  <input
                    type="checkbox"
                    checked={showOnlyPuts}
                    onChange={(e) => setShowOnlyPuts(e.target.checked)}
                    className="w-5 h-5 rounded-md bg-gray-700 border-2 border-gray-600 checked:bg-red-600 checked:border-red-600 focus:ring-2 focus:ring-red-500/50 transition-all"
                  />
                  <span className="text-red-400 font-bold text-base group-hover:text-red-300 transition-colors">
                    PUTS ONLY
                  </span>
                </label>
                
                <label className="flex items-center space-x-3 cursor-pointer hover:bg-yellow-500/10 px-3 py-2 rounded-lg transition-all duration-200 group">
                  <input
                    type="checkbox"
                    checked={showOnly100k}
                    onChange={(e) => setShowOnly100k(e.target.checked)}
                    className="w-5 h-5 rounded-md bg-gray-700 border-2 border-gray-600 checked:bg-yellow-600 checked:border-yellow-600 focus:ring-2 focus:ring-yellow-500/50 transition-all"
                  />
                  <span className="text-yellow-400 font-bold text-base group-hover:text-yellow-300 transition-colors">
                    $100K+ ONLY
                  </span>
                </label>
              </div>
            </div>
          </div>

          {/* Data Table */}
          {error ? (
            <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-6">
              <div className="text-red-400 text-lg font-bold mb-4 text-center">❌ API ERROR</div>
              <div className="text-gray-300 mb-4 text-center">{error}</div>
              <div className="text-xs text-gray-500 mb-4 text-center">
                Check the browser console (F12) for detailed error information
              </div>
              <div className="text-center">
                <button
                  onClick={fetchHistoricalTrades}
                  disabled={loading}
                  className="px-6 py-2 bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800 disabled:from-gray-600 disabled:to-gray-700 text-white rounded-lg font-bold transition-all duration-200"
                >
                  {loading ? '🔄 RETRYING...' : '🔄 RETRY NOW'}
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-black rounded-lg border border-gray-800 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full font-mono text-xs border-collapse">
                  <thead>
                    <tr className="bg-black border-b-2 border-orange-500" style={{backgroundColor: '#000000'}}>
                      <th className="px-3 py-4 text-left text-orange-500 font-black text-xl tracking-wider uppercase" style={{color: '#ff8c00'}}>TIME</th>
                      <th className="px-3 py-4 text-left text-orange-500 font-black text-xl tracking-wider uppercase" style={{color: '#ff8c00'}}>TICKER</th>
                      <th className="px-3 py-4 text-left text-orange-500 font-black text-xl tracking-wider uppercase" style={{color: '#ff8c00'}}>TYPE</th>
                      <th className="px-3 py-4 text-left text-orange-500 font-black text-xl tracking-wider uppercase" style={{color: '#ff8c00'}}>STRIKE</th>
                      <th className="px-3 py-4 text-left text-orange-500 font-black text-xl tracking-wider uppercase" style={{color: '#ff8c00'}}>SPOT PRICE</th>
                      <th className="px-3 py-4 text-left text-orange-500 font-black text-xl tracking-wider uppercase" style={{color: '#ff8c00'}}>EXPIRY</th>
                      <th className="px-3 py-4 text-left text-orange-500 font-black text-xl tracking-wider uppercase" style={{color: '#ff8c00'}}>SIZE</th>
                      <th className="px-3 py-4 text-left text-orange-500 font-black text-xl tracking-wider uppercase" style={{color: '#ff8c00'}}>VOL/OI</th>
                      <th className="px-3 py-4 text-left text-orange-500 font-black text-xl tracking-wider uppercase" style={{color: '#ff8c00'}}>PREMIUM</th>
                      <th className="px-3 py-4 text-left text-orange-500 font-black text-xl tracking-wider uppercase" style={{color: '#ff8c00'}}>INTENTION</th>
                      <th className="px-3 py-4 text-left text-orange-500 font-black text-xl tracking-wider uppercase" style={{color: '#ff8c00'}}>TRADE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={11} className="px-4 py-8 text-center text-gray-500">
                          <div className="flex items-center justify-center space-x-2">
                            <div className="animate-spin w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full"></div>
                            <span>Loading historical data...</span>
                          </div>
                        </td>
                      </tr>
                    ) : filteredTrades.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="px-4 py-8 text-center text-gray-500">
                          No historical trades found matching current filters
                        </td>
                      </tr>
                    ) : (
                      filteredTrades.slice(0, 100).map((trade, index) => {
                        const isSpecialTrade = shouldHighlightTrade(trade);
                        return (
                        <tr 
                          key={index} 
                          className={`border-b border-gray-700 hover:bg-gray-800/60 transition-all duration-200 ${
                            isSpecialTrade ? 'animate-pulse' : ''
                          }`}
                          style={{
                            fontSize: '17px',
                            backgroundColor: isSpecialTrade 
                              ? 'rgba(255, 191, 0, 0.15)' 
                              : index % 2 === 0 ? '#0f0f0f' : '#1a1a1a',
                            borderLeft: isSpecialTrade ? '3px solid #ffbf00' : '3px solid #333',
                            borderRight: '1px solid #333',
                            boxShadow: isSpecialTrade 
                              ? '0 0 15px rgba(255, 191, 0, 0.3), inset 0 0 10px rgba(255, 191, 0, 0.1)' 
                              : 'none'
                          }}
                        >
                          {/* TIME */}
                          <td className="px-3 py-3 text-blue-400 font-mono border-r border-gray-800" style={{backgroundColor: 'rgba(0,0,0,0.3)'}}>
                            {formatTime(trade.timestamp).slice(0, 8)}
                          </td>
                          
                          {/* TICKER (formerly NVL) */}
                          <td className="px-3 py-3 text-white font-bold border-r border-gray-800" style={{backgroundColor: 'rgba(0,0,0,0.2)'}}>
                            {trade.underlying_ticker}
                          </td>
                          
                          {/* TYPE (Call/Put) */}
                          <td className="px-3 py-3 border-r border-gray-800" style={{backgroundColor: 'rgba(0,0,0,0.3)'}}>
                            <span className={`font-bold px-2 py-1 rounded ${trade.type === 'call' ? 'text-green-400 bg-green-900/20' : 'text-red-400 bg-red-900/20'}`}>
                              {trade.type.toUpperCase()}
                            </span>
                          </td>
                          
                          {/* STRIKE */}
                          <td className="px-3 py-3 text-yellow-400 font-mono border-r border-gray-800" style={{backgroundColor: 'rgba(0,0,0,0.2)'}}>
                            ${trade.strike}
                          </td>
                          
                          {/* SPOT PRICE */}
                          <td className="px-3 py-3 text-cyan-400 font-mono border-r border-gray-800" style={{backgroundColor: 'rgba(0,0,0,0.3)'}}>
                            <div className="flex flex-col">
                              {(() => {
                                const tradeKey = `${trade.underlying_ticker}-${trade.strike}-${trade.expiry}-${trade.type}`;
                                const priceData = spotPrices[tradeKey];
                                
                                if (priceData === undefined) {
                                  return <span className="text-yellow-400 text-xs">Loading...</span>;
                                } else if (priceData.historical === -1 || priceData.current === -1) {
                                  return <span className="text-red-400 text-xs">Failed</span>;
                                } else {
                                  const historicalPrice = priceData.historical;
                                  const currentPrice = priceData.current;
                                  const priceChange = currentPrice - historicalPrice;
                                  const changeColor = priceChange >= 0 ? 'text-green-400' : 'text-red-400';
                                  
                                  return (
                                    <>
                                      <div className="flex items-center space-x-1 text-xs">
                                        <span className="text-gray-300">${historicalPrice.toFixed(2)}</span>
                                        <span className="text-orange-400">{'►'}</span>
                                        <span className={`font-bold ${changeColor}`}>${currentPrice.toFixed(2)}</span>
                                      </div>
                                      <div className={`text-xs ${changeColor}`}>
                                        {priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)} ({((priceChange / historicalPrice) * 100).toFixed(1)}%)
                                      </div>
                                    </>
                                  );
                                }
                              })()}
                            </div>
                          </td>
                          
                          {/* EXPIRY */}
                          <td className="px-3 py-3 text-white font-mono border-r border-gray-800" style={{backgroundColor: 'rgba(0,0,0,0.2)'}}>
                            {formatExpiration(trade.expiry)}
                          </td>
                          
                          {/* SIZE */}
                          <td className="px-3 py-3 text-white font-mono border-r border-gray-800" style={{backgroundColor: 'rgba(0,0,0,0.2)'}}>
                            <div className="flex flex-col">
                              <span className="font-bold">{trade.trade_size.toLocaleString()}</span>
                              <span className="text-gray-400 text-sm">@${trade.premium_per_contract.toFixed(2)}</span>
                            </div>
                          </td>
                          
                          {/* VOL/OI */}
                          <td className="px-3 py-3 text-gray-300 font-mono border-r border-gray-800" style={{backgroundColor: 'rgba(0,0,0,0.3)'}}>
                            {(() => {
                              const contractKey = `${trade.underlying_ticker}-${trade.strike}-${trade.expiry}-${trade.type}`;
                              const volOI = volOIData[contractKey];
                              if (volOI) {
                                if (volOI.volume === -1 && volOI.open_interest === -1) {
                                  return <span className="text-red-400 bg-red-900/20 px-2 py-1 rounded">Failed</span>;
                                }
                                return (
                                  <div className="flex flex-col text-sm">
                                    <span className="text-cyan-400">{volOI.volume.toLocaleString()}</span>
                                    <span className="text-purple-400">{volOI.open_interest.toLocaleString()}</span>
                                  </div>
                                );
                              }
                              return <span className="text-yellow-400 bg-yellow-900/20 px-2 py-1 rounded">Fetching...</span>;
                            })()}
                          </td>
                          
                          {/* PREMIUM */}
                          <td className="px-3 py-3 text-green-400 font-bold font-mono border-r border-gray-800" style={{backgroundColor: 'rgba(0,0,0,0.2)'}}>
                            <span className="bg-green-900/20 px-2 py-1 rounded">
                              {formatPremium(trade.total_premium)}
                            </span>
                          </td>
                          
                          {/* INTENTION */}
                          <td className="px-3 py-3 border-r border-gray-800" style={{backgroundColor: 'rgba(0,0,0,0.3)'}}>
                            <div className="flex items-center space-x-2 bg-blue-900/20 px-2 py-1 rounded">
                              <span className="text-blue-400">●</span>
                              <span className="text-blue-400 font-bold text-sm">BUY</span>
                            </div>
                          </td>
                          
                          {/* TRADE */}
                          <td className="px-3 py-3" style={{backgroundColor: 'rgba(0,0,0,0.2)'}}>
                            <span className={`font-bold px-2 py-1 rounded ${trade.trade_type === 'block' ? 'text-blue-400 bg-blue-900/20' : 'text-yellow-400 bg-yellow-900/20'}`}>
                              {trade.trade_type?.toUpperCase() || 'SWEEP'}
                            </span>
                          </td>
                        </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}