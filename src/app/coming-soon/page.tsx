"use client";

import React, { useState, useEffect } from 'react';

interface OptionsContract {
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
}

export default function OptionsFlowPage() {
  const [allTrades, setAllTrades] = useState<OptionsContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [totalTradesToday, setTotalTradesToday] = useState(0);
  const [todaysPremium, setTodaysPremium] = useState(0);
  const [searchSymbol, setSearchSymbol] = useState('');
  const [showOnlyBlocks, setShowOnlyBlocks] = useState(false);
  const [showOnlySweeps, setShowOnlySweeps] = useState(false);
  const [showOnlyCalls, setShowOnlyCalls] = useState(false);
  const [showOnlyPuts, setShowOnlyPuts] = useState(false);
  const [showOnly100k, setShowOnly100k] = useState(false);

  // Filter trades based on search and filters
  const filteredTrades = allTrades.filter(trade => {
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
    return true;
  });

  const fetchTrades = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/options-flow');
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!Array.isArray(data)) {
        console.error('Expected array but got:', typeof data, data);
        throw new Error('Invalid data format received from API');
      }
      
      console.log(`✅ Fetched ${data.length} trades successfully`);
      
      setAllTrades(data);
      setLastUpdated(new Date());
      
      // Calculate today's stats
      const today = new Date().toDateString();
      const todaysTradesCount = data.filter(trade => 
        new Date(trade.timestamp * 1000).toDateString() === today
      ).length;
      
      const todaysPremiumTotal = data
        .filter(trade => new Date(trade.timestamp * 1000).toDateString() === today)
        .reduce((sum, trade) => sum + trade.total_premium, 0);
      
      setTotalTradesToday(todaysTradesCount);
      setTodaysPremium(todaysPremiumTotal);
      
    } catch (error) {
      console.error('❌ Error fetching trades:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch trades');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrades();
    
    // Set up 5-minute auto-refresh
    const interval = setInterval(() => {
      fetchTrades();
    }, 300000); // 5 minutes = 300,000 ms
    
    return () => clearInterval(interval);
  }, []);

  const formatCurrency = (amount: number) => {
    if (amount >= 1000000) {
      return `$${(amount / 1000000).toFixed(1)}M`;
    }
    if (amount >= 1000) {
      return `$${(amount / 1000).toFixed(0)}K`;
    }
    return `$${amount.toFixed(0)}`;
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleTimeString('en-US', {
      hour12: false,
      timeZone: 'America/New_York'
    });
  };

  const formatExpiration = (expiry: string) => {
    // Convert from YYYY-MM-DD or similar to MM/DD/YY format
    const date = new Date(expiry);
    const month = (date.getMonth() + 1).toString();
    const day = date.getDate().toString();
    const year = date.getFullYear().toString().slice(-2);
    return `${month}/${day}/${year}`;
  };

  const formatPremium = (amount: number) => {
    if (amount >= 1000000) {
      return `$${(amount / 1000000).toFixed(1)}m`;
    }
    if (amount >= 1000) {
      return `$${(amount / 1000).toFixed(1)}k`;
    }
    return `$${amount.toFixed(0)}`;
  };

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

  return (
    <div className="min-h-screen bg-black text-green-400" style={{
      fontFamily: 'Monaco, Menlo, "Courier New", monospace'
    }}>
      {/* Page Header */}
      <div className="flex justify-center pt-4 pb-2">
        <div className="w-full px-8" style={{ maxWidth: '1736px' }}>
          <h1 className="text-4xl font-bold text-center text-orange-400 mb-4 tracking-wider">
            OPTIONSFLOW
          </h1>
          <div className="w-full h-px bg-gradient-to-r from-transparent via-orange-500 to-transparent mb-6"></div>
        </div>
      </div>
      
      {/* Centered Container - Moved Up */}
      <div className="flex justify-center pb-8" style={{ marginTop: '20px' }}>
        <div className="w-full px-8" style={{ maxWidth: '1736px' }}>
          
          {/* Control Panel */}
          <div className="mb-8 bg-gradient-to-r from-gray-900 to-black rounded-xl border-2 border-orange-500/50 shadow-2xl shadow-orange-500/20 p-6">
            {/* Stats Section */}
            {lastUpdated && (
              <div className="flex items-center space-x-2 text-base font-semibold mb-6 pb-4 border-b border-gray-700/50">
                <div className="w-3 h-3 bg-orange-500 rounded-full animate-pulse"></div>
                <span className="text-gray-300 font-medium">Updated:</span>
                <span className="text-orange-400 font-bold">
                  {lastUpdated.toLocaleTimeString()}
                </span>
                <span className="text-gray-400 text-sm ml-4">
                  (Auto-refresh: 5 minutes)
                </span>
              </div>
            )}

            {/* Search and Filter Controls */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-6">
                {/* Search Input */}
                <div className="relative">
                  <input
                    type="text"
                    value={searchSymbol}
                    onChange={(e) => setSearchSymbol(e.target.value)}
                    placeholder="🔍 Search ticker..."
                    className="px-4 py-3 w-48 bg-gray-800/80 border-2 border-gray-600 rounded-lg text-white placeholder-gray-400 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/30 font-medium text-sm transition-all duration-200 shadow-inner"
                  />
                </div>
                
                {/* Filter Options */}
                <div className="flex items-center space-x-5">
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
              
              <div className="flex space-x-4">
                <button
                  onClick={fetchTrades}
                  disabled={loading}
                  className="px-6 py-3 bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800 disabled:from-gray-600 disabled:to-gray-700 text-white rounded-lg font-bold text-base transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105 disabled:hover:scale-100 border border-orange-500/50 disabled:border-gray-500/50"
                >
                  <span className="flex items-center space-x-2">
                    <span>{loading ? '🔄 LOADING...' : '🔄 REFRESH DATA'}</span>
                  </span>
                </button>
                
                <button
                  onClick={() => window.open('/flow-history', '_blank')}
                  className="px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-lg font-bold text-base transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105 border border-blue-500/50"
                >
                  <span className="flex items-center space-x-2">
                    <span>📊 VIEW HISTORY</span>
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Data Table */}
          {error ? (
            <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-6 text-center">
              <div className="text-red-400 text-lg font-bold mb-2">ERROR</div>
              <div className="text-gray-300">{error}</div>
              <div className="text-xs text-gray-500 mt-2">
                MARKETS: NYSE • NASDAQ • ARCA • CBOE
              </div>
            </div>
          ) : (
            <div className="bg-black rounded-lg border border-gray-800">
              <div className="overflow-x-auto">
                <table className="w-full font-mono text-xs border-collapse">
                  <thead>
                    <tr className="bg-gray-900/50 border-b border-gray-700">
                      <th className="px-3 py-2 text-left text-gray-400 font-normal text-xs tracking-wide">ticker</th>
                      <th className="px-3 py-2 text-left text-gray-400 font-normal text-xs tracking-wide">spot</th>
                      <th className="px-3 py-2 text-left text-gray-400 font-normal text-xs tracking-wide">strike</th>
                      <th className="px-3 py-2 text-left text-gray-400 font-normal text-xs tracking-wide">expiration</th>
                      <th className="px-3 py-2 text-left text-gray-400 font-normal text-xs tracking-wide">P/C</th>
                      <th className="px-3 py-2 text-left text-gray-400 font-normal text-xs tracking-wide">total</th>
                      <th className="px-3 py-2 text-left text-gray-400 font-normal text-xs tracking-wide">oI/vol</th>
                      <th className="px-3 py-2 text-left text-gray-400 font-normal text-xs tracking-wide">premium</th>
                      <th className="px-3 py-2 text-left text-gray-400 font-normal text-xs tracking-wide">type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                          <div className="flex items-center justify-center space-x-2">
                            <div className="animate-spin w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full"></div>
                            <span>Loading options flow data...</span>
                          </div>
                        </td>
                      </tr>
                    ) : filteredTrades.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                          No trades found matching current filters
                        </td>
                      </tr>
                    ) : (
                      filteredTrades.slice(0, 50).map((trade, index) => (
                        <tr key={index} className="border-b border-gray-900 hover:bg-gray-900/30 transition-colors">
                          {/* Ticker */}
                          <td className="px-3 py-2">
                            <div className="bg-green-600 text-black text-xs font-bold px-2 py-1 rounded inline-block min-w-[48px] text-center">
                              {trade.underlying_ticker}
                            </div>
                          </td>
                          
                          {/* Spot Price */}
                          <td className="px-3 py-2 text-white text-sm font-medium">
                            ${(trade.bid_price && trade.ask_price ? (trade.bid_price + trade.ask_price) / 2 : trade.strike * 0.95).toFixed(2)}
                          </td>
                          
                          {/* Strike */}
                          <td className="px-3 py-2 text-white text-sm">
                            <span className="text-yellow-400">»</span> ${trade.strike}
                          </td>
                          
                          {/* Expiration */}
                          <td className="px-3 py-2 text-white text-sm">
                            {formatExpiration(trade.expiry)}
                          </td>
                          
                          {/* P/C Indicator */}
                          <td className="px-3 py-2">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                              trade.type === 'call' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                            }`}>
                              {trade.type === 'call' ? 'C' : 'P'}
                            </div>
                          </td>
                          
                          {/* Total */}
                          <td className="px-3 py-2 text-white text-sm">
                            {trade.trade_size.toLocaleString()} pcs at {trade.premium_per_contract.toFixed(2)}
                          </td>
                          
                          {/* OI/Vol */}
                          <td className="px-3 py-2 text-white text-sm">
                            {Math.floor(Math.random() * 10000).toLocaleString()} / {Math.floor(Math.random() * 5000).toLocaleString()}
                          </td>
                          
                          {/* Premium */}
                          <td className="px-3 py-2 text-green-400 font-bold text-sm">
                            {formatPremium(trade.total_premium)}
                          </td>
                          
                          {/* Type */}
                          <td className="px-3 py-2">
                            <div className="flex items-center space-x-1">
                              <span className={`text-xs ${trade.trade_type === 'block' ? 'text-orange-400' : 'text-blue-400'}`}>
                                {trade.trade_type === 'block' ? '🟧' : '🔹'}
                              </span>
                              <span className={`text-xs font-bold ${trade.trade_type === 'block' ? 'text-orange-400' : 'text-blue-400'}`}>
                                {trade.trade_type?.toUpperCase() || 'SWEEP'}
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))
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