'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import '../app/options-flow/mobile.css';

// Import your existing Polygon service
import { polygonService } from '@/lib/polygonService';

// Polygon API key for bid/ask analysis
const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

// BID/ASK EXECUTION ANALYSIS - OPTIMIZED FOR HIGH VOLUME
// COMBINED ENRICHMENT - Fetch Vol/OI AND Fill Style in ONE API call per trade
const enrichTradeDataCombined = async (
  trades: any[], 
  updateCallback: (results: any[]) => void
): Promise<any[]> => {
  if (trades.length === 0) return trades;
  
  const BATCH_SIZE = 50; // Process 50 trades per batch
  const BATCH_DELAY = 100; // 100ms delay between batches
  const REQUEST_DELAY = 20; // 20ms stagger between requests
  const batches = [];
  
  for (let i = 0; i < trades.length; i += BATCH_SIZE) {
    batches.push(trades.slice(i, i + BATCH_SIZE));
  }
  
  console.log(`🚀 COMBINED ENRICHMENT: ${trades.length} trades in ${batches.length} batches`);
  
  const allResults = [];
  let successCount = 0;
  let failCount = 0;
  
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    
    if (batchIndex % 10 === 0) {
      console.log(`📦 Batch ${batchIndex + 1}/${batches.length} (${Math.round((batchIndex/batches.length)*100)}%)`);
    }
    
    const batchResults = await Promise.all(
      batch.map(async (trade, tradeIndex) => {
        await new Promise(resolve => setTimeout(resolve, tradeIndex * REQUEST_DELAY));
        
        try {
          const expiry = trade.expiry.replace(/-/g, '').slice(2);
          const strikeFormatted = String(Math.round(trade.strike * 1000)).padStart(8, '0');
          const optionType = trade.type.toLowerCase() === 'call' ? 'C' : 'P';
          const optionTicker = `O:${trade.underlying_ticker}${expiry}${optionType}${strikeFormatted}`;
          
          // Use snapshot endpoint - gets EVERYTHING in one call (quotes, greeks, Vol/OI)
          const snapshotUrl = `https://api.polygon.io/v3/snapshot/options/${trade.underlying_ticker}/${optionTicker}?apikey=${POLYGON_API_KEY}`;
          
          const response = await fetch(snapshotUrl, {
            signal: AbortSignal.timeout(8000)
          });
          
          if (!response.ok) {
            return { ...trade, fill_style: 'N/A', volume: null, open_interest: null };
          }
          
          const data = await response.json();
          
          if (data.results) {
            const result = data.results;
            
            // Extract Vol/OI
            const volume = result.day?.volume || null;
            const openInterest = result.open_interest || null;
            
            console.log(`✅ ${trade.underlying_ticker}: Vol=${volume}, OI=${openInterest}`);
            successCount++;
            
            // Extract fill style from last quote
            let fillStyle = 'N/A';
            if (result.last_quote) {
              const bid = result.last_quote.bid;
              const ask = result.last_quote.ask;
              const fillPrice = trade.premium_per_contract;
              
              if (bid && ask && fillPrice) {
                const midpoint = (bid + ask) / 2;
                
                if (fillPrice >= ask + 0.01) {
                  fillStyle = 'AA';
                } else if (fillPrice <= bid - 0.01) {
                  fillStyle = 'BB';
                } else if (fillPrice === ask) {
                  fillStyle = 'A';
                } else if (fillPrice === bid) {
                  fillStyle = 'B';
                } else if (fillPrice >= midpoint) {
                  fillStyle = 'A';
                } else {
                  fillStyle = 'B';
                }
              }
            }
            
            return { ...trade, fill_style: fillStyle, volume, open_interest: openInterest };
          }
          
          return { ...trade, fill_style: 'N/A', volume: null, open_interest: null };
        } catch (error) {
          failCount++;
          console.error(`❌ Error enriching ${trade.underlying_ticker}:`, error);
          return { ...trade, fill_style: 'N/A', volume: null, open_interest: null };
        }
      })
    );
    
    allResults.push(...batchResults);
    updateCallback([...allResults]);
    
    if (batchIndex < batches.length - 1) {
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
    }
  }
  
  console.log(`✅ Combined enrichment complete: ${allResults.length} trades (${successCount} success, ${failCount} failed)`);
  return allResults;
};

// OLD SEPARATE FUNCTIONS - DEPRECATED (keeping for backwards compatibility)
const analyzeBidAskExecutionLightning = async (
  trades: any[], 
  updateCallback: (results: any[]) => void
): Promise<any[]> => {
  if (trades.length === 0) return trades;
  
  const BATCH_SIZE = 50; // Increased from 10 to 50 for speed
  const BATCH_DELAY = 50; // Reduced delay to 50ms
  const batches = [];
  
  for (let i = 0; i < trades.length; i += BATCH_SIZE) {
    batches.push(trades.slice(i, i + BATCH_SIZE));
  }
  
  console.log(`🚀 Processing ${trades.length} trades in ${batches.length} batches of ${BATCH_SIZE}`);
  
  const allResults = [];
  
  // Process batches sequentially to avoid overwhelming the network
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    
    if (batchIndex % 100 === 0) {
      console.log(`📦 Processing batch ${batchIndex + 1}/${batches.length} (${Math.round((batchIndex/batches.length)*100)}% complete)`);
    }
    
    const batchResults = await Promise.all(
      batch.map(async (trade, tradeIndex) => {
        // Minimal stagger - 5ms each instead of 20ms
        await new Promise(resolve => setTimeout(resolve, tradeIndex * 5));
        
        try {
          const expiry = trade.expiry.replace(/-/g, '').slice(2);
          const strikeFormatted = String(Math.round(trade.strike * 1000)).padStart(8, '0');
          const optionType = trade.type.toLowerCase() === 'call' ? 'C' : 'P';
          const optionTicker = `O:${trade.underlying_ticker}${expiry}${optionType}${strikeFormatted}`;
          
          const tradeTime = new Date(trade.trade_timestamp);
          const checkTimestamp = tradeTime.getTime() * 1000000;
          
          const quotesUrl = `https://api.polygon.io/v3/quotes/${optionTicker}?timestamp.lte=${checkTimestamp}&limit=1&apikey=${POLYGON_API_KEY}`;
          
          const response = await fetch(quotesUrl);
          const data = await response.json();
          
          if (data.results && data.results.length > 0) {
            const quote = data.results[0];
            const bid = quote.bid_price;
            const ask = quote.ask_price;
            const fillPrice = trade.premium_per_contract;
            
            if (bid && ask && fillPrice) {
              let fillStyle = 'N/A';
              const midpoint = (bid + ask) / 2;
              
              // Above Ask: Must be at least 1 cent above ask price
              if (fillPrice >= ask + 0.01) {
                fillStyle = 'AA';
              // Below Bid: Must be at least 1 cent below bid price  
              } else if (fillPrice <= bid - 0.01) {
                fillStyle = 'BB';
              // At Ask: Exactly at ask price
              } else if (fillPrice === ask) {
                fillStyle = 'A';
              // At Bid: Exactly at bid price
              } else if (fillPrice === bid) {
                fillStyle = 'B';
              // Between bid and ask: Use midpoint logic
              } else if (fillPrice >= midpoint) {
                fillStyle = 'A';
              } else {
                fillStyle = 'B';
              }
              
              return { ...trade, fill_style: fillStyle };
            }
          }
          
          return { ...trade, fill_style: 'N/A' };
        } catch (error) {
          return { ...trade, fill_style: 'N/A' };
        }
      })
    );
    
    allResults.push(...batchResults);
    
    // Update the UI with processed trades in real-time
    updateCallback([...allResults]);
    
    // Add delay between batches to prevent overwhelming the API
    if (batchIndex < batches.length - 1) {
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
    }
  }
  
  console.log(`✅ Fill style analysis complete: ${allResults.length} trades processed`);
  return allResults;
};

// VOLUME & OPEN INTEREST FETCHING - ULTRA-FAST PARALLEL PROCESSING
const fetchVolumeAndOpenInterest = async (
  trades: any[],
  updateCallback: (results: any[]) => void
): Promise<any[]> => {
  if (trades.length === 0) return trades;
  
  const BATCH_SIZE = 10; // Process only 10 trades per batch (very conservative)
  const BATCH_DELAY = 500; // 500ms delay between batches (half second)
  const REQUEST_DELAY = 100; // 100ms stagger between requests within batch
  const batches = [];
  
  for (let i = 0; i < trades.length; i += BATCH_SIZE) {
    batches.push(trades.slice(i, i + BATCH_SIZE));
  }
  
  console.log(`� ULTRA-FAST Vol/OI fetch: ${trades.length} trades in ${batches.length} batches of ${BATCH_SIZE}`);
  
  const allResults = [];
  
  // Process batches sequentially with massive parallel requests within each batch
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    
    if (batchIndex % 10 === 0) {
      console.log(`⚡ Vol/OI batch ${batchIndex + 1}/${batches.length} (${Math.round((batchIndex/batches.length)*100)}% complete)`);
    }
    
    const batchResults = await Promise.all(
      batch.map(async (trade, tradeIndex) => {
        // Stagger requests to prevent connection resets
        await new Promise(resolve => setTimeout(resolve, tradeIndex * REQUEST_DELAY));
        
        try {
          const ticker = trade.underlying_ticker;
          const strike = trade.strike;
          const optionType = trade.type.toLowerCase(); // 'call' or 'put'
          const expiration = trade.expiry; // Format: 2025-10-28
          
          // Build option symbol: O:SPY251028C00679000
          const expDate = expiration.split('-'); // ['2025', '10', '28']
          const year = expDate[0].slice(2); // '25'
          const month = expDate[1]; // '10'
          const day = expDate[2]; // '28'
          const callPut = optionType === 'call' ? 'C' : 'P';
          const strikeStr = Math.round(strike * 1000).toString().padStart(8, '0'); // 00679000
          const optionSymbol = `O:${ticker}${year}${month}${day}${callPut}${strikeStr}`;
          
          const snapshotUrl = `https://api.polygon.io/v3/snapshot/options/${ticker}/${optionSymbol}?apikey=kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf`;
          const response = await fetch(snapshotUrl, {
            signal: AbortSignal.timeout(8000) // Longer timeout
          });
          
          if (!response.ok) {
            return { ...trade, volume: 0, open_interest: 0 };
          }
          
          const data = await response.json();
          
          if (data.status === 'OK' && data.results) {
            const snap = data.results;
            const volume = snap.day?.volume || 0;
            const openInterest = snap.open_interest || 0;
            
            return { 
              ...trade, 
              volume: volume,
              open_interest: openInterest 
            };
          }
          
          return { ...trade, volume: 0, open_interest: 0 };
        } catch (error) {
          return { ...trade, volume: 0, open_interest: 0 };
        }
      })
    );
    
    allResults.push(...batchResults);
    
    // Update the UI with processed trades in real-time
    updateCallback([...allResults]);
    
    // Delay between batches to prevent rate limiting
    if (batchIndex < batches.length - 1) {
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
    }
  }
  
  console.log(`✅ Vol/OI complete: ${allResults.length} trades processed`);
  return allResults;
};

// Memoized price display component to prevent flickering
const PriceDisplay = React.memo(function PriceDisplay({ 
 spotPrice, 
 currentPrice, 
 isLoading, 
 ticker 
}: { 
 spotPrice: number; 
 currentPrice?: number; 
 isLoading?: boolean; 
 ticker: string; 
}) {
 // Don't show anything if spot price is missing or invalid
 if (!spotPrice || spotPrice <= 0) {
 return <span className="text-gray-500">No Price Data</span>;
 }
 
 if (isLoading) {
 return (
 <div className="flex items-center gap-2">
 <span className="text-white">${spotPrice.toFixed(2)}</span>
 <span className="text-gray-400">{'>>'} </span>
 <span className="text-gray-400 animate-pulse">fetching...</span>
 </div>
 );
 }
 
 if (!currentPrice || currentPrice <= 0) {
 // Show just spot price if current price not available
 return (
 <div className="flex items-center gap-2">
 <span className="text-white">${spotPrice.toFixed(2)}</span>
 <span className="text-gray-600">{'>>'} </span>
 <span className="text-gray-500">--</span>
 </div>
 );
 }
 
 const colorClass = currentPrice > spotPrice 
 ? "text-green-400 font-bold" 
 : currentPrice < spotPrice 
 ? "text-red-400 font-bold" 
 : "text-white";
 
 return (
 <div className="flex items-center gap-2">
 <span className="text-white">${spotPrice.toFixed(2)}</span>
 <span className="text-gray-400">{'>>'} </span>
 <span className={colorClass}>
 ${currentPrice.toFixed(2)}
 </span>
 </div>
 );
});

interface OptionsFlowData {
 ticker: string;
 underlying_ticker: string;
 strike: number;
 expiry: string;
 type: 'call' | 'put';
 trade_size: number;
 premium_per_contract: number;
 total_premium: number;
 spot_price: number;
 exchange_name: string;
 trade_type: 'SWEEP' | 'BLOCK' | 'MULTI-LEG' | 'MINI';
 trade_timestamp: string;
 moneyness: 'ATM' | 'ITM' | 'OTM';
 days_to_expiry: number;
 fill_style?: 'A' | 'AA' | 'B' | 'BB' | 'N/A' | string;
 volume?: number;
 open_interest?: number;
 vol_oi_ratio?: number;
 classification?: string;
 delta?: number;
 gamma?: number;
 theta?: number;
 vega?: number;
 implied_volatility?: number;
 current_price?: number;
 bid?: number;
 ask?: number;
 bid_ask_spread?: number;
}

interface OptionsFlowSummary {
 total_trades: number;
 total_premium: number;
 unique_symbols: number;
 trade_types: {
 BLOCK: number;
 SWEEP: number;
 'MULTI-LEG': number;
 MINI: number;
 };
 call_put_ratio: {
 calls: number;
 puts: number;
 };
 processing_time_ms: number;
}

interface MarketInfo {
 status: 'LIVE' | 'LAST_TRADING_DAY';
 is_live: boolean;
 data_date: string;
 market_open: boolean;
}

interface OptionsFlowTableProps {
 data: OptionsFlowData[];
 summary: OptionsFlowSummary;
 marketInfo?: MarketInfo;
 loading?: boolean;
 onRefresh?: (ticker?: string) => void;
 onClearData?: () => void;
 selectedTicker: string;
 onTickerChange: (ticker: string) => void;
 streamingStatus?: string;
 streamingProgress?: {current: number, total: number} | null;
 streamError?: string;
}

