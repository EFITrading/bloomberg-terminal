'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// Import your existing Polygon service
import { polygonService } from '@/lib/polygonService';

// Polygon API key for bid/ask analysis
const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

// BID/ASK EXECUTION ANALYSIS - OPTIMIZED FOR HIGH VOLUME
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
  
  const BATCH_SIZE = 200; // Process 200 trades at a time - 4x faster!
  const BATCH_DELAY = 10; // Only 10ms delay between batches
  const batches = [];
  
  for (let i = 0; i < trades.length; i += BATCH_SIZE) {
    batches.push(trades.slice(i, i + BATCH_SIZE));
  }
  
  console.log(`� ULTRA-FAST Vol/OI fetch: ${trades.length} trades in ${batches.length} batches of ${BATCH_SIZE}`);
  
  const allResults = [];
  
  // Process batches sequentially with massive parallel requests within each batch
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    
    if (batchIndex % 5 === 0) {
      console.log(`⚡ Vol/OI batch ${batchIndex + 1}/${batches.length} (${Math.round((batchIndex/batches.length)*100)}% complete)`);
    }
    
    const batchResults = await Promise.all(
      batch.map(async (trade) => {
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
          
          // Use the SAME snapshot endpoint as OptionsChain.tsx
          const snapshotUrl = `https://api.polygon.io/v3/snapshot/options/${ticker}/${optionSymbol}?apikey=kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf`;
          const response = await fetch(snapshotUrl, {
            signal: AbortSignal.timeout(5000)
          });
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
    
    // Minimal delay between batches
    if (batchIndex < batches.length - 1) {
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
    }
  }
  
  console.log(`✅ ULTRA-FAST Vol/OI complete: ${allResults.length} trades processed`);
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
 if (isLoading) {
 return <span className="text-gray-400 animate-pulse">Loading...</span>;
 }
 
 if (!currentPrice) {
 return <span className="text-gray-500">--</span>;
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
 fill_style?: 'A' | 'AA' | 'B' | 'BB' | 'N/A';
 volume?: number;
 open_interest?: number;
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
 onRefresh?: () => void;
 onClearData?: () => void;
 selectedTicker: string;
 onTickerChange: (ticker: string) => void;
 streamingStatus?: string;
 streamingProgress?: {current: number, total: number} | null;
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
 streamingProgress
}) => {
 const [sortField, setSortField] = useState<keyof OptionsFlowData>('trade_timestamp');
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
 const [inputTicker, setInputTicker] = useState<string>(selectedTicker);
 const [isInputFocused, setIsInputFocused] = useState<boolean>(false);
 const [isFilterDialogOpen, setIsFilterDialogOpen] = useState<boolean>(false);
 const [currentPage, setCurrentPage] = useState<number>(1);
 const [itemsPerPage] = useState<number>(250);
 const [efiHighlightsActive, setEfiHighlightsActive] = useState<boolean>(false);
 const [currentPrices, setCurrentPrices] = useState<Record<string, number>>({});
 const [priceLoadingState, setPriceLoadingState] = useState<Record<string, boolean>>({});
 const [tradesWithFillStyles, setTradesWithFillStyles] = useState<OptionsFlowData[]>([]);

 // Debug: Monitor filter dialog state changes
 useEffect(() => {
 console.log('Filter dialog state changed:', isFilterDialogOpen);
 }, [isFilterDialogOpen]);

 // Prevent body from scrolling to eliminate page-level scrollbar
 useEffect(() => {
 document.body.style.overflow = 'hidden';
 document.documentElement.style.overflow = 'hidden';
 
 return () => {
 document.body.style.overflow = '';
 document.documentElement.style.overflow = '';
 };
 }, []);

 // Only sync input field with selectedTicker when not actively typing
 useEffect(() => {
 if (!isInputFocused) {
 setInputTicker(selectedTicker);
 }
 }, [selectedTicker, isInputFocused]);

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
 // Use live price from snapshot - this is the actual current market price
 const livePrice = data.ticker.lastQuote?.P || data.ticker.lastTrade?.p || data.ticker.day?.c;
 if (livePrice) {
 pricesUpdate[ticker] = livePrice;
 console.log(` ${ticker}: LIVE $${livePrice}`);
 } else {
 console.log(` No live price data for ${ticker}`);
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

 // EFI Highlights criteria checker
 const meetsEfiCriteria = (trade: OptionsFlowData): boolean => {
 // Debug logging
 console.log('Checking EFI criteria for trade:', {
 ticker: trade.underlying_ticker,
 days_to_expiry: trade.days_to_expiry,
 total_premium: trade.total_premium,
 trade_size: trade.trade_size,
 moneyness: trade.moneyness
 });

 // 1. Check expiration (0-35 trading days) - use existing days_to_expiry field
 if (trade.days_to_expiry < 0 || trade.days_to_expiry > 35) {
 console.log(' Failed days to expiry check:', trade.days_to_expiry);
 return false;
 }

 // 2. Check premium ($100k - $450k) - use existing total_premium field
 if (trade.total_premium < 100000 || trade.total_premium > 450000) {
 console.log(' Failed premium check:', trade.total_premium);
 return false;
 }

 // 3. Check contracts (650 - 1999)
 if (trade.trade_size < 650 || trade.trade_size > 1999) {
 console.log(' Failed contract size check:', trade.trade_size);
 return false;
 }

 // 4. Check OTM status
 if (!trade.moneyness || trade.moneyness !== 'OTM') {
 console.log(' Failed OTM check:', trade.moneyness);
 return false;
 }
 
 console.log(' Trade meets all EFI criteria!');
 return true;
 };

 const handleSort = (field: keyof OptionsFlowData) => {
 if (sortField === field) {
 setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
 } else {
 setSortField(field);
 setSortDirection('desc');
 }
 };



 const filteredAndSortedData = useMemo(() => {
 // Use fill style data if available, otherwise use original data
 const sourceData = tradesWithFillStyles.length > 0 ? tradesWithFillStyles : data;
 
 // Step 1: Fast deduplication using Set (O(n) instead of O(n²))
 const seen = new Set<string>();
 const deduplicatedData = sourceData.filter(trade => {
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
 console.log(` Removed ${duplicatesRemoved} duplicate trades (${sourceData.length} → ${deduplicatedData.length})`);
 }
 
 let filtered = deduplicatedData;
 
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

 // Apply sorting
 filtered.sort((a, b) => {
 const aValue = a[sortField];
 const bValue = b[sortField];
 
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
 }, [data, sortField, sortDirection, selectedOptionTypes, selectedPremiumFilters, customMinPremium, customMaxPremium, selectedTickerFilters, selectedUniqueFilters, expirationStartDate, expirationEndDate, selectedTickerFilter, blacklistedTickers, tradesWithFillStyles]);

 // Automatically analyze fill styles when new data comes in
 useEffect(() => {
 const analyzeAutomatically = async () => {
 if (!data || data.length === 0) {
 setTradesWithFillStyles([]);
 return;
 }

 console.log('🚀 STARTING FILL STYLE ANALYSIS FOR', data.length, 'TRADES');
 try {
 // First fetch Volume & Open Interest
 console.log('📊 STARTING VOL/OI FETCH FOR', data.length, 'TRADES');
 const tradesWithVolOI = await fetchVolumeAndOpenInterest(data, (partialResults) => {
 // Update with partial results as they come in (for UI responsiveness)
 setTradesWithFillStyles(partialResults);
 });
 
 // Then analyze fill styles with the Vol/OI data included
 const tradesWithStyles = await analyzeBidAskExecutionLightning(tradesWithVolOI, setTradesWithFillStyles);
 setTradesWithFillStyles(tradesWithStyles);
 console.log('✅ FILL STYLE ANALYSIS COMPLETE');
 } catch (error) {
 console.error('Error analyzing fill styles:', error);
 }
 };

 analyzeAutomatically();
 }, [data]);

 // Manual trigger for fill style analysis
 const triggerFillStyleAnalysis = async () => {
 if (!data || data.length === 0) return;
 
 console.log('🔥 MANUAL FILL STYLE ANALYSIS TRIGGERED FOR', data.length, 'TRADES');
 try {
 // First fetch Volume & Open Interest
 console.log('📊 MANUAL VOL/OI FETCH FOR', data.length, 'TRADES');
 const tradesWithVolOI = await fetchVolumeAndOpenInterest(data, (partialResults) => {
 setTradesWithFillStyles(partialResults);
 });
 
 // Then analyze fill styles
 const tradesWithStyles = await analyzeBidAskExecutionLightning(tradesWithVolOI, setTradesWithFillStyles);
 setTradesWithFillStyles(tradesWithStyles);
 console.log('✅ MANUAL ANALYSIS COMPLETE');
 } catch (error) {
 console.error('Manual analysis error:', error);
 }
 };

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
 <div className="fixed top-56 left-1/2 transform -translate-x-1/2 bg-black border border-gray-600 rounded-lg p-3 w-auto max-w-4xl max-h-[55vh] overflow-y-auto z-[9999]" style={{ boxShadow: '0 4px 16px rgba(0, 0, 0, 0.5)' }}>
 <div>
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
 
 <div className="flex items-center">
 <label className="flex items-center cursor-pointer hover:bg-blue-600/10 rounded-lg p-2 transition-all duration-200">
 <input
 type="checkbox"
 className="w-5 h-5 text-blue-600 bg-gray-800 border-gray-600 rounded focus:ring-blue-500 focus:ring-2 cursor-pointer"
 checked={selectedTickerFilters.includes('HIGHLIGHTS_ONLY')}
 onClick={(e) => {
 e.stopPropagation();
 console.log('Highlights Only checkbox clicked');
 const isCurrentlyChecked = selectedTickerFilters.includes('HIGHLIGHTS_ONLY');
 if (isCurrentlyChecked) {
 setSelectedTickerFilters(prev => prev.filter(filter => filter !== 'HIGHLIGHTS_ONLY'));
 console.log('Unchecked - removing HIGHLIGHTS_ONLY');
 } else {
 setSelectedTickerFilters(prev => [...prev, 'HIGHLIGHTS_ONLY']);
 console.log('Checked - adding HIGHLIGHTS_ONLY');
 }
 }}
 readOnly
 />
 <span 
 className={`ml-3 text-lg font-medium transition-all duration-200 cursor-pointer ${
 selectedTickerFilters.includes('HIGHLIGHTS_ONLY') 
 ? 'text-yellow-400 font-bold drop-shadow-lg'
 : 'text-gray-300'
 }`}
 onClick={(e) => {
 e.stopPropagation();
 const isCurrentlyChecked = selectedTickerFilters.includes('HIGHLIGHTS_ONLY');
 if (isCurrentlyChecked) {
 setSelectedTickerFilters(prev => prev.filter(filter => filter !== 'HIGHLIGHTS_ONLY'));
 } else {
 setSelectedTickerFilters(prev => [...prev, 'HIGHLIGHTS_ONLY']);
 }
 }}
 >
 Highlights Only
 </span>
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
 <div className="px-8 py-6 bg-black" style={{
 width: '100%',
 overflow: 'visible'
 }}>
 <div className="flex items-center justify-between h-16" style={{ width: 'max-content', minWidth: '1080px' }}>
 <div className="flex items-center gap-4" style={{ flexShrink: 0, width: 'max-content' }}>
 {/* Search Input with Icon */}
 <div className="relative">
 {/* Search Icon - Positioned on the left */}
 <div className="absolute left-3 top-1/2 transform -translate-y-1/2 z-10 pointer-events-none">
 <svg className="w-4 h-4 text-cyan-400 drop-shadow-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
 <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
 </svg>
 </div>
 {/* Text Input - Text starts to the right of icon */}
 <input
 type="text"
 value={inputTicker}
 onChange={(e) => setInputTicker(e.target.value.toUpperCase())}
 onFocus={(e) => { 
 setIsInputFocused(true); 
 e.target.style.border = '1px solid #06b6d4'; 
 e.target.style.boxShadow = '0 0 0 2px rgba(6, 182, 212, 0.3), inset 0 2px 4px rgba(0, 0, 0, 0.3)'; 
 }}
 onKeyDown={(e) => {
 if (e.key === 'Enter') {
 onTickerChange(inputTicker);
 setIsInputFocused(false);
 }
 }}
 onBlur={(e) => {
 setIsInputFocused(false);
 e.target.style.border = '1px solid #1a1a1a'; 
 e.target.style.boxShadow = 'inset 0 2px 6px rgba(0, 0, 0, 0.4), 0 1px 2px rgba(255, 255, 255, 0.1)';
 if (inputTicker && inputTicker !== selectedTicker) {
 onTickerChange(inputTicker);
 }
 }}
 placeholder="Enter ticker symbol..."
 className="w-44 h-12 text-white font-mono text-sm placeholder-gray-400 transition-all duration-300 focus:outline-none"
 style={{ 
 paddingLeft: '2.75rem',
 paddingRight: '1rem',
 borderRadius: '12px',
 fontSize: '14px',
 letterSpacing: '0.5px',
 background: 'linear-gradient(145deg, #000000, #0a0a0a)',
 border: '1px solid #1a1a1a',
 boxShadow: 'inset 0 2px 6px rgba(0, 0, 0, 0.4), 0 1px 2px rgba(255, 255, 255, 0.1)'
 }}
 maxLength={10}
 />
 </div>
 
 {/* EFI Highlights Toggle */}
 <button
 onClick={() => setEfiHighlightsActive(!efiHighlightsActive)}
 className={`h-10 px-16 text-white text-sm font-bold rounded-xl transition-all duration-300 flex items-center gap-2.5 transform hover:scale-105 hover:translate-y-[-1px] active:translate-y-[1px] focus:outline-none`}
 style={{
 background: efiHighlightsActive 
 ? 'linear-gradient(145deg, #000000, #0a0a0a)' 
 : 'linear-gradient(145deg, #000000, #0a0a0a)',
 border: '1px solid #1a1a1a',
 boxShadow: 'inset 0 2px 6px rgba(0, 0, 0, 0.4), 0 4px 8px rgba(0, 0, 0, 0.3), 0 1px 2px rgba(255, 255, 255, 0.1)'
 }}
 onMouseEnter={(e) => {
 const target = e.target as HTMLButtonElement;
 target.style.boxShadow = 'inset 0 2px 6px rgba(0, 0, 0, 0.4), 0 6px 12px rgba(0, 0, 0, 0.4), 0 1px 2px rgba(255, 255, 255, 0.1)';
 }}
 onMouseLeave={(e) => {
 const target = e.target as HTMLButtonElement;
 target.style.boxShadow = 'inset 0 2px 6px rgba(0, 0, 0, 0.4), 0 4px 8px rgba(0, 0, 0, 0.3), 0 1px 2px rgba(255, 255, 255, 0.1)';
 }}
 >
 <svg className={`w-4 h-4 ${efiHighlightsActive ? 'animate-bounce text-amber-400' : 'animate-pulse text-amber-500'} drop-shadow-lg`} fill={efiHighlightsActive ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
 </svg>
 <span>EFI Highlights</span>
 <span className={`text-xs px-2 py-0.5 rounded-full transition-colors duration-300 ${efiHighlightsActive ? 'bg-amber-400 text-black shadow-lg' : 'bg-gray-700 text-gray-400'}`}>
 {efiHighlightsActive ? 'ON' : 'OFF'}
 </span>
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
 
 {/* Action Buttons */}
 <div className="flex items-center gap-4">
 <button 
 onClick={onRefresh} 
 disabled={loading}
 className={`h-10 px-16 text-white text-sm font-bold rounded-xl transition-all duration-300 flex items-center gap-2.5 min-w-[150px] transform hover:scale-105 hover:translate-y-[-1px] active:translate-y-[1px] focus:outline-none ${
 loading 
 ? 'cursor-not-allowed opacity-60' 
 : ''
 }`}
 style={{
 background: loading 
 ? 'linear-gradient(145deg, #0a0a0a, #1a1a1a)' 
 : 'linear-gradient(145deg, #000000, #0a0a0a)',
 border: loading ? '1px solid #1a1a1a' : '1px solid #1a1a1a',
 boxShadow: loading 
 ? 'inset 0 2px 6px rgba(0, 0, 0, 0.4)' 
 : 'inset 0 2px 6px rgba(0, 0, 0, 0.4), 0 4px 8px rgba(0, 0, 0, 0.3), 0 1px 2px rgba(255, 255, 255, 0.1)'
 }}
 onMouseEnter={(e) => {
 if (!loading) {
 const target = e.target as HTMLButtonElement;
 target.style.boxShadow = 'inset 0 2px 6px rgba(0, 0, 0, 0.4), 0 6px 12px rgba(59, 130, 246, 0.3), 0 1px 2px rgba(255, 255, 255, 0.1)';
 target.style.border = '1px solid #3b82f6';
 }
 }}
 onMouseLeave={(e) => {
 if (!loading) {
 const target = e.target as HTMLButtonElement;
 target.style.boxShadow = 'inset 0 2px 6px rgba(0, 0, 0, 0.4), 0 4px 8px rgba(0, 0, 0, 0.3), 0 1px 2px rgba(255, 255, 255, 0.1)';
 target.style.border = '1px solid #1a1a1a';
 }
 }}
 >
 {loading ? (
 <>
 <svg className="w-4 h-4 animate-spin text-blue-400 drop-shadow-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
 </svg>
 <span>Scanning...</span>
 </>
 ) : (
 <>
 <svg className="w-4 h-4 animate-pulse text-blue-500 drop-shadow-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
 </svg>
 <span>Refresh Flow</span>
 </>
 )}
 </button>

 {/* Fill Style Analysis Button */}
 <button 
 onClick={triggerFillStyleAnalysis}
 disabled={loading || !data || data.length === 0}
 className="h-10 px-16 text-white text-sm font-bold rounded-xl transition-all duration-300 flex items-center gap-2.5 min-w-[150px] transform hover:scale-105 hover:translate-y-[-1px] active:translate-y-[1px] focus:outline-none"
 style={{
 background: 'linear-gradient(145deg, #059669, #10b981)',
 border: '1px solid #10b981',
 boxShadow: 'inset 0 2px 6px rgba(0, 0, 0, 0.4), 0 4px 8px rgba(16, 185, 129, 0.3), 0 1px 2px rgba(255, 255, 255, 0.1)'
 }}
 >
 <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
 </svg>
 <span>Analyze Fill Styles</span>
 </button>

 {/* Clear Data Button */}
 {onClearData && (
 <button 
 onClick={onClearData} 
 disabled={loading}
 className={`h-10 px-16 text-white text-sm font-bold rounded-xl transition-all duration-300 flex items-center gap-2.5 min-w-[150px] transform hover:scale-105 hover:translate-y-[-1px] active:translate-y-[1px] focus:outline-none ${
 loading 
 ? 'cursor-not-allowed opacity-60' 
 : ''
 }`}
 style={{
 background: loading 
 ? 'linear-gradient(145deg, #0a0a0a, #1a1a1a)' 
 : 'linear-gradient(145deg, #800000, #a00000)',
 border: loading ? '1px solid #1a1a1a' : '1px solid #a00000',
 boxShadow: loading 
 ? 'inset 0 2px 6px rgba(0, 0, 0, 0.4)' 
 : 'inset 0 2px 6px rgba(0, 0, 0, 0.4), 0 4px 8px rgba(0, 0, 0, 0.3), 0 1px 2px rgba(255, 255, 255, 0.1)'
 }}
 onMouseEnter={(e) => {
 if (!loading) {
 const target = e.target as HTMLButtonElement;
 target.style.boxShadow = 'inset 0 2px 6px rgba(0, 0, 0, 0.4), 0 6px 12px rgba(220, 38, 127, 0.3), 0 1px 2px rgba(255, 255, 255, 0.1)';
 target.style.border = '1px solid #dc267f';
 }
 }}
 onMouseLeave={(e) => {
 if (!loading) {
 const target = e.target as HTMLButtonElement;
 target.style.boxShadow = 'inset 0 2px 6px rgba(0, 0, 0, 0.4), 0 4px 8px rgba(0, 0, 0, 0.3), 0 1px 2px rgba(255, 255, 255, 0.1)';
 target.style.border = '1px solid #a00000';
 }
 }}
 >
 <svg className="w-4 h-4 text-red-500 drop-shadow-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
 </svg>
 <span>Clear Data</span>
 </button>
 )}

 </div>
 
 {/* Right Section */}
 <div className="flex items-center gap-3" style={{ flexShrink: 0, width: 'max-content', minWidth: '600px' }}>

 {/* Filter Button */}
 <button 
 onClick={() => {
 console.log('Filter button clicked - opening dialog');
 setIsFilterDialogOpen(true);
 }}
 className="h-10 px-6 text-white text-sm font-bold rounded-xl transition-all duration-300 flex items-center gap-2.5 min-w-[80px] transform hover:scale-105 hover:translate-y-[-1px] active:translate-y-[1px] focus:outline-none"
 style={{
 background: 'linear-gradient(145deg, #000000, #0a0a0a)',
 border: '1px solid #f59e0b',
 boxShadow: 'inset 0 2px 6px rgba(0, 0, 0, 0.4), 0 4px 8px rgba(245, 158, 11, 0.3), 0 1px 2px rgba(255, 255, 255, 0.1)'
 }}
 onMouseEnter={(e) => {
 const target = e.target as HTMLButtonElement;
 target.style.boxShadow = 'inset 0 2px 6px rgba(0, 0, 0, 0.4), 0 6px 12px rgba(245, 158, 11, 0.4), 0 1px 2px rgba(255, 255, 255, 0.1)';
 target.style.border = '1px solid #fbbf24';
 }}
 onMouseLeave={(e) => {
 const target = e.target as HTMLButtonElement;
 target.style.boxShadow = 'inset 0 2px 6px rgba(0, 0, 0, 0.4), 0 4px 8px rgba(245, 158, 11, 0.3), 0 1px 2px rgba(255, 255, 255, 0.1)';
 target.style.border = '1px solid #f59e0b';
 }}
 >
 <svg className="w-4 h-4 animate-pulse text-amber-400 drop-shadow-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
 </svg>
 <span>Filter</span>
 </button>

 {/* Vertical Divider */}
 <div className="w-px h-8 bg-gray-700"></div>

 {/* Stats Section */}
 <div className="flex items-center gap-3">
 {/* Date Display */}
 {marketInfo && (
 <div className="text-sm text-gray-400 font-mono">
 {marketInfo.data_date}
 </div>
 )}

 {/* Trade Count */}
 <div className="text-sm text-gray-300">
 <span className="text-orange-400 font-bold font-mono">{filteredAndSortedData.length.toLocaleString()}</span>
 <span className="text-gray-400 ml-1">trades</span>
 </div>

 {/* Pagination Info */}
 <div className="text-sm text-gray-300">
 Page <span className="text-orange-400 font-bold font-mono">{currentPage}</span>
 <span className="text-gray-500 mx-1">of</span>
 <span className="text-orange-400 font-bold font-mono">{totalPages}</span>
 </div>
 
 {/* Pagination Controls */}
 {filteredAndSortedData.length > itemsPerPage && (
 <div className="flex items-center gap-1">
 <button
 onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
 disabled={currentPage === 1}
 className="w-8 h-8 flex items-center justify-center text-xs bg-black border border-gray-600 text-gray-300 hover:border-gray-500 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed rounded transition-all duration-150"
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
 className={`w-8 h-8 flex items-center justify-center text-xs border rounded transition-all duration-150 ${
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
 className="w-8 h-8 flex items-center justify-center text-xs bg-black border border-gray-600 text-gray-300 hover:border-gray-500 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed rounded transition-all duration-150"
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

 {/* Main Table */}
 <div className="bg-black border border-gray-800 flex-1">
 <div className="p-0">
 <div className="overflow-y-auto overflow-x-auto" style={{ height: 'calc(100vh - 140px)' }}>
 <table className="w-full">
 <thead className="sticky top-0 bg-gradient-to-b from-yellow-900/10 via-gray-900 to-black z-10 border-b-2 border-gray-600 shadow-2xl">
 <tr>
 <th 
 className="text-left p-6 cursor-pointer bg-gradient-to-b from-yellow-900/10 to-black hover:from-yellow-800/15 hover:to-black text-orange-400 font-bold text-xl transition-all duration-200 border-r border-gray-700"
 onClick={() => handleSort('trade_timestamp')}
 >
 Time {sortField === 'trade_timestamp' && (sortDirection === 'asc' ? '↑' : '↓')}
 </th>
 <th 
 className="text-left p-6 cursor-pointer bg-gradient-to-b from-yellow-900/10 to-black hover:from-yellow-800/15 hover:to-black text-orange-400 font-bold text-xl transition-all duration-200 border-r border-gray-700"
 onClick={() => handleSort('underlying_ticker')}
 >
 Symbol {sortField === 'underlying_ticker' && (sortDirection === 'asc' ? '↑' : '↓')}
 </th>
 <th 
 className="text-left p-6 cursor-pointer bg-gradient-to-b from-yellow-900/10 via-gray-900/80 to-black hover:from-yellow-800/15 hover:via-gray-800/90 hover:to-black text-orange-400 font-bold text-xl transition-all duration-200 border-r border-gray-700 shadow-lg shadow-black/50 hover:shadow-xl hover:shadow-orange-500/20 backdrop-blur-sm"
 onClick={() => handleSort('type')}
 >
 Call/Put {sortField === 'type' && (sortDirection === 'asc' ? '↑' : '↓')}
 </th>
 <th 
 className="text-left p-6 cursor-pointer bg-gradient-to-b from-yellow-900/10 via-black to-black hover:from-yellow-800/20 hover:via-gray-900 hover:to-black text-orange-400 font-bold text-xl transition-all duration-200 border-r border-gray-700"
 onClick={() => handleSort('strike')}
 >
 Strike {sortField === 'strike' && (sortDirection === 'asc' ? '↑' : '↓')}
 </th>
 <th 
 className="text-left p-6 cursor-pointer bg-gradient-to-b from-yellow-900/10 via-black to-black hover:from-yellow-800/20 hover:via-gray-900 hover:to-black text-orange-400 font-bold text-xl transition-all duration-200 border-r border-gray-700"
 onClick={() => handleSort('trade_size')}
 >
 Size {sortField === 'trade_size' && (sortDirection === 'asc' ? '↑' : '↓')}
 </th>
 <th 
 className="text-left p-6 cursor-pointer bg-gradient-to-b from-yellow-900/10 via-black to-black hover:from-yellow-800/20 hover:via-gray-900 hover:to-black text-orange-400 font-bold text-xl transition-all duration-200 border-r border-gray-700"
 onClick={() => handleSort('total_premium')}
 >
 Premium {sortField === 'total_premium' && (sortDirection === 'asc' ? '↑' : '↓')}
 </th>
 <th 
 className="text-left p-6 cursor-pointer bg-gradient-to-b from-yellow-900/10 via-black to-black hover:from-yellow-800/20 hover:via-gray-900 hover:to-black text-orange-400 font-bold text-xl transition-all duration-200 border-r border-gray-700"
 onClick={() => handleSort('expiry')}
 >
 Expiration {sortField === 'expiry' && (sortDirection === 'asc' ? '↑' : '↓')}
 </th>
 <th 
 className="text-left p-6 cursor-pointer bg-gradient-to-b from-yellow-900/10 via-black to-black hover:from-yellow-800/20 hover:via-gray-900 hover:to-black text-orange-400 font-bold text-xl transition-all duration-200 border-r border-gray-700"
 onClick={() => handleSort('spot_price')}
 >
 Spot {'>>'} Current {sortField === 'spot_price' && (sortDirection === 'asc' ? '↑' : '↓')}
 </th>
 <th 
 className="text-left p-6 bg-gradient-to-b from-yellow-900/10 via-black to-black text-orange-400 font-bold text-xl transition-all duration-200 border-r border-gray-700"
 >
 VOL/OI
 </th>
 <th 
 className="text-left p-6 cursor-pointer bg-gradient-to-b from-yellow-900/10 via-gray-900/80 to-black hover:from-yellow-800/15 hover:via-gray-800/90 hover:to-black text-orange-400 font-bold text-xl transition-all duration-200 shadow-lg shadow-black/50 hover:shadow-xl hover:shadow-orange-500/20 backdrop-blur-sm"
 onClick={() => handleSort('trade_type')}
 >
 Type {sortField === 'trade_type' && (sortDirection === 'asc' ? '↑' : '↓')}
 </th>
 </tr>
 </thead>
 <tbody>
 {paginatedData.map((trade, index) => {
 const isEfiHighlight = efiHighlightsActive && meetsEfiCriteria(trade);
 return (
 <tr 
 key={index} 
 className="border-b border-slate-700/50 hover:bg-slate-800/40 transition-all duration-300 hover:shadow-lg"
 style={isEfiHighlight ? {
 border: '2px solid #ffd700',
 backgroundColor: '#000000',
 boxShadow: '0 0 8px rgba(255, 215, 0, 0.8)'
 } : {
 backgroundColor: index % 2 === 0 ? '#000000' : '#0a0a0a'
 }}
 >
 <td className="p-6 text-white text-xl font-medium border-r border-gray-700/30">{formatTime(trade.trade_timestamp)}</td>
 <td className="p-6 border-r border-gray-700/30">
 <button 
 onClick={() => handleTickerClick(trade.underlying_ticker)}
 className={`${getTickerStyle(trade.underlying_ticker)} hover:bg-gray-900 hover:text-orange-400 transition-all duration-200 px-3 py-2 rounded-lg cursor-pointer border-none shadow-sm ${
 selectedTickerFilter === trade.underlying_ticker ? 'ring-2 ring-orange-500 bg-gray-800/50' : ''
 }`}
 >
 {trade.underlying_ticker}
 </button>
 </td>
 <td className={`p-6 text-xl font-bold border-r border-gray-700/30 ${getCallPutColor(trade.type)}`}>
 {trade.type.toUpperCase()}
 </td>
 <td className="p-6 text-xl text-white font-semibold border-r border-gray-700/30">${trade.strike}</td>
 <td className="p-6 font-medium text-xl text-white border-r border-gray-700/30">
 <div className="flex flex-col space-y-1">
 <div>
 <span className="text-cyan-400 font-bold">{trade.trade_size.toLocaleString()}</span> 
 <span className="text-slate-400"> @ </span>
 <span className="text-yellow-400 font-bold">{trade.premium_per_contract.toFixed(2)}</span>
 {(trade as any).fill_style && (
 <span className={`ml-2 px-2 py-0.5 rounded-md text-sm font-bold ${
 (trade as any).fill_style === 'A' ? 'text-green-400 bg-green-400/10 border border-green-400/30' :
 (trade as any).fill_style === 'AA' ? 'text-green-300 bg-green-300/10 border border-green-300/30' :
 (trade as any).fill_style === 'B' ? 'text-red-400 bg-red-400/10 border border-red-400/30' :
 (trade as any).fill_style === 'BB' ? 'text-red-300 bg-red-300/10 border border-red-300/30' :
 'text-gray-500 bg-gray-500/10 border border-gray-500/30'
 }`}>
 {(trade as any).fill_style}
 </span>
 )}
 </div>
 </div>
 </td>
 <td className="p-6 font-bold text-xl text-green-400 border-r border-gray-700/30">{formatCurrency(trade.total_premium)}</td>
 <td className="p-6 text-xl text-white border-r border-gray-700/30">{formatDate(trade.expiry)}</td>
 <td className="p-6 text-xl font-medium border-r border-gray-700/30">
 <PriceDisplay 
 spotPrice={trade.spot_price}
 currentPrice={currentPrices[trade.underlying_ticker]}
 isLoading={priceLoadingState[trade.underlying_ticker]}
 ticker={trade.underlying_ticker}
 />
 </td>
 <td className="p-6 text-xl text-white border-r border-gray-700/30">
 {trade.volume !== undefined && trade.open_interest !== undefined ? (
 <div className="flex flex-col items-center">
 <div className="text-cyan-400 font-bold">
 {trade.volume.toLocaleString()}
 </div>
 <div className="text-gray-400 text-sm">
 /
 </div>
 <div className="text-purple-400 font-bold">
 {trade.open_interest.toLocaleString()}
 </div>
 </div>
 ) : (
 <span className="text-gray-500 animate-pulse">Loading...</span>
 )}
 </td>
 <td className="p-6 border-r border-gray-700/30">
 <span className={`inline-block px-4 py-2 rounded-lg text-lg font-bold shadow-sm ${getTradeTypeColor(trade.trade_type)}`}>
 {trade.trade_type === 'MULTI-LEG' ? 'ML' : trade.trade_type}
 </span>
 </td>
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
 {streamingProgress && (
 <div className="flex flex-col items-center space-y-2">
 <div className="w-64 bg-slate-700 rounded-full h-2">
 <div 
 className="bg-orange-500 h-2 rounded-full transition-all duration-300" 
 style={{width: `${(streamingProgress.current / streamingProgress.total) * 100}%`}}
 />
 </div>
 <span className="text-sm text-slate-500">
 {streamingProgress.current} / {streamingProgress.total} batches processed
 </span>
 </div>
 )}
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