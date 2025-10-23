'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { TbRefresh, TbStar, TbStarFilled, TbInfoCircle, TbChartLine } from 'react-icons/tb';

interface OptionContract {
  ticker: string;
  strike_price: number;
  contract_type: 'call' | 'put';
  expiration_date: string;
  bid?: number;
  ask?: number;
  last_price?: number;
  volume?: number;
  open_interest?: number;
  implied_volatility?: number;
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
}

interface OptionsChainProps {
  symbol: string;
  currentPrice?: number;
}

interface WatchlistOption {
  id: string;
  ticker: string;
  symbol: string;
  strike: number;
  type: 'call' | 'put';
  expiration: string;
  bid: number;
  ask: number;
  lastPrice: number;
  delta: number;
  theta: number;
  addedAt: Date;
  entryPrice: number; // Mid price when added
}

const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

export default function OptionsChain({ symbol, currentPrice = 0 }: OptionsChainProps) {
  const [expirationDates, setExpirationDates] = useState<string[]>([]);
  const [selectedExpiration, setSelectedExpiration] = useState<string>('');
  const [callOptions, setCallOptions] = useState<OptionContract[]>([]);
  const [putOptions, setPutOptions] = useState<OptionContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [stockPrice, setStockPrice] = useState(currentPrice);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [watchlist, setWatchlist] = useState<WatchlistOption[]>([]);
  const [showWatchlist, setShowWatchlist] = useState(false);

  // Fetch current stock price
  const fetchStockPrice = useCallback(async () => {
    try {
      console.log('Fetching stock price for:', symbol);
      const response = await fetch(
        `https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?apikey=${POLYGON_API_KEY}`
      );
      const data = await response.json();
      console.log('Stock price data:', data);
      if (data.results?.[0]?.c) {
        setStockPrice(data.results[0].c);
        return data.results[0].c;
      }
    } catch (error) {
      console.error('Error fetching stock price:', error);
      setError('Failed to fetch stock price');
    }
    return null;
  }, [symbol]);

  // Fetch expiration dates
  const fetchExpirationDates = useCallback(async () => {
    try {
      console.log('Fetching all expiration dates for:', symbol);
      let allResults: any[] = [];
      let nextUrl: string | null = `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${symbol}&limit=1000&apikey=${POLYGON_API_KEY}`;
      
      // Fetch all pages
      while (nextUrl) {
        const response: Response = await fetch(nextUrl);
        const data: any = await response.json();
        
        if (data.results && data.results.length > 0) {
          allResults = allResults.concat(data.results);
        }
        
        nextUrl = data.next_url ? `${data.next_url}&apikey=${POLYGON_API_KEY}` : null;
        
        // Safety limit - stop after 10 pages (10,000 contracts)
        if (allResults.length >= 10000) break;
      }
      
      if (allResults.length > 0) {
        const dates = [...new Set(allResults.map((opt: any) => opt.expiration_date as string))].sort() as string[];
        console.log(`Found ${dates.length} expiration dates from ${allResults.length} contracts`);
        setExpirationDates(dates);
        if (dates.length > 0) {
          setSelectedExpiration(dates[0] as string);
          return dates[0];
        }
      } else {
        setError('No options contracts found for ' + symbol);
      }
    } catch (error) {
      console.error('Error fetching expiration dates:', error);
      setError('Failed to fetch expiration dates');
    }
    return null;
  }, [symbol]);

  // Fetch option quotes with bid/ask from quotes endpoint
  const fetchOptionQuote = async (optionSymbol: string): Promise<Partial<OptionContract>> => {
    try {
      // Primary: Get bid/ask from quotes endpoint (this works reliably)
      const quotesUrl = `https://api.polygon.io/v3/quotes/${optionSymbol}?limit=1&order=desc&apikey=${POLYGON_API_KEY}`;
      const quotesResponse = await fetch(quotesUrl);
      const quotesData = await quotesResponse.json();
      
      const result: Partial<OptionContract> = {
        bid: 0,
        ask: 0,
        last_price: 0,
        volume: 0,
        open_interest: 0,
        delta: 0,
        theta: 0,
        gamma: 0,
        vega: 0,
      };
      
      // Get bid/ask from quotes
      if (quotesData.status === 'OK' && quotesData.results && quotesData.results.length > 0) {
        const quote = quotesData.results[0];
        result.bid = quote.bid_price || 0;
        result.ask = quote.ask_price || 0;
        result.last_price = (result.bid && result.ask) ? (result.bid + result.ask) / 2 : 0;
        result.volume = 0; // Will get from snapshot only
      }
      
      // Get greeks and OI from snapshot - FIXED: Include underlying symbol in URL
      const snapshotUrl = `https://api.polygon.io/v3/snapshot/options/${symbol}/${optionSymbol}?apikey=${POLYGON_API_KEY}`;
      const snapshotResponse = await fetch(snapshotUrl);
      const snapshotData = await snapshotResponse.json();
      
      console.log(`Snapshot for ${optionSymbol}:`, snapshotData);
      
      if (snapshotData.status === 'OK' && snapshotData.results) {
        const snap = snapshotData.results;
        console.log(`Snapshot data:`, snap);
        console.log(`OI: ${snap.open_interest}, Delta: ${snap.greeks?.delta}, Theta: ${snap.greeks?.theta}`);
        
        result.open_interest = snap.open_interest || 0;
        result.delta = snap.greeks?.delta || 0;
        result.theta = snap.greeks?.theta || 0;
        result.gamma = snap.greeks?.gamma || 0;
        result.vega = snap.greeks?.vega || 0;
        result.implied_volatility = snap.implied_volatility || 0;
        
        // Use snapshot volume if available (more accurate)
        if (snap.day?.volume) {
          result.volume = snap.day.volume;
        }
      } else {
        console.warn(`No snapshot results for ${optionSymbol}:`, snapshotData);
      }
      
      return result;
    } catch (error) {
      console.error(`Error fetching quote for ${optionSymbol}:`, error);
      return {};
    }
  };

  // Fetch options chain for selected expiration
  const fetchOptionsChain = useCallback(async () => {
    if (!selectedExpiration || !stockPrice) {
      console.log('Skipping fetch - missing data:', { selectedExpiration, stockPrice });
      return;
    }
    
    setLoading(true);
    setError(null);
    try {
      // Calculate strike range (±20% from current price)
      const lowerBound = Math.floor(stockPrice * 0.80);
      const upperBound = Math.ceil(stockPrice * 1.20);

      console.log(`Fetching options chain for ${symbol} exp:${selectedExpiration} strikes:${lowerBound}-${upperBound}`);
      const url = `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${symbol}&expiration_date=${selectedExpiration}&strike_price.gte=${lowerBound}&strike_price.lte=${upperBound}&limit=1000&apikey=${POLYGON_API_KEY}`;
      const response = await fetch(url);
      const data = await response.json();
      
      console.log('Options chain response:', data);
      console.log('Number of contracts:', data.results?.length || 0);
      
      if (data.results && data.results.length > 0) {
        const calls: OptionContract[] = [];
        const puts: OptionContract[] = [];
        
        console.log('Sample contract:', data.results[0]);

        // Separate calls and puts
        data.results.forEach((contract: any) => {
          const option: OptionContract = {
            ticker: contract.ticker,
            strike_price: contract.strike_price,
            contract_type: contract.contract_type,
            expiration_date: contract.expiration_date,
          };

          if (contract.contract_type === 'call') {
            calls.push(option);
          } else {
            puts.push(option);
          }
        });

        // Sort by strike price
        calls.sort((a, b) => a.strike_price - b.strike_price);
        puts.sort((a, b) => a.strike_price - b.strike_price);

        console.log(`Found ${calls.length} calls and ${puts.length} puts`);
        
        // Get unique strikes
        const allStrikes = [...new Set([...calls, ...puts].map(o => o.strike_price))].sort((a, b) => a - b);
        
        // Find the closest strike to current price (ATM)
        const atmIndex = allStrikes.findIndex(strike => strike >= stockPrice);
        const startIndex = Math.max(0, atmIndex - 10);
        const endIndex = Math.min(allStrikes.length, atmIndex + 40);
        const initialStrikes = allStrikes.slice(startIndex, endIndex);
        
        console.log(`Loading quotes for ${initialStrikes.length} initial strikes (10 ITM, 40 OTM from ${stockPrice})...`);
        
        // Fetch quotes in small batches to avoid rate limiting
        const callsToFetch = calls.filter(c => initialStrikes.includes(c.strike_price));
        const putsToFetch = puts.filter(p => initialStrikes.includes(p.strike_price));
        const allToFetch = [...callsToFetch, ...putsToFetch];
        
        const BATCH_SIZE = 5; // Smaller batches to avoid overwhelming API
        const DELAY_MS = 200; // Delay between batches
        
        for (let i = 0; i < allToFetch.length; i += BATCH_SIZE) {
          const batch = allToFetch.slice(i, i + BATCH_SIZE);
          
          await Promise.all(
            batch.map(async (option) => {
              const quote = await fetchOptionQuote(option.ticker);
              Object.assign(option, quote);
            })
          );
          
          // Update UI progressively
          setCallOptions([...calls]);
          setPutOptions([...puts]);
          setLastUpdate(new Date());
          
          // Delay between batches to avoid rate limiting
          if (i + BATCH_SIZE < allToFetch.length) {
            await new Promise(resolve => setTimeout(resolve, DELAY_MS));
          }
        }
        
        console.log(`Loaded quotes for ${allToFetch.length} options`);
      } else {
        console.warn('No options found in response');
        setError('No options contracts found for selected expiration');
      }
    } catch (error) {
      console.error('Error fetching options chain:', error);
      setError('Failed to load options chain');
    } finally {
      setLoading(false);
    }
  }, [symbol, selectedExpiration, stockPrice]);

  // Initialize - load everything on mount
  useEffect(() => {
    const initializeData = async () => {
      setLoading(true);
      setError(null);
      
      // Step 1: Get stock price
      const price = await fetchStockPrice();
      if (!price) {
        setLoading(false);
        return;
      }
      
      // Step 2: Get expiration dates
      const firstExpiration = await fetchExpirationDates();
      if (!firstExpiration) {
        setLoading(false);
        return;
      }
      
      // Step 3: Load options chain (will be triggered by selectedExpiration change)
      setLoading(false);
    };
    
    initializeData();
  }, [symbol]); // Only depend on symbol

  // Fetch chain when expiration changes
  useEffect(() => {
    if (selectedExpiration && stockPrice > 0) {
      fetchOptionsChain();
    }
  }, [selectedExpiration, stockPrice]);

  // Get all unique strikes (no pagination - just scrollable list)
  const allStrikes = [...new Set([...callOptions, ...putOptions].map(o => o.strike_price))].sort((a, b) => a - b);

  // Helper to check if strike is ITM
  const isITM = (strike: number, type: 'call' | 'put') => {
    if (type === 'call') return stockPrice > strike;
    return stockPrice < strike;
  };

  // Helper to check if strike is ATM
  const isATM = (strike: number) => {
    return Math.abs(stockPrice - strike) / stockPrice < 0.02; // Within 2%
  };

  // Watchlist functions
  const addToWatchlist = (option: OptionContract) => {
    console.log('Adding to watchlist - option data:', option);
    console.log('Delta:', option.delta, 'Theta:', option.theta);
    
    const entryPrice = ((option.bid || 0) + (option.ask || 0)) / 2;
    
    const watchlistItem: WatchlistOption = {
      id: `${option.ticker}-${Date.now()}`,
      ticker: option.ticker,
      symbol: symbol,
      strike: option.strike_price,
      type: option.contract_type,
      expiration: option.expiration_date,
      bid: option.bid || 0,
      ask: option.ask || 0,
      lastPrice: option.last_price || 0,
      delta: option.delta || 0,
      theta: option.theta || 0,
      addedAt: new Date(),
      entryPrice: entryPrice
    };
    
    console.log('Watchlist item created:', watchlistItem);
    setWatchlist(prev => [...prev, watchlistItem]);
    
    // Save to localStorage
    const saved = localStorage.getItem('optionsWatchlist');
    const existing = saved ? JSON.parse(saved) : [];
    localStorage.setItem('optionsWatchlist', JSON.stringify([...existing, watchlistItem]));
  };

  const removeFromWatchlist = (id: string) => {
    setWatchlist(prev => prev.filter(item => item.id !== id));
    
    // Update localStorage
    const saved = localStorage.getItem('optionsWatchlist');
    if (saved) {
      const existing = JSON.parse(saved);
      localStorage.setItem('optionsWatchlist', JSON.stringify(existing.filter((item: WatchlistOption) => item.id !== id)));
    }
  };

  const isInWatchlist = (ticker: string) => {
    return watchlist.some(item => item.ticker === ticker);
  };

  // Load watchlist from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('optionsWatchlist');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Migrate old items that don't have delta/theta/entryPrice
        const migrated = parsed.map((item: WatchlistOption) => ({
          ...item,
          delta: item.delta || 0,
          theta: item.theta || 0,
          entryPrice: item.entryPrice || ((item.bid + item.ask) / 2)
        }));
        setWatchlist(migrated);
      } catch (e) {
        console.error('Error loading watchlist:', e);
      }
    }
  }, []);

  return (
    <div className="h-full flex flex-col bg-black text-white">
      {/* Enhanced Header */}
      <div className="flex-shrink-0 border-b border-orange-900/30 bg-gradient-to-b from-gray-950 via-gray-900 to-black shadow-lg">
        {/* Top Bar */}
        <div className="px-4 pt-4 pb-2 border-b border-gray-800/50">
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-xl font-bold bg-gradient-to-r from-orange-400 to-orange-200 bg-clip-text text-transparent">
                  {symbol}
                </h2>
                <span className="text-xs text-gray-500 font-mono">OPTIONS CHAIN</span>
              </div>
              
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-white">Spot</span>
                  <span className="text-white font-bold text-lg">${stockPrice.toFixed(2)}</span>
                </div>
                
                {lastUpdate && (
                  <div className="flex items-center gap-2 text-xs">
                    <TbInfoCircle className="w-3 h-3 text-white" />
                    <span className="text-white">
                      Updated {lastUpdate.toLocaleTimeString()}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-4 mt-2 text-xs">
                <span className="text-white">
                  <span className="text-green-400 font-semibold">{callOptions.length}</span> Calls
                </span>
                <span className="text-white">
                  <span className="text-red-400 font-semibold">{putOptions.length}</span> Puts
                </span>
                <span className="text-white">
                  <span className="text-orange-400 font-semibold">{allStrikes.length}</span> Strikes
                </span>
                <span className="text-white">•</span>
                <span className="text-white">
                  <span className="text-cyan-400 font-semibold">{watchlist.length}</span> Watchlist
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowWatchlist(!showWatchlist)}
                className={`px-3 py-2 rounded-lg border transition-all duration-200 flex items-center gap-2 ${
                  showWatchlist 
                    ? 'bg-orange-500/20 border-orange-500/50 text-orange-400' 
                    : 'bg-gray-900 border-gray-700 text-white hover:border-orange-500/50 hover:text-orange-400'
                }`}
                title="Toggle Watchlist"
              >
                <TbStarFilled className="w-4 h-4" />
                <span className="text-xs font-bold">WATCHLIST</span>
                {watchlist.length > 0 && (
                  <span className="bg-orange-500 text-black text-xs rounded-full px-1.5 py-0.5 font-bold">
                    {watchlist.length}
                  </span>
                )}
              </button>
              
              <button
                onClick={() => {
                  fetchStockPrice();
                  fetchOptionsChain();
                }}
                disabled={loading}
                className="px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 hover:border-cyan-500/50 hover:bg-gray-800 transition-all duration-200 flex items-center gap-2 disabled:opacity-50"
                title="Refresh Data"
              >
                <TbRefresh className={`w-4 h-4 text-cyan-400 ${loading ? 'animate-spin' : ''}`} />
                <span className="text-xs font-bold text-white">REFRESH</span>
              </button>
            </div>
          </div>

          {/* Expiration Selector */}
          <div className="relative">
            <select
              value={selectedExpiration}
              onChange={(e) => setSelectedExpiration(e.target.value)}
              className="w-full bg-gray-900/50 backdrop-blur-sm border border-gray-700/50 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/20 transition-all appearance-none cursor-pointer hover:bg-gray-800/50"
              disabled={loading || expirationDates.length === 0}
            >
              {expirationDates.length === 0 ? (
                <option>Loading expirations...</option>
              ) : (
                expirationDates.map((date) => {
                  const daysUntil = Math.ceil((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                  return (
                    <option key={date} value={date} className="bg-gray-900">
                      {date} ({daysUntil}d DTE)
                    </option>
                  );
                })
              )}
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </div>

        {/* Column Headers */}
        {!showWatchlist && (
          <div className="grid grid-cols-[1fr_auto_1fr] gap-0 text-xs font-bold border-t border-gray-800/50 bg-gray-950/50 backdrop-blur-sm">
            {/* Calls Header */}
            <div className="grid grid-cols-7 gap-2 px-3 py-3 border-r border-gray-800/50 bg-gradient-to-r from-green-900/30 via-green-900/10 to-transparent">
              <div className="text-center text-green-400/80 text-[10px] uppercase tracking-wider"></div>
              <div className="text-right text-green-400 uppercase tracking-wide">OI</div>
              <div className="text-right text-green-400 uppercase tracking-wide">VOL</div>
              <div className="text-right text-green-400 uppercase tracking-wide">DELTA</div>
              <div className="text-right text-green-400 uppercase tracking-wide">THETA</div>
              <div className="text-right text-green-400 uppercase tracking-wide">BID</div>
              <div className="text-right text-green-400 uppercase tracking-wide">ASK</div>
            </div>

            {/* Strike Header */}
            <div className="px-4 py-3 text-center text-orange-400 border-r border-gray-800/50 bg-gray-900/80 min-w-[90px] uppercase tracking-wider">
              STRIKE
            </div>

            {/* Puts Header */}
            <div className="grid grid-cols-7 gap-2 px-3 py-3 bg-gradient-to-l from-red-900/30 via-red-900/10 to-transparent">
              <div className="text-left text-red-400 uppercase tracking-wide">ASK</div>
              <div className="text-left text-red-400 uppercase tracking-wide">BID</div>
              <div className="text-left text-red-400 uppercase tracking-wide">THETA</div>
              <div className="text-left text-red-400 uppercase tracking-wide">DELTA</div>
              <div className="text-left text-red-400 uppercase tracking-wide">VOL</div>
              <div className="text-left text-red-400 uppercase tracking-wide">OI</div>
              <div className="text-center text-red-400/80 text-[10px] uppercase tracking-wider"></div>
            </div>
          </div>
        )}
      </div>

      {/* Options Chain Body */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {error ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center p-4">
              <div className="text-red-400 text-sm mb-2">⚠️ {error}</div>
              <button
                onClick={() => {
                  setError(null);
                  fetchStockPrice();
                  fetchExpirationDates();
                }}
                className="btn-3d-carved px-4 py-2 text-xs"
              >
                TRY AGAIN
              </button>
            </div>
          </div>
        ) : loading && callOptions.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <TbRefresh className="w-8 h-8 animate-spin mx-auto mb-2 text-cyan-400" />
              <div className="text-sm text-gray-400">Loading options chain...</div>
            </div>
          </div>
        ) : allStrikes.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-gray-400">
              No options data available
            </div>
          </div>
        ) : showWatchlist ? (
          /* Watchlist View */
          <div className="p-4">
            {watchlist.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <TbStar className="w-16 h-16 text-gray-700 mb-4" />
                <h3 className="text-lg font-bold text-white mb-2">No Options in Watchlist</h3>
                <p className="text-sm text-white">Click the star icon next to any option to add it to your watchlist</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-xs font-bold text-white uppercase tracking-wider mb-3 flex items-center justify-between">
                  <span>Your Watchlist ({watchlist.length})</span>
                  {watchlist.length > 0 && (
                    <button
                      onClick={() => {
                        if (confirm('Clear all watchlist items?')) {
                          setWatchlist([]);
                          localStorage.removeItem('optionsWatchlist');
                        }
                      }}
                      className="text-red-400 hover:text-red-300 text-xs"
                    >
                      Clear All
                    </button>
                  )}
                </div>

                {/* Split Layout: Calls on Left, Puts on Right */}
                <div className="grid grid-cols-2 gap-3">
                  {/* CALLS Column */}
                  <div className="space-y-2">
                    <div className="text-sm font-bold text-green-400 uppercase tracking-wider border-b border-green-900/30 pb-1">
                      Calls ({watchlist.filter(w => w.type === 'call').length})
                    </div>
                    {watchlist.filter(item => item.type === 'call').map((item) => {
                      const currentPrice = (item.bid + item.ask) / 2;
                      const plPercent = ((currentPrice - item.entryPrice) / item.entryPrice) * 100;
                      const isProfit = plPercent >= 0;
                      
                      return (
                        <div
                          key={item.id}
                          className="p-2 rounded-lg border bg-green-900/10 border-green-900/30 hover:bg-green-900/20 transition-colors"
                        >
                          {/* Header Row */}
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-1.5">
                              <span className="text-white font-bold text-sm">{item.symbol}</span>
                              <span className="text-orange-400 font-bold text-sm">${item.strike}</span>
                              <span className="text-white text-xs">• {item.expiration}</span>
                            </div>
                            <button
                              onClick={() => removeFromWatchlist(item.id)}
                              className="text-orange-400 hover:text-orange-300 transition-colors"
                              title="Remove from watchlist"
                            >
                              <TbStarFilled className="w-4 h-4" />
                            </button>
                          </div>
                          
                          {/* P/L Badge */}
                          <div className={`text-sm font-bold mb-1.5 ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
                            {isProfit ? '+' : ''}{plPercent.toFixed(2)}%
                          </div>
                          
                          {/* Data Grid */}
                          <div className="grid grid-cols-[auto_auto_auto] gap-x-3 gap-y-1.5 text-xs w-fit">
                            <div>
                              <div className="text-white text-xs uppercase font-bold leading-tight">Bid</div>
                              <div className="font-bold font-mono text-sm text-green-400">
                                ${item.bid.toFixed(2)}
                              </div>
                            </div>
                            <div>
                              <div className="text-white text-xs uppercase font-bold leading-tight">Ask</div>
                              <div className="font-bold font-mono text-sm text-green-400">
                                ${item.ask.toFixed(2)}
                              </div>
                            </div>
                            <div>
                              <div className="text-white text-xs uppercase font-bold leading-tight">Mid</div>
                              <div className="text-white font-bold font-mono text-sm">
                                ${currentPrice.toFixed(2)}
                              </div>
                            </div>
                            <div>
                              <div className="text-purple-400 text-xs uppercase font-bold leading-tight">Delta</div>
                              <div className="text-purple-400 font-bold font-mono text-sm">
                                {typeof item.delta === 'number' ? item.delta.toFixed(4) : '—'}
                              </div>
                            </div>
                            <div>
                              <div className="text-red-400 text-xs uppercase font-bold leading-tight">Theta</div>
                              <div className="text-red-400 font-bold font-mono text-sm">
                                {typeof item.theta === 'number' ? item.theta.toFixed(4) : '—'}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {watchlist.filter(w => w.type === 'call').length === 0 && (
                      <div className="text-center text-gray-500 text-sm py-4">No calls in watchlist</div>
                    )}
                  </div>

                  {/* PUTS Column */}
                  <div className="space-y-2">
                    <div className="text-sm font-bold text-red-400 uppercase tracking-wider border-b border-red-900/30 pb-1">
                      Puts ({watchlist.filter(w => w.type === 'put').length})
                    </div>
                    {watchlist.filter(item => item.type === 'put').map((item) => {
                      const currentPrice = (item.bid + item.ask) / 2;
                      const plPercent = ((currentPrice - item.entryPrice) / item.entryPrice) * 100;
                      const isProfit = plPercent >= 0;
                      
                      return (
                        <div
                          key={item.id}
                          className="p-2 rounded-lg border bg-red-900/10 border-red-900/30 hover:bg-red-900/20 transition-colors"
                        >
                          {/* Header Row */}
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-1.5">
                              <span className="text-white font-bold text-sm">{item.symbol}</span>
                              <span className="text-orange-400 font-bold text-sm">${item.strike}</span>
                              <span className="text-white text-xs">• {item.expiration}</span>
                            </div>
                            <button
                              onClick={() => removeFromWatchlist(item.id)}
                              className="text-orange-400 hover:text-orange-300 transition-colors"
                              title="Remove from watchlist"
                            >
                              <TbStarFilled className="w-4 h-4" />
                            </button>
                          </div>
                          
                          {/* P/L Badge */}
                          <div className={`text-sm font-bold mb-1.5 ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
                            {isProfit ? '+' : ''}{plPercent.toFixed(2)}%
                          </div>
                          
                          {/* Data Grid */}
                          <div className="grid grid-cols-[auto_auto_auto] gap-x-3 gap-y-1.5 text-xs w-fit">
                            <div>
                              <div className="text-white text-xs uppercase font-bold leading-tight">Bid</div>
                              <div className="font-bold font-mono text-sm text-red-400">
                                ${item.bid.toFixed(2)}
                              </div>
                            </div>
                            <div>
                              <div className="text-white text-xs uppercase font-bold leading-tight">Ask</div>
                              <div className="font-bold font-mono text-sm text-red-400">
                                ${item.ask.toFixed(2)}
                              </div>
                            </div>
                            <div>
                              <div className="text-white text-xs uppercase font-bold leading-tight">Mid</div>
                              <div className="text-white font-bold font-mono text-sm">
                                ${currentPrice.toFixed(2)}
                              </div>
                            </div>
                            <div>
                              <div className="text-purple-400 text-xs uppercase font-bold leading-tight">Delta</div>
                              <div className="text-purple-400 font-bold font-mono text-sm">
                                {typeof item.delta === 'number' ? item.delta.toFixed(4) : '—'}
                              </div>
                            </div>
                            <div>
                              <div className="text-red-400 text-xs uppercase font-bold leading-tight">Theta</div>
                              <div className="text-red-400 font-bold font-mono text-sm">
                                {typeof item.theta === 'number' ? item.theta.toFixed(4) : '—'}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {watchlist.filter(w => w.type === 'put').length === 0 && (
                      <div className="text-center text-gray-500 text-sm py-4">No puts in watchlist</div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-900/50">
            {allStrikes.map((strike) => {
              const call = callOptions.find(c => c.strike_price === strike);
              const put = putOptions.find(p => p.strike_price === strike);
              const callITM = isITM(strike, 'call');
              const putITM = isITM(strike, 'put');
              const atm = isATM(strike);

              return (
                <div
                  key={strike}
                  className={`grid grid-cols-[1fr_auto_1fr] gap-0 hover:bg-gray-900/30 transition-all ${
                    atm ? 'bg-orange-900/10 border-y border-orange-900/20' : ''
                  }`}
                >
                  {/* Call Option */}
                  <div className={`grid grid-cols-7 gap-2 px-3 py-3 text-xs border-r border-gray-800/50 ${
                    callITM ? 'bg-green-950/20' : 'bg-transparent'
                  }`}>
                    <div className="flex items-center justify-center">
                      {call && (
                        <button
                          onClick={() => isInWatchlist(call.ticker) ? removeFromWatchlist(watchlist.find(w => w.ticker === call.ticker)?.id || '') : addToWatchlist(call)}
                          className="text-white hover:text-orange-400 transition-colors"
                          title={isInWatchlist(call.ticker) ? 'Remove from watchlist' : 'Add to watchlist'}
                        >
                          {isInWatchlist(call.ticker) ? (
                            <TbStarFilled className="w-4 h-4 text-orange-400" />
                          ) : (
                            <TbStar className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </div>
                    <div className="text-right text-white font-mono">
                      {call?.open_interest ? call.open_interest.toLocaleString() : '—'}
                    </div>
                    <div className="text-right text-white font-mono">
                      {call?.volume ? call.volume.toLocaleString() : '—'}
                    </div>
                    <div className="text-right text-white font-mono">
                      {call?.delta ? call.delta.toFixed(3) : '—'}
                    </div>
                    <div className="text-right text-white font-mono">
                      {call?.theta ? call.theta.toFixed(3) : '—'}
                    </div>
                    <div className={`text-right font-mono ${call?.bid ? 'text-green-400 font-bold' : 'text-white'}`}>
                      {call?.bid ? call.bid.toFixed(2) : '—'}
                    </div>
                    <div className={`text-right font-mono ${call?.ask ? 'text-green-400 font-bold' : 'text-white'}`}>
                      {call?.ask ? call.ask.toFixed(2) : '—'}
                    </div>
                  </div>

                  {/* Strike Price */}
                  <div className={`px-4 py-3 text-center text-sm font-bold border-r border-gray-800/50 min-w-[90px] ${
                    atm ? 'bg-orange-900/30 text-orange-400' : 'bg-gray-900/50 text-white'
                  }`}>
                    ${strike.toFixed(2)}
                  </div>

                  {/* Put Option */}
                  <div className={`grid grid-cols-7 gap-2 px-3 py-3 text-xs ${
                    putITM ? 'bg-red-950/20' : 'bg-transparent'
                  }`}>
                    <div className={`text-left font-mono ${put?.ask ? 'text-red-400 font-bold' : 'text-white'}`}>
                      {put?.ask ? put.ask.toFixed(2) : '—'}
                    </div>
                    <div className={`text-left font-mono ${put?.bid ? 'text-red-400 font-bold' : 'text-white'}`}>
                      {put?.bid ? put.bid.toFixed(2) : '—'}
                    </div>
                    <div className="text-left text-white font-mono">
                      {put?.theta ? put.theta.toFixed(3) : '—'}
                    </div>
                    <div className="text-left text-white font-mono">
                      {put?.delta ? put.delta.toFixed(3) : '—'}
                    </div>
                    <div className="text-left text-white font-mono">
                      {put?.volume ? put.volume.toLocaleString() : '—'}
                    </div>
                    <div className="text-left text-white font-mono">
                      {put?.open_interest ? put.open_interest.toLocaleString() : '—'}
                    </div>
                    <div className="flex items-center justify-center">
                      {put && (
                        <button
                          onClick={() => isInWatchlist(put.ticker) ? removeFromWatchlist(watchlist.find(w => w.ticker === put.ticker)?.id || '') : addToWatchlist(put)}
                          className="text-white hover:text-orange-400 transition-colors"
                          title={isInWatchlist(put.ticker) ? 'Remove from watchlist' : 'Add to watchlist'}
                        >
                          {isInWatchlist(put.ticker) ? (
                            <TbStarFilled className="w-4 h-4 text-orange-400" />
                          ) : (
                            <TbStar className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #000;
          border-left: 1px solid #1f2937;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, #f97316 0%, #ea580c 100%);
          border-radius: 5px;
          border: 2px solid #000;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(180deg, #fb923c 0%, #f97316 100%);
        }
      `}</style>
    </div>
  );
}