export const OptionsFlowTable: React.FC<OptionsFlowTableProps> = ({
 data,
 summary,
 marketInfo,
 loading = false,
 onRefresh,
 onClearData,
 selectedTicker,
 onTickerChange,
 streamingStatus,
 streamingProgress,
 streamError
}) => {
 const [sortField, setSortField] = useState<keyof OptionsFlowData | 'positioning_grade'>('trade_timestamp');
 const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
 const [filterType, setFilterType] = useState<string>('all');
 const [selectedOptionTypes, setSelectedOptionTypes] = useState<string[]>(['call', 'put']);
 const [selectedPremiumFilters, setSelectedPremiumFilters] = useState<string[]>([]);
 const [customMinPremium, setCustomMinPremium] = useState<string>('');
 const [customMaxPremium, setCustomMaxPremium] = useState<string>('');
 const [selectedTickerFilters, setSelectedTickerFilters] = useState<string[]>([]);
 const [selectedUniqueFilters, setSelectedUniqueFilters] = useState<string[]>([]);
 const [expirationStartDate, setExpirationStartDate] = useState<string>('');
 const [expirationEndDate, setExpirationEndDate] = useState<string>('');
 const [blacklistedTickers, setBlacklistedTickers] = useState<string[]>(['', '', '', '', '']);
 const [selectedTickerFilter, setSelectedTickerFilter] = useState<string>('');
 const [inputTicker, setInputTicker] = useState<string>('');
 const [isInputFocused, setIsInputFocused] = useState<boolean>(false);
 const [isFilterDialogOpen, setIsFilterDialogOpen] = useState<boolean>(false);
 const [currentPage, setCurrentPage] = useState<number>(1);
 const [itemsPerPage] = useState<number>(250);
 const [quickFilters, setQuickFilters] = useState<{
 otm: boolean;
 weekly: boolean;
 premium100k: boolean;
 sweep: boolean;
 block: boolean;
 }>({ otm: false, weekly: false, premium100k: false, sweep: false, block: false });
 const [efiHighlightsActive, setEfiHighlightsActive] = useState<boolean>(false);
 const [currentPrices, setCurrentPrices] = useState<Record<string, number>>({});
 const [priceLoadingState, setPriceLoadingState] = useState<Record<string, boolean>>({});
 const [currentOptionPrices, setCurrentOptionPrices] = useState<Record<string, number>>({});
 const [tradesWithFillStyles, setTradesWithFillStyles] = useState<OptionsFlowData[]>([]);
 const [isMounted, setIsMounted] = useState(false);
 
 // State for historical price data and standard deviations
 const [historicalStdDevs, setHistoricalStdDevs] = useState<Map<string, number>>(new Map());
 const [historicalDataLoading, setHistoricalDataLoading] = useState<Set<string>>(new Set());
 const [hoveredGradeIndex, setHoveredGradeIndex] = useState<number | null>(null);
 const [aGradeFilterActive, setAGradeFilterActive] = useState<boolean>(false);

 // Ensure component is mounted on client side to avoid hydration issues
 useEffect(() => {
 setIsMounted(true);
 }, []);

 // Debug: Monitor filter dialog state changes
 useEffect(() => {
 // Removed excessive logging for performance
 }, [isFilterDialogOpen]);

 // Prevent body from scrolling to eliminate page-level scrollbar
 // Only run on client-side to avoid hydration mismatch
 useEffect(() => {
 if (typeof window !== 'undefined') {
 document.body.style.overflow = 'hidden';
 document.documentElement.style.overflow = 'hidden';
 
 return () => {
 document.body.style.overflow = '';
 document.documentElement.style.overflow = '';
 };
 }
 }, []);

 // Fetch current prices using the direct API call that works (anti-flicker)
 const fetchCurrentPrices = async (tickers: string[]) => {
 const uniqueTickers = [...new Set(tickers)];
 console.log(` Fetching LIVE current prices for ${uniqueTickers.length} tickers:`, uniqueTickers);
 
 const pricesUpdate: Record<string, number> = {};
 const loadingUpdate: Record<string, boolean> = {};

 // Set loading state for all tickers at once
 uniqueTickers.forEach(ticker => {
 loadingUpdate[ticker] = true;
 });
 setPriceLoadingState(prev => ({ ...prev, ...loadingUpdate }));

 // BATCHED API calls to prevent connection reset errors
 const BATCH_SIZE = 3; // Small batches to avoid overwhelming API
 const BATCH_DELAY = 1000; // 1 second between batches
 
 // Split tickers into small batches
 const batches = [];
 for (let i = 0; i < uniqueTickers.length; i += BATCH_SIZE) {
 batches.push(uniqueTickers.slice(i, i + BATCH_SIZE));
 }
 
 console.log(` Processing ${uniqueTickers.length} tickers in ${batches.length} batches of ${BATCH_SIZE}`);
 
 // Process batches sequentially with delays
 for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
 const batch = batches[batchIndex];
 
 console.log(` Batch ${batchIndex + 1}/${batches.length}: [${batch.join(', ')}]`);
 
 // Process tickers in current batch with Promise.all
 const batchPromises = batch.map(async (ticker, tickerIndex) => {
 // Stagger requests within batch
 await new Promise(resolve => setTimeout(resolve, tickerIndex * 200));
 
 try {
 console.log(` Fetching LIVE price for ${ticker}...`);
 const response = await fetch(
 `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apikey=kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf`,
 {
 method: 'GET',
 headers: { 'Accept': 'application/json' },
 signal: AbortSignal.timeout(8000) // 8 second timeout
 }
 );
 
 if (response.ok) {
 const data = await response.json();
 
 if (data.status === 'OK' && data.ticker) {
 // ONLY use last trade price - no fallbacks
 const lastTradePrice = data.ticker.lastTrade?.p;
 
 if (lastTradePrice && lastTradePrice > 0) {
 pricesUpdate[ticker] = lastTradePrice;
 console.log(` ${ticker}: LIVE $${lastTradePrice} (lastTrade)`);
 } else {
 console.warn(` No last trade price for ${ticker}`);
 }
 } else {
 console.log(` No snapshot data for ${ticker}`);
 }
 } else if (response.status === 429) {
 console.log(` Rate limited for ${ticker}, will retry...`);
 // Don't throw, just log and continue
 } else {
 console.error(` HTTP error for ${ticker}:`, response.status);
 }
 } catch (error) {
 console.error(` Failed to fetch ${ticker}:`, error);
 }
 
 // Mark as not loading
 loadingUpdate[ticker] = false;
 });
 
 // Wait for all tickers in batch to complete
 await Promise.allSettled(batchPromises);
 
 // Update UI after each batch
 setPriceLoadingState(prev => ({ ...prev, ...loadingUpdate }));
 setCurrentPrices(prev => ({ ...prev, ...pricesUpdate }));
 
 // Delay between batches (except last one)
 if (batchIndex < batches.length - 1) {
 console.log(` Waiting ${BATCH_DELAY}ms before next batch...`);
 await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
 }
 }
 
 // Final state update
 console.log(` All batches complete. Updated ${Object.keys(pricesUpdate).length} prices.`);
 };

 // Fetch current prices when data changes (debounced)
 useEffect(() => {
 if (!data || data.length === 0) return;
 
 // Debounce API calls to prevent excessive requests
 const debounceTimer = setTimeout(() => {
 const tickers = [...new Set(data.map(trade => trade.underlying_ticker))]; // Unique tickers only
 console.log(` Starting API calls for ${tickers.length} unique tickers from ${data.length} trades`);
 
 fetchCurrentPrices(tickers);
 }, 500); // 500ms debounce
 
 return () => clearTimeout(debounceTimer);
 }, [data]);

 // Auto-refresh prices every 5 minutes (optimized)
 useEffect(() => {
 if (!data || data.length === 0) return;
 
 console.log(' Setting up 5-minute price auto-refresh...');
 const interval = setInterval(() => {
 console.log(' 5-minute timer: Refreshing stock prices...');
 const uniqueTickers = [...new Set(data.map(trade => trade.underlying_ticker))];
 // Only refresh prices
 fetchCurrentPrices(uniqueTickers);
 }, 5 * 60 * 1000); // 5 minutes
 
 return () => {
 console.log(' Clearing price auto-refresh interval');
 clearInterval(interval);
 };
 }, [data.length]); // Only re-setup when data length changes, not content

 // Fetch historical standard deviations when EFI Highlights is active
 useEffect(() => {
 if (!efiHighlightsActive || !data || data.length === 0) return;
 
 const uniqueTickers = [...new Set(data.map(trade => trade.underlying_ticker))];
 console.log(`📊 Fetching historical std dev for ${uniqueTickers.length} tickers...`);
 
 const fetchAllStdDevs = async () => {
 const stdDevsMap = new Map<string, number>();
 
 for (const ticker of uniqueTickers) {
 if (!historicalStdDevs.has(ticker) && !historicalDataLoading.has(ticker)) {
 setHistoricalDataLoading(prev => new Set(prev).add(ticker));
 const stdDev = await fetchHistoricalStdDev(ticker);
 stdDevsMap.set(ticker, stdDev);
 console.log(`📊 ${ticker} std dev: ${stdDev.toFixed(2)}%`);
 
 // Small delay to avoid rate limits
 await new Promise(resolve => setTimeout(resolve, 100));
 }
 }
 
 if (stdDevsMap.size > 0) {
 setHistoricalStdDevs(prev => new Map([...prev, ...stdDevsMap]));
 }
 };
 
 fetchAllStdDevs();
 }, [efiHighlightsActive, data.length]);

 // Fetch current option prices for position tracking (only when EFI Highlights is ON)
 const fetchCurrentOptionPrices = async (trades: OptionsFlowData[]) => {
 const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';
 const pricesUpdate: Record<string, number> = {};
 
 console.log(`📊 Fetching current option prices for ${trades.length} EFI trades...`);
 
 for (const trade of trades) {
 try {
 const expiry = trade.expiry.replace(/-/g, '').slice(2);
 const strikeFormatted = String(Math.round(trade.strike * 1000)).padStart(8, '0');
 const optionType = trade.type.toLowerCase() === 'call' ? 'C' : 'P';
 const optionTicker = `O:${trade.underlying_ticker}${expiry}${optionType}${strikeFormatted}`;
 
 const snapshotUrl = `https://api.polygon.io/v3/snapshot/options/${trade.underlying_ticker}/${optionTicker}?apikey=${POLYGON_API_KEY}`;
 
 const response = await fetch(snapshotUrl, {
 signal: AbortSignal.timeout(5000)
 });
 
 if (response.ok) {
 const data = await response.json();
 if (data.results && data.results.last_quote) {
 const bid = data.results.last_quote.bid || 0;
 const ask = data.results.last_quote.ask || 0;
 const currentPrice = (bid + ask) / 2;
 
 if (currentPrice > 0) {
 pricesUpdate[optionTicker] = currentPrice;
 }
 }
 }
 } catch (error) {
 console.error(`Failed to fetch price for ${trade.ticker}:`, error);
 }
 
 // Add small delay to avoid rate limiting
 await new Promise(resolve => setTimeout(resolve, 50));
 }
 
 setCurrentOptionPrices(prev => ({ ...prev, ...pricesUpdate }));
 console.log(`✅ Fetched ${Object.keys(pricesUpdate).length} option prices`);
 };

 // Function to fetch historical prices and calculate standard deviation
 const fetchHistoricalStdDev = async (ticker: string): Promise<number> => {
 try {
 // Get 30 days of historical data
 const endDate = new Date().toISOString().split('T')[0];
 const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
 
 const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${startDate}/${endDate}?adjusted=true&sort=asc&apiKey=kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf`;
 
 const response = await fetch(url);
 const data = await response.json();
 
 if (data.results && data.results.length > 1) {
 const closes = data.results.map((r: any) => r.c);
 
 // Step 1: Calculate daily returns
 const returns: number[] = [];
 for (let i = 1; i < closes.length; i++) {
 const dailyReturn = ((closes[i] - closes[i-1]) / closes[i-1]) * 100;
 returns.push(dailyReturn);
 }
 
 if (returns.length === 0) return 2.0; // Default fallback
 
 // Step 2: Calculate mean return
 const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
 
 // Step 3: Calculate deviations from mean
 const deviations = returns.map(r => r - meanReturn);
 
 // Step 4: Square the deviations
 const squaredDeviations = deviations.map(d => d * d);
 
 // Step 5: Calculate variance (using n-1 for sample data)
 const variance = squaredDeviations.reduce((sum, d) => sum + d, 0) / (returns.length - 1);
 
 // Step 6: Standard deviation is square root of variance
 const stdDev = Math.sqrt(variance);
 
 return stdDev;
 }
 
 return 2.0; // Default fallback
 } catch (error) {
 console.error(`Error fetching historical data for ${ticker}:`, error);
 return 2.0; // Default fallback
 }
 };

 // Calculate positioning grade for EFI trades - COMPLETE 100-POINT SYSTEM
 const calculatePositioningGrade = (trade: OptionsFlowData, allTrades: OptionsFlowData[]): { 
 grade: string; 
 score: number; 
 color: string; 
 breakdown: string;
 scores: {
 expiration: number;
 contractPrice: number;
 combo: number;
 priceAction: number;
 stockReaction: number;
 };
 } => {
 // Get option ticker for current price lookup
 const expiry = trade.expiry.replace(/-/g, '').slice(2);
 const strikeFormatted = String(Math.round(trade.strike * 1000)).padStart(8, '0');
 const optionType = trade.type.toLowerCase() === 'call' ? 'C' : 'P';
 const optionTicker = `O:${trade.underlying_ticker}${expiry}${optionType}${strikeFormatted}`;
 const currentPrice = currentOptionPrices[optionTicker];
 const entryPrice = trade.premium_per_contract;
 
 let confidenceScore = 0;
 const scores = {
 expiration: 0,
 contractPrice: 0,
 combo: 0,
 priceAction: 0,
 stockReaction: 0
 };
 
 // 1. Expiration Score (25 points max)
 const daysToExpiry = trade.days_to_expiry;
 if (daysToExpiry <= 7) scores.expiration = 25;
 else if (daysToExpiry <= 14) scores.expiration = 20;
 else if (daysToExpiry <= 21) scores.expiration = 15;
 else if (daysToExpiry <= 28) scores.expiration = 10;
 else if (daysToExpiry <= 42) scores.expiration = 5;
 confidenceScore += scores.expiration;
 
 // 2. Contract Price Score (25 points max) - based on position P&L
 if (currentPrice && currentPrice > 0) {
 const percentChange = ((currentPrice - entryPrice) / entryPrice) * 100;
 
 if (percentChange <= -40) scores.contractPrice = 25;
 else if (percentChange <= -20) scores.contractPrice = 20;
 else if (percentChange >= -10 && percentChange <= 10) scores.contractPrice = 15;
 else if (percentChange >= 20) scores.contractPrice = 5;
 else scores.contractPrice = 10;
 } else {
 scores.contractPrice = 12;
 }
 confidenceScore += scores.contractPrice;
 
 // 3. Combo Trade Score (10 points max)
 const isCall = trade.type === 'call';
 const fillStyle = trade.fill_style || '';
 const hasComboTrade = allTrades.some(t => {
 if (t.underlying_ticker !== trade.underlying_ticker) return false;
 if (t.expiry !== trade.expiry) return false;
 if (Math.abs(t.strike - trade.strike) > trade.strike * 0.05) return false;
 
 const oppositeFill = t.fill_style || '';
 const oppositeType = t.type.toLowerCase();
 
 // Bullish combo: Calls with A/AA + Puts with B/BB
 if (isCall && (fillStyle === 'A' || fillStyle === 'AA')) {
 return oppositeType === 'put' && (oppositeFill === 'B' || oppositeFill === 'BB');
 }
 // Bearish combo: Calls with B/BB + Puts with A/AA
 if (isCall && (fillStyle === 'B' || fillStyle === 'BB')) {
 return oppositeType === 'put' && (oppositeFill === 'A' || oppositeFill === 'AA');
 }
 // For puts, reverse logic
 if (!isCall && (fillStyle === 'B' || fillStyle === 'BB')) {
 return oppositeType === 'call' && (oppositeFill === 'A' || oppositeFill === 'AA');
 }
 if (!isCall && (fillStyle === 'A' || fillStyle === 'AA')) {
 return oppositeType === 'call' && (oppositeFill === 'B' || oppositeFill === 'BB');
 }
 return false;
 });
 if (hasComboTrade) scores.combo = 10;
 confidenceScore += scores.combo;
 
 // Shared variables for sections 4 and 5
 const entryStockPrice = trade.spot_price;
 const currentStockPrice = currentPrices[trade.underlying_ticker];
 const tradeTime = new Date(trade.trade_timestamp);
 const currentTime = new Date();
 
 // 4. Price Action Score (25 points max) - Stock within standard deviation
 const stdDev = historicalStdDevs.get(trade.underlying_ticker);
 
 if (currentStockPrice && entryStockPrice && stdDev) {
 const hoursElapsed = (currentTime.getTime() - tradeTime.getTime()) / (1000 * 60 * 60);
 const tradingDaysElapsed = Math.floor(hoursElapsed / 6.5); // 6.5-hour trading day
 
 // Calculate current stock move in percentage
 const stockPercentChange = ((currentStockPrice - entryStockPrice) / entryStockPrice) * 100;
 const absMove = Math.abs(stockPercentChange);
 
 // Check if stock is within 1 standard deviation
 const withinStdDev = absMove <= stdDev;
 
 // Award points based on how many days stock stayed within std dev
 if (withinStdDev && tradingDaysElapsed >= 3) scores.priceAction = 25;
 else if (withinStdDev && tradingDaysElapsed >= 2) scores.priceAction = 20;
 else if (withinStdDev && tradingDaysElapsed >= 1) scores.priceAction = 15;
 else scores.priceAction = 10;
 } else {
 scores.priceAction = 12;
 }
 confidenceScore += scores.priceAction;
 
 // 5. Stock Reaction Score (15 points max)
 // Measure stock movement 1 hour and 3 hours after trade placement
 if (currentStockPrice && entryStockPrice) {
 const stockPercentChange = ((currentStockPrice - entryStockPrice) / entryStockPrice) * 100;
 
 // Determine trade direction (bullish or bearish)
 const isBullish = (isCall && (fillStyle === 'A' || fillStyle === 'AA')) || 
 (!isCall && (fillStyle === 'B' || fillStyle === 'BB'));
 const isBearish = (isCall && (fillStyle === 'B' || fillStyle === 'BB')) || 
 (!isCall && (fillStyle === 'A' || fillStyle === 'AA'));
 
 // Check if stock reversed against trade direction
 const reversed = (isBullish && stockPercentChange <= -1.0) || 
 (isBearish && stockPercentChange >= 1.0);
 const followed = (isBullish && stockPercentChange >= 1.0) || 
 (isBearish && stockPercentChange <= -1.0);
 const chopped = Math.abs(stockPercentChange) < 1.0;
 
 // Calculate time elapsed since trade
 const hoursElapsed = (currentTime.getTime() - tradeTime.getTime()) / (1000 * 60 * 60);
 
 // Award points based on time checkpoints
 if (hoursElapsed >= 1) {
 // 1-hour checkpoint (50% of points)
 if (reversed) scores.stockReaction += 7.5;
 else if (chopped) scores.stockReaction += 5;
 else if (followed) scores.stockReaction += 2.5;
 
 if (hoursElapsed >= 3) {
 // 3-hour checkpoint (remaining 50%)
 if (reversed) scores.stockReaction += 7.5;
 else if (chopped) scores.stockReaction += 5;
 else if (followed) scores.stockReaction += 2.5;
 }
 }
 }
 confidenceScore += scores.stockReaction;
 
 // Color code confidence score
 let scoreColor = '#ff0000'; // F = Red
 if (confidenceScore >= 85) scoreColor = '#00ff00'; // A = Bright Green
 else if (confidenceScore >= 70) scoreColor = '#84cc16'; // B = Lime Green
 else if (confidenceScore >= 50) scoreColor = '#fbbf24'; // C = Yellow
 else if (confidenceScore >= 33) scoreColor = '#3b82f6'; // D = Blue
 
 // Grade letter
 let grade = 'F';
 if (confidenceScore >= 85) grade = 'A+';
 else if (confidenceScore >= 80) grade = 'A';
 else if (confidenceScore >= 75) grade = 'A-';
 else if (confidenceScore >= 70) grade = 'B+';
 else if (confidenceScore >= 65) grade = 'B';
 else if (confidenceScore >= 60) grade = 'B-';
 else if (confidenceScore >= 55) grade = 'C+';
 else if (confidenceScore >= 50) grade = 'C';
 else if (confidenceScore >= 48) grade = 'C-';
 else if (confidenceScore >= 43) grade = 'D+';
 else if (confidenceScore >= 38) grade = 'D';
 else if (confidenceScore >= 33) grade = 'D-';
 
 // Create breakdown tooltip text
 const breakdown = `Score: ${confidenceScore}/100
Expiration: ${scores.expiration}/25
Contract P&L: ${scores.contractPrice}/25
Combo Trade: ${scores.combo}/10
Price Action: ${scores.priceAction}/25
Stock Reaction: ${scores.stockReaction}/15`;
 
 return { grade, score: confidenceScore, color: scoreColor, breakdown, scores };
 };

 // EFI Highlights criteria checker
 const meetsEfiCriteria = (trade: OptionsFlowData): boolean => {
 // 1. Check expiration (0-35 trading days)
 if (trade.days_to_expiry < 0 || trade.days_to_expiry > 35) {
 return false;
 }

 // 2. Check premium ($100k - $450k)
 if (trade.total_premium < 100000 || trade.total_premium > 450000) {
 return false;
 }

 // 3. Check contracts (650 - 1999)
 if (trade.trade_size < 650 || trade.trade_size > 1999) {
 return false;
 }

 // 4. Check OTM status
 if (!trade.moneyness || trade.moneyness !== 'OTM') {
 return false;
 }
 
 return true;
 };

 const handleSort = (field: keyof OptionsFlowData | 'positioning_grade') => {
 console.log(`🔧 handleSort called: field=${field}, current sortField=${sortField}, current direction=${sortDirection}`);
 if (sortField === field) {
 const newDirection = sortDirection === 'asc' ? 'desc' : 'asc';
 console.log(`🔧 Toggling direction: ${sortDirection} → ${newDirection}`);
 setSortDirection(newDirection);
 } else {
 console.log(`🔧 New field: ${sortField} → ${field}, setting direction=desc`);
 setSortField(field);
 setSortDirection('desc');
 }
 };



 const filteredAndSortedData = useMemo(() => {
 // OPTIMIZED: Only merge if we have enriched data, otherwise just use raw
 let sourceData: OptionsFlowData[];
 
 if (tradesWithFillStyles.length === 0) {
 // No enriched data yet - use raw data directly (fast path)
 sourceData = data;
 } else if (tradesWithFillStyles.length === data.length) {
 // All data enriched - use enriched directly (fast path)
 sourceData = tradesWithFillStyles;
 } else {
 // Partial enrichment - merge (slower path, but only during processing)
 const enrichedMap = new Map();
 tradesWithFillStyles.forEach(trade => {
 const key = `${trade.underlying_ticker}-${trade.strike}-${trade.expiry}-${trade.type}-${trade.trade_timestamp}`;
 enrichedMap.set(key, trade);
 });
 
 sourceData = data.map(trade => {
 const key = `${trade.underlying_ticker}-${trade.strike}-${trade.expiry}-${trade.type}-${trade.trade_timestamp}`;
 return enrichedMap.get(key) || trade;
 });
 }
 
 // Step 1: Fast deduplication using Set (O(n) instead of O(n²))
 const seen = new Set<string>();
 const deduplicatedData = sourceData.filter((trade: OptionsFlowData) => {
 const tradeKey = `${trade.underlying_ticker}-${trade.strike}-${trade.expiry}-${trade.type}-${trade.trade_size}-${trade.total_premium}-${trade.spot_price}-${trade.trade_timestamp}-${trade.exchange_name}`;
 
 if (seen.has(tradeKey)) {
 return false; // Duplicate
 }
 seen.add(tradeKey);
 return true; // First occurrence
 });
 
 // Log deduplication results only when needed
 if (sourceData.length !== deduplicatedData.length) {
 const duplicatesRemoved = sourceData.length - deduplicatedData.length;
 console.log(`🔄 Removed ${duplicatesRemoved} duplicates`);
 }
 
 // Step 2: Bundle small trades (<$500) for same contract within 1 minute
 const bundledData: OptionsFlowData[] = [];
 const smallTradeGroups = new Map<string, OptionsFlowData[]>();
 
 // First pass: separate large trades and group small trades
 deduplicatedData.forEach((trade: OptionsFlowData) => {
 if (trade.total_premium >= 500) {
 // Large trade - keep as is
 bundledData.push(trade);
 } else {
 // Small trade - group by contract and minute
 const tradeTime = new Date(trade.trade_timestamp);
 const minuteKey = `${tradeTime.getFullYear()}-${tradeTime.getMonth()}-${tradeTime.getDate()}-${tradeTime.getHours()}-${tradeTime.getMinutes()}`;
 const groupKey = `${trade.underlying_ticker}-${trade.strike}-${trade.expiry}-${trade.type}-${minuteKey}`;
 
 if (!smallTradeGroups.has(groupKey)) {
 smallTradeGroups.set(groupKey, []);
 }
 smallTradeGroups.get(groupKey)!.push(trade);
 }
 });
 
 // Second pass: bundle small trades
 smallTradeGroups.forEach((trades, groupKey) => {
 if (trades.length === 1) {
 // Only one small trade in this group - keep as is
 bundledData.push(trades[0]);
 } else {
 // Multiple small trades - bundle them
 const totalContracts = trades.reduce((sum, t) => sum + t.trade_size, 0);
 const totalPremium = trades.reduce((sum, t) => sum + t.total_premium, 0);
 const avgPricePerContract = totalPremium / totalContracts;
 
 // Use the first trade as template and update values
 const bundledTrade: OptionsFlowData = {
 ...trades[0],
 trade_size: totalContracts,
 premium_per_contract: avgPricePerContract,
 total_premium: totalPremium,
 exchange_name: `BUNDLED (${trades.length} trades)`,
 // Keep the earliest timestamp as string
 trade_timestamp: trades.reduce((earliest, t) => 
 new Date(t.trade_timestamp) < new Date(earliest.trade_timestamp) ? t : earliest
 ).trade_timestamp
 };
 
 bundledData.push(bundledTrade);
 console.log(`📦 Bundled ${trades.length} small ${trades[0].underlying_ticker} trades: ${totalContracts} contracts @ $${avgPricePerContract.toFixed(2)} = $${totalPremium.toFixed(0)}`);
 }
 });
 
 let filtered = bundledData;
 
 // EFI Highlights filter - when active, show ONLY trades that meet EFI criteria
 if (efiHighlightsActive) {
 filtered = filtered.filter(trade => meetsEfiCriteria(trade));
 console.log(`🎯 EFI Highlights active: filtered to ${filtered.length} trades that meet EFI criteria`);
 }
 
 // Apply filters - Option Type (checkbox)
 if (selectedOptionTypes.length > 0 && selectedOptionTypes.length < 2) {
 filtered = filtered.filter(trade => selectedOptionTypes.includes(trade.type));
 }
 
 // Premium filters (checkbox + custom range)
 if (selectedPremiumFilters.length > 0 || customMinPremium || customMaxPremium) {
 filtered = filtered.filter(trade => {
 let passesPresetFilters = true;
 let passesCustomRange = true;
 
 // Check preset filters
 if (selectedPremiumFilters.length > 0) {
 passesPresetFilters = selectedPremiumFilters.some(filter => {
 switch (filter) {
 case '50000':
 return trade.total_premium >= 50000;
 case '99000':
 return trade.total_premium >= 99000;
 case '200000':
 return trade.total_premium >= 200000;
 default:
 return true;
 }
 });
 }
 
 // Check custom range
 if (customMinPremium || customMaxPremium) {
 const minVal = customMinPremium ? parseFloat(customMinPremium) : 0;
 const maxVal = customMaxPremium ? parseFloat(customMaxPremium) : Infinity;
 passesCustomRange = trade.total_premium >= minVal && trade.total_premium <= maxVal;
 }
 
 return passesPresetFilters && passesCustomRange;
 });
 }
 
 // Ticker filters (checkbox)
 if (selectedTickerFilters.length > 0) {
 const mag7Stocks = ['AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'NVDA', 'TSLA', 'META'];
 
 filtered = filtered.filter(trade => {
 return selectedTickerFilters.every(filter => {
 switch (filter) {
 case 'ETF_ONLY':
 // Assuming ETFs can be identified by ticker patterns or we need additional data
 // For now, using a simple heuristic - ETFs often have 3 letters
 return trade.underlying_ticker.length === 3 && !mag7Stocks.includes(trade.underlying_ticker);
 case 'STOCK_ONLY':
 // Exclude ETFs (assuming stocks are everything that's not in a common ETF pattern)
 return trade.underlying_ticker.length >= 3;
 case 'MAG7_ONLY':
 return mag7Stocks.includes(trade.underlying_ticker);
 case 'EXCLUDE_MAG7':
 return !mag7Stocks.includes(trade.underlying_ticker);
 case 'HIGHLIGHTS_ONLY':
 return meetsEfiCriteria(trade);
 default:
 return true;
 }
 });
 });
 }
 
 // Unique filters (checkbox)
 if (selectedUniqueFilters.length > 0) {
 filtered = filtered.filter(trade => {
 return selectedUniqueFilters.every(filter => {
 switch (filter) {
 case 'ITM':
 return trade.moneyness === 'ITM';
 case 'OTM':
 return trade.moneyness === 'OTM';
 case 'SWEEP_ONLY':
 return trade.trade_type === 'SWEEP';
 case 'BLOCK_ONLY':
 return trade.trade_type === 'BLOCK';
 case 'WEEKLY_ONLY':
 // Check if expiration is within 7 days
 const expiryDate = new Date(trade.expiry);
 const today = new Date();
 const daysToExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
 return daysToExpiry <= 7;
 case 'MULTI_LEG_ONLY':
 return trade.trade_type === 'MULTI-LEG';
 case 'MINI_ONLY':
 return trade.trade_type === 'MINI';
 default:
 return true;
 }
 });
 });
 }

 // Quick Filters
 if (quickFilters.otm) {
 filtered = filtered.filter(trade => trade.moneyness === 'OTM');
 }
 if (quickFilters.weekly) {
 const today = new Date();
 const oneWeekFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
 filtered = filtered.filter(trade => {
 const expiryDate = new Date(trade.expiry);
 return expiryDate <= oneWeekFromNow;
 });
 }
 if (quickFilters.premium100k) {
 filtered = filtered.filter(trade => trade.total_premium >= 100000);
 }
 if (quickFilters.sweep) {
 filtered = filtered.filter(trade => trade.trade_type === 'SWEEP');
 }
 if (quickFilters.block) {
 filtered = filtered.filter(trade => trade.trade_type === 'BLOCK');
 }
 
 // Expiration date range filter
 if (expirationStartDate || expirationEndDate) {
 filtered = filtered.filter(trade => {
 const tradeExpiryDate = new Date(trade.expiry);
 const startDate = expirationStartDate ? new Date(expirationStartDate) : null;
 const endDate = expirationEndDate ? new Date(expirationEndDate) : null;
 
 if (startDate && endDate) {
 return tradeExpiryDate >= startDate && tradeExpiryDate <= endDate;
 } else if (startDate) {
 return tradeExpiryDate >= startDate;
 } else if (endDate) {
 return tradeExpiryDate <= endDate;
 }
 return true;
 });
 }
 
 // Blacklisted tickers filter
 const activeBlacklistedTickers = blacklistedTickers.filter(ticker => ticker.trim() !== '');
 if (activeBlacklistedTickers.length > 0) {
 filtered = filtered.filter(trade => {
 return !activeBlacklistedTickers.includes(trade.underlying_ticker.toUpperCase());
 });
 }
 
 // Selected ticker filter
 if (selectedTickerFilter) {
 filtered = filtered.filter(trade => trade.underlying_ticker === selectedTickerFilter);
 }

 // A+ grade filter (only active when EFI Highlights is on)
 if (efiHighlightsActive && aGradeFilterActive) {
 filtered = filtered.filter(trade => {
 const gradeData = calculatePositioningGrade(trade, filtered);
 return gradeData.grade === 'A+' || gradeData.grade === 'A' || gradeData.grade === 'A-';
 });
 }

 // Apply sorting
 filtered.sort((a, b) => {
 // Special handling for positioning grade sorting (custom field)
 if (sortField === 'positioning_grade') {
 // Calculate positioning grades for comparison
 const gradeA = calculatePositioningGrade(a, filtered);
 const gradeB = calculatePositioningGrade(b, filtered);
 
 // Use the numeric score for sorting (higher score = better grade)
 // DESC: High to Low (A+ to F), ASC: Low to High (F to A+)
 const result = sortDirection === 'desc' ? gradeB.score - gradeA.score : gradeA.score - gradeB.score;
 return result;
 }
 
 const aValue = a[sortField as keyof OptionsFlowData];
 const bValue = b[sortField as keyof OptionsFlowData];
 
 if (typeof aValue === 'string' && typeof bValue === 'string') {
 return sortDirection === 'asc' 
 ? aValue.localeCompare(bValue)
 : bValue.localeCompare(aValue);
 }
 
 const numA = Number(aValue);
 const numB = Number(bValue);
 return sortDirection === 'asc' ? numA - numB : numB - numA;
 });

 return filtered;
 }, [data, sortField, sortDirection, selectedOptionTypes, selectedPremiumFilters, customMinPremium, customMaxPremium, selectedTickerFilters, selectedUniqueFilters, expirationStartDate, expirationEndDate, selectedTickerFilter, blacklistedTickers, tradesWithFillStyles, efiHighlightsActive, quickFilters, aGradeFilterActive]);

 // Automatically enrich trades with Vol/OI AND Fill Style in ONE combined call - IMMEDIATELY as part of scan
 useEffect(() => {
 // ✅ NO ENRICHMENT NEEDED! All data comes pre-enriched from backend snapshot API
 // Backend now returns: vol, OI, vol/OI ratio, Greeks, bid/ask, fill_style, classification
 // Just pass through the data directly - instant display like Unusual Whales!
 
 // Debug: Log first trade to verify enrichment data
 if (data && data.length > 0) {
 console.log('📊 Sample trade data received:', {
 ticker: data[0].ticker,
 underlying: data[0].underlying_ticker,
 spot_price: data[0].spot_price,
 volume: data[0].volume,
 open_interest: data[0].open_interest,
 current_price: (data[0] as any).current_price,
 fill_style: (data[0] as any).fill_style,
 classification: (data[0] as any).classification,
 trade_type: data[0].trade_type
 });
 }
 
 setTradesWithFillStyles(data);
 }, [data]);

 // Pagination logic
 const paginatedData = useMemo(() => {
 const startIndex = (currentPage - 1) * itemsPerPage;
 const endIndex = startIndex + itemsPerPage;
 return filteredAndSortedData.slice(startIndex, endIndex);
 }, [filteredAndSortedData, currentPage, itemsPerPage]);

 const totalPages = Math.ceil(filteredAndSortedData.length / itemsPerPage);

 // Reset to page 1 when filters change
 useEffect(() => {
 setCurrentPage(1);
 }, [selectedOptionTypes, selectedPremiumFilters, customMinPremium, customMaxPremium, selectedTickerFilters, selectedUniqueFilters, expirationStartDate, expirationEndDate, selectedTickerFilter, blacklistedTickers]);

 // Fetch current option prices when EFI Highlights is ON
 useEffect(() => {
 if (efiHighlightsActive && filteredAndSortedData.length > 0) {
 fetchCurrentOptionPrices(filteredAndSortedData);
 }
 }, [efiHighlightsActive, filteredAndSortedData]);

 const formatCurrency = (value: number) => {
 return new Intl.NumberFormat('en-US', {
 style: 'currency',
 currency: 'USD',
 minimumFractionDigits: 0,
 maximumFractionDigits: 0
 }).format(value);
 };

 const handleTickerClick = (ticker: string) => {
 if (selectedTickerFilter === ticker) {
 // If clicking the same ticker, clear the filter
 setSelectedTickerFilter('');
 } else {
 // Set new ticker filter
 setSelectedTickerFilter(ticker);
 }
 };

 const formatTime = (timestamp: string) => {
 // Show execution time in 12-hour format with AM/PM (ET timezone)
 const date = new Date(timestamp);
 return date.toLocaleTimeString('en-US', {
 hour12: true, // 12-hour format with AM/PM
 hour: 'numeric', // No leading zero (9 AM instead of 09 AM)
 minute: '2-digit', // Always show minutes with leading zero
 timeZone: 'America/New_York' // Ensure ET timezone
 });
 };

 const formatDate = (dateString: string) => {
 // Parse date string manually to avoid timezone issues
 // Expected format: YYYY-MM-DD
 const [year, month, day] = dateString.split('-');
 return `${month}/${day}/${year}`;
 };

 const getTradeTypeColor = (tradeType: string) => {
 const colors = {
 'BLOCK': 'bg-gradient-to-r from-blue-600 to-blue-700 text-white font-bold shadow-lg border border-blue-500',
 'SWEEP': 'bg-gradient-to-r from-yellow-500 to-yellow-600 text-black font-bold shadow-lg border border-yellow-400',
 'MULTI-LEG': 'bg-gradient-to-r from-purple-600 to-purple-700 text-white font-bold shadow-lg border border-purple-500',
 'MINI': 'bg-gradient-to-r from-green-600 to-green-700 text-white font-bold shadow-lg border border-green-500'
 };
 return colors[tradeType as keyof typeof colors] || 'bg-gradient-to-r from-gray-600 to-gray-700 text-white font-bold shadow-lg border border-gray-500';
 };

 const getCallPutColor = (type: string) => {
 return type === 'call' ? 'text-green-500 font-bold text-xl' : 'text-red-500 font-bold text-xl';
 };

 const getTickerStyle = (ticker: string) => {
 // Box-style background for ticker symbols - orange text with silver-black background
 return 'bg-gradient-to-b from-gray-800 to-black text-orange-500 font-bold px-6 py-3 border border-gray-500/70 shadow-lg text-lg tracking-wide rounded-sm min-w-[80px]';
 };

 // Prevent hydration mismatch - only render after client mount
 if (!isMounted) {
 return null;
 }

 return (
 <>
 {/* Filter Dialog Modal */}
 {isFilterDialogOpen && (
 <>
 {/* Invisible backdrop for click-to-close */}
 <div 
 className="fixed inset-0 z-[9998]"
 onClick={() => {
 console.log('Dialog backdrop clicked - closing dialog');
 setIsFilterDialogOpen(false);
 }}
 />
 {/* Modal Content */}
 <div className="filter-dialog fixed top-0 md:top-56 left-0 md:left-1/2 transform md:-translate-x-1/2 bg-black border border-gray-600 rounded-none md:rounded-lg p-3 w-full md:w-auto md:max-w-4xl h-full md:h-auto md:max-h-[55vh] overflow-y-auto z-[9999]" style={{ boxShadow: '0 4px 16px rgba(0, 0, 0, 0.5)' }}>
 <div className="filter-dialog-content">
 <div className="flex justify-center items-center mb-6 relative">
 <h2 className="text-2xl font-bold italic text-orange-400" style={{ fontFamily: 'Georgia, serif', textShadow: '0 0 8px rgba(255, 165, 0, 0.3)', letterSpacing: '0.5px' }}>Options Flow Filters</h2>
 <button
 onClick={() => setIsFilterDialogOpen(false)}
 className="absolute right-0 text-gray-400 hover:text-white text-2xl font-bold"
 >
 ×
 </button>
 </div>
 
 <div className="-space-y-2 px-8">
 {/* Top Row - Option Type, Value Premium, Ticker Filter */}
 <div className="flex flex-wrap justify-start items-start gap-3 mx-2">
 {/* Option Type */}
 <div className="relative bg-black rounded-lg p-4 border border-orange-500/40 transition-all duration-300 m-2" style={{ background: '#000000', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.8)' }}>
 <div className="absolute inset-0 bg-gradient-to-br from-gray-400/3 to-transparent rounded-lg animate-pulse"></div>
 <label className="text-xl font-bold mb-3 block text-center relative z-10 italic" style={{ fontFamily: 'Georgia, serif', letterSpacing: '0.3px' }}>
 <span style={{ color: '#10b981', textShadow: '0 0 6px rgba(16, 185, 129, 0.4)' }}>Options</span>
 <span style={{ color: '#ef4444', textShadow: '0 0 6px rgba(239, 68, 68, 0.4)' }}> Type</span>
 </label>
 <div className="space-y-3 relative z-10">
 <label className="flex items-center cursor-pointer hover:bg-gray-800 p-2 rounded transition-all">
 <input
 type="checkbox"
 checked={selectedOptionTypes.includes('put')}
 onChange={(e) => {
 if (e.target.checked) {
 setSelectedOptionTypes(prev => [...prev, 'put']);
 } else {
 setSelectedOptionTypes(prev => prev.filter(type => type !== 'put'));
 }
 }}
 className="w-5 h-5 text-red-600 bg-black border-orange-500 rounded focus:ring-red-500"
 />
 <span className={`ml-3 text-lg font-medium transition-all duration-200 ${
 selectedOptionTypes.includes('put') 
 ? 'text-red-400 font-bold drop-shadow-lg'
 : 'text-gray-300'
 }`}>Puts</span>
 </label>
 <label className="flex items-center cursor-pointer hover:bg-gray-800 p-2 rounded transition-all">
 <input
 type="checkbox"
 checked={selectedOptionTypes.includes('call')}
 onChange={(e) => {
 if (e.target.checked) {
 setSelectedOptionTypes(prev => [...prev, 'call']);
 } else {
 setSelectedOptionTypes(prev => prev.filter(type => type !== 'call'));
 }
 }}
 className="w-5 h-5 text-green-600 bg-black border-orange-500 rounded focus:ring-green-500"
 />
 <span className={`ml-3 text-lg font-medium transition-all duration-200 ${
 selectedOptionTypes.includes('call') 
 ? 'text-green-400 font-bold drop-shadow-lg'
 : 'text-gray-300'
 }`}>Calls</span>
 </label>
 </div>
 </div>

 {/* Value (Premium) */}
 <div className="relative bg-black rounded-lg p-4 border border-orange-500/40 transition-all duration-300 m-2" style={{ background: '#000000', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.8)' }}>
 <div className="absolute inset-0 bg-gradient-to-br from-green-400/3 to-transparent rounded-lg animate-pulse"></div>
 <label className="text-xl font-bold mb-3 block text-center relative z-10 italic" style={{ fontFamily: 'Georgia, serif', letterSpacing: '0.3px', color: '#10b981', textShadow: '0 0 6px rgba(16, 185, 129, 0.4)' }}>Premium</label>
 <div className="space-y-3 relative z-10">
 {/* Preset Checkboxes */}
 <label className="flex items-center cursor-pointer hover:bg-gray-800 p-2 rounded transition-all">
 <input
 type="checkbox"
 checked={selectedPremiumFilters.includes('50000')}
 onChange={(e) => {
 if (e.target.checked) {
 setSelectedPremiumFilters(prev => [...prev, '50000']);
 } else {
 setSelectedPremiumFilters(prev => prev.filter(filter => filter !== '50000'));
 }
 }}
 className="w-5 h-5 text-green-600 bg-black border-orange-500 rounded focus:ring-green-500"
 />
 <span className={`ml-3 text-lg font-medium transition-all duration-200 ${
 selectedPremiumFilters.includes('50000') 
 ? 'text-green-400 font-bold drop-shadow-lg'
 : 'text-gray-300'
 }`}>≥ $50,000</span>
 </label>
 <label className="flex items-center cursor-pointer hover:bg-gray-800 p-2 rounded transition-all">
 <input
 type="checkbox"
 checked={selectedPremiumFilters.includes('99000')}
 onChange={(e) => {
 if (e.target.checked) {
 setSelectedPremiumFilters(prev => [...prev, '99000']);
 } else {
 setSelectedPremiumFilters(prev => prev.filter(filter => filter !== '99000'));
 }
 }}
 className="w-5 h-5 text-green-600 bg-black border-orange-500 rounded focus:ring-green-500"
 />
 <span className={`ml-3 text-lg font-medium transition-all duration-200 ${
 selectedPremiumFilters.includes('99000') 
 ? 'text-green-400 font-bold drop-shadow-lg'
 : 'text-gray-300'
 }`}>≥ $99,000</span>
 </label>
 <label className="flex items-center cursor-pointer hover:bg-gray-800 p-2 rounded transition-all">
 <input
 type="checkbox"
 checked={selectedPremiumFilters.includes('200000')}
 onChange={(e) => {
 if (e.target.checked) {
 setSelectedPremiumFilters(prev => [...prev, '200000']);
 } else {
 setSelectedPremiumFilters(prev => prev.filter(filter => filter !== '200000'));
 }
 }}
 className="w-5 h-5 text-green-600 bg-black border-orange-500 rounded focus:ring-green-500"
 />
 <span className={`ml-3 text-lg font-medium transition-all duration-200 ${
 selectedPremiumFilters.includes('200000') 
 ? 'text-green-400 font-bold drop-shadow-lg'
 : 'text-gray-300'
 }`}>≥ $200,000</span>
 </label>
 
 {/* Custom Range Inputs */}
 <div className="border-t border-orange-500 pt-3 mt-3">
 <div className="space-y-2">
 <div>
 <label className="text-sm text-orange-300 mb-1 block font-medium">Min ($)</label>
 <input
 type="number"
 value={customMinPremium}
 onChange={(e) => setCustomMinPremium(e.target.value)}
 placeholder="0"
 className="border border-orange-500 rounded px-3 py-2 text-sm bg-black text-green-400 placeholder-gray-500 focus:border-orange-400 focus:ring-1 focus:ring-orange-400 focus:outline-none w-full transition-all"
 />
 </div>
 <div>
 <label className="text-sm text-orange-300 mb-1 block font-medium">Max ($)</label>
 <input
 type="number"
 value={customMaxPremium}
 onChange={(e) => setCustomMaxPremium(e.target.value)}
 placeholder="∞"
 className="border border-orange-500 rounded px-3 py-2 text-sm bg-black text-green-400 placeholder-gray-500 focus:border-orange-400 focus:ring-1 focus:ring-orange-400 focus:outline-none w-full transition-all"
 />
 </div>
 </div>
 </div>
 </div>
 </div>

 {/* Ticker Filter */}
 <div className="relative bg-black rounded-lg p-4 border border-orange-500/40 transition-all duration-300 m-2" style={{ background: '#000000', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.8)' }}>
 <div className="absolute inset-0 bg-gradient-to-br from-blue-400/3 to-transparent rounded-lg animate-pulse"></div>
 <label className="text-xl font-bold mb-3 block text-center relative z-10 italic" style={{ fontFamily: 'Georgia, serif', letterSpacing: '0.3px', color: '#3b82f6', textShadow: '0 0 6px rgba(59, 130, 246, 0.4)' }}>Ticker Filter</label>
 <div className="space-y-3 relative z-10">
 <label className="flex items-center cursor-pointer hover:bg-gray-800 p-2 rounded transition-all">
 <input
 type="checkbox"
 checked={selectedTickerFilters.includes('ETF_ONLY')}
 onChange={(e) => {
 if (e.target.checked) {
 setSelectedTickerFilters(prev => [...prev, 'ETF_ONLY']);
 } else {
 setSelectedTickerFilters(prev => prev.filter(filter => filter !== 'ETF_ONLY'));
 }
 }}
 className="w-5 h-5 text-blue-600 bg-black border-orange-500 rounded focus:ring-blue-500"
 />
 <span className={`ml-3 text-lg font-medium transition-all duration-200 ${
 selectedTickerFilters.includes('ETF_ONLY') 
 ? 'text-blue-400 font-bold drop-shadow-lg'
 : 'text-gray-300'
 }`}>ETF Only</span>
 </label>
 <label className="flex items-center cursor-pointer hover:bg-gray-800 p-2 rounded transition-all">
 <input
 type="checkbox"
 checked={selectedTickerFilters.includes('STOCK_ONLY')}
 onChange={(e) => {
 if (e.target.checked) {
 setSelectedTickerFilters(prev => [...prev, 'STOCK_ONLY']);
 } else {
 setSelectedTickerFilters(prev => prev.filter(filter => filter !== 'STOCK_ONLY'));
 }
 }}
 className="w-5 h-5 text-blue-600 bg-black border-orange-500 rounded focus:ring-blue-500"
 />
 <span className={`ml-3 text-lg font-medium transition-all duration-200 ${
 selectedTickerFilters.includes('STOCK_ONLY') 
 ? 'text-blue-400 font-bold drop-shadow-lg'
 : 'text-gray-300'
 }`}>Stock Only</span>
 </label>
 <label className="flex items-center cursor-pointer hover:bg-gray-800 p-2 rounded transition-all">
 <input
 type="checkbox"
 checked={selectedTickerFilters.includes('MAG7_ONLY')}
 onChange={(e) => {
 if (e.target.checked) {
 setSelectedTickerFilters(prev => [...prev, 'MAG7_ONLY']);
 } else {
 setSelectedTickerFilters(prev => prev.filter(filter => filter !== 'MAG7_ONLY'));
 }
 }}
 className="w-5 h-5 text-blue-600 bg-black border-orange-500 rounded focus:ring-blue-500"
 />
 <span className={`ml-3 text-lg font-medium transition-all duration-200 ${
 selectedTickerFilters.includes('MAG7_ONLY') 
 ? 'text-blue-400 font-bold drop-shadow-lg'
 : 'text-gray-300'
 }`}>Mag 7 Only</span>
 </label>
 <label className="flex items-center cursor-pointer hover:bg-gray-800 p-2 rounded transition-all">
 <input
 type="checkbox"
 checked={selectedTickerFilters.includes('EXCLUDE_MAG7')}
 onChange={(e) => {
 if (e.target.checked) {
 setSelectedTickerFilters(prev => [...prev, 'EXCLUDE_MAG7']);
 } else {
 setSelectedTickerFilters(prev => prev.filter(filter => filter !== 'EXCLUDE_MAG7'));
 }
 }}
 className="w-5 h-5 text-blue-600 bg-black border-orange-500 rounded focus:ring-blue-500"
 />
 <span className={`ml-3 text-lg font-medium transition-all duration-200 ${
 selectedTickerFilters.includes('EXCLUDE_MAG7') 
 ? 'text-blue-400 font-bold drop-shadow-lg'
 : 'text-gray-300'
 }`}>Exclude Mag 7</span>
 </label>
 </div>
 </div>
 </div>

 {/* Bottom Row - Unique Filters and Options Expiration */}
 <div className="flex flex-wrap justify-start items-start gap-3 mx-2">
 {/* Unique Filters */}
 <div className="relative bg-black rounded-lg p-4 border border-orange-500/40 transition-all duration-300 m-2" style={{ background: '#000000', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.8)' }}>
 <div className="absolute inset-0 bg-gradient-to-br from-yellow-400/3 to-transparent rounded-lg animate-pulse"></div>
 <label className="text-xl font-bold mb-3 block text-center relative z-10 italic" style={{ fontFamily: 'Georgia, serif', letterSpacing: '0.3px', color: '#fbbf24', textShadow: '0 0 6px rgba(251, 191, 36, 0.4)' }}>Unique</label>
 <div className="space-y-3 relative z-10">
 <label className="flex items-center cursor-pointer hover:bg-gray-800 p-2 rounded transition-all">
 <input
 type="checkbox"
 checked={selectedUniqueFilters.includes('ITM')}
 onChange={(e) => {
 if (e.target.checked) {
 setSelectedUniqueFilters(prev => [...prev, 'ITM']);
 } else {
 setSelectedUniqueFilters(prev => prev.filter(filter => filter !== 'ITM'));
 }
 }}
 className="w-5 h-5 text-yellow-600 bg-black border-orange-500 rounded focus:ring-yellow-500"
 />
 <span className={`ml-3 text-lg font-medium transition-all duration-200 ${
 selectedUniqueFilters.includes('ITM') 
 ? 'text-yellow-400 font-bold drop-shadow-lg'
 : 'text-gray-300'
 }`}>In The Money</span>
 </label>
 <label className="flex items-center cursor-pointer hover:bg-gray-800 p-2 rounded transition-all">
 <input
 type="checkbox"
 checked={selectedUniqueFilters.includes('OTM')}
 onChange={(e) => {
 if (e.target.checked) {
 setSelectedUniqueFilters(prev => [...prev, 'OTM']);
 } else {
 setSelectedUniqueFilters(prev => prev.filter(filter => filter !== 'OTM'));
 }
 }}
 className="w-5 h-5 text-yellow-600 bg-black border-orange-500 rounded focus:ring-yellow-500"
 />
 <span className={`ml-3 text-lg font-medium transition-all duration-200 ${
 selectedUniqueFilters.includes('OTM') 
 ? 'text-yellow-400 font-bold drop-shadow-lg'
 : 'text-gray-300'
 }`}>Out The Money</span>
 </label>
 <label className="flex items-center cursor-pointer hover:bg-gray-800 p-2 rounded transition-all">
 <input
 type="checkbox"
 checked={selectedUniqueFilters.includes('SWEEP_ONLY')}
 onChange={(e) => {
 if (e.target.checked) {
 setSelectedUniqueFilters(prev => [...prev, 'SWEEP_ONLY']);
 } else {
 setSelectedUniqueFilters(prev => prev.filter(filter => filter !== 'SWEEP_ONLY'));
 }
 }}
 className="w-5 h-5 text-yellow-600 bg-black border-orange-500 rounded focus:ring-yellow-500"
 />
 <span className={`ml-3 text-lg font-medium transition-all duration-200 ${
 selectedUniqueFilters.includes('SWEEP_ONLY') 
 ? 'text-yellow-400 font-bold drop-shadow-lg'
 : 'text-gray-300'
 }`}>Sweep Only</span>
 </label>
 <label className="flex items-center cursor-pointer hover:bg-gray-800 p-2 rounded transition-all">
 <input
 type="checkbox"
 checked={selectedUniqueFilters.includes('BLOCK_ONLY')}
 onChange={(e) => {
 if (e.target.checked) {
 setSelectedUniqueFilters(prev => [...prev, 'BLOCK_ONLY']);
 } else {
 setSelectedUniqueFilters(prev => prev.filter(filter => filter !== 'BLOCK_ONLY'));
 }
 }}
 className="w-5 h-5 text-yellow-600 bg-black border-orange-500 rounded focus:ring-yellow-500"
 />
 <span className={`ml-3 text-lg font-medium transition-all duration-200 ${
 selectedUniqueFilters.includes('BLOCK_ONLY') 
 ? 'text-yellow-400 font-bold drop-shadow-lg'
 : 'text-gray-300'
 }`}>Block Only</span>
 </label>
 <label className="flex items-center cursor-pointer hover:bg-gray-800 p-2 rounded transition-all">
 <input
 type="checkbox"
 checked={selectedUniqueFilters.includes('WEEKLY_ONLY')}
 onChange={(e) => {
 if (e.target.checked) {
 setSelectedUniqueFilters(prev => [...prev, 'WEEKLY_ONLY']);
 } else {
 setSelectedUniqueFilters(prev => prev.filter(filter => filter !== 'WEEKLY_ONLY'));
 }
 }}
 className="w-5 h-5 text-yellow-600 bg-black border-orange-500 rounded focus:ring-yellow-500"
 />
 <span className={`ml-3 text-lg font-medium transition-all duration-200 ${
 selectedUniqueFilters.includes('WEEKLY_ONLY') 
 ? 'text-yellow-400 font-bold drop-shadow-lg'
 : 'text-gray-300'
 }`}>Weekly Only</span>
 </label>
 <label className="flex items-center cursor-pointer hover:bg-gray-800 p-2 rounded transition-all">
 <input
 type="checkbox"
 checked={selectedUniqueFilters.includes('MULTI_LEG_ONLY')}
 onChange={(e) => {
 if (e.target.checked) {
 setSelectedUniqueFilters(prev => [...prev, 'MULTI_LEG_ONLY']);
 } else {
 setSelectedUniqueFilters(prev => prev.filter(filter => filter !== 'MULTI_LEG_ONLY'));
 }
 }}
 className="w-5 h-5 text-yellow-600 bg-black border-orange-500 rounded focus:ring-yellow-500"
 />
 <span className={`ml-3 text-lg font-medium transition-all duration-200 ${
 selectedUniqueFilters.includes('MULTI_LEG_ONLY') 
 ? 'text-yellow-400 font-bold drop-shadow-lg'
 : 'text-gray-300'
 }`}>Multi Leg Only</span>
 </label>
 <label className="flex items-center cursor-pointer hover:bg-gray-800 p-2 rounded transition-all">
 <input
 type="checkbox"
 checked={selectedUniqueFilters.includes('MINI_ONLY')}
 onChange={(e) => {
 if (e.target.checked) {
 setSelectedUniqueFilters(prev => [...prev, 'MINI_ONLY']);
 } else {
 setSelectedUniqueFilters(prev => prev.filter(filter => filter !== 'MINI_ONLY'));
 }
 }}
 className="w-5 h-5 text-green-600 bg-black border-green-500 rounded focus:ring-green-500"
 />
 <span className={`ml-3 text-lg font-medium transition-all duration-200 ${
 selectedUniqueFilters.includes('MINI_ONLY') 
 ? 'text-green-400 font-bold drop-shadow-lg'
 : 'text-gray-300'
 }`}>Mini Only</span>
 </label>
 </div>
 </div>

 {/* Black List */}
 <div className="relative bg-black rounded-lg p-4 border border-orange-500/40 transition-all duration-300 m-2" style={{ background: '#000000', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.8)' }}>
 <div className="absolute inset-0 bg-gradient-to-br from-orange-400/3 to-transparent rounded-lg animate-pulse"></div>
 <label className="text-xl font-bold mb-3 block text-center relative z-10 italic" style={{ fontFamily: 'Georgia, serif', letterSpacing: '0.3px', color: '#f97316', textShadow: '0 0 6px rgba(249, 115, 22, 0.4)' }}>Black List</label>
 <div className="space-y-2 relative z-10">
 {blacklistedTickers.map((ticker, index) => (
 <div key={index}>
 <input
 type="text"
 value={ticker}
 onChange={(e) => {
 const newTickers = [...blacklistedTickers];
 newTickers[index] = e.target.value.toUpperCase();
 setBlacklistedTickers(newTickers);
 }}
 placeholder={`Ticker ${index + 1}`}
 className="border border-gray-600 rounded px-2 py-1 text-sm bg-gray-800 text-white placeholder-gray-400 focus:border-red-500 focus:ring-1 focus:ring-red-500 focus:outline-none w-20 transition-all"
 maxLength={6}
 />
 </div>
 ))}
 </div>
 </div>

 {/* Options Expiration */}
 <div className="relative bg-black rounded-lg p-4 border border-orange-500/40 transition-all duration-300 m-2" style={{ background: '#000000', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.8)' }}>
 <div className="absolute inset-0 bg-gradient-to-br from-red-400/3 to-transparent rounded-lg animate-pulse"></div>
 <label className="text-xl font-bold mb-3 block text-center relative z-10 italic" style={{ fontFamily: 'Georgia, serif', letterSpacing: '0.3px', color: '#ffffff', textShadow: '0 0 6px rgba(255, 255, 255, 0.3)' }}>Options Expiration</label>
 <div className="space-y-3 relative z-10">
 <div>
 <label className="text-lg text-gray-300 mb-2 block">Start Date</label>
 <input
 type="date"
 value={expirationStartDate}
 onChange={(e) => setExpirationStartDate(e.target.value)}
 className="border-2 border-gray-600 rounded-lg px-2 py-2 text-sm bg-gray-800 text-white focus:border-gray-500 focus:outline-none shadow-lg w-auto transition-all"
 />
 </div>
 <div>
 <label className="text-lg text-gray-300 mb-2 block">End Date</label>
 <input
 type="date"
 value={expirationEndDate}
 onChange={(e) => setExpirationEndDate(e.target.value)}
 className="border-2 border-gray-600 rounded-lg px-2 py-2 text-sm bg-gray-800 text-white focus:border-gray-500 focus:outline-none shadow-lg w-auto transition-all"
 />
 </div>
 </div>
 </div>
 </div>
 </div>

 <div className="flex justify-between items-center mt-6 pt-4 border-t border-orange-500">
 <button
 onClick={() => {
 // Clear all filters
 setSelectedOptionTypes([]);
 setSelectedPremiumFilters([]);
 setSelectedTickerFilters([]);
 setSelectedUniqueFilters([]);
 setCustomMinPremium('');
 setCustomMaxPremium('');
 setExpirationStartDate('');
 setExpirationEndDate('');
 setBlacklistedTickers(['', '', '', '', '']);
 }}
 className="px-6 py-3 bg-gray-700 text-white rounded-lg border border-gray-600 hover:bg-gray-600 hover:border-gray-500 transition-all font-medium shadow-lg"
 style={{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 2px 4px rgba(0, 0, 0, 0.3)' }}
 >
 Clear All
 </button>
 <Button 
 onClick={() => setIsFilterDialogOpen(false)}
 className="px-8 py-3 bg-orange-600 text-white rounded-lg border border-orange-500 hover:bg-orange-500 hover:border-orange-400 transition-all font-bold shadow-lg"
 style={{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.2), 0 4px 8px rgba(255, 165, 0, 0.3)' }}
 >
 Apply Filters
 </Button>
 </div>
 </div>
 </div>
 </>
 )}

 <div 
 className="bg-black flex flex-col"
 style={{
 minHeight: '100vh',
 width: '100%'
 }}
 >
 {/* Premium Control Bar */}
 <div className="bg-black border-b border-gray-700 flex-shrink-0" style={{ 
 zIndex: 10,
 width: '100%',
 overflow: 'visible',
 marginTop: '15px'
 }}>
 <div className="px-8 py-5 bg-black" style={{
 width: '100%',
 overflow: 'visible',
 background: 'linear-gradient(180deg, #0d0d0d 0%, #000000 100%)',
 borderBottom: '1px solid #ff8500',
 boxShadow: '0 4px 20px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 133, 0, 0.1)'
 }}>
 <div className="control-bar flex items-center justify-between" style={{ width: '100%', maxWidth: '1800px' }}>
 <div className="flex items-center gap-3" style={{ flexShrink: 0 }}>
 {/* Compact Search Bar */}
 <div className="relative" style={{ width: '240px' }}>
 <div className="absolute left-3 top-1/2 transform -translate-y-1/2 z-10 pointer-events-none">
 <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
 <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
 </svg>
 </div>
 <input
 type="text"
 value={inputTicker}
 onChange={(e) => setInputTicker(e.target.value.toUpperCase())}
 onFocus={(e) => { 
 setIsInputFocused(true); 
 e.target.style.border = '2px solid #ff8500'; 
 e.target.style.boxShadow = 'inset 0 2px 8px rgba(0, 0, 0, 0.9)';
 }}
 onKeyDown={(e) => {
 if (e.key === 'Enter' && inputTicker.trim()) {
 const ticker = inputTicker.trim();
 onTickerChange(ticker);
 onRefresh?.(ticker);
 setIsInputFocused(false);
 }
 }}
 onBlur={(e) => {
 setIsInputFocused(false);
 e.target.style.border = '2px solid #1f1f1f'; 
 e.target.style.boxShadow = 'inset 0 2px 8px rgba(0, 0, 0, 0.9)';
 }}
 placeholder="TICKER"
 className="text-white font-mono placeholder-gray-500 transition-all duration-200"
 style={{ 
 width: '100%',
 height: '48px',
 paddingLeft: '2.5rem',
 paddingRight: '1rem',
 borderRadius: '4px',
 fontSize: '14px',
 fontWeight: '700',
 letterSpacing: '1.2px',
 background: 'linear-gradient(180deg, #000000 0%, #0a0a0a 100%)',
 border: '2px solid #1f1f1f',
 textTransform: 'uppercase',
 boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.9)',
 outline: 'none'
 }}
 maxLength={20}
 />
 </div>

 {/* Scan Shortcuts */}
 <div className="flex items-center gap-2">
 <button
 onClick={() => {
 setSelectedOptionTypes(['call']);
 }}
 className="px-4 font-bold uppercase transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
 style={{
 height: '48px',
 background: 'linear-gradient(180deg, #1a1a1a 0%, #000000 100%)',
 border: '2px solid #2a2a2a',
 borderRadius: '4px',
 fontSize: '15px',
 letterSpacing: '1.2px',
 fontWeight: '900',
 boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.9)',
 outline: 'none',
 color: '#84cc16'
 }}
 >
 CALLS
 </button>
 <button
 onClick={() => {
 setSelectedOptionTypes(['put']);
 }}
 className="px-4 font-bold uppercase transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
 style={{
 height: '48px',
 background: 'linear-gradient(180deg, #1a1a1a 0%, #000000 100%)',
 border: '2px solid #2a2a2a',
 borderRadius: '4px',
 fontSize: '15px',
 letterSpacing: '1.2px',
 fontWeight: '900',
 boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.9)',
 outline: 'none',
 color: '#dc2626'
 }}
 >
 PUTS
 </button>
 <button
 onClick={() => {
 setInputTicker('ETF');
 onTickerChange('ETF');
 onRefresh?.('ETF');
 }}
 className="px-4 font-bold uppercase transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
 style={{
 height: '48px',
 background: 'linear-gradient(180deg, #1a1a1a 0%, #000000 100%)',
 border: '2px solid #2a2a2a',
 borderRadius: '4px',
 fontSize: '15px',
 letterSpacing: '1.2px',
 fontWeight: '900',
 boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.9)',
 outline: 'none',
 color: '#ff8500'
 }}
 >
 ETF
 </button>
 <button
 onClick={() => {
 setInputTicker('MAG7');
 onTickerChange('MAG7');
 onRefresh?.('MAG7');
 }}
 className="px-4 font-bold uppercase transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
 style={{
 height: '48px',
 background: 'linear-gradient(180deg, #1a1a1a 0%, #000000 100%)',
 border: '2px solid #2a2a2a',
 borderRadius: '4px',
 fontSize: '15px',
 letterSpacing: '1.2px',
 fontWeight: '900',
 boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.9)',
 outline: 'none',
 color: '#a855f7'
 }}
 >
 MAG7
 </button>
 <button
 onClick={() => {
 setInputTicker('ALL');
 onTickerChange('ALL');
 onRefresh?.('ALL');
 }}
 className="px-4 font-bold uppercase transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
 style={{
 height: '48px',
 background: 'linear-gradient(180deg, #1a1a1a 0%, #000000 100%)',
 border: '2px solid #2a2a2a',
 borderRadius: '4px',
 fontSize: '15px',
 letterSpacing: '1.2px',
 fontWeight: '900',
 boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.9)',
 outline: 'none',
 color: '#ffffff'
 }}
 >
 ALL
 </button>
 </div>

 {/* Divider */}
 <div style={{ width: '1px', height: '48px', background: '#2a2a2a' }}></div>

 {/* Quick Filters */}
 <div className="flex items-center gap-2">
 <button
 onClick={() => {
 setQuickFilters(prev => ({ ...prev, otm: !prev.otm }));
 }}
 className="px-4 font-bold uppercase transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
 style={{
 height: '48px',
 background: 'linear-gradient(180deg, #1a1a1a 0%, #000000 100%)',
 border: '2px solid #2a2a2a',
 borderRadius: '4px',
 fontSize: '12px',
 letterSpacing: '1px',
 fontWeight: '900',
 boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.9)',
 outline: 'none',
 color: '#3b82f6'
 }}
 >
 OTM
 </button>
 <button
 onClick={() => {
 setQuickFilters(prev => ({ ...prev, premium100k: !prev.premium100k }));
 }}
 className="px-4 font-bold uppercase transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
 style={{
 height: '48px',
 background: 'linear-gradient(180deg, #1a1a1a 0%, #000000 100%)',
 border: '2px solid #2a2a2a',
 borderRadius: '4px',
 fontSize: '12px',
 letterSpacing: '1px',
 fontWeight: '900',
 boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.9)',
 outline: 'none',
 color: '#22c55e'
 }}
 >
 100K+
 </button>
 <button
 onClick={() => {
 setQuickFilters(prev => ({ ...prev, weekly: !prev.weekly }));
 }}
 className="px-4 font-bold uppercase transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
 style={{
 height: '48px',
 background: 'linear-gradient(180deg, #1a1a1a 0%, #000000 100%)',
 border: '2px solid #2a2a2a',
 borderRadius: '4px',
 fontSize: '12px',
 letterSpacing: '1px',
 fontWeight: '900',
 boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.9)',
 outline: 'none',
 color: '#ef4444'
 }}
 >
 WKLYs
 </button>
 <button
 onClick={() => {
 setQuickFilters(prev => ({ ...prev, sweep: !prev.sweep }));
 }}
 className="px-4 font-bold uppercase transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
 style={{
 height: '48px',
 background: 'linear-gradient(180deg, #1a1a1a 0%, #000000 100%)',
 border: '2px solid #2a2a2a',
 borderRadius: '4px',
 fontSize: '12px',
 letterSpacing: '1px',
 fontWeight: '900',
 boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.9)',
 outline: 'none',
 color: '#fbbf24'
 }}
 >
 SWEEP
 </button>
 <button
 onClick={() => {
 setQuickFilters(prev => ({ ...prev, block: !prev.block }));
 }}
 className="px-4 font-bold uppercase transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
 style={{
 height: '48px',
 background: 'linear-gradient(180deg, #1a1a1a 0%, #000000 100%)',
 border: '2px solid #2a2a2a',
 borderRadius: '4px',
 fontSize: '12px',
 letterSpacing: '1px',
 fontWeight: '900',
 boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.9)',
 outline: 'none',
 color: '#a855f7'
 }}
 >
 BLOCK
 </button>
 {efiHighlightsActive && (
 <button
 onClick={() => setAGradeFilterActive(!aGradeFilterActive)}
 className="px-4 font-bold uppercase transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
 style={{
 height: '48px',
 background: aGradeFilterActive 
 ? 'linear-gradient(180deg, #00ff00 0%, #00cc00 100%)'
 : 'linear-gradient(180deg, #1a1a1a 0%, #000000 100%)',
 border: aGradeFilterActive ? '2px solid #00ff00' : '2px solid #2a2a2a',
 borderRadius: '4px',
 fontSize: '12px',
 letterSpacing: '1px',
 fontWeight: '900',
 boxShadow: aGradeFilterActive 
 ? '0 0 12px rgba(0, 255, 0, 0.6), inset 0 2px 8px rgba(0, 0, 0, 0.3)'
 : 'inset 0 2px 8px rgba(0, 0, 0, 0.9)',
 outline: 'none',
 color: aGradeFilterActive ? '#000000' : '#00ff00'
 }}
 >
 A+ ONLY
 </button>
 )}
 </div>

 {/* Divider */}
 <div style={{ width: '1px', height: '48px', background: '#2a2a2a' }}></div>
 
 {/* Premium SCAN Button */}
 <button
 onClick={() => {
 if (inputTicker.trim()) {
 const ticker = inputTicker.trim();
 onTickerChange(ticker);
 onRefresh?.(ticker);
 }
 }}
 disabled={!inputTicker.trim() || loading}
 className={`px-10 font-black uppercase transition-all duration-200 flex items-center gap-3 ${
 !inputTicker.trim() || loading ? 'opacity-40 cursor-not-allowed' : 'hover:scale-[1.02] active:scale-[0.98]'
 }`}
 style={{
 height: '48px',
 background: 'linear-gradient(180deg, #1a1a1a 0%, #000000 50%, #000000 100%)',
 border: '2px solid #ff8500',
 borderRadius: '4px',
 fontSize: '15px',
 letterSpacing: '2px',
 fontWeight: '900',
 boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.9)',
 position: 'relative',
 overflow: 'hidden',
 color: '#ff8500',
 outline: 'none'
 }}
 onMouseEnter={(e) => {
 if (!loading && inputTicker.trim()) {
 e.currentTarget.style.boxShadow = 'inset 0 2px 8px rgba(0, 0, 0, 0.9)';
 e.currentTarget.style.border = '2px solid #ffaa00';
 }
 }}
 onMouseLeave={(e) => {
 if (!loading && inputTicker.trim()) {
 e.currentTarget.style.boxShadow = 'inset 0 2px 8px rgba(0, 0, 0, 0.9)';
 e.currentTarget.style.border = '2px solid #ff8500';
 }
 }}
 >
 <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3.5}>
 <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
 </svg>
 <span>SCAN</span>
 </button>
 
 {/* Premium EFI Highlights Toggle */}
 <button
 onClick={() => setEfiHighlightsActive(!efiHighlightsActive)}
 className="px-8 text-white font-black uppercase transition-all duration-200 flex items-center gap-3 hover:scale-[1.02] active:scale-[0.98] focus:outline-none"
 style={{
 height: '48px',
 background: efiHighlightsActive 
 ? 'linear-gradient(180deg, #ff9500 0%, #ff8500 50%, #ff7500 100%)'
 : 'linear-gradient(180deg, #1a1a1a 0%, #000000 50%, #000000 100%)',
 border: efiHighlightsActive ? '1px solid #ffaa00' : '2px solid #2a2a2a',
 borderRadius: '4px',
 fontSize: '14px',
 letterSpacing: '1.5px',
 fontWeight: '900',
 boxShadow: efiHighlightsActive 
 ? 'inset 0 1px 0 rgba(255, 255, 255, 0.4), inset 0 -2px 0 rgba(0, 0, 0, 0.3)'
 : 'inset 0 2px 8px rgba(0, 0, 0, 0.9)'
 }}
 onMouseEnter={(e) => {
 if (efiHighlightsActive) {
 e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255, 255, 255, 0.5), inset 0 -2px 0 rgba(0, 0, 0, 0.3)';
 } else {
 e.currentTarget.style.boxShadow = 'inset 0 2px 8px rgba(0, 0, 0, 0.9)';
 }
 }}
 onMouseLeave={(e) => {
 if (efiHighlightsActive) {
 e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255, 255, 255, 0.4), inset 0 -2px 0 rgba(0, 0, 0, 0.3)';
 } else {
 e.currentTarget.style.boxShadow = 'inset 0 2px 8px rgba(0, 0, 0, 0.9)';
 }
 }}
 >
 <svg className={`w-5 h-5 transition-all duration-200 ${efiHighlightsActive ? 'text-black' : 'text-orange-500'}`} 
 fill={efiHighlightsActive ? 'currentColor' : 'none'} 
 stroke="currentColor" 
 viewBox="0 0 24 24" 
 strokeWidth={2}
 >
 <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
 </svg>
 <span style={{ color: efiHighlightsActive ? '#000000' : '#ffffff' }}>EFI HIGHLIGHTS</span>
 <div className={`px-3 py-1 font-black rounded transition-all duration-200`}
 style={{
 fontSize: '11px',
 letterSpacing: '1px',
 background: efiHighlightsActive ? 'rgba(0, 0, 0, 0.4)' : 'rgba(255, 133, 0, 0.1)',
 color: efiHighlightsActive ? '#ff8500' : '#666666',
 boxShadow: efiHighlightsActive ? 'inset 0 1px 3px rgba(0, 0, 0, 0.5)' : 'inset 0 1px 3px rgba(0, 0, 0, 0.8)'
 }}
 >
 {efiHighlightsActive ? 'ON' : 'OFF'}
 </div>
 </button>
 
 {/* Active Ticker Filter */}
 {selectedTickerFilter && (
 <div className="flex items-center gap-3">
 <span className="text-gray-300 text-sm font-medium">Filtered:</span>
 <div className="flex items-center gap-2 bg-orange-950/30 border border-orange-500/50 rounded-lg px-3 py-2 h-10">
 <span className="text-orange-400 font-mono font-semibold text-sm">{selectedTickerFilter}</span>
 <button 
 onClick={() => setSelectedTickerFilter('')}
 className="text-orange-400 hover:text-white hover:bg-orange-500 rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold transition-all duration-200"
 title="Clear filter"
 >
 ×
 </button>
 </div>
 </div>
 )}
 
 {/* Premium Action Buttons */}
 <div className="flex items-center gap-3">
 <button 
 onClick={() => onRefresh?.()} 
 disabled={loading}
 className={`px-9 text-white font-black uppercase transition-all duration-200 flex items-center gap-3 focus:outline-none ${
 loading 
 ? 'cursor-not-allowed opacity-40' 
 : 'hover:scale-[1.02] active:scale-[0.98]'
 }`}
 style={{
 height: '48px',
 background: 'linear-gradient(180deg, #1a1a1a 0%, #000000 50%, #000000 100%)',
 border: '2px solid #0ea5e9',
 borderRadius: '4px',
 fontSize: '14px',
 letterSpacing: '1.5px',
 fontWeight: '900',
 boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.9)'
 }}
 onMouseEnter={(e) => {
 if (!loading) {
 e.currentTarget.style.boxShadow = 'inset 0 2px 8px rgba(0, 0, 0, 0.9)';
 e.currentTarget.style.border = '2px solid #38bdf8';
 }
 }}
 onMouseLeave={(e) => {
 if (!loading) {
 e.currentTarget.style.boxShadow = 'inset 0 2px 8px rgba(0, 0, 0, 0.9)';
 e.currentTarget.style.border = '2px solid #0ea5e9';
 }
 }}
 >
 {loading ? (
 <>
 <svg className="animate-spin h-5 w-5 text-cyan-400" fill="none" viewBox="0 0 24 24" strokeWidth={2.5}>
 <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
 <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
 </svg>
 <span>{streamingStatus || 'SCANNING...'}</span>
 </>
 ) : (
 <>
 <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
 <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
 </svg>
 <span>REFRESH</span>
 </>
 )}
 </button>

 {/* Clear Data Button */}
 {onClearData && (
 <button 
 onClick={onClearData} 
 disabled={loading}
 className={`px-9 text-white font-black uppercase transition-all duration-200 flex items-center gap-3 focus:outline-none ${
 loading 
 ? 'cursor-not-allowed opacity-40' 
 : 'hover:scale-[1.02] active:scale-[0.98]'
 }`}
 style={{
 height: '48px',
 background: 'linear-gradient(180deg, #1a1a1a 0%, #000000 50%, #000000 100%)',
 border: '2px solid #ef4444',
 borderRadius: '4px',
 fontSize: '14px',
 letterSpacing: '1.5px',
 fontWeight: '900',
 boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.9)'
 }}
 onMouseEnter={(e) => {
 if (!loading) {
 e.currentTarget.style.boxShadow = 'inset 0 2px 8px rgba(0, 0, 0, 0.9)';
 e.currentTarget.style.border = '2px solid #f87171';
 }
 }}
 onMouseLeave={(e) => {
 if (!loading) {
 e.currentTarget.style.boxShadow = 'inset 0 2px 8px rgba(0, 0, 0, 0.9)';
 e.currentTarget.style.border = '2px solid #ef4444';
 }
 }}
 >
 <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
 <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
 </svg>
 <span>CLEAR</span>
 </button>
 )}

 </div>
 
 {/* Right Section */}
 <div className="stats-section flex flex-col md:flex-row items-start md:items-center gap-2 md:gap-3 w-full md:w-auto" style={{ flexShrink: 0, minWidth: 'auto' }}>

 {/* Filter Button */}
 <button 
 onClick={() => {
 console.log('Filter button clicked - opening dialog');
 setIsFilterDialogOpen(true);
 }}
 className="px-9 text-white font-black uppercase transition-all duration-200 flex items-center gap-3 hover:scale-[1.02] active:scale-[0.98] focus:outline-none"
 style={{
 height: '48px',
 background: 'linear-gradient(180deg, #1a1a1a 0%, #000000 50%, #000000 100%)',
 border: '2px solid #ff8500',
 borderRadius: '4px',
 fontSize: '14px',
 letterSpacing: '1.5px',
 fontWeight: '900',
 boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.9)'
 }}
 onMouseEnter={(e) => {
 e.currentTarget.style.boxShadow = 'inset 0 2px 8px rgba(0, 0, 0, 0.9)';
 e.currentTarget.style.border = '2px solid #ffaa00';
 }}
 onMouseLeave={(e) => {
 e.currentTarget.style.boxShadow = 'inset 0 2px 8px rgba(0, 0, 0, 0.9)';
 e.currentTarget.style.border = '2px solid #ff8500';
 }}
 >
 <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
 <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
 </svg>
 <span>FILTER</span>
 </button>

 {/* Vertical Divider */}
 <div className="control-bar-divider hidden md:block w-px h-8 bg-gray-700"></div>

 {/* Stats Section */}
 <div className="flex flex-col md:flex-row items-start md:items-center gap-1 md:gap-3">
 {/* Date Display */}
 {marketInfo && (
 <div className="text-xs md:text-sm text-gray-400 font-mono">
 {marketInfo.data_date}
 </div>
 )}

 {/* Trade Count */}
 <div className="text-xs md:text-sm text-gray-300">
 <span className="text-orange-400 font-bold font-mono">{filteredAndSortedData.length.toLocaleString()}</span>
 <span className="text-gray-400 ml-1">trades</span>
 </div>

 {/* Pagination Info */}
 <div className="text-xs md:text-sm text-gray-300">
 Page <span className="text-orange-400 font-bold font-mono">{currentPage}</span>
 <span className="text-gray-500 mx-1">of</span>
 <span className="text-orange-400 font-bold font-mono">{totalPages}</span>
 </div>
 
 {/* Pagination Controls */}
 {filteredAndSortedData.length > itemsPerPage && (
 <div className="pagination flex items-center gap-0.5 md:gap-1">
 <button
 onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
 disabled={currentPage === 1}
 className="w-7 h-7 md:w-8 md:h-8 flex items-center justify-center text-xs bg-black border border-gray-600 text-gray-300 hover:border-gray-500 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed rounded transition-all duration-150"
 >
 ←
 </button>
 
 {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
 let pageNum;
 if (totalPages <= 5) {
 pageNum = i + 1;
 } else if (currentPage <= 3) {
 pageNum = i + 1;
 } else if (currentPage >= totalPages - 2) {
 pageNum = totalPages - 4 + i;
 } else {
 pageNum = currentPage - 2 + i;
 }
 
 return (
 <button
 key={pageNum}
 onClick={() => setCurrentPage(pageNum)}
 className={`w-7 h-7 md:w-8 md:h-8 flex items-center justify-center text-xs border rounded transition-all duration-150 ${
 currentPage === pageNum
 ? 'bg-orange-500 text-black border-orange-500 font-bold'
 : 'bg-black border-gray-600 text-gray-300 hover:border-gray-500 hover:text-white'
 }`}
 >
 {pageNum}
 </button>
 );
 })}
 
 <button
 onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
 disabled={currentPage === totalPages}
 className="w-7 h-7 md:w-8 md:h-8 flex items-center justify-center text-xs bg-black border border-gray-600 text-gray-300 hover:border-gray-500 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed rounded transition-all duration-150"
 >
 →
 </button>
 </div>
 )}
 </div>
 </div>
 </div>
 </div>
 </div>
 </div>

 {/* Error Banner */}
 {streamError && (
 <div className="bg-red-900/20 border-l-4 border-red-500 px-6 py-4 mx-8 my-4 rounded-r-lg">
 <div className="flex items-center gap-3">
 <svg className="w-6 h-6 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
 </svg>
 <div>
 <p className="text-red-400 font-semibold">Connection Error</p>
 <p className="text-red-300 text-sm">{streamError}</p>
 </div>
 </div>
 </div>
 )}

 {/* Main Table */}
 <div className="bg-black border border-gray-800 flex-1 options-flow-table-container">
 <div className="p-0">
 <div className="table-scroll-container overflow-y-auto overflow-x-auto" style={{ height: 'calc(100vh - 140px)' }}>
 <table className="w-full options-flow-table">
 <thead className="sticky top-0 bg-gradient-to-b from-yellow-900/10 via-gray-900 to-black z-10 border-b-2 border-gray-600 shadow-2xl">
 <tr>
 <th 
 className="text-left p-2 md:p-6 cursor-pointer bg-gradient-to-b from-yellow-900/10 to-black hover:from-yellow-800/15 hover:to-black text-orange-400 font-bold text-xs md:text-xl transition-all duration-200 border-r border-gray-700"
 onClick={() => handleSort('trade_timestamp')}
 >
 Time {sortField === 'trade_timestamp' && (sortDirection === 'asc' ? '↑' : '↓')}
 </th>
 <th 
 className="text-left p-2 md:p-6 cursor-pointer bg-gradient-to-b from-yellow-900/10 to-black hover:from-yellow-800/15 hover:to-black text-orange-400 font-bold text-xs md:text-xl transition-all duration-200 border-r border-gray-700"
 onClick={() => handleSort('underlying_ticker')}
 >
 Symbol {sortField === 'underlying_ticker' && (sortDirection === 'asc' ? '↑' : '↓')}
 </th>
 <th 
 className="text-left p-2 md:p-6 cursor-pointer bg-gradient-to-b from-yellow-900/10 via-gray-900/80 to-black hover:from-yellow-800/15 hover:via-gray-800/90 hover:to-black text-orange-400 font-bold text-xs md:text-xl transition-all duration-200 border-r border-gray-700 shadow-lg shadow-black/50 hover:shadow-xl hover:shadow-orange-500/20 backdrop-blur-sm"
 onClick={() => handleSort('type')}
 >
 Call/Put {sortField === 'type' && (sortDirection === 'asc' ? '↑' : '↓')}
 </th>
 <th 
 className="text-left p-2 md:p-6 cursor-pointer bg-gradient-to-b from-yellow-900/10 via-black to-black hover:from-yellow-800/20 hover:via-gray-900 hover:to-black text-orange-400 font-bold text-xs md:text-xl transition-all duration-200 border-r border-gray-700"
 onClick={() => handleSort('strike')}
 >
 Strike {sortField === 'strike' && (sortDirection === 'asc' ? '↑' : '↓')}
 </th>
 <th 
 className="text-left p-2 md:p-6 cursor-pointer bg-gradient-to-b from-yellow-900/10 via-black to-black hover:from-yellow-800/20 hover:via-gray-900 hover:to-black text-orange-400 font-bold text-xs md:text-xl transition-all duration-200 border-r border-gray-700"
 onClick={() => handleSort('trade_size')}
 >
 Size {sortField === 'trade_size' && (sortDirection === 'asc' ? '↑' : '↓')}
 </th>
 <th 
 className="text-left p-2 md:p-6 cursor-pointer bg-gradient-to-b from-yellow-900/10 via-black to-black hover:from-yellow-800/20 hover:via-gray-900 hover:to-black text-orange-400 font-bold text-xs md:text-xl transition-all duration-200 border-r border-gray-700"
 onClick={() => handleSort('total_premium')}
 >
 Premium {sortField === 'total_premium' && (sortDirection === 'asc' ? '↑' : '↓')}
 </th>
 <th 
 className="text-left p-2 md:p-6 cursor-pointer bg-gradient-to-b from-yellow-900/10 via-black to-black hover:from-yellow-800/20 hover:via-gray-900 hover:to-black text-orange-400 font-bold text-xs md:text-xl transition-all duration-200 border-r border-gray-700"
 onClick={() => handleSort('expiry')}
 >
 Expiration {sortField === 'expiry' && (sortDirection === 'asc' ? '↑' : '↓')}
 </th>
 <th 
 className="text-left p-2 md:p-6 cursor-pointer bg-gradient-to-b from-yellow-900/10 via-black to-black hover:from-yellow-800/20 hover:via-gray-900 hover:to-black text-orange-400 font-bold text-xs md:text-xl transition-all duration-200 border-r border-gray-700"
 onClick={() => handleSort('spot_price')}
 >
 <span className="hidden md:inline">Spot {'>>'}  Current</span>
 <span className="md:hidden">Price</span>
 {sortField === 'spot_price' && (sortDirection === 'asc' ? '↑' : '↓')}
 </th>
 <th 
 className="text-left p-2 md:p-6 bg-gradient-to-b from-yellow-900/10 via-black to-black text-orange-400 font-bold text-xs md:text-xl transition-all duration-200 border-r border-gray-700"
 >
 VOL/OI
 </th>
 <th 
 className="text-left p-2 md:p-6 cursor-pointer bg-gradient-to-b from-yellow-900/10 via-gray-900/80 to-black hover:from-yellow-800/15 hover:via-gray-800/90 hover:to-black text-orange-400 font-bold text-xs md:text-xl transition-all duration-200 shadow-lg shadow-black/50 hover:shadow-xl hover:shadow-orange-500/20 backdrop-blur-sm"
 onClick={() => handleSort('trade_type')}
 >
 Type {sortField === 'trade_type' && (sortDirection === 'asc' ? '↑' : '↓')}
 </th>
 {efiHighlightsActive && (
 <th 
 className="text-left p-2 md:p-6 cursor-pointer bg-gradient-to-b from-yellow-900/10 via-black to-black hover:from-yellow-800/20 hover:via-gray-900 hover:to-black text-orange-400 font-bold text-xs md:text-xl transition-all duration-200 border-r border-gray-700"
 onClick={() => {
 console.log('🎯 Position column clicked!');
 handleSort('positioning_grade');
 }}
 >
 Position {sortField === 'positioning_grade' && (sortDirection === 'asc' ? '↑' : '↓')}
 </th>
 )}
 </tr>
 </thead>
 <tbody>
 {paginatedData.map((trade, index) => {
 const isEfiHighlight = efiHighlightsActive && meetsEfiCriteria(trade);
 return (
 <tr 
 key={`${trade.ticker}-${trade.strike}-${trade.trade_timestamp}-${trade.trade_size}-${index}`}
 className="border-b border-slate-700/50 hover:bg-slate-800/40 transition-all duration-300 hover:shadow-lg"
 style={isEfiHighlight ? {
 border: '2px solid #ffd700',
 backgroundColor: '#000000',
 boxShadow: '0 0 8px rgba(255, 215, 0, 0.8)'
 } : {
 backgroundColor: index % 2 === 0 ? '#000000' : '#0a0a0a'
 }}
 >
 <td className="p-2 md:p-6 text-white text-xs md:text-xl font-medium border-r border-gray-700/30 time-cell">{formatTime(trade.trade_timestamp)}</td>
 <td className="p-2 md:p-6 border-r border-gray-700/30">
 <button 
 onClick={() => handleTickerClick(trade.underlying_ticker)}
 className={`ticker-button ${getTickerStyle(trade.underlying_ticker)} hover:bg-gray-900 hover:text-orange-400 transition-all duration-200 px-2 md:px-3 py-1 md:py-2 rounded-lg cursor-pointer border-none shadow-sm text-xs md:text-lg ${
 selectedTickerFilter === trade.underlying_ticker ? 'ring-2 ring-orange-500 bg-gray-800/50' : ''
 }`}
 >
 {trade.underlying_ticker}
 </button>
 </td>
 <td className={`p-2 md:p-6 text-sm md:text-xl font-bold border-r border-gray-700/30 call-put-text ${getCallPutColor(trade.type)}`}>
 {trade.type.toUpperCase()}
 </td>
 <td className="p-2 md:p-6 text-xs md:text-xl text-white font-semibold border-r border-gray-700/30 strike-cell">${trade.strike}</td>
 <td className="p-2 md:p-6 font-medium text-xs md:text-xl text-white border-r border-gray-700/30 size-premium-cell">
 <div className="flex flex-col space-y-0.5 md:space-y-1">
 <div className="flex flex-wrap items-center gap-1">
 <span className="text-cyan-400 font-bold size-text" style={{ fontSize: '12px' }}>
 <span className="md:hidden">{trade.trade_size.toLocaleString()}</span>
 <span className="hidden md:inline" style={{ fontSize: '19px' }}>{trade.trade_size.toLocaleString()}</span>
 </span>
 <span className="text-slate-400 premium-at" style={{ fontSize: '12px' }}>
 <span className="md:hidden"> @ </span>
 <span className="hidden md:inline" style={{ fontSize: '19px' }}> @ </span>
 </span>
 <span className="text-yellow-400 font-bold premium-value" style={{ fontSize: '12px' }}>
 <span className="md:hidden">{trade.premium_per_contract.toFixed(2)}</span>
 <span className="hidden md:inline" style={{ fontSize: '19px' }}>{trade.premium_per_contract.toFixed(2)}</span>
 </span>
 {(trade as any).fill_style && (
 <span className={`fill-style-badge ml-1 px-1 md:px-2 py-0.5 rounded-md font-bold ${
 (trade as any).fill_style === 'A' ? 'text-green-400 bg-green-400/10 border border-green-400/30' :
 (trade as any).fill_style === 'AA' ? 'text-green-300 bg-green-300/10 border border-green-300/30' :
 (trade as any).fill_style === 'B' ? 'text-red-400 bg-red-400/10 border border-red-400/30' :
 (trade as any).fill_style === 'BB' ? 'text-red-300 bg-red-300/10 border border-red-300/30' :
 'text-gray-500 bg-gray-500/10 border border-gray-500/30'
 }`} style={{ fontSize: '12px' }}>
 <span className="md:hidden">{(trade as any).fill_style}</span>
 <span className="hidden md:inline" style={{ fontSize: '15px' }}>{(trade as any).fill_style}</span>
 </span>
 )}
 </div>
 </div>
 </td>
 <td className="p-2 md:p-6 font-bold text-xs md:text-xl text-green-400 border-r border-gray-700/30 premium-text">{formatCurrency(trade.total_premium)}</td>
 <td className="p-2 md:p-6 text-xs md:text-xl text-white border-r border-gray-700/30 expiry-cell">{formatDate(trade.expiry)}</td>
 <td className="p-2 md:p-6 text-xs md:text-xl font-medium border-r border-gray-700/30 price-display">
 <PriceDisplay 
 spotPrice={trade.spot_price}
 currentPrice={currentPrices[trade.underlying_ticker] || trade.current_price}
 isLoading={priceLoadingState[trade.underlying_ticker]}
 ticker={trade.underlying_ticker}
 />
 </td>
 <td className="p-2 md:p-6 text-xs md:text-xl text-white border-r border-gray-700/30 vol-oi-display">
 {(typeof trade.volume === 'number' && typeof trade.open_interest === 'number') ? (
 <div className="flex items-center justify-center gap-1">
 <span className="text-cyan-400 font-bold" style={{ fontSize: '19.2px' }}>
 {trade.volume.toLocaleString()}
 </span>
 <span className="text-gray-400" style={{ fontSize: '16.8px' }}>
 /
 </span>
 <span className="text-purple-400 font-bold" style={{ fontSize: '19.2px' }}>
 {trade.open_interest.toLocaleString()}
 </span>
 </div>
 ) : (
 <span className="text-gray-500" style={{ fontSize: '19.2px' }}>
 --
 </span>
 )}
 </td>
 <td className="p-2 md:p-6 border-r border-gray-700/30">
 <span className={`trade-type-badge inline-block px-2 md:px-4 py-1 md:py-2 rounded-lg text-xs md:text-lg font-bold shadow-sm ${getTradeTypeColor(trade.classification || trade.trade_type)}`}>
 {(trade.classification || trade.trade_type) === 'MULTI-LEG' ? 'ML' : (trade.classification || trade.trade_type)}
 </span>
 </td>
 {efiHighlightsActive && (() => {
 const expiry = trade.expiry.replace(/-/g, '').slice(2);
 const strikeFormatted = String(Math.round(trade.strike * 1000)).padStart(8, '0');
 const optionType = trade.type.toLowerCase() === 'call' ? 'C' : 'P';
 const optionTicker = `O:${trade.underlying_ticker}${expiry}${optionType}${strikeFormatted}`;
 const currentPrice = currentOptionPrices[optionTicker];
 const entryPrice = trade.premium_per_contract;
 
 // Calculate grade using the centralized function
 const gradeData = calculatePositioningGrade(trade, filteredAndSortedData);
 
 if (currentPrice && currentPrice > 0) {
 const currentValue = currentPrice * trade.trade_size * 100;
 const entryValue = trade.total_premium;
 const percentChange = ((currentPrice - entryPrice) / entryPrice) * 100;
 const priceHigher = currentPrice > entryPrice;
 
 // Determine color based on fill_style (A/AA = Ask, B/BB = Bid) and option type
 let color = '#9ca3af'; // default gray
 const fillStyle = trade.fill_style || '';
 const isCall = trade.type.toLowerCase() === 'call';
 
 if (fillStyle === 'A' || fillStyle === 'AA') {
 // Ask side - green if price went up, red if down (both calls and puts)
 color = priceHigher ? '#00ff00' : '#ff0000';
 } else if (fillStyle === 'B' || fillStyle === 'BB') {
 // Bid side - red if price went up, green if down (both calls and puts)
 color = priceHigher ? '#ff0000' : '#00ff00';
 }
 
 // Smart formatting for value
 const formatValue = (val: number): string => {
 if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
 if (val >= 1000) return `$${(val / 1000).toFixed(1)}K`;
 return `$${val.toFixed(0)}`;
 };
 
 // Use calculated grade data
 const { grade, color: scoreColor, breakdown } = gradeData;
 
 return (
 <td className="p-2 md:p-6 border-r border-gray-700/30">
 <div className="flex items-center gap-2">
 <span style={{ color, fontWeight: 'bold', fontSize: '16.8px', whiteSpace: 'nowrap' }}>
 ${currentPrice.toFixed(2)}
 </span>
 <span style={{ color, fontSize: '14.4px', whiteSpace: 'nowrap' }}>
 {formatValue(currentValue)}
 </span>
 <span style={{ color, fontWeight: 'bold', fontSize: '15.6px', whiteSpace: 'nowrap' }}>
 {priceHigher ? '+' : ''}{percentChange.toFixed(1)}%
 </span>
 <div style={{ 
 display: 'inline-flex',
 alignItems: 'center',
 justifyContent: 'center',
 width: '78px',
 height: '78px',
 border: `6px solid ${scoreColor}`,
 borderRadius: '50%',
 background: `linear-gradient(135deg, ${scoreColor}20 0%, ${scoreColor}05 50%, ${scoreColor}30 100%)`,
 marginLeft: '10px',
 transform: 'rotate(-12deg)',
 boxShadow: `
 0 8px 16px rgba(0, 0, 0, 0.6),
 inset 0 -3px 8px rgba(0, 0, 0, 0.7),
 inset 0 3px 8px rgba(255, 255, 255, 0.1)
 `,
 position: 'relative'
 }}>
 <div style={{
 position: 'absolute',
 top: '3px',
 left: '3px',
 right: '3px',
 bottom: '3px',
 border: `2px dashed ${scoreColor}80`,
 borderRadius: '50%'
 }}></div>
 <span
 onMouseEnter={() => setHoveredGradeIndex(index)}
 onMouseLeave={() => setHoveredGradeIndex(null)}
 style={{ 
 color: scoreColor, 
 fontWeight: 'normal', 
 fontSize: '31.2px', 
 fontStyle: 'italic',
 fontFamily: 'Impact, Georgia, serif',
 textShadow: `
 0 3px 0 rgba(0, 0, 0, 0.8),
 0 -1px 0 rgba(255, 255, 255, 0.3),
 2px 2px 4px rgba(0, 0, 0, 0.9)
 `,
 transform: 'rotate(12deg)',
 letterSpacing: '1px',
 filter: 'drop-shadow(0 2px 3px rgba(0, 0, 0, 0.8))',
 WebkitTextStroke: `0.5px ${scoreColor}`,
 cursor: 'help',
 position: 'relative'
 }}>
 {grade}
 {hoveredGradeIndex === index && (
 index < 3 ? (
 <div style={{
 position: 'absolute',
 top: '100%',
 left: '50%',
 transform: 'translateX(-50%) translateY(12px)',
 backgroundColor: '#000000',
 color: '#ffffff',
 padding: '16px 20px',
 borderRadius: '12px',
 fontSize: '15px',
 fontFamily: 'monospace',
 fontStyle: 'normal',
 fontWeight: 'normal',
 whiteSpace: 'pre-line',
 zIndex: 10000,
 minWidth: '280px',
 boxShadow: `
 0 8px 32px rgba(0, 0, 0, 0.8),
 0 0 0 2px ${scoreColor}40
 `,
 border: `2px solid ${scoreColor}`,
 lineHeight: '1.8',
 letterSpacing: '0.5px',
 textShadow: 'none',
 WebkitTextStroke: '0',
 pointerEvents: 'none'
 }}>
 <div style={{ marginBottom: '8px', fontWeight: 'bold', fontSize: '16px' }}>
 Score: <span style={{ color: scoreColor }}>{gradeData.score}/100</span>
 </div>
 <div style={{ display: 'flex', justifyContent: 'space-between' }}>
 <span>Expiration:</span>
 <span style={{ color: gradeData.scores.expiration === 0 ? '#ff0000' : gradeData.scores.expiration === 25 ? '#00ff00' : '#ffffff' }}>
 {gradeData.scores.expiration}/25
 </span>
 </div>
 <div style={{ display: 'flex', justifyContent: 'space-between' }}>
 <span>Contract P&L:</span>
 <span style={{ color: gradeData.scores.contractPrice === 0 ? '#ff0000' : gradeData.scores.contractPrice === 25 ? '#00ff00' : '#ffffff' }}>
 {gradeData.scores.contractPrice}/25
 </span>
 </div>
 <div style={{ display: 'flex', justifyContent: 'space-between' }}>
 <span>Combo Trade:</span>
 <span style={{ color: gradeData.scores.combo === 0 ? '#ff0000' : gradeData.scores.combo === 10 ? '#00ff00' : '#ffffff' }}>
 {gradeData.scores.combo}/10
 </span>
 </div>
 <div style={{ display: 'flex', justifyContent: 'space-between' }}>
 <span>Price Action:</span>
 <span style={{ color: gradeData.scores.priceAction === 0 ? '#ff0000' : gradeData.scores.priceAction === 25 ? '#00ff00' : '#ffffff' }}>
 {gradeData.scores.priceAction}/25
 </span>
 </div>
 <div style={{ display: 'flex', justifyContent: 'space-between' }}>
 <span>Stock Reaction:</span>
 <span style={{ color: gradeData.scores.stockReaction === 0 ? '#ff0000' : gradeData.scores.stockReaction === 15 ? '#00ff00' : '#ffffff' }}>
 {gradeData.scores.stockReaction}/15
 </span>
 </div>
 <div style={{
 position: 'absolute',
 top: '-10px',
 left: '50%',
 transform: 'translateX(-50%)',
 width: 0,
 height: 0,
 borderLeft: '10px solid transparent',
 borderRight: '10px solid transparent',
 borderBottom: `10px solid ${scoreColor}`
 }}></div>
 </div>
 ) : (
 <div style={{
 position: 'absolute',
 bottom: '100%',
 left: '50%',
 transform: 'translateX(-50%) translateY(-12px)',
 backgroundColor: '#000000',
 color: '#ffffff',
 padding: '16px 20px',
 borderRadius: '12px',
 fontSize: '15px',
 fontFamily: 'monospace',
 fontStyle: 'normal',
 fontWeight: 'normal',
 whiteSpace: 'pre-line',
 zIndex: 10000,
 minWidth: '280px',
 boxShadow: `
 0 8px 32px rgba(0, 0, 0, 0.8),
 0 0 0 2px ${scoreColor}40
 `,
 border: `2px solid ${scoreColor}`,
 lineHeight: '1.8',
 letterSpacing: '0.5px',
 textShadow: 'none',
 WebkitTextStroke: '0',
 pointerEvents: 'none'
 }}>
 <div style={{ marginBottom: '8px', fontWeight: 'bold', fontSize: '16px' }}>
 Score: <span style={{ color: scoreColor }}>{gradeData.score}/100</span>
 </div>
 <div style={{ display: 'flex', justifyContent: 'space-between' }}>
 <span>Expiration:</span>
 <span style={{ color: gradeData.scores.expiration === 0 ? '#ff0000' : gradeData.scores.expiration === 25 ? '#00ff00' : '#ffffff' }}>
 {gradeData.scores.expiration}/25
 </span>
 </div>
 <div style={{ display: 'flex', justifyContent: 'space-between' }}>
 <span>Contract P&L:</span>
 <span style={{ color: gradeData.scores.contractPrice === 0 ? '#ff0000' : gradeData.scores.contractPrice === 25 ? '#00ff00' : '#ffffff' }}>
 {gradeData.scores.contractPrice}/25
 </span>
 </div>
 <div style={{ display: 'flex', justifyContent: 'space-between' }}>
 <span>Combo Trade:</span>
 <span style={{ color: gradeData.scores.combo === 0 ? '#ff0000' : gradeData.scores.combo === 10 ? '#00ff00' : '#ffffff' }}>
 {gradeData.scores.combo}/10
 </span>
 </div>
 <div style={{ display: 'flex', justifyContent: 'space-between' }}>
 <span>Price Action:</span>
 <span style={{ color: gradeData.scores.priceAction === 0 ? '#ff0000' : gradeData.scores.priceAction === 25 ? '#00ff00' : '#ffffff' }}>
 {gradeData.scores.priceAction}/25
 </span>
 </div>
 <div style={{ display: 'flex', justifyContent: 'space-between' }}>
 <span>Stock Reaction:</span>
 <span style={{ color: gradeData.scores.stockReaction === 0 ? '#ff0000' : gradeData.scores.stockReaction === 15 ? '#00ff00' : '#ffffff' }}>
 {gradeData.scores.stockReaction}/15
 </span>
 </div>
 <div style={{
 position: 'absolute',
 bottom: '-10px',
 left: '50%',
 transform: 'translateX(-50%)',
 width: 0,
 height: 0,
 borderLeft: '10px solid transparent',
 borderRight: '10px solid transparent',
 borderTop: `10px solid ${scoreColor}`
 }}></div>
 </div>
 )
 )}
 </span>
 </div>
 </div>
 </td>
 );
 } else {
 return (
 <td className="p-2 md:p-6 border-r border-gray-700/30">
 <span className="text-gray-500 text-sm">Loading...</span>
 </td>
 );
 }
 })()}
 </tr>
 );
 })}
 </tbody>
 </table>
 {paginatedData.length === 0 && filteredAndSortedData.length === 0 && (
 <div className="text-center py-12 text-slate-400 text-2xl font-semibold">
 {loading ? (
 <div className="flex flex-col items-center justify-center space-y-4">
 <div className="flex items-center space-x-3">
 <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
 <span>{streamingStatus || 'Loading premium options flow data...'}</span>
 </div>
 </div>
 ) : (
 'No trades found matching the current filters.'
 )}
 </div>
 )}
 </div>
 </div>
 </div>

 </div>
 </>
 );
};
